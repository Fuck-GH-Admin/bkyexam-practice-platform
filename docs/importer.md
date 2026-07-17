# Importer

The importer parses exported text into typed records and can load those records into PostgreSQL with idempotent upserts.

## Source Inputs

Importer inputs come from the source `questionbank` export directory:

- `classifications.txt`: source classification tree rows.
- `change_question_answers.txt`: option export for choice questions, parsed by `parseOptionLine` and `parseOptionFile`.
- `qtype_<digits>.txt` and `qtype_<digits>_*.txt`: question blocks grouped by source question type, parsed by `parseQuestionFile`.

The platform treats these files as read-only source exports.

The source exports may live outside this git worktree. For example, a local checkout can keep them at `C:\path\to\BKYExam\Monitor\questionbank` while `PracticePlatform` is developed from a separate worktree. Pass the export directory explicitly instead of relying on a relative path inside the workspace.

## Parser Functions

### `parseClassificationLine`

Location: `apps/api/src/import/parseClassification.ts`

Parses one pipe-delimited classification line with six fields:

```text
id|name|parentId|qGroup|sort|isDeleted
```

It converts the source root parent UUID `00000000-0000-0000-0000-000000000000` to `null`, parses numeric `qGroup` and `sort`, and accepts only `true` or `false` for `isDeleted`.

### `parseOptionLine`

Location: `apps/api/src/import/parseOptions.ts`

Parses one option record:

```text
id|questionId|sort|content
```

The content field can contain additional `|` characters. The parser rejoins those trailing pieces into `content` instead of dropping them.

### `parseOptionFile`

Location: `apps/api/src/import/parseOptions.ts`

Splits an option export into records and parses each record with `parseOptionLine`. It supports multiline option content, skips leading blank lines, and skips leading comment lines that start with `#`.

### `parseQuestionFile`

Location: `apps/api/src/import/parseQuestionFile.ts`

Parses question blocks that start with headers like:

```text
=== Q1 (useCount=12, diff=0.4) ===
```

Each block requires `qID`, `cID`, `qGroup`, `Content`, and `Answer`. `Content`, `Answer`, and `Analyze` can span multiple lines. The parser extracts the classification UUID and optional class name from `cID`, preserves raw content and answer text, and attaches the caller-provided numeric `qType`.

### `normalizeAnswer`

Location: `apps/api/src/import/normalizeAnswer.ts`

Normalizes raw answers for currently known objective types:

- `qType` 1 and 2 return `{ kind: 'option_ids', value: string[] }` from comma-separated option UUIDs.
- `qType` 3 maps the source yes/no sentinel UUIDs to `{ kind: 'yes_no', value: boolean }`.
- Other types return `{ kind: 'raw', value: string }`.

## Structured Data Loader

### `loadQuestionBankData`

Location: `apps/api/src/import/loadQuestionBankData.ts`

`loadQuestionBankData(questionBankDir)` is the bridge between the parser layer and the database importer. It reads the source export directory, reuses the existing classification, option, question, and question-type parsers, and returns structured in-memory records ready for database mapping:

- `classifications`: parsed classification rows with the same fields returned by `parseClassificationLine`.
- `questions`: parsed question rows with `normalizedType` from `normalizeQType` and `searchableText` built from question content plus the source class name.
- `options`: parsed option rows with the same fields returned by `parseOptionFile`.
- `summary`: counts for classifications, options, questions, and normalized question types.

The loader does not write to PostgreSQL. `importQuestionBank` consumes this structured model, batches writes, and persists records idempotently.

## Database Importer

### `importQuestionBank`

Location: `apps/api/src/import/importQuestionBank.ts`

`importQuestionBank(client, data, { batchSize, onProgress })` writes data returned by `loadQuestionBankData` into PostgreSQL. It wraps the import in a transaction, writes classifications before questions, questions before options, and generated bank mappings after options. `onProgress` receives phase-level batch progress for `classifications/questions/options/bank_mappings`.

The result separates corpus input counts from actual logical writes:

```ts
{
  classifications: number;
  questions: number;
  options: number;
  skippedOptions: number;
  bankMappings: number;
  writes: {
    classifications: number;
    questions: number;
    options: number;
    bankMappings: number;
  };
}
```

The source option export can contain records whose `questionId` is not present in the exported question files. Those orphan options cannot satisfy the database foreign key, so the importer skips them and reports the count as `skippedOptions`.

The importer uses parameterized SQL and change-aware PostgreSQL upsert semantics:

- `classifications`: `ON CONFLICT (id) DO UPDATE` for `name`, `parent_id`, `q_group`, `sort`, and `is_deleted`.
- `questions`: `ON CONFLICT (id) DO UPDATE` for classification, type, content, answer, analysis, usage, difficulty, and searchable text fields.
- `question_options`: `ON CONFLICT (id) DO UPDATE` for `question_id`, `sort`, and `content`.
- `bank_mappings`: generated with `generateBankMappings(data.classifications, data.questions)` and persisted with `ON CONFLICT (bank_id) DO UPDATE` for generated mapping metadata and question counts.

Each batch first filters rows whose persisted values are already identical:

