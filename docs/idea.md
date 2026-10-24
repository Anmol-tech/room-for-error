# Room for Error: team idea (for $hack-os idea_save)

## Product name
Room for Error

## App type
Web App

## Description
Room for Error turns a one-line theme ("a pirate ship trapped inside a bottle") into a short, illustrated point-and-click escape room: three rooms, two puzzles, collectible items and two possible endings, generated in under a minute. A story model writes the world, FLUX paints every room and item, and a vision model finds the objects in each picture so players explore by clicking the artwork.

Users: players who want a fresh, playable mystery from an idea, and creators who need AI-made games that survive real play.

The gap: AI-generated games break in ways a rules checker can't see. A clue says one code while the lock expects another, an object can't be clicked, or a route dead-ends. Other prompt-to-game tools stop at generation. Room for Error ties every escape route to a game version, has Kane CLI play it like a person, repairs it from Kane's evidence, and uses Kane's result as the release decision: a route reaches players only after Kane passes that exact version.

## Kane CLI plan
Flows Kane tests. For each mission, Kane plays both escape routes end to end in an isolated preview session:
`kane-cli run "<route objective>" --agent --url http://localhost:5180/preview/<runId>`
Kane searches rooms, picks up items, reads clues on screen, uses items on objects, enters codes on the keypad and reaches an ending. A second Kane suite tests the app itself: creating an adventure, a locked door refusing entry without the right item, and the inventory updating after a pickup.

Assertions.
- "Read the note on the desk, enter the code it gives at the terminal, and verify ACCESS GRANTED appears."
- "Verify the Curator's badge appears in the inventory."
- "Verify the 'Rooftop Escape' ending is shown."

Results drive a decision (release gate). Kane's result is the release decision for every route:
- Pass: the route is released to players on that exact version.
- Fail: the route is blocked, and a fix-and-reverify step starts automatically. Kane's evidence goes to the OpenAI director, which repairs only the game data (never the test objective) and saves a new version, then Kane reruns the unchanged objective on that version.
- Two failed repairs: the route stays blocked and is withheld from players.
- Outdated results: any earlier pass becomes outdated when a repair changes the game.
- Infrastructure errors (login, network, browser) are logged separately and never trigger a repair or a release.
- For our own code: a failing run of the app suite blocks the merge until it passes again.

Credible engineering impact (what we'll measure).
- Broken routes caught before players reach them. Target: 100% of planted bugs, plus any real ones the generator makes.
- Minutes from generation to a release decision for each route.
- Repair success rate: routes fixed and re-verified within two attempts.
- Regressions caught before merge by the app suite.
The Director View shows these numbers live, with each route's version history, Kane's steps and evidence.

Rehearsed failure path. The museum mission contains a planted regression: the clue says 4471, the lock expects 4417. Kane catches it on version 1, the director fixes the clue, Kane reruns and passes on version 2, and only then is the route released. We keep the evidence pack, logs, screenshots and report links as proof.

## Extra information
OpenAI's role today: an OpenAI model (GPT-5.5 via the API) is the director that repairs a failed route from Kane's evidence, and Codex is one of our two coding agents.

Built before the event: the game, image generation and clickable scenes. Built today: the Kane integration (preview runs, NDJSON parsing, evidence storage), the release gate and repair loop, and the live Director View with impact numbers.

Stack: React, TypeScript, Node, SQLite, FLUX, OpenAI, Codex and Claude Code.
