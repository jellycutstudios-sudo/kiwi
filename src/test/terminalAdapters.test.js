import { describe, it, expect } from 'vitest';
import { getTerminalAdapter, TERMINAL_PROVIDERS } from '../services/terminal';
import { ManualAdapter } from '../services/terminal/adapters/ManualAdapter';
import { SimulatorAdapter } from '../services/terminal/adapters/SimulatorAdapter';
import { PaytmEdcAdapter } from '../services/terminal/adapters/PaytmEdcAdapter';
import { PineLabsAdapter } from '../services/terminal/adapters/PineLabsAdapter';
import { RazorpayPosAdapter } from '../services/terminal/adapters/RazorpayPosAdapter';
import { StripeTerminalAdapter } from '../services/terminal/adapters/StripeTerminalAdapter';

describe('Payment Terminal Adapters & Architecture', () => {
  it('registers all standard industry providers in TERMINAL_PROVIDERS', () => {
    const providerIds = TERMINAL_PROVIDERS.map(p => p.id);
    expect(providerIds).toContain('manual');
    expect(providerIds).toContain('simulator');
    expect(providerIds).toContain('paytm');
    expect(providerIds).toContain('pinelabs');
    expect(providerIds).toContain('razorpay_pos');
    expect(providerIds).toContain('stripe');
  });

  it('instantiates the correct adapter via getTerminalAdapter()', () => {
    expect(getTerminalAdapter({ provider: 'manual' })).toBeInstanceOf(ManualAdapter);
    expect(getTerminalAdapter({ provider: 'simulator' })).toBeInstanceOf(SimulatorAdapter);
    expect(getTerminalAdapter({ provider: 'paytm' })).toBeInstanceOf(PaytmEdcAdapter);
    expect(getTerminalAdapter({ provider: 'pinelabs' })).toBeInstanceOf(PineLabsAdapter);
    expect(getTerminalAdapter({ provider: 'razorpay_pos' })).toBeInstanceOf(RazorpayPosAdapter);
    expect(getTerminalAdapter({ provider: 'stripe' })).toBeInstanceOf(StripeTerminalAdapter);
  });

  it('defaults to ManualAdapter when no configuration or provider is set', () => {
    const adapter = getTerminalAdapter({});
    expect(adapter).toBeInstanceOf(ManualAdapter);
    expect(adapter.provider).toBe('manual');
  });

  it('runs connection diagnostic checks on adapters', async () => {
    const simAdapter = new SimulatorAdapter();
    const simRes = await simAdapter.testConnection();
    expect(simRes.success).toBe(true);

    const manualAdapter = new ManualAdapter();
    const manualRes = await manualAdapter.testConnection();
    expect(manualRes.success).toBe(true);

    // Paytm without credentials should report missing config
    const paytmAdapter = new PaytmEdcAdapter({});
    const paytmRes = await paytmAdapter.testConnection();
    expect(paytmRes.success).toBe(false);

    // Paytm with credentials should pass
    const paytmValid = new PaytmEdcAdapter({ merchantId: '2168200000', terminalId: 'TID_01' });
    const paytmValidRes = await paytmValid.testConnection();
    expect(paytmValidRes.success).toBe(true);
  });

  it('simulates card tap and UPI payment flows with RRN and Auth Code in SimulatorAdapter', async () => {
    const simulator = new SimulatorAdapter();
    const init = await simulator.initiatePayment({
      amount: 450,
      currency: 'INR',
      orderId: 'ORD_1001',
      terminalId: 'COUNTER-1'
    });

    expect(init.success).toBe(true);
    expect(init.status).toBe('WAITING_FOR_CARD_OR_UPI');
    expect(init.transactionId).toBeDefined();

    // Simulate Card Tap
    const cardApproval = await simulator.simulateTapSuccess({
      transactionId: init.transactionId,
      paymentMethod: 'card'
    });
    expect(cardApproval.success).toBe(true);
    expect(cardApproval.status).toBe('APPROVED');
    expect(cardApproval.paymentMethodUsed).toBe('card');
    expect(cardApproval.rrn).toBeDefined();
    expect(cardApproval.authCode).toBeDefined();

    // Simulate UPI Scan
    const upiApproval = await simulator.simulateTapSuccess({
      transactionId: init.transactionId,
      paymentMethod: 'upi'
    });
    expect(upiApproval.success).toBe(true);
    expect(upiApproval.status).toBe('APPROVED');
    expect(upiApproval.paymentMethodUsed).toBe('upi');

    // Simulate Decline
    const decline = await simulator.simulateDecline({
      transactionId: init.transactionId,
      reason: 'PIN Expired'
    });
    expect(decline.success).toBe(false);
    expect(decline.status).toBe('DECLINED');
    expect(decline.errorMessage).toBe('PIN Expired');
  });
});
