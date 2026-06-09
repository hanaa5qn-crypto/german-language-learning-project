import { Type } from '@google/genai';
import type { Express } from 'express';
import { cleanText } from '../lib/cleanText';
import { aiClientWithinBudget, clampText, clientIp, consumeBudget, rateLimited } from '../lib/aiGuard';

export function registerEvaluateWritingRoute(app: Express) {
  app.post('/api/evaluate-writing', async (req, res) => {
    if (rateLimited(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Хэт олон хүсэлт. Хэсэг хүлээгээд дахин оролдоно уу.' });
    }

    const promptText = clampText(req.body?.promptText);
    const targetSentence = clampText(req.body?.targetSentence);
    const userTranslation = clampText(req.body?.userTranslation);

    if (!userTranslation) {
      return res.status(400).json({ error: 'Translation path is empty' });
    }

    const ai = aiClientWithinBudget();

    if (ai) {
      consumeBudget();
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Evaluate this translation for a German language learning course where the target audience is Mongolian.
Query task: Translate Mongolian sentence "${promptText}" into German.
Course expected German target sentence: "${targetSentence}"
User translation to evaluate: "${userTranslation}"

Provide feedback in Mongolian grammar rules. You must format your response as JSON according to this structure:
{
  "isCorrect": boolean (true if highly acceptable/grammatically correct, false if heavy errors),
  "corrected": "the fully corrected German sentence",
  "explanation": "A concise grammatical explanation in Mongolian explaining why it is correct, or detailing any errors (like case placement, verb positioning at position 2, or omitted objects). Keep it under 3-4 sentences.",
  "feedbackMessage": "A short, encouraging title in Mongolian like 'Маш сайн! Зөв байна.' (if correct) or 'Анхаараарай!' (if incorrect)"
}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                isCorrect: { type: Type.BOOLEAN },
                corrected: { type: Type.STRING },
                explanation: { type: Type.STRING },
                feedbackMessage: { type: Type.STRING },
              },
              required: ['isCorrect', 'corrected', 'explanation', 'feedbackMessage'],
            },
          },
        });

        const responseText = response.text || '{}';
        try {
          const result = JSON.parse(responseText);
          return res.json(result);
        } catch (e) {
          console.error('Failed to parse Gemini output:', responseText, e);
        }
      } catch (err: any) {
        console.error('Gemini API writing check error:', err);
      }
    }

    const cleanUser = cleanText(userTranslation);
    const cleanTarget = cleanText(targetSentence);

    const isCorrect = cleanUser === cleanTarget ||
                      (cleanTarget === 'sie trinkt jeden morgen kaffee' && (cleanUser === 'sie trinkt jeden morgen kaffee' || cleanUser === 'sie trinkt kaffee jeden morgen')) ||
                      (cleanTarget === 'mein name ist bat' && (cleanUser === 'mein name ist bat' || cleanUser === 'ich heisse bat' || cleanUser === 'ich heiße bat'));

    const explanation = isCorrect
      ? (cleanTarget === 'mein name ist bat'
          ? 'Энэ өгүүлбэр нь зөв байна. Өорийгөө танилцуулахад "Mein Name ist [Нэр]" эсвэл "Ich heiße [Нэр]" гэсэн бүтцийг ашигладаг.'
          : '"jeden Morgen" (өглөө бүр) нь цаг заасан үг бөгөөд ихэвчлэн үйл үгийн дараа шууд ордог. "Kaffee" нь тодорхойгүй байдалд байгаа тул ямар нэгэн ялгац гишүүнгүй бичигдсэн нь зөв байна.')
      : (cleanTarget === 'mein name ist bat'
          ? `Зөв дараалал: "${targetSentence}". "Name" гэдэг нэр үгийн эхний үсэг томоор бичигддэг болохыг анхаарна уу.`
          : `Зөв дараалал: "${targetSentence}". "trinkt" (уудаг) гэх үйл үг нь өгүүлбэрийн 2-р байранд орох ёстойг анхаарна уу.`);

    return res.json({
      isCorrect,
      corrected: targetSentence,
      explanation,
      feedbackMessage: isCorrect ? 'Маш сайн! Зөв байна.' : 'Анхаараарай, жижиг алдаа байна!'
    });
  });
}
