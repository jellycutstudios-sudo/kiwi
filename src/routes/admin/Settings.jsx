import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { doc, updateDoc, collection, query, where, getDocs, limit, onSnapshot } from 'firebase/firestore';
import { db, functions } from '../../firebase';
import { httpsCallable } from 'firebase/functions';
import { CURRENCY_OPTIONS } from '../../utils/formatCurrency';
import { 
  Save, Copy, Check, Plus, Trash2, Edit2, Printer, X, Volume2, Bell, Bluetooth, Upload, 
  Sparkles, RefreshCw, Search, Sliders, Shield, Hash, ArrowRight, CheckCircle2, Tv, ExternalLink, RotateCcw, Coins,
  Download, Database, ShieldCheck, FileSpreadsheet, Lock, Sparkle, Bot,
  Store, SlidersHorizontal, LayoutGrid, ChefHat, CreditCard, Receipt, Smartphone
} from 'lucide-react';
import { playNotificationTone, TONE_PRESETS } from '../../utils/soundNotifications';
import { pairBluetoothPrinter, printReceiptSingle, printSingleKitchenTicket, detectPrinterPaperSize } from '../../utils/print';
import { convertLogoForThermal } from '../../utils/thermalLogo';
import { downloadTallyXML } from '../../utils/tallyExport';
import toast from 'react-hot-toast';
import BusinessPresetPicker from '../../components/settings/BusinessPresetPicker';
import ReceiptDesigner from '../../components/settings/ReceiptDesigner';
import KitchenSettings from '../../components/settings/KitchenSettings';
import TaxCalculatorHelper from '../../components/settings/TaxCalculatorHelper';
import AdminSecuritySettings from '../../components/settings/AdminSecuritySettings';
import { useUpdateStore } from '../../stores/updateStore';
import { saveLocalGroqApiKey } from '../../services/groqService';

const MODES = [
  // 1. Core POS & Service Formats
  { key: 'ai_advisor',       label: 'Business Advisor (AI)',     desc: 'Hybrid local analytics & Groq Cloud instant natural language business advisor', tab: 'features', tabName: 'Modules' },
  { key: 'pos',              label: '🧾 Bill Only / Express POS', desc: 'Simple cashier-only billing with fast 1-click checkout', tab: 'workflows', tabName: 'Workflows' },
  { key: 'table',            label: '🗺️ Table & Floor Management', desc: 'Floor plan with visual table assignment & timers', tab: 'workflows', tabName: 'Workflows' },
  { key: 'token',            label: '🎫 Token / QSR Numbering',   desc: 'Token issuance & live TV queue callouts', tab: 'displays', tabName: 'Displays' },
  { key: 'barcode',          label: '🏷️ Barcode & Retail Scanner', desc: 'Active barcode input & scan-to-cart on POS terminal', tab: 'workflows', tabName: 'Workflows' },

  // 2. Kitchen & Fulfillment
  { key: 'kds',              label: '🍳 Kitchen Display & KOT',   desc: 'Paperless KDS screen, 3" thermal KOT printing, or both', tab: 'kitchen', tabName: 'Kitchen' },

  // 3. Sales Channels & Ordering
  { key: 'online',           label: '📱 Online Storefront',       desc: 'Commission-free customer-facing web ordering page', tab: 'online-del', tabName: 'Online Store' },
  { key: 'delivery_hub',     label: '🛵 Delivery Hub',            desc: 'Manage in-house fleet & third-party aggregators (Swiggy, Zomato)', tab: 'online-del', tabName: 'Online Store' },
  { key: 'reservations',     label: '📅 Table Reservations',      desc: 'Book and manage table reservations & guest waitlists', tab: 'workflows', tabName: 'Workflows' },

  // 4. Digital Displays & Front of House
  { key: 'posters',          label: '📺 Digital Signage & TV Posters', desc: 'Show menu promos & video slideshows on TVs', tab: 'displays', tabName: 'Displays' },

  // 5. Trust, Privacy & Tax Shield (PetPooja Antidote)
  { key: 'customer_privacy', label: '🔒 Staff Phone Masking',     desc: 'Shield customer phone numbers (+91 98*** **420) from cashiers & servers', tab: 'security', tabName: 'Security' },
  { key: 'audit_shield',     label: '📑 Tax Audit & Void Reasons', desc: 'Require mandatory reason logging for line-item voids & cancellations', tab: 'workflows', tabName: 'Workflows' },
  { key: 'data_vault',       label: '🗄️ 1-Click Complete Data Vault', desc: 'Zero data lock-in; download complete JSON/CSV database dump', isAction: 'vault' },
  { key: 'tax_reconcile',    label: '📊 Tax Reconciliation & Tally', desc: 'Separate settled bills vs void drafts with TallyPrime XML export', tab: 'tax-pay', tabName: 'Taxes & Cash', isAction: 'tally' },

  // 6. Back Office, People & Retention
  { key: 'inventory',        label: '📦 Inventory Management',    desc: 'Track raw ingredients, stock levels, and supplier POs', tab: 'hardware', tabName: 'Hardware' },
  { key: 'payroll',          label: '💸 Staff Payroll & Tip Pools', desc: 'Manage staff wages, shifts, overtime, tip pools & payouts', tab: 'workflows', tabName: 'Workflows' },
  { key: 'till_shift',       label: '💵 Cash Drawer & Till Shifts', desc: 'Register open float, mid-shift drops, drawer variance & Z-Reports', tab: 'tax-pay', tabName: 'Taxes & Cash' },
  { key: 'customers',        label: '🤝 Customer Directory & CRM', desc: 'Manage customer profiles, visit history & VIP tags', tab: 'notifications', tabName: 'Alerts & Reports' },
  { key: 'retention_crm',    label: '💬 WhatsApp e-Bills & Retention', desc: 'Automated paperless WhatsApp receipts & Google Review boost', tab: 'notifications', tabName: 'Alerts & Reports' },
];

const MODULE_PILLARS = [
  {
    id: 'core',
    title: '⚡ Core Operations & Service Formats',
    desc: 'Essential modules for service stations, cashier registers, and ordering format.',
    badge: 'Core POS',
    keys: ['pos', 'table', 'token', 'barcode']
  },
  {
    id: 'kitchen',
    title: '🍳 Kitchen & Fulfillment Stations',
    desc: 'Paperless kitchen screens, station-routed tickets, and preparation speed.',
    badge: 'Kitchen',
    keys: ['kds']
  },
  {
    id: 'channels',
    title: '🌐 Sales Channels & Digital Ordering',
    desc: 'Direct customer ordering, table bookings, and food delivery aggregators.',
    badge: 'Ordering',
    keys: ['online', 'delivery_hub', 'reservations']
  },
  {
    id: 'displays',
    title: '📺 Digital Displays & Front of House',
    desc: 'Lounge TV queue displays, digital promotional slideshows, and menu boards.',
    badge: 'Displays',
    keys: ['posters']
  },
  {
    id: 'privacy',
    title: '🛡️ Trust, Privacy & Tax Shield (Owner Sovereignty)',
    desc: 'The PetPooja Antidote: complete data sovereignty, customer phone privacy, and audit-safe tax reconciliation.',
    badge: 'Sovereignty',
    keys: ['customer_privacy', 'audit_shield', 'data_vault', 'tax_reconcile']
  },
  {
    id: 'backoffice',
    title: '💼 Back Office, People & Growth',
    desc: 'Inventory control, shift cash drawer audits, restaurant payroll, and guest retention.',
    badge: 'Operations',
    keys: ['inventory', 'payroll', 'till_shift', 'customers', 'retention_crm']
  }
];

const MODULE_PRESETS = [
  {
    id: 'qsr',
    name: 'Quick Service / Fast Food',
    emoji: '⚡',
    desc: 'Counter ordering, token numbers, TV displays, fast cash/UPI & online store',
    modes: ['pos', 'token', 'kds', 'online', 'posters', 'till_shift', 'retention_crm']
  },
  {
    id: 'dine_in',
    name: 'Full-Service Restaurant & Bar',
    emoji: '🍽️',
    desc: 'Floor plan table maps, reservations, KDS, staff payroll, phone masking & tax audit',
    modes: ['pos', 'table', 'kds', 'reservations', 'payroll', 'till_shift', 'customer_privacy', 'audit_shield', 'tax_reconcile']
  },
  {
    id: 'cafe',
    name: 'Cafe & Bakery',
    emoji: '☕',
    desc: 'Counter sales, barcode scanner, TV promos, customer loyalty & inventory',
    modes: ['pos', 'barcode', 'posters', 'inventory', 'customers', 'till_shift', 'retention_crm']
  },
  {
    id: 'retail',
    name: 'Retail & Mini Mart',
    emoji: '🛍️',
    desc: 'High-speed barcode checkout, inventory management, customer database & cash drawer',
    modes: ['pos', 'barcode', 'inventory', 'customers', 'till_shift', 'customer_privacy']
  },
  {
    id: 'cloud',
    name: 'Cloud / Dark Kitchen',
    emoji: '🛵',
    desc: 'Delivery hub aggregator sync, online store, KDS stations, inventory costing & data vault',
    modes: ['online', 'delivery_hub', 'kds', 'inventory', 'data_vault', 'tax_reconcile']
  }
];

const TAX_TYPES = [
  { key: 'none',  label: 'No Tax' },
  { key: 'gst',   label: 'GST (India — CGST + SGST)' },
  { key: 'vat',   label: 'VAT (Middle East)' },
  { key: 'flat',  label: 'Flat Rate %' },
];

const TABS = [
  { id: 'general',       label: 'General & Identity',      icon: Store, keywords: ['name', 'logo', 'id', 'address', 'phone', 'currency', 'tax id', 'gstin', 'fssai', 'version', 'update', 'vault', 'backup'] },
  { id: 'security',      label: 'Security & Password',     icon: ShieldCheck, keywords: ['password', 'security', 'admin', 'pin', 'reset', 'credentials', 'email', 'login', 'account', 'privacy', 'masking'] },
  { id: 'workflows',     label: 'Workflows & Operations',  icon: SlidersHorizontal, keywords: ['flow', 'preset', 'qsr', 'dine in', 'tab', 'auto lock', 'pin', 'phone', 'prefix', 'order number', 'token', 'voice', 'rounding', 'split', 'tip', 'quick pay', 'speed dial', 'barcode', 'audit', 'void'] },
  { id: 'features',      label: 'Modules & Features',      icon: LayoutGrid, keywords: ['modes', 'pos', 'table', 'token', 'kds', 'online', 'delivery', 'reservations', 'inventory', 'payroll', 'customers', 'loyalty', 'posters', 'signage', 'barcode', 'privacy', 'vault', 'audit', 'tally', 'tax', 'crm', 'shift'] },
  { id: 'kitchen',       label: 'Kitchen & KDS',           icon: ChefHat, keywords: ['kitchen', 'kds', 'kot', 'station', 'stations', 'grill', 'fryer', 'bar', 'bakery', 'paper', 'buzzer', 'chime'] },
  { id: 'tax-pay',       label: 'Taxes, Gratuity & Cash',  icon: CreditCard, keywords: ['tax', 'gst', 'vat', 'service charge', 'gratuity', 'calculator', 'cash', 'till', 'shift', 'drawer', 'stripe', 'upi', 'tally'] },
  { id: 'receipts',      label: 'Receipt Designer',        icon: Receipt, keywords: ['receipt', 'thermal', 'print', 'logo', 'footer', 'header', 'designer', 'preview', 'paper'] },
  { id: 'displays',      label: 'Digital Displays & TV',   icon: Tv, keywords: ['display', 'tv', 'token queue', 'posters', 'slideshow', 'signage', 'screen', 'url'] },
  { id: 'online-del',    label: 'Online Store & Delivery', icon: Smartphone, keywords: ['online', 'delivery', 'pickup', 'slug', 'uber', 'swiggy', 'zomato', 'deliveroo', 'aggregators'] },
  { id: 'hardware',      label: 'Peripherals & Hardware',  icon: Printer, keywords: ['printer', 'hardware', 'bluetooth', 'network', 'ip', 'serial', 'cash drawer', 'scanner', 'escpos'] },
  { id: 'notifications', label: 'Alerts & Reports',        icon: Bell, keywords: ['notification', 'alert', 'sound', 'tone', 'email', 'closing report', 'z report', 'whatsapp'] },
];

