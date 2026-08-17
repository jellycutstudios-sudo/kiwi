import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

export default function InfoTooltip({ text, size = 14 }) {
  const [show, setShow] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const iconRef = useRef(null);

  useEffect(() => {
    if (show && iconRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      setCoords({
        top: rect.top - 8, // 8px gap above the icon
        left: rect.left + rect.width / 2,
      });
    }
  }, [show]);

  return (
    <>
      <div 
        ref={iconRef}
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          marginLeft: '6px',
          verticalAlign: 'middle',
          transition: 'transform 0.2s',
          transform: show ? 'scale(1.1)' : 'scale(1)',
        }}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
      >
        <Info 
          size={size} 
          color={show ? "var(--color-accent)" : "var(--color-label-tertiary)"} 
          style={{ cursor: 'help', transition: 'color 0.2s' }} 
        />
      </div>
      
      {show && createPortal(
        <div style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          transform: 'translate(-50%, -100%)',
          background: 'rgba(20, 20, 20, 0.85)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          color: '#ffffff',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          fontWeight: 500,
          whiteSpace: 'pre-wrap',
          maxWidth: '220px',
          textAlign: 'center',
          lineHeight: '1.4',
          zIndex: 999999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
          pointerEvents: 'none',
          animation: 'tooltipFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}>
          {text}
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '5px',
            borderStyle: 'solid',
            borderColor: 'rgba(20, 20, 20, 0.85) transparent transparent transparent'
          }} />
          <style>{`
            @keyframes tooltipFadeIn {
              from { opacity: 0; transform: translate(-50%, calc(-100% + 4px)); }
              to { opacity: 1; transform: translate(-50%, -100%); }
            }
          `}</style>
        </div>,
        document.body
      )}
    </>
  );
}
