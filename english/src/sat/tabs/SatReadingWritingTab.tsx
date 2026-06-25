// =============================================================================
// SAT — Reading & Writing practice tab.
// -----------------------------------------------------------------------------
// Pulls every Reading & Writing question out of SAT_TESTS (sections where
// module === 'Reading and Writing') and folds in a few original drills, then
// groups them by the four RW domains with a domain filter. Each item renders a
// passage + 4-choice MCQ that grades in place with a worked explanation, via the
// shared SatPracticeCard.
// =============================================================================
import React, { useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { SAT_TESTS } from '../satTests';
import { SatQuestion, SatDomain } from '../../types';
import { SatPracticeCard, DomainFilter } from './satQuizKit';

// The four Reading & Writing domains, in their official testing order.
const RW_DOMAINS: SatDomain[] = [
  'Information and Ideas',
  'Craft and Structure',
  'Expression of Ideas',
  'Standard English Conventions',
];

// A few original RW drills to supplement the test bank (ids kept high to avoid
// colliding with the test questions when both are listed).
const RW_DRILLS: SatQuestion[] = [
  {
    id: 90001,
    domain: 'Craft and Structure',
    passage:
      'Although the new policy was ostensibly designed to benefit small farmers, its provisions overwhelmingly favored large agricultural corporations, leaving independent growers with little real support.',
    question:
      'As used in the text, what does the word "ostensibly" most nearly mean?',
    choices: ['Secretly', 'Apparently', 'Permanently', 'Reluctantly'],
    correctIndex: 1,
    explanation:
      '"Ostensibly" means in a way that appears or is claimed to be true but may not be. The contrast ("Although ... its provisions overwhelmingly favored large corporations") signals that the stated purpose differs from the actual effect, so "apparently" fits best.',
  },
  {
    id: 90002,
    domain: 'Information and Ideas',
    passage:
      'A study tracked two groups of city pigeons over three years. The first group nested near busy intersections; the second nested in quiet parks. Researchers found that pigeons from the busy intersections solved novel food-access puzzles 40 percent faster than the park pigeons.',
    question:
      'Which choice best states the main conclusion supported by the text?',
    choices: [
      'Pigeons prefer to nest near busy intersections.',
      'Park environments are healthier for pigeons than city streets.',
      'Exposure to a more complex environment may be associated with stronger problem-solving in pigeons.',
      'All pigeons can solve food-access puzzles equally well.',
    ],
    correctIndex: 2,
    explanation:
      'The data link the busier (more complex) environment to faster puzzle-solving. Choice C is the cautious conclusion the evidence supports. A, B, and D either go beyond the data or contradict it.',
  },
  {
    id: 90003,
    domain: 'Standard English Conventions',
    passage:
      'The committee reviewed the proposal carefully ____ it approved the budget only after several revisions.',
    question:
      'Which choice completes the text so that it conforms to the conventions of Standard English?',
    choices: [', and', ', but', '; however', ', so'],
    correctIndex: 0,
    explanation:
      'Two independent clauses ("The committee reviewed ..." and "it approved ...") joined by a coordinating conjunction take a comma before the conjunction. The ideas add to each other rather than contrast, so ", and" is correct. ", but" and "; however" wrongly signal contrast; ", so" implies cause that the sentence does not support.',
  },
  {
    id: 90004,
    domain: 'Expression of Ideas',
    passage:
      'A student is writing a report and wants to introduce a statistic. Note 1: A 2022 survey covered 1,200 households. Note 2: 68 percent reported recycling weekly. Note 3: The figure was up from 51 percent in 2015.',
    question:
      'The student wants to emphasize the change in recycling rates over time. Which choice most effectively uses the notes to accomplish this goal?',
    choices: [
      'A 2022 survey covered 1,200 households.',
      'In a 2022 survey, 68 percent of households reported recycling weekly.',
      'Weekly recycling rose from 51 percent of households in 2015 to 68 percent in 2022.',
      'Recycling is an increasingly common household habit.',
    ],
    correctIndex: 2,
    explanation:
      'The goal is to emphasize change over time, so the answer must include both years and both percentages. Only choice C contrasts 51 percent (2015) with 68 percent (2022). The others give a single snapshot or a vague claim.',
  },
];

export default function SatReadingWritingTab() {
  const [domain, setDomain] = useState<SatDomain | 'all'>('all');

  // Collect all RW questions from the test bank plus the original drills.
  const all = useMemo<SatQuestion[]>(() => {
    const fromTests = SAT_TESTS.flatMap((t) =>
      t.sections
        .filter((s) => s.module === 'Reading and Writing')
        .flatMap((s) => s.questions),
    );
    return [...fromTests, ...RW_DRILLS];
  }, []);

  const visible = useMemo(
    () => (domain === 'all' ? all : all.filter((q) => q.domain === domain)),
    [all, domain],
  );

  // Group the visible questions by domain for sectioned display.
  const groups = useMemo(() => {
    return RW_DOMAINS.map((d) => ({
      domain: d,
      questions: visible.filter((q) => q.domain === d),
    })).filter((g) => g.questions.length > 0);
  }, [visible]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-light tracking-tight text-paper flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-paper" /> Reading & Writing
        </h2>
        <p className="text-paper-2 mt-1">
          Дөрвөн домэйнаар ангилсан {all.length} дасгал — богино эх бичвэр уншаад
          хариулж, тайлбарыг үзээрэй.
        </p>
      </div>

      <DomainFilter domains={RW_DOMAINS} active={domain} onChange={setDomain} />

      {groups.length === 0 ? (
        <p className="text-paper-2">Энэ домэйнд асуулт алга байна.</p>
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
