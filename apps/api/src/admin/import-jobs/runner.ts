import type { AdminImportJobOptionsV1, AdminImportJobSummaryV1 } from '@bkyexam-practice/shared';
import type { PgPool } from '../../db/client.js';
import { importQuestionBank } from '../../import/importQuestionBank.js';
import { loadQuestionBankData } from '../../import/loadQuestionBankData.js';
import { throwIfImportCancelled } from '../../import/cancellation.js';
import { generateBankMappings } from '../../mapping/generateBankMappings.js';
import type { AdminImportJobRunContext, AdminImportJobRunner } from './types.js';

export function createPgQuestionBankImportRunner(
  pool: PgPool,
  options: {
    loadData?: typeof loadQuestionBankData;
    importData?: typeof importQuestionBank;
  } = {},
): AdminImportJobRunner {
  const loadData = options.loadData ?? loadQuestionBankData;
  const importData = options.importData ?? importQuestionBank;

  return async function runQuestionBankImport(sourceDir, importOptions, context) {
    await throwIfJobCancelled(context);
    await context?.reportProgress?.({ phase: 'loading_source', current: 0, total: 1 });
    const data = await loadData(sourceDir);
    await context?.reportProgress?.({ phase: 'loading_source', current: 1, total: 1 });
    await throwIfJobCancelled(context);
    const dbClient = await pool.connect();

    try {
      const counts = await importData(dbClient, data, {
        batchSize: importOptions.batchSize,
        generateMappings: importOptions.generateMappings,
        resetBeforeImport: importOptions.resetBeforeImport,
        shouldAbort: context?.shouldAbort,
        onProgress: context?.reportProgress,
      });

      return {
        classifications: counts.classifications,
        questions: counts.questions,
        rawOptions: data.options.length,
        options: counts.options,
        skippedOptions: counts.skippedOptions,
        bankMappings: counts.bankMappings,
        questionTypes: data.summary.questionTypes,
      };
    } finally {
      dbClient.release();
    }
  };
}

export async function dryRunQuestionBankImport(
  sourceDir: string,
  options: AdminImportJobOptionsV1,
  context?: AdminImportJobRunContext,
): Promise<AdminImportJobSummaryV1> {
  await throwIfJobCancelled(context);
  await context?.reportProgress?.({ phase: 'loading_source', current: 0, total: 1 });
  const data = await loadQuestionBankData(sourceDir);
  await context?.reportProgress?.({ phase: 'loading_source', current: 1, total: 1 });
  await throwIfJobCancelled(context);
  const bankMappings = options.generateMappings === false
    ? []
    : generateBankMappings(data.classifications, data.questions);
  const questionIds = new Set(data.questions.map((question) => question.id));
  const importableOptions = data.options.filter((option) => questionIds.has(option.questionId));
  await context?.reportProgress?.({
    phase: 'dry_run_summary',
    current: data.questions.length,
    total: data.questions.length,
  });

  return {
    classifications: data.classifications.length,
    questions: data.questions.length,
    rawOptions: data.options.length,
    options: importableOptions.length,
    skippedOptions: data.options.length - importableOptions.length,
    bankMappings: bankMappings.length,
    questionTypes: data.summary.questionTypes,
  };
}

async function throwIfJobCancelled(context?: AdminImportJobRunContext): Promise<void> {
  await throwIfImportCancelled(context?.shouldAbort);
}
