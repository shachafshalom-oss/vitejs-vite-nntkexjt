import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { Plus, Edit, Trash2, Package, TrendingUp, DollarSign, Activity, X, Ship, Megaphone, Settings, Layers, ChevronDown, ChevronUp, AlertTriangle, Sparkles, LogOut, Lock, ShoppingCart, PlusCircle, Users, Phone, MapPin, Mail, User, UserPlus, ShieldCheck, ShieldAlert, FileText, Download, Image as ImageIcon, CheckCircle, Eye, MessageSquare, CalendarDays, Wallet, Banknote, TrendingDown, Receipt, Building2, ArrowUpRight, ArrowDownRight, BarChart2, ExternalLink } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// ==========================================
// 1. הגדרות FIREBASE פרטיות (עם גיבוי אוטומטי)
// ==========================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || ("AIzaSy" + "DpXEMAmwEGzp4AqxRH72ijm1dVcANfIkU"),
  authDomain: "ds-logistics-crm.firebaseapp.com",
  projectId: "ds-logistics-crm",
  storageBucket: "ds-logistics-crm.firebasestorage.app",
  messagingSenderId: "745458915751",
  appId: "1:745458915751:web:12dff3d86b6e97479cbe82",
  measurementId: "G-HF46RL74F7"
};

// ==========================================
// 2. מפתח GEMINI (אופציונלי)
// ==========================================
const geminiApiKey = "YOUR_GEMINI_API_KEY"; 

// אתחול פיירבייס
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// קבועים ומילונים
const STATUS_MAP: Record<string, string> = { 'ordered': 'בייצור/בסין', 'in_transit': 'בדרך לארץ', 'in_warehouse': 'במחסן', 'sold': 'נמכר' };
const SHIPMENT_STATUS_MAP: Record<string, string> = { 'ordered': 'בייצור בסין', 'in_transit': 'בדרך לארץ', 'in_warehouse': 'הגיע למחסן' };
const STATUS_COLORS: Record<string, string> = { 'ordered': 'bg-blue-100 text-blue-800', 'in_transit': 'bg-purple-100 text-purple-800', 'in_warehouse': 'bg-yellow-100 text-yellow-800', 'sold': 'bg-green-100 text-green-800' };

const QUOTE_STATUS_MAP: Record<string, string> = { 
  'pending': 'ממתינה לאישור', 
  'approved': 'מאושרת (מלאי נגרע)', 
  'approved_no_stock': 'מאושרת (ללא גריעת מלאי)',
  'rejected': 'נדחתה' 
};

const defaultSettings: any = { 
  models: { 
    'Prime': { cbm: 1.2, blueprintUrl: '', itemImgUrl: '' }, 
    'Night': { cbm: 1.0, blueprintUrl: '', itemImgUrl: '' }, 
    'Urban': { cbm: 1.5, blueprintUrl: '', itemImgUrl: '' }, 
    'Events': { cbm: 2.0, blueprintUrl: '', itemImgUrl: '' } 
  },
  companyLogoUrl: ''
};

const QUICK_IMPORT_KEYWORDS = [
  'שם איש הקשר', 'שם איש קשר', 'שם הלקוח', 'שם לקוח', 'שם הבר/מסעדה', 'שם הבר\\מסעדה', 
  'שם הבר / מסעדה', 'שם הבר \\ מסעדה', 'שם הבר', 'שם המסעדה', 'שם העסק', 'שם עסק',
  'שם החברה', 'שם חברה', 'אימייל לקבלת מסמכים', 'אימייל לקבלת חשבונית', 'כתובת העסק',
  'כתובת מייל', 'איש קשר', 'חברה', 'סוג העסק', 'סוג עסק', 'עוסק מורשה', 'עוסק פטור',
  'טלפון נייד', 'מספר טלפון', 'סלולרי', 'אימייל', 'מייל', 'דוא"ל', 'דואל', 'טלפון',
  'נייד', 'ח.פ.', 'ח.פ', 'חפ', 'כתובת', 'מיקום', 'עיר', 'סוג', 'שם'
].sort((a, b) => b.length - a.length);

// =========================================================================
// רכיבים גלובליים לייעול ומניעת כפילויות (Components)
// =========================================================================

