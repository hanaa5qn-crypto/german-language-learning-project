import { describe, it, expect } from 'vitest';
import {
  PLACEMENT_BLOCKS, PLACEMENT_TOTAL_QUESTIONS,
  levelFromPassedBlocks, scorePlacement, isFounderEmail,
  PlacementAnswer, PlacementSkill,
} from '../frontend/src/placement';
import { EXAM_LEVEL_ORDER } from '../frontend/src/exams';

const SKILLS: PlacementSkill[] = ['read', 'listen', 'write', 'speak'];

// Блок бүрд өгсөн зөв хариултын тоогоор хариултын жагсаалт үүсгэнэ.
function answersForBlocks(correctPerBlock: number[]): PlacementAnswer[] {
  return correctPerBlock.flatMap((correctCount, blockIdx) =>
    SKILLS.map((skill, i) => ({
      questionId: `pl_${EXAM_LEVEL_ORDER[blockIdx]}_${skill}`,
      skill,
      correct: i < correctCount,
    })),
  );
}

describe('placement question bank', () => {
  it('has one block per CEFR level with all four skills', () => {
    expect(PLACEMENT_BLOCKS).toHaveLength(EXAM_LEVEL_ORDER.length);
    for (const block of PLACEMENT_BLOCKS) {
      expect(block.map((q) => q.skill)).toEqual(SKILLS);
    }
    expect(PLACEMENT_TOTAL_QUESTIONS).toBe(EXAM_LEVEL_ORDER.length * 4);
  });

  it('every question has a valid correct choice', () => {
    for (const block of PLACEMENT_BLOCKS) {
      for (const q of block) {
        expect(q.choices.length).toBeGreaterThanOrEqual(2);
        expect(q.correctIndex).toBeGreaterThanOrEqual(0);
        expect(q.correctIndex).toBeLessThan(q.choices.length);
      }
    }
  });

  it('listening questions carry audio text and reading questions a passage', () => {
    for (const block of PLACEMENT_BLOCKS) {
      expect(block.find((q) => q.skill === 'listen')?.audioText).toBeTruthy();
      expect(block.find((q) => q.skill === 'read')?.passage).toBeTruthy();
    }
  });
});

describe('levelFromPassedBlocks', () => {
  it('places at A1 when no block is passed', () => {
    expect(levelFromPassedBlocks(0)).toBe('A1');
  });

  it('maps passed block counts onto CEFR levels up to C2', () => {
    expect(levelFromPassedBlocks(1)).toBe('A1');
    expect(levelFromPassedBlocks(3)).toBe('B1');
    expect(levelFromPassedBlocks(6)).toBe('C2');
    expect(levelFromPassedBlocks(99)).toBe('C2');
  });
});

describe('scorePlacement', () => {
  it('stops counting passed blocks at the first failed block', () => {
    // A1 4/4, A2 3/4 (давсан), B1 2/4 (унасан), B2 4/4 — B2 тооцогдохгүй.
    const record = scorePlacement(answersForBlocks([4, 3, 2, 4]));
    expect(record.level).toBe('A2');
  });

  it('totals correct answers and per-skill scores', () => {
    const record = scorePlacement(answersForBlocks([4, 2]));
    expect(record.totalQuestions).toBe(8);
    expect(record.totalCorrect).toBe(6);
    expect(record.skillScores.read).toEqual({ correct: 2, total: 2 });
    expect(record.skillScores.speak).toEqual({ correct: 1, total: 2 });
  });

  it('starts locked — the learner must pay (or be a founder) to see it', () => {
    const record = scorePlacement(answersForBlocks([4]));
    expect(record.unlocked).toBe(false);
    expect(record.unlockedBy).toBeUndefined();
  });

  it('places a perfect run at C2', () => {
    expect(scorePlacement(answersForBlocks([4, 4, 4, 4, 4, 4])).level).toBe('C2');
  });
});

describe('isFounderEmail', () => {
  it('accepts the founder account regardless of case/whitespace', () => {
    expect(isFounderEmail('ceo@homunculuslogic.io')).toBe(true);
    expect(isFounderEmail('  CEO@homunculuslogic.io ')).toBe(true);
  });

  it('rejects regular learners and empty emails', () => {
    expect(isFounderEmail('bat@gmail.com')).toBe(false);
    expect(isFounderEmail(undefined)).toBe(false);
  });
});
