import type { ClientModule, RenderElement } from 'claude-code'

import type { HudLimit, HudProps } from '../types'
import { barCells, mergeCells } from './bar-styles'
import { AMBER, EFFORT_COLOR, GREEN, ORANGE, PURPLE, RED, WORDS, fmtLeft, fmtTok, pctText, tone, CYCLE_S, cycleAt } from './hud-words'

type State = { open: boolean; frame: number; refresh: number }
type Seg = { t: string; c?: string; dim?: boolean; bold?: boolean }
// One piece of the compact row: text, a bar `n` cells long, or a drawn
// element `w` cells wide.
type Piece =
  | { seg: Seg }
  | { bar: { p: number | null; n: number; base: string } }
  | { el: RenderElement; w: number }

const SPIN = ['✻', '✶', '✷', '✸', '✹', '✺']
// The terminal's own effort picker: low yellow, medium green, high purple
// (xhigh and max wear a theme, below).
const TERMINAL_EFFORT_COLOR: Record<string, string> = {
  low: '#E9C46A',
  medium: GREEN,
  high: PURPLE,
  xhigh: PURPLE,
  max: '#F25F8B',
}
// Ultracode's label shimmers through these, letter by letter.
const ULTRA = ['#8B83E6', '#A58BEB', '#C86DD7', '#E46FB0', '#F25F8B', '#E46FB0', '#C86DD7', '#A58BEB']
// The desktop draws Text in a proportional font, where █ is wide and · thin;
// there each pixel is a one-cell Box, so the bar's length never depends on
// the glyphs. Its text runs about 0.8 cell a character.

// The frame clock's callback reads the newest props through this (the HUD's;
// the picker's previews keep their own clock).
let latest: HudProps | null = null
// The sample the picker's previews draw, in percent.
const SAMPLE = 64

function nowMs(props: HudProps): number {
  return typeof Date === 'function' ? Date.now() : props.now
}

// Ultracode's backdrop: a soft dither wave drifting across the band. 0 is
// blank, 1-3 the ·, ░ and ▒ steps.
function shimmer(row: number, cols: number, t: number): number[] {
  return Array.from({ length: cols }, (_, i) => {
    const wave = 0.5 + 0.5 * Math.sin(i * 0.45 - t * 0.5 + row * 1.7)
    const sweep = 0.5 + 0.5 * Math.sin(i * 0.09 - t * 0.12 + row)
    const v = wave * sweep
    return v > 0.7 ? 3 : v > 0.45 ? 2 : v > 0.28 ? 1 : 0
  })
}

// A loud look: a palette that flows along the bars and the labels, and the
// colour of each step (1-3) of the wave behind the band at column `i`.
type Theme = { flow: readonly string[]; wave: (step: number, i: number, t: number, desktop: boolean) => string }

const PURPLE_WAVE = (step: number, _i: number, _t: number, desktop: boolean) =>
  desktop ? PURPLE + ['62', '3D', '52'][step - 1] : ['#544D80', '#433D66', '#544D80'][step - 1]
const RAINBOW = ['#F25F8B', '#F08A4B', '#E9C46A', '#3FB68B', '#5AA9E6', '#8B83E6', '#C86DD7']
const RAINBOW_DIM = ['#5C2A3A', '#5A3A24', '#57502C', '#1F4A3A', '#24405A', '#3A3560', '#4E2D55']

// The desktop's Ultracode; under the terminal, xhigh (purple) and max (every
// colour), as its own picker draws them.
const THEMES = {
  ultracode: { flow: ULTRA, wave: PURPLE_WAVE },
  xhigh: { flow: ['#6E64D8', '#8B83E6', '#A58BEB', '#BBA8F2', '#A58BEB', '#8B83E6'], wave: PURPLE_WAVE },
  max: {
    flow: RAINBOW,
    wave: (_step: number, i: number, t: number, desktop: boolean) => {
      const k = Math.floor(i / 4 + t / 3) % RAINBOW.length
      return desktop ? RAINBOW[k] + '55' : RAINBOW_DIM[k]
    },
  },
} satisfies Record<string, Theme>

