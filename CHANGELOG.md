# Changelog

## 3.3.1 (2026-11-25)

- The `/crabhud style` picker shows again in the desktop app, on Mac and Windows. In 3.3.0 it drew all its cards at once, about 345,000 characters in one pane, and the app left the pane blank ("crabhud has not drawn in this pane") without an error anywhere. It now opens on one tab at a time: Bar, Background, Colors or Blur, each under 130,000 characters (164,000 is the most known to draw).
- `/crabhud style` opens the Bar tab, `/crabhud palette` the Colors tab, `/crabhud scene` the Background tab on the page of the background in use, and `/crabhud blur` the Blur tab.
- Background: three pages, picked by name at the top. crabhud's scenes fill the first two, split where their weight comes out even; Handsher's eight wallpapers have the third, with his credit. *Follows the bar* is a light card of its own, named *Bar scene* to fit (the bar style's bar and a loop sign), instead of drawing its scene a second time, and the cards leave out the walking crabs.
- Background and Blur draw each choice as a framed card: the picture with its button as wide as the card under it, the one in use framed in the palette's accent. The app takes a press on the name only.
- Bar: in the app, each style shows its name and its live bar; the hint that never fit beside it stays in the alt text (the terminal keeps it).
- Colors: the palettes in a column, each name with a small swatch of its two colors beside it (the app does not draw the swatch yet). The app itself shows the rest as soon as one is picked.
- Blur: three cards side by side, each the background in use at half its size behind the glass at that blur.
- The terminal picker is unchanged: the bar styles, their hints and the help text.

## 3.3.0 (2026-11-24)

- The band above the prompt reaches the right edge in the desktop app on a Mac, where the app draws about 8.8 px a column (elsewhere crabhud still counts 8). Every row of the band (the progress bar, the walking crab, the amber row and the line under them) shrinks to the room left instead of wrapping.
- The progress bar takes two lines in the desktop app: the title, whole, with the agents button and the ✕ at its right, and under it the bar from the left edge to the crab. The dot before the title and the percent beside the crab are gone (the percent stays in the alt text and the terminal), and the tag keeps the step in whole words as far as the room allows (`Manual changes and notes · 2/14`).
- Under the bar, the group in progress shows its name and count in bold (`Audit 1/2`); the others show their name alone, or only their line when fewer than four letters fit. No more lone "…".
- The expanded HUD labels its rows `5h` and `7d`, sizes the label column to the widest label, puts the effort right after the model, in its colour, and writes a reset as `↻ 2h 39m`.
- The 7-day pace is the window's own average since it opened, shown once the window is six hours old, instead of the last 90 minutes times 24. The 5-hour pace still comes from the last 90 minutes.
- The agents panel drops the three tiles (cost, tokens, time): one line shows this answer's actions and time and, at the right, the subagents' count, cost and time, the tokens in the alt text. The Collapse button moves to the top row, beside the flow's name. Today's and this month's spend stay in the expanded HUD only.
- Every time in the panel reads the same way (`27s`, `14m48s`, `1h05m`), and a group's count in the step list sits right after its name.
- The `mcp__crabhud__progress` tool asks for a short name (one or two words) on a step whose name runs past about 14 letters.
- No piece of a bar shows past its percent tag, in any style, on the HUD and on the progress bar.
- The crab in the band is 25% bigger.
- The theme's background is its own choice, apart from the bar style. The `/crabhud style` picker now has four parts: Bar, Background (cards with a live picture of each), Colors and Blur. *Follows the bar* is the default; *No scene* keeps only the colors; then crabhud's twelve scenes and Handsher's eight ASCII wallpapers ([ascii-wallpapers](https://github.com/Handsher/ascii-wallpapers), MIT), embedded in crabhud. New commands: `/crabhud scene <name>` and `/crabhud blur sharp|light|medium`.
- The glass is sharper by default (blur 4 at 55%) and the soft glows behind the words are gone. The scenes no longer carry a veil of their own: the app already lays one behind the chat, at the glass's opacity, and with both the chat came out twice as dark. The glass keeps the app's own color for Handsher's wallpapers too, since a tint that does not suit the mode makes the app cover the panels.
- The agents panel is see-through while the theme is on, so the background shows behind it, also after a reload.
- Accent words (a `/skill` or a link) take a stronger color in the palette's hue, at least 7:1 against the page in dark mode and 4.5:1 in light mode. Inside messages the app paints them in the normal text color while a background is on; they show the accent with *No scene*.

## 3.2.1 (2026-11-24)

- In the Windows desktop app, the ▾/▴ that opens the HUD could be pushed out of the row and vanish. The HUD now shrinks to the room left, and the toggle always stays beside it.

## 3.2.0 (2026-11-14)

- `/crabhud theme on` dresses the whole desktop app: the colors (the left sidebar too), frosted glass over a backdrop, and the agents panel's cards, the progress row and the HUD in the same tones. Off by default.
- The style (`/crabhud style`) picks the backdrop and how clear the glass is; the palette picks the colors. Ten palettes, Claude's orange by default: Claude, Mint on black, Ocean, Violet, Rose, Amber, Lagoon, Neon, Ice and Graphite. Pick one in the style picker or with `/crabhud palette <name>`.
- Twelve backdrops, one per style, each its own scene, with crabs walking behind the chat. The backdrop holds still while Claude works, so it never blinks between the steps of a bar.
- The glass is see-through in every style, the clearest in Glass, and the panel's cards let the frost show.
- Accent words in dark mode, such as a `/command` in the chat, keep the palette's color instead of turning almost white.
- `/crabhud status` says whether the theme is on and in which palette; the style picker has a button that turns it on and off.
- The `/crabhud` command shows the words it takes after its name.

## 3.1.1 (2026-11-13)

- The README shows the panel's crew in their clothes, in the top picture and in a new picture of every costume, and its text reads more plainly.
- The language setting defaults to English when you install the mod; Portuguese, Russian and auto are still there to pick.
- Planned `crab-light` tasks in the panel say Sonnet, the model the agent runs on, instead of Opus.

## 3.1.0 (2026-11-13)

- Five new bar styles: wave, stripes, neon, glass and stairs, for twelve in all. Spark fills up at 100%, and classic gets small rounded corners.
- The fill's end is rounded in pixel, solid and line, and the progress tag stays on the group in progress.
- The walking crab no longer jumps when a new scene starts, since each scene runs from where the crab stands. When the row has little room, it keeps still in its corner.
- Panel crabs wear real outfits, with the legs behind the clothes, and Plan and any other agent get new costumes (the architect and the handyman).
- The "working" ✻ in the HUD spins in place.
- `/crabhud budget <usd>` turns the chat's cost amber once it passes that amount.
- When the compact HUD has no room for the resets, the cost takes turns with the 5-hour reset.
- The expanded HUD shows today's and this month's spend.
- In the panel, a card that finished well over a minute ago shrinks to one line. Failed ones stay full size.
- The crab row cuts a long status with "…" before it reaches the crab's corner.
- Fixed: the row turns amber again while a permission prompt stays open.
- The type check passes with no TypeScript errors.
- crab-light runs on Sonnet.
- A plugin icon, this changelog, a contributing guide and issue templates. The README gets the one-line install, badges and new pictures.
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
- At 100% the crab hops and throws pixel confetti, with an optional fanfare.
- The compact HUD draws a ring per reading; the crab row counts the answer's actions and time.
- The agents panel adds today's and this month's spend, summed over every chat.
- New `/crabhud status` and `/crabhud demo` commands, and the language setting now covers the bar and the panel.

## 2.5.0 (2026-10-14)

- Agent portraits (pixels, color, animation) and step colors are read from an optional data file instead of the code.
- Without that file, every agent uses the generic crab.

## 2.4.0 (2026-10-14)

- The crab walks sideways through the free part of the row and stops to act out the task.
- The row turns amber while Claude waits for a permission or an answer.
- `/crabhud sound on|off`: optional sounds, off by default.
- The HUD shows how fast the limits rise per hour or day, and when they run out.
- The progress tag slides to its new place.

## 2.3.0 (2026-10-14)

- Commands move to `/crabhud` (on, off, language, style).
- `/crabhud style` shows each style drawn in SVG, with a live preview.
- Fixed: in the terminal the bar and the crab were drawn as SVG and vanished. They are now always text there.

## 2.2.0 (2026-10-14)

- Six bar styles in the HUD: pixel, segments, line, solid, dots and spark.
- The choice is saved between sessions.

## 2.1.0 (2026-10-14)

- The `/crab-flow` skill and its five worker agents ship with the mod and drive the bar and the panel directly (under earlier names; see 3.0.0).

## 2.0.0 (2026-10-14)

- The HUD mod and the progress-bar mod merge into one: crab and bar above the prompt, HUD below, agents panel beside the chat.
- New tools: `mcp__crabhud__progress` and `mcp__crabhud__step`.

## 1.0.0 to 1.5.1 (2026-10-03 to 2026-10-12)

- The HUD before the merge: a pixel-art HUD above the prompt (1.0.0), first-run language question (1.1.0), terminal effort and its own looks (1.2.0).
- A still HUD for Remote Control viewers (1.4.0) and Linux support (1.3.0).
- The context gauge measures against the autocompact window (1.5.0).
