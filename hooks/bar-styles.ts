// The bar styles (/crabhud style; credits in THIRD_PARTY_NOTICES.md), for every
// bar crabhud draws: the progress bar, the HUD's gauges and the agents panel.
// `barSvg` draws one as SVG (the desktop and the remote surfaces), `barCells`
// as text cells (the terminal). Pure, no `$`.

import type { HudStyle } from '../types'

export type BarStyle = HudStyle

/** One cell of a text bar: its glyph, colour, and background (solid's fill). */
export type Cell = { t: string; c?: string; bg?: string; dim?: boolean }

export const STYLES: readonly BarStyle[] = ['pixel', 'segments', 'line', 'solid', 'dots', 'spark', 'classic', 'wave', 'stripes', 'neon', 'glass', 'stairs']

export const STYLE_NAMES: Record<BarStyle, string> = {
  pixel: 'Pixel',
  segments: 'Segments',
  line: 'Line',
  solid: 'Solid',
  dots: 'Dots',
  spark: 'Spark',
  classic: 'Classic',
  wave: 'Wave',
  stripes: 'Stripes',
  neon: 'Neon',
  glass: 'Glass',
  stairs: 'Stairs',
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
    classic: 'solid blocks: █ ▓ ▒ then dots',
    wave: 'liquid in a tube, its surface rippling',
    stripes: 'diagonal stripes that roll along',
    neon: 'a glowing tube, the % on a dark tag',
    glass: 'a glossy bar with a reflection',
    stairs: 'blocks that climb in steps',
  },
  'pt-BR': {
    pixel: 'régua arredondada, pontinhos que brilham, a % numa etiqueta',
    segments: 'um bloco por etapa',
    line: 'linha fina com a ponta brilhando',
    solid: 'barra cheia com um brilho que passa',
    dots: 'um ponto por etapa',
    spark: 'medidor que sobe conforme enche',
    classic: 'blocos cheios: █ ▓ ▒ e pontos depois',
    wave: 'líquido num tubo, a superfície ondulando',
    stripes: 'listras diagonais que andam',
    neon: 'tubo que brilha, a % numa etiqueta escura',
    glass: 'barra brilhante com reflexo',
    stairs: 'blocos que sobem em degraus',
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
export const BAR_CSS = `.bk{fill:#f7f6f2}.bkb{stroke:#d9d7d0}.be{fill:#d6d4cd}.bes{stroke:#c9c7c0}.btk{fill:#c4c2bb}.bgl{stroke:rgba(0,0,0,.15)}.bgh{fill:#fff;opacity:0}.bnc{opacity:.3}
@media (prefers-color-scheme: dark){.bk{fill:#2c2c2c}.bkb{stroke:none}.be{fill:#454542}.bes{stroke:#5a5a56}.btk{fill:#5a5a5a}.bgl{stroke:rgba(255,255,255,.19)}.bgh{opacity:.07}.bnc{opacity:.75}}
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
  /** The leftmost the tag may start (0-1) at a percent: the progress bar keeps
   *  it on the group in progress, off the stretch of the one before. */
  tagFloor?: (p: number) => number
}

/** How long the tag takes to glide to its new place. */
export const GLIDE_MS = 450

/** One bar, as an SVG group at (x, y); its classes come from BAR_CSS. */
export function barSvg(b: BarSvgInput): string {
  const { style, w, h, uid } = b
  const p = Math.max(0, Math.min(100, b.p))
  const fillW = Math.round((w * p) / 100)
  // The fill's own end is round too (a pill as wide as the fill), so no square corner
  // peeks out past the tag or the track's curve.
  const pill = (y: number, ph: number, inner: string, k = '') =>
    `<defs><clipPath id="p${uid}${k}"><rect y="${y}" width="${fillW}" height="${ph}" rx="${ph / 2}"/></clipPath></defs><g clip-path="url(#p${uid}${k})">${inner}</g>`
  // The fill as solid runs of its colours, `ph` tall from `y`.
  const fillRuns = (y = 0, ph = h, extra = '') => runs(fillW, b.colorAt, w).map(r => `<rect x="${r.x}" y="${y}" width="${r.w}" height="${ph}" fill="${r.c}"${extra}/>`).join('')
  const head = b.head ?? b.colorAt(Math.max(0, p / 100 - 0.001))
  const live = b.live && p < 100
  const pulse = live ? ' class="bpu"' : ''
  const rounded = style !== 'classic' && style !== 'stairs'
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
      out.push(pill(ly, lh, runs(fillW, b.colorAt, w).map(r => `<rect x="${r.x}" y="${ly}" width="${r.w}" height="${lh}" fill="${r.c}"/>`).join('')))
      if (fillW > 0 && !b.label) {
        const r = Math.max(1.6, Math.min(h / 2 - 0.5, lh * 1.4))
        const cx = Math.min(w - r, Math.max(r, fillW))
        out.push(`<g${pulse}><circle cx="${cx}" cy="${h / 2}" r="${r1(r * 1.9)}" fill="${head}" opacity=".25"/><circle cx="${cx}" cy="${h / 2}" r="${r1(r)}" fill="${head}"/></g>`)
      }
      ticks = stepTicks(b.steps, w, fillW + 6, h)
      break
    }
    case 'solid': {
      out.push(pill(0, h, fillRuns()))
      if (live && fillW > 8) out.push(sweepSvg(fillW, h, uid, 0.55))
      ticks = stepTicks(b.steps, w, fillW + 4, h)
      break
    }
    case 'wave': {
      // Liquid in a tube: the fill, its top a wave of the track's colour that rolls
      // while live; a paler wave behind gives it depth. Full, it lies flat.
      const A = Math.max(0.6, h * 0.1)
      const lambda = Math.max(10, Math.round(h * 1.6))
      const top = h * 0.3
      const surface = (shift: number) => {
        const x0 = -lambda * 2 + shift
        const halves = Math.ceil((fillW + lambda * 4) / (lambda / 2))
        return `M${r1(x0)} -1L${r1(x0)} ${r1(top)}q${r1(lambda / 4)} ${r1(-A * 2)} ${r1(lambda / 2)} 0${` t${r1(lambda / 2)} 0`.repeat(halves - 1)}L${r1(x0 + (halves * lambda) / 2)} -1Z`
      }
      const roll = (k: string, dur: number, back: boolean) =>
        live ? motion(`wv${k}${uid}`, `from{transform:translateX(${back ? 0 : -lambda}px)}to{transform:translateX(${back ? -lambda : 0}px)}`, `${dur}s linear infinite`) : ''
      out.push(
        pill(
          0,
          h,
          fillRuns() +
            (p < 100
              ? `${roll('b', 2.6, true)}<g${live ? ` class="wvb${uid}"` : ''}><path class="bk" opacity=".55" d="${surface(lambda / 2)}" transform="translate(0 ${r1(A * 0.8)})"/></g>${roll('f', 1.7, false)}<g${live ? ` class="wvf${uid}"` : ''}><path class="bk" d="${surface(0)}"/></g>`
              : ''),
        ),
      )
      ticks = stepTicks(b.steps, w, fillW + 4, h)
      break
    }
    case 'stripes': {
      // A barber pole: the fill under light diagonal stripes that roll along while live.
      const P = h >= 12 ? 8 : 6
      const hatch = `<defs><pattern id="s${uid}" width="${P}" height="${P}" patternUnits="userSpaceOnUse"><path d="M0 ${P}L${P} 0M${-P / 4} ${P / 4}L${P / 4} ${-P / 4}M${(P * 3) / 4} ${(P * 5) / 4}L${(P * 5) / 4} ${(P * 3) / 4}" stroke="#fff" stroke-width="${r1(P * 0.3)}" stroke-opacity=".3"/></pattern></defs>`
      const roll = live ? motion(`st${uid}`, `from{transform:translateX(${-P}px)}to{transform:translateX(0)}`, '0.9s linear infinite') : ''
      out.push(hatch + pill(0, h, `${fillRuns()}${roll}<rect${live ? ` class="st${uid}"` : ''} x="${-P}" width="${fillW + P * 2}" height="${h}" fill="url(#s${uid})"/>`))
      ticks = stepTicks(b.steps, w, fillW + 4, h)
      break
    }
    case 'neon': {
      // A glowing tube: a wide faint glow, the coloured tube and a hot white core.
      const lh = Math.max(1.5, Math.round(h * 0.2))
      const ly = (h - lh) / 2
      const gh = Math.min(h, lh * 3.4)
      const gy = (h - gh) / 2
      out.push(`<rect class="be" opacity=".6" y="${r1(ly + lh / 4)}" width="${w}" height="${r1(lh / 2)}" rx="${r1(lh / 4)}"/>`)
      out.push(pill(gy, gh, fillRuns(gy, gh, ' opacity=".28"'), 'g'))
      out.push(pill(ly, lh, fillRuns(ly, lh) + `<rect y="${r1(h / 2 - Math.max(0.4, lh * 0.2))}" width="${fillW}" height="${r1(Math.max(0.8, lh * 0.4))}" class="bnc" fill="#fff"/>`))
      if (fillW > 0 && !b.label) {
        const r = Math.max(1.6, Math.min(h / 2 - 0.5, lh * 1.3))
        const cx = Math.min(w - r, Math.max(r, fillW))
        out.push(`<g${pulse}><circle cx="${cx}" cy="${h / 2}" r="${r1(Math.min(h / 2, r * 2.2))}" fill="${head}" opacity=".3"/><circle cx="${cx}" cy="${h / 2}" r="${r1(r)}" fill="${head}"/><circle cx="${cx}" cy="${h / 2}" r="${r1(r * 0.45)}" fill="#fff"/></g>`)
      }
      ticks = stepTicks(b.steps, w, fillW + 6, h)
      break
    }
    case 'glass': {
      // A glossy bar: the fill with a reflection on its upper half and a soft shade
      // below; the track has a rim and a faint gloss of its own.
      out.push(`<rect class="bgh" x="1" y="${r1(h * 0.12)}" width="${w - 2}" height="${r1(h * 0.34)}" rx="${r1(h * 0.17)}"/>`)
      out.push(
        pill(
          0,
          h,
          `${fillRuns()}<rect y="${r1(h * 0.62)}" width="${fillW}" height="${r1(h * 0.38)}" fill="#000" opacity=".1"/><rect x="1.5" y="${r1(h * 0.12)}" width="${Math.max(0, fillW - 3)}" height="${r1(h * 0.32)}" rx="${r1(h * 0.16)}" fill="#fff" opacity=".42"/>`,
        ),
      )
      if (live && fillW > 8) out.push(sweepSvg(fillW, h, uid, 0.35))
      ticks = stepTicks(b.steps, w, fillW + 4, h)
      break
    }
    case 'stairs': {
      // Steps that climb: each block a level higher along the bar (three levels),
      // the fill colouring them as it goes; what is still to climb waits pale.
      const bw = Math.max(3, Math.round(h * 0.7))
      const gap = h >= 10 ? 1.5 : 1
      const n = Math.max(3, Math.floor((w + gap) / (bw + gap)))
      const pitch = (w + gap) / n
      const filled = Math.round((p / 100) * n)
      const LEVELS = [0.42, 0.7, 1]
      for (let i = 0; i < n; i++) {
        const bh = r1(h * (LEVELS[Math.min(2, Math.floor((i / n) * 3))] ?? 1))
        const x = r1(i * pitch)
        const cw = r1(pitch - gap)
        out.push(
          i < filled
            ? `<rect${i === filled - 1 && live ? pulse : ''} x="${x}" y="${r1(h - bh)}" width="${cw}" height="${bh}" rx="1" fill="${b.colorAt((i + 0.5) / n)}"/>`
            : `<rect class="be" x="${x}" y="${r1(h - bh)}" width="${cw}" height="${bh}" rx="1"/>`,
        )
      }
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
          // Full, every bar stands at its tallest: done reads as full.
          const bh = r1((h - pad * 2) * (filled >= n ? 1 : 0.25 + 0.75 * ((i + 1) / filled)))
          out.push(`<rect${i === filled - 1 && live ? pulse : ''} x="${x}" y="${r1(h - pad - bh)}" width="${bw}" height="${bh}" rx="${Math.min(1, bw / 2)}" fill="${b.colorAt((i + 0.5) / n)}"/>`)
        } else out.push(`<rect class="be" x="${x}" y="${r1(h - pad - 1.5)}" width="${bw}" height="1.5" rx=".75"/>`)
      }
      break
    }
    case 'classic': {
      // Blocks: solid up to the fill, a dithered edge (▓ ▒), a dot per empty cell.
      const cw = Math.max(3, Math.round(h * 0.55))
      const n = Math.max(4, Math.floor(w / cw))
      const filled = Math.round((p / 100) * n)
      const fade = filled < n ? (filled >= 4 ? 2 : filled >= 2 ? 1 : 0) : 0
      for (let i = 0; i < n; i++) {
        const x = i * cw
        if (i >= filled) out.push(`<rect class="be" x="${r1(x + cw / 2 - 0.75)}" y="${r1(h / 2 - 0.75)}" width="1.5" height="1.5"/>`)
        else {
          const op = fade >= 1 && i === filled - 1 ? 0.4 : fade === 2 && i === filled - 2 ? 0.7 : 1
          out.push(`<rect${op < 1 && live && i === filled - 1 ? pulse : ''} x="${x}" width="${cw - 0.5}" height="${h}" rx="1" fill="${b.colorAt((i + 0.5) / n)}" opacity="${op}"/>`)
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
      const px: string[] = []
      for (let c = 0; c < cols; c++) {
        const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
        const color = b.colorAt((c * C) / w)
        for (let r = 0; r < rows; r++)
          if (noise(c + b.x, r) < density)
            px.push(`<rect class="bt${Math.floor(noise(r, c + b.x) * 4)}" x="${r1(c * C + 0.6)}" y="${r1(r * C + oy + 0.4)}" width="${D}" height="${D}" fill="${color}"/>`)
      }
      out.push(pill(0, h, px.join('')))
      if (fillW > 0 && !b.label) out.push(`<rect x="${Math.max(0, fillW - 3)}" width="3" height="${h}" rx="1.5" fill="${head}"/>`)
      ticks = stepTicks(b.steps, w, fillW + 4, h)
    }
  }

  const gaps = style === 'segments' || style === 'dots' || style === 'stairs' || style === 'neon' ? [] : (b.gaps ?? []).map(f => `<rect class="bk" x="${Math.round(w * f) - 1}" width="2.5" height="${h}"/>`)
  let tag = ''
  if (b.label) {
    const size = h >= 14 ? 11 : 10
    const tw = Math.min(w, Math.round(16 + textWidth(b.label, size) * 1.08))
    // The tag ends where the fill does, but never starts left of its floor.
    const tagX = (pct: number, fill: number) => Math.max(0, Math.min(w - tw, Math.max(fill - tw, Math.round(w * (b.tagFloor?.(pct) ?? 0)))))
    const tx = tagX(p, fillW)
    const fromP = b.from ? Math.max(0, Math.min(100, b.from.p)) : p
    const fromTx = b.from ? tagX(fromP, Math.round((w * fromP) / 100)) : tx
    const glide = b.from && b.from.age >= 0 && b.from.age < GLIDE_MS && Math.abs(fromTx - tx) > 0.5
    // Classic's tag is square like its blocks; neon's is dark with a glowing rim.
    const neon = style === 'neon'
    const rx = style === 'classic' || style === 'stairs' ? 2 : h / 2
    const box = neon
      ? `<rect x="${tx + 0.5}" y=".5" width="${tw - 1}" height="${h - 1}" rx="${(h - 1) / 2}" fill="#1F1E1D" stroke="${head}" stroke-width="1"/>`
      : `<rect x="${tx}" width="${tw}" height="${h}" rx="${rx}" fill="${head}"/>`
    tag = `${box}<text x="${tx + tw / 2}" y="${r1(h / 2 + size * 0.36)}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="600" fill="${neon ? head : '#fff'}" font-variant-numeric="tabular-nums">${b.label.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
    // The tag glides from where it was; a negative delay by the step's age keeps a redraw mid-glide from starting it over.
    if (glide && b.from)
      tag = `<style>@keyframes bg${uid}{from{transform:translateX(${fromTx - tx}px)}}.bg${uid}{animation:bg${uid} ${GLIDE_MS}ms cubic-bezier(.22,1,.36,1) both;animation-delay:-${Math.round(b.from.age)}ms}@media (prefers-reduced-motion: reduce){.bg${uid}{animation:none}}</style><g class="bg${uid}">${tag}</g>`
  }
  // Pixel and solid sit in the rounded track; the others draw their own empties.
  const tracked = style === 'pixel' || style === 'solid' || style === 'wave' || style === 'stripes' || style === 'glass'
  const rim = style === 'glass' ? 'bgl' : 'bkb'
  const clip = rounded ? `<defs><clipPath id="c${uid}"><rect width="${w}" height="${h}" rx="${h / 2}"/></clipPath></defs>` : ''
  return `<g transform="translate(${b.x},${b.y})">${clip}${tracked ? `<rect class="bk" width="${w}" height="${h}" rx="${h / 2}"/>` : ''}<g${rounded ? ` clip-path="url(#c${uid})"` : ''}>${out.join('')}${ticks}${gaps.join('')}</g>${tracked ? `<rect class="${rim}" x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="${(h - 1) / 2}" fill="none"/>` : ''}${tag}</g>`
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

