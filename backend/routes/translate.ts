import { Type } from '@google/genai';
import type { Express } from 'express';
import { aiClientWithinBudget, budgetExhausted, clampText, clientIp, consumeBudget, rateLimited } from '../lib/aiGuard';
import { geminiErrorMessage, generateContentWithRetry, isGeminiConfigured } from '../lib/ai';
import { checkAiAccess } from '../lib/plans';

export function registerTranslateRoute(app: Express) {
  app.post('/api/translate', async (req, res) => {
    if (rateLimited(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Хэт олон хүсэлт. Хэсэг хүлээгээд дахин оролдоно уу.' });
    }

    const access = await checkAiAccess(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error, code: access.code, quota: access.quota });
    }

    const text = clampText(req.body?.text);

    if (!text) {
      return res.status(400).json({ error: 'Text to translate is missing' });
    }

    if (!isGeminiConfigured()) {
      return res.status(503).json({
        error: 'Сервер дээр GEMINI_API_KEY тохируулаагүй байна. Vercel → Settings → Environment Variables хэсэгт GEMINI_API_KEY нэмээд дахин deploy хийнэ үү.',
        code: 'GEMINI_NOT_CONFIGURED',
      });
    }

    if (budgetExhausted()) {
      return res.status(503).json({
        error: 'Өнөөдрийн AI дуудлагын хязгаар дүүрсэн. Маргааш дахин оролдоно уу.',
        code: 'AI_DAILY_BUDGET',
      });
    }

    const ai = aiClientWithinBudget();

    if (ai) {
      consumeBudget();
      try {
        const response = await generateContentWithRetry(ai, {
          model: 'gemini-2.5-flash',
          contents: `Translate the following text between German and Mongolian. Auto-detect which language it is in and translate to the other.
Text: "${text}"

Provide a comprehensive, high-quality localization and structural breakdown for learners. Explain how word placement, cases/gender, and grammar operate in German, using Mongolian explanations. Format your response as JSON according to this structure:
{
  "translation": "High quality natural translation of the full text",
  "detectedLanguage": "German" or "Mongolian",
  "pronunciation": "Phonetic reading guide for German text (if German text translated to Mongolian) or phonetic reading guide for German output (if Mongolian translated to German). Max 1-2 lines.",
  "grammarExplanation": "An educational, supportive grammar overview or sentence-level breakdown in Mongolian explaining grammatical rules, case assignments (Akkusativ/Dativ), word positions, or relevant morphological changes.",
  "words": [
    {
      "word": "The original or translated word used",
      "baseForm": "The base dictionary representation (e.g. Infinitiv for verbs like 'trinken', or Nominativ singular with gender for nouns like 'der Kaffee')",
      "partOfSpeech": "Noun, Verb, Adjective, Preposition, Article etc.",
      "translation": "Direct Mongolian translation of this word in this context",
      "explanation": "A short note in Mongolian about this word's endings, gender, or role."
    }
  ],
  "examples": [
    {
      "german": "Related example sentence in German",
      "mongolian": "Direct translation of that example in Mongolian"
    }
  ]
}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                translation: { type: Type.STRING },
                detectedLanguage: { type: Type.STRING },
                pronunciation: { type: Type.STRING },
                grammarExplanation: { type: Type.STRING },
                words: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      word: { type: Type.STRING },
                      baseForm: { type: Type.STRING },
                      partOfSpeech: { type: Type.STRING },
                      translation: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: ['word', 'baseForm', 'partOfSpeech', 'translation', 'explanation'],
                  },
                },
                examples: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      german: { type: Type.STRING },
                      mongolian: { type: Type.STRING },
                    },
                    required: ['german', 'mongolian'],
                  },
                },
              },
              required: ['translation', 'detectedLanguage', 'pronunciation', 'grammarExplanation', 'words', 'examples'],
            },
          },
        });

        const responseText = response.text || '{}';
        try {
          const result = JSON.parse(responseText);
          return res.json(result);
        } catch (e) {
          console.error('Failed to parse Gemini translation output:', responseText, e);
        }
      } catch (err: any) {
        console.error('Gemini API translation error:', err);
        return res.status(502).json({
          error: geminiErrorMessage(err),
          code: 'GEMINI_ERROR',
        });
      }
    }

    const lowerText = text.trim().toLowerCase();

    if (lowerText.includes('hallo') || lowerText.includes('sain') || lowerText.includes('sain uu')) {
      return res.json({
        translation: lowerText.includes('hallo') ? 'Сайн байна уу?' : 'Hallo! Wie geht es dir?',
        detectedLanguage: lowerText.includes('hallo') ? 'German' : 'Mongolian',
        pronunciation: lowerText.includes('hallo') ? 'Хало!' : 'Хало! Вий гэйт эс дийр?',
        grammarExplanation: 'Энэ бол Герман хэлний хамгийн түгээмэл мэндчилгээ бөгөөд "Hallo!" нь ямар ч хүнтэй албан бусаар мэндлэхэд тохирно. Сайн байна уу гэсэн өгүүлбэрийг Герман руу "Wie geht es dir?" буюу "Бие тань хэр байна даа?" гэж орчуулсан хувилбар хамгийн тохиромжтой.',
        words: [
          { word: 'Hallo', baseForm: 'Hallo', partOfSpeech: 'Interjection', translation: 'Сайн байна уу', explanation: 'Мэндчилгээний үг.' },
          { word: 'wie', baseForm: 'wie', partOfSpeech: 'Adverb', translation: 'хэрхэн', explanation: 'Асуух төлөөний үг.' },
          { word: 'geht', baseForm: 'gehen', partOfSpeech: 'Verb', translation: 'явдаг/байна', explanation: 'Gehen үйл үг нь "es" буюу 3-р биеийн ганц тоон дээр "geht" болж хувирсан.' }
        ],
        examples: [
          { german: 'Hallo, mein Freund!', mongolian: 'Сайн уу, найз минь!' },
          { german: 'Wie geht es Ihnen?', mongolian: 'Таны бие хэр байна уу? (Хүндэтгэлийн хэлбэр)' }
        ]
      });
    }

    return res.json({
      translation: `Орчуулга: ${text} (Оффлайн горимд байна. Сүлжээ эсвэл GEMINI_API_KEY-ийг тохируулна уу)`,
      detectedLanguage: 'German',
      pronunciation: '[Оффлайн унших заавар]',
      grammarExplanation: 'Одоогоор оффлайн горимд ажиллаж байна. AI орчуулгыг ашиглахын тулд сайтын админ Vercel дээр GEMINI_API_KEY тохируулсан эсэхийг шалгана уу.',
      words: [
        { word: text, baseForm: text, partOfSpeech: 'Unknown', translation: 'Орчуулагдаагүй үг', explanation: 'Офлайн горимын олдсон үг.' }
      ],
      examples: [
        { german: 'Guten Tag!', mongolian: 'Өдрийн мэнд!' },
        { german: 'Auf Wiedersehen!', mongolian: 'Баяртай!' }
      ]
    });
  });
}
