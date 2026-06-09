import { Type } from '@google/genai';
import type { Express } from 'express';
import { aiClientWithinBudget, clampText, clientIp, consumeBudget, rateLimited } from '../lib/aiGuard';
import { generateContentWithRetry } from '../lib/ai';
import { checkAiAccess } from '../lib/plans';

// Rich free-writing feedback. Unlike /api/evaluate-writing (a constrained
// translation check), this grades an open composition: it hunts for wrong
// grammar and wrong word choices, then recommends better wording. Every text
// field is Mongolian except `corrected` and each correction's German fragments.
const COMPOSITION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallScore: { type: Type.INTEGER },
    grammarScore: { type: Type.INTEGER },
    vocabularyScore: { type: Type.INTEGER },
    isCorrect: { type: Type.BOOLEAN },
    feedbackMessage: { type: Type.STRING },
    analysis: { type: Type.STRING },
    corrected: { type: Type.STRING },
    corrections: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          original: { type: Type.STRING },
          suggestion: { type: Type.STRING },
          type: { type: Type.STRING }, // grammar | vocabulary | spelling | style
          explanation: { type: Type.STRING },
        },
        required: ['original', 'suggestion', 'type', 'explanation'],
      },
    },
    grammarFeedback: { type: Type.STRING },
    vocabularyFeedback: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    'overallScore', 'grammarScore', 'vocabularyScore', 'isCorrect',
    'feedbackMessage', 'analysis', 'corrected', 'corrections',
    'grammarFeedback', 'vocabularyFeedback', 'strengths', 'improvements',
  ],
};

function buildPrompt(
  prompt: string | undefined,
  points: string[] | undefined,
  modelAnswer: string | undefined,
  level: string | undefined,
  text: string,
) {
  const task = prompt && prompt.trim()
    ? `The writing task (stated in Mongolian) was: "${prompt}".`
    : `This is an open German writing exercise.`;
  const cover = points && points.length
    ? `The learner was asked to cover these points (Mongolian): ${points.map((p) => `"${p}"`).join(', ')}.`
    : '';
  const model = modelAnswer && modelAnswer.trim()
    ? `A reference model answer in German is: "${modelAnswer}". Use it only as a quality reference — do NOT require the learner to match it word for word.`
    : '';
  const lvl = level ? `The expected CEFR level is ${level}.` : '';

  return `You are a warm, expert German writing tutor for native Mongolian speakers.
${task}
${cover}
${model}
${lvl}

Here is the learner's written German text to evaluate:
"""
${text}
"""

Carefully read what the learner actually wrote. Find every WRONG GRAMMAR point (verb position, cases der/die/das & accusative/dative, word order, conjugation, plurals, prepositions) and every WRONG or UNNATURAL WORD CHOICE, then recommend better wording. Return ONLY JSON matching this structure:
{
  "overallScore": integer 0-100 overall quality of the writing,
  "grammarScore": integer 0-100 for grammatical accuracy,
  "vocabularyScore": integer 0-100 for word choice / vocabulary range,
  "isCorrect": boolean — true if the text is largely correct and fulfils the task, false if it needs real fixes,
  "feedbackMessage": "A short supportive Mongolian title like 'Сайн бичсэн байна!' or 'Анхаараарай, засах зүйл бий.'",
  "analysis": "One concise friendly Mongolian paragraph summarising how well the text answers the task and its main strengths/weaknesses.",
  "corrected": "The learner's text rewritten into correct, natural German — keep their meaning and length, fix all errors.",
  "corrections": [
    {
      "original": "the exact wrong German fragment the learner wrote",
      "suggestion": "the corrected/better German fragment",
      "type": "grammar | vocabulary | spelling | style",
      "explanation": "1 short Mongolian sentence explaining the fix"
    }
  ],
  "grammarFeedback": "1-2 Mongolian sentences on the main grammar issues (or praise if none).",
  "vocabularyFeedback": "1-2 Mongolian sentences on word choice — wrong/unnatural words and better alternatives.",
  "strengths": ["2-4 short Mongolian bullet points on what they did well"],
  "improvements": ["2-4 short, concrete Mongolian bullet points on what to practice next"]
}
List each distinct mistake as its own item in "corrections" (up to ~8 most important). If the text is already correct, return an empty "corrections" array and say so encouragingly. Be honest but kind, and keep every Mongolian field natural and concise.`;
}

export function registerEvaluateCompositionRoute(app: Express) {
  app.post('/api/evaluate-composition', async (req, res) => {
    if (rateLimited(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Хэт олон хүсэлт. Хэсэг хүлээгээд дахин оролдоно уу.' });
    }

    const access = await checkAiAccess(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    const body = (req.body || {}) as {
      prompt?: string;
      points?: string[];
      modelAnswer?: string;
      level?: string;
      text?: string;
    };
    const prompt = clampText(body.prompt);
    const points = Array.isArray(body.points) ? body.points.slice(0, 12).map((p) => clampText(p, 300)) : [];
    const modelAnswer = clampText(body.modelAnswer);
    const level = body.level;
    const text = clampText(body.text);

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Provide the written text to evaluate.' });
    }

    const ai = aiClientWithinBudget();

    if (ai) {
      consumeBudget();
      try {
        const response = await generateContentWithRetry(ai, {
          model: 'gemini-2.5-flash',
          contents: buildPrompt(prompt, points, modelAnswer, level, text),
          config: {
            responseMimeType: 'application/json',
            responseSchema: COMPOSITION_SCHEMA,
          },
        });

        const responseText = response.text || '{}';
        try {
          const result = JSON.parse(responseText);
          return res.json(result);
        } catch (e) {
          console.error('Failed to parse Gemini composition output:', responseText, e);
        }
      } catch (err: any) {
        console.error('Gemini API composition check error:', err);
      }
    }

    // Rule-based fallback (no AI key or quota error).
    return res.json(buildFallback(text));
  });
}

function buildFallback(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  // Very rough heuristic: enough words and at least one capitalised noun-ish token.
  const looksReasonable = words >= 12;
  return {
    overallScore: looksReasonable ? 60 : 40,
    grammarScore: looksReasonable ? 58 : 38,
    vocabularyScore: looksReasonable ? 60 : 42,
    isCorrect: false,
    feedbackMessage: 'AI идэвхгүй байна',
    analysis: 'Автомат дэлгэрэнгүй шинжилгээ хийх боломжгүй байна (AI түлхүүр эсвэл квот). Та Тохиргоо хэсэгт Gemini API түлхүүрээ шалгаад дахин оролдоно уу. Доорх загвар хариулттай харьцуулж өөрийгөө шалгаарай.',
    corrected: text,
    corrections: [],
    grammarFeedback: 'Дүрмийн нарийвчилсан шинжилгээ AI идэвхжсэн үед боломжтой.',
    vocabularyFeedback: 'Үгийн сонголтын шинжилгээ AI идэвхжсэн үед боломжтой.',
    strengths: looksReasonable ? ['Даалгаврын дагуу хангалттай хэмжээтэй бичсэн'] : ['Оролдсон нь сайн хэрэг'],
    improvements: ['Загвар хариулттай харьцуулах', 'Үйл үгийн байрлал (2-р байр) ба тийн ялгалыг шалгах'],
  };
}
