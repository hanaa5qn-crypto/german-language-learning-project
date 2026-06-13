import { describe, it, expect } from 'vitest';
import { effectivePlan } from '../frontend/src/plans';
import type { UserProfile } from '../frontend/src/profiles';

// Зөвхөн billing талбар нь чухал — бусад нь хамгийн бага profile.
function profileWith(billing: UserProfile['billing']): UserProfile {
  return {
    email: 'student@example.com',
    name: 'Сурагч',
    avatar: '',
    role: '',
    targetLevel: 'A1',
    streak: 0,
    progress: 0,
    completedLessons: 0,
    learningGoal: '',
    suggestions: [],
    learningCurve: [],
    billing,
  } as UserProfile;
}

const days = (n: number) => n * 24 * 3600 * 1000;

describe('effectivePlan — referral Pro trial', () => {
  it('grants pro while the trial period is still running', () => {
    expect(effectivePlan(profileWith({
      plan: 'pro',
      status: 'trialing',
      currentPeriodEnd: new Date(Date.now() + days(2)).toISOString(),
    }))).toBe('pro');
  });

  it('falls back to free once the trial period has ended', () => {
    expect(effectivePlan(profileWith({
      plan: 'pro',
      status: 'trialing',
      currentPeriodEnd: new Date(Date.now() - days(1)).toISOString(),
    }))).toBe('free');
  });

  it('treats a trial without an end date as expired', () => {
    expect(effectivePlan(profileWith({ plan: 'pro', status: 'trialing' }))).toBe('free');
  });

});

describe('effectivePlan — paid subscription monthly expiry', () => {
  it('grants the paid plan while the period is still running', () => {
    expect(effectivePlan(profileWith({
      plan: 'max',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + days(10)).toISOString(),
    }))).toBe('max');
  });

  it('expires a paid subscription once currentPeriodEnd has passed', () => {
    expect(effectivePlan(profileWith({
      plan: 'max',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() - days(1)).toISOString(),
    }))).toBe('free');
  });

  it('expires a paid pro subscription a month after its period end', () => {
    expect(effectivePlan(profileWith({
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() - days(30)).toISOString(),
    }))).toBe('free');
  });

  it('trusts legacy paid records that carry no currentPeriodEnd', () => {
    expect(effectivePlan(profileWith({ plan: 'max', status: 'active' }))).toBe('max');
    expect(effectivePlan(profileWith({ plan: 'pro', status: 'paid' }))).toBe('pro');
  });

  it('honors a legacy "Monthly" subscription without a period end as max', () => {
    expect(effectivePlan(profileWith({ plan: 'Monthly', status: 'active' }))).toBe('max');
  });
});
