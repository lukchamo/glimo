# Claude Code, on its own

With the MCP server an agent shows up on your vitrina when the model remembers to call
`glimo_status`. With hooks it does not have to remember: Claude Code itself tells Glimo
when a session starts, gets a task, uses a tool, needs your permission, finishes and ends.
Every session becomes a glim, every time.

```bash
npx glimo init            # once per project: creates the vitrina
npx glimo hooks install   # Claude Code now reports to it on its own
```

Open the address `glimo init` printed, start Claude Code in that folder and watch.

Needs Node 20 or later on your `PATH` and Claude Code 2.1.139 or later.

## What the install does

| What                           | Where                         | Why                                                      |
| ------------------------------ | ----------------------------- | -------------------------------------------------------- |
| The runner, one file           | `.glimo/hook.mjs`             | Claude Code runs it with `node`: no `npx` start per hook |
| Options, only when you set any | `.glimo/hook.json`            | `--detail`, `--approve`, `--name`                        |
| The hooks                      | `.claude/settings.local.json` | Your personal settings for this project. Not committed   |

The settings file is merged, never replaced: every other setting and every hook that is
not ours stays exactly as it was. Running the install twice changes nothing. The key stays
in `.glimo/`, which git ignores; the settings file only holds the path of the runner.

`.claude/settings.local.json` is the file Claude Code keeps out of git when it creates it.
If the install had to create it and git does not ignore it yet, it tells you.

## What is sent, and what never is

One small JSON per change of status, to your vitrina, with the key in the `Authorization`
header:

```json
{
  "agent": { "id": "cc-storefront-7f3a", "name": "Claude · storefront" },
  "state": "working",
  "reason": "working",
  "say": "Editing files"
}
```

Sent:

- The name of the project folder, in the agent id and its display name. Anyone who has the
  address of the vitrina can read it. Use `--name` if the folder name is private.
- The first 4 characters of the session id, so two sessions in one project are two glims.
- The state, the Agent Status Protocol reason behind it and a generic phrase from a fixed
  list: "Editing files", "Running a command", "Reading the codebase", "Searching the web",
  "Delegating to a subagent", "Using github tools" (the name of the MCP server as you
  configured it), "Needs your permission", "Finished its turn".

Never sent, whatever the options:

- Your prompts and Claude's answers.
- The content of any file, the output of any command, the transcript or its path.
- Questions Claude asks you and plans it writes.

Not sent unless you ask for it with `--detail`:

- Commands, file names, search patterns, tool names and any other tool input.

### `--detail`

```bash
npx glimo hooks install --detail
```

Adds the tool name and at most 80 characters about what it is doing:
"Running a command · Bash: pnpm test", "Editing files · Edit: src/cart.ts".

| Tool              | What is added                                                        |
| ----------------- | -------------------------------------------------------------------- |
| Bash, PowerShell  | The start of the command                                             |
| Edit, Write, Read | The path inside the project. Outside the project, only the file name |
| Grep, Glob        | The pattern                                                          |
| WebSearch         | The query                                                            |
| WebFetch          | The host of the address, never the full address                      |
| Agent             | The short description of the task                                    |
| MCP tools         | The name of the tool, never its input                                |

This text leaves your machine and is visible to anyone who can watch the vitrina. What
looks like a credential (a token after `Bearer`, `--token …`, `API_KEY=…`, a password in
an address, a long random string) is masked, but that is a best effort, not a guarantee.
If your commands carry secrets, leave `--detail` off.

## Events and states

