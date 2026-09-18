// Native Web Audio Synthesizer for Kitchen & Service Notifications
// Works 100% offline, zero external audio asset dependency, zero CORS issues.

export const TONE_PRESETS = [
  { id: 'reception-bell', name: '🔔 Reception Bell', desc: 'Crisp brass hotel bell chime' },
  { id: 'two-tone',       name: '🎵 Two-Tone Chime', desc: 'Mellow modern dining room chime' },
  { id: 'alert',          name: '⚡ High-Priority Chime', desc: 'Energetic dual-frequency alert' },
  { id: 'kitchen-bell',   name: '🍳 Kitchen Pass Bell', desc: 'Classic order-up bell chime' },
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

export function playNotificationTone(toneType = 'reception-bell', volume = 0.5) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.min(1, Math.max(0.05, volume)), now);
    masterGain.connect(ctx.destination);

    if (toneType === 'two-tone') {
      // Note 1: E5 (659.25 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.3, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(masterGain);
      osc1.start(now);
      osc1.stop(now + 0.35);

      // Note 2: G#5 (830.61 Hz)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(830.61, now + 0.15);
      gain2.gain.setValueAtTime(0.35, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(masterGain);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.65);
    } else if (toneType === 'alert') {
      // Triple urgent ping
      [0, 0.1, 0.2].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880 + idx * 220, now + offset);
        gain.gain.setValueAtTime(0.28, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.18);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + offset);
        osc.stop(now + offset + 0.18);
      });
    } else if (toneType === 'kitchen-bell') {
      // Order-up pass bell
      const fundamental = 1174.66; // D6
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(fundamental, now);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.8);
    } else {
      // Default: reception-bell (Harmonic rich brass bell)
      const baseFreq = 880; // A5
      [1, 2.76, 5.4].forEach((ratio, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(baseFreq * ratio, now);
        const initialGain = 0.35 / (idx + 1);
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
