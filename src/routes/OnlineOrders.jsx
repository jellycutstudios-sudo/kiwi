import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { formatCurrency } from '../utils/formatCurrency';
import { Check, X, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import { printReceipt } from '../utils/print';
import { computeTax } from '../utils/taxUtils';

const PLATFORM_BADGES = {
  zomato:      { label: 'Zomato',     color: '#000000', bg: '#f5f5f5', emoji: '🍕' },
  swiggy:      { label: 'Swiggy',     color: '#000000', bg: '#f5f5f5', emoji: '🟠' },
  ubereats:    { label: 'Uber Eats',  color: '#000000', bg: '#f5f5f5', emoji: '🚗' },
  deliveroo:   { label: 'Deliveroo',  color: '#000000', bg: '#f5f5f5', emoji: '🦘' },
  native:      { label: 'Direct',     color: 'var(--color-label)', bg: 'var(--color-bg-tertiary)', emoji: '🌐' },
};

export default function OnlineOrders() {
  const { t } = useTranslation();
  const { restaurant } = useAuthStore();
  const { onlineOrders, updateOrderStatus, markOnlineOrdersRead } = useOrderStore();
  const [filter, setFilter] = useState('pending');
  const currency = restaurant?.currency ?? 'INR';

  useEffect(() => { markOnlineOrdersRead(); }, [markOnlineOrdersRead]);

  const filtered = onlineOrders.filter(o =>
    filter === 'all' ? true : o.status === filter
  );

  const handleAccept = async (order) => {
    await updateOrderStatus(restaurant.id, order.id, 'preparing');
    if (order.source && order.source !== 'native') {
      toast.promise(
        fetch(`https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project'}.cloudfunctions.net/syncDeliveryMenu?action=accept&platform=${order.source}&orderId=${order.externalOrderId}&restaurantId=${restaurant.id}`)
          .catch(() => {}),
        {
          loading: `Sending acceptance to ${order.source}...`,
          success: `Notified ${order.source}!`,
          error: `Failed to notify ${order.source}`
        }
      );
    } else {
      toast.success('Order accepted — sent to kitchen!', { icon: '✅' });
    }
  };

  const handleReject = async (order) => {
    await updateOrderStatus(restaurant.id, order.id, 'billed');
    if (order.source && order.source !== 'native') {
      toast.promise(
        fetch(`https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project'}.cloudfunctions.net/syncDeliveryMenu?action=reject&platform=${order.source}&orderId=${order.externalOrderId}&restaurantId=${restaurant.id}`)
          .catch(() => {}),
        {
          loading: `Sending cancellation to ${order.source}...`,
          success: `Notified ${order.source} of cancellation!`,
          error: `Failed to notify ${order.source}`
        }
      );
    } else {
      toast('Order rejected', { icon: '❌' });
    }
  };

  const statusColors = {
    pending:   'badge-yellow',
    preparing: 'badge-blue',
    ready:     'badge-teal',
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-5)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <h2 className="text-title2">{t('onlineOrders')}</h2>
          <p className="text-secondary text-subhead" style={{ marginTop: 2 }}>
            Customer orders submitted via your online order page
          </p>
        </div>
        <div className="badge badge-purple" style={{ fontSize:'var(--text-subhead)' }}>
          <Globe size={14} /> {onlineOrders.filter(o=>o.status==='pending').length} pending
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:'var(--space-2)', flexWrap:'wrap' }}>
        {['pending','preparing','ready','all'].map(f => (
          <button
            key={f}
            id={`online-filter-${f}`}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Orders */}
      {filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:'var(--space-12)', color:'var(--color-label-tertiary)' }}>
          <div style={{fontSize:40}}>📱</div>
          <div style={{marginTop:'var(--space-3)', fontSize:'var(--text-headline)'}}>No {filter} online orders</div>
          <div style={{fontSize:'var(--text-footnote)', marginTop:'var(--space-1)'}}>
            Share your order link: /order/{restaurant?.id}
          </div>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-4)' }}>
          {filtered.map(order => {
            const badge = PLATFORM_BADGES[order.source || 'native'] || PLATFORM_BADGES.native;

            return (
              <div key={order.id} className="card" id={`online-order-${order.id}`}>
                <div className="card-header">
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)' }}>
                      <div style={{ fontWeight:'var(--weight-bold)', fontSize:'var(--text-headline)' }}>
                        {order.customerName || 'Anonymous'} {order.customerPhone ? `· ${order.customerPhone}` : ''}
                      </div>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-sm)',
                        background: badge.bg,
                        color: badge.color,
                        fontWeight: 'var(--weight-semibold)',
                        fontSize: 'var(--text-caption2)',
                        textTransform: 'uppercase'
                      }}>
                        {badge.emoji} {badge.label}
                      </span>
                    </div>
                    <div style={{ fontSize:'var(--text-caption1)', color:'var(--color-label-secondary)', marginTop:4, display:'flex', flexDirection:'column', gap:2 }}>
                      <div>
                        {order.orderType === 'delivery' || (order.source && order.source !== 'native') ? '🛵 Delivery' : (order.type === 'dine-in' ? '🍽️ Dine In' : '🛍️ Pickup')} 
                        {' · '}
                        {order.externalOrderId ? `ID: ${order.externalOrderId}` : `#${order.id.slice(-8).toUpperCase()}`}
                      </div>
                      {order.deliveryAddress && (
                        <div style={{ color:'var(--color-label-secondary)', fontSize:'var(--text-caption2)', display:'flex', alignItems:'center', gap:4 }}>
                          <span>📍</span> <span>{order.deliveryAddress}</span>
                        </div>
                      )}
                      {order.estimatedDeliveryTime && (
                        <div style={{ color:'var(--color-label-secondary)', fontSize:'var(--text-caption2)', display:'flex', alignItems:'center', gap:4 }}>
                          <span>🕒</span> <span>Est. Delivery: {order.estimatedDeliveryTime}</span>
                        </div>
                      )}
                    </div>
                  </div>
                <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)' }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const discountAmount = order.discountAmount ?? 0;
                      const taxableAmount = Math.max(0, order.subtotal - discountAmount);
                      const taxInfo = computeTax(taxableAmount, restaurant?.taxConfig ?? { type: 'none', rate: 0 });
                      printReceipt({
                        restaurant,
                        order,
                        items: order.items,
                        taxInfo,
                        staffName: 'Online Cashier'
                      });
                    }}
                    style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', height: '28px' }}
                  >
                    🖨️ Print Receipt
                  </button>
                  <span className={`badge ${statusColors[order.status] ?? 'badge-gray'}`}>
                    {order.status}
                  </span>
                  <span style={{ fontWeight:'var(--weight-bold)', fontSize:'var(--text-title3)' }}>
                    {formatCurrency(order.total ?? 0, currency)}
                  </span>
                </div>
              </div>
              <div style={{ padding:'var(--space-4) var(--space-5)' }}>
                <table style={{ width:'100%', fontSize:'var(--text-subhead)' }}>
                  <tbody>
                    {(order.items ?? []).map((item, i) => (
                      <tr key={i}>
                        <td style={{ padding:'3px 0', color:'var(--color-label)' }}>
                          <strong>×{item.qty}</strong> {item.name}
                          {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                            <div style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)', paddingLeft: 12, marginTop: 2 }}>
                              + {item.selectedModifiers.map(m => m.name).join(', ')}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign:'right', color:'var(--color-label-secondary)' }}>
                          {formatCurrency(item.price * item.qty, currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {order.note && (
                  <div style={{ marginTop:'var(--space-3)', padding:'var(--space-2) var(--space-3)', background:'var(--color-brand-ochre-light)', borderRadius:'var(--radius-sm)', fontSize:'var(--text-footnote)', color:'var(--color-label)' }}>
                    📝 {order.note}
                  </div>
                )}
                {order.platformCommission && (
                  <div style={{
                    marginTop: 'var(--space-3)',
                    padding: 'var(--space-2) var(--space-3)',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 'var(--text-footnote)',
                    color: 'var(--color-label-secondary)',
                    display: 'flex',
                    justifyContent: 'space-between'
                  }}>
                    <span>Platform Commission ({order.platformCommission}%)</span>
                    <strong>-{formatCurrency((order.total * order.platformCommission) / 100, currency)}</strong>
                  </div>
                )}
              </div>
              {order.status === 'pending' && (
                <div className="modal-footer">
                  <button
                    className="btn btn-danger"
                    id={`reject-order-${order.id}`}
                    onClick={() => handleReject(order)}
                  >
                    <X size={16} /> Reject
                  </button>
                  <button
                    className="btn btn-success"
                    id={`accept-order-${order.id}`}
                    onClick={() => handleAccept(order)}
                  >
                    <Check size={16} /> Accept
                  </button>
                </div>
              )}
            </div>
          )})}
        </div>
      )}
    </div>
  );
}
