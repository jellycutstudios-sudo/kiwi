import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '../../stores/orderStore';
import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { printReceipt } from '../../utils/print';
import { sendWhatsAppReceipt } from '../../services/whatsappService';
import { getOrderElapsedSeconds, getOrderTimestampMs } from '../../utils/timezoneUtils';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  X, Printer, Check, ShoppingBag, Utensils, Clock, Zap, Search,
  Edit2, Bell, FileText, Globe, CreditCard, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, LayoutList, LayoutGrid, Eye, MessageCircle, AlertTriangle, AlertCircle, Armchair
} from 'lucide-react';
import toast from 'react-hot-toast';

export const isOrderUnpaid = (order) => {
  if (!order) return false;
  if (order.paid === true) return false;
  if (order.isComplimentary) return false;
  const pm = String(order.paymentMethod || '').toLowerCase().trim();
  if (!pm || pm === 'unpaid' || pm.includes('unpaid')) return true;
  return false;
};

export const isOrderPaid = (order) => !isOrderUnpaid(order);

export default function ActiveOrdersModal({
  isOpen,
  onClose,
  restaurant,
  currency = '₹',
  staffName = 'Cashier',
  onLoadOrderToCart,
  onOpenPayment,
  initialFilter = 'all'
}) {
  const activeOrders = useOrderStore(s => s.activeOrders);
  const updateOrderStatus = useOrderStore(s => s.updateOrderStatus);
  const settleOrder = useOrderStore(s => s.settleOrder);
  const markBillPrinted = useOrderStore(s => s.markBillPrinted);
  const offlineQueue = useOfflineQueueStore(s => s.queue);

  // Primary navigation: 'open' | 'completed' | 'voids'
  const [activeTab, setActiveTab] = useState('open');
  // View mode in Open Orders: 'table' (high density tabular) | 'cards' (visual grid)
  const [viewMode, setViewMode] = useState('table');
  const [filterType, setFilterType] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [settlingId, setSettlingId] = useState(null);
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());
  const [layoutCols, setLayoutCols] = useState('2');

  // History orders for Completed & Voids tabs
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const toggleOrderExpand = (orderId) => {
    setExpandedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  useEffect(() => {
    if (isOpen) {
      setFilterType(initialFilter);
    }
  }, [isOpen, initialFilter]);

  // Fetch today's completed and void orders when modal opens
  useEffect(() => {
    if (!isOpen || !restaurant?.id) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      where('createdAt', '>=', start),
      orderBy('createdAt', 'desc'),
      limit(250)
    );

    setHistoryLoading(true);
    getDocs(q).then(snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHistoryOrders(docs);
    }).catch(err => {
      console.warn('[ActiveOrdersModal] Failed to fetch history orders:', err);
    }).finally(() => {
      setHistoryLoading(false);
    });
  }, [isOpen, restaurant?.id]);

  // Merge Firestore today's history with today's offline-queued orders (for offline / localStorageOnly mode)
  const mergedHistoryOrders = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const startMs = startOfDay.getTime();

    const byId = new Map();
    (historyOrders || []).forEach(o => {
      if (o?.id) byId.set(o.id, o);
    });

    (offlineQueue || []).forEach(o => {
      if (!o?.id) return;
      if (restaurant?.id && o.restaurantId && o.restaurantId !== restaurant.id) return;
      const ts = getOrderTimestampMs(o.createdAt || o.offlineQueuedAt);
      if (ts && ts < startMs) return;
      if (!byId.has(o.id)) {
        byId.set(o.id, {
          ...o,
          createdAt: o.createdAt || o.offlineQueuedAt || new Date().toISOString()
        });
      }
    });

    return Array.from(byId.values()).sort(
      (a, b) => getOrderTimestampMs(b.createdAt) - getOrderTimestampMs(a.createdAt)
    );
  }, [historyOrders, offlineQueue, restaurant?.id]);

  // 1. Running Open Orders (All active orders + any unpaid orders that require settlement)
  const runningOrders = useMemo(() => {
    const active = (activeOrders || []).filter(o => 
      o.status !== 'cancelled' && 
      o.status !== 'void' &&
      (o.status !== 'completed' || isOrderUnpaid(o))
    );

    // Safeguard: pull in any unpaid checks from today's history so no unpaid check is ever orphaned
    const historyUnpaid = mergedHistoryOrders.filter(o => 
      isOrderUnpaid(o) && 
      o.status !== 'cancelled' && 
      o.status !== 'void' && 
      !active.some(a => a.id === o.id)
    );

    return [...active, ...historyUnpaid];
  }, [activeOrders, mergedHistoryOrders]);

  // 2. Paid Bills today (ONLY genuinely paid & settled customer bills)
  const completedOrders = useMemo(() => {
    return mergedHistoryOrders.filter(o => 
      isOrderPaid(o) &&
      o.status !== 'cancelled' && 
      o.status !== 'void'
    );
  }, [mergedHistoryOrders]);

  // 3. Voids / Cancelled orders today
  const voidOrders = useMemo(() => {
    return mergedHistoryOrders.filter(o => o.status === 'cancelled' || o.status === 'void');
  }, [mergedHistoryOrders]);

  const readyCount = useMemo(() => {
    return runningOrders.filter(o => o.status === 'ready').length;
  }, [runningOrders]);

  const onlineOrders = useMemo(() => {
    return runningOrders.filter(o => o.type === 'online' || !!o.source || o.orderType === 'delivery');
  }, [runningOrders]);

  const onlineCount = onlineOrders.length;
  const pendingOnlineCount = useMemo(() => {
    return onlineOrders.filter(o => o.status === 'pending').length;
  }, [onlineOrders]);

  const takeawayCount = useMemo(() => {
    return runningOrders.filter(o => o.type === 'takeaway' || o.type === 'pickup' || (o.type === 'online' && o.orderType === 'takeaway')).length;
  }, [runningOrders]);

  const dineInCount = useMemo(() => {
    return runningOrders.filter(o => o.type === 'dine-in').length;
  }, [runningOrders]);

  // Filtered dataset according to active tab and search
  const displayedOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    if (activeTab === 'open') {
      return runningOrders.filter(o => {
        const isOnline = o.type === 'online' || !!o.source || o.orderType === 'delivery';
        const isTakeaway = o.type === 'takeaway' || o.type === 'pickup' || (isOnline && o.orderType === 'takeaway');
        const isDineIn = o.type === 'dine-in';
        const isReady = o.status === 'ready';

        if (filterType === 'online' && !isOnline) return false;
        if (filterType === 'takeaway' && !isTakeaway) return false;
        if (filterType === 'dine-in' && !isDineIn) return false;
        if (filterType === 'ready' && !isReady) return false;

        if (q) {
          const matchToken = o.token && String(o.token).includes(q);
          const matchTable = o.tableName && o.tableName.toLowerCase().includes(q);
          const matchCust = o.customerName && o.customerName.toLowerCase().includes(q);
          const matchPhone = o.customerPhone && o.customerPhone.includes(q);
          const matchId = o.id && o.id.toLowerCase().includes(q);
          return matchToken || matchTable || matchCust || matchPhone || matchId;
        }
        return true;
      });
    }

    if (activeTab === 'completed') {
      return completedOrders.filter(o => {
        if (!q) return true;
        const matchToken = o.token && String(o.token).includes(q);
        const matchTable = o.tableName && o.tableName.toLowerCase().includes(q);
        const matchCust = o.customerName && o.customerName.toLowerCase().includes(q);
        const matchPhone = o.customerPhone && o.customerPhone.includes(q);
        const matchMethod = o.paymentMethod && o.paymentMethod.toLowerCase().includes(q);
        const matchId = o.id && o.id.toLowerCase().includes(q);
        return matchToken || matchTable || matchCust || matchPhone || matchMethod || matchId;
      });
    }

    if (activeTab === 'voids') {
      return voidOrders.filter(o => {
        if (!q) return true;
        const matchToken = o.token && String(o.token).includes(q);
        const matchTable = o.tableName && o.tableName.toLowerCase().includes(q);
        const matchCust = o.customerName && o.customerName.toLowerCase().includes(q);
        const matchReason = (o.cancelReason || o.voidReason || '').toLowerCase().includes(q);
        const matchId = o.id && o.id.toLowerCase().includes(q);
        return matchToken || matchTable || matchCust || matchReason || matchId;
      });
    }

    return [];
  }, [activeTab, runningOrders, completedOrders, voidOrders, filterType, searchQuery]);

  if (!isOpen) return null;

  const handlePrint = async (order) => {
    try {
      printReceipt({
        restaurant,
        order,
        items: order.items || [],
        taxInfo: order.taxInfo,
        staffName: order.staffName || staffName,
      });
      await markBillPrinted(restaurant.id, order.id, order.staffName || staffName);
      toast.success(`Bill printed · ${order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : 'Order')}`, { id: 'pos-action', icon: '🖨️' });
    } catch (err) {
      toast.error('Print failed: ' + err.message);
    }
  };

  const handleQuickCashSettle = async (order, shouldPrint = !order.billPrinted) => {
    if (settlingId) return;
    setSettlingId(order.id);
    try {
      await settleOrder(restaurant.id, order.id, 'cash', order.total);

      // Upsert into historyOrders locally so Paid tab & count update immediately even for live orders
      const settledOrder = {
        ...order,
        paymentMethod: 'cash',
        paid: true,
        status: 'billed',
        paidAt: new Date().toISOString()
      };
      setHistoryOrders(prev => [settledOrder, ...prev.filter(o => o.id !== order.id)]);

      // Auto-dispatch WhatsApp digital receipt if enabled and customer phone is present
      const custPhone = order.customerPhone || order.customer?.phone;
      const waConfig = restaurant?.whatsapp || restaurant?.settings?.whatsapp;
      const isWaActive = waConfig?.enabled === true || (waConfig?.enabled !== false && Boolean(waConfig?.phoneNumberId && waConfig?.accessToken));
      if (custPhone && isWaActive) {
        sendWhatsAppReceipt({
          restaurant,
          orderId: order.id,
          customerName: order.customerName || order.customer?.name || '',
          customerPhone: custPhone,
          items: order.items || [],
          total: order.total,
          currency: restaurant?.currency || 'INR',
          paymentMethod: 'cash',
          token: order.token || null
        }).then(waRes => {
          if (waRes.ok) {
            toast.success(`WhatsApp receipt sent to +${waRes.phone}`, { icon: '📲', duration: 3000 });
          } else {
            console.warn('[ActiveOrders] WhatsApp send skipped/failed:', waRes.error);
          }
        }).catch(err => console.warn('[ActiveOrders] WhatsApp send error:', err));
      }

      if (shouldPrint) {
        toast.success(`Paid via Cash ✓ Printing receipt`, { id: 'pos-action' });
        setTimeout(() => {
          printReceipt({
            restaurant,
            order: { ...order, paymentMethod: 'cash' },
            items: order.items || [],
            taxInfo: order.taxInfo,
            staffName,
          });
        }, 100);
      } else {
        toast.success(`Paid via Cash ✓ (No duplicate print)`, { id: 'pos-action' });
      }
    } catch (err) {
      toast.error('Settle failed: ' + err.message);
    } finally {
      setSettlingId(null);
    }
  };

  const handleWhatsAppResend = (order) => {
    const custPhone = order.customerPhone || order.customer?.phone;
    if (!custPhone) {
      toast.error('No phone number attached to this order');
      return;
    }
    sendWhatsAppReceipt({
      restaurant,
      orderId: order.id,
      customerName: order.customerName || order.customer?.name || '',
      customerPhone: custPhone,
      items: order.items || [],
      total: order.total,
      currency: restaurant?.currency || 'INR',
      paymentMethod: order.paymentMethod || 'cash',
      token: order.token || null
    }).then(waRes => {
      if (waRes.ok) {
        toast.success(`Receipt sent to +${waRes.phone}`, { icon: '📲' });
      } else {
        toast.error('WhatsApp dispatch failed');
      }
    }).catch(err => toast.error('Error: ' + err.message));
  };

  const handleMarkComplete = async (order) => {
    if (isOrderUnpaid(order)) {
      toast.error(`Order #${order.token || order.id.slice(-4).toUpperCase()} is unpaid (${formatCurrency(order.total || 0, currency)}). Please settle payment first!`, { id: 'pos-action' });
      return;
    }
    try {
      await updateOrderStatus(restaurant.id, order.id, 'completed');
      toast.success(`Order completed ✓`, { id: 'pos-action' });
    } catch (err) {
      toast.error('Update failed: ' + err.message);
    }
  };

  const now = Date.now();

  const formatOrderTime = (order) => {
    const ts = getOrderTimestampMs(order?.createdAt);
    if (!ts) return '—';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.72)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      zIndex: 99990,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        background: 'var(--color-bg, #0f172a)',
        borderRadius: 'var(--radius-xl, 18px)',
        width: '1100px',
        maxWidth: 'min(1100px, 96vw)',
        height: 'min(820px, 94vh)',
        minHeight: 'min(620px, 88vh)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.1)',
        overflow: 'hidden',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '14px 20px',
          borderBottom: '1px solid var(--color-separator-opaque, rgba(255, 255, 255, 0.1))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-bg-secondary, #1e293b)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--color-accent, #38bdf8)'
            }}>
              <FileText size={20} />
            </div>
            <div>
              <h2 className="orders-modal-title" style={{ fontSize: 17, fontWeight: 800, margin: 0, color: '#ffffff' }}>
                Order Center &amp; Kitchen Pass
              </h2>
              <p className="orders-modal-subtitle" style={{ fontSize: 12, color: 'var(--color-label-secondary, #94a3b8)', margin: '2px 0 0' }}>
                Track live orders, reprint completed customer receipts, and review void audit logs
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* View Switcher: Table vs Cards (only active on Open Orders) */}
            {activeTab === 'open' && (
              <div className="orders-view-switcher">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`orders-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                  title="Compact Table / List View"
                >
                  <LayoutList size={14} /> <span className="orders-view-label">Table View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`orders-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
                  title="Visual Kitchen Cards"
                >
                  <LayoutGrid size={14} /> <span className="orders-view-label">Cards View</span>
                </button>
              </div>
            )}

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              style={{ width: 34, height: 34, padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              aria-label="Close modal"
            >
              <X size={19} />
            </button>
          </div>
        </div>

        {/* 3 Main Top Navigation Tabs (Open Orders · Completed Orders · Voids) */}
        <div className="orders-center-tabs">
          <button
            type="button"
            className={`orders-center-tab ${activeTab === 'open' ? 'active' : ''}`}
            onClick={() => setActiveTab('open')}
          >
            <Clock size={14} />
            <span className="orders-tab-label-full">Open Orders</span>
            <span className="orders-tab-label-short">Open</span>
            <span className="orders-tab-badge">{runningOrders.length}</span>
          </button>

          <button
            type="button"
            className={`orders-center-tab ${activeTab === 'completed' ? 'active' : ''}`}
            onClick={() => setActiveTab('completed')}
          >
            <CheckCircle2 size={14} />
            <span className="orders-tab-label-full">Paid Bills</span>
            <span className="orders-tab-label-short">Paid</span>
            <span className="orders-tab-badge secondary">{completedOrders.length}</span>
          </button>

          <button
            type="button"
            className={`orders-center-tab ${activeTab === 'voids' ? 'active' : ''}`}
            onClick={() => setActiveTab('voids')}
          >
            <XCircle size={14} />
            <span className="orders-tab-label-full">Voids / Cancelled</span>
            <span className="orders-tab-label-short">Voids</span>
            {voidOrders.length > 0 && <span className="orders-tab-badge danger">{voidOrders.length}</span>}
          </button>
        </div>

        {/* Filter Pills & Quick Search Bar */}
        <div className="orders-filter-bar" style={{
          padding: '10px 20px',
          borderBottom: '1px solid var(--color-separator-opaque, rgba(255, 255, 255, 0.08))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          background: 'var(--color-bg, #0f172a)',
        }}>
          {/* Channel Filters (Shown on Open Orders Tab) */}
          {activeTab === 'open' ? (
            <div className="orders-filter-pills" style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', overflowX: 'auto' }}>
              <button
                type="button"
                className={`btn ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterType('all')}
                style={{ fontWeight: 700, borderRadius: 20, height: 32, padding: '0 12px', fontSize: 12 }}
              >
                All ({runningOrders.length})
              </button>
              <button
                type="button"
                className={`btn ${filterType === 'ready' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterType('ready')}
                style={{
                  fontWeight: 700,
                  borderRadius: 20,
                  height: 32,
                  padding: '0 12px',
                  fontSize: 12,
                  background: filterType === 'ready' ? '#10b981' : (readyCount > 0 ? 'rgba(16, 185, 129, 0.15)' : undefined),
                  color: filterType === 'ready' ? '#fff' : (readyCount > 0 ? '#10b981' : undefined),
                  borderColor: readyCount > 0 ? 'rgba(16, 185, 129, 0.4)' : undefined,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <Bell size={13} /> Ready ({readyCount})
              </button>
              <button
                type="button"
                className={`btn ${filterType === 'online' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterType('online')}
                style={{
                  fontWeight: 700,
                  borderRadius: 20,
                  height: 32,
                  padding: '0 12px',
                  fontSize: 12,
                  background: filterType === 'online' ? '#8b5cf6' : (onlineCount > 0 ? 'rgba(139, 92, 246, 0.15)' : undefined),
                  color: filterType === 'online' ? '#fff' : (onlineCount > 0 ? '#8b5cf6' : undefined),
                  borderColor: onlineCount > 0 ? 'rgba(139, 92, 246, 0.4)' : undefined,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <Globe size={13} /> Online ({onlineCount})
                {pendingOnlineCount > 0 && (
                  <span style={{
                    background: '#ef4444',
                    color: '#fff',
                    borderRadius: 10,
                    fontSize: 10,
                    padding: '1px 5px',
                    fontWeight: 800,
                    marginLeft: 2
                  }}>
                    {pendingOnlineCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                className={`btn ${filterType === 'takeaway' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterType('takeaway')}
                style={{ fontWeight: 700, borderRadius: 20, height: 32, padding: '0 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <ShoppingBag size={13} /> Takeaway ({takeawayCount})
              </button>
              <button
                type="button"
                className={`btn ${filterType === 'dine-in' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilterType('dine-in')}
                style={{ fontWeight: 700, borderRadius: 20, height: 32, padding: '0 12px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Utensils size={13} /> Dine In ({dineInCount})
              </button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--color-label-secondary)', fontWeight: 600 }}>
              {activeTab === 'completed' && `Viewing ${displayedOrders.length} finalized customer bills settled today`}
              {activeTab === 'voids' && `Viewing ${displayedOrders.length} voided/cancelled ticket audits today`}
            </div>
          )}

          {/* Quick Search */}
          <div className="orders-search-wrap" style={{ position: 'relative', width: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-tertiary)' }} />
            <input
              type="text"
              placeholder={activeTab === 'open' ? 'Search token #, table, name...' : 'Search order #, customer...'}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: 32, paddingRight: searchQuery ? 28 : 10, height: 32, fontSize: 12.5, borderRadius: 16 }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  padding: 2,
                  cursor: 'pointer',
                  color: 'var(--color-label-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                aria-label="Clear search"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Order List / Table Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {displayedOrders.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 20px',
              color: 'var(--color-label-secondary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              gap: 10
            }}>
              {activeTab === 'open' ? (
                <>
                  <FileText size={36} color="var(--color-label-tertiary)" />
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-label)' }}>No active orders found</div>
                  <div style={{ fontSize: 12 }}>All kitchen orders have been served, settled, or completed!</div>
                </>
              ) : activeTab === 'completed' ? (
                <>
                  <CheckCircle2 size={36} color="#10b981" />
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-label)' }}>No paid bills yet today</div>
                  <div style={{ fontSize: 12 }}>Settled guest checks will appear here for receipt re-printing.</div>
                </>
              ) : (
                <>
                  <CheckCircle2 size={36} color="#10b981" />
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-label)' }}>No voided orders today</div>
                  <div style={{ fontSize: 12 }}>Clean service! No tickets have been cancelled or voided.</div>
                </>
              )}
            </div>
          ) : (
            <>
              {/* TAB 1: OPEN ORDERS */}
              {activeTab === 'open' && (
                <>
                  {/* MODE A: STREAMLINED TABLE VIEW */}
                  {viewMode === 'table' && (
                    <div className="orders-table-wrapper">
                      <table className="orders-table">
                        <thead>
                          <tr>
                            <th className="col-time" style={{ width: 65 }}>Time</th>
                            <th style={{ minWidth: 120 }}>Order / Table</th>
                            <th className="col-items" style={{ minWidth: 140 }}>Items Summary</th>
                            <th className="col-status" style={{ width: 85 }}>Status</th>
                            <th style={{ width: 80, textAlign: 'right' }}>Total</th>
                            <th style={{ width: 270, textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayedOrders.map((order) => {
                            const isOnline = order.type === 'online' || !!order.source || order.orderType === 'delivery';
                            const isDelivery = order.orderType === 'delivery';
                            const isTakeaway = order.type === 'takeaway' || order.type === 'pickup' || (isOnline && order.orderType === 'takeaway');
                            const isReady = order.status === 'ready';
                            const isUnpaid = isOrderUnpaid(order);
                            const elapsedSec = getOrderElapsedSeconds(order, now);
                            const elapsedMins = Math.floor(elapsedSec / 60);
                            const itemsCount = (order.items || []).reduce((sum, i) => sum + (i.qty || 1), 0);
                            const isExpanded = expandedOrderIds.has(order.id);
                            const ticketNum = order.token ? `#${order.token}` : `#${order.id.slice(-4).toUpperCase()}`;

                            return (
                              <tr key={order.id}>
                                {/* 1. Time / Elapsed Timer */}
                                <td className="col-time">
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 3,
                                    fontSize: 11.5,
                                    fontWeight: elapsedMins > 15 ? 800 : 600,
                                    color: elapsedMins > 25 ? '#ef4444' : (elapsedMins > 15 ? '#f59e0b' : '#10b981')
                                  }} title={`Placed at ${formatOrderTime(order)}`}>
                                    <Clock size={11} /> {elapsedMins}m
                                  </span>
                                </td>

                                {/* 2. Order / Table */}
                                <td>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                      <span style={{
                                        fontWeight: 800,
                                        fontSize: 13,
                                        color: '#ffffff',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4
                                      }}>
                                        {order.tableName ? (
                                          <><Armchair size={13} color="#10b981" /> Table {order.tableName}</>
                                        ) : order.token ? (
                                          `Token #${order.token}`
                                        ) : (
                                          isDelivery ? 'Delivery' : (isTakeaway ? 'Takeaway' : 'Order')
                                        )}
                                      </span>
                                      <span style={{
                                        fontFamily: 'var(--font-mono, monospace)',
                                        fontSize: 10,
                                        color: 'var(--color-label-tertiary, #94a3b8)',
                                        background: 'rgba(255, 255, 255, 0.06)',
                                        padding: '1px 4px',
                                        borderRadius: 4
                                      }}>
                                        {ticketNum}
                                      </span>
                                      {isOnline && (
                                        <span className="badge badge-purple" style={{ fontSize: 9, padding: '1px 5px' }}>
                                          {order.source || 'Online'}
                                        </span>
                                      )}
                                    </div>
                                    {order.customerName && (
                                      <span style={{ fontSize: 11, color: 'var(--color-label-secondary)' }}>
                                        {order.customerName}
                                      </span>
                                    )}

                                    {/* Mobile-only compact subtitle with timer and status */}
                                    <div className="orders-mobile-sub">
                                      <span style={{ fontSize: 11, fontWeight: 700, color: elapsedMins > 25 ? '#ef4444' : (elapsedMins > 15 ? '#f59e0b' : '#10b981') }}>
                                        ⏱️ {elapsedMins >= 60 ? `${Math.floor(elapsedMins / 60)}h ${elapsedMins % 60}m` : `${elapsedMins}m`}
                                      </span>
                                      <span className={`badge ${isReady ? 'badge-green' : (order.status === 'completed' && isUnpaid ? 'badge-red' : 'badge-yellow')}`} style={{ fontSize: 10, padding: '1px 6px' }}>
                                        {isReady ? 'READY' : (order.status === 'completed' && isUnpaid ? 'SERVED DUE' : 'In Kitchen')}
                                      </span>
                                      <span style={{ fontSize: 11, color: 'var(--color-label-tertiary)' }}>
                                        {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                                      </span>
                                    </div>
                                  </div>
                                </td>

                                {/* 3. Items Summary */}
                                <td className="col-items">
                                  <div 
                                    onClick={() => toggleOrderExpand(order.id)} 
                                    style={{ cursor: 'pointer' }}
                                    title="Click to view full dish breakdown"
                                  >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                      <span style={{ fontSize: 12, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 180 }}>
                                        {(order.items || []).map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).join(', ')}
                                      </span>
                                      <span style={{ color: 'var(--color-label-tertiary)' }}>
                                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                      </span>
                                    </div>
                                    <span style={{ fontSize: 10, color: 'var(--color-label-tertiary)' }}>
                                      {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                                    </span>

                                    {/* Expanded Item Breakdown */}
                                    {isExpanded && (
                                      <div style={{
                                        marginTop: 6,
                                        padding: '6px 8px',
                                        background: 'rgba(0, 0, 0, 0.35)',
                                        borderRadius: 6,
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: 3
                                      }}>
                                        {(order.items || []).map((item, mIdx) => (
                                          <div key={mIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                                            <span><strong style={{ color: '#fff' }}>{item.qty}×</strong> {item.name}</span>
                                            <span style={{ color: 'var(--color-label-secondary)' }}>{formatCurrency((item.price || 0) * (item.qty || 1), currency)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </td>

                                {/* 4. Status Badges */}
                                <td className="col-status">
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                                    {isReady ? (
                                      <span style={{
                                        background: 'rgba(16, 185, 129, 0.2)',
                                        color: '#34d399',
                                        border: '1px solid rgba(16, 185, 129, 0.5)',
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                        fontSize: 10,
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 3
                                      }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399' }} />
                                        READY
                                      </span>
                                    ) : order.status === 'completed' && isUnpaid ? (
                                      <span style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        color: '#f87171',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                        fontSize: 10,
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 3
                                      }}>
                                        <AlertCircle size={9} /> SERVED DUE
                                      </span>
                                    ) : (
                                      <span style={{
                                        background: 'rgba(245, 158, 11, 0.15)',
                                        color: '#fbbf24',
                                        border: '1px solid rgba(245, 158, 11, 0.4)',
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                        fontSize: 10,
                                        fontWeight: 700
                                      }}>
                                        In Kitchen
                                      </span>
                                    )}

                                    {order.billPrinted && isUnpaid && (
                                      <span style={{
                                        background: 'rgba(56, 189, 248, 0.12)',
                                        color: '#38bdf8',
                                        border: '1px solid rgba(56, 189, 248, 0.3)',
                                        padding: '1px 5px',
                                        borderRadius: 4,
                                        fontSize: 9.5,
                                        fontWeight: 700,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 2.5
                                      }}>
                                        <Printer size={8} /> Bill Printed
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* 5. Total Amount */}
                                <td style={{ textAlign: 'right' }}>
                                  <span style={{ fontSize: 14.5, fontWeight: 900, color: '#38bdf8', letterSpacing: '-0.2px' }}>
                                    {formatCurrency(order.total ?? 0, currency)}
                                  </span>
                                </td>

                                {/* 6. Compact Touch Actions (Zero Overflow) */}
                                <td style={{ textAlign: 'right' }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                                    {/* Resume / Edit */}
                                    {onLoadOrderToCart && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onLoadOrderToCart(order);
                                          onClose();
                                        }}
                                        style={{
                                          height: 28,
                                          fontSize: 11,
                                          fontWeight: 700,
                                          padding: '0 7px',
                                          borderRadius: 6,
                                          background: 'rgba(255, 255, 255, 0.08)',
                                          border: '1px solid rgba(255, 255, 255, 0.18)',
                                          color: '#ffffff',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 3,
                                          cursor: 'pointer',
                                          whiteSpace: 'nowrap'
                                        }}
                                        title="Resume / Edit order in cart"
                                      >
                                        <Edit2 size={10} /> Resume
                                      </button>
                                    )}

                                    {/* Print Bill */}
                                    <button
                                      type="button"
                                      onClick={() => handlePrint(order)}
                                      className="orders-btn-bill"
                                      style={{
                                        height: 28,
                                        fontSize: 11,
                                        fontWeight: 700,
                                        padding: '0 7px',
                                        borderRadius: 6,
                                        background: order.billPrinted ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.08)',
                                        border: order.billPrinted ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.18)',
                                        color: order.billPrinted ? '#38bdf8' : '#e2e8f0',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 3,
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title={order.billPrinted ? "Bill already printed. Tap to reprint bill." : "Print Customer Bill"}
                                    >
                                      <Printer size={10} /> {order.billPrinted ? 'Bill ✓' : 'Bill'}
                                    </button>

                                    {/* Settle (Card / Quick Cash) */}
                                    {isUnpaid ? (
                                      <>
                                        {onOpenPayment && (
                                          <button
                                            type="button"
                                            className="orders-btn-card-upi"
                                            onClick={() => {
                                              onLoadOrderToCart(order);
                                              onClose();
                                              onOpenPayment();
                                            }}
                                            style={{
                                              height: 28,
                                              fontSize: 11,
                                              fontWeight: 700,
                                              padding: '0 7px',
                                              borderRadius: 6,
                                              background: 'rgba(56, 189, 248, 0.12)',
                                              border: '1px solid rgba(56, 189, 248, 0.35)',
                                              color: '#38bdf8',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 3,
                                              cursor: 'pointer',
                                              whiteSpace: 'nowrap'
                                            }}
                                            title="Card / UPI Payment"
                                          >
                                            <CreditCard size={10} /> Card
                                          </button>
                                        )}

                                        {/* Single Clean Quick Cash Action */}
                                        <button
                                          type="button"
                                          aria-label="Quick Cash"
                                          onClick={() => handleQuickCashSettle(order, !order.billPrinted)}
                                          disabled={settlingId === order.id}
                                          style={{
                                            height: 30,
                                            fontSize: 11.5,
                                            fontWeight: 700,
                                            padding: '0 12px',
                                            borderRadius: 8,
                                            background: '#10b981',
                                            border: '1px solid rgba(52, 211, 153, 0.4)',
                                            color: '#ffffff',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 4,
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                            flexShrink: 0
                                          }}
                                          title={order.billPrinted ? "Quick Cash (Duplicate print skipped)" : "Quick Cash Settle & Print"}
                                        >
                                          <Zap size={11} fill="#fff" /> Quick Cash
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleMarkComplete(order)}
                                        style={{
                                          height: 28,
                                          fontSize: 11,
                                          fontWeight: 800,
                                          padding: '0 9px',
                                          borderRadius: 6,
                                          background: 'var(--color-primary, #3b82f6)',
                                          border: 'none',
                                          color: '#ffffff',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 3,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <Check size={11} strokeWidth={2.5} /> Done
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* MODE B: VISUAL CARDS VIEW */}
                  {viewMode === 'cards' && (
                    <div style={{
                      padding: '16px 20px',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
                      alignContent: 'start',
                      gap: 12
                    }}>
                      {displayedOrders.map(order => {
                        const isOnline = order.type === 'online' || !!order.source || order.orderType === 'delivery';
                        const isDelivery = order.orderType === 'delivery';
                        const isTakeaway = order.type === 'takeaway' || order.type === 'pickup' || (isOnline && order.orderType === 'takeaway');
                        const isReady = order.status === 'ready';
                        const isPending = order.status === 'pending';
                        const isOnlinePending = isOnline && isPending;
                        const isUnpaid = isOrderUnpaid(order);
                        const elapsedSec = getOrderElapsedSeconds(order, now);
                        const elapsedMins = Math.floor(elapsedSec / 60);
                        const itemsCount = (order.items || []).reduce((sum, i) => sum + (i.qty || 1), 0);
                        const isExpanded = expandedOrderIds.has(order.id);

                        return (
                          <div
                            key={order.id}
                            style={{
                              background: 'var(--color-card, #181b26)',
                              borderRadius: 14,
                              border: isOnlinePending ? '1.5px solid #a855f7' : (isReady ? '1.5px solid #10b981' : '1.5px solid rgba(255, 255, 255, 0.13)'),
                              padding: '12px 14px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 10,
                              overflow: 'hidden',
                              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            {/* Top Bar: Table/Order Title + Meta Info on Left, Bill Amount on Right */}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: 16, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px' }}>
                                    {order.tableName 
                                      ? `Table ${order.tableName}` 
                                      : (order.token 
                                          ? `Token #${order.token}` 
                                          : (isDelivery ? 'Delivery' : (isTakeaway ? 'Takeaway' : (isOnline ? 'Online Order' : 'Order'))))}
                                  </span>
                                  {isOnline && (
                                    <span style={{
                                      fontSize: 10,
                                      fontWeight: 800,
                                      textTransform: 'uppercase',
                                      background: 'rgba(168, 85, 247, 0.2)',
                                      color: '#c084fc',
                                      padding: '2px 6px',
                                      borderRadius: 4,
                                      border: '1px solid rgba(168, 85, 247, 0.4)'
                                    }}>
                                      {order.source ? String(order.source).toUpperCase() : 'ONLINE'}
                                    </span>
                                  )}
                                  {isReady && (
                                    <span style={{
                                      background: 'rgba(16, 185, 129, 0.2)',
                                      color: '#34d399',
                                      border: '1px solid rgba(16, 185, 129, 0.5)',
                                      padding: '2px 7px',
                                      borderRadius: 6,
                                      fontSize: 11,
                                      fontWeight: 800,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}>
                                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399' }} />
                                      READY
                                    </span>
                                  )}
                                  {order.status === 'completed' && isUnpaid && (
                                    <span style={{
                                      background: 'rgba(239, 68, 68, 0.2)',
                                      color: '#f87171',
                                      border: '1px solid rgba(239, 68, 68, 0.5)',
                                      padding: '2px 7px',
                                      borderRadius: 6,
                                      fontSize: 11,
                                      fontWeight: 800,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4
                                    }}>
                                      <AlertCircle size={11} />
                                      SERVED · DUE
                                    </span>
                                  )}
                                  {order.billPrinted && isUnpaid && (
                                    <span style={{
                                      background: 'rgba(56, 189, 248, 0.12)',
                                      color: '#38bdf8',
                                      border: '1px solid rgba(56, 189, 248, 0.3)',
                                      padding: '2px 7px',
                                      borderRadius: 6,
                                      fontSize: 10.5,
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 3.5
                                    }}>
                                      <Printer size={10} /> Bill Printed
                                    </span>
                                  )}
                                </div>

                                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span>{itemsCount} items</span>
                                  <span>•</span>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: elapsedMins > 25 ? '#f87171' : (elapsedMins > 15 ? '#fbbf24' : '#94a3b8'), fontWeight: elapsedMins > 15 ? 700 : 500 }}>
                                    <Clock size={11} /> {elapsedMins}m
                                  </span>
                                  {order.customerName && (
                                    <>
                                      <span>•</span>
                                      <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{order.customerName}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <span style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8' }}>
                                  {formatCurrency(order.total ?? 0, currency)}
                                </span>
                              </div>
                            </div>

                            {/* Items Preview Line */}
                            <div 
                              onClick={() => toggleOrderExpand(order.id)}
                              style={{ cursor: 'pointer', padding: '2px 0' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <span style={{ fontSize: 12.5, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                  {(order.items || []).map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).join(', ')}
                                </span>
                                <span style={{ color: '#64748b' }}>
                                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </span>
                              </div>

                              {isExpanded && (
                                <div style={{
                                  marginTop: 8,
                                  padding: '8px 10px',
                                  background: 'rgba(0, 0, 0, 0.25)',
                                  borderRadius: 8,
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: 6
                                }}>
                                  {(order.items || []).map((item, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                                      <span><strong>{item.qty}×</strong> {item.name}</span>
                                      <span style={{ fontWeight: 700, color: '#94a3b8' }}>{formatCurrency((item.price || 0) * (item.qty || 1), currency)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 8, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {onLoadOrderToCart && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onLoadOrderToCart(order);
                                      onClose();
                                    }}
                                    style={{
                                      height: 34,
                                      fontSize: 12,
                                      fontWeight: 700,
                                      gap: 4.5,
                                      padding: '0 9px',
                                      borderRadius: 8,
                                      background: 'rgba(255, 255, 255, 0.07)',
                                      border: '1px solid rgba(255, 255, 255, 0.15)',
                                      color: '#e2e8f0',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <Edit2 size={12} /> Edit
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handlePrint(order)}
                                  style={{
                                    height: 34,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    gap: 4.5,
                                    padding: '0 9px',
                                    borderRadius: 8,
                                    background: order.billPrinted ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.07)',
                                    border: order.billPrinted ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.15)',
                                    color: order.billPrinted ? '#38bdf8' : '#e2e8f0',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    cursor: 'pointer'
                                  }}
                                >
                                  <Printer size={12} /> {order.billPrinted ? 'Bill ✓' : 'Bill'}
                                </button>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                {isUnpaid ? (
                                  <>
                                    {onOpenPayment && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onLoadOrderToCart(order);
                                          onClose();
                                          onOpenPayment();
                                        }}
                                        style={{
                                          height: 34,
                                          fontSize: 12,
                                          fontWeight: 700,
                                          gap: 4.5,
                                          padding: '0 9px',
                                          borderRadius: 8,
                                          background: 'rgba(56, 189, 248, 0.1)',
                                          border: '1px solid rgba(56, 189, 248, 0.35)',
                                          color: '#38bdf8',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <CreditCard size={12} /> Card / UPI
                                      </button>
                                    )}

                                    <div style={{
                                      display: 'inline-flex',
                                      alignItems: 'stretch',
                                      borderRadius: 8,
                                      overflow: 'hidden',
                                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                                    }}>
                                      <button
                                        type="button"
                                        aria-label="Quick Cash"
                                        onClick={() => handleQuickCashSettle(order, !order.billPrinted)}
                                        disabled={settlingId === order.id}
                                        style={{
                                          height: 34,
                                          fontSize: 12,
                                          fontWeight: 800,
                                          gap: 4,
                                          padding: '0 10px',
                                          background: '#10b981',
                                          border: 'none',
                                          color: '#ffffff',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <Zap size={12} fill="#fff" /> Quick Cash
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Print Receipt & Settle"
                                        onClick={() => handleQuickCashSettle(order, true)}
                                        disabled={settlingId === order.id}
                                        style={{
                                          height: 34,
                                          padding: '0 8px',
                                          background: '#059669',
                                          border: 'none',
                                          borderLeft: '1px solid rgba(255, 255, 255, 0.25)',
                                          color: '#ffffff',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <Printer size={12} />
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkComplete(order)}
                                    style={{
                                      height: 34,
                                      fontSize: 12,
                                      fontWeight: 800,
                                      gap: 5,
                                      padding: '0 12px',
                                      borderRadius: 8,
                                      background: 'var(--color-primary, #3b82f6)',
                                      border: 'none',
                                      color: '#ffffff',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <Check size={13} strokeWidth={2.5} /> Complete
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}

              {/* TAB 2: COMPLETED ORDERS */}
              {activeTab === 'completed' && (
                <div className="orders-table-wrapper">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>#</th>
                        <th style={{ width: 110 }}>Settled Time</th>
                        <th style={{ minWidth: 150 }}>Table / Guest</th>
                        <th style={{ minWidth: 220 }}>Items Breakdown</th>
                        <th style={{ width: 120 }}>Payment</th>
                        <th style={{ width: 110, textAlign: 'right' }}>Total Paid</th>
                        <th style={{ minWidth: 220, textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedOrders.map(order => {
                        const ticketNum = order.token ? `#${order.token}` : `#${order.id.slice(-4).toUpperCase()}`;
                        const isExpanded = expandedOrderIds.has(order.id);
                        const method = (order.paymentMethod || 'cash').toUpperCase();
                        const itemsCount = (order.items || []).reduce((sum, i) => sum + (i.qty || 1), 0);
                        const settleTime = order.paidAt || order.updatedAt || order.createdAt;

                        return (
                          <tr key={order.id}>
                            {/* 1. Ticket # */}
                            <td>
                              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800, color: '#ffffff', fontSize: 13 }}>
                                {ticketNum}
                              </span>
                            </td>

                            {/* 2. Settled Time */}
                            <td>
                              <span style={{ fontSize: 12, color: 'var(--color-label-secondary)' }}>
                                {settleTime ? new Date(getOrderTimestampMs(settleTime)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </span>
                            </td>

                            {/* 3. Table / Guest */}
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <span style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>
                                  {order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : 'Walk-in / Takeaway')}
                                </span>
                                {order.customerName && (
                                  <span style={{ fontSize: 11.5, color: 'var(--color-label-secondary)' }}>
                                    {order.customerName} {order.customerPhone ? `(${order.customerPhone})` : ''}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 4. Items */}
                            <td>
                              <div 
                                onClick={() => toggleOrderExpand(order.id)} 
                                style={{ cursor: 'pointer' }}
                                title="Click to view full breakdown"
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>
                                    {(order.items || []).map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).join(', ')}
                                  </span>
                                  <span style={{ color: 'var(--color-label-tertiary)' }}>
                                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                  </span>
                                </div>
                                <span style={{ fontSize: 10.5, color: 'var(--color-label-tertiary)' }}>
                                  {itemsCount} {itemsCount === 1 ? 'item' : 'items'}
                                </span>

                                {isExpanded && (
                                  <div style={{
                                    marginTop: 6,
                                    padding: '6px 8px',
                                    background: 'rgba(0, 0, 0, 0.35)',
                                    borderRadius: 6,
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 3
                                  }}>
                                    {(order.items || []).map((item, mIdx) => (
                                      <div key={mIdx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
                                        <span><strong style={{ color: '#fff' }}>{item.qty}×</strong> {item.name}</span>
                                        <span style={{ color: 'var(--color-label-secondary)' }}>{formatCurrency((item.price || 0) * (item.qty || 1), currency)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* 5. Payment Method */}
                            <td>
                              {isOrderUnpaid(order) ? (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  background: 'rgba(239, 68, 68, 0.15)',
                                  color: '#ef4444',
                                  border: '1px solid rgba(239, 68, 68, 0.4)'
                                }}>
                                  <AlertCircle size={11} /> UNPAID · DUE
                                </span>
                              ) : (
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                  padding: '2px 8px',
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  background: method === 'CASH' ? 'rgba(16, 185, 129, 0.15)' : (method === 'UPI' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(56, 189, 248, 0.15)'),
                                  color: method === 'CASH' ? '#10b981' : (method === 'UPI' ? '#c084fc' : '#38bdf8'),
                                  border: `1px solid ${method === 'CASH' ? 'rgba(16, 185, 129, 0.35)' : (method === 'UPI' ? 'rgba(139, 92, 246, 0.35)' : 'rgba(56, 189, 248, 0.35)')}`
                                }}>
                                  <Check size={11} strokeWidth={2.5} /> {method}
                                </span>
                              )}
                            </td>

                            {/* 6. Total Amount */}
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: 15, fontWeight: 900, color: '#10b981' }}>
                                {formatCurrency(order.total ?? 0, currency)}
                              </span>
                            </td>

                            {/* 7. Action Buttons */}
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                                {/* 1-Tap Cash Settle Rescue if check was somehow unsettled */}
                                {isOrderUnpaid(order) && (
                                  <button
                                    type="button"
                                    onClick={() => handleQuickCashSettle(order, false)}
                                    disabled={settlingId === order.id}
                                    style={{
                                      height: 32,
                                      fontSize: 11.5,
                                      fontWeight: 800,
                                      padding: '0 10px',
                                      borderRadius: 6,
                                      background: '#10b981',
                                      border: 'none',
                                      color: '#ffffff',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      cursor: 'pointer'
                                    }}
                                    title="Settle this unpaid check with cash"
                                  >
                                    <Zap size={11} fill="#fff" /> Settle Cash
                                  </button>
                                )}

                                {/* Re-Print Customer Receipt */}
                                <button
                                  type="button"
                                  onClick={() => handlePrint(order)}
                                  style={{
                                    height: 32,
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    padding: '0 9px',
                                    borderRadius: 6,
                                    background: 'rgba(255, 255, 255, 0.08)',
                                    border: '1px solid rgba(255, 255, 255, 0.18)',
                                    color: '#ffffff',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    cursor: 'pointer'
                                  }}
                                  title="Re-Print Settled Customer Receipt"
                                >
                                  <Printer size={12} /> Re-Print
                                </button>

                                {/* WhatsApp Resend */}
                                {(order.customerPhone || order.customer?.phone) && (
                                  <button
                                    type="button"
                                    onClick={() => handleWhatsAppResend(order)}
                                    style={{
                                      height: 32,
                                      fontSize: 11.5,
                                      fontWeight: 700,
                                      padding: '0 9px',
                                      borderRadius: 6,
                                      background: 'rgba(37, 211, 102, 0.15)',
                                      border: '1px solid rgba(37, 211, 102, 0.4)',
                                      color: '#25d366',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      cursor: 'pointer'
                                    }}
                                    title="Send WhatsApp Digital Receipt"
                                  >
                                    <MessageCircle size={12} /> WhatsApp
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* TAB 3: VOIDS / CANCELLED ORDERS */}
              {activeTab === 'voids' && (
                <div className="orders-table-wrapper">
                  <table className="orders-table">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>#</th>
                        <th style={{ width: 110 }}>Time Voided</th>
                        <th style={{ minWidth: 140 }}>Table / Order</th>
                        <th style={{ minWidth: 220 }}>Items Cancelled</th>
                        <th style={{ minWidth: 160 }}>Void Reason</th>
                        <th style={{ width: 110, textAlign: 'right' }}>Void Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedOrders.map(order => {
                        const ticketNum = order.token ? `#${order.token}` : `#${order.id.slice(-4).toUpperCase()}`;
                        const voidTime = order.cancelledAt || order.updatedAt || order.createdAt;

                        return (
                          <tr key={order.id}>
                            {/* 1. Ticket # */}
                            <td>
                              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800, color: '#ef4444', fontSize: 13 }}>
                                {ticketNum}
                              </span>
                            </td>

                            {/* 2. Void Time */}
                            <td>
                              <span style={{ fontSize: 12, color: 'var(--color-label-secondary)' }}>
                                {voidTime ? new Date(getOrderTimestampMs(voidTime)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                              </span>
                            </td>

                            {/* 3. Table / Guest */}
                            <td>
                              <span style={{ fontWeight: 800, fontSize: 13, color: '#ffffff' }}>
                                {order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : 'Order')}
                              </span>
                            </td>

                            {/* 4. Items Cancelled */}
                            <td>
                              <span style={{ fontSize: 12, color: '#cbd5e1' }}>
                                {(order.items || []).map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).join(', ') || 'No items listed'}
                              </span>
                            </td>

                            {/* 5. Void Reason */}
                            <td>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                padding: '2px 8px',
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
                                background: 'rgba(239, 68, 68, 0.15)',
                                color: '#ef4444',
                                border: '1px solid rgba(239, 68, 68, 0.35)'
                              }}>
                                <AlertTriangle size={11} /> {order.cancelReason || order.voidReason || 'Order Voided'}
                              </span>
                            </td>

                            {/* 6. Amount */}
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', textDecoration: 'line-through' }}>
                                {formatCurrency(order.total ?? 0, currency)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
