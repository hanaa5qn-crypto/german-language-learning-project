// =============================================================================
// IELTS tabs — shared MCQ / quiz rendering kit.
// -----------------------------------------------------------------------------
// Small reusable pieces used by the Reading and Listening practice tabs so the
// quiz look-and-feel stays consistent. Pure presentation; no exam data here.
// =============================================================================
import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { MCQ, EnglishLevel } from '../../types';

export const IELTS_LEVELS: EnglishLevel[] = ['A2', 'B1', 'B2', 'C1', 'C2'];

// A single multiple-choice question with grade-aware option styling.
export const McqBlock: React.FC<{
  q: MCQ;
  index: number;
  selected: number | undefined;
  submitted: boolean;
  onPick: (choice: number) => void;
}> = ({
  q,
  index,
  selected,
  submitted,
  onPick,
}) => {
  return (
    <div className="rounded-2xl bg-ink-raise p-4 sm:p-5">
      <p className="font-semibold mb-3 text-paper">
        <span className="text-paper-2 mr-2">{index + 1}.</span>
        {q.question}
      </p>
      <div className="grid gap-2">
        {q.choices.map((choice, ci) => {
          const picked = selected === ci;
          const isAnswer = ci === q.correctIndex;
          const cls = [
            'flex items-start gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors',
            submitted && isAnswer
              ? 'border-paper bg-paper text-ink'
              : submitted && picked
                ? 'border-ink-line bg-ink-2 text-paper-2'
                : picked
                  ? 'border-paper bg-ink-2 text-paper'
                  : 'border-ink-line text-paper hover:border-paper/60',
          ].join(' ');
          return (
            <button
              key={ci}
              type="button"
              disabled={submitted}
              onClick={() => onPick(ci)}
              className={cls}
            >
              <span className="mt-0.5 font-bold">{String.fromCharCode(65 + ci)}</span>
              <span className="flex-1">{choice}</span>
              {submitted && isAnswer && <CheckCircle2 className="w-5 h-5 shrink-0" />}
              {submitted && picked && !isAnswer && <XCircle className="w-5 h-5 shrink-0" />}
            </button>
          );
        })}
      </div>
      {submitted && q.explanation && (
        <p className="mt-3 text-sm text-paper-2">
          <span className="font-semibold text-paper">Тайлбар: </span>
          {q.explanation}
        </p>
      )}
    </div>
  );
};

// Level filter pill bar shared by reading/listening/vocab tabs.
export function LevelFilter({
  levels,
  active,
  onChange,
  includeAll = true,
}: {
  levels: EnglishLevel[];
  active: EnglishLevel | 'all';
  onChange: (lvl: EnglishLevel | 'all') => void;
  includeAll?: boolean;
}) {
  const options: (EnglishLevel | 'all')[] = includeAll ? ['all', ...levels] : [...levels];
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

// Small score banner shown after grading a quiz.
export function ScoreBanner({ correct, total }: { correct: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((correct / total) * 100);
  return (
    <div className="rounded-2xl bg-paper text-ink px-5 py-4 flex items-center justify-between">
      <span className="font-bold text-lg">
        {correct} / {total} зөв
      </span>
      <span className="text-sm font-semibold">{pct}%</span>
    </div>
  );
}