// 1. רכיב תצוגת מסמך הצעת המחיר (PDF)
const QuoteDocument = ({ quote, customer, settings, innerRef }: { quote: any, customer: any, settings: any, innerRef?: React.RefObject<HTMLDivElement> }) => {
  const itemsTotal = quote?.items?.reduce((sum: number, item: any) => sum + (Number(item.price) * Number(item.qty)), 0) || 0;
  const grandTotal = itemsTotal + Number(quote?.shippingCost || 0);

  return (
    <div ref={innerRef} className="bg-[#eae5dd] shadow-2xl relative shrink-0" style={{ width: '210mm', minHeight: '297mm', padding: '20mm', boxSizing: 'border-box', direction: 'rtl', fontFamily: 'Arial, Helvetica, sans-serif', color: '#000' }}>
      {/* Header / Logo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px', borderBottom: '2px solid #c91028', paddingBottom: '15px' }}>
        <div style={{ width: '200px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          {settings?.companyLogoUrl ? (
            <img src={settings.companyLogoUrl} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
          ) : (
            <div style={{ width: '100%', height: '100%', border: '2px dashed #999', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '14px', background: 'rgba(255,255,255,0.5)', fontWeight: 'bold' }}>D.S Logistics</div>
          )}
        </div>
        <div style={{ textAlign: 'left', fontWeight: 'bold', color: '#c91028', direction: 'ltr', fontSize: '14px', lineHeight: '1.5' }}>
          <p style={{ margin: '3px 0' }}>050-2212880 | 054-8050870</p>
          <p style={{ margin: '3px 0' }}>Dslogistics69@gmail.com</p>
          <p style={{ margin: '3px 0', color: '#000' }}>ds-logistics.interaa.ai</p>
        </div>
      </div>

      {/* Customer Info */}
      <div style={{ marginBottom: '20px', fontSize: '15px', lineHeight: '1.5' }}>
        <p style={{ margin: '3px 0' }}><strong>לכבוד:</strong> {customer?.contactName || '---'} | {customer?.companyName || customer?.businessName || '---'}</p>
        <p style={{ margin: '3px 0' }}><strong>כתובת:</strong> {customer?.address || '---'}</p>
        <p style={{ margin: '3px 0' }}><strong>ח.פ / ע.מ:</strong> {customer?.hp || '---'}</p>
        <p style={{ margin: '3px 0' }}><strong>תאריך:</strong> {quote?.date ? new Date(quote.date).toLocaleDateString('he-IL') : '---'}</p>
      </div>

      <div style={{ textAlign: 'center', fontSize: '22px', fontWeight: 'bold', textDecoration: 'underline', margin: '30px 0' }}>הסכם הזמנה – ד.ש. לוגיסטיקה</div>

      {/* Sections */}
      <div style={{ fontSize: '13.5px', lineHeight: '1.4', textAlign: 'justify' }}>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>1. מחיר ותנאי תשלום</strong><br/>מחיר ההזמנה הינו קבוע וסופי, ולא יחולו בו שינויים מכל סיבה שהיא, למעט עדכונים הנובעים משינויי מיסים החלים על פי דין. יש להסדיר את התשלום במלואו לפני מועד ההספקה.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>2. אחריות</strong><br/>המוצר יימסר עם אחריות למשך {quote?.warrantyMonths ? `${quote.warrantyMonths} חודשים` : '6 חודשים'} ממועד אספקתו ללקוח, וזאת בכפוף ובכפוף מלא לתנאי האחריות כפי שנקבעו על ידי החברה. החברה לא תישא בכל אחריות לנזק, שבר, תקלה, פגם או אובדן שנגרמו למוצר, לציוד או לכל רכיב ממנו, במישרין או בעקיפין, עקב שימוש לא סביר, רשלנות, פעולה או מחדל של הלקוח ו/או מי מטעמו, לרבות שבר במוצר. במקרים כאמור, הלקוח יישא במלוא האחריות והעלויות הכרוכות בתיקון, החלפה או השבת המוצר לקדמותו, והחברה תהיה פטורה מכל טענה, דרישה או תביעה בקשר לכך.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>3. שירותי תיקונים לאחר תקופת האחריות</strong><br/>עם תום תקופת האחריות, החברה תעמיד לרשות הלקוח שירותי תיקונים ותחזוקה בתשלום, בהתאם למחירים ותנאים שייקבעו על ידה מעת לעת.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>4. מועדי אספקה</strong><br/>מועדי האספקה הנמסרים ללקוח ניתנים לצורכי הערכה בלבד, והם עשויים להשתנות בהתאם לנסיבות שונות. החברה לא תישא באחריות לכל דחייה או שינוי במועדי האספקה.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>5. הפרת התחייבויות הלקוח</strong><br/>במקרה שהלקוח לא יעמוד בהתחייבויותיו על פי הסכם זה, לרבות אי-תשלום במועדים שנקבעו, החברה תהא רשאית לבטל את אספקת הסחורה ו/או לחייב את הלקוח בגין החלק מההזמנה שכבר בוצע, ולמנוע אספקת יתרת ההזמנה.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>6. שמירת בעלות</strong><br/>המוצר יישאר רכושה הבלעדי של חברת ד.ש. לוגיסטיקה עד לפרעון מלא וסופי של כלל התשלומים על ידי הלקוח. במידה והתשלומים לא יפרעו במועדם ועל פי ההזמנה, תהא רשאית ד.ש. לוגיסטיקה, או מי מטעמה, ליטול את המוצר חזרה עד לפרעון סופי של כלל התשלומים.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>7. הזמנה ואספקה</strong><br/>החברה תספק ללקוח את המוצרים הקיימים במלאי, בתוך 10 ימי עסקים ממועד תשלום מלוא התמורה בגין המוצר. מועדי האספקה כפופים לשינויים בהתאם לנסיבות תפעוליות ובלתי צפויות, והחברה לא תישא באחריות לעיכובים כאמור.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>8. ביטול והחזרה</strong><br/>הלקוח יהיה רשאי, בהתאם להוראות הדין, לבטל את ההזמנה או להחזיר מוצר מדף שלא נעשה בו שימוש ושנשמר באריזתו המקורית, בתוך 14 ימים ממועד קבלתו. במקרה של ביטול או החזרה, החברה תהיה רשאית לגבות דמי ביטול בשיעור של 10% ממחיר ההזמנה. עלויות הובלה ושינוע יחולו על הלקוח בלבד.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>9. אחריות למוצרי מדף</strong><br/>מוצרי מדף יימסרו כשהם חדשים, באריזתם במקורית, וללא פגמים נראים לעין. האחריות על מוצרי המדף תחול בהתאם לאמור בסעיף 2 לעיל.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>10. אחריות מוגבלת</strong><br/>האחריות למוצר בהזמנה אישית תחול בהתאם לסעיף 2 לעיל, אולם לא תחול על פגמים, נזקים או סטיות הנובעים מהמפרט שנמסר על ידי הלקוח, מההדמיה שאושרה על ידו, או מהתאמות שבוצעו על פי בקשתו.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>11. הובלה ואיסוף עצמי</strong><br/>החברה מציעה ללקוח שירותי הובלה באמצעות מובילים חיצוניים, כמחווה שירותית בלבד. מובהר כי המוביל אינו עובד של חברת ד.ש. לוגיסטיקה ואינו פועל מטעמה, ועל כן החברה לא תישא בכל אחריות לנזקים או איחורים הנובעים מפעולות המוביל. עלות ההובלה תחול על הלקוח ותיקבע בהתאם למרחק ומיקום ההובלה. הלקוח רשאי לבחור באיסוף עצמי ממחסני החברה.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>12. אספקת בר ביניים (פתרון זמני)</strong><br/>כחלק מהשירות ללקוח, החברה רשאית לספק ללקוח בר ביניים שלם לשימוש זמני, עד לאספקת הבר המוזמן בייצור אישי. השימוש בבר הביניים ניתן ללא עלות נוספת בגין המוצר עצמו, אולם עלויות ההובלה והשינוע של בר זה יחולו על הלקוח בלבד. הלקוח מצהיר ומתחייב כי כל נזק שייגרם לבר הביניים במהלך תקופת השימוש בו יהיה באחריותו הבלעדית. עם הגעת הבר המוזמן, מתחייב הלקוח להשיב לחברה את בר הביניים באופן מיידי כשהוא תקין.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>13. כוח עליון</strong><br/>החברה לא תישא באחריות לאי־קיום או לעיכוב בקיום התחייבויותיה עקב אירועים שאינם בשליטתה.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>14. תחולת דין ושיפוט</strong><br/>הסכם זה וכל הנובע ממנו יפורשו ויפורטו לפי דיני מדינת ישראל בלבד. סמכות השיפוט הבלעדית תהא נתונה לבית המשפט המוסמך במחוז תל אביב-מרכז.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>15. סודיות ואי־גילוי</strong><br/>הצדדים מתחייבים לשמור בסודיות כל מידע עסקי, טכני או מסחרי שיתגלה להם.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>16. תקשורת בין הצדדים</strong><br/>כל הודעה תימסר בכתב, באמצעות דוא"ל, דואר רשום, וואטסאפ או כל אמצעי תקשורת אחר שהוסכם.</div>
        <div style={{ marginBottom: '12px' }}><strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>17. שונות</strong><br/>א. כותרות הסעיפים נועדו לנוחות בלבד.<br/>ב. כל שינוי או תוספת ייעשו באישור שני הצדדים.</div>
      </div>

      {/* Order Details */}
      <div style={{ marginTop: '25px', background: 'rgba(255,255,255,0.6)', padding: '15px', border: '1px solid #ddd', fontSize: '13.5px' }}>
        <strong style={{ fontSize: '14px' }}>18. פירוט הזמנה</strong>
        <ul style={{ margin: '10px 0', paddingRight: '20px' }}>
            {quote?.items?.map((item: any, idx: number) => (
               <li key={idx} style={{ marginBottom: '5px' }}>שם דגם: {item.model}, כמות: {item.qty}, מחיר יחידה: {Number(item.price).toLocaleString()} ש"ח + מע"מ
                 {item.customNotes && <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>הערות לדגם: {item.customNotes}</div>}
               </li>
            ))}
            {(Number(quote?.shippingCost) > 0) && (
              <li style={{ marginBottom: '5px', marginTop: '10px', fontWeight: 'bold' }}>עלות משלוח: {Number(quote.shippingCost).toLocaleString()} ש"ח + מע"מ</li>
            )}
        </ul>
        <div style={{ marginTop: '15px', fontWeight: 'bold', fontSize: '15px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
            סה"כ לתשלום לפני מע"מ: {grandTotal.toLocaleString()} ש"ח<br/>
            סה"כ לתשלום כולל מע"מ (18%): {(grandTotal * 1.18).toLocaleString()} ש"ח
        </div>
      </div>

      {/* Mockups */}
      {quote?.items?.some((item: any) => settings?.models?.[item.model]?.blueprintUrl || settings?.models?.[item.model]?.itemImgUrl) && (
        <div style={{ marginTop: '30px', fontSize: '13.5px', pageBreakInside: 'avoid' }}>
          <strong style={{ fontSize: '14px' }}>19. הדמיות מאושרות</strong><br/>
          להלן סרטוטים ותמונות הדמיה עבור הפריטים שהוזמנו:
          
          {quote?.items?.map((item: any, idx: number) => {
             const modelSettings = settings?.models?.[item.model] || {};
             if (!modelSettings.blueprintUrl && !modelSettings.itemImgUrl) return null;
             
             return (
                 <div key={idx} style={{ marginTop: '20px', borderTop: idx > 0 ? '1px dashed #ccc' : 'none', paddingTop: idx > 0 ? '20px' : '0' }}>
                     <h4 style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '14px', color: '#c91028' }}>דגם {item.model}</h4>
                     <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                         {modelSettings.blueprintUrl && (
                             <div style={{ textAlign: 'center', flex: '1', minWidth: '200px' }}>
                                <p style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '12px' }}>סרטוט טכני:</p>
                                <img src={modelSettings.blueprintUrl} crossOrigin="anonymous" alt={`סרטוט ${item.model}`} style={{ maxWidth: '100%', maxHeight: '200px', border: '1px solid #ccc', boxShadow: '2px 2px 5px rgba(0,0,0,0.1)' }} />
                             </div>
                         )}
                         {modelSettings.itemImgUrl && (
                             <div style={{ textAlign: 'center', flex: '1', minWidth: '200px' }}>
                                <p style={{ fontWeight: 'bold', marginBottom: '5px', fontSize: '12px' }}>הדמיית העמדה:</p>
                                <img src={modelSettings.itemImgUrl} crossOrigin="anonymous" alt={`הדמיה ${item.model}`} style={{ maxWidth: '100%', maxHeight: '200px', border: '1px solid #ccc', boxShadow: '2px 2px 5px rgba(0,0,0,0.1)' }} />
                             </div>
                         )}
                     </div>
                 </div>
             );
          })}
        </div>
      )}

      {/* Signatures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '50px', pageBreakInside: 'avoid' }}>
          <div style={{ width: '40%', textAlign: 'center', borderTop: '1px solid #000', paddingTop: '10px' }}>
              <strong>שם וחתימת הלקוח ({(customer && customer.contactName) ? customer.contactName : '---'})</strong>
          </div>
          <div style={{ width: '40%', textAlign: 'center', borderTop: '1px solid #000', paddingTop: '10px' }}>
              <strong>שם וחתימת נציג ד.ש. לוגיסטיקה<br/>(שחף שלום / דניאל יוסף)</strong>
          </div>
      </div>
    </div>
  );
};

// 2. רכיב כפתור מהיר לתפריט הראשי (FAB)
const FabButton = ({ onClick, icon: Icon, iconColor, label }: any) => (
  <button onClick={onClick} className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap font-medium text-sm">
    <Icon className={`w-4 h-4 ${iconColor}`}/> {label}
  </button>
);

// 3. רכיב העלאת תמונות לדגמים
const ModelAssetUploader = ({ label, icon: Icon, imageUrl, onUpload, onRemove }: any) => (
  <div className="bg-white p-3 rounded border border-slate-200">
    <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><Icon className="w-4 h-4"/> {label}</label>
    <input type="file" accept="image/*" onChange={onUpload} className="block w-full text-xs text-slate-500 file:ml-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded p-1" />
    {imageUrl && (
      <div className="mt-3 relative inline-block">
        <img src={imageUrl} alt="" className="h-20 object-contain rounded border border-slate-200 p-1" crossOrigin="anonymous" />
        <button type="button" onClick={onRemove} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 hover:bg-red-200"><X className="w-3 h-3"/></button>
      </div>
    )}
  </div>
);

// =========================================================================
// קומפוננטת האפליקציה הראשית
// =========================================================================
export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeCustomerTab, setActiveCustomerTab] = useState<'customers' | 'leads'>('customers');
  const [loading, setLoading] = useState(true);

  // Data States
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [shipments, setShipments] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  // Supplier UI States
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [supplierEditingData, setSupplierEditingData] = useState<any>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [isSupplierOverviewOpen, setIsSupplierOverviewOpen] = useState(false);
  const [activeSupplierTab, setActiveSupplierTab] = useState<'details'|'orders'|'notes'>('details');
  const [supplierNoteText, setSupplierNoteText] = useState('');
  const [catalogUploadProgress, setCatalogUploadProgress] = useState<number|null>(null);
  const [isCatalogUploading, setIsCatalogUploading] = useState(false);

  const modelsList = useMemo(() => Object.keys(settings?.models || {}), [settings]);

  // Modal & UI States
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isCustomerOverviewOpen, setIsCustomerOverviewOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [activeCustomerOverviewTab, setActiveCustomerOverviewTab] = useState<'log' | 'purchases' | 'quotes'>('log');
  const [newNoteText, setNewNoteText] = useState('');
  const [isStockBreakdownModalOpen, setIsStockBreakdownModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<any>(null);
  const [customerEditingData, setCustomerEditingData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  
  // Finance States
  const [financeYear, setFinanceYear] = useState<number>(new Date().getFullYear());
  const [financeMonth, setFinanceMonth] = useState<number>(new Date().getMonth() + 1);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseData, setExpenseData] = useState<any>({ title: '', amount: 0, type: 'variable', startDate: new Date().toISOString().split('T')[0], installments: 1 });

  // Quote States
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [isQuoteOverviewOpen, setIsQuoteOverviewOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<any>(null);
  const [quoteData, setQuoteData] = useState<any>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isQuoteApprovalModalOpen, setIsQuoteApprovalModalOpen] = useState(false);
  const [quoteApprovalData, setQuoteApprovalData] = useState<any>(null);

  // Quick Import States
  const [showQuickImport, setShowQuickImport] = useState(false);
  const [quickImportText, setQuickImportText] = useState('');

  // ט-יב: חיפוש, פילטר, התראות
  const [customerSearch, setCustomerSearch] = useState('');
  const [quoteStatusFilter, setQuoteStatusFilter] = useState<string>('all');

  const [newModelName, setNewModelName] = useState('');
  const [newModelData, setNewModelData] = useState({ name: '', cbm: 0 });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [arrivalPrompt, setArrivalPrompt] = useState<{isOpen: boolean, shipment: any, date: string}>({ isOpen: false, shipment: null, date: '' });

  // AI Feature States
  const [aiInsight, setAiInsight] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // --- Date Calculations ---
  // פונקציית עזר לשמירה על שעון מקומי מדויק (מונעת באגים של UTC בישראל)
  const getLocalYYYYMMDD = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const today = new Date();
  const todayStr = getLocalYYYYMMDD(today);
  const currentMonthStr = todayStr.substring(0, 7); 
  
  let lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthStr = getLocalYYYYMMDD(lastMonthDate).substring(0, 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = getLocalYYYYMMDD(thirtyDaysAgo);

  // --- Auth & Data Fetching ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => { 
      setUser(u); 
      setAuthChecking(false);
      if (!u) setLoading(false); 
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubSettings = onSnapshot(collection(db, 'crm_settings'), (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      const settingsDoc = docs.find((d: any) => d.id === 'general_settings');
      if (settingsDoc) {
        // שמירת API Key אוטומטית אם עדיין לא קיים
        if (!settingsDoc.finbotApiKey) {
          const FINBOT_KEY = atob('ZmI4NWM3NDEtY2IzMC00NWY0LWFjYzMtNTQxZWNkMDAyMjM0');
          setDoc(doc(db, 'crm_settings', 'general_settings'), { ...settingsDoc, finbotApiKey: FINBOT_KEY }, { merge: true });
          setSettings({ ...settingsDoc, finbotApiKey: FINBOT_KEY });
        } else {
          setSettings(settingsDoc);
        }
      } else {
         const oldSettingsDoc = docs.find((d: any) => d.id === 'general_cbm');
         if(oldSettingsDoc && oldSettingsDoc.models) {
             const updatedModels = { ...oldSettingsDoc.models };
             Object.keys(updatedModels).forEach(key => {
                 if (!updatedModels[key].blueprintUrl) updatedModels[key].blueprintUrl = '';
                 if (!updatedModels[key].itemImgUrl) updatedModels[key].itemImgUrl = '';
             });
             setSettings({ models: updatedModels, companyLogoUrl: '' });
         }
      }
    });

    const unsubShipments = onSnapshot(collection(db, 'crm_shipments'), (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setShipments(data);
    });

    const unsubItems = onSnapshot(collection(db, 'crm_items'), (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setItems(data);
    });

    const unsubCampaigns = onSnapshot(collection(db, 'crm_campaigns'), (snap) => {
      setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubCustomers = onSnapshot(collection(db, 'crm_customers'), (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setCustomers(data);
    });

    const unsubQuotes = onSnapshot(collection(db, 'crm_quotes'), (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setQuotes(data);
    });

    const unsubExpenses = onSnapshot(collection(db, 'crm_expenses'), (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
      setExpenses(data);
      setLoading(false);
    });

    const unsubSuppliers = onSnapshot(collection(db, 'crm_suppliers'), (snap) => {
      let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
      setSuppliers(data);
    });

    return () => { unsubSettings(); unsubShipments(); unsubItems(); unsubCampaigns(); unsubCustomers(); unsubQuotes(); unsubExpenses(); unsubSuppliers(); };
  }, [user]);

  // --- Dynamic favicon & apple-touch-icon from company logo ---
  useEffect(() => {
    if (!settings?.companyLogoUrl) return;
    const logoUrl = settings.companyLogoUrl;

    // עדכון favicon
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = logoUrl;
    favicon.type = 'image/png';

    // עדכון apple-touch-icon (קיצור דרך iOS)
    let appleIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    if (!appleIcon) {
      appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      document.head.appendChild(appleIcon);
    }
    appleIcon.href = logoUrl;

    // עדכון כותרת הדף
    document.title = 'D.S Logistics CRM';
  }, [settings?.companyLogoUrl]);

  // --- Login Handler ---
  const handleLogin = async (e: any) => {
    e.preventDefault();
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setAuthError('אימייל או סיסמה שגויים');
    }
  };

  const handleLogout = () => signOut(auth);

  // --- Image Upload Handler ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 600; 

        if (width > height) {
          if (width > maxDim) { height *= maxDim / width; width = maxDim; }
        } else {
          if (height > maxDim) { width *= maxDim / height; height = maxDim; }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, width, height); 
          ctx.drawImage(img, 0, 0, width, height);
        }
        
        callback(canvas.toDataURL('image/png'));
      };
      if (event.target && event.target.result) img.src = event.target.result as string;
    };
    reader.readAsDataURL(file);
  };

  // --- Core Calculations (Inventory, Customers, Finance, Dashboard) ---
  const calculatedData = useMemo(() => {
    const shipmentStats: any = {};
    shipments.forEach(s => {
      const shippingTotalILS = (Number(s.shippingCostUSD) * Number(s.exchangeRate)) + Number(s.shippingCostILS);
      const totalCbm = Number(s.totalCbm);
      
      let linesCostUSD = 0;
      if (s.lines && Array.isArray(s.lines)) {
         linesCostUSD = s.lines.reduce((acc: number, l: any) => acc + (Number(l.qty) * Number(l.unitCostUSD)), 0);
      }
      const factoryTotalILS = linesCostUSD * Number(s.exchangeRate);

      shipmentStats[s.id] = {
        exchangeRate: Number(s.exchangeRate) || 1,
        costPerCbmILS: totalCbm > 0 ? shippingTotalILS / totalCbm : 0,
        name: s.name,
        status: s.status || 'ordered',
        arrivalDate: s.arrivalDate,
        date: s.date,
        factoryTotalILS: factoryTotalILS,
        shippingTotalILS: shippingTotalILS,
        totalCostILS: shippingTotalILS + factoryTotalILS
      };
    });

    const campaignStats: any = {};
    campaigns.forEach(c => { campaignStats[c.id] = { cost: Number(c.totalCost), itemCount: 0, name: c.name }; });
    items.forEach(i => {
      if (i.campaignId && campaignStats[i.campaignId]) {
        campaignStats[i.campaignId].itemCount++;
      }
    });

    const customerStats: any = {};
    customers.forEach(c => { 
      const displayName = c.businessName || c.contactName || c.name || 'לקוח ללא שם';
      const interestDate = c.createdAt ? new Date(c.createdAt).toLocaleDateString('he-IL') : '---';
      
      let lastContactDate = interestDate;
      if (c.interactionLogs && c.interactionLogs.length > 0) {
        lastContactDate = new Date(c.interactionLogs[c.interactionLogs.length - 1].date).toLocaleDateString('he-IL');
      }

      customerStats[c.id] = { 
        itemCount: 0, 
        totalRevenue: 0, 
        name: displayName, 
        phone: c.phone, 
        activeWarranties: 0, 
        interestDate, 
        lastContactDate 
      }; 
    });

    let inWarehouseCount = 0;
    let totalInventoryValueILS = 0;
    let totalProfit = 0;
    let soldCount = 0;
    
    // --- Finance Dashboard Metrics ---
    let currentMonthIncome = 0;
    let lastMonthIncome = 0;

    const stockInWarehouse: any = {};
    const stockOnTheWay: any = {};
    const salesInLast30: any = {};
    
    modelsList.forEach(m => { stockInWarehouse[m] = 0; stockOnTheWay[m] = 0; salesInLast30[m] = 0; });

    // --- Finance Year Aggregation Setup ---
    const monthlyFinance = Array.from({length: 12}, (_, i) => ({ month: i+1, income: 0, expense: 0, breakdowns: { shipping: 0, marketing: 0, manual: 0, itemCosts: 0 } }));
    const currentYear = today.getFullYear();
    const currentMonthNum = today.getMonth() + 1;

    const enrichedItems = items.map(item => {
      const sStat = shipmentStats[item.shipmentId];
      let cbm = 0;
      if (settings?.models?.[item.model]?.cbm) {
        cbm = settings.models[item.model].cbm;
      }
      
      const factoryCostILS = sStat ? (Number(item.factoryUnitCostUSD) * sStat.exchangeRate) : 0;
      const importCostILS = sStat ? (sStat.costPerCbmILS * cbm) : 0;
      const repairCostILS = Number(item.repairCost) || 0;
      const addOnCostILS = Number(item.addOnCost) || 0;
      
      let marketingCostILS = 0;
      if (item.campaignId && campaignStats[item.campaignId]?.itemCount > 0) {
        marketingCostILS = campaignStats[item.campaignId].cost / campaignStats[item.campaignId].itemCount;
      }

      const totalLandedCost = factoryCostILS + importCostILS + repairCostILS + addOnCostILS + marketingCostILS;
      const totalRevenue = (Number(item.salePrice) || 0) + (Number(item.addOnPrice) || 0);
      const profit = item.status === 'sold' ? totalRevenue - totalLandedCost : 0;

      let isWarrantyActive = false;
      let warrantyDaysLeft = 0;
      
      if (item.status === 'sold' && item.saleDate) {
          const saleMonthStr = item.saleDate.substring(0, 7);
          
          // Dashboard real-time tracking
          if (saleMonthStr === currentMonthStr) currentMonthIncome += totalRevenue;
          if (saleMonthStr === lastMonthStr) lastMonthIncome += totalRevenue;

          // Add to monthly finance breakdown
          const d = new Date(item.saleDate);
          if (d.getFullYear() === financeYear) {
            monthlyFinance[d.getMonth()].income += totalRevenue;
            // הוספת עלויות תיקונים ותוספות (הוצאות בזמן מכירה) להוצאות אותו חודש אוטומטית
            const itemSpecificCosts = (Number(item.repairCost) || 0) + (Number(item.addOnCost) || 0);
            monthlyFinance[d.getMonth()].expense += itemSpecificCosts;
            monthlyFinance[d.getMonth()].breakdowns.itemCosts += itemSpecificCosts;
          }

          if (item.warrantyMonths) {
            const saleDate = new Date(item.saleDate);
            const expiryDate = new Date(saleDate);
            expiryDate.setMonth(expiryDate.getMonth() + Number(item.warrantyMonths));
            
            if (expiryDate > today) {
                isWarrantyActive = true;
                const diffTime = Math.abs(expiryDate.getTime() - today.getTime());
                warrantyDaysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            }
          }
      }

      if (item.status === 'sold' && item.customerId && customerStats[item.customerId]) {
        customerStats[item.customerId].itemCount++;
        customerStats[item.customerId].totalRevenue += totalRevenue;
        if (isWarrantyActive) {
            customerStats[item.customerId].activeWarranties++;
        }
      }

      if (stockInWarehouse[item.model] === undefined) {
        stockInWarehouse[item.model] = 0; 
        stockOnTheWay[item.model] = 0; 
        salesInLast30[item.model] = 0;
      }

      if (item.status === 'in_warehouse') {
        inWarehouseCount++; 
        totalInventoryValueILS += totalLandedCost; 
        stockInWarehouse[item.model]++;
      } else if (item.status === 'ordered' || item.status === 'in_transit') {
        stockOnTheWay[item.model]++;
      }
      
      if (item.status === 'sold') {
        soldCount++; 
        totalProfit += profit;
        const thirtyDaysAgoLocal = new Date();
        thirtyDaysAgoLocal.setDate(thirtyDaysAgoLocal.getDate() - 30);
        if (item.saleDate && new Date(item.saleDate) >= thirtyDaysAgoLocal) {
          salesInLast30[item.model]++;
        }
      }

      const shipmentName = (sStat && sStat.name) ? sStat.name : 'לא ידוע';
      const shipmentStatus = (sStat && sStat.status) ? sStat.status : 'ordered';
      const campaignName = (campaignStats[item.campaignId] && campaignStats[item.campaignId].name) ? campaignStats[item.campaignId].name : 'ללא';
      const customerName = (customerStats[item.customerId] && customerStats[item.customerId].name) ? customerStats[item.customerId].name : 'לקוח כללי';

      return {
        ...item, 
        factoryCostILS, 
        importCostILS, 
        marketingCostILS, 
        totalLandedCost, 
        totalRevenue, 
        profit,
        shipmentName, 
        shipmentStatus, 
        campaignName,
        customerName, 
        isWarrantyActive, 
        warrantyDaysLeft
      };
    });

    const allModelsForForecast = Array.from(new Set([...modelsList, ...items.map(i => i.model)]));
    const forecasts = allModelsForForecast.map((model: any) => {
      const stock = stockInWarehouse[model] || 0;
      const onTheWay = stockOnTheWay[model] || 0;
      const sold30 = salesInLast30[model] || 0;
      const dailyRate = sold30 / 30;
      const daysLeft = dailyRate > 0 ? Math.round(stock / dailyRate) : (stock > 0 ? 'מעל חצי שנה' : 0);
      return { model, stock, onTheWay, sold30, dailyRate, daysLeft };
    });

    const groupedInventoryMap: any = {};
    enrichedItems.forEach(item => {
      const key = `${item.model}_${item.shipmentId}_${item.status}`;
      if (!groupedInventoryMap[key]) {
        groupedInventoryMap[key] = { 
          id: key, 
          model: item.model, 
          shipmentId: item.shipmentId, 
          shipmentName: item.shipmentName, 
          status: item.status, 
          arrivalDate: item.arrivalDate, 
          qty: 0, 
          items: [] 
        };
      }
      groupedInventoryMap[key].qty++;
      groupedInventoryMap[key].items.push(item);
    });

    const groupedArray = Object.values(groupedInventoryMap).sort((a: any, b: any) => {
      const statusWeight: any = { 'in_warehouse': 1, 'in_transit': 2, 'ordered': 3, 'sold': 4 };
      if (statusWeight[a.status] !== statusWeight[b.status]) return statusWeight[a.status] - statusWeight[b.status];
      return a.model.localeCompare(b.model);
    });

    const modelsInStock = Array.from(new Set(
      enrichedItems.filter(item => item.status === 'in_warehouse').map(item => item.model)
    ));
    const availableModelsInStock = Object.keys(stockInWarehouse).filter(m => stockInWarehouse[m] > 0);

    // 2. Expenses from Shipments (Cost of Goods on order date, Shipping on arrival date)
    Object.values(shipmentStats).forEach((s: any) => {
       // עלות המפעל (מוצרים) משולמת ונספרת בתאריך פתיחת המשלוח
       if (s.date) {
           const orderDate = new Date(s.date);
           if (orderDate.getFullYear() === financeYear) {
               monthlyFinance[orderDate.getMonth()].expense += s.factoryTotalILS;
               monthlyFinance[orderDate.getMonth()].breakdowns.itemCosts += s.factoryTotalILS;
           }
       }
       // עלות השילוח והמיסים נספרת רק בתאריך ההגעה (אם הגיע)
       if (s.arrivalDate) {
           const arrDate = new Date(s.arrivalDate);
           if (arrDate.getFullYear() === financeYear) {
               monthlyFinance[arrDate.getMonth()].expense += s.shippingTotalILS;
               monthlyFinance[arrDate.getMonth()].breakdowns.shipping += s.shippingTotalILS;
           }
       }
    });

    // 3. Expenses from Marketing Campaigns
    campaigns.forEach(c => {
       if (c.startDate) {
          const cd = new Date(c.startDate);
          if (cd.getFullYear() === financeYear) {
             const mCost = (Number(c.totalCost) || 0);
             monthlyFinance[cd.getMonth()].expense += mCost;
             monthlyFinance[cd.getMonth()].breakdowns.marketing += mCost;
          }
       }
    });

    // 4. Custom Expenses (ידניות)
    expenses.forEach(exp => {
        const sd = new Date(exp.startDate);
        const amount = Number(exp.amount) || 0;

        if (exp.type === 'variable') {
            if (sd.getFullYear() === financeYear) {
                monthlyFinance[sd.getMonth()].expense += amount;
                monthlyFinance[sd.getMonth()].breakdowns.manual += amount;
            }
        } else if (exp.type === 'fixed') {
            for (let i = 0; i < 12; i++) {
                const monthDate = new Date(financeYear, i, 1);
                const startMonth = new Date(sd.getFullYear(), sd.getMonth(), 1);
                if (monthDate >= startMonth) {
                    monthlyFinance[i].expense += amount;
                    monthlyFinance[i].breakdowns.manual += amount;
                }
            }
        } else if (exp.type === 'installment') {
            const parts = Number(exp.installments) || 1;
            const partAmount = amount / parts;
            for (let i = 0; i < parts; i++) {
                const installmentDate = new Date(sd.getFullYear(), sd.getMonth() + i, 1);
                if (installmentDate.getFullYear() === financeYear) {
                    monthlyFinance[installmentDate.getMonth()].expense += partAmount;
                    monthlyFinance[installmentDate.getMonth()].breakdowns.manual += partAmount;
                }
            }
        }
    });

    const yearlyIncome = monthlyFinance.reduce((sum, m) => sum + m.income, 0);
    const yearlyExpense = monthlyFinance.reduce((sum, m) => sum + m.expense, 0);
    const calculatedAvgProfit = soldCount > 0 ? Math.round(totalProfit / soldCount) : 0;

    const availableMonths = monthlyFinance.filter(m => {
      if (financeYear > currentYear) return false;
      if (financeYear < currentYear) return true;
      return m.month <= currentMonthNum;
    });

    const selectedMonthData = monthlyFinance[financeMonth - 1] || { income: 0, expense: 0, breakdowns: { shipping: 0, marketing: 0, manual: 0, itemCosts: 0 } };

    return { 
      enrichedItems, groupedInventory: groupedArray, shipmentStats, campaignStats, customerStats, 
      inWarehouseCount, totalInventoryValueILS, avgProfit: calculatedAvgProfit, forecasts, modelsInStock, availableModelsInStock, stockInWarehouse,
      monthlyFinance, availableMonths, selectedMonthData, yearlyIncome, yearlyExpense, currentMonthIncome, lastMonthIncome,
      supplierStats: (() => {
        const stats: any = {};
        // בנה map: modelName → supplierId
        const modelToSupplier: any = {};
        if (settings?.models) {
          Object.entries(settings.models).forEach(([modelName, modelData]: [string, any]) => {
            if (modelData.supplierId) modelToSupplier[modelName] = modelData.supplierId;
          });
        }
        // חשב per-supplier מהמשלוחים
        shipments.forEach((s: any) => {
          if (!s.lines) return;
          const exchangeRate = Number(s.exchangeRate) || 1;
          const arrivalDate = s.arrivalDate;
          const orderDate = s.date;
          const leadTimeDays = (arrivalDate && orderDate)
            ? Math.round((new Date(arrivalDate).getTime() - new Date(orderDate).getTime()) / (1000*60*60*24))
            : null;
          s.lines.forEach((line: any) => {
            const supplierId = modelToSupplier[line.model];
            if (!supplierId) return;
            if (!stats[supplierId]) {
              stats[supplierId] = { totalPaidUSD: 0, totalPaidILS: 0, orderCount: 0, shipmentIds: new Set(), models: new Set(), shipmentHistory: [], priceHistory: {}, leadTimes: [] };
            }
            const lineCostUSD = Number(line.qty) * Number(line.unitCostUSD);
            stats[supplierId].totalPaidUSD += lineCostUSD;
            stats[supplierId].totalPaidILS += lineCostUSD * exchangeRate;
            stats[supplierId].models.add(line.model);
            if (!stats[supplierId].shipmentIds.has(s.id)) {
              stats[supplierId].shipmentIds.add(s.id);
              stats[supplierId].orderCount++;
              if (leadTimeDays !== null && leadTimeDays > 0) stats[supplierId].leadTimes.push(leadTimeDays);
            }
            // היסטוריית מחירים לכל דגם
            if (!stats[supplierId].priceHistory[line.model]) stats[supplierId].priceHistory[line.model] = [];
            stats[supplierId].priceHistory[line.model].push({ date: s.date, shipmentName: s.name, unitCostUSD: Number(line.unitCostUSD), shipmentId: s.id });
          });
        });
        // המר Sets ל-arrays וחשב ממוצעים
        Object.values(stats).forEach((s: any) => {
          s.models = Array.from(s.models);
          s.shipmentIds = Array.from(s.shipmentIds);
          s.avgLeadTimeDays = s.leadTimes.length > 0 ? Math.round(s.leadTimes.reduce((a: number, b: number) => a+b, 0) / s.leadTimes.length) : null;
          // מיין priceHistory לפי תאריך
          Object.keys(s.priceHistory).forEach(model => {
            s.priceHistory[model].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
          });
        });
        return stats;
      })()
    };
  }, [items, shipments, campaigns, customers, expenses, settings, modelsList, financeYear, financeMonth, currentMonthStr, lastMonthStr, thirtyDaysAgoStr, suppliers]);

  // --- Handlers ---
  const generateWithGemini = async (prompt: string) => {
    if (!geminiApiKey || geminiApiKey === "YOUR_GEMINI_API_KEY") return "שים לב: לא הגדרת מפתח API של Gemini בקוד המערכת.";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: "You are an expert business consultant for D.S Logistics." }] } };
    try {
      const res = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
      const data = await res.json();
      if (data?.candidates?.[0]?.content?.parts?.[0]) return data.candidates[0].content.parts[0].text;
      return "לא נוצר טקסט.";
    } catch (err) { return "שגיאה בתקשורת מול שרת ה-AI."; }
  };

  const handleGetInsights = async () => {
    setIsGeneratingAI(true); setShowAiModal(true); setAiInsight("");
    const dataSummary = JSON.stringify(calculatedData.forecasts);
    const prompt = `אני יבואן של ברים מנירוסטה מסין לארץ. הנה נתוני המלאי שלי: ${dataSummary}. הרווח הממוצע הוא ${calculatedData.avgProfit} ₪ לבר. אנא תן תמונת מצב בעברית, המלצה מה להזמין, וטיוטת מייל באנגלית למפעל.`;
    const result = await generateWithGemini(prompt);
    setAiInsight(result); setIsGeneratingAI(false);
  };

  const handleGenerateAd = async (campaignName: string) => {
    setIsGeneratingAI(true); setShowAiModal(true); setAiInsight("");
    const prompt = `אני יבואן של ברים מנירוסטה. יש לי קמפיין שיווקי בשם "${campaignName}". כתוב פוסט שיווקי בעברית לאינסטגרם ופייסבוק שמוכר ברים.`;
    const result = await generateWithGemini(prompt);
    setAiInsight(result); setIsGeneratingAI(false);
  };

  const handleAddModel = async (e: any) => {
    e.preventDefault();
    if (!newModelName.trim()) return;
    try {
      const newSettings = { ...settings, models: { ...settings.models, [newModelName.trim()]: { cbm: 0, blueprintUrl: '', itemImgUrl: '' } } };
      await setDoc(doc(db, 'crm_settings', 'general_settings'), newSettings);
      setNewModelName('');
    } catch(err) { console.error(err); }
  };
  
  const handleAddNewModelWithData = async (e: any) => {
      e.preventDefault();
      if (!newModelData.name.trim()) return;
      setIsSaving(true);
      try {
        const newSettings = { ...settings, models: { ...settings.models, [newModelData.name.trim()]: { cbm: Number(newModelData.cbm) || 0, blueprintUrl: '', itemImgUrl: '' } } };
        await setDoc(doc(db, 'crm_settings', 'general_settings'), newSettings);
        setNewModelData({ name: '', cbm: 0 });
        setIsModelModalOpen(false);
      } catch(err) { alert("שגיאה בהוספת דגם"); }
      setIsSaving(false);
  };

  const processQuickImport = () => {
    if (!quickImportText.trim()) return;

    const lines = quickImportText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    const cleanLine = (line: string) => {
      let cleaned = line.replace(/^\s*\d+[\.\-\)]?\s*/, '');
      let matchedKeyword = '';
      for (const kw of QUICK_IMPORT_KEYWORDS) {
        if (cleaned.toLowerCase().startsWith(kw.toLowerCase())) { matchedKeyword = kw; break; }
      }

      if (matchedKeyword) {
        cleaned = cleaned.substring(matchedKeyword.length).trim().replace(/^[\:\-\,]\s*/, '');
      } else {
        if (cleaned.includes(':')) {
          const parts = cleaned.split(':');
          if (parts[0].length < 30) cleaned = parts.slice(1).join(':').trim();
        } else if (cleaned.includes('-')) {
          const parts = cleaned.split('-');
          const firstPart = parts[0].trim();
          if (firstPart.length < 35 && (firstPart.includes('שם') || firstPart.includes('טלפון') || firstPart.includes('ח.פ'))) {
             cleaned = parts.slice(1).join('-').trim();
          }
        }
      }
      return cleaned.trim();
    };

    const fields = lines.map(cleanLine);
    let businessType = customerEditingData?.businessType || 'bar';
    if (fields[3]) {
      if (fields[3].includes('בר')) businessType = 'bar';
      else if (fields[3].includes('מסעד')) businessType = 'restaurant';
      else if (fields[3].includes('אולם') || fields[3].includes('אירוע')) businessType = 'event_hall';
      else businessType = 'other';
    }

    setCustomerEditingData((prev: any) => ({
      ...prev,
      contactName: fields[0] || prev?.contactName || '',
      businessName: fields[1] || prev?.businessName || '',
      companyName: fields[2] || prev?.companyName || '',
      businessType: businessType,
      hp: fields[4] || prev?.hp || '',
      email: fields[5] || prev?.email || '',
      phone: fields[6] || prev?.phone || '',
      address: fields[7] || prev?.address || ''
    }));
    setShowQuickImport(false);
    setQuickImportText('');
  };

  const confirmShipmentStatusUpdate = async (shipment: any, newStatus: string, arrivalDate: string | null) => {
    setIsSaving(true);
    try {
      const sRef = doc(db, 'crm_shipments', shipment.id);
      const sUpdate: any = { status: newStatus, updatedAt: new Date().toISOString() };
      if (newStatus === 'in_warehouse' && arrivalDate) sUpdate.arrivalDate = arrivalDate;
      else if (newStatus !== 'in_warehouse') sUpdate.arrivalDate = null;
      await updateDoc(sRef, sUpdate);

      const itemsToUpdate = items.filter(i => i.shipmentId === shipment.id && i.status !== 'sold');
      await Promise.all(itemsToUpdate.map(i => {
        const iRef = doc(db, 'crm_items', i.id);
        const iUpdate: any = { status: newStatus, updatedAt: new Date().toISOString() };
        if (newStatus === 'in_warehouse' && arrivalDate) iUpdate.arrivalDate = arrivalDate;
        else if (newStatus !== 'in_warehouse') iUpdate.arrivalDate = null;
        return updateDoc(iRef, iUpdate);
      }));
    } catch (err) { alert("שגיאה בעדכון הנתונים"); }
    setIsSaving(false);
  };

  const handleShipmentStatusSelect = (shipment: any, newStatus: string) => {
    if (newStatus === 'in_warehouse') {
      setArrivalPrompt({ isOpen: true, shipment, date: shipment.arrivalDate || new Date().toISOString().split('T')[0] });
    } else {
      if (window.confirm(`לעבור לסטטוס "${SHIPMENT_STATUS_MAP[newStatus]}"?`)) confirmShipmentStatusUpdate(shipment, newStatus, null);
    }
  };

  const saveShipment = async (e: any) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const sRef = collection(db, 'crm_shipments');
      const itemsRef = collection(db, 'crm_items');
      const data = { ...editingData, updatedAt: new Date().toISOString() };
      
      if (data.id) {
        await updateDoc(doc(sRef, data.id), data);
        
        const currentShipmentItems = items.filter(i => i.shipmentId === data.id);
        const currentItemsByModel: any = {};
        currentShipmentItems.forEach(item => {
          if (!currentItemsByModel[item.model]) currentItemsByModel[item.model] = [];
          currentItemsByModel[item.model].push(item);
        });

        const modelsInUpdatedLines = new Set();

        for (const line of data.lines) {
          const model = line.model;
          modelsInUpdatedLines.add(model);
          const desiredQty = Number(line.qty) || 0;
          const currentModelItems = currentItemsByModel[model] || [];
          const currentQty = currentModelItems.length;
          const diff = desiredQty - currentQty;

          if (diff > 0) {
            for (let i = 0; i < diff; i++) {
              await addDoc(itemsRef, { 
                shipmentId: data.id, model: model, status: data.status || 'ordered', 
                arrivalDate: data.arrivalDate || null, factoryUnitCostUSD: Number(line.unitCostUSD) || 0, 
                serialNumber: '', repairCost: 0, addOnCost: 0, salePrice: 0, addOnPrice: 0, 
                campaignId: '', createdAt: new Date().toISOString() 
              });
            }
          } 
          else if (diff < 0) {
            const itemsToRemoveCount = Math.abs(diff);
            const sortedToRemove = [...currentModelItems].sort((a: any, b: any) => {
              if (a.status === 'sold' && b.status !== 'sold') return 1;
              if (a.status !== 'sold' && b.status === 'sold') return -1;
              return 0;
            });

            for (let i = 0; i < itemsToRemoveCount; i++) {
              if (sortedToRemove[i]) {
                await deleteDoc(doc(db, 'crm_items', sortedToRemove[i].id));
                sortedToRemove[i]._deleted = true; 
              }
            }
          }

          const itemsToUpdateCost = currentModelItems.filter((i: any) => !i._deleted && Number(i.factoryUnitCostUSD) !== Number(line.unitCostUSD));
          for (const item of itemsToUpdateCost) {
            await updateDoc(doc(itemsRef, item.id), { factoryUnitCostUSD: Number(line.unitCostUSD), updatedAt: new Date().toISOString() });
          }
        }

        for (const model in currentItemsByModel) {
          if (!modelsInUpdatedLines.has(model)) {
            for (const item of currentItemsByModel[model]) {
              if (!item._deleted) await deleteDoc(doc(db, 'crm_items', item.id));
            }
          }
        }
      } else {
        data.status = 'ordered';
        data.createdAt = new Date().toISOString();
        const docRef = await addDoc(sRef, data);
        for (const line of data.lines) {
          for (let i=0; i<(Number(line.qty)||0); i++) {
            await addDoc(itemsRef, { shipmentId: docRef.id, model: line.model, status: 'ordered', factoryUnitCostUSD: Number(line.unitCostUSD) || 0, serialNumber: '', repairCost: 0, addOnCost: 0, salePrice: 0, addOnPrice: 0, campaignId: '', createdAt: new Date().toISOString() });
          }
        }
      }
      setIsShipmentModalOpen(false);
    } catch (err) { alert("שגיאה בשמירה"); }
    setIsSaving(false);
  };

  const saveItem = async (e: any) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data = { ...editingData, updatedAt: new Date().toISOString() };
      
      if (data.isGlobalSale) {
        if (!data.model) throw new Error("חובה לבחור דגם");
        const availableItem = items.find(i => i.model === data.model && i.status === 'in_warehouse');
        if (!availableItem) throw new Error("אין פריטים פנויים מדגם זה במלאי ברגע זה.");
        
        const updatePayload = {
          status: 'sold',
          saleDate: data.saleDate || new Date().toISOString().split('T')[0],
          warrantyMonths: Number(data.warrantyMonths) || 0,
          salePrice: Number(data.salePrice) || 0,
          addOnPrice: Number(data.addOnPrice) || 0,
          repairCost: Number(data.repairCost) || 0,
          addOnCost: Number(data.addOnCost) || 0,
          campaignId: data.campaignId || '',
          customerId: data.customerId || '',
          updatedAt: new Date().toISOString()
        };
        await updateDoc(doc(db, 'crm_items', availableItem.id), updatePayload);

        // שינוי א: עדכון סטטוס לקוח ל-active במכירה ישירה
        if (data.customerId) {
          const customer = customers.find(c => c.id === data.customerId);
          if (customer && customer.status !== 'active') {
            await updateDoc(doc(db, 'crm_customers', data.customerId), {
              status: 'active',
              previousStatusBeforeActive: customer.status || 'lead',
              updatedAt: new Date().toISOString()
            });
          }
        }
      } 
      else {
        // שינוי ב: reverse סטטוס לקוח כשמשנים פריט מ-sold ל-in_warehouse
        const originalItem = items.find(i => i.id === data.id);
        const wasJustSoldAndNowNot = originalItem && originalItem.status === 'sold' && data.status !== 'sold';

        if (data.status === 'sold' && !data.saleDate) data.saleDate = new Date().toISOString().split('T')[0];
        if (data.status !== 'sold') { data.customerId = ''; data.campaignId = ''; data.warrantyMonths = 0; data.saleDate = null; data.salePrice = 0; }
        await updateDoc(doc(db, 'crm_items', data.id), data);

        // אם פריט עבר מ-sold חזרה — בדוק אם ללקוח יש עוד פריטים נמכרים
        if (wasJustSoldAndNowNot && originalItem.customerId) {
          const otherSoldItems = items.filter(i =>
            i.id !== data.id &&
            i.customerId === originalItem.customerId &&
            i.status === 'sold'
          );
          if (otherSoldItems.length === 0) {
            const customer = customers.find(c => c.id === originalItem.customerId);
            const revertStatus = customer?.previousStatusBeforeActive || 'lead';
            await updateDoc(doc(db, 'crm_customers', originalItem.customerId), {
              status: revertStatus,
              updatedAt: new Date().toISOString()
            });
          }
        }

        // אם פריט עבר ל-sold עם customerId — עדכן סטטוס לקוח
        if (data.status === 'sold' && data.customerId) {
          const customer = customers.find(c => c.id === data.customerId);
          if (customer && customer.status !== 'active') {
            await updateDoc(doc(db, 'crm_customers', data.customerId), {
              status: 'active',
              previousStatusBeforeActive: customer.status || 'lead',
              updatedAt: new Date().toISOString()
            });
          }
        }
      }
      setIsItemModalOpen(false);
    } catch (err: any) { alert(err.message || "שגיאה בשמירה"); }
    setIsSaving(false);
  };

  const saveCampaign = async (e: any) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data = { ...editingData, updatedAt: new Date().toISOString() };
      if (data.id) await updateDoc(doc(db, 'crm_campaigns', data.id), data);
      else { data.createdAt = new Date().toISOString(); await addDoc(collection(db, 'crm_campaigns'), data); }
      setIsCampaignModalOpen(false);
    } catch (err) { alert("שגיאה בשמירה"); }
    setIsSaving(false);
  };

  const saveCustomer = async (e: any) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data = { ...customerEditingData, updatedAt: new Date().toISOString() };
      let newCustomerId = data.id;
      if (data.id) {
        await updateDoc(doc(db, 'crm_customers', data.id), data);
      } else { 
        data.createdAt = new Date().toISOString(); 
        data.interactionLogs = [];
        const docRef = await addDoc(collection(db, 'crm_customers'), data); 
        newCustomerId = docRef.id;
      }
      setIsCustomerModalOpen(false);
      
      if (isItemModalOpen) setEditingData((prev: any) => ({...prev, customerId: newCustomerId}));
      if (isQuoteModalOpen) setQuoteData((prev: any) => ({...prev, customerId: newCustomerId}));
    } catch (err) { alert("שגיאה בשמירת לקוח"); }
    setIsSaving(false);
  };

  const addInteractionNote = async () => {
    if (!newNoteText.trim() || !selectedCustomer) return;
    setIsSaving(true);
    try {
      const customerRef = doc(db, 'crm_customers', selectedCustomer.id);
      const newLog = { date: new Date().toISOString(), text: newNoteText, user: user?.email || 'משתמש מערכת' };
      const currentLogs = Array.isArray(selectedCustomer.interactionLogs) ? selectedCustomer.interactionLogs : [];
      const updatedLogs = [...currentLogs, newLog];
      
      await updateDoc(customerRef, { interactionLogs: updatedLogs, updatedAt: new Date().toISOString() });
      setSelectedCustomer({...selectedCustomer, interactionLogs: updatedLogs});
      setNewNoteText('');
    } catch (err) { alert("שגיאה בהוספת הערה"); }
    setIsSaving(false);
  };

  const saveExpense = async (e: any) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data = { ...expenseData, createdAt: new Date().toISOString() };
      await addDoc(collection(db, 'crm_expenses'), data);
      setIsExpenseModalOpen(false);
      setExpenseData({ title: '', amount: 0, type: 'variable', startDate: new Date().toISOString().split('T')[0], installments: 1 });
    } catch (err) { alert("שגיאה בשמירת הוצאה"); }
    setIsSaving(false);
  };

  const saveSettings = async () => {
    try {
      await setDoc(doc(db, 'crm_settings', 'general_settings'), settings);
      alert("הגדרות נשמרו בהצלחה!");
    } catch (err) { alert("שגיאה בשמירה"); }
  };

  const deleteDocHandler = async (collectionName: string, id: string) => {
    if (!window.confirm("בטוח שברצונך למחוק? הפעולה אינה ניתנת לביטול.")) return;
    try { 
      await deleteDoc(doc(db, collectionName, id)); 
      if (collectionName === 'crm_shipments') {
        const itemsToDelete = items.filter(i => i.shipmentId === id);
        for (const item of itemsToDelete) await deleteDoc(doc(db, 'crm_items', item.id));
      }
    } catch (err) { console.error(err); }
  };

  const handleResetSystem = async () => {
    const userConfirm = window.prompt("אזהרה קריטית! 🛑\nפעולה זו תמחק את *כל* המשלוחים, הפריטים, הקמפיינים וההוצאות.\nלהמשך, הקלד את המילה 'מחק':");
    if (userConfirm !== 'מחק') return;
    
    setIsSaving(true);
    try {
      const collectionsToDelete = ['crm_shipments', 'crm_items', 'crm_campaigns', 'crm_customers', 'crm_quotes', 'crm_expenses'];
      for (const colName of collectionsToDelete) {
        const snapshot = await getDocs(collection(db, colName));
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, colName, d.id)));
        await Promise.all(deletePromises);
      }
      alert("כל הנתונים נמחקו בהצלחה! המערכת כעת נקייה.");
      setActiveTab('dashboard'); 
    } catch (err) { alert("שגיאה במחיקת הנתונים."); }
    setIsSaving(false);
  };

  const saveSupplier = async (e: any) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data = { ...supplierEditingData, updatedAt: new Date().toISOString() };
      if (data.id) {
        await updateDoc(doc(db, 'crm_suppliers', data.id), data);
      } else {
        data.createdAt = new Date().toISOString();
        data.interactionLogs = [];
        data.catalog = data.catalog || [];
        await addDoc(collection(db, 'crm_suppliers'), data);
      }
      setIsSupplierModalOpen(false);
    } catch (err) { alert('שגיאה בשמירת ספק'); }
    setIsSaving(false);
  };

  const retryFinbot = async (quote: any, customer: any) => {
    if (!settings?.finbotApiKey) { alert('אין מפתח API של Finbot בהגדרות.'); return; }
    if (quote.approvedShippingCost === undefined && quote.approvedShippingCost !== 0) { alert('חסרים נתוני משלוח — ייתכן שהצעה זו אושרה לפני עדכון המערכת.'); return; }
    try {
      const { url: invoiceUrl, error: finbotErr } = await sendToFinbot(
        (quote.items || []).map((i: any) => ({ model: i.model, qty: i.qty, price: i.price })),
        Number(quote.approvedShippingCost) || 0,
        customer
      );
      if (invoiceUrl) {
        await updateDoc(doc(db, 'crm_quotes', quote.id), { finbotInvoiceUrl: invoiceUrl, finbotSentAt: new Date().toISOString(), finbotError: null });
        alert('✓ דרישת תשלום נוצרה ב-Finbot בהצלחה!');
      } else {
        await updateDoc(doc(db, 'crm_quotes', quote.id), { finbotError: finbotErr, finbotSentAt: new Date().toISOString() });
        alert('⚠️ שליחה ל-Finbot נכשלה שוב. ראה הודעת שגיאה בדף הלקוח.');
      }
    } catch(err: any) {
      const errMsg = err?.message || 'שגיאת רשת.';
      await updateDoc(doc(db, 'crm_quotes', quote.id), { finbotError: errMsg, finbotSentAt: new Date().toISOString() });
      alert('⚠️ שגיאה: ' + errMsg);
    }
  };

  const addSupplierNote = async () => {
    if (!supplierNoteText.trim() || !selectedSupplier) return;
    setIsSaving(true);
    try {
      const newLog = { date: new Date().toISOString(), text: supplierNoteText, user: user?.email || 'משתמש מערכת' };
      const updatedLogs = [...(selectedSupplier.interactionLogs || []), newLog];
      await updateDoc(doc(db, 'crm_suppliers', selectedSupplier.id), { interactionLogs: updatedLogs, updatedAt: new Date().toISOString() });
      setSelectedSupplier({ ...selectedSupplier, interactionLogs: updatedLogs });
      setSupplierNoteText('');
    } catch (err) { alert('שגיאה בהוספת הערה'); }
    setIsSaving(false);
  };

  // --- Supplier Catalog Upload ---
  const uploadSupplierCatalog = async (supplierId: string, file: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['pdf','xlsx','xls'].includes(ext || '')) { alert('יש להעלות קובץ PDF או Excel בלבד.'); return; }
    setIsCatalogUploading(true);
    setCatalogUploadProgress(0);
    try {
      const path = `supplier-catalogs/${supplierId}/catalog.${ext}`;
      const fileRef = storageRef(storage, path);
      const uploadTask = uploadBytesResumable(fileRef, file);
      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed',
          (snap) => setCatalogUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
          (err) => reject(err),
          () => resolve()
        );
      });
      const url = await getDownloadURL(fileRef);
      await updateDoc(doc(db, 'crm_suppliers', supplierId), {
        catalogFileUrl: url,
        catalogFileName: file.name,
        catalogUploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setSelectedSupplier((prev: any) => prev ? { ...prev, catalogFileUrl: url, catalogFileName: file.name, catalogUploadedAt: new Date().toISOString() } : prev);
      alert('הקטלוג הועלה בהצלחה!');
    } catch (err) { alert('שגיאה בהעלאת הקטלוג.'); }
    setIsCatalogUploading(false);
    setCatalogUploadProgress(null);
  };

  // --- Finbot Integration ---
  const sendToFinbot = async (quoteItems: any[], shippingCost: number, customer: any): Promise<{url: string|null, error: string|null}> => {
    const apiKey = settings?.finbotApiKey;
    if (!apiKey) return { url: null, error: 'אין מפתח API מוגדר בהגדרות.' };
    const today = new Date();
    const dd = String(today.getDate()).padStart(2,'0');
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const yyyy = today.getFullYear();
    const dateStr = `${dd}/${mm}/${yyyy}`;

    const items = quoteItems.map((item: any) => ({
      name: `תחנת נירוסטה דגם ${item.model}`,
      amount: Number(item.qty),
      price: Number(item.price),
      save: false
    }));
    if (Number(shippingCost) > 0) {
      items.push({ name: 'הובלה והתקנה', amount: 1, price: Number(shippingCost), save: false });
    }

    const taxRaw = (customer.hp || '').toString().replace(/\D/g, '').slice(0, 9);

    const body: any = {
      type: '3',
      date: dateStr,
      language: 'he',
      currency: 'ILS',
      vatType: true,
      rounding: true,
      confirmationNumber: false,
      customer: {
        name: customer.companyName || customer.businessName || customer.contactName || '',
        phone: (customer.phone || '').slice(0, 20),
        address: (customer.address || '').slice(0, 100),
        save: true,
        ...(taxRaw ? { tax: taxRaw } : {}),
        ...(customer.email ? { email: customer.email.slice(0, 50) } : {})
      },
      items
    };

    try {
      const res = await fetch('/.netlify/functions/finbot-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, secret: apiKey })
      });
      const rawText = await res.text();
      let data: any = {};
      try { data = JSON.parse(rawText); } catch { return { url: null, error: `תגובה לא תקינה: ${rawText.slice(0, 200)}` }; }

      if (data.error) return { url: null, error: `שגיאת proxy: ${data.error}` };

      if (data.status === 1 && data.data) {
        return { url: data.data, error: null };
      }
      // שמירת תגובה מלאה לדיבוג
      const fullResponse = JSON.stringify(data);
      console.error('Finbot full response:', fullResponse);
      return { url: null, error: `תגובה מלאה מ-Finbot: ${fullResponse}` };
    } catch (err: any) {
      return { url: null, error: `שגיאת רשת: ${err?.message || 'לא ניתן להגיע לשרת Finbot'}` };
    }
  };

  // --- Quote Generation & Management ---
  const handleGenerateQuotePDF = async () => {
    if (!quoteRef.current || !quoteData?.customerId) {
      alert("יש לבחור לקוח לפני הפקת המסמך");
      return;
    }
    
    const currentCustomer = customers.find(c => c.id === quoteData.customerId) || {};
    setIsGeneratingPDF(true);
    try {
      const quotePayload = {
        customerId: quoteData.customerId,
        date: quoteData.date,
        items: quoteData.items,
        shippingCost: quoteData.shippingCost,
        warrantyMonths: Number(quoteData.warrantyMonths) || 0,
        campaignId: quoteData.campaignId || '',
        status: 'pending', 
        createdAt: new Date().toISOString()
      };
      
      if (!quoteData.id) await addDoc(collection(db, 'crm_quotes'), quotePayload);

      const canvas = await html2canvas(quoteRef.current, { scale: 2, useCORS: true, backgroundColor: '#eae5dd' });
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 210; 
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width; 
      
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfWidth, pdfHeight] });
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      
      const fileName = currentCustomer.businessName || currentCustomer.contactName || 'לקוח';
      pdf.save(`הצעת_מחיר_${fileName}.pdf`);
      
      setIsQuoteModalOpen(false); 
    } catch (error) { alert("שגיאה ביצירת הצעת המחיר."); }
    setIsGeneratingPDF(false);
  };

  const addQuoteItem = () => {
      if(modelsList.length > 0) setQuoteData({...quoteData, items: [...quoteData.items, { model: modelsList[0], qty: 1, price: 0, customNotes: '' }]});
  };

  const updateQuoteItem = (index: number, field: string, value: any) => {
      const newItems = [...quoteData.items];
      newItems[index] = { ...newItems[index], [field]: value };
      setQuoteData({ ...quoteData, items: newItems });
  };

  const removeQuoteItem = (index: number) => {
      const newItems = quoteData.items.filter((_:any, i:number) => i !== index);
      setQuoteData({ ...quoteData, items: newItems });
  };

  const handleQuoteStatusChange = async (quote: any, newStatus: string) => {
    // נתיב 1: אישור עם גריעת מלאי (מכל סטטוס שאינו approved)
    if (newStatus === 'approved') {
      const itemsToProcess = quote.items.map((item: any) => ({
        model: item.model, qty: item.qty, salePrice: item.price,
        saleDate: todayStr, warrantyMonths: Number(quote.warrantyMonths) || 0,
        campaignId: quote.campaignId || '', processed: 0
      }));
      setQuoteApprovalData({ quoteId: quote.id, customerId: quote.customerId, itemsToProcess, shippingCost: Number(quote.shippingCost) || 0 });
      setIsQuoteApprovalModalOpen(true);
      return;
    }

    // נתיב 2: Reverse — מ-approved (עם גריעה) לכל סטטוס אחר
    if (quote.status === 'approved') {
      if (!window.confirm(`ביטול האישור יחזיר את כל הפריטים למלאי והלקוח יחזור לסטטוסו הקודם.\nהאם להמשיך?`)) return;
      setIsSaving(true);
      try {
        const approvedItemIds: string[] = Array.isArray(quote.approvedItemIds) ? quote.approvedItemIds : [];
        if (approvedItemIds.length > 0) {
          await Promise.all(approvedItemIds.map((itemId: string) =>
            updateDoc(doc(db, 'crm_items', itemId), {
              status: 'in_warehouse',
              saleDate: null, warrantyMonths: 0, salePrice: 0,
              addOnPrice: 0, customerId: '', campaignId: '',
              updatedAt: new Date().toISOString()
            })
          ));
        }
        // החזרת סטטוס לקוח
        if (quote.customerId) {
          const prevStatus = quote.previousCustomerStatus || 'lead';
          await updateDoc(doc(db, 'crm_customers', quote.customerId), {
            status: prevStatus,
            updatedAt: new Date().toISOString()
          });
        }
        await updateDoc(doc(db, 'crm_quotes', quote.id), {
          status: newStatus,
          approvedItemIds: [],
          updatedAt: new Date().toISOString()
        });
        alert('הסטטוס עודכן. הפריטים הוחזרו למלאי והלקוח הוחזר לסטטוסו הקודם.');
      } catch (err) { alert('שגיאה בביטול האישור.'); }
      setIsSaving(false);
      return;
    }

    // נתיב 3: אושר ללא גריעת מלאי
    if (newStatus === 'approved_no_stock') {
      try {
        await updateDoc(doc(db, 'crm_quotes', quote.id), { status: newStatus, updatedAt: new Date().toISOString() });
        alert("הצעת המחיר סומנה כמאושרת. שים לב - לא בוצעה גריעת מלאי.");
      } catch (err) { alert("שגיאה בעדכון סטטוס."); }
      return;
    }

    // נתיב 4: כל שאר העדכונים
    try {
      await updateDoc(doc(db, 'crm_quotes', quote.id), { status: newStatus, updatedAt: new Date().toISOString() });
    } catch (err) { alert("שגיאה בעדכון סטטוס."); }
  };

  const executeQuoteApproval = async (e: any) => {
      e.preventDefault();
      setIsSaving(true);
      try {
        const updatesToMake = [];
        for (const line of quoteApprovalData.itemsToProcess) {
            const availableItems = items.filter(i => i.model === line.model && i.status === 'in_warehouse');
            if (availableItems.length < line.qty) {
                throw new Error(`אין מספיק פריטים פנויים במלאי מדגם ${line.model}. (נדרש: ${line.qty}, פנוי: ${availableItems.length})`);
            }
            for(let i=0; i < line.qty; i++) {
                updatesToMake.push({
                    id: availableItems[i].id,
                    data: {
                        status: 'sold', saleDate: line.saleDate, warrantyMonths: Number(line.warrantyMonths) || 0,
                        salePrice: Number(line.salePrice) || 0, campaignId: line.campaignId || '', customerId: quoteApprovalData.customerId,
                        updatedAt: new Date().toISOString()
                    }
                });
            }
        }

        // שמירת IDs שנגרעו לצורך reverse עתידי
        const approvedItemIds = updatesToMake.map(u => u.id);

        // שמירת סטטוס לקוח לפני האישור
        const customer = customers.find(c => c.id === quoteApprovalData.customerId);
        const previousCustomerStatus = customer?.status || 'lead';

        await Promise.all(updatesToMake.map(update => updateDoc(doc(db, 'crm_items', update.id), update.data)));
        await updateDoc(doc(db, 'crm_quotes', quoteApprovalData.quoteId), {
          status: 'approved',
          approvedAt: new Date().toISOString(),
          approvedItemIds: approvedItemIds,
          approvedShippingCost: quoteApprovalData.shippingCost || 0,
          previousCustomerStatus: previousCustomerStatus,
          updatedAt: new Date().toISOString()
        });
        await updateDoc(doc(db, 'crm_customers', quoteApprovalData.customerId), {
          status: 'active',
          previousStatusBeforeActive: previousCustomerStatus,
          updatedAt: new Date().toISOString()
        });

        setIsQuoteApprovalModalOpen(false);

        // --- Finbot Integration ---
        if (settings?.finbotApiKey) {
          try {
            const { url: invoiceUrl, error: finbotErr } = await sendToFinbot(
              quoteApprovalData.itemsToProcess.map((l: any) => ({ model: l.model, qty: l.qty, price: l.salePrice })),
              quoteApprovalData.shippingCost || 0,
              customer
            );
            if (invoiceUrl) {
              await updateDoc(doc(db, 'crm_quotes', quoteApprovalData.quoteId), { finbotInvoiceUrl: invoiceUrl, finbotSentAt: new Date().toISOString(), finbotError: null });
              alert('הצעת המחיר אושרה! הפריטים נגרעו מהמלאי, הלקוח עודכן, ודרישת תשלום נוצרה ב-Finbot בהצלחה.');
            } else {
              await updateDoc(doc(db, 'crm_quotes', quoteApprovalData.quoteId), { finbotError: finbotErr, finbotSentAt: new Date().toISOString() });
              alert('הצעת המחיר אושרה! הפריטים נגרעו מהמלאי בהצלחה והלקוח עודכן.\n⚠️ שליחת הנתונים ל-Finbot נכשלה — ניתן לנסות שוב מדף הלקוח.');
            }
          } catch(err: any) {
            const errMsg = err?.message || 'שגיאת רשת — לא ניתן להגיע לשרת Finbot.';
            await updateDoc(doc(db, 'crm_quotes', quoteApprovalData.quoteId), { finbotError: errMsg, finbotSentAt: new Date().toISOString() });
            alert('הצעת המחיר אושרה! הפריטים נגרעו מהמלאי בהצלחה והלקוח עודכן.\n⚠️ שליחת הנתונים ל-Finbot נכשלה — ניתן לנסות שוב מדף הלקוח.');
          }
        } else {
          alert('הצעת המחיר אושרה! הפריטים נגרעו מהמלאי בהצלחה והלקוח עודכן.');
        }
      } catch (err: any) { alert(err.message || "שגיאה בתהליך אישור ההצעה."); }
      setIsSaving(false);
  };


  // --- Render Login Screen if not authenticated ---
  if (authChecking) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;
  
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-sm w-full border border-slate-200">
          <div className="flex flex-col items-center mb-6">
            <div className="bg-indigo-100 p-3 rounded-full mb-3"><Lock className="w-8 h-8 text-indigo-600"/></div>
            <h1 className="text-2xl font-bold text-slate-800">התחברות למערכת</h1>
            <p className="text-slate-500 text-sm mt-1">D.S Logistics CRM</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">אימייל</label>
              <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="w-full border border-slate-300 rounded-md p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" dir="ltr"/>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">סיסמה</label>
              <input type="password" required value={password} onChange={e=>setPassword(e.target.value)} className="w-full border border-slate-300 rounded-md p-2.5 outline-none focus:ring-2 focus:ring-indigo-500" dir="ltr"/>
            </div>
            {authError && <p className="text-red-500 text-sm text-center">{authError}</p>}
            <button type="submit" className="w-full bg-indigo-600 text-white font-medium py-2.5 rounded-md hover:bg-indigo-700 transition-colors">כניסה מאובטחת</button>
          </form>
        </div>
      </div>
    );
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 relative" dir="rtl">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between relative">
          {/* שמאל - שם מערכת */}
          <div className="flex items-center gap-3 min-w-[120px]">
            <div className="bg-indigo-100 p-1.5 rounded"><Package className="h-5 w-5 text-indigo-700" /></div>
            <h1 className="text-sm font-bold text-slate-600 hidden sm:block">D.S Logistics CRM</h1>
          </div>

          {/* מרכז - לוגו החברה */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center h-12">
            {settings?.companyLogoUrl ? (
              <img
                src={settings.companyLogoUrl}
                alt="לוגו החברה"
                className="h-10 max-w-[140px] object-contain"
                crossOrigin="anonymous"
              />
            ) : (
              <span className="text-lg font-bold text-slate-700 tracking-tight">D.S Logistics</span>
            )}
          </div>

          {/* ימין - יציאה */}
          <div className="flex items-center gap-4 relative z-10 min-w-[120px] justify-end">
            <span className="text-sm text-slate-500 hidden md:inline">{user?.email || ''}</span>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-red-600 transition-colors"><LogOut className="w-4 h-4"/> יציאה</button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 border-t border-slate-100 bg-slate-50/50 relative z-10">
          <nav className="flex space-x-reverse space-x-1 sm:space-x-4 overflow-x-auto py-2">
            {[
              { id: 'dashboard', icon: Activity, label: 'דשבורד' },
              { id: 'finance', icon: Wallet, label: 'כספים' },
              { id: 'quotes', icon: FileText, label: 'הצעות מחיר' },
              { id: 'shipments', icon: Ship, label: 'משלוחים' },
              { id: 'inventory', icon: Package, label: 'ניהול מלאי' },
              { id: 'suppliers', icon: Building2, label: 'ספקים' },
              { id: 'models', icon: Layers, label: 'דגמים' },
              { id: 'customers', icon: Users, label: 'לקוחות' },
              { id: 'marketing', icon: Megaphone, label: 'קמפיינים' },
              { id: 'settings', icon: Settings, label: 'הגדרות' }
            ].map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${activeTab === t.id ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'}`}>
                <t.icon className="w-4 h-4" /> <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {/* --- TAB: DASHBOARD --- */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-slate-800">תמונת מצב בזמן אמת</h2>
              <button onClick={handleGetInsights} className="bg-gradient-to-l from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-2 rounded-lg font-medium shadow-md transition-all flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-300" />
                <span className="hidden sm:inline">יועץ עסקי AI ✨</span>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-5 rounded-lg shadow-md text-white flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-indigo-100">הכנסות חודש נוכחי</p>
                  <Wallet className="w-5 h-5 text-indigo-200"/>
                </div>
                <p className="text-3xl font-bold">₪{calculatedData.currentMonthIncome.toLocaleString()}</p>
                <p className="text-xs text-indigo-200 mt-2 flex items-center gap-1">לעומת חודש שעבר: ₪{calculatedData.lastMonthIncome.toLocaleString()}</p>
              </div>
              <div onClick={() => setIsStockBreakdownModalOpen(true)} className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 flex items-center gap-4 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all group">
                <div className="bg-indigo-100 p-3 rounded-full group-hover:bg-indigo-200 transition-colors"><Package className="text-indigo-600 w-6 h-6"/></div>
                <div>
                  <p className="text-sm text-slate-500 font-medium flex items-center gap-1.5">פריטים במלאי <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">פירוט</span></p>
                  <p className="text-2xl font-bold text-slate-800">{calculatedData.inWarehouseCount}</p>
                </div>
              </div>
              <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 flex items-center gap-4">
                <div className="bg-green-100 p-3 rounded-full"><DollarSign className="text-green-600 w-6 h-6"/></div>
                <div><p className="text-sm text-slate-500 font-medium">שווי מלאי (עלות Landed)</p><p className="text-2xl font-bold text-slate-800">₪{Math.round(calculatedData.totalInventoryValueILS).toLocaleString()}</p></div>
              </div>
              <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 flex items-center gap-4">
                <div className="bg-blue-100 p-3 rounded-full"><TrendingUp className="text-blue-600 w-6 h-6"/></div>
                <div><p className="text-sm text-slate-500 font-medium">רווח ממוצע לבר (נטו)</p><p className="text-2xl font-bold text-slate-800">₪{calculatedData.avgProfit.toLocaleString()}</p></div>
              </div>
            </div>

            <h3 className="text-xl font-bold text-slate-800 mt-8 mb-4 border-b pb-2 flex items-center gap-2"><Activity className="w-5 h-5 text-indigo-600"/> תחזית מלאי וצפי הזמנות</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {calculatedData.forecasts.map((f: any) => (
                <div key={f.model} className={`bg-white p-5 rounded-lg shadow-sm border ${f.daysLeft !== 0 && f.daysLeft < 30 ? 'border-red-300 bg-red-50' : 'border-slate-200'}`}>
                  <h4 className="font-bold text-lg text-slate-800">{f.model}</h4>
                  <div className="mt-3 space-y-2 text-sm">
                    <p className="flex justify-between items-center"><span className="text-slate-500">במלאי כרגע:</span> <span className="font-semibold text-base">{f.stock} יח'</span></p>
                    <p className="flex justify-between items-center"><span className="text-slate-500">מלאי בדרך:</span> <span className="font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{f.onTheWay} יח'</span></p>
                    <p className="flex justify-between items-center"><span className="text-slate-500">קצב מכירה (30 יום):</span> <span className="font-semibold">{f.sold30} יח'</span></p>
                    <div className="pt-3 mt-3 border-t border-slate-100">
                      <p className="text-slate-600 font-medium">המלאי (במחסן) יספיק ל-</p>
                      <p className={`text-xl font-bold ${f.daysLeft !== 0 && f.daysLeft < 30 ? 'text-red-600' : 'text-green-600'}`}>
                        {f.daysLeft === 'מעל חצי שנה' ? f.daysLeft : f.daysLeft > 0 ? `~${f.daysLeft} ימים` : 'נגמר/אין נתונים'}
                      </p>
                      {f.daysLeft !== 0 && f.daysLeft < 30 && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/> מומלץ להזמין</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ט - התראות אחריות */}
            {(() => {
              const todayMs = new Date().getTime();
              const warrantyAlerts = calculatedData.enrichedItems
                .filter((item: any) => item.status === 'sold' && item.warrantyMonths > 0 && item.saleDate)
                .map((item: any) => {
                  const expiry = new Date(item.saleDate);
                  expiry.setMonth(expiry.getMonth() + Number(item.warrantyMonths));
                  const daysLeft = Math.ceil((expiry.getTime() - todayMs) / (1000 * 60 * 60 * 24));
                  return { ...item, daysLeft, expiryDate: expiry };
                })
                .filter((item: any) => item.daysLeft <= 30)
                .sort((a: any, b: any) => a.daysLeft - b.daysLeft);

              if (warrantyAlerts.length === 0) return null;

              return (
                <div className="mt-8">
                  <h3 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5 text-amber-500"/> התראות אחריות ({warrantyAlerts.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {warrantyAlerts.map((item: any) => {
                      const customer = customers.find((c: any) => c.id === item.customerId);
                      const isExpired = item.daysLeft <= 0;
                      return (
                        <div key={item.id} className={`p-4 rounded-lg border flex items-start gap-3 ${isExpired ? 'bg-red-50 border-red-200' : item.daysLeft <= 7 ? 'bg-orange-50 border-orange-200' : 'bg-amber-50 border-amber-200'}`}>
                          <div className={`p-2 rounded-full shrink-0 ${isExpired ? 'bg-red-100' : 'bg-amber-100'}`}>
                            <ShieldAlert className={`w-4 h-4 ${isExpired ? 'text-red-600' : 'text-amber-600'}`}/>
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-sm truncate">{customer?.businessName || customer?.contactName || 'לקוח לא ידוע'}</p>
                            <p className="text-xs text-slate-600">דגם: {item.model}</p>
                            <p className={`text-xs font-bold mt-1 ${isExpired ? 'text-red-600' : item.daysLeft <= 7 ? 'text-orange-600' : 'text-amber-700'}`}>
                              {isExpired ? `פגה לפני ${Math.abs(item.daysLeft)} ימים` : `${item.daysLeft} ימים לפקיעה`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* --- TAB: FINANCE --- */}
        {activeTab === 'finance' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Banknote className="w-6 h-6 text-indigo-600"/> ניהול כספים ותזרים</h2>
              <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-slate-200 shadow-sm">
                <select className="bg-transparent font-bold text-slate-700 outline-none pr-2 border-l border-slate-200" value={financeMonth} onChange={e => setFinanceMonth(Number(e.target.value))}>
                  {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                     <option key={m} value={m}>חודש {m}</option>
                  ))}
                </select>
                <select className="bg-transparent font-bold text-slate-700 outline-none pl-2" value={financeYear} onChange={e => setFinanceYear(Number(e.target.value))}>
                  {[today.getFullYear()-1, today.getFullYear(), today.getFullYear()+1].map(y => <option key={y} value={y}>שנת {y}</option>)}
                </select>
              </div>
            </div>

            {/* Selected Month Summary */}
            <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2 mb-2">סיכום חודש {financeMonth}/{financeYear}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 border-t-4 border-t-green-500">
                <p className="text-sm text-slate-500 font-medium mb-1">הכנסות ממכירות</p>
                <p className="text-3xl font-bold text-green-600">₪{Math.round(calculatedData.selectedMonthData.income).toLocaleString()}</p>
              </div>
              <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 border-t-4 border-t-red-500">
                <p className="text-sm text-slate-500 font-medium mb-1 flex justify-between">
                  <span>הוצאות החודש</span>
                  <span className="text-[10px] bg-slate-100 px-1.5 rounded-full text-slate-400">כולל הכל</span>
                </p>
                <p className="text-3xl font-bold text-red-600">₪{Math.round(calculatedData.selectedMonthData.expense).toLocaleString()}</p>
                <div className="mt-3 text-xs text-slate-500 grid grid-cols-2 gap-1 pt-2 border-t border-slate-100">
                  <span>משלוחים (בהגעה): ₪{Math.round(calculatedData.selectedMonthData.breakdowns.shipping).toLocaleString()}</span>
                  <span>קמפיינים: ₪{Math.round(calculatedData.selectedMonthData.breakdowns.marketing).toLocaleString()}</span>
                  <span>רכש (מפעל+התקנות): ₪{Math.round(calculatedData.selectedMonthData.breakdowns.itemCosts).toLocaleString()}</span>
                  <span>הוצאות כלליות: ₪{Math.round(calculatedData.selectedMonthData.breakdowns.manual).toLocaleString()}</span>
                </div>
              </div>
              <div className={`bg-white p-5 rounded-lg shadow-sm border border-t-4 ${calculatedData.selectedMonthData.income - calculatedData.selectedMonthData.expense >= 0 ? 'border-green-200 border-t-green-500 bg-green-50/30' : 'border-red-200 border-t-red-500 bg-red-50/30'}`}>
                <p className="text-sm text-slate-500 font-medium mb-1">רווח נקי חודשי</p>
                <p className={`text-3xl font-bold ${calculatedData.selectedMonthData.income - calculatedData.selectedMonthData.expense >= 0 ? 'text-green-700' : 'text-red-700'}`}>₪{Math.round(calculatedData.selectedMonthData.income - calculatedData.selectedMonthData.expense).toLocaleString()}</p>
              </div>
            </div>

            {/* Yearly Table (Past months only) */}
            <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2 mb-2">דוח חודשי מצטבר (שנת {financeYear})</h3>
            <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-x-auto mb-8">
              <table className="min-w-full divide-y divide-slate-200 text-sm text-center">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-slate-500">חודש</th>
                    <th className="px-4 py-3 font-medium text-slate-500">הכנסות</th>
                    <th className="px-4 py-3 font-medium text-slate-500">הוצאות</th>
                    <th className="px-4 py-3 font-medium text-slate-500">רווח נקי</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {calculatedData.availableMonths.map((m: any) => {
                    const profit = m.income - m.expense;
                    const isSelected = m.month === financeMonth;
                    return (
                      <tr key={m.month} className={`hover:bg-slate-50 cursor-pointer ${isSelected ? 'bg-indigo-50/50' : ''}`} onClick={() => setFinanceMonth(m.month)}>
                        <td className={`px-4 py-3 font-bold ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}>{m.month < 10 ? `0${m.month}` : m.month}/{financeYear} {isSelected && '👈'}</td>
                        <td className="px-4 py-3 text-green-600 font-medium">₪{Math.round(m.income).toLocaleString()}</td>
                        <td className="px-4 py-3 text-red-600 font-medium">₪{Math.round(m.expense).toLocaleString()}</td>
                        <td className={`px-4 py-3 font-bold ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>₪{Math.round(profit).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                  {calculatedData.availableMonths.length === 0 && (
                     <tr><td colSpan={4} className="px-4 py-4 text-slate-500">אין נתונים להצגה בשנה זו.</td></tr>
                  )}
                  {calculatedData.availableMonths.length > 0 && (
                    <tr className="bg-slate-100 font-bold border-t-2 border-slate-200">
                      <td className="px-4 py-3 text-slate-800">סך הכל שנתי עד כה</td>
                      <td className="px-4 py-3 text-green-700">₪{Math.round(calculatedData.yearlyIncome).toLocaleString()}</td>
                      <td className="px-4 py-3 text-red-700">₪{Math.round(calculatedData.yearlyExpense).toLocaleString()}</td>
                      <td className={`px-4 py-3 ${calculatedData.yearlyIncome - calculatedData.yearlyExpense >= 0 ? 'text-green-800' : 'text-red-800'}`}>₪{Math.round(calculatedData.yearlyIncome - calculatedData.yearlyExpense).toLocaleString()}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Expenses List */}
            <div className="mt-8">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><TrendingDown className="w-5 h-5 text-red-500"/> פירוט הוצאות כלליות (ידניות)</h3>
                <button onClick={() => setIsExpenseModalOpen(true)} className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-1.5 hover:bg-indigo-200"><Plus className="w-4 h-4"/> הוסף הוצאה חדשה</button>
              </div>
              <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-right font-medium text-slate-500">תיאור ההוצאה</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-500">סכום</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-500">סוג</th>
                      <th className="px-4 py-3 text-right font-medium text-slate-500">תאריך התחלה</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-500">פעולות</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {expenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-800">{exp.title}</td>
                        <td className="px-4 py-3 text-slate-600 font-medium">₪{Number(exp.amount).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${exp.type === 'fixed' ? 'bg-blue-100 text-blue-800' : exp.type === 'variable' ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'}`}>
                            {exp.type === 'fixed' ? 'קבועה (חודשית)' : exp.type === 'variable' ? 'משתנה (חד פעמי)' : `תשלומים (${exp.installments})`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{new Date(exp.startDate).toLocaleDateString('he-IL')}</td>
                        <td className="px-4 py-3 text-left"><button onClick={() => deleteDocHandler('crm_expenses', exp.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button></td>
                      </tr>
                    ))}
                    {expenses.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">לא הוזנו הוצאות ידניות. (עלויות משלוחים, פריטים וקמפיינים מחושבות אוטומטית למעלה)</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: QUOTES --- */}
        {activeTab === 'quotes' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">מאגר הצעות מחיר</h2>
              <button 
                onClick={() => { 
                  setIsFabOpen(false); 
                  setQuoteData({ customerId: '', items: [{ model: modelsList[0] || '', qty: 1, price: 0, customNotes: '' }], shippingCost: 0, date: todayStr, campaignId: '', warrantyMonths: 0 }); 
                  setIsQuoteModalOpen(true); 
                }} 
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4"/> הצעת מחיר חדשה
              </button>
            </div>

            {/* י - פילטר סטטוס */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {[
                { val: 'all', label: `הכל (${quotes.length})` },
                { val: 'pending', label: `ממתינות (${quotes.filter(q=>q.status==='pending'||!q.status).length})` },
                { val: 'approved', label: `אושרו עם מלאי (${quotes.filter(q=>q.status==='approved').length})` },
                { val: 'approved_no_stock', label: `אושרו ללא מלאי (${quotes.filter(q=>q.status==='approved_no_stock').length})` },
                { val: 'rejected', label: `נדחו (${quotes.filter(q=>q.status==='rejected').length})` },
              ].map(f => (
                <button
                  key={f.val}
                  onClick={() => setQuoteStatusFilter(f.val)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${quoteStatusFilter === f.val ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            
            <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">תאריך</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">לקוח</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">סה"כ לתשלום</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">סטטוס</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {quotes
                    .filter(q => quoteStatusFilter === 'all' || (quoteStatusFilter === 'pending' ? (!q.status || q.status === 'pending') : q.status === quoteStatusFilter))
                    .map(q => {
                    const customer = customers.find(c => c.id === q.customerId) || { name: 'לקוח נמחק' };
                    const itemsTotal = q.items.reduce((sum: number, item: any) => sum + (Number(item.price) * Number(item.qty)), 0);
                    const grandTotal = itemsTotal + Number(q.shippingCost || 0);
                    
                    return (
                      <tr key={q.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4 text-slate-600">{new Date(q.date).toLocaleDateString('he-IL')}</td>
                        <td className="px-4 py-4 font-bold text-slate-800">{customer.businessName || customer.contactName || customer.name}</td>
                        <td className="px-4 py-4 font-bold text-indigo-700">₪{(grandTotal * 1.18).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">(כולל מע"מ)</span></td>
                        <td className="px-4 py-4">
                          <select 
                            className={`text-xs font-bold rounded-md border p-1.5 shadow-sm cursor-pointer ${q.status === 'approved' ? 'bg-green-100 text-green-800 border-green-300' : q.status === 'approved_no_stock' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : q.status === 'rejected' ? 'bg-red-100 text-red-800 border-red-300' : 'bg-orange-100 text-orange-800 border-orange-300'}`} 
                            value={q.status ? q.status : 'pending'} 
                            onChange={(e) => handleQuoteStatusChange(q, e.target.value)}
                          >
                            <option value="pending">ממתינה לאישור</option>
                            <option value="approved">מאושרת (יגרא מלאי)</option>
                            <option value="approved_no_stock">מאושרת (ללא גריעת מלאי)</option>
                            <option value="rejected">נדחתה</option>
                          </select>
                        </td>
                        <td className="px-4 py-4 text-left flex items-center justify-end gap-2">
                          <button onClick={() => { setSelectedQuote({...q, customerInfo: customer}); setIsQuoteOverviewOpen(true); }} className="text-slate-400 hover:text-indigo-600 p-1.5" title="מבט כולל"><Eye className="w-5 h-5"/></button>
                          <button onClick={() => deleteDocHandler('crm_quotes', q.id)} className="text-slate-400 hover:text-red-500 p-1.5"><Trash2 className="w-5 h-5"/></button>
                        </td>
                      </tr>
                    );
                  })}
                  {quotes.filter(q => quoteStatusFilter === 'all' || (quoteStatusFilter === 'pending' ? (!q.status || q.status === 'pending') : q.status === quoteStatusFilter)).length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">{quoteStatusFilter !== 'all' ? 'אין הצעות מחיר בסטטוס זה.' : 'לא נמצאו הצעות מחיר במערכת.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB: SUPPLIERS --- */}
        {activeTab === 'suppliers' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><Building2 className="w-6 h-6 text-indigo-600"/> ספקים מסין</h2>
              <button onClick={() => { setSupplierEditingData({ name: '', contactName: '', whatsapp: '', wechat: '', email: '', city: '', notes: '', catalog: [] }); setIsSupplierModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2">
                <Plus className="w-4 h-4"/> הוסף ספק
              </button>
            </div>

            {/* השוואת מחירים לפי דגם */}
            {(() => {
              const modelToSuppliers: any = {};
              suppliers.forEach((s: any) => {
                (s.catalog || []).forEach((c: any) => {
                  if (!modelToSuppliers[c.model]) modelToSuppliers[c.model] = [];
                  modelToSuppliers[c.model].push({ supplierName: s.name, supplierId: s.id, unitCostUSD: Number(c.unitCostUSD) });
                });
              });
              const modelsWithMultiple = Object.entries(modelToSuppliers).filter(([, sups]: any) => sups.length > 1);
              if (modelsWithMultiple.length === 0) return null;
              return (
                <div className="mb-6 bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                  <h3 className="font-bold text-slate-700 mb-3 flex items-center gap-2"><BarChart2 className="w-5 h-5 text-indigo-500"/> השוואת מחירים בין ספקים</h3>
                  <div className="space-y-3">
                    {modelsWithMultiple.map(([model, sups]: any) => {
                      const sorted = [...sups].sort((a,b) => a.unitCostUSD - b.unitCostUSD);
                      const cheapest = sorted[0].unitCostUSD;
                      return (
                        <div key={model} className="bg-slate-50 rounded-lg p-3">
                          <p className="font-bold text-slate-700 text-sm mb-2">דגם {model}</p>
                          <div className="flex flex-wrap gap-2">
                            {sorted.map((sup: any) => {
                              const isCheapest = sup.unitCostUSD === cheapest;
                              const diff = cheapest > 0 ? ((sup.unitCostUSD - cheapest) / cheapest * 100).toFixed(1) : '0';
                              return (
                                <div key={sup.supplierId} className={`px-3 py-1.5 rounded-md text-xs font-medium border ${isCheapest ? 'bg-green-100 border-green-300 text-green-800' : 'bg-white border-slate-200 text-slate-700'}`}>
                                  {sup.supplierName}: ${sup.unitCostUSD}
                                  {!isCheapest && <span className="text-red-500 mr-1"> (+{diff}%)</span>}
                                  {isCheapest && <span className="mr-1"> ✓ זול יותר</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* כרטיסי ספקים */}
            {suppliers.length === 0 ? (
              <div className="bg-white p-12 rounded-lg border border-slate-200 text-center text-slate-400">
                <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20"/>
                <p className="font-medium text-lg">אין ספקים במערכת עדיין</p>
                <p className="text-sm mt-1">הוסף את הספקים שלך כדי לעקוב אחרי הזמנות ומחירים.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {suppliers.map((s: any) => {
                  const stats = calculatedData.supplierStats?.[s.id] || { totalPaidUSD: 0, totalPaidILS: 0, orderCount: 0, models: [], avgLeadTimeDays: null, priceHistory: {} };
                  // בדיקת עליות מחיר
                  const priceAlerts = Object.entries(stats.priceHistory || {}).filter(([, history]: any) => {
                    if (history.length < 2) return false;
                    const last = history[history.length - 1].unitCostUSD;
                    const prev = history[history.length - 2].unitCostUSD;
                    return last > prev;
                  });

                  return (
                    <div key={s.id} className="bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                      <div className="p-5 cursor-pointer" onClick={() => { setSelectedSupplier(s); setActiveSupplierTab('details'); setIsSupplierOverviewOpen(true); }}>
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-3">
                            <div className="bg-indigo-100 p-2.5 rounded-full"><Building2 className="w-5 h-5 text-indigo-600"/></div>
                            <div>
                              <h3 className="font-bold text-slate-800">{s.name}</h3>
                              {s.contactName && <p className="text-xs text-slate-500">{s.contactName}</p>}
                              {s.city && <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3"/> {s.city}</p>}
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={e => { e.stopPropagation(); setSupplierEditingData(s); setIsSupplierModalOpen(true); }} className="text-slate-400 hover:text-indigo-600 p-1"><Edit className="w-4 h-4"/></button>
                            <button onClick={e => { e.stopPropagation(); deleteDocHandler('crm_suppliers', s.id); }} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4"/></button>
                          </div>
                        </div>

                        {/* מודלים שמספק */}
                        {stats.models.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-3">
                            {stats.models.map((m: string) => <span key={m} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-medium">{m}</span>)}
                          </div>
                        )}

                        {/* התראת עלייה במחיר */}
                        {priceAlerts.length > 0 && (
                          <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-3 text-xs text-amber-700 flex items-center gap-1.5">
                            <ArrowUpRight className="w-3.5 h-3.5 shrink-0"/>
                            עלייה במחיר: {priceAlerts.map(([model]) => model).join(', ')}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-100 text-center">
                          <div>
                            <p className="text-xs text-slate-400">סה"כ שולם</p>
                            <p className="font-bold text-slate-800 text-sm">${Math.round(stats.totalPaidUSD).toLocaleString()}</p>
                            <p className="text-[10px] text-slate-400">₪{Math.round(stats.totalPaidILS).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">הזמנות</p>
                            <p className="font-bold text-slate-800 text-sm">{stats.orderCount}</p>
                            {stats.avgLeadTimeDays && <p className="text-[10px] text-slate-400">~{stats.avgLeadTimeDays} ימי ייצור</p>}
                          </div>
                        </div>
                      </div>

                      {/* כפתורי קשר */}
                      <div className="px-5 pb-4 flex gap-2 flex-wrap">
                        {s.whatsapp && (
                          <a href={`https://wa.me/${s.whatsapp.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener noreferrer"
                             className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-md py-1.5 hover:bg-green-100 transition-colors"
                             onClick={e => e.stopPropagation()}>
                            <ExternalLink className="w-3.5 h-3.5"/> WhatsApp
                          </a>
                        )}
                        {s.wechat && (
                          <div className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 rounded-md py-1.5">
                            WeChat: {s.wechat}
                          </div>
                        )}
                        {s.catalogFileUrl && (
                          <a href={s.catalogFileUrl} target="_blank" rel="noopener noreferrer"
                             className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-md py-1.5 hover:bg-indigo-100 transition-colors"
                             onClick={e => e.stopPropagation()}>
                            <FileText className="w-3.5 h-3.5"/> קטלוג
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- TAB: MODELS --- */}
        {activeTab === 'models' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">ניהול דגמי מוצרים ותמונות</h2>
            <div className="bg-white p-6 border border-slate-200 rounded-lg shadow-sm">
              <form onSubmit={handleAddModel} className="flex gap-4 items-end mb-8 border-b pb-8">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">שם הדגם החדש</label>
                  <input type="text" required value={newModelName} onChange={e => setNewModelName(e.target.value)} className="w-full border-slate-300 rounded-md shadow-sm p-2 border" placeholder="לדוגמה: Premium Bar" />
                </div>
                <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-md font-medium hover:bg-indigo-700">הוסף דגם</button>
              </form>
              
              <h3 className="font-bold text-slate-700 mb-4">דגמים קיימים במערכת</h3>
              <div className="space-y-6">
                {modelsList.map(model => {
                  const modelCbm = settings.models?.[model]?.cbm || '';
                  const itemImgUrl = settings.models?.[model]?.itemImgUrl || '';
                  const blueprintUrl = settings.models?.[model]?.blueprintUrl || '';
                  
                  return (
                  <div key={model} className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-lg text-slate-800">{model}</h4>
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <label className="text-sm font-medium text-slate-600">ספק ראשי:</label>
                              <select
                                className="text-sm border border-slate-300 rounded p-1.5 bg-white focus:ring-indigo-500"
                                value={settings.models?.[model]?.supplierId || ''}
                                onChange={e => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], supplierId: e.target.value }}})}
                              >
                                <option value="">— לא שויך —</option>
                                {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                            <div className="flex items-center gap-2">
                                <label className="text-sm font-medium text-slate-600">CBM:</label>
                                <input type="number" step="0.01" min="0" className="w-20 p-1.5 text-center border border-slate-300 rounded focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white" value={settings.models?.[model]?.cbm || ''} onChange={(e) => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], cbm: Number(e.target.value) } } })}/>
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <ModelAssetUploader 
                          label="העלה תמונת הדמיה" 
                          icon={ImageIcon} 
                          imageUrl={itemImgUrl} 
                          onUpload={(e: any) => handleImageUpload(e, (base64) => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], itemImgUrl: base64 } } }))} 
                          onRemove={() => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], itemImgUrl: '' } } })}
                        />
                        <ModelAssetUploader 
                          label="העלה סרטוט טכני" 
                          icon={FileText} 
                          imageUrl={blueprintUrl} 
                          onUpload={(e: any) => handleImageUpload(e, (base64) => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], blueprintUrl: base64 } } }))} 
                          onRemove={() => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], blueprintUrl: '' } } })}
                        />
                    </div>
                  </div>
                )})}
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={saveSettings} className="bg-green-600 text-white px-8 py-2.5 rounded-md font-bold hover:bg-green-700 shadow-md">שמור הגדרות (לוגו ודגמים)</button>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: SHIPMENTS --- */}
        {activeTab === 'shipments' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">ניהול משלוחים מסין</h2>
              <button 
                onClick={() => { 
                  setEditingData({ name: '', date: new Date().toISOString().split('T')[0], status: 'ordered', exchangeRate: 3.7, shippingCostUSD: 0, shippingCostILS: 0, totalCbm: 0, lines: [{model: modelsList[0] || '', qty: 1, unitCostUSD: 0}] }); 
                  setIsShipmentModalOpen(true); 
                }} 
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4"/> הוסף משלוח חדש
              </button>
            </div>
            <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">שם משלוח ותאריך</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">סטטוס משלוח</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">תאריך הגעה</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">תשלום למפעל</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">עלות שילוח כוללת</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {shipments.map(s => {
                    const shippingTotalILS = (Number(s.shippingCostUSD) * Number(s.exchangeRate)) + Number(s.shippingCostILS);
                    const factoryTotalUSD = s.lines ? s.lines.reduce((acc: number, l: any) => acc + (Number(l.qty)*Number(l.unitCostUSD)), 0) : 0;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3"><div className="font-bold text-slate-800">{s.name}</div><div className="text-xs text-slate-500">{new Date(s.date).toLocaleDateString('he-IL')}</div></td>
                        <td className="px-4 py-3">
                          <select className={`text-xs font-bold rounded-md border-slate-300 p-1.5 shadow-sm ${s.status === 'in_warehouse' ? 'bg-green-50 text-green-700' : 'bg-white'}`} value={s.status ? s.status : 'ordered'} onChange={(e) => handleShipmentStatusSelect(s, e.target.value)}>
                            {Object.entries(SHIPMENT_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{s.arrivalDate ? new Date(s.arrivalDate).toLocaleDateString('he-IL') : '---'}</td>
                        <td className="px-4 py-3 text-slate-600"><div className="font-medium">${factoryTotalUSD.toLocaleString()}</div><div className="text-xs">(₪{(factoryTotalUSD * Number(s.exchangeRate)).toLocaleString()})</div></td>
                        <td className="px-4 py-3 text-slate-600"><div className="font-medium text-indigo-700">₪{shippingTotalILS.toLocaleString()}</div></td>
                        <td className="px-4 py-3 text-left">
                          <button onClick={() => { setEditingData(s); setIsShipmentModalOpen(true); }} className="text-indigo-600 bg-indigo-50 p-1.5 rounded ml-2"><Edit className="w-4 h-4"/></button>
                          <button onClick={() => deleteDocHandler('crm_shipments', s.id)} className="text-red-500 bg-red-50 p-1.5 rounded"><Trash2 className="w-4 h-4"/></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB: INVENTORY --- */}
        {activeTab === 'inventory' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">ניהול מלאי (תצוגה מקובצת)</h2>
            </div>
            <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">דגם</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">משלוח (מקור)</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">סטטוס וזמן מדף</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">סה"כ כמות</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">פירוט פריטים</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {calculatedData.groupedInventory.map((group: any) => (
                    <React.Fragment key={group.id}>
                      <tr className={`hover:bg-slate-50 cursor-pointer ${expandedGroups[group.id] ? 'bg-indigo-50/30' : ''}`} onClick={() => setExpandedGroups(p => ({ ...p, [group.id]: !p[group.id] }))}>
                        <td className="px-4 py-4 font-bold text-slate-800 text-base">{group.model}</td>
                        <td className="px-4 py-4 text-slate-600"><div>{group.shipmentName}</div>{group.arrivalDate && <div className="text-xs text-slate-400">הגיע: {new Date(group.arrivalDate).toLocaleDateString('he-IL')}</div>}</td>
                        <td className="px-4 py-4"><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[group.status]}`}>{STATUS_MAP[group.status]}</span></td>
                        <td className="px-4 py-4 font-bold text-indigo-700 text-lg">{group.qty} יח'</td>
                        <td className="px-4 py-4 text-left"><button className="text-indigo-600 p-1.5 rounded-full">{expandedGroups[group.id] ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}</button></td>
                      </tr>
                      {expandedGroups[group.id] && (
                        <tr className="bg-slate-50">
                          <td colSpan={5} className="px-4 py-4 border-b border-slate-200">
                            <div className="bg-white border border-slate-200 rounded-md shadow-sm overflow-x-auto">
                              <table className="min-w-full divide-y divide-slate-100 text-xs whitespace-nowrap">
                                <thead className="bg-slate-100 text-slate-500">
                                  <tr>
                                    <th className="px-3 py-2 text-right">סריאל/הערה</th>
                                    <th className="px-3 py-2 text-right">עלות (Landed)</th>
                                    <th className="px-3 py-2 text-right">התאמות</th>
                                    <th className="px-3 py-2 text-right">מכירה ורווח</th>
                                    <th className="px-3 py-2 text-right">לקוח ואחריות</th>
                                    <th className="px-3 py-2 text-left">ערוך</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.items.map((item: any) => (
                                    <tr key={item.id} className="hover:bg-slate-50 border-t border-slate-100">
                                      <td className="px-3 py-2 font-medium text-slate-700">{item.serialNumber || '-'}</td>
                                      <td className="px-3 py-2">₪{Math.round(item.totalLandedCost).toLocaleString()}</td>
                                      <td className="px-3 py-2 text-orange-600">{(item.repairCost > 0 || item.addOnCost > 0) ? `₪${(Number(item.repairCost)+Number(item.addOnCost)).toLocaleString()}` : '-'}</td>
                                      <td className="px-3 py-2">{item.status === 'sold' ? (<div className="font-bold text-slate-800">₪{Math.round(item.totalRevenue).toLocaleString()}<span className={`block text-[10px] ${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>רווח: ₪{Math.round(item.profit).toLocaleString()}</span></div>) : '-'}</td>
                                      <td className="px-3 py-2">
                                        {item.status === 'sold' ? (
                                          <div>
                                            <span className="font-medium text-indigo-700">{item.customerName}</span>
                                            {item.warrantyMonths > 0 ? (
                                              item.isWarrantyActive ? (
                                                <div className="flex items-center gap-1 text-[10px] text-green-600 mt-0.5"><ShieldCheck className="w-3 h-3"/> באחריות (עוד {item.warrantyDaysLeft} ימים)</div>
                                              ) : (
                                                <div className="flex items-center gap-1 text-[10px] text-red-500 mt-0.5"><ShieldAlert className="w-3 h-3"/> אחריות פגה</div>
                                              )
                                            ) : (
                                              <div className="text-[10px] text-slate-400 mt-0.5">ללא אחריות</div>
                                            )}
                                          </div>
                                        ) : '-'}
                                      </td>
                                      <td className="px-3 py-2 text-left">
                                        <button 
                                          onClick={(e) => { 
                                            e.stopPropagation(); 
                                            setEditingData({...item, isGlobalSale: false}); 
                                            setIsItemModalOpen(true); 
                                          }} 
                                          className="text-indigo-600 bg-indigo-50 p-1 rounded"
                                        >
                                          <Edit className="w-3.5 h-3.5"/>
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB: CUSTOMERS --- */}
        {activeTab === 'customers' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">ניהול לקוחות ולידים</h2>
              <button 
                onClick={() => { 
                  setShowQuickImport(false); 
                  setQuickImportText(''); 
                  setCustomerEditingData({ contactName: '', phone: '', businessName: '', companyName: '', businessType: 'bar', hp: '', email: '', address: '', status: 'lead', notes: '' }); 
                  setIsCustomerModalOpen(true); 
                }} 
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4"/> הוסף לקוח / ליד חדש
              </button>
            </div>

            {/* י - שורת חיפוש */}
            <div className="mb-4 relative">
              <input
                type="text"
                placeholder="חיפוש לפי שם, טלפון, אימייל..."
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 pr-10 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              />
              {customerSearch && (
                <button onClick={() => setCustomerSearch('')} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4"/>
                </button>
              )}
            </div>

            {/* Sub-navigation for Customers / Leads */}
            <div className="flex gap-4 mb-6 border-b border-slate-200">
              <button 
                onClick={() => setActiveCustomerTab('customers')} 
                className={`pb-2 font-medium text-sm transition-colors ${activeCustomerTab === 'customers' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                לקוחות פעילים ועבר
              </button>
              <button 
                onClick={() => setActiveCustomerTab('leads')} 
                className={`pb-2 font-medium text-sm transition-colors ${activeCustomerTab === 'leads' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                לידים מתעניינים
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customers
                .filter(c => activeCustomerTab === 'leads' ? c.status === 'lead' : c.status !== 'lead')
                .filter(c => {
                  if (!customerSearch.trim()) return true;
                  const q = customerSearch.toLowerCase();
                  return (
                    (c.businessName || '').toLowerCase().includes(q) ||
                    (c.contactName || '').toLowerCase().includes(q) ||
                    (c.phone || '').includes(q) ||
                    (c.email || '').toLowerCase().includes(q) ||
                    (c.companyName || '').toLowerCase().includes(q)
                  );
                })
                .map(c => {
                const stat = calculatedData.customerStats[c.id];
                const todayMs2 = new Date().getTime();
                // יא: לקוח "עבר" חזותי - פעיל אבל אין לו אחריות פעילה ואין רכישות ב-6 חודשים אחרונים
                const customerSoldItems = calculatedData.enrichedItems?.filter((i: any) => i.customerId === c.id && i.status === 'sold') || [];
                const hasActiveWarranty = customerSoldItems.some((i: any) => {
                  if (!i.warrantyMonths || !i.saleDate) return false;
                  const exp = new Date(i.saleDate); exp.setMonth(exp.getMonth() + Number(i.warrantyMonths));
                  return exp.getTime() > todayMs2;
                });
                const isEffectivelyPast = c.status === 'active' && !hasActiveWarranty && customerSoldItems.length > 0;
                const isActiveCustomer = c.status === 'active' && (hasActiveWarranty || customerSoldItems.length > 0);
                const displayStatus = c.status === 'lead' ? 'ליד מתעניין' : isEffectivelyPast ? 'לקוח עבר (אחריות פגה)' : isActiveCustomer ? (hasActiveWarranty ? 'לקוח פעיל (באחריות)' : 'לקוח פעיל') : 'לקוח עבר';
                const badgeColor = c.status === 'lead' ? 'bg-blue-100 text-blue-700' : isEffectivelyPast ? 'bg-slate-100 text-slate-500' : isActiveCustomer ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600';
                
                return (
                  <div key={c.id} className="bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col h-full cursor-pointer relative" onClick={(e) => {
                    if ((e.target as HTMLElement).closest('.customer-actions')) return;
                    setSelectedCustomer(c);
                    setActiveCustomerOverviewTab('log');
                    setIsCustomerOverviewOpen(true);
                  }}>
                    <div className="p-5 flex-1">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${isActiveCustomer ? 'bg-green-100 text-green-700' : c.status === 'lead' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            <User className="w-5 h-5"/>
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-slate-800">{c.businessName || c.contactName}</h3>
                            {c.businessName && c.contactName && <p className="text-xs text-slate-500 mb-1">{c.contactName}</p>}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${badgeColor}`}>
                              {displayStatus}
                            </span>
                            {c.businessType && <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                              {c.businessType === 'bar' ? 'בר' : c.businessType === 'restaurant' ? 'מסעדה' : c.businessType === 'event_hall' ? 'אולם אירועים' : 'אחר'}
                            </span>}
                          </div>
                        </div>
                        <div className="flex gap-1 customer-actions">
                          <button 
                            onClick={() => { 
                              setQuoteData({ customerId: c.id, items: [{ model: modelsList[0] || '', qty: 1, price: 0, customNotes: '' }], shippingCost: 0, date: todayStr, campaignId: '', warrantyMonths: 0 }); 
                              setIsQuoteModalOpen(true); 
                            }} 
                            className="text-slate-400 hover:text-green-600 p-1" 
                            title="הפק הצעת מחיר"
                          >
                            <FileText className="w-4 h-4"/>
                          </button>
                          <button 
                            onClick={() => { 
                              setShowQuickImport(false); 
                              setQuickImportText(''); 
                              setCustomerEditingData(c); 
                              setIsCustomerModalOpen(true); 
                            }} 
                            className="text-slate-400 hover:text-indigo-600 p-1"
                          >
                            <Edit className="w-4 h-4"/>
                          </button>
                          <button onClick={() => deleteDocHandler('crm_customers', c.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mt-4 text-sm text-slate-600">
                        {c.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400"/> <a href={`tel:${c.phone}`} className="hover:text-indigo-600 hover:underline">{c.phone}</a></div>}
                        {c.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400"/> {c.email}</div>}
                        <div className="flex items-center justify-between text-xs mt-3 pt-3 border-t border-slate-100">
                          <span className="text-slate-400">התעניינות: <span className="font-medium text-slate-600">{stat ? stat.interestDate : ''}</span></span>
                          <span className="text-slate-400">קשר אחרון: <span className="font-medium text-indigo-600">{stat ? stat.lastContactDate : ''}</span></span>
                        </div>
                      </div>
                    </div>
                    
                    {activeCustomerTab === 'customers' && (
                      <div className="bg-slate-50 p-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-center rounded-b-lg mt-auto relative">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">רכישות</p>
                          <p className="font-bold text-slate-800">{stat ? stat.itemCount : 0} ברים</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">סה"כ הכנסה</p>
                          <p className="font-bold text-indigo-700">₪{stat ? stat.totalRevenue.toLocaleString() : 0}</p>
                        </div>
                        {(stat && stat.activeWarranties > 0) && (
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-100 border border-green-200 text-green-700 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold shadow-sm">
                                <ShieldCheck className="w-3 h-3" /> {stat.activeWarranties} באחריות
                            </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {customers.filter(c => activeCustomerTab === 'leads' ? c.status === 'lead' : c.status !== 'lead').filter(c => { if (!customerSearch.trim()) return true; const q = customerSearch.toLowerCase(); return (c.businessName||'').toLowerCase().includes(q)||(c.contactName||'').toLowerCase().includes(q)||(c.phone||'').includes(q)||(c.email||'').toLowerCase().includes(q); }).length === 0 && (
                <div className="col-span-full bg-white p-8 rounded-lg border border-slate-200 text-center text-slate-500">
                  <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="font-medium text-lg">{customerSearch ? `לא נמצאו תוצאות עבור "${customerSearch}"` : 'אין נתונים להצגה ברשימה זו.'}</p>
                  <p className="text-sm">{customerSearch ? 'נסה לחפש במילות מפתח אחרות.' : 'הוסף איש קשר חדש כדי להתחיל.'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- TAB: MARKETING --- */}
        {activeTab === 'marketing' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">מעקב קמפיינים שיווקיים</h2>
              <button 
                onClick={() => { 
                  setEditingData({ name: '', totalCost: 0, startDate: new Date().toISOString().split('T')[0], endDate: '' }); 
                  setIsCampaignModalOpen(true); 
                }} 
                className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"
              >
                <Plus className="w-4 h-4"/> הוסף קמפיין
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {campaigns.map(c => {
                const stat = calculatedData.campaignStats[c.id];
                const costPerItem = (stat && stat.itemCount > 0) ? stat.cost / stat.itemCount : 0;
                const isActive = (!c.startDate || c.startDate <= new Date().toISOString().split('T')[0]) && (!c.endDate || c.endDate >= new Date().toISOString().split('T')[0]);
                return (
                  <div key={c.id} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">{c.name} {isActive ? <span className="bg-green-100 text-green-800 text-[10px] px-2 py-0.5 rounded-full font-bold">פעיל</span> : <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-0.5 rounded-full font-bold">הסתיים</span>}</h3>
                        {(c.startDate || c.endDate) && <div className="text-xs text-slate-500 mt-1">{c.startDate ? new Date(c.startDate).toLocaleDateString('he-IL') : '---'} - {c.endDate ? new Date(c.endDate).toLocaleDateString('he-IL') : '---'}</div>}
                      </div>
                      <button onClick={() => deleteDocHandler('crm_campaigns', c.id)} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">עלות קמפיין:</span> <span className="font-medium">₪{Number(c.totalCost).toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">ברים שנמכרו:</span> <span className="font-medium">{stat ? stat.itemCount : 0} יח'</span></div>
                      <div className="pt-2 mt-2 border-t border-slate-100 flex justify-between items-center"><span className="text-slate-500 font-medium">עלות לבר:</span> <span className="font-bold text-indigo-700 text-lg">₪{Math.round(costPerItem).toLocaleString()}</span></div>
                      <button onClick={() => handleGenerateAd(c.name)} className="mt-4 w-full border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 py-2 rounded-md font-medium text-xs flex justify-center items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> צור מודעת שיווק AI ✨</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* --- TAB: SETTINGS --- */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-6">
            
            {/* Logo Settings */}
            <div className="bg-white p-6 border border-slate-200 rounded-lg shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-indigo-600"/> לוגו החברה למסמכים (PDF)</h2>
              <div className="mb-4">
                <label className="block text-sm font-bold text-slate-700 mb-2">העלה לוגו מהמחשב או הטלפון</label>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={(e) => handleImageUpload(e, (base64) => setSettings({...settings, companyLogoUrl: base64}))} 
                  className="block w-full text-sm text-slate-500 file:me-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded-md p-1" 
                />
              </div>
              {(settings && settings.companyLogoUrl) && (
                <div className="mt-4 border border-dashed border-slate-300 p-4 rounded-lg flex flex-col items-center bg-slate-50 relative">
                  <img src={settings.companyLogoUrl} alt="לוגו חברה" className="max-h-24 object-contain"/>
                  <button onClick={() => setSettings({...settings, companyLogoUrl: ''})} className="mt-3 text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1"><Trash2 className="w-3 h-3"/> הסר לוגו</button>
                </div>
              )}
            </div>

            {/* Finbot Integration Settings */}
            <div className="bg-white p-6 border border-slate-200 rounded-lg shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-1 flex items-center gap-2">
                <ExternalLink className="w-5 h-5 text-indigo-600"/> חיבור ל-Finbot
              </h2>
              <p className="text-sm text-slate-500 mb-4">מפתח ה-API ישמש להנפקת דרישת תשלום אוטומטית ב-Finbot בעת אישור הצעת מחיר.</p>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">מפתח API של Finbot</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    dir="ltr"
                    className="flex-1 border-slate-300 rounded-md p-2.5 border font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="הדבק כאן את ה-API Key"
                    value={settings?.finbotApiKey || ''}
                    onChange={e => setSettings({...settings, finbotApiKey: e.target.value})}
                  />
                  <button
                    onClick={async () => {
                      try {
                        await setDoc(doc(db, 'crm_settings', 'general_settings'), { ...settings }, { merge: true });
                        alert('✓ מפתח ה-API נשמר בהצלחה ב-Firebase.');
                      } catch { alert('שגיאה בשמירת המפתח.'); }
                    }}
                    className="bg-indigo-600 text-white px-4 py-2.5 rounded-md text-sm font-bold hover:bg-indigo-700 whitespace-nowrap"
                  >
                    שמור
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1.5">Finbot: הגדרות עסק ← מפתח API להפקת הכנסות. המפתח נשמר ב-Firebase בלבד.</p>
              </div>
              {settings?.finbotApiKey && (
                <div className="mt-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  <CheckCircle className="w-3.5 h-3.5 shrink-0"/> מפתח API מוגדר — הנפקת דרישות תשלום פעילה
                </div>
              )}
            </div>

            {/* DANGER ZONE FOR RESET */}
            <div className="bg-red-50 p-6 border border-red-200 rounded-lg shadow-sm mt-8">
              <h2 className="text-xl font-bold text-red-800 mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-600"/> אזור סכנה: ניקוי שולחן (איפוס נתונים)</h2>
              <p className="text-sm text-red-600 mb-4 font-medium">כפתור זה ימחק את <strong>כל</strong> המשלוחים, הפריטים במלאי, הקמפיינים וההוצאות שקיימים במערכת בלחיצה אחת. (רשימת הדגמים שלך לא תימחק).</p>
              <button onClick={handleResetSystem} disabled={isSaving} className="w-full bg-red-600 text-white py-2.5 rounded-md font-medium hover:bg-red-700 transition-colors">
                {isSaving ? 'מוחק נתונים, אנא המתן...' : 'מחק את כל הנתונים (איפוס מערכת)'}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* --- GLOBAL FLOATING ACTION BUTTON (FAB) --- */}
      <div className="fixed bottom-6 left-6 z-40 flex flex-col-reverse items-center gap-3">
        <button onClick={() => setIsFabOpen(!isFabOpen)} className="bg-indigo-600 text-white p-4 rounded-full shadow-xl hover:bg-indigo-700 transition-transform transform hover:scale-105 active:scale-95 flex items-center justify-center">
          <Plus className={`w-6 h-6 transition-transform duration-300 ${isFabOpen ? 'rotate-45' : ''}`} />
        </button>
        
        {isFabOpen && (
          <div className="flex flex-col gap-3 items-end absolute bottom-16 left-0 animate-in slide-in-from-bottom-5">
            <FabButton 
               icon={ShoppingCart} iconColor="text-green-600" label="מכירה חדשה (עדכון מלאי)"
               onClick={() => { 
                setIsFabOpen(false); 
                setEditingData({ isGlobalSale: true, status: 'sold', saleDate: new Date().toISOString().split('T')[0], warrantyMonths: 0, model: calculatedData.availableModelsInStock[0] || '', salePrice: 0, addOnPrice: 0, repairCost: 0, addOnCost: 0, campaignId: '', customerId: '' }); 
                setIsItemModalOpen(true); 
              }} 
            />
            <FabButton 
               icon={UserPlus} iconColor="text-purple-600" label="הוספת לקוח / ליד"
               onClick={() => { 
                setIsFabOpen(false); setShowQuickImport(false); setQuickImportText(''); 
                setCustomerEditingData({ contactName: '', phone: '', businessName: '', companyName: '', businessType: 'bar', hp: '', email: '', address: '', status: 'lead', notes: '' }); 
                setIsCustomerModalOpen(true); 
              }} 
            />
            <FabButton 
               icon={FileText} iconColor="text-blue-500" label="הצעת מחיר חדשה"
               onClick={() => { 
                setIsFabOpen(false); 
                setQuoteData({ customerId: '', items: [{ model: modelsList[0] || '', qty: 1, price: 0, customNotes: '' }], shippingCost: 0, date: todayStr, campaignId: '', warrantyMonths: 0 }); 
                setIsQuoteModalOpen(true); 
              }} 
            />
            <FabButton 
               icon={Receipt} iconColor="text-red-500" label="הוספת הוצאה חדשה"
               onClick={() => { 
                setIsFabOpen(false); 
                setExpenseData({ title: '', amount: 0, type: 'variable', startDate: new Date().toISOString().split('T')[0], installments: 1 }); 
                setIsExpenseModalOpen(true); 
              }} 
            />
            <FabButton 
               icon={PlusCircle} iconColor="text-blue-600" label="הוספת דגם חדש (CBM)"
               onClick={() => { 
                setIsFabOpen(false); setNewModelData({name:'', cbm:0}); setIsModelModalOpen(true); 
              }} 
            />
            <FabButton 
               icon={Megaphone} iconColor="text-orange-600" label="קמפיין חדש"
               onClick={() => { 
                setIsFabOpen(false); 
                setEditingData({ name: '', totalCost: 0, startDate: new Date().toISOString().split('T')[0], endDate: '' }); 
                setIsCampaignModalOpen(true); 
              }} 
            />
          </div>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* ITEM SALE/EDIT MODAL */}
      {isItemModalOpen && editingData && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-xl">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-green-600"/>
                {editingData.isGlobalSale ? 'מכירה חדשה (גריעת מלאי)' : 'עריכת פריט'}
              </h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={saveItem} className="p-6 overflow-y-auto flex-1 space-y-4">
              {editingData.isGlobalSale ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">בחר דגם למכירה <span className="text-red-500">*</span></label>
                    <select required className="w-full border-slate-300 rounded-md p-2.5 border bg-slate-50" value={editingData.model || ''} onChange={e => setEditingData({...editingData, model: e.target.value})}>
                      {calculatedData.availableModelsInStock.length === 0 && <option value="">אין דגמים במלאי</option>}
                      {calculatedData.availableModelsInStock.map((m: string) => (
                        <option key={m} value={m}>{m} ({calculatedData.stockInWarehouse[m]} במלאי)</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">תאריך מכירה</label>
                      <input type="date" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.saleDate || ''} onChange={e => setEditingData({...editingData, saleDate: e.target.value})} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">חודשי אחריות</label>
                      <input type="number" min="0" max="60" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.warrantyMonths || 0} onChange={e => setEditingData({...editingData, warrantyMonths: Number(e.target.value)})} />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">דגם</label>
                      <input type="text" readOnly className="w-full border-slate-300 rounded-md p-2.5 border bg-slate-100 text-slate-600" value={editingData.model || ''} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">סטטוס</label>
                      <select className="w-full border-slate-300 rounded-md p-2.5 border bg-slate-50 font-bold" value={editingData.status || 'in_warehouse'} onChange={e => setEditingData({...editingData, status: e.target.value})}>
                        {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">מספר סריאלי / הערה</label>
                    <input type="text" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.serialNumber || ''} onChange={e => setEditingData({...editingData, serialNumber: e.target.value})} placeholder="S/N או הערה מזהה" />
                  </div>
                  {editingData.status === 'sold' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">תאריך מכירה</label>
                        <input type="date" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.saleDate || ''} onChange={e => setEditingData({...editingData, saleDate: e.target.value})} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">חודשי אחריות</label>
                        <input type="number" min="0" max="60" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.warrantyMonths || 0} onChange={e => setEditingData({...editingData, warrantyMonths: Number(e.target.value)})} />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="border-t border-slate-200 pt-4 mt-2">
                <h4 className="font-bold text-slate-700 mb-3 text-sm">פרטי מכירה ועלויות</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">מחיר מכירה (₪)</label>
                    <input type="number" min="0" step="0.01" className="w-full border-slate-300 rounded-md p-2.5 border bg-green-50 text-green-700 font-bold" value={editingData.salePrice || 0} onChange={e => setEditingData({...editingData, salePrice: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">תוספות (₪ הכנסה)</label>
                    <input type="number" min="0" step="0.01" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.addOnPrice || 0} onChange={e => setEditingData({...editingData, addOnPrice: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">עלות תיקונים (₪)</label>
                    <input type="number" min="0" step="0.01" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.repairCost || 0} onChange={e => setEditingData({...editingData, repairCost: Number(e.target.value)})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">עלות תוספות (₪)</label>
                    <input type="number" min="0" step="0.01" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.addOnCost || 0} onChange={e => setEditingData({...editingData, addOnCost: Number(e.target.value)})} />
                  </div>
                </div>
              </div>

              {(editingData.isGlobalSale || editingData.status === 'sold') && (
                <div className="border-t border-slate-200 pt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">שיוך ללקוח</label>
                    <div className="flex gap-2">
                      <select className="flex-1 border-slate-300 rounded-md p-2.5 border bg-slate-50" value={editingData.customerId || ''} onChange={e => setEditingData({...editingData, customerId: e.target.value})}>
                        <option value="">ללא שיוך לקוח</option>
                        {customers.map((c: any) => <option key={c.id} value={c.id}>{c.businessName || c.contactName} {c.phone ? `- ${c.phone}` : ''}</option>)}
                      </select>
                      <button type="button" onClick={() => { setShowQuickImport(false); setQuickImportText(''); setCustomerEditingData({ contactName: '', phone: '', businessName: '', companyName: '', businessType: 'bar', hp: '', email: '', address: '', status: 'active', notes: '' }); setIsCustomerModalOpen(true); }} className="bg-indigo-100 text-indigo-700 px-3 rounded-md text-sm font-bold hover:bg-indigo-200 whitespace-nowrap"><UserPlus className="w-4 h-4"/></button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">שיוך לקמפיין שיווקי</label>
                    <select className="w-full border-slate-300 rounded-md p-2.5 border bg-slate-50" value={editingData.campaignId || ''} onChange={e => setEditingData({...editingData, campaignId: e.target.value})}>
                      <option value="">ללא שיוך</option>
                      {campaigns.filter((c: any) => { const isStarted = !c.startDate || c.startDate <= todayStr; const isNotTooOld = !c.endDate || c.endDate >= thirtyDaysAgoStr; return isStarted && isNotTooOld; }).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-6 pt-4 border-t">
                <button type="submit" disabled={isSaving} className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-bold shadow-md hover:bg-green-700 disabled:opacity-50">{isSaving ? 'שומר...' : editingData.isGlobalSale ? 'בצע מכירה וגרא מהמלאי' : 'שמור שינויים'}</button>
                <button type="button" onClick={() => setIsItemModalOpen(false)} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SHIPMENT ADD/EDIT MODAL */}
      {isShipmentModalOpen && editingData && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-xl">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Ship className="w-5 h-5 text-indigo-600"/> {editingData.id ? 'עריכת משלוח' : 'משלוח חדש מסין'}</h3>
              <button onClick={() => setIsShipmentModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={saveShipment} className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שם המשלוח <span className="text-red-500">*</span></label>
                  <input required type="text" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.name || ''} onChange={e => setEditingData({...editingData, name: e.target.value})} placeholder="לדוגמה: משלוח ינואר 2025" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">תאריך הזמנה</label>
                  <input type="date" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.date || ''} onChange={e => setEditingData({...editingData, date: e.target.value})} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">שער דולר (₪)</label>
                  <input type="number" step="0.01" min="0" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.exchangeRate || 3.7} onChange={e => setEditingData({...editingData, exchangeRate: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">עלות שילוח ($)</label>
                  <input type="number" step="0.01" min="0" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.shippingCostUSD || 0} onChange={e => setEditingData({...editingData, shippingCostUSD: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">עלות שילוח (₪)</label>
                  <input type="number" step="0.01" min="0" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.shippingCostILS || 0} onChange={e => setEditingData({...editingData, shippingCostILS: Number(e.target.value)})} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">סה"כ CBM של המשלוח</label>
                <input type="number" step="0.01" min="0" className="w-full border-slate-300 rounded-md p-2.5 border" value={editingData.totalCbm || 0} onChange={e => setEditingData({...editingData, totalCbm: Number(e.target.value)})} />
              </div>
              <div className="border-t border-slate-200 pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-slate-700">שורות פריטים במשלוח</h4>
                  <button type="button" onClick={() => setEditingData({...editingData, lines: [...(editingData.lines || []), { model: modelsList[0] || '', qty: 1, unitCostUSD: 0 }]})} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-200">+ הוסף שורה</button>
                </div>
                {(editingData.lines || []).map((line: any, idx: number) => (
                  <div key={idx} className="flex gap-2 items-end mb-3 bg-slate-50 p-3 rounded-lg border border-slate-200 relative">
                    {editingData.lines.length > 1 && <button type="button" onClick={() => { const newLines = editingData.lines.filter((_: any, i: number) => i !== idx); setEditingData({...editingData, lines: newLines}); }} className="absolute top-2 left-2 text-red-500 hover:text-red-700"><X className="w-4 h-4"/></button>}
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-600 mb-1">דגם</label>
                      <select className="w-full border-slate-300 rounded p-2 text-sm border" value={line.model} onChange={e => { const newLines = [...editingData.lines]; newLines[idx] = {...newLines[idx], model: e.target.value}; setEditingData({...editingData, lines: newLines}); }}>
                        {modelsList.map((m: string) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div className="w-20">
                      <label className="block text-xs font-bold text-slate-600 mb-1">כמות</label>
                      <input type="number" min="1" className="w-full border-slate-300 rounded p-2 text-sm border font-bold" value={line.qty} onChange={e => { const newLines = [...editingData.lines]; newLines[idx] = {...newLines[idx], qty: Number(e.target.value)}; setEditingData({...editingData, lines: newLines}); }} />
                    </div>
                    <div className="w-28">
                      <label className="block text-xs font-bold text-slate-600 mb-1">עלות יחידה ($)</label>
                      <input type="number" min="0" step="0.01" className="w-full border-slate-300 rounded p-2 text-sm border" value={line.unitCostUSD} onChange={e => { const newLines = [...editingData.lines]; newLines[idx] = {...newLines[idx], unitCostUSD: Number(e.target.value)}; setEditingData({...editingData, lines: newLines}); }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-6 pt-4 border-t">
                <button type="submit" disabled={isSaving} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50">{isSaving ? 'שומר...' : editingData.id ? 'עדכן משלוח' : 'צור משלוח חדש'}</button>
                <button type="button" onClick={() => setIsShipmentModalOpen(false)} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CAMPAIGN ADD/EDIT MODAL */}
      {isCampaignModalOpen && editingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2"><Megaphone className="w-5 h-5 text-orange-600"/> {editingData.id ? 'עריכת קמפיין' : 'קמפיין שיווקי חדש'}</h3>
            <form onSubmit={saveCampaign} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">שם הקמפיין <span className="text-red-500">*</span></label><input required type="text" className="border border-slate-300 p-2 rounded w-full" value={editingData.name || ''} onChange={e => setEditingData({...editingData, name: e.target.value})} placeholder="לדוגמה: קמפיין אינסטגרם קיץ" /></div>
              <div><label className="block text-sm font-medium mb-1">עלות כוללת (₪)</label><input type="number" min="0" step="0.01" className="border border-slate-300 p-2 rounded w-full" value={editingData.totalCost || 0} onChange={e => setEditingData({...editingData, totalCost: Number(e.target.value)})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium mb-1">תאריך התחלה</label><input type="date" className="border border-slate-300 p-2 rounded w-full" value={editingData.startDate || ''} onChange={e => setEditingData({...editingData, startDate: e.target.value})} /></div>
                <div><label className="block text-sm font-medium mb-1">תאריך סיום</label><input type="date" className="border border-slate-300 p-2 rounded w-full" value={editingData.endDate || ''} onChange={e => setEditingData({...editingData, endDate: e.target.value})} /></div>
              </div>
              <div className="flex gap-2 mt-6 pt-4 border-t">
                <button type="submit" disabled={isSaving} className="bg-orange-600 text-white p-2 rounded flex-1 font-bold disabled:opacity-50">{isSaving ? 'שומר...' : 'שמור קמפיין'}</button>
                <button type="button" onClick={() => setIsCampaignModalOpen(false)} className="bg-slate-200 text-slate-700 p-2 rounded px-4 font-medium">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD MODEL MODAL (from FAB) */}
      {isModelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-600"/> הוספת דגם חדש</h3>
            <form onSubmit={handleAddNewModelWithData} className="space-y-4">
              <div><label className="block text-sm font-medium mb-1">שם הדגם <span className="text-red-500">*</span></label><input required type="text" className="border border-slate-300 p-2 rounded w-full" value={newModelData.name} onChange={e => setNewModelData({...newModelData, name: e.target.value})} placeholder="לדוגמה: Premium Bar" /></div>
              <div><label className="block text-sm font-medium mb-1">CBM (נפח ליחידה)</label><input type="number" min="0" step="0.01" className="border border-slate-300 p-2 rounded w-full" value={newModelData.cbm} onChange={e => setNewModelData({...newModelData, cbm: Number(e.target.value)})} /></div>
              <div className="flex gap-2 mt-6 pt-4 border-t">
                <button type="submit" disabled={isSaving} className="bg-blue-600 text-white p-2 rounded flex-1 font-bold disabled:opacity-50">{isSaving ? 'שומר...' : 'הוסף דגם'}</button>
                <button type="button" onClick={() => setIsModelModalOpen(false)} className="bg-slate-200 text-slate-700 p-2 rounded px-4 font-medium">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOMER ADD/EDIT MODAL */}
      {isCustomerModalOpen && customerEditingData && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white rounded-t-xl z-10">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600"/> 
                {customerEditingData.id ? 'עריכת פרטי לקוח/ליד' : 'הוספת לקוח / ליד חדש'}
              </h3>
              <button onClick={() => setIsCustomerModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {/* Quick Import */}
              <div className="mb-6 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100">
                <div className="flex justify-between items-center mb-2">
                  <label className="text-sm font-bold text-indigo-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-yellow-500"/> יבוא מהיר מוואטסאפ / טקסט חופשי</label>
                  <button type="button" onClick={() => setShowQuickImport(!showQuickImport)} className="text-xs text-indigo-600 bg-white border border-indigo-200 px-2 py-1 rounded shadow-sm hover:bg-indigo-50 transition-colors font-medium">
                    {showQuickImport ? 'סגור יבוא חכם' : 'פתח יבוא חכם'}
                  </button>
                </div>
                {showQuickImport && (
                  <div className="mt-3 space-y-3 animate-in fade-in zoom-in duration-200">
                    <p className="text-xs text-indigo-700">הדבק כאן את הטקסט או ההודעה מוואטסאפ, והמערכת תנסה לחלץ את הפרטים אוטומטית לשדות המתאימים מטה.</p>
                    <textarea className="w-full border border-indigo-200 rounded p-2 text-sm focus:ring-2 focus:ring-indigo-500 min-h-[100px] outline-none" placeholder="הדבק הודעת וואטסאפ או טקסט כאן..." value={quickImportText} onChange={e => setQuickImportText(e.target.value)}></textarea>
                    <button type="button" onClick={processQuickImport} className="w-full bg-indigo-600 text-white font-bold py-2 rounded shadow-sm hover:bg-indigo-700 transition-colors">חלץ נתונים לשדות</button>
                  </div>
                )}
              </div>

              <form id="customerForm" onSubmit={saveCustomer} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">שם איש קשר</label><input type="text" className="w-full border-slate-300 rounded-md p-2.5 bg-slate-50 border focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={customerEditingData.contactName || ''} onChange={e => setCustomerEditingData({...customerEditingData, contactName: e.target.value})} placeholder="לדוגמה: משה כהן"/></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">שם העסק / מסעדה / בר <span className="text-red-500">*</span></label><input required type="text" className="w-full border-slate-300 rounded-md p-2.5 bg-slate-50 border focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={customerEditingData.businessName || ''} onChange={e => setCustomerEditingData({...customerEditingData, businessName: e.target.value})} placeholder="לדוגמה: הבר של משה"/></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">שם חברה משפטית (אופציונלי)</label><input type="text" className="w-full border-slate-300 rounded-md p-2.5 bg-slate-50 border focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={customerEditingData.companyName || ''} onChange={e => setCustomerEditingData({...customerEditingData, companyName: e.target.value})} placeholder="לדוגמה: משה השקעות בע״מ"/></div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">סוג עסק</label>
                    <select className="w-full border-slate-300 rounded-md p-2.5 bg-slate-50 border focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={customerEditingData.businessType || 'bar'} onChange={e => setCustomerEditingData({...customerEditingData, businessType: e.target.value})}>
                      <option value="bar">בר</option>
                      <option value="restaurant">מסעדה</option>
                      <option value="event_hall">אולם אירועים</option>
                      <option value="other">אחר / פרטי</option>
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">ח.פ. / עוסק מורשה</label><input type="text" className="w-full border-slate-300 rounded-md p-2.5 bg-slate-50 border focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={customerEditingData.hp || ''} onChange={e => setCustomerEditingData({...customerEditingData, hp: e.target.value})} placeholder="מספר ח.פ / ת.ז"/></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">אימייל</label><input type="email" className="w-full border-slate-300 rounded-md p-2.5 bg-slate-50 border focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-left" dir="ltr" value={customerEditingData.email || ''} onChange={e => setCustomerEditingData({...customerEditingData, email: e.target.value})} placeholder="email@example.com"/></div>
                  <div><label className="block text-sm font-medium text-slate-700 mb-1">טלפון נייד <span className="text-red-500">*</span></label><input required type="tel" className="w-full border-slate-300 rounded-md p-2.5 bg-slate-50 border focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-left" dir="ltr" value={customerEditingData.phone || ''} onChange={e => setCustomerEditingData({...customerEditingData, phone: e.target.value})} placeholder="050-0000000"/></div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">סטטוס</label>
                    <select className="w-full border-slate-300 rounded-md p-2.5 bg-slate-50 border focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-bold" value={customerEditingData.status || 'lead'} onChange={e => setCustomerEditingData({...customerEditingData, status: e.target.value})}>
                      <option value="lead">ליד (מתעניין)</option>
                      <option value="active">לקוח פעיל (רוכש)</option>
                      <option value="inactive">לקוח עבר (לא פעיל)</option>
                    </select>
                  </div>
                  <div className="md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">כתובת מלאה</label><input type="text" className="w-full border-slate-300 rounded-md p-2.5 bg-slate-50 border focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none" value={customerEditingData.address || ''} onChange={e => setCustomerEditingData({...customerEditingData, address: e.target.value})} placeholder="רחוב, מספר, עיר..."/></div>
                  <div className="md:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">הערות בסיסיות (לא יומן)</label><textarea className="w-full border-slate-300 rounded-md p-2.5 bg-slate-50 border focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none min-h-[80px]" value={customerEditingData.notes || ''} onChange={e => setCustomerEditingData({...customerEditingData, notes: e.target.value})} placeholder="הערות קבועות שחשוב לדעת על הלקוח..."></textarea></div>
                </div>
              </form>
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-3 bg-slate-50 rounded-b-xl shrink-0">
              <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors">ביטול</button>
              <button type="submit" form="customerForm" disabled={isSaving} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {isSaving ? 'שומר במערכת...' : 'שמור פרטי לקוח'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW EXPENSE MODAL */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2"><Receipt className="w-5 h-5 text-red-600"/> תיעוד הוצאה חדשה</h3>
             <form onSubmit={saveExpense} className="space-y-4">
                <div><label className="block text-sm font-medium mb-1">תיאור ההוצאה</label><input required type="text" className="border border-slate-300 p-2 rounded w-full" value={expenseData.title} onChange={e => setExpenseData({...expenseData, title: e.target.value})} placeholder="לדוגמה: פרסום, ציוד, משכורת..." /></div>
                <div><label className="block text-sm font-medium mb-1">סכום ההוצאה הכולל (₪)</label><input required type="number" min="0" step="0.01" className="border border-slate-300 p-2 rounded w-full bg-red-50 text-red-700 font-bold" value={expenseData.amount} onChange={e => setExpenseData({...expenseData, amount: Number(e.target.value)})} /></div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">סוג ההוצאה</label>
                  <select className="border border-slate-300 p-2 rounded w-full bg-white" value={expenseData.type} onChange={e => setExpenseData({...expenseData, type: e.target.value})}>
                    <option value="variable">משתנה (חד פעמית בחודש הנוכחי)</option>
                    <option value="fixed">קבועה (חוזרת כל חודש מעתה והלאה)</option>
                    <option value="installment">תשלומים (סכום שיחולק למספר חודשים)</option>
                  </select>
                </div>

                {expenseData.type === 'installment' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">מספר תשלומים (חודשים)</label>
                    <input required type="number" min="2" max="36" className="border border-slate-300 p-2 rounded w-full" value={expenseData.installments} onChange={e => setExpenseData({...expenseData, installments: Number(e.target.value)})} />
                    <p className="text-[10px] text-slate-500 mt-1">הסכום שהזנת (₪{expenseData.amount}) יחולק שווה בשווה על פני {expenseData.installments} חודשים.</p>
                  </div>
                )}

                <div><label className="block text-sm font-medium mb-1">תאריך הוצאה / תחילת תשלומים</label><input type="date" required className="border border-slate-300 p-2 rounded w-full" value={expenseData.startDate} onChange={e => setExpenseData({...expenseData, startDate: e.target.value})} /></div>
                
                <div className="flex gap-2 mt-6 pt-4 border-t"><button type="submit" disabled={isSaving} className="bg-red-600 text-white p-2 rounded flex-1 font-bold disabled:opacity-50">שמור הוצאה</button><button type="button" onClick={()=>setIsExpenseModalOpen(false)} className="bg-slate-200 text-slate-700 p-2 rounded px-4 font-medium">ביטול</button></div>
             </form>
          </div>
        </div>
      )}

      {/* QUOTE OVERVIEW MODAL */}
      {isQuoteOverviewOpen && selectedQuote && (() => {
        const itemsTotal = selectedQuote.items.reduce((sum: number, item: any) => sum + (Number(item.price) * Number(item.qty)), 0);
        const grandTotal = (itemsTotal + Number(selectedQuote.shippingCost || 0)) * 1.18;
        const campaign = campaigns.find(c => c.id === selectedQuote.campaignId);

        return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Eye className="w-5 h-5 text-indigo-600"/> צפייה והיסטוריית הצעת מחיר</h3>
                <button onClick={() => setIsQuoteOverviewOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
              </div>
              <div className="p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-indigo-900">
                      {(selectedQuote.customerInfo && selectedQuote.customerInfo.businessName) ? selectedQuote.customerInfo.businessName : ((selectedQuote.customerInfo && selectedQuote.customerInfo.contactName) ? selectedQuote.customerInfo.contactName : 'לקוח כללי')}
                    </h2>
                    <p className="text-slate-500 text-sm">הופק בתאריך: {new Date(selectedQuote.date).toLocaleDateString('he-IL')}</p>
                    {campaign && <span className="inline-block mt-2 bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded font-medium">מקור הגעה: קמפיין {campaign.name}</span>}
                  </div>
                  <div className="text-left">
                     <div className="text-3xl font-black text-indigo-700 mb-1">₪{Math.round(grandTotal).toLocaleString()}</div>
                     <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${selectedQuote.status === 'approved' || selectedQuote.status === 'approved_no_stock' ? 'bg-green-100 text-green-800' : selectedQuote.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                       סטטוס נוכחי: {QUOTE_STATUS_MAP[selectedQuote.status ? selectedQuote.status : 'pending']}
                     </span>
                  </div>
                </div>

                <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-100">
                      <tr>
                        <th className="px-4 py-3 text-right font-medium text-slate-500">דגם</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500">כמות</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500">מחיר יחידה</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500">הערות/תוספות</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedQuote.items.map((item: any, idx: number) => (
                        <tr key={idx} className="bg-white">
                          <td className="px-4 py-3 font-bold text-slate-700">{item.model}</td>
                          <td className="px-4 py-3">{item.qty} יח'</td>
                          <td className="px-4 py-3 font-medium">₪{Number(item.price).toLocaleString()}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-pre-wrap">{item.customNotes || '---'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 text-left">
                  <p className="text-sm text-slate-600 mb-1">עלות משלוח מוערכת: ₪{Number(selectedQuote.shippingCost || 0).toLocaleString()}</p>
                </div>

                {/* PDF Preview Area (Using Reusable Component) */}
                <div className="mt-8 w-full bg-slate-800 p-4 sm:p-8 flex justify-center items-start rounded-lg overflow-x-auto">
                  <QuoteDocument quote={selectedQuote} customer={selectedQuote.customerInfo || {}} settings={settings} />
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* CUSTOMER OVERVIEW MODAL (Timeline & Details) */}
      {isCustomerOverviewOpen && selectedCustomer && (() => {
        const customerItems = calculatedData.enrichedItems
          ? calculatedData.enrichedItems.filter((i: any) => i.customerId === selectedCustomer.id && i.status === 'sold')
          : items.filter(i => i.customerId === selectedCustomer.id && i.status === 'sold');
        const customerQuotes = quotes.filter(q => q.customerId === selectedCustomer.id);
        const todayMs = new Date().getTime();

        return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><User className="w-5 h-5 text-indigo-600"/> תיק לקוח / ליד</h3>
              <button onClick={() => setIsCustomerOverviewOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="flex-1 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
              {/* Left Sidebar: Customer Details + Warranty */}
              <div className="w-full md:w-[280px] border-b md:border-b-0 md:border-l border-slate-200 bg-slate-50 p-5 md:overflow-y-auto shrink-0 space-y-5">
                <div>
                  <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3 shadow-inner">
                    <Users className="w-7 h-7"/>
                  </div>
                  <h2 className="text-lg font-bold text-center text-slate-800">{selectedCustomer.businessName || selectedCustomer.contactName}</h2>
                  {selectedCustomer.companyName && <p className="text-center text-xs text-slate-500 mb-2">{selectedCustomer.companyName}</p>}
                  <div className="flex justify-center">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${selectedCustomer.status === 'lead' ? 'bg-blue-100 text-blue-700' : selectedCustomer.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}`}>
                      {selectedCustomer.status === 'lead' ? 'ליד מתעניין' : selectedCustomer.status === 'active' ? 'לקוח פעיל' : 'לקוח עבר'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-2 text-slate-600"><Phone className="w-4 h-4 text-slate-400 shrink-0"/> <a href={`tel:${selectedCustomer.phone}`} className="hover:text-indigo-600">{selectedCustomer.phone || '---'}</a></div>
                  <div className="flex items-center gap-2 text-slate-600"><Mail className="w-4 h-4 text-slate-400 shrink-0"/> <span className="truncate">{selectedCustomer.email || '---'}</span></div>
                  <div className="flex items-center gap-2 text-slate-600"><MapPin className="w-4 h-4 text-slate-400 shrink-0"/> <span className="text-xs">{selectedCustomer.address || '---'}</span></div>
                </div>

                <div className="pt-4 border-t border-slate-200 space-y-3 text-xs">
                  <div>
                    <p className="text-slate-400 font-medium">תאריך יצירת ליד</p>
                    <p className="font-bold text-slate-700 flex items-center gap-1 mt-0.5"><CalendarDays className="w-3.5 h-3.5 text-indigo-400"/> {calculatedData.customerStats?.[selectedCustomer.id]?.interestDate || '---'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-medium">קשר אחרון</p>
                    <p className="font-bold text-slate-700 flex items-center gap-1 mt-0.5"><Activity className="w-3.5 h-3.5 text-blue-400"/> {calculatedData.customerStats?.[selectedCustomer.id]?.lastContactDate || '---'}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 font-medium">סה"כ רכישות</p>
                    <p className="font-bold text-indigo-700 text-sm mt-0.5">{customerItems.length} פריטים · ₪{(calculatedData.customerStats?.[selectedCustomer.id]?.totalRevenue || 0).toLocaleString()}</p>
                  </div>
                </div>

                {/* ה - ספירת אחריות לאחור */}
                {customerItems.length > 0 && (
                  <div className="pt-4 border-t border-slate-200">
                    <p className="text-xs text-slate-400 font-medium mb-2 flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5"/> סטטוס אחריות</p>
                    <div className="space-y-2">
                      {customerItems.map((item: any) => {
                        if (!item.warrantyMonths || item.warrantyMonths === 0) return (
                          <div key={item.id} className="bg-white border border-slate-200 rounded p-2 text-xs">
                            <span className="font-medium text-slate-700">{item.model}</span>
                            <span className="text-slate-400 block">ללא אחריות</span>
                          </div>
                        );
                        const saleDate = new Date(item.saleDate);
                        const expiryDate = new Date(saleDate);
                        expiryDate.setMonth(expiryDate.getMonth() + Number(item.warrantyMonths));
                        const daysLeft = Math.ceil((expiryDate.getTime() - todayMs) / (1000 * 60 * 60 * 24));
                        const isActive = daysLeft > 0;
                        const isExpiringSoon = isActive && daysLeft <= 30;
                        return (
                          <div key={item.id} className={`border rounded p-2 text-xs ${isActive ? (isExpiringSoon ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200') : 'bg-red-50 border-red-200'}`}>
                            <span className="font-medium text-slate-700">{item.model}</span>
                            {isActive ? (
                              <div className={`flex items-center gap-1 mt-0.5 font-bold ${isExpiringSoon ? 'text-amber-700' : 'text-green-700'}`}>
                                <ShieldCheck className="w-3 h-3"/>
                                {daysLeft >= 30 ? `${Math.floor(daysLeft/30)} חודשים ו-${daysLeft%30} ימים` : `${daysLeft} ימים`} נותרו
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 mt-0.5 font-bold text-red-600">
                                <ShieldAlert className="w-3 h-3"/> פגה ב-{expiryDate.toLocaleDateString('he-IL')}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-200">
                  <p className="text-xs text-slate-400 mb-1 font-medium">הערות בסיס</p>
                  <p className="text-xs text-slate-700 whitespace-pre-wrap bg-white p-2 rounded border border-slate-200 min-h-[60px]">{selectedCustomer.notes || 'אין הערות בסיס'}</p>
                </div>
              </div>

              {/* Right Panel: Tabs */}
              <div className="flex-1 flex flex-col bg-white min-w-0">
                {/* Tab Bar */}
                <div className="flex border-b border-slate-200 bg-slate-50/50 shrink-0">
                  {[
                    { id: 'log', label: 'יומן התקשרויות', icon: MessageSquare },
                    { id: 'purchases', label: `רכישות (${customerItems.length})`, icon: ShoppingCart },
                    { id: 'quotes', label: `הצעות מחיר (${customerQuotes.length})`, icon: FileText }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveCustomerOverviewTab(tab.id as any)}
                      className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeCustomerOverviewTab === tab.id ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                      <tab.icon className="w-4 h-4"/> {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab: יומן */}
                {activeCustomerOverviewTab === 'log' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 p-5 space-y-4 md:overflow-y-auto">
                      {(!selectedCustomer.interactionLogs || selectedCustomer.interactionLogs.length === 0) ? (
                        <div className="text-center text-slate-400 py-12">
                          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                          <p>אין עדיין תיעוד התקשרויות.</p>
                        </div>
                      ) : (
                        <div className="relative border-r-2 border-indigo-100 pr-4 ml-2 space-y-5">
                          {[...selectedCustomer.interactionLogs].reverse().map((log: any, idx: number) => (
                            <div key={idx} className="relative">
                              <div className="absolute -right-[23px] top-1 w-3 h-3 bg-indigo-500 rounded-full border-4 border-white shadow-sm"></div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs font-bold text-slate-500">{new Date(log.date).toLocaleString('he-IL')}</span>
                                  <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">{log.user || 'משתמש מערכת'}</span>
                                </div>
                                <p className="text-sm text-slate-800 whitespace-pre-wrap">{log.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0">
                      <textarea className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" rows={3} placeholder="תאר את פרטי השיחה, מה הלקוח ביקש, מתי לחזור אליו..." value={newNoteText} onChange={e => setNewNoteText(e.target.value)}></textarea>
                      <div className="flex justify-end mt-2">
                        <button onClick={addInteractionNote} disabled={!newNoteText.trim() || isSaving} className="bg-indigo-600 text-white px-6 py-2 rounded-md font-bold hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
                          {isSaving ? 'שומר...' : 'שמור הערה ועדכן תאריך'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab: ו - רכישות */}
                {activeCustomerOverviewTab === 'purchases' && (
                  <div className="flex-1 p-5 md:overflow-y-auto">
                    {customerItems.length === 0 ? (
                      <div className="text-center text-slate-400 py-12">
                        <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                        <p>לא בוצעו רכישות עדיין.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {customerItems.map((item: any) => {
                          const saleDate = item.saleDate ? new Date(item.saleDate) : null;
                          const expiryDate = saleDate && item.warrantyMonths ? (() => { const d = new Date(saleDate); d.setMonth(d.getMonth() + Number(item.warrantyMonths)); return d; })() : null;
                          const daysLeft = expiryDate ? Math.ceil((expiryDate.getTime() - todayMs) / (1000 * 60 * 60 * 24)) : null;
                          const isWarrantyActive = daysLeft !== null && daysLeft > 0;
                          return (
                            <div key={item.id} className="bg-white border border-slate-200 rounded-lg p-4 flex justify-between items-start">
                              <div>
                                <p className="font-bold text-slate-800">{item.model}</p>
                                <p className="text-xs text-slate-500 mt-0.5">תאריך מכירה: {saleDate ? saleDate.toLocaleDateString('he-IL') : '---'}</p>
                                {item.warrantyMonths > 0 && (
                                  <div className={`flex items-center gap-1 text-xs mt-1 font-medium ${isWarrantyActive ? (daysLeft! <= 30 ? 'text-amber-600' : 'text-green-600') : 'text-red-500'}`}>
                                    {isWarrantyActive ? <ShieldCheck className="w-3.5 h-3.5"/> : <ShieldAlert className="w-3.5 h-3.5"/>}
                                    {isWarrantyActive ? (daysLeft! >= 30 ? `${Math.floor(daysLeft!/30)} חודשים ו-${daysLeft!%30} ימים לפקיעה` : `${daysLeft} ימים לפקיעה`) : `פגה ${expiryDate?.toLocaleDateString('he-IL')}`}
                                    {' '} ({item.warrantyMonths} חודשי אחריות)
                                  </div>
                                )}
                                {item.serialNumber && <p className="text-xs text-slate-400 mt-0.5">סריאל: {item.serialNumber}</p>}
                              </div>
                              <div className="text-left shrink-0 ml-4">
                                <p className="font-bold text-indigo-700">₪{Math.round(item.totalRevenue || item.salePrice || 0).toLocaleString()}</p>
                                <p className="text-xs text-green-600">רווח: ₪{Math.round(item.profit || 0).toLocaleString()}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: ז - הצעות מחיר */}
                {activeCustomerOverviewTab === 'quotes' && (
                  <div className="flex-1 p-5 md:overflow-y-auto">
                    {customerQuotes.length === 0 ? (
                      <div className="text-center text-slate-400 py-12">
                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                        <p>לא נשלחו הצעות מחיר ללקוח זה.</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {customerQuotes.map((q: any) => {
                          const total = (q.items || []).reduce((s: number, i: any) => s + (Number(i.price) * Number(i.qty)), 0) + Number(q.shippingCost || 0);
                          const statusLabel = QUOTE_STATUS_MAP[q.status] || q.status;
                          const statusColor = q.status === 'approved' ? 'bg-green-100 text-green-700' : q.status === 'approved_no_stock' ? 'bg-yellow-100 text-yellow-700' : q.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
                          return (
                            <div key={q.id} className="bg-white border border-slate-200 rounded-lg p-4">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="text-xs text-slate-400">{q.date ? new Date(q.date).toLocaleDateString('he-IL') : '---'}</p>
                                  <p className="text-sm text-slate-700 mt-1">{(q.items || []).map((i: any) => `${i.model} ×${i.qty}`).join(', ')}</p>
                                </div>
                                <div className="text-left shrink-0 ml-3">
                                  <p className="font-bold text-indigo-700">₪{Math.round(total).toLocaleString()}</p>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusColor}`}>{statusLabel}</span>
                                </div>
                              </div>
                              <button
                                onClick={() => { setSelectedQuote({...q, customerInfo: selectedCustomer}); setIsQuoteOverviewOpen(true); }}
                                className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                              >
                                <Eye className="w-3.5 h-3.5"/> צפה בהצעה
                              </button>
                              {q.finbotInvoiceUrl && (
                                <a href={q.finbotInvoiceUrl} target="_blank" rel="noopener noreferrer"
                                   className="mt-1 text-xs text-green-700 hover:text-green-900 font-medium flex items-center gap-1">
                                  <ExternalLink className="w-3.5 h-3.5"/> פתח דרישת תשלום ב-Finbot
                                </a>
                              )}
                              {q.status === 'approved' && !q.finbotInvoiceUrl && settings?.finbotApiKey && (
                                <div className="mt-2 space-y-1">
                                  {q.finbotError && (
                                    <div className="bg-red-50 border border-red-200 rounded p-2 text-[10px] text-red-700 font-mono leading-relaxed">
                                      <span className="font-bold block mb-0.5">שגיאת Finbot:</span>
                                      {q.finbotError}
                                    </div>
                                  )}
                                  <button
                                    onClick={() => retryFinbot(q, selectedCustomer)}
                                    className="text-xs text-amber-700 hover:text-amber-900 font-medium flex items-center gap-1 bg-amber-50 border border-amber-200 rounded px-2 py-1"
                                  >
                                    <ArrowUpRight className="w-3.5 h-3.5"/> שלח שוב ל-Finbot
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* SUPPLIER ADD/EDIT MODAL */}
      {isSupplierModalOpen && supplierEditingData && (
        <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Building2 className="w-5 h-5 text-indigo-600"/> {supplierEditingData.id ? 'עריכת ספק' : 'ספק חדש'}</h3>
              <button onClick={() => setIsSupplierModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={saveSupplier} className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">שם החברה <span className="text-red-500">*</span></label>
                  <input required type="text" className="w-full border-slate-300 rounded-md p-2.5 border" value={supplierEditingData.name || ''} onChange={e => setSupplierEditingData({...supplierEditingData, name: e.target.value})} placeholder="לדוגמה: Guangzhou Steel Co." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">איש קשר</label>
                  <input type="text" className="w-full border-slate-300 rounded-md p-2.5 border" value={supplierEditingData.contactName || ''} onChange={e => setSupplierEditingData({...supplierEditingData, contactName: e.target.value})} placeholder="שם איש הקשר" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">עיר בסין</label>
                  <input type="text" className="w-full border-slate-300 rounded-md p-2.5 border" value={supplierEditingData.city || ''} onChange={e => setSupplierEditingData({...supplierEditingData, city: e.target.value})} placeholder="לדוגמה: Foshan" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">WhatsApp (בינלאומי)</label>
                  <input type="text" dir="ltr" className="w-full border-slate-300 rounded-md p-2.5 border" value={supplierEditingData.whatsapp || ''} onChange={e => setSupplierEditingData({...supplierEditingData, whatsapp: e.target.value})} placeholder="86-131-2345-6789" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">WeChat ID</label>
                  <input type="text" dir="ltr" className="w-full border-slate-300 rounded-md p-2.5 border" value={supplierEditingData.wechat || ''} onChange={e => setSupplierEditingData({...supplierEditingData, wechat: e.target.value})} placeholder="wechat_id" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">אימייל</label>
                  <input type="email" dir="ltr" className="w-full border-slate-300 rounded-md p-2.5 border" value={supplierEditingData.email || ''} onChange={e => setSupplierEditingData({...supplierEditingData, email: e.target.value})} placeholder="supplier@factory.com" />
                </div>
              </div>

              {/* קטלוג מחירים */}
              <div className="border-t border-slate-200 pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-bold text-slate-700 text-sm">קטלוג — דגמים ומחירים מוצעים</h4>
                  <button type="button" onClick={() => setSupplierEditingData({...supplierEditingData, catalog: [...(supplierEditingData.catalog||[]), { model: modelsList[0] || '', unitCostUSD: 0 }]})} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-200">+ הוסף דגם</button>
                </div>
                {(supplierEditingData.catalog || []).map((c: any, idx: number) => (
                  <div key={idx} className="flex gap-2 items-center mb-2">
                    <select className="flex-1 border-slate-300 rounded p-2 text-sm border" value={c.model} onChange={e => { const nc = [...supplierEditingData.catalog]; nc[idx] = {...nc[idx], model: e.target.value}; setSupplierEditingData({...supplierEditingData, catalog: nc}); }}>
                      {modelsList.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" className="w-28 border-slate-300 rounded p-2 text-sm border" value={c.unitCostUSD} onChange={e => { const nc = [...supplierEditingData.catalog]; nc[idx] = {...nc[idx], unitCostUSD: Number(e.target.value)}; setSupplierEditingData({...supplierEditingData, catalog: nc}); }} placeholder="$ ליחידה" />
                    <button type="button" onClick={() => setSupplierEditingData({...supplierEditingData, catalog: supplierEditingData.catalog.filter((_: any, i: number) => i !== idx)})} className="text-red-400 hover:text-red-600"><X className="w-4 h-4"/></button>
                  </div>
                ))}
                {(!supplierEditingData.catalog || supplierEditingData.catalog.length === 0) && <p className="text-xs text-slate-400 text-center py-2">הוסף דגמים שספק זה יכול לספק</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">הערות</label>
                <textarea className="w-full border-slate-300 rounded-md p-2.5 border min-h-[60px]" value={supplierEditingData.notes || ''} onChange={e => setSupplierEditingData({...supplierEditingData, notes: e.target.value})} placeholder="תנאי תשלום, הערות על איכות, הסכמות מיוחדות..."/>
              </div>

              {/* קטלוג קבצים */}
              {supplierEditingData.id && (
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="font-bold text-slate-700 text-sm mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500"/> קטלוג מוצרים (PDF / Excel)</h4>
                  {supplierEditingData.catalogFileUrl ? (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between mb-2">
                      <div>
                        <p className="text-xs font-medium text-slate-700 truncate max-w-[200px]">{supplierEditingData.catalogFileName || 'קטלוג קיים'}</p>
                        {supplierEditingData.catalogUploadedAt && <p className="text-[10px] text-slate-400 mt-0.5">הועלה: {new Date(supplierEditingData.catalogUploadedAt).toLocaleDateString('he-IL')}</p>}
                      </div>
                      <a href={supplierEditingData.catalogFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"><Eye className="w-3.5 h-3.5"/> פתח</a>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mb-2">אין קטלוג מועלה עדיין.</p>
                  )}
                  <label className="cursor-pointer block">
                    <div className={`flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-3 text-sm font-medium transition-colors ${isCatalogUploading ? 'border-indigo-300 bg-indigo-50 text-indigo-500' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600'}`}>
                      {isCatalogUploading ? (
                        <span>מעלה... {catalogUploadProgress}%</span>
                      ) : (
                        <><Download className="w-4 h-4"/> {supplierEditingData.catalogFileUrl ? 'החלף קטלוג' : 'העלה קטלוג'}</>
                      )}
                    </div>
                    <input type="file" accept=".pdf,.xlsx,.xls" className="hidden" disabled={isCatalogUploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadSupplierCatalog(supplierEditingData.id, f).then(() => { const updated = suppliers.find((s: any) => s.id === supplierEditingData.id); if (updated) setSupplierEditingData(updated); }); e.target.value = ''; }}
                    />
                  </label>
                  {catalogUploadProgress !== null && (
                    <div className="mt-2 w-full bg-slate-200 rounded-full h-1.5"><div className="bg-indigo-500 h-1.5 rounded-full transition-all" style={{ width: `${catalogUploadProgress}%` }}/></div>
                  )}
                </div>
              )}
              {!supplierEditingData.id && <p className="text-xs text-slate-400 border-t pt-3">שמור את הספק תחילה כדי להעלות קטלוג.</p>}

              <div className="flex gap-2 pt-4 border-t">
                <button type="submit" disabled={isSaving} className="flex-1 bg-indigo-600 text-white py-2.5 rounded-lg font-bold hover:bg-indigo-700 disabled:opacity-50">{isSaving ? 'שומר...' : 'שמור ספק'}</button>
                <button type="button" onClick={() => setIsSupplierModalOpen(false)} className="px-6 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUPPLIER OVERVIEW MODAL */}
      {isSupplierOverviewOpen && selectedSupplier && (() => {
        const stats = calculatedData.supplierStats?.[selectedSupplier.id] || { totalPaidUSD: 0, totalPaidILS: 0, orderCount: 0, models: [], avgLeadTimeDays: null, priceHistory: {} };
        // בנה היסטוריית הזמנות לפי משלוח
        const modelToSupplier: any = {};
        if (settings?.models) Object.entries(settings.models).forEach(([m, d]: any) => { if (d.supplierId === selectedSupplier.id) modelToSupplier[m] = true; });
        const supplierShipments = shipments.filter(s => s.lines?.some((l: any) => modelToSupplier[l.model])).map(s => {
          const myLines = (s.lines || []).filter((l: any) => modelToSupplier[l.model]);
          const totalUSD = myLines.reduce((acc: number, l: any) => acc + Number(l.qty) * Number(l.unitCostUSD), 0);
          return { ...s, myLines, totalUSD, totalILS: totalUSD * (Number(s.exchangeRate) || 1) };
        }).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[88vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl shrink-0">
              <h3 className="text-lg font-bold flex items-center gap-2"><Building2 className="w-5 h-5 text-indigo-600"/> {selectedSupplier.name}</h3>
              <button onClick={() => setIsSupplierOverviewOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>

            <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
              {/* Sidebar */}
              <div className="w-full md:w-64 border-b md:border-b-0 md:border-l border-slate-200 bg-slate-50 p-5 shrink-0 md:overflow-y-auto space-y-4">
                <div className="text-center">
                  <div className="w-14 h-14 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-2"><Building2 className="w-7 h-7 text-indigo-600"/></div>
                  <p className="font-bold text-slate-800">{selectedSupplier.name}</p>
                  {selectedSupplier.contactName && <p className="text-xs text-slate-500">{selectedSupplier.contactName}</p>}
                  {selectedSupplier.city && <p className="text-xs text-slate-400 flex items-center justify-center gap-1"><MapPin className="w-3 h-3"/> {selectedSupplier.city}</p>}
                </div>

                <div className="space-y-2 text-sm">
                  {selectedSupplier.whatsapp && <a href={`https://wa.me/${selectedSupplier.whatsapp.replace(/[^0-9]/g,'')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 bg-green-50 text-green-700 border border-green-200 rounded-md px-3 py-2 text-xs font-medium hover:bg-green-100"><ExternalLink className="w-3.5 h-3.5"/> פתח WhatsApp</a>}
                  {selectedSupplier.wechat && <div className="flex items-center gap-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-md px-3 py-2">WeChat: {selectedSupplier.wechat}</div>}
                  {selectedSupplier.email && <div className="flex items-center gap-2 text-xs text-slate-600"><Mail className="w-3.5 h-3.5 text-slate-400"/> {selectedSupplier.email}</div>}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-200">
                  <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                    <p className="text-[10px] text-slate-400">סה"כ שולם</p>
                    <p className="font-bold text-sm">${Math.round(stats.totalPaidUSD).toLocaleString()}</p>
                  </div>
                  <div className="bg-white rounded-lg p-2 text-center border border-slate-200">
                    <p className="text-[10px] text-slate-400">הזמנות</p>
                    <p className="font-bold text-sm">{stats.orderCount}</p>
                  </div>
                  {stats.avgLeadTimeDays && <div className="col-span-2 bg-white rounded-lg p-2 text-center border border-slate-200">
                    <p className="text-[10px] text-slate-400">זמן ייצור ממוצע</p>
                    <p className="font-bold text-sm">{stats.avgLeadTimeDays} ימים</p>
                  </div>}
                </div>
              </div>

              {/* Main Panel */}
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex border-b border-slate-200 bg-slate-50/50 shrink-0">
                  {[{id:'details',label:'פרטים וקטלוג'},{id:'orders',label:`הזמנות (${supplierShipments.length})`},{id:'notes',label:'הערות'}].map(tab => (
                    <button key={tab.id} onClick={() => setActiveSupplierTab(tab.id as any)} className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeSupplierTab === tab.id ? 'border-indigo-600 text-indigo-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{tab.label}</button>
                  ))}
                </div>

                {/* Tab: פרטים */}
                {activeSupplierTab === 'details' && (
                  <div className="flex-1 p-5 md:overflow-y-auto space-y-4">
                    {selectedSupplier.notes && <div className="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 border border-slate-200"><p className="text-xs text-slate-400 mb-1 font-medium">הערות</p>{selectedSupplier.notes}</div>}

                    {/* קטלוג קובץ */}
                    <div>
                      <p className="font-bold text-slate-700 text-sm mb-2 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500"/> קטלוג מוצרים</p>
                      {selectedSupplier.catalogFileUrl ? (
                        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-indigo-800 truncate max-w-[200px]">{selectedSupplier.catalogFileName || 'קטלוג'}</p>
                            {selectedSupplier.catalogUploadedAt && <p className="text-[10px] text-indigo-500 mt-0.5">עודכן: {new Date(selectedSupplier.catalogUploadedAt).toLocaleDateString('he-IL')}</p>}
                          </div>
                          <div className="flex gap-2">
                            <a href={selectedSupplier.catalogFileUrl} target="_blank" rel="noopener noreferrer" className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-md font-medium hover:bg-indigo-700 flex items-center gap-1"><Eye className="w-3.5 h-3.5"/> פתח</a>
                            <a href={selectedSupplier.catalogFileUrl} download className="text-xs bg-white border border-indigo-300 text-indigo-700 px-3 py-1.5 rounded-md font-medium hover:bg-indigo-50 flex items-center gap-1"><Download className="w-3.5 h-3.5"/> הורד</a>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-lg p-4 text-center">
                          <p className="text-sm text-slate-400">אין קטלוג מועלה.</p>
                          <p className="text-xs text-slate-400 mt-1">ערוך את הספק כדי להעלות קטלוג PDF או Excel.</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="font-bold text-slate-700 text-sm mb-3">קטלוג מחירים</p>
                      {(!selectedSupplier.catalog || selectedSupplier.catalog.length === 0) ? (
                        <p className="text-sm text-slate-400">לא הוגדרו מחירים בקטלוג.</p>
                      ) : (
                        <div className="space-y-2">
                          {selectedSupplier.catalog.map((c: any, idx: number) => {
                            const history = stats.priceHistory?.[c.model] || [];
                            const lastShipmentPrice = history.length > 0 ? history[history.length-1].unitCostUSD : null;
                            const prevShipmentPrice = history.length > 1 ? history[history.length-2].unitCostUSD : null;
                            const priceChange = lastShipmentPrice && prevShipmentPrice ? lastShipmentPrice - prevShipmentPrice : null;
                            return (
                              <div key={idx} className="bg-white border border-slate-200 rounded-lg p-3 flex justify-between items-center">
                                <div>
                                  <p className="font-bold text-slate-800">{c.model}</p>
                                  <p className="text-xs text-slate-500">מחיר מוצע בקטלוג: ${c.unitCostUSD}</p>
                                  {history.length > 0 && <p className="text-xs text-indigo-600 mt-0.5">מחיר הזמנה אחרונה: ${lastShipmentPrice}</p>}
                                </div>
                                {priceChange !== null && (
                                  <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${priceChange > 0 ? 'bg-red-50 text-red-600' : priceChange < 0 ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-slate-500'}`}>
                                    {priceChange > 0 ? <ArrowUpRight className="w-3.5 h-3.5"/> : priceChange < 0 ? <ArrowDownRight className="w-3.5 h-3.5"/> : null}
                                    {priceChange > 0 ? `+$${priceChange.toFixed(2)}` : priceChange < 0 ? `-$${Math.abs(priceChange).toFixed(2)}` : 'ללא שינוי'}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {/* מגמת מחירים */}
                    {Object.entries(stats.priceHistory || {}).filter(([, h]: any) => h.length > 1).map(([model, history]: any) => (
                      <div key={model} className="bg-white border border-slate-200 rounded-lg p-3">
                        <p className="text-xs font-bold text-slate-600 mb-2">היסטוריית מחיר — {model}</p>
                        <div className="flex gap-2 flex-wrap">
                          {history.map((h: any, i: number) => {
                            const prev = i > 0 ? history[i-1].unitCostUSD : null;
                            const changed = prev !== null && h.unitCostUSD !== prev;
                            const up = prev !== null && h.unitCostUSD > prev;
                            return (
                              <div key={i} className={`text-xs px-2 py-1 rounded border ${changed ? (up ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700') : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                <span className="font-medium">${h.unitCostUSD}</span>
                                <span className="text-[10px] block opacity-70">{new Date(h.date).toLocaleDateString('he-IL')}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Tab: הזמנות */}
                {activeSupplierTab === 'orders' && (
                  <div className="flex-1 p-5 md:overflow-y-auto">
                    {supplierShipments.length === 0 ? (
                      <div className="text-center text-slate-400 py-12"><Ship className="w-10 h-10 mx-auto mb-3 opacity-20"/><p>אין הזמנות משויכות לספק זה עדיין.</p><p className="text-xs mt-1">שייך דגמים לספק זה בטאב "דגמים".</p></div>
                    ) : (
                      <div className="space-y-3">
                        {supplierShipments.map((s: any) => (
                          <div key={s.id} className="bg-white border border-slate-200 rounded-lg p-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-bold text-slate-800">{s.name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{new Date(s.date).toLocaleDateString('he-IL')} {s.arrivalDate && `← הגיע: ${new Date(s.arrivalDate).toLocaleDateString('he-IL')}`}</p>
                                <div className="flex gap-1 mt-1 flex-wrap">
                                  {s.myLines.map((l: any, i: number) => <span key={i} className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{l.model} ×{l.qty} @ ${l.unitCostUSD}</span>)}
                                </div>
                              </div>
                              <div className="text-left shrink-0 ml-3">
                                <p className="font-bold text-indigo-700">${Math.round(s.totalUSD).toLocaleString()}</p>
                                <p className="text-xs text-slate-400">₪{Math.round(s.totalILS).toLocaleString()}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-bold flex justify-between">
                          <span>סה"כ כל ההזמנות:</span>
                          <span className="text-indigo-700">${Math.round(stats.totalPaidUSD).toLocaleString()} / ₪{Math.round(stats.totalPaidILS).toLocaleString()}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab: הערות */}
                {activeSupplierTab === 'notes' && (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 p-5 md:overflow-y-auto space-y-4">
                      {(!selectedSupplier.interactionLogs || selectedSupplier.interactionLogs.length === 0) ? (
                        <div className="text-center text-slate-400 py-12"><MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20"/><p>אין עדיין תיעוד.</p></div>
                      ) : (
                        <div className="relative border-r-2 border-indigo-100 pr-4 ml-2 space-y-4">
                          {[...selectedSupplier.interactionLogs].reverse().map((log: any, idx: number) => (
                            <div key={idx} className="relative">
                              <div className="absolute -right-[23px] top-1 w-3 h-3 bg-indigo-500 rounded-full border-4 border-white shadow-sm"></div>
                              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs font-bold text-slate-500">{new Date(log.date).toLocaleString('he-IL')}</span>
                                  <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-600">{log.user}</span>
                                </div>
                                <p className="text-sm text-slate-800 whitespace-pre-wrap">{log.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4 border-t border-slate-200 bg-slate-50 shrink-0">
                      <textarea className="w-full border border-slate-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" rows={3} placeholder="תאר שיחה, עסקה, הסכמה עם הספק..." value={supplierNoteText} onChange={e => setSupplierNoteText(e.target.value)}/>
                      <div className="flex justify-end mt-2">
                        <button onClick={addSupplierNote} disabled={!supplierNoteText.trim() || isSaving} className="bg-indigo-600 text-white px-6 py-2 rounded-md font-bold hover:bg-indigo-700 disabled:opacity-50">שמור הערה</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* QUOTE APPROVAL MODAL */}
      {isQuoteApprovalModalOpen && quoteApprovalData && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-600"/> אישור הצעת מחיר וגריעת מלאי</h3>
                <button onClick={() => setIsQuoteApprovalModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
              </div>
              <form onSubmit={executeQuoteApproval} className="p-6 space-y-6">
                  
                  <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm font-medium border border-blue-100">
                      אישור פעולה זו ישנה את הסטטוס של הצעת המחיר ל"אושרה", ויגרום לגריעה אוטומטית של הפריטים הבאים מהמלאי הפנוי ("במחסן") לסטטוס "נמכר ללקוח".
                      אנא ודא שהפרטים מטה נכונים לפני האישור (כמו שיוך לקמפיין ותקופת אחריות).
                  </div>

                  {quoteApprovalData.itemsToProcess.map((item: any, idx: number) => (
                      <div key={idx} className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-4">
                          <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                              <h4 className="font-bold text-slate-800">דגם: {item.model}</h4>
                              <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded">כמות לגריעה: {item.qty} יח'</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">מחיר מכירה יחידה (₪)</label>
                                  <input type="number" className="w-full border-slate-300 rounded p-2 text-sm bg-white" value={item.salePrice} onChange={(e) => {
                                      const newItems = [...quoteApprovalData.itemsToProcess];
                                      newItems[idx].salePrice = Number(e.target.value);
                                      setQuoteApprovalData({...quoteApprovalData, itemsToProcess: newItems});
                                  }} />
                              </div>
                              <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">תאריך מכירה / אישור</label>
                                  <input type="date" required className="w-full border-slate-300 rounded p-2 text-sm bg-white" value={item.saleDate} onChange={(e) => {
                                      const newItems = [...quoteApprovalData.itemsToProcess];
                                      newItems[idx].saleDate = e.target.value;
                                      setQuoteApprovalData({...quoteApprovalData, itemsToProcess: newItems});
                                  }} />
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                              <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">חודשי אחריות</label>
                                  <input type="number" min="0" max="60" className="w-full border-slate-300 rounded p-2 text-sm bg-white" value={item.warrantyMonths} onChange={(e) => {
                                      const newItems = [...quoteApprovalData.itemsToProcess];
                                      newItems[idx].warrantyMonths = Number(e.target.value);
                                      setQuoteApprovalData({...quoteApprovalData, itemsToProcess: newItems});
                                  }} />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">שיוך לקמפיין שיווקי</label>
                                <select className="w-full border-slate-300 rounded p-2 text-sm bg-white" value={item.campaignId} onChange={(e) => {
                                      const newItems = [...quoteApprovalData.itemsToProcess];
                                      newItems[idx].campaignId = e.target.value;
                                      setQuoteApprovalData({...quoteApprovalData, itemsToProcess: newItems});
                                  }}>
                                  <option value="">ללא שיוך</option>
                                  {campaigns.filter(c => {
                                      const isStarted = !c.startDate || c.startDate <= todayStr;
                                      const isNotTooOld = !c.endDate || c.endDate >= thirtyDaysAgoStr;
                                      return isStarted && isNotTooOld;
                                  }).map(c => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                </select>
                              </div>
                          </div>
                      </div>
                  ))}

                  <button type="submit" disabled={isSaving} className="w-full bg-green-600 text-white py-3 rounded-md font-bold hover:bg-green-700 mt-4 disabled:opacity-50 disabled:cursor-not-allowed shadow-md text-lg">
                      {isSaving ? 'מעדכן מלאי ומאשר...' : 'אשר הצעת מחיר וגרא פריטים מהמלאי'}
                  </button>
              </form>
            </div>
          </div>
      )}

      {/* QUOTE GENERATOR MODAL */}
      {isQuoteModalOpen && quoteData && (() => {
        const currentCustomer = customers.find(c => c.id === quoteData.customerId) || {};
        return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1100px] h-[95vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-xl shrink-0">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><FileText className="w-5 h-5 text-indigo-600"/> מחולל הצעת מחיר / הסכם הזמנה</h3>
              <button onClick={() => setIsQuoteModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row">
              
              {/* Sidebar Controls */}
              <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-l border-slate-200 p-4 sm:p-6 space-y-5 lg:overflow-y-auto bg-white shrink-0">
                
                {/* CUSTOMER SELECTION */}
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-purple-900">בחר לקוח / ליד</label>
                    <button 
                      type="button" 
                      onClick={() => { 
                        setShowQuickImport(false); 
                        setQuickImportText(''); 
                        setCustomerEditingData({ contactName: '', phone: '', businessName: '', companyName: '', businessType: 'active', hp: '', email: '', address: '', status: 'active', notes: '' }); 
                        setIsCustomerModalOpen(true); 
                      }} 
                      className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 bg-purple-100 px-2 py-1 rounded-md transition-colors"
                    >
                      <Plus className="w-3 h-3"/> הוסף לקוח
                    </button>
                  </div>
                  <select className="w-full border-purple-300 rounded-md p-2.5 text-base bg-white shadow-sm font-medium text-slate-800 focus:border-purple-500 focus:ring-purple-500" value={quoteData.customerId || ''} onChange={e => setQuoteData({...quoteData, customerId: e.target.value})}>
                    <option value="">-- בחר לקוח מהרשימה --</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.businessName || c.contactName} {c.phone ? `- ${c.phone}` : ''}</option>)}
                  </select>
                </div>

                <div className="space-y-4 border-b border-slate-200 pb-4">
                  <div className="flex justify-between items-center">
                    <h4 className="font-bold text-slate-800">פריטים בהצעה</h4>
                    <button onClick={addQuoteItem} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded font-bold hover:bg-indigo-200">+ הוסף פריט</button>
                  </div>
                  
                  {quoteData.items.map((item: any, index: number) => (
                    <div key={index} className="bg-slate-50 p-3 rounded-lg border border-slate-200 relative">
                      {quoteData.items.length > 1 && (
                         <button onClick={() => removeQuoteItem(index)} className="absolute top-2 left-2 text-red-500 hover:text-red-700"><X className="w-4 h-4"/></button>
                      )}
                      <div className="mb-2 pr-6">
                        <label className="block text-xs font-bold text-slate-700 mb-1">דגם</label>
                        <select className="w-full border-slate-300 rounded p-1.5 text-sm bg-white font-medium" value={item.model} onChange={e => updateQuoteItem(index, 'model', e.target.value)}>
                          {modelsList.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">כמות</label>
                          <input type="number" min="1" className="w-full border-slate-300 rounded p-1.5 font-bold text-sm" value={item.qty} onChange={e => updateQuoteItem(index, 'qty', Number(e.target.value))} />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">מחיר יחידה (₪)</label>
                          <input type="number" className="w-full border-slate-300 rounded p-1.5 font-bold text-sm text-indigo-700" value={item.price} onChange={e => updateQuoteItem(index, 'price', Number(e.target.value))} />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">הערות/תוספות לדגם</label>
                        <textarea className="w-full border-slate-300 rounded p-1.5 text-xs min-h-[50px]" value={item.customNotes || ''} onChange={e => updateQuoteItem(index, 'customNotes', e.target.value)} placeholder="לדוגמה: תוספת מדף..."></textarea>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">עלות משלוח כוללת (₪ לפני מע"מ)</label>
                  <input type="number" className="w-full border-slate-300 rounded p-2.5 font-bold" value={quoteData.shippingCost || 0} onChange={e => setQuoteData({...quoteData, shippingCost: Number(e.target.value)})} />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">חודשי אחריות (יוצג בחוזה)</label>
                  <input type="number" min="0" max="60" className="w-full border-slate-300 rounded p-2.5 font-bold" value={quoteData.warrantyMonths || 0} onChange={e => setQuoteData({...quoteData, warrantyMonths: Number(e.target.value)})} placeholder="לדוגמה: 12" />
                </div>

                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mt-4">
                  <label className="block text-sm font-bold text-slate-700 mb-2">שיוך לקמפיין שיווקי (פנימי, לא יופיע ב-PDF)</label>
                  <select className="w-full border-slate-300 rounded p-2 text-sm bg-white" value={quoteData.campaignId || ''} onChange={e => setQuoteData({...quoteData, campaignId: e.target.value})}>
                    <option value="">ללא שיוך קמפיין</option>
                    {campaigns.filter(c => {
                      const isStarted = !c.startDate || c.startDate <= todayStr;
                      const isNotTooOld = !c.endDate || c.endDate >= thirtyDaysAgoStr;
                      return isStarted && isNotTooOld;
                    }).map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <button onClick={handleGenerateQuotePDF} disabled={isGeneratingPDF || !quoteData.customerId} className="w-full bg-green-600 text-white p-4 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-green-700 disabled:opacity-50 transition-colors shadow-lg mt-8 text-lg">
                  {isGeneratingPDF ? 'מייצר מסמך ושומר...' : !quoteData.customerId ? 'אנא בחר לקוח תחילה' : <><Download className="w-6 h-6"/> שמור, והורד PDF</>}
                </button>
              </div>

              {/* PDF Preview Area (Using Reusable Component) */}
              <div className="w-full lg:flex-1 bg-slate-800 p-4 sm:p-8 lg:overflow-y-auto flex justify-center items-start">
                <QuoteDocument quote={quoteData} customer={currentCustomer} settings={settings} innerRef={quoteRef} />
              </div>

            </div>
          </div>
        </div>
        );
      })()}

      {/* Arrival Prompt */}
      {arrivalPrompt.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm">
            <h3 className="font-bold text-lg mb-2">קליטת משלוח למחסן</h3>
            <label className="block text-sm mb-1">תאריך הגעה בפועל</label>
            <input type="date" className="w-full border p-2 rounded mb-4" value={arrivalPrompt.date} onChange={e => setArrivalPrompt({...arrivalPrompt, date: e.target.value})} />
            <div className="flex gap-2">
              <button 
                onClick={() => { 
                  confirmShipmentStatusUpdate(arrivalPrompt.shipment, 'in_warehouse', arrivalPrompt.date || new Date().toISOString().split('T')[0]); 
                  setArrivalPrompt({ isOpen: false, shipment: null, date: '' }); 
                }} 
                className="bg-indigo-600 text-white p-2 rounded flex-1"
              >
                אישור
              </button>
              <button 
                onClick={()=>setArrivalPrompt({ isOpen: false, shipment: null, date: '' })} 
                className="bg-slate-200 p-2 rounded"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Breakdown Modal */}
      {isStockBreakdownModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Package className="w-5 h-5 text-indigo-600"/> פירוט מלאי זמין</h3>
              <button onClick={() => setIsStockBreakdownModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 overflow-y-auto">
              {Object.entries(calculatedData.stockInWarehouse).filter(([_, qty]) => (qty as number) > 0).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(calculatedData.stockInWarehouse)
                    .filter(([_, qty]) => (qty as number) > 0)
                    .sort((a, b) => (b[1] as number) - (a[1] as number)) 
                    .map(([model, qty]) => (
                    <div key={model} className="flex justify-between items-center p-3 bg-white border border-slate-200 shadow-sm rounded-lg">
                      <span className="font-bold text-slate-700">{model}</span>
                      <span className="bg-indigo-100 text-indigo-800 py-1 px-3 rounded-full font-bold text-sm">{String(qty)} יח'</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-500 py-8 font-medium">אין כרגע פריטים זמינים במלאי.</div>
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={() => setIsStockBreakdownModalOpen(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md font-medium hover:bg-slate-300 transition-colors w-full">סגור</button>
            </div>
          </div>
        </div>
      )}

      {/* AI Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-indigo-100 bg-indigo-50/50 flex justify-between items-center">
              <h3 className="text-lg font-bold text-indigo-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-600"/> העוזר האישי שלך מבית Gemini</h3>
              <button onClick={() => setShowAiModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="p-6 overflow-y-auto whitespace-pre-wrap text-slate-700 leading-relaxed font-medium">
              {isGeneratingAI ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                  <p className="text-indigo-600 font-medium animate-pulse">מנתח נתונים ומפיק תובנות...</p>
                </div>
              ) : (
                <div className="prose prose-sm md:prose-base prose-indigo rtl">{aiInsight || "לא התקבל מידע."}</div>
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button onClick={() => { if(!isGeneratingAI) { navigator.clipboard.writeText(aiInsight); alert('הטקסט הועתק בהצלחה!'); } }} disabled={isGeneratingAI} className="px-4 py-2 border border-slate-300 text-slate-700 bg-white rounded-md font-medium hover:bg-slate-50 text-sm disabled:opacity-50">העתק טקסט</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}