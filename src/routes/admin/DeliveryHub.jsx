import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { collection, onSnapshot, doc, setDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatCurrency } from '../../utils/formatCurrency';
import { 
  Truck, RefreshCw, AlertCircle, CheckCircle2, 
  ShoppingBag, DollarSign, Percent, Clock, Plus, 
  Trash2, ChevronDown, ChevronUp, Check, X, Sliders,
  Key, Settings as SettingsIcon, Copy, Eye, EyeOff,
  Flame, Search, Play, User,
  TrendingUp, BarChart3, Package, Zap,
  Phone, MapPin, Radio
} from 'lucide-react';
import { useOrderStore } from '../../stores/orderStore';
import toast from 'react-hot-toast';

const PLATFORM_META = {
  talabat: {
    name: 'Talabat',
    emoji: '🟧',
    color: '#ff5a00',
    bg: '#fff4ed',
    region: 'Qatar & GCC',
    fields: [
      { key: 'apiKey', label: 'Talabat Partner API Key', placeholder: 'talabat_api_key_...' },
      { key: 'restaurantId', label: 'Talabat Restaurant / Chain ID', placeholder: 'talabat_branch_id_...' },
      { key: 'storeId', label: 'Store Code (Optional)', placeholder: 'e.g. DOH-001' }
    ]
  },
  snoonu: {
    name: 'Snoonu',
    emoji: '🔴',
    color: '#e30613',
    bg: '#fdefef',
    region: 'Qatar',
    fields: [
      { key: 'apiKey', label: 'Snoonu Merchant API Token', placeholder: 'snoonu_token_...' },
      { key: 'merchantId', label: 'Merchant ID', placeholder: 'snoonu_merchant_id_...' },
      { key: 'branchId', label: 'Branch ID', placeholder: 'snoonu_branch_id_...' }
    ]
  },
  rafeeq: {
    name: 'Rafeeq',
    emoji: '🟣',
    color: '#5c1d8c',
    bg: '#f5effa',
    region: 'Qatar',
    fields: [
      { key: 'apiKey', label: 'Rafeeq Partner API Token', placeholder: 'rafeeq_api_key_...' },
      { key: 'vendorId', label: 'Vendor / Branch ID', placeholder: 'rafeeq_vendor_id_...' }
    ]
  },
  jahez: {
    name: 'Jahez',
    emoji: '🟨',
    color: '#ffb300',
    bg: '#fffbf0',
    region: 'KSA & GCC',
    fields: [
      { key: 'apiKey', label: 'Jahez API Key', placeholder: 'jahez_key_...' },
      { key: 'branchId', label: 'Branch Code', placeholder: 'jahez_branch_code_...' }
    ]
  },
  deliveroo: {
    name: 'Deliveroo',
    emoji: '🦘',
    color: '#00cdbc',
    bg: '#eefcfb',
    region: 'UAE, Qatar & Global',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'deliveroo_api_key_...' },
      { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'deliveroo_restaurant_id_...' }
    ]
  },
  ubereats: {
    name: 'Uber Eats',
    emoji: '🚗',
    color: '#06c167',
    bg: '#eefaf3',
    region: 'Global',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'client_id_...' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'client_secret_...', type: 'password' },
      { key: 'storeId', label: 'Store ID', placeholder: 'store_id_...' }
    ]
  },
  zomato: {
    name: 'Zomato',
    emoji: '🍕',
    color: '#e23744',
    bg: '#fdefef',
    region: 'India & UAE',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'zomato_api_key_...' },
      { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'zomato_restaurant_id_...' }
    ]
  },
  swiggy: {
    name: 'Swiggy',
    emoji: '🟠',
    color: '#fc8019',
    bg: '#fff5ed',
    region: 'India',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'swiggy_api_key_...' },
      { key: 'restaurantId', label: 'Restaurant ID', placeholder: 'swiggy_restaurant_id_...' }
    ]
  }
};

const ALL_PLATFORMS = Object.keys(PLATFORM_META);

const DAYS_OF_WEEK = [
  { value: 'all', label: 'All Days' },
  { value: 'weekdays', label: 'Weekdays (Mon-Fri)' },
  { value: 'weekends', label: 'Weekends (Sat-Sun)' },
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' },
];

