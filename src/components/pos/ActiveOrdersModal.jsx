import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '../../stores/orderStore';
import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { printReceipt } from '../../utils/print';
import { splitItemModifiersForBill } from '../../utils/taxUtils';
import { sendWhatsAppReceipt } from '../../services/whatsappService';
import { getOrderElapsedSeconds, getOrderTimestampMs } from '../../utils/timezoneUtils';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../firebase';
import { 
  X, ArrowLeft, Printer, Check, ShoppingBag, Utensils, Clock, Zap, Search,
  Edit2, Bell, FileText, Globe, CreditCard, CheckCircle2, XCircle,
  ChevronDown, ChevronUp, LayoutList, LayoutGrid, Columns2, MessageCircle, AlertTriangle, AlertCircle, Armchair,
  Bike, MapPin, Phone, ChefHat, Trash2
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

/**
 * Safely resolves the best unix-ms timestamp from an order across preferred fields.
 * Skips corrupt objects (e.g. unresolved serverTimestamp sentinels) so Date(null) -> 05:30 never happens.
 */
export const resolveOrderTimestampMs = (order, preferredFields = ['paidAt', 'updatedAt', 'createdAt']) => {
  if (!order) return null;
  for (const field of preferredFields) {
    const ms = getOrderTimestampMs(order[field]);
    if (ms && ms > 0) return ms;
  }
  return getOrderTimestampMs(order);
};

export const formatOrderTimestamp = (order, preferredFields = ['paidAt', 'updatedAt', 'createdAt'], { includeDate = false } = {}) => {
  const ms = resolveOrderTimestampMs(order, preferredFields);
  if (!ms || ms <= 0) return '—';
  const d = new Date(ms);
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!includeDate) return timeStr;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (ms >= startOfToday.getTime()) return timeStr;
  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr}, ${timeStr}`;
};

const renderOrderItemRows = (items, currency, { compact = false } = {}) => {
  return (items || []).map((item, idx) => {
    const { qtyNum, baseLineAmount, addons } = splitItemModifiersForBill(item);
    return (
      <div
        key={idx}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          paddingBottom: compact ? 0 : 8,
          borderBottom: compact ? 'none' : '1px solid rgba(255,255,255,0.05)'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          {compact ? (
            <span style={{ fontSize: 11.5, color: '#f1f5f9' }}>
              <strong style={{ color: '#fff' }}>{qtyNum}×</strong> {item.name}
            </span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ minWidth: 22, height: 22, borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 11.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {qtyNum}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>{item.name}</span>
            </div>
          )}
          <span style={{ fontSize: compact ? 11.5 : 13, fontWeight: 750, color: compact ? 'var(--color-label-secondary)' : '#ffffff', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {formatCurrency(baseLineAmount, currency)}
          </span>
        </div>

        {addons.map((a, aIdx) => (
          <div
            key={aIdx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              paddingLeft: compact ? 16 : 30,
              fontSize: compact ? 11 : 11.5,
              color: '#94a3b8'
            }}
          >
            <span>+ {a.name}</span>
            {a.lineAmount > 0 && (
              <span style={{ fontVariantNumeric: 'tabular-nums', color: '#cbd5e1', fontWeight: 600 }}>
                +{formatCurrency(a.lineAmount, currency)}
              </span>
            )}
          </div>
        ))}

        {item.itemNote && (
          <div style={{ paddingLeft: compact ? 16 : 30, fontSize: 11, color: '#fbbf24' }}>
            Note: {item.itemNote}
          </div>
        )}
      </div>
    );
  });
};

export const HISTORY_RANGES = [
  { key: 'today', label: 'Today', summary: 'today' },
  { key: 'yesterday', label: 'Yesterday', summary: 'yesterday' },
  { key: '7d', label: '7D', summary: 'last 7 days' },
  { key: '30d', label: '30D', summary: 'last 30 days' },
];

export const classifyOrderChannel = (order) => {
  const hasTable = Boolean(order?.tableId || order?.tableName);
  const isOnline = order?.type === 'online' || Boolean(order?.source);
  const isDelivery = order?.type === 'delivery' || (!isOnline && order?.orderType === 'delivery');
  const isTakeaway = order?.type === 'takeaway' || order?.type === 'pickup' || (isOnline && order?.orderType === 'takeaway');
  const isDineIn = order?.type === 'dine-in';
  const needsApproval = isOnline && order?.status === 'pending';
  return { isOnline, isDelivery, isTakeaway, isDineIn, hasTable, needsApproval };
};

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
  const settledOrderOverrides = useOrderStore(s => s.settledOrderOverrides);
  const updateOrderStatus = useOrderStore(s => s.updateOrderStatus);
  const settleOrder = useOrderStore(s => s.settleOrder);
  const markBillPrinted = useOrderStore(s => s.markBillPrinted);
  const offlineQueue = useOfflineQueueStore(s => s.queue);

  // Primary navigation: 'open' | 'completed' | 'voids'
  const [activeTab, setActiveTab] = useState('open');
  // View mode in Open Orders: 'split' (Master-Detail Reference Hub) | 'table' | 'cards'
  const [viewMode, setViewMode] = useState('split');
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [confirmVoidId, setConfirmVoidId] = useState(null);
  const [filterType, setFilterType] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [settlingId, setSettlingId] = useState(null);
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());
  const [layoutCols, setLayoutCols] = useState('2');
  const [autoPrintOnSettle, setAutoPrintOnSettle] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem('kiwi_orders_autoprint') !== 'false' : true;
    } catch {
      return true;
    }
  });

  const toggleAutoPrintOnSettle = () => {
    setAutoPrintOnSettle(prev => {
      const next = !prev;
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('kiwi_orders_autoprint', String(next));
      } catch {}
      return next;
    });
  };

  // History orders for Completed & Voids tabs
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRange, setHistoryRange] = useState('today'); // 'today' | 'yesterday' | '7d' | '30d'

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

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch recent orders (using updatedAt index-free desc query; scales limit when viewing 7D/30D)
  useEffect(() => {
    if (!isOpen || !restaurant?.id) return;

    const fetchLimit = historyRange === 'today' ? 250 : (historyRange === 'yesterday' ? 400 : 800);
    const q = query(
      collection(db, 'restaurants', restaurant.id, 'orders'),
      orderBy('updatedAt', 'desc'),
      limit(fetchLimit)
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
  }, [isOpen, restaurant?.id, historyRange]);

  // Combine Firestore history + offline-queued orders with durable local settlement overrides
  const allCombinedHistoryOrders = useMemo(() => {
    const overrides = settledOrderOverrides || {};
    const byId = new Map();
    (historyOrders || []).forEach(o => {
      if (!o?.id) return;
      const merged = overrides[o.id] ? { ...o, ...overrides[o.id] } : o;
      byId.set(o.id, merged);
    });

    (offlineQueue || []).forEach(o => {
      if (!o?.id) return;
      if (restaurant?.id && o.restaurantId && o.restaurantId !== restaurant.id) return;
      const base = overrides[o.id] ? { ...o, ...overrides[o.id] } : o;
      const existing = byId.get(o.id);
      if (!existing) {
        byId.set(o.id, {
          ...base,
          createdAt: getOrderTimestampMs(base.createdAt) ? base.createdAt : (base.offlineQueuedAt || new Date().toISOString())
        });
      } else if (base.paid === true || base.status === 'billed' || base.status === 'cancelled') {
        byId.set(o.id, { ...existing, ...base });
      }
    });

    return Array.from(byId.values()).sort(
      (a, b) => (resolveOrderTimestampMs(b, ['paidAt', 'updatedAt', 'createdAt']) || 0) - (resolveOrderTimestampMs(a, ['paidAt', 'updatedAt', 'createdAt']) || 0)
    );
  }, [historyOrders, offlineQueue, restaurant?.id, settledOrderOverrides]);

  // Strict Today slice (used to keep Open Orders orphan safeguard scoped to Today)
  const todayHistoryOrders = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startMs = startOfToday.getTime();
    return allCombinedHistoryOrders.filter(o => {
      const ts = resolveOrderTimestampMs(o, ['paidAt', 'cancelledAt', 'updatedAt', 'createdAt']);
      return !ts || ts >= startMs;
    });
  }, [allCombinedHistoryOrders]);

  // Range-filtered slice for Paid Bills & Voids (Today · Yesterday · 7D · 30D)
  const mergedHistoryOrders = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    let minMs = todayMs;
    let maxMs = Infinity;
    if (historyRange === 'yesterday') {
      minMs = todayMs - dayMs;
      maxMs = todayMs;
    } else if (historyRange === '7d') {
      minMs = todayMs - 6 * dayMs;
    } else if (historyRange === '30d') {
      minMs = todayMs - 29 * dayMs;
    }

    return allCombinedHistoryOrders.filter(o => {
      const ts = resolveOrderTimestampMs(o, ['paidAt', 'cancelledAt', 'updatedAt', 'createdAt']);
      if (!ts) return historyRange === 'today';
      return ts >= minMs && ts < maxMs;
    });
  }, [allCombinedHistoryOrders, historyRange]);

  // 1. Running Open Orders (All unpaid/active checks + Ready handover checks; excludes early-paid in-kitchen orders already in Paid tab)
  const runningOrders = useMemo(() => {
    const overrides = settledOrderOverrides || {};
    const active = (activeOrders || [])
      .map(o => overrides[o.id] ? { ...o, ...overrides[o.id] } : o)
      .filter(o => {
        if (['cancelled', 'void', 'billed'].includes(o.status)) return false;
        if (o.status === 'completed' && isOrderPaid(o)) return false;
        // Early-paid Takeaway/Delivery orders still cooking stay in KDS & Paid tab — only reappear in Open once Kitchen marks Ready
        if (isOrderPaid(o) && o.type !== 'dine-in' && ['pending', 'preparing'].includes(o.status)) {
          return false;
        }
        return true;
      });

    // Safeguard: pull in any truly unpaid checks from today's history so no unpaid check is ever orphaned
    const historyUnpaid = todayHistoryOrders.filter(o => 
      isOrderUnpaid(o) && 
      o.status !== 'cancelled' && 
      o.status !== 'void' && 
      o.status !== 'billed' &&
      !active.some(a => a.id === o.id)
    );

    return [...active, ...historyUnpaid];
  }, [activeOrders, todayHistoryOrders, settledOrderOverrides]);

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
    return runningOrders.filter(o => classifyOrderChannel(o).isOnline);
  }, [runningOrders]);

  const onlineCount = onlineOrders.length;
  const pendingOnlineCount = useMemo(() => {
    return onlineOrders.filter(o => o.status === 'pending').length;
  }, [onlineOrders]);

  const deliveryCount = useMemo(() => {
    return runningOrders.filter(o => classifyOrderChannel(o).isDelivery).length;
  }, [runningOrders]);

  const takeawayCount = useMemo(() => {
    return runningOrders.filter(o => classifyOrderChannel(o).isTakeaway).length;
  }, [runningOrders]);

  const dineInCount = useMemo(() => {
    return runningOrders.filter(o => classifyOrderChannel(o).isDineIn).length;
  }, [runningOrders]);

  // Filtered dataset according to active tab and search
  const displayedOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    if (activeTab === 'open') {
      return runningOrders.filter(o => {
        const { isOnline, isDelivery, isTakeaway, isDineIn, needsApproval } = classifyOrderChannel(o);
        const isReady = o.status === 'ready';

        if (filterType === 'needs_approval' && !needsApproval) return false;
        if (filterType === 'online' && !isOnline) return false;
        if (filterType === 'delivery' && !isDelivery) return false;
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

  const selectedOrder = useMemo(() => {
    if (!displayedOrders.length) return null;
    return displayedOrders.find(o => o.id === selectedOrderId) || displayedOrders[0];
  }, [displayedOrders, selectedOrderId]);

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

      const keepInKitchen = Boolean(order.type !== 'dine-in' && ['pending', 'preparing'].includes(order.status));
      const settledOrder = {
        ...order,
        paymentMethod: 'cash',
        paid: true,
        status: keepInKitchen ? order.status : 'billed',
        paidAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setHistoryOrders(prev => [settledOrder, ...prev.filter(o => o.id !== order.id)]);
      setSelectedOrderId(prev => (prev === order.id ? null : prev));

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
      const nowIso = new Date().toISOString();
      setHistoryOrders(prev => [
        { ...order, status: 'completed', updatedAt: nowIso },
        ...prev.filter(o => o.id !== order.id)
      ]);
      setSelectedOrderId(prev => (prev === order.id ? null : prev));
      toast.success(`Order completed ✓`, { id: 'pos-action' });
    } catch (err) {
      toast.error('Update failed: ' + err.message);
    }
  };

  const handleAdvanceStatus = async (order, nextStatus, label) => {
    try {
      await updateOrderStatus(restaurant.id, order.id, nextStatus);
      const nowIso = new Date().toISOString();
      setHistoryOrders(prev => {
        const exists = prev.some(o => o.id === order.id);
        if (exists) {
          return prev.map(o => o.id === order.id ? { ...o, status: nextStatus, updatedAt: nowIso } : o);
        }
        if (nextStatus === 'completed' || nextStatus === 'billed') {
          return [{ ...order, status: nextStatus, updatedAt: nowIso }, ...prev];
        }
        return prev;
      });
      if (['billed', 'cancelled', 'void'].includes(nextStatus) || (nextStatus === 'completed' && isOrderPaid(order))) {
        setSelectedOrderId(prev => (prev === order.id ? null : prev));
      }
      toast.success(label || `Order marked ${nextStatus}`, { id: 'pos-action' });
    } catch (err) {
      toast.error('Update failed: ' + err.message);
    }
  };

  const handleCancelOrder = async (order) => {
    try {
      await updateOrderStatus(restaurant.id, order.id, 'cancelled');
      const nowIso = new Date().toISOString();
      setHistoryOrders(prev => [
        { ...order, status: 'cancelled', cancelReason: 'Cancelled from Orders', cancelledAt: nowIso, updatedAt: nowIso },
        ...prev.filter(o => o.id !== order.id)
      ]);
      setSelectedOrderId(prev => (prev === order.id ? null : prev));
      setConfirmVoidId(null);
      toast.success('Order cancelled / voided', { id: 'pos-action' });
    } catch (err) {
      toast.error('Cancel failed: ' + err.message);
    }
  };

  const now = Date.now();

  const formatOrderTime = (order) => formatOrderTimestamp(order, ['createdAt', 'updatedAt', 'paidAt']);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99990,
      display: 'flex',
      flexDirection: 'column',
      width: '100vw',
      height: '100dvh',
      background: 'var(--color-bg, #0f172a)',
      overflow: 'hidden',
      animation: 'fadeIn 0.16s ease',
    }}>
      {/* Line 1: Back to POS · Segmented Status Tabs · Auto-Print & View Mode */}
      <div className="orders-topbar-row1">
        <div className="orders-topbar-left">
          <button
            type="button"
            id="orders-back-to-pos-btn"
            onClick={onClose}
            aria-label="Back to POS"
            title="Back to POS (Esc)"
            className="orders-back-btn"
          >
            <ArrowLeft size={18} />
            <span>POS</span>
          </button>

          {/* 3 Segmented Status Tabs */}
          <div className="orders-segmented-tabs" aria-label="Order views">
            <button
              type="button"
              aria-pressed={activeTab === 'open'}
              aria-label={`Open Orders (${runningOrders.length})`}
              className={`orders-seg-tab ${activeTab === 'open' ? 'active' : ''}`}
              onClick={() => setActiveTab('open')}
            >
              <Clock size={16} />
              <span>Open</span>
              <span className="orders-tab-badge">{runningOrders.length}</span>
            </button>

            <button
              type="button"
              aria-pressed={activeTab === 'completed'}
              aria-label={`Paid Bills (${completedOrders.length})`}
              className={`orders-seg-tab ${activeTab === 'completed' ? 'active' : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              <CheckCircle2 size={16} />
              <span>Paid</span>
              <span className="orders-tab-badge secondary">{completedOrders.length}</span>
            </button>

            <button
              type="button"
              aria-pressed={activeTab === 'voids'}
              aria-label={`Voids / Cancelled (${voidOrders.length})`}
              className={`orders-seg-tab ${activeTab === 'voids' ? 'active' : ''}`}
              onClick={() => setActiveTab('voids')}
            >
              <XCircle size={16} />
              <span>Voids</span>
              {voidOrders.length > 0 && <span className="orders-tab-badge danger">{voidOrders.length}</span>}
            </button>
          </div>
        </div>

        <div className="orders-topbar-right">
          {activeTab === 'open' && (
            <>
              <button
                type="button"
                id="orders-autoprint-toggle"
                onClick={toggleAutoPrintOnSettle}
                aria-label={autoPrintOnSettle ? 'Auto-Print ON' : 'No Bill on Cash Settle'}
                title={autoPrintOnSettle ? 'Auto-Print Bill: ON (tap to settle cash silently)' : 'No Bill on Cash Settle (tap to auto-print bill)'}
                className={`orders-print-toggle ${autoPrintOnSettle ? 'is-on' : 'is-off'}`}
              >
                <Printer size={16} />
                <span className="orders-print-label">{autoPrintOnSettle ? 'Print' : 'Silent'}</span>
              </button>

              <div className="orders-view-switcher">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`orders-view-btn ${viewMode === 'split' ? 'active' : ''}`}
                  title="Split View"
                  aria-label="Split View"
                >
                  <Columns2 size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`orders-view-btn ${viewMode === 'table' ? 'active' : ''}`}
                  title="Table View"
                  aria-label="Table View"
                >
                  <LayoutList size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`orders-view-btn ${viewMode === 'cards' ? 'active' : ''}`}
                  title="Cards View"
                  aria-label="Cards View"
                >
                  <LayoutGrid size={17} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Line 2: Icon-First Channel Filters + Search */}
      <div className="orders-filter-bar">
        {activeTab === 'open' ? (
          <div className="orders-filter-pills">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              aria-label={`All Open (${runningOrders.length})`}
              className={`orders-filter-chip ${filterType === 'all' ? 'is-active' : ''}`}
            >
              <span>All</span>
              <span className="orders-chip-count">{runningOrders.length}</span>
            </button>

            {pendingOnlineCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterType('needs_approval')}
                aria-label={`Needs Approval (${pendingOnlineCount})`}
                title={`Needs Approval (${pendingOnlineCount})`}
                className={`orders-filter-chip is-alert ${filterType === 'needs_approval' ? 'is-active' : ''}`}
              >
                <AlertCircle size={16} />
                <span className="orders-chip-count">{pendingOnlineCount}</span>
              </button>
            )}

            {readyCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterType('ready')}
                aria-label={`Ready (${readyCount})`}
                title={`Ready for Pickup (${readyCount})`}
                className={`orders-filter-chip is-ready ${filterType === 'ready' ? 'is-active' : ''}`}
              >
                <Bell size={16} />
                <span className="orders-chip-count">{readyCount}</span>
              </button>
            )}

            {onlineCount > 0 && (
              <button
                type="button"
                onClick={() => setFilterType('online')}
                aria-label={`Online (${onlineCount})`}
                title={`Online (${onlineCount})`}
                className={`orders-filter-chip is-online ${filterType === 'online' ? 'is-active' : ''}`}
              >
                <Globe size={16} />
                <span className="orders-chip-count">{onlineCount}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setFilterType('dine-in')}
              aria-label={`Dine In (${dineInCount})`}
              title={`Dine In (${dineInCount})`}
              className={`orders-filter-chip ${filterType === 'dine-in' ? 'is-active' : ''} ${dineInCount === 0 ? 'is-empty' : ''}`}
            >
              <Utensils size={16} />
              <span className="orders-chip-count">{dineInCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterType('takeaway')}
              aria-label={`Takeaway (${takeawayCount})`}
              title={`Takeaway (${takeawayCount})`}
              className={`orders-filter-chip ${filterType === 'takeaway' ? 'is-active' : ''} ${takeawayCount === 0 ? 'is-empty' : ''}`}
            >
              <ShoppingBag size={16} />
              <span className="orders-chip-count">{takeawayCount}</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterType('delivery')}
              aria-label={`Delivery (${deliveryCount})`}
              title={`Delivery (${deliveryCount})`}
              className={`orders-filter-chip is-delivery ${filterType === 'delivery' ? 'is-active' : ''} ${deliveryCount === 0 ? 'is-empty' : ''}`}
            >
              <Bike size={16} />
              <span className="orders-chip-count">{deliveryCount}</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="orders-filter-pills" role="group" aria-label="Date range">
              {HISTORY_RANGES.map(r => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => setHistoryRange(r.key)}
                  className={`orders-filter-chip ${historyRange === r.key ? 'is-active' : ''}`}
                  aria-pressed={historyRange === r.key}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-label-secondary)', fontWeight: 600 }}>
              {(() => {
                const rangeSummary = HISTORY_RANGES.find(r => r.key === historyRange)?.summary || 'today';
                if (activeTab === 'completed') {
                  return `Viewing ${displayedOrders.length} finalized customer bills (${rangeSummary})`;
                }
                if (activeTab === 'voids') {
                  return `Viewing ${displayedOrders.length} voided/cancelled ticket audits (${rangeSummary})`;
                }
                return null;
              })()}
            </div>
          </div>
        )}

        {/* Quick Search */}
        <div className="orders-search-wrap">
          <Search size={15} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-tertiary)', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder={activeTab === 'open' ? 'Search #, table, name...' : 'Search order #, customer...'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="form-input orders-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                padding: 4,
                cursor: 'pointer',
                color: 'var(--color-label-tertiary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
              aria-label="Clear search"
            >
              <X size={14} />
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
                  {/* MODE 0: MASTER–DETAIL SPLIT HUB (Square / Toast Reference Standard) */}
                  {viewMode === 'split' && (
                    <div className={`orders-split-layout ${mobileDetailOpen ? 'is-mobile-detail' : ''}`}>
                      {/* Left Pane: Scannable Order Queue */}
                      <div className="orders-split-list">
                        {displayedOrders.map(order => {
                          const { isOnline, isDelivery, isTakeaway, needsApproval } = classifyOrderChannel(order);
                          const isReady = order.status === 'ready';
                          const isServed = order.status === 'served';
                          const isPreparing = order.status === 'preparing';
                          const isUnpaid = isOrderUnpaid(order);
                          const isKhata = !isUnpaid && (order.paymentMethod === 'khata' || order.isKhata);
                          const elapsedMins = Math.floor(getOrderElapsedSeconds(order, now) / 60);
                          const ticketNum = order.token ? `#${order.token}` : `#${order.id.slice(-4).toUpperCase()}`;
                          const isSelected = selectedOrder?.id === order.id;
                          const itemsCount = (order.items || []).reduce((sum, i) => sum + (i.qty || 1), 0);

                          return (
                            <button
                              key={order.id}
                              type="button"
                              onClick={() => {
                                setSelectedOrderId(order.id);
                                setMobileDetailOpen(true);
                                setConfirmVoidId(null);
                              }}
                              className={`orders-split-row ${isSelected ? 'is-selected' : ''}`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flexWrap: 'wrap' }}>
                                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 800, fontSize: 13.5, color: '#38bdf8' }}>
                                    {ticketNum}
                                  </span>
                                  <span style={{ fontWeight: 800, fontSize: 15, color: '#ffffff', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                    {order.tableName ? (
                                      <><Armchair size={15} color="#10b981" /> Table {order.tableName}</>
                                    ) : isDelivery ? (
                                      <><Bike size={15} color="#f59e0b" /> {order.token ? `Delivery · #${order.token}` : 'Delivery'}</>
                                    ) : isTakeaway ? (
                                      order.token ? `Token #${order.token} · Takeaway` : 'Takeaway'
                                    ) : isOnline ? (
                                      order.source || 'Online'
                                    ) : (
                                      order.token ? `Token #${order.token}` : 'Counter'
                                    )}
                                  </span>
                                  {order.customerName && (
                                    <span style={{ fontSize: 13, color: '#cbd5e1', fontWeight: 600 }}>
                                      · {order.customerName}
                                    </span>
                                  )}
                                </div>
                                <span style={{ fontSize: 16, fontWeight: 900, color: '#ffffff', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                  {formatCurrency(order.total ?? 0, currency)}
                                </span>
                              </div>

                              <div style={{ fontSize: 12.5, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                                <strong style={{ color: '#cbd5e1' }}>{itemsCount} {itemsCount === 1 ? 'item' : 'items'}</strong> · {(order.items || []).map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).join(', ')}
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                  {isUnpaid ? (
                                    <span style={{
                                      fontSize: 10.5,
                                      fontWeight: 800,
                                      padding: '2px 7px',
                                      borderRadius: 6,
                                      background: 'rgba(239, 68, 68, 0.2)',
                                      color: '#f87171',
                                      border: '1px solid rgba(239, 68, 68, 0.4)'
                                    }}>
                                      NOT PAID
                                    </span>
                                  ) : isKhata ? (
                                    <span style={{
                                      fontSize: 10.5,
                                      fontWeight: 800,
                                      padding: '2px 7px',
                                      borderRadius: 6,
                                      background: 'rgba(245, 158, 11, 0.2)',
                                      color: '#fbbf24',
                                      border: '1px solid rgba(245, 158, 11, 0.4)'
                                    }}>
                                      KHATA
                                    </span>
                                  ) : (
                                    <span style={{
                                      fontSize: 10.5,
                                      fontWeight: 800,
                                      padding: '2px 7px',
                                      borderRadius: 6,
                                      background: 'rgba(16, 185, 129, 0.16)',
                                      color: '#34d399',
                                      border: '1px solid rgba(16, 185, 129, 0.38)'
                                    }}>
                                      PAID
                                    </span>
                                  )}
                                  <span style={{
                                    fontSize: 11.5,
                                    fontWeight: 800,
                                    color: needsApproval ? '#c084fc' : isReady ? '#34d399' : (order.status === 'completed' && isUnpaid ? '#f87171' : (isServed ? '#38bdf8' : (isPreparing ? '#60a5fa' : '#fbbf24')))
                                  }}>
                                    {needsApproval ? 'Needs Approval' : isReady ? 'Order Ready' : (order.status === 'completed' && isUnpaid ? 'SERVED DUE' : isServed ? 'Served' : isPreparing ? 'Preparing' : 'In Kitchen')}
                                  </span>
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 750, color: elapsedMins > 25 ? '#ef4444' : (elapsedMins > 15 ? '#f59e0b' : '#10b981') }}>
                                  {elapsedMins}m
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Right Pane: Sticky Live Order Inspector & Quick Actions */}
                      {selectedOrder && (() => {
                        const { isOnline, isDelivery, isTakeaway, isDineIn, hasTable, needsApproval } = classifyOrderChannel(selectedOrder);
                        const isReady = selectedOrder.status === 'ready';
                        const isServed = selectedOrder.status === 'served';
                        const isPreparing = selectedOrder.status === 'preparing';
                        const isUnpaid = isOrderUnpaid(selectedOrder);
                        const ticketNum = selectedOrder.token ? `#${selectedOrder.token}` : `#${selectedOrder.id.slice(-4).toUpperCase()}`;
                        const isConfirmingVoid = confirmVoidId === selectedOrder.id;

                        return (
                          <div className="orders-split-detail">
                            {/* Inspector Header */}
                            <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                  <button
                                    type="button"
                                    className="orders-mobile-back-btn"
                                    onClick={() => setMobileDetailOpen(false)}
                                  >
                                    ← Orders
                                  </button>
                                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {ticketNum} · {selectedOrder.customerName || (selectedOrder.tableName ? `Table ${selectedOrder.tableName}` : isDelivery ? 'Delivery Order' : isTakeaway ? 'Takeaway Order' : 'Order')}
                                  </h3>
                                </div>
                                {isConfirmingVoid ? (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <button
                                      type="button"
                                      onClick={() => handleCancelOrder(selectedOrder)}
                                      style={{ height: 30, padding: '0 10px', borderRadius: 7, background: '#ef4444', border: 'none', color: '#fff', fontSize: 11.5, fontWeight: 800, cursor: 'pointer' }}
                                    >
                                      Confirm Void
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmVoidId(null)}
                                      style={{ height: 30, padding: '0 8px', borderRadius: 7, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.16)', color: '#cbd5e1', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}
                                    >
                                      Keep
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmVoidId(selectedOrder.id)}
                                    title="Void / Cancel Order"
                                    style={{ height: 30, padding: '0 9px', borderRadius: 7, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: 11.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                                  >
                                    <Trash2 size={12} /> Void
                                  </button>
                                )}
                              </div>

                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--color-label-secondary)' }}>
                                <span>
                                  {selectedOrder.tableName ? `Table ${selectedOrder.tableName}` : isDelivery ? 'Direct Delivery' : isTakeaway ? 'Takeout · Pickup' : (isOnline ? `${selectedOrder.source || 'Online'}` : 'Counter')}
                                </span>
                                {selectedOrder.customerPhone && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Phone size={11} /> {selectedOrder.customerPhone}
                                  </span>
                                )}
                                {selectedOrder.assignedWaiterName && <span>Server: {selectedOrder.assignedWaiterName}</span>}
                                {selectedOrder.assignedRiderName && <span>Rider: {selectedOrder.assignedRiderName}</span>}
                                <span>Placed {formatOrderTime(selectedOrder)}</span>
                              </div>
                              {(selectedOrder.deliveryAddress || selectedOrder.customer?.address) && (
                                <div style={{ fontSize: 11.5, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <MapPin size={12} /> {selectedOrder.deliveryAddress || selectedOrder.customer?.address}
                                </div>
                              )}
                            </div>

                            {/* Inspector Itemized Bill Breakdown (Scrollable items; Summary pinned cleanly above action bar) */}
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {renderOrderItemRows(selectedOrder.items, currency)}
                            </div>

                            {/* Pinned Financial Summary directly above Action Dock */}
                            <div style={{
                              padding: '10px 16px',
                              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                              background: 'rgba(15, 23, 42, 0.55)',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 4,
                              fontSize: 12.5,
                              color: '#94a3b8',
                              flexShrink: 0
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Subtotal</span>
                                <span>{formatCurrency(selectedOrder.subtotal ?? selectedOrder.total ?? 0, currency)}</span>
                              </div>
                              {Number(selectedOrder.discountAmount) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                                  <span>Discount</span>
                                  <span>-{formatCurrency(selectedOrder.discountAmount, currency)}</span>
                                </div>
                              )}
                              {Number(selectedOrder.packagingAmount) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Packaging</span>
                                  <span>{formatCurrency(selectedOrder.packagingAmount, currency)}</span>
                                </div>
                              )}
                              {Number(selectedOrder.taxTotal) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Tax (GST)</span>
                                  <span>{formatCurrency(selectedOrder.taxTotal, currency)}</span>
                                </div>
                              )}
                              {Math.abs(Number(selectedOrder.roundOffAmount) || 0) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <span>Round Off</span>
                                  <span>{selectedOrder.roundOffAmount > 0 ? '+' : '-'}{formatCurrency(Math.abs(selectedOrder.roundOffAmount), currency)}</span>
                                </div>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 6, marginTop: 2, borderTop: '1px solid rgba(255,255,255,0.12)', fontSize: 17, fontWeight: 900, color: '#ffffff' }}>
                                <span>Total</span>
                                <span>{formatCurrency(selectedOrder.total ?? 0, currency)}</span>
                              </div>
                            </div>

                            {/* Inspector Sticky Action Dock (Reference Layout) */}
                            <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(15, 23, 42, 0.9)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              <div style={{ display: 'grid', gridTemplateColumns: isUnpaid && onOpenPayment ? 'repeat(4, minmax(0, 1fr))' : (isUnpaid ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))'), gap: 8 }}>
                                <button
                                  type="button"
                                  onClick={() => handlePrint(selectedOrder)}
                                  className="orders-btn-bill"
                                  aria-label={selectedOrder.billPrinted ? 'Bill printed' : 'Bill'}
                                  style={{
                                    height: 42,
                                    borderRadius: 10,
                                    fontSize: 12.5,
                                    fontWeight: 750,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 5,
                                    cursor: 'pointer',
                                    background: selectedOrder.billPrinted ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255, 255, 255, 0.08)',
                                    border: selectedOrder.billPrinted ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid rgba(255, 255, 255, 0.18)',
                                    color: selectedOrder.billPrinted ? '#38bdf8' : '#f8fafc',
                                    touchAction: 'manipulation'
                                  }}
                                >
                                  {selectedOrder.billPrinted ? <Check size={14} strokeWidth={2.5} /> : <Printer size={14} />}
                                  <span>{selectedOrder.billPrinted ? 'Bill ✓' : 'Bill'}</span>
                                </button>

                                {onLoadOrderToCart && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onLoadOrderToCart(selectedOrder);
                                      onClose();
                                    }}
                                    style={{
                                      height: 42,
                                      borderRadius: 10,
                                      fontSize: 12.5,
                                      fontWeight: 750,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 5,
                                      cursor: 'pointer',
                                      background: 'rgba(255, 255, 255, 0.08)',
                                      border: '1px solid rgba(255, 255, 255, 0.18)',
                                      color: '#ffffff',
                                      touchAction: 'manipulation'
                                    }}
                                  >
                                    <Edit2 size={13} /> Edit
                                  </button>
                                )}

                                {isUnpaid && onOpenPayment && (
                                  <button
                                    type="button"
                                    className="orders-btn-card-upi"
                                    aria-label="Card / UPI Payment"
                                    onClick={() => {
                                      onLoadOrderToCart(selectedOrder);
                                      onClose();
                                      onOpenPayment();
                                    }}
                                    style={{
                                      height: 42,
                                      borderRadius: 10,
                                      fontSize: 12.5,
                                      fontWeight: 750,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 5,
                                      cursor: 'pointer',
                                      background: 'rgba(59, 130, 246, 0.16)',
                                      border: '1px solid rgba(59, 130, 246, 0.4)',
                                      color: '#60a5fa',
                                      touchAction: 'manipulation'
                                    }}
                                  >
                                    <CreditCard size={14} /> Pay
                                  </button>
                                )}

                                {isUnpaid && (
                                  <button
                                    type="button"
                                    aria-label="Quick Cash"
                                    onClick={() => handleQuickCashSettle(selectedOrder, autoPrintOnSettle ? !selectedOrder.billPrinted : false)}
                                    disabled={settlingId === selectedOrder.id}
                                    style={{
                                      height: 42,
                                      borderRadius: 10,
                                      fontSize: 12.5,
                                      fontWeight: 800,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: 4,
                                      cursor: 'pointer',
                                      background: '#10b981',
                                      border: 'none',
                                      color: '#ffffff',
                                      touchAction: 'manipulation'
                                    }}
                                  >
                                    <Zap size={13} fill="#fff" /> Quick Cash
                                  </button>
                                )}
                              </div>

                              {/* Full-width Hero Status Progression Button (Square / Toast Style) */}
                              {needsApproval ? (
                                <button
                                  type="button"
                                  onClick={() => handleAdvanceStatus(selectedOrder, 'preparing', 'Order accepted & sent to kitchen ✓')}
                                  style={{ width: '100%', height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)', border: 'none', color: '#ffffff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', touchAction: 'manipulation' }}
                                >
                                  <Check size={16} strokeWidth={2.5} /> Accept &amp; Send to Kitchen
                                </button>
                              ) : (selectedOrder.status === 'pending' || isPreparing) ? (
                                <button
                                  type="button"
                                  id="orders-mark-ready-btn"
                                  onClick={() => {
                                    if (!isUnpaid && !hasTable) {
                                      handleAdvanceStatus(selectedOrder, 'completed', 'Order ready & completed ✓');
                                    } else {
                                      handleAdvanceStatus(selectedOrder, 'ready', 'Order marked Ready ✓');
                                    }
                                  }}
                                  style={{ width: '100%', height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)', border: 'none', color: '#ffffff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', touchAction: 'manipulation' }}
                                >
                                  <Bell size={16} /> Order Ready
                                </button>
                              ) : isReady && isDineIn && hasTable ? (
                                <button
                                  type="button"
                                  onClick={() => handleAdvanceStatus(selectedOrder, 'served', 'Order marked Served ✓')}
                                  style={{ width: '100%', height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)', border: 'none', color: '#ffffff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', touchAction: 'manipulation' }}
                                >
                                  <ChefHat size={16} /> Mark Served
                                </button>
                              ) : (!isUnpaid && ['ready', 'served'].includes(selectedOrder.status)) ? (
                                <button
                                  type="button"
                                  onClick={() => handleMarkComplete(selectedOrder)}
                                  style={{ width: '100%', height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', border: 'none', color: '#ffffff', fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer', touchAction: 'manipulation' }}
                                >
                                  <Check size={16} strokeWidth={2.5} /> Complete &amp; Hand Off
                                </button>
                              ) : null}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}

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
                            const { isOnline, isDelivery, isTakeaway, needsApproval } = classifyOrderChannel(order);
                            const isReady = order.status === 'ready';
                            const isServed = order.status === 'served';
                            const isPreparing = order.status === 'preparing';
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
                                        ) : isDelivery ? (
                                          <><Bike size={13} color="#f59e0b" /> Delivery</>
                                        ) : order.token ? (
                                          `Token #${order.token}`
                                        ) : (
                                          isTakeaway ? 'Takeaway' : (isOnline ? (order.source || 'Online') : 'Order')
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
                                        {needsApproval ? 'Needs Approval' : isReady ? 'READY' : (order.status === 'completed' && isUnpaid ? 'SERVED DUE' : isServed ? 'Served' : isPreparing ? 'Preparing' : 'In Kitchen')}
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
                                        {renderOrderItemRows(order.items, currency, { compact: true })}
                                      </div>
                                    )}
                                  </div>
                                </td>

                                {/* 4. Status Badges (Single-line, clean) */}
                                <td className="col-status">
                                  <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {isReady ? (
                                      <span style={{
                                        background: 'rgba(16, 185, 129, 0.2)',
                                        color: '#34d399',
                                        border: '1px solid rgba(16, 185, 129, 0.5)',
                                        padding: '2px 8px',
                                        borderRadius: 6,
                                        fontSize: 10.5,
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        whiteSpace: 'nowrap'
                                      }}>
                                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399' }} />
                                        READY
                                      </span>
                                    ) : order.status === 'completed' && isUnpaid ? (
                                      <span style={{
                                        background: 'rgba(239, 68, 68, 0.15)',
                                        color: '#f87171',
                                        border: '1px solid rgba(239, 68, 68, 0.4)',
                                        padding: '2px 8px',
                                        borderRadius: 6,
                                        fontSize: 10.5,
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        whiteSpace: 'nowrap'
                                      }}>
                                        <AlertCircle size={9} /> SERVED DUE
                                      </span>
                                    ) : (
                                      <span style={{
                                        background: needsApproval ? 'rgba(168, 85, 247, 0.16)' : isServed ? 'rgba(56, 189, 248, 0.16)' : 'rgba(245, 158, 11, 0.15)',
                                        color: needsApproval ? '#c084fc' : isServed ? '#38bdf8' : '#fbbf24',
                                        border: `1px solid ${needsApproval ? 'rgba(168, 85, 247, 0.4)' : isServed ? 'rgba(56, 189, 248, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                                        padding: '2px 8px',
                                        borderRadius: 6,
                                        fontSize: 10.5,
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {needsApproval ? 'Needs Approval' : isServed ? 'Served' : isPreparing ? 'Preparing' : 'In Kitchen'}
                                      </span>
                                    )}
                                    {!isUnpaid && (
                                      <span style={{
                                        background: 'rgba(16, 185, 129, 0.14)',
                                        color: '#34d399',
                                        border: '1px solid rgba(16, 185, 129, 0.35)',
                                        padding: '2px 6px',
                                        borderRadius: 6,
                                        fontSize: 10,
                                        fontWeight: 800,
                                        whiteSpace: 'nowrap'
                                      }}>
                                        Paid
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* 5. Total Amount */}
                                <td style={{ textAlign: 'right' }}>
                                  <span style={{ fontSize: 14.5, fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.2px', fontVariantNumeric: 'tabular-nums' }}>
                                    {String(formatCurrency(order.total ?? 0, currency) || '').replace(/\.00$/, '')}
                                  </span>
                                </td>

                                {/* 6. Tablet-Friendly Touch Actions (40px+ Hit Targets) */}
                                <td style={{ textAlign: 'right', paddingTop: 10, paddingBottom: 10 }}>
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                                    {/* Edit Order in Cart */}
                                    {onLoadOrderToCart && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          onLoadOrderToCart(order);
                                          onClose();
                                        }}
                                        style={{
                                          height: 40,
                                          fontSize: 12.5,
                                          fontWeight: 700,
                                          padding: '0 13px',
                                          borderRadius: 9,
                                          background: 'rgba(255, 255, 255, 0.08)',
                                          border: '1px solid rgba(255, 255, 255, 0.18)',
                                          color: '#ffffff',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                          cursor: 'pointer',
                                          whiteSpace: 'nowrap',
                                          touchAction: 'manipulation'
                                        }}
                                        title="Edit or add items to this order in POS"
                                      >
                                        <Edit2 size={13} /> Edit
                                      </button>
                                    )}

                                    {/* Print Bill (42x40 touch target) */}
                                    <button
                                      type="button"
                                      onClick={() => handlePrint(order)}
                                      className="orders-btn-bill"
                                      aria-label={order.billPrinted ? 'Bill printed' : 'Bill'}
                                      style={{
                                        width: 42,
                                        height: 40,
                                        padding: 0,
                                        borderRadius: 9,
                                        background: order.billPrinted ? 'rgba(56, 189, 248, 0.14)' : 'rgba(255, 255, 255, 0.08)',
                                        border: order.billPrinted ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(255, 255, 255, 0.18)',
                                        color: order.billPrinted ? '#38bdf8' : '#e2e8f0',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        touchAction: 'manipulation'
                                      }}
                                      title={order.billPrinted ? "Bill already printed. Tap to reprint bill." : "Print Customer Bill"}
                                    >
                                      {order.billPrinted ? <Check size={16} strokeWidth={2.6} /> : <Printer size={16} />}
                                    </button>

                                    {/* Settle (Card / Quick Cash) */}
                                    {isUnpaid ? (
                                      <>
                                        {onOpenPayment && (
                                          <button
                                            type="button"
                                            className="orders-btn-card-upi"
                                            aria-label="Card / UPI Payment"
                                            onClick={() => {
                                              onLoadOrderToCart(order);
                                              onClose();
                                              onOpenPayment();
                                            }}
                                            style={{
                                              width: 42,
                                              height: 40,
                                              padding: 0,
                                              borderRadius: 9,
                                              background: 'rgba(255, 255, 255, 0.08)',
                                              border: '1px solid rgba(255, 255, 255, 0.18)',
                                              color: '#e2e8f0',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              cursor: 'pointer',
                                              touchAction: 'manipulation'
                                            }}
                                            title="Card / UPI / Split Payment"
                                          >
                                            <CreditCard size={16} />
                                          </button>
                                        )}

                                        {/* Single Clean Quick Cash Action */}
                                        <button
                                          type="button"
                                          aria-label="Quick Cash"
                                          onClick={() => handleQuickCashSettle(order, autoPrintOnSettle ? !order.billPrinted : false)}
                                          disabled={settlingId === order.id}
                                          style={{
                                            height: 40,
                                            fontSize: 12.5,
                                            fontWeight: 800,
                                            padding: '0 14px',
                                            borderRadius: 9,
                                            background: '#10b981',
                                            border: '1px solid rgba(52, 211, 153, 0.4)',
                                            color: '#ffffff',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 5,
                                            cursor: 'pointer',
                                            whiteSpace: 'nowrap',
                                            flexShrink: 0,
                                            touchAction: 'manipulation'
                                          }}
                                          title={order.billPrinted ? "Quick Cash (Duplicate print skipped)" : "Quick Cash Settle"}
                                        >
                                          <Zap size={13} fill="#fff" /> Quick Cash
                                        </button>
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleMarkComplete(order)}
                                        style={{
                                          height: 40,
                                          fontSize: 12.5,
                                          fontWeight: 800,
                                          padding: '0 14px',
                                          borderRadius: 9,
                                          background: 'var(--color-primary, #3b82f6)',
                                          border: 'none',
                                          color: '#ffffff',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 5,
                                          cursor: 'pointer',
                                          touchAction: 'manipulation'
                                        }}
                                      >
                                        <Check size={14} strokeWidth={2.5} /> Done
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
                        const { isOnline, isDelivery, isTakeaway, needsApproval } = classifyOrderChannel(order);
                        const isReady = order.status === 'ready';
                        const isOnlinePending = needsApproval;
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
                                  {renderOrderItemRows(order.items, currency, { compact: true })}
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                {onLoadOrderToCart && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onLoadOrderToCart(order);
                                      onClose();
                                    }}
                                    style={{
                                      height: 40,
                                      fontSize: 12.5,
                                      fontWeight: 700,
                                      gap: 5,
                                      padding: '0 12px',
                                      borderRadius: 9,
                                      background: 'rgba(255, 255, 255, 0.07)',
                                      border: '1px solid rgba(255, 255, 255, 0.15)',
                                      color: '#e2e8f0',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      cursor: 'pointer',
                                      touchAction: 'manipulation'
                                    }}
                                  >
                                    <Edit2 size={13} /> Edit
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handlePrint(order)}
                                  style={{
                                    height: 40,
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    gap: 5,
                                    padding: '0 12px',
                                    borderRadius: 9,
                                    background: order.billPrinted ? 'rgba(56, 189, 248, 0.1)' : 'rgba(255, 255, 255, 0.07)',
                                    border: order.billPrinted ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid rgba(255, 255, 255, 0.15)',
                                    color: order.billPrinted ? '#38bdf8' : '#e2e8f0',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    cursor: 'pointer',
                                    touchAction: 'manipulation'
                                  }}
                                >
                                  <Printer size={14} /> {order.billPrinted ? 'Bill ✓' : 'Bill'}
                                </button>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                          height: 40,
                                          fontSize: 12.5,
                                          fontWeight: 700,
                                          gap: 5,
                                          padding: '0 12px',
                                          borderRadius: 9,
                                          background: 'rgba(56, 189, 248, 0.1)',
                                          border: '1px solid rgba(56, 189, 248, 0.35)',
                                          color: '#38bdf8',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          cursor: 'pointer',
                                          touchAction: 'manipulation'
                                        }}
                                      >
                                        <CreditCard size={14} /> Card / UPI
                                      </button>
                                    )}

                                    <div style={{
                                      display: 'inline-flex',
                                      alignItems: 'stretch',
                                      borderRadius: 9,
                                      overflow: 'hidden',
                                      boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                                    }}>
                                      <button
                                        type="button"
                                        aria-label="Quick Cash"
                                        onClick={() => handleQuickCashSettle(order, autoPrintOnSettle ? !order.billPrinted : false)}
                                        disabled={settlingId === order.id}
                                        style={{
                                          height: 40,
                                          fontSize: 12.5,
                                          fontWeight: 800,
                                          gap: 5,
                                          padding: '0 13px',
                                          background: '#10b981',
                                          border: 'none',
                                          color: '#ffffff',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          cursor: 'pointer',
                                          touchAction: 'manipulation'
                                        }}
                                      >
                                        <Zap size={13} fill="#fff" /> Quick Cash
                                      </button>
                                      <button
                                        type="button"
                                        aria-label="Print Receipt & Settle"
                                        onClick={() => handleQuickCashSettle(order, true)}
                                        disabled={settlingId === order.id}
                                        style={{
                                          height: 40,
                                          padding: '0 12px',
                                          background: '#059669',
                                          border: 'none',
                                          borderLeft: '1px solid rgba(255, 255, 255, 0.25)',
                                          color: '#ffffff',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          touchAction: 'manipulation'
                                        }}
                                      >
                                        <Printer size={14} />
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkComplete(order)}
                                    style={{
                                      height: 40,
                                      fontSize: 12.5,
                                      fontWeight: 800,
                                      gap: 5,
                                      padding: '0 14px',
                                      borderRadius: 9,
                                      background: 'var(--color-primary, #3b82f6)',
                                      border: 'none',
                                      color: '#ffffff',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      cursor: 'pointer',
                                      touchAction: 'manipulation'
                                    }}
                                  >
                                    <Check size={14} strokeWidth={2.5} /> Complete
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
                        const settledTimeDisplay = formatOrderTimestamp(
                          order,
                          ['paidAt', 'updatedAt', 'createdAt'],
                          { includeDate: historyRange !== 'today' }
                        );

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
                                {settledTimeDisplay}
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
                                    {renderOrderItemRows(order.items, currency, { compact: true })}
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
                        const voidTimeDisplay = formatOrderTimestamp(
                          order,
                          ['cancelledAt', 'updatedAt', 'createdAt'],
                          { includeDate: historyRange !== 'today' }
                        );

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
                                {voidTimeDisplay}
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
  );
}
