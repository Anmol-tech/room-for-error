# ProofPort

> **Rewrite any app. Prove nothing changed.**

A project for **Kane CLI Hack Day** (TestMu AI, supported by OpenAI). Saturday, Oct 24, San Francisco.
Event theme: *"Build it with an agent. Verify it with Kane."*
Track: **Web App** (also aiming for **Most Innovative Use of Kane CLI**).

---

## The problem

Companies spend millions rewriting old apps, like PHP or jQuery to React, or a monolith to microservices. The hard part isn't writing the new code. It's **proving the new app behaves exactly like the old one.**

Old apps are full of hidden behaviors nobody documented:
- Coupons applied before tax, not after
- Totals rounded a specific way
- A quantity limit of 10 per item
- An error message customers' scripts depend on

The rewrite "looks done," then customers find the differences in production. Many rewrites fail or get rolled back for exactly this reason.

AI coding agents make rewrites fast. They make this problem **worse**, because nobody checks what the agent silently changed.

## The solution

ProofPort uses Kane as a **referee between two apps**. It records how the old app behaves through the real interface, then proves the new app does the same thing, flow by flow. When something differs, a coding agent fixes the new app until behavior matches 100%.

```
  OLD APP                                       NEW APP
     │                                             ▲
     │ 1. Discover                                 │ 3. Rebuild (coding agent)
     ▼                                             │
  Flow list (plain English) ──────────────────────┘
     │
     │ 2. Record: Kane runs each flow on the OLD app
     ▼    and captures what the user sees (totals, messages, results)
  Behavior spec (proven on the old app)
     │
     │ 4. Compare: Kane runs the same flows on the NEW app
     ▼
  Differences ──► 5. Fix loop: agent fixes new app ──► Kane re-checks
     │
     ▼
  Dashboard: Behavior match 62% → 100%
```

### Why this is different

- Most teams use Kane to test **one** app. ProofPort uses Kane to **compare two apps** through the user interface. This is a known technique, differential testing, done by an AI user for the first time.
- The behavior spec is **proven**: every flow is first confirmed on the old app, so the spec can't contain made-up behavior.
- It doesn't need the old app's tests or documentation, which legacy apps usually don't have.

---

## How it works

### Step 1: Discover
- An LLM (OpenAI) reads the old app's pages and source code and proposes a list of user flows in plain English.
- Example: *"Add 3 Margherita pizzas to the cart, apply coupon SAVE10, and report the final total shown."*

### Step 2: Record (Kane on the old app)
- Kane runs each flow on the **old app** and reports what the user sees.
- Flows that fail on the old app are thrown out, so only real behavior stays.
- Each result becomes an assertion:
  *"…apply coupon SAVE10 and verify the final total is $27.43."*
- The result is a **behavior spec**: a list of proven, plain-English checks.

### Step 3: Rebuild (coding agent)
- Claude Code or Codex rebuilds the app in a modern stack (React or Next.js) from the old app's code and the behavior spec.

### Step 4: Compare (Kane on the new app)
- Kane runs every check from the behavior spec on the **new app**.
- Every failure is a **behavior difference**: *"Old: $27.43. New: $27.42 (rounding differs)."*

### Step 5: Fix loop
- ProofPort sends each difference to the coding agent with Kane's evidence.
- The agent fixes the new app, then Kane re-runs only the failed checks.
- The loop repeats until behavior match is 100%.

### Bonus: permanent regression suite
- Every passing check can be exported as a Playwright test using Kane's export, so the new app keeps the old behavior forever.

---

## The demo legacy app: "Tony's Pizza (2009)"

A small, deliberately old-fashioned ordering site (server-rendered HTML + jQuery) with **8–10 hidden behaviors** for ProofPort to discover:

