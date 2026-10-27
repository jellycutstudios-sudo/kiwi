import { useState, useMemo } from 'react';
import { useOrderStore } from '../../stores/orderStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { printReceipt } from '../../utils/print';
import { getOrderElapsedSeconds } from '../../utils/timezoneUtils';
import { 
  X, Printer, Check, ShoppingBag, Utensils, Clock, Zap, Search,
  Edit2
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
}) {
  const activeOrders = useOrderStore(s => s.activeOrders);
  const updateOrderStatus = useOrderStore(s => s.updateOrderStatus);
  const settleOrder = useOrderStore(s => s.settleOrder);

  const [filterType, setFilterType] = useState('all'); // 'all' | 'takeaway' | 'ready' | 'dine-in'
  const [searchQuery, setSearchQuery] = useState('');
  const [settlingId, setSettlingId] = useState(null);

  // Filter running orders (exclude billed/cancelled)
  const runningOrders = useMemo(() => {
    return (activeOrders || []).filter(o => o.status !== 'billed' && o.status !== 'cancelled');
  }, [activeOrders]);

  const readyCount = useMemo(() => {
    return runningOrders.filter(o => o.status === 'ready').length;
  }, [runningOrders]);

  const takeawayCount = useMemo(() => {
    return runningOrders.filter(o => o.type === 'takeaway' || o.type === 'pickup').length;
  }, [runningOrders]);

  const filteredOrders = useMemo(() => {
    return runningOrders.filter(o => {
      const isTakeaway = o.type === 'takeaway' || o.type === 'pickup';
      const isDineIn = o.type === 'dine-in';
      const isReady = o.status === 'ready';

      if (filterType === 'takeaway' && !isTakeaway) return false;
      if (filterType === 'dine-in' && !isDineIn) return false;
      if (filterType === 'ready' && !isReady) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchToken = o.token && String(o.token).includes(q);
        const matchTable = o.tableName && o.tableName.toLowerCase().includes(q);
        const matchCust = o.customerName && o.customerName.toLowerCase().includes(q);
        const matchId = o.id && o.id.toLowerCase().includes(q);
        return matchToken || matchTable || matchCust || matchId;
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
      toast.success(`Order settled via CASH ✓ Bill closed`, { icon: '💵' });
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
      toast.success(`Order handed over & completed! ✓`, { icon: '🛍️' });
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
        width: '100%',
        maxWidth: 780,
        maxHeight: '88vh',
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
            <span style={{ fontSize: 22 }}>📋</span>
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
            style={{ width: 32, height: 32, padding: 0, borderRadius: '50%' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Pills & Search Bar */}
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
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn btn-xs ${filterType === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('all')}
              style={{ fontWeight: 700, borderRadius: 20, height: 28 }}
            >
              All ({runningOrders.length})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${filterType === 'ready' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('ready')}
              style={{
                fontWeight: 700,
                borderRadius: 20,
                height: 28,
                background: filterType === 'ready' ? '#10b981' : (readyCount > 0 ? 'rgba(16, 185, 129, 0.15)' : undefined),
                color: filterType === 'ready' ? '#fff' : (readyCount > 0 ? '#10b981' : undefined),
                borderColor: readyCount > 0 ? 'rgba(16, 185, 129, 0.4)' : undefined,
              }}
            >
              🔔 Ready ({readyCount})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${filterType === 'takeaway' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('takeaway')}
              style={{ fontWeight: 700, borderRadius: 20, height: 28 }}
            >
              🛍️ Takeaway ({takeawayCount})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${filterType === 'dine-in' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setFilterType('dine-in')}
              style={{ fontWeight: 700, borderRadius: 20, height: 28 }}
            >
              🍽️ Dine In
            </button>
          </div>

          {/* Quick Search */}
          <div style={{ position: 'relative', width: 220 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-tertiary)' }} />
            <input
              type="text"
              placeholder="Search token # or name..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input"
              style={{ paddingLeft: 30, height: 30, fontSize: 12, borderRadius: 16 }}
            />
          </div>
        </div>

        {/* Order List Body */}
        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredOrders.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 20px',
              color: 'var(--color-label-secondary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8
            }}>
              <span style={{ fontSize: 36 }}>✨</span>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-label)' }}>No active orders found</div>
              <div style={{ fontSize: 12 }}>All kitchen orders have been served, settled, or completed!</div>
            </div>
          ) : (
            filteredOrders.map(order => {
              const isTakeaway = order.type === 'takeaway' || order.type === 'pickup';
              const isReady = order.status === 'ready';
              const isUnpaid = order.paymentMethod === 'unpaid';
              const elapsedSec = getOrderElapsedSeconds(order, now);
              const elapsedMins = Math.floor(elapsedSec / 60);
              const itemsCount = (order.items || []).reduce((sum, i) => sum + (i.qty || 1), 0);

              return (
                <div
                  key={order.id}
                  style={{
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    border: isReady ? '1.5px solid #10b981' : '1px solid var(--color-separator-opaque)',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    boxShadow: isReady ? '0 4px 14px rgba(16, 185, 129, 0.15)' : undefined,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Top Bar: Token/Table + Status Badge + Elapsed Time */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Icon Capsule */}
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        background: isTakeaway ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                        color: isTakeaway ? '#d97706' : '#2563eb',
                      }}>
                        {isTakeaway ? <ShoppingBag size={16} /> : <Utensils size={16} />}
                      </span>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-label)' }}>
                            {order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : 'Takeaway Order')}
                          </span>
                          {order.customerName && (
                            <span style={{ fontSize: 13, color: 'var(--color-label-secondary)', fontWeight: 600 }}>
                              · {order.customerName}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--color-label-tertiary)' }}>
                          #{order.id.slice(-4).toUpperCase()} • {itemsCount} items
                        </div>
                      </div>
                    </div>

                    {/* Status & Payment Pills */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {/* Kitchen Prep Status */}
                      {isReady ? (
                        <span style={{
                          background: 'rgba(16, 185, 129, 0.15)',
                          color: '#10b981',
                          border: '1px solid rgba(16, 185, 129, 0.35)',
                          padding: '3px 8px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 800,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                          READY ON PASS
                        </span>
                      ) : (
                        <span style={{
                          background: 'rgba(245, 158, 11, 0.12)',
                          color: '#d97706',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          padding: '3px 8px',
                          borderRadius: 8,
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          <Clock size={11} />
                          {elapsedMins}m in Kitchen
                        </span>
                      )}

                      {/* Payment Pill */}
                      <span style={{
                        background: isUnpaid ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                        color: isUnpaid ? '#dc2626' : '#10b981',
                        border: isUnpaid ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(16, 185, 129, 0.3)',
                        padding: '3px 8px',
                        borderRadius: 8,
                        fontSize: 11,
                        fontWeight: 700,
                      }}>
                        {isUnpaid ? 'UNPAID' : `PAID (${(order.paymentMethod || 'cash').toUpperCase()})`}
                      </span>
                    </div>
                  </div>

                  {/* Items Preview */}
                  <div style={{
                    fontSize: 12,
                    color: 'var(--color-label-secondary)',
                    padding: '6px 10px',
                    background: 'var(--color-bg)',
                    borderRadius: 8,
                    border: '1px solid var(--color-separator-opaque)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '75%' }}>
                      {(order.items || []).map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).join(', ')}
                    </span>
                    <strong style={{ fontSize: 14, color: 'var(--color-label)', flexShrink: 0 }}>
                      {formatCurrency(order.total ?? 0, currency)}
                    </strong>
                  </div>

                  {/* Action Buttons: Print Bill, Settle, Recall, Complete */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
                    {/* Recall / Edit in Cart */}
                    {onLoadOrderToCart && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => {
                          onLoadOrderToCart(order);
                          onClose();
                          toast.success(`Loaded ${order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : 'order')} into cart`);
                        }}
                        style={{ height: 30, fontSize: 11, fontWeight: 700, gap: 4, color: 'var(--color-label-secondary)' }}
                        title="Load items back into cart to modify"
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                    )}

                    {/* Print Customer Bill */}
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => handlePrint(order)}
                      style={{ height: 30, fontSize: 11, fontWeight: 700, gap: 5, padding: '0 10px' }}
                      title="Print Customer Bill / Tax Receipt"
                    >
                      <Printer size={13} /> Print Bill
                    </button>

                    {/* Settle (If Unpaid) */}
                    {isUnpaid && (
                      <>
                        <button
                          type="button"
                          className="btn btn-xs"
                          onClick={() => handleQuickCashSettle(order)}
                          disabled={settlingId === order.id}
                          style={{
                            height: 30,
                            fontSize: 11,
                            fontWeight: 700,
                            gap: 5,
                            padding: '0 10px',
                            background: '#10b981',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 8
                          }}
                          title="Settle full bill via Cash and print receipt"
                        >
                          <Zap size={12} fill="#fff" /> Quick Cash
                        </button>
                        {onOpenPayment && (
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => {
                              onLoadOrderToCart(order);
                              onClose();
                              onOpenPayment();
                            }}
                            style={{ height: 30, fontSize: 11, fontWeight: 700, gap: 4 }}
                            title="Open Card / UPI / Split Payment Drawer"
                          >
                            Card / UPI
                          </button>
                        )}
                      </>
                    )}

                    {/* Mark Complete (If Paid or Takeaway ready) */}
                    {(!isUnpaid || isReady) && (
                      <button
                        type="button"
                        className="btn btn-xs btn-primary"
                        onClick={() => handleMarkComplete(order)}
                        style={{ height: 30, fontSize: 11, fontWeight: 700, gap: 4, padding: '0 10px' }}
                        title="Mark handed over to customer & remove from active pass"
                      >
                        <Check size={13} strokeWidth={2.5} /> Complete
                      </button>
                    )}
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
