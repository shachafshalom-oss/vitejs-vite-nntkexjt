import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { Plus, Edit, Trash2, Package, TrendingUp, DollarSign, Activity, X, Ship, Megaphone, Settings, Layers, ChevronDown, ChevronUp, AlertTriangle, Sparkles, LogOut, Lock, ShoppingCart, PlusCircle, Users, Phone, MapPin, Mail, User, UserPlus, ShieldCheck, ShieldAlert, FileText, Download, Image as ImageIcon, Upload, CheckCircle } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// ==========================================
// 1. הגדרות FIREBASE פרטיות (הדבק כאן את שלך)
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyDpXEMAmwEGzp4AqxRH72ijm1dVcANfIkU",
  authDomain: "ds-logistics-crm.firebaseapp.com",
  projectId: "ds-logistics-crm",
  storageBucket: "ds-logistics-crm.firebasestorage.app",
  messagingSenderId: "745458915751",
  appId: "1:745458915751:web:12dff3d86b6e97479cbe82",
  measurementId: "G-HF46RL74F7"
};
// ==========================================
// 2. מפתח GEMINI (לבינה מלאכותית - אופציונלי)
// ==========================================
const geminiApiKey = "YOUR_GEMINI_API_KEY"; // קבל בחינם מ- Google AI Studio

