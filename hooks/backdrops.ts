// The theme's backgrounds (3.3.0), apart from the bar style: "follow the bar"
// (the scene of the app's bar style), no scene, one of crabhud's 12 scenes or
// one of Handsher's 8 ASCII wallpapers (ascii-wallpapers.js, MIT). Behind the
// chat the app lays its own veil, so the scenes carry none. Pure, no `$`.

import type { HudStyle } from '../types'
import { CARDS, SCENES } from './ascii-wallpapers.js'
import { STYLES } from './bar-styles'
import type { PaletteId } from './palettes'

/** Bumped when a scene's drawing changes: a new name makes the app draw it anew. */
export const BUILD = 2

export const HS_KEYS = ['clawd', 'clouds', 'honu', 'koiPond', 'jellyfish', 'paperBoats', 'fireflies', 'moonlit'] as const
export type HsKey = (typeof HS_KEYS)[number]
/** Handsher's names, and the window tone each wallpaper was painted for. */
export const HS: Record<HsKey, { name: string; tone: 'dark' | 'light'; alt: string }> = {
  clawd: { name: 'Claude Code', tone: 'dark', alt: 'A spark of ASCII cells turning in a warm glow' },
  clouds: { name: 'Cloud Drift', tone: 'light', alt: 'ASCII clouds drifting over a blue sky' },
  honu: { name: 'Honu Lagoon', tone: 'dark', alt: 'A turquoise lagoon with sea turtles in ASCII cells' },
  koiPond: { name: 'Koi Pond', tone: 'dark', alt: 'Koi circling a jade pond under lily pads' },
  jellyfish: { name: 'Jellyfish', tone: 'dark', alt: 'Glowing jellyfish pulsing through deep blue water' },
  paperBoats: { name: 'Paper Boats', tone: 'dark', alt: 'Origami boats drifting on a calm lake' },
  fireflies: { name: 'Fireflies', tone: 'dark', alt: 'Fireflies blinking over a dark meadow' },
  moonlit: { name: 'Moonlit', tone: 'dark', alt: 'A crescent moon, thin clouds and a shooting star' },
}

/** `auto` follows the bar style; `none` is the theme's colors with no scene. */
export type Backdrop = 'auto' | 'none' | HudStyle | HsKey
export const BACKDROPS: readonly Backdrop[] = ['auto', 'none', ...STYLES, ...HS_KEYS]
export const DEFAULT_BACKDROP: Backdrop = 'auto'

export const isHs = (b: string): b is HsKey => (HS_KEYS as readonly string[]).includes(b)

export const asBackdrop = (v: unknown): Backdrop | null => {
  if (typeof v !== 'string') return null
  const k = v.trim().toLowerCase().replace(/[\s_-]+/g, '')
  const hit = BACKDROPS.find(b => b.toLowerCase() === k)
  if (hit) return hit
  const named = HS_KEYS.find(h => HS[h].name.toLowerCase().replace(/\s+/g, '') === k)
  if (named) return named
  if (/^(off|no|noscene|semcena|sem)$/.test(k)) return 'none'
  if (/^(bar|follow|acompanha|barra)$/.test(k)) return 'auto'
  return null
}

/** The scene a backdrop draws for a bar style: null for none. */
export const sceneOf = (b: Backdrop, style: HudStyle): HudStyle | HsKey | null => (b === 'none' ? null : b === 'auto' ? style : b)

// --- the frost -------------------------------------------------------------------

export const BLURS = ['sharp', 'light', 'medium'] as const
export type Blur = (typeof BLURS)[number]
export const DEFAULT_BLUR: Blur = 'sharp'
/** How much the panels blur what is behind them; all keep 55% of their color. */
export const BLUR: Record<Blur, number> = { sharp: 4, light: 8, medium: 14 }
export const GLASS_OPACITY = 0.55
export const asBlur = (v: unknown): Blur | null => {
  if (typeof v !== 'string') return null
  const k = v.trim().toLowerCase()
  if ((BLURS as readonly string[]).includes(k)) return k as Blur
  return ({ nitido: 'sharp', nítido: 'sharp', leve: 'light', medio: 'medium', médio: 'medium' } as Record<string, Blur>)[k] ?? null
}

// --- the scene names the app keys its pictures by --------------------------------

/** One name per drawing: our scenes change with the palette, Handsher's never. */
export const sceneName = (scene: HudStyle | HsKey, palette: PaletteId): string =>
  isHs(scene) ? `crabhud-hs-${scene}-${BUILD}` : `crabhud-${scene}-${palette}-${BUILD}`

/** The scene a name stands for, or null when it is not one of ours. */
export const parseScene = (name: unknown): { scene: HudStyle | HsKey; palette: string | null } | null => {
  if (typeof name !== 'string' || !name.startsWith('crabhud-') || !name.endsWith(`-${BUILD}`)) return null
  const parts = name.slice('crabhud-'.length, -`-${BUILD}`.length).split('-')
  if (parts[0] === 'hs' && parts[1] && isHs(parts[1])) return { scene: parts[1], palette: null }
  const style = (STYLES as readonly string[]).includes(parts[0] ?? '') ? (parts[0] as HudStyle) : null
  return style ? { scene: style, palette: parts.slice(1).join('-') || null } : null
}

// --- the drawings -----------------------------------------------------------------

/**
 * Handsher's wallpaper as he drew it. The app lays its own veil behind the chat
 * (the glass's opacity, fading to the sides), so no band of ours goes on top:
 * with both, the chat came out twice as dark as the approved preview.
 */
export const hsSvg = (key: HsKey): string => SCENES[key]

/** Handsher's own small card of a wallpaper, for the picker. */
export const hsCard = (key: HsKey): string => CARDS[key]
