// Native Web Audio Synthesizer for Kitchen & Service Notifications
// Works 100% offline, zero external audio asset dependency, zero CORS issues.

export const TONE_PRESETS = [
  { id: 'loud-siren',     name: '🚨 Loud Kitchen Alarm (High Decibel)', desc: 'Penetrating high-decibel alert chime for busy, noisy kitchens' },
  { id: 'kitchen-bell',   name: '🍳 Kitchen Pass Bell (Heavy Brass)', desc: 'Resonant order-up bell with strong acoustic harmonics' },
  { id: 'alert',          name: '⚡ High-Priority Chime (Dual Burst)', desc: 'Energetic dual-frequency rapid repeating alert' },
  { id: 'reception-bell', name: '🔔 Reception Bell', desc: 'Crisp brass hotel counter chime' },
  { id: 'two-tone',       name: '🎵 Two-Tone Chime', desc: 'Mellow dining room chime' },
];

// Singleton AudioContext — browsers allow ~6 concurrent contexts; reusing one avoids silent failures
let _audioCtx = null;
function getAudioContext() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!_audioCtx) {
    _audioCtx = new AudioContext();
  }
  if (_audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

// Automatically unlock AudioContext on first user interaction to comply with mobile browser autoplay policies
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {}
  };
  ['pointerdown', 'touchstart', 'click', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlockAudio, { capture: true, passive: true, once: true });
  });
}

export function playNotificationTone(toneType = 'loud-siren', volume = 1.0) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Master volume gain clamped between 0.1 and 1.0
    const masterGain = ctx.createGain();
    const effectiveVolume = Math.min(1.0, Math.max(0.1, Number(volume) || 1.0));
    masterGain.gain.setValueAtTime(effectiveVolume, now);

    // Dynamic range compressor/limiter: prevents digital clipping while boosting perceived loudness
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6, now);
    compressor.knee.setValueAtTime(10, now);
    compressor.ratio.setValueAtTime(8, now);
    compressor.attack.setValueAtTime(0.003, now);
    compressor.release.setValueAtTime(0.2, now);

    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    if (toneType === 'loud-siren') {
      // 🚨 High-Decibel Kitchen Alert: 3 alternating dual-frequency pulses (987 Hz & 1318 Hz)
      // Triangle + Sine waves for maximum psychoacoustic presence in noisy kitchens
      const pulses = [0, 0.22, 0.44];
      pulses.forEach((offset, idx) => {
        const tStart = now + offset;
        const freq1 = idx % 2 === 0 ? 987.77 : 1318.51; // B5 or E6
        const freq2 = freq1 * 1.5; // Harmonic 5th overtone

        // Primary fundamental
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle'; // triangle cuts through background rumble
        osc1.frequency.setValueAtTime(freq1, tStart);
        gain1.gain.setValueAtTime(0.85, tStart);
        gain1.gain.exponentialRampToValueAtTime(0.001, tStart + 0.18);
        osc1.connect(gain1);
        gain1.connect(masterGain);
        osc1.start(tStart);
        osc1.stop(tStart + 0.18);

        // Overtone for crisp cut-through
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(freq2, tStart);
        gain2.gain.setValueAtTime(0.55, tStart);
        gain2.gain.exponentialRampToValueAtTime(0.001, tStart + 0.18);
        osc2.connect(gain2);
        gain2.connect(masterGain);
        osc2.start(tStart);
        osc2.stop(tStart + 0.18);
      });
    } else if (toneType === 'alert') {
      // ⚡ High-Priority Chime: 2 fast bursts of 4-note ascending arpeggio (880, 1100, 1320, 1540 Hz)
      [0, 0.28].forEach(burstOffset => {
        [0, 0.05, 0.10, 0.15].forEach((offset, idx) => {
          const tStart = now + burstOffset + offset;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(880 + idx * 220, tStart);
          gain.gain.setValueAtTime(0.8, tStart);
          gain.gain.exponentialRampToValueAtTime(0.001, tStart + 0.12);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(tStart);
          osc.stop(tStart + 0.12);
        });
      });
    } else if (toneType === 'kitchen-bell') {
      // 🍳 Heavy Brass Order-Up Pass Bell: D6 (1174 Hz) + D7 (2349 Hz) + F#7 (2960 Hz)
      const baseFreq = 1174.66;
      [1, 2, 2.52].forEach((ratio, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(baseFreq * ratio, now);
        const initialGain = 0.85 / (idx * 0.7 + 1);
        gain.gain.setValueAtTime(initialGain, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + (0.9 / (idx * 0.3 + 1)));
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 1.0);
      });
    } else if (toneType === 'two-tone') {
      // 🎵 Two-Tone Chime: E5 (659 Hz) and G#5 (830 Hz) with boosted gain
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.75, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(830.61, now + 0.15);
      gain2.gain.setValueAtTime(0.85, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.65);
    } else {
      // 🔔 Default: reception-bell (Harmonic rich brass bell, boosted gain)
      const baseFreq = 880;
      [1, 2.76, 5.4].forEach((ratio, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * ratio, now);
        const initialGain = 0.8 / (idx * 0.8 + 1);
        gain.gain.setValueAtTime(initialGain, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + (0.9 / (idx * 0.5 + 1)));
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 1.0);
      });
    }
  } catch (err) {
    console.warn('Web Audio notification failed or was blocked by browser autoplay policy:', err);
  }
}

export function vibrateDevice(pattern = [200, 100, 200]) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore unsupported browser environments
  }
}

/**
 * hapticTap - Subtle, low-latency tactile feedback for native app-like interactions
 * @param {'light'|'medium'|'heavy'|'success'} strength 
 */
export function hapticTap(strength = 'light') {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (strength === 'light') navigator.vibrate(10);
      else if (strength === 'medium') navigator.vibrate(22);
      else if (strength === 'heavy') navigator.vibrate(40);
      else if (strength === 'success') navigator.vibrate([15, 60, 30]);
    }
  } catch {
    // Unsupported / blocked
  }
}