| Claude Code event                     | When                                       | State      | Reason              | The glim says                    |
| ------------------------------------- | ------------------------------------------ | ---------- | ------------------- | -------------------------------- |
| `SessionStart`                        | A session starts, resumes or is cleared    | `idle`     | `idle`              | Ready for a task                 |
| `UserPromptSubmit`                    | You send a prompt                          | `thinking` | `queued`            | Got a new task                   |
| `PreToolUse`                          | A tool is about to run                     | `working`  | `working`           | A phrase for the kind of tool    |
| `PreToolUse` for `AskUserQuestion`    | Claude asks you a question                 | `waiting`  | `input-required`    | Has a question for you           |
| `PreToolUse` for `ExitPlanMode`       | A plan is ready                            | `waiting`  | `awaiting-approval` | Has a plan ready for your review |
| `PermissionRequest`                   | Claude Code is about to ask for permission | `waiting`  | `awaiting-approval` | Needs your permission            |
| `Notification` `permission_prompt`    | The prompt has waited about six seconds    | `waiting`  | `awaiting-approval` | Needs your permission            |
| `Notification` `elicitation_dialog`   | An MCP server asks you for input           | `waiting`  | `input-required`    | Needs your input                 |
| `Stop`                                | Claude finishes its turn                   | `done`     | `completed`         | Finished its turn                |
| `StopFailure` `rate_limit`            | The turn ended on a rate limit             | `tired`    | `rate-limited`      | Hit a rate limit                 |
| `StopFailure` `authentication_failed` | The turn ended because the sign-in failed  | `blocked`  | `auth-error`        | Needs you to sign in again       |
| `StopFailure`, anything else          | The turn ended on another API error        | `blocked`  | `failed`            | Stopped by an API error          |
| `SessionEnd`                          | The session ends                           |            |                     | The glim leaves the vitrina      |

`waiting` and `blocked` are the two states the vitrina puts first, and the two that send a
notification to your phone when you turned notifications on there.

Subagents run the same hooks with the same session id, so they report as the glim of their
session: one glim per session, not one per subagent.

## Answering permission prompts from the vitrina

Off by default. Turn it on when you want to walk away from the terminal:

```bash
npx glimo hooks install --approve
npx glimo hooks install --approve --detail   # and see what you are allowing
```

When Claude Code is about to ask for permission, the glim shows two buttons: "Allow" and
"Deny". The runner then waits for your answer for up to 120 seconds
(`--approve-seconds`, 10 to 600).

- You press "Allow": the vitrina asks you to confirm, because it is a sensitive action, and
  writes it to its log. Claude Code gets
  `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`
  and runs the tool.
- You press "Deny": Claude Code gets `"behavior":"deny"` with a message that says you
  denied it from the vitrina, and Claude looks for another way.
- Nobody answers in time: the runner prints nothing and takes the buttons away, and Claude
  Code shows its usual prompt in the terminal.
- You answer in the terminal first: the runner notices on the next event and steps aside.

Read this before turning it on:

- **Whoever has the key of the vitrina can allow.** The key is in `.glimo/config.json` and
  in the part after `#k=` of your owner link. Treat that link like a password.
- **Without `--detail` you allow without seeing what.** The glim only says "Needs your
  permission". With `--detail` it says the tool and the first 80 characters, which for a
  long command is only its beginning.
- A decision belongs to one request. The buttons carry an id that is new for every prompt,
  so a late click on an old prompt cannot allow a different one.
- One request at a time goes to the vitrina. A second one that arrives meanwhile goes to
  the terminal as usual.
- Questions (`AskUserQuestion`) and plans (`ExitPlanMode`) are never answered from the
  vitrina: they need more than yes or no. The glim says it is waiting and the terminal asks.
- A hook cannot allow what a deny rule in your Claude Code permissions refuses. Deny rules
  keep winning.
- While the runner waits, Claude Code shows "Waiting for your answer on the Glimo vitrina".
  If you are at the keyboard most of the time, a short `--approve-seconds` is kinder.

## Every project at once

```bash
npx glimo hooks install --global
```

Registers the hooks in `~/.claude/settings.json` (or in `CLAUDE_CONFIG_DIR`) and puts the
runner in `~/.glimo/hook.mjs`, together with a copy of the vitrina it reports to in
`~/.glimo/hook.json`. Every Claude Code session on this machine then shows up on that one
vitrina, each as its own glim named after its project folder.

