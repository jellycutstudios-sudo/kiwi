import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useKdsStore } from '../stores/kdsStore';
import { useTokenStore } from '../stores/tokenStore';
import toast from 'react-hot-toast';
import { 
  ChefHat, 
  Clock, 
  AlertTriangle, 
  Flame, 
  RotateCcw, 
  Maximize2, 
  Minimize2, 
  Volume2, 
  VolumeX, 
  Check, 
  Timer,
  Printer,
  Sun,
  CheckCircle2,
  ArrowUpDown,
  Zap,
  Keyboard,
  X
} from 'lucide-react';
import { printSingleKitchenTicket } from '../utils/print';
import { useWakeLock } from '../hooks/useWakeLock';
import { getKitchenStations } from '../utils/stations';
import { getOrderTimestampMs, getOrderElapsedSeconds, formatOrderStopwatch } from '../utils/timezoneUtils';
import { getActiveModes } from '../hooks/useBusinessConfig';

// Pleasant Web Audio synthesizer for kitchen notifications
function playKitchenChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch {
    // Ignore audio context block if user hasn't interacted
  }
}

export default function KDS() {
  const restaurant = useAuthStore(s => s.restaurant);
  const modes = useMemo(() => getActiveModes(restaurant), [restaurant]);
  const activeOrders = useOrderStore(s => s.activeOrders);
  const { updateKDSItemStatus, updateKDSStationStatus } = useKdsStore();
  const { callSpecificToken } = useTokenStore();
  
  const [activeStation, setActiveStation] = useState('All');
  const [viewTab, setViewTab] = useState('active'); // 'active' | 'recent'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showBumpBarHelp, setShowBumpBarHelp] = useState(false);
  const { isLocked: isWakeLocked, isSupported: isWakeSupported } = useWakeLock(true);
  
  // Kitchen display card sort order: 'oldest' (FIFO standard) | 'newest' (LIFO) | 'urgency' (Rush)
  const [kdsSortOrder, setKdsSortOrder] = useState(() => {
    try {
      return localStorage.getItem('dineos_kds_sort_order') || 'oldest';
    } catch {
      return 'oldest';
    }
  });

  const handleSortOrderChange = useCallback((order) => {
    setKdsSortOrder(order);
    try {
      localStorage.setItem('dineos_kds_sort_order', order);
    } catch {}
  }, []);
  
  const prevCountRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const stationsList = useMemo(() => {
    const configured = getKitchenStations(restaurant);
    const orderStations = new Set();
    activeOrders.forEach(o => {
      (o.items || []).forEach(i => {
        if (i.station && i.station !== 'All') {
          orderStations.add(i.station);
        }
      });
    });
    const combined = ['All', ...configured];
    orderStations.forEach(st => {
      if (!combined.some(s => s.toLowerCase() === st.toLowerCase())) {
        combined.push(st);
      }
    });
    return combined;
  }, [restaurant, activeOrders]);

  useEffect(() => {
    if (activeStation !== 'All' && !stationsList.some(s => s.toLowerCase() === activeStation.toLowerCase())) {
      setActiveStation('All');
    }
  }, [stationsList, activeStation]);

  // 1-second interval for real-time kitchen stopwatches & digital clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen for browser fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }, []);

  const handleCallToken = async (tokenNumber) => {
    if (!restaurant?.id) return;
    try {
      await callSpecificToken(restaurant.id, tokenNumber);
      toast.success(`Calling Token #${tokenNumber}!`, { icon: '📢' });
    } catch {
      toast.error("Failed to call token");
    }
  };

  const kdsOrders = useMemo(() => {
    const list = activeOrders
      .filter(o => ['pending', 'preparing'].includes(o.status))
      .filter(o => {
        if (activeStation === 'All') {
          return o.items?.some(i => i.status !== 'ready' && i.prepState !== 'hold');
        }
        return o.items?.some(i => i.station === activeStation && i.status !== 'ready' && i.prepState !== 'hold');
      });

    return list.slice().sort((a, b) => {
      const timeA = getOrderTimestampMs(a) || 0;
      const timeB = getOrderTimestampMs(b) || 0;

      if (kdsSortOrder === 'newest') {
        // Most recent ticket first (LIFO)
        return timeB - timeA;
      }

      if (kdsSortOrder === 'urgency') {
        // 1. Manually flagged Rush tickets first
        const isRushA = a.priority === 'rush' || a.isRush || a.rush ? 1 : 0;
        const isRushB = b.priority === 'rush' || b.isRush || b.rush ? 1 : 0;
        if (isRushB !== isRushA) return isRushB - isRushA;

        // 2. Highest elapsed wait time next
        const elapsedA = getOrderElapsedSeconds(a, currentTime);
        const elapsedB = getOrderElapsedSeconds(b, currentTime);
        if (elapsedB !== elapsedA) {
          return elapsedB - elapsedA;
        }
        return timeA - timeB;
      }

      // Default: 'oldest' (FIFO standard kitchen queue - oldest orders at top-left)
      return timeA - timeB;
    });
  }, [activeOrders, activeStation, kdsSortOrder, currentTime]);

  const recentReadyOrders = useMemo(() => {
    return activeOrders
      .filter(o => {
        if (o.status !== 'ready') return false;
        const createdAtMs = getOrderTimestampMs(o);
        if (!createdAtMs) return true;
        return (currentTime - createdAtMs) <= 30 * 60 * 1000;
      })
      .slice()
      .sort((a, b) => {
        const timeA = getOrderTimestampMs(a) || 0;
        const timeB = getOrderTimestampMs(b) || 0;
        return timeB - timeA;
      });
  }, [activeOrders, currentTime]);

  const handleRecallOrder = useCallback(async (order) => {
    try {
      await updateKDSStationStatus(restaurant.id, order, 'All', 'preparing');
      toast.success(`Recalled order to kitchen!`, { icon: '↩️' });
    } catch (err) {
      toast.error('Failed to recall order: ' + err.message);
    }
  }, [restaurant?.id, updateKDSStationStatus]);

  const orderCount = kdsOrders.length;

  useEffect(() => {
    const prev = prevCountRef.current;
    if (orderCount > prev && prev > 0) {
      if (soundEnabled) {
        playKitchenChime();
        toast('New kitchen ticket received!', { icon: '🔔' });
      }
    }
    prevCountRef.current = orderCount;
  }, [orderCount, soundEnabled]);

  const getStationOrderCount = (station) => {
    if (station === 'All') {
      return activeOrders
        .filter(o => ['pending', 'preparing'].includes(o.status))
        .filter(o => o.items?.some(i => i.status !== 'ready' && i.prepState !== 'hold')).length;
    }
    return activeOrders
      .filter(o => ['pending', 'preparing'].includes(o.status))
      .filter(o => o.items?.some(i => i.station === station && i.status !== 'ready' && i.prepState !== 'hold')).length;
  };

  const handleStartPreparing = async (order, station) => {
    await updateKDSStationStatus(restaurant.id, order, station, 'preparing');
    toast('Station preparation started...', { icon: '🍳' });
  };

  const handleMarkReady = useCallback(async (order, station) => {
    await updateKDSStationStatus(restaurant.id, order, station, 'ready');
    toast.success('Station items marked as ready!', { icon: '✅' });

    if (station === 'All' && order.token && modes.includes('token')) {
      try {
        await callSpecificToken(restaurant.id, order.token);
        toast.success(`Auto-called Token #${order.token} on TV display!`, { icon: '📢' });
      } catch (err) {
        console.error("Auto-call failed", err);
      }
    }
  }, [restaurant?.id, modes, updateKDSStationStatus, callSpecificToken]);

  // ── Commercial Hardware Bump Bar & Keyboard Shortcuts ──
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in text inputs or dialogs
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
        return;
      }

      // Keys '1' to '9': Bump ticket at position 1..9
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key, 10) - 1;
        const targetOrder = kdsOrders[index];
        if (targetOrder) {
          e.preventDefault();
          handleMarkReady(targetOrder, activeStation);
          const identifier = (modes.includes('token') && targetOrder.token) ? targetOrder.token : targetOrder.id.slice(-4);
          toast.success(`Bumped Ticket #${identifier} via Bump Bar [${e.key}]!`, { icon: '⚡' });
        }
        return;
      }

      // Spacebar or Enter: Bump oldest/first ticket (FIFO)
      if (e.key === ' ' || e.key === 'Enter') {
        if (kdsOrders.length > 0) {
          e.preventDefault();
          const oldestOrder = kdsOrders[0];
          handleMarkReady(oldestOrder, activeStation);
          const identifier = (modes.includes('token') && oldestOrder.token) ? oldestOrder.token : oldestOrder.id.slice(-4);
          toast.success(`Bumped Ticket #${identifier} Ready!`, { icon: '⚡' });
        }
        return;
      }

      // 'R' or 'r': Recall the last plated order back to kitchen
      if (e.key === 'r' || e.key === 'R') {
        if (recentReadyOrders.length > 0) {
          e.preventDefault();
          const lastReady = recentReadyOrders[0];
          handleRecallOrder(lastReady);
        }
        return;
      }

      // 'F' or 'f': Fullscreen toggle
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }

      // 'M' or 'm': Mute / Unmute audio chime
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        setSoundEnabled(prev => !prev);
        return;
      }

      // 'S' or 's': Cycle Sort Mode
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        const nextSort = kdsSortOrder === 'oldest' ? 'newest' : (kdsSortOrder === 'newest' ? 'urgency' : 'oldest');
        handleSortOrderChange(nextSort);
        toast(`Sort: ${nextSort.toUpperCase()}`, { icon: '🔀' });
        return;
      }

      // ArrowLeft / ArrowRight: Switch Station Filter
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const currentIdx = stationsList.indexOf(activeStation);
        if (currentIdx >= 0) {
          const nextIdx = e.key === 'ArrowRight'
            ? (currentIdx + 1) % stationsList.length
            : (currentIdx - 1 + stationsList.length) % stationsList.length;
          setActiveStation(stationsList[nextIdx]);
        }
        return;
      }

      // '?' or 'h' / 'H': Toggle bump bar shortcuts help modal
      if (e.key === '?' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setShowBumpBarHelp(prev => !prev);
        return;
      }

      // Escape: Close help modal if open
      if (e.key === 'Escape') {
        setShowBumpBarHelp(false);
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [kdsOrders, recentReadyOrders, activeStation, stationsList, kdsSortOrder, handleSortOrderChange, toggleFullscreen, handleMarkReady, handleRecallOrder, modes]);

  const cycleItemStatus = async (order, itemIndex, currentStatus) => {
    let nextStatus = 'pending';
    if (currentStatus === 'pending') nextStatus = 'preparing';
    else if (currentStatus === 'preparing') nextStatus = 'ready';
    else if (currentStatus === 'ready') nextStatus = 'pending';
    
    await updateKDSItemStatus(restaurant.id, order, itemIndex, nextStatus);
  };

  // Helper for live stopwatch and urgency levels
  const getElapsedSeconds = useCallback((orderOrCreatedAt) => {
    return getOrderElapsedSeconds(orderOrCreatedAt, currentTime);
  }, [currentTime]);

  const getStopwatch = useCallback((orderOrCreatedAt) => {
    return formatOrderStopwatch(orderOrCreatedAt, currentTime);
  }, [currentTime]);

  const getUrgency = useCallback((orderOrCreatedAt) => {
    const mins = Math.floor(getElapsedSeconds(orderOrCreatedAt) / 60);
    if (mins < 10) {
      return {
        type: 'normal',
        label: 'FRESH',
        color: '#10b981',
        bannerBg: 'linear-gradient(90deg, #065f46 0%, #047857 100%)',
        badgeBg: 'rgba(16, 185, 129, 0.25)',
        badgeColor: '#34d399',
        borderClass: 'status-normal'
      };
    }
    if (mins < 20) {
      return {
        type: 'delayed',
        label: 'DELAYED',
        color: '#f59e0b',
        bannerBg: 'linear-gradient(90deg, #92400e 0%, #b45309 100%)',
        badgeBg: 'rgba(245, 158, 11, 0.25)',
        badgeColor: '#fbbf24',
        borderClass: 'status-delayed'
      };
    }
    return {
      type: 'late',
      label: 'RUSH',
      color: '#ef4444',
      bannerBg: 'linear-gradient(90deg, #991b1b 0%, #b91c1c 100%)',
      badgeBg: 'rgba(239, 68, 68, 0.35)',
      badgeColor: '#f87171',
      borderClass: 'status-late'
    };
  }, [getElapsedSeconds]);

  // Kitchen performance metrics
  const kitchenMetrics = useMemo(() => {
    if (kdsOrders.length === 0) return { avgWaitMins: 0, maxWaitMins: 0 };
    let totalMins = 0;
    let maxMins = 0;
    kdsOrders.forEach(o => {
      const mins = Math.floor(getElapsedSeconds(o) / 60);
      totalMins += mins;
      if (mins > maxMins) maxMins = mins;
    });
    return {
      avgWaitMins: Math.round(totalMins / kdsOrders.length),
      maxWaitMins: maxMins
    };
  }, [kdsOrders, getElapsedSeconds]);

  return (
    <div className="kds-layout">
      {/* ── High-Visibility Kitchen Header ── */}
      <div className="kds-header">
        {/* Tier 1: Brand / Title + Queue Status + Utility Tools Cluster */}
        <div className="kds-header-tier1" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          {/* Brand & Kitchen Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 'var(--radius-md)',
              background: 'linear-gradient(135deg, rgba(245,158,11,0.2) 0%, rgba(217,119,6,0.2) 100%)',
              border: '1px solid rgba(245,158,11,0.35)',
              color: 'var(--color-yellow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <ChefHat size={22} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 className="kds-title" style={{ margin: 0, fontSize: '17px', fontWeight: 800, letterSpacing: '-0.01em', color: 'var(--color-label)' }}>
                  {restaurant?.name ? `${restaurant.name} Kitchen` : 'Kitchen Display'}
                </h2>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  fontSize: '11px',
                  fontWeight: 700,
                  background: kdsOrders.length > 0 ? 'rgba(245, 158, 11, 0.16)' : 'rgba(16, 185, 129, 0.12)',
                  color: kdsOrders.length > 0 ? 'var(--color-yellow)' : 'var(--color-green)',
                  border: kdsOrders.length > 0 ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(16, 185, 129, 0.25)'
                }}>
                  <span style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: kdsOrders.length > 0 ? 'var(--color-yellow)' : 'var(--color-green)',
                    boxShadow: kdsOrders.length > 0 ? '0 0 6px var(--color-yellow)' : '0 0 6px var(--color-green)'
                  }} />
                  {kdsOrders.length > 0 ? `${kdsOrders.length} In Queue` : 'Queue Clear'}
                </span>
              </div>
              <p className="text-caption1 text-secondary" style={{ margin: 0, marginTop: 2 }}>
                Real-time line production & kitchen bump bar
              </p>
            </div>
          </div>

          {/* Utility Toolbar: Sound, Wake Lock, Fullscreen, Clock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Audio Chime Button */}
            <button
              type="button"
              onClick={() => {
                const nextState = !soundEnabled;
                setSoundEnabled(nextState);
                if (nextState) {
                  playKitchenChime();
                  toast.success('Kitchen sound chime enabled', { icon: '🔔' });
                } else {
                  toast('Kitchen sound muted', { icon: '🔕' });
                }
              }}
              title={soundEnabled ? 'Chime sound is ON (Tap to mute)' : 'Chime sound is MUTED (Tap to enable)'}
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                background: soundEnabled ? 'rgba(16, 185, 129, 0.12)' : 'var(--color-bg)',
                border: soundEnabled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--color-separator-opaque)',
                color: soundEnabled ? 'var(--color-green)' : 'var(--color-label-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>

            {/* Screen Wake Lock Indicator */}
            {isWakeSupported && (
              <div
                title={isWakeLocked ? 'Screen Wake Lock Active: Display will stay awake' : 'Screen Wake Lock Inactive'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '0 10px',
                  height: 36,
                  borderRadius: 'var(--radius-md)',
                  background: isWakeLocked ? 'rgba(16, 185, 129, 0.12)' : 'var(--color-bg)',
                  border: isWakeLocked ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--color-separator-opaque)',
                  color: isWakeLocked ? 'var(--color-green)' : 'var(--color-label-secondary)',
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                <Sun size={14} className={isWakeLocked ? 'animate-pulse' : ''} />
                <span className="desktop-only">{isWakeLocked ? 'Awake' : 'Sleep OK'}</span>
              </div>
            )}

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)'}
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-separator-opaque)',
                color: 'var(--color-label)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>

            {/* Bump Bar / Keyboard Shortcuts Guide */}
            <button
              type="button"
              onClick={() => setShowBumpBarHelp(prev => !prev)}
              title="Bump Bar & Kitchen Keyboard Shortcuts (?)"
              style={{
                height: 36,
                padding: '0 10px',
                borderRadius: 'var(--radius-md)',
                background: showBumpBarHelp ? 'var(--color-accent)' : 'var(--color-bg)',
                border: showBumpBarHelp ? '1px solid var(--color-accent)' : '1px solid var(--color-separator-opaque)',
                color: showBumpBarHelp ? '#ffffff' : 'var(--color-label)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                transition: 'all 0.15s ease'
              }}
            >
              <Keyboard size={15} />
              <span className="desktop-only">Bump Bar</span>
            </button>

            {/* Digital Clock */}
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              fontWeight: 800,
              color: 'var(--color-label)',
              background: 'var(--color-bg)',
              padding: '0 12px',
              height: 36,
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-separator-opaque)',
              letterSpacing: '0.04em'
            }}>
              {new Date(currentTime).toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Tier 2: View Switcher (Active vs Ready) + Kitchen Health HUD Metrics */}
        <div className="kds-header-tier2" style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          borderTop: '1px solid var(--color-separator-opaque)',
          paddingTop: '10px'
        }}>
          {/* Left Controls Cluster: Active vs Ready Tabs + Sort Order Control */}
          <div className="kds-tier2-left">
            {/* Active vs Ready Tabs */}
            <div style={{
              display: 'inline-flex',
              background: 'var(--color-bg)',
              padding: '3px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-separator-opaque)'
            }}>
              <button
                type="button"
                onClick={() => setViewTab('active')}
                style={{
                  background: viewTab === 'active' ? 'var(--color-bg-elevated)' : 'transparent',
                  color: viewTab === 'active' ? 'var(--color-label)' : 'var(--color-label-secondary)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  fontWeight: viewTab === 'active' ? 700 : 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: viewTab === 'active' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Active Queue</span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: '9999px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  background: kdsOrders.length > 0 ? 'var(--color-yellow)' : 'var(--color-fill)',
                  color: kdsOrders.length > 0 ? '#000000' : 'var(--color-label-secondary)'
                }}>
                  {kdsOrders.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewTab('recent')}
                style={{
                  background: viewTab === 'recent' ? 'var(--color-bg-elevated)' : 'transparent',
                  color: viewTab === 'recent' ? 'var(--color-label)' : 'var(--color-label-secondary)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 14px',
                  fontSize: '12.5px',
                  fontWeight: viewTab === 'recent' ? 700 : 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  boxShadow: viewTab === 'recent' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Plated & Ready</span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: '9999px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  background: 'var(--color-fill)',
                  color: 'var(--color-label-secondary)'
                }}>
                  {recentReadyOrders.length}
                </span>
              </button>
            </div>

            {/* Sort Order Selector (Oldest FIFO / Newest LIFO / Urgency Rush) */}
            {viewTab === 'active' && (
              <div className="kds-sort-control" style={{
                display: 'inline-flex',
                alignItems: 'center',
                background: 'var(--color-bg)',
                padding: '3px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-separator-opaque)'
              }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-label-tertiary)',
                  padding: '0 4px 0 7px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3
                }}>
                  <ArrowUpDown size={12} />
                  <span className="desktop-only">Sort:</span>
                </span>

                <button
                  type="button"
                  onClick={() => handleSortOrderChange('oldest')}
                  title="Oldest First (FIFO) - Kitchen standard: tickets waiting longest appear first"
                  style={{
                    background: kdsSortOrder === 'oldest' ? 'var(--color-bg-elevated)' : 'transparent',
                    color: kdsSortOrder === 'oldest' ? 'var(--color-label)' : 'var(--color-label-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '5px 9px',
                    fontSize: '11.5px',
                    fontWeight: kdsSortOrder === 'oldest' ? 700 : 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    boxShadow: kdsSortOrder === 'oldest' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Clock size={12} />
                  <span>Oldest <span className="desktop-only">(FIFO)</span></span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSortOrderChange('newest')}
                  title="Newest First (LIFO) - Recent tickets appear first"
                  style={{
                    background: kdsSortOrder === 'newest' ? 'var(--color-bg-elevated)' : 'transparent',
                    color: kdsSortOrder === 'newest' ? 'var(--color-label)' : 'var(--color-label-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '5px 9px',
                    fontSize: '11.5px',
                    fontWeight: kdsSortOrder === 'newest' ? 700 : 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    boxShadow: kdsSortOrder === 'newest' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Zap size={12} />
                  <span>Newest</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSortOrderChange('urgency')}
                  title="Urgency / Rush - Highest elapsed wait and rush orders first"
                  style={{
                    background: kdsSortOrder === 'urgency' ? 'var(--color-bg-elevated)' : 'transparent',
                    color: kdsSortOrder === 'urgency' ? 'var(--color-red)' : 'var(--color-label-secondary)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '5px 9px',
                    fontSize: '11.5px',
                    fontWeight: kdsSortOrder === 'urgency' ? 700 : 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    boxShadow: kdsSortOrder === 'urgency' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Flame size={12} color={kdsSortOrder === 'urgency' ? 'var(--color-red)' : 'inherit'} />
                  <span>Urgency</span>
                </button>
              </div>
            )}
          </div>

          {/* Mobile Sound Chime Quick Toggle */}
          <button
            type="button"
            className="kds-mobile-sound-btn"
            onClick={() => {
              const nextState = !soundEnabled;
              setSoundEnabled(nextState);
              if (nextState) {
                playKitchenChime();
                toast.success('Kitchen sound chime enabled', { icon: '🔔' });
              } else {
                toast('Kitchen sound muted', { icon: '🔕' });
              }
            }}
            title={soundEnabled ? 'Chime sound is ON (Tap to mute)' : 'Chime sound is MUTED (Tap to enable)'}
            style={{
              background: soundEnabled ? 'rgba(16, 185, 129, 0.12)' : 'var(--color-bg)',
              border: soundEnabled ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--color-separator-opaque)',
              color: soundEnabled ? 'var(--color-green)' : 'var(--color-label-tertiary)'
            }}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Kitchen Health HUD Chips (Desktop / Tablet) */}
          <div className="kds-metrics-hud" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg)',
              border: '1px solid var(--color-separator-opaque)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-label)'
            }}>
              <Timer size={14} color="var(--color-accent)" />
              <span style={{ color: 'var(--color-label-secondary)' }}>Avg:</span>
              <span style={{ fontWeight: 700 }}>{kitchenMetrics.avgWaitMins}m</span>
            </div>

            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              background: kitchenMetrics.maxWaitMins > 20 ? 'rgba(239, 68, 68, 0.12)' : 'var(--color-bg)',
              border: kitchenMetrics.maxWaitMins > 20 ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid var(--color-separator-opaque)',
              fontSize: '12px',
              fontWeight: 600,
              color: kitchenMetrics.maxWaitMins > 20 ? 'var(--color-red)' : 'var(--color-label)'
            }}>
              <Flame size={14} color={kitchenMetrics.maxWaitMins > 20 ? 'var(--color-red)' : 'var(--color-orange)'} />
              <span style={{ color: kitchenMetrics.maxWaitMins > 20 ? 'var(--color-red)' : 'var(--color-label-secondary)' }}>Max:</span>
              <span style={{ fontWeight: 700 }}>{kitchenMetrics.maxWaitMins}m</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Station Pills Filter ── */}
      <div className="kds-stations-bar no-scrollbar touch-scroll-x" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '16px',
        padding: '2px 0 6px 0'
      }}>
        {stationsList.map(station => {
          const count = getStationOrderCount(station);
          const isActive = activeStation === station;
          return (
            <button
              key={station}
              onClick={() => setActiveStation(station)}
              title={station === 'All' ? 'Show all orders from every station' : `Show only orders for the ${station} station`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                minHeight: 38,
                borderRadius: 'var(--radius-md)',
                fontSize: '12.5px',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
                background: isActive ? 'var(--color-accent)' : 'var(--color-bg-elevated)',
                color: isActive ? '#ffffff' : 'var(--color-label-secondary)',
                boxShadow: isActive ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
                border: isActive ? '1px solid var(--color-accent)' : '1px solid var(--color-separator-opaque)'
              }}
            >
              <span>{station}</span>
              {count > 0 && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 18,
                  height: 18,
                  padding: '0 5px',
                  borderRadius: '9999px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--color-fill)',
                  color: isActive ? '#ffffff' : 'var(--color-label)'
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grid Content */}
      {viewTab === 'recent' ? (
        recentReadyOrders.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '48px 20px',
            background: 'var(--color-bg-elevated)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-separator-opaque)',
            boxShadow: 'var(--shadow-xs)',
            minHeight: 320
          }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(59,130,246,0.12))',
              border: '1px solid rgba(16,185,129,0.25)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-green)',
              marginBottom: '16px',
              boxShadow: '0 6px 20px rgba(16,185,129,0.12)'
            }}>
              <CheckCircle2 size={26} />
            </div>

            <h3 className="text-title3" style={{ margin: 0, fontWeight: 700, color: 'var(--color-label)' }}>
              No Completed Orders Yet
            </h3>

            <p className="text-secondary text-subhead" style={{ maxWidth: 420, margin: '8px auto 20px auto', lineHeight: 1.5 }}>
              Tickets bumped or completed within the last 30 minutes will show up here for quick review or recall back to the queue.
            </p>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setViewTab('active')}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', minHeight: 36, borderRadius: 'var(--radius-md)' }}
            >
              <span>Return to Active Queue</span>
            </button>
          </div>
        ) : (
          <div className="kds-grid">
            {recentReadyOrders.map(order => (
              <div key={order.id} className="kds-order-card status-normal" id={`kds-recent-${order.id}`}>
                <div style={{
                  padding: '8px 14px',
                  background: 'linear-gradient(90deg, #059669 0%, #10b981 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: 12
                }}>
                  <span>✓ READY & PLATED</span>
                  <span>Completed</span>
                </div>
                <div className="kds-order-header">
                  <div>
                    <div className="kds-order-id" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {modes.includes('token') && order.token && (
                        <span style={{
                          background: 'var(--color-accent-light)',
                          color: 'var(--color-accent)',
                          padding: '2px 8px',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 800,
                          border: '1px solid var(--color-accent)'
                        }}>
                          Token #{order.token}
                        </span>
                      )}
                      <span>{order.tableName ? `Table ${order.tableName}` : (order.type === 'takeaway' ? '🛍️ Takeaway' : (order.type === 'online' ? '🌐 Online' : 'Dine-In'))}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginTop: 3 }}>
                      Order #{order.id.slice(-6).toUpperCase()}
                    </div>
                  </div>
                </div>
                <div className="kds-order-items">
                  {order.items?.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', padding: '6px 0', borderBottom: '1px solid var(--color-separator-opaque)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="kds-item-qty">×{item.qty}</span>
                        <span style={{ color: 'var(--color-label)', fontSize: 14, fontWeight: 600 }}>{item.name}</span>
                      </div>
                      {item.selectedModifiers && item.selectedModifiers.length > 0 && (() => {
                        const vm = item.selectedModifiers.filter(m => m.isVariantAxis);
                        const rm = item.selectedModifiers.filter(m => !m.isVariantAxis);
                        return (
                          <div style={{ paddingLeft: 36, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {vm.length > 0 && (
                              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                                {vm.map((m, i) => (
                                  <span key={i} style={{ background: i === 0 ? 'var(--color-yellow-light)' : 'var(--color-purple-light)', color: i === 0 ? 'var(--color-yellow)' : 'var(--color-purple)', border: `1.5px solid ${i === 0 ? 'var(--color-yellow)' : 'var(--color-purple)'}`, padding: '2px 8px', borderRadius: 5, fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                                    {m.modifierGroupName}: {m.name}
                                  </span>
                                ))}
                              </div>
                            )}
                            {rm.length > 0 && (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {rm.map((m, i) => (
                                  <span key={i} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator-opaque)', padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                                    {m.modifierGroupName ? `${m.modifierGroupName}: ${m.name}` : `+ ${m.name}`}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
                <div className="kds-order-action">
                  <button
                    onClick={() => handleRecallOrder(order)}
                    style={{
                      width: '100%',
                      padding: '10px',
                      fontSize: 13,
                      fontWeight: 800,
                      background: 'var(--color-yellow-light)',
                      color: 'var(--color-yellow)',
                      border: '1px solid var(--color-yellow)',
                      borderRadius: 10,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6
                    }}
                  >
                    <RotateCcw size={15} /> Recall to Kitchen Queue
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        kdsOrders.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: '48px 20px',
            background: 'var(--color-bg-elevated)',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--color-separator-opaque)',
            boxShadow: 'var(--shadow-xs)',
            minHeight: 320
          }}>
            <div style={{
              width: 60,
              height: 60,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(245,158,11,0.14), rgba(16,185,129,0.14))',
              border: '1px solid rgba(245,158,11,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-yellow)',
              marginBottom: '16px',
              boxShadow: '0 6px 20px rgba(245,158,11,0.12)'
            }}>
              <ChefHat size={26} strokeWidth={2.3} />
            </div>

            <h3 className="text-title3" style={{ margin: 0, fontWeight: 700, color: 'var(--color-label)' }}>
              Kitchen Queue Is All Clear!
            </h3>

            <p className="text-secondary text-subhead" style={{ maxWidth: 440, margin: '8px auto 20px auto', lineHeight: 1.5 }}>
              All tickets have been prepared and plated. Incoming food orders from POS, dining tables, and delivery channels will appear here with instant sound chimes.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  playKitchenChime();
                  toast.success('Chime tested! Sound volume is working.', { icon: '🔔' });
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', minHeight: 36, borderRadius: 'var(--radius-md)' }}
              >
                <Volume2 size={14} color="var(--color-accent)" />
                <span>Test Audio Chime</span>
              </button>

              {recentReadyOrders.length > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setViewTab('recent')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', minHeight: 36, borderRadius: 'var(--radius-md)' }}
                >
                  <Check size={14} />
                  <span>View Plated ({recentReadyOrders.length})</span>
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={toggleFullscreen}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', minHeight: 36, borderRadius: 'var(--radius-md)' }}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Display'}</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="kds-grid">
            {kdsOrders.map((order, orderIdx) => {
              const stationItems = (order.items ?? []).filter(i => (activeStation === 'All' || i.station === activeStation) && i.prepState !== 'hold');
              const anyStationPending = stationItems.some(i => !i.status || i.status === 'pending');
              const allStationReady = stationItems.every(i => i.status === 'ready');
              const urgency = getUrgency(order);
              const stopwatch = getStopwatch(order);

              return (
                <div
                  key={order.id}
                  className={`kds-order-card ${urgency.borderClass}`}
                  id={`kds-order-${order.id}`}
                >
                  {/* Top Urgency Header Banner */}
                  <div style={{
                    padding: '8px 14px',
                    background: urgency.bannerBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    color: '#ffffff',
                    fontWeight: 900,
                    fontSize: 12,
                    letterSpacing: '0.04em'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {orderIdx < 9 && (
                        <span style={{
                          fontSize: 10.5,
                          fontWeight: 900,
                          padding: '1px 5px',
                          borderRadius: 4,
                          background: 'rgba(255,255,255,0.22)',
                          color: '#ffffff',
                          fontFamily: 'monospace'
                        }} title={`Bump bar hotkey: Press [${orderIdx + 1}]`}>
                          #{orderIdx + 1}
                        </span>
                      )}
                      {urgency.type === 'late' && <Flame size={15} color="#ffffff" />}
                      {urgency.type === 'delayed' && <AlertTriangle size={15} color="#ffffff" />}
                      {urgency.type === 'normal' && <Clock size={15} color="#ffffff" />}
                      <span>{urgency.label}</span>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      fontFamily: 'monospace',
                      fontSize: 13,
                      background: 'rgba(0,0,0,0.3)',
                      padding: '2px 8px',
                      borderRadius: 6
                    }}>
                      <span>⏱️</span>
                      <span>{stopwatch}</span>
                    </div>
                  </div>

                  {/* Order Identity Subheader */}
                  <div className="kds-order-header">
                    <div>
                      <div className="kds-order-id" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {modes.includes('token') && order.token && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCallToken(order.token);
                            }}
                            style={{
                              padding: '3px 8px',
                              fontSize: 11,
                              fontWeight: 800,
                              borderRadius: 6,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              background: '#f59e0b',
                              color: '#000000',
                              border: 'none',
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(245, 158, 11, 0.4)'
                            }}
                            title="Tap to call token number on TV display"
                          >
                            📢 #{String(order.token).padStart(3, '0')}
                          </button>
                        )}
                        <span>
                          {order.type === 'dine-in' ? (order.tableName ? `🪑 Table ${order.tableName}` : '🍽️ Dine-In') : (order.type === 'takeaway' ? '🛍️ Takeaway' : '🌐 Online')}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--color-label-secondary)', marginTop: 3, fontWeight: 600 }}>
                        {order.type.toUpperCase()} · #{order.id.slice(-6).toUpperCase()}
                      </div>
                    </div>
                    
                    {/* Action & Status Pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          printSingleKitchenTicket({
                            restaurant,
                            order,
                            items: order.items,
                            staffName: order.staffName
                          });
                        }}
                        style={{
                          background: 'var(--color-bg-secondary)',
                          border: '1px solid var(--color-separator-opaque)',
                          color: 'var(--color-label)',
                          borderRadius: 8,
                          padding: '4px 8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          transition: 'all 0.15s ease'
                        }}
                        title="Print Kitchen Ticket to Thermal Printer"
                      >
                        <Printer size={13} />
                        <span>Print</span>
                      </button>

                      {/* Status Pill */}
                      <div style={{
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 800,
                        background: order.status === 'pending' ? 'var(--color-yellow-light)' : 'var(--color-purple-light)',
                        color: order.status === 'pending' ? 'var(--color-yellow)' : 'var(--color-purple)',
                        border: order.status === 'pending' ? '1px solid var(--color-yellow)' : '1px solid var(--color-purple)'
                      }}>
                        {order.status === 'pending' ? '⏳ WAITING' : '🍳 COOKING'}
                      </div>
                    </div>
                  </div>

                  {/* Card Items List */}
                  <div className="kds-order-items">
                    {(() => {
                      const COURSES = ['Appetizers', 'Mains', 'Desserts', 'Beverages'];
                      return COURSES.map(courseName => {
                        const courseItems = (order.items ?? [])
                          .map((item, idx) => ({ ...item, originalIndex: idx }))
                          .filter(item => {
                            const matchesStation = activeStation === 'All' || item.station === activeStation;
                            const matchesCourse = (item.course === courseName) || (!COURSES.includes(item.course) && courseName === 'Mains');
                            const isNotHeld = item.prepState !== 'hold';
                            return matchesStation && matchesCourse && isNotHeld;
                          });

                        if (courseItems.length === 0) return null;

                        return (
                          <div key={courseName} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{
                              fontSize: 10,
                              fontWeight: 900,
                              textTransform: 'uppercase',
                              color: 'var(--color-label-secondary)',
                              borderBottom: '1px solid var(--color-separator-opaque)',
                              paddingBottom: 3,
                              letterSpacing: '0.06em'
                            }}>
                              {courseName}
                            </div>
                            {courseItems.map(item => {
                              const isReady = item.status === 'ready';
                              const isPreparing = item.status === 'preparing';
                              const originalIndex = item.originalIndex;

                              return (
                                <div 
                                  key={originalIndex} 
                                  onClick={() => cycleItemStatus(order, originalIndex, item.status || 'pending')}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    width: '100%',
                                    padding: '7px 8px',
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    background: isPreparing ? 'var(--color-purple-light)' : (isReady ? 'transparent' : 'var(--color-bg-secondary)'),
                                    border: isPreparing ? '1px solid var(--color-purple)' : '1px solid var(--color-separator-opaque)',
                                    transition: 'all 0.15s ease',
                                    opacity: isReady ? 0.45 : 1,
                                  }}
                                  title="Click to advance item prep status"
                                >
                                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginRight: 8 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <span className="kds-item-qty" style={{
                                        background: isReady ? 'var(--color-fill-secondary)' : '#f59e0b',
                                        color: isReady ? 'var(--color-label-secondary)' : '#000000'
                                      }}>
                                        ×{item.qty}
                                      </span>
                                      <span style={{ 
                                        textDecoration: isReady ? 'line-through' : 'none',
                                        color: isReady ? 'var(--color-label-tertiary)' : 'var(--color-label)',
                                        fontSize: 15,
                                        fontWeight: isPreparing ? 800 : 700,
                                        letterSpacing: '-0.2px'
                                      }}>
                                        {item.name}
                                      </span>
                                    </div>
                                    {item.selectedModifiers && item.selectedModifiers.length > 0 && (() => {
                                      const variantMods = item.selectedModifiers.filter(m => m.isVariantAxis);
                                      const regularMods = item.selectedModifiers.filter(m => !m.isVariantAxis);
                                      return (
                                        <div style={{ paddingLeft: 38, marginTop: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                          {/* Variant axes — large high-contrast badge */}
                                          {variantMods.length > 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                              {variantMods.map((m, mIdx) => (
                                                <span key={mIdx} style={{
                                                  background: mIdx === 0 ? 'var(--color-yellow-light)' : 'var(--color-purple-light)',
                                                  color: mIdx === 0 ? 'var(--color-yellow)' : 'var(--color-purple)',
                                                  border: `1.5px solid ${mIdx === 0 ? 'var(--color-yellow)' : 'var(--color-purple)'}`,
                                                  padding: '3px 10px',
                                                  borderRadius: 6,
                                                  fontSize: 13,
                                                  fontWeight: 900,
                                                  letterSpacing: '0.04em',
                                                  textTransform: 'uppercase',
                                                }}>
                                                  {m.modifierGroupName}: {m.name}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                          {/* Regular modifiers — show group name + option so kitchen knows Gravy vs Paste */}
                                          {regularMods.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                              {regularMods.map((m, mIdx) => (
                                                <span key={mIdx} style={{
                                                  background: 'var(--color-bg-secondary)',
                                                  color: 'var(--color-label-secondary)',
                                                  border: '1px solid var(--color-separator-opaque)',
                                                  padding: '2px 7px',
                                                  borderRadius: 4,
                                                  fontSize: 11,
                                                  fontWeight: 700
                                                }}>
                                                  {m.modifierGroupName ? `${m.modifierGroupName}: ${m.name}` : `+ ${m.name}`}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {activeStation === 'All' && item.station && (
                                      <span style={{
                                        fontSize: 9,
                                        padding: '2px 6px',
                                        borderRadius: 4,
                                        background: 'var(--color-fill-secondary)',
                                        color: 'var(--color-label-secondary)',
                                        fontWeight: 700
                                      }}>
                                        {item.station}
                                      </span>
                                    )}
                                    <span style={{
                                      fontSize: 11,
                                      padding: '3px 8px',
                                      borderRadius: 6,
                                      fontWeight: 800,
                                      background: isReady ? 'var(--color-green-light)' : (isPreparing ? 'var(--color-purple-light)' : 'var(--color-yellow-light)'),
                                      color: isReady ? 'var(--color-green)' : (isPreparing ? 'var(--color-purple)' : 'var(--color-yellow)'),
                                      border: isReady ? '1px solid var(--color-green)' : (isPreparing ? '1px solid var(--color-purple)' : '1px solid var(--color-yellow)'),
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 3
                                    }}>
                                      {isReady ? '✓ Done' : (isPreparing ? '🍳 Cook' : '⏳ Wait')}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      });
                    })()}
                    
                    {order.note && (
                      <div style={{
                        marginTop: 6,
                        color: 'var(--color-label)',
                        background: 'var(--color-brand-ochre-light)',
                        border: '1px solid var(--color-brand-ochre)',
                        padding: '6px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600
                      }}>
                        📝 {order.note}
                      </div>
                    )}
                  </div>

                  {/* Card Action Bump Bar */}
                  <div className="kds-order-action" style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    {allStationReady ? (
                      <div style={{
                        flex: 1,
                        textAlign: 'center',
                        color: 'var(--color-green)',
                        fontSize: 13,
                        fontWeight: 800,
                        padding: '10px 0',
                        background: 'var(--color-green-light)',
                        borderRadius: 10,
                        border: '1px solid var(--color-green)'
                      }}>
                        ✓ All Items Ready for Serving
                      </div>
                    ) : (
                      <>
                        {anyStationPending && (
                          <button
                            className="kds-cook-btn"
                            onClick={() => handleStartPreparing(order, activeStation)}
                          >
                            🍳 Start Cooking
                          </button>
                        )}
                        <button
                          className="kds-ready-btn"
                          onClick={() => handleMarkReady(order, activeStation)}
                          style={{ flex: anyStationPending ? 1.2 : 1 }}
                        >
                          <Check size={16} strokeWidth={3} /> Mark All Ready
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Bump Bar & Keyboard Shortcuts Modal ── */}
      {showBumpBarHelp && (
        <div 
          onClick={() => setShowBumpBarHelp(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--color-bg-elevated)',
              border: '1px solid var(--color-separator-opaque)',
              borderRadius: 'var(--radius-lg)',
              maxWidth: 520,
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
              overflow: 'hidden'
            }}
          >
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: '1px solid var(--color-separator-opaque)',
              background: 'var(--color-bg)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Keyboard size={20} color="var(--color-accent)" />
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-label)' }}>
                  Kitchen Bump Bar & Hotkeys
                </h3>
                <span style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 4,
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--color-accent)'
                }}>
                  HARDWARE COMPATIBLE
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setShowBumpBarHelp(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-label-tertiary)',
                  cursor: 'pointer',
                  padding: 4,
                  display: 'flex'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--color-label-secondary)' }}>
                Supports standard kitchen bump bars (Logic Controls, MicroTouch, Bematech) and mechanical USB/wireless keyboards.
              </p>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr',
                gap: '8px 16px',
                marginTop: 6,
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <kbd className="kds-kbd">1</kbd>
                  <span style={{ color: 'var(--color-label-tertiary)' }}>…</span>
                  <kbd className="kds-kbd">9</kbd>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-label)' }}>
                  <strong>Bump ticket #1 to #9</strong> directly by card order
                </div>

                <div>
                  <kbd className="kds-kbd">Space</kbd> or <kbd className="kds-kbd">Enter</kbd>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-label)' }}>
                  <strong>Bump oldest pending ticket</strong> (FIFO priority)
                </div>

                <div>
                  <kbd className="kds-kbd">R</kbd>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-label)' }}>
                  <strong>Recall last plated order</strong> back to active kitchen
                </div>

                <div>
                  <kbd className="kds-kbd">S</kbd>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-label)' }}>
                  <strong>Cycle sort mode</strong> (Oldest FIFO ↔ Newest LIFO ↔ Urgency)
                </div>

                <div>
                  <kbd className="kds-kbd">←</kbd> <kbd className="kds-kbd">→</kbd>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-label)' }}>
                  <strong>Switch station filter</strong> (All, Grill, Fryer, etc.)
                </div>

                <div>
                  <kbd className="kds-kbd">F</kbd>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-label)' }}>
                  <strong>Toggle Fullscreen</strong> display mode
                </div>

                <div>
                  <kbd className="kds-kbd">M</kbd>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-label)' }}>
                  <strong>Mute / Unmute</strong> kitchen chime alert
                </div>

                <div>
                  <kbd className="kds-kbd">?</kbd>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--color-label)' }}>
                  <strong>Open / close this guide</strong>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--color-separator-opaque)',
              background: 'var(--color-bg)',
              display: 'flex',
              justifyContent: 'flex-end'
            }}>
              <button
                type="button"
                onClick={() => setShowBumpBarHelp(false)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-accent)',
                  color: '#ffffff',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: 'pointer'
                }}
              >
                Got It (Esc)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
