// =============================================================================
// IELTS — Writing practice tab.
// -----------------------------------------------------------------------------
// Original IELTS-style Writing prompts: Academic Task 1 (describe a visual) and
// Task 2 (essay). A textarea with a live word counter (min 150 / 250), a model
// answer reveal, and an AI feedback button that calls reviewWriting (exam:
// 'ielts') and renders the Mongolian AiReview via the shared card.
// =============================================================================
import React, { useMemo, useState } from 'react';
import {
  Edit3, Eye, EyeOff, Sparkles, Loader2, AlertCircle, BarChart3, PenLine,
} from 'lucide-react';
import { reviewWriting, AiReview } from '../../api';
import { AiReviewCard } from './AiReviewCard';
import { useEnglishStats } from '../../stats';

interface IeltsWritingPrompt {
  id: string;
  task: 1 | 2;
  label: string;
  title: string;
  prompt: string;
  visual?: string;
  minWords: number;
  modelAnswer: string;
}

const PROMPTS: IeltsWritingPrompt[] = [
  {
    id: 't1-a',
    task: 1,
    label: 'Academic Task 1',
    title: 'Household energy use',
    prompt:
      'The bar chart below shows the average household electricity consumption (in kWh per month) of four countries in 2005 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant. Write at least 150 words.',
    visual:
      'Bar chart — four countries (Norway, Canada, Japan, Brazil). In 2005 Norway was highest at about 1,200 kWh; Brazil lowest at about 250 kWh. By 2020 every country fell except Brazil, which rose to about 400 kWh; Norway dropped to roughly 950 kWh.',
    minWords: 150,
    modelAnswer:
      'The bar chart compares the average monthly household electricity use, measured in kilowatt-hours, across four countries in 2005 and 2020.\n\nOverall, consumption fell in three of the four nations over the period, with Norway remaining the heaviest user throughout, while Brazil was the only country to record an increase.\n\nIn 2005, Norwegian households consumed by far the most electricity, at around 1,200 kWh per month, followed by Canada at roughly 900 kWh. Japanese homes used about 600 kWh, whereas Brazilian households used the least, at approximately 250 kWh.\n\nBy 2020, the figures for Norway and Canada had declined to about 950 and 750 kWh respectively, and Japan had also fallen, to around 500 kWh. Brazil, in contrast, bucked this trend, climbing to roughly 400 kWh. Despite this rise, Brazil still consumed considerably less than the other three countries, and the overall gap between the highest and lowest users narrowed slightly.',
  },
  {
    id: 't1-b',
    task: 1,
    label: 'Academic Task 1',
    title: 'Coffee shop process',
    prompt:
      'The diagram below shows the stages in the commercial production of instant coffee. Summarise the information by selecting and reporting the main features. Write at least 150 words.',
    visual:
      'Process diagram with seven stages: harvesting cherries → drying and hulling beans → roasting → grinding → brewing a concentrate → freeze-drying into granules → packaging and distribution.',
    minWords: 150,
    modelAnswer:
      'The diagram illustrates the process by which instant coffee is manufactured commercially, from the picking of the raw fruit through to the packaging of the finished product.\n\nOverall, there are seven distinct stages, beginning with a natural agricultural step and ending with an industrial one; the process is linear, with the output of each stage feeding directly into the next.\n\nTo begin with, ripe coffee cherries are harvested from the plant and then dried and hulled to remove the outer layers and expose the green beans. These beans are subsequently roasted at high temperature, which develops their flavour and colour, before being ground into a fine powder.\n\nIn the following stage, the ground coffee is brewed with hot water to create a concentrated liquid. This concentrate is then freeze-dried, a step that removes the moisture and leaves behind solid granules. Finally, the granules are sealed into jars and packaged, after which they are ready for distribution to shops.',
  },
  {
    id: 't2-a',
    task: 2,
    label: 'Task 2 essay',
    title: 'Remote work',
    prompt:
      'Some people believe that working from home benefits both employees and society, while others argue it has serious drawbacks. Discuss both views and give your own opinion. Write at least 250 words.',
    minWords: 250,
    modelAnswer:
      'The rise of reliable internet connections has made working from home a realistic option for millions of people. While some regard this shift as overwhelmingly positive, others point to significant disadvantages. In my view, the benefits outweigh the drawbacks, provided that companies manage the change carefully.\n\nThose who support remote work highlight several clear advantages. Most obviously, employees save the time and money once lost to commuting, which can instead be devoted to family or rest. This flexibility often improves both wellbeing and productivity. Society benefits too, as fewer cars on the road reduce traffic congestion and air pollution, while rural areas may be revived as workers no longer need to live near city offices.\n\nNevertheless, the critics raise valid concerns. Working from home can blur the line between professional and personal life, leaving some people unable to switch off and increasingly isolated from colleagues. Younger staff, in particular, may struggle to learn from experienced co-workers when contact is limited to video calls, and weaker teamwork can ultimately harm a company.\n\nOn balance, however, I believe these problems are manageable rather than fundamental. Firms can offer hybrid arrangements that combine the focus of home with the collaboration of the office, and clear boundaries can protect employees from overwork. The environmental and personal gains are too substantial to ignore.\n\nIn conclusion, although remote work brings genuine challenges around isolation and training, its advantages for individuals and for society are considerable. With sensible policies, organisations can capture these benefits while minimising the costs.',
  },
  {
    id: 't2-b',
    task: 2,
    label: 'Task 2 essay',
    title: 'Free university',
    prompt:
      'Some people think that university education should be free for all students, while others believe students should pay for it themselves. To what extent do you agree or disagree? Write at least 250 words.',
    minWords: 250,
    modelAnswer:
      'Whether higher education should be funded by the state or paid for by students is a question that divides opinion in many countries. Although free university has obvious appeal, I largely disagree that it should be free for everyone, and instead favour a system that targets support where it is most needed.\n\nThose who argue for free education make a powerful case. Removing tuition fees would open universities to talented students from poorer families, who might otherwise be deterred by the prospect of heavy debt. A more educated population, they add, benefits the whole of society through higher productivity and a stronger economy, so the cost is really an investment.\n\nHowever, there are serious problems with making education free for all. The expense would fall on taxpayers, many of whom never attend university and may resent subsidising those who go on to earn high salaries. Moreover, when something is free, it is often valued less; some students might enrol without commitment, wasting public resources. Universities themselves could also suffer if government funding fails to keep pace with rising costs.\n\nA fairer solution, in my opinion, is a means-tested system. Students from low-income backgrounds could study without charge, while wealthier families contribute, perhaps through income-linked repayments that only begin once graduates earn a decent wage. This approach preserves access for the disadvantaged without placing an unsustainable burden on the state.\n\nIn conclusion, while free education promotes equality, charging according to ability to pay is more sustainable and fair. Targeted support, rather than blanket funding, strikes the best balance.',
  },
];

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export default function IeltsWritingTab() {
  const { recordStudy, requirePractice } = useEnglishStats();
  const [selectedId, setSelectedId] = useState<string>(PROMPTS[0].id);
  const [answer, setAnswer] = useState('');
  const [showModel, setShowModel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [review, setReview] = useState<AiReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prompt = useMemo(
    () => PROMPTS.find((p) => p.id === selectedId) ?? PROMPTS[0],
    [selectedId],
  );
  const words = countWords(answer);
  const meetsMin = words >= prompt.minWords;

  function selectPrompt(id: string) {
    setSelectedId(id);
    setAnswer('');
    setShowModel(false);
    setReview(null);
    setError(null);
  }

  async function getFeedback() {
    if (!requirePractice()) return; // visitors/free can read the task, not submit
    setLoading(true);
    setError(null);
    setReview(null);
    try {
      const res = await reviewWriting({
        exam: 'ielts',
        task: `IELTS ${prompt.label}`,
        prompt: prompt.prompt,
        answer: answer.trim(),
      });
      setReview(res);
      recordStudy();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'AI үнэлгээ авахад алдаа гарлаа. Дахин оролдоно уу.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h2 className="text-2xl font-serif font-light tracking-tight text-paper flex items-center gap-2">
          <Edit3 className="w-6 h-6 text-paper" /> Writing practice
        </h2>
        <p className="text-paper-2 mt-1">
          Task 1 ба Task 2-ыг бичээд AI-аас Монгол хэлээр үнэлгээ аваарай.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {PROMPTS.map((p) => {
          const on = p.id === selectedId;
          return (
            <button
              key={p.id}
              onClick={() => selectPrompt(p.id)}
              className={[
                'rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                on
                  ? 'bg-paper text-ink'
                  : 'bg-ink-2 text-paper-2 hover:text-paper',
              ].join(' ')}
            >
              {p.label}: {p.title}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl bg-ink-raise p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-ink-2 text-paper px-2.5 py-0.5 text-xs font-bold">
            {prompt.label}
          </span>
          <span className="text-xs text-paper-2">Хамгийн багадаа {prompt.minWords} үг</span>
        </div>
        <p className="leading-relaxed text-paper">{prompt.prompt}</p>
        {prompt.visual && (
          <div className="rounded-xl bg-ink-2 p-4 text-sm text-paper flex gap-2">
            <BarChart3 className="w-4 h-4 text-paper shrink-0 mt-0.5" />
            <span><span className="font-semibold">Visual: </span>{prompt.visual}</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-paper">
          <PenLine className="w-4 h-4 text-paper" /> Таны хариулт
        </label>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          rows={12}
          placeholder="Эндээс бичиж эхэлнэ үү…"
          className="w-full rounded-2xl bg-ink-raise border border-ink-line p-4 text-paper placeholder:text-paper-2 focus:outline-none focus:border-paper leading-relaxed resize-y"
        />
        <div className="flex items-center justify-between text-sm">
          <span className={meetsMin ? 'text-paper-2' : 'text-paper-2'}>
            <span className={`font-bold ${meetsMin ? 'text-paper' : 'text-paper'}`}>{words}</span>
            {' '}/ {prompt.minWords} үг
          </span>
          {!meetsMin && words > 0 && (
            <span className="text-paper-2">Цөөн байна — үргэлжлүүлээрэй.</span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={getFeedback}
          disabled={loading || words === 0}
          className="inline-flex items-center gap-2 rounded-full bg-paper text-ink px-6 py-3 font-bold disabled:opacity-40"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? 'Үнэлж байна…' : 'Get AI feedback / AI үнэлгээ авах'}
        </button>
        <button
          onClick={() => setShowModel((s) => !s)}
          className="inline-flex items-center gap-2 rounded-full bg-ink-2 text-paper px-5 py-2.5 font-semibold hover:bg-ink-raise"
        >
          {showModel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showModel ? 'Жишээ хариулт нуух' : 'Show model answer'}
        </button>
      </div>

      {error && (
        <div className="rounded-2xl bg-ink-2 text-paper-2 p-4 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {review && <AiReviewCard review={review} />}

      {showModel && (
        <div className="rounded-2xl bg-ink-raise p-5">
          <h3 className="text-sm font-bold text-paper-2 uppercase tracking-wide mb-2">
            Band 9 жишээ хариулт
          </h3>
          <article className="leading-relaxed whitespace-pre-line text-paper">
            {prompt.modelAnswer}
          </article>
        </div>
      )}
    </div>
  );
}
