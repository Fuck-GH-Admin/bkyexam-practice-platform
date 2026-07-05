import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseClassificationLine } from './parseClassification.js';
import { parseOptionFile } from './parseOptions.js';
import { parseQuestionFile } from './parseQuestionFile.js';
import { normalizeQType } from './qtype.js';

export interface QuestionBankSummary {
  classifications: number;
  options: number;
  questions: number;
  questionTypes: Record<string, number>;
}

const qtypeFilePattern = /^qtype_(\d+)(?:_.*)?\.txt$/i;

export async function loadQuestionBankSummary(questionBankDir: string): Promise<QuestionBankSummary> {
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
  let questions = 0;
  const questionTypes: Record<string, number> = {};

  for (const { filename, match } of questionFiles) {
    const qType = Number(match[1]);
    const parsedQuestions = parseQuestionFile(await readFile(join(questionBankDir, filename), 'utf8'), qType);
    const normalizedType = normalizeQType(qType);

    questions += parsedQuestions.length;
    questionTypes[normalizedType] = (questionTypes[normalizedType] ?? 0) + parsedQuestions.length;
  }

  return { classifications: classifications.length, options: options.length, questions, questionTypes };
}

async function main(): Promise<void> {
  const questionBankDir = process.argv[2];

  if (!questionBankDir) {
    console.error('Usage: npm run import:summary -w @bkyexam-practice/api -- <questionbank-dir>');
    process.exitCode = 1;
    return;
  }

  const summary = await loadQuestionBankSummary(questionBankDir);
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
