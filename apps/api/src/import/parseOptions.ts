export interface ParsedOption {
  id: string;
  questionId: string;
  sort: number;
  content: string;
}

const optionRecordPattern = /^[^|]+\|[^|]+\|\s*[-+]?\d+(?:\.\d+)?\s*\|/;

export function parseOptionFile(input: string): ParsedOption[] {
  const records: string[] = [];
  let current: string | null = null;

  for (const line of normalizeLineEndings(input).split('\n')) {
    if (current === null && (line.trim() === '' || line.trimStart().startsWith('#'))) {
      continue;
    }

    if (optionRecordPattern.test(line)) {
      if (current !== null) {
        records.push(current);
      }

      current = line;
      continue;
    }

    if (current !== null) {
      current = `${current}\n${line}`;
    }
  }

  if (current !== null) {
    records.push(current);
  }

  return records.map(parseOptionLine);
}

export function parseOptionLine(line: string): ParsedOption {
  const parts = line.split('|');

  if (parts.length < 4) {
    throw new Error(`Invalid option line: expected at least 4 fields, got ${parts.length}`);
  }

  const [rawId, questionId, sort, ...contentParts] = parts;
  const id = stripLeadingBom(rawId);
  const parsedSort = Number(sort);

  if (sort.trim() === '' || !Number.isFinite(parsedSort)) {
    throw new Error(`Invalid option sort: ${sort}`);
  }

  return {
    id,
    questionId,
    sort: parsedSort,
    content: contentParts.join('|'),
  };
}

function stripLeadingBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}

function normalizeLineEndings(input: string): string {
  return input.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}
