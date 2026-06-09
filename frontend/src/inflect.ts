import { VocabularyWord } from './types';

// =============================================================================
// Inflection-aware dictionary lookup for the vocabulary hover tooltips.
// -----------------------------------------------------------------------------
// The DICTIONARY stores headwords (infinitives, singular nouns, base
// adjectives), but library passages contain inflected German: conjugated
// verbs ("arbeite", "ist"), declined articles ("einen", "meiner"), plurals
// ("Jahre", "Grüße"). An exact-match lookup therefore missed ~1/3 of words.
// This module expands each dictionary entry into its common surface forms so
// the tooltip lookup hits them too. Exact headwords always win over forms
// generated from another entry.
// =============================================================================

// Irregular verb conjugations → infinitive headword. Only applied when the
// infinitive actually exists in the dictionary.
const IRREGULAR_VERBS: Record<string, string[]> = {
  sein: ['bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart', 'gewesen'],
  haben: ['habe', 'hast', 'hat', 'habt', 'hatte', 'hattest', 'hatten', 'gehabt'],
  werden: ['werde', 'wirst', 'wird', 'wurde', 'wurden', 'geworden'],
  'können': ['kann', 'kannst', 'könnt', 'konnte', 'konnten'],
  'müssen': ['muss', 'musst', 'müsst', 'musste', 'mussten'],
  wollen: ['will', 'willst', 'wollt', 'wollte', 'wollten'],
  'mögen': ['mag', 'magst', 'möchte', 'möchtest', 'möchten', 'mochte'],
  'dürfen': ['darf', 'darfst', 'dürft', 'durfte'],
  wissen: ['weiß', 'weißt', 'wisst', 'wusste'],
  gehen: ['gehe', 'gehst', 'geht', 'ging', 'gegangen'],
  geben: ['gebe', 'gibst', 'gibt', 'gab', 'gegeben'],
  essen: ['esse', 'isst', 'esst', 'aß', 'gegessen'],
  fahren: ['fahre', 'fährst', 'fährt', 'fuhr', 'gefahren'],
  kommen: ['komme', 'kommst', 'kommt', 'kam', 'gekommen'],
  nehmen: ['nehme', 'nimmst', 'nimmt', 'nahm', 'genommen'],
  sehen: ['sehe', 'siehst', 'sieht', 'sah', 'gesehen'],
  lesen: ['lese', 'liest', 'lest', 'las', 'gelesen'],
  sprechen: ['spreche', 'sprichst', 'spricht', 'sprach', 'gesprochen'],
  schlafen: ['schlafe', 'schläfst', 'schläft', 'schlief', 'geschlafen'],
  laufen: ['laufe', 'läufst', 'läuft', 'lief', 'gelaufen'],
  treffen: ['treffe', 'triffst', 'trifft', 'traf', 'getroffen'],
  helfen: ['helfe', 'hilfst', 'hilft', 'half', 'geholfen'],
};

// Declined determiners / possessives / common adjectives → base headword.
const DECLINED_FORMS: Record<string, string[]> = {
  ein: ['eine', 'einen', 'einem', 'einer', 'eines'],
  mein: ['meine', 'meinen', 'meinem', 'meiner', 'meines'],
  dein: ['deine', 'deinen', 'deinem', 'deiner', 'deines'],
  ihr: ['ihre', 'ihren', 'ihrem', 'ihrer', 'ihres'],
  unser: ['unsere', 'unseren', 'unserem', 'unserer', 'unseres'],
  euer: ['eure', 'euren', 'eurem', 'eurer', 'eures'],
  der: ['die', 'das', 'den', 'dem', 'des'],
  dieser: ['diese', 'diesen', 'diesem', 'dieses'],
  jeder: ['jede', 'jeden', 'jedem', 'jedes'],
  viel: ['viele', 'vielen', 'vieler', 'vieles'],
  gut: ['gute', 'guten', 'guter', 'gutes', 'gutem'],
};

export function buildInflectedLookup(words: VocabularyWord[]): Map<string, VocabularyWord> {
  const map = new Map<string, VocabularyWord>();
  const add = (key: string, entry: VocabularyWord) => {
    if (key && !map.has(key)) map.set(key, entry);
  };

  // Pass 1: exact headwords — these always take priority over generated forms.
  for (const w of words) add(w.german.trim().toLowerCase(), w);

  // Pass 2: irregular verb forms and declined determiners.
  for (const [base, forms] of [...Object.entries(IRREGULAR_VERBS), ...Object.entries(DECLINED_FORMS)]) {
    const entry = map.get(base);
    if (!entry) continue;
    for (const form of forms) add(form, entry);
  }

  // Pass 3: rule-generated verb conjugations. Verbs go before nouns/adjectives
  // so a conjugation like "arbeite" (arbeiten) beats a noun declension that
  // happens to produce the same surface form ("Arbeit" + e).
  for (const w of words) {
    const head = w.german.trim().toLowerCase();
    if (!head || head.includes(' ')) continue;
    if (w.wordClass === 'verb' && head.endsWith('en') && head.length > 3) {
      const stem = head.slice(0, -2);
      const endings = ['e', 'st', 't', 'te', 'ten'];
      if (stem.endsWith('t') || stem.endsWith('d')) endings.push('est', 'et', 'ete', 'eten');
      for (const e of endings) add(stem + e, w);
    }
  }

  // Pass 4: noun plurals/declensions and adjective/adverb endings.
  for (const w of words) {
    const head = w.german.trim().toLowerCase();
    if (!head || head.includes(' ')) continue;
    if (w.wordClass === 'noun') {
      for (const e of ['e', 'en', 'n', 's', 'er']) add(head + e, w);
    } else if (w.wordClass === 'adjective' || w.wordClass === 'adverb') {
      for (const e of ['e', 'en', 'er', 'es', 'em']) add(head + e, w);
    }
  }

  return map;
}
