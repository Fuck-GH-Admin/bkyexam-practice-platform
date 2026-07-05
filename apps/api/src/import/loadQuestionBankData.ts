import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseClassificationLine, type ParsedClassification } from './parseClassification.js';
import { parseOptionFile, type ParsedOption } from './parseOptions.js';
import { parseQuestionFile, type ParsedQuestion } from './parseQuestionFile.js';
import { normalizeQType, type QuestionType } from './qtype.js';

export type ImportedClassification = ParsedClassification;
export type ImportedOption = ParsedOption;

export interface ImportedQuestion {
  id: string;
  classificationId: string;
  qType: number;
  normalizedType: QuestionType;
  qGroup: number;
  content: string;
  answerRaw: string;
  analyzeRaw: string;
  useCount: number;
  difficulty: number;
  searchableText: string;
}

export interface ImportedQuestionBankData {
  classifications: ImportedClassification[];
  questions: ImportedQuestion[];
  options: ImportedOption[];
  summary: {
    classifications: number;
    options: number;
    questions: number;
    questionTypes: Record<string, number>;
  };
}

const qtypeFilePattern = /^qtype_(\d+)(?:_.*)?\.txt$/i;

export async function loadQuestionBankData(questionBankDir: string): Promise<ImportedQuestionBankData> {
  const classificationsInput = await readFile(join(questionBankDir, 'classifications.txt'), 'utf8');
  const optionsInput = await readFile(join(questionBankDir, 'change_question_answers.txt'), 'utf8');
  const filenames = await readdir(questionBankDir);
  const questionFiles = filenames
    .map((filename) => ({ filename, match: filename.match(qtypeFilePattern) }))
    .filter((entry): entry is { filename: string; match: RegExpMatchArray } => entry.match !== null)
    .sort((a, b) => a.filename.localeCompare(b.filename));

  const classifications = classificationsInput
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== '')
    .map(parseClassificationLine);
  const options = parseOptionFile(optionsInput);
  const questions: ImportedQuestion[] = [];
  const questionTypes: Record<string, number> = {};

  for (const { filename, match } of questionFiles) {
    const qType = Number(match[1]);
    const normalizedType = normalizeQType(qType);
    const parsedQuestions = parseQuestionFile(await readFile(join(questionBankDir, filename), 'utf8'), qType);

    questionTypes[normalizedType] = (questionTypes[normalizedType] ?? 0) + parsedQuestions.length;
    questions.push(...parsedQuestions.map((question) => toImportedQuestion(question, normalizedType)));
  }

  return {
    classifications,
    questions,
    options,
    summary: {
      classifications: classifications.length,
      options: options.length,
      questions: questions.length,
      questionTypes,
    },
  };
}

function toImportedQuestion(question: ParsedQuestion, normalizedType: QuestionType): ImportedQuestion {
  return {
    id: question.id,
    classificationId: question.classificationId,
    qType: question.qType,
    normalizedType,
    qGroup: question.qGroup,
    content: question.content,
    answerRaw: question.answerRaw,
    analyzeRaw: question.analyzeRaw,
    useCount: question.useCount,
    difficulty: question.difficulty,
    searchableText: `${question.content} ${question.className}`.replace(/\s+/g, ' ').trim(),
  };
}
