export type TabType = 'read' | 'listen' | 'speak' | 'write' | 'vocab' | 'settings' | 'translate' | 'exam' | 'profile' | 'friends';

export interface SpeakingEvaluation {
  isCorrect: boolean;
  feedbackMessage: string;
  analysis: string;
  transcript?: string;
  overallScore?: number;
  pronunciationScore?: number;
  fluencyScore?: number;
  accentNote?: string;
  pronunciationFeedback?: string;
  grammarFeedback?: string;
  vocabularyFeedback?: string;
  strengths?: string[];
  improvements?: string[];
}

export interface WritingCorrection {
  original: string;
  suggestion: string;
  type: string;
  explanation: string;
}

export interface WritingFeedback {
  isCorrect: boolean;
  feedbackMessage: string;
  analysis: string;
  corrected: string;
  corrections?: WritingCorrection[];
  overallScore?: number;
  grammarScore?: number;
  vocabularyScore?: number;
  grammarFeedback?: string;
  vocabularyFeedback?: string;
  strengths?: string[];
  improvements?: string[];
}

export interface PaymentMethodsResponse {
  primary: 'qpay' | 'dummy';
  plans: Record<'pro' | 'max', {
    id: 'pro' | 'max';
    name: string;
    amountMnt: number;
    yearAmountMnt: number;
    currency: string;
    aiAccess: boolean;
  }>;
  qpay: {
    status: 'ready' | 'needs_config';
    missing: string[];
    supports: string[];
  };
  dummy: {
    status: 'ready' | 'needs_config';
    missing: string[];
  };
  alternatives: Array<{
    id: string;
    name: string;
    status: string;
    supports: string[];
    note: string;
  }>;
}

export interface DummyCheckoutResponse {
  provider: 'dummy';
  senderInvoiceNo: string;
  plan: 'pro' | 'max';
  interval?: import('./plans').BillingInterval;
  amountMnt: number;
  currency: 'MNT';
}

export interface QPayCheckoutResponse {
  provider: 'qpay';
  senderInvoiceNo: string;
  providerInvoiceId: string;
  plan: string;
  interval?: import('./plans').BillingInterval;
  amountMnt: number;
  currency: 'MNT';
  qrText?: string;
  qrImage?: string;
  shortUrl?: string;
  urls?: Array<{ name?: string; description?: string; logo?: string; link?: string }>;
}

// Structured grammatical metadata used by the in-app dictionary (Browse) filters.
// The extra classes (pronoun…article) and the B2 level are needed for the full
// vocabeo dictionary import — vocabeo tags frequency-ranked words beyond the
// A1–B1 core as "NOLEVEL", which we surface here as B2 ("advanced / beyond core").
export type WordClass =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'phrase'
  | 'preposition'
  | 'pronoun'
  | 'numeral'
  | 'conjunction'
  | 'interjection'
  | 'article';
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface VocabularyWord {
  german: string;
  article?: 'der' | 'die' | 'das'; // grammatical gender for nouns (der=m, die=f, das=n)
  mongolian: string;
  category: string;
  exampleGerman: string;
  exampleMongolian: string;
  wordClass?: WordClass; // structured part of speech for dictionary filtering
  level?: CEFRLevel;     // CEFR difficulty level for dictionary filtering
  // Optional richer metadata (populated for the vocabeo dictionary import).
  english?: string;      // English gloss — anchors the meaning + distinguishes homonyms
  phonetic?: string;     // IPA-style pronunciation, e.g. "[ˈapfl̩]"
  plural?: string;       // plural form for nouns, e.g. "Äpfel"
  frequency?: number;    // vocabeo frequency band (1 = rare … 5 = most common)
  rank?: number;         // vocabeo frequency rank (1 = most common word)
}

export interface HighlightedWord {
  word: string;
  translation: string;
  grammar: string;
}

export interface ReadingExercise {
  title: string;
  level: string;
  germanText: string;
  paragraphs: string[];
  vocabHighlights: Record<string, HighlightedWord>;
  quizQuestion: string;
  quizChoices: string[];
  correctChoiceIndex: number;
  hint: string;
}

export interface LessonStep {
  id: string; // e.g., 'intro', 'step1_vocab', 'step2_listen', 'step3_read', 'step4_speak', 'step5_write'
  tab: TabType | 'quiz';
  title: string;
  subtitle: string;
}

export interface LessonProgress {
  streak: number;
  wordsMemorized: number;
  totalWords: number;
  completedSteps: string[];
  currentStepIndex: number;
}
