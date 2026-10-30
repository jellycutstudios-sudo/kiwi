import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { collection, onSnapshot, doc, getDoc, setDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatCurrency } from '../../utils/formatCurrency';
import { 
  Truck, RefreshCw, AlertCircle, CheckCircle2, 
  ShoppingBag, DollarSign, Percent, Clock, Plus, 
  Trash2, ChevronDown, ChevronUp, Check, X, Sliders,
  Key, Settings as SettingsIcon, Copy, Eye, EyeOff,
  Flame, Search, Play, User,
  TrendingUp, BarChart3, Package, Zap,
  Phone, MapPin, Radio, Power,
  Info
} from 'lucide-react';
import ToggleSwitch from '../../components/shared/ToggleSwitch';
import { useOrderStore } from '../../stores/orderStore';
import toast from 'react-hot-toast';
import { PLATFORM_META, ALL_PLATFORMS, isPlatformRelevantToRestaurant } from '../../constants/deliveryPlatforms';

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

// Authentic SVG Platform Brand Marks
export function PlatformBrandLogo({ id, size = 42, style = {} }) {
  const baseStyle = {
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.28),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontWeight: 800,
    userSelect: 'none',
    ...style
  };

  switch (id) {
    case 'talabat':
      return (
        <div style={{
          ...baseStyle,
          background: 'linear-gradient(135deg, #FF5A00 0%, #D84800 100%)',
          color: '#ffffff',
          boxShadow: '0 3px 10px rgba(255, 90, 0, 0.25)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <span style={{ fontSize: size * 0.44, fontWeight: 900, letterSpacing: '-0.5px' }}>tal.</span>
        </div>
      );
    case 'snoonu':
      return (
        <div style={{
          ...baseStyle,
          background: 'linear-gradient(135deg, #E30613 0%, #B8000A 100%)',
          color: '#ffffff',
          boxShadow: '0 3px 10px rgba(227, 6, 19, 0.25)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <span style={{ fontSize: size * 0.48, fontWeight: 900 }}>S</span>
        </div>
      );
    case 'rafeeq':
      return (
        <div style={{
          ...baseStyle,
          background: 'linear-gradient(135deg, #5C1D8C 0%, #3D105E 100%)',
          color: '#ffffff',
          boxShadow: '0 3px 10px rgba(92, 29, 140, 0.25)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <span style={{ fontSize: size * 0.48, fontWeight: 900 }}>R</span>
        </div>
      );
    case 'jahez':
      return (
        <div style={{
          ...baseStyle,
          background: 'linear-gradient(135deg, #FFB300 0%, #E69D00 100%)',
          color: '#1a1a1a',
          boxShadow: '0 3px 10px rgba(255, 179, 0, 0.25)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <span style={{ fontSize: size * 0.48, fontWeight: 900 }}>J</span>
        </div>
      );
    case 'deliveroo':
      return (
        <div style={{
          ...baseStyle,
          background: 'linear-gradient(135deg, #00CDBC 0%, #009E91 100%)',
          color: '#ffffff',
          boxShadow: '0 3px 10px rgba(0, 205, 188, 0.25)'
        }}>
          <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="#ffffff">
            <path d="M12 2C8 2 6 5.5 6 9c0 3.5 2 6 3.5 7.5L8 20h3l1.5-3.5h3L17 20h3l-1.5-3.5C20 15 22 12.5 22 9c0-3.5-2-7-6-7-1.5 0-2.8.5-4 1.5C10.8 2.5 9.5 2 8 2h4zM10 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm6 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
          </svg>
        </div>
      );
    case 'ubereats':
      return (
        <div style={{
          ...baseStyle,
          background: '#0a0a0a',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 3px 10px rgba(0, 0, 0, 0.35)',
          lineHeight: 1
        }}>
          <span style={{ color: '#ffffff', fontWeight: 800, fontSize: size * 0.22, letterSpacing: '0.02em' }}>Uber</span>
          <span style={{ color: '#06C167', fontWeight: 900, fontSize: size * 0.26, letterSpacing: '0.04em', marginTop: 1 }}>Eats</span>
        </div>
      );
    case 'zomato':
      return (
        <div style={{
          ...baseStyle,
          background: 'linear-gradient(135deg, #E23744 0%, #B81D2A 100%)',
          color: '#ffffff',
          boxShadow: '0 3px 10px rgba(226, 55, 68, 0.25)',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <span style={{ fontSize: size * 0.34, fontStyle: 'italic', fontWeight: 900, letterSpacing: '-0.5px' }}>zomato</span>
        </div>
      );
    case 'swiggy':
      return (
        <div style={{
          ...baseStyle,
          background: 'linear-gradient(135deg, #FC8019 0%, #D86303 100%)',
          color: '#ffffff',
          boxShadow: '0 3px 10px rgba(252, 128, 25, 0.25)'
        }}>
          <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#ffffff" />
            <path d="M12 7c-1.3 0-2.3 1-2.3 2.3 0 .8.4 1.5 1.1 1.9l-1.3 1.8h3.5c.9 0 1.5-.7 1.5-1.5 0-1.4-1.1-2.5-2.5-2.5z" fill="#FC8019" />
          </svg>
        </div>
      );
    default:
      return (
        <div style={{ ...baseStyle, background: 'var(--color-bg-secondary)', color: 'var(--color-accent)' }}>
          <Truck size={size * 0.5} />
        </div>
      );
  }
}

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

  // Channel Region filter ('recommended' | 'connected' | 'all')
  const [channelFilter, setChannelFilter] = useState('recommended');

  // Category Matrix UI states
  const [expandedCategories, setExpandedCategories] = useState({});

  // Search & Filter states for Live Orders
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersChannelFilter, setOrdersChannelFilter] = useState('all');
  const [ordersStatusFilter, setOrdersStatusFilter] = useState('active'); // 'active' | 'pending' | 'preparing' | 'ready' | 'completed' | 'all'

  // Search & Filter states for Menu Controls
  const [itemSearch, setItemSearch] = useState('');
  const [availFilter, setAvailFilter] = useState('all'); // 'all' | 'paused_only' | 'active_only'

  // Time period filter for Financials & Payouts tab
  const [financialsPeriod, setFinancialsPeriod] = useState('today'); // 'today' | 'yesterday' | 'week' | 'month' | 'all'

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
  const isPlatformEnabled = useCallback((platformId) => integrations[platformId]?.enabled === true, [integrations]);

  // Resolve platforms relevant to restaurant region + any connected
  const recommendedPlatformIds = useMemo(() => {
    return ALL_PLATFORMS.filter(id => isPlatformRelevantToRestaurant(id, restaurant, integrations));
  }, [restaurant, integrations]);

  const displayedPlatformIds = useMemo(() => {
    if (channelFilter === 'connected') {
      return ALL_PLATFORMS.filter(id => isPlatformEnabled(id));
    }
    if (channelFilter === 'recommended') {
      return recommendedPlatformIds;
    }
    return ALL_PLATFORMS;
  }, [channelFilter, recommendedPlatformIds, isPlatformEnabled]);
  const isPlatformPaused = (platformId) => platformSettings[platformId]?.paused === true;

  // Open partner configuration modal
  const openConfigModal = async (platformId) => {
    let currentConfig = integrations[platformId] || {};
    if (restaurant?.id) {
      try {
        const secureSnap = await getDoc(doc(db, 'restaurants', restaurant.id, 'deliverySettings', platformId));
        if (secureSnap.exists()) {
          currentConfig = { ...currentConfig, ...secureSnap.data() };
        }
      } catch (e) {
        console.warn('Could not read secure credentials:', e);
      }
    }
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
      // 1. Securely save credentials to protected deliverySettings subcollection (accessible only by admin & Cloud Functions)
      const secureDocRef = doc(db, 'restaurants', restaurant.id, 'deliverySettings', platformId);
      await setDoc(secureDocRef, {
        ...fields,
        platformId,
        enabled: Boolean(enabled),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. On root restaurant document, save only non-sensitive configuration (enabled flag & general delivery settings)
      const docRef = doc(db, 'restaurants', restaurant.id);
      const publicPlatformConfig = {
        enabled: Boolean(enabled)
      };

      const parsedCommission = parseFloat(commission);
      const updatedCommissions = {
        ...commissions,
        [platformId]: isNaN(parsedCommission) ? 20 : parsedCommission
      };

      await setDoc(docRef, {
        deliveryIntegrations: {
          [platformId]: publicPlatformConfig
        },
        deliverySettings: {
          autoAccept,
          busyHours,
          commissions: updatedCommissions
        }
      }, { merge: true });

      // Local authStore & state sync (in-memory only for current admin session)
      const inMemoryConfig = {
        ...publicPlatformConfig,
        ...fields
      };
      const updatedRest = {
        ...restaurant,
        deliveryIntegrations: {
          ...(restaurant?.deliveryIntegrations || {}),
          [platformId]: inMemoryConfig
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
      setIntegrations(prev => ({ ...prev, [platformId]: inMemoryConfig }));
      setCommissions(updatedCommissions);

      toast.success(`${PLATFORM_META[platformId]?.name} configuration securely saved!`);
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

  // Period-aware orders helper for Financials
  const getPeriodOrders = (period) => {
    const nowDate = new Date();
    const todayStr = nowDate.toDateString();

    if (period === 'today') {
      return orders.filter(o => {
        if (!o.createdAt) return false;
        const d = typeof o.createdAt.toDate === 'function' ? o.createdAt.toDate() : new Date(o.createdAt);
        return d.toDateString() === todayStr;
      });
    }
    if (period === 'yesterday') {
      const yest = new Date(nowDate);
      yest.setDate(yest.getDate() - 1);
      const yestStr = yest.toDateString();
      return orders.filter(o => {
        if (!o.createdAt) return false;
        const d = typeof o.createdAt.toDate === 'function' ? o.createdAt.toDate() : new Date(o.createdAt);
        return d.toDateString() === yestStr;
      });
    }
    if (period === 'week') {
      const weekAgo = new Date(nowDate);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return orders.filter(o => {
        if (!o.createdAt) return false;
        const d = typeof o.createdAt.toDate === 'function' ? o.createdAt.toDate() : new Date(o.createdAt);
        return d >= weekAgo;
      });
    }
    if (period === 'month') {
      const monthAgo = new Date(nowDate);
      monthAgo.setDate(monthAgo.getDate() - 30);
      return orders.filter(o => {
        if (!o.createdAt) return false;
        const d = typeof o.createdAt.toDate === 'function' ? o.createdAt.toDate() : new Date(o.createdAt);
        return d >= monthAgo;
      });
    }
    return orders; // 'all'
  };

  const periodOrders = getPeriodOrders(financialsPeriod);

  // Channel breakdown calculation for reconciliation
  const channelMetrics = Object.keys(PLATFORM_META).map(platformId => {
    const meta = PLATFORM_META[platformId];
    const isEnabled = isPlatformEnabled(platformId);
    const platformOrders = periodOrders.filter(o => o.source === platformId);
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
          { key: 'categories', label: 'Item Availability', icon: Sliders },
          { key: 'reconciliation', label: 'Financials & Payouts', icon: BarChart3 },
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
              <div className="hub-stat-icon-wrapper" style={{ background: todayCommission > 0 ? 'rgba(255, 149, 0, 0.12)' : 'var(--color-bg-secondary)', color: todayCommission > 0 ? '#ff9500' : 'var(--color-label-tertiary)' }}>
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
                <div className="hub-stat-value" style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span>{activeCount}</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-label-secondary)' }}>
                    ({enabledCount}/{recommendedPlatformIds.length} in Region)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Region & Status Filter Segmented Bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: 'var(--space-1)'
          }}>
            <div style={{
              display: 'inline-flex',
              background: 'var(--color-bg-secondary)',
              padding: '3px',
              borderRadius: '10px',
              border: '1px solid var(--color-separator-opaque)'
            }}>
              <button
                type="button"
                onClick={() => setChannelFilter('recommended')}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '7px',
                  border: 'none',
                  background: channelFilter === 'recommended' ? 'var(--color-bg)' : 'transparent',
                  color: channelFilter === 'recommended' ? 'var(--color-label)' : 'var(--color-label-secondary)',
                  boxShadow: channelFilter === 'recommended' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>📍</span>
                <span>For Your Region ({recommendedPlatformIds.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setChannelFilter('connected')}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '7px',
                  border: 'none',
                  background: channelFilter === 'connected' ? 'var(--color-bg)' : 'transparent',
                  color: channelFilter === 'connected' ? 'var(--color-label)' : 'var(--color-label-secondary)',
                  boxShadow: channelFilter === 'connected' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>✅</span>
                <span>Connected ({enabledCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setChannelFilter('all')}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '7px',
                  border: 'none',
                  background: channelFilter === 'all' ? 'var(--color-bg)' : 'transparent',
                  color: channelFilter === 'all' ? 'var(--color-label)' : 'var(--color-label-secondary)',
                  boxShadow: channelFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>🌐</span>
                <span>All Directory ({ALL_PLATFORMS.length})</span>
              </button>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--color-label-tertiary)' }}>
              {channelFilter === 'recommended' && (
                <span>Auto-filtered for {restaurant?.country || (currency === 'QAR' ? 'Qatar' : currency === 'INR' ? 'India' : currency === 'AED' ? 'UAE' : currency === 'SAR' ? 'Saudi Arabia' : currency)}</span>
              )}
              {channelFilter === 'connected' && (
                <span>Showing {enabledCount} active integration{enabledCount !== 1 ? 's' : ''}</span>
              )}
              {channelFilter === 'all' && (
                <span>Viewing complete international aggregator catalog</span>
              )}
            </div>
          </div>

          {/* Integration Platform Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-4)' }}>
            {displayedPlatformIds.length === 0 ? (
              <div style={{
                gridColumn: '1 / -1',
                padding: 'var(--space-8)',
                textAlign: 'center',
                background: 'var(--color-bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1.5px dashed var(--color-separator-opaque)'
              }}>
                <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔌</div>
                <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--color-label)' }}>No Connected Delivery Partners Yet</div>
                <div style={{ fontSize: '13px', color: 'var(--color-label-secondary)', marginTop: '4px', maxWidth: 440, margin: '4px auto 16px' }}>
                  Switch to &quot;For Your Region&quot; to configure delivery aggregators operating in your area.
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setChannelFilter('recommended')}
                >
                  Browse Regional Partners
                </button>
              </div>
            ) : displayedPlatformIds.map(id => {
              const meta = PLATFORM_META[id] || {};
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
              let pillColor = 'var(--color-label-tertiary)';
              let dotBg = 'var(--color-label-tertiary)';

              if (isEnabled) {
                if (paused) {
                  statusText = countdown ? `Paused (${countdown})` : 'Paused Indefinitely';
                  pillColor = '#ff9500';
                  dotBg = '#ff9500';
                } else {
                  statusText = 'Live';
                  pillColor = 'var(--color-success)';
                  dotBg = 'var(--color-success)';
                }
              }

              return (
                <div 
                  key={id} 
                  className="card" 
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: 'var(--space-3)', 
                    border: isEnabled 
                      ? (paused ? '1px solid rgba(255, 149, 0, 0.35)' : '1px solid rgba(52, 199, 89, 0.35)') 
                      : '1px solid var(--color-separator-opaque)',
                    background: 'var(--color-bg-elevated)',
                    borderRadius: 'var(--radius-lg, 16px)',
                    padding: 'var(--space-4)',
                    boxShadow: isEnabled 
                      ? (paused ? '0 4px 20px rgba(255, 149, 0, 0.05)' : '0 4px 20px rgba(52, 199, 89, 0.06)') 
                      : 'none',
                    transition: 'border-color var(--duration-fast), box-shadow var(--duration-fast)',
                    position: 'relative'
                  }}
                >
                  {/* Card Header: Brand Logo + Details + Header Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
                      <PlatformBrandLogo id={id} size={42} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <h4 style={{ fontWeight: 700, fontSize: '15px', margin: 0, letterSpacing: '-0.2px' }}>
                            {meta.name}
                          </h4>
                          {meta.region && (
                            <span style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '1px 6px',
                              borderRadius: 'var(--radius-full)',
                              background: 'rgba(255, 255, 255, 0.06)',
                              color: 'var(--color-label-secondary)',
                              whiteSpace: 'nowrap'
                            }}>
                              {meta.region}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                          <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: dotBg,
                            boxShadow: isEnabled && !paused ? '0 0 6px var(--color-success)' : 'none',
                            flexShrink: 0
                          }} />
                          <span style={{ 
                            fontSize: '11px', 
                            fontWeight: 600,
                            color: pillColor
                          }}>
                            {statusText}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Header Controls: Config Gear + Squircle Toggle Switch */}
                    {isUserAdmin && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <button 
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => openConfigModal(id)}
                          style={{ 
                            width: 32, height: 32, padding: 0,
                            borderRadius: 'var(--radius-md)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'var(--color-label-secondary)',
                            background: 'rgba(255, 255, 255, 0.04)'
                          }}
                          title={`Configure ${meta.name} API & Credentials`}
                        >
                          <SettingsIcon size={14} />
                        </button>
                        <ToggleSwitch
                          id={`toggle-${id}`}
                          checked={isEnabled}
                          onChange={(e) => handleTogglePlatform(id, e.target.checked)}
                          size="sm"
                          title={isEnabled ? `Deactivate ${meta.name}` : `Activate ${meta.name}`}
                        />
                      </div>
                    )}
                  </div>

                  {/* Pause Info / reason if active */}
                  {isEnabled && paused && (
                    <div style={{
                      background: 'rgba(255, 149, 0, 0.08)',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '11px',
                      color: '#ff9500',
                      border: '1px solid rgba(255, 149, 0, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <Clock size={13} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {settingsInfo.pauseReason ? settingsInfo.pauseReason : 'Channel paused temporarily'}
                        </span>
                      </div>
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', minHeight: 24, fontSize: '11px', fontWeight: 600, color: 'var(--color-success)', flexShrink: 0 }}
                        onClick={() => handleResumePlatform(id)}
                      >
                        Resume
                      </button>
                    </div>
                  )}

                  {/* Content Body: Active Metrics vs Inactive Channel Specifications */}
                  {isEnabled ? (
                    <>
                      {/* Metrics 2-column box */}
                      <div style={{ 
                        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, 
                        background: 'var(--color-bg-secondary)', 
                        padding: '10px 12px', 
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-separator)'
                      }}>
                        <div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-label-secondary)', fontWeight: 600 }}>
                            Orders Today
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: 2, color: 'var(--color-label-primary)' }}>
                            {channelOrders.length}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-label-secondary)', fontWeight: 600 }}>
                            Revenue
                          </div>
                          <div style={{ fontSize: '18px', fontWeight: 800, marginTop: 2, color: 'var(--color-label-primary)' }}>
                            {formatCurrency(channelRev, currency)}
                          </div>
                        </div>
                      </div>

                      {/* Control buttons */}
                      <div style={{ display: 'flex', gap: 8 }}>
                        {paused ? (
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ flex: 1, minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}
                            onClick={() => handleResumePlatform(id)}
                          >
                            <Play size={13} style={{ color: 'var(--color-success)' }} /> Resume Channel
                          </button>
                        ) : (
                          <button 
                            className="btn btn-secondary btn-sm" 
                            style={{ flex: 1, minHeight: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontWeight: 600 }}
                            onClick={() => openPauseModal(id)}
                          >
                            <Clock size={13} style={{ color: '#ff9500' }} /> Pause
                          </button>
                        )}

                        <button 
                          className="btn btn-secondary btn-sm"
                          onClick={() => triggerSync(id)}
                          disabled={syncing || syncingPlatform !== null}
                          style={{ minHeight: 34, padding: '0 12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: '12px' }}
                          title="Trigger catalog sync"
                        >
                          <RefreshCw size={13} className={isSyncingThis ? 'spin' : ''} />
                          <span>Sync</span>
                        </button>
                      </div>

                      {/* Sync status logs */}
                      <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-label-secondary)', paddingTop: 2 }}>
                        {log ? (
                          log.status === 'success' ? (
                            <>
                              <CheckCircle2 size={12} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Synced {log.itemsSynced} items ({new Date(log.timestamp?.toDate ? log.timestamp.toDate() : log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                              </span>
                            </>
                          ) : (
                            <>
                              <AlertCircle size={12} style={{ color: 'var(--color-red)', flexShrink: 0 }} />
                              <span style={{ color: 'var(--color-red)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                Sync error: {log.error}
                              </span>
                            </>
                          )
                        ) : (
                          <>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-label-tertiary)', flexShrink: 0 }} />
                            <span>Catalog ready to sync</span>
                          </>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      padding: '12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px dashed var(--color-separator)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                        <span>Est. Commission</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-label-primary)' }}>
                          {commissions[id] ? `${commissions[id]}%` : '20%'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                        <span>Integration</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-label-primary)' }}>Direct API & Webhook</span>
                      </div>

                      {isUserAdmin && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => openConfigModal(id)}
                            style={{ 
                              flex: 1, minHeight: 34, fontSize: '12px', fontWeight: 600,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                            }}
                          >
                            <Key size={13} /> Configure API
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleTogglePlatform(id, true)}
                            style={{ 
                              minHeight: 34, padding: '0 14px', fontSize: '12px', fontWeight: 600,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5
                            }}
                          >
                            <Power size={13} /> Enable
                          </button>
                        </div>
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
          {/* Controls Bar: Unified Command Toolbar */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', borderRadius: 'var(--radius-lg, 16px)' }}>
            {/* Top row: Status pills */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
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
              {ALL_PLATFORMS.filter(p => isPlatformEnabled(p) || recommendedPlatformIds.includes(p) || orders.some(o => o.source === p)).map(platformId => {
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
                      gap: 6
                    }}
                  >
                    <PlatformBrandLogo id={platformId} size={15} />
                    <span>{meta.name}</span>
                    {count > 0 && <span style={{ opacity: 0.8, fontSize: '10px' }}>({count})</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Orders stream cards list */}
          {filteredDeliveryOrders.length === 0 ? (
            <div className="card card-padded" style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-label-secondary)', borderRadius: 'var(--radius-lg, 16px)' }}>
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
                const meta = PLATFORM_META[order.source] || { name: order.source || 'Online', color: 'var(--color-accent)' };
                
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
                      borderRadius: 'var(--radius-lg, 16px)',
                      border: isPending ? '1.5px solid #ff9500' : '1px solid var(--color-separator-opaque)',
                      boxShadow: isPending ? '0 0 16px rgba(255, 149, 0, 0.15)' : 'none',
                      background: 'var(--color-bg-elevated)',
                      overflow: 'hidden'
                    }}
                  >
                    <div>
                      {/* Ticket header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderBottom: '1px solid var(--color-separator-opaque)',
                        background: 'var(--color-bg-secondary)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <PlatformBrandLogo id={order.source} size={30} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontWeight: 700, fontSize: '13px' }}>{meta.name}</span>
                              <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', fontWeight: 600 }}>
                                #{order.externalOrderId || order.orderNumber || order.id?.slice(-6)}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--color-label-tertiary)', marginTop: 2 }}>
                              <Clock size={11} />
                              <span>{timeAgoStr}</span>
                            </div>
                          </div>
                        </div>

                        <span style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: 'var(--radius-full)',
                          background: statusBadgeBg,
                          color: statusBadgeColor,
                          whiteSpace: 'nowrap'
                        }}>
                          {statusLabel}
                        </span>
                      </div>

                      {/* Ticket meta: customer & address */}
                      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-separator-opaque)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '12px', fontWeight: 600 }}>
                            <User size={13} style={{ color: 'var(--color-label-tertiary)' }} />
                            {order.customerName || 'Delivery Guest'}
                          </span>
                          {order.customerPhone && (
                            <a
                              href={`tel:${order.customerPhone}`}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--color-accent)', textDecoration: 'none' }}
                            >
                              <Phone size={11} />
                              <span>{order.customerPhone}</span>
                            </a>
                          )}
                        </div>

                        {order.deliveryAddress && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: 'var(--color-label-secondary)', marginTop: 4 }}>
                            <MapPin size={12} style={{ color: 'var(--color-label-tertiary)', flexShrink: 0 }} />
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {typeof order.deliveryAddress === 'string' ? order.deliveryAddress : order.deliveryAddress.street || 'Address on file'}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Items list */}
                      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(order.items || []).map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, minWidth: 0 }}>
                              <span style={{ fontWeight: 700, minWidth: 20, color: 'var(--color-accent)' }}>
                                {item.quantity || 1}x
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <span style={{ fontWeight: 500 }}>{item.name}</span>
                                {item.notes && (
                                  <div style={{ fontSize: '11px', color: '#ff9500', fontStyle: 'italic', marginTop: 1 }}>
                                    Note: {item.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                            <span style={{ fontWeight: 600, color: 'var(--color-label-secondary)', flexShrink: 0, marginLeft: 8 }}>
                              {formatCurrency((item.price || 0) * (item.quantity || 1), currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Footer & Actions */}
                    <div style={{
                      padding: '12px 14px',
                      background: 'var(--color-bg-secondary)',
                      borderTop: '1px solid var(--color-separator-opaque)'
                    }}>
                      {/* Subtotal & Net row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                          Total ({order.items?.length || 0} items)
                        </span>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-label-primary)' }}>
                          {formatCurrency(order.total || 0, currency)}
                        </span>
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
                            <Truck size={14} /> Handover to Driver
                          </button>
                        )}

                        {isCompleted && (
                          <div style={{ width: '100%', textAlign: 'center', fontSize: '12px', color: 'var(--color-label-secondary)', padding: '6px 0', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                            <CheckCircle2 size={14} style={{ color: 'var(--color-success)' }} /> Order Dispatched
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

      {/* Item Availability Tab */}
      {activeTab === 'categories' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-4)', borderRadius: 'var(--radius-lg, 16px)' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: '16px', letterSpacing: '-0.2px' }}>
                Item Availability & Stock Controls
              </h3>
              <p className="text-secondary text-caption1" style={{ margin: '3px 0 0' }}>
                Instantly mark out-of-stock dishes (86'ing) across all connected delivery aggregator menus in one tap.
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

          {/* Active channels banner */}
          {activePlatforms.length === 0 ? (
            <div style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(0, 122, 255, 0.08)',
              border: '1px solid rgba(0, 122, 255, 0.2)',
              color: 'var(--color-label-primary)',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <Info size={15} style={{ color: '#007aff', flexShrink: 0 }} />
              <span>No delivery channels are currently live. You can still toggle global dish availability below.</span>
            </div>
          ) : (
            <div style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-separator-opaque)',
              fontSize: '11px',
              color: 'var(--color-label-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap'
            }}>
              <span style={{ fontWeight: 600, color: 'var(--color-label-primary)' }}>Active Channels ({activePlatforms.length}):</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {activePlatforms.map(pid => (
                  <span key={pid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(255, 255, 255, 0.05)', padding: '2px 8px', borderRadius: 'var(--radius-full)', fontWeight: 600 }}>
                    <PlatformBrandLogo id={pid} size={14} />
                    <span>{PLATFORM_META[pid]?.name}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Filter toolbar: Search & Availability chips */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--color-separator-opaque)' }}>
            {/* Availability Filter Chips */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[
                { id: 'all', label: 'All Dishes' },
                { id: 'paused_only', label: '🚫 Out of Stock Only' },
                { id: 'active_only', label: '🟢 In Stock Everywhere' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setAvailFilter(f.id)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    border: availFilter === f.id ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                    background: availFilter === f.id ? 'var(--color-accent-light)' : 'transparent',
                    color: availFilter === f.id ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                    fontWeight: availFilter === f.id ? 700 : 500,
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Item Search Input */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 260 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--color-label-tertiary)' }} />
              <input
                type="text"
                className="form-input"
                placeholder="Search dish or category..."
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

          {/* Categories Accordion */}
          {filteredCategories.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-label-secondary)' }}>
              No dishes found matching your search.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {filteredCategories.map(category => {
                const isExpanded = expandedCategories[category.id] === true || Boolean(itemSearch.trim());
                const enabledOnAny = activePlatforms.some(platformId => isCategoryEnabled(platformId, category.id));

                return (
                  <div
                    key={category.id}
                    style={{
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-separator-opaque)',
                      background: 'var(--color-bg)',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Category Header Row */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 14px',
                        background: 'var(--color-bg-secondary)',
                        cursor: 'pointer'
                      }}
                      onClick={() => toggleExpandCategory(category.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--color-label-tertiary)' }}>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                        <span style={{ fontSize: '1.1rem' }}>{category.emoji}</span>
                        <span style={{ fontWeight: 700, fontSize: '14px' }}>{category.name}</span>
                        <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', fontWeight: 500 }}>
                          ({category.items?.length || 0} items)
                        </span>
                      </div>

                      {activePlatforms.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{
                              padding: '2px 8px',
                              minHeight: 26,
                              fontSize: '11px',
                              fontWeight: 600,
                              color: enabledOnAny ? 'var(--color-red)' : 'var(--color-success)',
                              borderColor: enabledOnAny ? 'rgba(255, 59, 48, 0.25)' : 'rgba(52, 199, 89, 0.25)'
                            }}
                            onClick={() => toggleCategoryAllPlatforms(category.id, !enabledOnAny)}
                          >
                            {enabledOnAny ? '86 Category' : 'Enable Category'}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Items inside category */}
                    {isExpanded && (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {(category.items ?? []).map((item, idx) => {
                          const isItemAllActive = activePlatforms.length > 0
                            ? activePlatforms.every(pid => isItemEnabled(pid, item.id, item.available))
                            : item.available !== false;

                          return (
                            <div
                              key={item.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: 10,
                                padding: '10px 14px',
                                borderTop: idx > 0 ? '1px solid var(--color-separator-opaque)' : 'none',
                                background: !isItemAllActive ? 'rgba(255, 59, 48, 0.03)' : 'transparent'
                              }}
                            >
                              {/* Left: Item Info */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200, flex: 1 }}>
                                <span style={{ fontSize: '1.1rem' }}>{item.emoji}</span>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 600, fontSize: '13px', textDecoration: !isItemAllActive ? 'line-through' : 'none', color: !isItemAllActive ? 'var(--color-label-secondary)' : 'inherit' }}>
                                      {item.name}
                                    </span>
                                    {!isItemAllActive && (
                                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-full)', background: 'rgba(255, 59, 48, 0.15)', color: 'var(--color-red)' }}>
                                        86'd
                                      </span>
                                    )}
                                  </div>
                                  <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                                    {formatCurrency(item.price, currency)}
                                  </span>
                                </div>
                              </div>

                              {/* Right: Master Switch + Per-Channel Buttons */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {/* Per-Platform Overrides (if active channels exist) */}
                                {activePlatforms.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    {activePlatforms.map(platformId => {
                                      const isCatAvail = isCategoryEnabled(platformId, category.id);
                                      const isItmAvail = isItemEnabled(platformId, item.id, item.available);
                                      const isAvailable = isCatAvail && isItmAvail;

                                      return (
                                        <button
                                          key={platformId}
                                          type="button"
                                          onClick={() => toggleOverride(platformId, item.id, isItmAvail)}
                                          disabled={!isCatAvail}
                                          style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '3px 8px',
                                            borderRadius: 'var(--radius-full)',
                                            border: isAvailable ? '1px solid rgba(52, 199, 89, 0.35)' : '1px solid rgba(255, 59, 48, 0.35)',
                                            background: isAvailable ? 'rgba(52, 199, 89, 0.1)' : 'rgba(255, 59, 48, 0.1)',
                                            color: isAvailable ? 'var(--color-success)' : 'var(--color-red)',
                                            fontSize: '11px',
                                            fontWeight: 600,
                                            cursor: !isCatAvail ? 'not-allowed' : 'pointer',
                                            opacity: !isCatAvail ? 0.4 : 1
                                          }}
                                          title={`${PLATFORM_META[platformId]?.name}: ${isAvailable ? 'In Stock (Click to 86)' : '86’d (Click to enable)'}`}
                                        >
                                          <PlatformBrandLogo id={platformId} size={14} />
                                          <span>{isAvailable ? 'In Stock' : '86’d'}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Master Toggle */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderLeft: '1px solid var(--color-separator-opaque)', paddingLeft: 12 }}>
                                  <span style={{ fontSize: '11px', fontWeight: 600, color: isItemAllActive ? 'var(--color-success)' : 'var(--color-red)' }}>
                                    {isItemAllActive ? 'In Stock' : 'Out of Stock'}
                                  </span>
                                  <ToggleSwitch
                                    id={`toggle-item-${item.id}`}
                                    checked={isItemAllActive}
                                    onChange={() => toggleItemAllPlatforms(item.id, !isItemAllActive)}
                                    size="sm"
                                    title={isItemAllActive ? '86 this item everywhere' : 'Enable this item everywhere'}
                                  />
                                </div>
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
          )}
        </div>
      )}

      {/* Financials & Payouts Tab */}
      {activeTab === 'reconciliation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Header Controls: Time Period Filter */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: '16px', letterSpacing: '-0.2px' }}>
                Delivery Revenue & Net Payouts
              </h3>
              <p className="text-secondary text-caption1" style={{ margin: '3px 0 0' }}>
                Estimated payout projections after deducting agreed delivery aggregator commission percentages.
              </p>
            </div>

            {/* Time period filter pills */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {[
                { id: 'today', label: 'Today' },
                { id: 'yesterday', label: 'Yesterday' },
                { id: 'week', label: 'Last 7 Days' },
                { id: 'month', label: 'Last 30 Days' },
                { id: 'all', label: 'All Time' }
              ].map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setFinancialsPeriod(p.id)}
                  style={{
                    padding: '5px 12px',
                    borderRadius: 'var(--radius-full)',
                    border: financialsPeriod === p.id ? '1.5px solid var(--color-accent)' : '1px solid var(--color-separator)',
                    background: financialsPeriod === p.id ? 'var(--color-accent-light)' : 'var(--color-bg-secondary)',
                    color: financialsPeriod === p.id ? 'var(--color-accent)' : 'var(--color-label-secondary)',
                    fontWeight: financialsPeriod === p.id ? 700 : 500,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4 Metric Summary KPI Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-4)'
          }}>
            <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderRadius: 'var(--radius-lg, 16px)' }}>
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-secondary)', color: 'var(--color-accent)' }}>
                <ShoppingBag size={24} />
              </div>
              <div>
                <span className="text-secondary text-caption1">Total Orders</span>
                <h4 className="text-title3" style={{ margin: 0, fontWeight: 700 }}>{totalOrdersAll}</h4>
              </div>
            </div>

            <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderRadius: 'var(--radius-lg, 16px)' }}>
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'rgba(52, 199, 89, 0.12)', color: 'var(--color-success)' }}>
                <DollarSign size={24} />
              </div>
              <div>
                <span className="text-secondary text-caption1">Gross Sales</span>
                <h4 className="text-title3" style={{ margin: 0, fontWeight: 700 }}>{formatCurrency(totalGrossAll, currency)}</h4>
              </div>
            </div>

            <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderRadius: 'var(--radius-lg, 16px)' }}>
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'rgba(255, 149, 0, 0.12)', color: '#ff9500' }}>
                <Percent size={24} />
              </div>
              <div>
                <span className="text-secondary text-caption1">Est. Commissions</span>
                <h4 className="text-title3" style={{ margin: 0, fontWeight: 700, color: totalCommissionAll > 0 ? '#ff9500' : 'inherit' }}>
                  -{formatCurrency(totalCommissionAll, currency)}
                </h4>
              </div>
            </div>

            <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderRadius: 'var(--radius-lg, 16px)' }}>
              <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'rgba(52, 199, 89, 0.15)', color: 'var(--color-success)' }}>
                <TrendingUp size={24} />
              </div>
              <div>
                <span className="text-secondary text-caption1">Est. Net Payout</span>
                <h4 className="text-title3" style={{ margin: 0, fontWeight: 700, color: 'var(--color-success)' }}>
                  {formatCurrency(totalNetAll, currency)}
                </h4>
              </div>
            </div>
          </div>

          {/* Breakdown Table Card */}
          <div className="card" style={{ borderRadius: 'var(--radius-lg, 16px)', overflow: 'hidden' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <div>
                <span className="card-title">Channel Performance & Commission Breakdown</span>
                <p className="text-secondary text-caption1" style={{ marginTop: 2 }}>
                  Net payout projections based on platform commission agreements for the selected period.
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
                    <th style={{ textAlign: 'left', padding: '12px 16px', color: 'var(--color-label-secondary)' }}>Channel</th>
                    <th style={{ textAlign: 'center', padding: '12px 16px', color: 'var(--color-label-secondary)' }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--color-label-secondary)' }}>Orders</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--color-label-secondary)' }}>Gross Sales</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--color-label-secondary)' }}>Commission %</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--color-label-secondary)' }}>Est. Commission</th>
                    <th style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--color-label-secondary)' }}>Est. Net Payout</th>
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
                      <td style={{ padding: '12px 16px', textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <PlatformBrandLogo id={channel.id} size={28} />
                          <div>
                            <span style={{ fontWeight: 600 }}>{channel.name}</span>
                            <span style={{ fontSize: '11px', color: 'var(--color-label-tertiary)', marginLeft: 6 }}>({channel.region})</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ textAlign: 'center', padding: '12px 16px' }}>
                        <span style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          background: channel.isEnabled ? 'rgba(52, 199, 89, 0.12)' : 'var(--color-bg-secondary)',
                          color: channel.isEnabled ? 'var(--color-success)' : 'var(--color-label-tertiary)'
                        }}>
                          {channel.isEnabled ? 'Connected' : 'Offline'}
                        </span>
                      </td>

                      {/* Orders */}
                      <td style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600 }}>
                        {channel.count}
                      </td>

                      {/* Gross */}
                      <td style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 600 }}>
                        {formatCurrency(channel.gross, currency)}
                      </td>

                      {/* Rate */}
                      <td style={{ textAlign: 'right', padding: '12px 16px', color: 'var(--color-label-secondary)' }}>
                        {channel.commissionRate}%
                      </td>

                      {/* Deducted */}
                      <td style={{ textAlign: 'right', padding: '12px 16px', color: channel.estimatedCommission > 0 ? '#ff9500' : 'var(--color-label-tertiary)' }}>
                        -{formatCurrency(channel.estimatedCommission, currency)}
                      </td>

                      {/* Net */}
                      <td style={{ textAlign: 'right', padding: '12px 16px', fontWeight: 700, color: channel.netPayout > 0 ? 'var(--color-success)' : 'inherit' }}>
                        {formatCurrency(channel.netPayout, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'var(--color-bg-secondary)', fontWeight: 700, borderTop: '2px solid var(--color-separator)' }}>
                    <td style={{ padding: '12px 16px' }}>Total ({channelMetrics.filter(c => c.isEnabled).length} active)</td>
                    <td style={{ textAlign: 'center', padding: '12px 16px' }}>—</td>
                    <td style={{ textAlign: 'right', padding: '12px 16px' }}>{totalOrdersAll}</td>
                    <td style={{ textAlign: 'right', padding: '12px 16px' }}>{formatCurrency(totalGrossAll, currency)}</td>
                    <td style={{ textAlign: 'right', padding: '12px 16px' }}>—</td>
                    <td style={{ textAlign: 'right', padding: '12px 16px', color: totalCommissionAll > 0 ? '#ff9500' : 'inherit' }}>
                      -{formatCurrency(totalCommissionAll, currency)}
                    </td>
                    <td style={{ textAlign: 'right', padding: '12px 16px', color: totalNetAll > 0 ? 'var(--color-success)' : 'inherit' }}>
                      {formatCurrency(totalNetAll, currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab (Admin only) */}
      {activeTab === 'settings' && isUserAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 840 }}>
          
          {/* General Controls card */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', borderRadius: 'var(--radius-lg, 16px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
              <div>
                <h3 className="text-title3" style={{ margin: 0 }}>Auto-Accept Orders</h3>
                <p className="text-secondary text-caption1" style={{ margin: '4px 0 0' }}>
                  Automatically accept delivery orders and send them straight to the kitchen (KDS) without manual cashier confirmation.
                </p>
              </div>
              <ToggleSwitch
                id="auto-accept-toggle"
                checked={autoAccept}
                onChange={e => setAutoAccept(e.target.checked)}
                size="md"
              />
            </div>
          </div>

          {/* Commissions rates card */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', borderRadius: 'var(--radius-lg, 16px)' }}>
            <div>
              <h3 className="text-title3" style={{ margin: 0 }}>Platform Commission Rates (%)</h3>
              <p className="text-secondary text-caption1" style={{ margin: '4px 0 0' }}>
                Set the agreed commission percentage for each delivery partner to calculate accurate net payouts.
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)' }}>
              {Object.entries(PLATFORM_META).map(([id, meta]) => {
                const isEnabled = isPlatformEnabled(id);
                return (
                  <div
                    key={id}
                    style={{
                      padding: '12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-separator-opaque)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      opacity: isEnabled ? 1 : 0.6
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <PlatformBrandLogo id={id} size={22} />
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>{meta.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input 
                        type="number" 
                        min="0"
                        max="100"
                        step="0.5"
                        disabled={!isEnabled}
                        className="form-input" 
                        value={commissions[id] ?? 0}
                        onChange={e => setCommissions(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 0 }))}
                        style={{ height: 36, fontSize: '13px', fontWeight: 600 }}
                      />
                      <span style={{ fontWeight: 700, color: 'var(--color-label-secondary)' }}>%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Busy Hours schedule scheduler card */}
          <div className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', borderRadius: 'var(--radius-lg, 16px)' }}>
            <div>
              <h3 className="text-title3" style={{ margin: 0 }}>⏰ Recurring Busy Hours Scheduler</h3>
              <p className="text-secondary text-caption1" style={{ margin: '4px 0 0' }}>
                Define recurring peak hours during which delivery aggregator channels will automatically pause to prevent kitchen overload.
              </p>
            </div>

            {/* List current rules */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
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
                      padding: '8px 12px', 
                      background: 'var(--color-bg-secondary)', 
                      borderRadius: 'var(--radius-md)',
                      borderLeft: '4px solid var(--color-accent)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', fontSize: '13px' }}>
                      <span style={{ fontWeight: 600 }}>{dayLabel}</span>
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
                  No automated busy hours scheduled. Channels remain active during all operating hours.
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
              padding: '12px', 
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-separator-opaque)'
            }}>
              <div className="form-group" style={{ flex: 1, minWidth: 150 }}>
                <label className="form-label" style={{ fontSize: 'var(--text-caption2)' }}>Select Day</label>
                <select 
                  className="form-select"
                  value={newBusyRule.day}
                  onChange={e => setNewBusyRule(prev => ({ ...prev, day: e.target.value }))}
                  style={{ height: 38, fontSize: '12px' }}
                >
                  {DAYS_OF_WEEK.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>

              <div className="form-group" style={{ minWidth: 110 }}>
                <label className="form-label" style={{ fontSize: 'var(--text-caption2)' }}>Start Time</label>
                <input 
                  type="time" 
                  className="form-input" 
                  value={newBusyRule.start}
                  onChange={e => setNewBusyRule(prev => ({ ...prev, start: e.target.value }))}
                  style={{ height: 38, fontSize: '12px' }}
                />
              </div>

              <div className="form-group" style={{ minWidth: 110 }}>
                <label className="form-label" style={{ fontSize: 'var(--text-caption2)' }}>End Time</label>
                <input 
                  type="time" 
                  className="form-input" 
                  value={newBusyRule.end}
                  onChange={e => setNewBusyRule(prev => ({ ...prev, end: e.target.value }))}
                  style={{ height: 38, fontSize: '12px' }}
                />
              </div>

              <button 
                type="button"
                className="btn btn-primary"
                onClick={handleAddBusyRule}
                style={{ height: 38, fontSize: '12px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Plus size={15} /> Add Window
              </button>
            </div>
          </div>

          {/* Action trigger footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleSaveSettings} 
              disabled={savingSettings}
              style={{ padding: '0 var(--space-6)', height: 42, fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Check size={16} /> {savingSettings ? 'Saving...' : 'Save Settings'}
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
                <PlatformBrandLogo id={configModal.platformId} size={48} />
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

