import { useState, useMemo, useEffect } from 'react';
import { useOrderStore } from '../../stores/orderStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { printReceipt } from '../../utils/print';
import { getOrderElapsedSeconds } from '../../utils/timezoneUtils';
import { 
  X, Printer, Check, ShoppingBag, Utensils, Clock, Zap, Search,
  Edit2, Bell, FileText, Globe, Bike, Phone, MapPin, CreditCard,
  ChevronDown, ChevronUp
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
        width: '860px',
        maxWidth: 'min(860px, 95vw)',
        height: 'min(640px, 88vh)',
        minHeight: 'min(560px, 88vh)',
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
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 14,
                    border: isOnlinePending ? '1.5px solid #8b5cf6' : (isReady ? '1.5px solid #10b981' : '1px solid var(--color-separator-opaque)'),
                    padding: '16px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                    boxShadow: isOnlinePending ? '0 4px 16px rgba(139, 92, 246, 0.22)' : (isReady ? '0 4px 16px rgba(16, 185, 129, 0.18)' : '0 2px 8px rgba(0,0,0,0.06)'),
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Top Bar: Token/Table + Status Badge + Elapsed Time */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {/* Icon Capsule */}
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: isOnline 
                          ? (isDelivery ? 'rgba(56, 189, 248, 0.15)' : 'rgba(139, 92, 246, 0.15)')
                          : (isTakeaway ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)'),
                        color: isOnline 
                          ? (isDelivery ? '#0284c7' : '#8b5cf6')
                          : (isTakeaway ? '#d97706' : '#2563eb'),
                      }}>
                        {isDelivery ? <Bike size={18} /> : (isOnline ? <Globe size={18} /> : (isTakeaway ? <ShoppingBag size={18} /> : <Utensils size={18} />))}
                      </span>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--color-label)' }}>
                            {order.tableName 
                              ? `Table ${order.tableName}` 
                              : (order.token 
                                  ? `Token #${order.token}` 
                                  : (isDelivery ? `Delivery #${order.id.slice(-4).toUpperCase()}` : (isOnline ? `Online #${order.id.slice(-4).toUpperCase()}` : 'Takeaway Order')))}
                          </span>
                          {isOnline && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 800,
                              textTransform: 'uppercase',
                              background: 'rgba(139, 92, 246, 0.12)',
                              color: '#8b5cf6',
                              padding: '2px 6px',
                              borderRadius: 4,
                              border: '1px solid rgba(139, 92, 246, 0.25)'
                            }}>
                              {order.source ? String(order.source).toUpperCase() : 'ONLINE PORTAL'}
                            </span>
                          )}
                          {order.customerName && (
                            <span style={{ fontSize: 13.5, color: 'var(--color-label-secondary)', fontWeight: 600 }}>
                              · {order.customerName}
                            </span>
                          )}
                          {order.customerPhone && (
                            <span style={{ fontSize: 11.5, color: 'var(--color-label-tertiary)', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              <Phone size={11} /> {order.customerPhone}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--color-label-tertiary)', marginTop: 2 }}>
                          #{order.id.slice(-4).toUpperCase()} • {itemsCount} items
                          {order.deliveryAddress && (
                            <span style={{ marginLeft: 8, color: 'var(--color-label-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <MapPin size={11} color="#0284c7" /> {order.deliveryAddress}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status & Payment Pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Kitchen Prep Status */}
                      {isReady ? (
                        <span style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          padding: '4px 10px',
                          borderRadius: 8,
                          fontSize: 11.5,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
                          READY ON PASS
                        </span>
                      ) : isOnlinePending ? (
                        <span style={{
                          background: 'rgba(139, 92, 246, 0.15)',
                          color: '#8b5cf6',
                          border: '1px solid rgba(139, 92, 246, 0.35)',
                          padding: '4px 10px',
                          borderRadius: 8,
                          fontSize: 11.5,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5
                        }}>
                          <Bell size={12} /> NEW WEB ORDER
                        </span>
                      ) : (
                        <span style={{
                          background: 'rgba(245, 158, 11, 0.12)',
                          color: '#d97706',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          padding: '4px 10px',
                          borderRadius: 8,
                          fontSize: 11.5,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5
                        }}>
                          <Clock size={12} />
                          {elapsedMins}m in Kitchen
                        </span>
                      )}

                      {/* Payment Pill */}
                      <span style={{
                        background: isUnpaid ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                        color: isUnpaid ? '#dc2626' : '#10b981',
                        border: isUnpaid ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '4px 10px',
                        borderRadius: 8,
                        fontSize: 11.5,
                        fontWeight: 800,
                      }}>
                        {isUnpaid ? 'UNPAID' : `PAID (${(order.paymentMethod || 'cash').toUpperCase()})`}
                      </span>
                    </div>
                  </div>

                  {/* Items Preview with Tap-to-Expand Details */}
                  <div 
                    onClick={() => toggleOrderExpand(order.id)}
                    style={{
                      background: 'var(--color-bg)',
                      borderRadius: 10,
                      border: '1px solid var(--color-separator-opaque)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      overflow: 'hidden'
                    }}
                    title="Tap to toggle complete item breakdown"
                  >
                    <div style={{
                      padding: '8px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                        <span style={{
                          fontSize: 12.5,
                          color: 'var(--color-label-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 500
                        }}>
                          {(order.items || []).map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).join(', ')}
                        </span>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: 'var(--color-label-tertiary)',
                          flexShrink: 0
                        }}>
                          {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </span>
                      </div>
                      <strong style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-accent, #38bdf8)', flexShrink: 0 }}>
                        {formatCurrency(order.total ?? 0, currency)}
                      </strong>
                    </div>

                    {/* Detailed Item List (when expanded on tap) */}
                    {isExpanded && (
                      <div style={{
                        borderTop: '1px solid var(--color-separator-opaque)',
                        padding: '10px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                        background: 'rgba(0, 0, 0, 0.02)'
                      }}>
                        {(order.items || []).map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ 
                                fontWeight: 800, 
                                background: 'var(--color-bg-secondary)', 
                                padding: '1px 6px', 
                                borderRadius: 4,
                                border: '1px solid var(--color-separator)',
                                fontSize: 11
                              }}>
                                {item.qty}×
                              </span>
                              <span style={{ fontWeight: 600, color: 'var(--color-label)' }}>{item.name}</span>
                              {item.selectedModifiers?.map((m, mIdx) => (
                                <span key={mIdx} style={{ fontSize: 11, color: 'var(--color-label-tertiary)', background: 'var(--color-separator-opaque)', padding: '0 5px', borderRadius: 3 }}>
                                  +{m.name}
                                </span>
                              ))}
                            </div>
                            <span style={{ fontWeight: 700, color: 'var(--color-label-secondary)' }}>
                              {formatCurrency((item.price || 0) * (item.qty || 1), currency)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action Buttons: Touch-Optimized for Cashier Billing (40px Tap Targets, Clean 2-Group Layout) */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    paddingTop: 4
                  }}>
                    {/* Left: Order Management (Edit & Print Bill) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {/* Recall / Edit in Cart */}
                      {onLoadOrderToCart && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => {
                            onLoadOrderToCart(order);
                            onClose();
                            toast.success(`Loaded ${order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : 'order')} into cart`);
                          }}
                          style={{
                            height: 40,
                            fontSize: 13,
                            fontWeight: 700,
                            gap: 6,
                            padding: '0 14px',
                            borderRadius: 10,
                            color: 'var(--color-label-secondary)'
                          }}
                          title="Load items back into cart to modify"
                        >
                          <Edit2 size={14} /> Edit
                        </button>
                      )}

                      {/* Print Customer Bill */}
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handlePrint(order)}
                        style={{
                          height: 40,
                          fontSize: 13,
                          fontWeight: 700,
                          gap: 6,
                          padding: '0 14px',
                          borderRadius: 10
                        }}
                        title="Print Customer Bill / Tax Receipt"
                      >
                        <Printer size={14} /> Print Bill
                      </button>
                    </div>

                    {/* Right: Payment & Settlement */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {isUnpaid ? (
                        <>
                          {onOpenPayment && (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => {
                                onLoadOrderToCart(order);
                                onClose();
                                onOpenPayment();
                              }}
                              style={{
                                height: 40,
                                fontSize: 13,
                                fontWeight: 700,
                                gap: 6,
                                padding: '0 15px',
                                borderRadius: 10
                              }}
                              title="Open Card / UPI / Split Payment Drawer"
                            >
                              <CreditCard size={14} /> Card / UPI
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn"
                            onClick={() => handleQuickCashSettle(order)}
                            disabled={settlingId === order.id}
                            style={{
                              height: 40,
                              fontSize: 13,
                              fontWeight: 800,
                              gap: 6,
                              padding: '0 16px',
                              background: '#10b981',
                              color: '#fff',
                              border: 'none',
                              borderRadius: 10,
                              cursor: 'pointer',
                              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
                            }}
                            title="Settle full bill via Cash and print receipt"
                          >
                            <Zap size={14} fill="#fff" /> Quick Cash
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleMarkComplete(order)}
                          style={{
                            height: 40,
                            fontSize: 13,
                            fontWeight: 800,
                            gap: 6,
                            padding: '0 18px',
                            borderRadius: 10
                          }}
                          title="Mark handed over to customer & remove from active pass"
                        >
                          <Check size={15} strokeWidth={2.5} /> Complete
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
