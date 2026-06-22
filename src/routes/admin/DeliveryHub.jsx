import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { collection, onSnapshot, doc, setDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatCurrency } from '../../utils/formatCurrency';
import { 
  Truck, RefreshCw, AlertCircle, CheckCircle2, 
  ShoppingBag, DollarSign, Percent, Clock, Plus, 
  Trash2, ChevronDown, ChevronUp, Check, X, Sliders 
} from 'lucide-react';
import toast from 'react-hot-toast';

const PLATFORM_META = {
  ubereats: { name: 'Uber Eats', emoji: '🚗', color: '#000000', bg: '#f5f5f5' },
  zomato:   { name: 'Zomato',    emoji: '🍕', color: '#000000', bg: '#f5f5f5' },
  swiggy:   { name: 'Swiggy',    emoji: '🟠', color: '#000000', bg: '#f5f5f5' },
  deliveroo:{ name: 'Deliveroo', emoji: '🦘', color: '#000000', bg: '#f5f5f5' },
};

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
  const { restaurant, staffDoc } = useAuthStore();
  const { categories } = useMenuStore();
  
  // Auth details
  const role = staffDoc?.role ?? 'cashier';
  const isUserAdmin = ['admin', 'super_admin'].includes(role);
  const currency = restaurant?.currency ?? 'INR';

  // Tabs
  const [activeTab, setActiveTab] = useState('partners'); // 'partners', 'categories', 'settings'

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

  // Pause Modal state
  const [pauseModal, setPauseModal] = useState({
    isOpen: false,
    platformId: null,
    duration: '30', // '30', '60', '120', 'custom', 'manual'
    customDuration: '',
    reason: ''
  });

  // Local settings edit state (Admin only)
  const [autoAccept, setAutoAccept] = useState(false);
  const [commissions, setCommissions] = useState({ ubereats: 20, zomato: 18, swiggy: 18, deliveroo: 20 });
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
        setCommissions({
          ubereats: data.deliverySettings?.commissions?.ubereats ?? 20,
          zomato: data.deliverySettings?.commissions?.zomato ?? 18,
          swiggy: data.deliverySettings?.commissions?.swiggy ?? 18,
          deliveroo: data.deliverySettings?.commissions?.deliveroo ?? 20
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

    const platforms = ['ubereats', 'zomato', 'swiggy', 'deliveroo'];
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
      for (const platformId of ['ubereats', 'zomato', 'swiggy', 'deliveroo']) {
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
          
          for (const platformId of ['ubereats', 'zomato', 'swiggy', 'deliveroo']) {
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
          commissions,
          busyHours
        }
      }, { merge: true });
      
      // Sync auth state locally
      const updatedRestObj = {
        ...restaurant,
        deliverySettings: {
          autoAccept,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div>
          <h2 className="text-title2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={24} style={{ color: 'var(--color-accent)' }} /> Delivery Hub
          </h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            Manage delivery channels, pause partners, toggle categories, and schedule busy hours.
          </p>
        </div>
        
        {/* Global actions visible based on role */}
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {isUserAdmin && (
            <button 
              className="btn btn-secondary" 
              onClick={() => triggerSync()} 
              disabled={syncing || syncingPlatform !== null || enabledCount === 0}
            >
              <RefreshCw size={16} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing...' : 'Sync All Menus'}
            </button>
          )}
        </div>
      </div>

      {/* Tabs list */}
      <div style={{ display: 'flex', gap: 'var(--space-1)', borderBottom: '1px solid var(--color-separator)', paddingBottom: 0 }}>
        <button 
          className={`btn`} 
          onClick={() => setActiveTab('partners')}
          style={{
            borderBottom: activeTab === 'partners' ? '2px solid var(--color-accent)' : 'none',
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            background: activeTab === 'partners' ? 'var(--color-accent-light)' : 'transparent',
            color: activeTab === 'partners' ? 'var(--color-accent)' : 'var(--color-label-secondary)',
            fontWeight: activeTab === 'partners' ? 'var(--weight-semibold)' : 'var(--weight-normal)',
            padding: 'var(--space-3) var(--space-4)',
          }}
        >
          🤝 Live Channels
        </button>
        <button 
          className={`btn`} 
          onClick={() => setActiveTab('categories')}
          style={{
            borderBottom: activeTab === 'categories' ? '2px solid var(--color-accent)' : 'none',
            borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
            background: activeTab === 'categories' ? 'var(--color-accent-light)' : 'transparent',
            color: activeTab === 'categories' ? 'var(--color-accent)' : 'var(--color-label-secondary)',
            fontWeight: activeTab === 'categories' ? 'var(--weight-semibold)' : 'var(--weight-normal)',
            padding: 'var(--space-3) var(--space-4)',
          }}
        >
          🗂️ Menu Controls
        </button>
        {isUserAdmin && (
          <button 
            className={`btn`} 
            onClick={() => setActiveTab('settings')}
            style={{
              borderBottom: activeTab === 'settings' ? '2px solid var(--color-accent)' : 'none',
              borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
              background: activeTab === 'settings' ? 'var(--color-accent-light)' : 'transparent',
              color: activeTab === 'settings' ? 'var(--color-accent)' : 'var(--color-label-secondary)',
              fontWeight: activeTab === 'settings' ? 'var(--weight-semibold)' : 'var(--weight-normal)',
              padding: 'var(--space-3) var(--space-4)',
            }}
          >
            ⚙️ Hub Settings
          </button>
        )}
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
                    border: isEnabled ? '1px solid var(--color-separator-opaque)' : '1px dashed var(--color-separator)',
                    opacity: isEnabled ? 1 : 0.6
                  }}
                >
                  {/* Card Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                      <span style={{ fontSize: '1.8rem' }}>{meta.emoji}</span>
                      <div>
                        <h4 style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)' }}>{meta.name}</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
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
                      <button 
                        className="btn btn-secondary btn-sm"
                        onClick={() => triggerSync(id)}
                        disabled={syncing || syncingPlatform !== null}
                        style={{ padding: '4px 8px' }}
                      >
                        <RefreshCw size={12} className={isSyncingThis ? 'spin' : ''} /> Sync
                      </button>
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
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                          onClick={() => handleResumePlatform(id)}
                        >
                          <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} /> Resume Channel
                        </button>
                      ) : (
                        <button 
                          className="btn btn-secondary" 
                          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, borderColor: 'rgba(255, 149, 0, 0.4)' }}
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
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 60, color: 'var(--color-label-tertiary)', fontSize: 'var(--text-footnote)', textAlign: 'center', padding: '0 var(--space-4)' }}>
                      Inactive. Enable this platform in settings to begin receiving orders.
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

      {/* Categories Tab */}
      {activeTab === 'categories' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Menu Control Matrix</span>
            <p className="text-secondary text-caption1" style={{ marginTop: 2 }}>
              Enable/disable categories or individual items per delivery channel.
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
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
                {categories.map(category => {
                  const isExpanded = expandedCategories[category.id] === true;
                  const activePlatforms = Object.keys(PLATFORM_META).filter(isPlatformEnabled);
                  
                  // Calculate if this category is enabled anywhere
                  const enabledOnAny = activePlatforms.some(platformId => isCategoryEnabled(platformId, category.id));

                  return (
                    <>
                      {/* Category row */}
                      <tr 
                        key={category.id} 
                        style={{ 
                          borderBottom: '1px solid var(--color-separator)', 
                          background: 'rgba(var(--color-accent-rgb), 0.02)',
                          fontWeight: 'var(--weight-semibold)'
                        }}
                      >
                        {/* Expand/Collapse arrow */}
                        <td style={{ padding: 'var(--space-4) var(--space-5)', textAlign: 'center' }}>
                          <button 
                            className="btn btn-ghost" 
                            style={{ padding: 4, display: 'flex', alignItems: 'center' }}
                            onClick={() => toggleExpandCategory(category.id)}
                          >
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        </td>

                        {/* Category identity */}
                        <td style={{ padding: 'var(--space-4) var(--space-5)' }}>
                          <span style={{ fontSize: '1.2rem', marginRight: 8 }}>{category.emoji}</span>
                          <span>{category.name}</span>
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
                                  width: 18, height: 18,
                                  accentColor: 'var(--color-accent)',
                                  opacity: isEnabled ? 1 : 0.2
                                }}
                              />
                            </td>
                          );
                        })}

                        {/* Bulk Action Column */}
                        <td style={{ textAlign: 'center', padding: 'var(--space-4) var(--space-5)' }}>
                          {enabledOnAny ? (
                            <button 
                              className="btn btn-secondary btn-sm"
                              style={{ color: 'var(--color-red)', borderColor: 'rgba(255, 59, 48, 0.2)', padding: '2px 8px', fontSize: 'var(--text-caption2)' }}
                              onClick={() => toggleCategoryAllPlatforms(category.id, false)}
                              disabled={activePlatforms.length === 0}
                            >
                              Pause All
                            </button>
                          ) : (
                            <button 
                              className="btn btn-secondary btn-sm"
                              style={{ color: 'var(--color-success)', borderColor: 'rgba(52, 199, 89, 0.2)', padding: '2px 8px', fontSize: 'var(--text-caption2)' }}
                              onClick={() => toggleCategoryAllPlatforms(category.id, true)}
                              disabled={activePlatforms.length === 0}
                            >
                              Enable All
                            </button>
                          )}
                        </td>
                      </tr>

                      {/* Expandable items sub-table */}
                      {isExpanded && (category.items ?? []).map(item => (
                        <tr 
                          key={item.id} 
                          style={{ 
                            borderBottom: '1px solid var(--color-separator-opaque)',
                            background: 'var(--color-bg)'
                          }}
                        >
                          <td></td>
                          {/* Item identity */}
                          <td style={{ padding: 'var(--space-3) var(--space-5)', paddingLeft: 'var(--space-8)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                              <span style={{ fontSize: '1rem' }}>{item.emoji}</span>
                              <div>
                                <span>{item.name}</span>
                                <span style={{ color: 'var(--color-label-secondary)', fontSize: 'var(--text-caption2)', marginLeft: 8 }}>
                                  ({formatCurrency(item.price, currency)})
                                </span>
                                {!item.available && (
                                  <span className="badge badge-gray" style={{ marginLeft: 8, fontSize: '0.65rem', padding: '1px 4px' }}>
                                    POS Off
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

                            // Active checkbox rules:
                            // Checkbox is checked if the platform is enabled, the category is enabled, and the item itself is enabled.
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
                                      width: 15, height: 15,
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
                          <td></td>
                        </tr>
                      ))}

                      {isExpanded && (category.items ?? []).length === 0 && (
                        <tr style={{ background: 'var(--color-bg)' }}>
                          <td></td>
                          <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-4)', color: 'var(--color-label-tertiary)', fontSize: 'var(--text-footnote)' }}>
                            No items found in this category.
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
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

      {/* Pause Modal Overlay */}
      {pauseModal.isOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(2px)'
        }}>
          <div className="card card-padded" style={{ width: 400, display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', boxShadow: 'var(--shadow-2xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="text-title3" style={{ margin: 0 }}>⏸️ Pause {PLATFORM_META[pauseModal.platformId]?.name}</h3>
              <button 
                className="btn btn-ghost" 
                style={{ padding: 4 }}
                onClick={() => setPauseModal(prev => ({ ...prev, isOpen: false }))}
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="form-group">
              <label className="form-label">Pause Duration</label>
              <select 
                className="form-select"
                value={pauseModal.duration}
                onChange={e => setPauseModal(prev => ({ ...prev, duration: e.target.value }))}
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
                <label className="form-label">Duration in Minutes</label>
                <input 
                  type="number"
                  min="1"
                  className="form-input"
                  placeholder="e.g. 45"
                  value={pauseModal.customDuration}
                  onChange={e => setPauseModal(prev => ({ ...prev, customDuration: e.target.value }))}
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Reason for Pausing</label>
              <input 
                type="text"
                className="form-input"
                placeholder="e.g., Kitchen full, rush hour, staffing shortage"
                value={pauseModal.reason}
                onChange={e => setPauseModal(prev => ({ ...prev, reason: e.target.value }))}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setPauseModal(prev => ({ ...prev, isOpen: false }))}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handlePausePlatformSubmit}
                style={{ background: 'var(--color-red)', borderColor: 'var(--color-red)' }}
              >
                Confirm Pause
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

