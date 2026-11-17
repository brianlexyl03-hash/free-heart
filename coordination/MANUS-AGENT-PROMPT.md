# Copy-paste prompt for collaborating Manus agents

You are a collaborating Manus agent working on the Free Heart repository:

`https://github.com/brianlexyl03-hash/free-heart`

Your communication channel with the primary Manus agent is the shared mailbox:

`coordination/mailbox.jsonl`

Read the full protocol before editing:

`coordination/AGENT-MAILBOX.md`

## Required workflow

1. Fetch the newest branch before doing anything:

   ```bash
   git fetch origin main
   git checkout main
   git pull --ff-only origin main
   ```

2. Read all current mailbox messages:

   ```bash
   node scripts/agent-mail.mjs read
   ```

3. Post a short status message before editing:

   ```bash
   node scripts/agent-mail.mjs post \
     --agent "YOUR-AGENT-NAME" \
     --kind status \
     --text "I am inspecting IMPLEMENTATION AREA. I will deliver OUTCOME."
   ```

4. Work only on the assigned area. Do not undo another agent’s changes. Do not reset, force-push, rewrite history, or commit secrets.

5. Validate the work before committing. Use the project’s existing checks, plus a focused smoke test for the feature you changed.

6. Post a handoff before pushing:

   ```bash
   node scripts/agent-mail.mjs post \
     --agent "YOUR-AGENT-NAME" \
     --kind handoff \
     --text "Changed FILES. Validation: CHECKS. Commit will be COMMIT-SHA or is ready to push. Risks/blockers: NONE or DETAILS."
   ```

7. Commit and push to `main` only after fetching again and confirming the working tree is based on the current remote branch:

   ```bash
   git fetch origin main
   git merge --ff-only origin/main
   git add ONLY-THE-FILES-YOU-CHANGED
   git commit -m "Short imperative description"
   git push origin main
   ```

8. After pushing, post the exact commit SHA and any follow-up needed:

   ```bash
   node scripts/agent-mail.mjs post \
     --agent "YOUR-AGENT-NAME" \
     --kind done \
     --text "Published COMMIT-SHA. Changed FILES. Checks passed: CHECKS. Primary agent should next do FOLLOW-UP."
   ```

## Rules for this project

- Keep ordinary movies and series separate from WeFeed short dramas and vertical reels.
- Never silently route a WeFeed title through ordinary MovieBox playback.
- Never advertise an unverified stream as a real movie.
- Reject ad-only, trailer-only, redirect, empty, or non-video media before playback or download.
- Use only authorized, lawful sources and preserve provider identity in API responses and UI.
- Do not place credentials, cookies, private URLs, access tokens, or personal data in the mailbox.
- If another agent has pushed while you worked, stop and synchronize before committing. Preserve both sets of changes.
- If blocked, post a `warning` message explaining the exact blocker instead of guessing or claiming completion.

## How to address the primary agent

Write messages as operational handoffs. Include:

- What you inspected or changed.
- Exact files and routes affected.
- Tests or smoke checks run.
- Commit SHA, if already pushed.
- Any known limitation or next action.

The primary agent reads this mailbox from the shared branch and uses it to coordinate the next implementation step.
