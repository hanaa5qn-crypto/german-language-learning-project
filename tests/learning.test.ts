import { describe, it, expect } from 'vitest';
import {
  compareWordsByLevel, suggestedWordLevel, orderTrainerWords,
  reviewSrs, srsWordKey, SrsMap, localDateKey,
} from '../frontend/src/learning';
import { VocabularyWord, CEFRLevel } from '../frontend/src/types';

function word(german: string, level: CEFRLevel, rank?: number): VocabularyWord {
  return {
    german, mongolian: 'үг', category: '', exampleGerman: '', exampleMongolian: '',
    level, rank,
  };
}

describe('compareWordsByLevel', () => {
  it('sorts easiest level first (A1 → B2)', () => {
    const words = [word('schwer', 'B2'), word('mittel', 'B1'), word('hallo', 'A1'), word('gut', 'A2')];
    const sorted = [...words].sort(compareWordsByLevel);
    expect(sorted.map((w) => w.level)).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('breaks level ties by frequency rank, unranked last', () => {
    const words = [word('selten', 'A1'), word('und', 'A1', 2), word('der', 'A1', 1)];
    const sorted = [...words].sort(compareWordsByLevel);
    expect(sorted.map((w) => w.german)).toEqual(['der', 'und', 'selten']);
  });
});

describe('suggestedWordLevel', () => {
  it('passes A1–B2 placement levels through', () => {
    for (const lv of ['A1', 'A2', 'B1', 'B2'] as const) {
      expect(suggestedWordLevel(lv)).toBe(lv);
    }
  });

  it('clamps C1/C2 to B2 (hardest dictionary band)', () => {
    expect(suggestedWordLevel('C1')).toBe('B2');
    expect(suggestedWordLevel('C2')).toBe('B2');
  });

  it('returns null for missing or unknown levels', () => {
    expect(suggestedWordLevel(undefined)).toBeNull();
    expect(suggestedWordLevel('X9')).toBeNull();
  });
});

describe('orderTrainerWords', () => {
  it('puts due reviews first, then new words easiest-first, then scheduled', () => {
    const dueWord = word('vergessen', 'B1', 10);
    const newA1 = word('neuA1', 'A1', 5);
    const newB2 = word('neuB2', 'B2', 1);
    const futureWord = word('gelernt', 'A2', 3);

    const srs: SrsMap = {
      // lapsed yesterday → due today
      [srsWordKey(dueWord)]: { ease: 2.2, intervalDays: 0, reps: 0, due: localDateKey(), lastReviewed: localDateKey() },
      // reviewed and scheduled for the future
      [srsWordKey(futureWord)]: reviewSrs(undefined, true),
    };

    const ordered = orderTrainerWords([futureWord, newB2, dueWord, newA1], srs);
    expect(ordered.map((w) => w.german)).toEqual(['vergessen', 'neuA1', 'neuB2', 'gelernt']);
  });

  it('a word marked "don\'t know" becomes due today again', () => {
    const w = word('schwierig', 'A2', 7);
    const known = reviewSrs(undefined, true);           // scheduled tomorrow
    expect(known.due > localDateKey()).toBe(true);
    const lapsed = reviewSrs(known, false);             // failed → back today
    expect(lapsed.due).toBe(localDateKey());
    const ordered = orderTrainerWords([word('anders', 'A1', 1), w], { [srsWordKey(w)]: lapsed });
    expect(ordered[0].german).toBe('schwierig');        // due words outrank new ones
  });
});
