// =============================================================================
// Vivid-Lingua — Learning engine (давтамжит сэргээх ой + хичээлийн зам + streak)
// -----------------------------------------------------------------------------
// Pure logic shared by the vocabulary trainer (SM-2 style spaced repetition),
// the per-level lesson path (Unit 1 → 2 → 3 gating), the streak calculation
// with a 1-day grace ("streak freeze"), and the "Today's Session" picker.
// No React, no Firebase — everything here is deterministic and unit-testable.
// =============================================================================

import { VocabularyWord, CEFRLevel } from './types';
import {
  READING_LIBRARY, LISTENING_LIBRARY, SPEAKING_LIBRARY, WRITING_LIBRARY,
  Level, ReadingItem, ListeningItem, SpeakingItem, WritingItem,
} from './library';

// --- Local date helpers (duplicated from App so this module stays standalone) -
export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromLocalKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

// =============================================================================
// 1. Spaced repetition (SM-2 lite, Anki-style)
// -----------------------------------------------------------------------------
// Each reviewed word carries an ease factor and an interval. "Мэднэ" (knew it)
// grows the interval (1д → 3д → interval×ease …); "Дахин давтах" (again) resets
// the word so it comes back in today's queue. State lives in the Firestore
// profile under `srsByWord`, keyed by the same id the activity log uses.
// =============================================================================

export interface SrsEntry {
  ease: number;          // ease factor, SM-2 style (min 1.3)
  intervalDays: number;  // current inter-review gap in days
  reps: number;          // consecutive successful reviews
  due: string;           // local date key when the word is next due
  lastReviewed: string;  // local date key of the last review
}

export type SrsMap = Record<string, SrsEntry>;

const SRS_MIN_EASE = 1.3;
const SRS_START_EASE = 2.5;

// --- CEFR level ordering (A1 easiest → C2 hardest) ---------------------------
const CEFR_ORDER: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

// Easiest-first comparator: CEFR level, then frequency rank within a level.
export function compareWordsByLevel(a: VocabularyWord, b: VocabularyWord): number {
  const la = CEFR_ORDER[a.level ?? 'A1'] ?? 0;
  const lb = CEFR_ORDER[b.level ?? 'A1'] ?? 0;
  if (la !== lb) return la - lb;
  return (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER);
}

// Map a placement-test level (A1…C2) to the trainer level filter.
export function suggestedWordLevel(placementLevel: string | undefined): CEFRLevel | null {
  if (!placementLevel) return null;
  if (placementLevel in CEFR_ORDER) return placementLevel as CEFRLevel;
  return null;
}

// Same identity the existing activity log uses for vocabulary words.
export function srsWordKey(word: VocabularyWord): string {
  return String(word.rank ?? `${word.german}-${word.mongolian}`);
}

export function reviewSrs(entry: SrsEntry | undefined, knew: boolean, today = new Date()): SrsEntry {
  const todayKey = localDateKey(today);
  const prev = entry ?? {
    ease: SRS_START_EASE, intervalDays: 0, reps: 0, due: todayKey, lastReviewed: todayKey,
  };

  if (!knew) {
    // Lapse: shrink ease, reset reps, bring the word back into today's queue.
    return {
      ease: Math.max(SRS_MIN_EASE, prev.ease - 0.3),
      intervalDays: 0,
      reps: 0,
      due: todayKey,
      lastReviewed: todayKey,
    };
  }

  const reps = prev.reps + 1;
  const intervalDays =
    reps === 1 ? 1 :
    reps === 2 ? 3 :
    Math.max(prev.intervalDays + 1, Math.round(prev.intervalDays * prev.ease));
  return {
    ease: Math.min(3.0, prev.ease + 0.1),
    intervalDays,
    reps,
    due: localDateKey(addDays(today, intervalDays)),
    lastReviewed: todayKey,
  };
}

export function isDue(entry: SrsEntry | undefined, todayKey = localDateKey()): boolean {
  if (!entry) return false;        // never-seen words are "new", not "due"
  return entry.due <= todayKey;
}

// Trainer queue order: overdue reviews first (oldest due date first), then
// brand-new words, then words already scheduled for the future. This is the
// whole "struggled words come back sooner" behaviour.
export function orderTrainerWords(
  words: VocabularyWord[],
  srs: SrsMap,
  todayKey = localDateKey(),
): VocabularyWord[] {
  const due: VocabularyWord[] = [];
  const fresh: VocabularyWord[] = [];
  const scheduled: VocabularyWord[] = [];
  for (const word of words) {
    const entry = srs[srsWordKey(word)];
    if (!entry) fresh.push(word);
    else if (entry.due <= todayKey) due.push(word);
    else scheduled.push(word);
  }
  const byDueThenLevel = (a: VocabularyWord, b: VocabularyWord) =>
    srs[srsWordKey(a)].due.localeCompare(srs[srsWordKey(b)].due) || compareWordsByLevel(a, b);
  due.sort(byDueThenLevel);
  fresh.sort(compareWordsByLevel); // new words always start at A1 and climb to C2
  scheduled.sort(byDueThenLevel);
  return [...due, ...fresh, ...scheduled];
}

