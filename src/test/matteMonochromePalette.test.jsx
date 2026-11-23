import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Matte Monochrome Palette System', () => {
  const cssPath = path.resolve(__dirname, '../index.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  it('sets dark mode active category chip to matte white background with jet black text', () => {
    // [data-theme="dark"] .category-chip.active
    const darkCategoryMatch = css.match(/\[data-theme="dark"\]\s+\.category-chip\.active\s*\{([^}]+)\}/);
    expect(darkCategoryMatch).not.toBeNull();
    const rules = darkCategoryMatch[1];
    expect(rules).toContain('background: #ffffff !important');
    expect(rules).toContain('color: #09090b !important');
  });

  it('sets dark mode active category count badge to dark background with white text', () => {
    const darkCategoryCountMatch = css.match(/\[data-theme="dark"\]\s+\.category-chip\.active\s+\.category-chip-count\s*\{([^}]+)\}/);
    expect(darkCategoryCountMatch).not.toBeNull();
    const rules = darkCategoryCountMatch[1];
    expect(rules).toContain('background: #09090b !important');
    expect(rules).toContain('color: #ffffff !important');
  });

  it('sets light mode active category chip to deep slate monochrome', () => {
    const lightCategoryMatch = css.match(/\[data-theme="light"\]\s+\.pos-menu-panel\.categories-left\s+\.category-chip\.active\s*\{([^}]+)\}/);
    expect(lightCategoryMatch).not.toBeNull();
    const rules = lightCategoryMatch[1];
    expect(rules).toContain('background: #0f172a !important');
    expect(rules).toContain('color: #ffffff !important');
  });

  it('sets dark mode menu item prices to neutral crisp white instead of neon green', () => {
    const mainRule = css.match(/\[data-theme="dark"\]\s+\.menu-item-price\s*\{\s*color:\s*([^;]+);/);
    expect(mainRule).not.toBeNull();
    expect(mainRule[1]).toContain('#f8fafc');
    expect(css).not.toMatch(/\[data-theme="dark"\]\s+\.menu-item-price\s*\{[^}]*#34d399/);
    expect(css).not.toMatch(/\[data-theme="dark"\]\s+\.menu-item-price\s*\{[^}]*#10b981/);
  });

  it('sets dark mode cart item prices to neutral crisp white instead of neon green', () => {
    const darkCartPriceMatch = css.match(/\[data-theme="dark"\]\s+\.cart-item-card-price\s*\{([^}]+)\}/);
    expect(darkCartPriceMatch).not.toBeNull();
    const rules = darkCartPriceMatch[1];
    expect(rules).toContain('color: #f8fafc !important');
    expect(rules).not.toContain('#34d399');
  });

  it('sets dark mode cart split and comp buttons to neutral matte pills', () => {
    const darkSplitMatch = css.match(/\[data-theme="dark"\]\s+#pos-split-check-btn\s*\{([^}]+)\}/);
    expect(darkSplitMatch).not.toBeNull();
    const splitRules = darkSplitMatch[1];
    expect(splitRules).toContain('background: #1e293b !important');
    expect(splitRules).toContain('color: #e2e8f0 !important');

    const darkNcMatch = css.match(/\[data-theme="dark"\]\s+#pos-nc-comp-btn\s*\{([^}]+)\}/);
    expect(darkNcMatch).not.toBeNull();
    const ncRules = darkNcMatch[1];
    expect(ncRules).toContain('background: #1e293b !important');
    expect(ncRules).toContain('color: #e2e8f0 !important');
  });

  it('preserves real-world semantic green on veg badges and free table indicators', () => {
    // Veg badge must stay green
    expect(css).toMatch(/\.food-badge-veg\s*\{[^}]*#16a34a/);
    // Free table status dot must stay green
    expect(css).toMatch(/\.tm-status-dot\.free\s*\{[^}]*#10b981/);
  });
});
