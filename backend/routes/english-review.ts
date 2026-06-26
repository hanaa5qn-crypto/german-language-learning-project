// =============================================================================
// English track — AI review endpoints (IELTS / SAT writing & speaking).
// -----------------------------------------------------------------------------
// Powered by Gemini. The audience is Mongolian learners, so every learner-facing
// text field (feedbackMessage, explanation, strengths, improvements) is returned
// in MONGOLIAN, while `improved` is an English model rewrite. Matches the client
// contract in english/src/api.ts (AiReview). Like the German AI routes, these
// endpoints are gated by checkAiAccess (verified Firebase user + metered monthly
// quota) so the paid Gemini model can't be driven by anonymous callers. When AI
// is unavailable we still return HTTP 200 with a graceful fallback.
// =============================================================================
import { Type } from '@google/genai';
import type { Express } from 'express';
import { aiClientWithinBudget, audioTooLarge, clampText, clientIp, consumeBudget, rateLimited } from '../lib/aiGuard';
import { generateContentWithRetry, isGeminiConfigured, getModel } from '../lib/ai';
import { checkAiAccess } from '../lib/plans';

type ExamKind = 'ielts' | 'sat';

// Shared JSON shape for both reviews. `estimate` is optional in the contract but
// we still let the model fill it (band/label). `improved` stays in English; the
// rest is Mongolian.
const REVIEW_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    feedbackMessage: { type: Type.STRING },
    estimate: { type: Type.STRING },
    improved: { type: Type.STRING },
    explanation: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['feedbackMessage', 'improved', 'explanation', 'strengths', 'improvements'],
};

// Speaking review adds audio-only fields: a transcript Gemini hears from the
// recording, plus dedicated pronunciation & fluency feedback (both criteria are
// graded directly from the voice, not inferred from text).
const SPEAKING_REVIEW_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    feedbackMessage: { type: Type.STRING },
    estimate: { type: Type.STRING },
    transcript: { type: Type.STRING },
    pronunciation: { type: Type.STRING },
    fluency: { type: Type.STRING },
    improved: { type: Type.STRING },
    explanation: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['feedbackMessage', 'improved', 'explanation', 'strengths', 'improvements'],
};

function examName(exam: ExamKind): string {
  return exam === 'sat' ? 'SAT' : 'IELTS';
}

function estimateGuidance(exam: ExamKind): string {
  return exam === 'sat'
    ? `In "estimate", give an SAT-appropriate label for the writing (e.g. an SAT Essay reading/analysis/writing impression such as "Reading 6/8, Analysis 5/8, Writing 6/8" or a short overall quality label).`
    : `In "estimate", give an estimated IELTS band from 0 to 9 (you may use half bands, e.g. "6.5").`;
}

// IELTS band estimates from the model run ~0.5 band generous up to ~band 8
// (measured against an independent examiner panel across two studies; bias was
// +0.47 then +0.64, and prompt-tuning did NOT fix it). A held-out validation of
// a flat −0.5 code offset gave bias −0.10 / MAE 0.40 — but the model SATURATES
// near the top (~8.5 raw for everything 7.5–9), so a flat −0.5 clamps genuine
// band-9 work down. Fix: full −0.5 up to raw 8.5, tapered to 0 by raw 9.0.
const IELTS_BAND_OFFSET = -0.5;
const IELTS_TAPER_FROM = 8.5; // above this raw band, shrink the offset toward 0

function calibrateIeltsBand(estimate: unknown): string {
  const s = String(estimate ?? '');
  const m = s.match(/\d+(?:\.\d+)?/);
  if (!m) return s;
  const raw = parseFloat(m[0]);
  if (Number.isNaN(raw)) return s;
  let offset = IELTS_BAND_OFFSET;
  if (raw > IELTS_TAPER_FROM) {
    offset = IELTS_BAND_OFFSET * Math.max(0, (9 - raw) / (9 - IELTS_TAPER_FROM));
  }
  let b = raw + offset;
  b = Math.max(1, Math.min(9, b));   // clamp to the IELTS scale
  b = Math.round(b * 2) / 2;         // nearest half-band
  return b.toFixed(1);
}

