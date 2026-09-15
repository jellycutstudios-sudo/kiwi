import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useOrderStore } from '../../stores/orderStore';
import { playNotificationTone, vibrateDevice } from '../../utils/soundNotifications';
import { Check, ChevronRight, Utensils, X, Bell } from 'lucide-react';
import toast from 'react-hot-toast';

export default function WaiterReadySlidePopup() {
  const { restaurant, staffDoc } = useAuthStore();
  const activeOrders = useOrderStore(s => s.activeOrders);
  const updateOrderStatus = useOrderStore(s => s.updateOrderStatus);

  const userRole = staffDoc?.role ?? 'admin';
  const staffId = staffDoc?.id ?? null;
  const staffName = staffDoc?.name ?? '';

  const notificationConfig = restaurant?.notifications ?? {};
  const isWaiterPopupEnabled = notificationConfig.waiterSlidePopupEnabled !== false;
  const isVibrateEnabled = notificationConfig.vibrateOnReady !== false;

  // Track acknowledged order IDs locally in session so they don't pop up again
  const [acknowledgedOrderIds, setAcknowledgedOrderIds] = useState(() => new Set());
  const [currentOrder, setCurrentOrder] = useState(null);

  // Slider state
  const [slideX, setSlideX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const trackRef = useRef(null);
  const startXRef = useRef(0);

  // Filter orders that are ready and relevant to this staff member
  useEffect(() => {
    if (!isWaiterPopupEnabled) {
      setCurrentOrder(null);
      return;
    }

    // STRICT: Cashiers never see the slide popup so checkout and billing are never blocked
    if (userRole === 'cashier') {
      setCurrentOrder(null);
      return;
    }

    // Only show slide popup for staff with role 'waiter' (or admin in manager view)
    const isWaiter = userRole === 'waiter';
    const isAdmin = userRole === 'admin' || userRole === 'super_admin';
    if (!isWaiter && !isAdmin) {
      setCurrentOrder(null);
      return;
    }

    const readyOrders = activeOrders.filter(o => {
      if (o.status !== 'ready') return false;
      if (acknowledgedOrderIds.has(o.id)) return false;

      // 1. If assigned specifically to this waiter
      if (o.assignedWaiterId && o.assignedWaiterId === staffId) return true;
      if (o.staffId && o.staffId === staffId && isWaiter) return true;

      // 2. If unassigned and user is a waiter on duty
      if (!o.assignedWaiterId && isWaiter) return true;

      // 3. If admin, only show if admin specifically placed the order or if testing
      if (isAdmin && (o.staffId === staffId || !o.assignedWaiterId)) return true;

      return false;
    });

    if (readyOrders.length > 0) {
      if (!currentOrder || !readyOrders.some(o => o.id === currentOrder.id)) {
        setCurrentOrder(readyOrders[0]);
        setSlideX(0);
        setIsCompleted(false);

        // Haptic buzz on new popup
        if (isVibrateEnabled) {
          vibrateDevice([150, 80, 150]);
        }
      }
    } else {
      setCurrentOrder(null);
    }
  }, [activeOrders, acknowledgedOrderIds, userRole, staffId, isWaiterPopupEnabled, isVibrateEnabled, currentOrder]);

  const handleDismiss = useCallback((orderId) => {
    setAcknowledgedOrderIds(prev => new Set([...prev, orderId]));
    setCurrentOrder(null);
    setSlideX(0);
    setIsCompleted(false);
  }, []);

  const handleMarkServed = useCallback(async (order) => {
    if (!restaurant?.id || !order?.id) return;
    setIsCompleted(true);
    if (isVibrateEnabled) vibrateDevice([200]);

    try {
      await updateOrderStatus(restaurant.id, order.id, 'served');
      toast.success(`${order.tableName ? `Table ${order.tableName}` : 'Order'} marked as Served!`, {
        icon: '🍽️'
      });
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

  if (!currentOrder) return null;

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
        border: '1.5px solid rgba(56, 189, 248, 0.4)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(56, 189, 248, 0.25)',
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
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
            color: '#ffffff',
            flexShrink: 0
          }}>
            <Utensils size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.2px' }}>
                Food Ready at Pass!
              </span>
              <span style={{
                background: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.4)',
                fontSize: 10,
                fontWeight: 800,
                padding: '2px 6px',
                borderRadius: 4,
                textTransform: 'uppercase'
              }}>
                Ready
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, fontWeight: 600 }}>
              {currentOrder.tableName ? `🪑 Table ${currentOrder.tableName}` : (currentOrder.type === 'takeaway' ? '🛍️ Takeaway' : '🌐 Online Order')}
              {currentOrder.token && ` · Token #${currentOrder.token}`}
            </div>
          </div>
        </div>

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
              ? 'linear-gradient(90deg, #059669 0%, #10b981 100%)'
              : 'linear-gradient(90deg, rgba(16, 185, 129, 0.3) 0%, rgba(16, 185, 129, 0.8) 100%)',
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
          {isCompleted ? '✓ Marked Served!' : 'Slide to Acknowledge & Serve ➔'}
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
              ? '#10b981'
              : 'linear-gradient(145deg, #38bdf8 0%, #0284c7 100%)',
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
            : (staffName ? `Staff: ${staffName}` : 'All Waiters')}
        </span>
        <button
          onClick={() => handleMarkServed(currentOrder)}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#38bdf8',
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