export function countDueWords(words: VocabularyWord[], srs: SrsMap, todayKey = localDateKey()): number {
  return words.reduce((sum, w) => sum + (isDue(srs[srsWordKey(w)], todayKey) ? 1 : 0), 0);
}

// =============================================================================
// 2. Streak with a 1-day grace ("streak freeze")
// -----------------------------------------------------------------------------
// A streak survives a single missed day: one 1-day gap inside the run (or
// covering yesterday) is forgiven. Two consecutive missed days still reset.
// =============================================================================

export interface StreakResult {
  streak: number;
  graceUsed: boolean; // true when the 1-day freeze is holding the streak together
}

export function calculateStreakWithGrace(studyDays: string[] = [], today = new Date()): StreakResult {
  const daySet = new Set(studyDays);
  let graceUsed = false;

  // Find where the run starts: today, yesterday (not yet studied today), or —
  // by spending the grace day — the day before yesterday.
  let cursor: Date | null = null;
  for (let back = 0; back <= 2; back++) {
    const candidate = addDays(today, -back);
    if (daySet.has(localDateKey(candidate))) {
      cursor = candidate;
      if (back === 2) graceUsed = true; // yesterday was skipped, grace covers it
      break;
    }
  }
  if (!cursor) return { streak: 0, graceUsed: false };

  let count = 0;
  let date = cursor;
  while (true) {
    if (daySet.has(localDateKey(date))) {
      count += 1;
      date = addDays(date, -1);
      continue;
    }
    // Gap: forgive exactly one missing day per streak, if the day before it was studied.
    if (!graceUsed && daySet.has(localDateKey(addDays(date, -1)))) {
      graceUsed = true;
      date = addDays(date, -1);
      continue;
    }
    break;
  }
  return { streak: count, graceUsed };
}

// =============================================================================
// 3. Lesson path — ordered units inside each CEFR level
// -----------------------------------------------------------------------------
// Every level's library items are chunked into fixed units mixing all four
// skills. A unit unlocks once the previous one is passed (≥ UNIT_PASS_RATIO of
// its activities completed), giving the "Unit 3 of 7, locked until you pass
// Unit 2" progression. Activity ids match the ones recordStudyActivity writes.
// =============================================================================

export const UNIT_PASS_RATIO = 0.7;

// Per-unit chunk sizes (how many items of each skill a unit serves).
const UNIT_READING = 3;
const UNIT_LISTENING = 3;
const UNIT_SPEAKING = 2;
const UNIT_WRITING = 2;

export interface UnitActivity {
  activityId: string;
  tab: 'read' | 'listen' | 'speak' | 'write';
  itemId: number;
  title: string;
  titleMn: string;
}

export interface Unit {
  level: Level;
  index: number; // 0-based within the level
  title: string; // "1-р хэсэг" …
  activities: UnitActivity[];
}

// Mirror of App.tsx's activityKey() so unit ids line up with the activity log.
export function activityKey(prefix: string, value: string | number): string {
  return `${prefix}:${String(value).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 96)}`;
}

function chunk<T>(items: T[], size: number, unitIndex: number): T[] {
  return items.slice(unitIndex * size, unitIndex * size + size);
}

export function buildUnitsForLevel(level: Level): Unit[] {
  const reading = READING_LIBRARY.filter((i) => i.level === level);
  const listening = LISTENING_LIBRARY.filter((i) => i.level === level);
  const speaking = SPEAKING_LIBRARY.filter((i) => i.level === level);
  const writing = WRITING_LIBRARY.filter((i) => i.level === level);

  const unitCount = Math.max(
    Math.ceil(reading.length / UNIT_READING),
    Math.ceil(listening.length / UNIT_LISTENING),
    Math.ceil(speaking.length / UNIT_SPEAKING),
    Math.ceil(writing.length / UNIT_WRITING),
  );

  const units: Unit[] = [];
  for (let u = 0; u < unitCount; u++) {
    const activities: UnitActivity[] = [
      ...chunk(reading, UNIT_READING, u).map((i: ReadingItem): UnitActivity => ({
        activityId: activityKey('library:read', i.id), tab: 'read', itemId: i.id, title: i.title, titleMn: i.titleMn,
      })),
      ...chunk(listening, UNIT_LISTENING, u).map((i: ListeningItem): UnitActivity => ({
        activityId: activityKey('library:listen', i.id), tab: 'listen', itemId: i.id, title: i.title, titleMn: i.titleMn,
      })),
      ...chunk(speaking, UNIT_SPEAKING, u).map((i: SpeakingItem): UnitActivity => ({
        activityId: activityKey('speak', i.modelAnswer), tab: 'speak', itemId: i.id, title: i.title, titleMn: i.titleMn,
      })),
      ...chunk(writing, UNIT_WRITING, u).map((i: WritingItem): UnitActivity => ({
        activityId: activityKey(`write:${i.level}`, i.prompt), tab: 'write', itemId: i.id, title: i.title, titleMn: i.titleMn,
      })),
    ];
    if (activities.length === 0) continue;
    units.push({ level, index: u, title: `${u + 1}-р хэсэг`, activities });
  }
  return units;
}