function buildWritingPrompt(exam: ExamKind, task: string, prompt: string, answer: string): string {
  return `You are an experienced ${examName(exam)} examiner. The learner is a native Mongolian speaker preparing for the ${examName(exam)} exam.

Task type: "${task}"
The question / prompt the learner was answering:
"""
${prompt}
"""

The learner's written answer (in English):
"""
${answer}
"""

Assess this answer the way a real ${examName(exam)} examiner would: task achievement/response, coherence and cohesion, lexical resource, and grammatical range and accuracy. Reference the learner's ACTUAL text — quote or paraphrase concrete phrases they wrote, and name the specific mistakes you see. Be concrete, not generic. Be a strict, calibrated examiner — do not inflate; reserve top marks for genuinely strong writing.
The band/score belongs ONLY in the "estimate" field — do NOT state any specific band number anywhere in feedbackMessage, explanation, strengths, or improvements.

Return ONLY JSON matching this structure:
{
  "feedbackMessage": "A short, encouraging title in MONGOLIAN (e.g. 'Сайн ажиллажээ!' or 'Сайжруулах зүйл бий').",
  "estimate": "${exam === 'sat' ? 'An SAT-appropriate score label (see instruction below).' : 'An estimated IELTS band 0-9, e.g. 6.5.'}",
  "improved": "An improved, model rewrite of the learner's answer, IN ENGLISH, at a high band level while staying on the same prompt.",
  "explanation": "A DETAILED explanation IN MONGOLIAN covering grammar, task achievement/response, coherence & cohesion, and lexical resource — referencing the learner's actual text.",
  "strengths": ["2-4 short MONGOLIAN bullet points naming concrete strengths in the learner's answer"],
  "improvements": ["2-4 short, concrete MONGOLIAN bullet points on what to fix, with specific examples from the text"]
}
${estimateGuidance(exam)}
Keep every Mongolian field natural and concise. The "improved" field MUST be in English; all other text fields MUST be in Mongolian.`;
}

function buildSpeakingPrompt(
  exam: ExamKind,
  part: string,
  prompt: string,
  transcript: string,
  hasAudio: boolean,
): string {
  const source = hasAudio
    ? `You are given an AUDIO RECORDING of the learner speaking. LISTEN to the actual audio and grade what you HEAR: real pronunciation of individual sounds, word stress, sentence intonation, rhythm, pace, pauses and hesitation, and the audible accent of a Mongolian speaker (e.g. consonant clusters, "th", "w/v", final consonants, vowel length). Transcribe exactly what you hear into English for the "transcript" field — do not assume the learner said anything other than what is on the recording.`
    : `No audio is available — you are given only a TEXT TRANSCRIPT of what the learner said (in English):
"""
${transcript}
"""
Judge pronunciation only at the level the text allows and infer likely sound difficulties for a Mongolian speaker; put this text in the "transcript" field.`;

  return `You are an experienced ${examName(exam)} examiner. The learner is a native Mongolian speaker preparing for the ${examName(exam)} exam.

Speaking part / task: "${part}"
The question / cue card the learner responded to:
"""
${prompt}
"""

${source}

Assess this spoken response the way a real ${examName(exam)} examiner would across ALL four criteria: fluency and coherence, lexical resource, grammatical range and accuracy, and PRONUNCIATION. Reference the learner's ACTUAL words and sounds — quote or paraphrase concrete phrases and name the specific sounds/words that were strong or wrong. Be concrete, not generic. Be a strict, calibrated examiner — do not inflate; reserve top marks for genuinely strong responses.
The band/score belongs ONLY in the "estimate" field — do NOT state any specific band number anywhere in the other fields.

Return ONLY JSON matching this structure:
{
  "feedbackMessage": "A short, encouraging title in MONGOLIAN (e.g. 'Сайн ярьжээ!' or 'Сайжруулах зүйл бий').",
  "estimate": "${exam === 'sat' ? 'A short SAT-appropriate quality label for the response.' : 'An estimated IELTS Speaking band 0-9, e.g. 6.5.'}",
  "transcript": "Exactly what the learner said, written in English.",
  "pronunciation": "2-3 sentences IN MONGOLIAN on pronunciation${hasAudio ? ' you actually heard' : ''}: which sounds/words were clear, which were off (specific sounds), plus intonation/word-stress notes for a Mongolian speaker.",
  "fluency": "1-2 sentences IN MONGOLIAN on fluency: pace, pauses/hesitation, and how smoothly ideas were linked.",
  "improved": "An improved, model version of the learner's spoken answer, IN ENGLISH, at a high band level while staying on the same prompt.",
  "explanation": "A DETAILED explanation IN MONGOLIAN covering grammar, task/response, coherence, and lexical resource — referencing the learner's actual words.",
  "strengths": ["2-4 short MONGOLIAN bullet points naming concrete strengths"],
  "improvements": ["2-4 short, concrete MONGOLIAN bullet points on what to practice next, with specific examples"]
}
${exam === 'ielts' ? 'In "estimate", give an estimated IELTS Speaking band from 0 to 9 (half bands allowed).' : 'In "estimate", give a short SAT-appropriate quality label.'}
Keep every Mongolian field natural and concise. The "improved" field MUST be in English; all other text fields (including pronunciation and fluency) MUST be in Mongolian. The "transcript" field MUST be in English.`;
}

