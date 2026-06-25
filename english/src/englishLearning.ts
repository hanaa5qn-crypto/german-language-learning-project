// =============================================================================
// English track — learning engine (Today's Session · mistakes · path · curve).
// -----------------------------------------------------------------------------
// The English equivalent of ../../frontend/src/learning.ts. Pure, deterministic
// logic over the English study library (content/) that powers the German-parity
// dashboard: which lessons to do today, where the learner made mistakes, the
// per-level lesson path, the study-hours curve, and an accurate adaptive CEFR
// placement built from the library's graded multiple-choice questions.
// No React, no Firebase — everything here is testable in isolation.
// =============================================================================
import {
  READING_LIBRARY, LISTENING_LIBRARY, WRITING_LIBRARY, SPEAKING_LIBRARY, VOCAB,
} from './content';
import type {
  ReadingItem, ListeningItem, WritingItem, SpeakingItem, EnglishLevel, MCQ,
} from './types';
import { localDateKey, addDays } from '../../frontend/src/learning';
import { advanceDifficulty, estimateLevel } from '../../frontend/src/placement';

// CEFR ladder, easiest → hardest. Identical to the German ladder so the shared
// placement staircase helpers (advanceDifficulty/estimateLevel) apply directly.
export const EN_LEVEL_ORDER: EnglishLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export type EnSkill = 'read' | 'listen' | 'write' | 'speak';

// Stable activity id used by the completion log + mistake log. The English quiz
// tabs call recordEnglishActivity() with the matching id.
export function enActivityKey(skill: EnSkill, itemId: number): string {
  return `en:${skill}:${itemId}`;
}

// =============================================================================
// 1. Progress + "what did I cover"
// =============================================================================

// Progress is measured over the auto-scored skills (reading + listening), the
// ones whose completion the quiz tabs record objectively. Writing & speaking
// are self-assessed, so they appear as Today's Session suggestions but don't
// gate progress or the lesson path.
export const EN_TRACKABLE_TOTAL = READING_LIBRARY.length + LISTENING_LIBRARY.length;

export function englishProgressPercent(completedIds: string[] = []): number {
  if (EN_TRACKABLE_TOTAL === 0) return 0;
  const done = new Set(completedIds).size;
  return Math.min(100, Math.round((done / EN_TRACKABLE_TOTAL) * 100));
}

// =============================================================================
// 2. "Today's Session" picker — one item per skill at the learner's level,
//    falling back to any level once a skill is exhausted at the target level.
// =============================================================================
export interface EnglishTodaySession {
  reading: ReadingItem | null;
  listening: ListeningItem | null;
  writing: WritingItem | null;
  speaking: SpeakingItem | null;
  vocabCount: number; // words available to review at the target level
}

function pickNext<T extends { id: number; level: EnglishLevel }>(
  items: T[],
  level: string,
  completed: Set<string>,
  skill: EnSkill,
): T | null {
  const isDone = (i: T) => completed.has(enActivityKey(skill, i.id));
  const atLevel = items.filter((i) => i.level === level && !isDone(i));
  if (atLevel.length > 0) return atLevel[0];
  const anywhere = items.filter((i) => !isDone(i));
  return anywhere[0] ?? null;
}

export function buildEnglishToday(
  targetLevel: string,
  completedIds: string[] = [],
): EnglishTodaySession {
  const completed = new Set(completedIds);
  return {
    reading: pickNext(READING_LIBRARY, targetLevel, completed, 'read'),
    listening: pickNext(LISTENING_LIBRARY, targetLevel, completed, 'listen'),
    writing: pickNext(WRITING_LIBRARY, targetLevel, completed, 'write'),
    speaking: pickNext(SPEAKING_LIBRARY, targetLevel, completed, 'speak'),
    vocabCount: VOCAB.filter((w) => w.level === targetLevel).length,
  };
}

// =============================================================================
// 3. Mistake log — failed reading/listening activity ids map back to library
//    items (writing/speaking are self-assessed, so they aren't auto-logged).
// =============================================================================
export const EN_MISTAKE_LIMIT = 100;

export function addEnglishMistake(mistakes: string[] = [], activityId: string): string[] {
  return [activityId, ...mistakes.filter((id) => id !== activityId)].slice(0, EN_MISTAKE_LIMIT);
}

export function clearEnglishMistake(mistakes: string[] = [], activityId: string): string[] {
  return mistakes.filter((id) => id !== activityId);
}

export interface EnglishMistakeRef {
  activityId: string;
  skill: 'read' | 'listen';
  itemId: number;
  title: string;
  level: EnglishLevel;
}