// אתחול פיירבייס
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// קבועים
const STATUS_MAP: Record<string, string> = { 'ordered': 'בייצור/בסין', 'in_transit': 'בדרך לארץ', 'in_warehouse': 'במחסן', 'sold': 'נמכר' };
const SHIPMENT_STATUS_MAP: Record<string, string> = { 'ordered': 'בייצור בסין', 'in_transit': 'בדרך לארץ', 'in_warehouse': 'הגיע למחסן' };
const STATUS_COLORS: Record<string, string> = { 'ordered': 'bg-blue-100 text-blue-800', 'in_transit': 'bg-purple-100 text-purple-800', 'in_warehouse': 'bg-yellow-100 text-yellow-800', 'sold': 'bg-green-100 text-green-800' };
const defaultSettings: any = { 
  models: { 
    'Prime': { cbm: 1.2, blueprintUrl: '', itemImgUrl: '' }, 
    'Night': { cbm: 1.0, blueprintUrl: '', itemImgUrl: '' }, 
    'Urban': { cbm: 1.5, blueprintUrl: '', itemImgUrl: '' }, 
    'Events': { cbm: 2.0, blueprintUrl: '', itemImgUrl: '' } 
  },
  companyLogoUrl: ''
};

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
  const [quotes, setQuotes] = useState<any[]>([]); // New state for quotes

  const modelsList = useMemo(() => Object.keys(settings.models || {}), [settings]);

  // Modal & UI States
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isStockBreakdownModalOpen, setIsStockBreakdownModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<any>(null);
  const [customerEditingData, setCustomerEditingData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  
  // Quote States
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [quoteData, setQuoteData] = useState<any>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isQuoteApprovalModalOpen, setIsQuoteApprovalModalOpen] = useState(false);
  const [quoteApprovalData, setQuoteApprovalData] = useState<any>(null);

  // Quick Import States
  const [showQuickImport, setShowQuickImport] = useState(false);
  const [quickImportText, setQuickImportText] = useState('');

  const [newModelName, setNewModelName] = useState('');
  const [newModelData, setNewModelData] = useState({ name: '', cbm: 0 });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [arrivalPrompt, setArrivalPrompt] = useState<{isOpen: boolean, shipment: any, date: string}>({ isOpen: false, shipment: null, date: '' });

  // AI Feature States
  const [aiInsight, setAiInsight] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // --- Date Calculations ---
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

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
        setSettings(settingsDoc);
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
      setLoading(false);
    });


    return () => { unsubSettings(); unsubShipments(); unsubItems(); unsubCampaigns(); unsubCustomers(); unsubQuotes(); };
  }, [user]);

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

  const handleLogout = () => {
    signOut(auth);
  };

  // --- Image Upload Handler (Compression to Base64) ---
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        // כיווץ התמונה
        const maxDim = 600; 

        if (width > height) {
          if (width > maxDim) {
            height *= maxDim / width;
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width *= maxDim / height;
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, width, height); // ניקוי קנבס למניעת רקע
          ctx.drawImage(img, 0, 0, width, height);
        }
        
        // המרה ל-PNG לשמירה על שקיפות לוגו/תמונות
        const dataUrl = canvas.toDataURL('image/png'); 
        callback(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // --- Core Calculations ---
  const calculatedData = useMemo(() => {
    const shipmentStats: any = {};
    shipments.forEach(s => {
      const shippingTotalILS = (Number(s.shippingCostUSD) * Number(s.exchangeRate)) + Number(s.shippingCostILS);
      const totalCbm = Number(s.totalCbm);
      shipmentStats[s.id] = {
        exchangeRate: Number(s.exchangeRate) || 1,
        costPerCbmILS: totalCbm > 0 ? shippingTotalILS / totalCbm : 0,
        name: s.name,
        status: s.status || 'ordered',
        arrivalDate: s.arrivalDate
      };
    });

    const campaignStats: any = {};
    campaigns.forEach(c => { campaignStats[c.id] = { cost: Number(c.totalCost), itemCount: 0, name: c.name }; });
    items.forEach(i => {
      if (i.campaignId && campaignStats[i.campaignId]) campaignStats[i.campaignId].itemCount++;
    });

    const customerStats: any = {};
    customers.forEach(c => { 
      const displayName = c.businessName || c.contactName || c.name || 'לקוח ללא שם';
      customerStats[c.id] = { itemCount: 0, totalRevenue: 0, name: displayName, phone: c.phone, activeWarranties: 0 }; 
    });

    let inWarehouseCount = 0;
    let totalInventoryValueILS = 0;
    let totalProfit = 0;
    let soldCount = 0;
    
    const stockInWarehouse: any = {};
    const stockOnTheWay: any = {};
    const salesInLast30: any = {};
    
    modelsList.forEach(m => { stockInWarehouse[m] = 0; stockOnTheWay[m] = 0; salesInLast30[m] = 0; });

    const enrichedItems = items.map(item => {
      const sStat = shipmentStats[item.shipmentId];
      const cbm = (settings.models && settings.models[item.model]?.cbm) || 0;
      
      const factoryCostILS = sStat ? (Number(item.factoryUnitCostUSD) * sStat.exchangeRate) : 0;
      const importCostILS = sStat ? (sStat.costPerCbmILS * cbm) : 0;
      const repairCostILS = Number(item.repairCost) || 0;
      const addOnCostILS = Number(item.addOnCost) || 0;
      
      const marketingCostILS = (item.campaignId && campaignStats[item.campaignId]?.itemCount > 0)
        ? (campaignStats[item.campaignId].cost / campaignStats[item.campaignId].itemCount) : 0;

      const totalLandedCost = factoryCostILS + importCostILS + repairCostILS + addOnCostILS + marketingCostILS;
      const totalRevenue = (Number(item.salePrice) || 0) + (Number(item.addOnPrice) || 0);
      const profit = item.status === 'sold' ? totalRevenue - totalLandedCost : 0;

      let isWarrantyActive = false;
      let warrantyDaysLeft = 0;
      if (item.status === 'sold' && item.saleDate && item.warrantyMonths) {
          const saleDate = new Date(item.saleDate);
          const expiryDate = new Date(saleDate);
          expiryDate.setMonth(expiryDate.getMonth() + Number(item.warrantyMonths));
          
          if (expiryDate > today) {
              isWarrantyActive = true;
              const diffTime = Math.abs(expiryDate.getTime() - today.getTime());
              warrantyDaysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
        stockInWarehouse[item.model] = 0; stockOnTheWay[item.model] = 0; salesInLast30[item.model] = 0;
      }

      if (item.status === 'in_warehouse') {
        inWarehouseCount++; totalInventoryValueILS += totalLandedCost; stockInWarehouse[item.model]++;
      } else if (item.status === 'ordered' || item.status === 'in_transit') {
        stockOnTheWay[item.model]++;
      }
      
      if (item.status === 'sold') {
        soldCount++; totalProfit += profit;
        if (item.saleDate && new Date(item.saleDate) >= thirtyDaysAgo) salesInLast30[item.model]++;
      }

      return {
        ...item, factoryCostILS, importCostILS, marketingCostILS, totalLandedCost, totalRevenue, profit,
        shipmentName: sStat?.name || 'לא ידוע', shipmentStatus: sStat?.status || 'ordered', campaignName: campaignStats[item.campaignId]?.name || 'ללא',
        customerName: customerStats[item.customerId]?.name || 'לקוח כללי', isWarrantyActive, warrantyDaysLeft
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
        groupedInventoryMap[key] = { id: key, model: item.model, shipmentId: item.shipmentId, shipmentName: item.shipmentName, status: item.status, arrivalDate: item.arrivalDate, qty: 0, items: [] };
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
      enrichedItems
        .filter(item => item.status === 'in_warehouse')
        .map(item => item.model)
    ));
    
    const availableModelsInStock = Object.keys(stockInWarehouse).filter(m => stockInWarehouse[m] > 0);

    return { enrichedItems, groupedInventory: groupedArray, shipmentStats, campaignStats, customerStats, inWarehouseCount, totalInventoryValueILS, avgProfit: soldCount > 0 ? Math.round(totalProfit / soldCount) : 0, forecasts, modelsInStock, availableModelsInStock, stockInWarehouse };
  }, [items, shipments, campaigns, customers, settings, modelsList]);

  // --- Handlers ---
  const generateWithGemini = async (prompt: string) => {
    if (!geminiApiKey || geminiApiKey === "YOUR_GEMINI_API_KEY") return "שים לב: לא הגדרת מפתח API של Gemini בקוד המערכת.";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }], systemInstruction: { parts: [{ text: "You are an expert business consultant for D.S Logistics." }] } };
    try {
      const res = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "לא נוצר טקסט.";
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
      
      const labelKeywords = [
        'שם איש הקשר', 'שם איש קשר', 'שם הלקוח', 'שם לקוח', 'שם הבר/מסעדה', 'שם הבר\\מסעדה', 
        'שם הבר / מסעדה', 'שם הבר \\ מסעדה', 'שם הבר', 'שם המסעדה', 'שם העסק', 'שם עסק',
        'שם החברה', 'שם חברה', 'אימייל לקבלת מסמכים', 'אימייל לקבלת חשבונית', 'כתובת העסק',
        'כתובת מייל', 'איש קשר', 'חברה', 'סוג העסק', 'סוג עסק', 'עוסק מורשה', 'עוסק פטור',
        'טלפון נייד', 'מספר טלפון', 'סלולרי', 'אימייל', 'מייל', 'דוא"ל', 'דואל', 'טלפון',
        'נייד', 'ח.פ.', 'ח.פ', 'חפ', 'כתובת', 'מיקום', 'עיר', 'סוג', 'שם'
      ];

      labelKeywords.sort((a, b) => b.length - a.length);

      let matchedKeyword = '';
      for (const kw of labelKeywords) {
        if (cleaned.toLowerCase().startsWith(kw.toLowerCase())) {
          matchedKeyword = kw;
          break;
        }
      }

      if (matchedKeyword) {
        cleaned = cleaned.substring(matchedKeyword.length).trim();
        cleaned = cleaned.replace(/^[\:\-\,]\s*/, '');
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

    const contactName = fields[0] || '';
    const businessName = fields[1] || '';
    const companyName = fields[2] || '';
    const businessTypeStr = fields[3] || '';
    const hp = fields[4] || '';
    const email = fields[5] || '';
    const phone = fields[6] || '';
    const address = fields[7] || '';

    let businessType = customerEditingData?.businessType || 'bar';
    if (businessTypeStr) {
      if (businessTypeStr.includes('בר')) businessType = 'bar';
      else if (businessTypeStr.includes('מסעד')) businessType = 'restaurant';
      else if (businessTypeStr.includes('אולם') || businessTypeStr.includes('אירוע')) businessType = 'event_hall';
      else businessType = 'other';
    }

    setCustomerEditingData((prev: any) => ({
      ...prev,
      contactName: contactName || prev.contactName,
      businessName: businessName || prev.businessName,
      companyName: companyName || prev.companyName,
      businessType: businessType,
      hp: hp || prev.hp,
      email: email || prev.email,
      phone: phone || prev.phone,
      address: address || prev.address
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
              if (!item._deleted) {
                await deleteDoc(doc(db, 'crm_items', item.id));
              }
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
      } 
      else {
        if (data.status === 'sold' && !data.saleDate) data.saleDate = new Date().toISOString().split('T')[0];
        if (data.status !== 'sold') { data.customerId = ''; data.campaignId = ''; data.warrantyMonths = 0; }
        await updateDoc(doc(db, 'crm_items', data.id), data);
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
        const docRef = await addDoc(collection(db, 'crm_customers'), data); 
        newCustomerId = docRef.id;
      }
      setIsCustomerModalOpen(false);
      // שיוך אוטומטי של הלקוח החדש למודלים שפתוחים ברקע (מכירה או הצעת מחיר)
      if (isItemModalOpen) {
        setEditingData((prev: any) => ({...prev, customerId: newCustomerId}));
      }
      if (isQuoteModalOpen) {
        setQuoteData((prev: any) => ({...prev, customerId: newCustomerId}));
      }
    } catch (err) { alert("שגיאה בשמירת לקוח"); }
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
        for (const item of itemsToDelete) {
          await deleteDoc(doc(db, 'crm_items', item.id));
        }
      }
    } catch (err) { console.error(err); }
  };

  const handleResetSystem = async () => {
    const userConfirm = window.prompt("אזהרה קריטית! 🛑\nפעולה זו תמחק את *כל* המשלוחים, הפריטים והקמפיינים במערכת ולא ניתן לבטל אותה.\nלהמשך, הקלד את המילה 'מחק':");
    if (userConfirm !== 'מחק') return;
    
    setIsSaving(true);
    try {
      const collectionsToDelete = ['crm_shipments', 'crm_items', 'crm_campaigns', 'crm_customers', 'crm_quotes'];
      
      for (const colName of collectionsToDelete) {
        const snapshot = await getDocs(collection(db, colName));
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, colName, d.id)));
        await Promise.all(deletePromises);
      }
      
      alert("כל הנתונים נמחקו בהצלחה! המערכת כעת נקייה ומוכנה לעבודה מחדש.");
      setActiveTab('dashboard'); 
    } catch (err) {
      console.error(err);
      alert("אירעה שגיאה במחיקת הנתונים. ודא שהרשאות הפיירבייס תקינות.");
    }
    setIsSaving(false);
  };

  // --- Quote Generation & Management ---
  const handleGenerateQuotePDF = async () => {
    if (!quoteRef.current || !quoteData?.customerId) {
      if (!quoteData?.customerId) alert("יש לבחור לקוח לפני הפקת המסמך");
      return;
    }
    
    const currentCustomer = customers.find(c => c.id === quoteData.customerId) || {};
    setIsGeneratingPDF(true);
    try {
      // 1. שמירת הצעת המחיר במסד הנתונים
      const quotePayload = {
        customerId: quoteData.customerId,
        date: quoteData.date,
        items: quoteData.items,
        shippingCost: quoteData.shippingCost,
        status: 'issued', // סטטוס התחלתי
        createdAt: new Date().toISOString()
      };
      
      if (!quoteData.id) {
          // אם זו הצעה חדשה
          await addDoc(collection(db, 'crm_quotes'), quotePayload);
      }

      // 2. הפקת ה-PDF
      const canvas = await html2canvas(quoteRef.current, {
        scale: 2, 
        useCORS: true,
        backgroundColor: '#eae5dd' // שמירה על צבע הרקע של ה-PDF
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdfWidth = 210; // רוחב דף A4 במילימטרים
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width; // חישוב גובה מותאם בדיוק לתוכן
      
      // יצירת מסמך PDF שמורכב מדף אחד ארוך ורציף בהתאם לתוכן (למניעת קווים בין דפים)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfWidth, pdfHeight]
      });
      
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`הצעת_מחיר_${currentCustomer.businessName || currentCustomer.contactName || 'לקוח'}.pdf`);
      
      setIsQuoteModalOpen(false); // סגירת החלון לאחר הפקה
    } catch (error) {
      console.error("שגיאה ביצירת PDF:", error);
      alert("שגיאה ביצירת הצעת המחיר.");
    }
    setIsGeneratingPDF(false);
  };

  const addQuoteItem = () => {
      if(modelsList.length > 0) {
        setQuoteData({
            ...quoteData,
            items: [...quoteData.items, { model: modelsList[0], qty: 1, price: 0, customNotes: '' }]
        });
      }
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

  // פונקציה לפתיחת מודל אישור הצעה
  const handleApproveQuoteInitiate = (quote: any) => {
    // מכין את המידע עבור חלון האישור (אילו ברים צריך לגרוע מהמלאי ועם איזה פרטים)
    const itemsToProcess = quote.items.map((item: any) => ({
      model: item.model,
      qty: item.qty,
      salePrice: item.price,
      saleDate: todayStr,
      warrantyMonths: 12,
      campaignId: '',
      processed: 0 // מעקב כמה כבר נגרעו מתוך הכמות
    }));

    setQuoteApprovalData({
        quoteId: quote.id,
        customerId: quote.customerId,
        itemsToProcess: itemsToProcess
    });
    setIsQuoteApprovalModalOpen(true);
  };

  // פונקציה שמבצעת בפועל את אישור ההצעה וגריעת המלאי
  const executeQuoteApproval = async (e: any) => {
      e.preventDefault();
      setIsSaving(true);
      try {
        // 1. מעבר על כל שורת פריט ובדיקה אם יש מספיק מלאי פנוי
        const updatesToMake = [];

        for (const line of quoteApprovalData.itemsToProcess) {
            const availableItems = items.filter(i => i.model === line.model && i.status === 'in_warehouse');
            if (availableItems.length < line.qty) {
                throw new Error(`אין מספיק פריטים פנויים במלאי מדגם ${line.model}. (נדרש: ${line.qty}, פנוי: ${availableItems.length})`);
            }
            
            // מכין את עדכוני הפריטים (גריעה מהמלאי והפיכה ל'נמכר')
            for(let i=0; i < line.qty; i++) {
                updatesToMake.push({
                    id: availableItems[i].id,
                    data: {
                        status: 'sold',
                        saleDate: line.saleDate,
                        warrantyMonths: Number(line.warrantyMonths) || 0,
                        salePrice: Number(line.salePrice) || 0,
                        campaignId: line.campaignId || '',
                        customerId: quoteApprovalData.customerId,
                        updatedAt: new Date().toISOString()
                    }
                });
            }
        }

        // 2. ביצוע עדכוני המלאי
        await Promise.all(updatesToMake.map(update => updateDoc(doc(db, 'crm_items', update.id), update.data)));

        // 3. עדכון סטטוס ההצעה ל"אושרה"
        await updateDoc(doc(db, 'crm_quotes', quoteApprovalData.quoteId), { status: 'approved', approvedAt: new Date().toISOString() });

        // 4. עדכון סטטוס הלקוח ל"פעיל" (רוכש)
        await updateDoc(doc(db, 'crm_customers', quoteApprovalData.customerId), { status: 'active', updatedAt: new Date().toISOString() });

        setIsQuoteApprovalModalOpen(false);
        alert("הצעת המחיר אושרה! הפריטים נגרעו מהמלאי בהצלחה והלקוח עודכן.");
      } catch (err: any) {
        alert(err.message || "שגיאה בתהליך אישור ההצעה.");
      }
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
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-100 p-1.5 rounded"><Package className="h-6 w-6 text-indigo-700" /></div>
            <h1 className="text-xl font-bold text-slate-800 hidden sm:block">D.S Logistics CRM</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 hidden md:inline">{user.email}</span>
            <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-red-600 transition-colors"><LogOut className="w-4 h-4"/> יציאה</button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 border-t border-slate-100 bg-slate-50/50">
          <nav className="flex space-x-reverse space-x-1 sm:space-x-4 overflow-x-auto py-2">
            {[
              { id: 'dashboard', icon: Activity, label: 'דשבורד' },
              { id: 'quotes', icon: FileText, label: 'הצעות מחיר' },
              { id: 'shipments', icon: Ship, label: 'משלוחים' },
              { id: 'inventory', icon: Package, label: 'ניהול מלאי' },
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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div 
                onClick={() => setIsStockBreakdownModalOpen(true)}
                className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 flex items-center gap-4 cursor-pointer hover:border-indigo-300 hover:shadow-md transition-all group"
              >
                <div className="bg-indigo-100 p-3 rounded-full group-hover:bg-indigo-200 transition-colors"><Package className="text-indigo-600 w-6 h-6"/></div>
                <div>
                  <p className="text-sm text-slate-500 font-medium flex items-center gap-1.5">
                    פריטים במלאי
                    <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-500 transition-colors">לחץ לפירוט</span>
                  </p>
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
          </div>
        )}

        {/* --- TAB: QUOTES (הצעות מחיר) --- */}
        {activeTab === 'quotes' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">מאגר הצעות מחיר</h2>
              <button onClick={() => { setIsFabOpen(false); setQuoteData({ customerId: '', items: [{ model: modelsList[0] || '', qty: 1, price: 0, customNotes: '' }], shippingCost: 0, date: todayStr }); setIsQuoteModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"><Plus className="w-4 h-4"/> הצעת מחיר חדשה</button>
            </div>
            
            <div className="bg-white shadow-sm border border-slate-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">תאריך הפקה</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">לקוח</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">פירוט פריטים</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">סה"כ לתשלום</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">סטטוס</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">פעולות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {quotes.map(q => {
                    const customer = customers.find(c => c.id === q.customerId) || { name: 'לקוח נמחק' };
                    const itemsTotal = q.items.reduce((sum: number, item: any) => sum + (Number(item.price) * Number(item.qty)), 0);
                    const grandTotal = itemsTotal + Number(q.shippingCost || 0);
                    
                    return (
                      <tr key={q.id} className="hover:bg-slate-50">
                        <td className="px-4 py-4 text-slate-600">{new Date(q.date).toLocaleDateString('he-IL')}</td>
                        <td className="px-4 py-4 font-bold text-slate-800">{customer.businessName || customer.contactName || customer.name}</td>
                        <td className="px-4 py-4 text-slate-600">
                          {q.items.map((i:any, idx:number) => <div key={idx}>{i.qty} x {i.model}</div>)}
                        </td>
                        <td className="px-4 py-4 font-bold text-indigo-700">₪{(grandTotal * 1.18).toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">(כולל מע"מ)</span></td>
                        <td className="px-4 py-4">
                          {q.status === 'issued' ? (
                              <span className="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-800">הונפק (ממתין לאישור)</span>
                          ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800"><CheckCircle className="w-3 h-3"/> אושרה ומלאי נגרע</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-left flex items-center justify-end gap-2">
                          {q.status === 'issued' && (
                              <button onClick={() => handleApproveQuoteInitiate(q)} className="bg-green-500 text-white px-3 py-1.5 rounded text-xs font-bold hover:bg-green-600 transition-colors shadow-sm">
                                אשר וגרא מלאי
                              </button>
                          )}
                          <button onClick={() => deleteDocHandler('crm_quotes', q.id)} className="text-slate-400 hover:text-red-500 p-1.5"><Trash2 className="w-4 h-4"/></button>
                        </td>
                      </tr>
                    );
                  })}
                  {quotes.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">לא נמצאו הצעות מחיר במערכת.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
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
                {modelsList.map(model => (
                  <div key={model} className="bg-slate-50 border border-slate-200 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-4">
                        <h4 className="font-bold text-lg text-slate-800">{model}</h4>
                        <div className="flex items-center gap-2">
                            <label className="text-sm font-medium text-slate-600">CBM:</label>
                            <input type="number" step="0.01" min="0" className="w-20 p-1.5 text-center border border-slate-300 rounded focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white" value={settings.models[model]?.cbm || ''} onChange={(e) => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], cbm: Number(e.target.value) } } })}/>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-3 rounded border border-slate-200">
                            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><ImageIcon className="w-4 h-4"/> העלה תמונת הדמיה</label>
                            <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (base64) => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], itemImgUrl: base64 } } }))} className="block w-full text-xs text-slate-500 file:ml-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded p-1" />
                            {settings.models[model]?.itemImgUrl && (
                              <div className="mt-3 relative inline-block">
                                <img src={settings.models[model].itemImgUrl} alt="" className="h-20 object-contain rounded border border-slate-200 p-1" />
                                <button onClick={() => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], itemImgUrl: '' } } })} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 hover:bg-red-200"><X className="w-3 h-3"/></button>
                              </div>
                            )}
                        </div>
                        <div className="bg-white p-3 rounded border border-slate-200">
                            <label className="block text-xs font-bold text-slate-700 mb-2 flex items-center gap-1"><FileText className="w-4 h-4"/> העלה סרטוט טכני</label>
                            <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, (base64) => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], blueprintUrl: base64 } } }))} className="block w-full text-xs text-slate-500 file:ml-4 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer border border-slate-200 rounded p-1" />
                            {settings.models[model]?.blueprintUrl && (
                              <div className="mt-3 relative inline-block">
                                <img src={settings.models[model].blueprintUrl} alt="" className="h-20 object-contain rounded border border-slate-200 p-1" />
                                <button onClick={() => setSettings({...settings, models: {...settings.models, [model]: { ...settings.models[model], blueprintUrl: '' } } })} className="absolute -top-2 -right-2 bg-red-100 text-red-600 rounded-full p-1 hover:bg-red-200"><X className="w-3 h-3"/></button>
                              </div>
                            )}
                        </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                <button onClick={saveSettings} className="bg-green-600 text-white px-8 py-2.5 rounded-md font-bold hover:bg-green-700 shadow-md">שמור שינויים בדגמים</button>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: SHIPMENTS --- */}
        {activeTab === 'shipments' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">ניהול משלוחים מסין</h2>
              <button onClick={() => { setEditingData({ name: '', date: new Date().toISOString().split('T')[0], status: 'ordered', exchangeRate: 3.7, shippingCostUSD: 0, shippingCostILS: 0, totalCbm: 0, lines: [{model: modelsList[0] || '', qty: 1, unitCostUSD: 0}] }); setIsShipmentModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"><Plus className="w-4 h-4"/> הוסף משלוח חדש</button>
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
                          <select className={`text-xs font-bold rounded-md border-slate-300 p-1.5 shadow-sm ${s.status === 'in_warehouse' ? 'bg-green-50 text-green-700' : 'bg-white'}`} value={s.status || 'ordered'} onChange={(e) => handleShipmentStatusSelect(s, e.target.value)}>
                            {Object.entries(SHIPMENT_STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{s.arrivalDate ? new Date(s.arrivalDate).toLocaleDateString('he-IL') : '---'}</td>
                        <td className="px-4 py-3 text-slate-600"><div className="font-medium">${factoryTotalUSD.toLocaleString()}</div><div className="text-xs">(₪{(factoryTotalUSD * Number(s.exchangeRate)).toLocaleString()})</div></td>
                        <td className="px-4 py-3 text-slate-600"><div className="font-medium text-indigo-700">₪{shippingTotalILS.toLocaleString()}</div></td>
                        <td className="px-4 py-3 text-left"><button onClick={() => { setEditingData(s); setIsShipmentModalOpen(true); }} className="text-indigo-600 bg-indigo-50 p-1.5 rounded ml-2"><Edit className="w-4 h-4"/></button><button onClick={() => deleteDocHandler('crm_shipments', s.id)} className="text-red-500 bg-red-50 p-1.5 rounded"><Trash2 className="w-4 h-4"/></button></td>
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
                                      <td className="px-3 py-2 text-left"><button onClick={(e) => { e.stopPropagation(); setEditingData({...item, isGlobalSale: false}); setIsItemModalOpen(true); }} className="text-indigo-600 bg-indigo-50 p-1 rounded"><Edit className="w-3.5 h-3.5"/></button></td>
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
              <button onClick={() => { setShowQuickImport(false); setQuickImportText(''); setCustomerEditingData({ contactName: '', phone: '', businessName: '', companyName: '', businessType: 'bar', hp: '', email: '', address: '', status: 'lead', notes: '' }); setIsCustomerModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"><UserPlus className="w-4 h-4"/> הוסף לקוח / ליד חדש</button>
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
                .map(c => {
                const stat = calculatedData.customerStats[c.id];
                const isActiveCustomer = stat?.activeWarranties > 0 || (c.status === 'active' && stat?.itemCount > 0);
                
                return (
                  <div key={c.id} className="bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col h-full">
                    <div className="p-5 flex-1">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${isActiveCustomer ? 'bg-green-100 text-green-700' : c.status === 'lead' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            <User className="w-5 h-5"/>
                          </div>
                          <div>
                            <h3 className="font-bold text-lg text-slate-800">{c.businessName || c.contactName}</h3>
                            {c.businessName && c.contactName && <p className="text-xs text-slate-500 mb-1">{c.contactName}</p>}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${c.status === 'lead' ? 'bg-blue-100 text-blue-700' : isActiveCustomer ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                              {c.status === 'lead' ? 'ליד מתעניין' : isActiveCustomer ? 'לקוח פעיל (באחריות)' : 'לקוח עבר'}
                            </span>
                            {c.businessType && <span className="ml-1 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                              {c.businessType === 'bar' ? 'בר' : c.businessType === 'restaurant' ? 'מסעדה' : c.businessType === 'event_hall' ? 'אולם אירועים' : 'אחר'}
                            </span>}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => { setQuoteData({ customerId: c.id, items: [{ model: modelsList[0] || '', qty: 1, price: 0, customNotes: '' }], shippingCost: 0, date: todayStr }); setIsQuoteModalOpen(true); }} className="text-slate-400 hover:text-green-600 p-1" title="הפק הצעת מחיר"><FileText className="w-4 h-4"/></button>
                          <button onClick={() => { setShowQuickImport(false); setQuickImportText(''); setCustomerEditingData(c); setIsCustomerModalOpen(true); }} className="text-slate-400 hover:text-indigo-600 p-1"><Edit className="w-4 h-4"/></button>
                          <button onClick={() => deleteDocHandler('crm_customers', c.id)} className="text-slate-400 hover:text-red-500 p-1"><Trash2 className="w-4 h-4"/></button>
                        </div>
                      </div>
                      
                      <div className="space-y-2 mt-4 text-sm text-slate-600">
                        {c.phone && <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-slate-400"/> <a href={`tel:${c.phone}`} className="hover:text-indigo-600 hover:underline">{c.phone}</a></div>}
                        {c.email && <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-slate-400"/> {c.email}</div>}
                        {c.address && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400"/> {c.address}</div>}
                      </div>
                    </div>
                    
                    {activeCustomerTab === 'customers' && (
                      <div className="bg-slate-50 p-4 border-t border-slate-100 grid grid-cols-2 gap-4 text-center rounded-b-lg mt-auto relative">
                        <div>
                          <p className="text-xs text-slate-500 mb-1">רכישות</p>
                          <p className="font-bold text-slate-800">{stat?.itemCount || 0} ברים</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">סה"כ הכנסה</p>
                          <p className="font-bold text-indigo-700">₪{(stat?.totalRevenue || 0).toLocaleString()}</p>
                        </div>
                        {stat?.activeWarranties > 0 && (
                            <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-100 border border-green-200 text-green-700 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold shadow-sm">
                                <ShieldCheck className="w-3 h-3" /> {stat.activeWarranties} באחריות
                            </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {customers.filter(c => activeCustomerTab === 'leads' ? c.status === 'lead' : c.status !== 'lead').length === 0 && (
                <div className="col-span-full bg-white p-8 rounded-lg border border-slate-200 text-center text-slate-500">
                  <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="font-medium text-lg">אין נתונים להצגה ברשימה זו.</p>
                  <p className="text-sm">הוסף איש קשר חדש כדי להתחיל.</p>
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
              <button onClick={() => { setEditingData({ name: '', totalCost: 0, startDate: new Date().toISOString().split('T')[0], endDate: '' }); setIsCampaignModalOpen(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700 flex items-center gap-2"><Plus className="w-4 h-4"/> הוסף קמפיין</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {campaigns.map(c => {
                const stat = calculatedData.campaignStats[c.id];
                const costPerItem = stat?.itemCount > 0 ? stat.cost / stat.itemCount : 0;
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
                      <div className="flex justify-between"><span className="text-slate-500">ברים שנמכרו:</span> <span className="font-medium">{stat?.itemCount || 0} יח'</span></div>
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
              {settings.companyLogoUrl && (
                <div className="mt-4 border border-dashed border-slate-300 p-4 rounded-lg flex flex-col items-center bg-slate-50 relative">
                  <img src={settings.companyLogoUrl} alt="לוגו חברה" className="max-h-24 object-contain"/>
                  <button onClick={() => setSettings({...settings, companyLogoUrl: ''})} className="mt-3 text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1"><Trash2 className="w-3 h-3"/> הסר לוגו</button>
                </div>
              )}
            </div>

            {/* DANGER ZONE FOR RESET */}
            <div className="bg-red-50 p-6 border border-red-200 rounded-lg shadow-sm mt-8">
              <h2 className="text-xl font-bold text-red-800 mb-2 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-600"/> אזור סכנה: ניקוי שולחן (איפוס נתונים)</h2>
              <p className="text-sm text-red-600 mb-4 font-medium">כפתור זה ימחק את <strong>כל</strong> המשלוחים, הפריטים במלאי, והקמפיינים שקיימים במערכת בלחיצה אחת. (רשימת הדגמים שלך לא תימחק).</p>
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
            <button onClick={() => { setIsFabOpen(false); setEditingData({ isGlobalSale: true, status: 'sold', saleDate: new Date().toISOString().split('T')[0], warrantyMonths: 12, model: calculatedData.availableModelsInStock[0] || '', salePrice: 0, addOnPrice: 0, repairCost: 0, addOnCost: 0, campaignId: '', customerId: '' }); setIsItemModalOpen(true); }} className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap font-medium text-sm">
              <ShoppingCart className="w-4 h-4 text-green-600"/> מכירה חדשה (עדכון מלאי)
            </button>
            <button onClick={() => { setIsFabOpen(false); setShowQuickImport(false); setQuickImportText(''); setCustomerEditingData({ contactName: '', phone: '', businessName: '', companyName: '', businessType: 'bar', hp: '', email: '', address: '', status: 'lead', notes: '' }); setIsCustomerModalOpen(true); }} className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap font-medium text-sm">
              <UserPlus className="w-4 h-4 text-purple-600"/> הוספת לקוח / ליד
            </button>
            <button onClick={() => { setIsFabOpen(false); setQuoteData({ customerId: '', items: [{ model: modelsList[0] || '', qty: 1, price: 0, customNotes: '' }], shippingCost: 0, date: todayStr }); setIsQuoteModalOpen(true); }} className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap font-medium text-sm">
              <FileText className="w-4 h-4 text-blue-500"/> הצעת מחיר חדשה
            </button>
            <button onClick={() => { setIsFabOpen(false); setNewModelData({name:'', cbm:0}); setIsModelModalOpen(true); }} className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap font-medium text-sm">
              <PlusCircle className="w-4 h-4 text-blue-600"/> הוספת דגם חדש (CBM)
            </button>
            <button onClick={() => { setIsFabOpen(false); setEditingData({ name: '', totalCost: 0, startDate: new Date().toISOString().split('T')[0], endDate: '' }); setIsCampaignModalOpen(true); }} className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap font-medium text-sm">
              <Megaphone className="w-4 h-4 text-orange-600"/> קמפיין חדש
            </button>
          </div>
        )}
      </div>

      {/* --- MODALS --- */}

      {/* QUOTE APPROVAL MODAL */}
      {isQuoteApprovalModalOpen && quoteApprovalData && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
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
            
            <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
              
              {/* Sidebar Controls */}
              <div className="w-full lg:w-80 border-l border-slate-200 p-6 space-y-5 overflow-y-auto bg-white shrink-0">
                
                {/* CUSTOMER SELECTION */}
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-purple-900">בחר לקוח / ליד</label>
                    <button type="button" onClick={() => { setShowQuickImport(false); setQuickImportText(''); setCustomerEditingData({ contactName: '', phone: '', businessName: '', companyName: '', businessType: 'bar', hp: '', email: '', address: '', status: 'active', notes: '' }); setIsCustomerModalOpen(true); }} className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 bg-purple-100 px-2 py-1 rounded-md transition-colors"><Plus className="w-3 h-3"/> הוסף לקוח</button>
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

                <button onClick={handleGenerateQuotePDF} disabled={isGeneratingPDF || !quoteData.customerId} className="w-full bg-green-600 text-white p-4 rounded-lg font-bold flex justify-center items-center gap-2 hover:bg-green-700 disabled:opacity-50 transition-colors shadow-lg mt-8 text-lg">
                  {isGeneratingPDF ? 'מייצר מסמך ושומר...' : !quoteData.customerId ? 'אנא בחר לקוח תחילה' : <><Download className="w-6 h-6"/> שמור, והורד PDF</>}
                </button>
              </div>

              {/* PDF Preview Area */}
              <div className="flex-1 bg-slate-800 p-8 overflow-y-auto flex justify-center items-start">
                <div 
                  ref={quoteRef} 
                  className="bg-[#eae5dd] shadow-2xl relative" 
                  style={{ 
                    width: '210mm', 
                    minHeight: '297mm', 
                    padding: '20mm', 
                    boxSizing: 'border-box',
                    direction: 'rtl',
                    fontFamily: 'Arial, Helvetica, sans-serif',
                    color: '#000'
                  }}
                >
                  
                  {/* Header / Logo */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px', borderBottom: '2px solid #c91028', paddingBottom: '15px' }}>
                    <div style={{ width: '200px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                      {settings.companyLogoUrl ? (
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
                    <p style={{ margin: '3px 0' }}><strong>לכבוד:</strong> {currentCustomer.contactName || '---'} | {currentCustomer.companyName || currentCustomer.businessName || '---'}</p>
                    <p style={{ margin: '3px 0' }}><strong>כתובת:</strong> {currentCustomer.address || '---'}</p>
                    <p style={{ margin: '3px 0' }}><strong>ח.פ / ע.מ:</strong> {currentCustomer.hp || '---'}</p>
                    <p style={{ margin: '3px 0' }}><strong>תאריך:</strong> {new Date(quoteData.date).toLocaleDateString('he-IL')}</p>
                  </div>

                  <div style={{ textAlign: 'center', fontSize: '22px', fontWeight: 'bold', textDecoration: 'underline', margin: '30px 0' }}>הסכם הזמנה – ד.ש. לוגיסטיקה</div>

                  {/* Sections */}
                  <div style={{ fontSize: '13.5px', lineHeight: '1.4', textAlign: 'justify' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>1. מחיר ותנאי תשלום</strong><br/>מחיר ההזמנה הינו קבוע וסופי, ולא יחולו בו שינויים מכל סיבה שהיא, למעט עדכונים הנובעים משינויי מיסים החלים על פי דין. יש להסדיר את התשלום במלואו לפני מועד ההספקה.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>2. אחריות</strong><br/>המוצר יימסר עם אחריות למשך 6 חודשים ממועד אספקתו ללקוח, וזאת בכפוף ובכפוף מלא לתנאי האחריות כפי שנקבעו על ידי החברה. החברה לא תישא בכל אחריות לנזק, שבר, תקלה, פגם או אובדן שנגרמו למוצר, לציוד או לכל רכיב ממנו, במישרין או בעקיפין, עקב שימוש לא סביר, רשלנות, פעולה או מחדל של הלקוח ו/או מי מטעמו, לרבות שבר במוצר. במקרים כאמור, הלקוח יישא במלוא האחריות והעלויות הכרוכות בתיקון, החלפה או השבת המוצר לקדמותו, והחברה תהיה פטורה מכל טענה, דרישה או תביעה בקשר לכך.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>3. שירותי תיקונים לאחר תקופת האחריות</strong><br/>עם תום תקופת האחריות, החברה תעמיד לרשות הלקוח שירותי תיקונים ותחזוקה בתשלום, בהתאם למחירים ותנאים שייקבעו על ידה מעת לעת.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>4. מועדי אספקה</strong><br/>מועדי האספקה הנמסרים ללקוח ניתנים לצורכי הערכה בלבד, והם עשויים להשתנות בהתאם לנסיבות שונות. החברה לא תישא באחריות לכל דחייה או שינוי במועדי האספקה.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>5. הפרת התחייבויות הלקוח</strong><br/>במקרה שהלקוח לא יעמוד בהתחייבויותיו על פי הסכם זה, לרבות אי-תשלום במועדים שנקבעו, החברה תהא רשאית לבטל את אספקת הסחורה ו/או לחייב את הלקוח בגין החלק מההזמנה שכבר בוצע, ולמנוע אספקת יתרת ההזמנה.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>6. שמירת בעלות</strong><br/>המוצר יישאר רכושה הבלעדי של חברת ד.ש. לוגיסטיקה עד לפרעון מלא וסופי של כלל התשלומים על ידי הלקוח. במידה והתשלומים לא יפרעו במועדם ועל פי ההזמנה, תהא רשאית ד.ש. לוגיסטיקה, או מי מטעמה, ליטול את המוצר חזרה עד לפרעון סופי של כלל התשלומים.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>7. הזמנה ואספקה</strong><br/>החברה תספק ללקוח את המוצרים הקיימים במלאי, בתוך 10 ימי עסקים ממועד תשלום מלוא התמורה בגין המוצר. מועדי האספקה כפופים לשינויים בהתאם לנסיבות תפעוליות ובלתי צפויות, והחברה לא תישא באחריות לעיכובים כאמור.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>8. ביטול והחזרה</strong><br/>הלקוח יהיה רשאי, בהתאם להוראות הדין, לבטל את ההזמנה או להחזיר מוצר מדף שלא נעשה בו שימוש ושנשמר באריזתו המקורית, בתוך 14 ימים ממועד קבלתו. במקרה של ביטול או החזרה, החברה תהיה רשאית לגבות דמי ביטול בשיעור של 10% ממחיר ההזמנה. עלויות הובלה ושינוע יחולו על הלקוח בלבד.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>9. אחריות למוצרי מדף</strong><br/>מוצרי מדף יימסרו כשהם חדשים, באריזתם המקורית, וללא פגמים נראים לעין. האחריות על מוצרי המדף תחול בהתאם לאמור בסעיף 2 לעיל.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>10. אחריות מוגבלת</strong><br/>האחריות למוצר בהזמנה אישית תחול בהתאם לסעיף 2 לעיל, אולם לא תחול על פגמים, נזקים או סטיות הנובעים מהמפרט שנמסר על ידי הלקוח, מההדמיה שאושרה על ידו, או מהתאמות שבוצעו על פי בקשתו.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>11. הובלה ואיסוף עצמי</strong><br/>החברה מציעה ללקוח שירותי הובלה באמצעות מובילים חיצוניים, כמחווה שירותית בלבד. מובהר כי המוביל אינו עובד של חברת ד.ש. לוגיסטיקה ואינו פועל מטעמה, ועל כן החברה לא תישא בכל אחריות לנזקים או איחורים הנובעים מפעולות המוביל. עלות ההובלה תחול על הלקוח ותיקבע בהתאם למרחק ומיקום ההובלה. הלקוח רשאי לבחור באיסוף עצמי ממחסני החברה.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>12. אספקת בר ביניים (פתרון זמני)</strong><br/>כחלק מהשירות ללקוח, החברה רשאית לספק ללקוח בר ביניים שלם לשימוש זמני, עד לאספקת הבר המוזמן בייצור אישי. השימוש בבר הביניים ניתן ללא עלות נוספת בגין המוצר עצמו, אולם עלויות ההובלה והשינוע של בר זה יחולו על הלקוח בלבד. הלקוח מצהיר ומתחייב כי כל נזק שייגרם לבר הביניים במהלך תקופת השימוש בו יהיה באחריותו הבלעדית. עם הגעת הבר המוזמן, מתחייב הלקוח להשיב לחברה את בר הביניים באופן מיידי כשהוא תקין.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>13. כוח עליון</strong><br/>החברה לא תישא באחריות לאי־קיום או לעיכוב בקיום התחייבויותיה עקב אירועים שאינם בשליטתה.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>14. תחולת דין ושיפוט</strong><br/>הסכם זה וכל הנובע ממנו יפורשו ויפורטו לפי דיני מדינת ישראל בלבד. סמכות השיפוט הבלעדית תהא נתונה לבית המשפט המוסמך במחוז תל אביב-מרכז.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>15. סודיות ואי־גילוי</strong><br/>הצדדים מתחייבים לשמור בסודיות כל מידע עסקי, טכני או מסחרי שיתגלה להם.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>16. תקשורת בין הצדדים</strong><br/>כל הודעה תימסר בכתב, באמצעות דוא"ל, דואר רשום, וואטסאפ או כל אמצעי תקשורת אחר שהוסכם.
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <strong style={{ display: 'inline-block', marginBottom: '3px', fontSize: '14px' }}>17. שונות</strong><br/>א. כותרות הסעיפים נועדו לנוחות בלבד.<br/>ב. כל שינוי או תוספת ייעשו באישור שני הצדדים.
                    </div>
                  </div>

                  {/* Order Details */}
                  <div style={{ marginTop: '25px', background: 'rgba(255,255,255,0.6)', padding: '15px', border: '1px solid #ddd', fontSize: '13.5px' }}>
                    <strong style={{ fontSize: '14px' }}>18. פירוט הזמנה</strong>
                    <ul style={{ margin: '10px 0', paddingRight: '20px' }}>
                        {quoteData.items.map((item: any, idx: number) => (
                           <li key={idx} style={{ marginBottom: '5px' }}>שם דגם: {item.model}, כמות: {item.qty}, מחיר יחידה: {Number(item.price).toLocaleString()} ש"ח + מע"מ
                             {item.customNotes && <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>הערות לדגם: {item.customNotes}</div>}
                           </li>
                        ))}
                        {(quoteData.shippingCost > 0) && (
                          <li style={{ marginBottom: '5px', marginTop: '10px', fontWeight: 'bold' }}>עלות משלוח: {Number(quoteData.shippingCost).toLocaleString()} ש"ח + מע"מ</li>
                        )}
                    </ul>
                    <div style={{ marginTop: '15px', fontWeight: 'bold', fontSize: '15px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
                        {(() => {
                           const itemsTotal = quoteData.items.reduce((sum: number, item: any) => sum + (Number(item.price) * Number(item.qty)), 0);
                           const grandTotal = itemsTotal + Number(quoteData.shippingCost || 0);
                           return (
                               <>
                                סה"כ לתשלום לפני מע"מ: {grandTotal.toLocaleString()} ש"ח<br/>
                                סה"כ לתשלום כולל מע"מ (18%): {(grandTotal * 1.18).toLocaleString()} ש"ח
                               </>
                           );
                        })()}
                    </div>
                  </div>

                  {/* Mockups */}
                  {quoteData.items.some((item: any) => settings.models[item.model]?.blueprintUrl || settings.models[item.model]?.itemImgUrl) && (
                    <div style={{ marginTop: '30px', fontSize: '13.5px', pageBreakInside: 'avoid' }}>
                      <strong style={{ fontSize: '14px' }}>19. הדמיות מאושרות</strong><br/>
                      להלן סרטוטים ותמונות הדמיה עבור הפריטים שהוזמנו:
                      
                      {quoteData.items.map((item: any, idx: number) => {
                         const modelSettings = settings.models[item.model] || {};
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
                          <strong>שם וחתימת הלקוח ({currentCustomer.contactName || '---'})</strong>
                      </div>
                      <div style={{ width: '40%', textAlign: 'center', borderTop: '1px solid #000', paddingTop: '10px' }}>
                          <strong>שם וחתימת נציג ד.ש. לוגיסטיקה<br/>(שחף שלום / דניאל יוסף)</strong>
                      </div>
                  </div>

                </div>
              </div>

            </div>
          </div>
        </div>
        );
      })()}
      
      {/* 1. Item Edit / New Sale Modal */}
      {isItemModalOpen && editingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-slate-800">
                {editingData.isGlobalSale ? '🛒 מכירה חדשה (משיכת פריט מהמלאי הפנוי)' : `עריכת פריט ספציפי`}
              </h3>
              <button onClick={() => setIsItemModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>
            <form onSubmit={saveItem} className="p-5 space-y-5">
              
              {/* בחירת דגם - שונה בין עריכה רגילה למכירה גלובלית */}
              <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                {editingData.isGlobalSale ? (
                  <div>
                    <label className="block text-sm font-bold text-blue-900 mb-2">בחר דגם למכירה מתוך המלאי הזמין כרגע במחסן:</label>
                    {calculatedData.availableModelsInStock.length > 0 ? (
                      <select required className="w-full border-slate-300 rounded-md p-3 text-base bg-white shadow-sm font-bold text-slate-800 focus:border-blue-500 focus:ring-blue-500" value={editingData.model} onChange={e => setEditingData({...editingData, model: e.target.value})}>
                        <option value="" disabled>-- בחר דגם --</option>
                        {calculatedData.availableModelsInStock.map((m: any) => <option key={m} value={m}>{m} ({calculatedData.stockInWarehouse[m]} פנויים)</option>)}
                      </select>
                    ) : (
                      <div className="text-red-600 font-bold p-2 bg-red-100 rounded border border-red-200">אין פריטים פנויים במחסן לאף דגם!</div>
                    )}
                  </div>
                ) : (
                   <div>
                    <label className="block text-sm font-bold text-blue-900 mb-2">דגם (נעול - עריכת פריט ספציפי)</label>
                    <input type="text" disabled className="w-full border-slate-200 rounded-md p-3 text-base bg-slate-100 font-bold text-slate-500 cursor-not-allowed" value={editingData.model} />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">סטטוס פריט</label>
                  {editingData.isGlobalSale ? (
                    <select className="w-full border-slate-300 rounded-md p-2.5 border bg-slate-100 font-medium text-slate-500 cursor-not-allowed" value="sold" disabled><option value="sold">נמכר ללקוח</option></select>
                  ) : (
                    <select className="w-full border-slate-300 rounded-md p-2.5 border bg-slate-50 font-medium" value={editingData.status} onChange={e => setEditingData({...editingData, status: e.target.value})} disabled={editingData.shipmentStatus !== 'in_warehouse'}>
                      {editingData.shipmentStatus !== 'in_warehouse' && editingData.status !== 'sold' ? <option value={editingData.status}>{STATUS_MAP[editingData.status]} (נעול עד הגעה)</option> : <><option value="in_warehouse">במחסן (זמין למכירה)</option><option value="sold">נמכר ללקוח</option></>}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">תאריך מכירה {editingData.status === 'sold' && <span className="text-red-500">*</span>}</label>
                  <input type="date" required={editingData.status === 'sold'} className="w-full border-slate-300 rounded-md p-2.5 text-sm" disabled={editingData.status !== 'sold'} value={editingData.saleDate || ''} onChange={e => setEditingData({...editingData, saleDate: e.target.value})} />
                </div>
              </div>

              {/* Customer Selection block */}
              {editingData.status === 'sold' && (
                <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-bold text-purple-900">שיוך ללקוח רוכש</label>
                    <button type="button" onClick={() => { setShowQuickImport(false); setQuickImportText(''); setCustomerEditingData({ contactName: '', phone: '', businessName: '', companyName: '', businessType: 'bar', hp: '', email: '', address: '', status: 'active', notes: '' }); setIsCustomerModalOpen(true); }} className="text-xs font-bold text-purple-700 hover:text-purple-900 flex items-center gap-1 bg-purple-100 px-2 py-1 rounded-md transition-colors"><Plus className="w-3 h-3"/> הוסף לקוח חדש</button>
                  </div>
                  <select className="w-full border-purple-300 rounded-md p-2.5 text-base bg-white shadow-sm font-medium text-slate-800 focus:border-purple-500 focus:ring-purple-500" value={editingData.customerId || ''} onChange={e => setEditingData({...editingData, customerId: e.target.value})}>
                    <option value="">-- ללא שיוך לקוח -- (לא מומלץ)</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.businessName || c.contactName} {c.phone ? `- ${c.phone}` : ''}</option>)}
                  </select>
                  
                  {/* Warranty Selection */}
                  <div className="mt-4 pt-4 border-t border-purple-200">
                    <label className="block text-sm font-bold text-purple-900 mb-2 flex items-center gap-2"><ShieldCheck className="w-4 h-4"/> תקופת אחריות ללקוח (בחודשים)</label>
                    <div className="flex items-center gap-3">
                        <input type="range" min="0" max="12" className="w-full h-2 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600" value={editingData.warrantyMonths || 0} onChange={e => setEditingData({...editingData, warrantyMonths: Number(e.target.value)})} />
                        <span className="font-bold text-lg text-purple-800 w-16 text-center bg-white border border-purple-300 rounded-md py-1">{editingData.warrantyMonths || 0} <span className="text-xs font-normal">חוד'</span></span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 bg-orange-50/50 p-4 rounded-lg border border-orange-100">
                  <div><label className="block text-xs font-medium text-slate-700 mb-1">עלות תיקונים בארץ (לעסק)</label><input type="number" step="0.01" className="w-full border-slate-300 rounded-md p-2.5 text-sm" value={editingData.repairCost || 0} onChange={e => setEditingData({...editingData, repairCost: Number(e.target.value)})} /></div>
                  <div><label className="block text-xs font-medium text-slate-700 mb-1">עלות תוספות (חומרים/עבודה לעסק)</label><input type="number" step="0.01" className="w-full border-slate-300 rounded-md p-2.5 text-sm" value={editingData.addOnCost || 0} onChange={e => setEditingData({...editingData, addOnCost: Number(e.target.value)})} /></div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <label className="block text-sm font-bold text-slate-700 mb-2">שיוך לקמפיין שיווקי (אופציונלי)</label>
                <select className="w-full border-slate-300 rounded-md p-2.5 text-sm bg-white" value={editingData.campaignId || ''} onChange={e => setEditingData({...editingData, campaignId: e.target.value})}>
                  <option value="">ללא שיוך קמפיין</option>
                  {campaigns.filter(c => {
                    const isStarted = !c.startDate || c.startDate <= todayStr;
                    const isNotTooOld = !c.endDate || c.endDate >= thirtyDaysAgoStr;
                    return (isStarted && isNotTooOld) || c.id === editingData.campaignId;
                  }).map(c => {
                    const isCurrentlyActive = (!c.startDate || c.startDate <= todayStr) && (!c.endDate || c.endDate >= todayStr);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.name} {!isCurrentlyActive ? ' (הסתיים לאחרונה)' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-green-800 mb-1">מחיר מכירה בסיס (לבר)</label><input type="number" step="0.01" className="w-full border-green-300 rounded-md p-2.5 font-bold text-green-700" value={editingData.salePrice || 0} onChange={e => setEditingData({...editingData, salePrice: Number(e.target.value)})} /></div>
                  <div><label className="block text-xs font-medium text-green-800 mb-1">תמחור תוספות (הכנסה מתוספת)</label><input type="number" step="0.01" className="w-full border-green-300 rounded-md p-2.5 font-bold text-green-700" value={editingData.addOnPrice || 0} onChange={e => setEditingData({...editingData, addOnPrice: Number(e.target.value)})} /></div>
                </div>
              </div>

              {/* ולידציות שמירה */}
              {editingData.status !== 'sold' && (
                <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm font-bold text-center border border-red-200 flex items-center justify-center gap-2 mt-4">
                  <AlertTriangle className="w-5 h-5" /> <span>לא ניתן לשמור. הסטטוס אינו מוגדר כ"נמכר ללקוח".</span>
                </div>
              )}
              {editingData.status === 'sold' && !editingData.saleDate && (
                <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm font-bold text-center border border-red-200 flex items-center justify-center gap-2 mt-4">
                  <AlertTriangle className="w-5 h-5" /> <span>יש להזין תאריך מכירה.</span>
                </div>
              )}
              {editingData.isGlobalSale && !editingData.model && (
                <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm font-bold text-center border border-red-200 flex items-center justify-center gap-2 mt-4">
                  <AlertTriangle className="w-5 h-5" /> <span>חובה לבחור דגם מתוך המלאי הקיים.</span>
                </div>
              )}

              <button type="submit" disabled={isSaving || editingData.status !== 'sold' || (editingData.status === 'sold' && !editingData.saleDate) || (editingData.isGlobalSale && !editingData.model)} className="w-full bg-indigo-600 text-white py-3 rounded-md font-bold hover:bg-indigo-700 mt-4 disabled:opacity-50 disabled:cursor-not-allowed shadow-md text-lg">
                {isSaving ? 'מעדכן נתונים...' : 'שמור מכירה ועדכן מלאי'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 2. Campaign Modal */}
      {isCampaignModalOpen && editingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2"><Megaphone className="w-5 h-5 text-indigo-600"/> עריכת קמפיין שיווקי</h3>
             <form onSubmit={saveCampaign} className="space-y-4">
                <div><label className="block text-sm font-medium mb-1">שם הקמפיין</label><input required type="text" className="border border-slate-300 p-2 rounded w-full" value={editingData.name} onChange={e => setEditingData({...editingData, name: e.target.value})} placeholder="לדוגמה: מבצע פסח 2024" /></div>
                <div><label className="block text-sm font-medium mb-1">עלות כוללת (₪)</label><input required type="number" min="0" className="border border-slate-300 p-2 rounded w-full bg-indigo-50 font-bold" value={editingData.totalCost} onChange={e => setEditingData({...editingData, totalCost: Number(e.target.value)})} /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-sm font-medium mb-1">תאריך התחלה</label><input type="date" className="border border-slate-300 p-2 rounded w-full" value={editingData.startDate} onChange={e => setEditingData({...editingData, startDate: e.target.value})} /></div>
                  <div><label className="block text-sm font-medium mb-1">תאריך סיום (אופציונלי)</label><input type="date" className="border border-slate-300 p-2 rounded w-full" value={editingData.endDate} onChange={e => setEditingData({...editingData, endDate: e.target.value})} /></div>
                </div>
                <div className="flex gap-2 mt-6 pt-4 border-t"><button type="submit" className="bg-indigo-600 text-white p-2 rounded flex-1 font-bold">שמור קמפיין</button><button type="button" onClick={()=>setIsCampaignModalOpen(false)} className="bg-slate-200 text-slate-700 p-2 rounded px-4 font-medium">ביטול</button></div>
             </form>
          </div>
        </div>
      )}

      {/* Customer Modal (z-index increased to 100 so it overlays Quote Modal) */}
      {isCustomerModalOpen && customerEditingData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><UserPlus className="w-5 h-5 text-indigo-600"/> {customerEditingData.id ? 'עריכת פרטי לקוח' : 'הוספת לקוח/ליד חדש'}</h3>
              <button onClick={() => setIsCustomerModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5"/></button>
            </div>

            {/* QUICK IMPORT SECTION */}
            <div className="px-6 pt-5 pb-0">
              {!showQuickImport ? (
                <button type="button" onClick={() => setShowQuickImport(true)} className="w-full bg-green-50 border border-green-200 text-green-700 py-2.5 rounded-md text-sm font-bold flex justify-center items-center gap-2 hover:bg-green-100 transition-colors">
                  <Sparkles className="w-4 h-4"/> הדבקה חכמה של לקוח מוואטסאפ (ייבוא מהיר)
                </button>
              ) : (
                <div className="bg-green-50 border border-green-200 p-4 rounded-md space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center">
                     <label className="text-sm font-bold text-green-800">הדבק כאן את הודעת הוואטסאפ (לפי סדר המספרים 1 עד 8):</label>
                     <button type="button" onClick={() => setShowQuickImport(false)} className="text-green-600 hover:text-green-800 bg-green-100 p-1 rounded-md"><X className="w-4 h-4"/></button>
                  </div>
                  <textarea
                    className="w-full border border-green-300 rounded p-3 text-sm focus:ring-green-500 min-h-[120px] bg-white outline-none"
                    placeholder={`1. שם איש הקשר\n2. שם הבר / מסעדה\n3. שם החברה\n4. סוג העסק (בר, מסעדה, אולם, אחר)\n5. ח.פ\n6. אימייל\n7. טלפון\n8. כתובת`}
                    value={quickImportText}
                    onChange={e => setQuickImportText(e.target.value)}
                    dir="rtl"
                  />
                  <button type="button" onClick={processQuickImport} className="bg-green-600 text-white px-4 py-2.5 rounded-md text-sm font-bold w-full hover:bg-green-700 shadow-sm">
                    חלץ פרטים ומלא את הטופס
                  </button>
                </div>
              )}
            </div>

             <form onSubmit={saveCustomer} className="p-6 space-y-6">
                
                {/* Contact Info Section */}
                <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                  <h4 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><User className="w-4 h-4"/> פרטי איש קשר</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">שם איש הקשר <span className="text-red-500">*</span></label>
                      <input required type="text" className="border border-slate-300 p-2.5 rounded-md w-full bg-white focus:ring-indigo-500 focus:border-indigo-500" value={customerEditingData.contactName} onChange={e => setCustomerEditingData({...customerEditingData, contactName: e.target.value})} placeholder="שם מלא" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">מספר טלפון של איש הקשר</label>
                      <input type="tel" className="border border-slate-300 p-2.5 rounded-md w-full bg-white focus:ring-indigo-500 focus:border-indigo-500" value={customerEditingData.phone} onChange={e => setCustomerEditingData({...customerEditingData, phone: e.target.value})} placeholder="050-0000000" dir="ltr" />
                    </div>
                  </div>
                </div>

                {/* Business Info Section */}
                <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                  <h4 className="text-sm font-bold text-blue-800 mb-4 flex items-center gap-2"><Settings className="w-4 h-4"/> פרטי העסק</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">שם העסק</label>
                      <input type="text" className="border border-slate-300 p-2.5 rounded-md w-full bg-white focus:ring-indigo-500 focus:border-indigo-500" value={customerEditingData.businessName} onChange={e => setCustomerEditingData({...customerEditingData, businessName: e.target.value})} placeholder="שם המותג/העסק" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">שם החברה</label>
                      <input type="text" className="border border-slate-300 p-2.5 rounded-md w-full bg-white focus:ring-indigo-500 focus:border-indigo-500" value={customerEditingData.companyName} onChange={e => setCustomerEditingData({...customerEditingData, companyName: e.target.value})} placeholder="שם חברה משפטי" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">סוג העסק</label>
                      <select className="border border-slate-300 p-2.5 rounded-md w-full bg-white focus:ring-indigo-500 focus:border-indigo-500" value={customerEditingData.businessType || 'bar'} onChange={e => setCustomerEditingData({...customerEditingData, businessType: e.target.value})}>
                        <option value="bar">בר</option>
                        <option value="restaurant">מסעדה</option>
                        <option value="event_hall">אולם אירועים</option>
                        <option value="other">אחר</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">ח.פ / עוסק מורשה</label>
                      <input type="text" className="border border-slate-300 p-2.5 rounded-md w-full bg-white focus:ring-indigo-500 focus:border-indigo-500" value={customerEditingData.hp} onChange={e => setCustomerEditingData({...customerEditingData, hp: e.target.value})} placeholder="מספר ח.פ" dir="ltr" />
                    </div>
                  </div>
                </div>

                {/* Additional Info Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">סטטוס (ידני)</label>
                    <select className="border border-slate-300 p-2.5 rounded-md w-full bg-slate-50 font-medium focus:ring-indigo-500 focus:border-indigo-500" value={customerEditingData.status} onChange={e => setCustomerEditingData({...customerEditingData, status: e.target.value})}>
                      <option value="lead">ליד (מתעניין)</option>
                      <option value="active">לקוח (רוכש)</option>
                      <option value="past">לקוח עבר</option>
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">הערה: לקוח עם אחריות בתוקף יוצג אוטומטית כ"לקוח פעיל".</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">אימייל לקבלת מסמכים</label>
                    <input type="email" className="border border-slate-300 p-2.5 rounded-md w-full bg-white focus:ring-indigo-500 focus:border-indigo-500" value={customerEditingData.email} onChange={e => setCustomerEditingData({...customerEditingData, email: e.target.value})} placeholder="email@example.com" dir="ltr" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">כתובת העסק</label>
                  <input type="text" className="border border-slate-300 p-2.5 rounded-md w-full bg-white focus:ring-indigo-500 focus:border-indigo-500" value={customerEditingData.address} onChange={e => setCustomerEditingData({...customerEditingData, address: e.target.value})} placeholder="רחוב, עיר (למשלוח והתקנה)" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">הערות נוספות</label>
                  <textarea className="border border-slate-300 p-2.5 rounded-md w-full min-h-[80px] bg-white focus:ring-indigo-500 focus:border-indigo-500" value={customerEditingData.notes} onChange={e => setCustomerEditingData({...customerEditingData, notes: e.target.value})} placeholder="דרישות מיוחדות, סיכומים..."></textarea>
                </div>

                <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200">
                  <button type="submit" disabled={isSaving} className="bg-indigo-600 text-white p-3 rounded-md flex-1 font-bold shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg">
                    {isSaving ? 'שומר...' : 'שמור פרטי לקוח'}
                  </button>
                  <button type="button" onClick={()=>setIsCustomerModalOpen(false)} className="bg-slate-200 text-slate-700 p-3 rounded-md px-8 font-medium hover:bg-slate-300 transition-colors">ביטול</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* 3. New Model Modal */}
      {isModelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold mb-4 border-b pb-2 flex items-center gap-2"><Layers className="w-5 h-5 text-indigo-600"/> הוספת דגם חדש למערכת</h3>
             <form onSubmit={handleAddNewModelWithData} className="space-y-4">
                <div><label className="block text-sm font-medium mb-1">שם הדגם</label><input required type="text" className="border border-slate-300 p-2 rounded w-full" value={newModelData.name} onChange={e => setNewModelData({...newModelData, name: e.target.value})} placeholder="לדוגמה: Premium Bar" /></div>
                <div><label className="block text-sm font-medium mb-1">נפח (CBM)</label><input required type="number" step="0.01" min="0" className="border border-slate-300 p-2 rounded w-full font-bold" value={newModelData.cbm} onChange={e => setNewModelData({...newModelData, cbm: e.target.value as unknown as number})} placeholder="0.00" /></div>
                <div className="flex gap-2 mt-6 pt-4 border-t"><button type="submit" className="bg-indigo-600 text-white p-2 rounded flex-1 font-bold">הוסף דגם ושמור</button><button type="button" onClick={()=>setIsModelModalOpen(false)} className="bg-slate-200 text-slate-700 p-2 rounded px-4 font-medium">ביטול</button></div>
             </form>
          </div>
        </div>
      )}

      {/* 4. Shipment Modal */}
      {isShipmentModalOpen && editingData && (
        <div className="fixed inset-0 z-[45] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
            <h3 className="text-lg font-bold mb-4">עריכת משלוח</h3>
             <form onSubmit={saveShipment} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <input required type="text" className="border p-2 rounded w-full" value={editingData.name} onChange={e => setEditingData({...editingData, name: e.target.value})} placeholder="שם משלוח" />
                <input required type="date" className="border p-2 rounded w-full" value={editingData.date} onChange={e => setEditingData({...editingData, date: e.target.value})} />
              </div>
              <div className="bg-indigo-50 p-4 rounded">
                <button type="button" onClick={() => setEditingData({...editingData, lines: [...(editingData.lines||[]), {model: modelsList[0]||'', qty:1, unitCostUSD:0}]})} className="mb-2 text-indigo-600 text-sm font-bold">+ הוסף דגם למשלוח</button>
                {(editingData.lines || []).map((line: any, idx: number) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <select className="border p-1 rounded flex-1" value={line.model} onChange={e => { const nl=[...editingData.lines]; nl[idx].model=e.target.value; setEditingData({...editingData, lines:nl}); }}>{modelsList.map(m=><option key={m} value={m}>{m}</option>)}</select>
                    <input type="number" min="1" className="border p-1 rounded w-20" value={line.qty} onChange={e => { const nl=[...editingData.lines]; nl[idx].qty=Number(e.target.value); setEditingData({...editingData, lines:nl}); }} placeholder="כמות"/>
                    <input type="number" step="0.01" className="border p-1 rounded w-24" value={line.unitCostUSD} onChange={e => { const nl=[...editingData.lines]; nl[idx].unitCostUSD=Number(e.target.value); setEditingData({...editingData, lines:nl}); }} placeholder="מחיר $"/>
                    <button type="button" onClick={() => { const newLines = editingData.lines.filter((_: any, i: number) => i !== idx); setEditingData({...editingData, lines: newLines}); }} className="text-red-500"><Trash2 className="w-4 h-4"/></button>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2 bg-slate-50 p-4 rounded border">
                 <div><label className="text-xs">עלות שילוח $</label><input type="number" className="w-full border p-1" value={editingData.shippingCostUSD} onChange={e=>setEditingData({...editingData, shippingCostUSD:Number(e.target.value)})}/></div>
                 <div><label className="text-xs">עלות שילוח ₪</label><input type="number" className="w-full border p-1" value={editingData.shippingCostILS} onChange={e=>setEditingData({...editingData, shippingCostILS:Number(e.target.value)})}/></div>
                 <div><label className="text-xs">סה"כ CBM במכולה</label><input type="number" className="w-full border p-1" value={editingData.totalCbm} onChange={e=>setEditingData({...editingData, totalCbm:Number(e.target.value)})}/></div>
                 <div className="col-span-3"><label className="text-xs text-blue-600 font-bold">שער דולר רציף</label><input type="number" className="w-full border p-1 bg-blue-50" value={editingData.exchangeRate} onChange={e=>setEditingData({...editingData, exchangeRate:Number(e.target.value)})}/></div>
              </div>
              <div className="flex gap-2"><button type="submit" className="bg-indigo-600 text-white p-2 rounded flex-1">שמור משלוח</button><button type="button" onClick={()=>setIsShipmentModalOpen(false)} className="bg-slate-200 p-2 rounded">ביטול</button></div>
             </form>
          </div>
        </div>
      )}

      {/* Arrival Prompt */}
      {arrivalPrompt.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-xl w-full max-w-sm">
            <h3 className="font-bold text-lg mb-2">קליטת משלוח למחסן</h3>
            <label className="block text-sm mb-1">תאריך הגעה בפועל</label>
            <input type="date" className="w-full border p-2 rounded mb-4" value={arrivalPrompt.date} onChange={e => setArrivalPrompt({...arrivalPrompt, date: e.target.value})} />
            <div className="flex gap-2"><button onClick={() => { confirmShipmentStatusUpdate(arrivalPrompt.shipment, 'in_warehouse', arrivalPrompt.date || new Date().toISOString().split('T')[0]); setArrivalPrompt({ isOpen: false, shipment: null, date: '' }); }} className="bg-indigo-600 text-white p-2 rounded flex-1">אישור</button><button onClick={()=>setArrivalPrompt({ isOpen: false, shipment: null, date: '' })} className="bg-slate-200 p-2 rounded">ביטול</button></div>
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
                    .sort((a, b) => (b[1] as number) - (a[1] as number)) // Sort by highest quantity first
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