---

name: social-calendar
description: Schedule the week's social media posts and show which ones need the person's OK before they go out. Use it to plan a content week, queue approved posts or review what is scheduled.
license: Apache-2.0
metadata:
glimo-needs: "Social account MCP servers (LinkedIn, Instagram or others) with scheduling access"
glimo-states: "working, waiting, done"
glimo-actions: "approve, open"
---

# Social calendar

Plan the week, queue what is approved, and never publish on your own.

## Steps

1. Report `working` ("Planning this week on three accounts").
2. Read the content brief and what performed well in the last four weeks.
3. Draft the posts for the week: one idea per post, written for each network (length,
   format, hashtags), with the suggested day and time.
4. Report `waiting` ("3 posts need your OK before they go out") with:
   - `approve` "Approve posts", primary, **sensitive**
   - `open` "See posts", secondary
5. On approval schedule exactly the approved posts, then report `done`
   ("3 posts scheduled for this week").

## Rules

- Publishing is sensitive. Nothing is scheduled or posted without a collected approval.
- If a post mentions a person, a customer or a number, flag it for review explicitly.
- If a draft reads like an advert, rewrite it before asking.
- Never reply to comments or messages on the person's behalf.

## On the vitrina

Report your status with the `glimo-status` skill (or the `glimo_status` MCP tool) at every
step below. If no vitrina is connected, do the work the same way and ask in the conversation
instead: the approval rules do not change.
