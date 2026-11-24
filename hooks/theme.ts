// The crabhud theme (/crabhud theme): the app's colors come from the palette
// (palettes.ts), the background and the frost from backdrops.ts (scenes.ts draws
// crabhud's scenes). The right pane's and the band's drawings follow the same
// tones. Pure, no `$`.

import type { ThemeSetArgs } from 'claude-code'

import type { HudStyle } from '../types'
import { BLUR, DEFAULT_BLUR, GLASS_OPACITY, HS, isHs, sceneName, sceneOf, type Backdrop, type Blur } from './backdrops'
import { makeColors } from './make-colors.js'
import { PALETTES, type PaletteId } from './palettes'

// The frost and the backgrounds live in backdrops.ts since 3.3.0: the bar style no
// longer picks them.

// --- colors ----------------------------------------------------------------

export const hexToHsl = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}

export const hsl = (h: number, s: number, l: number): string => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** The surfaces and words of one palette, in each mode, from its accent's hue. */
export const tones = (palette: PaletteId) => {
  const p = PALETTES[palette]
  const [h] = hexToHsl(p.accent)
  const s = p.tint
  const d = p.depth
  return {
    // The page at the palette's depth, each surface a few percent lighter.
    dark: {
      'surface-0': hsl(h, 30 * s, d),
      'surface-1': hsl(h, 26 * s, d + 2.5),
      'surface-2': hsl(h, 24 * s, d + 5),
      'surface-3': hsl(h, 22 * s, d + 7),
      'text-primary': hsl(h, 18 * s, 94),
      'text-secondary': hsl(h, 14 * s, 80),
      'text-muted': hsl(h, 10 * s, 66),
    },
    light: {
      'surface-0': hsl(h, 40 * s, 91),
      'surface-1': hsl(h, 44 * s, 94.5),
      'surface-2': hsl(h, 50 * s, 98),
      'surface-3': hsl(h, 50 * s, 98),
      'text-primary': hsl(h, 30 * s, 9),
      'text-secondary': hsl(h, 22 * s, 25),
      'text-muted': hsl(h, 16 * s, 35),
    },
  }
}

// --- the accent words: /skills and links in a message -----------------------------

const lum = (hex: string): number => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (c[0] ?? 0) + 0.7152 * (c[1] ?? 0) + 0.0722 * (c[2] ?? 0)
}
const contrast = (a: string, b: string): number => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m) as [number, number]
  return (x + 0.05) / (y + 0.05)
}
const PAGE = { dark: '#17171a', light: '#f6f5f1' } as const

/**
 * The accent words in the strong level the person picked (3.3.0): the palette's
 * hue, saturated, then lightened (dark) or darkened (light) until it reads
 * against the page, at least 7:1 in dark mode and 4.5:1 in light mode.
 */
export const vivid = (accent: string, mode: 'dark' | 'light'): string => {
  const [h, s0] = hexToHsl(accent)
  const s = s0 < 15 ? s0 : Math.max(s0, 96)
  let l = mode === 'dark' ? 78 : 38
  let c = hsl(h, s, l)
  for (let k = 0; k < 40 && contrast(c, PAGE[mode]) < (mode === 'dark' ? 7 : 4.5); k++) {
    l += mode === 'dark' ? 2 : -2
    c = hsl(h, s, l)
  }
  return c
}

const colorsCache = new Map<PaletteId, { colors: NonNullable<ThemeSetArgs['colors']>; problems: string[] }>()

/** The app's colors of one palette, and makeColors' notes. */
const colorsOf = (palette: PaletteId) => {
  const kept = colorsCache.get(palette)
  if (kept) return kept
  const t = tones(palette)
  const accent = PALETTES[palette].accent
  const { theme, problems } = makeColors({
    label: `crabhud ${PALETTES[palette].name.en}`,
    id: `crabhud-${palette}`,
    roles: { accent, success: '#3FB68B', danger: '#E5534B', warning: '#E9A23B', pro: '#8B83E6' },
    dark: { gray: { anchors: t.dark } },
    light: { gray: { anchors: t.light } },
  })
  // In dark mode the lightest accent steps (accent words, such as a /command in
  // the chat) come out almost white; keep the palette's hue in them. The accent
  // words' own steps (300 dark, 600 light) take the strong level.
  const [ah, as] = hexToHsl(accent)
  const inputs = theme.inputs as Record<'light' | 'dark', Record<string, string>>
  const dark = { ...inputs.dark, 'role-accent-50': hsl(ah, as, 84), 'role-accent-100': hsl(ah, as, 76), 'role-accent-300': vivid(accent, 'dark') }
  const light = { ...inputs.light, 'role-accent-600': vivid(accent, 'light') }
  const made = { colors: { ...theme, inputs: { ...inputs, dark, light } } as NonNullable<ThemeSetArgs['colors']>, problems }
  colorsCache.set(palette, made)
  return made
}

