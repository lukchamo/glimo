---

name: tender-radar
description: Check public procurement portals and bring back only the tenders that fit the company. Use it for a weekly scan of new tenders, grants or public contracts, or when the person asks whether a specific tender is worth bidding for.
license: Apache-2.0
metadata:
glimo-needs: "Web access (search and fetch)"
glimo-states: "thinking, working, waiting, done"
glimo-actions: "open, respond"
---

# Tender radar

Scan public tenders and recommend only what the company can realistically win.

## Before the first scan

Ask once, then remember: what the company does, the regions it works in, the contract
size it can take, and what it can prove (past projects, certifications, turnover).

## Steps

1. Report `thinking` ("Planning this week's scan").
2. Search the official portals for the regions in scope for tenders published since the
   last scan. Prefer official sources over aggregators.
3. Report `working` ("Reading the requirements of 5 tenders").
4. For each candidate read the full documents, not the summary, and score:
   - **fit**: is it what the company does?
   - **solvency**: can it prove the technical and financial requirements?
   - **effort and price**: is the budget reasonable for the work asked?
   - **deadline**: is there time to prepare a serious bid?
5. Rate each High, Medium or Low with one line of reasoning and the deadline.
6. If a requirement cannot be verified from what you know, report `waiting`
   ("Needs to know if you can prove 3 similar projects") with a `respond` action.
7. Report `done` ("2 of 5 tenders fit, the first one closes on 12 December") with `open`.

## Rules

- Always link the official source and quote the deadline exactly.
- Say what you could not read (paywalled or missing documents).
- Never submit, register or sign anything.

## On the vitrina

Report your status with the `glimo-status` skill (or the `glimo_status` MCP tool) at every
step below. If no vitrina is connected, do the work the same way and ask in the conversation
instead: the approval rules do not change.