Run it from a folder that already has a vitrina (`glimo init`), or with `GLIMO_VITRINA` and
`GLIMO_KEY` set. Cloud sessions of Claude Code do not read your user settings, so they are
not covered.

If a project also has its own hooks, both report. Pick one or the other.

## Check and remove

```bash
npx glimo hooks status       # installed or not, which vitrina, which options
npx glimo hooks uninstall    # removes our hooks and the runner, nothing else
```

Add `--global` for the machine-wide install. In Claude Code, `/hooks` lists what is
registered. The runner is a copy: after you update `glimo`, run the install again to get
the new one. Uninstalling does not remove the glims of sessions that are still open:
`glimo remove <agent>` does, and so does the vitrina when it expires.

## How it stays out of the way

- Status hooks are registered with `"async": true`: Claude Code starts them and moves on.
  Only two hooks are waited for: the end of the session (5 seconds at most, to take the
  glim away) and, with `--approve`, the permission request.
- A request to the vitrina may take 1.5 seconds. After that the runner gives up.
- On any error or timeout the runner exits with code 0 and prints nothing. It never prints
  anything except the decision of a permission prompt you answered.
- When the vitrina refuses a status (it expired, the key is wrong, too many requests) the
  runner sends nothing for 10 seconds instead of insisting.
- Tool hooks fire constantly, so the same state and phrase are sent once every 20 seconds,
  and a burst of different tools sends at most one update every 2 seconds, ending on the
  last one. What a session said last lives in a small folder under the system temp
  directory (`glimo-hooks-…`), readable only by you.

## Limits

- Claude Code has no event for "you pressed Esc": after an interrupt the glim keeps its
  last state until your next prompt.
- After you answer a prompt in the terminal, the glim keeps saying it needs you until the
  next event of the session (the next tool, or the end of the turn).
- A session that is killed never says goodbye, so its glim stays until the vitrina expires
  or you run `glimo remove <agent>`.
- Hosted vitrinas are deleted after 7 days without activity. Run `glimo init` again and
  the project hooks follow the new vitrina on their own. A `--global` install keeps its own
  copy, so install it again.

## Troubleshooting

**Nothing shows up.** Run `npx glimo hooks status`. Then, in Claude Code, `/hooks` should
list the runner under each event. Hooks from settings files only run after you accepted
the trust dialog of the folder. Try the runner by hand; it prints nothing, so look at the
vitrina:

```bash
echo '{"session_id":"test","hook_event_name":"Stop"}' | node .glimo/hook.mjs
```

**It works by hand but not from Claude Code.** Claude Code runs `node`, so `node` has to
be on the `PATH` Claude Code was started with. `claude --debug` writes every hook run and
its exit status to the debug log. Claude Code older than 2.1.139 does not know the `args`
field the hooks use: update it.

**Hooks are disabled.** `"disableAllHooks": true` in any settings file turns every hook
off, and an organization can allow managed hooks only. Glimo cannot change either.

**Behind a proxy.** Node only uses `HTTPS_PROXY` when `NODE_USE_ENV_PROXY=1` is set
(Node 22.21 or later).

**The glim stops updating in a very busy vitrina.** A vitrina accepts 300 writes per
minute. The runner already holds back, but many sessions at once can reach it. The next
update gets through as soon as there is room.

**You moved or renamed the project.** The settings point at the old path of the runner.
Run `npx glimo hooks install` again from the new place.

## Where this comes from

Event names, their input, the settings format and the decision a `PermissionRequest` hook
returns are taken from the Claude Code documentation:

- [Hooks reference](https://code.claude.com/docs/en/hooks)
- [Automate actions with hooks](https://code.claude.com/docs/en/hooks-guide)
- [Settings](https://code.claude.com/docs/en/settings)
