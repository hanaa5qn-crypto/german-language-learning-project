import { describe, it, expect } from 'vitest';
import { scorePlacement, placementProfilePatch, type PlacementRecord } from '../frontend/src/placement';

function recordWith(level: string, unlocked: boolean): PlacementRecord {
  const base = scorePlacement([]); // empty answers → deterministic skeleton
  return { ...base, level: level as PlacementRecord['level'], unlocked };
}

describe('placementProfilePatch — auto-assign level from eval result', () => {
  it('assigns the placed level even when the result is NOT unlocked (free user)', () => {
    const patch = placementProfilePatch(recordWith('B1', false));
    expect(patch.targetLevel).toBe('B1');
    expect(patch.placementPending).toBe(false);
    expect(patch.placement.level).toBe('B1');
  });

  it('assigns the placed level when the result IS unlocked (paid/founder)', () => {
    const patch = placementProfilePatch(recordWith('C1', true));
    expect(patch.targetLevel).toBe('C1');
  });

  it('always clears the placementPending flag so the test is not re-prompted', () => {
    expect(placementProfilePatch(recordWith('A2', false)).placementPending).toBe(false);
  });
});
