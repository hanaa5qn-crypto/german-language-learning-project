import { describe, it, expect } from 'vitest';
import { stripServerOwnedFields, type UserProfile } from '../frontend/src/profiles';

function fullProfile(): UserProfile & { aiUsage?: unknown } {
  return {
    email: 'student@example.com',
    name: 'Сурагч',
    avatar: '',
    role: '',
    targetLevel: 'B1',
    streak: 5,
    progress: 42,
    completedLessons: 3,
    learningGoal: 'Ерөнхий',
    suggestions: [],
    learningCurve: [],
    billing: { plan: 'max', status: 'active', currentPeriodEnd: '2099-01-01T00:00:00.000Z' },
    placementCredits: 3,
    aiUsage: { month: '2026-06', count: 1 },
  } as UserProfile & { aiUsage?: unknown };
}

describe('stripServerOwnedFields — clients cannot persist entitlement fields', () => {
  it('removes billing so a client cannot extend its own subscription', () => {
    expect('billing' in stripServerOwnedFields(fullProfile())).toBe(false);
  });

  it('removes placementCredits so a client cannot self-grant free evals', () => {
    expect('placementCredits' in stripServerOwnedFields(fullProfile())).toBe(false);
  });

  it('removes aiUsage so a client cannot reset its AI teaser counter', () => {
    expect('aiUsage' in stripServerOwnedFields(fullProfile())).toBe(false);
  });

  it('keeps ordinary progress fields intact', () => {
    const out = stripServerOwnedFields(fullProfile());
    expect(out.streak).toBe(5);
    expect(out.progress).toBe(42);
    expect(out.targetLevel).toBe('B1');
    expect(out.email).toBe('student@example.com');
  });

  it('does not mutate the original profile object', () => {
    const original = fullProfile();
    stripServerOwnedFields(original);
    expect(original.billing).toBeDefined();
    expect(original.placementCredits).toBe(3);
  });
});
