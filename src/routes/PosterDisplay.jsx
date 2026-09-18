import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { usePosterStore } from '../stores/posterStore';
import { Loader2, Tv, Wifi, Maximize, Minimize } from 'lucide-react';
import './PosterDisplay.css';

export default function PosterDisplay() {
  const { restaurantId, slideshowId: paramSlideshowId } = useParams();
  const { posters, subscribePosters, loadingPosters } = usePosterStore();

  const [resolvedId, setResolvedId] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [defaultSlideshowId, setDefaultSlideshowId] = useState(null);
  const activeSlideshowId = paramSlideshowId || defaultSlideshowId;
  
  const [slideshowConfig, setSlideshowConfig] = useState({
    name: 'Main Board',
    orientation: 'landscape', // landscape | portrait
    fitMode: 'contain', // contain | cover
    transition: 'kenburns',
    transitionSpeed: 1.2,
    defaultDuration: 6,
    shuffle: false,
    showProgressBar: true,
    showClock: false,
    showTicker: false,
    tickerText: '',
    wifiInfo: { show: false, ssid: '', password: '' },
    showBranding: true,
    backgroundColor: '#000000',
    remoteCommand: null
  });

  const [slideIndex, setSlideIndex] = useState(0);
  const [prevSlideIndex, setPrevSlideIndex] = useState(null);
  const [identifyBanner, setIdentifyBanner] = useState(null); // { name, id }
  const [currentTime, setCurrentTime] = useState({ time: '', date: '' });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const lastProcessedCommandRef = useRef(null);

  // 1. Resolve restaurant slug/customId or doc ID
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
          setRestaurantName(rDoc.data().name || '');
          return;
        }

        const q2 = query(collection(db, 'restaurants'), where('customId', '==', restaurantId));
        const snap2 = await getDocs(q2);
        if (!active) return;
        if (!snap2.empty) {
          const rDoc = snap2.docs[0];
          setResolvedId(rDoc.id);
          setRestaurantName(rDoc.data().name || '');
          return;
        }

        const docSnap = await getDoc(doc(db, 'restaurants', restaurantId));
        if (!active) return;
        if (docSnap.exists()) {
          setResolvedId(restaurantId);
          setRestaurantName(docSnap.data().name || '');
        }
      } catch (err) {
        console.error('Error resolving restaurant in PosterDisplay:', err);
      }
    };

    resolve();
    return () => { active = false; };
  }, [restaurantId]);

  // 2. Resolve default slideshowId if not provided in URL
  useEffect(() => {
    if (!resolvedId || paramSlideshowId) return;

    let active = true;
    const fetchDefaultSlideshow = async () => {
      try {
        const snap = await getDocs(collection(db, 'restaurants', resolvedId, 'slideshows'));
        if (!active) return;
        if (!snap.empty) {
          setDefaultSlideshowId(snap.docs[0].id);
        }
      } catch (err) {
        console.error('Error finding default slideshow:', err);
      }
    };

    fetchDefaultSlideshow();
    return () => { active = false; };
  }, [resolvedId, paramSlideshowId]);

  // 3. Subscribe in real-time to slideshow configurations & live remote commands
  useEffect(() => {
    if (!resolvedId || !activeSlideshowId) return;

    const unsub = onSnapshot(
      doc(db, 'restaurants', resolvedId, 'slideshows', activeSlideshowId),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSlideshowConfig({
            name: data.name || 'Offer Board',
            orientation: data.orientation || 'landscape',
            fitMode: data.fitMode || 'contain',
            transition: data.transition || 'kenburns',
            transitionSpeed: data.transitionSpeed ?? 1.2,
            defaultDuration: Number(data.defaultDuration) || 6,
            shuffle: data.shuffle ?? false,
            showProgressBar: data.showProgressBar ?? true,
            showClock: data.showClock ?? false,
            showTicker: data.showTicker ?? false,
            tickerText: data.tickerText || '',
            wifiInfo: data.wifiInfo || { show: false, ssid: '', password: '' },
            showBranding: data.showBranding ?? true,
            backgroundColor: data.backgroundColor || '#000000',
            remoteCommand: data.remoteCommand || null
          });

          // Handle remote command if fresh (sent in the last 20 seconds)
          const cmd = data.remoteCommand;
          if (cmd && cmd.timestamp && cmd.timestamp !== lastProcessedCommandRef.current) {
            const ageMs = Date.now() - cmd.timestamp;
            if (ageMs < 20000) {
              lastProcessedCommandRef.current = cmd.timestamp;
              if (cmd.action === 'identify') {
                setIdentifyBanner({ name: data.name || 'Screen', id: activeSlideshowId });
                setTimeout(() => setIdentifyBanner(null), 6000);
              } else if (cmd.action === 'reload') {
                window.location.reload();
              }
            }
          }
        }
      },
      (err) => console.error('Error listening to slideshow config:', err)
    );

    return () => unsub();
  }, [resolvedId, activeSlideshowId]);

  // 4. Subscribe to posters of the active screen
  useEffect(() => {
    if (!resolvedId || !activeSlideshowId) return;
    const unsub = subscribePosters(resolvedId, activeSlideshowId);
    return unsub;
  }, [resolvedId, activeSlideshowId, subscribePosters]);

  // 5. Screen Wake Lock API
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
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

  // 6. Live Clock Timer
  useEffect(() => {
    if (!slideshowConfig.showClock) return;

    const updateClock = () => {
      const now = new Date();
      setCurrentTime({
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
      });
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [slideshowConfig.showClock]);

  // 7. Fullscreen Toggle keyboard & double-click listener
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleFullscreen]);

  // Filter active posters
  const activePosters = posters.filter(p => p.isActive);
  const safeSlideIndex = activePosters.length > 0 ? slideIndex % activePosters.length : 0;

  // 8. Slideshow loop with optional shuffle
  useEffect(() => {
    if (activePosters.length <= 1) {
      return;
    }

    const currentPoster = activePosters[safeSlideIndex];
    const duration = (currentPoster?.duration || slideshowConfig.defaultDuration || 6) * 1000;

    const timer = setTimeout(() => {
      setPrevSlideIndex(safeSlideIndex);
      if (slideshowConfig.shuffle && activePosters.length > 2) {
        let nextIdx = safeSlideIndex;
        while (nextIdx === safeSlideIndex) {
          nextIdx = Math.floor(Math.random() * activePosters.length);
        }
        setSlideIndex(nextIdx);
      } else {
        setSlideIndex((prev) => (prev + 1) % activePosters.length);
      }
    }, duration);

    return () => clearTimeout(timer);
  }, [safeSlideIndex, activePosters, slideshowConfig.defaultDuration, slideshowConfig.shuffle]);

  // 9. Clean up prev slide index after transition finishes
  useEffect(() => {
    if (prevSlideIndex !== null) {
      const transSpeedMs = (slideshowConfig.transitionSpeed || 1.2) * 1000 + 300;
      const timer = setTimeout(() => {
        setPrevSlideIndex(null);
      }, transSpeedMs);
      return () => clearTimeout(timer);
    }
  }, [prevSlideIndex, slideshowConfig.transitionSpeed]);

  if (loadingPosters || !resolvedId) {
    return (
      <div className="poster-display-loading">
        <Loader2 size={48} className="animate-spin text-accent" />
        <p>Loading TV Poster Display...</p>
      </div>
    );
  }

  if (activePosters.length === 0) {
    return (
      <div className="poster-display-empty" style={{ backgroundColor: slideshowConfig.backgroundColor }}>
        <div className="empty-box">
          <Tv size={64} style={{ marginBottom: '20px', color: '#38bdf8' }} />
          <h1>{slideshowConfig.name} Active</h1>
          <h2>Screen Channel Connected</h2>
          <p>No active poster slides have been added to this screen yet.</p>
          <p className="caption">Go to DineOS Dashboard → TV Poster Boards to upload poster slides.</p>
        </div>
        {slideshowConfig.showBranding && (
          <div className="branding-overlay">
            🍽️ DineOS {restaurantName && `| ${restaurantName}`}
          </div>
        )}
      </div>
    );
  }

  const currentPoster = activePosters[safeSlideIndex];
  const durationSeconds = currentPoster?.duration || slideshowConfig.defaultDuration || 6;
  const transSpeed = slideshowConfig.transitionSpeed ?? 1.2;

  return (
    <div 
      className={`poster-display-container orientation-${slideshowConfig.orientation || 'landscape'}`}
      style={{ 
        backgroundColor: slideshowConfig.backgroundColor || '#000000',
        '--trans-duration': `${transSpeed}s`
      }}
      onDoubleClick={toggleFullscreen}
    >
      {/* Remote TV Identification Banner */}
      {identifyBanner && (
        <div className="tv-identify-banner">
          <div className="tv-identify-content">
            <Tv size={48} className="tv-identify-icon" />
            <div>
              <div className="tv-identify-tag">LIVE SCREEN IDENTIFICATION</div>
              <div className="tv-identify-title">{identifyBanner.name}</div>
              <div className="tv-identify-id">Channel ID: {identifyBanner.id}</div>
            </div>
          </div>
        </div>
      )}

      {/* Top Left: Wi-Fi Pill Overlay */}
      {slideshowConfig.wifiInfo?.show && slideshowConfig.wifiInfo?.ssid && (
        <div className="tv-wifi-overlay">
          <Wifi size={18} style={{ color: '#38bdf8' }} />
          <span>Wi-Fi: <strong>{slideshowConfig.wifiInfo.ssid}</strong></span>
          {slideshowConfig.wifiInfo.password && (
            <span className="tv-wifi-pass">Pass: <strong>{slideshowConfig.wifiInfo.password}</strong></span>
          )}
        </div>
      )}

      {/* Top Right: Live Clock Overlay */}
      {slideshowConfig.showClock && currentTime.time && (
        <div className="tv-clock-overlay">
          <div className="tv-clock-time">{currentTime.time}</div>
          <div className="tv-clock-date">{currentTime.date}</div>
        </div>
      )}

      {/* Poster Slides Container */}
      {activePosters.map((poster, index) => {
        const isActive = index === safeSlideIndex;
        const isExiting = index === prevSlideIndex;

        if (!isActive && !isExiting) return null;

        let slideClass = 'poster-slide';
        if (isActive) slideClass += ' active';
        if (isExiting) slideClass += ' exiting';

        slideClass += ` trans-${slideshowConfig.transition || 'kenburns'}`;

        return (
          <div key={poster.id} className={slideClass}>
            <img 
              src={poster.imageUrl} 
              alt={poster.title || 'Slide'} 
              className={`poster-img fit-${slideshowConfig.fitMode || 'contain'}`}
            />
          </div>
        );
      })}

      {/* Bottom Running Announcement Ticker */}
      {slideshowConfig.showTicker && slideshowConfig.tickerText && (
        <div className="tv-ticker-bar">
          <div className="tv-ticker-badge">UPDATES</div>
          <div className="tv-ticker-track">
            <div className="tv-ticker-text">{slideshowConfig.tickerText}</div>
            <div className="tv-ticker-text" aria-hidden="true">{slideshowConfig.tickerText}</div>
          </div>
        </div>
      )}

      {/* Progress Bar (hidden if single poster or disabled) */}
      {slideshowConfig.showProgressBar !== false && activePosters.length > 1 && (
        <div 
          key={safeSlideIndex} 
          className="poster-progress"
          style={{ 
            animationDuration: `${durationSeconds}s`,
            bottom: slideshowConfig.showTicker ? '44px' : '0px'
          }}
        />
      )}

      {/* Branding Overlay (optional) */}
      {slideshowConfig.showBranding && (
        <div 
          className="branding-overlay"
          style={{ bottom: slideshowConfig.showTicker ? '58px' : '24px' }}
        >
          🍽️ DineOS {restaurantName && `| ${restaurantName}`}
        </div>
      )}

      {/* Floating Fullscreen Trigger Button (fades on idle) */}
      <button 
        type="button"
        className="tv-fullscreen-btn"
        onClick={toggleFullscreen}
        title="Toggle Fullscreen (or press F)"
      >
        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
      </button>
    </div>
  );
}
