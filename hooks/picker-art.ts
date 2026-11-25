// The /crabhud style picker's own drawings (3.3.1): the light "Follows the bar"
// card and the Blur tab's windows. Pure, no `$`.
//
// The pane in the app stays blank past some size (345,000 characters did, 164,000
// drew), so each drawing here embeds a background once at most and points at it
// with <use> wherever it shows again.

import type { HudStyle } from '../types'
import { BAR_CSS, barSvg } from './bar-styles'
import { BLUR, GLASS_OPACITY, type Blur } from './backdrops'
import { PALETTES, type PaletteId } from './palettes'
import { W, H } from './scenes'
import { tones } from './theme'

type Tone = ReturnType<typeof tones>['dark']

// The palette's tones as classes: dark first, light under the app's light mode.
const toneCss = (id: PaletteId): string => {
  const t = tones(id)
  const one = (m: Tone) =>
    `.k0{fill:${m['surface-0']}}.k1{fill:${m['surface-1']}}.k2{fill:${m['surface-2']}}.k3{fill:${m['surface-3']}}.kt{fill:${m['text-primary']}}.ks{fill:${m['text-secondary']}}.km{fill:${m['text-muted']}}.kl{stroke:${m['surface-3']}}.kr{stroke:${m['surface-0']}}`
  return `${one(t.dark)}@media (prefers-color-scheme: light){${one(t.light)}}`
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** "Follows the bar": the page, the bar style's own small bar and a loop sign. */
export const autoThumb = (style: HudStyle, id: PaletteId, w: number, h: number): string => {
  const p = PALETTES[id]
  const bw = w - 32
  const bar = barSvg({ style, x: 0, y: 0, w: bw, h: 8, p: 64, colorAt: () => p.accent, head: p.accent, live: true, uid: 'pkauto' })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><style>${toneCss(id)}${BAR_CSS}</style><rect class="k0" width="${w}" height="${h}" rx="8"/><g transform="translate(16 ${h / 2 + 4})">${bar}</g><path d="M${w / 2 - 7} ${h / 2 - 12}a7 7 0 1 1 2 5" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round"/><path d="M${w / 2 - 9} ${h / 2 - 8}l2 3.4l3.2-2.4" fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
}

// A background's drawing as a piece of a bigger one: its outer <svg> tag turned
// into a W×H viewport with an id, so <use> can show it again and again.
const embed = (source: string | null, id: string): string => {
  if (!source) return ''
  const open = source.match(/^<svg\b[^>]*>/)
  if (!open) return ''
  const box = open[0].match(/viewBox="([^"]+)"/)?.[1] ?? `0 0 ${W} ${H}`
  return `<svg id="${id}" x="0" y="0" width="${W}" height="${H}" viewBox="${box}" preserveAspectRatio="xMidYMid slice"${/shape-rendering="crispEdges"/.test(open[0]) ? ' shape-rendering="crispEdges"' : ''}>${source.slice(open[0].length)}`
}

/**
 * One window of the Blur tab: a slice of the background at half its size (the
 * low middle, where the scenes keep most of their drawing) and a pane of glass
 * over most of it at that blur, with a few lines of words on it. Each window
 * holds the background once and shows it twice, sharp and frosted.
 */
export const blurWindow = (scene: string | null, palette: PaletteId, blur: Blur, pw = 150, ph = 96): string => {
  const bg = embed(scene, 'pkS')
  const s = 0.5
  const ox = -(W / 2 - pw)
  const oy = -(H * 0.86 - ph * 2)
  const gx = r1(pw * 0.3)
  const glass = `<rect x="${gx}" y="8" width="${r1(pw - gx - 8)}" height="${ph - 16}" rx="6"/>`
  const back = bg
    ? `<g transform="scale(${s}) translate(${ox} ${oy})"><use href="#pkS"/></g><g clip-path="url(#pkQ)"><g transform="scale(${s}) translate(${ox} ${oy})"><use href="#pkS" filter="url(#pkB)"/></g></g>`
    : `<rect class="k0" width="${pw}" height="${ph}"/>`
  const rows = [0.8, 0.62, 0.7, 0.5].map((f, j) => `<rect class="${j === 0 ? 'kt' : 'ks'}" x="${r1(gx + 9)}" y="${18 + j * 10}" width="${r1((pw - gx - 26) * f)}" height="3" rx="1.5"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pw} ${ph}"><style>${toneCss(palette)}</style><defs>${bg}<clipPath id="pkQ">${glass}</clipPath><filter id="pkB" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${BLUR[blur]}"/></filter></defs>${back}<g class="k1" opacity="${GLASS_OPACITY}">${glass}</g>${rows}</svg>`
}
