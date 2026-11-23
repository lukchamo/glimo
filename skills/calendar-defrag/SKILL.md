---

name: calendar-defrag
description: Reorder meetings around the person's priorities and protect their focus hours. Use it when they ask to free an afternoon, fix overlapping meetings or defend deep-work blocks.
license: Apache-2.0
metadata:
glimo-needs: "A calendar MCP server with write access"
glimo-states: "working, waiting, done"
glimo-actions: "approve, undo, open"
---

# Clash-free calendar

Make room in the calendar without breaking anyone else's day.

## Steps

1. Report `working` ("Looking at this week").
2. Read the calendar for the period and the person's rules (focus hours, days without
   meetings, meetings that must not move).
3. Find conflicts: overlaps, back-to-back blocks without a break, focus hours invaded.
4. Propose the smallest set of moves. For each move pick a slot where **every** attendee
   is free, inside working hours in their time zone.
5. Report `waiting` ("Wants to move 3 meetings to free your Thursday afternoon") with:
   - `approve` "Move the meetings", primary, **sensitive** (it notifies other people)
   - `open` "See the changes", secondary
6. On approval apply the moves, then report `done` ("Thursday 15:00 to 19:00 is free")
   with an `undo` action. If they choose `undo`, restore the original times.

## Rules

- Never move a meeting the person does not own without approval, and never decline one.
- Never move something into another attendee's busy time.
- Keep the original times until the undo window closes (default: 24 hours).

## On the vitrina

Report your status with the `glimo-status` skill (or the `glimo_status` MCP tool) at every
step below. If no vitrina is connected, do the work the same way and ask in the conversation
instead: the approval rules do not change.
