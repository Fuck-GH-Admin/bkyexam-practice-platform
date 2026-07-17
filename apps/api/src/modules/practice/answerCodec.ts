import type { SubmittedAnswer } from './grading.js';

export function serializeSubmittedAnswer(answer: SubmittedAnswer): string {
  return Array.isArray(answer) ? JSON.stringify(answer) : String(answer);
}

export function serializeDraftAnswer(answer: SubmittedAnswer): string {
  return typeof answer === 'string' || Array.isArray(answer) ? JSON.stringify(answer) : String(answer);
}

export function parseStoredAnswer(answer: string | null | undefined): SubmittedAnswer | undefined {
  if (!answer) return undefined;
  try {
    const parsed = JSON.parse(answer) as unknown;
    if (typeof parsed === 'string') return parsed;
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed;
  } catch {
    if (answer === 'true') return true;
    if (answer === 'false') return false;
    return answer;
  }
  if (answer === 'true') return true;
  if (answer === 'false') return false;
  return answer;
}

export function hasSubmittedAnswerValue(answer: SubmittedAnswer | undefined): answer is SubmittedAnswer {
  if (answer === undefined) return false;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return true;
}
