---

name: glimo-status
description: Show your real status on the person's Glimo vitrina and wait for their decision before anything sensitive. Use it whenever you start a task, need the person (approval, an answer, an access), get blocked, hit a limit or finish, and whenever the person asks "what are you doing?" or wants to supervise several agents at a glance.
license: Apache-2.0
metadata:
glimo-needs: "A Glimo vitrina (MCP endpoint, REST API or the glimo CLI)"
glimo-states: "thinking, working, waiting, blocked, done, tired"
glimo-actions: "approve, respond, open, retry, renew-access, raise-limit"
---

# Glimo status

Glimo shows you to the person as a glim: a small avatar whose expression is your real
status. They look at their vitrina and know in a second who is working, who is waiting
for them and who got stuck. Your job is to keep that true.

## The one rule

Every gesture is data. Report a state only when it is real, and report it as soon as it
changes. A glim that says "working" while you wait for the person is worse than no glim.

## When to report

| What is happening to you                  | State      | Also send                                |
| ----------------------------------------- | ---------- | ---------------------------------------- |
| You received a task and are planning      | `thinking` | `say`: what you are planning             |
| You are running tools or delegating       | `working`  | `say`: where you are ("ticket 18 of 40") |
| You need approval, an answer or an access | `waiting`  | `actions` the person can take            |
| Something failed, expired or is down      | `blocked`  | `reason`, and an action that fixes it    |
| You hit a rate limit or quota             | `tired`    | `say`: when you continue                 |
| You finished                              | `done`     | `say`: the result in one line            |
| Nothing to do                             | `idle`     | nothing                                  |

If several apply, the most urgent wins: blocked, waiting, tired, working, thinking, done, idle.

## How to report

Use the first option that is available to you.

1. **MCP tool `glimo_status`** (preferred):
   `{ "agent": "sales", "name": "Sales", "state": "waiting", "say": "Wants to send 12 follow-up emails", "actions": [{ "id": "approve", "label": "Approve sending", "kind": "primary", "sensitive": true }] }`
2. **CLI**: `glimo status sales waiting "Wants to send 12 follow-up emails" --action approve:"Approve sending":sensitive`
3. **REST**: `POST {GLIMO_URL}/api/vitrinas/{id}/status` with `Authorization: Bearer {key}` and the same JSON.

Use one stable, lowercase `agent` id for the whole task (`sales`, `claude-code`, `invoice-bot`).

## Asking the person

1. Report `waiting` and declare what they can do. Only declare actions you will honour.
2. Mark an action `"sensitive": true` if it sends, pays, publishes or deletes anything.
   The vitrina then asks them to confirm.
3. Collect the decision with `glimo_action` (`wait_seconds` up to 20, call again if empty)
   or `glimo wait <agent>`. Each decision is delivered once.
4. Act on exactly what they chose, then report `working` and finally `done`.

Never act on something sensitive without a collected decision. "No answer yet" is not a yes.

## How to write `say`

Talk like a teammate who lets them know, not like an alarm. One short sentence, 120
characters at most, concrete, no codes.

| Write                                                  | Not                                 |
| ------------------------------------------------------ | ----------------------------------- |
| Wants to send 12 follow-up emails                      | Pending approval (ID 4821)          |
| Reached the bank API's daily limit, continues at 00:00 | Error 429: rate limit exceeded      |
| Its database credential expired                        | Authentication failure in connector |

## Privacy

- The vitrina may be on a wall screen. Never put secrets, personal data or message
  contents in `say`, labels or the agent name.
- `pov` (what you see) and `thoughts` (what you think) are sensitive fields of Glimo Spec.
  Hosted vitrinas drop them. Do not try to smuggle their content into `say`.

## Reference

- Spec: https://github.com/lukchamo/glimo/blob/main/docs/spec.md
- JSON Schema: https://glimo.dev/spec/v0.1/glimo-spec.schema.json
