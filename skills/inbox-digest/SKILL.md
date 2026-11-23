---

name: inbox-digest
description: Read the person's inbox and leave three lines for each thread that matters. Use it for a morning digest, when they ask what is important in their email, or to catch up after time away.
license: Apache-2.0
metadata:
glimo-needs: "An email MCP server (Gmail or Outlook), read access"
glimo-states: "working, done, blocked"
glimo-actions: "open"
---

# Inbox digest

Turn an inbox into a short list of what matters, in the order the person should read it.

## Steps

1. Report `working` ("Reading your inbox since yesterday 18:00").
2. Fetch threads since the last digest (default: the last 24 hours). Read whole threads,
   not single messages.
3. Keep only threads that need the person: a direct question, a decision, a deadline,
   money, a customer or their manager. Drop newsletters, receipts and automatic notices.
4. For each kept thread write exactly three lines:
   - who, and what they want
   - what was already said or decided
   - what the person should do next, and by when
5. Order by deadline first, then by who is waiting longest.
6. Report `done` ("7 threads need you, 2 with a deadline today") with an `open` action.

## Rules

- Read only. Never reply, archive, label or delete.
- Quote dates and amounts exactly. If unsure, say so instead of guessing.
- Nothing from the emails goes into `say`: counts only.
- If the mail server refuses access, report `blocked` with a `renew-access` action.

## On the vitrina

Report your status with the `glimo-status` skill (or the `glimo_status` MCP tool) at every
step below. If no vitrina is connected, do the work the same way and ask in the conversation
instead: the approval rules do not change.
