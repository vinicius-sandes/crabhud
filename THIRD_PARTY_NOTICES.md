# Third-party notices

crabhud includes code adapted from these projects, under the MIT License.

## claude-kit (JohnnyVizz): savvy-progress and savvy-flow

From [claude-kit](https://github.com/JohnnyVizz/claude-kit):

- The progress bar, the crab and the agents panel (the progress part of `hooks/register.tsx`) start from
  its savvy-progress mod.
- `skills/savvy-flow` and `agents/savvy-*.md` are its savvy-flow plugin (copied at claude-kit c871c15), with
  the progress tools renamed to `mcp__crabhud__progress` and `mcp__crabhud__step`. Its pixel bar and gliding pill adapt
[plan-progress](https://github.com/zycck/claude-mods) by Kirill Serditov (MIT).

```
MIT License

Copyright (c) 2026 johnnyvizz

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## claude-deck (nvr0x5): bar styles and the style picker

From [claude-deck](https://github.com/nvr0x5/claude-deck): the bar styles in `hooks/bar-styles.ts` (pixel, segments,
line, solid, dots, spark; classic is pixel-hud's own blocks), drawn in SVG for the desktop app and in text for the
terminal, and the `/crabhud style` picker with live previews, follow its `/deck style`, adapted to the progress bar,
the HUD's percentage gauges and the agents panel.

Also from claude-deck (2.4.0): the crab walking the free part of the row, the limits' pace and run-out estimate,
the amber row and chime while Claude waits on a permission or a question (its `tool.check` ask after a short delay),
the optional sounds, the progress tag gliding to its new place, and its trick for animating across redraws: a
negative `animation-delay` by the age of the scene. The code and the sounds (`sounds/`) are crabhud's own.

```
MIT License

Copyright (c) 2026 nvr0x5

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
