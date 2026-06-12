import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

/** Normalize Vercel / .env values (trim whitespace and optional surrounding quotes). */
export function resolveGeminiApiKey(): string | null {
  const raw = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const key = raw.trim().replace(/^['"]|['"]$/g, '');
  if (!key || key === 'MY_GEMINI_API_KEY') return null;
  return key;
}

export function isGeminiConfigured(): boolean {
  return resolveGeminiApiKey() !== null;
}

/** User-facing hint when the Google API rejects the server key (common on Vercel). */
export function geminiErrorMessage(err: unknown): string {
  const status = (err as { status?: number })?.status;
  const message = String((err as { message?: string })?.message ?? err ?? '');

  if (status === 403 || message.includes('PERMISSION_DENIED') || message.includes('API key not valid')) {
    return 'Gemini API түлхүүр ажиллахгүй байна. Google AI Studio / Cloud Console дээр Generative Language API-г идэвхжүүлж, түлхүүрийн хязгаарлалтыг "None" (server-side) болгоно уу. Vercel дээр GEMINI_API_KEY нэрээр тохируулсан эсэхээ шалгаад дахин deploy хийнэ.';
  }
  if (status === 429 || message.includes('resource exhausted') || message.includes('quota')) {
    return 'Gemini API-ийн өдрийн хязгаар дүүрсэн байна. Хэсэг хүлээгээд дахин оролдоно уу.';
  }
  return 'Gemini API түр ажиллахгүй байна. Хэсэг хугацааны дараа дахин оролдоно уу.';
}

export function getAIClient() {
  if (!aiClient) {
    const key = resolveGeminiApiKey();
    if (key) {
      if (process.env.GOOGLE_API_KEY) {
        delete process.env.GOOGLE_API_KEY;
      }
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    } else {
      console.warn('GEMINI_API_KEY environment variable is not configured. Falling back to local rule-based evaluations.');
    }
  }
  return aiClient;
}

export async function generateContentWithRetry(
  ai: GoogleGenAI,
  options: Parameters<GoogleGenAI['models']['generateContent']>[0]
): ReturnType<GoogleGenAI['models']['generateContent']> {
  const maxRetries = 3;
  let delay = 500;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(options);
    } catch (err: any) {
      const isTransient = err.status === 503 || err.status === 500 || err.status === 429 ||
                          (err.message && (err.message.includes('503') || err.message.includes('500') || err.message.includes('temporary') || err.message.includes('resource exhausted') || err.message.includes('demand')));
      if (isTransient && attempt < maxRetries) {
        console.warn(`Gemini API returned transient error (status ${err.status || 'unknown'}). Retrying attempt ${attempt}/${maxRetries} in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      } else {
        throw err;
      }
    }
  }
  throw new Error('Failed after max retries');
}
