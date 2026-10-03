import type { ClientModule, RenderElement } from 'claude-code'

import type { HudLimit, HudProps } from '../types'

type State = { open: boolean; frame: number; refresh: number }
type Seg = { t: string; c?: string; dim?: boolean; bold?: boolean }
// One piece of the compact row: text, a bar `n` cells long, or a drawn
// element `w` cells wide.
type Piece =
  | { seg: Seg }
  | { bar: { p: number | null; n: number; base: string } }
  | { el: RenderElement; w: number }
// One pixel of a bar: solid, the two dithered steps of its edge, or empty.
type Px = 'full' | 'dark' | 'mid' | 'empty'

const GREEN = '#3FB68B'
const PURPLE = '#8B83E6'
const AMBER = '#E9A23B'
const RED = '#E5534B'
const ORANGE = '#D97757'
const SPIN = ['✻', '✶', '✷', '✸', '✹', '✺']
const GLYPH: Record<Px, string> = { full: '█', dark: '▓', mid: '▒', empty: '·' }
// Effort from calm to loud: grey, sky, the HUD's purple, magenta, hot pink.
const EFFORT_COLOR: Record<string, string> = {
  low: '#9AA0A8',
  medium: '#5AA9E6',
  high: PURPLE,
  xhigh: '#C86DD7',
  max: '#F25F8B',
}
// Every word the HUD draws, per language. The effort names are the app's
// picker's; Ultracode is its own switch on top of `xhigh`, which the hooks
// module reports as `ultracode`.
const WORDS = {
  en: {
    effortNames: { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra', max: 'Max', ultracode: 'Ultracode' } as Record<string, string>,
    ready: 'ready',
    working: 'working',
    alert: 'alert',
    effort: 'effort',
    chat: 'chat',
    context: 'context',
    fiveHour: '5h limit',
    sevenDay: '7d limit',
    spend: 'spend',
    resetsIn: (t: string) => `↻ resets in ${t}`,
    reset: '↻ reset',
    noReading: 'no reading yet',
    account: 'account',
    now: 'now',
  },
  'pt-BR': {
    effortNames: { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Extra', max: 'Máximo', ultracode: 'Ultracode' } as Record<string, string>,
    ready: 'pronto',
    working: 'rodando',
    alert: 'atenção',
    effort: 'esforço',
    chat: 'chat',
    context: 'contexto',
    fiveHour: 'limite 5h',
    sevenDay: 'limite 7d',
    spend: 'gasto',
    resetsIn: (t: string) => `↻ reseta em ${t}`,
    reset: '↻ resetou',
    noReading: 'sem leitura ainda',
    account: 'conta',
    now: 'agora',
  },
}
// Ultracode's label shimmers through these, letter by letter.
const ULTRA = ['#8B83E6', '#A58BEB', '#C86DD7', '#E46FB0', '#F25F8B', '#E46FB0', '#C86DD7', '#A58BEB']
// The desktop draws Text in a proportional font, where █ is wide and · thin;
// there each pixel is a one-cell Box, so the bar's length never depends on
// the glyphs. Its text runs about 0.8 cell a character.

// The frame clock's callback reads the newest props through this.
let latest: HudProps | null = null

const tone = (p: number, base: string) => (p >= 90 ? RED : p >= 70 ? AMBER : base)

function nowMs(props: HudProps): number {
  return typeof Date === 'function' ? Date.now() : props.now
}

function fmtLeft(ms: number, tight: boolean, now: string): string {
  if (ms <= 0) return now
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  const sp = tight ? '' : ' '
  if (d > 0) return `${d}d${sp}${h}h`
  if (h > 0) return `${h}h${sp}${m}m`
  return `${m}m`
}

function fmtTok(n: number): string {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

const pctText = (p: number | null) => (p === null ? '—' : `${Math.round(p)}%`)

// Solid up to the fill, its edge dithered (two steps once the fill is long
// enough, one on a short one), dots after.
function pixels(p: number | null, n: number): Px[] {
  const filled = Math.min(n, Math.round(((p ?? 0) / 100) * n))
  const fade = filled < n ? (filled >= 4 ? 2 : filled >= 2 ? 1 : 0) : 0
  return Array.from({ length: n }, (_, i): Px =>
    i >= filled ? 'empty' : fade >= 1 && i === filled - 1 ? 'mid' : fade === 2 && i === filled - 2 ? 'dark' : 'full',
  )
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

// The terminal is monospace: block glyphs line up there.
function glyphBar(p: number | null, n: number, colorAt: (i: number) => string): Seg[] {
  return pixels(p, n).map((px, i) => (px === 'empty' ? { t: GLYPH.empty, dim: true } : { t: GLYPH[px], c: colorAt(i) }))
}

// Ultracode's palette flowing along a bar, a step every two frames; a bar past
// 90% keeps its warning in the warm end of it.
function ultraAt(p: number, i: number, frame: number): string {
  const k = Math.floor(i / 2 + frame / 2)
  return p >= 90 ? (k % 2 === 0 ? '#F25F8B' : RED) : ULTRA[k % ULTRA.length]
}

function merge(segs: Seg[]): Seg[] {
  const out: Seg[] = []
  for (const s of segs) {
    const last = out[out.length - 1]
    if (last && last.c === s.c && last.dim === s.dim && last.bold === s.bold) last.t += s.t
    else out.push({ ...s })
  }
  return out
}

const Hud: ClientModule<HudProps, State> = (props, surface) => {
  latest = props
  const { Box, Text } = surface.elements
  const desktop = props.surface === 'desktop'
  const init: State = { open: props.expanded, frame: 0, refresh: 0 }
  const st = surface.state ?? init

  if (surface.state === undefined) {
    let ticks = 0
    surface.every(200, () => {
      ticks++
      const cur = surface.state ?? init
      // Animate while Claude works or Ultracode is on; otherwise repaint
      // every 30s so the reset countdowns stay current.
      if (latest?.working || latest?.effort === 'ultracode') surface.setState({ ...cur, frame: cur.frame + 1 })
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
  const line = (segs: Seg[]) => merge(segs).map(text)
  const bar = (p: number | null, n: number, base: string): RenderElement => {
    const col = tone(p ?? 0, base)
    const colorAt = (i: number) => (ultra ? ultraAt(p ?? 0, i, st.frame) : col)
    if (!desktop) return <Box flexDirection="row" flexShrink={0}>{line(glyphBar(p, n, colorAt))}</Box>
    // Each pixel is its own glyph clipped to one cell: the █ ▓ ▒ texture
    // stays, and the bar's length is the cells', not the font's.
    return (
      <Box flexDirection="row" flexShrink={0}>
        {pixels(p, n).map((px, i) => (
          <Box width={1} height={1} flexShrink={0} overflow="hidden" justifyContent="center">
            {px === 'empty' ? <Text dimColor>{GLYPH.empty}</Text> : <Text color={colorAt(i)}>{GLYPH[px]}</Text>}
          </Box>
        ))}
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
      : { t: '✓', c: props.effort === 'ultracode' ? ULTRA[Math.floor(st.frame / 2) % ULTRA.length] : GREEN }
  const ultra = props.effort === 'ultracode'
  const effortText = effortName(props.effort)
  const effort: RenderElement = ultra ? (
    <Box flexDirection="row" flexShrink={0}>
      {[...effortText].map((ch, i) => (
        <Text bold color={ULTRA[(i + st.frame) % ULTRA.length]}>
          {ch}
        </Text>
      ))}
    </Box>
  ) : (
    text({
      t: effortText,
      c: (props.effort !== null && EFFORT_COLOR[props.effort]) || PURPLE,
      bold: props.effort === 'xhigh' || props.effort === 'max',
    })
  )
  const est = (s: string) => (desktop ? Math.ceil(s.length * 0.8) : s.length)

  // Under Ultracode the band gets its dither wave behind everything, drawn
  // first so the readings paint over it. The desktop's shades are
  // translucent, so they sit on a light theme and a dark one alike.
  const backdrop = (rows: number, body: RenderElement): RenderElement => {
    if (!ultra) return body
    const shades = desktop
      ? [PURPLE + '62', PURPLE + '3D', PURPLE + '52']
      : ['#544D80', '#433D66', '#544D80']
    const glyphs = ['·', '░', '▒']
    const lines = Array.from({ length: rows }, (_, r) => {
      const v = shimmer(r, cols, st.frame)
      const out: RenderElement[] = []
      for (let i = 0; i < v.length; ) {
        let j = i
        while (j < v.length && v[j] === v[i] && (desktop ? v[i] === 0 : true)) j++
        if (v[i] === 0) {
          out.push(desktop ? <Box width={j - i} height={1} flexShrink={0} /> : <Text>{' '.repeat(j - i)}</Text>)
        } else if (desktop) {
          j = i + 1
          out.push(
            <Box width={1} height={1} flexShrink={0} overflow="hidden" justifyContent="center">
              <Text color={shades[v[i] - 1]}>{glyphs[v[i] - 1]}</Text>
            </Box>,
          )
        } else {
          out.push(<Text color={shades[v[i] - 1]}>{glyphs[v[i] - 1].repeat(j - i)}</Text>)
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
    const build = (n: number, resets: boolean, head: boolean): Piece[][] => [
      [{ seg: status }, { seg: { t: props.model, bold: true } }, ...(head ? [{ el: effort, w: ultra ? effortText.length + 1 : est(effortText) }] : [])],
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
      { t: icon, c: ultra ? ultraAt(l?.percent ?? 0, 3, st.frame) : tone(l?.percent ?? 0, GREEN) },
      label,
      bar(l?.percent ?? null, n, GREEN),
      l?.percent ?? null,
      l?.isReset ? `${W.reset} · ${W.account}` : l?.resetsAt != null ? `${W.resetsIn(fmtLeft(l.resetsAt - now, false, W.now))} · ${W.account}` : l ? W.account : W.noReading,
    )
  const stateWord: Seg = props.working
    ? { t: W.working, c: ORANGE }
    : alert
      ? { t: W.alert, c: RED }
      : { t: W.ready, c: ultra ? ULTRA[Math.floor(st.frame / 2) % ULTRA.length] : GREEN }

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
        { t: '■', c: ultra ? ultraAt(ctxP ?? 0, 0, st.frame) : tone(ctxP ?? 0, PURPLE) },
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
