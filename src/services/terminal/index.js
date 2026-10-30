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
    description: 'Use your existing standalone bank EDC swipe machine without direct API connection (Finalize manually).',
    status: 'production',
    features: ['debit_card', 'credit_card', 'manual_approval'],
    icon: 'CreditCard'
  },
  {
    id: 'simulator',
    name: 'Interactive Terminal Simulator (Test & Demo)',
    description: 'Simulate card tap, chip insert, UPI scan, and decline without physical hardware.',
    status: 'simulator',
    isSimulated: true,
    features: ['debit_card', 'credit_card', 'upi_qr', 'tap_to_pay'],
    icon: 'Terminal'
  },
  {
    id: 'pax',
    name: 'Pax A920 / A35 Smart POS (GCC & Global)',
    description: 'Wireless Android smart reader via direct LAN POSLink protocol (Qatar, UAE, Saudi Arabia, Europe).',
    status: 'production',
    features: ['apple_pay', 'contactless_tap', 'chip_pin', 'poslink'],
    icon: 'Smartphone'
  },
  {
    id: 'stripe',
    name: 'Stripe Terminal (Developer Preview)',
    description: 'Stripe Smart Readers via Stripe Terminal JS SDK (Requires cloud connection token backend).',
    status: 'preview',
    isSimulated: true,
    features: ['debit_card', 'credit_card', 'apple_pay', 'google_pay'],
    icon: 'CreditCard'
  },
  {
    id: 'paytm',
    name: 'Paytm Android EDC (Developer Preview)',
    description: 'Paytm Smart EDC cloud integration scaffolding (Requires Paytm Cloud Gateway).',
    status: 'preview',
    isSimulated: true,
    features: ['debit_card', 'credit_card', 'upi_qr', 'soundbox'],
    icon: 'Smartphone'
  },
  {
    id: 'pinelabs',
    name: 'Pine Labs Plutus (Developer Preview)',
    description: 'Pine Labs Plutus Cloud integration scaffolding (Requires Plutus Cloud Gateway).',
    status: 'preview',
    isSimulated: true,
    features: ['debit_card', 'credit_card', 'emi', 'upi_qr'],
    icon: 'CreditCard'
  },
  {
    id: 'razorpay_pos',
    name: 'Razorpay POS / Ezetap (Developer Preview)',
    description: 'Razorpay POS Android reader integration scaffolding (Requires Ezetap Cloud Gateway).',
    status: 'preview',
    isSimulated: true,
    features: ['debit_card', 'credit_card', 'tap_to_pay', 'upi_qr'],
    icon: 'Smartphone'
  },
  {
    id: 'adyen',
    name: 'Adyen Cloud Terminal (Developer Preview)',
    description: 'Adyen Terminal API integration scaffolding (Requires Adyen Cloud API).',
    status: 'preview',
    isSimulated: true,
    features: ['apple_pay', 'google_pay', 'contactless_tap', 'chip_pin'],
    icon: 'CreditCard'
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

