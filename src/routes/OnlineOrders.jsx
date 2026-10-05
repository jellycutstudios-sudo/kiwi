import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../stores/authStore';
import { useOrderStore } from '../stores/orderStore';
import { useTableStore } from '../stores/tableStore';
import { useTokenStore } from '../stores/tokenStore';
import { formatCurrency } from '../utils/formatCurrency';
import { computeTax } from '../utils/taxUtils';
import { printReceipt, printSingleKitchenTicket, printKitchenTickets } from '../utils/print';
import { auth } from '../firebase';
import {
  Globe, Truck, Clock, Check, X, Printer, ChefHat, Bell, AlertTriangle,
  User, Eye, Zap, Search, Copy, ExternalLink, Share2, Smartphone,
  ShoppingBag, LayoutList, Columns, MessageCircle, CheckCircle2,
  MapPin, Filter
} from 'lucide-react';
import toast from 'react-hot-toast';

const PLATFORM_BADGES = {
  zomato:    { label: 'Zomato',    color: '#e23744', bg: 'rgba(226,55,68,0.1)',  emoji: '🍕', border: 'rgba(226,55,68,0.25)' },
  swiggy:    { label: 'Swiggy',    color: '#fc8019', bg: 'rgba(252,128,25,0.1)', emoji: '🟠', border: 'rgba(252,128,25,0.25)' },
  ubereats:  { label: 'Uber Eats', color: '#06c167', bg: 'rgba(6,193,103,0.1)',  emoji: '🚗', border: 'rgba(6,193,103,0.25)' },
  deliveroo: { label: 'Deliveroo', color: '#00cdbc', bg: 'rgba(0,205,188,0.1)',  emoji: '🦘', border: 'rgba(0,205,188,0.25)' },
  native:    { label: 'Store Link',color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', emoji: '🌐', border: 'rgba(139,92,246,0.25)' },
  'dine-in': { label: 'Dine-In',   color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  emoji: '🍽️', border: 'rgba(59,130,246,0.25)' },
  takeaway:  { label: 'Takeaway',  color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', emoji: '🛍️', border: 'rgba(245,158,11,0.25)' },
};

export default function OnlineOrders() {
  const { t } = useTranslation();
  const restaurant = useAuthStore(s => s.restaurant);
  const staffDoc = useAuthStore(s => s.staffDoc);

  const activeOrders = useOrderStore(s => s.activeOrders);
  const updateOrderStatus = useOrderStore(s => s.updateOrderStatus);
  const settleOrder = useOrderStore(s => s.settleOrder);
  const markOnlineOrdersRead = useOrderStore(s => s.markOnlineOrdersRead);
  const { callSpecificToken } = useTokenStore();

  const [channelFilter, setChannelFilter] = useState('online'); // 'online' | 'all' | 'dine-in' | 'takeaway'
  const [statusFilter, setStatusFilter] = useState('all');       // 'all' | 'pending' | 'preparing' | 'ready' | 'completed'
  const [viewMode, setViewMode] = useState('list');              // 'list' | 'board'
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState(null);

  // Modals & previews
  const [selectedOrderDetails, setSelectedOrderDetails] = useState(null);
  const [trackingPreviewOrder, setTrackingPreviewOrder] = useState(null);
  const [quickSettleOrder, setQuickSettleOrder] = useState(null);
  const [settling, setSettling] = useState(false);
  const [crossedItems, setCrossedItems] = useState({});

  const currency = restaurant?.currency ?? 'INR';

  // Mark pending online orders as read when visiting
  useEffect(() => {
    markOnlineOrdersRead();
  }, [markOnlineOrdersRead]);

  // Tick for relative time elapsed
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 15000);
    return () => clearInterval(interval);
  }, []);

  const getElapsedMinutes = (createdAt) => {
    if (!createdAt) return 0;
    const date = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const diffMs = new Date() - date;
    return Math.max(0, Math.floor(diffMs / 60000));
  };

  const getElapsedTimeText = (createdAt) => {
    const mins = getElapsedMinutes(createdAt);
    if (mins < 1) return 'Just now';
    return `${mins}m ago`;
  };

  const toggleCrossItem = (orderId, idx) => {
    const key = `${orderId}-${idx}`;
    setCrossedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Base list depending on channel filter
  const baseOrders = useMemo(() => {
    if (channelFilter === 'online') {
      return activeOrders.filter(o => o.type === 'online' || o.source || o.orderType === 'delivery');
    }
    if (channelFilter === 'dine-in') {
      return activeOrders.filter(o => o.type === 'dine-in');
    }
    if (channelFilter === 'takeaway') {
      return activeOrders.filter(o => o.type === 'takeaway');
    }
    return activeOrders;
  }, [activeOrders, channelFilter]);

  // Filtered orders with search and status tab
  const filteredOrders = useMemo(() => {
    const queryStr = search.toLowerCase().trim();
    return baseOrders.filter(order => {
      // Status filter
      if (statusFilter !== 'all' && order.status !== statusFilter) {
        return false;
      }
      // Search
      if (queryStr) {
        const matchesName = order.customerName && order.customerName.toLowerCase().includes(queryStr);
        const matchesPhone = order.customerPhone && order.customerPhone.includes(queryStr);
        const matchesTable = order.tableName && order.tableName.toLowerCase().includes(queryStr);
        const matchesToken = order.token && String(order.token).includes(queryStr);
        const matchesId = order.id && order.id.toLowerCase().includes(queryStr);
        const matchesExtId = order.externalOrderId && String(order.externalOrderId).toLowerCase().includes(queryStr);
        if (!matchesName && !matchesPhone && !matchesTable && !matchesToken && !matchesId && !matchesExtId) {
          return false;
        }
      }
      return true;
    });
  }, [baseOrders, statusFilter, search]);

  // Metrics for counters
  const counts = useMemo(() => {
    const currentBase = channelFilter === 'online'
      ? activeOrders.filter(o => o.type === 'online' || o.source || o.orderType === 'delivery')
      : activeOrders;

    return {
      total: currentBase.length,
      pending: currentBase.filter(o => o.status === 'pending').length,
      preparing: currentBase.filter(o => o.status === 'preparing').length,
      ready: currentBase.filter(o => o.status === 'ready').length,
    };
  }, [activeOrders, channelFilter]);

  // Customer tracking URL builder
  const getCustomerTrackingUrl = (order) => {
    if (!order?.id || !restaurant?.id) return '';
    const base = window.location.origin;
    return `${base}/order/${restaurant.id}?orderId=${order.id}`;
  };

  const handleCopyTrackingLink = (order, e) => {
    if (e) e.stopPropagation();
    const url = getCustomerTrackingUrl(order);
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Live Tracking Link copied! Customer can view order status.', { icon: '🔗' });
    }).catch(() => {
      toast.error('Failed to copy link');
    });
  };

  const handleWhatsAppCustomer = (order, e) => {
    if (e) e.stopPropagation();
    if (!order.customerPhone) {
      toast.error('Customer phone number not available');
      return;
    }
    const cleanPhone = order.customerPhone.replace(/[^0-9]/g, '');
    const trackingUrl = getCustomerTrackingUrl(order);
    const orderLabel = order.externalOrderId ? `#${order.externalOrderId}` : `#${order.id.slice(-6).toUpperCase()}`;
    const restName = restaurant?.name || 'our restaurant';

    const msg = `Hi ${order.customerName || 'there'}! Your order ${orderLabel} from ${restName} is currently ${order.status?.toUpperCase()}.\n\nTrack your order live here: ${trackingUrl}\n\nThank you for choosing us! 🍽️`;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Status transitions
  const handleAccept = async (order) => {
    if (!order?.id || processingId === order.id) return;
    setProcessingId(order.id);
    try {
      await updateOrderStatus(restaurant.id, order.id, 'preparing');
      
      // Notify third party webhook if platform order
      if (order.source && order.source !== 'native') {
        const getAuthToken = async () => {
          const user = auth?.currentUser;
          return user ? await user.getIdToken() : null;
        };
        toast.promise(
          getAuthToken().then(token => {
            if (!token) return Promise.reject(new Error('Not authenticated'));
            return fetch(
              `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project'}.cloudfunctions.net/syncDeliveryMenu?action=accept&platform=${order.source}&orderId=${order.externalOrderId}&restaurantId=${restaurant.id}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
          }).catch(() => {}),
          {
            loading: `Syncing with ${order.source}...`,
            success: `Notified ${order.source}!`,
            error: `Failed to notify ${order.source}`
          }
        );
      } else {
        toast.success('Order accepted! Customer tracker updated to "Preparing Food" 🍳', { icon: '✅' });
      }

      // Auto-print kitchen tickets if configured
      const kitchenConfig = restaurant?.kitchenConfig;
      const kitchenMode = kitchenConfig?.mode || (restaurant?.modes?.includes('kds') ? 'both' : 'printer_only');
      if (kitchenConfig?.autoPrintOnOnlineOrder !== false && (kitchenMode === 'both' || kitchenMode === 'printer_only')) {
        setTimeout(() => {
          printKitchenTickets({
            restaurant,
            order,
            items: order.items || [],
            staffName: 'Online System'
          });
        }, 100);
      }
    } catch (err) {
      toast.error('Failed to accept order: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkReady = async (order) => {
    if (!order?.id || processingId === order.id) return;
    setProcessingId(order.id);
    try {
      await updateOrderStatus(restaurant.id, order.id, 'ready');
      const isDelivery = order.orderType === 'delivery' || order.source !== undefined;
      const stepText = isDelivery ? 'Out for Delivery 🛵' : 'Ready for Pickup 🛍️';
      toast.success(`Order is now ${stepText}! Live tracking updated for customer.`, { icon: '🔔' });
    } catch (err) {
      toast.error('Failed to update status: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkCompleted = async (order) => {
    if (!order?.id || processingId === order.id) return;
    setProcessingId(order.id);
    try {
      const nextStatus = order.type === 'dine-in' ? 'served' : 'billed';
      await updateOrderStatus(restaurant.id, order.id, nextStatus);
      if (order.tableId) {
        try {
          await useTableStore.getState().freeTable(restaurant.id, order.tableId);
        } catch {}
      }
      toast.success('Order completed and marked as Delivered! 🎉', { icon: '✅' });
      if (selectedOrderDetails?.id === order.id) setSelectedOrderDetails(null);
    } catch (err) {
      toast.error('Failed to complete order: ' + err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (order) => {
    if (!order?.id || processingId === order.id) return;
    const label = order.customerName ? `${order.customerName}'s order` : `#${order.id.slice(-6).toUpperCase()}`;

    toast((toastItem) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '220px' }}>
        <span style={{ fontWeight: 600, fontSize: '13px' }}>Cancel / Reject {label}?</span>
        <span style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>
          This will cancel the order and update customer tracking.
        </span>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button 
            type="button"
            className="btn btn-secondary btn-xs" 
            onClick={() => toast.dismiss(toastItem.id)}
          >
            Back
          </button>
          <button 
            type="button"
            className="btn btn-danger btn-xs"
            onClick={async () => {
              toast.dismiss(toastItem.id);
              setProcessingId(order.id);
              try {
                await updateOrderStatus(restaurant.id, order.id, 'cancelled');
                if (order.tableId) {
                  try {
                    await useTableStore.getState().freeTable(restaurant.id, order.tableId);
                  } catch {}
                }
                if (order.source && order.source !== 'native') {
                  const getAuthToken = async () => {
                    const user = auth?.currentUser;
                    return user ? await user.getIdToken() : null;
                  };
                  toast.promise(
                    getAuthToken().then(token => {
                      if (!token) return Promise.reject(new Error('Not authenticated'));
                      return fetch(
                        `https://us-central1-${import.meta.env.VITE_FIREBASE_PROJECT_ID || 'your-firebase-project'}.cloudfunctions.net/syncDeliveryMenu?action=reject&platform=${order.source}&orderId=${order.externalOrderId}&restaurantId=${restaurant.id}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                      );
                    }).catch(() => {}),
                    {
                      loading: `Notifying ${order.source}...`,
                      success: `Notified ${order.source} of cancellation!`,
                      error: `Failed to notify ${order.source}`
                    }
                  );
                } else {
                  toast('Order cancelled', { icon: '❌' });
                }
                if (selectedOrderDetails?.id === order.id) setSelectedOrderDetails(null);
              } catch (err) {
                toast.error('Failed to cancel order: ' + err.message);
              } finally {
                setProcessingId(null);
              }
            }}
          >
            Confirm Reject
          </button>
        </div>
      </div>
    ), { duration: 6000 });
  };

  const handleQuickSettle = async (order, method = 'cash') => {
    if (!order?.id || !restaurant?.id) return;
    try {
      setSettling(true);
      await settleOrder(restaurant.id, order.id, method, order.total);
      const label = order.customerName || `#${order.id.slice(-6).toUpperCase()}`;
      toast.success(`${label} settled for ${formatCurrency(order.total, currency)} via ${method.toUpperCase()}!`, { icon: '💰' });
      setQuickSettleOrder(null);
      if (selectedOrderDetails?.id === order.id) setSelectedOrderDetails(null);
    } catch (err) {
      toast.error('Failed to settle order: ' + err.message);
    } finally {
      setSettling(false);
    }
  };

  const handlePrint = (order, e) => {
    if (e) e.stopPropagation();
    const discountAmount = order.discountAmount ?? 0;
    const taxableAmount = Math.max(0, (order.subtotal || order.total) - discountAmount);
    const taxInfo = computeTax(taxableAmount, restaurant?.taxConfig ?? { type: 'none', rate: 0 });
    printReceipt({
      restaurant,
      order,
      items: order.items || [],
      taxInfo,
      staffName: staffDoc?.name || 'Online Cashier'
    });
    toast.success('Print command sent!');
  };

  const handlePrintKitchenTicket = (order, e) => {
    if (e) e.stopPropagation();
    printSingleKitchenTicket({
      restaurant,
      order,
      items: order.items || [],
      staffName: staffDoc?.name || order.staffName || 'Online Order'
    });
    toast.success('Kitchen ticket sent to printer! 🍳');
  };

  const handleCallToken = async (tokenNumber, e) => {
    if (e) e.stopPropagation();
    if (!restaurant?.id || !tokenNumber) return;
    try {
      await callSpecificToken(restaurant.id, tokenNumber);
      toast.success(`Calling Token #${tokenNumber} on TV Display!`, { icon: '📢' });
    } catch {
      toast.error("Failed to call token number");
    }
  };

  // Helper to determine customer tracker description
  const getCustomerTrackerPreview = (order) => {
    const isDelivery = order.orderType === 'delivery' || order.source !== undefined;
    switch (order.status) {
      case 'pending':
        return {
          step: 1,
          label: 'Order Received',
          desc: 'The restaurant has received your order and will start cooking shortly.',
          color: 'var(--color-yellow)',
          badgeClass: 'badge-yellow',
        };
      case 'preparing':
        return {
          step: 2,
          label: 'Preparing Food',
          desc: 'Our chefs are actively cooking and preparing your fresh meal.',
          color: 'var(--color-accent)',
          badgeClass: 'badge-blue',
        };
      case 'ready':
        return {
          step: 3,
          label: isDelivery ? 'Out for Delivery' : 'Ready for Pickup',
          desc: isDelivery ? 'Driver is on the way to your address!' : 'Order is packed and ready for collection!',
          color: 'var(--color-teal)',
          badgeClass: 'badge-teal',
        };
      case 'served':
      case 'billed':
        return {
          step: 4,
          label: 'Delivered / Completed',
          desc: 'Enjoy your meal! Order has been delivered.',
          color: 'var(--color-green)',
          badgeClass: 'badge-green',
        };
      default:
        return {
          step: 1,
          label: order.status,
          desc: 'Order status updated',
          color: 'var(--color-gray)',
          badgeClass: 'badge-gray',
        };
    }
  };

  // Card component
  const renderOrderCard = (order) => {
    const elapsedMins = getElapsedMinutes(order.createdAt);
    const isLate = elapsedMins >= 20;
    const badge = PLATFORM_BADGES[order.source || order.type] || PLATFORM_BADGES.native;
    const trackerInfo = getCustomerTrackerPreview(order);

    return (
      <div
        key={order.id}
        className="card"
        id={`order-card-${order.id}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderLeft: isLate ? '4px solid var(--color-red)' : `4px solid ${trackerInfo.color}`,
          background: 'var(--color-bg-elevated)',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
          overflow: 'hidden'
        }}
      >
        {/* Card Header */}
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          background: 'var(--color-bg)'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 'var(--radius-sm)',
                background: badge.bg,
                color: badge.color,
                border: `1px solid ${badge.border}`,
                fontWeight: 'var(--weight-bold)',
                fontSize: '11px',
                textTransform: 'uppercase'
              }}>
                <span>{badge.emoji}</span>
                <span>{badge.label}</span>
              </span>

              {order.token && (
                <span className="badge badge-purple" style={{ fontSize: '11px', fontWeight: 700 }}>
                  🎫 Token #{order.token}
                </span>
              )}

              {order.tableName && (
                <span className="badge badge-blue" style={{ fontSize: '11px', fontWeight: 700 }}>
                  🍽️ Table {order.tableName}
                </span>
              )}

              <span style={{ fontSize: '12px', fontWeight: 'var(--weight-bold)', color: 'var(--color-label)' }}>
                {order.customerName || 'Anonymous Customer'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '11px', color: 'var(--color-label-secondary)' }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {order.externalOrderId ? `ID: ${order.externalOrderId}` : `#${order.id.slice(-6).toUpperCase()}`}
              </span>
              <span>•</span>
              <span>{order.orderType === 'delivery' || order.source ? '🛵 Delivery' : (order.type === 'dine-in' ? '🍽️ Dine In' : '🛍️ Pickup')}</span>
              {order.customerPhone && (
                <>
                  <span>•</span>
                  <span>📞 {order.customerPhone}</span>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--text-headline)', color: 'var(--color-label)' }}>
              {formatCurrency(order.total ?? 0, currency)}
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              color: isLate ? 'var(--color-red)' : 'var(--color-label-secondary)',
              fontSize: '11px',
              fontWeight: isLate ? 700 : 500
            }}>
              <Clock size={11} />
              <span>{getElapsedTimeText(order.createdAt)}</span>
              {isLate && <AlertTriangle size={11} color="var(--color-red)" />}
            </div>
          </div>
        </div>

        {/* Live Customer Tracking Progress Bar */}
        <div style={{
          padding: '8px var(--space-4)',
          background: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px' }}>
            <span style={{ fontWeight: 600, color: 'var(--color-label-secondary)' }}>Customer Live Status:</span>
            <span className={`badge ${trackerInfo.badgeClass}`} style={{ fontSize: '11px', fontWeight: 700 }}>
              Step {trackerInfo.step}/4: {trackerInfo.label}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="btn btn-secondary btn-xs"
              onClick={(e) => handleCopyTrackingLink(order, e)}
              title="Copy customer tracking link to share via SMS or message"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', height: 24, padding: '0 8px' }}
            >
              <Copy size={11} />
              <span>Copy Link</span>
            </button>

            {order.customerPhone && (
              <button
                className="btn btn-secondary btn-xs"
                onClick={(e) => handleWhatsAppCustomer(order, e)}
                title="Send tracking link to customer on WhatsApp"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '11px',
                  height: 24,
                  padding: '0 8px',
                  color: '#10b981',
                  borderColor: 'rgba(16,185,129,0.3)'
                }}
              >
                <MessageCircle size={11} />
                <span>WhatsApp</span>
              </button>
            )}

            <button
              className="btn btn-secondary btn-xs"
              onClick={() => setTrackingPreviewOrder(order)}
              title="Preview what the customer sees on their mobile screen"
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', height: 24, padding: '0 8px' }}
            >
              <Smartphone size={11} />
              <span>Preview</span>
            </button>
          </div>
        </div>

        {/* Card Body & Items Checklist */}
        <div style={{ padding: 'var(--space-3) var(--space-4)', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {order.deliveryAddress && (
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              fontSize: '12px',
              color: 'var(--color-label-secondary)',
              background: 'var(--color-bg)',
              padding: '6px 10px',
              borderRadius: 'var(--radius-sm)'
            }}>
              <MapPin size={13} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-accent)' }} />
              <span>{order.deliveryAddress}</span>
            </div>
          )}

          {/* Item Checklist */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
            {(order.items ?? []).map((item, idx) => {
              const isCrossed = !!crossedItems[`${order.id}-${idx}`];
              return (
                <label
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: isCrossed ? 'var(--color-label-tertiary)' : 'var(--color-label)',
                    textDecoration: isCrossed ? 'line-through' : 'none',
                    padding: '3px 0'
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleCrossItem(order.id, idx);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={isCrossed}
                      onChange={() => {}}
                      style={{ marginTop: 2, cursor: 'pointer' }}
                    />
                    <div>
                      <span style={{ fontWeight: 'var(--weight-bold)', marginRight: 6 }}>×{item.qty}</span>
                      <span>{item.name}</span>
                      {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)', textDecoration: 'none', paddingLeft: 16 }}>
                          + {item.selectedModifiers.map(m => m.name).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--color-label-secondary)', flexShrink: 0 }}>
                    {formatCurrency(item.price * item.qty, currency)}
                  </span>
                </label>
              );
            })}
          </div>

          {order.note && (
            <div style={{
              fontSize: '12px',
              padding: '6px 10px',
              background: 'var(--color-brand-ochre-light)',
              color: 'var(--color-label)',
              borderRadius: 'var(--radius-sm)',
              borderLeft: '3px solid var(--color-brand-ochre)'
            }}>
              📝 <strong>Note:</strong> {order.note}
            </div>
          )}

          {order.platformCommission && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '11px',
              color: 'var(--color-label-secondary)',
              background: 'var(--color-bg)',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)'
            }}>
              <span>Platform Commission ({order.platformCommission}%)</span>
              <strong>-{formatCurrency((order.total * order.platformCommission) / 100, currency)}</strong>
            </div>
          )}
        </div>

        {/* Card Footer Actions: Lifecycle status updates & tools */}
        <div style={{
          padding: 'var(--space-3) var(--space-4)',
          borderTop: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 6,
          background: 'var(--color-bg-secondary)'
        }}>
          {/* Left utility tools */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-icon btn-sm"
              onClick={() => setSelectedOrderDetails(order)}
              title="View Full Order Breakdown"
              style={{ width: 32, height: 32, padding: 0 }}
            >
              <Eye size={14} />
            </button>

            <button
              className="btn btn-secondary btn-icon btn-sm"
              onClick={(e) => handlePrint(order, e)}
              title="Print Customer Receipt"
              style={{ width: 32, height: 32, padding: 0 }}
            >
              <Printer size={14} />
            </button>

            <button
              className="btn btn-secondary btn-icon btn-sm"
              onClick={(e) => handlePrintKitchenTicket(order, e)}
              title="Print Kitchen Ticket (KOT)"
              style={{ width: 32, height: 32, padding: 0 }}
            >
              <ChefHat size={14} />
            </button>

            {order.token && (
              <button
                className="btn btn-secondary btn-icon btn-sm"
                onClick={(e) => handleCallToken(order.token, e)}
                title={`Call Token #${order.token} on TV`}
                style={{ width: 32, height: 32, padding: 0, color: 'var(--color-accent)' }}
              >
                <Bell size={14} />
              </button>
            )}
          </div>

          {/* Right status updater buttons */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Quick Settle */}
            <button
              className="btn btn-sm"
              onClick={() => setQuickSettleOrder(order)}
              title="Settle Payment with Cash, Card, or UPI"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '11px',
                fontWeight: 700,
                padding: '0 8px',
                height: 32,
                background: 'var(--color-green)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer'
              }}
            >
              <Zap size={12} fill="#fff" />
              <span>Settle</span>
            </button>

            {/* PENDING: Accept & Reject */}
            {order.status === 'pending' && (
              <>
                <button
                  className="btn btn-danger btn-sm"
                  id={`reject-order-${order.id}`}
                  disabled={processingId === order.id}
                  onClick={() => handleReject(order)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', height: 32 }}
                >
                  <X size={13} />
                  <span>Reject</span>
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  id={`accept-order-${order.id}`}
                  disabled={processingId === order.id}
                  onClick={() => handleAccept(order)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '12px', fontWeight: 700, height: 32 }}
                >
                  <ChefHat size={13} />
                  <span>Accept & Cook</span>
                </button>
              </>
            )}

            {/* PREPARING: Advance to Ready / Out for Delivery */}
            {order.status === 'preparing' && (
              <button
                className="btn btn-primary btn-sm"
                id={`ready-order-${order.id}`}
                disabled={processingId === order.id}
                onClick={() => handleMarkReady(order)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '12px',
                  fontWeight: 700,
                  height: 32,
                  background: 'var(--color-teal)',
                  borderColor: 'var(--color-teal)'
                }}
              >
                {order.orderType === 'delivery' || order.source ? <Truck size={13} /> : <Check size={13} />}
                <span>{order.orderType === 'delivery' || order.source ? 'Out for Delivery' : 'Mark Ready'}</span>
              </button>
            )}

            {/* READY: Advance to Delivered / Completed */}
            {order.status === 'ready' && (
              <button
                className="btn btn-success btn-sm"
                id={`complete-order-${order.id}`}
                disabled={processingId === order.id}
                onClick={() => handleMarkCompleted(order)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '12px',
                  fontWeight: 700,
                  height: 32,
                  background: 'var(--color-green)',
                  borderColor: 'var(--color-green)'
                }}
              >
                <CheckCircle2 size={13} />
                <span>{order.orderType === 'delivery' || order.source ? 'Delivered' : 'Completed'}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', height: '100%' }}>
      {/* Top Banner / Store Link Card */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.08) 100%)',
        border: '1px solid rgba(139,92,246,0.2)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-4) var(--space-5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--space-3)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-accent)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(59,130,246,0.3)'
          }}>
            <Globe size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 className="text-title3" style={{ margin: 0, fontWeight: 700 }}>
                {t('onlineOrders')} & Live Status Tracker
              </h2>
              <span className="badge badge-purple" style={{ fontSize: '11px', fontWeight: 600 }}>
                Syncs with Customer Tracker
              </span>
            </div>
            <p className="text-secondary text-caption1" style={{ margin: 0, marginTop: 2 }}>
              Accept incoming online orders, advance cooking & delivery statuses, and let customers track their food in real time.
            </p>
          </div>
        </div>

        {/* Share live order page */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const url = `${window.location.origin}/order/${restaurant?.id}`;
              navigator.clipboard.writeText(url).then(() => {
                toast.success('Online Store link copied! Customers can order & track here.', { icon: '📋' });
              });
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}
          >
            <Share2 size={13} />
            <span>Copy Store Link</span>
          </button>

          <a
            href={`/order/${restaurant?.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}
          >
            <ExternalLink size={13} />
            <span>Open Customer Page</span>
          </a>
        </div>
      </div>

      {/* Control Bar: Filters, Tabs, Search, View switch */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        background: 'var(--color-bg-elevated)',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-separator-opaque)'
      }}>
        {/* Row 1: Channel Tabs + View Mode */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          {/* Scope / Channel selector */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'online',   label: 'Online & Delivery', icon: Globe },
              { id: 'all',      label: 'All Channels',      icon: Filter },
              { id: 'dine-in',  label: 'Dine-In',           icon: User },
              { id: 'takeaway', label: 'Takeaway',          icon: ShoppingBag },
            ].map(tab => {
              const Icon = tab.icon;
              const active = channelFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`channel-filter-${tab.id}`}
                  className={`btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setChannelFilter(tab.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px' }}
                >
                  <Icon size={13} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Search + View mode */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-label-tertiary)' }} />
              <input
                type="text"
                placeholder="Search orders, phone..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input input-sm"
                style={{ paddingLeft: 30, width: '100%', fontSize: '12px' }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-label-tertiary)' }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div style={{ display: 'flex', border: '1px solid var(--color-separator-opaque)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              <button
                className={`btn btn-xs ${viewMode === 'list' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('list')}
                title="Detailed List Feed"
                style={{ borderRadius: 0, padding: '4px 8px' }}
              >
                <LayoutList size={14} />
              </button>
              <button
                className={`btn btn-xs ${viewMode === 'board' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setViewMode('board')}
                title="Kanban Board Workflow"
                style={{ borderRadius: 0, padding: '4px 8px' }}
              >
                <Columns size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Status Lifecycle Badges & Filter Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, borderTop: '1px solid var(--color-separator-opaque)', paddingTop: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className={`btn btn-xs ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter('all')}
              style={{ fontSize: '12px', padding: '3px 10px' }}
            >
              All Active ({counts.total})
            </button>

            <button
              className={`btn btn-xs ${statusFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter('pending')}
              style={{
                fontSize: '12px',
                padding: '3px 10px',
                borderColor: counts.pending > 0 ? 'var(--color-yellow)' : undefined
              }}
            >
              <span>⏳ Pending</span>
              {counts.pending > 0 && (
                <span className="badge badge-yellow" style={{ fontSize: '10px', padding: '1px 5px', marginLeft: 4 }}>
                  {counts.pending}
                </span>
              )}
            </button>

            <button
              className={`btn btn-xs ${statusFilter === 'preparing' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter('preparing')}
              style={{ fontSize: '12px', padding: '3px 10px' }}
            >
              <span>🍳 Cooking</span>
              {counts.preparing > 0 && (
                <span className="badge badge-blue" style={{ fontSize: '10px', padding: '1px 5px', marginLeft: 4 }}>
                  {counts.preparing}
                </span>
              )}
            </button>

            <button
              className={`btn btn-xs ${statusFilter === 'ready' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter('ready')}
              style={{ fontSize: '12px', padding: '3px 10px' }}
            >
              <span>🛵 Out / Ready</span>
              {counts.ready > 0 && (
                <span className="badge badge-teal" style={{ fontSize: '10px', padding: '1px 5px', marginLeft: 4 }}>
                  {counts.ready}
                </span>
              )}
            </button>
          </div>

          {/* Quick Rush Hour Batch Action Buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            {counts.preparing > 0 && (
              <button
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  const preparing = baseOrders.filter(o => o.status === 'preparing');
                  toast((tItem) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>Mark all {preparing.length} cooking orders as Ready?</span>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-xs" onClick={() => toast.dismiss(tItem.id)}>Cancel</button>
                        <button className="btn btn-primary btn-xs" onClick={async () => {
                          toast.dismiss(tItem.id);
                          await Promise.all(preparing.map(o => updateOrderStatus(restaurant.id, o.id, 'ready')));
                          toast.success(`Advanced ${preparing.length} orders to Ready!`, { icon: '⚡' });
                        }}>Confirm</button>
                      </div>
                    </div>
                  ));
                }}
                style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Zap size={11} />
                <span>Mark All Cooking Ready</span>
              </button>
            )}

            {counts.ready > 0 && (
              <button
                className="btn btn-secondary btn-xs"
                onClick={() => {
                  const ready = baseOrders.filter(o => o.status === 'ready');
                  toast((tItem) => (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: '13px' }}>Complete / Settle all {ready.length} ready orders?</span>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-secondary btn-xs" onClick={() => toast.dismiss(tItem.id)}>Cancel</button>
                        <button className="btn btn-success btn-xs" onClick={async () => {
                          toast.dismiss(tItem.id);
                          await Promise.all(ready.map(o => settleOrder(restaurant.id, o.id, 'cash', o.total)));
                          toast.success(`Completed ${ready.length} orders!`, { icon: '🎉' });
                        }}>Confirm</button>
                      </div>
                    </div>
                  ));
                }}
                style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <CheckCircle2 size={11} />
                <span>Batch Settle Ready</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area: List view vs Board view */}
      {filteredOrders.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 'var(--space-12) var(--space-4)',
          color: 'var(--color-label-tertiary)',
          background: 'var(--color-bg-elevated)',
          borderRadius: 'var(--radius-lg)',
          border: '1px dashed var(--color-separator-opaque)'
        }}>
          <div style={{ fontSize: 48 }}>📱</div>
          <h3 className="text-title3" style={{ marginTop: 'var(--space-3)', color: 'var(--color-label)' }}>
            No {statusFilter !== 'all' ? statusFilter : ''} orders found
          </h3>
          <p className="text-secondary text-subhead" style={{ maxWidth: 440, margin: '8px auto' }}>
            New online orders submitted through your customer ordering link or delivery integrations will appear here in real time.
          </p>
          <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'center', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                const url = `${window.location.origin}/order/${restaurant?.id}`;
                navigator.clipboard.writeText(url).then(() => {
                  toast.success('Online Store link copied!');
                });
              }}
            >
              Copy Customer Order Link
            </button>
            <a
              href={`/order/${restaurant?.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
            >
              Test Customer Experience
            </a>
          </div>
        </div>
      ) : viewMode === 'list' ? (
        /* Detailed List Feed */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 'var(--space-4)' }}>
          {filteredOrders.map(order => renderOrderCard(order))}
        </div>
      ) : (
        /* Kanban Board Workflow */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--space-4)',
          alignItems: 'start',
          minHeight: '600px'
        }}>
          {/* Column 1: Pending */}
          <div style={{
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '13px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-yellow)' }} />
                <span>Pending Acceptance</span>
              </div>
              <span className="badge badge-yellow" style={{ fontSize: '11px', fontWeight: 700 }}>
                {filteredOrders.filter(o => o.status === 'pending').length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {filteredOrders.filter(o => o.status === 'pending').map(order => renderOrderCard(order))}
            </div>
          </div>

          {/* Column 2: Cooking */}
          <div style={{
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '13px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent)' }} />
                <span>Cooking in Kitchen</span>
              </div>
              <span className="badge badge-blue" style={{ fontSize: '11px', fontWeight: 700 }}>
                {filteredOrders.filter(o => o.status === 'preparing').length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {filteredOrders.filter(o => o.status === 'preparing').map(order => renderOrderCard(order))}
            </div>
          </div>

          {/* Column 3: Ready / Out */}
          <div style={{
            background: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-3)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: '13px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-teal)' }} />
                <span>Ready / Out for Delivery</span>
              </div>
              <span className="badge badge-teal" style={{ fontSize: '11px', fontWeight: 700 }}>
                {filteredOrders.filter(o => o.status === 'ready').length}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {filteredOrders.filter(o => o.status === 'ready').map(order => renderOrderCard(order))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Order Details ────────────────────────────────────── */}
      {selectedOrderDetails && (
        <div className="modal-backdrop" onClick={() => setSelectedOrderDetails(null)}>
          <div className="modal-box" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="text-title3">Order Details</h3>
                <span style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                  #{selectedOrderDetails.id}
                </span>
              </div>
              <button className="btn btn-secondary btn-icon btn-sm" onClick={() => setSelectedOrderDetails(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {/* Customer info */}
              <div style={{ background: 'var(--color-bg-secondary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>
                  {selectedOrderDetails.customerName || 'Anonymous Customer'}
                </div>
                {selectedOrderDetails.customerPhone && (
                  <div style={{ fontSize: '13px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                    📞 {selectedOrderDetails.customerPhone}
                  </div>
                )}
                {selectedOrderDetails.deliveryAddress && (
                  <div style={{ fontSize: '13px', color: 'var(--color-label-secondary)', marginTop: 4 }}>
                    📍 {selectedOrderDetails.deliveryAddress}
                  </div>
                )}
              </div>

              {/* Items Table */}
              <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-separator-opaque)', textAlign: 'left', color: 'var(--color-label-secondary)' }}>
                    <th style={{ padding: '6px 0' }}>Item</th>
                    <th style={{ padding: '6px 0', textAlign: 'center' }}>Qty</th>
                    <th style={{ padding: '6px 0', textAlign: 'right' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedOrderDetails.items ?? []).map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-separator-opaque)' }}>
                      <td style={{ padding: '8px 0' }}>
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                          <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                            + {item.selectedModifiers.map(m => m.name).join(', ')}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 0', textAlign: 'center' }}>×{item.qty}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>
                        {formatCurrency(item.price * item.qty, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Financial Breakdown */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '13px', borderTop: '1px solid var(--color-separator-opaque)', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-label-secondary)' }}>
                  <span>Subtotal</span>
                  <span>{formatCurrency(selectedOrderDetails.subtotal ?? selectedOrderDetails.total, currency)}</span>
                </div>
                {selectedOrderDetails.discountAmount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-green)' }}>
                    <span>Discount</span>
                    <span>-{formatCurrency(selectedOrderDetails.discountAmount, currency)}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '15px', marginTop: 4 }}>
                  <span>Total Amount</span>
                  <span>{formatCurrency(selectedOrderDetails.total ?? 0, currency)}</span>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handlePrint(selectedOrderDetails)}
              >
                <Printer size={14} /> Print Receipt
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setSelectedOrderDetails(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Live Customer Tracking Preview ───────────────────── */}
      {trackingPreviewOrder && (
        <div className="modal-backdrop" onClick={() => setTrackingPreviewOrder(null)}>
          <div className="modal-box" style={{ maxWidth: 440, padding: 'var(--space-5)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Smartphone size={18} color="var(--color-accent)" />
                <h3 className="text-title3" style={{ margin: 0 }}>Customer Phone View</h3>
              </div>
              <button className="btn btn-secondary btn-icon btn-xs" onClick={() => setTrackingPreviewOrder(null)}>
                <X size={14} />
              </button>
            </div>

            <div style={{
              background: 'var(--color-bg)',
              border: '2px solid var(--color-separator-opaque)',
              borderRadius: '24px',
              padding: '16px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.1)'
            }}>
              {/* Simulated Customer Tracker Header */}
              <div style={{ textAlign: 'center', borderBottom: '1px solid var(--color-separator-opaque)', paddingBottom: 12, marginBottom: 16 }}>
                <span className="badge badge-purple" style={{ fontSize: '10px', textTransform: 'uppercase' }}>
                  Live Status Simulator
                </span>
                <h4 style={{ margin: '6px 0 2px 0', fontSize: '16px' }}>{restaurant?.name || 'Restaurant'}</h4>
                <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                  Order #{trackingPreviewOrder.id.slice(-6).toUpperCase()}
                </div>
              </div>

              {/* Stepper Progress */}
              {(() => {
                const isDelivery = trackingPreviewOrder.orderType === 'delivery' || trackingPreviewOrder.source;
                const steps = [
                  { num: 1, key: 'pending',   title: 'Order Placed',        desc: 'Restaurant received your order' },
                  { num: 2, key: 'preparing', title: 'Preparing Food',      desc: 'Chefs are cooking in kitchen' },
                  { num: 3, key: 'ready',     title: isDelivery ? 'Out for Delivery' : 'Ready for Pickup', desc: isDelivery ? 'Delivery partner is on the way' : 'Ready to collect at counter' },
                  { num: 4, key: 'completed', title: 'Delivered',           desc: 'Enjoy your delicious meal!' },
                ];

                const currentStepIndex = 
                  trackingPreviewOrder.status === 'pending' ? 1 :
                  trackingPreviewOrder.status === 'preparing' ? 2 :
                  trackingPreviewOrder.status === 'ready' ? 3 : 4;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {steps.map(step => {
                      const isDone = step.num < currentStepIndex;
                      const isCurrent = step.num === currentStepIndex;

                      return (
                        <div key={step.num} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: isDone ? 'var(--color-green)' : isCurrent ? 'var(--color-accent)' : 'var(--color-fill-secondary)',
                            color: isDone || isCurrent ? '#fff' : 'var(--color-label-tertiary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: 700,
                            flexShrink: 0
                          }}>
                            {isDone ? <Check size={14} /> : step.num}
                          </div>
                          <div>
                            <div style={{
                              fontWeight: isCurrent ? 700 : 600,
                              fontSize: '13px',
                              color: isCurrent ? 'var(--color-accent)' : 'var(--color-label)'
                            }}>
                              {step.title}
                              {isCurrent && <span style={{ marginLeft: 6, fontSize: '10px', color: 'var(--color-green)' }}>● Current State</span>}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)', marginTop: 2 }}>
                              {step.desc}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              <div style={{ marginTop: 20, paddingTop: 12, borderTop: '1px solid var(--color-separator-opaque)', textAlign: 'center' }}>
                <p style={{ fontSize: '11px', color: 'var(--color-label-secondary)', margin: 0 }}>
                  Advancing the order status in this screen will update the customer's phone view in real time!
                </p>
              </div>
            </div>

            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={(e) => handleCopyTrackingLink(trackingPreviewOrder, e)}
              >
                <Copy size={13} /> Copy Direct URL
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setTrackingPreviewOrder(null)}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Quick Settle ─────────────────────────────────────── */}
      {quickSettleOrder && (
        <div className="modal-backdrop" onClick={() => !settling && setQuickSettleOrder(null)}>
          <div className="modal-box" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 className="text-title3">Quick Settle Payment</h3>
                <span style={{ fontSize: '12px', color: 'var(--color-label-secondary)' }}>
                  Total to collect: <strong>{formatCurrency(quickSettleOrder.total, currency)}</strong>
                </span>
              </div>
              <button className="btn btn-secondary btn-icon btn-sm" onClick={() => setQuickSettleOrder(null)} disabled={settling}>
                <X size={16} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: '13px', color: 'var(--color-label-secondary)', margin: 0 }}>
                Select payment method to close this order and mark it as settled:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { id: 'cash', label: 'Cash', icon: '💵' },
                  { id: 'upi',  label: 'UPI / QR', icon: '📱' },
                  { id: 'card', label: 'Card', icon: '💳' },
                ].map(m => (
                  <button
                    key={m.id}
                    className="btn btn-secondary"
                    disabled={settling}
                    onClick={() => handleQuickSettle(quickSettleOrder, m.id)}
                    style={{
                      height: 64,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 4
                    }}
                  >
                    <span style={{ fontSize: 20 }}>{m.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setQuickSettleOrder(null)} disabled={settling}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
