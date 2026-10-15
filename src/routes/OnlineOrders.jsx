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
  User, Eye, Zap, Search, Copy, ExternalLink, Smartphone,
  ShoppingBag, LayoutList, Columns, MessageCircle, CheckCircle2,
  MapPin, Filter, QrCode
} from 'lucide-react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';

const PLATFORM_BADGES = {
  talabat:   { label: 'Talabat',   color: '#ff5a00', bg: 'rgba(255,90,0,0.1)',    emoji: '🟧', border: 'rgba(255,90,0,0.25)' },
  snoonu:    { label: 'Snoonu',    color: '#e30613', bg: 'rgba(227,6,19,0.1)',    emoji: '🔴', border: 'rgba(227,6,19,0.25)' },
  rafeeq:    { label: 'Rafeeq',    color: '#5c1d8c', bg: 'rgba(92,29,140,0.1)',   emoji: '🟣', border: 'rgba(92,29,140,0.25)' },
  jahez:     { label: 'Jahez',     color: '#ffb300', bg: 'rgba(255,179,0,0.1)',   emoji: '🟨', border: 'rgba(255,179,0,0.25)' },
  deliveroo: { label: 'Deliveroo', color: '#00cdbc', bg: 'rgba(0,205,188,0.1)',  emoji: '🦘', border: 'rgba(0,205,188,0.25)' },
  ubereats:  { label: 'Uber Eats', color: '#06c167', bg: 'rgba(6,193,103,0.1)',  emoji: '🚗', border: 'rgba(6,193,103,0.25)' },
  zomato:    { label: 'Zomato',    color: '#e23744', bg: 'rgba(226,55,68,0.1)',  emoji: '🍕', border: 'rgba(226,55,68,0.25)' },
  swiggy:    { label: 'Swiggy',    color: '#fc8019', bg: 'rgba(252,128,25,0.1)', emoji: '🟠', border: 'rgba(252,128,25,0.25)' },
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
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const currency = restaurant?.currency ?? 'INR';
  const storeUrl = restaurant?.id ? `${window.location.origin}/order/${restaurant.id}` : '';

  useEffect(() => {
    if (showQrModal && storeUrl) {
      QRCode.toDataURL(storeUrl, {
        width: 300,
        margin: 2,
        color: { dark: '#0c0d11', light: '#ffffff' }
      }).then(setQrCodeDataUrl).catch(console.error);
    }
  }, [showQrModal, storeUrl]);

  const handleCopyStoreLink = (e) => {
    if (e) e.stopPropagation();
    if (!storeUrl) return;
    navigator.clipboard.writeText(storeUrl).then(() => {
      setCopiedLink(true);
      toast.success('Online Store link copied! Customers can order & track live.', { icon: '📋' });
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch(() => {
      toast.error('Failed to copy link');
    });
  };

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
      if (order.type === 'dine-in') {
        await updateOrderStatus(restaurant.id, order.id, 'served');
      } else {
        if (!order.paid) {
          await settleOrder(restaurant.id, order.id, order.paymentMethod || 'cash', order.total);
        } else {
          await updateOrderStatus(restaurant.id, order.id, 'billed');
        }
      }
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
          background: 'var(--color-bg-elevated)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-separator-opaque)',
          borderLeft: isLate ? '4px solid var(--color-red)' : `4px solid ${trackerInfo.color}`,
          boxShadow: 'var(--shadow-xs)',
          transition: 'all 0.2s ease',
          overflow: 'hidden'
        }}
      >
        {/* Card Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 10,
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

              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-label)' }}>
                {order.customerName || 'Anonymous Customer'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, fontSize: '11px', color: 'var(--color-label-secondary)' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
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

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--color-label)', letterSpacing: '-0.01em' }}>
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
          padding: '8px 16px',
          background: 'var(--color-bg)',
          borderBottom: '1px solid var(--color-separator-opaque)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px' }}>
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }} title={`Step ${trackerInfo.step} of 4`}>
              {[1, 2, 3, 4].map(stepNum => (
                <div
                  key={stepNum}
                  style={{
                    width: 12,
                    height: 4,
                    borderRadius: 2,
                    background: stepNum <= trackerInfo.step ? trackerInfo.color : 'var(--color-separator-opaque)',
                    transition: 'background 0.2s ease'
                  }}
                />
              ))}
            </div>
            <span style={{ fontWeight: 600, color: 'var(--color-label-secondary)', fontSize: '11.5px' }}>Tracker:</span>
            <span className={`badge ${trackerInfo.badgeClass}`} style={{ fontSize: '10.5px', fontWeight: 700, padding: '1px 7px' }}>
              {trackerInfo.label}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary btn-xs"
              onClick={(e) => handleCopyTrackingLink(order, e)}
              title="Copy customer tracking link to share via SMS or message"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', minHeight: 26, padding: '0 8px', borderRadius: 'var(--radius-sm)' }}
            >
              <Copy size={11} />
              <span>Link</span>
            </button>

            {order.customerPhone && (
              <button
                className="btn btn-secondary btn-xs"
                onClick={(e) => handleWhatsAppCustomer(order, e)}
                title="Send tracking link to customer on WhatsApp"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '11px',
                  minHeight: 26,
                  padding: '0 8px',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--color-green)',
                  borderColor: 'rgba(16,185,129,0.35)'
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '11px', minHeight: 26, padding: '0 8px', borderRadius: 'var(--radius-sm)' }}
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
              gap: 8,
              fontSize: '12px',
              color: 'var(--color-label-secondary)',
              background: 'var(--color-bg)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-separator-opaque)'
            }}>
              <MapPin size={15} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-accent)' }} />
              <span style={{ lineHeight: 1.4 }}>{order.deliveryAddress}</span>
            </div>
          )}

          {/* Item Checklist - Touch friendly */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
            {(order.items ?? []).map((item, idx) => {
              const isCrossed = !!crossedItems[`${order.id}-${idx}`];
              return (
                <label
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: isCrossed ? 'var(--color-label-tertiary)' : 'var(--color-label)',
                    textDecoration: isCrossed ? 'line-through' : 'none',
                    padding: '8px 10px',
                    minHeight: 38,
                    borderRadius: 'var(--radius-sm)',
                    background: isCrossed ? 'transparent' : 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-separator-opaque)',
                    transition: 'background 0.15s ease'
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    toggleCrossItem(order.id, idx);
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      type="checkbox"
                      checked={isCrossed}
                      onChange={() => {}}
                      style={{ width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--color-accent)' }}
                    />
                    <div>
                      <span style={{ fontWeight: 'var(--weight-bold)', marginRight: 6 }}>×{item.qty}</span>
                      <span>{item.name}</span>
                      {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--color-label-secondary)', textDecoration: 'none', paddingLeft: 4, marginTop: 2 }}>
                          + {item.selectedModifiers.map(m => m.name).join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label-secondary)', flexShrink: 0 }}>
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
              style={{ width: 36, height: 36, padding: 0 }}
            >
              <Eye size={15} />
            </button>

            <button
              className="btn btn-secondary btn-icon btn-sm"
              onClick={(e) => handlePrint(order, e)}
              title="Print Customer Receipt"
              style={{ width: 36, height: 36, padding: 0 }}
            >
              <Printer size={15} />
            </button>

            <button
              className="btn btn-secondary btn-icon btn-sm"
              onClick={(e) => handlePrintKitchenTicket(order, e)}
              title="Print Kitchen Ticket (KOT)"
              style={{ width: 36, height: 36, padding: 0 }}
            >
              <ChefHat size={15} />
            </button>

            {order.token && (
              <button
                className="btn btn-secondary btn-icon btn-sm"
                onClick={(e) => handleCallToken(order.token, e)}
                title={`Call Token #${order.token} on TV`}
                style={{ width: 36, height: 36, padding: 0, color: 'var(--color-accent)' }}
              >
                <Bell size={15} />
              </button>
            )}
          </div>

          {/* Right status updater buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Quick Settle */}
            <button
              className="btn btn-sm"
              onClick={() => setQuickSettleOrder(order)}
              title="Settle Payment with Cash, Card, or UPI"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: '12px',
                fontWeight: 700,
                padding: '0 12px',
                minHeight: 38,
                background: 'var(--color-green)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer'
              }}
            >
              <Zap size={13} fill="#fff" />
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
                  style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '12px', minHeight: 38, padding: '0 12px' }}
                >
                  <X size={14} />
                  <span>Reject</span>
                </button>
                <button
                  className="btn btn-primary btn-sm"
                  id={`accept-order-${order.id}`}
                  disabled={processingId === order.id}
                  onClick={() => handleAccept(order)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '13px', fontWeight: 700, minHeight: 38, padding: '0 14px' }}
                >
                  <ChefHat size={14} />
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
                  gap: 6,
                  fontSize: '13px',
                  fontWeight: 700,
                  minHeight: 38,
                  padding: '0 14px',
                  background: 'var(--color-teal)',
                  borderColor: 'var(--color-teal)'
                }}
              >
                {order.orderType === 'delivery' || order.source ? <Truck size={14} /> : <Check size={14} />}
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
                  gap: 6,
                  fontSize: '13px',
                  fontWeight: 700,
                  minHeight: 38,
                  padding: '0 14px',
                  background: 'var(--color-green)',
                  borderColor: 'var(--color-green)'
                }}
              >
                <CheckCircle2 size={14} />
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
      {/* ── Top Header / Online Ordering Hub ── */}
      <div className="online-orders-hero-header" style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-separator-opaque)',
        borderRadius: 'var(--radius-xl)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: 'var(--shadow-xs)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.18), rgba(59,130,246,0.18))',
            border: '1px solid rgba(16,185,129,0.3)',
            color: 'var(--color-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Globe size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 className="text-title3" style={{ margin: 0, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--color-label)' }}>
                {t('onlineOrders')} & Live Tracker
              </h2>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 600,
                background: 'rgba(16, 185, 129, 0.12)',
                color: 'var(--color-green)',
                border: '1px solid rgba(16, 185, 129, 0.25)'
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-green)', boxShadow: '0 0 6px var(--color-green)' }} />
                Live Sync
              </span>
            </div>
            <p className="text-caption1 text-secondary" style={{ margin: 0, marginTop: 2 }}>
              Accept incoming orders & manage live tracking.
            </p>
          </div>
        </div>

        {/* Share & Customer Store Action Group */}
        <div className="online-orders-action-group" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowQrModal(true)}
            title="Show Store QR Code to scan or download"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', minHeight: 36, borderRadius: 'var(--radius-md)' }}
          >
            <QrCode size={14} />
            <span>Store QR</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopyStoreLink}
            title="Copy digital store link"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', minHeight: 36, borderRadius: 'var(--radius-md)' }}
          >
            {copiedLink ? <Check size={14} color="var(--color-green)" /> : <Copy size={14} />}
            <span>{copiedLink ? 'Copied' : 'Copy Link'}</span>
          </button>

          <a
            href={storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-sm"
            title="Open customer ordering experience in a new tab"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', minHeight: 36, borderRadius: 'var(--radius-md)', textDecoration: 'none' }}
          >
            <ExternalLink size={14} />
            <span>Customer Page</span>
          </a>
        </div>
      </div>

      {/* ── Filter & Search Control Center ── */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        background: 'var(--color-bg-elevated)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--color-separator-opaque)',
        boxShadow: 'var(--shadow-xs)'
      }}>
        {/* Tier 1: Channels Pills + Search + View Switcher */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          {/* Channel selector as sleek pill tabs */}
          <div className="no-scrollbar touch-scroll-x" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'var(--color-bg)',
            padding: '3px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-separator-opaque)',
            maxWidth: '100%'
          }}>
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
                  onClick={() => setChannelFilter(tab.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '12px',
                    fontWeight: active ? 600 : 500,
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    background: active ? 'var(--color-bg-elevated)' : 'transparent',
                    color: active ? 'var(--color-label)' : 'var(--color-label-secondary)',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Icon size={13} style={{ color: active ? 'var(--color-accent)' : 'inherit' }} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right side: Search Input + View Toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flex: '1 1 auto',
            justifyContent: 'flex-end',
            minWidth: 200
          }}>
            {/* Search Input */}
            <div style={{ position: 'relative', width: '100%', maxWidth: 280, minWidth: 150 }}>
              <Search
                size={14}
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--color-label-tertiary)',
                  pointerEvents: 'none'
                }}
              />
              <input
                type="text"
                placeholder="Search orders, phone, ID..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: 32,
                  paddingRight: search ? 30 : 12,
                  height: 36,
                  fontSize: '12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-separator-opaque)',
                  color: 'var(--color-label)',
                  outline: 'none',
                  transition: 'border-color 0.15s ease'
                }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-label-tertiary)',
                    padding: 4,
                    display: 'flex'
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* View Mode Toggle: List vs Kanban Board */}
            <div style={{
              display: 'inline-flex',
              background: 'var(--color-bg)',
              padding: '3px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-separator-opaque)'
            }}>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="Detailed List Feed"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 30,
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'list' ? 'var(--color-bg-elevated)' : 'transparent',
                  color: viewMode === 'list' ? 'var(--color-label)' : 'var(--color-label-tertiary)',
                  boxShadow: viewMode === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <LayoutList size={15} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                title="Kanban Board View"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 30,
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  background: viewMode === 'board' ? 'var(--color-bg-elevated)' : 'transparent',
                  color: viewMode === 'board' ? 'var(--color-label)' : 'var(--color-label-tertiary)',
                  boxShadow: viewMode === 'board' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <Columns size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Tier 2: Order Lifecycle Status Tabs + Rush Actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          borderTop: '1px solid var(--color-separator-opaque)',
          paddingTop: '10px'
        }}>
          {/* Status Tabs with clean pill styling and non-wrapping horizontal scroll */}
          <div className="no-scrollbar touch-scroll-x" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            maxWidth: '100%',
            paddingBottom: '2px'
          }}>
            {[
              { id: 'all',       label: 'All Active', count: counts.total, icon: null },
              { id: 'pending',   label: 'Pending',    count: counts.pending, emoji: '⏳', isPending: true },
              { id: 'preparing', label: 'Cooking',    count: counts.preparing, emoji: '🍳' },
              { id: 'ready',     label: 'Out / Ready', count: counts.ready, emoji: '🛵' },
            ].map(tab => {
              const active = statusFilter === tab.id;
              const hasAlert = tab.isPending && tab.count > 0;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '12px',
                    fontWeight: active ? 600 : 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    background: active
                      ? (hasAlert ? 'rgba(245, 158, 11, 0.16)' : 'var(--color-fill-secondary)')
                      : 'var(--color-bg)',
                    color: active ? 'var(--color-label)' : 'var(--color-label-secondary)',
                    border: active
                      ? (hasAlert ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid var(--color-separator-opaque)')
                      : '1px solid transparent'
                  }}
                >
                  {tab.emoji && <span>{tab.emoji}</span>}
                  <span>{tab.label}</span>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 18,
                    height: 18,
                    padding: '0 5px',
                    borderRadius: '9999px',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    background: hasAlert
                      ? 'var(--color-yellow)'
                      : (active ? 'var(--color-label)' : 'var(--color-fill)'),
                    color: hasAlert
                      ? '#000000'
                      : (active ? 'var(--color-bg)' : 'var(--color-label-secondary)')
                  }}>
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Rush Hour Batch Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {counts.preparing > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
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
                style={{ fontSize: '12px', minHeight: 32, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 'var(--radius-md)' }}
              >
                <Zap size={13} color="var(--color-accent)" />
                <span>Mark All Ready ({counts.preparing})</span>
              </button>
            )}

            {counts.ready > 0 && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
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
                style={{ fontSize: '12px', minHeight: 32, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 'var(--radius-md)' }}
              >
                <CheckCircle2 size={13} color="var(--color-green)" />
                <span>Batch Settle ({counts.ready})</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Area: List view vs Board view */}
      {filteredOrders.length === 0 ? (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '48px 20px',
          background: 'var(--color-bg-elevated)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-separator-opaque)',
          boxShadow: 'var(--shadow-xs)',
          minHeight: 320
        }}>
          {/* Ambient icon badge */}
          <div style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(59,130,246,0.12))',
            border: '1px solid rgba(16,185,129,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--color-accent)',
            marginBottom: '16px',
            boxShadow: '0 6px 20px rgba(16,185,129,0.12)'
          }}>
            {search ? <Search size={24} /> : <ShoppingBag size={24} />}
          </div>

          <h3 className="text-title3" style={{ margin: 0, fontWeight: 700, color: 'var(--color-label)' }}>
            {search
              ? `No orders matching "${search}"`
              : statusFilter === 'pending'
                ? 'No Pending Orders'
                : statusFilter === 'preparing'
                  ? 'Kitchen Is All Caught Up'
                  : statusFilter === 'ready'
                    ? 'No Orders Waiting for Pickup'
                    : 'No Active Orders'}
          </h3>

          <p className="text-secondary text-subhead" style={{ maxWidth: 440, margin: '8px auto 20px auto', lineHeight: 1.5 }}>
            {search
              ? 'Try searching by a different customer name, order ID, or phone number.'
              : 'Incoming orders from your customer ordering link, table QR codes, and delivery platforms will appear here in real time.'}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {search ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSearch('')}
                style={{ padding: '0 16px', minHeight: 36, borderRadius: 'var(--radius-md)' }}
              >
                Clear Search
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleCopyStoreLink}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', minHeight: 36, borderRadius: 'var(--radius-md)' }}
                >
                  <Copy size={14} />
                  <span>Copy Store Link</span>
                </button>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowQrModal(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', minHeight: 36, borderRadius: 'var(--radius-md)' }}
                >
                  <QrCode size={14} />
                  <span>Store QR Code</span>
                </button>

                <a
                  href={storeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 16px', minHeight: 36, borderRadius: 'var(--radius-md)', textDecoration: 'none' }}
                >
                  <ExternalLink size={14} />
                  <span>Open Store Page</span>
                </a>
              </>
            )}
          </div>
        </div>
      ) : viewMode === 'list' ? (
        /* Detailed List Feed */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))', gap: 'var(--space-4)' }}>
          {filteredOrders.map(order => renderOrderCard(order))}
        </div>
      ) : (
        /* Kanban Board Workflow */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--space-4)',
          alignItems: 'start',
          minHeight: '600px',
          overflowX: 'auto',
          paddingBottom: 'var(--space-3)',
          WebkitOverflowScrolling: 'touch'
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

      {/* ── MODAL: Store Ordering QR Code ── */}
      {showQrModal && (
        <div className="modal-backdrop" onClick={() => setShowQrModal(false)}>
          <div className="modal-box" style={{ maxWidth: 380, textAlign: 'center', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <QrCode size={18} color="var(--color-accent)" />
                <h3 className="text-title3" style={{ margin: 0 }}>Online Store QR</h3>
              </div>
              <button className="btn btn-secondary btn-icon btn-xs" onClick={() => setShowQrModal(false)}>
                <X size={14} />
              </button>
            </div>

            <div style={{
              background: '#ffffff',
              padding: '16px',
              borderRadius: 'var(--radius-lg)',
              display: 'inline-block',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              margin: '0 auto 16px auto'
            }}>
              {qrCodeDataUrl ? (
                <img src={qrCodeDataUrl} alt="Store QR Code" style={{ width: 220, height: 220, display: 'block' }} />
              ) : (
                <div style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                  Generating QR...
                </div>
              )}
            </div>

            <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 700, color: 'var(--color-label)' }}>
              {restaurant?.name || 'Your Restaurant'}
            </h4>
            <p className="text-caption1 text-secondary" style={{ margin: '0 0 16px 0', lineHeight: 1.4 }}>
              Customers scan this code with their smartphone camera to browse your digital menu, order food, and track kitchen status live.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopyStoreLink}
                style={{ flex: 1, minHeight: 36 }}
              >
                <Copy size={13} /> Copy Link
              </button>
              {qrCodeDataUrl && (
                <a
                  href={qrCodeDataUrl}
                  download={`${(restaurant?.name || 'store').replace(/\s+/g, '_')}_qr.png`}
                  className="btn btn-primary btn-sm"
                  style={{ flex: 1, minHeight: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}
                >
                  Download QR
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
