// Generate a simple notification beep WAV file
// Run: node generate-chime.js  (outputs public/sounds/order-chime.wav)
const fs = require('fs');
const path = require('path');

function generateBeepWav(frequency = 880, durationMs = 200, sampleRate = 44100, amplitude = 0.4) {
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = numSamples * blockAlign;
  const fileSize = 44 + dataSize;

  const buf = Buffer.alloc(fileSize);
  let offset = 0;

  // RIFF header
  buf.write('RIFF', offset); offset += 4;
  buf.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buf.write('WAVE', offset); offset += 4;
  // fmt chunk
  buf.write('fmt ', offset); offset += 4;
  buf.writeUInt32LE(16, offset); offset += 4;       // chunk size
  buf.writeUInt16LE(1, offset); offset += 2;         // PCM
  buf.writeUInt16LE(numChannels, offset); offset += 2;
  buf.writeUInt32LE(sampleRate, offset); offset += 4;
  buf.writeUInt32LE(byteRate, offset); offset += 4;
  buf.writeUInt16LE(blockAlign, offset); offset += 2;
  buf.writeUInt16LE(bitsPerSample, offset); offset += 2;
  // data chunk
  buf.write('data', offset); offset += 4;
  buf.writeUInt32LE(dataSize, offset); offset += 4;

  // Generate sine wave with a fast attack and decay
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t * 40) * Math.max(0, 1 - t * (1000 / durationMs) * 0.7);
    const sample = Math.sin(2 * Math.PI * frequency * t) * amplitude * envelope;
    const intSample = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)));
    buf.writeInt16LE(intSample, offset); offset += 2;
  }

  return buf;
}

const outPath = path.join(__dirname, 'public', 'sounds', 'order-chime.wav');
const wavData = generateBeepWav(880, 250, 44100, 0.35);
fs.writeFileSync(outPath, wavData);
console.log(`Generated: ${outPath} (${wavData.length} bytes)`);
