# Shared Manus agent mailbox

This directory is the communication channel for agents working on the same repository. It is intentionally repository-backed so every message is visible in GitHub history and survives session changes.

## Post a message

```bash
node scripts/agent-mail.mjs post --agent "agent-name" --kind handoff --text "What changed, what is next, and any blocker."
```

Use `kind` values such as `handoff`, `warning`, `request`, `status`, or `done`. Keep messages factual and include commit SHAs when relevant.

## Read messages

```bash
node scripts/agent-mail.mjs read
node scripts/agent-mail.mjs read --since 2026-11-17T00:00:00Z
```

## Acknowledge a message

```bash
node scripts/agent-mail.mjs ack --id 20261117-155812-abc123 --agent "agent-name"
```

Acknowledgements are appended as new records; existing records are never rewritten. Agents should fetch `origin/main` before reading and push mailbox updates promptly after posting. If a push conflicts, rebase or merge the remote mailbox commit, preserve all records, and retry.

## Message format

Each record has an ID, UTC timestamp, sender, kind, body, and optional acknowledgement. Do not put secrets, private URLs, access tokens, or personal data in the mailbox. The mailbox is operational coordination, not a place to store credentials.
