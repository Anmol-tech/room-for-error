# Room for Error — Puzzle and Interaction Features

Players explore an illustrated escape room, investigate objects, collect evidence, manipulate mechanisms and use inventory items to find a way out. These features make each step feel like interacting with a place, while preserving the AI-generated adventures and Kane verification loop.

## 1. Close-up object inspection

Clicking an interactive object opens a focused inspection view over the room. The surrounding scene remains visible but subdued, helping the player understand where they are.

The inspection view contains the object's name, a short description, visible details and relevant interactions. A cabinet might show its scratched surface and combination lock; a sundial might reveal an inscription and three carved symbols.

Objects with puzzles display their controls directly in this view. Players can manipulate a lock, examine a document or use an item without switching to a generic list of unrelated actions.

Players can step back at any time and reopen the object later. Closing an inspection never removes discovered clues, inventory items or completed puzzle progress. Already solved objects clearly show their changed state.

## 2. Interactive puzzle mechanisms

The director selects from a small collection of reliable puzzle types, then adapts their appearance, clues and solutions to the adventure's theme. The same mechanism might appear as an ancient seal in one adventure and a spaceship console in another.

### Symbol wheels

A lock has several independently controlled wheels. Each wheel cycles through a defined set of named symbols, such as sun, leaf, moon and water.

Players discover a clue elsewhere in the room, infer the required order, rotate the wheels and attempt to open the lock. Each wheel supports clear previous and next controls, and its current symbol is readable text as well as a visual.

An incorrect arrangement leaves the lock closed and provides feedback. A correct arrangement visibly releases the lock and applies the associated game effect, such as opening a cabinet or revealing an item.

### Switch panels

A panel contains clearly labeled switches with visible on and off states. A discovered diagram, inscription or environmental observation explains the required arrangement.

Players configure the switches and activate the panel to check their interpretation. Successful activation might restore power, redirect water or open a passage.

Switch states remain understandable without relying only on color. This puzzle uses a final arrangement; a sequence-memory mechanism would be a separate puzzle type.

### Torn-note assembly

Players discover readable fragments and arrange them into a coherent message. The ordering itself is the puzzle: the completed note might explain an escape method or reveal a useful instruction.

Pieces can be moved with explicit controls, with dragging available as an optional shortcut. Players submit the arrangement when ready, and the game explains whether it has been assembled correctly.

Fragments must remain legible and individually identifiable. Essential clue text is displayed by the interface rather than depending on words painted into a generated image.

### Shared behavior

Every mechanism has a clear starting state, readable controls, a way to submit an attempt and explicit success or failure feedback. Opening a puzzle does not solve it automatically.

A successful submission applies its effects once. Subsequent visits show the completed mechanism rather than allowing repeated item rewards or duplicated state changes.

## 3. Discovered-clue notebook

The notebook is a dedicated collection of evidence the player has actually discovered. Reading an inscription, examining a document or finding a relevant marking adds an entry.

Each entry includes:

- A short, recognizable title.
- The clue's original wording or clearly rendered symbols.
- The room or object where it was discovered.

The notebook is separate from the existing event history. History records what happened; the notebook makes useful evidence easy to retrieve.

Players can open it alongside a close-up puzzle and pin a discovered clue for reference while manipulating the controls. They should not need to close a lock repeatedly to remember an inscription in another room.

Discovered entries remain available after leaving a room, consuming an associated item or refreshing the same session. A new adventure and each isolated Kane preview have their own discoveries.

The notebook preserves the deduction. It never lists undiscovered evidence, fills in an answer automatically or explains a connection the player has not worked out. Explicit assistance remains in the existing staged hint system.

## 4. Physical-feeling inventory use

The existing interaction remains the foundation: select an inventory item, then click an object in the room to try using it.

Selection becomes more visible. The chosen item appears beside the pointer, and targeting an object displays an instruction such as “Use valve handle on irrigation valve.” Players can cancel selection at any time.

Optional dragging lets players move an item from the inventory onto a scene object. This produces the same interaction as selecting and clicking; all item use remains possible with click-based and keyboard controls.

Target feedback identifies the object being addressed without revealing whether the combination is correct. Highlighting only successful matches would remove the experimentation from the puzzle.

After a successful use, a short placement animation connects the inventory item to the target. A consumed item disappears from the inventory, while a reusable tool stays available. A failed use leaves the item intact.

## 5. Immediate environmental feedback

Successful actions should produce an immediate, understandable consequence after the game accepts them.

Examples include:

- A latch sliding open after a lock is solved.
- A lamp illuminating when power is restored.
- A brief water-flow effect after a valve is opened.
- An item moving into a slot or disappearing after collection.
- A subtle highlight around the object affected by an action.

These effects bridge the time between a rule change and an updated FLUX illustration. Players receive confirmation immediately and can continue interacting while a replacement scene loads.

When the updated image is ready, the scene crossfades into it. The picture illustrates the accepted game state; image generation never decides whether an action succeeded.

Visual effects are supported by readable messages and updated object states. Sound can reinforce an interaction but is never the only confirmation. Muting audio or reducing motion does not hide essential information.

## 6. Helpful failure responses

Unsuccessful attempts should explain an observable result and give the player a useful next hypothesis.

For example, “The key fits, but the mechanism is seized” communicates something different from “This key is too large for the lock.” Neither response needs to reveal the solution.

The experience distinguishes between:

- A puzzle arrangement that was submitted but rejected.
- An interaction blocked by a missing prerequisite.
- An inventory item that does not suit the selected object.

Feedback stays concise and consistent with the scenario's rules. A subtle shake, click or brief visual response can accompany the explanation.

Experimentation remains safe: an unsuccessful attempt does not consume an item, unlock a mechanism or erase completed progress. More explicit guidance is available through the staged hint system when requested.

## 7. Kane-verifiable interactions

Kane can exercise the same meaningful interactions as the player: opening an inspection, reading discovered evidence, operating puzzle controls, submitting an arrangement and using inventory items.

Every essential control has a readable label and a keyboard-accessible equivalent. Dragging and visual effects are enhancements to these controls, so a puzzle remains usable without precise pointer gestures.

Making actions easier to locate in a test session does not bypass a puzzle. Its submitted input must still be accepted before the associated effects occur. A passing route should demonstrate that the new mechanism works, rather than only that a separate action button reaches the ending.

Kane operates in an isolated preview session. Its discoveries, inventory changes and puzzle solutions cannot affect the player's session.

The compact Kane window continues to distinguish queued, running, failed and passed runs. A route unlocks only after a real pass on that exact scenario version; earlier evidence remains clearly identified.

## 8. Example experience: the garden adventure

The player enters a neglected garden and notices an unusual sundial. Opening its close-up reveals three carved symbols and a short inscription. Reading the inscription records it in the notebook.

The nearby shed has a three-wheel symbol lock. The player opens the lock's inspection view, keeps the discovered clue beside it and rotates the wheels into the inferred order.

Submitting an incorrect arrangement produces a brief mechanical response and leaves the lock available. Submitting the correct one releases the latch immediately and opens the shed.

Inside, the player collects a valve handle. They select it from the inventory and use it on the irrigation valve. A placement animation confirms attachment, and operating the valve starts a visible water-flow effect.

The changed environment reveals a way out. The updated illustration arrives in the background, while the player already has clear feedback about what changed and can continue toward the exit.
