import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Login Screen Palette & Theme Isolation', () => {
  const cssPath = path.resolve(__dirname, '../index.css');
  const css = fs.readFileSync(cssPath, 'utf-8');

  it('enforces light theme background and slate text on .login-page even under dark root', () => {
    const loginPageDarkMatch = css.match(/html\.dark\s+\.login-page[^{]*\{([^}]+)\}/);
    expect(loginPageDarkMatch).not.toBeNull();
    const rules = loginPageDarkMatch[1];
    expect(rules).toContain('background: #f8fafc !important');
    expect(rules).toContain('color: #0f172a !important');
  });

  it('protects form labels from faint dark-mode text override', () => {
    const labelMatch = css.match(/html\.dark\s+\.login-page\s+\.form-label[^{]*\{([^}]+)\}/);
    expect(labelMatch).not.toBeNull();
    const rules = labelMatch[1];
    expect(rules).toContain('color: #334155 !important');
    expect(rules).toContain('text-transform: none !important');
  });

  it('protects form inputs from pitch-black background and white border override', () => {
    const inputMatch = css.match(/html\.dark\s+\.login-page\s+\.form-input[^{]*\{([^}]+)\}/);
    expect(inputMatch).not.toBeNull();
    const rules = inputMatch[1];
    expect(rules).toContain('background: #f8fafc !important');
    expect(rules).toContain('border: 1.5px solid #cbd5e1 !important');
    expect(rules).toContain('color: #0f172a !important');
  });

  it('neutralizes harsh focus rings on mode toggle segmented buttons', () => {
    const modeBtnFocusMatch = css.match(/\.login-page\s+\.login-mode-btn:focus-visible[^{]*\{([^}]+)\}/);
    expect(modeBtnFocusMatch).not.toBeNull();
    const rules = modeBtnFocusMatch[1];
    expect(rules).toContain('outline: none !important');
  });

  it('ensures staff PIN keypad has crisp light tiles and high contrast numbers', () => {
    const pinKeyMatch = css.match(/html\.dark\s+\.login-page\s+\.pin-key[^{]*\{([^}]+)\}/);
    expect(pinKeyMatch).not.toBeNull();
    const rules = pinKeyMatch[1];
    expect(rules).toContain('background: #ffffff !important');
    expect(rules).toContain('color: #0f172a !important');
  });
});