export function unitProgress(unit: Unit, completed: Set<string>): { done: number; total: number } {
  const done = unit.activities.reduce((sum, a) => sum + (completed.has(a.activityId) ? 1 : 0), 0);
  return { done, total: unit.activities.length };
}

export function isUnitPassed(unit: Unit, completed: Set<string>): boolean {
  const { done, total } = unitProgress(unit, completed);
  return total > 0 && done / total >= UNIT_PASS_RATIO;
}

// Unit 1 is always open; unit N unlocks once unit N-1 is passed.
export function isUnitUnlocked(units: Unit[], index: number, completed: Set<string>): boolean {
  if (index <= 0) return true;
  return isUnitPassed(units[index - 1], completed);
}

// Set of library item ids the learner may not open yet (per skill, one level).
export function lockedItemIds(
  units: Unit[],
  completed: Set<string>,
): { read: Set<number>; listen: Set<number>; speak: Set<number>; write: Set<number> } {
  const locked = { read: new Set<number>(), listen: new Set<number>(), speak: new Set<number>(), write: new Set<number>() };
  units.forEach((unit, idx) => {
    if (isUnitUnlocked(units, idx, completed)) return;
    unit.activities.forEach((a) => locked[a.tab].add(a.itemId));
  });
  return locked;
}

// =============================================================================
// 4. Mistake log helpers
// -----------------------------------------------------------------------------
// Failed activity ids are stored on the profile (capped). The ids are the same
// `library:read:<id>` / `library:listen:<id>` keys the completion log uses, so
// a mistake can be mapped straight back to its library item for review.
// =============================================================================

export const MISTAKE_LOG_LIMIT = 100;

export function addMistake(mistakes: string[] = [], activityId: string): string[] {
  const next = [activityId, ...mistakes.filter((id) => id !== activityId)];
  return next.slice(0, MISTAKE_LOG_LIMIT);
}

export function clearMistake(mistakes: string[] = [], activityId: string): string[] {
  return mistakes.filter((id) => id !== activityId);
}

export interface MistakeRef {
  activityId: string;
  tab: 'read' | 'listen';
  itemId: number;
  title: string;
  titleMn: string;
  level: Level;
}

// Map stored mistake ids back to live library items (ignores ids that no longer resolve).
export function resolveMistakes(mistakes: string[] = []): MistakeRef[] {
  const out: MistakeRef[] = [];
  for (const id of mistakes) {
    const readMatch = id.match(/^library:read:(\d+)$/);
    const listenMatch = id.match(/^library:listen:(\d+)$/);
    if (readMatch) {
      const item = READING_LIBRARY.find((r) => r.id === Number(readMatch[1]));
      if (item) out.push({ activityId: id, tab: 'read', itemId: item.id, title: item.title, titleMn: item.titleMn, level: item.level });
    } else if (listenMatch) {
      const item = LISTENING_LIBRARY.find((l) => l.id === Number(listenMatch[1]));
      if (item) out.push({ activityId: id, tab: 'listen', itemId: item.id, title: item.title, titleMn: item.titleMn, level: item.level });
    }
  }
  return out;
}

// =============================================================================
// 5. "Today's Session" picker
// -----------------------------------------------------------------------------
// One reading + one listening + one speaking item the learner hasn't completed,
// at their target level (falling back to other levels once exhausted), plus the
// vocabulary review load. Mistakes are listed separately by the dashboard.
// =============================================================================

export interface TodaySession {
  reading: ReadingItem | null;
  listening: ListeningItem | null;
  speaking: SpeakingItem | null;
  dueWordCount: number;
}

function pickNext<T extends { id: number; level: Level }>(
  items: T[],
  level: string,
  isCompleted: (item: T) => boolean,
): T | null {
  const atLevel = items.filter((i) => i.level === level && !isCompleted(i));
  if (atLevel.length > 0) return atLevel[0];
  const anywhere = items.filter((i) => !isCompleted(i));
  return anywhere[0] ?? null;
}

export function buildTodaySession(
  targetLevel: string,
  completed: Set<string>,
  srs: SrsMap,
  trainerWords: VocabularyWord[],
  todayKey = localDateKey(),
): TodaySession {
  return {
    reading: pickNext(READING_LIBRARY, targetLevel, (i) => completed.has(activityKey('library:read', i.id))),
    listening: pickNext(LISTENING_LIBRARY, targetLevel, (i) => completed.has(activityKey('library:listen', i.id))),
    speaking: pickNext(SPEAKING_LIBRARY, targetLevel, (i) => completed.has(activityKey('speak', i.modelAnswer))),
    dueWordCount: countDueWords(trainerWords, srs, todayKey),
  };
}
