import { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMenuStore } from '../../stores/menuStore';
import { collection, onSnapshot, doc, setDoc, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatCurrency } from '../../utils/formatCurrency';
import { Truck, RefreshCw, AlertCircle, CheckCircle2, ShoppingBag, DollarSign, Percent } from 'lucide-react';
import toast from 'react-hot-toast';

const PLATFORM_META = {
  ubereats: { name: 'Uber Eats', emoji: '🚗', color: '#000000', bg: '#f5f5f5' },
  zomato:   { name: 'Zomato',    emoji: '🍕', color: '#E23744', bg: '#fdeaea' },
  swiggy:   { name: 'Swiggy',    emoji: '🟠', color: '#FC8019', bg: '#fff3eb' },
  deliveroo:{ name: 'Deliveroo', emoji: '🦘', color: '#00CCBC', bg: '#e0faf8' },
};

export default function DeliveryHub() {
  const { restaurant } = useAuthStore();
  const { categories } = useMenuStore();
  const [integrations, setIntegrations] = useState({});
  const [selectedCat, setSelectedCat] = useState('');
  const [orders, setOrders] = useState([]);
  const [syncLogs, setSyncLogs] = useState({});
  const [overrides, setOverrides] = useState({}); // { [platform]: { [itemId]: { available: boolean } } }
  const [syncing, setSyncing] = useState(false);
  const [syncingPlatform, setSyncingPlatform] = useState(null);

  const currency = restaurant?.currency ?? 'INR';

  // 1. Fetch restaurant settings & integrations status
  useEffect(() => {
    if (!restaurant?.id) return;
    const unsub = onSnapshot(doc(db, 'restaurants', restaurant.id), docSnap => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIntegrations(data.deliveryIntegrations || {});
      }
    });
    return unsub;
  }, [restaurant?.id]);

  // Set default category when menu is loaded
  useEffect(() => {
    if (categories.length) {
      setSelectedCat(prev => prev || categories[0].id);
    }
  }, [categories]);

  // 3. Fetch delivery orders for analytics (last 30 days)
  useEffect(() => {
    if (!restaurant?.id) return;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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

  // 4. Fetch menu availability overrides & sync logs for each active platform
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

  // Handle manual menu sync trigger
  const triggerSync = async (platformId = null) => {
    if (platformId) {
      setSyncingPlatform(platformId);
    } else {
      setSyncing(true);
    }

    try {
      const url = `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project'}.cloudfunctions.net/syncDeliveryMenu?restaurantId=${restaurant.id}`;
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

  // Analytics Math (Today's metrics)
  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => {
    if (!o.createdAt) return false;
    const dateObj = typeof o.createdAt.toDate === 'function' ? o.createdAt.toDate() : new Date(o.createdAt);
    return dateObj.toDateString() === today;
  });

  const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
  const todayCommission = todayOrders.reduce((sum, o) => sum + ((o.total * (o.platformCommission || 0)) / 100), 0);
  
  const activeCount = Object.values(integrations).filter(c => c.enabled === true).length;
  const activeCatData = categories.find(c => c.id === selectedCat);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Title & Global Action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 className="text-title2">Delivery Hub</h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            Monitor aggregator orders, sync menus, and toggle product availability.
          </p>
        </div>
        <button 
          className="btn btn-primary" 
          onClick={() => triggerSync()} 
          disabled={syncing || syncingPlatform !== null || activeCount === 0}
        >
          <RefreshCw size={16} className={syncing ? 'spin' : ''} /> {syncing ? 'Syncing...' : 'Sync All Menus'}
        </button>
      </div>

      {/* Analytics Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <ShoppingBag size={24} style={{ color: 'var(--color-accent)' }} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)' }}>Today's Orders</div>
            <div style={{ fontSize: 'var(--text-title2)', fontWeight: 'var(--weight-bold)', marginTop: 2 }}>
              {todayOrders.length}
            </div>
          </div>
        </div>

        <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <DollarSign size={24} style={{ color: 'var(--color-success)' }} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)' }}>Today's Revenue</div>
            <div style={{ fontSize: 'var(--text-title2)', fontWeight: 'var(--weight-bold)', marginTop: 2 }}>
              {formatCurrency(todayRevenue, currency)}
            </div>
          </div>
        </div>

        <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <Percent size={24} style={{ color: 'var(--color-red)' }} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)' }}>Est. Commission</div>
            <div style={{ fontSize: 'var(--text-title2)', fontWeight: 'var(--weight-bold)', marginTop: 2 }}>
              {formatCurrency(todayCommission, currency)}
            </div>
          </div>
        </div>

        <div className="card card-padded" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)' }}>
            <Truck size={24} style={{ color: 'var(--color-purple)' }} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)' }}>Active Channels</div>
            <div style={{ fontSize: 'var(--text-title2)', fontWeight: 'var(--weight-bold)', marginTop: 2 }}>
              {activeCount} / 4
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

          // Compute channel specific orders
          const channelOrders = todayOrders.filter(o => o.source === id);
          const channelRev = channelOrders.reduce((sum, o) => sum + (o.total || 0), 0);

          return (
            <div key={id} className="card card-padded" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', border: isEnabled ? '1px solid var(--color-separator-opaque)' : '1px dashed var(--color-separator)' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                  <span style={{ fontSize: '1.8rem' }}>{meta.emoji}</span>
                  <div>
                    <h4 style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-subhead)' }}>{meta.name}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: isEnabled ? 'var(--color-success)' : 'var(--color-label-tertiary)'
                      }} />
                      <span style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)' }}>
                        {isEnabled ? 'Connected' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>
                {isEnabled && (
                  <button 
                    className="btn btn-secondary btn-sm"
                    onClick={() => triggerSync(id)}
                    disabled={syncing || syncingPlatform !== null}
                    style={{ padding: '4px 8px' }}
                  >
                    <RefreshCw size={12} className={isSyncingThis ? 'spin' : ''} /> Sync Menu
                  </button>
                )}
              </div>

              {/* Today stats */}
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
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 60, color: 'var(--color-label-tertiary)', fontSize: 'var(--text-footnote)', textAlign: 'center' }}>
                  Enable integration under Settings → Delivery Integrations to begin receiving orders.
                </div>
              )}

              {/* Sync Status Log */}
              {isEnabled && (
                <div style={{ fontSize: 'var(--text-caption2)', borderTop: '1px solid var(--color-separator)', paddingTop: 'var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  {log ? (
                    log.status === 'success' ? (
                      <>
                        <CheckCircle2 size={14} style={{ color: 'var(--color-success)' }} />
                        <span style={{ color: 'var(--color-label-secondary)' }}>
                          Menu Synced: {log.itemsSynced} items ({new Date(log.timestamp?.toDate ? log.timestamp.toDate() : log.timestamp).toLocaleTimeString()})
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
                      <span style={{ color: 'var(--color-label-secondary)' }}>No sync logs found yet.</span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Menu Availability Overrides */}
      {activeCount > 0 && categories.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
            <div>
              <span className="card-title">Menu Availability Overrides</span>
              <p className="text-secondary text-caption1" style={{ marginTop: 2 }}>
                Temporarily pause menu items on specific platforms without deleting them from the POS.
              </p>
            </div>
            
            {/* Category Select tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <select 
                className="form-select form-select-sm"
                value={selectedCat}
                onChange={e => setSelectedCat(e.target.value)}
                style={{ width: 180 }}
              >
                {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-subhead)' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-separator)' }}>
                  <th style={{ textAlign: 'left', padding: 'var(--space-4) var(--space-5)', color: 'var(--color-label-secondary)' }}>Item</th>
                  <th style={{ textAlign: 'right', padding: 'var(--space-4) var(--space-5)', color: 'var(--color-label-secondary)', width: 100 }}>POS Price</th>
                  {Object.entries(PLATFORM_META).map(([id, meta]) => {
                    const isEnabled = integrations[id]?.enabled === true;
                    return (
                      <th key={id} style={{ textAlign: 'center', padding: 'var(--space-4) var(--space-5)', color: isEnabled ? 'var(--color-label)' : 'var(--color-label-tertiary)', opacity: isEnabled ? 1 : 0.4 }}>
                        <div>{meta.emoji}</div>
                        <div style={{ fontSize: 'var(--text-caption2)', marginTop: 2 }}>{meta.name}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(activeCatData?.items ?? []).map(item => (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--color-separator-opaque)' }}>
                    <td style={{ padding: 'var(--space-4) var(--space-5)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span style={{ fontSize: '1.2rem' }}>{item.emoji}</span>
                        <div>
                          <span style={{ fontWeight: 'var(--weight-semibold)' }}>{item.name}</span>
                          {!item.available && (
                            <span className="badge badge-gray" style={{ marginLeft: 8, fontSize: '0.65rem', padding: '1px 4px' }}>
                              POS Unavailable
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', padding: 'var(--space-4) var(--space-5)', fontWeight: 'var(--weight-semibold)' }}>
                      {formatCurrency(item.price, currency)}
                    </td>
                    {Object.keys(PLATFORM_META).map(platformId => {
                      const isEnabled = integrations[platformId]?.enabled === true;
                      const platformOverride = overrides[platformId]?.[item.id];
                      // Default to item's own POS availability if no override exists
                      const isAvailable = platformOverride ? platformOverride.available !== false : item.available !== false;

                      return (
                        <td key={platformId} style={{ textAlign: 'center', padding: 'var(--space-4) var(--space-5)' }}>
                          <input
                            type="checkbox"
                            disabled={!isEnabled}
                            checked={isEnabled && isAvailable}
                            onChange={() => toggleOverride(platformId, item.id, isAvailable)}
                            style={{ 
                              cursor: isEnabled ? 'pointer' : 'not-allowed',
                              width: 16, height: 16,
                              opacity: isEnabled ? 1 : 0.2
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {(activeCatData?.items ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--color-label-tertiary)' }}>
                      No items found in this category.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
