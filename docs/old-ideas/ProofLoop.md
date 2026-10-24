# ProofLoop

> **Every bug ever found becomes a permanent check.**

A project for **Kane CLI Hack Day** (TestMu AI, supported by OpenAI). Saturday, Oct 24, San Francisco.
Event theme: *"Build it with an agent. Verify it with Kane."*

---

## The problem

AI coding agents (Claude Code, Codex, Cursor) build features fast, then say "done" while the app is still broken. Developers waste time on:

1. **"The AI says it's done, but it's broken."** Agents claim success without checking the real app.
2. **"Users report bugs I can't reproduce."** Bug reports are vague ("checkout doesn't work") and take hours to reproduce.
3. **"I broke something and didn't notice."** Small changes silently break other flows like login or payment.
4. **"Websites are hard to use without a mouse."** Many sites block keyboard-only and screen-reader users.

## The solution

ProofLoop is one engine with four ways to use it. Each feature produces or runs **plain-English checks**. Kane runs them like a real user, the agent fixes whatever fails, and Kane re-checks until everything passes.

```
            ┌── 1. Done-gate (agent says "done")
            ├── 2. Bug report → repro → fix
Checks ─────┼── 3. Pull request check
 (plain     └── 4. Accessibility checks
 English)            │
                     ▼
        Kane runs them → failures go to the agent → agent fixes → Kane re-checks
                     │
                     ▼
        Dashboard: pass/fail, screenshots, bugs caught and fixed
```

### What makes it different

Most teams will build a basic "agent + Kane" loop. ProofLoop **remembers**: when feature 2 reproduces a bug, the check is saved permanently. From then on, the done-gate (feature 1) and the pull request check (feature 3) re-run it every time. The product gets smarter with every bug.

---

## Features

### 1. Done-gate
- A Claude Code **Stop hook** runs `proofloop check` whenever the agent tries to finish.
- If any check fails, the hook blocks the agent and passes it the failures, so it has to keep fixing.
- With Codex, a wrapper script does the same job.

### 2. Bug report → repro → fix
- `proofloop repro "checkout doesn't work"`
- An OpenAI model turns the vague report into a concrete Kane test.
- Kane runs it. If it fails, the bug is reproduced.
- The agent fixes the app, then Kane re-checks.
- The check is saved to `checks/` so the bug can never quietly come back.

### 3. Pull request check
- A GitHub Action runs `proofloop check` on every pull request.
- It posts a comment with pass/fail results and screenshots before merge.

### 4. Accessibility checks
- `proofloop a11y <url>` works on any website.
- It runs a set of tasks like "complete signup using only Tab and Enter."
- It reports which flows are blocked for keyboard users.

---

## Architecture

| Part | What it is |
|---|---|
| `proofloop` CLI | Node/TypeScript tool that wraps `kane-cli` |
| `proofloop check` | Runs all saved checks (features 1 and 3) |
| `proofloop repro "<bug>"` | Bug report → Kane test → fix → saved check (feature 2) |
| `proofloop a11y <url>` | Keyboard-only accessibility checks (feature 4) |
| `proofloop pr` | Same as `check`, run from a GitHub Action that comments on the pull request |
| `checks/` | Saved checks, one plain-English file each |
| `results.json` | Output of every run, read by the dashboard |
| Done-gate hook | Claude Code Stop hook (or a Codex wrapper script) |
| Dashboard | Web page showing checks, pass/fail, screenshots and a "bugs caught" counter |
| Demo app | Tiny roommate bill splitter (3–4 pages) with planted bugs |

### How Kane is called

```bash
kane-cli run --url http://localhost:3000 "<plain-English check>" --agent
```

- `--agent` gives structured output that ProofLoop parses.
- Use `--headless` in CI (feature 3).
- **The exact output format is not documented publicly. Capture a real run before Saturday and build the parser from it.**

### Suggested layout

```
proofloop/
├── src/
│   ├── cli.ts          # command entry point
│   ├── runner.ts       # runs kane-cli, parses output, writes results.json
│   ├── repro.ts        # bug report → Kane test (OpenAI) → fix loop
│   ├── a11y.ts         # keyboard-only check pack
│   └── fixLoop.ts      # sends failures to the agent, re-runs until green
├── checks/             # saved plain-English checks
├── hooks/
│   └── stop-hook.sh    # Claude Code done-gate
├── .github/workflows/
│   └── proofloop.yml   # pull request check
├── dashboard/          # results UI
└── demo-app/           # roommate bill splitter with planted bugs
```

