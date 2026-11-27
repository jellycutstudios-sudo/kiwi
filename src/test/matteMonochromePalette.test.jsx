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

  it('sets sidebar active nav item to crisp elevated Linear-style indicator', () => {
    // Dark mode
    const darkNavMatch = css.match(/\[data-theme="dark"\]\s+\.sidebar\.collapsed\s+\.nav-item\.active,\s*\[data-theme="dark"\]\s+\.nav-item\.active\s*\{([^}]+)\}/);
    expect(darkNavMatch).not.toBeNull();
    expect(darkNavMatch[1]).toContain('background: rgba(255, 255, 255, 0.09) !important');
    expect(darkNavMatch[1]).toContain('color: #ffffff !important');

    // Light mode
    const lightNavMatch = css.match(/\.nav-item\.active\s*\{([^}]+)\}/);
    expect(lightNavMatch).not.toBeNull();
    expect(lightNavMatch[1]).toContain('background: rgba(16, 185, 129, 0.1)');
    expect(lightNavMatch[1]).toContain('color: #0f172a');
  });

  it('sets dark mode primary buttons to solid matte white pill with dark text', () => {
    const darkBtnMatch = css.match(/\[data-theme="dark"\]\s+\.btn-primary\s*\{([^}]+)\}/);
    expect(darkBtnMatch).not.toBeNull();
    expect(darkBtnMatch[1]).toContain('background: #ffffff !important');
    expect(darkBtnMatch[1]).toContain('color: #09090b !important');
    expect(darkBtnMatch[1]).not.toContain('#10b981');
  });

  it('neutralizes dark mode form inputs focus state', () => {
    const darkFocusMatch = css.match(/\[data-theme="dark"\]\s+\.form-input:focus[^{]*\{([^}]+)\}/);
    expect(darkFocusMatch).not.toBeNull();
    expect(darkFocusMatch[1]).toContain('border-color: #ffffff');
    expect(darkFocusMatch[1]).not.toContain('#10b981');
  });

  it('sets dark mode TableMap floor tab to high-contrast white', () => {
    const darkFloorTabMatch = css.match(/\[data-theme="dark"\]\s+\.tm-floor-tab--active[^{]*\{([^}]+)\}/);
    expect(darkFloorTabMatch).not.toBeNull();
    expect(darkFloorTabMatch[1]).toContain('background: #ffffff !important');
    expect(darkFloorTabMatch[1]).toContain('color: #09090b !important');
  });

  it('preserves real-world semantic green on veg badges and free table indicators', () => {
    // Veg badge must stay green
    expect(css).toMatch(/\.food-badge-veg\s*\{[^}]*#16a34a/);
    // Free table status dot uses clean monochrome slate
    expect(css).toMatch(/\.tm-status-dot\.free\s*\{[^}]*#64748b/);
  });

  describe('TableMap Relatable Status Colors', () => {
    it('sets occupied tables to calm ocean blue instead of alarm red', () => {
      // Light mode
      const lightOccupied = css.match(/\.tm-card--occupied\s*\{([^}]+)\}/);
      expect(lightOccupied).not.toBeNull();
      expect(lightOccupied[1]).toContain('#0284c7');
      expect(lightOccupied[1]).not.toContain('#ef4444');

      // Dark mode
      const darkOccupied = css.match(/\[data-theme="dark"\]\s+\.tm-card--occupied\s*\{([^}]+)\}/);
      expect(darkOccupied).not.toBeNull();
      expect(darkOccupied[1]).toContain('#0284c7');
      expect(darkOccupied[1]).not.toContain('#ef4444');
    });

    it('sets billed tables to warm golden amber (turnover imminent)', () => {
      const lightBilled = css.match(/\.tm-card--billed\s*\{([^}]+)\}/);
      expect(lightBilled).not.toBeNull();
      expect(lightBilled[1]).toContain('#d97706');

      const darkBilled = css.match(/\[data-theme="dark"\]\s+\.tm-card--billed\s*\{([^}]+)\}/);
      expect(darkBilled).not.toBeNull();
      expect(darkBilled[1]).toContain('#f59e0b');
    });

    it('sets reserved tables to royal amethyst purple', () => {
      const lightReserved = css.match(/\.tm-card--reserved\s*\{([^}]+)\}/);
      expect(lightReserved).not.toBeNull();
      expect(lightReserved[1]).toContain('#9333ea');

      const darkReserved = css.match(/\[data-theme="dark"\]\s+\.tm-card--reserved\s*\{([^}]+)\}/);
      expect(darkReserved).not.toBeNull();
      expect(darkReserved[1]).toContain('#a855f7');
    });

    it('reserves alarm red strictly for overdue tables', () => {
      const overdueMatch = css.match(/\.tm-card--occupied\.overdue,\s*\.tm-card--overdue\s*\{([^}]+)\}/);
      expect(overdueMatch).not.toBeNull();
      expect(overdueMatch[1]).toContain('#ef4444');
    });

    it('sets table card bill amount to neutral white/slate instead of red', () => {
      const billAmount = css.match(/\.tm-card-bill-amount\s*\{([^}]+)\}/);
      expect(billAmount).not.toBeNull();
      expect(billAmount[1]).toContain('color: #0f172a');
      expect(billAmount[1]).not.toContain('#ef4444');

      const darkBillAmount = css.match(/\[data-theme="dark"\]\s+\.tm-card-bill-amount[^{]*\{([^}]+)\}/);
      expect(darkBillAmount).not.toBeNull();
      expect(darkBillAmount[1]).toContain('color: #f8fafc');
    });

    it('sets floor section stat pills to matching blue and purple colors', () => {
      const occupiedPill = css.match(/\.tm-floor-stat-pill\.occupied\s*\{([^}]+)\}/);
      expect(occupiedPill).not.toBeNull();
      expect(occupiedPill[1]).toContain('#0284c7');

      const darkOccupiedPill = css.match(/\[data-theme="dark"\]\s+\.tm-floor-stat-pill\.occupied[^{]*\{([^}]+)\}/);
      expect(darkOccupiedPill).not.toBeNull();
      expect(darkOccupiedPill[1]).toContain('#38bdf8');
    });

    it('ensures table code never squishes or truncates away', () => {
      const codeRule = css.match(/\.tm-card-code\s*\{([^}]+)\}/);
      expect(codeRule).not.toBeNull();
      expect(codeRule[1]).toContain('flex-shrink: 0');
    });

    it('styles architectural 3D tables with relatable status colors and tactile cushions', () => {
      // 3D chair cushions and item wrapper
      expect(css).toContain('.table-3d-item-wrapper');
      expect(css).toContain('.table-3d-chair');

      // Occupied 3D card uses Ocean Blue
      const occupied3d = css.match(/\.table-3d-card\.occupied\s*\{([^}]+)\}/);
      expect(occupied3d).not.toBeNull();
      expect(occupied3d[1]).toContain('#0284c7');

      // Billed 3D card uses Golden Amber
      const billed3d = css.match(/\.table-3d-card\.billed\s*\{([^}]+)\}/);
      expect(billed3d).not.toBeNull();
      expect(billed3d[1]).toContain('#f59e0b');

      // Reserved 3D card uses Royal Purple
      const reserved3d = css.match(/\.table-3d-card\.reserved\s*\{([^}]+)\}/);
      expect(reserved3d).not.toBeNull();
      expect(reserved3d[1]).toContain('#a855f7');
    });
  });
});
