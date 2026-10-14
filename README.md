# crabhud

A Claude Code mod that sits right above the prompt and beside the chat:

- **The crab** shows what Claude is doing right now (sleeping, thinking, analyzing, working, coordinating).
- **A progress bar** for long jobs: a title, the step in progress, stretches with their own colors, and a checklist in the panel. Skills and workflows feed it through the `mcp__crabhud__progress` tool; subagents report their own steps through `mcp__crabhud__step`.
- **The HUD** under them: the selected **model** and **effort**, the chat's **context** and **cost**, and the account's **5-hour** and **7-day limits** with their reset times, shared across every chat.
- **The agents panel** (`/agents-info`): running, finished and planned subagents with model, effort, progress, context, cost and time, each with its own crab.
- **`/savvy-flow`**: an orchestrated delivery flow. The session model plans, owns the design and reviews; five tiered worker agents (`savvy-fable`, `savvy-heavy`, `savvy-careful`, `savvy-medium`, `savvy-light`) implement. The flow drives the progress bar, and each worker reports its own steps to the panel.

```
✓ Opus 5.5  High   │   ctx ███▒····· 31%   │   5h ██▒······ 20%  ↻ 2h39m   │   7d █████▓▒·· 58%  ↻ 1d6h   │   $4.32   ▾
```

Click anywhere on the HUD to switch between **compact** (one line) and **expanded** (longer bars, token counts, full reset times). Your choice is remembered.

## Styles

Pick how the HUD's bars look with `/hud style`: a picker with a live preview of each one (keys 1–6). The desktop app and the terminal each keep their own pick; `/hud style <name>` sets both at once.

```
Pixel     ctx █▒······ 31%  │  5h █▒······ 20%  │  7d ███▓▒··· 58%
Segments  ctx ▰▰▱▱▱▱▱▱ 31%  │  5h ▰▰▱▱▱▱▱▱ 20%  │  7d ▰▰▰▰▰▱▱▱ 58%
Line      ctx ━━╸───── 31%  │  5h ━━╸───── 20%  │  7d ━━━━━╸── 58%
Solid     ctx ██░░░░░░ 31%  │  5h ██░░░░░░ 20%  │  7d █████░░░ 58%
Dots      ctx ● ○ ○ ○  31%  │  5h ◐ ○ ○ ○  20%  │  7d ● ● ○ ○  58%
Spark     ctx ▂▃▁▁▁▁▁▁ 31%  │  5h ▂▃▁▁▁▁▁▁ 20%  │  7d ▂▃▄▅▆▁▁▁ 58%
```

**Solid** is a filled bar of colour (drawn above with █ and ░). While Claude works, the heads of segments, line, dots and spark blink, and a light sweeps along solid. **Pixel** is the default. The Remote Control row draws the same style, without the animation.

The loudest settings get their own look, following each surface's own effort picker:

- **Desktop app:** **Ultracode** switches palettes: the bars flow through a purple-to-pink gradient and a soft pixel wave drifts behind everything.
- **Terminal:** Low is yellow, Medium green, High purple. **xhigh** turns the HUD purple, with a purple wave behind it; **max** turns it every colour, with a rainbow wave. Ultracode (Tab in `/effort`, `/effort ultracode on`, or `"ultracode": true` in the settings) shows next to the level, as in `Max · Ultracode`; "Dynamic workflows" in `/config` only allows it, so it does not turn it on.

When the context or a limit crosses 90%, you get a toast.

crabhud brings together what used to be pixel-hud, a copy of savvy-progress and savvy-flow. Don't load any of them alongside it.

## Remote Control

Following a chat through Remote Control (from the phone or another computer), the HUD shows a still version of the compact row, marked **⇄ Remote Control: ON**: the same model, effort, context, limits and cost, in the same colours, refreshed with every new reading, without the animations (each frame would have to cross the connection). The computer running the chat keeps the full HUD. The mod only needs to be installed on that computer.

## How it stays live

- **Context and cost** refresh after every model response, not only when a turn ends.
- **Model and effort** follow the picker under the chat the moment you change it (desktop app). In the terminal they follow `/effort` the moment it closes, and start from the effort saved for your model.
- **Limits** are the account's, not the chat's: every chat running the HUD shares its latest reading through a small file (`~/.claude/crabhud-limits.json`), and every HUD shows the freshest one. Use one chat to 97% and the others show 97% within half a second.
- A window whose reset time has passed drops back to 0% until the next reading.

## Install

Works in the Claude desktop app (Code tab) and in the Claude Code terminal, on Windows, macOS, and Linux. On Linux the HUD reads the app's records from `$XDG_CONFIG_HOME` (or `~/.config`), and in the terminal it works the same as anywhere else.

1. Clone the repository into your mods folder:

   ```bash
   git clone https://github.com/vinicius-sandes/crabhud ~/.claude/mods/crabhud
   ```

2. Add this to `~/.claude/settings.json` (inside the existing top-level object):

   ```json
   "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/crabhud" }
   ```

   If your `settings.json` already has an `"env"` block, add just the `CLAUDE_CODE_PLUGIN_DIRS` key to it.

3. Open a new chat. The HUD appears above the prompt, in every chat from now on, and asks which language you want.

To update: `git -C ~/.claude/mods/crabhud pull`, then open a new chat.

## Language

The HUD speaks English by default and also Brazilian Portuguese. The first time it appears, it asks which one you want, once. Your pick is kept for every chat on that machine. Change it anytime with `/hud language`.

To skip the question (for example, when setting up a machine from a script), set it in `~/.claude/settings.json`:

```json
"pluginConfigs": { "crabhud": { "options": { "language": "pt-BR" } } }
```

## Commands

- `/hud off` hides the HUD, `/hud on` shows it again, `/hud` toggles it.
- `/hud language` asks for the language again; `/hud language en` or `/hud language pt-BR` sets it directly.
- `/hud style` opens the style picker; `/hud style pixel|segments|line|solid|dots|spark` sets it directly.
- `/agents-info` opens or closes the agents panel.
- `/savvy-flow <task>` (`/crabhud:savvy-flow` when another skill has the same name) runs the orchestrated flow.

## Cost

The HUD never calls the model and adds nothing to what is sent to Claude: it spends no tokens and does not touch your limits. It only uses a little of your own machine: a file check every quarter second (the chat's settings and the shared limits), a local usage read every second, and redraws while Claude is working or Ultracode is on.

## Privacy

Everything stays on your machine. The HUD reads the desktop app's local record of the current chat (only its model and effort fields) and writes one small file with your limit percentages and reset times. Nothing is sent anywhere.

## Notes

- Claude Code's mod system (function hooks) is in early access and may change between releases.
- The 5-hour and 7-day limits appear after the first response in any chat running the HUD.

## Tests

```bash
claude plugin validate ~/.claude/mods/crabhud
claude plugin test ~/.claude/mods/crabhud
```

## License

[MIT](LICENSE). The progress bar, the crab, the agents panel and `/savvy-flow` start from JohnnyVizz's [claude-kit](https://github.com/JohnnyVizz/claude-kit) (MIT); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
