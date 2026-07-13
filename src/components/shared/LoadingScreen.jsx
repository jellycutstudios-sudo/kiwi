
export default function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-secondary)',
      gap: 'var(--space-4)',
    }}>
      <div style={{
        width: 56,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'bounceIn 0.6s var(--ease-spring)',
      }}>
        <img src="/ricon.svg" alt="Loading..." style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ fontSize: 'var(--text-title3)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-label)' }}>
        DineOS
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite`,
          }} />
        ))}
      </div>
      <style>{`
        @keyframes bounce {
          0%,80%,100%{transform:translateY(0)}
          40%{transform:translateY(-10px)}
        }
      `}</style>
    </div>
  );
}
