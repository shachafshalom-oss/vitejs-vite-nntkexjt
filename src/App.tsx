import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, collection, onSnapshot, doc, setDoc, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { Plus, Edit, Trash2, Package, TrendingUp, DollarSign, Activity, X, Ship, Megaphone, Settings, Layers, ChevronDown, ChevronUp, AlertTriangle, Sparkles, LogOut, Lock, ShoppingCart, PlusCircle } from 'lucide-react';

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
const defaultSettings: any = { 'Prime': { cbm: 1.2 }, 'Night': { cbm: 1.0 }, 'Urban': { cbm: 1.5 }, 'Events': { cbm: 2.0 } };

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(true);

  // Data States
  const [settings, setSettings] = useState<any>(defaultSettings);
  const [shipments, setShipments] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const modelsList = useMemo(() => Object.keys(settings), [settings]);

  // Modal & UI States
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState(false);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isFabOpen, setIsFabOpen] = useState(false);
  
  const [newModelName, setNewModelName] = useState('');
  const [newModelData, setNewModelData] = useState({ name: '', cbm: 0 });
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [arrivalPrompt, setArrivalPrompt] = useState<{isOpen: boolean, shipment: any, date: string}>({ isOpen: false, shipment: null, date: '' });

  // AI Feature States
  const [aiInsight, setAiInsight] = useState('');
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // --- Date Calculations for Campaigns ---
  const todayStr = new Date().toISOString().split('T')[0];
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
      const settingsDoc = docs.find((d: any) => d.id === 'general_cbm');
      if (settingsDoc && settingsDoc.models) setSettings(settingsDoc.models);
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
      setLoading(false);
    });

    return () => { unsubSettings(); unsubShipments(); unsubItems(); unsubCampaigns(); };
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

    let inWarehouseCount = 0;
    let totalInventoryValueILS = 0;
    let totalProfit = 0;
    let soldCount = 0;
    
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);
    
    const stockInWarehouse: any = {};
    const stockOnTheWay: any = {};
    const salesInLast30: any = {};
    
    modelsList.forEach(m => { stockInWarehouse[m] = 0; stockOnTheWay[m] = 0; salesInLast30[m] = 0; });

    const enrichedItems = items.map(item => {
      const sStat = shipmentStats[item.shipmentId];
      const cbm = settings[item.model]?.cbm || 0;
      
      const factoryCostILS = sStat ? (Number(item.factoryUnitCostUSD) * sStat.exchangeRate) : 0;
      const importCostILS = sStat ? (sStat.costPerCbmILS * cbm) : 0;
      const repairCostILS = Number(item.repairCost) || 0;
      const addOnCostILS = Number(item.addOnCost) || 0;
      
      const marketingCostILS = (item.campaignId && campaignStats[item.campaignId]?.itemCount > 0)
        ? (campaignStats[item.campaignId].cost / campaignStats[item.campaignId].itemCount) : 0;

      const totalLandedCost = factoryCostILS + importCostILS + repairCostILS + addOnCostILS + marketingCostILS;
      const totalRevenue = (Number(item.salePrice) || 0) + (Number(item.addOnPrice) || 0);
      const profit = item.status === 'sold' ? totalRevenue - totalLandedCost : 0;

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
        if (item.saleDate && new Date(item.saleDate) >= last30Days) salesInLast30[item.model]++;
      }

      return {
        ...item, factoryCostILS, importCostILS, marketingCostILS, totalLandedCost, totalRevenue, profit,
        shipmentName: sStat?.name || 'לא ידוע', shipmentStatus: sStat?.status || 'ordered', campaignName: campaignStats[item.campaignId]?.name || 'ללא'
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

    // Generate a list of models currently in the warehouse
    const modelsInStock = Array.from(new Set(
      enrichedItems
        .filter(item => item.status === 'in_warehouse')
        .map(item => item.model)
    ));
    
    // רשימת דגמים שיש מהם כרגע מלאי פנוי למכירה (עבור כפתור מכירה חדשה)
    const availableModelsInStock = Object.keys(stockInWarehouse).filter(m => stockInWarehouse[m] > 0);

    return { enrichedItems, groupedInventory: groupedArray, shipmentStats, campaignStats, inWarehouseCount, totalInventoryValueILS, avgProfit: soldCount > 0 ? Math.round(totalProfit / soldCount) : 0, forecasts, modelsInStock, availableModelsInStock, stockInWarehouse };
  }, [items, shipments, campaigns, settings, modelsList]);

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
      const newSettings = { ...settings, [newModelName.trim()]: { cbm: 0 } };
      await setDoc(doc(db, 'crm_settings', 'general_cbm'), { models: newSettings });
      setNewModelName('');
    } catch(err) { console.error(err); }
  };
  
  const handleAddNewModelWithData = async (e: any) => {
      e.preventDefault();
      if (!newModelData.name.trim()) return;
      setIsSaving(true);
      try {
        const newSettings = { ...settings, [newModelData.name.trim()]: { cbm: Number(newModelData.cbm) || 0 } };
        await setDoc(doc(db, 'crm_settings', 'general_cbm'), { models: newSettings });
        setNewModelData({ name: '', cbm: 0 });
        setIsModelModalOpen(false);
      } catch(err) { alert("שגיאה בהוספת דגם"); }
      setIsSaving(false);
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
        // --- עדכון משלוח קיים - סנכרון פריטים חכם ---
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

          // 1. הוספת פריטים חסרים (אם הכמות גדלה)
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
          // 2. מחיקת פריטים עודפים (אם הכמות קטנה)
          else if (diff < 0) {
            const itemsToRemoveCount = Math.abs(diff);
            // מיון כך שקודם ימחקו פריטים שטרם נמכרו
            const sortedToRemove = [...currentModelItems].sort((a: any, b: any) => {
              if (a.status === 'sold' && b.status !== 'sold') return 1;
              if (a.status !== 'sold' && b.status === 'sold') return -1;
              return 0;
            });

            for (let i = 0; i < itemsToRemoveCount; i++) {
              if (sortedToRemove[i]) {
                await deleteDoc(doc(db, 'crm_items', sortedToRemove[i].id));
                sortedToRemove[i]._deleted = true; // סימון מקומי למניעת עדכונים בהמשך הלולאה
              }
            }
          }

          // 3. עדכון עלות יחידה לפריטים שנותרו
          const itemsToUpdateCost = currentModelItems.filter((i: any) => !i._deleted && Number(i.factoryUnitCostUSD) !== Number(line.unitCostUSD));
          for (const item of itemsToUpdateCost) {
            await updateDoc(doc(itemsRef, item.id), { factoryUnitCostUSD: Number(line.unitCostUSD), updatedAt: new Date().toISOString() });
          }
        }

        // 4. ניקוי דגמים שהוסרו לחלוטין (נמחקה שורה שלמה מהטופס)
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
        // --- יצירת משלוח חדש ---
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
      
      // אם זו מכירה גלובלית (דרך כפתור הפלוס) ולא פריט ספציפי
      if (data.isGlobalSale) {
        if (!data.model) throw new Error("חובה לבחור דגם");
        // חיפוש הפריט הראשון שפנוי במלאי מאותו דגם
        const availableItem = items.find(i => i.model === data.model && i.status === 'in_warehouse');
        if (!availableItem) throw new Error("אין פריטים פנויים מדגם זה במלאי ברגע זה.");
        
        const updatePayload = {
          status: 'sold',
          saleDate: data.saleDate || new Date().toISOString().split('T')[0],
          salePrice: Number(data.salePrice) || 0,
          addOnPrice: Number(data.addOnPrice) || 0,
          repairCost: Number(data.repairCost) || 0,
          addOnCost: Number(data.addOnCost) || 0,
          campaignId: data.campaignId || '',
          updatedAt: new Date().toISOString()
        };
        await updateDoc(doc(db, 'crm_items', availableItem.id), updatePayload);
      } 
      // עריכה של פריט ספציפי (דרך טבלת מלאי)
      else {
        if (data.status === 'sold' && !data.saleDate) data.saleDate = new Date().toISOString().split('T')[0];
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

  const saveSettings = async () => {
    try {
      await setDoc(doc(db, 'crm_settings', 'general_cbm'), { models: settings });
      alert("הגדרות נשמרו בהצלחה!");
    } catch (err) { alert("שגיאה בשמירה"); }
  };

  // מחיקה חכמה גם למשלוח שלם (מוחק את כל הפריטים שתחתיו כדי לא להשאיר זבל במסד הנתונים)
  const deleteDocHandler = async (collectionName: string, id: string) => {
    if (!window.confirm("בטוח שברצונך למחוק? הפעולה אינה ניתנת לביטול ותמחק גם את הפריטים המשויכים.")) return;
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

  // פונקציית איפוס מערכת מלא (מחיקת כל הנתונים)
  const handleResetSystem = async () => {
    const userConfirm = window.prompt("אזהרה קריטית! 🛑\nפעולה זו תמחק את *כל* המשלוחים, הפריטים והקמפיינים במערכת ולא ניתן לבטל אותה.\nלהמשך, הקלד את המילה 'מחק':");
    if (userConfirm !== 'מחק') return;
    
    setIsSaving(true);
    try {
      const collectionsToDelete = ['crm_shipments', 'crm_items', 'crm_campaigns'];
      
      for (const colName of collectionsToDelete) {
        const snapshot = await getDocs(collection(db, colName));
        const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, colName, d.id)));
        await Promise.all(deletePromises);
      }
      
      alert("כל הנתונים נמחקו בהצלחה! המערכת כעת נקייה ומוכנה לעבודה מחדש.");
      setActiveTab('dashboard'); // חזרה לדשבורד
    } catch (err) {
      console.error(err);
      alert("אירעה שגיאה במחיקת הנתונים. ודא שהרשאות הפיירבייס תקינות.");
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
              { id: 'shipments', icon: Ship, label: 'משלוחים' },
              { id: 'inventory', icon: Package, label: 'ניהול מלאי' },
              { id: 'models', icon: Layers, label: 'דגמים' },
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
              <div className="bg-white p-5 rounded-lg shadow-sm border border-slate-200 flex items-center gap-4">
                <div className="bg-indigo-100 p-3 rounded-full"><Package className="text-indigo-600 w-6 h-6"/></div>
                <div><p className="text-sm text-slate-500 font-medium">פריטים במלאי (זמינים)</p><p className="text-2xl font-bold text-slate-800">{calculatedData.inWarehouseCount}</p></div>
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

        {/* --- TAB: MODELS --- */}
        {activeTab === 'models' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold text-slate-800 mb-6">ניהול דגמי מוצרים</h2>
            <div className="bg-white p-6 border border-slate-200 rounded-lg shadow-sm">
              <form onSubmit={handleAddModel} className="flex gap-4 items-end mb-6">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">שם הדגם החדש</label>
                  <input type="text" required value={newModelName} onChange={e => setNewModelName(e.target.value)} className="w-full border-slate-300 rounded-md shadow-sm p-2 border" placeholder="לדוגמה: Premium Bar" />
                </div>
                <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-md font-medium hover:bg-indigo-700">הוסף דגם</button>
              </form>
              <h3 className="font-bold text-slate-700 mb-3 border-b pb-2">דגמים קיימים במערכת</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {modelsList.map(model => (
                  <div key={model} className="bg-slate-50 border border-slate-200 p-3 rounded text-center font-medium text-slate-800">{model}</div>
                ))}
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
                            <div className="bg-white border border-slate-200 rounded-md shadow-sm">
                              <table className="min-w-full divide-y divide-slate-100 text-xs">
                                <thead className="bg-slate-100 text-slate-500">
                                  <tr>
                                    <th className="px-3 py-2 text-right">סריאל/הערה</th>
                                    <th className="px-3 py-2 text-right">עלות (Landed)</th>
                                    <th className="px-3 py-2 text-right">התאמות</th>
                                    <th className="px-3 py-2 text-right">מכירה ורווח</th>
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
            <div className="bg-white p-6 border border-slate-200 rounded-lg shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Settings className="w-5 h-5 text-indigo-600"/> הגדרות נפח (CBM) לפי דגם</h2>
              <div className="space-y-4">
                {modelsList.map(model => (
                  <div key={model} className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-100">
                    <span className="font-medium text-slate-700 w-32">{model}</span>
                    <div className="flex items-center gap-2"><input type="number" step="0.01" min="0" className="w-24 p-2 text-center border border-slate-300 rounded focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" value={settings[model]?.cbm || ''} onChange={(e) => setSettings({...settings, [model]: {cbm: Number(e.target.value)}})}/><span className="text-slate-500 text-sm">CBM</span></div>
                  </div>
                ))}
              </div>
              <button onClick={saveSettings} className="mt-6 w-full bg-indigo-600 text-white py-2.5 rounded-md font-medium hover:bg-indigo-700">שמור הגדרות מערכת</button>
            </div>

            {/* DANGER ZONE FOR RESET */}
            <div className="bg-red-50 p-6 border border-red-200 rounded-lg shadow-sm">
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
            <button onClick={() => { setIsFabOpen(false); setEditingData({ isGlobalSale: true, status: 'sold', saleDate: new Date().toISOString().split('T')[0], model: calculatedData.availableModelsInStock[0] || '', salePrice: 0, addOnPrice: 0, repairCost: 0, addOnCost: 0, campaignId: '' }); setIsItemModalOpen(true); }} className="flex items-center gap-2 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-200 hover:bg-slate-50 transition-colors whitespace-nowrap font-medium text-sm">
              <ShoppingCart className="w-4 h-4 text-green-600"/> מכירה חדשה (עדכון מלאי)
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
      
      {/* 1. Item Edit / New Sale Modal */}
      {isItemModalOpen && editingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white">
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
                      <select required className="w-full border-slate-300 rounded-md p-3 text-base bg-white shadow-sm font-bold text-slate-800" value={editingData.model} onChange={e => setEditingData({...editingData, model: e.target.value})}>
                        <option value="" disabled>-- בחר דגם --</option>
                        {calculatedData.availableModelsInStock.map((m: any) => <option key={m} value={m}>{m} ({calculatedData.stockInWarehouse[m]} פנויים)</option>)}
                      </select>
                    ) : (
                      <div className="text-red-600 font-bold p-2 bg-red-100 rounded">אין פריטים פנויים במחסן לאף דגם!</div>
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
                    <select className="w-full border-slate-300 rounded-md p-2 border bg-slate-100 font-medium text-slate-500 cursor-not-allowed" value="sold" disabled><option value="sold">נמכר ללקוח</option></select>
                  ) : (
                    <select className="w-full border-slate-300 rounded-md p-2 border bg-slate-50 font-medium" value={editingData.status} onChange={e => setEditingData({...editingData, status: e.target.value})} disabled={editingData.shipmentStatus !== 'in_warehouse'}>
                      {editingData.shipmentStatus !== 'in_warehouse' && editingData.status !== 'sold' ? <option value={editingData.status}>{STATUS_MAP[editingData.status]} (נעול עד הגעה)</option> : <><option value="in_warehouse">במחסן (זמין למכירה)</option><option value="sold">נמכר ללקוח</option></>}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">תאריך מכירה {editingData.status === 'sold' && <span className="text-red-500">*</span>}</label>
                  <input type="date" required={editingData.status === 'sold'} className="w-full border-slate-300 rounded-md p-2 text-sm" disabled={editingData.status !== 'sold'} value={editingData.saleDate || ''} onChange={e => setEditingData({...editingData, saleDate: e.target.value})} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-orange-50/50 p-4 rounded border border-orange-100">
                  <div><label className="block text-xs font-medium text-slate-700 mb-1">עלות תיקונים בארץ (לעסק)</label><input type="number" step="0.01" className="w-full border-slate-300 rounded-md p-2 text-sm" value={editingData.repairCost || 0} onChange={e => setEditingData({...editingData, repairCost: Number(e.target.value)})} /></div>
                  <div><label className="block text-xs font-medium text-slate-700 mb-1">עלות תוספות (חומרים/עבודה לעסק)</label><input type="number" step="0.01" className="w-full border-slate-300 rounded-md p-2 text-sm" value={editingData.addOnCost || 0} onChange={e => setEditingData({...editingData, addOnCost: Number(e.target.value)})} /></div>
              </div>

              <div className="bg-slate-50 p-4 rounded border border-slate-200">
                <label className="block text-sm font-bold text-slate-700 mb-2">שיוך לקמפיין שיווקי (אופציונלי)</label>
                <select className="w-full border-slate-300 rounded-md p-2 text-sm bg-white" value={editingData.campaignId || ''} onChange={e => setEditingData({...editingData, campaignId: e.target.value})}>
                  <option value="">ללא שיוך קמפיין</option>
                  {campaigns.filter(c => {
                    const isStarted = !c.startDate || c.startDate <= todayStr;
                    const isNotTooOld = !c.endDate || c.endDate >= thirtyDaysAgoStr;
                    // הצג קמפיין אם הוא התחיל ולא עברו 30 יום מסיומו, *או* אם הוא כבר משויך לפריט הזה מקודם (כדי למנוע איבוד מידע בעריכה)
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
              
              <div className="bg-green-50 p-4 rounded border border-green-200">
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="block text-xs font-medium text-green-800 mb-1">מחיר מכירה בסיס (לבר)</label><input type="number" step="0.01" className="w-full border-green-300 rounded-md p-2 font-bold text-green-700" value={editingData.salePrice || 0} onChange={e => setEditingData({...editingData, salePrice: Number(e.target.value)})} /></div>
                  <div><label className="block text-xs font-medium text-green-800 mb-1">תמחור תוספות (הכנסה מתוספת)</label><input type="number" step="0.01" className="w-full border-green-300 rounded-md p-2 font-bold text-green-700" value={editingData.addOnPrice || 0} onChange={e => setEditingData({...editingData, addOnPrice: Number(e.target.value)})} /></div>
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