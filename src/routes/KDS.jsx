import { useEffect, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
  Sun
} from 'lucide-react';
import { printSingleKitchenTicket } from '../utils/print';
import { useWakeLock } from '../hooks/useWakeLock';
import { getKitchenStations } from '../utils/stations';

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
  const { t } = useTranslation();
  const restaurant = useAuthStore(s => s.restaurant);
  const modes = restaurant?.modes || [];
  const activeOrders = useOrderStore(s => s.activeOrders);
  const { updateKDSItemStatus, updateKDSStationStatus } = useKdsStore();
  const { callSpecificToken } = useTokenStore();
  
  const [activeStation, setActiveStation] = useState('All');
  const [viewTab, setViewTab] = useState('active'); // 'active' | 'recent'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { isLocked: isWakeLocked, isSupported: isWakeSupported } = useWakeLock(true);
  
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

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

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
    return activeOrders
      .filter(o => ['pending', 'preparing'].includes(o.status))
      .filter(o => {
        if (activeStation === 'All') {
          return o.items?.some(i => i.status !== 'ready' && i.prepState !== 'hold');
        }
        return o.items?.some(i => i.station === activeStation && i.status !== 'ready' && i.prepState !== 'hold');
      });
  }, [activeOrders, activeStation]);

  const recentReadyOrders = useMemo(() => {
    return activeOrders.filter(o => {
      if (o.status !== 'ready') return false;
      const createdAtMs = o.createdAt?.toDate ? o.createdAt.toDate().getTime() : (o.createdAt ? new Date(o.createdAt).getTime() : 0);
      return (currentTime - createdAtMs) <= 30 * 60 * 1000;
    });
  }, [activeOrders, currentTime]);

  const handleRecallOrder = async (order) => {
    try {
      await updateKDSStationStatus(restaurant.id, order, 'All', 'preparing');
      toast.success(`Recalled order to kitchen!`, { icon: '↩️' });
    } catch (err) {
      toast.error('Failed to recall order: ' + err.message);
    }
  };

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

  const handleMarkReady = async (order, station) => {
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
  };

  const cycleItemStatus = async (order, itemIndex, currentStatus) => {
    let nextStatus = 'pending';
    if (currentStatus === 'pending') nextStatus = 'preparing';
    else if (currentStatus === 'preparing') nextStatus = 'ready';
    else if (currentStatus === 'ready') nextStatus = 'pending';
    
    await updateKDSItemStatus(restaurant.id, order, itemIndex, nextStatus);
  };

  // Helper for live stopwatch and urgency levels
  const getElapsedSeconds = (createdAt) => {
    if (!createdAt) return 0;
    const timeMs = createdAt.toDate ? createdAt.toDate().getTime() : new Date(createdAt).getTime();
    if (isNaN(timeMs) || timeMs === 0) return 0;
    return Math.max(0, Math.floor((currentTime - timeMs) / 1000));
  };

  const getStopwatch = (createdAt) => {
    const totalSecs = getElapsedSeconds(createdAt);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const getUrgency = (createdAt) => {
    const mins = Math.floor(getElapsedSeconds(createdAt) / 60);
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
  };

  // Kitchen performance metrics
  const kitchenMetrics = useMemo(() => {
    if (kdsOrders.length === 0) return { avgWaitMins: 0, maxWaitMins: 0 };
    let totalMins = 0;
    let maxMins = 0;
    kdsOrders.forEach(o => {
      const mins = Math.floor(getElapsedSeconds(o.createdAt) / 60);
      totalMins += mins;
      if (mins > maxMins) maxMins = mins;
    });
    return {
      avgWaitMins: Math.round(totalMins / kdsOrders.length),
      maxWaitMins: maxMins
    };
  }, [kdsOrders, currentTime]);

  return (
    <div className="kds-layout">
      {/* High-Visibility Header */}
      <div className="kds-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)'
          }}>
            <ChefHat size={24} color="#000000" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="kds-title">{restaurant?.name ? `${restaurant.name} Kitchen` : 'Kitchen Display'}</span>
              <span style={{
                padding: '2px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--color-yellow-light)',
                color: 'var(--color-yellow)',
                fontSize: 12,
                fontWeight: 800,
                border: '1px solid var(--color-yellow)'
              }}>
                {kdsOrders.length} ACTIVE
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-label-secondary)', marginTop: 1 }}>
              Real-time line production & bump bar
            </div>
          </div>
        </div>

        {/* Center/Right Metrics & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {/* Kitchen Health Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 8,
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-separator-opaque)',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--color-label)'
            }}>
              <Timer size={14} color="var(--color-accent)" />
              <span>Avg: {kitchenMetrics.avgWaitMins}m</span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              borderRadius: 8,
              background: kitchenMetrics.maxWaitMins > 20 ? 'var(--color-red-light)' : 'var(--color-bg-secondary)',
              border: kitchenMetrics.maxWaitMins > 20 ? '1px solid var(--color-red)' : '1px solid var(--color-separator-opaque)',
              fontSize: 12,
              fontWeight: 700,
              color: kitchenMetrics.maxWaitMins > 20 ? 'var(--color-red)' : 'var(--color-label)'
            }}>
              <Flame size={14} color={kitchenMetrics.maxWaitMins > 20 ? 'var(--color-red)' : 'var(--color-orange)'} />
              <span>Max: {kitchenMetrics.maxWaitMins}m</span>
            </div>
          </div>

          {/* Active vs Ready Tabs */}
          <div style={{ display: 'flex', background: 'var(--color-bg-secondary)', borderRadius: 10, padding: 3, border: '1px solid var(--color-separator-opaque)' }}>
            <button
              onClick={() => setViewTab('active')}
              style={{
                background: viewTab === 'active' ? '#10b981' : 'transparent',
                color: viewTab === 'active' ? '#ffffff' : 'var(--color-label-secondary)',
                border: 'none',
                borderRadius: 7,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Active ({kdsOrders.length})
            </button>
            <button
              onClick={() => setViewTab('recent')}
              style={{
                background: viewTab === 'recent' ? '#10b981' : 'transparent',
                color: viewTab === 'recent' ? '#ffffff' : 'var(--color-label-secondary)',
                border: 'none',
                borderRadius: 7,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              Ready ({recentReadyOrders.length})
            </button>
          </div>

          {/* Audio Chime Button */}
          <button
            onClick={() => {
              setSoundEnabled(!soundEnabled);
              if (!soundEnabled) playKitchenChime();
            }}
            title={soundEnabled ? 'Chime sound is ON' : 'Chime sound is MUTED'}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: soundEnabled ? 'var(--color-accent-light)' : 'var(--color-bg-secondary)',
              border: soundEnabled ? '1px solid var(--color-accent)' : '1px solid var(--color-separator-opaque)',
              color: soundEnabled ? 'var(--color-accent)' : 'var(--color-label-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-separator-opaque)',
              color: 'var(--color-label)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>

          {/* Screen Wake Lock Indicator */}
          {isWakeSupported && (
            <div
              title={isWakeLocked ? 'Screen Wake Lock Active: Display will stay on' : 'Screen Wake Lock Inactive'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                padding: '6px 10px',
                borderRadius: 8,
                background: isWakeLocked ? 'var(--color-green-light)' : 'var(--color-bg-secondary)',
                border: isWakeLocked ? '1px solid var(--color-green)' : '1px solid var(--color-separator-opaque)',
                color: isWakeLocked ? 'var(--color-green)' : 'var(--color-label-secondary)',
                fontSize: 12,
                fontWeight: 700
              }}
            >
              <Sun size={14} className={isWakeLocked ? 'animate-pulse' : ''} />
              <span className="desktop-only">{isWakeLocked ? 'Awake' : 'Sleep OK'}</span>
            </div>
          )}

          {/* Digital Clock */}
          <div style={{
            fontFamily: 'monospace',
            fontSize: 14,
            fontWeight: 800,
            color: 'var(--color-label)',
            background: 'var(--color-bg-secondary)',
            padding: '6px 10px',
            borderRadius: 8,
            border: '1px solid var(--color-separator-opaque)'
          }}>
            {new Date(currentTime).toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Station Pills Filter */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-2)',
        overflowX: 'auto',
        marginBottom: 'var(--space-4)',
        paddingBottom: 6,
        borderBottom: '1px solid var(--color-separator-opaque)'
      }}>
        {stationsList.map(station => {
          const count = getStationOrderCount(station);
          const isActive = activeStation === station;
          return (
            <button
              key={station}
              onClick={() => setActiveStation(station)}
              title={station === 'All' ? 'Show all orders from every station' : `Show only orders for the ${station} station`}
              className={`kds-station-pill ${isActive ? 'active' : ''}`}
            >
              <span>{station}</span>
              {count > 0 && (
                <span className="kds-station-pill-count">
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
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '50vh', color: 'var(--color-label-tertiary)', gap: 'var(--space-4)',
          }}>
            <div style={{ fontSize: 52 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-label)' }}>No completed orders in the last 30 minutes</div>
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
                      {order.token && (
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
                                  <span key={i} style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-label-secondary)', border: '1px solid var(--color-separator-opaque)', padding: '1px 5px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>+ {m.name}</span>
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
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '50vh', color: 'var(--color-label-tertiary)', gap: 'var(--space-4)',
          }}>
            <div style={{ fontSize: 52 }}>🍳</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-label)' }}>All orders cleared! Kitchen queue is empty.</div>
            <div style={{ fontSize: 14, color: 'var(--color-label-secondary)' }}>New tickets will appear here with sound alert.</div>
          </div>
        ) : (
          <div className="kds-grid">
            {kdsOrders.map(order => {
              const stationItems = (order.items ?? []).filter(i => (activeStation === 'All' || i.station === activeStation) && i.prepState !== 'hold');
              const anyStationPending = stationItems.some(i => !i.status || i.status === 'pending');
              const allStationReady = stationItems.every(i => i.status === 'ready');
              const urgency = getUrgency(order.createdAt);
              const stopwatch = getStopwatch(order.createdAt);

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
                        {order.token && (
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
                          {order.type === 'dine-in' ? `🪑 ${order.tableName ?? 'Table'}` : (order.type === 'takeaway' ? '🛍️ Takeaway' : '🌐 Online')}
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
                                          {/* Regular modifiers — small chips as before */}
                                          {regularMods.length > 0 && (
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                              {regularMods.map((m, mIdx) => (
                                                <span key={mIdx} style={{
                                                  background: 'var(--color-bg-secondary)',
                                                  color: 'var(--color-label-secondary)',
                                                  border: '1px solid var(--color-separator-opaque)',
                                                  padding: '1px 6px',
                                                  borderRadius: 4,
                                                  fontSize: 11,
                                                  fontWeight: 700
                                                }}>
                                                  + {m.name}
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
    </div>
  );
}
