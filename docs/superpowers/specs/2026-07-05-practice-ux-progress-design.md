# BKYExam Practice UX And Progress Design

## Purpose

BKYExam Practice Platform should feel like a small learning product, not a temporary single-page demo. This design keeps the current lightweight React single-page architecture, while giving students clear entry points, reliable resumable practice, mobile-friendly practice flows, and less confusing navigation.

## Decisions

- Keep passwordless usernames for now. A fixed nickname or student number is the student's learning identity.
- Warn users not to share usernames, because progress, drafts, and wrong-question records are tied to the username.
- Keep the current single-page application structure for this iteration.
- Do not introduce full URL routing yet.
- Move logout into a secondary user menu instead of showing it as a primary navigation action.
- Save both submitted answers and unsubmitted draft choices on the server.
- Present practice questions in separate `单选题`, `多选题`, and `判断题` sections instead of one mixed sequence.
- Grade practice only when the student submits the whole session.
- Support `标记存疑` for questions students want to review before submitting.
- Record full URL routing as a future direction.

## Current Behavior

The web app is a React single-page application served from one Vite `index.html`. It switches between internal views with React state: bank list, practice, and wrong-question notebook.

The current `退出` action logs the student out by clearing the server cookie and then returns to the unauthenticated login screen. It does not navigate to a separate homepage because there is no separate homepage route.

Practice sessions are already persisted in PostgreSQL through `practice_sessions` and `practice_session_questions`. Current answer submission is single-question and immediate: each submitted answer updates progress, correctness, and wrong-question records. The target interaction changes this to draft-first practice and whole-session grading, so students can finish a sectioned paper before seeing scores.

## Product Model

The product should use a learning-dossier model:

- A username represents one learning dossier.
- A dossier contains unfinished sessions, submitted answers, draft answers, current position, and wrong-question records.
- Logging in with the same username resumes the same dossier.
- Logging in with someone else's username means sharing their progress, so the UI must explain this clearly.

## Page Structure

### Public Home

The unauthenticated screen becomes a formal product homepage.

Primary copy direction:

```text
BKYExam 练习平台
输入你的固定昵称或学号，即可进入自己的练习档案。
系统会保存练习进度、未提交草稿和错题记录。
```

Username warning:

```text
请使用自己的固定昵称或学号。不要与他人共用同一个用户名，否则练习进度和错题会混在一起。
```

Primary action:

```text
进入我的题库
```

The homepage should feel trustworthy and task-focused. Avoid casual copy like `马上练题` or references to the system not being perfect.

### Logged-In Home

After login, students land on a home dashboard rather than immediately being dropped into a long bank list.

The dashboard shows:

- Student display name.
- `继续练习` card.
- `选择题库` card.
- `错题本` card.

If unfinished sessions exist, the continue card shows:

- Bank name.
- Progress such as `23/70`.
- Last updated time.
- Primary action: `继续`.

If no unfinished sessions exist, the continue card says there is no unfinished practice and points students to the bank list.

### Top Navigation

Primary navigation should contain high-frequency actions only:

- `主页`
- `题库`
- `错题本`
- User nickname button

The user nickname button opens a secondary menu. The menu contains low-frequency account actions:

- Current username / learning dossier label.
- Short reminder that this username owns the saved progress.
- `注销登录`.

The top bar must not show `退出` as a primary button. Returning to the bank list should be a normal navigation action, not a logout action.

### Bank List

The bank list keeps the current stable local filtering behavior:

- Category / subject filter.
- Search by bank name, subject, category, description, and keywords.
- Mode selector for random or sequential practice.
- Refresh bank list button.

Starting practice has two cases:

- If no unfinished session exists for the selected bank and mode, create a new session.
- If an unfinished session exists, show a choice: `继续上次` or `新开一组`.

This avoids accidentally abandoning unfinished practice.

### Practice Page

Practice should preserve the existing question card model, but make saving explicit and mobile-friendly.

The question flow should be grouped by question type instead of mixing all objective types together. A session has three sections:

- `单选题`
- `多选题`
- `判断题`

Each section has its own progress summary such as `12/30`. Students can switch sections from a section tab bar or compact mobile selector.

Behavior:

- Selecting an answer immediately saves a server-side draft.
- Moving between questions saves the current question position.
- Marking a question as `存疑` saves a server-side review flag.
- There is no normal single-question scoring step.
- `交卷并查看结果` submits the whole active session for grading.
- Whole-session submission records formal attempts, updates progress and correctness, clears submitted drafts, and writes wrong-question records.
- Returning to the bank list does not lose progress.
- Reloading the browser restores the session, current question, submitted answers, and unsubmitted drafts.
- A completed session is read-only and shows results.

UI indicators:

- Show `草稿已保存` or `保存中...` near the question actions.
- Submitted questions remain marked in the question map.
- Drafted but unsubmitted questions use a separate visual state from submitted questions.
- Questions marked `存疑` use a separate visual state and can be filtered before submission.
- Before whole-session submission, if any question is unanswered, show a confirmation dialog with `继续作答` and `仍然交卷`.
- After submission, show total score and per-section score summaries.

Question state labels:

- `未作答`
- `已作答`
- `存疑`
- `已作答且存疑`
- `已评分`

### Wrong-Question Notebook

Keep the current wrong-question notebook scope for this iteration. The only navigation change is that it becomes a primary destination from the logged-in home and top navigation.

Future improvement can show full question content rather than IDs, but that is outside this design.

## Mobile Design

The mobile experience should prioritize one-handed practice.

### Mobile Home

