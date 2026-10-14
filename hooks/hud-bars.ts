// The HUD's bar styles, after claude-deck's (`/deck style`): each draws a gauge
// `n` cells long as a list of cells. Pure, no `$`: the HUD's drawing, the
// Remote Control row and the style picker all draw from here.

import type { HudStyle } from '../types'

/** One cell of a bar: its glyph, colour, and background (solid's fill). */
export type Cell = { t: string; c?: string; bg?: string; dim?: boolean }

export const STYLES: readonly HudStyle[] = ['pixel', 'segments', 'line', 'solid', 'dots', 'spark']

export const STYLE_NAMES: Record<HudStyle, string> = {
  pixel: 'Pixel',
  segments: 'Segments',
  line: 'Line',
  solid: 'Solid',
  dots: 'Dots',
  spark: 'Spark',
}

// What each looks like, for /hud style and the picker, per language.
export const STYLE_HINTS: Record<'en' | 'pt-BR', Record<HudStyle, string>> = {
  en: {
    pixel: 'solid blocks, a dithered edge, dots after',
    segments: 'rounded blocks',
    line: 'a thin line with a pulsing head',
    solid: 'a filled bar with a light sweep',
    dots: 'a dot per step',
    spark: 'a meter that rises as it fills',
  },
  'pt-BR': {
    pixel: 'blocos cheios, borda pontilhada, pontos depois',
    segments: 'blocos arredondados',
    line: 'linha fina com a ponta pulsando',
    solid: 'barra preenchida com um brilho que passa',
    dots: 'um ponto por passo',
    spark: 'medidor que sobe conforme enche',
  },
}

export const asStyle = (v: unknown): HudStyle | null =>
  typeof v === 'string' && (STYLES as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as HudStyle) : null

// The empty part of solid's track: a grey that reads on dark and light alike.
const TRACK_BG = '#80808040'
const SHINE = '#F2F0EA'
const RAMP = '▁▂▃▄▅▆▇█'

const filledOf = (p: number | null, n: number) => Math.min(n, Math.max(0, Math.round(((p ?? 0) / 100) * n)))

/**
 * A gauge at `p` percent, `n` cells long. `colorAt(i)` is the colour of the
 * filled cell `i` (a tone, or a theme's flowing palette); `frame` moves the
 * heads and sweeps while `live` (Claude working, or a preview).
 */
export function barCells(style: HudStyle, p: number | null, n: number, colorAt: (i: number) => string, frame: number, live: boolean): Cell[] {
  const filled = filledOf(p, n)
  const blink = live && frame % 4 < 2
  const out: Cell[] = []
  switch (style) {
    case 'segments':
      for (let i = 0; i < n; i++) {
        const head = live && filled < n && i === filled - 1
        out.push(i < filled ? { t: '▰', c: head && blink ? SHINE : colorAt(i) } : { t: '▱', dim: true })
      }
      return out
    case 'line':
      for (let i = 0; i < n; i++) {
        if (i < filled) out.push({ t: '━', c: colorAt(i) })
        else if (i === filled && filled > 0) out.push({ t: '╸', c: blink ? SHINE : colorAt(i - 1) })
        else out.push({ t: '─', dim: true })
      }
      return out
    case 'solid': {
      // A light sweeps along the fill while live.
      const sweep = live ? ((frame * 2) % (n + 8)) - 4 : -99
      for (let i = 0; i < n; i++) {
        out.push(i < filled ? { t: ' ', bg: Math.abs(i - sweep) < 1 ? SHINE : colorAt(i) } : { t: ' ', bg: TRACK_BG })
      }
      return out
    }
    case 'dots': {
      // A dot every other cell; a half dot where the fill ends partway.
      const count = Math.ceil(n / 2)
      const v = ((p ?? 0) / 100) * count
      for (let i = 0; i < n; i++) {
        if (i % 2 === 1) {
          out.push({ t: ' ' })
          continue
        }
        const k = i / 2
        const head = live && k === Math.floor(v) && v < count
        out.push(
          v - k >= 1
            ? { t: '●', c: colorAt(i) }
            : v - k > 0.35
              ? { t: '◐', c: colorAt(i) }
              : head
                ? { t: blink ? '◉' : '○', c: colorAt(i) }
                : { t: '○', dim: true },
        )
      }
      return out
    }
    case 'spark':
      // Each filled cell a step taller than the last, as a level meter; the
      // lowest filled step stands above the empty ▁.
      for (let i = 0; i < n; i++) {
        const level = Math.min(RAMP.length - 1, 1 + Math.floor((i / Math.max(1, n - 1)) * (RAMP.length - 1)))
        const head = live && i === filled - 1 && filled < n
        out.push(i < filled ? { t: RAMP[level] ?? '█', c: head && blink ? SHINE : colorAt(i) } : { t: '▁', dim: true })
      }
      return out
    default: {
      // Pixel: solid up to the fill, its edge dithered (two steps once the
      // fill is long enough, one on a short one), dots after.
      const fade = filled < n ? (filled >= 4 ? 2 : filled >= 2 ? 1 : 0) : 0
      for (let i = 0; i < n; i++) {
        if (i >= filled) out.push({ t: '·', dim: true })
        else out.push({ t: fade >= 1 && i === filled - 1 ? '▒' : fade === 2 && i === filled - 2 ? '▓' : '█', c: colorAt(i) })
      }
      return out
    }
  }
}

/** Neighbouring cells that look the same, joined: one Text each. */
export function mergeCells(cells: Cell[]): Cell[] {
  const out: Cell[] = []
  for (const c of cells) {
    const last = out[out.length - 1]
    if (last && last.c === c.c && last.bg === c.bg && last.dim === c.dim) last.t += c.t
    else out.push({ ...c })
  }
  return out
}