// Graceful fallback (HTTP 200) so the UI still works when AI is unavailable.
function writingFallback(exam: ExamKind, task: string, answer: string) {
  const checklist = exam === 'sat'
    ? `AI үнэлгээ түр боломжгүй байна. "${task}" даалгаврыг өөрөө шалгахдаа: (1) асуултын бүх хэсэгт хариулсан эсэх, (2) гол санаа бүрийг жишээ, нотолгоогоор баталсан эсэх, (3) догол мөр бүр нэг гол санаатай, холбоос үгсээр уялдсан эсэх, (4) дүрэм, цэг таслал, үгийн сонголт зөв эсэх, (5) танилцуулга ба дүгнэлт тодорхой эсэхийг нягтлаарай.`
    : `AI үнэлгээ түр боломжгүй байна. "${task}" даалгаврыг өөрөө шалгахдаа: (1) асуултад бүрэн хариулсан эсэх (Task Achievement), (2) санаа уялдаа, холбоос үгс (Coherence & Cohesion), (3) үгийн баялаг, давталтгүй байдал (Lexical Resource), (4) дүрмийн олон төрөл ба нарийвчлал (Grammatical Range & Accuracy)-ыг нягтлаарай. Үг тус бүрийн зөв бичлэг, цаг, өгүүлбэрийн бүтцийг дахин уншиж шалга.`;

  return {
    fallback: true,
    feedbackMessage: 'AI үнэлгээ түр боломжгүй байна',
    estimate: '',
    improved: answer,
    explanation: checklist,
    strengths: [] as string[],
    improvements: [
      'Асуултын бүх хэсэгт шууд хариулсан эсэхээ шалгаарай.',
      'Холбоос үгс (however, therefore, in addition) ашиглан санаагаа уялдуул.',
      'Давтагдсан үгсийг ижил утгатай үгсээр сольж, дүрмийн алдаагаа дахин нягтал.',
    ],
  };
}

function speakingFallback(exam: ExamKind, part: string, transcript: string) {
  const checklist = exam === 'sat'
    ? `AI үнэлгээ түр боломжгүй байна. "${part}" хэсгийн хариултаа өөрөө шалгахдаа: (1) асуултад бүрэн хариулсан эсэх, (2) санаагаа жишээгээр баталсан эсэх, (3) уялдаа холбоо, (4) үгийн сонголт, дүрмийн зөв байдлыг нягтлаарай.`
    : `AI үнэлгээ түр боломжгүй байна. "${part}" хэсгийн хариултаа өөрөө шалгахдаа: (1) уялдаа холбоо, чөлөөтэй яриа (Fluency & Coherence), (2) үгийн баялаг (Lexical Resource), (3) дүрмийн олон төрөл ба нарийвчлал (Grammatical Range & Accuracy), (4) дуудлагыг нягтлаарай. Тасалдалгүй, бүрэн өгүүлбэрээр ярихыг хичээ.`;

  return {
    fallback: true,
    feedbackMessage: 'AI үнэлгээ түр боломжгүй байна',
    estimate: '',
    transcript,
    pronunciation: 'Дуудлагын автомат шинжилгээ AI идэвхжсэн үед боломжтой.',
    fluency: 'Чөлөөт ярианы автомат шинжилгээ AI идэвхжсэн үед боломжтой.',
    improved: transcript,
    explanation: checklist,
    strengths: [] as string[],
    improvements: [
      'Бүрэн өгүүлбэрээр, тасалдалгүй ярихыг хичээ.',
      'Санаа бүрээ жишээ, тайлбараар дэлгэрүүл.',
      'Холбоос үгс ашиглан санаагаа уялдуулж, дүрмийн нарийвчлалаа сайжруул.',
    ],
  };
}

function parseExam(value: unknown): ExamKind {
  return value === 'sat' ? 'sat' : 'ielts';
}

