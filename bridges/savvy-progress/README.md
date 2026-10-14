# savvy-progress bridge

[savvy-flow](https://github.com/JohnnyVizz/claude-kit) reports to the tools `mcp__savvy-progress__progress` and
`mcp__savvy-progress__step`. A tool's name carries its mod's name, so crabhud's own tools are
`mcp__crabhud__…`. This small mod declares the two old names; crabhud answers them, so savvy-flow's bar and
its workers' progress keep showing.

Load it next to crabhud (never next to the original savvy-progress, which has the same name):

```json
"env": { "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/crabhud:~/.claude/mods/crabhud/bridges/savvy-progress" }
```
