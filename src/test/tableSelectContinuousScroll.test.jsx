import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Petpooja-Style Continuous Section-Grouped Scroll Table View', () => {
  const indexCss = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
  const tableSelectModalJsx = fs.readFileSync(path.resolve(__dirname, '../components/pos/TableSelectModal.jsx'), 'utf-8');
  const tableMapJsx = fs.readFileSync(path.resolve(__dirname, '../routes/TableMap.jsx'), 'utf-8');

  it('verifies TableSelectModal implements continuous section-grouped scroll', () => {
    // Grouped sections memo
    expect(tableSelectModalJsx).toContain('const groupedSections = useMemo(');
    expect(tableSelectModalJsx).toContain('table-select-sections-container');
    expect(tableSelectModalJsx).toContain('table-select-section-group');
    expect(tableSelectModalJsx).toContain('table-select-section-header');
    expect(tableSelectModalJsx).toContain('id={`table-zone-section-${sec.id}`}');

    // Quick jump bar
    expect(tableSelectModalJsx).toContain('All Sections (');
    expect(tableSelectModalJsx).toContain('scrollIntoView({ behavior: \'smooth\', block: \'start\' })');

    // Preserves required close button for touch UX
    expect(tableSelectModalJsx).toContain('className="modal-close-touch table-select-close-btn"');
    expect(tableSelectModalJsx).toContain('id="table-modal-close"');
    expect(tableSelectModalJsx).toContain('<X size={20} strokeWidth={2.4} />');
  });

  it('verifies TableMap implements All Sections continuous scroll for Grid view', () => {
    // Floor tabs include All Sections when multiple floors exist in grid view
    expect(tableMapJsx).toContain('allFloors.length > 1 && viewMode === \'grid\'');
    expect(tableMapJsx).toContain('All Sections');
    expect(tableMapJsx).toContain('tm-all-floors-container');
    expect(tableMapJsx).toContain('tm-all-floors-group');
    expect(tableMapJsx).toContain('tm-floor-section-header');
    expect(tableMapJsx).toContain('tm-grid tm-grid--section');

    // Graceful map view switch
    expect(tableMapJsx).toContain('mode === \'map\' && activeFloor === \'all\'');

    // Multi-floor calculations across all tables when activeFloor === all
    expect(tableMapJsx).toContain('if (activeFloor === \'all\') return tables;');
  });

  it('verifies CSS definitions for sticky section headers and continuous layout', () => {
    // TableSelectModal CSS
    expect(indexCss).toContain('.table-select-sections-container');
    expect(indexCss).toContain('.table-select-section-header');
    expect(indexCss).toMatch(/\.table-select-section-header\s*\{[^}]*position:\s*sticky/);
    expect(indexCss).toContain('[data-theme="dark"] .table-select-section-header');

    // TableMap All Sections CSS
    expect(indexCss).toContain('.tm-all-floors-container');
    expect(indexCss).toContain('.tm-floor-section-header');
    expect(indexCss).toMatch(/\.tm-floor-section-header\s*\{[^}]*position:\s*(relative|sticky)/);
    expect(indexCss).toContain('[data-theme="dark"] .tm-floor-section-header');
    expect(indexCss).toContain('.tm-grid.tm-grid--section');
  });
});
