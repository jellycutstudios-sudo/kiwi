import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { usePosterStore } from '../stores/posterStore';
import { Loader2, Tv } from 'lucide-react';
import './PosterDisplay.css';

export default function PosterDisplay() {
  const { restaurantId, slideshowId } = useParams();
  const { posters, subscribePosters, loadingPosters } = usePosterStore();

  const [resolvedId, setResolvedId] = useState(null);
  const [restaurantName, setRestaurantName] = useState('');
  const [slideshowConfig, setSlideshowConfig] = useState({
    name: 'Offer Board',
    transition: 'kenburns',
    defaultDuration: 6
  });

  const [slideIndex, setSlideIndex] = useState(0);
  const [prevSlideIndex, setPrevSlideIndex] = useState(null);

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
        console.error("Error resolving restaurant in PosterDisplay:", err);
      }
    };

    resolve();
    return () => { active = false; };
  }, [restaurantId]);

  // 2. Fetch slideshow configurations
  useEffect(() => {
    if (!resolvedId || !slideshowId) return;
    let active = true;

    const fetchConfig = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'restaurants', resolvedId, 'slideshows', slideshowId));
        if (active && docSnap.exists()) {
          setSlideshowConfig({
            name: docSnap.data().name || 'Offer Board',
            transition: docSnap.data().transition || 'kenburns',
            defaultDuration: Number(docSnap.data().defaultDuration) || 6
          });
        }
      } catch (err) {
        console.error("Error fetching slideshow config:", err);
      }
    };

    fetchConfig();
    return () => { active = false; };
  }, [resolvedId, slideshowId]);

  // 3. Subscribe to posters
  useEffect(() => {
    if (!resolvedId || !slideshowId) return;
    const unsub = subscribePosters(resolvedId, slideshowId);
    return unsub;
  }, [resolvedId, slideshowId, subscribePosters]);

  // 4. Screen Wake Lock API
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch (err) {
        console.warn("Wake Lock failed in PosterDisplay:", err);
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

  // Filter active posters
  const activePosters = posters.filter(p => p.isActive);

  // 5. Slideshow timer loop
  useEffect(() => {
    if (activePosters.length <= 1) {
      setSlideIndex(0);
      setPrevSlideIndex(null);
      return;
    }

    const currentPoster = activePosters[slideIndex];
    const duration = (currentPoster?.duration || slideshowConfig.defaultDuration || 6) * 1000;

    const timer = setTimeout(() => {
      setPrevSlideIndex(slideIndex);
      setSlideIndex((prev) => (prev + 1) % activePosters.length);
    }, duration);

    return () => clearTimeout(timer);
  }, [slideIndex, activePosters, slideshowConfig.defaultDuration]);

  // 6. Clean up prev slide index after transition finishes (e.g. 1.5s)
  useEffect(() => {
    if (prevSlideIndex !== null) {
      const timer = setTimeout(() => {
        setPrevSlideIndex(null);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [prevSlideIndex]);

  if (loadingPosters || !resolvedId) {
    return (
      <div className="poster-display-loading">
        <Loader2 size={48} className="animate-spin text-accent" />
        <p>Loading TV Board...</p>
      </div>
    );
  }

  if (activePosters.length === 0) {
    return (
      <div className="poster-display-empty">
        <div className="empty-box">
          <Tv size={64} style={{ marginBottom: '20px', color: '#475569' }} />
          <h1>TV Screen Active</h1>
          <h2>Channel: {slideshowConfig.name}</h2>
          <p>There are no active posters uploaded to this channel yet.</p>
          <p className="caption">Go to Admin Dashboard → TV Poster Boards to upload poster slides.</p>
        </div>
        <div className="branding-overlay">
          🍽️ DineOS {restaurantName && `| ${restaurantName}`}
        </div>
      </div>
    );
  }

  const currentPoster = activePosters[slideIndex];
  const durationSeconds = currentPoster?.duration || slideshowConfig.defaultDuration || 6;

  return (
    <div className="poster-display-container">
      {/* Slides container */}
      {activePosters.map((poster, index) => {
        const isActive = index === slideIndex;
        const isExiting = index === prevSlideIndex;

        if (!isActive && !isExiting) return null;

        let slideClass = 'poster-slide';
        if (isActive) slideClass += ' active';
        if (isExiting) slideClass += ' exiting';

        // Append transition style modifier
        slideClass += ` trans-${slideshowConfig.transition}`;

        return (
          <div key={poster.id} className={slideClass}>
            <img 
              src={poster.imageUrl} 
              alt={poster.title} 
              className="poster-img"
            />
          </div>
        );
      })}

      {/* Progress Bar */}
      <div 
        key={slideIndex} 
        className="poster-progress"
        style={{ animationDuration: `${durationSeconds}s` }}
      />

      {/* Branding Badge overlay */}
      <div className="branding-overlay">
        🍽️ DineOS {restaurantName && `| ${restaurantName}`}
      </div>
    </div>
  );
}