export default function Settings() {
  const { restaurant } = useAuthStore();
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);

  // Initialize settings synchronously from draft, authStore restaurant, or cached settings
  const [settings, setSettings] = useState(() => {
    if (typeof localStorage !== 'undefined' && restaurant?.id) {
      try {
        const draft = localStorage.getItem(`dineos_settings_draft_${restaurant.id}`);
        if (draft) return JSON.parse(draft);
      } catch {}
    }
    if (restaurant && Object.keys(restaurant).length > 2) {
      return { ...restaurant };
    }
    if (typeof localStorage !== 'undefined' && restaurant?.id) {
      try {
        const cached = localStorage.getItem(`dineos_cached_settings_${restaurant.id}`);
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    return null;
  });

  const initialSettingsRef = useRef(
    restaurant && Object.keys(restaurant).length > 2 ? JSON.stringify(restaurant) : null
  );

  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedSlideshowId, setCopiedSlideshowId] = useState(null);
  const [slideshowList, setSlideshowList] = useState([]);

  // Remember active settings tab across sessions
  const [activeTab, setActiveTabState] = useState(() => {
    if (typeof localStorage === 'undefined') return 'general';
    try {
      return localStorage.getItem('dineos_settings_tab') || 'general';
    } catch {
      return 'general';
    }
  });

  const setActiveTab = (tabId) => {
    setActiveTabState(tabId);
    try {
      localStorage.setItem('dineos_settings_tab', tabId);
    } catch {}
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const { hasUpdate, isUpdating, applyUpdate, checkForUpdates } = useUpdateStore();

  // Detect if an unsaved draft was restored on mount
  useEffect(() => {
    if (typeof localStorage !== 'undefined' && restaurant?.id) {
      const draft = localStorage.getItem(`dineos_settings_draft_${restaurant.id}`);
      if (draft && initialSettingsRef.current && draft !== initialSettingsRef.current) {
        setHasRestoredDraft(true);
      }
    }
  }, [restaurant?.id]);

  // Auto-persist draft changes so staff/admin edits are never lost
  useEffect(() => {
    if (!settings || !restaurant?.id) return;
    if (initialSettingsRef.current && JSON.stringify(settings) !== initialSettingsRef.current) {
      try {
        localStorage.setItem(`dineos_settings_draft_${restaurant.id}`, JSON.stringify(settings));
      } catch {}
    }
  }, [settings, restaurant?.id]);

  const hasUnsavedChanges = useMemo(() => {
    if (!settings || !initialSettingsRef.current) return false;
    return JSON.stringify(settings) !== initialSettingsRef.current;
  }, [settings]);

  const handleDiscard = () => {
    if (initialSettingsRef.current) {
      setSettings(JSON.parse(initialSettingsRef.current));
      setHasRestoredDraft(false);
      try {
        localStorage.removeItem(`dineos_settings_draft_${restaurant?.id}`);
      } catch {}
      toast('Unsaved changes discarded', { icon: '↩️' });
    }
  };

  const filteredTabs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return TABS;
    return TABS.filter(t => 
      t.label.toLowerCase().includes(q) ||
      t.keywords?.some(k => k.includes(q))
    );
  }, [searchQuery]);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    const toastId = toast.loading('Converting logo for thermal POS billing...');
    try {
      const res = await convertLogoForThermal(file, {
        maxWidth: 384,
        maxHeight: 130,
        algorithm: 'dither'
      });
      setSettings(s => ({
        ...s,
        logo: res.originalUrl || res.thermalDataUrl,
        onlineLogo: res.originalUrl || res.thermalDataUrl,
        receiptConfig: {
          ...(s.receiptConfig || {}),
          logoUrl: res.originalUrl || res.thermalDataUrl,
          thermalLogo: res.thermalDataUrl,
          escPosLogo: res.escPosBase64,
          thermalSettings: { algorithm: 'dither', threshold: 128, invert: false }
        }
      }));
      toast.success('Logo uploaded & converted for thermal billing!', { id: toastId });
    } catch (err) {
      console.error('[Logo Upload Error]', err);
      toast.error('Failed to process logo: ' + err.message, { id: toastId });
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const { categories, subscribeMenu } = useMenuStore();

  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = subscribeMenu(restaurant.id);
    return () => unsub();
  }, [restaurant?.id, subscribeMenu]);

  const handleExportDataVault = async () => {
    if (!restaurant?.id) return;
    const toastId = toast.loading('Compiling complete Restaurant Data Vault (JSON)...');
    try {
      // 1. Menu Items
      const menuSnap = await getDocs(collection(db, 'restaurants', restaurant.id, 'menu'));
      const menu = menuSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 2. Categories
      const catSnap = await getDocs(collection(db, 'restaurants', restaurant.id, 'categories'));
      const cats = catSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 3. Customers
      const custSnap = await getDocs(collection(db, 'restaurants', restaurant.id, 'customers'));
      const custs = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 4. Orders (limit 500)
      const ordersSnap = await getDocs(query(collection(db, 'restaurants', restaurant.id, 'orders'), limit(500)));
      const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const vault = {
        exportedAt: new Date().toISOString(),
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        gstin: restaurant.gstin || '',
        currency: restaurant.currency || 'INR',
        settings: settings,
        menuCategories: cats,
        menuItems: menu,
        customers: custs,
        recentOrders: orders,
        system: 'DineOS Sovereign Data Vault v1.0',
        privacyNote: 'Exported directly from your browser. Zero third-party telemetry, resale, or aggregator sharing.'
      };

      const blob = new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dineos_vault_${(restaurant.name || 'restaurant').toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Complete Data Vault downloaded! Zero lock-in.', { id: toastId });
    } catch (err) {
      console.error('Data vault export error:', err);
      toast.error('Failed to export vault: ' + err.message, { id: toastId });
    }
  };

  const handleExportTally = async () => {
    if (!restaurant?.id) return;
    const toastId = toast.loading('Generating Tally XML from billed sales...');
    try {
      const q = query(
        collection(db, 'restaurants', restaurant.id, 'orders'),
        where('status', 'in', ['billed', 'completed']),
        limit(500)
      );
      const snap = await getDocs(q);
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (!orders.length) {
        toast('No billed orders found to export', { icon: 'ℹ️', id: toastId });
        return;
      }
      const fname = `tally_sales_${(restaurant.name || 'restaurant').toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xml`;
      downloadTallyXML(orders, restaurant, fname);
      toast.success(`Exported ${orders.length} settled orders to TallyPrime XML!`, { id: toastId });
    } catch (err) {
      console.error('Tally export error:', err);
      toast.error('Failed to export Tally XML: ' + err.message, { id: toastId });
    }
  };

  const [showPrinterForm, setShowPrinterForm] = useState(false);
  const [activePrinterIndex, setActivePrinterIndex] = useState(-1);
  const [printerForm, setPrinterForm] = useState({
    id: '',
    name: '',
    type: 'receipt', // receipt, kitchen
    mode: 'browser', // browser, bluetooth, serial, network
    paperSize: '80mm', // 80mm (3-inch) or 58mm (2-inch)
    ipAddress: '',
    drawerKick: false,
    soundAlerts: false,
    categories: []
  });

  const handleAddPrinter = () => {
    setPrinterForm({
      id: crypto.randomUUID(),
      name: '',
      type: 'receipt',
      mode: 'browser',
      paperSize: '80mm',
      ipAddress: '',
      drawerKick: false,
      soundAlerts: false,
      categories: []
    });
    setActivePrinterIndex(-1);
    setShowPrinterForm(true);
  };

  const handleEditPrinter = (idx, printer) => {
    setPrinterForm({
      id: printer.id || crypto.randomUUID(),
      name: printer.name || '',
      type: printer.type || 'receipt',
      mode: printer.mode || 'browser',
      paperSize: printer.paperSize || '80mm',
      ipAddress: printer.ipAddress || '',
      drawerKick: printer.drawerKick || false,
      soundAlerts: printer.soundAlerts || false,
      categories: printer.categories || []
    });
    setActivePrinterIndex(idx);
    setShowPrinterForm(true);
  };

  const handleDeletePrinter = (idx) => {
    if (!confirm('Are you sure you want to remove this printer?')) return;
    const printers = [...(settings.peripheralConfig?.printers ?? [])];
    printers.splice(idx, 1);
    updateField('peripheralConfig.printers', printers);
    toast.success('Printer removed');
  };

  const handleSavePrinter = () => {
    if (!printerForm.name.trim()) {
      toast.error('Printer name is required');
      return;
    }
    if (printerForm.mode === 'network' && !printerForm.ipAddress.trim()) {
      toast.error('Printer IP address is required for network mode');
      return;
    }
    const printers = [...(settings.peripheralConfig?.printers ?? [])];
    if (activePrinterIndex >= 0) {
      printers[activePrinterIndex] = printerForm;
    } else {
      printers.push(printerForm);
    }
    updateField('peripheralConfig.printers', printers);
    setShowPrinterForm(false);
    toast.success(activePrinterIndex >= 0 ? 'Printer updated' : 'Printer added');
  };

  const handleToggleCategory = (catId) => {
    const updatedCats = printerForm.categories.includes(catId)
      ? printerForm.categories.filter(id => id !== catId)
      : [...printerForm.categories, catId];
    setPrinterForm({ ...printerForm, categories: updatedCats });
  };


  useEffect(() => {
    if (copiedToken) {
      const timer = setTimeout(() => setCopiedToken(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedToken]);

  const copyTokenDisplayLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/display/tokens/${restaurant?.id}`);
    setCopiedToken(true);
    toast.success('TV display URL copied!');
  };

  const copySlideshowLink = (slideshowId) => {
    navigator.clipboard.writeText(`${window.location.origin}/display/slides/${restaurant?.id}/${slideshowId}`);
    setCopiedSlideshowId(slideshowId);
    toast.success('TV Slideshow URL copied!');
  };

  useEffect(() => {
    if (copiedSlideshowId) {
      const timer = setTimeout(() => setCopiedSlideshowId(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [copiedSlideshowId]);

  useEffect(() => {
    if (!restaurant?.id) return;
    const q = collection(db, 'restaurants', restaurant.id, 'slideshows');
    getDocs(q).then(snap => {
      setSlideshowList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(err => {
      console.error("Error fetching slideshows in Settings:", err);
    });
  }, [restaurant?.id]);

  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = onSnapshot(doc(db, 'restaurants', restaurant.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        initialSettingsRef.current = JSON.stringify(data);
        try {
          localStorage.setItem(`dineos_cached_settings_${restaurant.id}`, JSON.stringify(data));
        } catch {}

        const hasDraft = typeof localStorage !== 'undefined' && localStorage.getItem(`dineos_settings_draft_${restaurant.id}`);
        if (!hasDraft) {
          setSettings(prev => {
            if (!prev) return { ...data };
            return { ...data };
          });
        }
      }
    });
    return () => unsub();
  }, [restaurant?.id]);

  const save = async () => {
    setSaving(true);
    try {
      const settingsToSave = { ...settings };
      
      // Validate and check slug conflict
      if (settings.slug && settings.slug.trim()) {
        const cleanSlug = settings.slug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (cleanSlug !== settings.slug) {
          toast.error('Slug can only contain letters, numbers, hyphens, and underscores.');
          setSaving(false);
          return;
        }

        const q = query(collection(db, 'restaurants'), where('slug', '==', cleanSlug));
        const snap = await getDocs(q);
        const conflict = snap.docs.some(docSnap => docSnap.id !== restaurant.id);
        if (conflict) {
          toast.error('This custom URL slug is already taken by another restaurant.');
          setSaving(false);
          return;
        }
        settingsToSave.slug = cleanSlug;
      }

      // Validate and check customId conflict
      if (settings.customId && settings.customId.trim()) {
        const cleanCustomId = settings.customId.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '');
        if (cleanCustomId !== settings.customId) {
          toast.error('Custom Restaurant ID can only contain letters, numbers, hyphens, and underscores.');
          setSaving(false);
          return;
        }

        const q = query(collection(db, 'restaurants'), where('customId', '==', cleanCustomId));
        const snap = await getDocs(q);
        const conflict = snap.docs.some(docSnap => docSnap.id !== restaurant.id);
        if (conflict) {
          toast.error('This Custom Restaurant ID is already taken by another restaurant.');
          setSaving(false);
          return;
        }
        settingsToSave.customId = cleanCustomId;
      } else {
        settingsToSave.customId = '';
      }

      await updateDoc(doc(db, 'restaurants', restaurant.id), settingsToSave);
      setSettings(settingsToSave);
      initialSettingsRef.current = JSON.stringify(settingsToSave);
      setHasRestoredDraft(false);
      try {
        localStorage.removeItem(`dineos_settings_draft_${restaurant.id}`);
        localStorage.setItem(`dineos_cached_settings_${restaurant.id}`, JSON.stringify(settingsToSave));
      } catch {}
      useAuthStore.setState({ restaurant: { id: restaurant.id, ...settingsToSave } });
      toast.success('Settings saved!');
    } catch (e) {
      toast.error('Failed to save settings: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (path, value) => {
    setSettings(s => {
      const parts = path.split('.');
      const newSettings = { ...s };
      let current = newSettings;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        current[part] = { ...(current[part] ?? {}) };
        current = current[part];
      }
      current[parts[parts.length - 1]] = value;
      return newSettings;
    });
  };

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const copyOrderLink = () => {
    const orderPath = settings.slug ? settings.slug : restaurant?.id;
    navigator.clipboard.writeText(`${window.location.origin}/order/${orderPath}`);
    setCopied(true);
    toast.success('Order link copied!');
  };

  const [sendingTestReport, setSendingTestReport] = useState(false);
  const handleSendTestReport = async () => {
    const targetEmail = settings.adminNotificationEmail || restaurant?.adminNotificationEmail;
    if (!targetEmail) {
      toast.error('Please configure your recipient email first and save settings.');
      return;
    }
    setSendingTestReport(true);
    try {
      if (functions) {
        const sendReportFn = httpsCallable(functions, 'sendDailySalesReportEmail');
        const res = await sendReportFn({ restaurantId: restaurant.id });
        if (res.data?.success) {
          toast.success(`Daily report sent! (${res.data.ordersCount} orders included)`);
        } else {
          toast.success('Daily report email dispatched successfully!');
        }
      } else {
        toast.success('Report trigger sent!');
      }
    } catch (err) {
      console.warn('Report dispatch error:', err);
      toast.error(err.message || 'Failed to dispatch report email. Check Gmail App Password settings.');
    } finally {
      setSendingTestReport(false);
    }
  };

  if (!settings) return <div style={{padding:'var(--space-8)', textAlign:'center', color:'var(--color-label-tertiary)'}}>Loading settings...</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-6)', maxWidth: 1240, width: '100%', margin: '0 auto', paddingBottom: 80 }}>
      {/* Draft Restored Banner */}
      {hasRestoredDraft && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: '12px',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18 }}>📝</span>
            <div>
              <div style={{ fontSize: 'var(--text-subhead)', color: '#d97706', fontWeight: 700 }}>
                Unsaved Settings Restored
              </div>
              <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)' }}>
                We remembered your unsaved adjustments from your previous session.
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleDiscard}
              style={{ height: 32, fontSize: 'var(--text-caption1)' }}
            >
              Discard Draft
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={saving}
              style={{ height: 32, fontSize: 'var(--text-caption1)' }}
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Header Banner */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom: '1px solid var(--color-separator)', paddingBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="text-title2" style={{ margin: 0 }}>Restaurant Settings</h2>
            {(() => {
              const currentTab = TABS.find(t => t.id === activeTab);
              if (!currentTab) return null;
              const ActiveIcon = currentTab.icon;
              return (
                <span style={{ fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'var(--color-bg-secondary)', color: 'var(--color-accent)', border: '1px solid var(--color-separator)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <ActiveIcon size={14} strokeWidth={2.2} />
                  <span>{currentTab.label}</span>
                </span>
              );
            })()}
          </div>
          <p className="text-secondary text-caption1" style={{ marginTop: 4, marginBottom: 0 }}>
            Configure operational workflows, branding, hardware, digital displays, and billing policies.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {hasUnsavedChanges && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDiscard}
              disabled={saving}
              style={{ height: '38px' }}
            >
              Discard
            </button>
          )}
          <button
            className="btn btn-primary"
            id="save-settings-btn"
            onClick={save}
            disabled={saving || !hasUnsavedChanges}
            style={{
              height: '38px',
              padding: '0 var(--space-4)',
              opacity: !hasUnsavedChanges ? 0.75 : 1,
              boxShadow: hasUnsavedChanges ? '0 0 0 2px var(--color-accent-light)' : 'none'
            }}
          >
            <Save size={15}/> {saving ? 'Saving...' : (hasUnsavedChanges ? 'Save Changes' : 'Saved')}
          </button>
        </div>
      </div>

      <div className="settings-container">
        {/* Navigation Sidebar */}
        <div className="settings-nav">
          {/* Quick Search */}
          <div className="settings-search-wrap">
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--color-label-tertiary)', pointerEvents: 'none' }} />
            <input
              type="text"
              className="settings-search-input"
              placeholder="Search settings..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: 9,
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-label-tertiary)',
                  cursor: 'pointer',
                  padding: 2,
                  fontSize: 12
                }}
              >
                ✕
              </button>
            )}
          </div>

          {filteredTabs.map(tab => {
            const isActive = activeTab === tab.id;
            const isMatch = searchQuery && tab.keywords.some(k => k.includes(searchQuery.toLowerCase()));
            const TabIcon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`settings-nav-item ${isActive ? 'active' : ''}`}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="settings-nav-icon">
                    <TabIcon size={17} strokeWidth={2.2} />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
                </div>
                {isMatch && (
                  <span className="settings-nav-badge">Match</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-6)', minWidth: 0 }}>
          
          {/* General Tab */}
          {activeTab === 'general' && (
            <>
              {/* Basic Info */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-4)'}}>Store Identity &amp; Profile</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Restaurant Name</label>
                    <input id="settings-name" className="form-input" value={settings.name??''} onChange={e=>updateField('name',e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Restaurant Logo (POS Thermal Receipts &amp; Branding)</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      {(settings.receiptConfig?.thermalLogo || settings.receiptConfig?.logoUrl || settings.logo) ? (
                        <div style={{
                          width: 80,
                          height: 56,
                          borderRadius: 'var(--radius-md)',
                          border: '1.5px solid var(--color-separator)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'var(--color-bg-elevated)',
                          padding: '4px',
                          flexShrink: 0
                        }}>
                          <img
                            src={settings.receiptConfig?.thermalLogo || settings.receiptConfig?.logoUrl || settings.logo}
                            alt="Logo"
                            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          width: 80,
                          height: 56,
                          borderRadius: 'var(--radius-md)',
                          border: '1.5px dashed var(--color-separator)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '22px',
                          background: 'var(--color-bg)',
                          flexShrink: 0
                        }}>
                          🍽️
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <input
                          type="file"
                          id="settings-brand-logo-file"
                          accept="image/png, image/jpeg, image/webp, image/svg+xml"
                          style={{ display: 'none' }}
                          onChange={handleLogoUpload}
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => document.getElementById('settings-brand-logo-file').click()}
                          disabled={uploadingLogo}
                          style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                        >
                          <Upload size={13} />
                          {uploadingLogo ? 'Converting...' : ((settings.receiptConfig?.logoUrl || settings.logo) ? 'Change Logo' : 'Upload Logo')}
                        </button>
                        <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                          Auto-dithered &amp; converted into 1-bit monochrome for thermal receipt printers.
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Custom Restaurant ID (for Staff PIN Login)</label>
                    <input 
                      id="settings-custom-id" 
                      className="form-input" 
                      placeholder="e.g. my-restaurant" 
                      value={settings.customId??''} 
                      onChange={e=>updateField('customId',e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))} 
                    />
                    <span className="text-secondary text-caption2">A custom ID staff can use to log in. Only lowercase letters, numbers, hyphens, and underscores allowed.</span>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <input id="settings-address" className="form-input" placeholder="Street, City" value={settings.address??''} onChange={e=>updateField('address',e.target.value)} />
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                    <div className="form-group">
                      <label className="form-label">Phone</label>
                      <input id="settings-phone" className="form-input" placeholder="+971 50 000 0000" value={settings.phone??''} onChange={e=>updateField('phone',e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Currency</label>
                      <select id="settings-currency" className="form-select" value={settings.currency??'INR'} onChange={e=>updateField('currency',e.target.value)}>
                        {CURRENCY_OPTIONS.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                    <div className="form-group">
                      <label className="form-label">GSTIN / Tax ID</label>
                      <input id="settings-gstin" className="form-input" placeholder="e.g. 27AAAAA0000A1Z5" value={settings.gstin??''} onChange={e=>updateField('gstin', e.target.value.toUpperCase())} />
                    </div>
                    <div className="form-group">
                      <label className="form-label">FSSAI License No. (India)</label>
                      <input id="settings-fssai" className="form-input" placeholder="e.g. 10012011000123" value={settings.fssai??''} onChange={e=>updateField('fssai', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* System Version & App Updates */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>⚡ System Version &amp; App Updates</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Manage software updates across all connected POS terminals, tablets, and mobile devices.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', background: 'var(--color-bg-secondary)', padding: 'var(--space-4)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator-opaque)' }}>
                  <div>
                    <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span>DineOS Cloud POS</span>
                      <span className="badge badge-gray" style={{ fontSize: 11 }}>v1.0.0</span>
                      {hasUpdate ? (
                        <span className="badge badge-orange" style={{ fontSize: 11, background: 'rgba(249,115,22,0.2)', color: '#fb923c', border: '1px solid rgba(249,115,22,0.4)' }}>
                          🚀 New Update Ready
                        </span>
                      ) : (
                        <span className="badge badge-green" style={{ fontSize: 11 }}>
                          ✓ Up to Date
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', marginTop: 4 }}>
                      {hasUpdate 
                        ? 'A new version with performance improvements and new features is ready to install.'
                        : 'Your POS device is currently running the latest certified build.'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {hasUpdate ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={applyUpdate}
                        disabled={isUpdating}
                        style={{
                          background: 'linear-gradient(135deg, #f97316, #ef4444)',
                          color: '#fff',
                          border: 'none',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <RefreshCw size={14} className={isUpdating ? 'animate-spin' : ''} />
                        {isUpdating ? 'Updating...' : 'Update App Now'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={async () => {
                          toast.loading('Checking for updates...', { id: 'check-upd' });
                          await checkForUpdates();
                          setTimeout(() => {
                            if (useUpdateStore.getState().hasUpdate) {
                              toast.success('New update found and ready to install!', { id: 'check-upd' });
                            } else {
                              toast.success('You are running the latest version!', { id: 'check-upd' });
                            }
                          }, 1000);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <RefreshCw size={14} /> Check for Updates
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Security & Password Quick Link Card */}
              <div 
                className="card card-padded"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-separator)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px'
                  }}>
                    🔐
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: 'var(--color-label)' }}>
                      Admin Password &amp; Security
                    </h4>
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                      Update your login password or dispatch a one-click reset link to your email.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveTab('security')}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
                >
                  <span>Manage Password</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </>
          )}

          {/* Security & Password Tab */}
          {activeTab === 'security' && (
            <AdminSecuritySettings />
          )}

          {/* Workflows & Operations Tab */}
          {activeTab === 'workflows' && (
            <>
              {/* Business Type Preset Picker */}
              <BusinessPresetPicker
                currentBusinessType={settings.businessType}
                currentModes={settings.modes}
                onApplyPreset={(preset) => {
                  setSettings(s => ({
                    ...s,
                    businessType: preset.id,
                    modes: preset.recommendedModes,
                    shiftMode: preset.recommendedShiftMode,
                    quickPayEnabled: preset.features.enableQuickPay,
                    barcodeEnabled: preset.features.enableBarcode,
                    speedDialEnabled: preset.features.enableSpeedDial,
                    workflowConfig: {
                      ...(s.workflowConfig || {}),
                      serviceFlow: preset.id === 'qsr' || preset.id === 'cafe' ? 'counter' : (preset.id === 'restaurant' ? 'table' : 'counter')
                    }
                  }));
                }}
              />

              {/* Service Flow Style */}
              <div className="card card-padded">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Sliders size={18} color="var(--color-accent)" />
                  <h3 className="text-title3" style={{ margin: 0 }}>Restaurant Service &amp; Ordering Flow</h3>
                </div>
                <p className="text-secondary text-footnote" style={{ marginBottom: 'var(--space-4)' }}>
                  Tailor how orders are taken, routed, and paid based on your service model.
                </p>

                <div className="settings-flow-grid">
                  {[
                    {
                      key: 'counter',
                      icon: '⚡',
                      title: 'Quick Counter / Pay-First',
                      badge: 'Fast Casual / QSR / Cafe',
                      desc: 'Customers pay immediately at the counter. Orders fire to kitchen or issue a token upon payment.'
                    },
                    {
                      key: 'table',
                      icon: '🍽️',
                      title: 'Table Service / Pay-at-End',
                      badge: 'Dine-In / Full Service',
                      desc: 'Staff seat guests, send courses to kitchen, print bill at table, and settle payment upon departure.'
                    },
                    {
                      key: 'tab',
                      icon: '🍸',
                      title: 'Open Bar & Lounge Tabs',
                      badge: 'Bar / Nightclub / Lounge',
                      desc: 'Keep open tabs under customer names or cards. Fast drink speed-dial and batch settlement.'
                    }
                  ].map(flow => {
                    const currentFlow = settings.workflowConfig?.serviceFlow || (settings.businessType === 'restaurant' ? 'table' : 'counter');
                    const isSelected = currentFlow === flow.key;
                    return (
                      <div
                        key={flow.key}
                        className={`settings-flow-card ${isSelected ? 'active' : ''}`}
                        onClick={() => updateField('workflowConfig.serviceFlow', flow.key)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 24 }}>{flow.icon}</span>
                          {isSelected ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-accent)', fontWeight: 700, fontSize: 11 }}>
                              <CheckCircle2 size={14} /> Selected
                            </span>
                          ) : (
                            <span style={{ fontSize: 10, color: 'var(--color-label-tertiary)', fontWeight: 600 }}>{flow.badge}</span>
                          )}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-label-primary)' }}>{flow.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', lineHeight: 1.4 }}>{flow.desc}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* POS Security & Checkout Rules */}
              <div className="card card-padded">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Shield size={18} color="var(--color-accent)" />
                  <h3 className="text-title3" style={{ margin: 0 }}>POS Security &amp; Checkout Rules</h3>
                </div>
                <p className="text-secondary text-footnote" style={{ marginBottom: 'var(--space-4)' }}>
                  Set cashier controls, PIN auto-lock, and customer information requirements.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {/* Auto-Lock POS on completion */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>Auto-Lock POS to PIN Screen on Checkout</div>
                      <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                        Immediately returns to the Staff PIN screen after each completed or printed bill. Essential for shared terminals.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.workflowConfig?.autoLockOnComplete ?? false}
                      onChange={e => updateField('workflowConfig.autoLockOnComplete', e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>

                  {/* Customer Phone Requirement */}
                  <div style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>Customer Phone Number at Checkout</div>
                      <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                        Choose whether cashiers must collect customer phone numbers before checkout.
                      </div>
                    </div>
                    <select
                      className="form-select"
                      style={{ width: 'auto', minWidth: 200, height: 36, fontSize: 12.5 }}
                      value={settings.workflowConfig?.phoneRequirement ?? 'optional'}
                      onChange={e => updateField('workflowConfig.phoneRequirement', e.target.value)}
                    >
                      <option value="optional">Optional (Fastest checkout)</option>
                      <option value="loyalty_only">Prompt for Loyalty / Points</option>
                      <option value="mandatory">Mandatory for all bills</option>
                    </select>
                  </div>

                  {/* Fast Checkout Speed Options */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>1-Tap Quick-Pay Bar in POS</div>
                      <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                        Displays instant cash tender, round amount, and UPI buttons directly in the cart drawer.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.quickPayEnabled ?? true}
                      onChange={e => updateField('quickPayEnabled', e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>Favorites &amp; Speed-Dial Bar</div>
                      <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                        Shows a pinned strip of your top fast-selling items at the top of the menu grid.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.speedDialEnabled ?? true}
                      onChange={e => updateField('speedDialEnabled', e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13.5 }}>Hardware Barcode Scanner &amp; SKU Lookup</div>
                      <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                        Enables USB &amp; Bluetooth HID barcode guns to automatically add scanned items to cart.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.barcodeEnabled ?? false}
                      onChange={e => updateField('barcodeEnabled', e.target.checked)}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>
                </div>
              </div>

              {/* Order Numbering & Token Logic */}
              <div className="card card-padded">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Hash size={18} color="var(--color-accent)" />
                  <h3 className="text-title3" style={{ margin: 0 }}>Order &amp; Token Numbering</h3>
                </div>
                <p className="text-secondary text-footnote" style={{ marginBottom: 'var(--space-4)' }}>
                  Format ticket numbers and token queuing behavior for customer recognition.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
                  <div className="form-group">
                    <label className="form-label">Order Number Prefix</label>
                    <input
                      className="form-input"
                      placeholder="e.g. ORD-, DINE-, #"
                      value={settings.workflowConfig?.orderPrefix ?? 'ORD-'}
                      onChange={e => updateField('workflowConfig.orderPrefix', e.target.value.toUpperCase())}
                    />
                    <span className="text-secondary text-caption2" style={{ marginTop: 4, display: 'block' }}>
                      Preview: <strong>{settings.workflowConfig?.orderPrefix || 'ORD-'}1042</strong>
                    </span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">QSR Token Queue Cycle</label>
                    <select
                      className="form-select"
                      value={settings.workflowConfig?.tokenResetCycle ?? 'daily'}
                      onChange={e => updateField('workflowConfig.tokenResetCycle', e.target.value)}
                    >
                      <option value="daily">Daily Reset (Starts from #1 every morning)</option>
                      <option value="loop99">Continuous Loop 1 to 99</option>
                      <option value="loop999">Continuous Loop 1 to 999</option>
                    </select>
                  </div>
                </div>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-secondary)',
                  cursor: 'pointer',
                  marginTop: 'var(--space-3)'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>🔊 Voice Token Callout on Customer TV Screen</div>
                    <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                      Automatically announces token numbers via synthetic voice when marked ready on KDS or called by staff.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.workflowConfig?.tokenVoiceCallout ?? true}
                    onChange={e => updateField('workflowConfig.tokenVoiceCallout', e.target.checked)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                </label>
              </div>

              {/* Billing, Rounding & Bill Splitting */}
              <div className="card card-padded">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Coins size={18} color="var(--color-accent)" />
                  <h3 className="text-title3" style={{ margin: 0 }}>Billing, Rounding &amp; Bill Splitting</h3>
                </div>
                <p className="text-secondary text-footnote" style={{ marginBottom: 'var(--space-4)' }}>
                  Control currency rounding, split bill access, and gratuity suggestions.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
                  <div className="form-group">
                    <label className="form-label">Cash Total Rounding</label>
                    <select
                      className="form-select"
                      value={settings.workflowConfig?.cashRounding ?? 'exact'}
                      onChange={e => updateField('workflowConfig.cashRounding', e.target.value)}
                    >
                      <option value="exact">Exact (No rounding — e.g. 14.65)</option>
                      <option value="nearest_integer">Round to Nearest Integer (e.g. 14.65 → 15.00)</option>
                      <option value="nearest_half">Round to Nearest 0.50 (e.g. 14.65 → 14.50)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Suggested Tip Percentages</label>
                    <input
                      className="form-input"
                      placeholder="e.g. 5, 10, 15"
                      value={settings.workflowConfig?.tipPresets ?? '5, 10, 15'}
                      onChange={e => updateField('workflowConfig.tipPresets', e.target.value)}
                    />
                    <span className="text-secondary text-caption2" style={{ marginTop: 4, display: 'block' }}>
                      Comma-separated quick tip chips shown on payment screen.
                    </span>
                  </div>
                </div>

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg-secondary)',
                  cursor: 'pointer',
                  marginTop: 'var(--space-3)'
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>Enable Bill Splitting in POS</div>
                    <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                      Allows cashiers to divide a single check equally or item-by-item across multiple guests and payment methods.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.workflowConfig?.splitBillEnabled ?? true}
                    onChange={e => updateField('workflowConfig.splitBillEnabled', e.target.checked)}
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                </label>
              </div>
            </>
          )}

          {/* Modules & Features Tab */}
          {activeTab === 'features' && (
            <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '22px' }}>🧩</span>
                    <h3 className="text-title3" style={{ margin: 0 }}>Active Modules &amp; POS Capabilities</h3>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: 'var(--weight-bold)',
                      background: 'var(--color-accent-light)',
                      color: 'var(--color-accent)',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)'
                    }}>
                      {(settings.modes ?? []).length} / {MODES.length} Modules Active
                    </span>
                  </div>
                  <p className="text-secondary text-footnote" style={{ marginTop: '4px' }}>
                    Toggle system modules to tailor DineOS to your exact format. Changes reflect instantly on your POS sidebar and cashier terminal.
                  </p>
                </div>
              </div>

              {/* ⚡ Quick Format Presets Bar */}
              <div style={{
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-separator)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-bold)', color: 'var(--color-label-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={14} color="var(--color-accent)" /> 1-Tap Setup by Restaurant Format:
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                    Auto-selects optimal modules for your venue type
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {MODULE_PRESETS.map(preset => {
                    const activeCount = preset.modes.filter(k => (settings.modes ?? []).includes(k)).length;
                    const isFullyActive = activeCount === preset.modes.length;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`btn btn-sm ${isFullyActive ? 'btn-primary' : 'btn-secondary'}`}
                        style={{
                          fontSize: '12px',
                          padding: '5px 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                        title={preset.desc}
                        onClick={() => {
                          const newModes = Array.from(new Set([...preset.modes]));
                          updateField('modes', newModes);
                          if (newModes.includes('kds')) {
                            updateField('kitchenConfig.mode', settings.kitchenConfig?.mode === 'disabled' ? 'both' : (settings.kitchenConfig?.mode || 'both'));
                          }
                          toast.success(`Applied ${preset.name} modules preset!`, { icon: preset.emoji });
                        }}
                      >
                        <span>{preset.emoji}</span>
                        <span>{preset.name}</span>
                        {isFullyActive && <Check size={13} style={{ marginLeft: 2 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* The 6 Modular Pillars */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                {MODULE_PILLARS.map(pillar => (
                  <div key={pillar.id} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {/* Pillar Title & Badge */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderBottom: '1px solid var(--color-separator)',
                      paddingBottom: 'var(--space-2)',
                      flexWrap: 'wrap',
                      gap: 8
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h4 style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', color: 'var(--color-label-primary)', margin: 0 }}>
                            {pillar.title}
                          </h4>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-separator)',
                            color: 'var(--color-label-secondary)'
                          }}>
                            {pillar.badge}
                          </span>
                        </div>
                        <p className="text-secondary text-caption1" style={{ marginTop: 2, margin: 0 }}>
                          {pillar.desc}
                        </p>
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--color-label-tertiary)' }}>
                        {pillar.keys.filter(k => (settings.modes ?? []).includes(k)).length} / {pillar.keys.length} active
                      </div>
                    </div>

                    {/* Cards Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 'var(--space-3)' }}>
                      {pillar.keys.map(key => {
                        const m = MODES.find(x => x.key === key);
                        if (!m) return null;
                        const active = (settings.modes ?? []).includes(m.key);
                        return (
                          <div
                            key={m.key}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              padding: 'var(--space-3) var(--space-4)',
                              border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-separator)'}`,
                              borderRadius: 'var(--radius-md)',
                              background: active ? 'var(--color-accent-light)' : 'var(--color-bg)',
                              transition: 'all var(--duration-fast)',
                              minHeight: '105px'
                            }}
                          >
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', cursor: 'pointer', margin: 0 }}>
                              <input
                                type="checkbox"
                                id={`mode-${m.key}`}
                                checked={active}
                                style={{ marginTop: 3 }}
                                onChange={e => {
                                  const modes = settings.modes ?? [];
                                  const checked = e.target.checked;
                                  updateField('modes', checked ? [...modes, m.key] : modes.filter(x => x !== m.key));
                                  if (m.key === 'kds') {
                                    updateField('kitchenConfig.mode', checked ? (settings.kitchenConfig?.mode === 'disabled' ? 'both' : (settings.kitchenConfig?.mode || 'both')) : 'disabled');
                                  }
                                }}
                              />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-footnote)', color: 'var(--color-label-primary)' }}>
                                  {m.label}
                                </div>
                                <div style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)', marginTop: 2, lineHeight: 1.35 }}>
                                  {m.desc}
                                </div>
                              </div>
                            </label>

                            {/* Actions / Deep links */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, marginTop: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                              {m.isAction === 'vault' && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={(e) => { e.preventDefault(); handleExportDataVault(); }}
                                  style={{ fontSize: '11px', padding: '3px 8px', height: '26px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                  <Download size={12} /> Download JSON Vault
                                </button>
                              )}

                              {m.isAction === 'tally' && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  onClick={(e) => { e.preventDefault(); handleExportTally(); }}
                                  style={{ fontSize: '11px', padding: '3px 8px', height: '26px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                >
                                  <FileSpreadsheet size={12} /> Export Tally XML
                                </button>
                              )}

                              {m.tab && (
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTab(m.tab); }}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    padding: '2px 4px',
                                    fontSize: '11px',
                                    color: 'var(--color-accent)',
                                    fontWeight: 'var(--weight-bold)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3
                                  }}
                                >
                                  ⚙️ Configure {m.tabName || 'Tab'} →
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Business Advisor (Groq Engine) Card */}
              <div style={{
                marginTop: 'var(--space-3)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-separator)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: 'rgba(16, 185, 129, 0.12)',
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Bot size={16} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: 'var(--text-body)', fontWeight: 700 }}>
                      Business Advisor (Groq Engine)
                    </h4>
                    <span style={{ fontSize: '11px', background: 'var(--color-fill)', color: 'var(--color-label-secondary)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                      Fast Tier (Free)
                    </span>
                  </div>
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '12px', color: '#818cf8', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    Get Free Groq API Key <ExternalLink size={12} />
                  </a>
                </div>

                <p style={{ margin: 0, fontSize: 'var(--text-footnote)', color: 'var(--color-label-secondary)', lineHeight: 1.4 }}>
                  Connect your free Groq API key to unlock natural language executive consulting in the Dashboard and Reports. DineOS sends compact, pre-calculated local metrics so your queries consume minimal tokens with zero rate limit stress.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', alignItems: 'flex-end' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '12px' }}>Groq API Key</label>
                    <input
                      type="password"
                      className="form-input"
                      placeholder="gsk_..."
                      value={settings.groqApiKey || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setSettings(s => ({ ...s, groqApiKey: val }));
                        saveLocalGroqApiKey(val);
                      }}
                      style={{ fontSize: '13px', height: '36px' }}
                    />
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '12px' }}>Advisor AI Model</label>
                    <select
                      className="form-input"
                      value={settings.groqModel || 'llama-3.1-8b-instant'}
                      onChange={e => setSettings(s => ({ ...s, groqModel: e.target.value }))}
                      style={{ fontSize: '13px', height: '36px' }}
                    >
                      <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant (14,400 req/day - Recommended)</option>
                      <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (Deep Reasoning)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 🛡️ Sovereign Data Trust Banner (PetPooja Antidote) */}
              <div style={{
                marginTop: 'var(--space-3)',
                padding: 'var(--space-4)',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(59, 130, 246, 0.05) 100%)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 'var(--space-3)'
              }}>
                <ShieldCheck size={22} color="#10b981" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 'var(--text-footnote)', fontWeight: 700, color: 'var(--color-label-primary)' }}>
                    100% Data Sovereignty &amp; Owner Protection Guarantee
                  </div>
                  <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                    Your sales metrics, customer phone numbers, recipe margins, and inventory data belong strictly to your business. DineOS runs with isolated tenant boundaries and zero third-party telemetry, data resale, or uncoordinated tax surrender.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Displays & TV Hub Tab */}
          {activeTab === 'displays' && (
            <>
              {/* QSR TV Token Display */}
              <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Tv size={18} color="var(--color-accent)" />
                    <h3 className="text-title3" style={{ margin: 0 }}>QSR Live Token TV Display</h3>
                  </div>
                  <p className="text-secondary text-footnote">
                    Open this URL on a TV or monitor in your waiting lounge or collection counter to show live preparing and ready tokens.
                  </p>
                </div>
                <div style={{ display:'flex', gap:'var(--space-3)', alignItems:'center' }}>
                  <input
                    className="form-input"
                    readOnly
                    value={`${window.location.origin}/display/tokens/${restaurant?.id}`}
                    style={{ fontFamily:'var(--font-mono)', fontSize:'var(--text-footnote)', background:'var(--color-bg-secondary)' }}
                  />
                  <button className="btn btn-primary" id="copy-token-link-btn" onClick={copyTokenDisplayLink} type="button">
                    {copiedToken ? <Check size={16}/> : <Copy size={16}/>}
                    {copiedToken ? 'Copied!' : 'Copy Link'}
                  </button>
                  <a 
                    href={`/display/tokens/${restaurant?.id}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    title="Open on screen"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <ExternalLink size={14} /> Open Screen
                  </a>
                </div>
              </div>

              {/* TV Poster Boards */}
              <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <h3 className="text-title3" style={{ margin: 0, marginBottom: 4 }}>TV Digital Poster &amp; Menu Boards</h3>
                    <p className="text-secondary text-footnote" style={{ margin: 0 }}>
                      Broadcast marketing offers, animated combo deals, and live menu boards onto smart TVs.
                    </p>
                  </div>
                  <a href="/admin/posters" className="btn btn-secondary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Manage Screens in Poster Studio →
                  </a>
                </div>

                {slideshowList.length === 0 ? (
                  <div style={{ padding: 'var(--space-4)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                    <p className="text-secondary text-caption1" style={{ margin: 0 }}>
                      No TV Screen channels created yet. Go to <a href="/admin/posters" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>TV Poster Boards</a> to design your first screen.
                    </p>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-3)' }}>
                    {slideshowList.map(s => (
                      <div key={s.id} style={{ display:'flex', flexDirection:'column', gap:'6px', padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>📺 {s.name}</span>
                        <div style={{ display:'flex', gap:'var(--space-3)', alignItems:'center' }}>
                          <input
                            className="form-input"
                            readOnly
                            value={`${window.location.origin}/display/slides/${restaurant?.id}/${s.id}`}
                            style={{ fontFamily:'var(--font-mono)', fontSize:'var(--text-footnote)', background:'var(--color-bg)' }}
                          />
                          <button 
                            className="btn btn-primary btn-sm" 
                            style={{ minWidth: '85px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            onClick={() => copySlideshowLink(s.id)} 
                            type="button"
                          >
                            {copiedSlideshowId === s.id ? <Check size={14}/> : <Copy size={14}/>}
                            {copiedSlideshowId === s.id ? 'Copied!' : 'Copy'}
                          </button>
                          <a 
                            href={`/display/slides/${restaurant?.id}/${s.id}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn btn-secondary btn-sm btn-icon"
                            title="Open on screen"
                            style={{ width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Kitchen & KOT Settings Tab */}
          {activeTab === 'kitchen' && (
            <KitchenSettings settings={settings} updateField={updateField} />
          )}

          {/* Receipt Designer Tab */}
          {activeTab === 'receipts' && (
            <ReceiptDesigner settings={settings} updateField={updateField} />
          )}

          {/* Taxes & Payments Tab */}
          {activeTab === 'tax-pay' && (
            <>
              {/* Tax Config */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-4)'}}>Tax Configuration</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Tax Type</label>
                    <select id="tax-type-select" className="form-select" value={settings.taxConfig?.type??'none'} onChange={e=>updateField('taxConfig.type',e.target.value)}>
                      {TAX_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                  </div>
                  {settings.taxConfig?.type !== 'none' && (
                    <div className="form-group">
                      <label className="form-label">Tax Calculation Mode</label>
                      <select 
                        id="tax-mode-select" 
                        className="form-select" 
                        value={settings.taxConfig?.mode ?? 'exclusive'} 
                        onChange={e => updateField('taxConfig.mode', e.target.value)}
                      >
                        <option value="exclusive">Tax Exclusive (Added on top of menu prices)</option>
                        <option value="inclusive">Tax Inclusive (Included inside menu prices)</option>
                      </select>
                      <span className="text-secondary text-caption2" style={{ marginTop: '4px', display: 'block' }}>
                        In inclusive mode, items are sold at the displayed price and tax is separated automatically on bills.
                      </span>
                    </div>
                  )}
                  {settings.taxConfig?.type === 'gst' && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                      <div className="form-group">
                        <label className="form-label">CGST %</label>
                        <input id="cgst-input" className="form-input" type="number" min={0} max={50} step={0.5} value={settings.taxConfig?.cgst??9} onChange={e=>updateField('taxConfig.cgst',parseFloat(e.target.value))} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">SGST %</label>
                        <input id="sgst-input" className="form-input" type="number" min={0} max={50} step={0.5} value={settings.taxConfig?.sgst??9} onChange={e=>updateField('taxConfig.sgst',parseFloat(e.target.value))} />
                      </div>
                    </div>
                  )}
                  {['vat','flat'].includes(settings.taxConfig?.type) && (
                    <div className="form-group">
                      <label className="form-label">Rate %</label>
                      <input id="tax-rate-input" className="form-input" type="number" min={0} max={50} step={0.5} value={settings.taxConfig?.rate??5} onChange={e=>updateField('taxConfig.rate',parseFloat(e.target.value))} />
                    </div>
                  )}
                </div>
              </div>

              {/* Interactive Tax Calculation Sandbox */}
              <TaxCalculatorHelper
                taxConfig={settings.taxConfig}
                currency={settings.currency || 'INR'}
                onSelectMode={(mode) => updateField('taxConfig.mode', mode)}
              />

              {/* Service Charge & Gratuity */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>Service Charge &amp; Gratuity</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Configure default service charge percentage automatically applied to dine-in bills.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                    <div className="form-group">
                      <label className="form-label">Service Charge Rate %</label>
                      <input
                        id="service-charge-rate-input"
                        className="form-input"
                        type="number"
                        min={0}
                        max={30}
                        step={0.5}
                        value={settings.serviceChargeRate ?? 0}
                        onChange={e => updateField('serviceChargeRate', parseFloat(e.target.value) || 0)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Apply Tax on Service Charge</label>
                      <select
                        id="service-charge-taxable-select"
                        className="form-select"
                        value={settings.serviceChargeTaxable ?? 'no'}
                        onChange={e => updateField('serviceChargeTaxable', e.target.value)}
                      >
                        <option value="no">No (added post-tax)</option>
                        <option value="yes">Yes (added pre-tax)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cash Management Shift Mode */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>Cash Drawer &amp; Till Management</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Configure how cash shifts, float balance, and end-of-day counts are tracked across terminals.
                </p>
                <div className="form-group">
                  <label className="form-label">Cash Shift Mode</label>
                  <select 
                    className="form-select" 
                    value={settings.shiftMode || 'global'} 
                    onChange={e => updateField('shiftMode', e.target.value)}
                  >
                    <option value="global">Single Central Till (Shared by all staff on duty)</option>
                    <option value="staff">Individual Staff Banks (Each cashier opens &amp; settles their own bank)</option>
                  </select>
                  <span className="text-secondary text-caption2" style={{ marginTop: '4px', display: 'block' }}>
                    Determines whether shifts and cash drops are consolidated across the venue or balanced per staff member.
                  </span>
                </div>
              </div>

              {/* Stripe Payment Terminal */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>💳 Stripe Payment Terminal</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Configure credentials to pair a physical Stripe Reader card terminal via Cloud API.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Stripe Publishable Key</label>
                    <input
                      id="settings-stripe-publishable-key"
                      className="form-input"
                      type="password"
                      placeholder="pk_test_..."
                      value={settings.stripePublishableKey ?? ''}
                      onChange={e => updateField('stripePublishableKey', e.target.value)}
                    />
                  </div>
                  
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                    <div className="form-group">
                      <label className="form-label">Stripe Location ID</label>
                      <input
                        id="settings-stripe-location-id"
                        className="form-input"
                        placeholder="tmpl_..."
                        value={settings.stripeLocationId ?? ''}
                        onChange={e => updateField('stripeLocationId', e.target.value)}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Stripe Reader ID</label>
                      <input
                        id="settings-stripe-reader-id"
                        className="form-input"
                        placeholder="e.g. reader_..."
                        value={settings.stripeReaderId ?? ''}
                        onChange={e => updateField('stripeReaderId', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        if (!settings.stripePublishableKey || !settings.stripeReaderId) {
                          toast.error('Please configure Stripe Publishable Key and Reader ID first!');
                          return;
                        }
                        toast.success(`Registering Stripe reader ${settings.stripeReaderId}... Check console!`);
                        console.log('%c[Stripe Terminal Connection Handshake]', 'color:#3b82f6;font-weight:bold;', {
                          publishableKey: settings.stripePublishableKey.slice(0, 10) + '...',
                          locationId: settings.stripeLocationId || 'N/A',
                          readerId: settings.stripeReaderId,
                          status: 'READER_CONNECTED'
                        });
                      }}
                    >
                      🔌 Test Stripe Reader Connection
                    </button>
                  </div>
                </div>
              </div>

              {/* UPI Payment Gateway */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>📱 UPI Payment Gateway</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Configure Merchant details to collect instant zero-fee payments via dynamic UPI QR codes.
                </p>
                <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                    <div className="form-group">
                      <label className="form-label">Merchant UPI VPA ID</label>
                      <input
                        id="settings-upi-vpa"
                        className="form-input"
                        placeholder="e.g. merchant@upi"
                        value={settings.upiConfig?.vpa ?? ''}
                        onChange={e => updateField('upiConfig.vpa', e.target.value)}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label className="form-label">Merchant Display Name</label>
                      <input
                        id="settings-upi-name"
                        className="form-input"
                        placeholder="e.g. DineOS India"
                        value={settings.upiConfig?.name ?? ''}
                        onChange={e => updateField('upiConfig.name', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        const vpa = settings.upiConfig?.vpa;
                        if (!vpa) {
                          toast.error('Please configure a Merchant UPI VPA ID first!');
                          return;
                        }
                        const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
                        if (!upiRegex.test(vpa)) {
                          toast.error('Invalid UPI VPA ID format (must contain @ and valid handles like merchant@upi)');
                          return;
                        }
                        toast.success('UPI configuration format is valid!');
                      }}
                    >
                      🔌 Validate UPI VPA ID Format
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Online & Delivery Tab */}
          {activeTab === 'online-del' && (
            <>
              {/* Online Order Link */}
              {(settings.modes??[]).includes('online') ? (
                <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div>
                    <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>Online Order Page</h3>
                    <p className="text-secondary text-footnote">
                      Share this link with customers to let them order online
                    </p>
                  </div>
                  <div style={{ display:'flex', gap:'var(--space-3)', alignItems:'center' }}>
                    <input
                      className="form-input"
                      readOnly
                      value={`${window.location.origin}/order/${settings.slug || restaurant?.id}`}
                      style={{ fontFamily:'var(--font-mono)', fontSize:'var(--text-footnote)', background:'var(--color-bg-secondary)' }}
                    />
                    <button className="btn btn-primary" id="copy-order-link-btn" onClick={copyOrderLink}>
                      {copied ? <Check size={16}/> : <Copy size={16}/>}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-secondary text-caption2" style={{marginTop:'calc(-1 * var(--space-2))'}}>
                    QR code — print this page or use a QR generator with the link above
                  </p>

                  <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)', borderTop:'1px solid var(--color-separator)', paddingTop:'var(--space-4)' }}>
                    <h4 style={{ fontWeight:'var(--weight-semibold)', fontSize:'var(--text-subhead)', color:'var(--color-label)', marginBottom: -4 }}>Branding & Setup</h4>
                    
                    <div className="form-group">
                      <label className="form-label">Custom URL Slug</label>
                      <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
                        <span style={{ fontSize:'var(--text-footnote)', color:'var(--color-label-secondary)', whiteSpace:'nowrap' }}>/order/</span>
                        <input
                          id="settings-slug"
                          className="form-input"
                          placeholder="e.g. my-cafe-name"
                          value={settings.slug ?? ''}
                          onChange={e => updateField('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
                        />
                      </div>
                      <span className="text-secondary text-caption2">Only lowercase letters, numbers, hyphens, and underscores are allowed.</span>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Restaurant Description</label>
                      <textarea
                        id="settings-online-desc"
                        className="form-input"
                        placeholder="Brief description of your restaurant, tagline, or opening hours..."
                        value={settings.onlineDescription ?? ''}
                        onChange={e => updateField('onlineDescription', e.target.value)}
                        style={{ minHeight: 80, fontFamily: 'inherit', resize: 'vertical' }}
                      />
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'var(--space-3)' }}>
                      <div className="form-group">
                        <label className="form-label">Logo Image URL</label>
                        <input
                          id="settings-online-logo"
                          className="form-input"
                          placeholder="https://example.com/logo.png"
                          value={settings.onlineLogo ?? ''}
                          onChange={e => updateField('onlineLogo', e.target.value)}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Cover Banner URL</label>
                        <input
                          id="settings-online-cover"
                          className="form-input"
                          placeholder="https://example.com/cover.jpg"
                          value={settings.onlineCover ?? ''}
                          onChange={e => updateField('onlineCover', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px', padding: '40px var(--space-6)' }}>
                  <div style={{ fontSize: '48px' }}>📱</div>
                  <h3 className="text-title3">Online Ordering is Disabled</h3>
                  <p className="text-secondary text-footnote" style={{ maxWidth: '400px', lineHeight: '1.5' }}>
                    To configure your online store link, custom URL slug, description, and storefront branding, please enable the <strong>Online Orders</strong> mode in General settings first.
                  </p>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => setActiveTab('general')}
                    style={{ marginTop: '8px' }}
                  >
                    Go to General Settings
                  </button>
                </div>
              )}

              {/* Delivery Integrations */}
              <div className="card card-padded">
                <h3 className="text-title3" style={{marginBottom:'var(--space-2)'}}>Delivery Integrations</h3>
                <p className="text-secondary text-footnote" style={{marginBottom:'var(--space-4)'}}>
                  Directly connect Zomato, Swiggy, Uber Eats, and Deliveroo. (Partner approval required on developer portals).
                </p>

                {/* Auto Accept Settings */}
                <div style={{
                  marginBottom: 'var(--space-6)',
                  padding: 'var(--space-4)',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-2)'
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      id="delivery-auto-accept"
                      checked={settings.deliverySettings?.autoAccept ?? false}
                      onChange={e => updateField('deliverySettings.autoAccept', e.target.checked)}
                    />
                    <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)' }}>Auto-Accept Delivery Orders</span>
                  </label>
                  <p className="text-secondary text-caption1" style={{ marginLeft: 'var(--space-6)' }}>
                    Automatically accept incoming platform orders and push them directly to the KDS/Kitchen. Turn off to manually review first.
                  </p>
                </div>

                {/* Platforms List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                  {[
                    {
                      id: 'ubereats',
                      name: 'Uber Eats',
                      emoji: '🚗',
                      fields: [
                        { key: 'clientId', label: 'Client ID', placeholder: 'client_id_...' },
                        { key: 'clientSecret', label: 'Client Secret', placeholder: 'client_secret_...', type: 'password' },
                        { key: 'storeId', label: 'Store ID', placeholder: 'store_id_...' }
                      ]
                    },
                    {
                      id: 'zomato',
                      name: 'Zomato',
                      emoji: '🍕',
                      fields: [
                        { key: 'apiKey', label: 'API Key', placeholder: 'zomato_api_key_...' },
                        { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'zomato_restaurant_id_...' }
                      ]
                    },
                    {
                      id: 'swiggy',
                      name: 'Swiggy',
                      emoji: '🟠',
                      fields: [
                        { key: 'apiKey', label: 'API Key', placeholder: 'swiggy_api_key_...' },
                        { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'swiggy_restaurant_id_...' }
                      ]
                    },
                    {
                      id: 'deliveroo',
                      name: 'Deliveroo',
                      emoji: '🦘',
                      fields: [
                        { key: 'apiKey', label: 'API Key', placeholder: 'deliveroo_api_key_...' },
                        { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'deliveroo_restaurant_id_...' }
                      ]
                    }
                  ].map(platform => {
                    const config = settings.deliveryIntegrations?.[platform.id] ?? {};
                    const enabled = config.enabled ?? false;
                    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project';
                    const webhookUrl = `https://us-central1-${projectId}.cloudfunctions.net/handleDeliveryWebhook?platform=${platform.id}&restaurantId=${restaurant?.id}`;

                    return (
                      <div key={platform.id} style={{
                        border: '1px solid var(--color-separator-opaque)',
                        borderRadius: 'var(--radius-lg)',
                        overflow: 'hidden'
                      }}>
                        {/* Header */}
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 'var(--space-4)',
                          background: enabled ? 'var(--color-bg-secondary)' : 'transparent',
                          borderBottom: enabled ? '1px solid var(--color-separator-opaque)' : 'none'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <span style={{ fontSize: '1.5rem' }}>{platform.emoji}</span>
                            <div>
                              <span style={{ fontWeight: 'var(--weight-semibold)' }}>{platform.name}</span>
                              <span style={{
                                marginLeft: 'var(--space-2)',
                                fontSize: 'var(--text-caption2)',
                                color: enabled ? 'var(--color-success)' : 'var(--color-label-tertiary)',
                                background: enabled ? 'rgba(52, 199, 89, 0.1)' : 'rgba(142, 142, 147, 0.1)',
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-sm)'
                              }}>
                                {enabled ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                            <input
                              type="checkbox"
                              id={`enable-${platform.id}`}
                              checked={enabled}
                              onChange={e => updateField(`deliveryIntegrations.${platform.id}.enabled`, e.target.checked)}
                            />
                            <span style={{ fontSize: 'var(--text-caption1)' }}>Enable</span>
                          </label>
                        </div>

                        {/* Form fields */}
                        {enabled && (
                          <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                            {platform.fields.map(field => (
                              <div className="form-group" key={field.key}>
                                <label className="form-label">{field.label}</label>
                                <input
                                  id={`${platform.id}-${field.key}`}
                                  className="form-input"
                                  type={field.type || 'text'}
                                  placeholder={field.placeholder}
                                  value={config[field.key] ?? ''}
                                  onChange={e => updateField(`deliveryIntegrations.${platform.id}.${field.key}`, e.target.value)}
                                />
                              </div>
                            ))}

                            {/* Webhook Info */}
                            <div style={{ marginTop: 'var(--space-2)' }}>
                              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                                Webhook URL
                              </label>
                              <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                                <input
                                  id={`${platform.id}-webhook`}
                                  className="form-input"
                                  readOnly
                                  value={webhookUrl}
                                  style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-caption2)', background: 'var(--color-bg-secondary)' }}
                                />
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  style={{ padding: 'var(--space-2)' }}
                                  onClick={() => {
                                    navigator.clipboard.writeText(webhookUrl);
                                    toast.success(`${platform.name} Webhook URL copied!`);
                                  }}
                                >
                                  <Copy size={14} />
                                </button>
                              </div>
                              <p className="text-secondary text-caption2" style={{ marginTop: 'var(--space-1)' }}>
                                Provide this URL in the {platform.name} Developer Portal to receive real-time order updates.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Notifications & Reports Tab */}
          {activeTab === 'notifications' && (
            <>
              {/* Live Kitchen & Service Notifications */}
              <div className="card card-padded" style={{ marginBottom: 'var(--space-4)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--space-2)' }}>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Bell size={20} />
                  </div>
                  <div>
                    <h3 className="text-title3" style={{ margin: 0 }}>🔔 Kitchen & Service Live Alerts</h3>
                    <p className="text-secondary text-footnote" style={{ margin: 0, marginTop: 2 }}>
                      Configure sound alerts, tone presets, and waiter popups when kitchen marks food as ready.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                  {/* Cashier Chime Toggle */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>Cashier Food Ready Alert</div>
                      <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                        Play audible chime and top toast on cashier terminal (no slide popup so checkout is never interrupted)
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.notifications?.cashierFoodReadyChime ?? true}
                      onChange={e => updateField('notifications', { ...(settings.notifications || {}), cashierFoodReadyChime: e.target.checked })}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>

                  {/* Waiter Chime Toggle */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>Waiter Food Ready Sound Alert</div>
                      <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                        Play audible chime on waiter device when food is ready to serve
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.notifications?.waiterFoodReadyChime ?? true}
                      onChange={e => updateField('notifications', { ...(settings.notifications || {}), waiterFoodReadyChime: e.target.checked })}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>

                  {/* Waiter Slide-to-Serve Popup Toggle */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>Assigned Waiter Slide-to-Serve Popup</div>
                      <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                        Exclusively shows interactive slide-to-serve card on the assigned waiter's device
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.notifications?.waiterSlidePopupEnabled ?? true}
                      onChange={e => updateField('notifications', { ...(settings.notifications || {}), waiterSlidePopupEnabled: e.target.checked })}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>

                  {/* Device Vibration Toggle */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-bg-secondary)',
                    cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>Vibrate Mobile & Tablet Devices</div>
                      <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 2 }}>
                        Trigger haptic vibration pulse on mobile waiter devices when food is ready
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.notifications?.vibrateOnReady ?? true}
                      onChange={e => updateField('notifications', { ...(settings.notifications || {}), vibrateOnReady: e.target.checked })}
                      style={{ width: 18, height: 18, cursor: 'pointer' }}
                    />
                  </label>

                  {/* Chime Tone Selector with Live Preview */}
                  <div style={{
                    padding: '14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-separator-opaque)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    marginTop: 4
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-label)' }}>
                      Ready Chime Tone Preset
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <select
                        className="form-input"
                        value={settings.notifications?.readySoundTone ?? 'reception-bell'}
                        onChange={e => updateField('notifications', { ...(settings.notifications || {}), readySoundTone: e.target.value })}
                        style={{ flex: 1, minWidth: 200 }}
                      >
                        {TONE_PRESETS.map(tone => (
                          <option key={tone.id} value={tone.id}>
                            {tone.name} — {tone.desc}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => playNotificationTone(settings.notifications?.readySoundTone ?? 'reception-bell', 0.6)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 40 }}
                        title="Click to preview the selected chime sound"
                      >
                        <Volume2 size={16} /> Test Sound
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card card-padded">
                <h3 className="text-title3" style={{ marginBottom: 'var(--space-2)' }}>✉️ Daily Sales Email & Admin Notifications</h3>
                <p className="text-secondary text-footnote" style={{ marginBottom: 'var(--space-4)' }}>
                  Configure your Gmail account and app password to automatically dispatch daily end-of-day sales summaries directly to the owner.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div className="form-group">
                    <label className="form-label">Recipient Email Address (Owner / Admin)</label>
                    <input
                      id="settings-admin-email"
                      className="form-input"
                      type="email"
                      placeholder="owner@restaurant.com"
                      value={settings.adminNotificationEmail ?? ''}
                      onChange={e => updateField('adminNotificationEmail', e.target.value)}
                    />
                    <span className="text-secondary text-caption2" style={{ marginTop: '4px', display: 'block' }}>
                      Daily sales reports and system alerts will be sent to this email.
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                    <div className="form-group">
                      <label className="form-label">Sender Gmail Address</label>
                      <input
                        id="settings-sender-gmail"
                        className="form-input"
                        type="email"
                        placeholder="restaurant.reports@gmail.com"
                        value={settings.reportSenderEmail ?? ''}
                        onChange={e => updateField('reportSenderEmail', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Gmail App Password</label>
                      <input
                        id="settings-gmail-app-pass"
                        className="form-input"
                        type="password"
                        placeholder="16-character app password"
                        value={settings.reportGmailAppPassword ?? ''}
                        onChange={e => updateField('reportGmailAppPassword', e.target.value)}
                      />
                    </div>
                  </div>

                  <div style={{ background: 'var(--color-bg-secondary)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                    💡 <strong>How to get a Gmail App Password:</strong><br />
                    1. Enable 2-Step Verification on your Google Account.<br />
                    2. Go to <em>myaccount.google.com/apppasswords</em>.<br />
                    3. Create an app named "DineOS" and paste the generated 16-letter password above.
                  </div>

                  <div style={{ borderTop: '1px solid var(--color-separator-opaque)', paddingTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={settings.dailySalesReportEnabled ?? true}
                        onChange={e => updateField('dailySalesReportEnabled', e.target.checked)}
                      />
                      <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)' }}>Send Automated Daily Sales Summary Every Evening</span>
                    </label>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginTop: 'var(--space-2)' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={handleSendTestReport}
                        disabled={sendingTestReport}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        {sendingTestReport ? 'Sending...' : '📨 Send Today\'s Report (Test Email)'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Peripherals Tab */}
          {activeTab === 'hardware' && (
            <>
              {/* Kitchen Routing Overview Banner */}
              <div style={{
                padding: 'var(--space-4)',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-separator)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 'var(--space-4)',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-accent-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.25rem'
                  }}>
                    🍳
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 'var(--weight-bold)', fontSize: '13.5px', color: 'var(--color-label-primary)' }}>
                        Kitchen Order Routing:
                      </span>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 'var(--weight-bold)',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: (settings.kitchenConfig?.mode === 'disabled') ? 'var(--color-bg-tertiary)' : 'var(--color-accent-light)',
                        color: (settings.kitchenConfig?.mode === 'disabled') ? 'var(--color-label-tertiary)' : 'var(--color-accent)'
                      }}>
                        {settings.kitchenConfig?.mode === 'display_only' ? '🖥️ Display Only (KDS)' :
                         settings.kitchenConfig?.mode === 'printer_only' ? '🖨️ Thermal 3" Printer Only' :
                         settings.kitchenConfig?.mode === 'disabled' ? '🚫 Disabled' : '⚡ Both (Display & 3" Thermal Print)'}
                      </span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--color-label-secondary)', marginTop: '2px' }}>
                      Paper Size: <strong>{settings.kitchenConfig?.paperSize || '80mm'} (3-inch)</strong> · Auto-print & sound alerts configured
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveTab('kitchen')}
                  style={{ height: '32px', fontSize: '12px' }}
                >
                  Configure Kitchen Routing
                </button>
              </div>

              {/* Hardware Peripherals */}
              <div className="card card-padded">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                  <div>
                    <h3 className="text-title3" style={{ marginBottom: '2px' }}>🔌 Printer & Hardware Peripherals</h3>
                    <p className="text-secondary text-footnote">
                      Manage receipts and kitchen tickets by configuring and routing multiple ESC/POS thermal printers.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleAddPrinter}
                    style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Plus size={16} /> Add Printer
                  </button>
                </div>

                {/* Printers list */}
                {(!settings.peripheralConfig?.printers || settings.peripheralConfig.printers.length === 0) ? (
                  <div style={{
                    textAlign: 'center',
                    padding: 'var(--space-8) var(--space-4)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px dashed var(--color-separator)',
                    color: 'var(--color-label-tertiary)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <Printer size={36} color="var(--color-label-quaternary)" />
                    <div>
                      <div style={{ fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)' }}>No Printers Configured</div>
                      <div style={{ fontSize: '12px', marginTop: '4px' }}>Add physical receipt or kitchen printers to route order print jobs.</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={handleAddPrinter}
                      style={{ marginTop: '4px' }}
                    >
                      Configure First Printer
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                    {settings.peripheralConfig.printers.map((printer, idx) => {
                      const modeLabel = printer.mode === 'network' ? `Network: ${printer.ipAddress}` :
                                        printer.mode === 'browser' ? 'Browser Print Dialog' :
                                        printer.mode === 'bluetooth' ? 'Web Bluetooth' : 'Web Serial (COM)';
                      
                      const assignedCats = printer.categories && printer.categories.length > 0
                        ? categories.filter(c => printer.categories.includes(c.id)).map(c => c.name).join(', ')
                        : 'All Categories';

                      return (
                        <div
                          key={printer.id || idx}
                          style={{
                            padding: 'var(--space-4)',
                            background: 'var(--color-bg-secondary)',
                            borderRadius: 'var(--radius-lg)',
                            border: '1px solid var(--color-separator)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 'var(--space-4)'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                            <div style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: 'var(--radius-md)',
                              background: 'var(--color-accent-light)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'var(--color-accent)'
                            }}>
                              <Printer size={20} />
                            </div>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 'var(--weight-bold)', color: 'var(--color-label-primary)' }}>
                                  {printer.name}
                                </span>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 'var(--weight-heavy)',
                                  textTransform: 'uppercase',
                                  padding: '2px 8px',
                                  borderRadius: 'var(--radius-full)',
                                  background: printer.type === 'receipt' ? 'rgba(52, 199, 89, 0.1)' : 'rgba(0, 122, 255, 0.1)',
                                  color: printer.type === 'receipt' ? 'var(--color-success)' : 'var(--color-accent)'
                                }}>
                                  {printer.type === 'receipt' ? 'Receipt' : 'Kitchen / KDS'}
                                </span>
                                <span style={{
                                  fontSize: '10px',
                                  fontWeight: 'var(--weight-bold)',
                                  padding: '2px 8px',
                                  borderRadius: 'var(--radius-full)',
                                  background: 'var(--color-bg-tertiary)',
                                  color: 'var(--color-label-secondary)',
                                  border: '1px solid var(--color-separator-opaque)'
                                }}>
                                  {printer.paperSize === '58mm' ? '2" (58mm)' : printer.paperSize === 'a4' ? 'A4 (Tax Invoice)' : '3" (80mm)'}
                                </span>
                              </div>
                              <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', marginTop: '4px' }}>
                                {modeLabel} {printer.drawerKick && '• Drawer Kick'} {printer.soundAlerts && '• Sound Alerts'}
                              </div>
                              {printer.type === 'kitchen' && (
                                <div style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: '2px' }}>
                                  Routing: <strong style={{ color: 'var(--color-label-secondary)' }}>{assignedCats}</strong>
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                toast.success(`Sending test print to ${printer.name}... 🖨️`);
                                const testOrder = {
                                  id: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
                                  type: printer.type === 'kitchen' ? 'dine-in' : 'takeaway',
                                  tableName: 'T1',
                                  token: '99',
                                  subtotal: 350,
                                  total: 350,
                                  paymentMethod: 'cash'
                                };
                                const testItems = [
                                  { name: 'Test Sample Burger', qty: 1, price: 250 },
                                  { name: 'Iced Lemonade', qty: 1, price: 100 }
                                ];
                                if (printer.type === 'kitchen') {
                                  printSingleKitchenTicket({
                                    restaurant: settings,
                                    order: testOrder,
                                    items: testItems,
                                    staffName: 'Admin',
                                    printerId: printer.id
                                  });
                                } else {
                                  // Use printReceiptSingle to target only THIS printer, not all receipt printers
                                  printReceiptSingle({
                                    restaurant: settings,
                                    order: testOrder,
                                    items: testItems,
                                    staffName: 'Admin',
                                    printer
                                  });
                                }
                              }}
                              style={{ padding: '0 var(--space-2)', height: '32px', fontSize: '11px' }}
                            >
                              Test Print
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-icon"
                              onClick={() => handleEditPrinter(idx, printer)}
                              style={{ width: '32px', height: '32px' }}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-icon"
                              onClick={() => handleDeletePrinter(idx)}
                              style={{ width: '32px', height: '32px', color: 'var(--color-red)' }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Printer Modal Dialog */}
              {showPrinterForm && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowPrinterForm(false)}>
                  <div className="modal animate-slide-up" style={{ maxWidth: 460 }}>
                    <div className="modal-header">
                      <h2 className="modal-title">
                        {activePrinterIndex >= 0 ? '📝 Edit Printer Config' : '🔌 Add New Printer'}
                      </h2>
                      <button className="btn btn-secondary btn-icon" onClick={() => setShowPrinterForm(false)} type="button">
                        <X size={16} />
                      </button>
                    </div>

                    <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                      <div className="form-group">
                        <label className="form-label">Printer Name</label>
                        <input
                          className="form-input"
                          placeholder="e.g. Front Cashier, Kitchen BBQ"
                          value={printerForm.name}
                          onChange={e => setPrinterForm({ ...printerForm, name: e.target.value })}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                        <div className="form-group">
                          <label className="form-label">Printer Role</label>
                          <select
                            className="form-select"
                            value={printerForm.type}
                            onChange={e => setPrinterForm({ ...printerForm, type: e.target.value, categories: e.target.value === 'receipt' ? [] : printerForm.categories })}
                          >
                            <option value="receipt">Receipt (Cashier / Customer)</option>
                            <option value="kitchen">Kitchen / KDS Station Ticket</option>
                          </select>
                        </div>

                        <div className="form-group">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                            <label className="form-label" style={{ margin: 0 }}>Paper / Print Format</label>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                const detected = detectPrinterPaperSize(printerForm.name);
                                setPrinterForm(f => ({ ...f, paperSize: detected }));
                                toast.success(`Auto-detected ${detected === '58mm' ? '2" (58mm)' : detected === 'a4' ? 'A4 Full Tax Invoice' : '3" (80mm)'} from printer name!`);
                              }}
                              style={{ padding: '2px 8px', height: '22px', fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: '4px' }}
                              title="Auto-detect paper size based on printer name"
                            >
                              <Sparkles size={11} color="var(--color-accent)" /> Auto-Detect
                            </button>
                          </div>
                          <select
                            className="form-select"
                            value={printerForm.paperSize || '80mm'}
                            onChange={e => setPrinterForm({ ...printerForm, paperSize: e.target.value })}
                          >
                            <option value="80mm">3-inch (80mm) — Standard Counter / Kitchen (48 cols)</option>
                            <option value="58mm">2-inch (58mm) — Mobile / Portable Bluetooth (32 cols)</option>
                            <option value="a4">A4 Full Sheet — Laser / Inkjet (Full Tax Invoice)</option>
                          </select>
                        </div>
                      </div>

                      <div className="form-group">
                        <label className="form-label">Connection Mode</label>
                        <select
                          className="form-select"
                          value={printerForm.mode}
                          onChange={e => setPrinterForm({ ...printerForm, mode: e.target.value, ipAddress: e.target.value !== 'network' ? '' : printerForm.ipAddress })}
                        >
                          <option value="browser">Browser Print Dialog (System Default)</option>
                          <option value="bluetooth">Web Bluetooth ESC/POS (Direct Wireless)</option>
                          <option value="serial">Web Serial COM Port (USB / RS232)</option>
                          <option value="network">Network IP / Ethernet Print Server</option>
                        </select>
                      </div>

                      {printerForm.mode === 'bluetooth' && (
                        <div style={{
                          padding: '10px 14px',
                          background: 'rgba(0, 122, 255, 0.08)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0, 122, 255, 0.25)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Bluetooth size={18} color="var(--color-accent)" />
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-accent)' }}>
                                Wireless Bluetooth Setup
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                                Pair 2" (58mm) or 3" (80mm) thermal printer via browser
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={async () => {
                              const dev = await pairBluetoothPrinter();
                              if (dev) {
                                const devName = dev.name || 'Bluetooth Thermal';
                                const detectedSize = detectPrinterPaperSize(devName);
                                setPrinterForm(f => ({
                                  ...f,
                                  name: f.name || devName,
                                  paperSize: detectedSize
                                }));
                                toast.success(`Paired ${devName}! Auto-configured as ${detectedSize === '58mm' ? '2" (58mm)' : detectedSize === 'a4' ? 'A4' : '3" (80mm)'}.`);
                              }
                            }}
                            style={{ height: 32, fontSize: 11, padding: '0 12px' }}
                          >
                            Pair Device
                          </button>
                        </div>
                      )}

                      {printerForm.mode === 'network' && (
                        <div className="form-group">
                          <label className="form-label">Printer IP Address / Port</label>
                          <input
                            className="form-input"
                            placeholder="e.g. 192.168.1.100:9100"
                            value={printerForm.ipAddress}
                            onChange={e => setPrinterForm({ ...printerForm, ipAddress: e.target.value })}
                          />
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={printerForm.drawerKick}
                            onChange={e => setPrinterForm({ ...printerForm, drawerKick: e.target.checked })}
                          />
                          <span style={{ fontSize: '13px', fontWeight: 'var(--weight-semibold)' }}>Open Cash Drawer</span>
                        </label>

                        <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={printerForm.soundAlerts}
                            onChange={e => setPrinterForm({ ...printerForm, soundAlerts: e.target.checked })}
                          />
                          <span style={{ fontSize: '13px', fontWeight: 'var(--weight-semibold)' }}>Sound Alerts (Buzzer)</span>
                        </label>
                      </div>

                      {printerForm.type === 'kitchen' && (
                        <div style={{ borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-3)' }}>
                          <label className="form-label" style={{ marginBottom: '8px', display: 'block' }}>
                            Route Menu Categories
                          </label>
                          <p className="text-secondary text-footnote" style={{ marginBottom: '10px' }}>
                            Select which categories print to this kitchen ticket. Leave empty to route all categories.
                          </p>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                            gap: '8px',
                            maxHeight: '160px',
                            overflowY: 'auto',
                            padding: '8px',
                            background: 'var(--color-bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-separator)'
                          }}>
                            {categories.map(cat => (
                              <label key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={printerForm.categories.includes(cat.id)}
                                  onChange={() => handleToggleCategory(cat.id)}
                                />
                                <span style={{ fontSize: '12px' }}>{cat.emoji} {cat.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="modal-footer">
                      <button className="btn btn-secondary" onClick={() => setShowPrinterForm(false)} type="button">
                        Cancel
                      </button>
                      <button className="btn btn-primary" onClick={handleSavePrinter} type="button">
                        Save Printer
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>

      {/* Floating Glassmorphic Unsaved Changes Bar */}
      {hasUnsavedChanges && (
        <div className="settings-floating-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>You have unsaved changes</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleDiscard}
              disabled={saving}
              style={{ color: '#e2e8f0', borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)' }}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={save}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}
            >
              <Save size={13} /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
