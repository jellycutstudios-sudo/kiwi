import { BaseTerminalAdapter } from '../BaseTerminalAdapter';

/**
 * ManualAdapter
 * Handles standalone bank swipe/EDC machines without direct cloud APIs.
 * Cashier keys the amount directly onto the machine and confirms approval in POS.
 */
export class ManualAdapter extends BaseTerminalAdapter {
  constructor(config = {}) {
    super(config);
    this.provider = 'manual';
  }

  async initiatePayment({ amount, currency }) {
    return {
      success: true,
      status: 'WAITING_MANUAL',
      isManual: true,
      transactionId: `manual_${Date.now()}`,
      message: `Charge ${currency || '₹'} ${amount} on the standalone EDC machine.`
    };
  }

  async checkStatus(transactionId) {
    return {
      status: 'WAITING_MANUAL',
      transactionId
    };
  }

  async cancelPayment() {
    return { success: true };
  }

  async testConnection() {
    return { success: true, message: 'Manual/Standalone Mode active. No network connection required.' };
  }
}
