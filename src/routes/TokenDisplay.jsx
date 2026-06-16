import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTokenStore } from '../stores/tokenStore';

export default function TokenDisplay() {
  const { restaurantId } = useParams();
  const { currentServing, latestIssued, queue, subscribe } = useTokenStore();

  useEffect(() => {
    if (!restaurantId) return;
    const unsub = subscribe(restaurantId);
    return unsub;
  }, [restaurantId, subscribe]);

  return (
    <div className="token-display-page">
      <div className="token-display-brand">🍽️ RestaurantOS</div>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-6)',
      }}>
        {/* Now Serving */}
        <div className="token-now-serving">
          <div className="token-label">Now Serving</div>
          <div className="token-number">
            {currentServing ? String(currentServing).padStart(3, '0') : '---'}
          </div>
        </div>

        {/* Divider */}
        <div style={{ width: 120, height: 2, background: 'rgba(255,255,255,0.1)', borderRadius: 1 }} />

        {/* Queue */}
        {queue.length > 0 && (
          <div className="token-queue-section">
            <div className="token-queue-label">Up Next</div>
            <div className="token-queue-list">
              {queue.slice(0, 8).map(t => (
                <div key={t} className="token-queue-item">
                  {String(t).padStart(3, '0')}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats bar */}
        <div style={{
          position: 'fixed',
          bottom: 'var(--space-6)',
          display: 'flex',
          gap: 'var(--space-8)',
          color: 'rgba(255,255,255,0.4)',
          fontSize: 14,
        }}>
          <div>Issued: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{latestIssued ?? 0}</strong></div>
          <div>Waiting: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{Math.max(0, (latestIssued ?? 0) - (currentServing ?? 0))}</strong></div>
        </div>

        {/* Live pulse indicator */}
        <div style={{
          position: 'fixed',
          top: 'var(--space-6)',
          right: 'var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: 'rgba(255,255,255,0.4)',
          fontSize: 12,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'var(--color-green)',
            animation: 'tokenPulse 2s ease-in-out infinite',
          }} />
          LIVE
        </div>
      </div>
    </div>
  );
}
