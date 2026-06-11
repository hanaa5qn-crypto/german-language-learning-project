import { Type } from '@google/genai';
import type { Express } from 'express';
import { cleanText } from '../lib/cleanText';
import { aiClientWithinBudget, audioTooLarge, clampText, clientIp, consumeBudget, rateLimited } from '../lib/aiGuard';
import { generateContentWithRetry } from '../lib/ai';
import { checkAiAccess } from '../lib/plans';

// Rich JSON shape returned to the frontend. Every text field is written in
// Mongolian (the app's UI language); `transcript` stays in German.
const SPEAKING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transcript: { type: Type.STRING },
    overallScore: { type: Type.INTEGER },
    pronunciationScore: { type: Type.INTEGER },
    fluencyScore: { type: Type.INTEGER },
    accentNote: { type: Type.STRING },
    pronunciationFeedback: { type: Type.STRING },
    grammarFeedback: { type: Type.STRING },
    vocabularyFeedback: { type: Type.STRING },
    strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
    improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
    isCorrect: { type: Type.BOOLEAN },
    feedbackMessage: { type: Type.STRING },
    analysis: { type: Type.STRING },
  },
  required: [
    'transcript', 'overallScore', 'pronunciationScore', 'accentNote',
    'pronunciationFeedback', 'grammarFeedback', 'vocabularyFeedback',
    'strengths', 'improvements', 'isCorrect', 'feedbackMessage', 'analysis',
  ],
};

function buildPrompt(sentence: string | undefined, transcribedHint: string | undefined, hasAudio: boolean) {
  const target = sentence && sentence.trim()
    ? `The target German sentence the learner was asked to say is: "${sentence}".`
    : `This is a free-speaking exercise, so there is no single fixed target sentence — judge the German on its own merits.`;

  const source = hasAudio
    ? `You are given an AUDIO RECORDING of the learner speaking German. LISTEN to the actual audio: judge the real pronunciation, vowel length, consonant sounds (ch, r, ü, ö, ä, ß, z, w, v), word stress, intonation and accent that you hear. Transcribe exactly what you hear into German for the "transcript" field.`
    : `You are given a TEXT TRANSCRIPT of what the learner said (no audio is available): "${transcribedHint}". Judge pronunciation only at the level the text allows, and infer likely sound difficulties for a Mongolian speaker. Put the transcript text in the "transcript" field.`;

  return `You are a warm, expert German pronunciation and language coach for native Mongolian speakers.
${target}
${source}

Evaluate the learner across pronunciation, accent, grammar and vocabulary, and return ONLY JSON matching this structure:
{
  "transcript": "Exactly what the learner said, written in German.",
  "overallScore": integer 0-100 overall spoken quality,
  "pronunciationScore": integer 0-100 for pronunciation accuracy,
  "fluencyScore": integer 0-100 for fluency/rhythm/flow,
  "accentNote": "1-2 sentences in Mongolian about their accent — how German vs Mongolian-influenced it sounds, and which sounds reveal the accent.",
  "pronunciationFeedback": "2-3 sentences in Mongolian naming the SPECIFIC German sounds/letters they got right and which to fix (e.g. silent h, long ie, ü/ö rounding, ch, the German r, final -en).",
  "grammarFeedback": "1-2 sentences in Mongolian on grammar mistakes you noticed (word order, verb position 2, cases, articles). If there were none, say so encouragingly.",
  "vocabularyFeedback": "1-2 sentences in Mongolian on word choice and vocabulary — correct words, wrong/missing words, or a better natural word.",
  "strengths": ["2-4 short Mongolian bullet points on what they did well"],
  "improvements": ["2-4 short, concrete Mongolian bullet points on what to practice next"],
  "isCorrect": boolean — true if intelligible and close to native/target, false if it needs real work,
  "feedbackMessage": "A short supportive Mongolian title like 'Маш сайн байна!' or 'Сайн эхэлж байна!'",
  "analysis": "One concise friendly Mongolian summary paragraph combining the key points."
}
Be honest but encouraging. Keep every Mongolian field natural and concise.`;
}

