// The crabhud theme's palettes (/crabhud style, the Palette row): the app's
// colors, apart from the style, which picks the backdrop and the glass. Claude's
// orange is the default. Pure, no `$`.

export const PALETTE_IDS = ['claude', 'mint', 'ocean', 'violet', 'rose', 'amber', 'lagoon', 'magenta', 'ice', 'graphite'] as const
export type PaletteId = (typeof PALETTE_IDS)[number]

export const DEFAULT_PALETTE: PaletteId = 'claude'

export type Palette = {
  /** The accent: buttons, the prompt's focus, links, the backdrop's glow and art. */
  accent: string
  /** A second color for the backdrop's art, beside the accent. */
  second: string
  /** How much the grays take of the accent's hue, 0 (neutral) to 1. */
  tint: number
  /** How dark the dark mode's page sits, in HSL lightness (about 4 to 8). */
  depth: number
  name: { en: string; 'pt-BR': string }
}

export const PALETTES: Record<PaletteId, Palette> = {
  claude: { accent: '#D97757', second: '#E9A23B', tint: 0.45, depth: 7, name: { en: 'Claude', 'pt-BR': 'Claude' } },
  mint: { accent: '#1FD18C', second: '#9BE8C6', tint: 0.18, depth: 4, name: { en: 'Mint on black', 'pt-BR': 'Verde e preto' } },
  ocean: { accent: '#4A9FE0', second: '#7CC4F0', tint: 0.5, depth: 7, name: { en: 'Ocean', 'pt-BR': 'Oceano' } },
  violet: { accent: '#8B7CF6', second: '#C86DD7', tint: 0.5, depth: 7, name: { en: 'Violet', 'pt-BR': 'Violeta' } },
  rose: { accent: '#F2668B', second: '#F5A3B8', tint: 0.4, depth: 7, name: { en: 'Rose', 'pt-BR': 'Rosa' } },
  amber: { accent: '#E9A23B', second: '#F2C66D', tint: 0.4, depth: 6, name: { en: 'Amber', 'pt-BR': 'Âmbar' } },
  lagoon: { accent: '#2CB5B0', second: '#7FD8C9', tint: 0.45, depth: 6, name: { en: 'Lagoon', 'pt-BR': 'Lagoa' } },
  magenta: { accent: '#D16BE0', second: '#5AA9E6', tint: 0.55, depth: 6, name: { en: 'Neon', 'pt-BR': 'Neon' } },
  ice: { accent: '#7FB8E6', second: '#DCEBF7', tint: 0.3, depth: 8, name: { en: 'Ice', 'pt-BR': 'Gelo' } },
  graphite: { accent: '#B8B2A7', second: '#7A756D', tint: 0.08, depth: 6, name: { en: 'Graphite', 'pt-BR': 'Grafite' } },
}

export const asPalette = (v: unknown): PaletteId | null => {
  if (typeof v !== 'string') return null
  const k = v.trim().toLowerCase()
  const hit = PALETTE_IDS.find(id => id === k || PALETTES[id].name.en.toLowerCase() === k || PALETTES[id].name['pt-BR'].toLowerCase() === k)
  return hit ?? null
}
