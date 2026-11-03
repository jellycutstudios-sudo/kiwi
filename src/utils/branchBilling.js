import { CURRENCY_OPTIONS } from './formatCurrency';

export const BILLING_CYCLES = ['monthly', 'yearly'];
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'upi', 'other'];

export function todayDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function currencyDecimals(currency) {
  if (!CURRENCY_OPTIONS.some(option => option.code === currency)) throw new Error('Choose a supported currency.');
  return ['BHD', 'KWD', 'OMR'].includes(currency) ? 3 : 2;
}

export function toMinorUnits(value, currency, allowZero = false) {
  const decimals = currencyDecimals(currency);
  const input = String(value ?? '').trim();
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`).test(input)) {
    throw new Error(`Enter an amount with at most ${decimals} decimal places.`);
  }
  const [whole, fraction = ''] = input.split('.');
  const minor = Number(whole) * (10 ** decimals) + Number(fraction.padEnd(decimals, '0'));
  if (!Number.isSafeInteger(minor) || minor > 1e12 || minor < (allowZero ? 0 : 1)) {
    throw new Error(allowZero ? 'Enter a valid non-negative amount.' : 'Payment amount must be greater than zero.');
  }
  return minor;
}

export function fromMinorUnits(value, currency) {
  return (value ?? 0) / (10 ** currencyDecimals(currency));
}

export function subscriptionStatus(branch, subscription, today = todayDate()) {
  if (branch.status === 'suspended') return { key: 'suspended', label: 'Suspended', tone: 'red' };
  if (!subscription) return { key: 'not_set', label: 'Not set', tone: 'gray' };
  if (!isCalendarDate(subscription.paidThrough)) return { key: 'awaiting_payment', label: 'Awaiting payment', tone: 'orange' };
  const days = Math.round((Date.parse(`${subscription.paidThrough}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (days < 0) return { key: 'overdue', label: 'Overdue', tone: 'red' };
  if (days <= 7) return { key: 'due_soon', label: 'Due soon', tone: 'orange' };
  return { key: 'active', label: 'Active', tone: 'green' };
}

export function suggestedRenewal(paidThrough, cycle = 'monthly', today = todayDate()) {
  const base = isCalendarDate(paidThrough) && paidThrough > today ? paidThrough : today;
  const date = new Date(`${base}T00:00:00Z`);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + (cycle === 'yearly' ? 12 : 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString().slice(0, 10);
}

export function validatePayment(input, today = todayDate()) {
  if (!isCalendarDate(input.paidOn) || input.paidOn > today) throw new Error('Enter a valid payment date, no later than today.');
  if (!PAYMENT_METHODS.includes(input.method)) throw new Error('Choose a payment method.');
  if (!input.allocations?.length || input.allocations.length > 50) throw new Error('Select between 1 and 50 branches.');
  if (new Set(input.allocations.map(line => line.restaurantId)).size !== input.allocations.length) throw new Error('A branch can only appear once in a payment.');
  const allocations = input.allocations.map(line => {
    if (!line.restaurantId) throw new Error('Choose a branch.');
    if (!isCalendarDate(line.paidThrough) || line.paidThrough < input.paidOn) throw new Error('Paid-through date must be on or after the payment date.');
    return {
      restaurantId: line.restaurantId,
      amountMinor: toMinorUnits(line.amount, input.currency),
      paidThrough: line.paidThrough,
      activate: Boolean(line.activate),
    };
  });
  const totalMinor = allocations.reduce((sum, line) => sum + line.amountMinor, 0);
  if (!Number.isSafeInteger(totalMinor)) throw new Error('Payment total is too large.');
  return {
    currency: input.currency, paidOn: input.paidOn, method: input.method,
    reference: String(input.reference || '').trim().slice(0, 200),
    note: String(input.note || '').trim().slice(0, 1000),
    allocations, totalMinor,
  };
}

// Brand/group membership is for organisation; ownership authorises branch switching.
export function canSwitchBranch(user, staff, branch) {
  if (staff?.role === 'super_admin') return true;
  const uid = user?.uid || staff?.id || staff?.uid;
  return Boolean(
    uid && !staff?.isPinLogin && staff?.role === 'admin' &&
    branch?.ownerUid === uid && branch.status === 'approved'
  );
}
