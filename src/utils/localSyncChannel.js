/**
 * Local Cross-Tab Sync Channel (BroadcastChannel + Storage Event Fallback)
 * Enables 0ms, zero-cloud real-time synchronization between POS registers and KDS screens
 * running on the same computer (multi-monitor, multi-tab, or local air-gapped mode).
 */

const CHANNEL_NAME = 'dineos_local_sync_channel';

class LocalSyncChannel {
  constructor() {
    this.channel = null;
    this.listeners = new Set();
    this.init();
  }

  init() {
    if (typeof window === 'undefined') return;

    // 1. Primary: BroadcastChannel API (supported in all modern browsers)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          this.notifyListeners(event.data);
        };
      } catch (err) {
        console.warn('[LocalSyncChannel] BroadcastChannel initialization failed:', err);
      }
    }

    // 2. Secondary fallback: window 'storage' event (fires in other tabs on localStorage writes)
    window.addEventListener('storage', (event) => {
      if (event.key === CHANNEL_NAME && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue);
          this.notifyListeners(payload);
        } catch {}
      }
    });
  }

  notifyListeners(data) {
    if (!data || !data.type) return;
    this.listeners.forEach((callback) => {
      try {
        callback(data);
      } catch (err) {
        console.error('[LocalSyncChannel] Listener error:', err);
      }
    });
  }

  /**
   * Broadcast an event to all other open tabs/windows
   * @param {string} type - Event type (e.g. 'LOCAL_ORDER_CREATED', 'LOCAL_ORDER_UPDATED')
   * @param {object} payload - Event payload
   */
  broadcast(type, payload = {}, { includeSender = false } = {}) {
    const data = {
      type,
      payload,
      timestamp: Date.now(),
      senderTabId: this.getTabId(),
    };

    if (includeSender) {
      this.notifyListeners(data);
    }

    // 1. Send via BroadcastChannel
    if (this.channel) {
      try {
        this.channel.postMessage(data);
      } catch (e) {
        console.warn('[LocalSyncChannel] postMessage failed:', e);
      }
    }

    // 2. Send via localStorage for cross-tab storage event
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(CHANNEL_NAME, JSON.stringify(data));
      } catch {}
    }
  }

  /**
   * Subscribe to incoming broadcasts
   * @param {function} callback - Callback function receiving message data
   * @returns {function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  }

  getTabId() {
    if (typeof sessionStorage === 'undefined') return 'unknown_tab';
    let tabId = sessionStorage.getItem('dineos_tab_instance_id');
    if (!tabId) {
      tabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      sessionStorage.setItem('dineos_tab_instance_id', tabId);
    }
    return tabId;
  }
}

export const localSyncChannel = new LocalSyncChannel();
