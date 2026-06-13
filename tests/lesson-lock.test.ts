import { describe, it, expect } from 'vitest';
import { isLessonLocked } from '../frontend/src/plans';
import type { UserProfile } from '../frontend/src/profiles';

function profileWith(billing: UserProfile['billing'], email = 'student@example.com'): UserProfile {
  return {
    email,
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
const LOCKED_LEVELS = ['A2', 'B1', 'B2', 'C1', 'C2'];

describe('isLessonLocked — Free tier is limited to A1 content', () => {
  it('lets a free user open every A1 lesson', () => {
    expect(isLessonLocked(profileWith(undefined), 'A1')).toBe(false);
  });

  it('locks every level above A1 for a free user', () => {
    for (const level of LOCKED_LEVELS) {
      expect(isLessonLocked(profileWith(undefined), level)).toBe(true);
    }
  });

  it('locks A2–C2 once a paid subscription has expired (regression for the "A1 sees all levels" bug)', () => {
    const expired = profileWith({
      plan: 'max',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() - days(1)).toISOString(),
    });
    for (const level of LOCKED_LEVELS) {
      expect(isLessonLocked(expired, level)).toBe(true);
    }
  });

  it('unlocks all levels for an active paid subscriber', () => {
    const active = profileWith({
      plan: 'pro',
      status: 'active',
      currentPeriodEnd: new Date(Date.now() + days(20)).toISOString(),
    });
    for (const level of ['A1', ...LOCKED_LEVELS]) {
      expect(isLessonLocked(active, level)).toBe(false);
    }
  });

  it('unlocks all levels for a founder account', () => {
    const founder = profileWith(undefined, 'hanaa5qn@gmail.com');
    for (const level of ['A1', ...LOCKED_LEVELS]) {
      expect(isLessonLocked(founder, level)).toBe(false);
    }
  });
});
