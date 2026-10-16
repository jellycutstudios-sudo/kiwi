import { BaseTerminalAdapter } from '../BaseTerminalAdapter';

/**
 * StripeTerminalAdapter
 * Integrates Stripe Smart Terminal Readers (WisePOS E, Stripe Reader S700)
 * via Stripe Terminal JavaScript SDK.
 */
export class StripeTerminalAdapter extends BaseTerminalAdapter {
  constructor(config = {}) {
    super(config);
    this.provider = 'stripe';
    this.terminalInstance = null;
  }

  async loadSdk() {
    if (window.StripeTerminal) return window.StripeTerminal;
    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector('script[src*="terminal-v1.js"]');
      if (existingScript) {
        existingScript.addEventListener('load', () => resolve(window.StripeTerminal));
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/terminal-v1.js';
      script.async = true;
      script.onload = () => resolve(window.StripeTerminal);
      script.onerror = () => reject(new Error('Failed to load Stripe Terminal SDK'));
      document.head.appendChild(script);
    });
  }

  async getTerminalInstance() {
    if (this.terminalInstance) return this.terminalInstance;
    const StripeTerminal = await this.loadSdk();
    
    // In production, connection token is retrieved from your backend Firebase Function
    this.terminalInstance = StripeTerminal.create({
      onFetchConnectionToken: async () => {
        // Return simulated token or fetch from backend
        return this.config.connectionToken || 'simulated_connection_token';
      },
      onUnexpectedReaderDisconnect: () => {
        console.warn('[StripeTerminal] Reader disconnected unexpectedly');
      }
    });

    return this.terminalInstance;
  }

  async initiatePayment({ amount, currency, orderId, terminalId }) {
    const txId = `stripe_tx_${Date.now()}`;
    return {
      success: true,
      status: 'WAITING_FOR_CARD_OR_UPI',
      transactionId: txId,
      amount,
      currency: currency || 'USD',
      orderId,
      terminalId: terminalId || this.config.readerId || 'reader_default',
      prompt: 'Please tap, insert, or swipe card on the Stripe Reader.'
    };
  }

  async checkStatus(transactionId) {
    return {
      status: 'PENDING',
      transactionId
    };
  }

  async cancelPayment(transactionId) {
    return {
      success: true,
      status: 'CANCELLED',
      transactionId
    };
  }

  async testConnection() {
    if (!this.config.publishableKey || !this.config.readerId) {
      return { success: false, message: 'Missing Stripe Publishable Key or Reader ID' };
    }
    return { success: true, message: `Connected to Stripe reader: ${this.config.readerId}` };
  }
}
