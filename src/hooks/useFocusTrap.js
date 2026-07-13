import { useEffect } from 'react';

export function useFocusTrap(ref, isOpen) {
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    
    const focusableElements = ref.current.querySelectorAll(
      'a[href], button, textarea, input[type="text"], input[type="radio"], input[type="checkbox"], select, [tabindex]:not([tabindex="-1"])'
    );
    
    if (focusableElements.length === 0) return;
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };
    
    // Focus first element on open
    setTimeout(() => {
      if (!ref.current?.contains(document.activeElement)) {
        firstElement.focus();
      }
    }, 10);
    
    ref.current.addEventListener('keydown', handleKeyDown);
    
    return () => {
      if (ref.current) {
        ref.current.removeEventListener('keydown', handleKeyDown);
      }
    };
  }, [isOpen, ref]);
}
