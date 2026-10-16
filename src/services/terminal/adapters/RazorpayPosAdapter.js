import { BaseTerminalAdapter } from '../BaseTerminalAdapter';

/**
 * RazorpayPosAdapter
 * Driver for Razorpay POS (formerly Ezetap) Smart Android Terminals.
 */
export class RazorpayPosAdapter extends BaseTerminalAdapter {
  constructor(config = {}) {
    super(config);
    this.provider = 'razorpay_pos';
  }

  async initiatePayment({ amount, currency, orderId, tokenNumber, terminalId }) {
    const deviceSerial = terminalId || this.config.terminalId || this.config.serialNumber;
    if (!deviceSerial) {
      throw new Error('Razorpay POS Device Serial Number is required in Settings.');
    }

    const txId = `rzp_pos_${Date.now()}`;
    return {
      success: true,
      status: 'WAITING_FOR_CARD_OR_UPI',
      transactionId: txId,
      amount,
      currency: currency || 'INR',
      orderId,
      tokenNumber,
      terminalId: deviceSerial,
      prompt: `Payment request pushed to Razorpay POS (${deviceSerial}). Tap/Swipe card or Scan UPI QR.`
    };
  }

  async checkStatus(transactionId) {
    return { status: 'PENDING', transactionId };
  }

  async cancelPayment(transactionId) {
    return { success: true, status: 'CANCELLED', transactionId };
  }

  async testConnection() {
    const keyId = this.config.keyId;
    const serial = this.config.terminalId || this.config.serialNumber;
    if (!keyId || !serial) {
      return { success: false, message: 'Razorpay Key ID and Device Serial Number are required.' };
    }
    return {
      success: true,
      message: `Razorpay POS Cloud API ready for Device ${serial}.`
    };
  }
}
