import { BaseTerminalAdapter } from '../BaseTerminalAdapter';

/**
 * SimulatorAdapter
 * Realistic interactive simulator for POS cashier training and testing
 * without needing physical EDC machines.
 */
export class SimulatorAdapter extends BaseTerminalAdapter {
  constructor(config = {}) {
    super(config);
    this.provider = 'simulator';
  }

  async initiatePayment({ amount, currency, orderId, tokenNumber, terminalId }) {
    const txId = `sim_tx_${Date.now()}`;
    return {
      success: true,
      status: 'WAITING_FOR_CARD_OR_UPI',
      transactionId: txId,
      amount,
      currency: currency || 'INR',
      orderId,
      tokenNumber,
      terminalId: terminalId || 'SIMULATOR-01',
      prompt: `Terminal ready. Waiting for card tap, chip insert, or UPI QR scan...`
    };
  }

  async checkStatus(transactionId) {
    return {
      status: 'WAITING_FOR_CARD_OR_UPI',
      transactionId
    };
  }

  async simulateTapSuccess({ transactionId, paymentMethod = 'card' }) {
    const rrn = Math.floor(100000000000 + Math.random() * 900000000000).toString();
    const authCode = `A${Math.floor(100000 + Math.random() * 900000)}`;
    return {
      success: true,
      status: 'APPROVED',
      transactionId,
      paymentMethodUsed: paymentMethod, // 'card' | 'upi'
      authCode,
      rrn,
      cardNetwork: paymentMethod === 'card' ? 'VISA' : undefined,
      maskedPan: paymentMethod === 'card' ? '4111********1111' : undefined,
      completedAt: new Date().toISOString()
    };
  }

  async simulateDecline({ transactionId, reason = 'Insufficient Funds' }) {
    return {
      success: false,
      status: 'DECLINED',
      transactionId,
      errorMessage: reason,
      completedAt: new Date().toISOString()
    };
  }

  async cancelPayment(transactionId) {
    return {
      success: true,
      status: 'CANCELLED',
      transactionId,
      message: 'Terminal transaction cancelled by cashier'
    };
  }

  async testConnection() {
    return { success: true, message: 'Simulator terminal online and responsive (0ms latency).' };
  }
}
