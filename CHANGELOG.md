# Changelog

## Unreleased

## 3.1.0 (2026-11-13)

- Five new bar styles: wave, stripes, neon, glass and stairs (twelve in all); spark fills up at 100 %, classic gets small rounded corners.
- The fill's end is rounded in pixel, solid and line, and the progress tag stays on the group in progress.
- The walking crab never jumps: a new scene runs from where the crab stands; it keeps still in its corner when the row has little room.
- Panel crabs wear real outfits (legs behind the clothes); new Architect (Plan) and Handyman costumes.
- The "working" ✻ in the HUD spins in place.
- HUD: `/crabhud budget <usd>` turns the chat cost amber past a limit; when the compact HUD has no room for the resets, the cost takes turns with the 5-hour reset; today/month spend in the expanded HUD.
- Panel: a card that finished well over a minute ago shrinks to one line (failed ones stay full).
- The crab row cuts a long status with "…" before it reaches the crab's corner.
- A permission prompt that stands turns the row amber again (fixed); zero TypeScript errors.
- crab-light runs on Sonnet.
- Plugin icon, CHANGELOG, CONTRIBUTING and issue templates; the README gets the one-line install, badges and fresh pictures.
- The words in each language moved out of `hooks/register.tsx` into `hooks/words.ts`.

## 3.0.0 (2026-10-22)

- `/crab-flow` and the `crab-*` agents replace the earlier flow and worker names.
- The original names stay only in the credits, as the MIT license asks.
- Renamed assets, tests and hooks to match.

## 2.6.1 (2026-10-15)

- The skill's progress bar is kept on disk per chat and comes back when a chat is reopened.
- A lone `done` with no bar carries on from the kept one, or asks for the title and groups again.
- A bar the person closed stays closed.

## 2.6.0 (2026-10-15)

- The progress bar shows up on its own from Claude's task list and from an approved plan.
- At 100 % the crab hops and throws pixel confetti, with an optional fanfare.
- The compact HUD draws a ring per reading; the crab row counts the answer's actions and time.
- The agents panel adds today's and this month's spend, summed over every chat.
- `/crabhud status` and `/crabhud demo`; the language setting now covers the bar and panel.

## 2.5.0 (2026-10-14)

- Agent portraits (pixels, color, animation) and step colors are read from an optional data file instead of the code.
- Without that file, every agent uses the generic crab.

## 2.4.0 (2026-10-14)

- The crab walks sideways through the free part of the row and stops to act out the task.
- Amber row while Claude waits for a permission or an answer.
- `/crabhud sound on|off`: optional sounds, off by default.
- HUD: how fast the limits rise per hour or day, and when they run out.
- The progress tag slides to its new place.

## 2.3.0 (2026-10-14)

- Commands move to `/crabhud` (on, off, language, style).
- `/crabhud style` shows each style drawn in SVG, with a live preview.
- Fix: in the terminal the bar and crab were drawn as SVG and vanished; they are now always text.

## 2.2.0 (2026-10-14)

- Six bar styles in the HUD: pixel, segments, line, solid, dots and spark.
- The choice is saved between sessions.

## 2.1.0 (2026-10-14)

- The `/crab-flow` skill and its five worker agents ship with the mod, driving the bar and the panel directly (under earlier names, see 3.0.0).

## 2.0.0 (2026-10-14)

- The HUD mod and the progress-bar mod merge into one: crab and bar above the prompt, HUD below, agents panel beside the chat.
- Tools `mcp__crabhud__progress` and `mcp__crabhud__step`.

## 1.0.0 to 1.5.1 (2026-10-03 to 2026-10-12)

- The HUD before the merge: a pixel-art HUD above the prompt (1.0.0), first-run language question (1.1.0), terminal effort and its own looks (1.2.0).
- A still HUD for Remote Control viewers (1.4.0) and Linux support (1.3.0).
- The context gauge measures against the autocompact window (1.5.0).
