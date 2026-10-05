import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { useOrderStore } from '../../stores/orderStore';
import { playNotificationTone, vibrateDevice } from '../../utils/soundNotifications';
import { Check, ChevronRight, Utensils, X, Bell, ShoppingBag } from 'lucide-react';
import toast from 'react-hot-toast';

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
  const isFloorStaff = ['waiter', 'server', 'runner', 'captain'].includes(userRole);
  const isManagerOrAdmin = ['admin', 'manager', 'owner', 'super_admin'].includes(userRole);

  // Track acknowledged order IDs locally in session so they don't pop up again
  const [acknowledgedOrderIds, setAcknowledgedOrderIds] = useState(() => new Set());
  const [currentOrder, setCurrentOrder] = useState(null);
  const currentOrderIdRef = useRef(null);
  const notifiedOrderIdsRef = useRef(new Set());

  // Browser push permission prompt state
  const [canRequestNotif, setCanRequestNotif] = useState(() => {
    return typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default';
  });

  const handleEnablePush = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const res = await Notification.requestPermission();
        setCanRequestNotif(false);
        if (res === 'granted') {
          toast.success('Push alerts enabled for food ready!', { icon: '🔔' });
        }
      } catch {
        setCanRequestNotif(false);
      }
    }
  };

  // Slider state
  const [slideX, setSlideX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const trackRef = useRef(null);
  const startXRef = useRef(0);

  // Compute ready orders via useMemo to avoid re-render loops
  const readyOrdersList = useMemo(() => {
    // Strictly only active on the waiter tab (/tables)
    if (!isWaiterTab) return [];
    // Strictly suppress during admin floor plan editing
    if (isEditMode) return [];
    if (!isWaiterPopupEnabled) return [];
    if (userRole === 'kitchen') return [];

    return activeOrders.filter(o => {
      if (o.status !== 'ready') return false;
      if (acknowledgedOrderIds.has(o.id)) return false;

      // If user is a waiter/runner/floor staff:
      if (isFloorStaff) {
        // Specifically assigned to this waiter
        if (o.assignedWaiterId && o.assignedWaiterId === staffId) return true;
        // Placed by this waiter
        if (o.staffId && o.staffId === staffId) return true;
        // Unassigned order: any available waiter on floor can serve it
        if (!o.assignedWaiterId) return true;
        return false;
      }

      // If user is admin / manager:
      // Only show if the admin explicitly assigned themselves as the server on this order
      if (isManagerOrAdmin) {
        if (o.assignedWaiterId && o.assignedWaiterId === staffId) return true;
        return false;
      }

      return false;
    });
  }, [isWaiterTab, isEditMode, activeOrders, acknowledgedOrderIds, isWaiterPopupEnabled, userRole, isFloorStaff, isManagerOrAdmin, staffId]);

  // Handle order notifications, chimes, and popup active item
  useEffect(() => {
    // Detect newly ready orders to trigger chime & notifications per order
    const newlyReady = readyOrdersList.filter(o => !notifiedOrderIdsRef.current.has(o.id));
    if (newlyReady.length > 0) {
      newlyReady.forEach(o => notifiedOrderIdsRef.current.add(o.id));

      // 1. Play kitchen bell chime tone
      playNotificationTone(chimeTone, 0.7);

      // 2. Haptic buzz on mobile/handheld device
      if (isVibrateEnabled) {
        vibrateDevice([200, 100, 200, 100, 300]);
      }

      // 3. Native Browser Notification (for background tabs or locked screens)
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        newlyReady.forEach(orderItem => {
          try {
            const tableLabel = orderItem.tableName ? `Table ${orderItem.tableName}` : (orderItem.token ? `Token #${orderItem.token}` : 'Takeaway');
            const itemList = (orderItem.items || []).map(i => `${i.qty}× ${i.name}`).slice(0, 3).join(', ');
            new Notification(`🔔 Order Ready: ${tableLabel}!`, {
              body: itemList ? `${itemList} ready for pickup at pass` : 'Food is plated and ready for pickup!',
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
        setSlideX(0);
        setIsCompleted(false);
      }
    } else if (currentOrderIdRef.current) {
      currentOrderIdRef.current = null;
      setCurrentOrder(null);
    }
  }, [readyOrdersList, chimeTone, isVibrateEnabled]);

  // Tab Title Flashing Alert when an order is ready
  useEffect(() => {
    if (!currentOrder) return;
    const originalTitle = document.title;
    const targetLabel = currentOrder.tableName ? `Table ${currentOrder.tableName}` : (currentOrder.token ? `#${currentOrder.token}` : 'Ready');
    let isAlert = false;
    const interval = setInterval(() => {
      document.title = isAlert ? `🔔 [ORDER READY: ${targetLabel}]` : originalTitle;
      isAlert = !isAlert;
    }, 1200);

    return () => {
      clearInterval(interval);
      document.title = originalTitle;
    };
  }, [currentOrder]);

  const handleSwitchNextOrder = useCallback(() => {
    if (readyOrdersList.length <= 1) return;
    const currentIndex = readyOrdersList.findIndex(o => o.id === currentOrderIdRef.current);
    const nextIndex = (currentIndex + 1) % readyOrdersList.length;
    const next = readyOrdersList[nextIndex];
    currentOrderIdRef.current = next.id;
    setCurrentOrder(next);
    setSlideX(0);
    setIsCompleted(false);
  }, [readyOrdersList]);

  const handleDismiss = useCallback((orderId) => {
    currentOrderIdRef.current = null;
    setAcknowledgedOrderIds(prev => new Set([...prev, orderId]));
    setCurrentOrder(null);
    setSlideX(0);
    setIsCompleted(false);
  }, []);

  const handleMarkServed = useCallback(async (order) => {
    if (!restaurant?.id || !order?.id) return;
    setIsCompleted(true);
    if (isVibrateEnabled) vibrateDevice([200]);

    const isTakeaway = order.type === 'takeaway' || order.type === 'delivery' || order.type === 'pickup';

    try {
      await updateOrderStatus(restaurant.id, order.id, 'served');
      toast.success(
        isTakeaway 
          ? `${order.token ? `Token #${order.token}` : 'Takeaway order'} handed over!` 
          : `${order.tableName ? `Table ${order.tableName}` : 'Order'} marked as Served!`,
        { icon: isTakeaway ? '🛍️' : '🍽️' }
      );
    } catch (err) {
      console.error('Failed to mark served:', err);
    } finally {
      setTimeout(() => {
        handleDismiss(order.id);
      }, 500);
    }
  }, [restaurant?.id, updateOrderStatus, isVibrateEnabled, handleDismiss]);

  // Touch & Mouse Drag Handlers
  const handlePointerDown = (e) => {
    if (isCompleted) return;
    setIsDragging(true);
    startXRef.current = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
  };

  const handlePointerMove = useCallback((e) => {
    if (!isDragging || isCompleted || !trackRef.current) return;
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    const deltaX = clientX - startXRef.current;
    const trackWidth = trackRef.current.clientWidth;
    const thumbWidth = 56;
    const maxSlide = Math.max(10, trackWidth - thumbWidth - 8);

    const clampedX = Math.max(0, Math.min(deltaX, maxSlide));
    setSlideX(clampedX);

    // If dragged >= 85% of track, trigger completion
    if (clampedX >= maxSlide * 0.85) {
      setIsDragging(false);
      setSlideX(maxSlide);
      if (currentOrder) {
        handleMarkServed(currentOrder);
      }
    }
  }, [isDragging, isCompleted, currentOrder, handleMarkServed]);

  const handlePointerUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (!isCompleted) {
      // Snap back if didn't reach threshold
      setSlideX(0);
    }
  }, [isDragging, isCompleted]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove);
      window.addEventListener('touchend', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDragging, handlePointerMove, handlePointerUp]);

  if (!isWaiterTab || isEditMode || !currentOrder) return null;

  const isTakeaway = currentOrder.type === 'takeaway' || currentOrder.type === 'delivery' || currentOrder.type === 'pickup';
  const trackWidth = trackRef.current?.clientWidth || 320;
  const maxSlide = Math.max(10, trackWidth - 64);
  const progress = Math.min(1, slideX / maxSlide);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 99999,
        maxWidth: 420,
        width: 'calc(100vw - 48px)',
        background: 'linear-gradient(145deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: 20,
        border: isTakeaway ? '1.5px solid rgba(245, 158, 11, 0.5)' : '1.5px solid rgba(56, 189, 248, 0.4)',
        boxShadow: isTakeaway
          ? '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(245, 158, 11, 0.25)'
          : '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.25)',
        padding: '16px 18px',
        color: '#ffffff',
        fontFamily: 'var(--font-family)',
        animation: 'waiterSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
      id="waiter-ready-slide-popup"
    >
      {/* Header with dismiss button */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: isTakeaway
              ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
              : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: isTakeaway ? '0 4px 12px rgba(245, 158, 11, 0.4)' : '0 4px 12px rgba(16, 185, 129, 0.4)',
            color: '#ffffff',
            flexShrink: 0
          }}>
            {isTakeaway ? <ShoppingBag size={20} /> : <Utensils size={20} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.2px' }}>
                {isTakeaway ? 'Takeaway Ready!' : 'Food Ready at Pass!'}
              </span>
              <span style={{
                background: isTakeaway ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                color: isTakeaway ? '#fbbf24' : '#34d399',
                border: isTakeaway ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                fontSize: 10,
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 4,
                textTransform: 'uppercase'
              }}>
                {isTakeaway ? 'Pickup' : 'Ready'}
              </span>
              {readyOrdersList.length > 1 && (
                <span style={{
                  background: 'rgba(59, 130, 246, 0.25)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 4,
                  textTransform: 'uppercase'
                }}>
                  +{readyOrdersList.length - 1} more
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, fontWeight: 600 }}>
              {currentOrder.tableName ? `🪑 Table ${currentOrder.tableName}` : (currentOrder.type === 'takeaway' ? '🛍️ Takeaway' : '🌐 Online Order')}
              {currentOrder.token && ` · Token #${currentOrder.token}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {canRequestNotif && (
            <button
              onClick={handleEnablePush}
              title="Enable background alerts"
              style={{
                background: 'rgba(56, 189, 248, 0.2)',
                border: '1px solid rgba(56, 189, 248, 0.5)',
                borderRadius: 14,
                padding: '3px 8px',
                color: '#38bdf8',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <Bell size={12} />
              Alerts
            </button>
          )}

          {readyOrdersList.length > 1 && (
            <button
              onClick={handleSwitchNextOrder}
              title="View next ready order"
              style={{
                background: 'rgba(59, 130, 246, 0.25)',
                border: '1px solid rgba(59, 130, 246, 0.5)',
                borderRadius: 14,
                padding: '3px 8px',
                color: '#60a5fa',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              Next ›
            </button>
          )}

          <button
            onClick={() => handleDismiss(currentOrder.id)}
            title="Dismiss alert"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '50%',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Items List Preview */}
      <div style={{
        background: 'rgba(0, 0, 0, 0.25)',
        borderRadius: 12,
        padding: '8px 12px',
        marginBottom: 14,
        maxHeight: 90,
        overflowY: 'auto',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        {currentOrder.items?.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#e2e8f0', padding: '3px 0' }}>
            <span style={{
              background: '#f59e0b',
              color: '#000000',
              fontWeight: 900,
              fontSize: 11,
              padding: '1px 5px',
              borderRadius: 4,
              minWidth: 20,
              textAlign: 'center'
            }}>
              ×{item.qty}
            </span>
            <span style={{ fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {item.name}
            </span>
            {item.selectedModifiers && item.selectedModifiers.length > 0 && (
              <span style={{ fontSize: 10, color: '#22d3ee' }}>
                +{item.selectedModifiers.length} mod
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Slide to Acknowledge & Serve Track */}
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          height: 52,
          background: '#090d16',
          borderRadius: 26,
          border: '1px solid rgba(255, 255, 255, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          userSelect: 'none',
          touchAction: 'none'
        }}
      >
        {/* Fill Track */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.max(52, slideX + 52)}px`,
            background: isCompleted 
              ? (isTakeaway ? 'linear-gradient(90deg, #d97706 0%, #f59e0b 100%)' : 'linear-gradient(90deg, #059669 0%, #10b981 100%)')
              : (isTakeaway 
                  ? 'linear-gradient(90deg, rgba(245, 158, 11, 0.3) 0%, rgba(245, 158, 11, 0.8) 100%)' 
                  : 'linear-gradient(90deg, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.8) 100%)'),
            transition: isDragging ? 'none' : 'width 0.2s ease',
            borderRadius: 26
          }}
        />

        {/* Center Prompt Text */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 800,
            color: '#ffffff',
            opacity: Math.max(0, 1 - progress * 1.8),
            pointerEvents: 'none',
            letterSpacing: '0.02em',
            paddingLeft: 40
          }}
        >
          {isCompleted 
            ? (isTakeaway ? '✓ Handed Over!' : '✓ Marked Served!') 
            : (isTakeaway ? 'Slide to Hand Over ➔' : 'Slide to Acknowledge & Serve ➔')}
        </div>

        {/* Draggable Thumb Button */}
        <div
          onPointerDown={handlePointerDown}
          style={{
            position: 'absolute',
            left: `${slideX + 4}px`,
            width: 44,
            height: 44,
            borderRadius: 22,
            background: isCompleted
              ? (isTakeaway ? '#f59e0b' : '#10b981')
              : (isTakeaway ? 'linear-gradient(145deg, #fbbf24 0%, #d97706 100%)' : 'linear-gradient(145deg, #38bdf8 0%, #0284c7 100%)'),
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isCompleted ? 'default' : 'grab',
            color: '#ffffff',
            transition: isDragging ? 'none' : 'left 0.2s ease, background 0.2s ease',
            zIndex: 10
          }}
        >
          {isCompleted ? (
            <Check size={22} strokeWidth={3} />
          ) : (
            <ChevronRight size={24} strokeWidth={2.5} />
          )}
        </div>
      </div>

      {/* Waiter Attribution Badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#94a3b8' }}>
        <span>
          {currentOrder.assignedWaiterName
            ? `Server: ${currentOrder.assignedWaiterName}`
            : (currentOrder.staffName ? `Staff: ${currentOrder.staffName}` : (isTakeaway ? 'Counter Staff' : 'All Waiters'))}
        </span>
        <button
          onClick={() => handleMarkServed(currentOrder)}
          style={{
            background: 'transparent',
            border: 'none',
            color: isTakeaway ? '#f59e0b' : '#38bdf8',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0
          }}
        >
          Quick Tap Acknowledge
        </button>
      </div>

      {/* Animation Styles */}
      <style>{`
        @keyframes waiterSlideIn {
          from {
            transform: translateY(100px) scale(0.92);
            opacity: 0;
          }
          to {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
