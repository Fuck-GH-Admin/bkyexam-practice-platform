export interface ParsedClassification {
  id: string;
  name: string;
  parentId: string | null;
  qGroup: number;
  sort: number;
  isDeleted: boolean;
}

export const ROOT_PARENT_ID = '00000000-0000-0000-0000-000000000000';

export function parseClassificationLine(line: string): ParsedClassification {
  const parts = line.split('|');

  if (parts.length !== 6) {
    throw new Error(`Invalid classification line: expected 6 fields, got ${parts.length}`);
  }

  const [rawId, name, parentId, qGroup, sort, isDeleted] = parts;
  const id = stripLeadingBom(rawId);
  const parsedQGroup = Number(qGroup);
  const parsedSort = Number(sort);
  const normalizedIsDeleted = isDeleted.toLowerCase();

  if (qGroup.trim() === '' || !Number.isFinite(parsedQGroup)) {
    throw new Error(`Invalid classification qGroup: ${qGroup}`);
  }

  if (sort.trim() === '' || !Number.isFinite(parsedSort)) {
    throw new Error(`Invalid classification sort: ${sort}`);
  }

  if (normalizedIsDeleted !== 'true' && normalizedIsDeleted !== 'false') {
    throw new Error(`Invalid classification isDeleted: ${isDeleted}`);
  }

  return {
    id,
    name,
    parentId: parentId === ROOT_PARENT_ID ? null : parentId,
    qGroup: parsedQGroup,
    sort: parsedSort,
    isDeleted: normalizedIsDeleted === 'true',
  };
}

function stripLeadingBom(value: string): string {
  return value.replace(/^\uFEFF/, '');
}