export function registerEnglishReviewRoute(app: Express) {
  // --- POST /api/english/review-writing -------------------------------------
  app.post('/api/english/review-writing', async (req, res) => {
    if (rateLimited(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Хэт олон хүсэлт. Хэсэг хүлээгээд дахин оролдоно уу.' });
    }

    // Require a verified Firebase user and meter monthly quota — same gate as the
    // German AI routes — so the paid model isn't reachable by anonymous callers.
    const access = await checkAiAccess(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error, code: access.code });
    }

    const exam = parseExam(req.body?.exam);
    const task = clampText(req.body?.task);
    const prompt = clampText(req.body?.prompt);
    const answer = clampText(req.body?.answer);

    if (!answer) {
      return res.status(400).json({ error: 'Бичсэн хариулт хоосон байна.' });
    }

    const ai = isGeminiConfigured() ? aiClientWithinBudget() : null;

    if (ai) {
      consumeBudget();
      try {
        const response = await generateContentWithRetry(ai, {
          model: getModel(),
          contents: buildWritingPrompt(exam, task, prompt, answer),
          config: {
            // Low temperature → calibrated, repeatable band estimates.
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: REVIEW_SCHEMA,
          },
        });

        const responseText = response.text || '{}';
        try {
          const result = JSON.parse(responseText);
          if (exam === 'ielts' && result && typeof result.estimate !== 'undefined') {
            // Re-centre the model's generosity bias (measured ~+0.5 band).
            result.estimate = calibrateIeltsBand(result.estimate);
          }
          return res.json(result);
        } catch (e) {
          console.error('Failed to parse Gemini english writing review:', responseText, e);
        }
      } catch (err: any) {
        console.error('Gemini API english writing review error:', err);
      }
    }

    return res.json(writingFallback(exam, task, answer));
  });

  // --- POST /api/english/review-speaking ------------------------------------
  app.post('/api/english/review-speaking', async (req, res) => {
    if (rateLimited(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Хэт олон хүсэлт. Хэсэг хүлээгээд дахин оролдоно уу.' });
    }

    // Require a verified Firebase user and meter monthly quota — same gate as the
    // German AI routes — so the paid model isn't reachable by anonymous callers.
    const access = await checkAiAccess(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error, code: access.code });
    }

    const exam = parseExam(req.body?.exam);
    const part = clampText(req.body?.part);
    const prompt = clampText(req.body?.prompt);
    const transcript = clampText(req.body?.transcript);

    // Audio is the primary input: Gemini listens to the recording and grades the
    // real voice (pronunciation, fluency, intonation). The transcript is only a
    // fallback for browsers/devices that cannot record.
    const ALLOWED_MIME_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/aac', 'audio/x-m4a'];
    const rawMimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType.split(';')[0].trim() : 'audio/webm';
    const mimeType = ALLOWED_MIME_TYPES.includes(rawMimeType) ? rawMimeType : 'audio/webm';
    const audioData = typeof req.body?.audio === 'string' ? req.body.audio : undefined;

    if (audioTooLarge(audioData)) {
      return res.status(413).json({ error: 'Дуу бичлэг хэт том байна. Богино бичлэг (1-2 минут) оруулна уу.' });
    }

    const hasAudio = typeof audioData === 'string' && audioData.length > 0;

    if (!hasAudio && !transcript) {
      return res.status(400).json({ error: 'Дуу бичлэг хийх эсвэл ярианы бичвэрээ оруулна уу.' });
    }

    const ai = isGeminiConfigured() ? aiClientWithinBudget() : null;

    if (ai) {
      consumeBudget();
      try {
        const parts: any[] = [{ text: buildSpeakingPrompt(exam, part, prompt, transcript, hasAudio) }];
        if (hasAudio) {
          parts.push({ inlineData: { mimeType, data: audioData } });
        }

        const response = await generateContentWithRetry(ai, {
          model: getModel(),
          contents: [{ role: 'user', parts }],
          config: {
            // Low temperature → calibrated, repeatable band estimates.
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: SPEAKING_REVIEW_SCHEMA,
          },
        });

        const responseText = response.text || '{}';
        try {
          const result = JSON.parse(responseText);
          if (exam === 'ielts' && result && typeof result.estimate !== 'undefined') {
            // Re-centre the model's generosity bias (measured ~+0.5 band).
            result.estimate = calibrateIeltsBand(result.estimate);
          }
          return res.json(result);
        } catch (e) {
          console.error('Failed to parse Gemini english speaking review:', responseText, e);
        }
      } catch (err: any) {
        console.error('Gemini API english speaking review error:', err);
      }
    }

    return res.json(speakingFallback(exam, part, transcript));
  });
}
