// Barrel for the core English study content. The content sub-agent fills these
// files with real lessons/vocabulary, keeping these exact export names.
import type { ReadingItem } from '../types';
import {
  READING_LIBRARY as CORE_READING_LIBRARY,
  LISTENING_LIBRARY,
  WRITING_LIBRARY,
  SPEAKING_LIBRARY,
} from './library';
import { IELTS_READING_BANK } from './ieltsReadingBank';

// Core graded reading + the mass-produced IELTS reading bank (20 Qs per CEFR
// level, A1–C2) folded into one library so every consumer (reading tab,
// placement test, progress totals) sees the full set.
export const READING_LIBRARY: ReadingItem[] = [...CORE_READING_LIBRARY, ...IELTS_READING_BANK];

export { LISTENING_LIBRARY, WRITING_LIBRARY, SPEAKING_LIBRARY };
export { VOCAB } from './vocabulary';
