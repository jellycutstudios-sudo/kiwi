import { describe, expect, it } from 'vitest';
import { billingLoadMessage, menuTargets, sameBusiness, summarizeOutlet } from '../utils/platformAdministration';

describe('platform administration safeguards', () => {
  const source = { id: 'source', ownerUid: 'owner', businessGroupId: 'kiwi', currency: 'INR' };
  it('keeps business-wide changes inside both ownership and grouping boundaries', () => {
    expect(sameBusiness(source, { ...source, id: 'second' })).toBe(true);
    expect(sameBusiness(source, { ...source, ownerUid: 'other' })).toBe(false);
    expect(sameBusiness(source, { ...source, businessGroupId: 'other' })).toBe(false);
    expect(sameBusiness(source, { ownerUid: 'owner' })).toBe(false);
    expect(sameBusiness({ ownerUid: 'owner', brandId: 'old' }, { ownerUid: 'owner', brandId: 'old' })).toBe(true);
    expect(sameBusiness(undefined, undefined)).toBe(false);
  });
  it('only permits menu copying to sibling branches with the same pricing currency', () => {
    expect(menuTargets(source, [source, { ...source, id: 'ok' }, { ...source, id: 'usd', currency: 'USD' }, { ...source, id: 'other', ownerUid: 'other' }]).map(branch => branch.id)).toEqual(['ok']);
  });
  it('merges timestamp and text dates without double-counting or concatenating totals', () => {
    const now = new Date('2026-11-03T00:00:00Z');
    const start = new Date('2026-11-01T00:00:00Z');
    const data = [
      { id: 'text', createdAt: '2026-11-02T00:00:00Z', status: 'billed', total: '100.50' },
      { id: 'timestamp', createdAt: { toDate: () => new Date('2026-11-02T12:00:00Z') }, status: 'billed', total: 20 },
      { id: 'old', createdAt: '2026-10-01T00:00:00Z', status: 'billed', total: 500 },
      { id: 'pending', createdAt: '2026-11-02T00:00:00Z', status: 'pending', total: 600 },
      { id: 'bad', status: 'billed', createdAt: 'invalid', total: 1000 },
    ].map(item => ({ id: item.id, data: () => item }));
    expect(summarizeOutlet(source, [{ docs: data }, { docs: [data[0]] }], start, now)).toMatchObject({ revenue: 120.5, ordersCount: 2, currency: 'INR' });
  });
  it('distinguishes missing access setup from expired sessions and connection errors', () => {
    expect(billingLoadMessage({ billing: { code: 'permission-denied' } })).toMatch(/Firebase rules/);
    expect(billingLoadMessage({ businesses: { code: 'firestore/unauthenticated' } })).toMatch(/Sign in again/);
    expect(billingLoadMessage({ billing: { code: 'unavailable' } })).toMatch(/connection/);
  });
});
