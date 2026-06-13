import { describe, it, expect } from 'vitest';
import {
  PLACEMENT_CREDITS_PER_SUBSCRIPTION,
  placementCreditGrant,
  hasPlacementCredit,
} from '../backend/lib/plans';

describe('placement eval credits — one free reveal per subscription purchase', () => {
  it('grants exactly one credit when a subscription is purchased', () => {
    expect(placementCreditGrant('subscription')).toBe(1);
    expect(PLACEMENT_CREDITS_PER_SUBSCRIPTION).toBe(1);
  });

  it('grants no credit for a one-off placement purchase', () => {
    expect(placementCreditGrant('placement')).toBe(0);
  });

  it('treats an undefined product as a subscription (default checkout path)', () => {
    expect(placementCreditGrant(undefined)).toBe(1);
  });

  it('reports a usable credit only when the balance is positive', () => {
    expect(hasPlacementCredit(1)).toBe(true);
    expect(hasPlacementCredit(2)).toBe(true);
    expect(hasPlacementCredit(0)).toBe(false);
    expect(hasPlacementCredit(undefined)).toBe(false);
  });
});
