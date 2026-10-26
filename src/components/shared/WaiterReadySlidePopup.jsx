import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useOrderStore } from '../../stores/orderStore';
import { playNotificationTone, vibrateDevice } from '../../utils/soundNotifications';
import { Check, Utensils, X, ShoppingBag, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Ultra-clean Ambient Food-Ready Pass Banner (Dynamic Island / Capsule Style)
 * 
 * Clean, organized, zero-clutter horizontal pill:
 * [ Icon ] [ Table G9  READY  < 1/2 > ]    [ v ] [ ✓ Mark Served ] [ ✕ ]
 *          [ 3 items · Mojito, Fries... ]
 */
export default function WaiterReadySlidePopup() {
  const location = useLocation();
  const isWaiterTab = location.pathname === '/tables';
  const isEditMode = location.search.includes('edit=true');
  const { restaurant, staffDoc } = useAuthStore();
  const activeOrders = useOrderStore(s => s.activeOrders);
  const updateOrderStatus = useOrderStore(s => s.updateOrderStatus);

  const userRole = staffDoc?.role ?? 'admin';
  const staffId = staffDoc?.id ?? null;

  const notificationConfig = restaurant?.notifications;
  const isWaiterPopupEnabled = notificationConfig?.waiterSlidePopupEnabled !== false;
  const isVibrateEnabled = notificationConfig?.vibrateOnReady !== false;
  const chimeTone = notificationConfig?.readySoundTone || 'kitchen-bell';
  const audienceMode = notificationConfig?.slidePopupAudienceMode || 'smart_hybrid';

  const isFloorStaff = ['waiter', 'server', 'runner', 'captain'].includes(userRole);
  const isManagerOrAdmin = ['admin', 'manager', 'owner', 'super_admin'].includes(userRole);

  const [acknowledgedOrderIds, setAcknowledgedOrderIds] = useState(() => new Set());
  const [currentOrder, setCurrentOrder] = useState(null);
  const [isServing, setIsServing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const currentOrderIdRef = useRef(null);
  const notifiedOrderIdsRef = useRef(new Set());

  // Filter ready orders according to role and audience mode
  const readyOrdersList = useMemo(() => {
    if (!isWaiterTab || isEditMode || !isWaiterPopupEnabled || userRole === 'kitchen') return [];

    return activeOrders.filter(o => {
      if (o.status !== 'ready') return false;
      if (acknowledgedOrderIds.has(o.id)) return false;

      const isTakeaway = o.type === 'takeaway' || o.type === 'delivery' || o.type === 'pickup';

      if (audienceMode === 'waiter_only') {
        if (!isFloorStaff) return false;
        if (o.assignedWaiterId && o.assignedWaiterId === staffId) return true;
        if (o.staffId && o.staffId === staffId) return true;
        if (!o.assignedWaiterId) return true;
        return false;
      }

      if (audienceMode === 'all_staff') {
        return true;
      }

      // Smart Hybrid
      if (isFloorStaff) {
        if (o.assignedWaiterId && o.assignedWaiterId === staffId) return true;
        if (o.staffId && o.staffId === staffId) return true;
        if (!o.assignedWaiterId && !isTakeaway) return true;
        return false;
      }

      if (userRole === 'cashier') {
        if (isTakeaway) return true;
        if (o.staffId && o.staffId === staffId) return true;
        return false;
      }

      if (isManagerOrAdmin) {
        if (o.assignedWaiterId && o.assignedWaiterId === staffId) return true;
        if (o.staffId && o.staffId === staffId) return true;
        if (!o.assignedWaiterId) return true;
        return false;
      }

      return false;
    });
  }, [isWaiterTab, isEditMode, activeOrders, acknowledgedOrderIds, isWaiterPopupEnabled, userRole, isFloorStaff, isManagerOrAdmin, staffId, audienceMode]);

  // Handle incoming ready orders (sound, vibrate, push)
  useEffect(() => {
    const newlyReady = readyOrdersList.filter(o => !notifiedOrderIdsRef.current.has(o.id));
    if (newlyReady.length > 0) {
      newlyReady.forEach(o => notifiedOrderIdsRef.current.add(o.id));

      playNotificationTone(chimeTone, 0.7);

      if (isVibrateEnabled) {
        vibrateDevice([180, 90, 180]);
      }

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        newlyReady.forEach(orderItem => {
          try {
            const tableLabel = orderItem.tableName ? `Table ${orderItem.tableName}` : (orderItem.token ? `Token #${orderItem.token}` : 'Takeaway');
            const itemList = (orderItem.items || []).map(i => `${i.qty}× ${i.name}`).slice(0, 3).join(', ');
            new Notification(`🔔 Order Ready: ${tableLabel}!`, {
              body: itemList ? `${itemList} ready at pass` : 'Food plated and ready for pickup!',
              icon: '/favicon.ico',
              tag: `order-ready-${orderItem.id}`,
            });
          } catch (e) {
            console.debug('Browser notification failed:', e);
          }
        });
      }
    }

    if (readyOrdersList.length > 0) {
      if (!currentOrderIdRef.current || !readyOrdersList.some(o => o.id === currentOrderIdRef.current)) {
        const nextOrder = readyOrdersList[0];
        currentOrderIdRef.current = nextOrder.id;
        setCurrentOrder(nextOrder);
        setIsServing(false);
      }
    } else if (currentOrderIdRef.current) {
      currentOrderIdRef.current = null;
      setCurrentOrder(null);
    }
  }, [readyOrdersList, chimeTone, isVibrateEnabled]);

  // Tab Title Flashing
  useEffect(() => {
    if (!currentOrder) return;
    const originalTitle = document.title;
    const targetLabel = currentOrder.tableName ? `Table ${currentOrder.tableName}` : (currentOrder.token ? `#${currentOrder.token}` : 'Ready');
    let isAlert = false;
    const interval = setInterval(() => {
      document.title = isAlert ? `🔔 [READY: ${targetLabel}]` : originalTitle;
      isAlert = !isAlert;
    }, 1200);

    return () => {
      clearInterval(interval);
      document.title = originalTitle;
    };
  }, [currentOrder]);

  const handleSwitchNextOrder = useCallback((e) => {
    e?.stopPropagation();
    if (readyOrdersList.length <= 1) return;
    const currentIndex = readyOrdersList.findIndex(o => o.id === currentOrderIdRef.current);
    const nextIndex = (currentIndex + 1) % readyOrdersList.length;
    const next = readyOrdersList[nextIndex];
    currentOrderIdRef.current = next.id;
    setCurrentOrder(next);
    setIsServing(false);
  }, [readyOrdersList]);

  const handleSwitchPrevOrder = useCallback((e) => {
    e?.stopPropagation();
    if (readyOrdersList.length <= 1) return;
    const currentIndex = readyOrdersList.findIndex(o => o.id === currentOrderIdRef.current);
    const prevIndex = (currentIndex - 1 + readyOrdersList.length) % readyOrdersList.length;
    const prev = readyOrdersList[prevIndex];
    currentOrderIdRef.current = prev.id;
    setCurrentOrder(prev);
    setIsServing(false);
  }, [readyOrdersList]);

  const handleDismiss = useCallback((orderId) => {
    currentOrderIdRef.current = null;
    setAcknowledgedOrderIds(prev => new Set([...prev, orderId]));
    setCurrentOrder(null);
    setIsServing(false);
    setIsExpanded(false);
  }, []);

  const handleMarkServed = useCallback(async (order) => {
    if (!restaurant?.id || !order?.id || isServing) return;
    setIsServing(true);
    if (isVibrateEnabled) vibrateDevice([150]);

    const isTakeaway = order.type === 'takeaway' || order.type === 'delivery' || order.type === 'pickup';

    try {
      await updateOrderStatus(restaurant.id, order.id, 'served');
      toast.success(
        isTakeaway 
          ? `${order.token ? `Token #${order.token}` : 'Takeaway order'} handed over!` 
          : `${order.tableName ? `Table ${order.tableName}` : 'Order'} served! ✓`,
        { icon: isTakeaway ? '🛍️' : '🍽️', duration: 2500 }
      );
      handleDismiss(order.id);
    } catch (err) {
      console.error('Failed to mark served:', err);
      toast.error('Failed to update status');
      setIsServing(false);
    }
  }, [restaurant?.id, updateOrderStatus, isVibrateEnabled, handleDismiss, isServing]);

  const handleSelectTableOnMap = useCallback((order) => {
    if (!order?.tableId) return;
    window.dispatchEvent(new CustomEvent('kiwi:select-table', {
      detail: { tableId: order.tableId, tableName: order.tableName }
    }));
  }, []);

  if (!isWaiterTab || isEditMode || !currentOrder) return null;

  const isTakeaway = currentOrder.type === 'takeaway' || currentOrder.type === 'delivery' || currentOrder.type === 'pickup';
  const currentIndex = readyOrdersList.findIndex(o => o.id === currentOrder.id);
  const itemsCount = (currentOrder.items || []).reduce((sum, item) => sum + (item.qty || 1), 0);
  const itemsSummary = (currentOrder.items || []).map(i => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}`).slice(0, 2).join(', ');
  const moreCount = Math.max(0, (currentOrder.items || []).length - 2);

  const displayTitle = currentOrder.tableName
    ? `Table ${currentOrder.tableName}`
    : (currentOrder.token ? `Token #${currentOrder.token}` : 'Takeaway Order');

  return (
    <div
      id="waiter-ready-ambient-banner"
      style={{
        position: 'fixed',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        maxWidth: 480,
        width: 'calc(100vw - 24px)',
        background: 'rgba(11, 18, 33, 0.95)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 22,
        border: isTakeaway
          ? '1px solid rgba(245, 158, 11, 0.45)'
          : '1px solid rgba(16, 185, 129, 0.45)',
        boxShadow: isTakeaway
          ? '0 16px 36px -4px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.06), 0 4px 18px rgba(245, 158, 11, 0.2)'
          : '0 16px 36px -4px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.06), 0 4px 18px rgba(16, 185, 129, 0.2)',
        padding: '7px 8px 7px 10px',
        color: '#ffffff',
        fontFamily: 'var(--font-family)',
        animation: 'foodReadyDropIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
      }}
    >
      {/* ── Single Compact Horizontal Row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        
        {/* Left: Round Icon + Title Stack */}
        <div 
          onClick={() => handleSelectTableOnMap(currentOrder)}
          title={currentOrder.tableId ? "Click to highlight table on map" : undefined}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 9, 
            minWidth: 0, 
            flex: 1,
            cursor: currentOrder.tableId ? 'pointer' : 'default',
          }}
        >
          {/* Circular Icon with Pulse Beacon */}
          <div style={{
            position: 'relative',
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: isTakeaway
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            flexShrink: 0,
            boxShadow: isTakeaway ? '0 0 12px rgba(245, 158, 11, 0.45)' : '0 0 12px rgba(16, 185, 129, 0.45)',
          }}>
            {isTakeaway ? <ShoppingBag size={16} /> : <Utensils size={16} />}
            <span style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#22c55e',
              border: '1.5px solid #0b1221',
              boxShadow: '0 0 6px #22c55e',
              animation: 'beaconPulse 1.5s infinite',
            }} />
          </div>

          {/* Clean 2-Line Text Block (Guaranteed No Broken Line Wraps) */}
          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {/* Row 1: Table Name + READY tag + Pager */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
              <span style={{ 
                fontSize: 13.5, 
                fontWeight: 800, 
                color: '#ffffff', 
                letterSpacing: '-0.2px',
                whiteSpace: 'nowrap',
              }}>
                {displayTitle}
              </span>

              <span style={{
                background: isTakeaway ? 'rgba(245, 158, 11, 0.18)' : 'rgba(16, 185, 129, 0.18)',
                color: isTakeaway ? '#fbbf24' : '#34d399',
                border: isTakeaway ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(16, 185, 129, 0.35)',
                fontSize: 9.5,
                fontWeight: 800,
                padding: '1px 5px',
                borderRadius: 4,
                letterSpacing: '0.04em',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
              }}>
                READY
              </span>

              {/* Clean Micro Pager */}
              {readyOrdersList.length > 1 && (
                <div 
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 1,
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: 10,
                    padding: '1px 4px',
                    fontSize: 9.5,
                    fontWeight: 700,
                    color: '#94a3b8',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <button
                    onClick={handleSwitchPrevOrder}
                    title="Previous order"
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex' }}
                  >
                    <ChevronLeft size={11} />
                  </button>
                  <span style={{ padding: '0 2px' }}>{currentIndex + 1}/{readyOrdersList.length}</span>
                  <button
                    onClick={handleSwitchNextOrder}
                    title="Next order"
                    style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex' }}
                  >
                    <ChevronRight size={11} />
                  </button>
                </div>
              )}
            </div>

            {/* Row 2: Subtitle Items Preview */}
            <div style={{ 
              fontSize: 11, 
              color: '#94a3b8', 
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.3,
              marginTop: 1,
            }}>
              <span style={{ color: '#cbd5e1', fontWeight: 600 }}>{itemsCount} item{itemsCount !== 1 ? 's' : ''}</span>
              {itemsSummary && ` · ${itemsSummary}`}
              {moreCount > 0 && ` +${moreCount}`}
            </div>
          </div>
        </div>

        {/* Right Side: Clean 3-Button Action Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          {/* Quick Peek Itemized List Toggle */}
          {(currentOrder.items || []).length > 0 && (
            <button
              onClick={() => setIsExpanded(prev => !prev)}
              title={isExpanded ? "Collapse items" : "View items"}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: isExpanded ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                border: 'none',
                color: isExpanded ? '#ffffff' : '#94a3b8',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          )}

          {/* Primary Action Button: "Mark Served" */}
          <button
            onClick={() => handleMarkServed(currentOrder)}
            disabled={isServing}
            id="food-ready-serve-btn"
            style={{
              height: 33,
              padding: '0 12px',
              borderRadius: 16,
              background: isTakeaway
                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              color: '#ffffff',
              fontSize: 12,
              fontWeight: 700,
              cursor: isServing ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              boxShadow: isTakeaway ? '0 2px 10px rgba(245, 158, 11, 0.35)' : '0 2px 10px rgba(16, 185, 129, 0.35)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            {isServing ? (
              <span style={{ fontSize: 11 }}>Serving...</span>
            ) : (
              <>
                <Check size={13} strokeWidth={3} />
                <span>{isTakeaway ? 'Hand Over' : 'Mark Served'}</span>
              </>
            )}
          </button>

          {/* Dismiss Alert button */}
          <button
            onClick={() => handleDismiss(currentOrder.id)}
            title="Dismiss notification"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ── Expandable Quick Peek Items Tray ── */}
      {isExpanded && (
        <div style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: 12,
            padding: '7px 10px',
            maxHeight: 110,
            overflowY: 'auto',
          }}>
            {(currentOrder.items || []).map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, color: '#f1f5f9', padding: '2.5px 0' }}>
                <span style={{
                  background: isTakeaway ? '#f59e0b' : '#10b981',
                  color: '#000000',
                  fontWeight: 900,
                  fontSize: 10,
                  padding: '1px 5px',
                  borderRadius: 4,
                  minWidth: 18,
                  textAlign: 'center',
                }}>
                  ×{item.qty}
                </span>
                <span style={{ fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.name}
                </span>
                {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                  <span style={{ fontSize: 10, color: '#38bdf8' }}>
                    +{item.selectedModifiers.length} mod
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Footer attribution */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 5, fontSize: 10.5, color: '#94a3b8', padding: '0 4px' }}>
            <span>
              {currentOrder.assignedWaiterName
                ? `Server: ${currentOrder.assignedWaiterName}`
                : (currentOrder.staffName ? `Punched by: ${currentOrder.staffName}` : (isTakeaway ? 'Takeaway Counter' : 'Open Floor'))}
            </span>
            {currentOrder.token && (
              <span>Token #{currentOrder.token}</span>
            )}
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes foodReadyDropIn {
          from {
            transform: translate(-50%, -30px) scale(0.96);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0) scale(1);
            opacity: 1;
          }
        }
        @keyframes beaconPulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.35;
            transform: scale(1.3);
          }
        }
      `}</style>
    </div>
  );
}