const cache = new Map<string, { look: ThemeSetArgs; problems: string[] }>()

/**
 * The whole theme, as `$.theme.set` takes it, and makeColors' notes: the
 * palette's colors, and the background (`auto`: the bar style's scene) behind
 * panels frosted at the blur picked. The glass keeps the app's own color, which
 * follows the mode and the palette: a tint the mode does not suit would make the
 * app cover the panels at 80 % and hide the scene.
 */
export const themeFor = (style: HudStyle, palette: PaletteId, backdrop: Backdrop = 'auto', blur: Blur = DEFAULT_BLUR): { look: ThemeSetArgs; problems: string[] } => {
  const key = `${style}:${palette}:${backdrop}:${blur}`
  const kept = cache.get(key)
  if (kept) return kept
  const { colors, problems } = colorsOf(palette)
  const scene = sceneOf(backdrop, style)
  const look: ThemeSetArgs =
    scene === null
      ? { colors }
      : isHs(scene)
        ? { colors, backdrop: { scene: sceneName(scene, palette), glass: { blur: BLUR[blur], opacity: GLASS_OPACITY } }, overrideColorScheme: HS[scene].tone }
        : { colors, backdrop: { scene: sceneName(scene, palette), glass: { blur: BLUR[blur], opacity: GLASS_OPACITY } } }
  const made = { look, problems }
  cache.set(key, made)
  return made
}

/** A theme the desktop would refuse whole says so on a line of its own. */
export const refusal = (problems: string[]): string | undefined => problems.find(l => l.startsWith("Desktop won't paint"))

// --- the right pane and the band: their drawings in the palette's tones ------

/**
 * A <style> for the pane's and the band's drawings: the cards (.k, .tile), the
 * bar tracks (.bk, .be), the lines (.ln, .sep, .rt) and the words (.t, .s, .m)
 * in the palette's tones. Cards and tracks are half see-through, so the frost
 * shows behind them.
 */
export const skinCss = (palette: PaletteId): string => {
  const p = PALETTES[palette]
  const [h] = hexToHsl(p.accent)
  const s = p.tint
  const d = p.depth
  const card = 0.5
  const track = 0.6
  const dark = `.t{fill:${hsl(h, 18 * s, 94)}}.s{fill:${hsl(h, 14 * s, 78)}}.m{fill:${hsl(h, 10 * s, 64)}}.k,.tile{fill:${hsl(h, 26 * s, d + 9)};fill-opacity:${card}}.bk{fill:${hsl(h, 24 * s, d + 13)};fill-opacity:${track}}.be{fill:${hsl(h, 18 * s, d + 22)}}.ln,.rt{stroke:${hsl(h, 22 * s, d + 16)}}.sep{fill:${hsl(h, 18 * s, d + 24)}}`
  const light = `.t{fill:${hsl(h, 30 * s, 9)}}.s{fill:${hsl(h, 22 * s, 28)}}.m{fill:${hsl(h, 16 * s, 36)}}.k,.tile{fill:${hsl(h, 50 * s, 97)};fill-opacity:${card}}.bk{fill:${hsl(h, 50 * s, 98)};fill-opacity:${track}}.bkb{stroke:${hsl(h, 30 * s, 78)}}.be{fill:${hsl(h, 30 * s, 82)}}.ln,.rt{stroke:${hsl(h, 34 * s, 84)}}.sep{fill:${hsl(h, 24 * s, 70)}}`
  return `<style>${light}@media (prefers-color-scheme: dark){${dark}}</style>`
}

/** One drawing in the theme's tones: the skin goes last, so it wins. */
export const skin = (src: string, css: string): string => {
  if (!css) return src
  const end = src.lastIndexOf('</svg>')
  return end < 0 ? src : src.slice(0, end) + css + src.slice(end)
}
