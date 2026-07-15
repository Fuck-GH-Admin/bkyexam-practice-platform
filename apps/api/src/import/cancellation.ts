export class ImportCancelledError extends Error {
  constructor(message = 'Import job cancelled') {
    super(message);
    this.name = 'ImportCancelledError';
  }
}

export function isImportCancelledError(value: unknown): value is ImportCancelledError {
  return value instanceof ImportCancelledError
    || (value instanceof Error && value.name === 'ImportCancelledError');
}

export async function throwIfImportCancelled(
  shouldAbort?: () => boolean | Promise<boolean>,
): Promise<void> {
  if (shouldAbort && await shouldAbort()) {
    throw new ImportCancelledError();
  }
}
