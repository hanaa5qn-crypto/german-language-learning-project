import { describe, it, expect } from 'vitest';
import { planFromBilling } from '../backend/lib/plans';

const days = (n: number) => n * 24 * 3600 * 1000;

describe('planFromBilling — paid subscription monthly expiry (server)', () => {
  it('grants the paid plan while the period is still running', () => {
    expect(planFromBilling({
      plan: 'max',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + days(10)).toISOString(),
    })).toBe('max');
  });

  it('expires a paid subscription once currentPeriodEnd has passed', () => {
    expect(planFromBilling({
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() - days(1)).toISOString(),
    })).toBe('free');
  });

  it('expires a paid subscription a month after its period end', () => {
    expect(planFromBilling({
      plan: 'max',
      status: 'paid',
      currentPeriodEnd: new Date(Date.now() - days(30)).toISOString(),
    })).toBe('free');
  });

  it('trusts legacy paid records that carry no currentPeriodEnd', () => {
    expect(planFromBilling({ plan: 'max', status: 'active' })).toBe('max');
    expect(planFromBilling({ plan: 'pro', status: 'active' })).toBe('pro');
  });

  it('honors a legacy "Monthly" subscription without a period end as max', () => {
    expect(planFromBilling({ plan: 'Monthly', status: 'active' })).toBe('max');
  });

  it('keeps an unexpired trial active and expires a past-due trial', () => {
    expect(planFromBilling({
      plan: 'pro', status: 'trialing',
      currentPeriodEnd: new Date(Date.now() + days(2)).toISOString(),
    })).toBe('pro');
    expect(planFromBilling({ plan: 'pro', status: 'trialing' })).toBe('free');
  });
});
