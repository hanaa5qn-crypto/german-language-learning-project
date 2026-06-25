// =============================================================================
// SAT tabs — shared practice-question rendering kit.
// -----------------------------------------------------------------------------
// A reusable card that grades a single SatQuestion in place: passage + 4-choice
// MCQ, OR a grid-in text input compared case/space-insensitively to
// gridInAnswer. Used by the Reading & Writing and Math practice tabs so the
// look-and-feel stays consistent. Pure presentation; no exam data here.
// =============================================================================
import React, { useState } from 'react';
import { CheckCircle2, XCircle, RotateCcw } from 'lucide-react';
import { SatQuestion } from '../../types';
import { useEnglishStats } from '../../stats';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

// A grid-in item is one with no choices array (student-produced response).
export function isGridIn(q: SatQuestion): boolean {
  return !q.choices || q.choices.length === 0;
}

// Normalise a free-text / grid-in answer for tolerant, case/space-insensitive
// comparison. Collapses numeric forms so ".5", "0.50" and "0.5" all match.
function normalise(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (t === '') return '';
  if (/^[-+]?[0-9.]+$/.test(t)) {
    const asNum = Number(t);
    if (!Number.isNaN(asNum)) return String(asNum);
  }
  return t;
}

export function gridInCorrect(q: SatQuestion, value: string): boolean {
  if (q.gridInAnswer === undefined) return false;
  return normalise(value) === normalise(q.gridInAnswer);
}

// A single self-grading SAT question (passage + MCQ or grid-in) with a worked
// explanation shown after answering.
export const SatPracticeCard: React.FC<{ q: SatQuestion; index: number }> = ({ q, index }) => {
  const { recordStudy } = useEnglishStats();
  const gridIn = isGridIn(q);
  const [picked, setPicked] = useState<number | undefined>(undefined);
  const [grid, setGrid] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const wasCorrect = gridIn
    ? gridInCorrect(q, grid)
    : picked !== undefined && picked === q.correctIndex;
  const canSubmit = gridIn ? grid.trim() !== '' : picked !== undefined;

  function reset() {
    setPicked(undefined);
    setGrid('');
    setSubmitted(false);
  }

  return (
    <div className="rounded-2xl bg-ink-raise p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-paper-2 font-semibold text-sm">
          {index + 1}.
        </span>
        <span className="text-xs font-medium text-paper-2">{q.domain}</span>
      </div>

      {q.passage && (
        <div className="rounded-xl bg-ink-raise p-4 mb-4 leading-relaxed whitespace-pre-line text-paper">
          {q.passage}
        </div>
      )}

      <p className="font-semibold text-paper mb-4 whitespace-pre-line">{q.question}</p>

      {gridIn ? (
        <div>
          <label className="block text-sm text-paper-2 mb-2">
            Enter your answer
          </label>
          <input
            type="text"
            inputMode="text"
            value={grid}
            disabled={submitted}
            onChange={(e) => setGrid(e.target.value)}
            placeholder="e.g. 12 or 3/4 or 0.5"
            className={[
              'w-full sm:w-64 rounded-xl border bg-ink-raise px-4 py-3 text-paper outline-none transition-colors',
              submitted
                ? wasCorrect
                  ? 'border-paper bg-paper text-ink'
                  : 'border-ink-line bg-ink-2 text-paper-2'
                : 'border-ink-line focus:border-paper',
            ].join(' ')}
          />
          {submitted && (
            <p className="mt-2 text-sm font-medium text-paper-2">
              {wasCorrect ? (
                <span className="inline-flex items-center gap-1.5 text-paper">
                  <CheckCircle2 className="w-4 h-4" /> Correct
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <XCircle className="w-4 h-4" /> Correct answer: {q.gridInAnswer}
                </span>
              )}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-2">
          {(q.choices ?? []).map((c, ci) => {
            const isPicked = picked === ci;
            const isAnswer = ci === q.correctIndex;
            const cls = [
              'flex items-start gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors',
              submitted && isAnswer
                ? 'border-paper bg-paper text-ink'
                : submitted && isPicked
                  ? 'border-ink-line bg-ink-2 text-paper-2'
                  : isPicked
                    ? 'border-paper bg-ink-2 text-paper'
                    : 'border-ink-line text-paper hover:border-paper/60',
            ].join(' ');
            return (
              <button
                key={ci}
                type="button"
                disabled={submitted}
                onClick={() => setPicked(ci)}
                className={cls}
              >
                <span className="mt-0.5 font-bold">{LETTERS[ci]}</span>
                <span className="flex-1 whitespace-pre-line">{c}</span>
                {submitted && isAnswer && <CheckCircle2 className="w-5 h-5 shrink-0" />}
                {submitted && isPicked && !isAnswer && <XCircle className="w-5 h-5 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        {!submitted ? (
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => { setSubmitted(true); recordStudy(); }}
            className="inline-flex items-center gap-2 rounded-full bg-paper text-ink px-5 py-2 text-sm font-semibold disabled:opacity-40"
          >
            <CheckCircle2 className="w-4 h-4" /> Check answer
          </button>
        ) : (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 rounded-full bg-ink-2 text-paper px-5 py-2 text-sm font-semibold hover:bg-ink-raise"
          >
            <RotateCcw className="w-4 h-4" /> Try again
          </button>
        )}
      </div>

      {submitted && q.explanation && (
        <div className="mt-3 rounded-xl bg-ink-raise p-4">
          <p className="text-xs font-bold text-paper uppercase tracking-wide mb-1">
            Тайлбар · Explanation
          </p>
          <p className="text-sm text-paper-2 leading-relaxed whitespace-pre-line">
            {q.explanation}
          </p>
        </div>
      )}
    </div>
  );
};

// Domain filter pill bar shared by the RW and Math practice tabs.
export function DomainFilter<T extends string>({
  domains,
  active,
  onChange,
}: {
  domains: T[];
  active: T | 'all';
  onChange: (d: T | 'all') => void;
}) {
  const options: (T | 'all')[] = ['all', ...domains];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const on = active === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={[
              'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
              on
                ? 'bg-paper text-ink'
                : 'bg-ink-2 text-paper-2 hover:text-paper',
            ].join(' ')}
          >
            {opt === 'all' ? 'Бүгд' : opt}
          </button>
        );
      })}
    </div>
  );
}