- Use stacked cards.
- Keep the username form full-width.
- Keep the warning concise and directly below the input.

### Mobile Bank List

- Stack filters vertically.
- Keep search first, then category, then mode.
- Use full-width bank cards.
- Keep `开始练习` full-width at the bottom of each card.

### Mobile Practice

- Put the question content first.
- Show section tabs or a compact section selector for `单选题`, `多选题`, and `判断题`.
- Collapse the per-section question map behind a `题号` button or compact horizontal scroller.
- Keep a sticky bottom action bar with `上一题`, `标记存疑`, and `下一题`.
- Keep `交卷并查看结果` visible as a deliberate secondary action near the section/progress summary, not as an accidental sticky button.
- Keep draft-save status above the sticky action bar.
- Avoid side panels on small screens.

## Data Design

Existing tables already support persisted sessions and submitted progress:

- `practice_sessions`
- `practice_session_questions`
- `practice_attempts`
- `wrong_questions`

This iteration needs persistent drafts and current position. The schema should add draft rows and a numeric current-position field without changing the submitted-answer model.

Recommended additions:

- Store current question position for each active session.
- Store per-question draft answers.
- Store draft update timestamps.

Add a new `practice_session_drafts` table:

- `session_id`
- `question_id`
- `student_id`
- `draft_answer`
- `marked_for_review`
- `updated_at`

Add a current-position field on `practice_sessions`:

- `current_sort`, a positive integer storing the last viewed question's 1-based session order.

Also store the question type on session question rows or derive it from the joined `questions.normalized_type`. The API response should group questions into sections by `normalized_type`, with `single_choice`, `multiple_choice`, and `yes_no` mapped to `单选题`, `多选题`, and `判断题`.

Drafts and review flags are not attempts. They should not affect score, correctness, or wrong-question records until the whole session is submitted.

## API Design

New API behavior should be small and explicit.

Recommended endpoints:

- `GET /api/practice/sessions/active` returns unfinished sessions for the current student.
- `GET /api/practice/sessions/:sessionId` returns session questions grouped by type, submitted state, draft answers, review flags, current position, and score summary if completed.
- `PATCH /api/practice/sessions/:sessionId/progress` saves the current question position.
- `PUT /api/practice/sessions/:sessionId/drafts/:questionId` saves a draft answer.
- `DELETE /api/practice/sessions/:sessionId/drafts/:questionId` clears a draft, normally after submission.
- `PATCH /api/practice/sessions/:sessionId/review/:questionId` saves or clears the `存疑` flag.
- `POST /api/practice/sessions/:sessionId/submit` grades the whole session and completes it.

Whole-session submission becomes authoritative:

- It reads drafts for the current student's session.
- It records formal `practice_attempts` rows for answered questions.
- It updates progress and correctness.
- It writes wrong-question records for wrong answers.
- It marks the session `completed`.
- It clears completed drafts or leaves them ignored for audit-free simplicity.

The existing single-question answer endpoint can remain temporarily for compatibility and existing tests, but the web app should stop using it for normal practice.

## Error Handling

- If draft save fails, keep the local choice visible and show `草稿保存失败，稍后会重试`.
- If resume fails because the session was completed or deleted, return to the bank list with a clear notice.
- If a user opens the same session in two tabs, the latest draft save wins, but submitted answers remain authoritative.
- If the session is completed, reject draft and review-flag changes with a read-only message.
- If students attempt to submit with unanswered questions, ask for confirmation before grading.

## Testing

API tests should cover:

- Listing active sessions for the current student only.
- Saving draft answers.
- Restoring draft answers with session details.
- Saving and restoring `存疑` flags.
- Clearing a draft after formal submission.
- Saving and restoring current question position.
- Grouping session questions into single-choice, multiple-choice, and yes/no sections.
- Whole-session submission grading all draft answers.
- Whole-session submission writing wrong-question records.
- Whole-session submission marking the session completed and read-only.
- Rejecting draft/progress changes for another student's session.

Web tests should cover:

- Public homepage copy and username warning.
- Logged-in dashboard shows continue, bank list, and wrong-question entry points.
- User nickname menu contains logout as a secondary action.
- Returning to the bank list does not log out.
- Draft selection is restored after session reload.
- Questions render in `单选题`, `多选题`, and `判断题` sections.
- `标记存疑` changes the question state and persists after reload.
- Whole-session submission shows a confirmation when questions are unanswered.
- Whole-session submission displays total and per-section results.
- Completed sessions are read-only.

Manual browser checks should cover:

- Desktop homepage, dashboard, bank list, practice, and wrong-question notebook.
- Mobile viewport for homepage, bank filters, and sticky practice actions.
- Refreshing during a practice session restores progress and draft choices.

## Future Direction: Full Routing

Full routing is not part of this iteration, but should remain a later development direction.

Potential routes:

- `/` public homepage or logged-in dashboard.
- `/banks` bank list.
- `/practice/:sessionId` practice session.
- `/wrong` wrong-question notebook.

Benefits:

- Browser refresh and back/forward behavior become more natural.
- Users can bookmark or directly reopen a session URL.
- The app feels more like a full website than a stateful single screen.

Costs:

- Requires adding a router and route-level state restoration.
- Requires Nginx fallback configuration for client-side routes.
- Increases scope beyond the current UX and progress-saving fix.

Recommendation: keep the current single-page state model for this iteration, then evaluate full routing after resumable practice and mobile usability are stable.

## Out Of Scope

- Password login.
- Class-level access codes.
- Full URL routing implementation.
- Full wrong-question content redesign.
- Admin tools for managing users or sessions.
