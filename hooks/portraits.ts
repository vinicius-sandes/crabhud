// Portraits of one's own agents, from data: a `crabhud-portraits.json` in a
// folder under ~/.claude/mods/ gives an agent type a costume (its pixels, a
// colour, its motion) for the agents panel, and a bar group its colour. Pure,
// no `$`: register.tsx reads the files and draws with what this returns.

/** One rectangle of the crab, on its 30×26 grid: x, y, width, height, colour, and its class (legs `la`/`lb`, `fr` in front). */
export type PortraitPixel = [number, number, number, number, string, string?]

export type Portrait = {
  /** The agent types it dresses, as the Agent tool names them (`barista-team`). */
  agents: string[]
  color: string
  pixels: PortraitPixel[]
  /** Its motion, its rules already scoped to it. */
  css: string
}

export type PortraitSet = {
  portraits: Record<string, Portrait>
  /** A bar group's colour by its name, lowercased. */
  groups: Record<string, string>
}

export const NO_PORTRAITS: PortraitSet = { portraits: {}, groups: {} }

const NAME = /^[a-z][a-z0-9-]{0,31}$/
const COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\))$/
const CLS = /^[a-z][a-z0-9]*( [a-z][a-z0-9]*)*$/
const RULE = /^([^{}@]+)\{([^{}]*)\}$/
const KEYFRAMES = /^@keyframes [a-zA-Z][\w-]*\{(\s*[\d%,.\sa-z]+\{[^{}]*\})*\s*\}$/

const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi

// A rule of the portrait's motion, scoped to its costume while it runs
// (`.kl{...}` reads `.c-NAME.run .kl{...}`), or a @keyframes as it is.
function scopeRule(name: string, rule: unknown): string | null {
  if (typeof rule !== 'string') return null
  const r = rule.trim()
  if (r.includes('<') || /@import|url\s*\(/i.test(r)) return null
  if (r.startsWith('@')) return KEYFRAMES.test(r) ? r : null
  const m = RULE.exec(r)
  if (!m) return null
  const selectors = (m[1] ?? '').split(',').map(s => s.trim())
  if (selectors.some(s => !s)) return null
  return `${selectors.map(s => `.c-${name}.run ${s}`).join(',')}{${m[2]}}`
}

/**
 * The portraits and group colours of one file. `taken` names the costumes
 * already in use (the mod's own, an earlier file's), which a file cannot
 * replace; what does not hold is left out and said in `problems`.
 */
export function readPortraits(text: string, taken: (name: string) => boolean): { set: PortraitSet; problems: string[] } {
  const problems: string[] = []
  const set: PortraitSet = { portraits: {}, groups: {} }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { set, problems: ['not JSON'] }
  }
  if (!data || typeof data !== 'object') return { set, problems: ['not an object'] }
  const d = data as { portraits?: unknown; groups?: unknown }

  if (d.groups && typeof d.groups === 'object') {
    for (const [group, color] of Object.entries(d.groups as Record<string, unknown>)) {
      if (typeof color === 'string' && COLOR.test(color)) set.groups[group.toLowerCase()] = color
      else problems.push(`group ${group}: not a colour`)
    }
  }

  if (d.portraits && typeof d.portraits === 'object') {
    for (const [name, raw] of Object.entries(d.portraits as Record<string, unknown>)) {
      if (!NAME.test(name)) {
        problems.push(`${name}: a name is lowercase letters, digits and dashes`)
        continue
      }
      if (taken(name)) {
        problems.push(`${name}: already taken`)
        continue
      }
      const p = (raw ?? {}) as { agents?: unknown; color?: unknown; pixels?: unknown; css?: unknown }
      const agents = Array.isArray(p.agents) ? p.agents.filter((a): a is string => typeof a === 'string' && a.length > 0) : []
      if (!agents.length || typeof p.color !== 'string' || !COLOR.test(p.color) || !Array.isArray(p.pixels)) {
        problems.push(`${name}: needs agents, a colour and pixels`)
        continue
      }
      const pixels: PortraitPixel[] = []
      for (const px of p.pixels) {
        const [x, y, w, h, c, cls] = Array.isArray(px) ? px : []
        const ok =
          isNum(x, -10, 40) && isNum(y, -10, 40) && isNum(w, 0, 40) && isNum(h, 0, 40) &&
          typeof c === 'string' && (c === 'role' || COLOR.test(c)) && (cls === undefined || (typeof cls === 'string' && CLS.test(cls)))
        if (ok) pixels.push(cls === undefined ? [x, y, w, h, c] : [x, y, w, h, c, cls])
      }
      if (pixels.length < p.pixels.length) problems.push(`${name}: ${p.pixels.length - pixels.length} pixels left out`)
      const rules = Array.isArray(p.css) ? p.css : []
      const css = rules.map(r => scopeRule(name, r))
      if (css.some(r => r === null)) problems.push(`${name}: ${css.filter(r => r === null).length} css rules left out`)
      set.portraits[name] = { agents, color: p.color, pixels, css: css.filter((r): r is string => r !== null).join('\n') }
    }
  }
  return { set, problems }
}

/** Two sets as one: the first keeps a name or a group both give. */
export function mergePortraits(a: PortraitSet, b: PortraitSet): PortraitSet {
  return { portraits: { ...b.portraits, ...a.portraits }, groups: { ...b.groups, ...a.groups } }
}

/** The costume dressing an agent type, if a portrait names it. */
export function portraitFor(set: PortraitSet, type: string): string | null {
  const bare = type.replace(/^[^:]*:/, '')
  for (const [name, p] of Object.entries(set.portraits)) if (p.agents.includes(bare) || p.agents.includes(type)) return name
  return null
}
