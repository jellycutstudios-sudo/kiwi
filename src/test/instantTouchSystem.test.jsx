import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Zero-Latency Instant Touch & Click System', () => {
  const indexCss = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
  const posJsx = fs.readFileSync(path.resolve(__dirname, '../routes/POS.jsx'), 'utf-8');

  it('verifies 0ms instant tactile depression on active button touch-down', () => {
    // 0ms transition duration on :active for instant tactile bite
    expect(indexCss).toContain('ZERO-LATENCY INSTANT TOUCH SYSTEM (0ms POS Feedback)');
    expect(indexCss).toContain('transition-duration: 0ms !important;');
    expect(indexCss).toContain('transition-delay: 0ms !important;');
    expect(indexCss).toMatch(/button:active:not\(:disabled\)[\s\S]*?transform:\s*scale\(0\.965\)/);
  });

  it('verifies touch-action manipulation across all interactive controls', () => {
    expect(indexCss).toContain('touch-action: manipulation !important;');
    expect(indexCss).toContain('-webkit-tap-highlight-color: transparent');
    expect(indexCss).toContain('.menu-key-card');
    expect(indexCss).toContain('.tm-card');
    expect(indexCss).toContain('.cart-stepper-btn');
    expect(indexCss).toContain('.pos-op-card');
  });

  it('verifies no artificial setTimeout delay when opening customer modal in delivery mode', () => {
    expect(posJsx).toContain('if (newType === \'delivery\' && !customerPhone && !customer?.address) {');
    expect(posJsx).toContain('setShowCustomerModal(true);');
    expect(posJsx).not.toContain('setTimeout(() => setShowCustomerModal(true), 120);');
  });
});
