import { describe, it, expect } from 'vitest';
import { buildInflectedLookup } from '../frontend/src/inflect';
import { VocabularyWord } from '../frontend/src/types';
import { DICTIONARY } from '../frontend/src/data';

const word = (german: string, mongolian: string, wordClass?: VocabularyWord['wordClass']): VocabularyWord =>
  ({ german, mongolian, wordClass } as VocabularyWord);

describe('buildInflectedLookup', () => {
  it('maps irregular verb forms to the infinitive entry', () => {
    const map = buildInflectedLookup([word('sein', 'байх', 'verb'), word('haben', 'эзэмших', 'verb')]);
    expect(map.get('ist')?.german).toBe('sein');
    expect(map.get('war')?.german).toBe('sein');
    expect(map.get('habe')?.german).toBe('haben');
  });

  it('generates regular verb conjugations', () => {
    const map = buildInflectedLookup([word('lernen', 'сурах', 'verb')]);
    expect(map.get('lerne')?.german).toBe('lernen');
    expect(map.get('lernst')?.german).toBe('lernen');
    expect(map.get('lernte')?.german).toBe('lernen');
  });

  it('generates noun plural forms', () => {
    const map = buildInflectedLookup([word('Jahr', 'жил', 'noun')]);
    expect(map.get('jahre')?.german).toBe('Jahr');
  });

  it('never overwrites an exact headword with a generated form', () => {
    // "Arbeit" + 'e' would collide with the real headword "arbeite" if one existed,
    // and verb conjugations must beat noun declensions on shared keys.
    const map = buildInflectedLookup([word('Arbeit', 'ажил', 'noun'), word('arbeiten', 'ажиллах', 'verb')]);
    expect(map.get('arbeite')?.german).toBe('arbeiten');
    expect(map.get('arbeit')?.german).toBe('Arbeit');
  });

  it('keeps every real dictionary headword reachable', () => {
    const map = buildInflectedLookup(DICTIONARY);
    for (const w of DICTIONARY.slice(0, 200)) {
      expect(map.get(w.german.trim().toLowerCase())?.german).toBe(w.german);
    }
  });
});
