import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTokenStore } from '../stores/tokenStore';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';

export default function TokenDisplay() {
  const { restaurantId } = useParams();
  const { currentServing, latestIssued, queue, subscribe, lastCalledAt } = useTokenStore();
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [resolvedId, setResolvedId] = useState(null);
  const [flashToken, setFlashToken] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [primaryLanguage, setPrimaryLanguage] = useState('en');
  
  const lastEnqueuedRef = useRef(null);
  const isPlayingRef = useRef(false);
  const audioQueueRef = useRef([]);
  const langRef = useRef('en');

  // Resolve restaurant slug/customId to actual document ID
  useEffect(() => {
    if (!restaurantId) return;
    let active = true;

    const resolve = async () => {
      try {
        const q1 = query(collection(db, 'restaurants'), where('slug', '==', restaurantId));
        const snap1 = await getDocs(q1);
        if (!active) return;
        if (!snap1.empty) {
          const rDoc = snap1.docs[0];
          setResolvedId(rDoc.id);
          setPrimaryLanguage(rDoc.data().primaryLanguage || 'en');
          langRef.current = rDoc.data().primaryLanguage || 'en';
          return;
        }

        const q2 = query(collection(db, 'restaurants'), where('customId', '==', restaurantId));
        const snap2 = await getDocs(q2);
        if (!active) return;
        if (!snap2.empty) {
          const rDoc = snap2.docs[0];
          setResolvedId(rDoc.id);
          setPrimaryLanguage(rDoc.data().primaryLanguage || 'en');
          langRef.current = rDoc.data().primaryLanguage || 'en';
          return;
        }

        const docSnap = await getDoc(doc(db, 'restaurants', restaurantId));
        if (!active) return;
        if (docSnap.exists()) {
          setResolvedId(restaurantId);
          setPrimaryLanguage(docSnap.data().primaryLanguage || 'en');
          langRef.current = docSnap.data().primaryLanguage || 'en';
        }
      } catch (err) {
        console.error("Error resolving restaurant ID in TokenDisplay:", err);
      }
    };

    resolve();
    return () => { active = false; };
  }, [restaurantId]);

  // Subscribe using resolved Firestore ID
  useEffect(() => {
    if (!resolvedId) return;
    const unsub = subscribe(resolvedId);
    return unsub;
  }, [resolvedId, subscribe]);

  // Screen Wake Lock API
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.warn("Wake Lock failed:", err);
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };

    requestWakeLock();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock !== null) {
        wakeLock.release().catch(() => {});
      }
    };
  }, []);

  const processAudioQueue = () => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }
    
    isPlayingRef.current = true;
    const tokenToCall = audioQueueRef.current.shift();
    
    // Trigger visual flash
    setFlashToken(true);
    setTimeout(() => setFlashToken(false), 3000);

    // 1. Play chime
    try {
      const chime = new Audio('/sounds/order-chime.wav');
      chime.play().catch(e => console.log('Chime playback blocked:', e));
      
      // 2. Wait 800ms before TTS
      setTimeout(() => {
        if (!voiceEnabled) {
          processAudioQueue();
          return;
        }

        const utteranceEn = new SpeechSynthesisUtterance(`Token number ${tokenToCall}`);
        utteranceEn.lang = 'en-US';
        utteranceEn.rate = 0.9;

        if (langRef.current === 'ar') {
          const utteranceAr = new SpeechSynthesisUtterance(`الرقم ${tokenToCall}`);
          utteranceAr.lang = 'ar-SA';
          utteranceAr.rate = 0.85;

          utteranceAr.onend = () => processAudioQueue();
          utteranceAr.onerror = () => processAudioQueue();

          window.speechSynthesis.speak(utteranceEn);
          window.speechSynthesis.speak(utteranceAr);
        } else {
          utteranceEn.onend = () => processAudioQueue();
          utteranceEn.onerror = () => processAudioQueue();
          window.speechSynthesis.speak(utteranceEn);
        }
      }, 800);
    } catch (err) {
      console.warn("Audio queue error:", err);
      processAudioQueue();
    }
  };

  // Enqueue new calls when currentServing or lastCalledAt changes
  useEffect(() => {
    if (currentServing > 0 && lastCalledAt) {
      if (lastEnqueuedRef.current !== lastCalledAt) {
        audioQueueRef.current.push(currentServing);
        lastEnqueuedRef.current = lastCalledAt;
        if (!isPlayingRef.current) {
          processAudioQueue();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentServing, lastCalledAt, voiceEnabled]);

  const enableVoice = () => {
    if (voiceEnabled) return;
    setVoiceEnabled(true);
    try {
      const utterance = new SpeechSynthesisUtterance("Voice enabled");
      utterance.volume = 0;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis unlock failed:", e);
    }
  };

  const recentHistory = [];
  if (currentServing > 0) {
    for (let i = 1; i <= 3; i++) {
      if (currentServing - i > 0) {
        recentHistory.push(currentServing - i);
      }
    }
  }

  const isLight = theme === 'light';
  const themeColors = {
    bg: isLight ? '#f9fafb' : 'var(--color-surface-dark)',
    brand: isLight ? '#6b7280' : 'var(--color-on-dark-soft)',
    textPrimary: isLight ? '#111827' : 'var(--color-on-dark)',
    textSecondary: isLight ? '#4b5563' : 'rgba(255,255,255,0.7)',
    textTertiary: isLight ? '#9ca3af' : 'rgba(255,255,255,0.4)',
    boxBg: isLight ? '#ffffff' : 'rgba(255,255,255,0.05)',
    boxBorder: isLight ? '#e5e7eb' : 'rgba(255,255,255,0.1)',
  };

  return (
    <div 
      className="token-display-page" 
      onClick={enableVoice}
      style={{ 
        cursor: voiceEnabled ? 'default' : 'pointer',
        background: themeColors.bg,
        transition: 'background 0.3s ease'
      }}
    >
      {/* Theme Toggle Button */}
      <button 
        onClick={(e) => { e.stopPropagation(); setTheme(isLight ? 'dark' : 'light'); }}
        style={{
          position: 'fixed',
          top: 'var(--space-6)',
          right: 'var(--space-6)',
          zIndex: 200,
          background: themeColors.boxBg,
          border: `1px solid ${themeColors.boxBorder}`,
          color: themeColors.textPrimary,
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          fontWeight: 600,
          boxShadow: 'var(--shadow-sm)'
        }}
      >
        {isLight ? '🌙 Dark Mode' : '☀️ Light Mode'}
      </button>

      {!voiceEnabled ? (
        <div className="voice-unlock-banner">
          📢 Click anywhere to enable voice calls
        </div>
      ) : (
        <div className="voice-active-banner">
          📢 Voice Calls Active
        </div>
      )}

      <div className="token-display-brand" style={{ color: themeColors.brand }}>🍽️ DineOS</div>

      <div style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        maxWidth: 1400,
        margin: '0 auto',
        paddingTop: 'var(--space-8)',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: '8vw'
      }}>
        {/* Left Side: Recent History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', opacity: isLight ? 1 : 0.6, paddingTop: 'var(--space-12)' }}>
          {recentHistory.length > 0 && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', color: themeColors.textSecondary, textTransform: 'uppercase' }}>Recently Called</div>
                {primaryLanguage === 'ar' && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: themeColors.textTertiary, marginTop: 4 }}>تم الاتصال به مؤخرًا</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {recentHistory.map(t => (
                  <div key={t} style={{ 
                    fontSize: 32, fontWeight: 700, textAlign: 'center', 
                    background: themeColors.boxBg, 
                    border: isLight ? `1px solid ${themeColors.boxBorder}` : 'none',
                    color: themeColors.textPrimary,
                    padding: '12px 24px', borderRadius: 'var(--radius-md)' 
                  }}>
                    {String(t).padStart(3, '0')}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Center: Now Serving */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: 600 }}>
          <div className="token-now-serving">
            <div className="token-label-container" style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '0.15em', color: themeColors.textPrimary, textTransform: 'uppercase' }}>Now Serving</div>
              {primaryLanguage === 'ar' && (
                <div style={{ fontSize: 24, fontWeight: 700, color: themeColors.textSecondary, marginTop: 8 }}>نخدم الآن</div>
              )}
            </div>
            
            <div className={`token-number ${flashToken ? 'flash-animate' : ''}`}>
              {currentServing ? String(currentServing).padStart(3, '0') : '---'}
            </div>
            
            {currentServing > 0 && (
              <div className={`collect-order-text ${flashToken ? 'flash-text' : ''}`} style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-brand-peach)' }}>Please collect your order</div>
                {primaryLanguage === 'ar' && (
                  <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-brand-peach)', opacity: 0.8, marginTop: 4 }}>يرجى استلام طلبك</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Up Next */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', opacity: isLight ? 1 : 0.8, paddingTop: 'var(--space-12)' }}>
          {queue.length > 0 && (
            <>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '0.15em', color: themeColors.textPrimary, textTransform: 'uppercase' }}>Up Next</div>
                {primaryLanguage === 'ar' && (
                  <div style={{ fontSize: 14, fontWeight: 600, color: themeColors.textSecondary, marginTop: 4 }}>التالي</div>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {queue.slice(0, 5).map(t => (
                  <div key={t} style={{ 
                    fontSize: 40, fontWeight: 700, textAlign: 'center', 
                    border: `1px solid ${themeColors.boxBorder}`, 
                    background: isLight ? themeColors.boxBg : 'transparent',
                    color: themeColors.textPrimary,
                    padding: '12px 32px', borderRadius: 'var(--radius-md)' 
                  }}>
                    {String(t).padStart(3, '0')}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{
        position: 'fixed',
        bottom: 'var(--space-6)',
        display: 'flex',
        gap: 'var(--space-8)',
        color: themeColors.textTertiary,
        fontSize: 14,
      }}>
        <div>Issued: <strong style={{ color: themeColors.textSecondary }}>{latestIssued ?? 0}</strong></div>
        <div>Waiting: <strong style={{ color: themeColors.textSecondary }}>{Math.max(0, (latestIssued ?? 0) - (currentServing ?? 0))}</strong></div>
      </div>

      {/* Live pulse indicator */}
      <div style={{
        position: 'fixed',
        bottom: 'var(--space-6)',
        right: 'var(--space-6)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        color: themeColors.textTertiary,
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
  );
}
