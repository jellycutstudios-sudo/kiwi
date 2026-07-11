import { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useKdsStore } from '../stores/kdsStore';
import toast from 'react-hot-toast';
import { ChefHat } from 'lucide-react';

const STATIONS = ['All', 'Kitchen', 'Grill', 'Fryer', 'Cold', 'Bar', 'Bakery'];

export default function KDS() {
  const { t } = useTranslation();
  const { restaurant } = useAuthStore();
  const { activeOrders } = useOrderStore();
  const { updateKDSItemStatus, updateKDSStationStatus } = useKdsStore();
  const [activeStation, setActiveStation] = useState('All');
  
  const prevCountRef = useRef(0);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const kdsOrders = activeOrders
    .filter(o => ['pending', 'preparing'].includes(o.status))
    .filter(o => {
      if (activeStation === 'All') {
        return o.items?.some(i => i.status !== 'ready' && i.prepState !== 'hold');
      }
      return o.items?.some(i => i.station === activeStation && i.status !== 'ready' && i.prepState !== 'hold');
    });

  const orderCount = kdsOrders.length;

  useEffect(() => {
    const prev = prevCountRef.current;
    if (orderCount > prev && prev > 0) {
      if (restaurant?.peripheralConfig?.soundAlerts) {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-200.wav');
        audio.play().catch(() => {});
        toast('New kitchen order received!', { icon: '🔔' });
      }
    }
    prevCountRef.current = orderCount;
  }, [orderCount, restaurant?.peripheralConfig?.soundAlerts]);


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
  };

  const cycleItemStatus = async (order, itemIndex, currentStatus) => {
    let nextStatus = 'pending';
    if (currentStatus === 'pending') nextStatus = 'preparing';
    else if (currentStatus === 'preparing') nextStatus = 'ready';
    else if (currentStatus === 'ready') nextStatus = 'pending';
    
    await updateKDSItemStatus(restaurant.id, order, itemIndex, nextStatus);
  };

  const getElapsed = (createdAt) => {
    if (!createdAt?.toDate) return '';
    const diff = Math.floor((currentTime - createdAt.toDate()) / 60000);
    return diff < 1 ? 'Just now' : `${diff}m ago`;
  };

  return (
    <div className="kds-layout">
      {/* Header */}
      <div className="kds-header">
        <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)' }}>
          <ChefHat size={24} color="var(--color-on-dark)" />
          <span className="kds-title">{t('kitchen')} Display</span>
          <span style={{
            padding: '3px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(255,149,0,0.2)',
            color: 'var(--color-orange)',
            fontSize: 13,
            fontWeight: 600,
          }}>{kdsOrders.length} active</span>
        </div>
        <div style={{ color: 'var(--color-on-dark-soft)', fontSize: 13 }}>
          {new Date().toLocaleTimeString()}
        </div>
      </div>

      {/* Station Tabs */}
      <div style={{
        display: 'flex',
        gap: 'var(--space-2)',
        overflowX: 'auto',
        marginBottom: 'var(--space-4)',
        paddingBottom: 4,
        borderBottom: '1px solid rgba(255,255,255,0.08)'
      }}>
        {STATIONS.map(station => {
          const count = getStationOrderCount(station);
          const isActive = activeStation === station;
          return (
            <button
              key={station}
              onClick={() => setActiveStation(station)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: 'var(--space-2) var(--space-4)',
                borderRadius: 'var(--radius-md)',
                background: isActive ? 'var(--color-accent)' : 'rgba(255,255,255,0.06)',
                color: isActive ? 'var(--color-on-dark)' : 'var(--color-on-dark-soft)',
                border: 'none',
                fontWeight: 'var(--weight-bold)',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all var(--duration-fast)',
                whiteSpace: 'nowrap'
              }}
            >
              <span>{station}</span>
              {count > 0 && (
                <span style={{
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 10,
                  background: isActive ? 'var(--color-on-dark)' : 'rgba(255,255,255,0.15)',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-on-dark)',
                  fontWeight: 800
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {kdsOrders.length === 0 ? (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          height: '50vh', color: 'rgba(255,255,255,0.3)', gap: 'var(--space-4)',
        }}>
          <div style={{ fontSize: 48 }}>🍳</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>No orders in queue for this station</div>
        </div>
      ) : (
        <div className="kds-grid">
          {kdsOrders.map(order => {
            const stationItems = (order.items ?? []).filter(i => (activeStation === 'All' || i.station === activeStation) && i.prepState !== 'hold');
            const anyStationPending = stationItems.some(i => !i.status || i.status === 'pending');
            const allStationReady = stationItems.every(i => i.status === 'ready');

            return (
              <div
                key={order.id}
                className={`kds-order-card status-${order.status}`}
                id={`kds-order-${order.id}`}
              >
                {/* Card Header */}
                <div className="kds-order-header">
                  <div>
                    <div className="kds-order-id">
                      {order.type === 'dine-in' ? `🪑 ${order.tableName ?? 'Table'}` :
                       order.token ? `🎫 #${String(order.token).padStart(3,'0')}` : '🛍️ Takeaway'}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                      {order.type} · #{order.id.slice(-6).toUpperCase()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 11,
                      fontWeight: 600,
                      background: order.status === 'pending' ? 'rgba(255,176,132,0.2)' : 'rgba(184,164,237,0.2)',
                      color: order.status === 'pending' ? 'var(--color-brand-peach)' : 'var(--color-brand-lavender)',
                    }}>
                      {order.status.toUpperCase()}
                    </div>
                    <div className="kds-order-time" style={{ marginTop: 4 }}>
                      {getElapsed(order.createdAt)}
                    </div>
                  </div>
                </div>

                {/* Card Items */}
                <div className="kds-order-items" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
                        <div key={courseName} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 2, letterSpacing: '0.05em' }}>
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
                                  padding: '4px 6px',
                                  borderRadius: 'var(--radius-sm)',
                                  cursor: 'pointer',
                                  background: isPreparing ? 'rgba(184,164,237,0.10)' : 'transparent',
                                  transition: 'background var(--duration-fast)',
                                  opacity: isReady ? 0.45 : 1,
                                }}
                              >
                                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                    <span className="kds-item-qty" style={{ color: isReady ? 'rgba(255,255,255,0.25)' : 'var(--color-brand-peach)', fontWeight: 'bold' }}>
                                      ×{item.qty}
                                    </span>
                                    <span style={{ 
                                      textDecoration: isReady ? 'line-through' : 'none',
                                      color: isReady ? 'var(--color-on-dark-soft)' : 'var(--color-on-dark)',
                                      fontWeight: isPreparing ? 'var(--weight-semibold)' : 'normal'
                                    }}>
                                      {item.name}
                                    </span>
                                  </div>
                                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                                    <div style={{ fontSize: 'var(--text-caption2)', color: isReady ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.50)', paddingLeft: 24, marginTop: 2 }}>
                                      + {item.selectedModifiers.map(m => m.name).join(', ')}
                                    </div>
                                  )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {activeStation === 'All' && (
                                    <span style={{
                                      fontSize: 8,
                                      padding: '2px 5px',
                                      borderRadius: 4,
                                      background: 'rgba(255,255,255,0.08)',
                                      color: 'rgba(255,255,255,0.50)',
                                      fontWeight: 'var(--weight-semibold)'
                                    }}>
                                      {item.station ?? 'Kitchen'}
                                    </span>
                                  )}
                                  <span style={{
                                    fontSize: 9,
                                    padding: '2px 5px',
                                    borderRadius: 'var(--radius-full)',
                                    fontWeight: 'var(--weight-bold)',
                                    background: isReady ? 'rgba(164,212,197,0.20)' : (isPreparing ? 'rgba(184,164,237,0.20)' : 'rgba(255,176,132,0.20)'),
                                    color: isReady ? 'var(--color-brand-mint)' : (isPreparing ? 'var(--color-brand-lavender)' : 'var(--color-brand-peach)'),
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 2
                                  }}>
                                    {isReady ? '✓' : (isPreparing ? '🍳' : '⏳')}
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
                    <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12, fontStyle: 'italic', borderTop: '1px dashed rgba(255,255,255,0.08)', paddingTop: 6 }}>
                      📝 {order.note}
                    </div>
                  )}
                </div>

                {/* Card Action Footer */}
                <div className="kds-order-action" style={{ display:'flex', gap:'var(--space-2)' }}>
                  {allStationReady ? (
                    <div style={{ flex: 1, textAlign: 'center', color: 'var(--color-green)', fontSize: 13, fontWeight: 600, padding: '6px 0' }}>
                      ✓ Station Completed
                    </div>
                  ) : (
                    <>
                      {anyStationPending && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => handleStartPreparing(order, activeStation)}
                          style={{ flex: 1, background: 'rgba(184,164,237,0.15)', color: 'var(--color-brand-lavender)', border: '1px solid rgba(184,164,237,0.3)', padding: '8px', fontSize: 12 }}
                        >
                          🍳 Prepare {activeStation === 'All' ? 'All' : activeStation}
                        </button>
                      )}
                      <button
                        className="kds-ready-btn"
                        onClick={() => handleMarkReady(order, activeStation)}
                        style={{ flex: anyStationPending ? 0.8 : 1, padding: '8px', fontSize: 12 }}
                      >
                        ✓ Ready {activeStation === 'All' ? 'All' : activeStation}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