export function resolveEnglishMistakes(mistakes: string[] = []): EnglishMistakeRef[] {
  const out: EnglishMistakeRef[] = [];
  for (const id of mistakes) {
    const read = id.match(/^en:read:(\d+)$/);
    const listen = id.match(/^en:listen:(\d+)$/);
    if (read) {
      const item = READING_LIBRARY.find((r) => r.id === Number(read[1]));
      if (item) out.push({ activityId: id, skill: 'read', itemId: item.id, title: item.title, level: item.level });
    } else if (listen) {
      const item = LISTENING_LIBRARY.find((l) => l.id === Number(listen[1]));
      if (item) out.push({ activityId: id, skill: 'listen', itemId: item.id, title: item.title, level: item.level });
    }
  }
  return out;
}

// =============================================================================
// 4. Lesson path — ordered units inside each CEFR level (gated progression).
// =============================================================================
export const EN_UNIT_PASS_RATIO = 0.7;
// Units chunk the auto-scored skills (reading + listening) so a unit can always
// be completed from the quiz tabs and the path never stalls on self-assessed work.
const UNIT_READING = 2, UNIT_LISTENING = 2;

export interface EnUnitActivity {
  activityId: string;
  skill: EnSkill;
  itemId: number;
  title: string;
}
export interface EnUnit {
  level: EnglishLevel;
  index: number;
  title: string;
  activities: EnUnitActivity[];
}

function chunk<T>(items: T[], size: number, unitIndex: number): T[] {
  return items.slice(unitIndex * size, unitIndex * size + size);
}

export function buildEnglishUnits(level: string): EnUnit[] {
  const lvl = level as EnglishLevel;
  const reading = READING_LIBRARY.filter((i) => i.level === lvl);
  const listening = LISTENING_LIBRARY.filter((i) => i.level === lvl);

  const unitCount = Math.max(
    Math.ceil(reading.length / UNIT_READING),
    Math.ceil(listening.length / UNIT_LISTENING),
    1,
  );

  const units: EnUnit[] = [];
  for (let u = 0; u < unitCount; u++) {
    const activities: EnUnitActivity[] = [
      ...chunk(reading, UNIT_READING, u).map((i: ReadingItem): EnUnitActivity => ({
        activityId: enActivityKey('read', i.id), skill: 'read', itemId: i.id, title: i.title,
      })),
      ...chunk(listening, UNIT_LISTENING, u).map((i: ListeningItem): EnUnitActivity => ({
        activityId: enActivityKey('listen', i.id), skill: 'listen', itemId: i.id, title: i.title,
      })),
    ];
    if (activities.length === 0) continue;
    units.push({ level: lvl, index: u, title: `Unit ${u + 1}`, activities });
  }
  return units;
}

export function enUnitProgress(unit: EnUnit, completed: Set<string>): { done: number; total: number } {
  const done = unit.activities.reduce((s, a) => s + (completed.has(a.activityId) ? 1 : 0), 0);
  return { done, total: unit.activities.length };
}
export function enUnitPassed(unit: EnUnit, completed: Set<string>): boolean {
  const { done, total } = enUnitProgress(unit, completed);
  return total > 0 && done / total >= EN_UNIT_PASS_RATIO;
}
export function enUnitUnlocked(units: EnUnit[], index: number, completed: Set<string>): boolean {
  if (index <= 0) return true;
  return enUnitPassed(units[index - 1], completed);
}

// =============================================================================
// 5. Study-hours curve — current week (Mon–Sun) from the English seconds map.
// =============================================================================
const EN_DAY_LABELS = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'];

export interface CurvePoint { day: string; hours: number }

export function buildEnglishCurve(
  studySecondsByDateEn: Record<string, number> = {},
  today = new Date(),
): CurvePoint[] {
  const monday = addDays(today, -((today.getDay() + 6) % 7)); // Mon=0 … Sun=6
  return EN_DAY_LABELS.map((label, i) => {
    const seconds = studySecondsByDateEn[localDateKey(addDays(monday, i))] ?? 0;
    return { day: label, hours: Math.round((seconds / 3600) * 10) / 10 };
  });
}

// =============================================================================
// 6. Personalized advice — tailored to the learner's level + stated goal.
// =============================================================================
export function englishSuggestions(level: string, learningGoal = ''): string[] {
  const goal = learningGoal.toLowerCase();
  const tips: string[] = [];

  if (goal.includes('ielts') || goal.includes('айлтс')) {
    tips.push('IELTS Writing Task 2-т өдөр бүр нэг эссэ бичиж, AI-аас Монгол хэлээр засвар аваарай.');
    tips.push('Сонсох хэсэгт British аялгатай аудиог 1.0x хурдаар сонсож, note-completion дасгал хийгээрэй.');
  } else if (goal.includes('sat') || goal.includes('сат')) {
    tips.push('SAT Reading & Writing модулийн цаг хэмжсэн дасгалыг долоо хоногт 2 удаа өгөөрэй.');
    tips.push('Math хэсэгт алдаа гаргасан асуулт бүрийн тайлбарыг уншиж, ижил төрлийг дахин хийгээрэй.');
  } else {
    tips.push(`${level} түвшний унших, сонсох дасгалыг өдөр бүр хослуулан хийгээрэй.`);
    tips.push('Шинэ үг бүрийг жишээ өгүүлбэртэй нь цээжилж, флэшкартаар тогтмол сэргээгээрэй.');
  }
  tips.push(`Алдаа гаргасан дасгалаа "Миний алдаанууд" хэсгээс дахин хийж, ${level} түвшний эзэмшилтээ бататгаарай.`);
  return tips.slice(0, 3);
}

