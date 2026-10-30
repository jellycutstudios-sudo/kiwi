import { describe, it, expect, vi } from 'vitest';

import { getTerminalAdapter, TERMINAL_PROVIDERS } from '../services/terminal';
import { ManualAdapter } from '../services/terminal/adapters/ManualAdapter';
import { SimulatorAdapter } from '../services/terminal/adapters/SimulatorAdapter';
import { PaytmEdcAdapter } from '../services/terminal/adapters/PaytmEdcAdapter';
import { PineLabsAdapter } from '../services/terminal/adapters/PineLabsAdapter';
import { RazorpayPosAdapter } from '../services/terminal/adapters/RazorpayPosAdapter';
import { StripeTerminalAdapter } from '../services/terminal/adapters/StripeTerminalAdapter';
import { PaxTerminalAdapter } from '../services/terminal/adapters/PaxTerminalAdapter';
import { AdyenTerminalAdapter } from '../services/terminal/adapters/AdyenTerminalAdapter';

describe('Payment Terminal Adapters & Architecture', () => {
  it('registers all standard industry providers in TERMINAL_PROVIDERS', () => {
    const providerIds = TERMINAL_PROVIDERS.map(p => p.id);
    expect(providerIds).toContain('manual');
    expect(providerIds).toContain('simulator');
    expect(providerIds).toContain('paytm');
    expect(providerIds).toContain('pinelabs');
    expect(providerIds).toContain('razorpay_pos');
    expect(providerIds).toContain('stripe');
    expect(providerIds).toContain('pax');
    expect(providerIds).toContain('adyen');
  });

  it('instantiates the correct adapter via getTerminalAdapter()', () => {
    expect(getTerminalAdapter({ provider: 'manual' })).toBeInstanceOf(ManualAdapter);
    expect(getTerminalAdapter({ provider: 'simulator' })).toBeInstanceOf(SimulatorAdapter);
    expect(getTerminalAdapter({ provider: 'paytm' })).toBeInstanceOf(PaytmEdcAdapter);
    expect(getTerminalAdapter({ provider: 'pinelabs' })).toBeInstanceOf(PineLabsAdapter);
    expect(getTerminalAdapter({ provider: 'razorpay_pos' })).toBeInstanceOf(RazorpayPosAdapter);
    expect(getTerminalAdapter({ provider: 'stripe' })).toBeInstanceOf(StripeTerminalAdapter);
    expect(getTerminalAdapter({ provider: 'pax' })).toBeInstanceOf(PaxTerminalAdapter);
    expect(getTerminalAdapter({ provider: 'adyen' })).toBeInstanceOf(AdyenTerminalAdapter);
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

    const paxAdapter = new PaxTerminalAdapter({ terminalIp: '192.168.1.100', terminalId: 'PAX_01' });
    const paxRes = await paxAdapter.testConnection();
    expect(paxRes.success).toBe(true);

    const adyenAdapter = new AdyenTerminalAdapter({ terminalId: 'ADYEN_01' });
    const adyenRes = await adyenAdapter.testConnection();
    expect(adyenRes.success).toBe(true);

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

  it('parses approved POSLink response from Pax smart reader', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        responseCode: '000000',
        hostResponseCode: '00',
        rrn: 'RRN_PAX_998877',
        authCode: 'AUTH_112233',
        cardType: 'Visa',
        cardNum: '************4321'
      })
    });

    const paxAdapter = new PaxTerminalAdapter({
      terminalIp: '192.168.1.150',
      terminalPort: 10009,
      terminalId: 'PAX_COUNTER_01',
      ecrId: 'KIWI_ECR'
    });

    const res = await paxAdapter.initiatePayment({
      amount: 120.00,
      currency: 'AED',
      orderId: 'ORDER_AED_456'
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('APPROVED');
    expect(res.rrn).toBe('RRN_PAX_998877');
    expect(res.authCode).toBe('AUTH_112233');
    expect(res.cardBrand).toBe('Visa');
    expect(res.last4).toBe('4321');

    fetchSpy.mockRestore();
  });

  it('handles Pax POSLink demo mode initiation and cancellation', async () => {
    const paxAdapter = new PaxTerminalAdapter({
      demoMode: true,
      terminalId: 'PAX_COUNTER_01',
      ecrId: 'KIWI_ECR'
    });

    const init = await paxAdapter.initiatePayment({
      amount: 85.50,
      currency: 'QAR',
      orderId: 'ORDER_QAR_123',
      terminalId: 'PAX_COUNTER_01'
    });

    expect(init.success).toBe(true);
    expect(init.provider).toBe('pax');
    expect(init.status).toBe('WAITING_FOR_CARD_OR_UPI');
    expect(init.amount).toBe(85.50);
    expect(init.currency).toBe('QAR');
    expect(init.terminalId).toBe('PAX_COUNTER_01');

    const status = await paxAdapter.checkStatus(init.transactionId);
    expect(status.provider).toBe('pax');
    expect(status.status).toBe('PENDING');

    const cancel = await paxAdapter.cancelPayment(init.transactionId);
    expect(cancel.success).toBe(true);
    expect(cancel.status).toBe('CANCELLED');
  });

  it('handles Adyen Cloud Terminal payment dispatch and connection checks', async () => {
    const adyen = new AdyenTerminalAdapter({
      merchantAccount: 'KiwiHospitalityECOM',
      terminalId: 'ADYEN-V400m-987654321'
    });

    const diag = await adyen.testConnection();
    expect(diag.success).toBe(true);
    expect(diag.message).toContain('ADYEN-V400m-987654321');

    const init = await adyen.initiatePayment({
      amount: 42.00,
      currency: 'EUR',
      orderId: 'ADY_ORDER_99'
    });

    expect(init.success).toBe(true);
    expect(init.provider).toBe('adyen');
    expect(init.currency).toBe('EUR');
    expect(init.status).toBe('WAITING_FOR_CARD_OR_UPI');
    expect(init.prompt).toContain('EUR 42');

    const cancel = await adyen.cancelPayment(init.transactionId);
    expect(cancel.success).toBe(true);
    expect(cancel.status).toBe('CANCELLED');
  });

  it('parses approved Adyen Cloud Terminal API response with RRN and AuthCode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        SaleToPOIResponse: {
          PaymentResponse: {
            Response: { Result: 'Success' },
            POIData: { POITransactionID: { TransactionID: 'ADY_RRN_123456' } },
            PaymentResult: {
              PaymentAcquirerData: { ApprovalCode: 'ADY_AUTH_9988' },
              PaymentInstrumentData: { CardData: { PaymentBrand: 'MasterCard', MaskedPan: '5555********4444' } }
            }
          }
        }
      })
    });

    const adyen = new AdyenTerminalAdapter({
      apiKey: 'live_test_key_123',
      merchantAccount: 'KiwiHospitalityECOM',
      terminalId: 'ADYEN-V400m-987654321'
    });

    const res = await adyen.initiatePayment({
      amount: 65.00,
      currency: 'EUR',
      orderId: 'ADY_ORDER_101'
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('APPROVED');
    expect(res.rrn).toBe('ADY_RRN_123456');
    expect(res.authCode).toBe('ADY_AUTH_9988');
    expect(res.cardBrand).toBe('MasterCard');
    expect(res.last4).toBe('4444');

    fetchSpy.mockRestore();
  });

  it('parses approved Paytm EDC Cloud response with RRN and AuthCode', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        body: {
          resultInfo: { resultStatus: 'TXN_SUCCESS', resultCode: '01', resultMsg: 'Success' },
          bankTxnId: 'PTM_RRN_554433',
          authRefNum: 'PTM_AUTH_7788',
          paymentMode: 'CARD'
        }
      })
    });

    const paytm = new PaytmEdcAdapter({
      merchantId: 'PTM_MERCHANT_01',
      merchantKey: 'PTM_SECRET_KEY_01',
      terminalId: 'PTM_TID_01'
    });

    const res = await paytm.initiatePayment({
      amount: 1450.00,
      currency: 'INR',
      orderId: 'PTM_ORDER_789'
    });

    expect(res.success).toBe(true);
    expect(res.status).toBe('APPROVED');
    expect(res.rrn).toBe('PTM_RRN_554433');
    expect(res.authCode).toBe('PTM_AUTH_7788');
    expect(res.provider).toBe('paytm');

    fetchSpy.mockRestore();
  });

  it('handles Paytm EDC and Adyen declined statuses properly without hanging in placeholder states', async () => {
    // Paytm declined
    const fetchSpyPaytm = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        body: {
          resultInfo: { resultStatus: 'TXN_FAILURE', resultCode: '227', resultMsg: 'Card Declined by Issuer' }
        }
      })
    });

    const paytm = new PaytmEdcAdapter({
      merchantId: 'PTM_MERCHANT_01',
      merchantKey: 'PTM_SECRET_KEY_01',
      terminalId: 'PTM_TID_01'
    });

    const paytmRes = await paytm.initiatePayment({ amount: 500, currency: 'INR', orderId: 'ORD_FAIL_1' });
    expect(paytmRes.success).toBe(false);
    expect(paytmRes.status).toBe('DECLINED');
    expect(paytmRes.errorMessage).toContain('Card Declined by Issuer');

    fetchSpyPaytm.mockRestore();

    // Adyen declined
    const fetchSpyAdyen = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      json: async () => ({
        SaleToPOIResponse: {
          PaymentResponse: {
            Response: { Result: 'Failure', ErrorCondition: 'Refusal', AdditionalResponse: 'Insufficient Funds' }
          }
        }
      })
    });

    const adyen = new AdyenTerminalAdapter({
      apiKey: 'live_test_key_123',
      merchantAccount: 'KiwiHospitalityECOM',
      terminalId: 'ADYEN-V400m-987654321'
    });

    const adyenRes = await adyen.initiatePayment({ amount: 99, currency: 'EUR', orderId: 'ORD_FAIL_2' });
    expect(adyenRes.success).toBe(false);
    expect(adyenRes.status).toBe('DECLINED');
    expect(adyenRes.errorMessage).toBe('Refusal');

    fetchSpyAdyen.mockRestore();
  });
});

