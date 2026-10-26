import { ManualAdapter } from './adapters/ManualAdapter';
import { SimulatorAdapter } from './adapters/SimulatorAdapter';
import { PaytmEdcAdapter } from './adapters/PaytmEdcAdapter';
import { PineLabsAdapter } from './adapters/PineLabsAdapter';
import { RazorpayPosAdapter } from './adapters/RazorpayPosAdapter';
import { StripeTerminalAdapter } from './adapters/StripeTerminalAdapter';
import { PaxTerminalAdapter } from './adapters/PaxTerminalAdapter';
import { AdyenTerminalAdapter } from './adapters/AdyenTerminalAdapter';

export const TERMINAL_PROVIDERS = [
  {
    id: 'manual',
    name: 'Manual / Standalone Card Machine',
    description: 'Use your existing standalone bank EDC swipe machine without direct API connection.',
    features: ['debit_card', 'credit_card', 'manual_approval'],
    icon: 'CreditCard'
  },
  {
    id: 'simulator',
    name: 'Interactive Terminal Simulator (Test & Demo)',
    description: 'Simulate card tap, chip insert, UPI scan, and decline without physical hardware.',
    features: ['debit_card', 'credit_card', 'upi_qr', 'tap_to_pay'],
    icon: 'Terminal'
  },
  {
    id: 'pax',
    name: 'Pax A920 / A35 Smart POS (GCC & Global)',
    description: 'Wireless Android smart reader standard in Qatar (QAR), UAE (AED), Saudi Arabia, and Europe via POSLink protocol.',
    features: ['apple_pay', 'contactless_tap', 'chip_pin', 'poslink'],
    icon: 'Smartphone'
  },
  {
    id: 'adyen',
    name: 'Adyen Cloud Smart Terminal',
    description: 'Enterprise cloud-connected smart readers (Castles Saturn 1000, S1F2, e285) via Adyen Terminal API.',
    features: ['apple_pay', 'google_pay', 'contactless_tap', 'chip_pin'],
    icon: 'CreditCard'
  },
  {
    id: 'stripe',
    name: 'Stripe Terminal (Global)',
    description: 'Stripe Smart Readers (WisePOS E, Stripe Reader S700) for US, EU, UK, and international venues.',
    features: ['debit_card', 'credit_card', 'apple_pay', 'google_pay'],
    icon: 'CreditCard'
  },
  {
    id: 'paytm',
    name: 'Paytm All-In-One Android EDC',
    description: 'Cloud push to Paytm Smart EDC with Card tap/insert, on-device UPI QR, and Soundbox voice alerts.',
    features: ['debit_card', 'credit_card', 'upi_qr', 'soundbox'],
    icon: 'Smartphone'
  },
  {
    id: 'pinelabs',
    name: 'Pine Labs Plutus Cloud',
    description: 'Integrated with Pine Labs Android and traditional POS terminals via Plutus Cloud.',
    features: ['debit_card', 'credit_card', 'emi', 'upi_qr'],
    icon: 'CreditCard'
  },
  {
    id: 'razorpay_pos',
    name: 'Razorpay POS (Ezetap)',
    description: 'Cloud-connected Android smart card readers accepting all cards and UPI.',
    features: ['debit_card', 'credit_card', 'tap_to_pay', 'upi_qr'],
    icon: 'Smartphone'
  }
];

/**
 * Factory function to retrieve the appropriate terminal adapter based on restaurant settings
 * @param {Object} terminalConfig - The restaurant's terminalConfig object
 * @returns {BaseTerminalAdapter}
 */
export function getTerminalAdapter(terminalConfig = {}) {
  const provider = terminalConfig.provider || (terminalConfig.enabled ? 'simulator' : 'manual');

  switch (provider) {
    case 'pax':
      return new PaxTerminalAdapter(terminalConfig);
    case 'adyen':
      return new AdyenTerminalAdapter(terminalConfig);
    case 'paytm':
      return new PaytmEdcAdapter(terminalConfig);
    case 'pinelabs':
      return new PineLabsAdapter(terminalConfig);
    case 'razorpay_pos':
      return new RazorpayPosAdapter(terminalConfig);
    case 'stripe':
      return new StripeTerminalAdapter(terminalConfig);
    case 'simulator':
      return new SimulatorAdapter(terminalConfig);
    case 'manual':
    default:
      return new ManualAdapter(terminalConfig);
  }
}

