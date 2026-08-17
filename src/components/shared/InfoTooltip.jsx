import { useState } from 'react';
import { Info } from 'lucide-react';

export default function InfoTooltip({ text, size = 14 }) {
  const [show, setShow] = useState(false);

  return (
    <div 
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: '6px' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={() => setShow(!show)}
    >
      <Info size={size} color="var(--color-label-tertiary)" style={{ cursor: 'help' }} />
      
      {show && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '8px',
          background: 'var(--color-label)',
          color: 'var(--color-bg)',
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '11px',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          zIndex: 100,
          boxShadow: 'var(--shadow-md)',
          pointerEvents: 'none'
        }}>
          {text}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '4px',
            borderStyle: 'solid',
            borderColor: 'var(--color-label) transparent transparent transparent'
          }} />
        </div>
      )}
    </div>
  );
}