export default function DeliveryHub() {
  const { restaurant, staffDoc, user } = useAuthStore();
  const { categories } = useMenuStore();
  
  // Auth details - fallback to admin when user exists without staffDoc
  const role = staffDoc?.role ?? (user ? 'admin' : 'cashier');
  const isUserAdmin = ['admin', 'super_admin', 'manager', 'owner'].includes(role) || Boolean(user && !staffDoc);
  const currency = restaurant?.currency ?? 'INR';

  // Tabs: 'partners', 'orders', 'categories', 'reconciliation', 'settings'
  const [activeTab, setActiveTab] = useState('partners');

  // Firestore & local states
  const [integrations, setIntegrations] = useState({});
  const [orders, setOrders] = useState([]);
  const [syncLogs, setSyncLogs] = useState({});
  
  // Real-time overrides & platform statuses
  const [platformSettings, setPlatformSettings] = useState({}); // { [platform]: { paused, pauseUntil, pauseReason } }
  const [categoryOverrides, setCategoryOverrides] = useState({}); // { [platform]: { [categoryId]: { available: boolean } } }
  const [overrides, setOverrides] = useState({}); // { [platform]: { [itemId]: { available: boolean } } }
  
  const [syncing, setSyncing] = useState(false);
  const [syncingPlatform, setSyncingPlatform] = useState(null);
  
  // Timer for countdowns
  const [now, setNow] = useState(new Date());

  // Category Matrix UI states
  const [expandedCategories, setExpandedCategories] = useState({});

  // Search & Filter states for Live Orders
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersChannelFilter, setOrdersChannelFilter] = useState('all');
  const [ordersStatusFilter, setOrdersStatusFilter] = useState('active'); // 'active' | 'pending' | 'preparing' | 'ready' | 'completed' | 'all'

  // Search & Filter states for Menu Controls
  const [itemSearch, setItemSearch] = useState('');
  const [availFilter, setAvailFilter] = useState('all'); // 'all' | 'paused_only' | 'active_only'

  // Pause Modal state (Single channel)
  const [pauseModal, setPauseModal] = useState({
    isOpen: false,
    platformId: null,
    duration: '30', // '30', '60', '120', 'custom', 'manual'
    customDuration: '',
    reason: ''
  });

  // Master Rush Mode Modal state (All channels)
  const [rushModalOpen, setRushModalOpen] = useState(false);
  const [rushDuration, setRushDuration] = useState('30');
  const [rushReason, setRushReason] = useState('Kitchen Dinner Rush');

  // Partner Configuration Modal state (Admin only)
  const [configModal, setConfigModal] = useState({
    isOpen: false,
    platformId: null,
    enabled: false,
    fields: {},
    commission: 20,
    showSecret: false,
    saving: false
  });

  // Local settings edit state (Admin only)
  const [autoAccept, setAutoAccept] = useState(false);
  const [prepTimeBuffer, setPrepTimeBuffer] = useState(0); // 0, 15, 30, 45 minutes
  const [commissions, setCommissions] = useState({
    talabat: 22,
    snoonu: 20,
    rafeeq: 20,
    jahez: 20,
    deliveroo: 20,
    ubereats: 20,
    zomato: 18,
    swiggy: 18
  });
  const [busyHours, setBusyHours] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Busy Hour schedule form state
  const [newBusyRule, setNewBusyRule] = useState({
    day: 'all',
    start: '14:00',
    end: '16:00'
  });

  // 1. Fetch restaurant settings & integrations status
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = onSnapshot(doc(db, 'restaurants', restaurant.id), docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIntegrations(data.deliveryIntegrations || {});
        
        // Initialize admin configuration values
        setAutoAccept(data.deliverySettings?.autoAccept ?? false);
        setPrepTimeBuffer(data.deliverySettings?.prepTimeBuffer ?? 0);
        setCommissions({
          talabat: data.deliverySettings?.commissions?.talabat ?? 22,
          snoonu: data.deliverySettings?.commissions?.snoonu ?? 20,
          rafeeq: data.deliverySettings?.commissions?.rafeeq ?? 20,
          jahez: data.deliverySettings?.commissions?.jahez ?? 20,
          deliveroo: data.deliverySettings?.commissions?.deliveroo ?? 20,
          ubereats: data.deliverySettings?.commissions?.ubereats ?? 20,
          zomato: data.deliverySettings?.commissions?.zomato ?? 18,
          swiggy: data.deliverySettings?.commissions?.swiggy ?? 18
        });
        setBusyHours(data.deliverySettings?.busyHours ?? []);
      }
    });
    return unsub;
  }, [restaurant?.id]);

  // 2. Fetch delivery orders for analytics (last 30 days)
  useEffect(() => {
    if (!restaurant?.id) return;
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('type', '==', 'online')
    );

    const unsub = onSnapshot(q, snap => {
      const ords = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(o => o.source && o.source !== 'native'); // Only delivery orders
      setOrders(ords);
    });
    return unsub;
  }, [restaurant?.id]);

  // 3. Fetch delivery overrides, status settings, and sync logs for each active platform
  useEffect(() => {
    if (!restaurant?.id) return;

    const platforms = ALL_PLATFORMS;
    const overrideUnsubs = [];
    const logUnsubs = [];

    platforms.forEach(platform => {
      // Listen to item overrides
      const overrideRef = collection(db, 'restaurants', restaurant.id, 'deliverySettings', platform, 'items');
      const unsubOverride = onSnapshot(overrideRef, snap => {
        const platformOverrides = {};
        snap.forEach(d => {
          platformOverrides[d.id] = d.data();
        });
        setOverrides(prev => ({ ...prev, [platform]: platformOverrides }));
      });
      overrideUnsubs.push(unsubOverride);

      // Listen to category overrides
      const catOverrideRef = collection(db, 'restaurants', restaurant.id, 'deliverySettings', platform, 'categories');
      const unsubCatOverride = onSnapshot(catOverrideRef, snap => {
        const platformCatOverrides = {};
        snap.forEach(d => {
          platformCatOverrides[d.id] = d.data();
        });
        setCategoryOverrides(prev => ({ ...prev, [platform]: platformCatOverrides }));
      });
      overrideUnsubs.push(unsubCatOverride);

      // Listen to platform settings (paused state)
      const settingsDocRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platform);
      const unsubSettings = onSnapshot(settingsDocRef, docSnap => {
        if (docSnap.exists()) {
          setPlatformSettings(prev => ({ ...prev, [platform]: docSnap.data() }));
        } else {
          setPlatformSettings(prev => ({ ...prev, [platform]: { paused: false, pauseUntil: null, pauseReason: '' } }));
        }
      });
      overrideUnsubs.push(unsubSettings);

      // Listen to sync logs
      const logRef = collection(db, 'restaurants', restaurant.id, 'deliverySync', platform, 'logs');
      const unsubLog = onSnapshot(logRef, snap => {
        const logs = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => b.timestamp?.toMillis() - a.timestamp?.toMillis());
        setSyncLogs(prev => ({ ...prev, [platform]: logs[0] || null }));
      });
      logUnsubs.push(unsubLog);
    });

    return () => {
      overrideUnsubs.forEach(fn => fn());
      logUnsubs.forEach(fn => fn());
    };
  }, [restaurant?.id]);

  // 4. Timer interval for live countdowns & checking schedules / auto-resumes
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 5. Automatic verification of auto-resume timers and busy hours
  useEffect(() => {
    if (!restaurant?.id) return;
    
    const checkStatusTransitions = async () => {
      const currentTime = new Date();

      // Check for expired timed pauses
      for (const platformId of ALL_PLATFORMS) {
        const settings = platformSettings[platformId];
        if (settings?.paused && settings.pauseUntil) {
          const resumeTime = settings.pauseUntil.toDate ? settings.pauseUntil.toDate() : new Date(settings.pauseUntil);
          if (resumeTime <= currentTime) {
            try {
              const docRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platformId);
              await setDoc(docRef, { paused: false, pauseUntil: null, pauseReason: '' }, { merge: true });
              toast.success(`${PLATFORM_META[platformId].name} automatically resumed!`, { icon: '🟢' });
            } catch (err) {
              console.error('Error auto-resuming platform:', err);
            }
          }
        }
      }

      // Check busy hours schedule rules
      if (busyHours.length > 0) {
        const currentDayStr = currentTime.toLocaleDateString('en-US', { weekday: 'lower' }); // "monday", "tuesday", etc.
        const currentHours = currentTime.getHours().toString().padStart(2, '0');
        const currentMinutes = currentTime.getMinutes().toString().padStart(2, '0');
        const currentTimeStr = `${currentHours}:${currentMinutes}`;
        
        let shouldBePaused = false;
        let matchedRule = null;
        
        for (const rule of busyHours) {
          const isOvernight = rule.start > rule.end;
          let ruleActive;
          
          if (rule.day === 'all') {
            ruleActive = isOvernight
              ? (currentTimeStr >= rule.start || currentTimeStr <= rule.end)
              : (currentTimeStr >= rule.start && currentTimeStr <= rule.end);
          } else {
            let matchesToday = false;
            if (rule.day === 'weekdays' && !['saturday', 'sunday'].includes(currentDayStr)) matchesToday = true;
            else if (rule.day === 'weekends' && ['saturday', 'sunday'].includes(currentDayStr)) matchesToday = true;
            else if (rule.day === currentDayStr) matchesToday = true;

            let matchesYesterday = false;
            const yesterdayDate = new Date(currentTime);
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterdayDayStr = yesterdayDate.toLocaleDateString('en-US', { weekday: 'lower' });
            
            if (rule.day === 'weekdays' && !['saturday', 'sunday'].includes(yesterdayDayStr)) matchesYesterday = true;
            else if (rule.day === 'weekends' && ['saturday', 'sunday'].includes(yesterdayDayStr)) matchesYesterday = true;
            else if (rule.day === yesterdayDayStr) matchesYesterday = true;

            if (isOvernight) {
              ruleActive = (matchesToday && currentTimeStr >= rule.start) || 
                           (matchesYesterday && currentTimeStr <= rule.end);
            } else {
              ruleActive = matchesToday && currentTimeStr >= rule.start && currentTimeStr <= rule.end;
            }
          }

          if (ruleActive) {
            shouldBePaused = true;
            matchedRule = rule;
            break;
          }
        }
        
        if (shouldBePaused && matchedRule) {
          const matchedReason = `Scheduled busy hours (${matchedRule.start} - ${matchedRule.end})`;
          
          for (const platformId of ALL_PLATFORMS) {
            const isEnabled = integrations[platformId]?.enabled === true;
            const settings = platformSettings[platformId];
            
            let hasManualOverride = false;
            if (settings?.manualOverrideUntil) {
              const overrideTime = settings.manualOverrideUntil.toDate 
                ? settings.manualOverrideUntil.toDate() 
                : new Date(settings.manualOverrideUntil);
              if (overrideTime > currentTime) {
                hasManualOverride = true;
              }
            }
            
            if (isEnabled && !hasManualOverride && (!settings?.paused || !settings?.pauseReason?.startsWith('Scheduled busy hours'))) {
              try {
                const docRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platformId);
                
                const isOvernightRule = matchedRule.start > matchedRule.end;
                let ruleEndToday = true;
                if (isOvernightRule && currentTimeStr >= matchedRule.start) {
                  ruleEndToday = false;
                }
                
                const [endH, endM] = matchedRule.end.split(':').map(Number);
                const pauseUntilDate = new Date();
                pauseUntilDate.setHours(endH, endM, 0, 0);
                if (!ruleEndToday) {
                  pauseUntilDate.setDate(pauseUntilDate.getDate() + 1);
                }
                
                await setDoc(docRef, {
                  paused: true,
                  pauseUntil: pauseUntilDate,
                  pauseReason: matchedReason
                }, { merge: true });
                
                toast.success(`${PLATFORM_META[platformId].name} paused due to busy hours schedule.`, { icon: '⏰' });
              } catch (err) {
                console.error('Error setting busy hour pause:', err);
              }
            }
          }
        }
      }
    };
    
    checkStatusTransitions();
  }, [now, platformSettings, busyHours, restaurant?.id, integrations]);

  // Handle manual menu sync trigger
  const triggerSync = async (platformId = null) => {
    if (platformId) {
      setSyncingPlatform(platformId);
    } else {
      setSyncing(true);
    }

    try {
      const baseUrl = `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project'}.cloudfunctions.net/syncDeliveryMenu?restaurantId=${restaurant.id}`;
      const url = platformId ? `${baseUrl}&platform=${platformId}` : baseUrl;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(await res.text());
      }
      await res.json();
      toast.success(platformId ? `${PLATFORM_META[platformId].name} Menu Synced!` : 'All Platform Menus Synced!', { icon: '🔄' });
    } catch (error) {
      console.error(error);
      toast.error('Sync failed: ' + error.message);
    } finally {
      setSyncing(false);
      setSyncingPlatform(null);
    }
  };

  // Toggle menu item availability override per platform
  const toggleOverride = async (platform, itemId, currentStatus) => {
    try {
      const overrideDocRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platform, 'items', itemId);
      await setDoc(overrideDocRef, { available: !currentStatus }, { merge: true });
      toast.success(`Updated item availability on ${PLATFORM_META[platform].name}`);
    } catch (e) {
      toast.error('Failed to update: ' + e.message);
    }
  };

  // Toggle category-level availability override per platform
  const toggleCategoryOverride = async (platform, categoryId, currentStatus) => {
    try {
      const overrideDocRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platform, 'categories', categoryId);
      await setDoc(overrideDocRef, { available: !currentStatus }, { merge: true });
      toast.success(`Updated category availability on ${PLATFORM_META[platform].name}`);
    } catch (e) {
      toast.error('Failed to update: ' + e.message);
    }
  };

  // Toggle category expand state in UI
  const toggleExpandCategory = (categoryId) => {
    setExpandedCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  // Pause / resume category across all active channels
  const toggleCategoryAllPlatforms = async (categoryId, targetStatus) => {
    try {
      const activePlatforms = Object.keys(PLATFORM_META).filter(platformId => integrations[platformId]?.enabled === true);
      if (activePlatforms.length === 0) {
        toast.error('No active platforms found.');
        return;
      }
      const promises = activePlatforms.map(platformId => {
        const docRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platformId, 'categories', categoryId);
        return setDoc(docRef, { available: targetStatus }, { merge: true });
      });
      await Promise.all(promises);
      toast.success(targetStatus ? `Category enabled on all channels` : `Category paused on all channels`);
    } catch (e) {
      toast.error('Operation failed: ' + e.message);
    }
  };

  // Show/Hide Pause Config modal
  const openPauseModal = (platformId) => {
    setPauseModal({
      isOpen: true,
      platformId,
      duration: '30',
      customDuration: '',
      reason: ''
    });
  };

  // Action for manual pause
  const handlePausePlatformSubmit = async () => {
    const { platformId, duration, customDuration, reason } = pauseModal;
    if (!platformId) return;

    let pauseUntil = null;
    if (duration !== 'manual') {
      const minutes = duration === 'custom' ? parseInt(customDuration, 10) : parseInt(duration, 10);
      if (isNaN(minutes) || minutes <= 0) {
        toast.error('Please enter a valid duration in minutes.');
        return;
      }
      const date = new Date();
      date.setMinutes(date.getMinutes() + minutes);
      pauseUntil = date;
    }

    try {
      const docRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platformId);
      await setDoc(docRef, {
        paused: true,
        pauseUntil: pauseUntil,
        pauseReason: reason || 'Kitchen Busy',
        manualOverrideUntil: null
      }, { merge: true });
      
      toast.success(`${PLATFORM_META[platformId].name} paused.`);
      setPauseModal({ isOpen: false, platformId: null, duration: '30', customDuration: '', reason: '' });
    } catch (err) {
      toast.error('Failed to pause: ' + err.message);
    }
  };

  // Action to manual resume
  const handleResumePlatform = async (platformId) => {
    try {
      const docRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platformId);
      
      let manualOverrideUntil = null;
      const currentTime = new Date();
      const currentDayStr = currentTime.toLocaleDateString('en-US', { weekday: 'lower' });
      const currentHours = currentTime.getHours().toString().padStart(2, '0');
      const currentMinutes = currentTime.getMinutes().toString().padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMinutes}`;
      
      for (const rule of busyHours) {
        const isOvernight = rule.start > rule.end;
        let ruleActive = false;
        let ruleEndToday = true;
        
        if (rule.day === 'all') {
          ruleActive = isOvernight
            ? (currentTimeStr >= rule.start || currentTimeStr <= rule.end)
            : (currentTimeStr >= rule.start && currentTimeStr <= rule.end);
          if (isOvernight && currentTimeStr <= rule.end) {
            ruleEndToday = true;
          } else if (isOvernight && currentTimeStr >= rule.start) {
            ruleEndToday = false;
          }
        } else {
          let matchesToday = false;
          if (rule.day === 'weekdays' && !['saturday', 'sunday'].includes(currentDayStr)) matchesToday = true;
          else if (rule.day === 'weekends' && ['saturday', 'sunday'].includes(currentDayStr)) matchesToday = true;
          else if (rule.day === currentDayStr) matchesToday = true;

          let matchesYesterday = false;
          const yesterdayDate = new Date(currentTime);
          yesterdayDate.setDate(yesterdayDate.getDate() - 1);
          const yesterdayDayStr = yesterdayDate.toLocaleDateString('en-US', { weekday: 'lower' });
          if (rule.day === 'weekdays' && !['saturday', 'sunday'].includes(yesterdayDayStr)) matchesYesterday = true;
          else if (rule.day === 'weekends' && ['saturday', 'sunday'].includes(yesterdayDayStr)) matchesYesterday = true;
          else if (rule.day === yesterdayDayStr) matchesYesterday = true;

          if (isOvernight) {
            if (matchesToday && currentTimeStr >= rule.start) {
              ruleActive = true;
              ruleEndToday = false;
            } else if (matchesYesterday && currentTimeStr <= rule.end) {
              ruleActive = true;
              ruleEndToday = true;
            }
          } else {
            ruleActive = matchesToday && currentTimeStr >= rule.start && currentTimeStr <= rule.end;
          }
        }
        
        if (ruleActive) {
          const endOverrideDate = new Date();
          const [endH, endM] = rule.end.split(':').map(Number);
          endOverrideDate.setHours(endH, endM, 0, 0);
          if (!ruleEndToday) {
            endOverrideDate.setDate(endOverrideDate.getDate() + 1);
          }
          manualOverrideUntil = endOverrideDate;
          break;
        }
      }

      await setDoc(docRef, {
        paused: false,
        pauseUntil: null,
        pauseReason: '',
        manualOverrideUntil: manualOverrideUntil
      }, { merge: true });
      toast.success(`${PLATFORM_META[platformId].name} resumed!`);
    } catch (err) {
      toast.error('Failed to resume: ' + err.message);
    }
  };

  // Save admin integration configurations
  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const docRef = doc(db, 'restaurants', restaurant.id);
      await setDoc(docRef, {
        deliverySettings: {
          autoAccept,
          prepTimeBuffer,
          commissions,
          busyHours
        }
      }, { merge: true });
      
      // Sync auth state locally
      const updatedRestObj = {
        ...restaurant,
        deliverySettings: {
          autoAccept,
          prepTimeBuffer,
          commissions,
          busyHours
        }
      };
      useAuthStore.setState({ restaurant: updatedRestObj });
      
      toast.success('Integration settings saved successfully!');
    } catch (err) {
      toast.error('Failed to save settings: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Busy hour schedule helpers
  const handleAddBusyRule = () => {
    if (!newBusyRule.start || !newBusyRule.end) {
      toast.error('Please enter valid start and end times.');
      return;
    }
    if (newBusyRule.start >= newBusyRule.end) {
      toast.error('End time must be after start time.');
      return;
    }
    const ruleId = Date.now().toString();
    setBusyHours(prev => [...prev, { ...newBusyRule, id: ruleId }]);
    toast.success('Added time window. Save settings to apply.');
  };

  const handleRemoveBusyRule = (ruleId) => {
    setBusyHours(prev => prev.filter(r => r.id !== ruleId && r.day + r.start + r.end !== ruleId));
    toast.success('Removed window. Save settings to apply.');
  };

  // Pause duration countdown display string helper
  const getPauseCountdown = (platformId) => {
    const settings = platformSettings[platformId];
    if (!settings?.paused || !settings.pauseUntil) return null;
    
    const resumeTime = settings.pauseUntil.toDate ? settings.pauseUntil.toDate() : new Date(settings.pauseUntil);
    const diffMs = resumeTime - now;
    
    if (diffMs <= 0) return 'Resuming...';
    
    const totalSecs = Math.floor(diffMs / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Helper checks
  const isPlatformEnabled = (platformId) => integrations[platformId]?.enabled === true;
  const isPlatformPaused = (platformId) => platformSettings[platformId]?.paused === true;

  // Open partner configuration modal
  const openConfigModal = (platformId) => {
    const currentConfig = integrations[platformId] || {};
    const meta = PLATFORM_META[platformId];
    const initialFields = {};
    (meta?.fields || []).forEach(f => {
      initialFields[f.key] = currentConfig[f.key] ?? '';
    });
    setConfigModal({
      isOpen: true,
      platformId,
      enabled: currentConfig.enabled ?? false,
      fields: initialFields,
      commission: commissions[platformId] ?? 20,
      showSecret: false,
      saving: false
    });
  };

  // Save partner configuration
  const handleSaveConfigModal = async () => {
    const { platformId, enabled, fields, commission } = configModal;
    if (!platformId || !restaurant?.id) return;
    setConfigModal(prev => ({ ...prev, saving: true }));
    try {
      const docRef = doc(db, 'restaurants', restaurant.id);
      const updatedPlatformConfig = {
        ...(integrations[platformId] || {}),
        ...fields,
        enabled: Boolean(enabled)
      };

      const parsedCommission = parseFloat(commission);
      const updatedCommissions = {
        ...commissions,
        [platformId]: isNaN(parsedCommission) ? 20 : parsedCommission
      };

      await setDoc(docRef, {
        deliveryIntegrations: {
          [platformId]: updatedPlatformConfig
        },
        deliverySettings: {
          autoAccept,
          busyHours,
          commissions: updatedCommissions
        }
      }, { merge: true });

      // Local authStore sync
      const updatedRest = {
        ...restaurant,
        deliveryIntegrations: {
          ...(restaurant?.deliveryIntegrations || {}),
          [platformId]: updatedPlatformConfig
        },
        deliverySettings: {
          ...(restaurant?.deliverySettings || {}),
          autoAccept,
          busyHours,
          commissions: updatedCommissions
        }
      };
      useAuthStore.setState({ restaurant: updatedRest });

      // Immediate local state updates
      setIntegrations(prev => ({ ...prev, [platformId]: updatedPlatformConfig }));
      setCommissions(updatedCommissions);

      toast.success(`${PLATFORM_META[platformId]?.name} configuration saved!`);
      setConfigModal(prev => ({ ...prev, isOpen: false, saving: false }));
    } catch (err) {
      console.error('Save configuration error:', err);
      toast.error('Failed to save configuration: ' + err.message);
      setConfigModal(prev => ({ ...prev, saving: false }));
    }
  };

  const handleTogglePlatform = async (platformId, enable) => {
    if (!restaurant?.id || !isUserAdmin) return;
    try {
      const docRef = doc(db, 'restaurants', restaurant.id);
      const updatedPlatformConfig = {
        ...(integrations[platformId] || {}),
        enabled: enable
      };
      await setDoc(docRef, {
        deliveryIntegrations: {
          [platformId]: updatedPlatformConfig
        }
      }, { merge: true });

      // Sync auth state locally
      const updatedRest = {
        ...restaurant,
        deliveryIntegrations: {
          ...(restaurant?.deliveryIntegrations || {}),
          [platformId]: updatedPlatformConfig
        }
      };
      useAuthStore.setState({ restaurant: updatedRest });

      // Immediate local state update
      setIntegrations(prev => ({
        ...prev,
        [platformId]: updatedPlatformConfig
      }));

      toast.success(`${PLATFORM_META[platformId]?.name} ${enable ? 'activated' : 'deactivated'}!`, {
        icon: enable ? '⚡' : '⏸️'
      });
    } catch (err) {
      console.error('Error toggling platform:', err);
      toast.error('Failed to update platform status: ' + err.message);
    }
  };

  // Master Kitchen Rush Mode: Pause all active delivery channels
  const handlePauseAllPlatforms = async (duration = '30', reason = 'Kitchen Rush Hour') => {
    const activePlatforms = Object.keys(PLATFORM_META).filter(isPlatformEnabled);
    if (activePlatforms.length === 0) {
      toast.error('No active delivery channels connected.');
      return;
    }

    let pauseUntil = null;
    if (duration !== 'manual') {
      const minutes = parseInt(duration, 10) || 30;
      const date = new Date();
      date.setMinutes(date.getMinutes() + minutes);
      pauseUntil = date;
    }

    try {
      const promises = activePlatforms.map(platformId => {
        const docRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platformId);
        return setDoc(docRef, {
          paused: true,
          pauseUntil,
          pauseReason: reason || 'Kitchen Rush Mode',
          manualOverrideUntil: null
        }, { merge: true });
      });

      await Promise.all(promises);
      toast.success(`Kitchen Rush: All ${activePlatforms.length} delivery channels paused!`, { icon: '🚨' });
      setRushModalOpen(false);
    } catch (err) {
      console.error('Pause all error:', err);
      toast.error('Failed to pause all channels: ' + err.message);
    }
  };

  // Master Kitchen Rush Mode: Resume all paused delivery channels
  const handleResumeAllPlatforms = async () => {
    const activePlatforms = Object.keys(PLATFORM_META).filter(isPlatformEnabled);
    try {
      const promises = activePlatforms.map(platformId => {
        const docRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platformId);
        return setDoc(docRef, {
          paused: false,
          pauseUntil: null,
          pauseReason: '',
          manualOverrideUntil: null
        }, { merge: true });
      });

      await Promise.all(promises);
      toast.success(`All ${activePlatforms.length} delivery channels resumed!`, { icon: '⚡' });
    } catch (err) {
      console.error('Resume all error:', err);
      toast.error('Failed to resume channels: ' + err.message);
    }
  };

  // Quick prep buffer throttle selector (+0m, +15m, +30m, +45m)
  const handleSetPrepBuffer = async (newBuffer) => {
    setPrepTimeBuffer(newBuffer);
    try {
      const docRef = doc(db, 'restaurants', restaurant.id);
      await setDoc(docRef, {
        deliverySettings: {
          autoAccept,
          commissions,
          busyHours,
          prepTimeBuffer: newBuffer
        }
      }, { merge: true });

      const updatedRest = {
        ...restaurant,
        deliverySettings: {
          ...(restaurant?.deliverySettings || {}),
          autoAccept,
          commissions,
          busyHours,
          prepTimeBuffer: newBuffer
        }
      };
      useAuthStore.setState({ restaurant: updatedRest });
      toast.success(newBuffer > 0 ? `Rush prep buffer set to +${newBuffer}m across channels` : 'Prep buffer reset to normal');
    } catch (err) {
      toast.error('Failed to update prep buffer: ' + err.message);
    }
  };

  // 86'ing helper: toggle individual item availability across ALL active delivery platforms
  const toggleItemAllPlatforms = async (itemId, targetStatus) => {
    try {
      const activePlatforms = Object.keys(PLATFORM_META).filter(isPlatformEnabled);
      if (activePlatforms.length === 0) {
        toast.error('No active platforms connected.');
        return;
      }
      const promises = activePlatforms.map(platformId => {
        const docRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platformId, 'items', itemId);
        return setDoc(docRef, { available: targetStatus }, { merge: true });
      });
      await Promise.all(promises);
      toast.success(targetStatus ? 'Item enabled on all delivery channels' : 'Item 86’d on all delivery channels', {
        icon: targetStatus ? '✓' : '🚫'
      });
    } catch (e) {
      toast.error('Operation failed: ' + e.message);
    }
  };

  // Live Deliveries order status progression
  const handleUpdateDeliveryOrderStatus = async (orderId, newStatus) => {
    try {
      await useOrderStore.getState().updateOrderStatus(restaurant.id, orderId, newStatus);
      toast.success(`Order updated to ${newStatus}`, { icon: '📋' });
    } catch (err) {
      console.error('Order status update failed:', err);
      toast.error('Failed to update order status');
    }
  };

  // Category status check
  const isCategoryEnabled = (platformId, categoryId) => {
    const platformOverride = categoryOverrides[platformId]?.[categoryId];
    return platformOverride ? platformOverride.available !== false : true;
  };

  // Item status check
  const isItemEnabled = (platformId, itemId, defaultAvail) => {
    const itemOverride = overrides[platformId]?.[itemId];
    return itemOverride ? itemOverride.available !== false : defaultAvail !== false;
  };

  // Analytics Math (Today's metrics)
  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => {
    if (!o.createdAt) return false;
    const dateObj = typeof o.createdAt.toDate === 'function' ? o.createdAt.toDate() : new Date(o.createdAt);
    return dateObj.toDateString() === today;
  });

  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  
  const todayCommission = todayOrders.reduce((sum, o) => {
    const rate = commissions[o.source] ?? o.platformCommission ?? 0;
    return sum + ((o.total * rate) / 100);
  }, 0);
  
  const enabledCount = Object.values(integrations).filter(c => c.enabled === true).length;
  const activeCount = Object.entries(integrations).filter(([id, config]) => {
    return config.enabled === true && platformSettings[id]?.paused !== true;
  }).length;

  const activeDeliveryOrders = orders.filter(o => ['pending', 'accepted', 'preparing', 'ready'].includes(o.status));
  const pendingOrdersCount = orders.filter(o => o.status === 'pending').length;
  const anyChannelPaused = Object.keys(PLATFORM_META).some(id => isPlatformEnabled(id) && isPlatformPaused(id));

  // Filtered delivery orders for Live Deliveries tab
  const filteredDeliveryOrders = orders.filter(o => {
    // Channel filter
    if (ordersChannelFilter !== 'all' && o.source !== ordersChannelFilter) return false;

    // Status filter
    if (ordersStatusFilter === 'active') {
      if (!['pending', 'accepted', 'preparing', 'ready'].includes(o.status)) return false;
    } else if (ordersStatusFilter === 'pending') {
      if (o.status !== 'pending') return false;
    } else if (ordersStatusFilter === 'preparing') {
      if (!['preparing', 'accepted'].includes(o.status)) return false;
    } else if (ordersStatusFilter === 'ready') {
      if (o.status !== 'ready') return false;
    } else if (ordersStatusFilter === 'completed') {
      if (!['completed', 'billed'].includes(o.status)) return false;
    }

    // Search filter
    if (ordersSearch.trim()) {
      const q = ordersSearch.trim().toLowerCase();
      const matchNum = String(o.orderNumber || o.externalOrderId || o.id || '').toLowerCase().includes(q);
      const matchCust = String(o.customerName || '').toLowerCase().includes(q);
      const matchPhone = String(o.customerPhone || '').toLowerCase().includes(q);
      return matchNum || matchCust || matchPhone;
    }

    return true;
  });

  // Channel breakdown calculation for reconciliation
  const channelMetrics = Object.keys(PLATFORM_META).map(platformId => {
    const meta = PLATFORM_META[platformId];
    const isEnabled = isPlatformEnabled(platformId);
    const platformOrders = orders.filter(o => o.source === platformId);
    const count = platformOrders.length;
    const gross = platformOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const commissionRate = commissions[platformId] ?? 20;
    const estimatedCommission = (gross * commissionRate) / 100;
    const netPayout = gross - estimatedCommission;
    return {
      id: platformId,
      name: meta.name,
      emoji: meta.emoji,
      region: meta.region,
      isEnabled,
      count,
      gross,
      commissionRate,
      estimatedCommission,
      netPayout
    };
  });

  const totalGrossAll = channelMetrics.reduce((sum, m) => sum + m.gross, 0);
  const totalCommissionAll = channelMetrics.reduce((sum, m) => sum + m.estimatedCommission, 0);
  const totalNetAll = channelMetrics.reduce((sum, m) => sum + m.netPayout, 0);
  const totalOrdersAll = channelMetrics.reduce((sum, m) => sum + m.count, 0);

  const activePlatforms = Object.keys(PLATFORM_META).filter(isPlatformEnabled);

  // Filtered categories and items for Menu Controls tab
  const filteredCategories = categories.map(cat => {
    let catItems = cat.items || [];

    if (itemSearch.trim()) {
      const q = itemSearch.trim().toLowerCase();
      catItems = catItems.filter(item => {
        const nameMatch = String(item.name || '').toLowerCase().includes(q);
        const descMatch = String(item.description || '').toLowerCase().includes(q);
        return nameMatch || descMatch;
      });
    }

    if (availFilter === 'paused_only') {
      catItems = catItems.filter(item => {
        return activePlatforms.length > 0 && activePlatforms.some(p => !isItemEnabled(p, item.id, item.available));
      });
    } else if (availFilter === 'active_only') {
      catItems = catItems.filter(item => {
        return activePlatforms.length > 0 && activePlatforms.every(p => isItemEnabled(p, item.id, item.available));
      });
    }

    return {
      ...cat,
      items: catItems
    };
  }).filter(cat => {
    if (!itemSearch.trim() && availFilter === 'all') return true;
    return cat.items.length > 0;
  });

  const toggleAllCategoryExpansion = (expand) => {
    const updated = {};
    categories.forEach(c => {
      updated[c.id] = expand;
    });
    setExpandedCategories(updated);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Title & Master Control Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h2 className="text-title2" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <Sliders size={24} style={{ color: 'var(--color-accent)' }} /> Delivery Hub
            </h2>
            {anyChannelPaused ? (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(255, 149, 0, 0.15)',
                color: '#ff9500',
                fontSize: '11px',
                fontWeight: 700
              }}>
                <Flame size={13} /> Rush Mode / Paused
              </span>
            ) : (
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(52, 199, 89, 0.15)',
                color: 'var(--color-success)',
                fontSize: '11px',
                fontWeight: 700
              }}>
                <Zap size={13} /> {activeCount} Channels Live
              </span>
            )}
          </div>
          <p className="text-secondary text-subhead" style={{ marginTop: 2, marginBottom: 0 }}>
            Aggregator sync, rush mode throttle, 86'ing menu controls, and live delivery dispatch.
          </p>
        </div>
        
        {/* Global actions visible based on role */}
        {isUserAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            {/* Rush Prep Buffer Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--color-bg-secondary)', padding: '2px 8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-separator)' }}>
              <Clock size={13} style={{ color: prepTimeBuffer > 0 ? '#ff9500' : 'var(--color-label-secondary)' }} />
              <select
                className="form-select"
                value={prepTimeBuffer}
                onChange={e => handleSetPrepBuffer(Number(e.target.value))}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: '12px',
                  fontWeight: prepTimeBuffer > 0 ? 700 : 500,
                  color: prepTimeBuffer > 0 ? '#ff9500' : 'inherit',
                  padding: '4px 2px',
                  cursor: 'pointer'
                }}
                title="Add kitchen prep buffer delay to all aggregator tablets"
              >
                <option value="0">Normal Prep (+0m)</option>
                <option value="15">+15m Rush Delay</option>
                <option value="30">+30m Busy Delay</option>
                <option value="45">+45m Heavy Rush</option>
              </select>
            </div>

            {/* Master Pause / Resume Button */}
            {anyChannelPaused ? (
              <button 
                className="btn btn-secondary btn-sm"
                onClick={handleResumeAllPlatforms}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-success)', borderColor: 'rgba(52, 199, 89, 0.3)' }}
                title="Resume all delivery channels immediately"
              >
                <Play size={14} /> Resume All
              </button>
            ) : (
              <button 
                className="btn btn-secondary btn-sm"
                onClick={() => setRushModalOpen(true)}
                disabled={activeCount === 0}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#ff9500', borderColor: 'rgba(255, 149, 0, 0.4)', fontWeight: 600 }}
                title="Temporarily pause all delivery channels during kitchen rush"
              >
                <Flame size={14} /> Rush Pause All
              </button>
            )}

            {/* Menu Sync Button */}
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => triggerSync()} 
              disabled={syncing || syncingPlatform !== null || enabledCount === 0}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              title="Push full menu catalog to all connected platforms"
            >
              <RefreshCw size={14} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing...' : 'Sync All'}
            </button>
          </div>
        )}
      </div>

      {/* 5 Streamlined Tabs with touch scroll */}
      <div className="reports-tabs no-scrollbar touch-scroll-x">
        {[
          { key: 'partners', label: 'Live Channels', icon: Radio },
          { key: 'orders', label: 'Live Deliveries', icon: Truck, badge: activeDeliveryOrders.length, badgeAlert: pendingOrdersCount > 0 },
          { key: 'categories', label: "Menu Controls (86'ing)", icon: Sliders },
          { key: 'reconciliation', label: 'Financials & Net', icon: BarChart3 },
          { key: 'settings', label: 'Hub Settings', icon: SettingsIcon, adminOnly: true }
        ].filter(t => !t.adminOnly || isUserAdmin).map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={(e) => {
                setActiveTab(tab.key);
                e.currentTarget?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
              }}
              className={`reports-tab-btn ${isActive ? 'active' : ''}`}
            >
              <Icon size={15} />
              <span style={{ whiteSpace: 'nowrap' }}>{tab.label}</span>
              {tab.badge > 0 && (
                <span style={{
                  background: tab.badgeAlert ? 'var(--color-red)' : 'var(--color-accent)',
                  color: '#ffffff',
                  fontSize: '10px',
                  fontWeight: 'var(--weight-bold)',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)'
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Partners Tab */}
      {activeTab === 'partners' && (
        <>
          {/* Analytics Summary */}
          <div className="hub-stats-grid">
            <div className="card hub-stat-card">
              <div className="hub-stat-icon-wrapper">
                <ShoppingBag className="hub-stat-icon" />
              </div>
              <div className="hub-stat-content">
                <div className="hub-stat-label">Today's Orders</div>
                <div className="hub-stat-value">
                  {todayOrders.length}
                </div>
              </div>
            </div>

            <div className="card hub-stat-card">
              <div className="hub-stat-icon-wrapper success">
                <DollarSign className="hub-stat-icon" />
              </div>
              <div className="hub-stat-content">
                <div className="hub-stat-label">Today's Revenue</div>
                <div className="hub-stat-value">
                  {formatCurrency(todayRevenue, currency)}
                </div>
              </div>
            </div>

            <div className="card hub-stat-card">
              <div className="hub-stat-icon-wrapper danger">
                <Percent className="hub-stat-icon" />
              </div>
              <div className="hub-stat-content">
                <div className="hub-stat-label">Est. Commission</div>
                <div className="hub-stat-value">
                  {formatCurrency(todayCommission, currency)}
                </div>
              </div>
            </div>

            <div className="card hub-stat-card">
              <div className="hub-stat-icon-wrapper info">
                <Truck className="hub-stat-icon" />
              </div>
              <div className="hub-stat-content">
                <div className="hub-stat-label">Live Channels</div>
                <div className="hub-stat-value">
                  {activeCount} / {enabledCount}
                </div>
              </div>
            </div>
          </div>

          {/* Integration Platform Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
            {Object.entries(PLATFORM_META).map(([id, meta]) => {
              const config = integrations[id] || {};
              const isEnabled = config.enabled === true;
              const log = syncLogs[id];
              const isSyncingThis = syncingPlatform === id;
              const paused = isPlatformPaused(id);
              const countdown = getPauseCountdown(id);
              const settingsInfo = platformSettings[id] || {};

              // Compute channel specific orders
              const channelOrders = todayOrders.filter(o => o.source === id);
              const channelRev = channelOrders.reduce((sum, o) => sum + (o.total || 0), 0);

              let statusText = 'Offline';
              let pillBg = 'rgba(142, 142, 147, 0.1)';
              let pillColor = 'var(--color-label-tertiary)';
              let dotBg = 'var(--color-label-tertiary)';

              if (isEnabled) {
                if (paused) {
                  statusText = countdown ? `Paused (${countdown})` : 'Paused Indefinitely';
                  pillBg = 'rgba(255, 149, 0, 0.1)';
                  pillColor = '#ff9500';
                  dotBg = '#ff9500';
                } else {
                  statusText = 'Active';
                  pillBg = 'rgba(52, 199, 89, 0.1)';
                  pillColor = 'var(--color-success)';
                  dotBg = 'var(--color-success)';
                }
              }

              return (
                <div 
                  key={id} 
                  className="card card-padded" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 'var(--space-4)', 
                    border: '1px solid var(--color-separator-opaque)',
                    background: 'var(--color-bg-elevated)',
                    transition: 'border-color var(--duration-fast)'
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{ fontSize: '1.8rem' }}>{meta.emoji}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <h4 style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)', margin: 0 }}>{meta.name}</h4>
                          {meta.region && (
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 'var(--weight-medium)',
                              padding: '1px 5px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--color-bg-secondary)',
                              color: 'var(--color-label-secondary)'
                            }}>
                              {meta.region}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: dotBg
                          }} />
                          <span style={{ 
                            fontSize: 'var(--text-caption2)', 
                            fontWeight: 'var(--weight-medium)',
                            background: pillBg,
                            padding: '2px 6px',
                            borderRadius: 'var(--radius-sm)',
                            color: pillColor
                          }}>
                            {statusText}
                          </span>
                        </div>
                      </div>
                    </div>

                    {isEnabled && isUserAdmin && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => openConfigModal(id)}
                          style={{ padding: '6px 10px', minHeight: 36, display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px' }}
                          title="Configure API keys and credentials"
                        >
                          <SettingsIcon size={13} /> Config
                        </button>
                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => triggerSync(id)}
                          disabled={syncing || syncingPlatform !== null}
                          style={{ padding: '6px 12px', minHeight: 36, display: 'flex', alignItems: 'center', gap: 6 }}
                          title="Trigger manual menu catalog sync to platform"
                        >
                          <RefreshCw size={13} className={isSyncingThis ? 'spin' : ''} /> Sync
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleTogglePlatform(id, false)}
                          title="Deactivate this channel"
                          style={{ padding: '6px 8px', minHeight: 36, color: 'var(--color-red)', fontSize: '11px' }}
                        >
                          Disable
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Pause Info / reason if active */}
                  {isEnabled && paused && settingsInfo.pauseReason && (
                    <div style={{
                      background: 'rgba(255, 149, 0, 0.05)',
                      padding: 'var(--space-2) var(--space-3)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 'var(--text-caption2)',
                      color: '#cc7a00',
                      borderLeft: '3px solid #ff9500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)'
                    }}>
                      <Clock size={12} />
                      <span><strong>Reason:</strong> {settingsInfo.pauseReason}</span>
                    </div>
                  )}

                  {/* Dynamic control buttons */}
                  {isEnabled && (
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      {paused ? (
                        <button 
                          className="btn btn-secondary" 
                          style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 'var(--weight-semibold)' }}
                          onClick={() => handleResumePlatform(id)}
                        >
                          <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} /> Resume Channel
                        </button>
                      ) : (
                        <button 
                          className="btn btn-secondary" 
                          style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderColor: 'rgba(255, 149, 0, 0.4)', fontWeight: 'var(--weight-semibold)' }}
                          onClick={() => openPauseModal(id)}
                        >
                          <Clock size={16} style={{ color: '#ff9500' }} /> Pause Channel
                        </button>
                      )}
                    </div>
                  )}

                  {/* Stats or explanation placeholder */}
                  {isEnabled ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', background: 'var(--color-bg-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                      <div>
                        <div style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)' }}>Orders Today</div>
                        <div style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)', marginTop: 2 }}>{channelOrders.length}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)' }}>Revenue Today</div>
                        <div style={{ fontSize: 'var(--text-headline)', fontWeight: 'var(--weight-bold)', marginTop: 2 }}>{formatCurrency(channelRev, currency)}</div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 'var(--space-4) var(--space-2)', minHeight: 100 }}>
                      <span style={{ color: 'var(--color-label-secondary)', fontSize: 'var(--text-caption1)', textAlign: 'center' }}>
                        Inactive. Enable to start receiving orders & menu sync.
                      </span>
                      {isUserAdmin && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleTogglePlatform(id, true)}
                            style={{ minHeight: 36, padding: '0 14px', fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <Check size={14} /> Quick Enable
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openConfigModal(id)}
                            style={{ minHeight: 36, padding: '0 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: 5 }}
                          >
                            <Key size={13} /> Configure Credentials
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sync status logs */}
                  {isEnabled && (
                    <div style={{ fontSize: 'var(--text-caption2)', borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      {log ? (
                        log.status === 'success' ? (
                          <>
                            <CheckCircle2 size={14} style={{ color: 'var(--color-success)' }} />
                            <span style={{ color: 'var(--color-label-secondary)' }}>
                              Synced: {log.itemsSynced} items ({new Date(log.timestamp?.toDate ? log.timestamp.toDate() : log.timestamp).toLocaleTimeString()})
                            </span>
                          </>
                        ) : (
                          <>
                            <AlertCircle size={14} style={{ color: 'var(--color-red)' }} />
                            <span style={{ color: 'var(--color-red)' }}>
                              Sync failed: {log.error}
                            </span>
                          </>
                        )
                      ) : (
                        <>
                          <AlertCircle size={14} style={{ color: 'var(--color-label-tertiary)' }} />
                          <span style={{ color: 'var(--color-label-secondary)' }}>No sync logs found.</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Live Deliveries Tab */}
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Controls Bar: Channel Filter & Status Pills & Search */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {/* Top row: Status pills & search */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              {/* Status pills */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {[
                  { id: 'active', label: 'Active', count: activeDeliveryOrders.length },
                  { id: 'pending', label: 'Pending Accept', count: orders.filter(o => o.status === 'pending').length, alert: true },
                  { id: 'preparing', label: 'In Kitchen', count: orders.filter(o => ['preparing', 'accepted'].includes(o.status)).length },
                  { id: 'ready', label: 'Ready for Driver', count: orders.filter(o => o.status === 'ready').length },
                  { id: 'completed', label: 'Dispatched', count: orders.filter(o => ['completed', 'billed'].includes(o.status)).length },
                  { id: 'all', label: 'All Orders', count: orders.length }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOrdersStatusFilter(tab.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-full)',
                      border: ordersStatusFilter === tab.id ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                      background: ordersStatusFilter === tab.id ? 'var(--color-accent-light)' : 'var(--color-bg-secondary)',
                      color: ordersStatusFilter === tab.id ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                      fontWeight: ordersStatusFilter === tab.id ? 700 : 500,
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{tab.label}</span>
                    <span style={{
                      background: tab.alert && tab.count > 0 ? 'var(--color-red)' : ordersStatusFilter === tab.id ? 'var(--color-accent)' : 'var(--color-separator)',
                      color: '#ffffff',
                      fontSize: '10px',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: 'var(--radius-full)'
                    }}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search input */}
              <div style={{ position: 'relative', width: '100%', maxWidth: 280 }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--color-label-tertiary)' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search Order #, customer..."
                  value={ordersSearch}
                  onChange={e => setOrdersSearch(e.target.value)}
                  style={{ paddingLeft: 32, fontSize: '12px', height: 38 }}
                />
                {ordersSearch && (
                  <button
                    type="button"
                    onClick={() => setOrdersSearch('')}
                    style={{ position: 'absolute', right: 8, top: 9, background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer', padding: 2 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Platform channel filter chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: 4 }}>
                Channels:
              </span>
              <button
                type="button"
                onClick={() => setOrdersChannelFilter('all')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-full)',
                  border: ordersChannelFilter === 'all' ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                  background: ordersChannelFilter === 'all' ? 'var(--color-accent-light)' : 'transparent',
                  color: ordersChannelFilter === 'all' ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                  fontSize: '11px',
                  fontWeight: ordersChannelFilter === 'all' ? 700 : 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                All Channels ({orders.length})
              </button>
              {Object.keys(PLATFORM_META).map(platformId => {
                const meta = PLATFORM_META[platformId];
                const count = orders.filter(o => o.source === platformId).length;
                const isSelected = ordersChannelFilter === platformId;
                return (
                  <button
                    key={platformId}
                    type="button"
                    onClick={() => setOrdersChannelFilter(platformId)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      border: isSelected ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                      background: isSelected ? 'var(--color-accent-light)' : 'transparent',
                      color: isSelected ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                      fontSize: '11px',
                      fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    <span>{meta.emoji}</span>
                    <span>{meta.name}</span>
                    {count > 0 && <span style={{ opacity: 0.8, fontSize: '10px' }}>({count})</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Orders stream cards list */}
          {filteredDeliveryOrders.length === 0 ? (
            <div className="card card-padded" style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-label-secondary)' }}>
              <Package size={48} style={{ margin: '0 auto var(--space-3)', color: 'var(--color-label-tertiary)', opacity: 0.6 }} />
              <h3 className="text-title3" style={{ margin: '0 0 var(--space-1)' }}>No Delivery Orders Found</h3>
              <p className="text-caption1" style={{ margin: 0, color: 'var(--color-label-tertiary)' }}>
                {ordersSearch || ordersChannelFilter !== 'all' || ordersStatusFilter !== 'all'
                  ? 'No orders match the selected filters. Try clearing your search or channel filter.'
                  : 'Incoming orders from Talabat, Snoonu, Jahez, Uber Eats, and other aggregators will appear here instantly.'}
              </p>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
              gap: 'var(--space-4)'
            }}>
              {filteredDeliveryOrders.map(order => {
                const meta = PLATFORM_META[order.source] || { name: order.source || 'Online', emoji: '📦', color: 'var(--color-accent)' };
                
                // Elapsed time calculation
                let timeAgoStr = 'Just now';
                if (order.createdAt) {
                  const createdDate = typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date(order.createdAt);
                  const diffMinutes = Math.floor((now - createdDate) / 60000);
                  if (diffMinutes >= 60) {
                    timeAgoStr = `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60}m ago`;
                  } else if (diffMinutes > 0) {
                    timeAgoStr = `${diffMinutes}m ago`;
                  }
                }

                // Status configuration
                const isPending = order.status === 'pending';
                const isAccepted = order.status === 'accepted';
                const isPreparing = order.status === 'preparing';
                const isReady = order.status === 'ready';
                const isCompleted = ['completed', 'billed'].includes(order.status);

                let statusBadgeBg = 'var(--color-bg-secondary)';
                let statusBadgeColor = 'var(--color-label-secondary)';
                let statusLabel = order.status;

                if (isPending) {
                  statusBadgeBg = 'rgba(255, 149, 0, 0.15)';
                  statusBadgeColor = '#ff9500';
                  statusLabel = 'Pending Accept';
                } else if (isAccepted) {
                  statusBadgeBg = 'rgba(0, 122, 255, 0.15)';
                  statusBadgeColor = '#007aff';
                  statusLabel = 'Accepted';
                } else if (isPreparing) {
                  statusBadgeBg = 'rgba(175, 82, 222, 0.15)';
                  statusBadgeColor = '#af52de';
                  statusLabel = 'Kitchen Preparing';
                } else if (isReady) {
                  statusBadgeBg = 'rgba(52, 199, 89, 0.15)';
                  statusBadgeColor = '#34c759';
                  statusLabel = 'Ready for Driver';
                } else if (isCompleted) {
                  statusBadgeBg = 'rgba(142, 142, 147, 0.15)';
                  statusBadgeColor = '#8e8e93';
                  statusLabel = 'Dispatched';
                }

                return (
                  <div
                    key={order.id}
                    className="card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      borderLeft: `4px solid ${meta.color || 'var(--color-accent)'}`,
                      boxShadow: isPending ? '0 0 0 2px rgba(255, 149, 0, 0.3)' : 'var(--shadow-sm)',
                      background: 'var(--color-bg)'
                    }}
                  >
                    <div>
                      {/* Ticket header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 'var(--space-3) var(--space-4)',
                        borderBottom: '1px solid var(--color-separator)',
                        background: 'var(--color-bg-secondary)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: '1.2rem' }}>{meta.emoji}</span>
                          <div>
                            <span style={{ fontWeight: 700, fontSize: '13px' }}>{meta.name}</span>
                            <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginLeft: 6 }}>
                              #{order.externalOrderId || order.orderNumber || order.id?.slice(-6)}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-full)',
                            background: statusBadgeBg,
                            color: statusBadgeColor
                          }}>
                            {statusLabel}
                          </span>
                        </div>
                      </div>

                      {/* Ticket meta: time, customer, phone */}
                      <div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-separator-opaque)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '12px', fontWeight: 600 }}>
                            <User size={13} style={{ color: 'var(--color-label-tertiary)' }} />
                            {order.customerName || 'Delivery Guest'}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
                            <Clock size={12} />
                            {timeAgoStr}
                          </span>
                        </div>

                        {order.customerPhone && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                            <Phone size={12} style={{ color: 'var(--color-label-tertiary)' }} />
                            <span>{order.customerPhone}</span>
                          </div>
                        )}

                        {order.deliveryAddress && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                            <MapPin size={12} style={{ color: 'var(--color-label-tertiary)' }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {typeof order.deliveryAddress === 'string' ? order.deliveryAddress : order.deliveryAddress.street || 'Address on file'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Items list */}
                      <div style={{ padding: 'var(--space-3) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(order.items || []).map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                              <span style={{ fontWeight: 700, minWidth: 20, color: 'var(--color-accent)' }}>
                                {item.quantity || 1}x
                              </span>
                              <div>
                                <span style={{ fontWeight: 500 }}>{item.name}</span>
                                {item.notes && (
                                  <div style={{ fontSize: '10px', color: '#ff9500', fontStyle: 'italic' }}>
                                    Note: {item.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                            <span style={{ fontWeight: 600, color: 'var(--color-label-secondary)' }}>
                              {formatCurrency((item.price || 0) * (item.quantity || 1), currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer & Actions */}
                    <div style={{
                      padding: 'var(--space-3) var(--space-4)',
                      background: 'var(--color-bg-secondary)',
                      borderTop: '1px solid var(--color-separator)'
                    }}>
                      {/* Subtotal & Net row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                          Total ({order.items?.length || 0} items)
                        </span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700 }}>
                            {formatCurrency(order.total || 0, currency)}
                          </span>
                        </div>
                      </div>

                      {/* 1-Click Status Progression Action Buttons */}
                      <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        {isPending && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleUpdateDeliveryOrderStatus(order.id, 'accepted')}
                              style={{ flex: 1, minHeight: 38, fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                              <Check size={14} /> Accept Order
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleUpdateDeliveryOrderStatus(order.id, 'cancelled')}
                              style={{ color: 'var(--color-red)', borderColor: 'rgba(255, 59, 48, 0.3)', minHeight: 38, fontSize: '12px', padding: '0 12px' }}
                            >
                              <X size={14} /> Reject
                            </button>
                          </>
                        )}

                        {isAccepted && (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => handleUpdateDeliveryOrderStatus(order.id, 'preparing')}
                              style={{ flex: 1, minHeight: 38, fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                              👨‍🍳 Send to Kitchen
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => handleUpdateDeliveryOrderStatus(order.id, 'ready')}
                              style={{ minHeight: 38, fontSize: '12px', fontWeight: 600, color: 'var(--color-success)', borderColor: 'rgba(52, 199, 89, 0.3)' }}
                            >
                              Mark Ready
                            </button>
                          </>
                        )}

                        {isPreparing && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleUpdateDeliveryOrderStatus(order.id, 'ready')}
                            style={{ flex: 1, minHeight: 38, fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#34c759', borderColor: '#34c759' }}
                          >
                            <Package size={14} /> Mark Ready for Driver
                          </button>
                        )}

                        {isReady && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleUpdateDeliveryOrderStatus(order.id, 'completed')}
                            style={{ flex: 1, minHeight: 38, fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                          >
                            <Truck size={14} /> Driver Handed Over / Dispatched
                          </button>
                        )}

                        {isCompleted && (
                          <div style={{
                            width: '100%',
                            textAlign: 'center',
                            fontSize: '11px',
                            fontWeight: 600,
                            color: 'var(--color-label-tertiary)',
                            padding: '6px 0'
                          }}>
                            ✓ Dispatched & Completed
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Categories & 86'ing Tab */}
      {activeTab === 'categories' && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <div>
                <span className="card-title">Menu Controls & Instant 86'ing</span>
                <p className="text-secondary text-caption1" style={{ marginTop: 2 }}>
                  Enable/disable categories or 86 out-of-stock dishes across all delivery aggregators in one tap.
                </p>
              </div>

              {/* Expand / Collapse buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => toggleAllCategoryExpansion(true)}
                  style={{ fontSize: '11px', padding: '4px 10px', minHeight: 30 }}
                >
                  Expand All
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => toggleAllCategoryExpansion(false)}
                  style={{ fontSize: '11px', padding: '4px 10px', minHeight: 30 }}
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Filter toolbar: Search & Availability chips */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-separator-opaque)' }}>
              {/* Availability Filter Chips */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setAvailFilter('all')}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    border: availFilter === 'all' ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                    background: availFilter === 'all' ? 'var(--color-accent-light)' : 'transparent',
                    color: availFilter === 'all' ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                    fontWeight: availFilter === 'all' ? 700 : 500,
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  All Dishes
                </button>
                <button
                  type="button"
                  onClick={() => setAvailFilter('paused_only')}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    border: availFilter === 'paused_only' ? '1.5px solid var(--color-red)' : '1px solid var(--color-separator)',
                    background: availFilter === 'paused_only' ? 'rgba(255, 59, 48, 0.12)' : 'transparent',
                    color: availFilter === 'paused_only' ? 'var(--color-red)' : 'var(--color-label-secondary)',
                    fontWeight: availFilter === 'paused_only' ? 700 : 500,
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  🚫 86'd / Paused Only
                </button>
                <button
                  type="button"
                  onClick={() => setAvailFilter('active_only')}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    border: availFilter === 'active_only' ? '1.5px solid var(--color-success)' : '1px solid var(--color-separator)',
                    background: availFilter === 'active_only' ? 'rgba(52, 199, 89, 0.12)' : 'transparent',
                    color: availFilter === 'active_only' ? 'var(--color-success)' : 'var(--color-label-secondary)',
                    fontWeight: availFilter === 'active_only' ? 700 : 500,
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  🟢 Active Everywhere
                </button>
              </div>

              {/* Item Search Input */}
              <div style={{ position: 'relative', width: '100%', maxWidth: 260 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--color-label-tertiary)' }} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search dish or item..."
                  value={itemSearch}
                  onChange={e => setItemSearch(e.target.value)}
                  style={{ paddingLeft: 30, fontSize: '12px', height: 34 }}
                />
                {itemSearch && (
                  <button
                    type="button"
                    onClick={() => setItemSearch('')}
                    style={{ position: 'absolute', right: 8, top: 8, background: 'none', border: 'none', color: 'var(--color-label-tertiary)', cursor: 'pointer', padding: 2 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Desktop Table View */}
          <div className="desktop-only" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-subhead)' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}>
                  <th style={{ width: 40, padding: 'var(--space-4) var(--space-5)' }}></th>
                  <th style={{ textAlign: 'left', padding: 'var(--space-4) var(--space-5)', color: 'var(--color-label-secondary)' }}>Category / Item</th>
                  {Object.entries(PLATFORM_META).map(([id, meta]) => {
                    const isEnabled = isPlatformEnabled(id);
                    return (
                      <th key={id} style={{ textAlign: 'center', padding: 'var(--space-4) var(--space-5)', color: isEnabled ? 'var(--color-label)' : 'var(--color-label-tertiary)', opacity: isEnabled ? 1 : 0.4 }}>
                        <div>{meta.emoji}</div>
                        <div style={{ fontSize: 'var(--text-caption2)', marginTop: 2 }}>{meta.name}</div>
                      </th>
                    );
                  })}
                  <th style={{ textAlign: 'center', padding: 'var(--space-4) var(--space-5)', color: 'var(--color-label-secondary)', width: 140 }}>Global Controls</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.length === 0 ? (
                  <tr>
                    <td colSpan={Object.keys(PLATFORM_META).length + 3} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-label-secondary)' }}>
                      No dishes or categories found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredCategories.map(category => {
                    const isExpanded = expandedCategories[category.id] === true || Boolean(itemSearch.trim());
                    const activePlatformsList = Object.keys(PLATFORM_META).filter(isPlatformEnabled);
                    const enabledOnAny = activePlatformsList.some(platformId => isCategoryEnabled(platformId, category.id));

                    return (
                      <tr key={category.id} style={{ display: 'contents' }}>
                        <td colSpan={Object.keys(PLATFORM_META).length + 3} style={{ padding: 0 }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <tbody>
                              {/* Category row */}
                              <tr 
                                style={{ 
                                  borderBottom: '1px solid var(--color-separator)', 
                                  background: 'rgba(var(--color-accent-rgb), 0.02)',
                                  fontWeight: 'var(--weight-semibold)'
                                }}
                              >
                                {/* Expand/Collapse arrow */}
                                <td style={{ width: 40, padding: 'var(--space-4) var(--space-5)', textAlign: 'center' }}>
                                  <button 
                                    className="btn btn-ghost" 
                                    style={{ width: 34, height: 34, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}
                                    onClick={() => toggleExpandCategory(category.id)}
                                    title={isExpanded ? 'Collapse items' : 'Expand items'}
                                  >
                                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                  </button>
                                </td>

                                {/* Category identity */}
                                <td style={{ padding: 'var(--space-4) var(--space-5)', textAlign: 'left' }}>
                                  <span style={{ fontSize: '1.2rem', marginRight: 8 }}>{category.emoji}</span>
                                  <span style={{ fontWeight: 'var(--weight-bold)' }}>{category.name}</span>
                                  <span className="text-secondary" style={{ fontSize: 'var(--text-caption2)', fontWeight: 'normal', marginLeft: 8 }}>
                                    ({category.items?.length || 0} items)
                                  </span>
                                </td>

                                {/* Category Platform Matrix checkboxes */}
                                {Object.keys(PLATFORM_META).map(platformId => {
                                  const isEnabled = isPlatformEnabled(platformId);
                                  const isCatAvail = isCategoryEnabled(platformId, category.id);
                                  
                                  return (
                                    <td key={platformId} style={{ textAlign: 'center', padding: 'var(--space-4) var(--space-5)' }}>
                                      <input
                                        type="checkbox"
                                        disabled={!isEnabled}
                                        checked={isEnabled && isCatAvail}
                                        onChange={() => toggleCategoryOverride(platformId, category.id, isCatAvail)}
                                        style={{ 
                                          cursor: isEnabled ? 'pointer' : 'not-allowed',
                                          width: 20, height: 20,
                                          accentColor: 'var(--color-accent)',
                                          opacity: isEnabled ? 1 : 0.2
                                        }}
                                      />
                                    </td>
                                  );
                                })}

                                {/* Bulk Category Action Column */}
                                <td style={{ textAlign: 'center', padding: 'var(--space-4) var(--space-5)', width: 140 }}>
                                  {enabledOnAny ? (
                                    <button 
                                      className="btn btn-secondary btn-sm"
                                      style={{ color: 'var(--color-red)', borderColor: 'rgba(255, 59, 48, 0.25)', minHeight: 32, padding: '4px 12px', fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-semibold)', borderRadius: 'var(--radius-sm)' }}
                                      onClick={() => toggleCategoryAllPlatforms(category.id, false)}
                                      disabled={activePlatformsList.length === 0}
                                    >
                                      Pause All
                                    </button>
                                  ) : (
                                    <button 
                                      className="btn btn-secondary btn-sm"
                                      style={{ color: 'var(--color-success)', borderColor: 'rgba(52, 199, 89, 0.25)', minHeight: 32, padding: '4px 12px', fontSize: 'var(--text-caption1)', fontWeight: 'var(--weight-semibold)', borderRadius: 'var(--radius-sm)' }}
                                      onClick={() => toggleCategoryAllPlatforms(category.id, true)}
                                      disabled={activePlatformsList.length === 0}
                                    >
                                      Enable All
                                    </button>
                                  )}
                                </td>
                              </tr>

                              {/* Expandable items sub-table */}
                              {isExpanded && (category.items ?? []).map(item => {
                                const isItemAllActive = activePlatformsList.length > 0 && activePlatformsList.every(pid => isItemEnabled(pid, item.id, item.available));
                                const isItemPausedAnywhere = activePlatformsList.length > 0 && activePlatformsList.some(pid => !isItemEnabled(pid, item.id, item.available));

                                return (
                                  <tr 
                                    key={item.id} 
                                    style={{ 
                                      borderBottom: '1px solid var(--color-separator-opaque)',
                                      background: isItemPausedAnywhere ? 'rgba(255, 59, 48, 0.03)' : 'var(--color-bg)'
                                    }}
                                  >
                                    <td style={{ width: 40 }}></td>
                                    {/* Item identity */}
                                    <td style={{ padding: 'var(--space-3) var(--space-5)', paddingLeft: 'var(--space-8)', textAlign: 'left' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                        <span style={{ fontSize: '1rem' }}>{item.emoji}</span>
                                        <div>
                                          <span style={{ textDecoration: isItemPausedAnywhere ? 'line-through' : 'none', color: isItemPausedAnywhere ? 'var(--color-label-secondary)' : 'inherit' }}>
                                            {item.name}
                                          </span>
                                          <span style={{ color: 'var(--color-label-secondary)', fontSize: 'var(--text-caption2)', marginLeft: 8 }}>
                                            ({formatCurrency(item.price, currency)})
                                          </span>
                                          {isItemPausedAnywhere && (
                                            <span style={{ marginLeft: 8, fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'rgba(255, 59, 48, 0.15)', color: 'var(--color-red)' }}>
                                              86'd
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </td>

                                    {/* Item Platform overrides */}
                                    {Object.keys(PLATFORM_META).map(platformId => {
                                      const isEnabled = isPlatformEnabled(platformId);
                                      const isCatAvail = isCategoryEnabled(platformId, category.id);
                                      const isItmAvail = isItemEnabled(platformId, item.id, item.available);

                                      const checked = isEnabled && isCatAvail && isItmAvail;
                                      const isDisabled = !isEnabled || !isCatAvail;

                                      return (
                                        <td key={platformId} style={{ textAlign: 'center', padding: 'var(--space-3) var(--space-5)' }}>
                                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                            <input
                                              type="checkbox"
                                              disabled={isDisabled}
                                              checked={checked}
                                              onChange={() => toggleOverride(platformId, item.id, isItmAvail)}
                                              style={{ 
                                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                                width: 18, height: 18,
                                                accentColor: 'var(--color-accent)',
                                                opacity: isEnabled ? (isCatAvail ? 1 : 0.3) : 0.1
                                              }}
                                            />
                                            {!isCatAvail && isEnabled && (
                                              <span style={{ fontSize: '0.55rem', color: 'var(--color-label-tertiary)', whiteSpace: 'nowrap' }}>
                                                Cat Paused
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}

                                    {/* 1-Click 86 All / Enable All Action */}
                                    <td style={{ textAlign: 'center', padding: 'var(--space-2) var(--space-4)', width: 140 }}>
                                      <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        style={{
                                          color: isItemAllActive ? 'var(--color-red)' : 'var(--color-success)',
                                          borderColor: isItemAllActive ? 'rgba(255, 59, 48, 0.25)' : 'rgba(52, 199, 89, 0.25)',
                                          fontSize: '11px',
                                          padding: '3px 8px',
                                          minHeight: 28,
                                          fontWeight: 600,
                                          borderRadius: 'var(--radius-sm)',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 4
                                        }}
                                        onClick={() => toggleItemAllPlatforms(item.id, !isItemAllActive)}
                                        disabled={activePlatformsList.length === 0}
                                        title={isItemAllActive ? "86 this dish on all delivery apps" : "Enable this dish on all delivery apps"}
                                      >
                                        {isItemAllActive ? '🚫 86 All' : '✓ Enable All'}
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}

                              {isExpanded && (category.items ?? []).length === 0 && (
                                <tr style={{ background: 'var(--color-bg)' }}>
                                  <td style={{ width: 40 }}></td>
                                  <td colSpan={Object.keys(PLATFORM_META).length + 2} style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-label-tertiary)', fontSize: 'var(--text-footnote)' }}>
                                    No items found in this category.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Category Cards View */}
          <div className="mobile-only" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', padding: 'var(--space-3)' }}>
            {filteredCategories.map(category => {
              const isExpanded = expandedCategories[category.id] === true || Boolean(itemSearch.trim());
              const activePlatformsList = Object.keys(PLATFORM_META).filter(isPlatformEnabled);
              const enabledOnAny = activePlatformsList.some(platformId => isCategoryEnabled(platformId, category.id));

              return (
                <div 
                  key={category.id} 
                  style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-separator)',
                    padding: 'var(--space-3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-3)'
                  }}
                >
                  {/* Category Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: '1.4rem' }}>{category.emoji}</span>
                      <div>
                        <div style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)' }}>{category.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>{category.items?.length || 0} items</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{
                          color: enabledOnAny ? 'var(--color-red)' : 'var(--color-success)',
                          borderColor: enabledOnAny ? 'rgba(255, 59, 48, 0.25)' : 'rgba(52, 199, 89, 0.25)',
                          minHeight: 34,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 'var(--weight-semibold)',
                          borderRadius: 'var(--radius-sm)'
                        }}
                        onClick={() => toggleCategoryAllPlatforms(category.id, !enabledOnAny)}
                        disabled={activePlatformsList.length === 0}
                      >
                        {enabledOnAny ? 'Pause All' : 'Enable All'}
                      </button>
                      <button
                        className="btn btn-ghost"
                        style={{ width: 34, height: 34, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}
                        onClick={() => toggleExpandCategory(category.id)}
                        title={isExpanded ? 'Collapse items' : 'Expand items'}
                      >
                        {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {/* Sub-items if expanded */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--color-separator)', paddingTop: 10, marginTop: 4 }}>
                      {(category.items ?? []).map(item => {
                        const isItemAllActive = activePlatformsList.length > 0 && activePlatformsList.every(pid => isItemEnabled(pid, item.id, item.available));
                        const isItemPausedAnywhere = activePlatformsList.length > 0 && activePlatformsList.some(pid => !isItemEnabled(pid, item.id, item.available));

                        return (
                          <div
                            key={item.id}
                            style={{
                              background: 'var(--color-bg)',
                              borderRadius: 'var(--radius-md)',
                              padding: '10px',
                              border: isItemPausedAnywhere ? '1px solid rgba(255, 59, 48, 0.3)' : '1px solid var(--color-separator-opaque)'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 14 }}>{item.emoji}</span>
                                <span style={{ fontWeight: 600, fontSize: '13px', textDecoration: isItemPausedAnywhere ? 'line-through' : 'none' }}>
                                  {item.name}
                                </span>
                                {isItemPausedAnywhere && (
                                  <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: 'var(--radius-full)', background: 'rgba(255, 59, 48, 0.15)', color: 'var(--color-red)' }}>
                                    86'd
                                  </span>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontWeight: 700, fontSize: '12px' }}>{formatCurrency(item.price, currency)}</span>
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{
                                    color: isItemAllActive ? 'var(--color-red)' : 'var(--color-success)',
                                    borderColor: isItemAllActive ? 'rgba(255, 59, 48, 0.25)' : 'rgba(52, 199, 89, 0.25)',
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    minHeight: 24,
                                    fontWeight: 700
                                  }}
                                  onClick={() => toggleItemAllPlatforms(item.id, !isItemAllActive)}
                                  disabled={activePlatformsList.length === 0}
                                >
                                  {isItemAllActive ? '86 All' : 'Enable'}
                                </button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {Object.keys(PLATFORM_META).map(platformId => {
                                const meta = PLATFORM_META[platformId];
                                const isEnabled = isPlatformEnabled(platformId);
                                const isCatAvail = isCategoryEnabled(platformId, category.id);
                                const isItmAvail = isItemEnabled(platformId, item.id, item.available);
                                if (!isEnabled) return null;

                                const checked = isEnabled && isCatAvail && isItmAvail;
                                return (
                                  <button
                                    key={platformId}
                                    type="button"
                                    disabled={!isCatAvail}
                                    onClick={() => toggleOverride(platformId, item.id, isItmAvail)}
                                    style={{
                                      fontSize: 10,
                                      padding: '3px 8px',
                                      borderRadius: 'var(--radius-xs)',
                                      border: `1px solid ${checked ? 'var(--color-accent)' : 'var(--color-separator)'}`,
                                      background: checked ? 'var(--color-accent-light)' : 'transparent',
                                      color: checked ? 'var(--color-accent)' : 'var(--color-label-tertiary)',
                                      cursor: isCatAvail ? 'pointer' : 'not-allowed',
                                      opacity: isCatAvail ? 1 : 0.4
                                    }}
                                  >
                                    {meta.emoji} {meta.name}: {checked ? 'ON' : 'OFF'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Reconciliation & Financials Tab */}
      {activeTab === 'reconciliation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* 4 Metric Summary KPI Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-4)'
          }}>
            <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'rgba(0, 122, 255, 0.12)', color: '#007aff' }}>
                <ShoppingBag size={24} />
              </div>
              <div>
                <span className="text-secondary text-caption1">Total Orders</span>
                <h4 className="text-title3" style={{ margin: 0, fontWeight: 700 }}>{totalOrdersAll}</h4>
              </div>
            </div>

            <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'rgba(52, 199, 89, 0.12)', color: '#34c759' }}>
                <DollarSign size={24} />
              </div>
              <div>
                <span className="text-secondary text-caption1">Gross Sales</span>
                <h4 className="text-title3" style={{ margin: 0, fontWeight: 700 }}>{formatCurrency(totalGrossAll, currency)}</h4>
              </div>
            </div>

            <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'rgba(255, 59, 48, 0.12)', color: '#ff3b30' }}>
                <Percent size={24} />
              </div>
              <div>
                <span className="text-secondary text-caption1">Est. Commissions</span>
                <h4 className="text-title3" style={{ margin: 0, fontWeight: 700, color: '#ff3b30' }}>
                  -{formatCurrency(totalCommissionAll, currency)}
                </h4>
              </div>
            </div>

            <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'rgba(88, 86, 214, 0.12)', color: '#5856d6' }}>
                <TrendingUp size={24} />
              </div>
              <div>
                <span className="text-secondary text-caption1">Est. Net Payout</span>
                <h4 className="text-title3" style={{ margin: 0, fontWeight: 700, color: 'var(--color-accent)' }}>
                  {formatCurrency(totalNetAll, currency)}
                </h4>
              </div>
            </div>
          </div>

          {/* Breakdown Table Card */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span className="card-title">Channel Performance & Commission Breakdown</span>
                <p className="text-secondary text-caption1" style={{ marginTop: 2 }}>
                  Net payout projections based on platform commission agreements.
                </p>
              </div>
              {isUserAdmin && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setActiveTab('settings')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '11px' }}
                >
                  <SettingsIcon size={12} /> Adjust Rates
                </button>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-subhead)' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}>
                    <th style={{ textAlign: 'left', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-label-secondary)' }}>Channel</th>
                    <th style={{ textAlign: 'center', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-label-secondary)' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-label-secondary)' }}>Orders</th>
                    <th style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-label-secondary)' }}>Gross Sales</th>
                    <th style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-label-secondary)' }}>Commission %</th>
                    <th style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-label-secondary)' }}>Est. Commission</th>
                    <th style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-label-secondary)' }}>Est. Net Payout</th>
                  </tr>
                </thead>
                <tbody>
                  {channelMetrics.map(channel => (
                    <tr
                      key={channel.id}
                      style={{
                        borderBottom: '1px solid var(--color-separator-opaque)',
                        opacity: channel.isEnabled ? 1 : 0.45
                      }}
                    >
                      {/* Channel */}
                      <td style={{ padding: 'var(--space-3) var(--space-4)', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '1.3rem' }}>{channel.emoji}</span>
                          <div>
                            <span style={{ fontWeight: 600 }}>{channel.name}</span>
                            <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginLeft: 6 }}>({channel.region})</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ textAlign: 'center', padding: 'var(--space-3) var(--space-4)' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          background: channel.isEnabled ? 'rgba(52, 199, 89, 0.12)' : 'var(--color-bg-secondary)',
                          color: channel.isEnabled ? 'var(--color-success)' : 'var(--color-label-tertiary)'
                        }}>
                          {channel.isEnabled ? 'Connected' : 'Disabled'}
                        </span>
                      </td>

                      {/* Orders */}
                      <td style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                        {channel.count}
                      </td>

                      {/* Gross */}
                      <td style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)', fontWeight: 600 }}>
                        {formatCurrency(channel.gross, currency)}
                      </td>

                      {/* Rate */}
                      <td style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)', color: 'var(--color-label-secondary)' }}>
                        {channel.commissionRate}%
                      </td>

                      {/* Deducted */}
                      <td style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)', color: '#ff3b30' }}>
                        -{formatCurrency(channel.estimatedCommission, currency)}
                      </td>

                      {/* Net */}
                      <td style={{ textAlign: 'right', padding: 'var(--space-3) var(--space-4)', fontWeight: 700, color: 'var(--color-accent)' }}>
                        {formatCurrency(channel.netPayout, currency)}
                      </td>
                    </tr>
                  ))}

                  {/* Summary Totals Row */}
                  <tr style={{ background: 'var(--color-bg-secondary)', fontWeight: 700, borderTop: '2px solid var(--color-separator)' }}>
                    <td style={{ padding: 'var(--space-4)', textAlign: 'left' }}>All Channels Combined</td>
                    <td style={{ textAlign: 'center', padding: 'var(--space-4)' }}>-</td>
                    <td style={{ textAlign: 'right', padding: 'var(--space-4)' }}>{totalOrdersAll}</td>
                    <td style={{ textAlign: 'right', padding: 'var(--space-4)' }}>{formatCurrency(totalGrossAll, currency)}</td>
                    <td style={{ textAlign: 'right', padding: 'var(--space-4)' }}>
                      {totalGrossAll > 0 ? ((totalCommissionAll / totalGrossAll) * 100).toFixed(1) : 0}%
                    </td>
                    <td style={{ textAlign: 'right', padding: 'var(--space-4)', color: '#ff3b30' }}>
                      -{formatCurrency(totalCommissionAll, currency)}
                    </td>
                    <td style={{ textAlign: 'right', padding: 'var(--space-4)', color: 'var(--color-accent)', fontSize: '15px' }}>
                      {formatCurrency(totalNetAll, currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style={{ padding: 'var(--space-3) var(--space-4)', background: 'var(--color-bg-secondary)', borderTop: '1px solid var(--color-separator)', fontSize: '11px', color: 'var(--color-label-tertiary)' }}>
              💡 Note: Platform commissions shown are estimates calculated using standard rate schedules configured in Hub Settings. Final monthly deposits are determined by individual aggregator settlement statements.
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab (Admin only) */}
      {activeTab === 'settings' && isUserAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 800 }}>
          
          {/* General Controls card */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <h3 className="text-title3">Auto-Accept Orders</h3>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}>
              <input 
                type="checkbox" 
                id="auto-accept-checkbox"
                checked={autoAccept}
                onChange={e => setAutoAccept(e.target.checked)}
                style={{ width: 20, height: 20, marginTop: 2, cursor: 'pointer' }}
              />
              <div>
                <label htmlFor="auto-accept-checkbox" style={{ fontWeight: 'var(--weight-semibold)', cursor: 'pointer' }}>
                  Auto-Accept Incoming Orders
                </label>
                <p className="text-secondary text-caption1" style={{ marginTop: 2 }}>
                  When enabled, orders received from Uber Eats, Zomato, Swiggy, and Deliveroo will be automatically accepted and routed directly to the KDS/Kitchen. Turn off to manually review first.
                </p>
              </div>
            </div>
          </div>

          {/* Delivery Partner Integrations & Credentials Card */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <h3 className="text-title3">Delivery Partner Integrations & Webhooks</h3>
              <p className="text-secondary text-caption1" style={{ marginTop: 2 }}>
                Configure API keys, store IDs, client secrets, and copy live webhook endpoints for each aggregator.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {Object.entries(PLATFORM_META).map(([id, meta]) => {
                const config = integrations[id] || {};
                const isEnabled = config.enabled === true;
                const hasKey = Boolean(config.apiKey || config.clientId || config.storeId);
                const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project';
                const webhookUrl = `https://us-central1-${projectId}.cloudfunctions.net/handleDeliveryWebhook?platform=${id}&restaurantId=${restaurant?.id}`;

                return (
                  <div
                    key={id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 'var(--space-3)',
                      padding: 'var(--space-3) var(--space-4)',
                      background: 'var(--color-bg-secondary)',
                      borderRadius: 'var(--radius-md)',
                      border: isEnabled ? '1px solid var(--color-separator-opaque)' : '1px dashed var(--color-separator)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{ fontSize: '1.5rem' }}>{meta.emoji}</span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-subhead)' }}>{meta.name}</span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: 'var(--weight-medium)',
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-sm)',
                            background: isEnabled ? 'rgba(52, 199, 89, 0.1)' : 'rgba(142, 142, 147, 0.1)',
                            color: isEnabled ? 'var(--color-success)' : 'var(--color-label-tertiary)'
                          }}>
                            {isEnabled ? 'Active' : 'Inactive'}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: 'var(--radius-sm)',
                            background: hasKey ? 'rgba(0, 122, 255, 0.1)' : 'rgba(255, 149, 0, 0.1)',
                            color: hasKey ? '#007aff' : '#ff9500'
                          }}>
                            {hasKey ? '✓ Configured' : '⚠ Setup Needed'}
                          </span>
                        </div>
                        <div style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                          {meta.region} • Commission: {commissions[id] ?? 20}%
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                          toast.success(`${meta.name} Webhook URL copied!`);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '12px' }}
                        title="Copy webhook URL to clipboard"
                      >
                        <Copy size={13} /> Copy Webhook
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => openConfigModal(id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '12px', fontWeight: 600 }}
                      >
                        <Key size={13} /> Configure
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Commissions rates card */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <h3 className="text-title3">Platform Commission Rates (%)</h3>
            <p className="text-secondary text-caption1">
              Set the average commission percentages charged by platforms. Used for estimated calculations on the main dashboard.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-4)' }}>
              {Object.entries(PLATFORM_META).map(([id, meta]) => {
                const isEnabled = isPlatformEnabled(id);
                return (
                  <div key={id} className="form-group" style={{ opacity: isEnabled ? 1 : 0.5 }}>
                    <label className="form-label">{meta.emoji} {meta.name}</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        step="0.5"
                        disabled={!isEnabled}
                        className="form-input" 
                        value={commissions[id] ?? 0}
                        onChange={e => setCommissions(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 0 }))}
                      />
                      <span style={{ fontWeight: 'bold' }}>%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Busy Hours schedule scheduler card */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <h3 className="text-title3">⏰ Recurring Busy Hours Scheduler</h3>
            <p className="text-secondary text-caption1">
              Define time windows during which platforms should be set to "Busy" and paused automatically.
            </p>

            {/* List current rules */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', margin: 'var(--space-2) 0' }}>
              {busyHours.map((rule) => {
                const dayLabel = DAYS_OF_WEEK.find(d => d.value === rule.day)?.label ?? rule.day;
                const ruleId = rule.id || (rule.day + rule.start + rule.end);
                return (
                  <div 
                    key={ruleId} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between', 
                      padding: 'var(--space-2) var(--space-3)', 
                      background: 'var(--color-bg-secondary)', 
                      borderRadius: 'var(--radius-md)',
                      borderLeft: '4px solid var(--color-accent)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                      <span style={{ fontWeight: 'var(--weight-semibold)' }}>📅 {dayLabel}</span>
                      <span style={{ color: 'var(--color-label-secondary)' }}>⏰ {rule.start} - {rule.end}</span>
                    </div>
                    <button 
                      className="btn btn-ghost" 
                      onClick={() => handleRemoveBusyRule(ruleId)} 
                      style={{ padding: '4px', color: 'var(--color-red)' }}
                      title="Remove schedule window"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
              {busyHours.length === 0 && (
                <div style={{ color: 'var(--color-label-tertiary)', fontSize: 'var(--text-caption1)', padding: 'var(--space-4)', textAlign: 'center', border: '1px dashed var(--color-separator)', borderRadius: 'var(--radius-md)' }}>
                  No busy hours scheduled yet.
                </div>
              )}
            </div>

            {/* Form to add a rule */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'flex-end', 
              flexWrap: 'wrap', 
              gap: 'var(--space-3)', 
              background: 'var(--color-bg-secondary)', 
              padding: 'var(--space-3)', 
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-separator)'
            }}>
              <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
                <label className="form-label" style={{ fontSize: 'var(--text-caption2)' }}>Select Day</label>
                <select 
                  className="form-select"
                  value={newBusyRule.day}
                  onChange={e => setNewBusyRule(prev => ({ ...prev, day: e.target.value }))}
                >
                  {DAYS_OF_WEEK.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ minWidth: 100 }}>
                <label className="form-label" style={{ fontSize: 'var(--text-caption2)' }}>Start Time</label>
                <input 
                  type="time" 
                  className="form-input" 
                  value={newBusyRule.start}
                  onChange={e => setNewBusyRule(prev => ({ ...prev, start: e.target.value }))}
                />
              </div>

              <div className="form-group" style={{ minWidth: 100 }}>
                <label className="form-label" style={{ fontSize: 'var(--text-caption2)' }}>End Time</label>
                <input 
                  type="time" 
                  className="form-input" 
                  value={newBusyRule.end}
                  onChange={e => setNewBusyRule(prev => ({ ...prev, end: e.target.value }))}
                />
              </div>

              <button 
                type="button"
                className="btn btn-primary"
                onClick={handleAddBusyRule}
                style={{ height: 40 }}
              >
                <Plus size={16} /> Add Window
              </button>
            </div>
          </div>

          {/* Action trigger footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleSaveSettings} 
              disabled={savingSettings}
              style={{ padding: '0 var(--space-6)', height: 44 }}
            >
              <Check size={18} /> {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Master Kitchen Rush Mode Modal Overlay */}
      {rushModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)',
          padding: 'var(--space-4)'
        }}>
          <div className="card card-padded" style={{
            width: '100%',
            maxWidth: 440,
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            boxShadow: 'var(--shadow-2xl)',
            borderRadius: 'var(--radius-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.5rem' }}>🚨</span>
                <div>
                  <h3 className="text-title3" style={{ margin: 0, fontWeight: 700 }}>Master Kitchen Rush Mode</h3>
                  <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                    Pause all {activeCount} connected delivery aggregators
                  </span>
                </div>
              </div>
              <button 
                className="btn btn-ghost" 
                style={{ width: 36, height: 36, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}
                onClick={() => setRushModalOpen(false)}
                title="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-label-secondary)' }}>
              Temporarily halts incoming delivery orders from all active platforms (Talabat, Snoonu, Uber Eats, etc.) so your kitchen team can clear order backlogs without receiving penalty strikes.
            </p>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, fontSize: '12px', marginBottom: 4 }}>
                Rush Duration
              </label>
              <select
                className="form-select"
                value={rushDuration}
                onChange={e => setRushDuration(e.target.value)}
                style={{ height: 42, fontSize: '13px' }}
              >
                <option value="15">15 Minutes (Brief surge)</option>
                <option value="30">30 Minutes (Recommended)</option>
                <option value="45">45 Minutes (Dinner peak)</option>
                <option value="60">1 Hour (Heavy rush)</option>
                <option value="120">2 Hours</option>
                <option value="manual">Indefinite (Manual resume required)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 600, fontSize: '12px', marginBottom: 4 }}>
                Reason for Kitchen Pause
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g., Heavy dining room rush, kitchen backlog"
                value={rushReason}
                onChange={e => setRushReason(e.target.value)}
                style={{ height: 42, fontSize: '13px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setRushModalOpen(false)}
                style={{ minHeight: 40, padding: '0 16px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handlePauseAllPlatforms(rushDuration, rushReason)}
                style={{
                  background: '#ff3b30',
                  borderColor: '#ff3b30',
                  minHeight: 40,
                  padding: '0 18px',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Flame size={15} /> Pause All Channels
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal Overlay */}
      {pauseModal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(3px)',
          padding: 'var(--space-4)'
        }}>
          <div className="card card-padded" style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', boxShadow: 'var(--shadow-2xl)', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="text-title3" style={{ margin: 0, fontWeight: 'var(--weight-bold)' }}>⏸️ Pause {PLATFORM_META[pauseModal.platformId]?.name}</h3>
              <button 
                className="btn btn-ghost" 
                style={{ width: 36, height: 36, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}
                onClick={() => setPauseModal(prev => ({ ...prev, isOpen: false }))}
                title="Close modal"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 6 }}>Pause Duration</label>
              <select 
                className="form-select"
                value={pauseModal.duration}
                onChange={e => setPauseModal(prev => ({ ...prev, duration: e.target.value }))}
                style={{ minHeight: 42, fontSize: 'var(--text-subhead)' }}
              >
                <option value="30">30 Minutes</option>
                <option value="60">1 Hour</option>
                <option value="120">2 Hours</option>
                <option value="custom">Custom Duration (Minutes)</option>
                <option value="manual">Indefinite (Manual Resume)</option>
              </select>
            </div>

            {pauseModal.duration === 'custom' && (
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 6 }}>Duration in Minutes</label>
                <input 
                  type="number"
                  min="1"
                  className="form-input"
                  placeholder="e.g. 45"
                  value={pauseModal.customDuration}
                  onChange={e => setPauseModal(prev => ({ ...prev, customDuration: e.target.value }))}
                  style={{ minHeight: 42, fontSize: 'var(--text-subhead)' }}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 6 }}>Reason for Pausing</label>
              <input 
                type="text"
                className="form-input"
                placeholder="e.g., Kitchen full, rush hour, staffing shortage"
                value={pauseModal.reason}
                onChange={e => setPauseModal(prev => ({ ...prev, reason: e.target.value }))}
                style={{ minHeight: 42, fontSize: 'var(--text-subhead)' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setPauseModal(prev => ({ ...prev, isOpen: false }))}
                style={{ minHeight: 44, padding: '0 18px', fontWeight: 'var(--weight-semibold)' }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handlePausePlatformSubmit}
                style={{ background: 'var(--color-red)', borderColor: 'var(--color-red)', minHeight: 44, padding: '0 18px', fontWeight: 'var(--weight-semibold)' }}
              >
                Confirm Pause
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Platform Configuration Modal Overlay */}
      {configModal.isOpen && configModal.platformId && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(4px)',
          padding: 'var(--space-4)'
        }}>
          <div className="card card-padded" style={{
            width: '100%',
            maxWidth: 540,
            maxHeight: '90vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            boxShadow: 'var(--shadow-2xl)',
            borderRadius: 'var(--radius-lg)'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-separator)', paddingBottom: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <span style={{ fontSize: '2rem' }}>{PLATFORM_META[configModal.platformId]?.emoji}</span>
                <div>
                  <h3 className="text-title3" style={{ margin: 0, fontWeight: 'var(--weight-bold)' }}>
                    Configure {PLATFORM_META[configModal.platformId]?.name}
                  </h3>
                  <span style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)' }}>
                    {PLATFORM_META[configModal.platformId]?.region}
                  </span>
                </div>
              </div>
              <button 
                className="btn btn-ghost" 
                style={{ width: 36, height: 36, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}
                onClick={() => setConfigModal(prev => ({ ...prev, isOpen: false }))}
                title="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Enable switch */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--space-3) var(--space-4)',
              background: configModal.enabled ? 'rgba(52, 199, 89, 0.1)' : 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${configModal.enabled ? 'rgba(52, 199, 89, 0.3)' : 'var(--color-separator)'}`
            }}>
              <div>
                <label htmlFor="modal-channel-enable" style={{ fontWeight: 'var(--weight-semibold)', cursor: 'pointer', display: 'block' }}>
                  Enable {PLATFORM_META[configModal.platformId]?.name} Channel
                </label>
                <span style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)' }}>
                  Allow incoming live orders and catalog sync with this channel
                </span>
              </div>
              <input
                type="checkbox"
                id="modal-channel-enable"
                checked={configModal.enabled}
                onChange={e => setConfigModal(prev => ({ ...prev, enabled: e.target.checked }))}
                style={{ width: 22, height: 22, cursor: 'pointer' }}
              />
            </div>

            {/* Dynamic Credentials Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ fontSize: 'var(--text-footnote)', fontWeight: 'var(--weight-bold)', color: 'var(--color-label-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Credentials & API Settings
              </div>
              {(PLATFORM_META[configModal.platformId]?.fields || []).map(field => {
                const isSecret = field.type === 'password' || field.key.toLowerCase().includes('secret');
                return (
                  <div className="form-group" key={field.key}>
                    <label className="form-label" style={{ fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-subhead)' }}>
                      {field.label}
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        className="form-input"
                        type={isSecret && !configModal.showSecret ? 'password' : 'text'}
                        placeholder={field.placeholder}
                        value={configModal.fields[field.key] ?? ''}
                        onChange={e => {
                          const val = e.target.value;
                          setConfigModal(prev => ({
                            ...prev,
                            fields: { ...prev.fields, [field.key]: val }
                          }));
                        }}
                        style={{ paddingRight: isSecret ? 40 : undefined, fontFamily: isSecret ? 'var(--font-mono)' : 'inherit' }}
                      />
                      {isSecret && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setConfigModal(prev => ({ ...prev, showSecret: !prev.showSecret }))}
                          style={{ position: 'absolute', right: 4, padding: 6, minHeight: 'auto', color: 'var(--color-label-tertiary)' }}
                          title={configModal.showSecret ? 'Hide secret' : 'Show secret'}
                        >
                          {configModal.showSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Commission Rate */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 'var(--weight-medium)', fontSize: 'var(--text-subhead)' }}>
                  Platform Commission Rate (%)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    className="form-input"
                    value={configModal.commission}
                    onChange={e => setConfigModal(prev => ({ ...prev, commission: e.target.value }))}
                    style={{ maxWidth: 120 }}
                  />
                  <span style={{ fontWeight: 'bold' }}>%</span>
                </div>
              </div>
            </div>

            {/* Webhook Endpoint Box */}
            <div style={{
              background: 'var(--color-bg-secondary)',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-separator)'
            }}>
              <label className="form-label" style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-caption1)' }}>
                Live Webhook URL for {PLATFORM_META[configModal.platformId]?.name}
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 4 }}>
                <input
                  className="form-input"
                  readOnly
                  value={`https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project'}.cloudfunctions.net/handleDeliveryWebhook?platform=${configModal.platformId}&restaurantId=${restaurant?.id}`}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'var(--color-bg)' }}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    const url = `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project'}.cloudfunctions.net/handleDeliveryWebhook?platform=${configModal.platformId}&restaurantId=${restaurant?.id}`;
                    navigator.clipboard.writeText(url);
                    toast.success('Webhook URL copied!');
                  }}
                  title="Copy Webhook URL"
                  style={{ padding: '0 12px', minHeight: 38 }}
                >
                  <Copy size={14} />
                </button>
              </div>
              <p className="text-secondary text-caption2" style={{ marginTop: 6, marginBottom: 0 }}>
                Paste this into your {PLATFORM_META[configModal.platformId]?.name} developer / merchant webhook configuration.
              </p>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)', paddingTop: 'var(--space-3)', borderTop: '1px solid var(--color-separator)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfigModal(prev => ({ ...prev, isOpen: false }))}
                disabled={configModal.saving}
                style={{ minHeight: 40, padding: '0 16px' }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSaveConfigModal}
                disabled={configModal.saving}
                style={{ minHeight: 40, padding: '0 20px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Check size={16} /> {configModal.saving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

