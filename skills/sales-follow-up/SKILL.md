---

name: sales-follow-up
description: Find customers who never answered and draft a follow-up email for each one, for the person to approve before anything is sent. Use it when they ask to chase open proposals, quotes without reply or leads that went quiet.
license: Apache-2.0
metadata:
glimo-needs: "A CRM MCP server and an email MCP server"
glimo-states: "working, waiting, done"
glimo-actions: "approve, open"
---

# Sales follow-up

Find deals that went quiet and prepare the follow-up. The person sends, not you.

## Steps

1. Report `working` ("Looking for proposals without reply").
2. From the CRM, list open deals whose last outbound message is older than the threshold
   (default: 7 days) and has no reply. Skip deals marked lost or on hold.
3. For each one read the last exchange and write a draft in the same thread:
   - one line that recalls the concrete proposal, with its date
   - one useful thing: the answer they were missing, the new price list, a deadline
   - one easy question to answer
     Keep the person's tone. No pressure, no fake urgency.
4. Save them as drafts. Do not send.
5. Report `waiting` ("Wants to send 12 follow-up emails") with:
   - `approve` "Approve sending", primary, **sensitive**
   - `open` "Edit drafts", secondary
6. Collect the decision. On `approve`: send, report `working`, then `done` ("12 follow-up
   emails sent"). On `open`: stay `waiting` until they come back.

## Rules

- Sending is sensitive. Never send without a collected approval.
- One follow-up per deal per week at most.
- If a customer asked not to be contacted, skip them and say so in the result.

## On the vitrina

Report your status with the `glimo-status` skill (or the `glimo_status` MCP tool) at every
step below. If no vitrina is connected, do the work the same way and ask in the conversation
instead: the approval rules do not change.
