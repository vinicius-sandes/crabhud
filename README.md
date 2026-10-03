# pixel-hud

A pixel-art status HUD for [Claude Code](https://claude.com/claude-code) that sits right above the prompt and shows, live, without a single click:

- **This chat:** the selected **model** and **effort** (Low, Medium, High, Extra, Ultracode), its **context window** (tokens used / window), and its **cost** in USD
- **Your account:** the **5-hour** and **7-day usage limits** with their reset times, shared across every chat

```
✓ Opus 5.5  High   │   ctx ███▒····· 31%   │   5h ██▒······ 20%  ↻ 2h39m   │   7d █████▓▒·· 58%  ↻ 1d6h   │   $4.32   ▾
```

Click anywhere on the HUD to switch between **compact** (one line) and **expanded** (longer bars, token counts, full reset times). Your choice is remembered.

The loudest settings get their own look, following each surface's own effort picker:

- **Desktop app:** **Ultracode** switches palettes: the bars flow through a purple-to-pink gradient and a soft pixel wave drifts behind everything.
- **Terminal:** Low is yellow, Medium green, High purple. **xhigh** turns the HUD purple, with a purple wave behind it; **max** turns it every colour, with a rainbow wave. Ultracode (Tab in `/effort`) shows next to the level, as in `Max · Ultracode`.

When the context or a limit crosses 90%, you get a toast.

## How it stays live

- **Context and cost** refresh after every model response, not only when a turn ends.
- **Model and effort** follow the picker under the chat the moment you change it (desktop app). In the terminal they follow `/effort` the moment it closes, and start from the effort saved for your model.
- **Limits** are the account's, not the chat's: every chat running the HUD shares its latest reading through a small file (`~/.claude/pixel-hud-limits.json`), and every HUD shows the freshest one. Use one chat to 97% and the others show 97% within half a second.
- A window whose reset time has passed drops back to 0% until the next reading.

## Install

Works in the Claude desktop app (Code tab) and in the Claude Code terminal, on Windows and macOS.

1. Clone the repository into your mods folder:

   ```bash
   git clone https://github.com/Apoio-Midias/pixel-hud ~/.claude/mods/pixel-hud
   ```

2. Add this to `~/.claude/settings.json` (inside the existing top-level object):

   ```json
   "env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/pixel-hud" }
   ```

   If your `settings.json` already has an `"env"` block, add just the `CLAUDE_CODE_PLUGIN_DIRS` key to it.

3. Open a new chat. The HUD appears above the prompt, in every chat from now on, and asks which language you want.

To update: `git -C ~/.claude/mods/pixel-hud pull`, then open a new chat.

## Language

The HUD speaks English by default and also Brazilian Portuguese. The first time it appears, it asks which one you want, once. Your pick is kept for every chat on that machine. Change it anytime with `/hud language`.

To skip the question (for example, when setting up a machine from a script), set it in `~/.claude/settings.json`:

```json
"pluginConfigs": { "pixel-hud": { "options": { "language": "pt-BR" } } }
```

## Commands

- `/hud off` hides the HUD, `/hud on` shows it again, `/hud` toggles it.
- `/hud language` asks for the language again; `/hud language en` or `/hud language pt-BR` sets it directly.

## Cost

The HUD never calls the model and adds nothing to what is sent to Claude: it spends no tokens and does not touch your limits. It only uses a little of your own machine: a file check every quarter second (the chat's settings and the shared limits), a local usage read every second, and redraws while Claude is working or Ultracode is on.

## Privacy

Everything stays on your machine. The HUD reads the desktop app's local record of the current chat (only its model and effort fields) and writes one small file with your limit percentages and reset times. Nothing is sent anywhere.

## Notes

- Claude Code's mod system (function hooks) is in early access and may change between releases.
- The 5-hour and 7-day limits appear after the first response in any chat running the HUD.

## Tests

```bash
claude plugin validate ~/.claude/mods/pixel-hud
claude plugin test ~/.claude/mods/pixel-hud
```

## License

[MIT](LICENSE)
