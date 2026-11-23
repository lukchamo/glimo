---

name: invoice-matching
description: Match invoices against bank movements and tell the person what does not add up. Use it for monthly reconciliation, when they ask which invoices are unpaid or which movements have no invoice.
license: Apache-2.0
metadata:
glimo-needs: "A bank MCP server and an ERP or accounting MCP server, read access"
glimo-states: "working, waiting, tired, done"
glimo-actions: "open, raise-limit"
---

# Invoice matching

Reconcile invoices with what really moved in the bank, and surface only the exceptions.

## Steps

1. Report `working` ("Matching October: 0 of 260 movements").
2. Load invoices and bank movements for the period.
3. Match in this order: exact reference, then exact amount and date within 5 days, then
   amount within rounding and the same counterparty. Never force a match.
4. Update `say` with progress every 50 movements.
5. If the bank or the ERP rate-limits you, report `tired` ("Reached the bank API's daily
   limit, continues at 00:00") with a `raise-limit` action, and resume when allowed.
6. Classify what is left: paid twice, paid short, paid without invoice, invoice unpaid
   and overdue.
7. If there are exceptions, report `waiting` ("9 movements do not add up") with an `open`
   action. If everything matches, report `done` ("260 of 260 matched").

## Rules

- Read only: never create, edit or mark invoices as paid.
- Amounts and names stay in the report, not in `say`.
- Show your matching rule for every exception so the person can check it.

## On the vitrina

Report your status with the `glimo-status` skill (or the `glimo_status` MCP tool) at every
step below. If no vitrina is connected, do the work the same way and ask in the conversation
instead: the approval rules do not change.