function themeOf(p: HudProps): Theme | null {
  if (p.surface === 'desktop') return p.ultracode ? THEMES.ultracode : null
  return p.effort === 'max' ? THEMES.max : p.effort === 'xhigh' ? THEMES.xhigh : null
}

// The theme's palette flowing along a bar, a step every two frames; a bar
// past 90% keeps its warning in red and pink.
function flowAt(theme: Theme, p: number, i: number, frame: number): string {
  const k = Math.floor(i / 2 + frame / 2)
  return p >= 90 ? (k % 2 === 0 ? '#F25F8B' : RED) : theme.flow[k % theme.flow.length]
}

const Hud: ClientModule<HudProps, State> = (props, surface) => {
  const preview = props.preview
  if (preview === undefined) latest = props
  const { Box, Text } = surface.elements
  const desktop = props.surface === 'desktop'
  const init: State = { open: props.expanded, frame: 0, refresh: 0 }
  const st = surface.state ?? init
  const theme = preview === undefined ? themeOf(props) : null

  if (surface.state === undefined && preview !== undefined) {
    // A preview is always alive, so the picker shows each style moving.
    surface.every(200, () => {
      const cur = surface.state ?? init
      surface.setState({ ...cur, frame: cur.frame + 1 })
    })
  } else if (surface.state === undefined) {
    let ticks = 0
    surface.every(200, () => {
      ticks++
      const cur = surface.state ?? init
      // Animate while Claude works or a theme is on; otherwise repaint every
      // 30s so the reset countdowns stay current.
      if (latest && (latest.working || themeOf(latest))) surface.setState({ ...cur, frame: cur.frame + 1 })
      else if (ticks % 150 === 0) surface.setState({ ...cur, refresh: cur.refresh + 1 })
    })
    const toggle = () => {
      const cur = surface.state ?? init
      const open = !cur.open
      surface.setState({ ...cur, open })
      surface.post({ expanded: open })
    }
    surface.onPointer(ev => {
      if (ev.type === 'down' && (ev.button === undefined || ev.button === 'left')) toggle()
    })
    surface.onKey(ev => {
      if (ev.key === 'return' || ev.key === ' ') toggle()
    })
  }

  const text = (s: Seg): RenderElement => (
    <Text color={s.c} dimColor={s.dim} bold={s.bold} wrap="truncate">
      {s.t}
    </Text>
  )
  const bar = (p: number | null, n: number, base: string): RenderElement => {
    const col = tone(p ?? 0, base)
    const colorAt = (i: number) => (theme ? flowAt(theme, p ?? 0, i, st.frame) : col)
    const cells = barCells(props.style, p, n, colorAt, st.frame, preview !== undefined || props.working)
    if (!desktop) {
      return (
        <Box flexDirection="row" flexShrink={0}>
          {mergeCells(cells).map(c => (
            <Text color={c.c} dimColor={c.dim} backgroundColor={c.bg}>
              {c.t}
            </Text>
          ))}
        </Box>
      )
    }
    // Each cell is its own glyph clipped to one cell: the texture stays, and
    // the bar's length is the cells', not the font's.
    return (
      <Box flexDirection="row" flexShrink={0}>
        {cells.map(c => (
          <Box width={1} height={1} flexShrink={0} overflow="hidden" justifyContent="center" backgroundColor={c.bg}>
            <Text color={c.c} dimColor={c.dim}>
              {c.t}
            </Text>
          </Box>
        ))}
      </Box>
    )
  }

  if (preview !== undefined) {
    return (
      <Box flexDirection="row" columnGap={1} alignItems="center">
        {text({ t: 'ctx', dim: true })}
        {bar(SAMPLE, preview, cycleAt((st.frame * 0.2) / CYCLE_S))}
        {text({ t: `${SAMPLE}%`, bold: true })}
      </Box>
    )
  }

  const W = WORDS[props.lang] ?? WORDS.en
  const u = props.chat
  const now = nowMs(props)
  // A window whose reset time has passed starts over at zero until the next
  // reading says otherwise.
  const limits = props.limits.map(l =>
    l.resetsAt !== null && l.resetsAt <= now ? { ...l, percent: 0, resetsAt: null, isReset: true } : { ...l, isReset: false },
  )
  const five = limits.find(l => l.kind === 'five_hour')
  const week = limits.find(l => l.kind === 'seven_day')
  const others = limits.filter(l => l.kind !== 'five_hour' && l.kind !== 'seven_day')
  const ctxP = u?.ctxPercent ?? null
  const alert = [ctxP ?? 0, ...limits.map(l => l.percent)].some(p => p >= 90)
  const cost: Seg = { t: u?.costUsd != null ? `$${u.costUsd.toFixed(2)}` : '$—', bold: true }
  const effortName = (e: string | null) => (e === null ? '—' : (W.effortNames[e] ?? e))
  const cols = surface.columns > 0 ? surface.columns : 100
  const status: Seg = props.working
    ? { t: SPIN[st.frame % SPIN.length], c: ORANGE }
    : alert
      ? { t: '!', c: RED, bold: true }
      : { t: '✓', c: theme ? theme.flow[Math.floor(st.frame / 2) % theme.flow.length] : GREEN }
  // Ultracode is a switch over an effort level: the app's picker sets it on
  // top of Extra (shown as just "Ultracode"), the terminal's Tab on any level
  // (shown as "Max · Ultracode"). A themed level shimmers in its palette.
  const ultra = props.ultracode
  const level = ultra && desktop && (props.effort === 'xhigh' || props.effort === null) ? null : props.effort
  const shimmerWord = (word: string, palette: readonly string[]) =>
    [...word].map((ch, i) => (
      <Text bold color={palette[(i + st.frame) % palette.length]}>
        {ch}
      </Text>
    ))
  const levelName = level === null ? null : effortName(level)
  const levelEl: RenderElement[] =
    level === null || levelName === null
      ? []
      : !desktop && theme
        ? shimmerWord(levelName, theme.flow)
        : [text({ t: levelName, c: (desktop ? EFFORT_COLOR : TERMINAL_EFFORT_COLOR)[level] || PURPLE, bold: level === 'xhigh' || level === 'max' })]
  const effortText = [levelName, ultra ? 'Ultracode' : null].filter(Boolean).join(' · ') || '—'
  const effort: RenderElement = (
    <Box flexDirection="row" flexShrink={0}>
      {levelEl}
      {ultra && levelEl.length > 0 ? text({ t: ' · ', dim: true }) : []}
      {ultra ? shimmerWord('Ultracode', theme?.flow ?? ULTRA) : []}
      {levelEl.length === 0 && !ultra ? text({ t: '—', dim: true }) : []}
    </Box>
  )
  const est = (s: string) => (desktop ? Math.ceil(s.length * 0.8) : s.length)

  // A theme puts its dither wave behind everything, drawn first so the
  // readings paint over it. The desktop's shades are translucent, so they sit
  // on a light theme and a dark one alike.
  const backdrop = (rows: number, body: RenderElement): RenderElement => {
    if (!theme) return body
    const glyphs = ['·', '░', '▒']
    const lines = Array.from({ length: rows }, (_, r) => {
      const v = shimmer(r, cols, st.frame)
      const color = (i: number) => (v[i] === 0 ? '' : theme.wave(v[i], i, st.frame, desktop))
      const out: RenderElement[] = []
      for (let i = 0; i < v.length; ) {
        let j = i
        while (j < v.length && v[j] === v[i] && color(j) === color(i) && (desktop ? v[i] === 0 : true)) j++
        if (v[i] === 0) {
          out.push(desktop ? <Box width={j - i} height={1} flexShrink={0} /> : <Text>{' '.repeat(j - i)}</Text>)
        } else if (desktop) {
          j = i + 1
          out.push(
            <Box width={1} height={1} flexShrink={0} overflow="hidden" justifyContent="center">
              <Text color={color(i)}>{glyphs[v[i] - 1]}</Text>
            </Box>,
          )
        } else {
          out.push(<Text color={color(i)}>{glyphs[v[i] - 1].repeat(j - i)}</Text>)
        }
        i = j
      }
      return (
        <Box flexDirection="row" height={1} overflow="hidden">
          {out}
        </Box>
      )
    })
    return (
      <Box width="100%" position="relative">
        <Box position="absolute" top={0} left={0} width="100%" height={rows} overflow="hidden" flexDirection="column">
          {lines}
        </Box>
        {body}
      </Box>
    )
  }

  if (!st.open) {
    // Compact: groups spaced by margins (the desktop collapses spaces). Shrink
    // the bars first, then drop the reset times, then the effort, so the cost
    // at the right never gets cut.
    const limit = (label: string, l: (HudLimit & { isReset?: boolean }) | undefined, n: number, withReset: boolean): Piece[] => [
      { seg: { t: label, dim: true } },
      ...(n > 0 ? [{ bar: { p: l?.percent ?? null, n, base: GREEN } }] : []),
      { seg: { t: pctText(l?.percent ?? null), bold: true } },
      ...(withReset && l?.resetsAt != null ? [{ seg: { t: `↻ ${fmtLeft(l.resetsAt - now, true, W.now)}`, dim: true } }] : []),
    ]
    // The status glyph sits in a box of fixed width: in the desktop's
    // proportional font each spinner frame (and the ✓) is a different width,
    // and a bare glyph would nudge the whole row on every frame.
    const statusW = desktop ? 2 : 1
    const statusEl = (
      <Box key="status" width={statusW} flexShrink={0}>
        {text(status)}
      </Box>
    )
    const build = (n: number, resets: boolean, head: boolean): Piece[][] => [
      [{ el: statusEl, w: statusW }, { seg: { t: props.model, bold: true } }, ...(head ? [{ el: effort, w: ultra || (theme && !desktop) ? effortText.length + 1 : est(effortText) }] : [])],
      [
        { seg: { t: 'ctx', dim: true } },
        ...(n > 0 ? [{ bar: { p: ctxP, n, base: PURPLE } }] : []),
        { seg: { t: pctText(ctxP), bold: true } },
      ],
      limit('5h', five, n, resets),
      limit('7d', week, n, resets),
      [{ seg: cost }],
    ]
    const SEP = 5 // "  │  "
    const width = (groups: Piece[][]) =>
      groups.reduce(
        (sum, g) =>
          sum + g.reduce((w, p) => w + ('seg' in p ? est(p.seg.t) : 'bar' in p ? p.bar.n : p.w), 0) + g.length - 1,
        SEP * (groups.length - 1),
      )
    const room = cols - 3 // the ▾ at the right edge
    let groups = build(0, false, false)
    search: for (const [resets, head, min] of [[true, true, 5], [false, true, 4], [false, false, 4], [false, false, 0]] as const) {
      for (let n = 12; n >= min; n--) {
        const candidate = build(n, resets, head)
        if (width(candidate) <= room) {
          groups = candidate
          break search
        }
      }
    }
    const draw = (p: Piece) =>
      'seg' in p ? text(p.seg) : 'bar' in p ? bar(p.bar.p, p.bar.n, p.bar.base) : p.el
    const sep = () => <Box marginX={2} flexShrink={0}>{text({ t: '│', dim: true })}</Box>
    const group = (g: Piece[]) => (
      <Box flexDirection="row" columnGap={1} alignItems="center" flexShrink={0}>
        {g.map(draw)}
      </Box>
    )
    // The cost (the last group) sits outside the part that may be clipped:
    // if the estimate runs short, the 7d reset gives way, never the cost.
    const head = groups.slice(0, -1)
    const row: RenderElement[] = []
    head.forEach((g, i) => {
      if (i > 0) row.push(sep())
      row.push(group(g))
    })

    return backdrop(
      1,
      <Box flexDirection="row" width="100%" justifyContent="space-between" alignItems="center">
        <Box flexDirection="row" flexShrink={1} minWidth={0} alignItems="center">
          <Box flexDirection="row" flexShrink={1} minWidth={0} overflow="hidden" alignItems="center">
            {row}
          </Box>
          {sep()}
          {group(groups[groups.length - 1])}
        </Box>
        <Box flexShrink={0} marginLeft={2}>
          {text({ t: '▾', dim: true })}
        </Box>
      </Box>,
    )
  }

  // Expanded: fixed-width columns (icon, label, bar, percent, detail), so
  // every bar starts and ends on the same column.
  const n = Math.max(10, Math.min(desktop ? 28 : 40, cols - 2 - 12 - 2 - 6 - 2 - 18))
  const row = (icon: Seg, label: string, b: RenderElement, pct: number | null, detail: string) => (
    <Box flexDirection="row" alignItems="center">
      <Box width={2} flexShrink={0}>{text(icon)}</Box>
      <Box width={12} flexShrink={0}>{text({ t: label, dim: true })}</Box>
      {b}
      <Box width={6} flexShrink={0} justifyContent="flex-end">{text({ t: pctText(pct), bold: true })}</Box>
      <Box marginLeft={2} flexShrink={1} overflow="hidden">{text({ t: detail, dim: true })}</Box>
    </Box>
  )
  const limitRow = (icon: string, label: string, l: (HudLimit & { isReset?: boolean }) | undefined) =>
    row(
      { t: icon, c: theme ? flowAt(theme, l?.percent ?? 0, 3, st.frame) : tone(l?.percent ?? 0, GREEN) },
      label,
      bar(l?.percent ?? null, n, GREEN),
      l?.percent ?? null,
      l?.isReset ? `${W.reset} · ${W.account}` : l?.resetsAt != null ? `${W.resetsIn(fmtLeft(l.resetsAt - now, false, W.now))} · ${W.account}` : l ? W.account : W.noReading,
    )
  const stateWord: Seg = props.working
    ? { t: W.working, c: ORANGE }
    : alert
      ? { t: W.alert, c: RED }
      : { t: W.ready, c: theme ? theme.flow[Math.floor(st.frame / 2) % theme.flow.length] : GREEN }

  return backdrop(
    4 + others.length,
    <Box flexDirection="column" width="100%" rowGap={0}>
      <Box flexDirection="row" justifyContent="space-between" alignItems="center">
        <Box flexDirection="row" flexShrink={1} overflow="hidden" alignItems="center">
          <Box width={2} flexShrink={0}>{text(status)}</Box>
          <Box width={12} flexShrink={0}>{text(stateWord)}</Box>
          {text({ t: props.model, bold: true })}
          <Box marginLeft={3} flexDirection="row" columnGap={1}>
            {text({ t: W.effort, dim: true })}
            {effort}
          </Box>
        </Box>
        <Box flexDirection="row" flexShrink={0} marginLeft={2} columnGap={1}>
          {text({ t: W.chat, dim: true })}
          {text(cost)}
          {text({ t: '▴', dim: true })}
        </Box>
      </Box>
      {row(
        { t: '■', c: theme ? flowAt(theme, ctxP ?? 0, 0, st.frame) : tone(ctxP ?? 0, PURPLE) },
        W.context,
        bar(ctxP, n, PURPLE),
        ctxP,
        u?.ctxTokens != null ? `${fmtTok(u.ctxTokens)} / ${fmtTok(u.ctxWindow)}` : u ? `— / ${fmtTok(u.ctxWindow)}` : '',
      )}
      {limitRow('●', W.fiveHour, five)}
      {limitRow('◆', W.sevenDay, week)}
      {others.map(l => limitRow('$', l.kind === 'spend_limit' ? W.spend : l.kind, l))}
    </Box>,
  )
}

export default Hud