// An animation of its own for one element, still when motion is reduced (a rule
// here, after BAR_CSS, so the reduced-motion one must come here too).
function motion(cls: string, frames: string, how: string): string {
  return `<style>.${cls}{animation:${cls} ${how}}@keyframes ${cls}{${frames}}@media (prefers-reduced-motion: reduce){.${cls}{animation:none}}</style>`
}

// A light sweeping along the fill while Claude works (solid, glass).
function sweepSvg(fillW: number, h: number, uid: string, strength: number): string {
  const sweep = Math.round(Math.max(16, Math.min(60, fillW * 0.35)))
  return `<defs><linearGradient id="g${uid}"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${strength}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="f${uid}"><rect width="${fillW}" height="${h}"/></clipPath></defs>
${motion(`sw${uid}`, `from{transform:translateX(${-sweep}px)}to{transform:translateX(${fillW}px)}`, '2.4s linear infinite')}
<g clip-path="url(#f${uid})"><rect class="bsw sw${uid}" width="${sweep}" height="${h}" fill="url(#g${uid})"/></g>`
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

const WAVE = ['≈', '≋', '≈', '~']
const STAIRS = ['▃', '▅', '▇']

// A colour mixed toward white by `k` (0-1); colours that are not #rrggbb stay as they are.
const lighten = (c: string, k: number): string => {
  const m = /^#([0-9a-f]{6})$/i.exec(c)
  if (!m?.[1]) return c
  const n = parseInt(m[1], 16)
  const mix = (v: number) => Math.round(v + (255 - v) * k).toString(16).padStart(2, '0')
  return `#${mix(n >> 16)}${mix((n >> 8) & 255)}${mix(n & 255)}`
}

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
        const level = filled >= n ? RAMP.length - 1 : Math.min(RAMP.length - 1, 1 + Math.floor(((i + 1) / Math.max(1, filled)) * (RAMP.length - 2)))
        const head = live && i === filled - 1 && filled < n
        out.push(i < filled ? { t: RAMP[level] ?? '█', c: head && blink ? SHINE : colorAt(i) } : { t: '▁', dim: true })
      }
      return out
    case 'wave':
      // Liquid: ripples that roll along the fill while live.
      for (let i = 0; i < n; i++) out.push(i < filled ? { t: WAVE[(i + (live ? frame : 0)) % WAVE.length] ?? '≈', c: colorAt(i) } : { t: '·', dim: true })
      return out
    case 'stripes':
      // A barber pole: every third cell lit, the light rolling along while live.
      for (let i = 0; i < n; i++) out.push(i < filled ? { t: '▞', c: (i - (live ? frame : 0)) % 3 === 0 ? SHINE : colorAt(i) } : { t: '░', dim: true })
      return out
    case 'neon':
      // A glowing tube, its head a bright dot that blinks while live.
      for (let i = 0; i < n; i++) {
        if (i < filled) out.push({ t: '━', c: colorAt(i) })
        else if (i === filled && filled > 0) out.push({ t: '●', c: blink ? SHINE : colorAt(i - 1) })
        else out.push({ t: '┄', dim: true })
      }
      return out
    case 'glass': {
      // A glossy bar: each cell's upper half lighter, as a reflection; a light sweeps while live.
      const sweep = live ? ((frame * 2) % (n + 8)) - 4 : -99
      for (let i = 0; i < n; i++) {
        const c = colorAt(i)
        out.push(i < filled ? { t: '▄', c: Math.abs(i - sweep) < 1 ? SHINE : c, bg: lighten(c, 0.4) } : { t: ' ', bg: '#80808040' })
      }
      return out
    }
    case 'stairs':
      // Steps: each cell a level higher along the bar (three levels); the fill colours them.
      for (let i = 0; i < n; i++) {
        const t = STAIRS[Math.min(2, Math.floor((i / n) * 3))] ?? '▇'
        const head = live && i === filled - 1 && filled < n
        out.push(i < filled ? { t, c: head && blink ? SHINE : colorAt(i) } : { t, dim: true })
      }
      return out
    case 'classic': {
      // Blocks: solid up to the fill, its edge dithered (two steps once
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