```sql
INSERT INTO target (...)
SELECT incoming.*
FROM (VALUES ...) incoming (...)
WHERE NOT EXISTS (
  SELECT 1
  FROM target existing
  WHERE existing.id = incoming.id
    AND ROW(existing...) IS NOT DISTINCT FROM ROW(incoming...)
)
ON CONFLICT (...) DO UPDATE ...
WHERE ROW(target...) IS DISTINCT FROM ROW(EXCLUDED...)
```

The prefilter avoids conflict-update work for unchanged corpus rows; the conflict-level predicate remains as a race-safe final guard. Repeating the same full import therefore reports zero logical writes and does not create updated/dead tuples.

If any write fails, the importer rolls back the transaction and rethrows the original error.

## Corpus Smoke Result

Review smoke parsing against the source corpus succeeded with 89,922 questions and 180,323 options parsed.

## Full Import Slow Smoke

The optional full-corpus profile turns the manual import check into a repeatable isolated run:

```powershell
npm run smoke:import:full:docker -- C:\path\to\BKYExam\Monitor\questionbank
```

It starts the Compose `postgres-test` service, applies all migrations, clears only the guarded `bkyexam_test` database, parses the complete export, and compares the result against `apps/api/src/import/currentCorpusBaseline.ts`. It then imports the same in-memory data twice and verifies that the second upsert leaves all database counts unchanged.

The recorded baseline includes:

- 2,941 classifications.
- 89,922 questions.
- 180,323 raw options.
- 154,899 importable options.
- 25,424 orphan options skipped by the foreign-key filter.
- 2,662 generated bank mappings.
- the complete normalized question-type distribution.

The profile is intentionally not part of every CI run because the source corpus is external to Git and the full double import takes minutes. A legitimate source update should be reviewed before changing the baseline.

## Sustained Capacity Profile

Use the isolated capacity profile for repeated full non-reset imports:

```powershell
npm run smoke:import:capacity:docker -- C:\path\to\BKYExam\Monitor\questionbank --cycles=3 --batch-size=1000
```

The profile:

1. applies all migrations and resets only the dedicated test database;
2. loads the source files once;
3. performs one initial full import;
4. repeats the same full import for the requested cycle count;
5. requires every repeat cycle to report zero logical writes;
6. records duration, WAL delta, database size and PostgreSQL insert/update/dead-tuple statistics;
7. verifies final corpus counts against the fixed baseline.

Optional thresholds:

```text
--max-repeat-ms=<milliseconds>
--max-repeat-wal-bytes=<bytes>
```

2026-07-16 local Docker result with the complete corpus, `batchSize=1000`, and three repeat cycles:

| Metric | Result |
| --- | ---: |
| Initial import | 24,685.58 ms |
| Repeat durations | 9,321.40 / 9,406.21 / 9,792.22 ms |
| Repeat average / max | 9,506.61 / 9,792.22 ms |
| Repeat logical writes | 0 for all four tables in all cycles |
| Repeat WAL | 1,177,512 / 168 / 244,424 bytes |
| Repeat WAL average / max | 474,034.67 / 1,177,512 bytes |
| Updated tuples / dead tuples | 0 / 0 |
| Final counts | 2,941 / 89,922 / 154,899 / 2,662 |

Before the incoming-row prefilter, the same unchanged repeats took about 13.9–14.6 seconds and generated about 14–15 MiB WAL per cycle. The optimized run reduces repeat time by roughly one third and reduces measured WAL by more than 90%, while preserving changed-row updates. A real PostgreSQL integration test separately verifies initial insert, zero-write unchanged repeat, and a subsequent changed classification/question/option update.

## Import Summary Command

The API package includes a read-only summary command that parses the source export files and prints a pretty JSON summary to stdout:

```bash
npm run import:summary -w @bkyexam-practice/api -- <questionbank-dir>
```

For example, from `PracticePlatform` on Windows:

```bash
npm run import:summary -w @bkyexam-practice/api -- C:\path\to\BKYExam\Monitor\questionbank
```

The command counts parsed classifications, options, questions, and normalized question types, and does not write to the source files or database. It prints numeric counts, not full parsed records:

```json
{
  "classifications": 1,
  "options": 1,
  "questions": 2,
  "questionTypes": {
    "single_choice": 1,
    "yes_no": 1
  }
}
```

## Database Import Command

The API package includes a database import command:

```bash
npm run import:db -w @bkyexam-practice/api -- <questionbank-dir>
```

`DATABASE_URL` must be set. The command loads the source files with `loadQuestionBankData`, imports classifications, questions, options, and generated bank mappings into PostgreSQL with `importQuestionBank`, and prints JSON counts:

```json
{
  "classifications": 1,
  "questions": 2,
  "options": 1,
  "skippedOptions": 0,
  "bankMappings": 1
}
```

## Current Boundaries

The parser layer remains side-effect free. The database importer handles transactional, change-aware idempotent loading, phase-level progress callbacks, logical write counts, and isolated sustained capacity profiling. Import Jobs persists these progress snapshots and streams them through SSE. File/line-level structured error downloads, adaptive batch sizing, parallel table loading, online index strategy, and a production capacity threshold for every hardware class remain future enhancements.
