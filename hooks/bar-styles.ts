// The bar styles (/crabhud style), after claude-deck's (`/deck style`), for every
// bar crabhud draws: the progress bar, the HUD's gauges and the agents panel.
// `barSvg` draws one as SVG (the desktop and the remote surfaces), `barCells`
// as text cells (the terminal). Pure, no `$`.

import type { HudStyle } from '../types'

export type BarStyle = HudStyle

/** One cell of a text bar: its glyph, colour, and background (solid's fill). */
export type Cell = { t: string; c?: string; bg?: string; dim?: boolean }

export const STYLES: readonly BarStyle[] = ['pixel', 'segments', 'line', 'solid', 'dots', 'spark', 'classic']

export const STYLE_NAMES: Record<BarStyle, string> = {
  pixel: 'Pixel',
  segments: 'Segments',
  line: 'Line',
  solid: 'Solid',
  dots: 'Dots',
  spark: 'Spark',
  classic: 'Classic',
}

// What each looks like, for /crabhud style and the picker, per language.
export const STYLE_HINTS: Record<'en' | 'pt-BR', Record<BarStyle, string>> = {
  en: {
    pixel: 'a rounded track, twinkling pixels, the % on a tag',
    segments: 'a block per step',
    line: 'a thin line with a glowing head',
    solid: 'a filled bar with a light sweep',
    dots: 'a dot per step',
    spark: 'a meter that rises as it fills',
    classic: "pixel-hud's blocks: █ ▓ ▒ then dots",
  },
  'pt-BR': {
    pixel: 'régua arredondada, pontinhos que brilham, a % numa etiqueta',
    segments: 'um bloco por etapa',
    line: 'linha fina com a ponta brilhando',
    solid: 'barra cheia com um brilho que passa',
    dots: 'um ponto por etapa',
    spark: 'medidor que sobe conforme enche',
    classic: 'os blocos do pixel-hud: █ ▓ ▒ e pontos depois',
  },
}