---

## Before Saturday (Wed–Fri)

These steps decide whether the plan works.

- [ ] Install Kane CLI: `npm install -g @testmuai/kane-cli`
- [ ] Log in: `kane-cli login`
- [ ] Run one example test successfully
- [ ] Run a test with `--agent` and **save the output** to build the parser from
- [ ] **Time a 5-step test.** If it takes 2+ minutes, keep live demo checks very short
- [ ] **Test whether Kane honors "use only the keyboard."** If not, change feature 4 to checks like "every button has a visible label" and "the form shows clear errors"
- [ ] Try a Claude Code Stop hook with a dummy script and confirm it can block the agent from finishing
- [ ] Optional: `npx @testmuai/kane-cli-skill` to install the Kane skill for your agent
- [ ] Set up the OpenAI API account to claim the $250 event credits
- [ ] Build the demo app shell. Existing code is allowed, but **all Kane integration must be written on the day**

---

## Saturday build plan

Submissions lock at **5:00 PM**. The page also says "ship by 6," but plan for 5.

| Time | Build | Done when |
|---|---|---|
| 10:00–10:30 | Setup, confirm Kane works on venue Wi-Fi | One test passes |
| 10:30–12:00 | Core runner: run checks, parse results, write `results.json` | `proofloop check` prints pass/fail |
| 12:00–1:00 | **Feature 1:** done-gate hook and fix loop | Agent can't finish while a check fails |
| 1:00–2:15 | **Feature 2:** bug report → Kane test → fix → saved check | A planted bug is reproduced, fixed and saved |
| 2:15–3:00 | **Feature 4:** accessibility checks | Report on the demo app and one real site |
| 3:00–3:45 | Dashboard | Counter, screenshots, history |
| 3:45–4:15 | **Feature 3:** GitHub pull request check (cut first if behind) | Pull request gets a results comment |
| 4:15–4:40 | Record backup demo video, freeze code | Video saved |
| 4:40–5:00 | Rehearse demo, submit | Submitted |

### If you fall behind, cut in this order
1. Feature 3 (mention it as "next" in the pitch)
2. Dashboard polish
3. Number of accessibility checks

**Never cut features 1 or 2.**

---

## Demo script (3 minutes)

1. **Problem (20 sec):** "AI agents say 'done' when the app is broken."
2. **Done-gate (60 sec):** ask the agent for a feature. It says done, ProofLoop blocks it, Kane shows the bug, the agent fixes it, and it goes green.
3. **Bug report (60 sec):** a judge types a vague bug, like "splitting the bill gives wrong totals." Kane reproduces it, it gets fixed, and "check saved forever" appears.
4. **Accessibility (20 sec):** run it on a real website and show what's blocked for keyboard users.
5. **Close (20 sec):** dashboard counter. *"Every bug becomes a permanent check."*

---

## Risks

| Risk | Plan |
|---|---|
| Kane runs are slow (30 sec to a few minutes) | Keep live checks to 3–5 steps and have earlier results ready to show |
| Credits run out | Re-run only failed or changed checks, not the full list on every save |
| AI results vary between runs | Run each demo check 2–3 times beforehand and keep only reliable ones |
| Venue Wi-Fi or a service goes down | Backup demo video recorded by 4:40 PM |
| Kane ignores "keyboard only" | Switch feature 4 to label and error-message checks |

---

## Hackathon rules to remember

- Kane CLI must verify the app. Putting it **inside the agent loop** scores highest.
- The app must work in a **live demo**, and you can't push fixes during demos.
- Solo or teams of up to 4.
- Existing projects are allowed, but the **Kane integration must be built on the day**, and new work is weighted most.
- Tracks: Web App, Mobile App, Wildcard. Special prize: **Most Innovative Use of Kane CLI**.

## Links

- Event: https://luma.com/kane-cli-hack-day
- Kane CLI docs: https://www.testmuai.com/support/docs/kane-cli-introduction/
- Kane CLI agent guide: https://www.testmuai.com/kane-cli/agents.md
