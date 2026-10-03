import { useState } from 'react';
import { useOfflineQueueStore } from '../../stores/offlineQueueStore';
import { useAuthStore } from '../../stores/authStore';
import { formatCurrency } from '../../utils/formatCurrency';
import { Cloud, CloudOff, RefreshCw, X, CheckCircle2, AlertTriangle, Clock, Layers, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OfflineSyncModal({ isOpen, onClose }) {
  const { isOnline, queue, isSyncing, lastSyncTime, processQueue, clearQueue, dequeueOrder } = useOfflineQueueStore();
  const { restaurant } = useAuthStore();
  const currency = restaurant?.currency || 'INR';
  const [purging, setPurging] = useState(false);

  if (!isOpen) return null;

  const handleSyncNow = async () => {
    if (!isOnline) {
      toast.error('Device is currently offline. Reconnect to Wi-Fi to sync with cloud.');
      return;
    }
    const res = await processQueue();
    if (res.syncedCount > 0) {
      toast.success(`Successfully uploaded ${res.syncedCount} order${res.syncedCount > 1 ? 's' : ''}!`);
    } else if (res.failedCount === 0 && queue.length === 0) {
      toast.success('All orders are synchronized with the cloud!');
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear the offline buffer? These unsynced orders will not be uploaded.')) {
      clearQueue();
      toast('Offline queue cleared');
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div 
        className="card card-padded" 
        style={{ 
          maxWidth: 580, 
          width: '94%', 
          maxHeight: '85vh', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 'var(--space-4)',
          position: 'relative',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          borderRadius: 20
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-separator)', paddingBottom: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: isOnline ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.18)',
              color: isOnline ? '#16a34a' : '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              {isOnline ? <Cloud size={20} /> : <CloudOff size={20} />}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 'var(--text-title3)', fontWeight: 700 }}>
                Offline Buffer & Cloud Sync
              </h3>
              <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-secondary)' }}>
                {isOnline ? '🟢 Connected to Cloud' : '⚡ Offline Mode Active (Local Buffer)'}
              </div>
            </div>
          </div>
          <button 
            type="button"
            className="btn btn-secondary btn-icon" 
            onClick={onClose}
            style={{ width: 32, height: 32, padding: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Network Status Banner */}
        <div style={{
          padding: '12px 16px',
          borderRadius: 12,
          background: isOnline ? 'var(--color-bg-secondary)' : 'rgba(245, 158, 11, 0.12)',
          border: `1px solid ${isOnline ? 'var(--color-separator)' : 'rgba(245, 158, 11, 0.35)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}>
          <div>
            <div style={{ fontSize: 'var(--text-subhead)', fontWeight: 600, color: isOnline ? 'var(--color-label)' : '#d97706' }}>
              {isOnline ? 'Zero-Downtime Engine Ready' : 'Internet Disconnected'}
            </div>
            <div style={{ fontSize: 'var(--text-caption2)', color: 'var(--color-label-secondary)', marginTop: 2 }}>
              {isOnline 
                ? 'All newly taken orders sync directly. Buffered orders sync automatically.' 
                : 'Service is uninterrupted! Orders are stored safely on device and will sync upon reconnection.'}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSyncNow}
            disabled={isSyncing || queue.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, height: 34, flexShrink: 0 }}
          >
            <RefreshCw size={13} className={isSyncing ? 'spin' : ''} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>

        {/* Queue List Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-subhead)', fontWeight: 600 }}>
            <Layers size={15} color="var(--color-accent)" />
            <span>Buffered Orders in Outbox ({queue.length})</span>
          </div>
          {queue.length > 0 && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleClearAll}
              style={{ fontSize: '11px', height: 26, padding: '0 8px', color: '#ef4444' }}
              title="Purge offline buffer"
            >
              <Trash2 size={12} style={{ marginRight: 4 }} /> Clear Outbox
            </button>
          )}
        </div>

        {/* Queue Items Scroll Area */}
        <div style={{ 
          flex: 1, 
          overflowY: 'auto', 
          maxHeight: 300, 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 8,
          paddingRight: 4 
        }}>
          {queue.length === 0 ? (
            <div style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'var(--color-label-tertiary)',
              background: 'var(--color-bg-secondary)',
              borderRadius: 12,
              border: '1px dashed var(--color-separator)'
            }}>
              <CheckCircle2 size={32} color="#16a34a" style={{ margin: '0 auto 8px', opacity: 0.8 }} />
              <div style={{ fontWeight: 600, color: 'var(--color-label)', fontSize: 'var(--text-subhead)' }}>
                Outbox is clean
              </div>
              <div style={{ fontSize: 'var(--text-caption1)', marginTop: 2 }}>
                All orders have been synchronized with the cloud database.
              </div>
            </div>
          ) : (
            queue.map((order, idx) => (
              <div
                key={order.id || idx}
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-separator)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontWeight: 700,
                      fontSize: 'var(--text-subhead)',
                      background: 'var(--color-bg-elevated)',
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--color-separator)'
                    }}>
                      Token #{order.token}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--color-label-secondary)' }}>
                      {order.type === 'dine-in' ? `Table ${order.tableName || '-'}` : 'Takeaway'}
                    </span>
                    <span style={{
                      fontSize: '10.5px',
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: order.paymentMethod === 'unpaid' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.12)',
                      color: order.paymentMethod === 'unpaid' ? '#ef4444' : '#16a34a',
                      fontWeight: 600
                    }}>
                      {order.paymentMethod?.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: 'var(--text-caption1)', color: 'var(--color-label-tertiary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={11} />
                    <span>Queued: {order.offlineQueuedAt ? new Date(order.offlineQueuedAt).toLocaleTimeString() : 'Just now'}</span>
                    <span>•</span>
                    <span>{order.items?.length || 0} item{(order.items?.length || 0) > 1 ? 's' : ''}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-subhead)', color: 'var(--color-accent)' }}>
                    {formatCurrency(order.total, currency)}
                  </div>
                  <button
                    type="button"
                    onClick={() => dequeueOrder(order.id)}
                    title="Remove from queue"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-label-tertiary)',
                      cursor: 'pointer',
                      padding: 4
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ 
          borderTop: '1px solid var(--color-separator)', 
          paddingTop: 'var(--space-3)', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          fontSize: 'var(--text-caption2)',
          color: 'var(--color-label-tertiary)'
        }}>
          <div>
            {lastSyncTime ? `Last sync check: ${new Date(lastSyncTime).toLocaleTimeString()}` : 'Auto-sync active'}
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
