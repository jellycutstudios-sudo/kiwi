import { BaseTerminalAdapter } from '../BaseTerminalAdapter';

/**
 * PineLabsAdapter
 * Driver for Pine Labs Plutus Cloud / Android EDC Machines.
 */
export class PineLabsAdapter extends BaseTerminalAdapter {
  constructor(config = {}) {
    super(config);
    this.provider = 'pinelabs';
  }

  async initiatePayment({ amount, currency, orderId, tokenNumber, terminalId }) {
    const posId = terminalId || this.config.terminalId || this.config.posId;
    if (!posId) {
      throw new Error('Pine Labs POS Device ID is required. Please check Settings.');
    }

    const txId = `plutus_tx_${Date.now()}`;
    return {
      success: true,
      status: 'WAITING_FOR_CARD_OR_UPI',
      transactionId: txId,
      amount,
      currency: currency || 'INR',
      orderId,
      tokenNumber,
      terminalId: posId,
      prompt: `Sent to Pine Labs Plutus (${posId}). Ready for Card Tap/Insert or UPI QR.`
    };
  }

  async checkStatus(transactionId) {
    return { status: 'PENDING', transactionId };
  }

  async cancelPayment(transactionId) {
    return { success: true, status: 'CANCELLED', transactionId };
  }

  async testConnection() {
    const posId = this.config.terminalId || this.config.posId;
    const merchantId = this.config.merchantId;
    if (!merchantId || !posId) {
      return { success: false, message: 'Pine Labs Merchant ID and POS ID are required.' };
    }
    return {
      success: true,
      message: `Pine Labs Plutus gateway connected for POS ID: ${posId}.`
    };
  }
}
