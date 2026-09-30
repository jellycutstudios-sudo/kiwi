import confetti from 'canvas-confetti';
import toast from 'react-hot-toast';

const CHEER_MESSAGES = [
  "New day, fresh opportunities! You're going to rock this shift! ✨",
  "Take a deep breath and smile — you've got this! Wishing you happy guests and smooth orders! 🌟",
  "Every great meal starts with a passionate team. Have a wonderful and smooth day! 🥐",
  "No matter how busy the rush gets today, you're doing fantastic work. Let's make today great! ☕",
  "Sending uplifting energy your way for a stress-free, high-energy shift! 🎉",
  "May your tickets be clear, your kitchen fast, and your tips generous today! 🍽️"
];

/**
 * Fires a joyful multi-stage confetti shower across the screen.
 */
export function fireConfettiShower() {
  if (typeof window === 'undefined') return;

  try {
    // 1. Center initial burst
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#fbbf24']
    });

    // 2. Left side cannon
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        colors: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899']
      });
    }, 200);

    // 3. Right side cannon
    setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        colors: ['#8b5cf6', '#10b981', '#fbbf24', '#f43f5e']
      });
    }, 400);
  } catch (err) {
    console.warn('Confetti animation failed:', err);
  }
}

/**
 * Checks if morning cheer should be shown today, and triggers it once per day.
 * @param {Object} options
 * @param {string} [options.staffName] - Optional name of the logged in user
 * @param {boolean} [options.force] - Force trigger regardless of time or storage
 */
export function triggerMorningCheer({ staffName = '', force = false } = {}) {
  if (typeof window === 'undefined') return;

  const now = new Date();
  const currentHour = now.getHours();
  const todayKey = now.toISOString().slice(0, 10);
  const storageKey = `dineOS_morning_cheer_${todayKey}`;

  // Only trigger once per day, and during morning/opening hours (4 AM - 1 PM) unless forced
  let alreadyShown = false;
  try {
    alreadyShown = typeof localStorage !== 'undefined' && localStorage.getItem(storageKey);
  } catch {}

  const isMorning = currentHour >= 4 && currentHour < 13;

  if (!force && (alreadyShown || !isMorning)) {
    return;
  }

  // Mark as triggered for today
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, 'true');
    }
  } catch {}

  // Trigger celebratory confetti
  fireConfettiShower();

  // Pick an uplifting cheer message
  const randomMsg = CHEER_MESSAGES[Math.floor(Math.random() * CHEER_MESSAGES.length)];
  const greeting = currentHour < 12 ? 'Good morning' : (currentHour < 17 ? 'Good afternoon' : 'Welcome');
  const nameGreeting = staffName ? `${greeting}, ${staffName.split(' ')[0]}!` : `${greeting}!`;

  // Display warm, uplifting cheer toast
  toast((t) => (
    <div 
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '2px 0',
        minWidth: '280px',
        maxWidth: '380px'
      }}
      onClick={() => toast.dismiss(t.id)}
    >
      <span style={{ fontSize: '26px', lineHeight: 1, flexShrink: 0, marginTop: 2 }}>☀️</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--color-label)' }}>
          {nameGreeting}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-label-secondary)', lineHeight: 1.4 }}>
          {randomMsg}
        </div>
      </div>
    </div>
  ), {
    duration: 7000,
    style: {
      borderRadius: 'var(--radius-lg, 12px)',
      background: 'var(--color-bg-elevated, #ffffff)',
      border: '1px solid rgba(245, 158, 11, 0.4)',
      boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
      color: 'var(--color-label, #000000)'
    }
  });
}
