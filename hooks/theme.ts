// The crabhud theme (/crabhud theme): the app's colors come from the palette
// picked in /crabhud style (palettes.ts), and the bar style picks only how
// frosted the panels are over the backdrop (scenes.ts draws the backdrop). The
// right pane's and the band's drawings follow the same tones. Pure, no `$`.

import type { ThemeSetArgs } from 'claude-code'

import type { HudStyle } from '../types'
import { makeColors } from './make-colors.js'
import { PALETTES, type PaletteId } from './palettes'

export const SCENE = 'crabhud'

/**
 * The frost over the backdrop, per style: blur in points, how opaque the panels
 * stay. All see-through; glass the clearest, solid and classic the least.
 * Moderate blur with low opacity reads as glass; more blur reads as a flat fill.
 */
export const GLASS: Record<HudStyle, { blur: number; opacity: number }> = {
  pixel: { blur: 16, opacity: 0.38 },
  segments: { blur: 16, opacity: 0.38 },
  line: { blur: 14, opacity: 0.34 },
  solid: { blur: 12, opacity: 0.5 },
  dots: { blur: 16, opacity: 0.38 },
  spark: { blur: 18, opacity: 0.34 },
  classic: { blur: 10, opacity: 0.52 },
  wave: { blur: 20, opacity: 0.3 },
  stripes: { blur: 16, opacity: 0.38 },
  neon: { blur: 22, opacity: 0.28 },
  glass: { blur: 24, opacity: 0.2 },
  stairs: { blur: 14, opacity: 0.4 },
}

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

const cache = new Map<string, { look: ThemeSetArgs; problems: string[] }>()

/** The whole theme of one style and palette, as `$.theme.set` takes it, and makeColors' notes. */
export const themeFor = (style: HudStyle, palette: PaletteId): { look: ThemeSetArgs; problems: string[] } => {
  const key = `${style}:${palette}`
  const kept = cache.get(key)
  if (kept) return kept
  const t = tones(palette)
  const { theme, problems } = makeColors({
    label: `crabhud ${PALETTES[palette].name.en}`,
    id: `crabhud-${palette}`,
    roles: { accent: PALETTES[palette].accent, success: '#3FB68B', danger: '#E5534B', warning: '#E9A23B', pro: '#8B83E6' },
    dark: { gray: { anchors: t.dark } },
    light: { gray: { anchors: t.light } },
  })
  // In dark mode the lightest accent steps (accent words, such as a /command in
  // the chat) come out almost white; keep the palette's hue in them.
  const [ah, as] = hexToHsl(PALETTES[palette].accent)
  const inputs = theme.inputs as Record<'light' | 'dark', Record<string, string>>
  const dark = { ...inputs.dark, 'role-accent-50': hsl(ah, as, 84), 'role-accent-100': hsl(ah, as, 76) }
  const colors = { ...theme, inputs: { ...inputs, dark } } as typeof theme
  const look: ThemeSetArgs = { colors, backdrop: { scene: SCENE, glass: GLASS[style] } }
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
 * in the palette's tones. Cards and tracks are see-through in every style, as
 * clear as the style's glass, so the frost shows.
 */
export const skinCss = (style: HudStyle, palette: PaletteId): string => {
  const p = PALETTES[palette]
  const [h] = hexToHsl(p.accent)
  const s = p.tint
  const d = p.depth
  // Cards 0.2 (glass) to 0.5 (solid, classic); tracks 0.45 to 0.6.
  const card = Math.max(0.2, Math.min(0.5, GLASS[style].opacity))
  const track = +(0.45 + (card - 0.2) * 0.5).toFixed(2)
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
