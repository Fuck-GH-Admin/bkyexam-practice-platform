# Bank Mapping

Bank mapping turns raw source classification nodes into product-facing banks that students and admins can understand.

## Top-Level Categories

The shared category schema currently allows these top-level categories:

- `社科`
- `信息技术`
- `英语`
- `其他`

## Seed `qGroup` Mapping

The design seed maps source `qGroup` values to top-level categories as follows:

| Category | qGroup values |
| --- | --- |
| `社科` | `200`, `201`, `202`, `203`, `204` |
| `信息技术` | `0`, `1`, `2`, `3`, `4`, `5`, `6`, `7`, `8`, `20`, `30`, `66` |
| `英语` | `97`, `82` |

Any source bank outside the seed mapping should default to `其他` or remain in review until an admin curates it.

## Automatic Mapping Rules

`generateBankMapping` derives the initial admin-facing mapping from the raw source bank before any manual curation.

`generateBankMappings` builds persistable `bank_mappings` rows from imported question bank data. It accepts the loaded `classifications` and `questions`, counts questions attached directly to each classification, walks `parentId` links to add descendant question counts to ancestor classifications, omits classifications with neither direct nor descendant questions, and then applies the same `generateBankMapping` rules to every included classification.

This means parent banks can be persisted even when they contain no direct questions, as long as a child classification contains questions. Empty branches are intentionally excluded so the initial mapping table only contains banks that can lead to practice content.

### Subject Name Heuristics

Subject names are inferred from `qGroup` and obvious course words in the source name:

- `66` or names containing `Python` map to `Python`.
- Names containing `C++`, or `qGroup` `8`, map to `C++`.
- `qGroup` `7`, or names containing `C语言` or `C程序`, map to `C语言`.
- `qGroup` `1`, or names containing `Excel`, map to `Excel`.
- `qGroup` `2`, or names containing `PPT` or `PowerPoint`, map to `PowerPoint`.
- `qGroup` `0`, or names containing `Office`, `Word`, or `计算机基础`, map to the matching simple subject such as `Office`, `Word`, or `计算机基础`.
- `qGroup` `97` or `82` maps to `大学英语`, except names containing `高级英语` or `四级` use those more specific subjects.
- `qGroup` `201` maps to `思想道德与法治`.
- `qGroup` `200` maps to `中国近现代史纲要` when the source name indicates that course, otherwise `社科`.
- `qGroup` `204` maps to `习近平新时代中国特色社会主义思想概论`.

### Hidden Structural Nodes

Structural classification nodes are hidden automatically because they are navigation buckets, not student-facing banks. Hidden nodes include exact/effective names such as:

- Question type buckets: `单选题`, `多选题`, `判断题`, `填空题`, `编程题`.
- Chapter/unit buckets: `第1章`-like, `Unit 1`-like, `Passage 1`-like, and `Conversation One`-like names.
- Operation/test buckets: `基本操作`, `综合应用`, `测试`, `考试2`.

Mappings are visible only when the node is not structural and has either direct questions or descendant questions. Visible mappings start with status `active`; structural or empty mappings start with status `hidden`.

### Generated Metadata

Automatic keywords include the subject name, top-level category, `qGroup` string, detected year/version tokens such as `2026`, and obvious technology or course words from the source name. Keywords are deduplicated.

Other generated defaults are intentionally conservative: `difficulty` is `unknown`, `questionTypes` is empty, `notes` is empty, `audience` is `beginner` only for names containing `零基础`, and `examPurpose` is inferred only from names containing `期末`, `补考`, `等级`, `竞赛`, or `机考`.

## Admin-Editable Fields

These fields are present in the data model, but the administrator UI and write API are not implemented yet.

Admins should be able to edit these mapping fields:

- Category, backed by `bank_mappings.subject_category`.
- Subject, backed by `bank_mappings.subject_name`.
- Display name, backed by `bank_mappings.bank_name`.
- Visibility, backed by `bank_mappings.visible`.
- Status, backed by `bank_mappings.status`.
- Tags, backed by `bank_mappings.keywords` and related metadata fields.
- Notes, backed by `bank_mappings.notes`.

The raw source name should be preserved in `bank_mappings.raw_name` so admin edits do not erase provenance.
