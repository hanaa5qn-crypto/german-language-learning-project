export type TabType = 'read' | 'listen' | 'speak' | 'write' | 'vocab' | 'settings' | 'translate' | 'exam' | 'profile';

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
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2';

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
