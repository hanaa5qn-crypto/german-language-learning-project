// =============================================================================
// SAT — Practice Tests tab.
// -----------------------------------------------------------------------------
// Lists the full Digital SAT practice tests and launches the shared
// SatTestRunner. Holds the selected-test state; onExit clears it and returns to
// the catalogue. Mirrors the IELTS tests tab.
// =============================================================================
import React, { useState } from 'react';
import { ClipboardList, BookOpen, Sigma, Layers, ArrowRight } from 'lucide-react';
import { SAT_TESTS } from '../satTests';
import SatTestRunner from '../SatTestRunner';
import { SatTest } from '../../types';

export default function SatTestsTab() {
  const [selected, setSelected] = useState<SatTest | null>(null);

  if (selected) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <SatTestRunner test={selected} onExit={() => setSelected(null)} />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-light tracking-tight text-paper flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-paper" /> Practice Tests
        </h2>
        <p className="text-paper-2 mt-1">
          Бүрэн Digital SAT дасгал шалгалт — Reading & Writing ба Math, тус бүр
          хоёр адаптив модультай, тооцоолсон оноотой.
        </p>
      </div>

      <div className="grid gap-4">
        {SAT_TESTS.map((t) => {
          const rwSections = t.sections.filter((s) => s.module === 'Reading and Writing');
          const mathSections = t.sections.filter((s) => s.module === 'Math');
          const totalQuestions = t.sections.reduce((n, s) => n + s.questions.length, 0);
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="group text-left rounded-2xl bg-ink-raise hover:bg-ink-2 p-5 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="rounded-full bg-ink-2 text-paper px-2.5 py-0.5 text-xs font-bold">
                  Digital SAT
                </span>
                <span className="text-xs text-paper-2">{t.source}</span>
              </div>
              <h3 className="text-lg font-bold text-paper">{t.title}</h3>
              <div className="flex flex-wrap gap-3 mt-3 text-sm text-paper-2">
                <span className="inline-flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4" /> Reading & Writing · {rwSections.length} modules
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Sigma className="w-4 h-4" /> Math · {mathSections.length} modules
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Layers className="w-4 h-4" /> {totalQuestions} questions
                </span>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-paper font-semibold">
                Шалгалт эхлүүлэх
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
