// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initSecurityGuards } from '../utils/securityGuards';

describe('securityGuards utility', () => {
  let listeners = {};
  let storageStore = {};

  const mockLocalStorage = {
    getItem: (key) => storageStore[key] || null,
    setItem: (key, val) => { storageStore[key] = String(val); },
    removeItem: (key) => { delete storageStore[key]; },
    clear: () => { storageStore = {}; },
  };

  beforeEach(() => {
    listeners = {};
    storageStore = {};
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
      configurable: true,
    });
    global.localStorage = mockLocalStorage;

    vi.spyOn(window, 'addEventListener').mockImplementation((event, handler) => {
      listeners[event] = handler;
    });
    vi.spyOn(document, 'addEventListener').mockImplementation((event, handler) => {
      listeners[event] = handler;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    storageStore = {};
  });

  it('does not attach blocking listeners when dineos_disable_guards is true', () => {
    mockLocalStorage.setItem('dineos_disable_guards', 'true');
    initSecurityGuards();
    expect(listeners['contextmenu']).toBeUndefined();
    expect(listeners['keydown']).toBeUndefined();
  });

  it('attaches right-click and shortcut blockers by default on POS pages', () => {
    window.history.pushState({}, '', '/pos');
    const cleanup = initSecurityGuards();

    expect(listeners['contextmenu']).toBeDefined();
    expect(listeners['keydown']).toBeDefined();

    // Test contextmenu prevention and custom desktop event dispatch
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const contextMenuEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 250,
      clientY: 150,
      target: { tagName: 'DIV', id: 'pos-area' },
    };
    listeners['contextmenu'](contextMenuEvent);
    expect(contextMenuEvent.preventDefault).toHaveBeenCalled();
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'dineos:contextmenu',
        detail: expect.objectContaining({ clientX: 250, clientY: 150 }),
      })
    );

    // Test F12 keydown prevention
    const f12Event = {
      key: 'F12',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    listeners['keydown'](f12Event);
    expect(f12Event.preventDefault).toHaveBeenCalled();

    // Test Ctrl+Shift+I prevention
    const devToolsEvent = {
      key: 'I',
      ctrlKey: true,
      shiftKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    listeners['keydown'](devToolsEvent);
    expect(devToolsEvent.preventDefault).toHaveBeenCalled();

    // Test Cmd+Alt+J (macOS Console) prevention
    const macConsoleEvent = {
      key: 'J',
      metaKey: true,
      altKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    listeners['keydown'](macConsoleEvent);
    expect(macConsoleEvent.preventDefault).toHaveBeenCalled();

    // Test Ctrl+U (View Source) prevention
    const viewSourceEvent = {
      key: 'U',
      ctrlKey: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    listeners['keydown'](viewSourceEvent);
    expect(viewSourceEvent.preventDefault).toHaveBeenCalled();

    if (cleanup) cleanup();
  });

  it('allows default browser right-click on public marketing landing page', () => {
    window.history.pushState({}, '', '/landing');
    const cleanup = initSecurityGuards();

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const contextMenuEvent = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 250,
      clientY: 150,
      target: { tagName: 'DIV', id: 'landing-hero' },
    };
    listeners['contextmenu'](contextMenuEvent);
    expect(contextMenuEvent.preventDefault).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalled();

    if (cleanup) cleanup();
  });
});
