import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '../../stores/orderStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { printReceipt } from '../../utils/print';
import { getOrderElapsedSeconds } from '../../utils/timezoneUtils';
import { 
  X, Printer, Check, ShoppingBag, Utensils, Clock, Zap, Search,
  Edit2, Bell, FileText, Globe, CreditCard,
  ChevronDown, ChevronUp, LayoutList, LayoutGrid
} from 'lucide-react';
import toast from 'react-hot-toast';

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

  const [filterType, setFilterType] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [settlingId, setSettlingId] = useState(null);
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());
  const [layoutCols, setLayoutCols] = useState('2');

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

  // Filter running orders (exclude billed/cancelled)
  const runningOrders = useMemo(() => {
    return (activeOrders || []).filter(o => o.status !== 'billed' && o.status !== 'cancelled');
  }, [activeOrders]);

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

  const filteredOrders = useMemo(() => {
    return runningOrders.filter(o => {
      const isOnline = o.type === 'online' || !!o.source || o.orderType === 'delivery';
      const isTakeaway = o.type === 'takeaway' || o.type === 'pickup' || (isOnline && o.orderType === 'takeaway');
      const isDineIn = o.type === 'dine-in';
      const isReady = o.status === 'ready';

      if (filterType === 'online' && !isOnline) return false;
      if (filterType === 'takeaway' && !isTakeaway) return false;
      if (filterType === 'dine-in' && !isDineIn) return false;
      if (filterType === 'ready' && !isReady) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchToken = o.token && String(o.token).includes(q);
        const matchTable = o.tableName && o.tableName.toLowerCase().includes(q);
        const matchCust = o.customerName && o.customerName.toLowerCase().includes(q);
        const matchPhone = o.customerPhone && o.customerPhone.includes(q);
        const matchId = o.id && o.id.toLowerCase().includes(q);
        return matchToken || matchTable || matchCust || matchPhone || matchId;
      }
      return true;
    });
  }, [runningOrders, filterType, searchQuery]);

  if (!isOpen) return null;

  const handlePrint = (order) => {
    try {
      printReceipt({
        restaurant,
        order,
        items: order.items || [],
        taxInfo: order.taxInfo,
        staffName: order.staffName || staffName,
      });
      toast.success(`Printing bill for ${order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : 'Order')}`, { icon: '🖨️' });
    } catch (err) {
      toast.error('Print failed: ' + err.message);
    }
  };

  const handleQuickCashSettle = async (order) => {
    if (settlingId) return;
    setSettlingId(order.id);
    try {
      await settleOrder(restaurant.id, order.id, 'cash', order.total);
      toast.success(`Order settled via CASH ✓ Bill closed`);
      // Background print paid receipt
      setTimeout(() => {
        printReceipt({
          restaurant,
          order: { ...order, paymentMethod: 'cash' },
          items: order.items || [],
          taxInfo: order.taxInfo,
          staffName,
        });
      }, 100);
    } catch (err) {
      toast.error('Settle failed: ' + err.message);
    } finally {
      setSettlingId(null);
    }
  };

  const handleMarkComplete = async (order) => {
    try {
      await updateOrderStatus(restaurant.id, order.id, 'completed');
      toast.success(`Order handed over & completed! ✓`);
    } catch (err) {
      toast.error('Update failed: ' + err.message);
    }
  };

  const now = Date.now();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
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
        background: 'var(--color-bg)',
        borderRadius: 'var(--radius-xl)',
        width: '980px',
        maxWidth: 'min(980px, 95vw)',
        height: 'min(780px, 92vh)',
        minHeight: 'min(600px, 88vh)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-xl)',
        border: '1px solid var(--color-separator-opaque)',
        overflow: 'hidden',
      }}>
        {/* Modal Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-bg-secondary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={22} color="var(--color-accent, #38bdf8)" />
            <div>
              <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, color: 'var(--color-label)' }}>
                Running Orders & Kitchen Pass
              </h2>
              <p style={{ fontSize: 12, color: 'var(--color-label-secondary)', margin: '2px 0 0' }}>
                Track takeaway prep status, 1-tap print customer bills, and settle payments
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* View Switcher: 1-Col vs 2-Col Grid */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: 8,
              padding: 2,
              border: '1px solid rgba(255, 255, 255, 0.12)'
            }}>
              <button
                type="button"
                onClick={() => setLayoutCols('1')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: layoutCols === '1' ? 'rgba(255, 255, 255, 0.14)' : 'transparent',
                  color: layoutCols === '1' ? '#ffffff' : 'var(--color-label-tertiary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="Single order per row (Full width)"
              >
                <LayoutList size={13} /> 1-Col
              </button>
              <button
                type="button"
                onClick={() => setLayoutCols('2')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: layoutCols === '2' ? 'rgba(255, 255, 255, 0.14)' : 'transparent',
                  color: layoutCols === '2' ? '#ffffff' : 'var(--color-label-tertiary)',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                title="2 orders per row (Grid view - Recommended)"
              >
                <LayoutGrid size={13} /> 2-Col
              </button>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              style={{ width: 36, height: 36, padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Filter Pills & Search Bar (Touch-Optimized) */}
        <div style={{
          padding: '12px 20px',
          borderBottom: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 10,
          background: 'var(--color-bg)',
        }}>
          {/* Segmented Filter Pills */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('all')}
              style={{ fontWeight: 700, borderRadius: 20, height: 36, padding: '0 14px', fontSize: 12.5 }}
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
                height: 36,
                padding: '0 14px',
                fontSize: 12.5,
                background: filterType === 'ready' ? '#10b981' : (readyCount > 0 ? 'rgba(16, 185, 129, 0.15)' : undefined),
                color: filterType === 'ready' ? '#fff' : (readyCount > 0 ? '#10b981' : undefined),
                borderColor: readyCount > 0 ? 'rgba(16, 185, 129, 0.4)' : undefined,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Bell size={14} /> Ready ({readyCount})
            </button>
            <button
              type="button"
              className={`btn ${filterType === 'online' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('online')}
              style={{
                fontWeight: 700,
                borderRadius: 20,
                height: 36,
                padding: '0 14px',
                fontSize: 12.5,
                background: filterType === 'online' ? '#8b5cf6' : (onlineCount > 0 ? 'rgba(139, 92, 246, 0.15)' : undefined),
                color: filterType === 'online' ? '#fff' : (onlineCount > 0 ? '#8b5cf6' : undefined),
                borderColor: onlineCount > 0 ? 'rgba(139, 92, 246, 0.4)' : undefined,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6
              }}
            >
              <Globe size={14} /> Online ({onlineCount})
              {pendingOnlineCount > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  borderRadius: 10,
                  fontSize: 10.5,
                  padding: '1px 6px',
                  fontWeight: 800,
                  marginLeft: 3
                }}>
                  {pendingOnlineCount} new
                </span>
              )}
            </button>
            <button
              type="button"
              className={`btn ${filterType === 'takeaway' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('takeaway')}
              style={{ fontWeight: 700, borderRadius: 20, height: 36, padding: '0 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <ShoppingBag size={14} /> Takeaway ({takeawayCount})
            </button>
            <button
              type="button"
              className={`btn ${filterType === 'dine-in' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('dine-in')}
              style={{ fontWeight: 700, borderRadius: 20, height: 36, padding: '0 14px', fontSize: 12.5, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Utensils size={14} /> Dine In
            </button>
          </div>

          {/* Quick Search */}
          <div style={{ position: 'relative', width: 230 }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-tertiary)' }} />
            <input
              type="text"
              placeholder="Search token # or name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: 34, paddingRight: searchQuery ? 30 : 12, height: 36, fontSize: 13, borderRadius: 18 }}
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

        {/* Order List Body */}
        <div style={{
          padding: '16px 20px',
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
          display: filteredOrders.length === 0 ? 'flex' : (layoutCols === '2' ? 'grid' : 'flex'),
          gridTemplateColumns: layoutCols === '2' ? 'repeat(auto-fill, minmax(440px, 1fr))' : undefined,
          flexDirection: layoutCols === '2' ? undefined : 'column',
          alignContent: 'start',
          gap: 12
        }}>
          {filteredOrders.length === 0 ? (
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
              <FileText size={36} color="var(--color-label-tertiary)" />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-label)' }}>No active orders found</div>
              <div style={{ fontSize: 12 }}>All kitchen orders have been served, settled, or completed!</div>
            </div>
          ) : (
            filteredOrders.map(order => {
              const isOnline = order.type === 'online' || !!order.source || order.orderType === 'delivery';
              const isDelivery = order.orderType === 'delivery';
              const isTakeaway = order.type === 'takeaway' || order.type === 'pickup' || (isOnline && order.orderType === 'takeaway');
              const isReady = order.status === 'ready';
              const isPending = order.status === 'pending';
              const isOnlinePending = isOnline && isPending;
              const isUnpaid = order.paymentMethod === 'unpaid';
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
                    padding: layoutCols === '2' ? '12px 14px' : '13px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    boxShadow: isOnlinePending ? '0 4px 18px rgba(168, 85, 247, 0.28)' : (isReady ? '0 4px 18px rgba(16, 185, 129, 0.22)' : '0 4px 14px rgba(0, 0, 0, 0.4)'),
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Top Bar: Table/Order Title + Meta Info on Left, Bill Amount on Right */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 17, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px' }}>
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
                        {!isUnpaid && (
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.15)',
                            color: '#34d399',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            padding: '2px 6px',
                            borderRadius: 5,
                            fontSize: 10.5,
                            fontWeight: 800,
                          }}>
                            PAID
                          </span>
                        )}
                      </div>

                      {/* Clean Subtitle: items count + elapsed minutes */}
                      <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span>{itemsCount} {itemsCount === 1 ? 'item' : 'items'}</span>
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

                    {/* Total Bill Amount: Large, Prominent at Top Right */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8', letterSpacing: '-0.3px' }}>
                        {formatCurrency(order.total ?? 0, currency)}
                      </span>
                    </div>
                  </div>

                  {/* Items Preview Line (Minimal, Clean Text without heavy inset box) */}
                  <div 
                    onClick={() => toggleOrderExpand(order.id)}
                    style={{
                      cursor: 'pointer',
                      padding: '2px 0',
                      transition: 'opacity 0.15s ease'
                    }}
                    title="Tap to view item breakdown"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{
                        fontSize: 12.5,
                        color: '#cbd5e1',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontWeight: 500,
                        flex: 1
                      }}>
                        {(order.items || []).map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).join(', ')}
                      </span>
                      <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </div>

                    {/* Detailed Item List (when expanded on tap) */}
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <span style={{ fontWeight: 800, color: '#ffffff', background: 'rgba(255, 255, 255, 0.1)', padding: '1px 5px', borderRadius: 4 }}>
                                {item.qty}×
                              </span>
                              <span style={{ color: '#ffffff', fontWeight: 600 }}>{item.name}</span>
                              {item.selectedModifiers?.map((m, mIdx) => (
                                <span key={mIdx} style={{ fontSize: 10.5, color: '#94a3b8' }}>
                                  +{m.name}
                                </span>
                              ))}
                            </div>
                            <span style={{ fontWeight: 700, color: '#94a3b8' }}>
                              {formatCurrency((item.price || 0) * (item.qty || 1), currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons: 1 Single Clean Row (Zero wrapping!) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    paddingTop: 8,
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)'
                  }}>
                    {/* Left: Tools */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {onLoadOrderToCart && (
                        <button
                          type="button"
                          onClick={() => {
                            onLoadOrderToCart(order);
                            onClose();
                            toast.success(`Loaded ${order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : 'order')} into cart`);
                          }}
                          style={{
                            height: 38,
                            fontSize: 12.5,
                            fontWeight: 700,
                            gap: 5,
                            padding: '0 10px',
                            borderRadius: 8,
                            background: 'rgba(255, 255, 255, 0.08)',
                            border: '1px solid rgba(255, 255, 255, 0.18)',
                            color: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            cursor: 'pointer'
                          }}
                          title="Edit order in cart"
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handlePrint(order)}
                        style={{
                          height: 38,
                          fontSize: 12.5,
                          fontWeight: 700,
                          gap: 5,
                          padding: '0 10px',
                          borderRadius: 8,
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.18)',
                          color: '#ffffff',
                          display: 'inline-flex',
                          alignItems: 'center',
                          cursor: 'pointer'
                        }}
                        title="Print Customer Bill"
                      >
                        <Printer size={13} /> Bill
                      </button>
                    </div>

                    {/* Right: Settlement */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
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
                                height: 38,
                                fontSize: 12.5,
                                fontWeight: 700,
                                gap: 5,
                                padding: '0 11px',
                                borderRadius: 8,
                                background: 'rgba(56, 189, 248, 0.12)',
                                border: '1.5px solid rgba(56, 189, 248, 0.4)',
                                color: '#38bdf8',
                                display: 'inline-flex',
                                alignItems: 'center',
                                cursor: 'pointer'
                              }}
                              title="Card / UPI"
                            >
                              <CreditCard size={13} /> Card / UPI
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleQuickCashSettle(order)}
                            disabled={settlingId === order.id}
                            style={{
                              height: 38,
                              fontSize: 13,
                              fontWeight: 800,
                              gap: 5,
                              padding: '0 13px',
                              borderRadius: 8,
                              background: '#10b981',
                              border: 'none',
                              color: '#ffffff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              cursor: 'pointer',
                              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)'
                            }}
                            title="Quick Cash Settle"
                          >
                            <Zap size={13} fill="#fff" /> Quick Cash
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleMarkComplete(order)}
                          style={{
                            height: 38,
                            fontSize: 13,
                            fontWeight: 800,
                            gap: 5,
                            padding: '0 16px',
                            borderRadius: 8,
                            background: 'var(--color-primary, #3b82f6)',
                            border: 'none',
                            color: '#ffffff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            cursor: 'pointer'
                          }}
                          title="Complete order"
                        >
                          <Check size={14} strokeWidth={2.5} /> Complete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
