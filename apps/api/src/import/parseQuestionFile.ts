export interface ParsedQuestion {
  id: string;
  classificationId: string;
  className: string;
  qType: number;
  qGroup: number;
  content: string;
  answerRaw: string;
  analyzeRaw: string;
  useCount: number;
  difficulty: number;
}

type QuestionBlock = {
  header: string;
  lines: string[];
};

type FieldName = 'Content' | 'Answer' | 'Analyze';

const blockHeaderPattern = /^===\s+Q\d+\s+\(useCount=([^,]+),\s*diff=([^)]*)\)\s+===$/;
const knownFieldPattern = /^(qID|cID|qGroup|Content|Answer|Analyze):\s*(.*)$/;

export function parseQuestionFile(input: string, qType: number): ParsedQuestion[] {
  return splitBlocks(input).map((block) => parseQuestionBlock(block, qType));
}

function splitBlocks(input: string): QuestionBlock[] {
  const blocks: QuestionBlock[] = [];
  let current: QuestionBlock | null = null;

  for (const line of normalizeLineEndings(input).split('\n')) {
    if (blockHeaderPattern.test(line)) {
      if (current) {
        blocks.push(trimTrailingEmptyLines(current));
      }

      current = { header: line, lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    blocks.push(trimTrailingEmptyLines(current));
  }

  return blocks;
}

function trimTrailingEmptyLines(block: QuestionBlock): QuestionBlock {
  const lines = [...block.lines];

  while (lines.at(-1) === '') {
    lines.pop();
  }

  return { ...block, lines };
}

function parseQuestionBlock(block: QuestionBlock, qType: number): ParsedQuestion {
  const headerMatch = block.header.match(blockHeaderPattern);

  if (!headerMatch) {
    throw new Error(`Invalid question block header: ${block.header}`);
  }

  const fields = new Map<string, string>();
  let currentField: FieldName | null = null;

  for (const line of block.lines) {
    const fieldMatch = line.match(knownFieldPattern);

    if (fieldMatch) {
      const [, name, value] = fieldMatch;
      fields.set(name, value);
      currentField = isMultilineField(name) ? name : null;
      continue;
    }

    if (currentField) {
      fields.set(currentField, `${fields.get(currentField) ?? ''}\n${line}`);
    }
  }

  const id = requiredField(fields, 'qID');
  const cID = requiredField(fields, 'cID');
  const qGroup = requiredField(fields, 'qGroup');
  const content = requiredField(fields, 'Content');
  const answerRaw = requiredField(fields, 'Answer');
  const parsedQGroup = parseFiniteNumber(qGroup, 'qGroup', id);
  const parsedUseCount = parseFiniteNumber(headerMatch[1], 'useCount', id);
  const parsedDifficulty = parseFiniteNumber(headerMatch[2], 'difficulty', id);
  const classification = cID.match(/^([^\s]+)(?:\s+\((.*)\))?$/);

  if (!classification) {
    throw new Error(`Invalid cID field for question ${id}: ${cID}`);
  }

  return {
    id,
    classificationId: classification[1],
    className: classification[2] ?? '',
    qType,
    qGroup: parsedQGroup,
    content,
    answerRaw,
    analyzeRaw: fields.get('Analyze') ?? '',
    useCount: parsedUseCount,
    difficulty: parsedDifficulty,
  };
}

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function parseFiniteNumber(value: string, fieldName: string, questionId: string): number {
  const parsed = Number(value);

  if (value.trim() === '' || !Number.isFinite(parsed)) {
    throw new Error(`Invalid ${fieldName} for question ${questionId}: ${value}`);
  }

  return parsed;
}

function isMultilineField(name: string): name is FieldName {
  return name === 'Content' || name === 'Answer' || name === 'Analyze';
}

function requiredField(fields: Map<string, string>, name: string): string {
  const value = fields.get(name);

  if (value === undefined) {
    throw new Error(`Missing required question field: ${name}`);
  }

  return value;
}
