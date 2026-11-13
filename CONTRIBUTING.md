# Contributing

Thanks for helping. crabhud is a small mod, so changes can be small too.

## Run the checks

From the repository root, before opening a PR:

```bash
claude plugin validate .
claude plugin test .
npx -y -p typescript@5.9.3 tsc -p . --noEmit
```

Use TypeScript 5.x. TypeScript 7 breaks the type check.

## Try your change

Load the mod from your clone with `CLAUDE_CODE_PLUGIN_DIRS=/path/to/crabhud`. The mod reloads when you save a file, so there is no build step.

## Where things live

- `hooks/bar-styles.ts`: the progress bar styles.
- `hooks/hud-svg.ts` and `hooks/hud-client.tsx`: the HUD drawing.
- `hooks/portraits.ts`: the panel portraits.
- `hooks/words.ts`: the panel's, the bar's and the `/crabhud` command's words in each language.
- `hooks/hud-words.ts`: the HUD's words, colours and number formats.
- `hooks/register.tsx`: every hook.
- `agents/` and `skills/crab-flow/`: the `/crab-flow` workers and skill.
- `tests/`: the test suite.

Hooks stay in `register.tsx` on purpose. The engine follows `$` only within one file, and it needs the event name written literally in `on('...')`.

Pure drawing code (no `$`) can live in its own file and be imported.

## Pull requests

- Keep each PR to one idea, with tests when behavior changes.
- Visual changes come with a screenshot (light and dark if you can).
- Write commits and PR text in English.
- Add a line to `CHANGELOG.md` under the unreleased section.