| # | Hidden behavior | What a careless rewrite gets wrong |
|---|---|---|
| 1 | Coupon `SAVE10` applies **before** tax | Applies after tax |
| 2 | Totals round **half up** to cents | Uses default JavaScript rounding |
| 3 | Max 10 of any one item | No limit |
| 4 | Free delivery over $30 (pre-tax) | Uses post-tax total |
| 5 | Coupons can't be combined | Stacks them |
| 6 | Phone number required, exact error text | Different message |
| 7 | Menu sorted by category, then price | Sorted alphabetically |
| 8 | Order number format `TP-000123` | Plain number |
| 9 | Empty cart shows "Your cart is hungry!" | Generic empty state |
| 10 | Tuesday: 2-for-1 on large pizzas | Missing entirely |

Day-of-week behavior (#10) can be controlled with a test flag so the demo doesn't depend on the real day.

---

## Architecture

| Part | What it is |
|---|---|
| `legacy-app/` | Tony's Pizza (2009): Express + server-rendered HTML + jQuery |
| `new-app/` | Modern rewrite (Next.js or React), built by the coding agent on the day |
| `proofport discover` | LLM proposes plain-English flows from the old app |
| `proofport record` | Kane runs flows on the old app, keeps the ones that pass, turns results into assertions |
| `proofport compare` | Kane runs the behavior spec on the new app, lists differences |
| `proofport fix` | Sends differences to the agent and re-runs failed checks until 100% |
| `spec/` | The behavior spec: one plain-English check per file, plus the value recorded from the old app |
| `results.json` | Every run's results, read by the dashboard |
| Dashboard | Old app and new app side by side, behavior match %, list of differences, Kane screenshots |

### How Kane is called

```bash
# Record on the old app
kane-cli run --url http://localhost:3001 "<flow>, and report the final total shown" --agent

# Check on the new app
kane-cli run --url http://localhost:3002 "<flow>, and verify the final total is $27.43" --agent
```

- `--agent` gives structured output that ProofPort parses.
- **The exact output format isn't documented publicly. Capture a real run before Saturday and build the parser from it.**

### Suggested layout

```
proofport/
├── legacy-app/          # Tony's Pizza (2009), prepared before the event
├── new-app/             # rewrite, built on the day
├── src/
│   ├── cli.ts           # command entry point
│   ├── discover.ts      # LLM → flow list
│   ├── record.ts        # Kane on old app → behavior spec
│   ├── compare.ts       # Kane on new app → differences
│   ├── fixLoop.ts       # differences → agent → re-check
│   └── kane.ts          # runs kane-cli and parses its output
├── spec/                # proven behavior checks
├── dashboard/           # side-by-side view and match %
└── results.json
```

---

## Hackathon requirements check

| Requirement | How ProofPort meets it |
|---|---|
| Build with an AI agent | The coding agent builds the new app (and ProofPort itself) on the day |
| Kane CLI must verify the app | Kane verifies the new app against every proven behavior check |
| Kane inside the agent loop (scores higher) | The fix loop is the agent reading Kane's results and fixing until 100% |
| Survives a live demo | Everything runs on localhost: no third-party sites, accounts or CAPTCHAs |
| Kane integration built on the day | Discover, record, compare and fix are all written on Saturday |
| Existing projects allowed | Only the legacy app (the test input) is prepared beforehand. Tell judges this up front |
| Team size | Solo or up to 4 |

---

## Before Saturday (Wed–Fri)

- [ ] Install Kane CLI: `npm install -g @testmuai/kane-cli`
- [ ] Log in: `kane-cli login`
- [ ] Run one example test successfully
- [ ] Run a test with `--agent` and **save the output** to build the parser from
- [ ] **Test "report the final total shown."** Confirm Kane can read a value off the page and that it appears in the output. This is the most important check. If it can't, use the fallback below
- [ ] **Time a 5-step flow.** This decides how many checks fit in a live demo
- [ ] Check whether Kane can run multiple flows at the same time (it would make each compare run much faster)
- [ ] Build **Tony's Pizza (2009)** with the 10 hidden behaviors
- [ ] Set up the OpenAI API account to claim the $250 event credits
- [ ] Optional: `npx @testmuai/kane-cli-skill` to install the Kane skill for your agent

**Fallback if Kane can't report values:** write the expected values from the old app's code by hand, and use Kane only for "verify the total is $X" checks on both apps. Comparing two apps still works this way.

---

## Saturday build plan

Submissions lock at **5:00 PM**. The page also says "ship by 6," but plan for 5.

| Time | Build | Done when |
|---|---|---|
| 10:00–10:30 | Setup, confirm Kane works on venue Wi-Fi against the old app | One flow passes on Tony's Pizza |
| 10:30–11:30 | `kane.ts` runner and parser, `discover` | 10+ plain-English flows generated |
| 11:30–12:30 | `record`: run flows on the old app, keep passing ones, write the spec | Behavior spec with recorded values |
| 12:30–1:30 | Coding agent rebuilds the app as `new-app/` (runs while you eat and build the next step) | New app runs on localhost |
| 1:30–2:30 | `compare`: run spec on the new app, list differences | First behavior match %, e.g. 60% |
| 2:30–3:30 | `fix` loop: differences → agent → re-check failed flows | Match reaches 100% |
| 3:30–4:15 | Dashboard: side by side, match %, differences, screenshots | Dashboard works end to end |
| 4:15–4:40 | Record backup demo video, freeze code | Video saved |
| 4:40–5:00 | Rehearse demo, submit | Submitted |

### If you fall behind, cut in this order
1. Dashboard polish (a terminal view with a big match % still demos well)
2. `discover` automation (write the flow list by hand from the hidden behaviors table)
3. Number of hidden behaviors (6 is enough for the story)

**Never cut `record`, `compare` or `fix`.** They are the product.

---

## Demo script (3 minutes)

1. **Problem (20 sec):** "Rewrites fail because nobody can prove the new app behaves like the old one. AI agents make rewrites fast and make this worse."
2. **The old app (20 sec):** show Tony's Pizza (2009). "No tests, no docs, hidden rules everywhere."
3. **Record (30 sec):** ProofPort shows the behavior spec Kane recorded from the old app. "Every rule here was proven on the real app."
4. **Compare (40 sec):** the agent's rewrite looks perfect. Run compare. **Behavior match: 60%.** Show a difference: "Old: $27.43. New: $27.42."
5. **Fix loop (50 sec):** the agent fixes the differences, Kane re-checks, and the match climbs to **100%** live, or from a pre-run if Kane is slow.
6. **Close (20 sec):** "Rewrite any app. Prove nothing changed." Mention the next steps: point it at any real legacy app, and export to Playwright.

---

## Risks

| Risk | Plan |
|---|---|
| Kane can't report values from the page | Fallback: expected values written by hand, Kane only verifies on both apps |
| Kane runs are slow (30 sec to a few minutes) | Keep each flow at 3–5 steps, re-run only failed checks, show a pre-run for the full climb |
| Credits run out | Don't re-run passing checks. Record once, compare only what changed |
| AI results vary between runs | Run every demo check 2–3 times beforehand and drop any unreliable ones |
| Agent's rewrite matches 100% on the first try (no story) | Ask the agent for a "clean modern rewrite" without the spec first, so differences appear naturally |
| Wi-Fi or a service goes down | Backup video recorded by 4:40 PM |

---

## Future (for the pitch)

- Point ProofPort at any real legacy app's staging site
- Mobile apps: compare an old native app to a new React Native one using Kane on simulators
- Run in CI so every change to the new app is checked against the old app's behavior
- Export the behavior spec as a Playwright suite the team owns forever

## Links

- Event: https://luma.com/kane-cli-hack-day
- Kane CLI docs: https://www.testmuai.com/support/docs/kane-cli-introduction/
- Kane CLI agent guide: https://www.testmuai.com/kane-cli/agents.md