export const asStyle = (v: unknown): BarStyle | null =>
  typeof v === 'string' && (STYLES as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as BarStyle) : null

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
const SHINE = '#F2F0EA'

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}
const charEm = (ch: string): number => (/[\s.,:;'|!il1()[\]/]/.test(ch) ? 0.3 : /[A-Zm%]/.test(ch) ? 0.72 : 0.56)
const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)
const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * The classes the bars use: the track (bk, its border bkb), what is still empty
 * (be, bes), the step marks (btk), the twinkle (bt0-bt3) and a live head's pulse
 * (bpu), prefixed so they keep clear of the panel's own classes. Goes in the drawing's <style> once.
 */
export const BAR_CSS = `.bk{fill:#f7f6f2}.bkb{stroke:#d9d7d0}.be{fill:#d6d4cd}.bes{stroke:#c9c7c0}.btk{fill:#c4c2bb}
@media (prefers-color-scheme: dark){.bk{fill:#2c2c2c}.bkb{stroke:none}.be{fill:#454542}.bes{stroke:#5a5a56}.btk{fill:#5a5a5a}}
.bt0,.bt1,.bt2,.bt3{animation:btw 2.2s ease-in-out infinite}.bt1{animation-duration:2.8s;animation-delay:-.7s}.bt2{animation-duration:1.9s;animation-delay:-1.3s}.bt3{animation-duration:3.3s;animation-delay:-.4s}
@keyframes btw{0%,100%{opacity:1}50%{opacity:.3}}
.bpu{animation:bpu 1.1s ease-in-out infinite}@keyframes bpu{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion: reduce){.bt0,.bt1,.bt2,.bt3,.bpu,.bsw{animation:none}}`

export type BarSvgInput = {
  style: BarStyle
  x: number
  y: number
  w: number
  h: number
  /** Percent filled, 0-100. */
  p: number
  /** The colour of the fill at `f` (0-1 along the bar): a group's, a theme's. */
  colorAt: (f: number) => string
  /** The head's colour (the tag's, the pulse's); defaults to the colour at the fill's end. */
  head?: string
  /** Claude working: heads pulse, solid's light sweeps. */
  live: boolean
  /** Unique within the drawing: names the clip and the sweep. */
  uid: string
  /** Text on a tag at the fill's end (the progress bar's 5/14, the HUD's 31%). */
  label?: string
  /** The steps the bar counts: segments and dots draw one each when they fit. */
  steps?: number
  /** Where one group ends and the next begins (0-1): a gap in the track. */
  gaps?: number[]
  /** The percent before the last step and how long ago it moved (ms): the tag
   *  glides from there, picking up where it was if the drawing is redrawn. */
  from?: { p: number; age: number }
}

/** How long the tag takes to glide to its new place. */
export const GLIDE_MS = 450

/** One bar, as an SVG group at (x, y); its classes come from BAR_CSS. */
export function barSvg(b: BarSvgInput): string {
  const { style, w, h, uid } = b
  const p = Math.max(0, Math.min(100, b.p))
  const fillW = Math.round((w * p) / 100)
  const head = b.head ?? b.colorAt(Math.max(0, p / 100 - 0.001))
  const live = b.live && p < 100
  const pulse = live ? ' class="bpu"' : ''
  const rounded = style !== 'classic'
  const out: string[] = []
  let ticks = ''
  // Segments and dots count the steps when there are few enough to draw.
  const unit = h >= 12 ? 14 : h >= 8 ? 9 : 7
  const fits = (count: number) => count >= 2 && w / count >= (style === 'dots' ? Math.max(5, h * 0.75) : 5)
  const count = b.steps && fits(b.steps) ? b.steps : Math.max(4, Math.min(40, Math.round(w / unit)))

  switch (style) {
    case 'segments': {
      const gap = h >= 10 ? 2 : 1.5
      const sw = (w - gap * (count - 1)) / count
      const filled = Math.round((p / 100) * count)
      const rx = Math.min(2.5, h / 3)
      for (let i = 0; i < count; i++) {
        const x = r1(i * (sw + gap))
        const isHead = i === filled - 1 && live
        out.push(
          i < filled
            ? `<rect${isHead ? pulse : ''} x="${x}" width="${r1(sw)}" height="${h}" rx="${rx}" fill="${b.colorAt((i + 0.5) / count)}"/>`
            : `<rect class="be" x="${x}" width="${r1(sw)}" height="${h}" rx="${rx}"/>`,
        )
      }
      break
    }
    case 'line': {
      const lh = Math.max(2, Math.round(h * 0.24))
      const ly = (h - lh) / 2
      out.push(`<rect class="be" y="${ly}" width="${w}" height="${lh}" rx="${lh / 2}"/>`)
      out.push(...runs(fillW, b.colorAt, w).map(r => `<rect x="${r.x}" y="${ly}" width="${r.w}" height="${lh}" fill="${r.c}"/>`))
      if (fillW > 0 && !b.label) {
        const r = Math.max(1.6, Math.min(h / 2 - 0.5, lh * 1.4))
        const cx = Math.min(w - r, Math.max(r, fillW))
        out.push(`<g${pulse}><circle cx="${cx}" cy="${h / 2}" r="${r1(r * 1.9)}" fill="${head}" opacity=".25"/><circle cx="${cx}" cy="${h / 2}" r="${r1(r)}" fill="${head}"/></g>`)
      }
      ticks = stepTicks(b.steps, w, fillW + 6, h)
      break
    }
    case 'solid': {
      out.push(...runs(fillW, b.colorAt, w).map(r => `<rect x="${r.x}" width="${r.w}" height="${h}" fill="${r.c}"/>`))
      if (live && fillW > 8) {
        const sweep = Math.round(Math.max(16, Math.min(60, fillW * 0.35)))
        out.push(`<defs><linearGradient id="g${uid}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="f${uid}"><rect width="${fillW}" height="${h}"/></clipPath></defs>
<style>.sw${uid}{animation:sw${uid} 2.4s linear infinite}@keyframes sw${uid}{from{transform:translateX(${-sweep}px)}to{transform:translateX(${fillW}px)}}</style>
<g clip-path="url(#f${uid})"><rect class="bsw sw${uid}" width="${sweep}" height="${h}" fill="url(#g${uid})"/></g>`)
      }
      ticks = stepTicks(b.steps, w, fillW + 4, h)
      break
    }
    case 'dots': {
      const pitch = w / count
      const r = r1(Math.max(1.4, Math.min(h / 2 - (h >= 10 ? 2 : 0.6), pitch * 0.34)))
      const v = (p / 100) * count
      const ring = (cx: number) => `<circle class="bes" cx="${cx}" cy="${h / 2}" r="${r1(r - 0.5)}" fill="none" stroke-width="1"/>`
      for (let i = 0; i < count; i++) {
        const cx = r1(pitch * (i + 0.5))
        const c = b.colorAt((i + 0.5) / count)
        if (v - i >= 1) out.push(`<circle cx="${cx}" cy="${h / 2}" r="${r}" fill="${c}"/>`)
        else if (v - i > 0.25) out.push(`${ring(cx)}<path${pulse} d="M${cx} ${h / 2 - r}a${r} ${r} 0 0 0 0 ${2 * r}z" fill="${c}"/>`)
        else if (live && i === Math.floor(v)) out.push(`${ring(cx)}<circle class="bpu" cx="${cx}" cy="${h / 2}" r="${r1(r * 0.55)}" fill="${head}"/>`)
        else out.push(ring(cx))
      }
      break
    }
    case 'spark': {
      const pitch = h >= 12 ? 5 : 4
      const n = Math.max(4, Math.floor(w / pitch))
      const bw = Math.max(1.5, pitch - 1.5)
      const pad = h >= 10 ? 2 : 0.5
      const filled = Math.round((p / 100) * n)
      for (let i = 0; i < n; i++) {
        const x = r1(i * pitch + (w - n * pitch) / 2 + 0.75)
        if (i < filled) {
          // Taller toward the head: the meter rises along what is filled.
          const bh = r1((h - pad * 2) * (0.25 + 0.75 * ((i + 1) / filled)))
          out.push(`<rect${i === filled - 1 && live ? pulse : ''} x="${x}" y="${r1(h - pad - bh)}" width="${bw}" height="${bh}" rx="${Math.min(1, bw / 2)}" fill="${b.colorAt((i + 0.5) / n)}"/>`)
        } else out.push(`<rect class="be" x="${x}" y="${r1(h - pad - 1.5)}" width="${bw}" height="1.5" rx=".75"/>`)
      }
      break
    }
    case 'classic': {
      // pixel-hud's blocks: solid up to the fill, a dithered edge (▓ ▒), a dot per empty cell.
      const cw = Math.max(3, Math.round(h * 0.55))
      const n = Math.max(4, Math.floor(w / cw))
      const filled = Math.round((p / 100) * n)
      const fade = filled < n ? (filled >= 4 ? 2 : filled >= 2 ? 1 : 0) : 0
      for (let i = 0; i < n; i++) {
        const x = i * cw
        if (i >= filled) out.push(`<rect class="be" x="${r1(x + cw / 2 - 0.75)}" y="${r1(h / 2 - 0.75)}" width="1.5" height="1.5"/>`)
        else {
          const op = fade >= 1 && i === filled - 1 ? 0.4 : fade === 2 && i === filled - 2 ? 0.7 : 1
          out.push(`<rect${op < 1 && live && i === filled - 1 ? pulse : ''} x="${x}" width="${cw - 0.5}" height="${h}" fill="${b.colorAt((i + 0.5) / n)}" opacity="${op}"/>`)
        }
      }
      break
    }
    default: {
      // Pixel: a dithered fill, sparse at the start and dense toward the head, twinkling.
      const C = h >= 14 ? 3 : h >= 8 ? 2.5 : 2
      const D = h >= 14 ? 2 : h >= 8 ? 1.6 : 1.4
      const cols = Math.floor(fillW / C)
      const rows = Math.max(1, Math.floor(h / C))
      const oy = (h - rows * C) / 2
      for (let c = 0; c < cols; c++) {
        const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
        const color = b.colorAt((c * C) / w)
        for (let r = 0; r < rows; r++)
          if (noise(c + b.x, r) < density)
            out.push(`<rect class="bt${Math.floor(noise(r, c + b.x) * 4)}" x="${r1(c * C + 0.6)}" y="${r1(r * C + oy + 0.4)}" width="${D}" height="${D}" fill="${color}"/>`)
      }
      if (fillW > 0 && !b.label) out.push(`<rect x="${Math.max(0, fillW - 3)}" width="3" height="${h}" rx="1.5" fill="${head}"/>`)
      ticks = stepTicks(b.steps, w, fillW + 4, h)
    }
  }

  const gaps = style === 'segments' || style === 'dots' ? [] : (b.gaps ?? []).map(f => `<rect class="bk" x="${Math.round(w * f) - 1}" width="2.5" height="${h}"/>`)
  let tag = ''
  if (b.label) {
    const size = h >= 14 ? 11 : 10
    const tw = Math.min(w, Math.round(16 + textWidth(b.label, size) * 1.08))
    const tx = Math.max(0, Math.min(w - tw, fillW - tw))
    const fromTx = b.from ? Math.max(0, Math.min(w - tw, Math.round((w * Math.max(0, Math.min(100, b.from.p))) / 100) - tw)) : tx
    const glide = b.from && b.from.age >= 0 && b.from.age < GLIDE_MS && Math.abs(fromTx - tx) > 0.5
    tag = `<rect x="${tx}" width="${tw}" height="${h}" rx="${h / 2}" fill="${head}"/><text x="${tx + tw / 2}" y="${r1(h / 2 + size * 0.36)}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="600" fill="#fff" font-variant-numeric="tabular-nums">${b.label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
    // The tag glides from where it was; a negative delay by the step's age keeps a redraw mid-glide from starting it over.
    if (glide && b.from)
      tag = `<style>@keyframes bg${uid}{from{transform:translateX(${fromTx - tx}px)}}.bg${uid}{animation:bg${uid} ${GLIDE_MS}ms cubic-bezier(.22,1,.36,1) both;animation-delay:-${Math.round(b.from.age)}ms}@media (prefers-reduced-motion: reduce){.bg${uid}{animation:none}}</style><g class="bg${uid}">${tag}</g>`
  }
  // Pixel and solid sit in the rounded track; the others draw their own empties.
  const tracked = style === 'pixel' || style === 'solid'
  const clip = rounded ? `<defs><clipPath id="c${uid}"><rect width="${w}" height="${h}" rx="${h / 2}"/></clipPath></defs>` : ''
  return `<g transform="translate(${b.x},${b.y})">${clip}${tracked ? `<rect class="bk" width="${w}" height="${h}" rx="${h / 2}"/>` : ''}<g${rounded ? ` clip-path="url(#c${uid})"` : ''}>${out.join('')}${ticks}${gaps.join('')}</g>${tracked ? `<rect class="bkb" x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${(h - 1) / 2}" fill="none"/>` : ''}${tag}</g>`
}

// The fill as runs of one colour, 2px at a time, so a group's or a theme's colours follow along.
function runs(fillW: number, colorAt: (f: number) => string, w: number): { x: number; w: number; c: string }[] {
  const out: { x: number; w: number; c: string }[] = []
  for (let x = 0; x < fillW; x += 2) {
    const c = colorAt(x / w)
    const last = out[out.length - 1]
    if (last && last.c === c) last.w = Math.min(fillW, x + 2) - last.x
    else out.push({ x, w: Math.min(2, fillW - x), c })
  }
  return out
}

// A small mark per step still to come.
function stepTicks(steps: number | undefined, w: number, from: number, h: number): string {
  if (!steps || steps < 2 || w / steps < 6 || h < 10) return ''
  const out: string[] = []
  for (let i = 1; i < steps; i++) {
    const x = Math.round((w * i) / steps)
    if (x > from) out.push(`<rect x="${x}" y="${h / 2 - 4}" width="1.5" height="8" rx=".75"/>`)
  }
  return `<g class="btk">${out.join('')}</g>`
}

// ---- the terminal: the same bars in text

const RAMP = '▁▂▃▄▅▆▇█'
// Pixel in text: braille dots, low at the start and full toward the head; an empty cell is the floor (⣀).
const BRAILLE = ['⣀', '⣄', '⣤', '⣦', '⣶', '⣷', '⣿']

const filledOf = (p: number | null, n: number) => Math.min(n, Math.max(0, Math.round(((p ?? 0) / 100) * n)))

/**
 * A text bar at `p` percent, `n` cells long. `colorAt(i)` is the colour of
 * the filled cell `i`; `frame` moves the heads and sweeps while `live`.
 */
export function barCells(style: BarStyle, p: number | null, n: number, colorAt: (i: number) => string, frame: number, live: boolean): Cell[] {
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
      for (let i = 0; i < n; i++) out.push(i < filled ? { t: ' ', bg: Math.abs(i - sweep) < 1 ? SHINE : colorAt(i) } : { t: ' ', bg: '#80808040' })
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
        out.push(v - k >= 1 ? { t: '●', c: colorAt(i) } : v - k > 0.35 ? { t: '◐', c: colorAt(i) } : head ? { t: blink ? '◉' : '○', c: colorAt(i) } : { t: '○', dim: true })
      }
      return out
    }
    case 'spark':
      // Each filled cell a step taller than the last, as a level meter that peaks at the head.
      for (let i = 0; i < n; i++) {
        const level = Math.min(RAMP.length - 1, 1 + Math.floor(((i + 1) / Math.max(1, filled)) * (RAMP.length - 2)))
        const head = live && i === filled - 1 && filled < n
        out.push(i < filled ? { t: RAMP[level] ?? '█', c: head && blink ? SHINE : colorAt(i) } : { t: '▁', dim: true })
      }
      return out
    case 'classic': {
      // pixel-hud's: solid up to the fill, its edge dithered (two steps once
      // the fill is long enough, one on a short one), dots after.
      const fade = filled < n ? (filled >= 4 ? 2 : filled >= 2 ? 1 : 0) : 0
      for (let i = 0; i < n; i++) {
        if (i >= filled) out.push({ t: '·', dim: true })
        else out.push({ t: fade >= 1 && i === filled - 1 ? '▒' : fade === 2 && i === filled - 2 ? '▓' : '█', c: colorAt(i) })
      }
      return out
    }
    default:
      // Pixel: braille dots growing denser toward the head, which twinkles while live.
      for (let i = 0; i < n; i++) {
        if (i >= filled) {
          out.push({ t: '⣀', dim: true })
          continue
        }
        const d = Math.min(BRAILLE.length - 1, Math.floor((0.25 + 0.75 * Math.pow((i + 1) / Math.max(1, filled), 1.2)) * (BRAILLE.length - 1) + noise(i, 3) * 1.5))
        const head = live && i === filled - 1 && filled < n
        out.push({ t: BRAILLE[d] ?? '⣿', c: head && blink ? SHINE : colorAt(i) })
      }
      return out
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
