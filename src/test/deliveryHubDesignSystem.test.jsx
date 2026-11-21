import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Delivery Hub Premium Minimal Design System', () => {
  const indexCss = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');
  const deliveryHubJsx = fs.readFileSync(path.resolve(__dirname, '../routes/admin/DeliveryHub.jsx'), 'utf-8');

  it('defines cohesive, theme-consistent CSS classes for Delivery Hub in index.css', () => {
    // Header & Navigation
    expect(indexCss).toContain('.dh-page-header');
    expect(indexCss).toContain('.dh-title-icon-badge');
    expect(indexCss).toContain('.dh-status-badge.live');
    expect(indexCss).toContain('.dh-status-badge.rush');
    expect(indexCss).toContain('.dh-tabs-wrapper');
    expect(indexCss).toContain('.dh-tab-btn');

    // Stats Grid
    expect(indexCss).toContain('.hub-stats-grid');
    expect(indexCss).toContain('.hub-stat-card');
    expect(indexCss).toContain('.hub-stat-icon-wrapper.orders');
    expect(indexCss).toContain('.hub-stat-icon-wrapper.revenue');
    expect(indexCss).toContain('.hub-stat-icon-wrapper.commission');
    expect(indexCss).toContain('.hub-stat-icon-wrapper.channels');

    // Filter bar & Cards
    expect(indexCss).toContain('.dh-filter-segmented');
    expect(indexCss).toContain('.dh-filter-btn');
    expect(indexCss).toContain('.dh-channel-card');
    expect(indexCss).toContain('.dh-channel-card.live');
    expect(indexCss).toContain('.dh-channel-card.paused');
    expect(indexCss).toContain('.dh-active-metrics');
    expect(indexCss).toContain('.dh-offline-specs');
    expect(indexCss).toContain('.dh-btn-connect');

    // Dark mode rules
    expect(indexCss).toContain('[data-theme="dark"] .dh-channel-card');
    expect(indexCss).toContain('[data-theme="dark"] .hub-stat-card');
  });

  it('uses clean segmented tabs with icons and badges in DeliveryHub.jsx', () => {
    expect(deliveryHubJsx).toContain('className="dh-tabs-wrapper no-scrollbar touch-scroll-x"');
    expect(deliveryHubJsx).toContain('className={`dh-tab-btn ${isActive ? \'active\' : \'\'}`}');
    expect(deliveryHubJsx).toContain('className={`dh-tab-badge');
  });

  it('structures stat cards with top icon squircle, prominent value, and context subtext', () => {
    expect(deliveryHubJsx).toContain('className="hub-stat-top"');
    expect(deliveryHubJsx).toContain('hub-stat-icon-wrapper orders');
    expect(deliveryHubJsx).toContain('hub-stat-icon-wrapper revenue');
    expect(deliveryHubJsx).toContain('hub-stat-icon-wrapper commission');
    expect(deliveryHubJsx).toContain('hub-stat-icon-wrapper channels');
    expect(deliveryHubJsx).toContain('className="hub-stat-subtext"');
  });

  it('uses modern Lucide icons for regional filtering instead of raw emojis', () => {
    expect(deliveryHubJsx).toContain('<MapPin size={13} />');
    expect(deliveryHubJsx).toContain('<CheckCircle2 size={13} />');
    expect(deliveryHubJsx).toContain('<Globe size={13} />');
    expect(deliveryHubJsx).not.toContain('<span>📍</span>');
    expect(deliveryHubJsx).not.toContain('<span>✅</span>');
    expect(deliveryHubJsx).not.toContain('<span>🌐</span>');
  });

  it('presents clean channel cards without redundant duplicate enable buttons', () => {
    expect(deliveryHubJsx).toContain('className={`dh-channel-card ${statusVariant}`}');
    expect(deliveryHubJsx).toContain('className="dh-offline-specs"');
    expect(deliveryHubJsx).toContain('className="btn btn-primary btn-sm dh-btn-connect"');
    // Ensure the confusing duplicate bottom enable button on cards is removed
    expect(deliveryHubJsx).not.toContain('<Power size={13} /> Enable');
  });

  it('uses modal-close-touch with standard 20px close cross for Delivery Hub modals', () => {
    expect(deliveryHubJsx).toContain('className="modal-close-touch"');
    expect(deliveryHubJsx).toMatch(/onClick=\{\(\)\s*=>\s*setRushModalOpen\(false\)\}/);
    expect(deliveryHubJsx).toMatch(/onClick=\{\(\)\s*=>\s*setPauseModal\(prev\s*=>\s*\(\{\s*\.\.\.prev,\s*isOpen:\s*false\s*\}\)\)\}/);
    expect(deliveryHubJsx).toMatch(/onClick=\{\(\)\s*=>\s*setConfigModal\(prev\s*=>\s*\(\{\s*\.\.\.prev,\s*isOpen:\s*false\s*\}\)\)\}/);
  });
});