// =============================================================================
// 7. Adaptive CEFR placement — built from the library's graded MCQs.
// -----------------------------------------------------------------------------
// Reading + Listening only (the objectively scorable skills). Difficulty walks
// a staircase: STREAK_TO_LEVEL_UP correct in a row → one level harder; a miss →
// one level easier. The final level is the highest the learner held steadily.
// =============================================================================
export const EN_PLACEMENT_TOTAL = 24;
export const EN_PLACEMENT_SEQUENCE: ('read' | 'listen')[] =
  ['read', 'listen', 'read', 'listen'];

export interface EnPlacementQuestion {
  id: string;
  level: EnglishLevel;
  skill: 'read' | 'listen';
  title: string;
  passage?: string;
  transcript?: string;
  question: string;
  choices: string[];
  correctIndex: number;
}

function buildPlacementPool(): Record<EnglishLevel, Record<'read' | 'listen', EnPlacementQuestion[]>> {
  const pool = {} as Record<EnglishLevel, Record<'read' | 'listen', EnPlacementQuestion[]>>;
  for (const level of EN_LEVEL_ORDER) {
    const read: EnPlacementQuestion[] = [];
    READING_LIBRARY.filter((i) => i.level === level).forEach((item) => {
      item.questions.forEach((q: MCQ) => {
        read.push({
          id: `enpl_read_${item.id}_${q.id}`, level, skill: 'read', title: item.title,
          passage: item.text, question: q.question, choices: q.choices, correctIndex: q.correctIndex,
        });
      });
    });
    const listen: EnPlacementQuestion[] = [];
    LISTENING_LIBRARY.filter((i) => i.level === level).forEach((item) => {
      item.questions.forEach((q: MCQ) => {
        listen.push({
          id: `enpl_listen_${item.id}_${q.id}`, level, skill: 'listen', title: item.title,
          transcript: item.transcript, question: q.question, choices: q.choices, correctIndex: q.correctIndex,
        });
      });
    });
    pool[level] = { read, listen };
  }
  return pool;
}

export const EN_PLACEMENT_POOL = buildPlacementPool();

// Nearest unused question for a skill, searching the target level first, then
// fanning out to easier levels before harder ones (gentle on over-reach).
export function pickEnglishPlacementQuestion(
  skill: 'read' | 'listen',
  levelIndex: number,
  usedIds: ReadonlySet<string>,
): EnPlacementQuestion | null {
  for (let distance = 0; distance < EN_LEVEL_ORDER.length; distance++) {
    for (const idx of [levelIndex - distance, levelIndex + distance]) {
      if (idx < 0 || idx >= EN_LEVEL_ORDER.length) continue;
      const found = EN_PLACEMENT_POOL[EN_LEVEL_ORDER[idx]][skill].find((q) => !usedIds.has(q.id));
      if (found) return found;
    }
  }
  return null;
}

export { advanceDifficulty };

export interface EnPlacementAnswer {
  questionId: string;
  skill: 'read' | 'listen';
  level: EnglishLevel;
  correct: boolean;
}

export interface EnglishPlacementResult {
  takenAt: string;
  level: EnglishLevel;
  totalCorrect: number;
  totalQuestions: number;
  skillScores: Record<string, { correct: number; total: number }>;
}

export function scoreEnglishPlacement(answers: EnPlacementAnswer[]): EnglishPlacementResult {
  const skillScores: Record<string, { correct: number; total: number }> = {
    read: { correct: 0, total: 0 },
    listen: { correct: 0, total: 0 },
  };
  const levelStats: Record<string, { asked: number; correct: number }> = {};
  let totalCorrect = 0;
  for (const a of answers) {
    skillScores[a.skill].total += 1;
    const stat = (levelStats[a.level] ??= { asked: 0, correct: 0 });
    stat.asked += 1;
    if (a.correct) {
      skillScores[a.skill].correct += 1;
      stat.correct += 1;
      totalCorrect += 1;
    }
  }
  return {
    takenAt: new Date().toISOString(),
    level: estimateLevel(levelStats) as EnglishLevel,
    totalCorrect,
    totalQuestions: answers.length,
    skillScores,
  };
}
