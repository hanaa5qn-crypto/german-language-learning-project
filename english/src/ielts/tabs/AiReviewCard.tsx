// =============================================================================
// IELTS tabs — shared AI review renderer.
// -----------------------------------------------------------------------------
// Renders the AiReview returned by reviewWriting / reviewSpeaking. All learner-
// facing text (feedbackMessage, explanation, strengths, improvements) is in
// MONGOLIAN; the `improved` answer stays in English. Used by both the Writing
// and Speaking tabs so the feedback layout is identical.
// =============================================================================
import React from 'react';
import { Award, Sparkles, ThumbsUp, Wrench, Info } from 'lucide-react';
import { AiReview } from '../../api';

export function AiReviewCard({ review }: { review: AiReview }) {
  return (
    <div className="rounded-2xl bg-ink-raise p-5 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-serif font-light tracking-tight text-paper flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-paper" />
          {review.feedbackMessage}
        </h3>
        {review.estimate && (
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-paper text-ink px-3 py-1.5 font-bold">
            <Award className="w-4 h-4" /> Band {review.estimate}
          </span>
        )}
      </div>

      {review.fallback && (
        <p className="text-xs text-paper-2 inline-flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" /> Энэ үнэлгээг локал жишгээр гаргалаа (AI тохируулаагүй).
        </p>
      )}

      {review.improved && (
        <div>
          <h4 className="text-sm font-bold text-paper-2 uppercase tracking-wide mb-2">
            Сайжруулсан хувилбар (English)
          </h4>
          <article className="rounded-xl bg-ink-2 p-4 leading-relaxed whitespace-pre-line text-paper">
            {review.improved}
          </article>
        </div>
      )}

      {review.explanation && (
        <div>
          <h4 className="text-sm font-bold text-paper-2 uppercase tracking-wide mb-2">
            Тайлбар
          </h4>
          <p className="leading-relaxed whitespace-pre-line text-paper">{review.explanation}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {review.strengths.length > 0 && (
          <div className="rounded-xl bg-paper text-ink p-4">
            <h4 className="font-bold mb-2 flex items-center gap-2">
              <ThumbsUp className="w-4 h-4" /> Давуу тал
            </h4>
            <ul className="space-y-1.5 text-sm list-disc pl-5">
              {review.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {review.improvements.length > 0 && (
          <div className="rounded-xl bg-ink-2 p-4">
            <h4 className="font-bold mb-2 flex items-center gap-2 text-paper">
              <Wrench className="w-4 h-4 text-paper" /> Сайжруулах зүйл
            </h4>
            <ul className="space-y-1.5 text-sm list-disc pl-5 text-paper">
              {review.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
