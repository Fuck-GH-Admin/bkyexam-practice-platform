import { inferClassNameFromLoginName } from '../../auth/studentAuth.js';

export function normalizeDisplayName(displayName: string | undefined, loginName: string) {
  return displayName?.trim() || loginName;
}

export function normalizeCreateClassName(className: string | null | undefined, loginName: string) {
  if (className === undefined) return inferClassNameFromLoginName(loginName);
  return normalizeNullableText(className);
}

export function normalizeNullableText(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  return value.trim() || null;
}
