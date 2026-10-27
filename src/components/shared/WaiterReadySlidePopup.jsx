import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useOrderStore } from '../../stores/orderStore';
import { playNotificationTone, vibrateDevice } from '../../utils/soundNotifications';
import { Check, Utensils, X, ShoppingBag, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Printer } from 'lucide-react';
import { printReceipt } from '../../utils/print';
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
  const isEligibleTab = location.pathname === '/tables' || location.pathname === '/pos';
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
    if (!isEligibleTab || isEditMode || !isWaiterPopupEnabled || userRole === 'kitchen') return [];

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
        if (isTakeaway || location.pathname === '/pos') return true;
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
  }, [isEligibleTab, isEditMode, activeOrders, acknowledgedOrderIds, isWaiterPopupEnabled, userRole, isFloorStaff, isManagerOrAdmin, staffId, audienceMode, location.pathname]);

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

  const handlePrintReceipt = useCallback((order, e) => {
    e?.stopPropagation();
    if (!order) return;
    printReceipt({
      restaurant,
      order,
      items: order.items || [],
      taxInfo: order.taxInfo,
      staffName: staffDoc?.name || (userRole === 'cashier' ? 'Cashier' : 'Waiter')
    });
    toast.success(`Printing bill for ${order.tableName ? `Table ${order.tableName}` : (order.token ? `Token #${order.token}` : 'Order')}`, { icon: '🖨️' });
  }, [restaurant, staffDoc, userRole]);

  if (!isEligibleTab || isEditMode || !currentOrder) return null;

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
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        maxWidth: 620,
        width: 'calc(100vw - 24px)',
        background: 'rgba(11, 18, 33, 0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 24,
        border: isTakeaway
          ? '1.5px solid rgba(245, 158, 11, 0.5)'
          : '1.5px solid rgba(16, 185, 129, 0.5)',
        boxShadow: isTakeaway
          ? '0 20px 40px -4px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08), 0 6px 22px rgba(245, 158, 11, 0.25)'
          : '0 20px 40px -4px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08), 0 6px 22px rgba(16, 185, 129, 0.25)',
        padding: '10px 12px 10px 14px',
        color: '#ffffff',
        fontFamily: 'var(--font-family)',
        animation: 'foodReadyDropIn 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        userSelect: 'none',
      }}
    >
      {/* ── Single Compact Horizontal Row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        
        {/* Left: Round Icon + Title Stack */}
        <div 
          onClick={() => handleSelectTableOnMap(currentOrder)}
          title={currentOrder.tableId ? "Click to highlight table on map" : undefined}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            minWidth: 0, 
            flex: 1,
            cursor: currentOrder.tableId ? 'pointer' : 'default',
          }}
        >
          {/* Circular Icon with Pulse Beacon */}
          <div style={{
            position: 'relative',
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: isTakeaway
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            flexShrink: 0,
            boxShadow: isTakeaway ? '0 0 14px rgba(245, 158, 11, 0.5)' : '0 0 14px rgba(16, 185, 129, 0.5)',
          }}>
            {isTakeaway ? <ShoppingBag size={20} /> : <Utensils size={20} />}
            <span style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#22c55e',
              border: '2px solid #0b1221',
              boxShadow: '0 0 8px #22c55e',
              animation: 'beaconPulse 1.5s infinite',
            }} />
          </div>

          {/* Clean 2-Line Text Block (Guaranteed No Broken Line Wraps) */}
          <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {/* Row 1: Table Name + READY tag + Pager */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
              <span style={{ 
                fontSize: 15.5, 
                fontWeight: 800, 
                color: '#ffffff', 
                letterSpacing: '-0.2px',
                whiteSpace: 'nowrap',
              }}>
                {displayTitle}
              </span>

              <span style={{
                background: isTakeaway ? 'rgba(245, 158, 11, 0.22)' : 'rgba(16, 185, 129, 0.22)',
                color: isTakeaway ? '#fbbf24' : '#34d399',
                border: isTakeaway ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                fontSize: 10.5,
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 5,
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
                    gap: 2,
                    background: 'rgba(255, 255, 255, 0.1)',
                    borderRadius: 12,
                    padding: '2px 6px',
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: '#cbd5e1',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <button
                    onClick={handleSwitchPrevOrder}
                    title="Previous order"
                    style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 0, display: 'flex' }}
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <span style={{ padding: '0 3px' }}>{currentIndex + 1}/{readyOrdersList.length}</span>
                  <button
                    onClick={handleSwitchNextOrder}
                    title="Next order"
                    style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 0, display: 'flex' }}
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>

            {/* Row 2: Subtitle Items Preview */}
            <div style={{ 
              fontSize: 12.5, 
              color: '#94a3b8', 
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.35,
              marginTop: 2,
            }}>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{itemsCount} item{itemsCount !== 1 ? 's' : ''}</span>
              {itemsSummary && ` · ${itemsSummary}`}
              {moreCount > 0 && ` +${moreCount}`}
            </div>
          </div>
        </div>

        {/* Right Side: Touch-Friendly Action Cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          {/* Quick Peek Itemized List Toggle */}
          {(currentOrder.items || []).length > 0 && (
            <button
              onClick={() => setIsExpanded(prev => !prev)}
              title={isExpanded ? "Collapse items" : "View items"}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: isExpanded ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: isExpanded ? '#ffffff' : '#cbd5e1',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          )}

          {/* Touch-Friendly Print Bill Button */}
          <button
            type="button"
            onClick={(e) => handlePrintReceipt(currentOrder, e)}
            title="Print Customer Bill / Receipt"
            style={{
              height: 42,
              padding: '0 14px',
              borderRadius: 21,
              background: 'rgba(255, 255, 255, 0.14)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              color: '#ffffff',
              fontSize: 13.5,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
              touchAction: 'manipulation'
            }}
          >
            <Printer size={15} />
            <span>Bill</span>
          </button>

          {/* Touch-Friendly Primary Action Button: "Mark Served" */}
          <button
            onClick={() => handleMarkServed(currentOrder)}
            disabled={isServing}
            id="food-ready-serve-btn"
            style={{
              height: 42,
              padding: '0 16px',
              borderRadius: 21,
              background: isTakeaway
                ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              color: '#ffffff',
              fontSize: 13.5,
              fontWeight: 700,
              cursor: isServing ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: isTakeaway ? '0 3px 12px rgba(245, 158, 11, 0.4)' : '0 3px 12px rgba(16, 185, 129, 0.4)',
              transition: 'all 0.15s ease',
              whiteSpace: 'nowrap',
              touchAction: 'manipulation'
            }}
          >
            {isServing ? (
              <span style={{ fontSize: 12 }}>Serving...</span>
            ) : (
              <>
                <Check size={16} strokeWidth={2.8} />
                <span>{isTakeaway ? 'Hand Over' : 'Mark Served'}</span>
              </>
            )}
          </button>

          {/* Touch-Friendly Dismiss Alert button */}
          <button
            onClick={() => handleDismiss(currentOrder.id)}
            title="Dismiss notification"
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              touchAction: 'manipulation'
            }}
          >
            <X size={16} />
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
