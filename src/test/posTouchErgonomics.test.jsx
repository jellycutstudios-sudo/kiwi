import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('POS Touch Ergonomics & Speed Screen System', () => {
  const posJsxPath = path.resolve(__dirname, '../routes/POS.jsx');
  const posJsx = fs.readFileSync(posJsxPath, 'utf-8');

  const cssPath = path.resolve(__dirname, '../index.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  it('renders all menu categories in a direct scrollable bar in POS.jsx', () => {
    // Both Template 1 & 2 now use pos-category-scroll with categories.map
    expect(posJsx).toContain('className="pos-category-scroll"');
    expect(posJsx).toContain('categories.map((c, idx) =>');
    expect(posJsx).toContain('getCategoryChromaticColors(c, idx)');
  });

  it('includes in-card steppers on Fast Keys and Visual Cards for 1-tap quantity adjustments', () => {
    expect(posJsx).toContain('className="pos-card-stepper"');
    expect(posJsx).toContain('handleDecreaseItem(item)');
    expect(posJsx).toContain('handleIncreaseItem(item)');
  });

  it('assigns chromatic category accent stripes to Fast Key cards', () => {
    expect(posJsx).toContain("style={{ '--key-cat-stripe': catColors.stripe }}");
    expect(css).toContain('border-left: 4px solid var(--key-cat-stripe, #3b82f6) !important');
  });

  it('provides generous bottom clearance on scrollable menu grids without shrinking the wrapper', () => {
    expect(css).toMatch(/\.menu-grid,\s*\n?\s*\.menu-grid\.dense\s*\{[^}]*padding-bottom:\s*84px !important;/);
  });

  it('styles tactile in-card stepper buttons with high-contrast emerald and white', () => {
    const stepperMatch = css.match(/\.pos-card-stepper\s*\{([^}]+)\}/);
    expect(stepperMatch).not.toBeNull();
    expect(stepperMatch[1]).toContain('background: #10b981');
    expect(stepperMatch[1]).toContain('border-radius: 20px');

    const stepperBtnMatch = css.match(/\.pos-card-stepper-btn\s*\{([^}]+)\}/);
    expect(stepperBtnMatch).not.toBeNull();
    expect(stepperBtnMatch[1]).toContain('border-radius: 50%');
  });
});
