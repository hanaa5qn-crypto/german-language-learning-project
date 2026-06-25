// =============================================================================
// IELTS — Reading practice tab.
// -----------------------------------------------------------------------------
// Reuses the shared READING_LIBRARY, filters passages by CEFR level, and renders
// a passage alongside its MCQs with grading. Mirrors the IELTS Academic Reading
// experience (academic passages + comprehension questions).
// =============================================================================
import React, { useMemo, useState } from 'react';
import { BookOpen, ListChecks, RotateCcw, ChevronLeft } from 'lucide-react';
import { READING_LIBRARY } from '../../content';
import { ReadingItem, EnglishLevel } from '../../types';
import { McqBlock, LevelFilter, ScoreBanner, IELTS_LEVELS } from './quizKit';
import { useEnglishStats } from '../../stats';
import { enActivityKey } from '../../englishLearning';

export default function IeltsReadingTab() {
  const { recordStudy, recordEnglishActivity } = useEnglishStats();
  const [level, setLevel] = useState<EnglishLevel | 'all'>('B2');
  const [active, setActive] = useState<ReadingItem | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  // IELTS reading sits at B1+; keep the academic-leaning passages.
  const passages = useMemo(() => {
    const pool = READING_LIBRARY.filter((p) => IELTS_LEVELS.includes(p.level));
    return level === 'all' ? pool : pool.filter((p) => p.level === level);
  }, [level]);

  function open(item: ReadingItem) {
    setActive(item);
    setAnswers({});
    setSubmitted(false);
  }
  function reset() {
    setAnswers({});
    setSubmitted(false);
  }

  const correctCount = active
    ? active.questions.reduce((n, q) => n + (answers[q.id] === q.correctIndex ? 1 : 0), 0)
    : 0;
  const allAnswered = active ? active.questions.every((q) => answers[q.id] !== undefined) : false;

  if (active) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <button
          onClick={() => setActive(null)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-paper-2 hover:text-paper"
        >
          <ChevronLeft className="w-4 h-4" /> Бүх эх бичвэр рүү буцах
        </button>

        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="rounded-full bg-ink-2 text-paper px-2.5 py-0.5 text-xs font-bold">
              {active.level}
            </span>
            <span className="text-xs text-paper-2">{active.topic}</span>
          </div>
          <h2 className="text-2xl font-serif font-light tracking-tight text-paper">{active.title}</h2>
        </div>

        <article className="rounded-2xl bg-ink-raise p-5 leading-relaxed whitespace-pre-line text-paper">
          {active.text}
        </article>

        <div className="space-y-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-paper">
            <ListChecks className="w-5 h-5 text-paper" /> Асуултууд
          </h3>
          {active.questions.map((q, i) => (
            <McqBlock
              key={q.id}
              q={q}
              index={i}
              selected={answers[q.id]}
              submitted={submitted}
              onPick={(choice) => setAnswers((prev) => ({ ...prev, [q.id]: choice }))}
            />
          ))}
        </div>

        {submitted ? (
          <div className="space-y-3">
            <ScoreBanner correct={correctCount} total={active.questions.length} />
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-full bg-ink-2 text-paper px-5 py-2.5 font-semibold hover:bg-ink-raise"
            >
              <RotateCcw className="w-4 h-4" /> Дахин оролдох
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setSubmitted(true);
              recordStudy();
              // Feed the dashboard: completed + (mistake if < 60% correct).
              if (active) {
                const pass = active.questions.length > 0 && correctCount / active.questions.length >= 0.6;
                recordEnglishActivity(enActivityKey('read', active.id), pass);
              }
            }}
            disabled={!allAnswered}
            className="rounded-full bg-paper text-ink px-6 py-3 font-bold disabled:opacity-40"
          >
            Хариуг шалгах
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-light tracking-tight text-paper flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-paper" /> Reading practice
        </h2>
        <p className="text-paper-2 mt-1">
          Эрдэм шинжилгээний эх бичвэр уншиж, ойлгосноо асуултаар шалгаарай.
        </p>
      </div>

      <LevelFilter levels={IELTS_LEVELS} active={level} onChange={setLevel} />

      <div className="grid gap-3 sm:grid-cols-2">
        {passages.map((p) => (
          <button
            key={p.id}
            onClick={() => open(p)}
            className="text-left rounded-2xl bg-ink-raise hover:bg-ink-2 p-5 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="rounded-full bg-ink-2 text-paper px-2.5 py-0.5 text-xs font-bold">
                {p.level}
              </span>
              <span className="text-xs text-paper-2">{p.topic}</span>
            </div>
            <h3 className="font-bold text-paper">{p.title}</h3>
            <p className="text-sm text-paper-2 mt-1">
              {p.questions.length} асуулт
            </p>
          </button>
        ))}
      </div>

      {passages.length === 0 && (
        <p className="text-paper-2">Энэ түвшинд эх бичвэр алга байна.</p>
      )}
    </div>
  );
}
