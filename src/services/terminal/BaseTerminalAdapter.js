/**
 * BaseTerminalAdapter
 * Interface and base class for all physical POS EDC & Smart Terminal adapters in DineOS.
 */
export class BaseTerminalAdapter {
  constructor(config = {}) {
    this.config = config;
    this.provider = 'base';
  }

  /**
   * Pushes a payment request to the physical EDC machine
   * @param {Object} params
   * @param {number} params.amount - Total amount to charge
   * @param {string} params.currency - Currency code (e.g., 'INR', 'USD')
   * @param {string} params.orderId - DineOS order ID
   * @param {string|number} params.tokenNumber - Order token or table identifier
   * @param {string} [params.terminalId] - Target physical terminal ID
   * @returns {Promise<{
   *   success: boolean,
   *   status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED',
   *   transactionId?: string,
   *   authCode?: string,
   *   rrn?: string,
   *   paymentMethodUsed?: 'card' | 'upi',
   *   cardNetwork?: string,
   *   maskedPan?: string,
   *   errorMessage?: string
   * }>}
   */
  async initiatePayment(/* params */) {
    throw new Error(`initiatePayment() not implemented for ${this.constructor.name}`);
  }

  /**
   * Polls or fetches the current status of an in-progress transaction
   * @param {string} transactionId
   * @returns {Promise<{ status: string, authCode?: string, rrn?: string, errorMessage?: string }>}
   */
  async checkStatus(/* transactionId */) {
    throw new Error(`checkStatus() not implemented for ${this.constructor.name}`);
  }

  /**
   * Cancels/voids an active transaction on the physical terminal
   * @param {string} transactionId
   * @returns {Promise<{ success: boolean, message?: string }>}
   */
  async cancelPayment(/* transactionId */) {
    throw new Error(`cancelPayment() not implemented for ${this.constructor.name}`);
  }

  /**
   * Tests the connection / handshake with the physical device or provider API
   * @returns {Promise<{ success: boolean, message: string }>}
   */
  async testConnection() {
    return { success: true, message: 'Provider ready' };
  }
}