export function registerEvaluateSpeakingRoute(app: Express) {
  app.post('/api/evaluate-speaking', async (req, res) => {
    if (rateLimited(clientIp(req))) {
      res.setHeader('Retry-After', '60');
      return res.status(429).json({ error: 'Хэт олон хүсэлт. Хэсэг хүлээгээд дахин оролдоно уу.' });
    }

    const access = await checkAiAccess(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error, code: access.code, quota: access.quota });
    }

    const { audio, mimeType, audioUrl } = req.body as {
      audio?: string;       // base64-encoded audio (no data: prefix)
      mimeType?: string;    // e.g. audio/wav
      audioUrl?: string;    // Firebase Storage public URL
    };
    const sentence = clampText(req.body?.sentence);
    const spokenText = clampText(req.body?.spokenText);

    let audioData = audio;
    if (audioUrl) {
      try {
        const parsedUrl = new URL(audioUrl);
        if (parsedUrl.hostname !== 'firebasestorage.googleapis.com') {
          return res.status(400).json({ error: 'Invalid audio URL domain.' });
        }
        const fetchResponse = await fetch(parsedUrl.toString());
        if (!fetchResponse.ok) {
          throw new Error(`Failed to fetch audio from URL: ${fetchResponse.statusText}`);
        }
        const arrayBuffer = await fetchResponse.arrayBuffer();
        audioData = Buffer.from(arrayBuffer).toString('base64');
      } catch (fetchErr) {
        console.error('Failed to download audio from Firebase Storage URL:', fetchErr);
        return res.status(400).json({ error: 'Failed to retrieve audio from storage URL.' });
      }
    }

    if (audioTooLarge(audioData)) {
      return res.status(413).json({ error: 'Дуу бичлэг хэт том байна. Богино бичлэг (хэдхэн өгүүлбэр) оруулна уу.' });
    }

    const hasAudio = typeof audioData === 'string' && audioData.length > 0;

    if (!hasAudio && !spokenText) {
      return res.status(400).json({ error: 'Provide either an audio recording or spoken text.' });
    }

    const ai = aiClientWithinBudget();

    if (ai) {
      consumeBudget();
      try {
        const parts: any[] = [{ text: buildPrompt(sentence, spokenText, hasAudio) }];
        if (hasAudio) {
          parts.push({ inlineData: { mimeType: mimeType || 'audio/wav', data: audioData } });
        }

        const response = await generateContentWithRetry(ai, {
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts }],
          config: {
            responseMimeType: 'application/json',
            responseSchema: SPEAKING_SCHEMA,
          },
        });

        const responseText = response.text || '{}';
        try {
          const result = JSON.parse(responseText);
          return res.json(result);
        } catch (e) {
          console.error('Failed to parse Gemini speaking output:', responseText, e);
        }
      } catch (err: any) {
        console.error('Gemini API speaking check error:', err);
      }
    }

    // Rule-based fallback (no AI key, audio unsupported, or quota error).
    return res.json(buildFallback(sentence, spokenText, hasAudio));
  });
}

function buildFallback(sentence: string | undefined, spokenText: string | undefined, hasAudio: boolean) {
  const heard = spokenText || '';
  const cleanSpoken = cleanText(heard);
  const cleanTarget = cleanText(sentence || '');
  const matches = cleanTarget.length > 0 && (cleanSpoken === cleanTarget || cleanSpoken.includes(cleanTarget) || cleanTarget.includes(cleanSpoken));
  const isCorrect = matches || (cleanSpoken.includes('wie geht') || cleanSpoken.includes('ihnen'));

  const analysis = hasAudio
    ? 'Дуу хоолойг хүлээн авлаа, гэхдээ одоогоор автомат үнэлгээ хийх боломжгүй байна (AI түлхүүр эсвэл квот). Та Тохиргоо хэсэгт Gemini API түлхүүрээ шалгаад дахин оролдоно уу.'
    : (isCorrect
        ? 'Таны дуудлага ерөнхийдөө зөв байна. "Wie geht es" хэсэг сайн, харин "Ihnen" доторх "h" дуудагдахгүй, "i"-г уртаар дуудна гэдгийг анхаарна уу.'
        : 'Дахин тодорхой дуудаж үзээрэй. "Wie" нь /ви/, "geht" нь /гэйт/, "es" нь /эс/, "Ihnen" нь /ийнэн/ гэж уншигдана.');

  return {
    transcript: heard || (sentence || ''),
    overallScore: isCorrect ? 75 : 45,
    pronunciationScore: isCorrect ? 72 : 42,
    fluencyScore: isCorrect ? 70 : 45,
    accentNote: 'Автомат акцент шинжилгээ боломжгүй байна (AI идэвхгүй).',
    pronunciationFeedback: analysis,
    grammarFeedback: 'Дүрмийн дэлгэрэнгүй шинжилгээ AI идэвхжсэн үед боломжтой.',
    vocabularyFeedback: 'Үгсийн санг AI идэвхжсэн үед нарийвчлан шалгана.',
    strengths: isCorrect ? ['Зорилтот өгүүлбэртэй ойролцоо байна'] : ['Оролдсон нь сайн хэрэг'],
    improvements: ['Тодорхой, удаан дуудаж дасгал хийх', 'Урт эгшгүүдийг (ie, ah) анхаарах'],
    isCorrect,
    feedbackMessage: isCorrect ? 'Сайн байна! Гэхдээ...' : 'Дахин оролдоё!',
    analysis,
  };
}
