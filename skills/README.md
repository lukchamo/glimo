# Skills

Starter skills in the open [Agent Skills](https://agentskills.io) format (a folder with a
`SKILL.md`). They work in any compatible agent: Claude Code, Codex, Cursor, Gemini CLI,
OpenCode and others.

```bash
npx skills add lukchamo/glimo                      # all of them
npx skills add lukchamo/glimo --skill glimo-status # just one
```

| Skill                                           | What it does                                                                                        | Needs                   |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------- |
| [`glimo-status`](glimo-status/SKILL.md)         | Shows the agent's real status on your vitrina and waits for your decision before anything sensitive | A Glimo vitrina         |
| [`inbox-digest`](inbox-digest/SKILL.md)         | Three lines for each email thread that matters                                                      | Gmail or Outlook        |
| [`sales-follow-up`](sales-follow-up/SKILL.md)   | Drafts follow-ups for customers who went quiet, for you to approve                                  | Your CRM and your email |
| [`invoice-matching`](invoice-matching/SKILL.md) | Matches invoices against bank movements and flags what does not add up                              | Your bank and your ERP  |
| [`tender-radar`](tender-radar/SKILL.md)         | Brings back only the public tenders that fit your company                                           | Web access              |
| [`calendar-defrag`](calendar-defrag/SKILL.md)   | Reorders meetings and protects your focus hours                                                     | Your calendar           |
| [`social-calendar`](social-calendar/SKILL.md)   | Schedules posts and shows which need your OK                                                        | Your social accounts    |

## What makes a Glimo skill

A skill declares, in its front matter, what it needs and what the person should expect to see:

```yaml
metadata:
  glimo-needs: "A CRM MCP server and an email MCP server"
  glimo-states: "working, waiting, done"
  glimo-actions: "approve, open"
```

Two rules are not negotiable:

1. Anything that sends, pays, publishes or deletes is declared as a `sensitive` action and
   waits for the person's decision.
2. Nothing private goes into `say`, labels or names: the vitrina may be on a wall screen.

## Publish yours

1. Create a folder with a `SKILL.md` (copy one of these as a template).
2. Open an issue with the "Skill" form so we can list it in [`catalog.json`](catalog.json).
3. Keep it in your own repository: skills are plugins, they do not live in Glimo's core.

`catalog.json` is the source of truth for the catalog shown on glimo.dev.
