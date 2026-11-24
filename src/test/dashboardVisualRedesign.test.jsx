import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Dashboard Visual Command Center Overhaul', () => {
  const cssPath = path.resolve(__dirname, '../index.css');
  const dashboardPath = path.resolve(__dirname, '../routes/Dashboard.jsx');
  const css = fs.readFileSync(cssPath, 'utf8');
  const dashboardCode = fs.readFileSync(dashboardPath, 'utf8');

  it('enforces 4-column desktop grid for sales-vitals-grid in index.css', () => {
    expect(css).toMatch(/\.sales-vitals-grid\s*\{[^}]*display:\s*grid;/);
    expect(css).toMatch(/\.sales-vitals-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*1fr\);/);
  });

  it('defines sales-scope-rail and sales-scope-pill styles in index.css', () => {
    expect(css).toMatch(/\.sales-scope-rail\s*\{[^}]*display:\s*inline-flex;/);
    expect(css).toMatch(/\.sales-scope-pill\s*\{[^}]*display:\s*inline-flex;/);
    expect(css).toMatch(/\.sales-scope-pill\.active\s*\{/);
  });

  it('defines analytics hub area chart and payment breakdown card styles', () => {
    expect(css).toMatch(/\.dashboard-analytics-grid\s*\{[^}]*display:\s*grid;/);
    expect(css).toMatch(/\.dashboard-chart-card\s*\{/);
    expect(css).toMatch(/\.dashboard-payment-card\s*\{/);
    expect(css).toMatch(/\.payment-tiles-grid\s*\{/);
  });

  it('defines dining cards grid and growth tip tile styles', () => {
    expect(css).toMatch(/\.dining-cards-grid\s*\{[^}]*display:\s*grid;/);
    expect(css).toMatch(/\.dining-order-card\s*\{/);
    expect(css).toMatch(/\.growth-tip-tile\s*\{[^}]*display:\s*flex;/);
  });

  it('integrates AreaChart, Area, XAxis, YAxis in Dashboard.jsx', () => {
    expect(dashboardCode).toContain('AreaChart');
    expect(dashboardCode).toContain('Area');
    expect(dashboardCode).toContain('XAxis');
    expect(dashboardCode).toContain('YAxis');
    expect(dashboardCode).toContain('revenueTrajectoryGrad');
  });

  it('includes table occupancy and capacity calculations in Dashboard.jsx', () => {
    expect(dashboardCode).toContain('occupancyPct');
    expect(dashboardCode).toContain('occupiedTablesCount');
    expect(dashboardCode).toContain('Floor Capacity');
    expect(dashboardCode).toContain('Table Occupancy');
  });

  it('provides active dining Cards and Table view switcher in Dashboard.jsx', () => {
    expect(dashboardCode).toContain("activeDiningView === 'cards'");
    expect(dashboardCode).toContain("activeDiningView === 'table'");
    expect(dashboardCode).toContain('dining-view-toggle');
    expect(dashboardCode).toContain('getElapsedDiningTime');
  });

  it('includes visual operational guidance tiles with icon containers', () => {
    expect(dashboardCode).toContain('growth-tip-tile');
    expect(dashboardCode).toContain('Sales &amp; Operational Recommendations');
    expect(dashboardCode).toContain('Staffing Optimization');
  });
});
