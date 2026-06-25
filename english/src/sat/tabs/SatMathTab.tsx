// =============================================================================
// SAT — Math practice tab.
// -----------------------------------------------------------------------------
// Pulls every Math question out of SAT_TESTS (sections where module === 'Math')
// and folds in a few original drills, then groups them by the four Math domains
// with a domain filter. The shared SatPracticeCard handles BOTH multiple-choice
// items (choices + correctIndex) and grid-in items (no choices → text input
// compared case/space-insensitively to gridInAnswer), with worked explanations.
// =============================================================================
import React, { useMemo, useState } from 'react';
import { Sigma } from 'lucide-react';
import { SAT_TESTS } from '../satTests';
import { SatQuestion, SatDomain } from '../../types';
import { SatPracticeCard, DomainFilter } from './satQuizKit';

// The four Math domains, in their official testing order.
const MATH_DOMAINS: SatDomain[] = [
  'Algebra',
  'Advanced Math',
  'Problem-Solving and Data Analysis',
  'Geometry and Trigonometry',
];

// A few original Math drills to supplement the test bank, including a grid-in.
const MATH_DRILLS: SatQuestion[] = [
  {
    id: 91001,
    domain: 'Algebra',
    question: 'If 3x − 7 = 2x + 5, what is the value of x?',
    choices: ['−2', '5', '12', '−12'],
    correctIndex: 2,
    explanation:
      'Subtract 2x from both sides: x − 7 = 5. Add 7 to both sides: x = 12.',
  },
  {
    id: 91002,
    domain: 'Algebra',
    question:
      'A line passes through the points (0, 4) and (2, 10). What is the slope of the line?',
    choices: ['2', '3', '6', '7'],
    correctIndex: 1,
    explanation:
      'Slope = (y2 − y1) / (x2 − x1) = (10 − 4) / (2 − 0) = 6 / 2 = 3.',
  },
  {
    id: 91003,
    domain: 'Advanced Math',
    question:
      'If f(x) = x² − 5x + 6, what is one value of x for which f(x) = 0? (Grid-in)',
    gridInAnswer: '2',
    explanation:
      'Factor: x² − 5x + 6 = (x − 2)(x − 3). The zeros are x = 2 and x = 3. Either 2 or 3 is a valid grid-in answer; this drill checks 2.',
  },
  {
    id: 91004,
    domain: 'Problem-Solving and Data Analysis',
    question:
      'A jacket originally priced at $80 is on sale for 25 percent off. What is the sale price, in dollars? (Grid-in)',
    gridInAnswer: '60',
    explanation:
      '25 percent of 80 is 0.25 × 80 = 20. The sale price is 80 − 20 = 60 dollars.',
  },
  {
    id: 91005,
    domain: 'Geometry and Trigonometry',
    question:
      'A right triangle has legs of length 6 and 8. What is the length of the hypotenuse?',
    choices: ['10', '12', '14', '48'],
    correctIndex: 0,
    explanation:
      'By the Pythagorean theorem, hypotenuse = √(6² + 8²) = √(36 + 64) = √100 = 10.',
  },
];

export default function SatMathTab() {
  const [domain, setDomain] = useState<SatDomain | 'all'>('all');

  // Collect all Math questions from the test bank plus the original drills.
  const all = useMemo<SatQuestion[]>(() => {
    const fromTests = SAT_TESTS.flatMap((t) =>
      t.sections
        .filter((s) => s.module === 'Math')
        .flatMap((s) => s.questions),
    );
    return [...fromTests, ...MATH_DRILLS];
  }, []);

  const visible = useMemo(
    () => (domain === 'all' ? all : all.filter((q) => q.domain === domain)),
    [all, domain],
  );

  // Group the visible questions by domain for sectioned display.
  const groups = useMemo(() => {
    return MATH_DOMAINS.map((d) => ({
      domain: d,
      questions: visible.filter((q) => q.domain === d),
    })).filter((g) => g.questions.length > 0);
  }, [visible]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-light tracking-tight text-paper flex items-center gap-2">
          <Sigma className="w-6 h-6 text-paper" /> Math
        </h2>
        <p className="text-paper-2 mt-1">
          Дөрвөн домэйнаар ангилсан {all.length} дасгал — сонголттой болон нөхөх
          (grid-in) бодлогууд, бодолтын тайлбартай.
        </p>
      </div>

      <DomainFilter domains={MATH_DOMAINS} active={domain} onChange={setDomain} />

      {groups.length === 0 ? (
        <p className="text-paper-2">Энэ домэйнд бодлого алга байна.</p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.domain} className="space-y-4">
              <h3 className="text-lg font-bold text-paper flex items-center gap-2">
                <span className="h-5 w-1.5 rounded-full bg-paper" />
                {g.domain}
                <span className="text-sm font-normal text-paper-2">
                  · {g.questions.length}
                </span>
              </h3>
              <div className="space-y-4">
                {g.questions.map((q, i) => (
                  <SatPracticeCard key={q.id} q={q} index={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
