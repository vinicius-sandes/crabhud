// The crabhud backdrops: one scene per bar style, drawn full-window behind the
// app's frosted panels. Each scene is CONSTANT for a (style, palette): no state,
// no time, no randomness, so the app never reloads it; all motion is CSS inside
// the SVG. Colour and shape sit at the edges and the top (under the sidebar, the
// agents pane and the band), the middle and the foot stay calm for the words.
// Every class, id and keyframe here starts with `bg`, clear of the crab's CSS.
// Pure, no `$`.

import type { HudStyle } from '../types'
import { PALETTES, type PaletteId, type Palette } from './palettes'

export const W = 1600
export const H = 1000

/** The crab drawing register.tsx owns, handed in so this file stays pure. */
export type CrabArt = {
  crab: (x: number, y: number, costume: string, dim?: boolean, isWalking?: boolean, scale?: number) => string
  css: string
}

// --- small helpers -----------------------------------------------------------

const r = (v: number): number => Math.round(v * 10) / 10
/** Deterministic noise in [0, 1). */
const rnd = (i: number, k = 0): number => {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return s - Math.floor(s)
}
const N = (k: number, fn: (i: number) => string): string => Array.from({ length: k }, (_, i) => fn(i)).join('')
function pick<T>(list: readonly T[], i: number): T {
  return list[((i % list.length) + list.length) % list.length] as T
}
/** 0 in the middle of the screen, 1 at the edges. */
const edge = (x: number): number => Math.min(1, Math.abs(x - W / 2) / 420)
/** A position biased toward the left and right edges. */
const edgeX = (u: number, spread = 520): number => (u < 0.5 ? Math.pow(u / 0.5, 1.7) * spread : W - Math.pow((1 - u) / 0.5, 1.7) * spread)
/** Inline animation timing: duration and how far into the loop it starts. */
const an = (dur?: number, lead?: number, extra = ''): string => {
  const parts = [dur === undefined ? '' : `animation-duration:${r(dur)}s`, lead === undefined ? '' : `animation-delay:-${r(lead)}s`, extra].filter(Boolean)
  return parts.length ? ` style="${parts.join(';')}"` : ''
}
/** A rolling wave from x0 to x1 (period `per`), filled down to the foot. */
const wavePath = (y: number, amp: number, per: number, x0: number, x1: number, isOpen = false): string => {
  let d = `M${x0} ${y}q${per / 4} ${-amp} ${per / 2} 0`
  for (let x = x0 + per / 2; x < x1; x += per / 2) d += `t${per / 2} 0`
  return isOpen ? d : `${d}V${H}H${x0}Z`
}
/** Pixel art: rows of letters, each letter a class, merged into one path per class. */
const stamp = (rows: string[], x: number, y: number, k: number, cls: Record<string, string>, attrs = ''): string => {
  const d: Record<string, string> = {}
  rows.forEach((row, j) => {
    let i = 0
    while (i < row.length) {
      const ch = row[i] as string
      let e = i
      while (e < row.length && row[e] === ch) e++
      if (cls[ch]) d[ch] = `${d[ch] ?? ''}M${r(x + i * k)} ${r(y + j * k)}h${r((e - i) * k)}v${k}h${r(-(e - i) * k)}z`
      i = e
    }
  })
  return Object.entries(d)
    .map(([ch, p]) => `<path class="${cls[ch]}"${attrs} d="${p}"/>`)
    .join('')
}
/** A pixel disc: one path of rows. */
const pxDisc = (cx: number, cy: number, rr: number, k: number): string => {
  let d = ''
  for (let j = -rr; j < rr; j++) {
    const hw = Math.round(Math.sqrt(rr * rr - (j + 0.5) * (j + 0.5)))
    d += `M${cx - hw * k} ${cy + j * k}h${2 * hw * k}v${k}h${-2 * hw * k}z`
  }
  return d
}
/** A four-point sparkle. */
const spark = (x: number, y: number, s: number): string => {
  const q = s * 0.16
  return `M${r(x)} ${r(y - s)}Q${r(x + q)} ${r(y - q)} ${r(x + s)} ${r(y)}Q${r(x + q)} ${r(y + q)} ${r(x)} ${r(y + s)}Q${r(x - q)} ${r(y + q)} ${r(x - s)} ${r(y)}Q${r(x - q)} ${r(y - q)} ${r(x)} ${r(y - s)}Z`
}
/** Keyframes for a hop-by-hop climb: `n` hops of (dx, dy), then a fade at the top. */
const climbKeys = (name: string, n: number, dx: number, dy: number): string => {
  const span = 84
  const steps = Array.from({ length: n + 1 }, (_, k) => `${r(4 + (k * span) / n)}%{transform:translate(${k * dx}px,${k * dy}px)}`).join('')
  return `@keyframes ${name}{0%{transform:translate(0,0);opacity:0}${steps}95%{opacity:1}100%{transform:translate(${n * dx}px,${n * dy}px);opacity:0}}`
}

// --- colours -----------------------------------------------------------------

const hexToHsl = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16)
  const rr = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(rr, g, b)
  const min = Math.min(rr, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === rr ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - rr) / d + 2 : (rr - g) / d + 4
  return [h * 60, s * 100, l * 100]
}

const hsl = (h: number, s: number, l: number): string => {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(Math.max(0, Math.min(1, c)) * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

/** A colour no lighter than `max` lightness, for the light mode's paper. */
const capL = (hex: string, max: number): string => {
  const [h, s, l] = hexToHsl(hex)
  return l > max ? hsl(h, s, max) : hex
}

type Tone = { s0: string; s1: string; v: string; k: string; w: string; a: string; b: string; t: string[]; m: string[] }

/** The page, the five layer tones, the silhouette and the highlight of each mode, from the palette. */
const tonesOf = (p: Palette): { dark: Tone; light: Tone } => {
  const [h] = hexToHsl(p.accent)
  const [ha, sa] = hexToHsl(p.accent)
  const ms = Math.min(sa, 72)
  const t = p.tint
  const d = p.depth
  return {
    dark: {
      s0: hsl(h, 30 * t, d),
      s1: hsl(h, 42 * t, d + 8),
      v: hsl(h, 30 * t, d + 1),
      k: hsl(h, 30 * t, Math.max(1.5, d - 3.5)),
      w: hsl(h, 25 * t, 94),
      a: p.accent,
      b: p.second,
      t: [d + 3, d + 6, d + 10, d + 15, d + 23].map((l, i) => hsl(h, (40 - i * 3) * t, l)),
      m: [d + 9, d + 15, d + 22, d + 30].map(l => hsl(ha, ms * 0.6, l)),
    },
    light: {
      s0: hsl(h, 46 * t, 96),
      s1: hsl(h, 52 * t, 87),
      v: hsl(h, 46 * t, 94),
      k: hsl(h, 34 * t, 30),
      w: hsl(h, 40 * t, 26),
      a: capL(p.accent, 58),
      b: capL(p.second, 62),
      t: [91, 86, 80, 73, 64].map(l => hsl(h, 52 * t, l)),
      m: [86, 79, 71, 62].map(l => hsl(ha, ms * 0.62, l)),
    },
  }
}

const toneCss = (x: Tone): string =>
  `.bgA{fill:${x.a}}.bgB{fill:${x.b}}.bgK{fill:${x.k}}.bgW{fill:${x.w}}` +
  x.t.map((c, i) => `.bgT${i + 1}{fill:${c}}`).join('') +
  x.m.map((c, i) => `.bgM${i + 1}{fill:${c}}`).join('') +
  `.bgAs{stroke:${x.a}}.bgBs{stroke:${x.b}}.bgKs{stroke:${x.k}}.bgWs{stroke:${x.w}}.bgTs{stroke:${x.t[3]}}.bgT5s{stroke:${x.t[4]}}` +
  `.bgs0{stop-color:${x.s0}}.bgs1{stop-color:${x.s1}}.bgsV{stop-color:${x.v}}.bgsA{stop-color:${x.a}}.bgsB{stop-color:${x.b}}.bgsW{stop-color:${x.w}}.bgsT1{stop-color:${x.t[0]}}`

// Shared motion. Durations and phases vary per element through inline styles.
const BASE_CSS = `.bgH{fill:#fff}.bgHs{stroke:#fff}.bgsH{stop-color:#fff}
.bgFx{transform-box:fill-box;transform-origin:50% 50%}.bgFb{transform-box:fill-box;transform-origin:50% 100%}.bgFt{transform-box:fill-box;transform-origin:50% 0}
.bgTw{animation:bgTw 5s ease-in-out infinite}@keyframes bgTw{0%,100%{opacity:.15}50%{opacity:1}}
.bgPu{animation:bgPu 6s ease-in-out infinite}@keyframes bgPu{0%,100%{opacity:.45}50%{opacity:1}}
.bgBob{animation:bgBob 8s ease-in-out infinite}@keyframes bgBob{50%{transform:translateY(-14px)}}
.bgDx{animation:bgDx 40s ease-in-out infinite}@keyframes bgDx{50%{transform:translateX(60px)}}
.bgDr{animation:bgDr 36s ease-in-out infinite}@keyframes bgDr{50%{transform:translate(46px,-30px)}}
.bgDr2{animation:bgDr2 42s ease-in-out infinite}@keyframes bgDr2{50%{transform:translate(-50px,36px)}}
.bgRise{animation:bgRise 11s ease-in infinite}@keyframes bgRise{0%{transform:translateY(0);opacity:0}15%{opacity:.9}100%{transform:translateY(-560px);opacity:0}}
.bgSpin{animation:bgSpin 90s linear infinite}@keyframes bgSpin{to{transform:rotate(360deg)}}
.bgSeg{animation:bgSeg 6s linear infinite}@keyframes bgSeg{0%,6%{opacity:.18}12%,62%{opacity:1}70%,100%{opacity:.18}}
.bgSwing{animation:bgSwing 4s ease-in-out infinite}@keyframes bgSwing{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}`

// --- the scenes ----------------------------------------------------------------

type Walker = {
  /** Feet line, start x (where it is at load), scale, seconds to cross, direction. */
  feet: number
  x: number
  s: number
  t: number
  dir: 1 | -1
  /** Drawn after this layer of `back` (default: the last). */
  z?: number
  c?: string
}

type Scene = {
  defs?: string
  css?: string
  /** Extra rules for the light mode, given its tones. */
  light?: (t: Tone) => string
  /** Layers under the veil, back to front; walkers slot in between. */
  back: string[]
  walkers: Walker[]
  /** How much the middle is calmed, 0 to 1. */
  veil?: number
  /** Over the veil: the edges' crabs (the resting one) and scene moments. */
  top: string
}

const CRAB_H = 26

// The walkers' costumes, rotated per scene.
const COSTUMES = ['fable', 'heavy', 'careful', 'medium', 'light', 'explore', 'plan', 'other', 'm-work', 'm-think'] as const

// 1. Pixel: a pixel-art reef under a pixel sun.
const pixel = (art: CrabArt): Scene => {
  const surf = 216
  const mound = (x: number) => Math.pow(Math.max(0, 1 - x / 400), 1.3) + Math.pow(Math.max(0, (x - 1200) / 400), 1.3)
  const bed = (base: number, amp: number, k: number) => {
    let d = `M0 ${H}`
    for (let x = 0; x < W; x += 20) d += `V${H - Math.round((base + amp * mound(x + 10) + rnd(x, k) * 34) / 10) * 10}h20`
    return `${d}V${H}Z`
  }
  const backTop = (x: number) => H - (70 + 280 * mound(x))
  const frontTop = (x: number) => H - (34 + 170 * mound(x))
  const weed = (x: number, yb: number, n: number, cls: string, i: number) => {
    let d = ''
    for (let c = 0; c < n; c++) d += `M${x + ((c >> 1) % 2) * 10} ${yb - (c + 1) * 10}h10v10h-10z`
    return `<path class="${cls} bgSw bgFb" d="${d}"${an(4 + (i % 3), i * 0.9)}/>`
  }
  const coral = ['x.x..x', 'x.x.xx', 'xxx.x.', '.xxxx.', '..xx..', '..xx..']
  const fish = ['x..xxx..', 'xxxxxxx.', '.xxxxxex', 'xxxxxxx.', 'x..xxx..']
  const school = (y: number, dir: 1 | -1, cls: string, t: number, lead: number) => {
    const body = [0, 1, 2].map(j => stamp(fish, j * 40 + (j % 2) * 10, (j % 2) * 26, 6, { x: cls, e: 'bgK' })).join('')
    return `<g transform="translate(0 ${y})"><g class="bgFish${dir > 0 ? 'R' : 'L'}"${an(t, lead)}>${dir > 0 ? body : `<g transform="scale(-1 1)">${body}</g>`}</g></g>`
  }
  const cloud = ['..xxxx....', '.xxxxxxxx.', 'xxxxxxxxxx']
  const rock = ['....hhhhh...', '..hhxxxxxhh.', '.hxxxxxxxxxh', 'xxxxxxxxxxxx', 'xxxxxxxxxxxx', 'xxxxxxxxxxxx', 'xxxxxxxxxxxx', 'xxxxxxxxxxxx']
  const weeds = [40, 92, 150, 232, 296, 1262, 1330, 1404, 1478, 1548]
  return {
    defs: `<pattern id="bgPxG" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="4" height="4" class="bgT4"/></pattern>`,
    css: `.bgSw{animation:bgSw 5s ease-in-out infinite}@keyframes bgSw{50%{transform:skewX(-8deg)}}
.bgSurf{animation:bgSurf 2.4s steps(4) infinite}@keyframes bgSurf{to{transform:translateX(48px)}}
.bgFishR{animation:bgFishR 70s linear infinite}@keyframes bgFishR{from{transform:translateX(-200px)}to{transform:translateX(1800px)}}
.bgFishL{animation:bgFishL 70s linear infinite}@keyframes bgFishL{from{transform:translateX(1800px)}to{transform:translateX(-200px)}}
.bgPxB{animation-timing-function:steps(6)}`,
    back: [
      // Sky, sun, clouds, the water and its glints.
      `<circle cx="200" cy="112" r="210" fill="url(#bgGB)"/>
<path class="bgB" d="${pxDisc(200, 112, 6, 12)}"/><path class="bgH" opacity=".28" d="${pxDisc(188, 100, 3, 12)}"/>
${N(8, i => {
        const a = (i * Math.PI) / 4
        return `<rect class="bgB bgTw" x="${Math.round((200 + Math.cos(a) * 104) / 12) * 12 - 6}" y="${Math.round((112 + Math.sin(a) * 104) / 12) * 12 - 6}" width="12" height="12"${an(2.4, (i % 2) * 1.2, 'animation-timing-function:steps(2)')}/>`
      })}
${[
  [430, 70, 60],
  [860, 128, 74],
  [1160, 58, 66],
]
  .map(([x, y, t], i) => `<g class="bgDx"${an(t, i * 9)}>${stamp(cloud, x as number, y as number, 12, { x: 'bgT5' }, ' opacity=".55"')}</g>`)
  .join('')}
<rect y="${surf}" width="${W}" height="${H - surf}" class="bgA" opacity=".07"/><circle cx="60" cy="860" r="460" fill="url(#bgGA)" opacity=".7"/><circle cx="1560" cy="640" r="420" fill="url(#bgGB)" opacity=".55"/>
<rect y="${surf + 10}" width="${W}" height="${H - surf}" fill="url(#bgPxG)" opacity=".45"/>
<g class="bgSurf"><path class="bgT5" opacity=".6" d="M-48 ${surf}${N(36, i => `h24v${i % 2 ? -6 : 6}`)}V${surf + 8}H-48Z"/></g>
<g class="bgW">${N(26, i => `<rect class="bgTw" x="${Math.round(edgeX(rnd(i, 1)))}" y="${Math.round(260 + rnd(i, 2) * 560)}" width="${i % 3 ? 4 : 6}" height="${i % 3 ? 4 : 6}"${an(3 + (i % 4), i * 0.7)}/>`)}</g>
${school(360, 1, 'bgA', 64, 20)}${school(520, -1, 'bgB', 82, 50)}${school(640, 1, 'bgT5', 96, 70)}`,
      // The back seabed, back weeds and coral.
      `<path class="bgM1" d="${bed(70, 280, 1)}"/>
${weeds.map((x, i) => weed(x + 16, backTop(x + 16) + 10, 8 + Math.round(rnd(i, 4) * 10), i % 2 ? 'bgB' : 'bgT5', i)).join('')}
${[60, 250, 1290, 1470].map((x, i) => stamp(coral, x, frontTop(x) - 70, 12, { x: i % 2 ? 'bgA' : 'bgB' }, ' opacity=".9"')).join('')}
<g class="bgW">${N(16, i => {
        const x = pick(weeds, i) + 20 + rnd(i, 5) * 20
        return `<rect class="bgRise bgPxB" x="${Math.round(x)}" y="${Math.round(backTop(x) - 10)}" width="${i % 3 ? 6 : 8}" height="${i % 3 ? 6 : 8}" opacity=".8"${an(9 + rnd(i, 6) * 6, rnd(i, 7) * 14)}/>`
      })}</g>`,
      // The front seabed and weeds: the crabs pass behind them at the edges.
      `<path class="bgM2" d="${bed(34, 170, 2)}"/>
${weeds.map((x, i) => (i % 2 ? '' : weed(x, frontTop(x) + 20, 10 + Math.round(rnd(i, 8) * 12), 'bgA', i + 3))).join('')}`,
    ],
    walkers: [
      { feet: 430, x: 300, s: 1.6, t: 90, dir: 1, z: 1, c: 'explore' },
      { feet: 590, x: 1250, s: 2, t: 74, dir: -1, z: 1, c: 'fable' },
      { feet: 740, x: 560, s: 2.4, t: 62, dir: 1, z: 1, c: 'm-work' },
      { feet: 880, x: 1050, s: 2.8, t: 52, dir: -1, z: 1, c: 'other' },
    ],
    veil: 0.55,
    top: `${stamp(rock, 1370, 196, 16, { x: 'bgT3', h: 'bgT4' })}${art.crab(1418, 196 - 3 * CRAB_H + 4, 'm-sleep', false, true, 3)}`,
  }
}

// 2. Segments: a skyline of rounded towers, windows lit as segments.
const segments = (art: CrabArt): Scene => {
  const ground = 900
  const far: string[] = []
  for (let x = -20, i = 0; x < W; i++) {
    const w = 40 + Math.floor(rnd(i, 1) * 4) * 20
    const h = 150 + 330 * Math.pow(edge(x + w / 2), 1.4) * (0.55 + 0.45 * rnd(i, 2))
    far.push(`<rect x="${x}" y="${r(ground - h)}" width="${w}" height="${r(h + 100)}" rx="10"/>`)
    x += w + 6
  }
  const near: [number, number, number][] = [
    [0, 120, 560], [140, 100, 420], [260, 120, 300], [400, 80, 200],
    [500, 100, 150], [620, 80, 120], [720, 120, 170], [860, 100, 130], [980, 100, 160],
    [1100, 100, 240], [1220, 120, 350], [1360, 140, 640], [1520, 100, 460],
  ]
  const lit: string[][] = [[], [], [], [], [], [], [], []]
  near.forEach(([x, w, h], ti) => {
    const cols = (w - 20) / 20
    const rows = Math.floor((h - 40) / 16)
    for (let ri = 0; ri < rows; ri++)
      for (let ci = 0; ci < cols; ci++) {
        const u = rnd(ti * 97 + ri * 7 + ci, 3)
        if (u < 0.1 + 0.16 * edge(x + w / 2)) {
          const g = Math.floor(rnd(ti, ri * 13 + ci) * 8)
          lit[g]?.push(`<rect x="${x + 10 + ci * 20 + 4}" y="${ground - h + 20 + ri * 16 + 5}" width="12" height="5" rx="2.5"/>`)
        }
      }
  })
  const board = (x: number, y: number, n: number, cls: string, lead: number) =>
    `<rect x="${x}" y="${y}" width="${n * 26 + 16}" height="46" rx="12" class="bgT1"/><rect x="${x}" y="${y}" width="${n * 26 + 16}" height="46" rx="12" fill="none" class="bgTs" stroke-width="2"/>${N(n, i => `<rect class="${cls} bgSeg" x="${x + 10 + i * 26}" y="${y + 10}" width="20" height="26" rx="6"${an(undefined, lead - i * 0.32)}/>`)}<rect x="${x + 20}" y="${y + 46}" width="6" height="40" class="bgT2"/><rect x="${x + n * 26 - 10}" y="${y + 46}" width="6" height="40" class="bgT2"/>`
  return {
    defs: `<pattern id="bgWin" width="20" height="16" patternUnits="userSpaceOnUse"><rect x="4" y="5" width="12" height="5" rx="2.5" class="bgT4"/></pattern>
<linearGradient id="bgCity" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgsA" stop-opacity="0"/><stop offset="1" class="bgsA" stop-opacity=".28"/></linearGradient>`,
    css: `.bgBl{animation:bgBl 11s steps(1) infinite}@keyframes bgBl{0%,72%{opacity:1}73%,100%{opacity:.2}}`,
    back: [
      `<g class="bgW">${N(36, i => `<circle class="bgTw" cx="${Math.round(edgeX(rnd(i, 1), 700))}" cy="${Math.round(30 + rnd(i, 2) * 380)}" r="${r(0.8 + rnd(i, 3))}"${an(4 + (i % 4), i * 0.6)}/>`)}</g>
<circle cx="230" cy="150" r="200" fill="url(#bgGB)"/><circle cx="230" cy="150" r="66" class="bgB"/><circle cx="208" cy="132" r="14" class="bgT5" opacity=".35"/><circle cx="252" cy="170" r="9" class="bgT5" opacity=".35"/>
${[
  [560, 90, 240, 34, 60],
  [1000, 150, 180, 26, 48],
  [1260, 70, 220, 30, 70],
]
  .map(([x, y, w, h, t], i) => `<g class="bgDx"${an(t, i * 11)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(h as number) / 2}" class="bgT4" opacity=".4"/></g>`)
  .join('')}
<rect y="420" width="${W}" height="480" fill="url(#bgCity)"/><g class="bgM1" opacity=".8">${far.join('')}</g>`,
      `<g class="bgT3">${near.map(([x, w, h]) => `<rect x="${x}" y="${ground - h}" width="${w}" height="${h + 100}" rx="12"/>`).join('')}</g>
${near.map(([x, w, h]) => `<rect x="${x + 10}" y="${ground - h + 20}" width="${w - 20}" height="${h - 40}" fill="url(#bgWin)" opacity=".5"/>`).join('')}
${lit.map((g, i) => `<g class="${i % 2 ? 'bgB' : 'bgA'}${i < 6 ? ' bgBl' : ''}"${an(9 + i, i * 1.7)}>${g.join('')}</g>`).join('')}
${near
  .filter(([, , h]) => h > 400)
  .map(([x, w, h], i) => `<rect x="${x + w / 2 - 2}" y="${ground - h - 50}" width="4" height="50" class="bgT4"/><circle class="bgA bgTw" cx="${x + w / 2}" cy="${ground - h - 52}" r="5"${an(2, i * 0.7)}/>`)
  .join('')}
${board(18, 260, 9, 'bgA', 0)}${board(1222, 420, 5, 'bgB', 2)}
<rect y="${ground}" width="${W}" height="${H - ground}" class="bgT1"/>`,
    ],
    walkers: [
      { feet: 430, x: 260, s: 1.6, t: 96, dir: 1, c: 'heavy' },
      { feet: 600, x: 1300, s: 2, t: 78, dir: -1, c: 'plan' },
      { feet: 760, x: 640, s: 2.4, t: 64, dir: 1, c: 'm-think' },
      { feet: 898, x: 1120, s: 2.8, t: 54, dir: -1, c: 'light' },
    ],
    veil: 0.55,
    top: art.crab(1385, ground - 640 - 3 * CRAB_H + 2, 'm-think', false, true, 3),
  }
}

// 3. Line: a horizon of long thin lines, glowing heads running along them, boats.
const line = (art: CrabArt): Scene => {
  const hz = 432
  const ys = Array.from({ length: 16 }, (_, i) => r(hz + 8 + 540 * Math.pow(i / 15, 1.5)))
  const runner = (y: number, dir: 1 | -1, cls: 'A' | 'B', t: number, lead: number) => {
    const body = `<rect x="-150" y="-1" width="150" height="2" fill="url(#bgTail${cls})"/><circle r="10" class="bg${cls}" opacity=".18"/><circle r="3.4" class="bg${cls}"/>`
    return `<g transform="translate(0 ${y})"><g class="bgRun${dir > 0 ? 'R' : 'L'}"${an(t, lead)}>${dir > 0 ? body : `<g transform="scale(-1 1)">${body}</g>`}</g></g>`
  }
  const boat = (x: number, s: number, sail: string, t: number, lead: number) =>
    `<g transform="translate(${x} ${hz + 2}) scale(${s})"><g class="bgDx"${an(t, lead)}><g class="bgBob"${an(5 + s * 2, lead)}><path class="bgT5" d="M-28 -2h56l-10 10h-36z"/><path class="${sail}" d="M0 -6V-58L28 -8Z"/><path class="bgT5" d="M-3 -8L-22 -8L-3 -40Z"/></g></g></g>`
  return {
    defs: `<linearGradient id="bgLg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="0"><stop offset="0" class="bgsA" stop-opacity=".75"/><stop offset=".3" class="bgsA" stop-opacity=".16"/><stop offset=".7" class="bgsA" stop-opacity=".16"/><stop offset="1" class="bgsA" stop-opacity=".75"/></linearGradient>
<linearGradient id="bgTailA"><stop offset="0" class="bgsA" stop-opacity="0"/><stop offset="1" class="bgsA" stop-opacity=".9"/></linearGradient>
<linearGradient id="bgTailB"><stop offset="0" class="bgsB" stop-opacity="0"/><stop offset="1" class="bgsB" stop-opacity=".9"/></linearGradient>
<linearGradient id="bgSea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgsA" stop-opacity=".3"/><stop offset=".5" class="bgsA" stop-opacity=".08"/><stop offset="1" class="bgsV" stop-opacity="0"/></linearGradient>
<linearGradient id="bgDusk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgsB" stop-opacity="0"/><stop offset="1" class="bgsB" stop-opacity=".22"/></linearGradient>`,
    css: `.bgRunR{animation:bgRunR 24s linear infinite}@keyframes bgRunR{from{transform:translateX(-200px)}to{transform:translateX(1800px)}}
.bgRunL{animation:bgRunL 24s linear infinite}@keyframes bgRunL{from{transform:translateX(1800px)}to{transform:translateX(-200px)}}
.bgRing{animation:bgRing 8s ease-out infinite}@keyframes bgRing{0%{transform:scale(.5);opacity:0}20%{opacity:.7}100%{transform:scale(1.6);opacity:0}}`,
    back: [
      `<rect y="200" width="${W}" height="${hz - 200}" fill="url(#bgDusk)"/><rect y="${hz}" width="${W}" height="${H - hz}" fill="url(#bgSea)"/>
<ellipse cx="250" cy="${hz}" rx="520" ry="260" fill="url(#bgGB)"/><ellipse cx="1420" cy="${hz}" rx="420" ry="220" fill="url(#bgGA)" opacity=".7"/>
${N(4, i => `<circle class="bgRing bgFx bgBs" cx="250" cy="330" r="90" fill="none" stroke-width="1.4"${an(undefined, i * 2)}/>`)}
<circle cx="250" cy="330" r="36" class="bgB"/>
<g class="bgB">${N(9, i => `<rect class="bgTw" x="${r(250 - (70 - i * 6) / 2 + (rnd(i, 1) - 0.5) * 24)}" y="${hz + 10 + i * 17}" width="${70 - i * 6}" height="2.2" rx="1.1"${an(2.6 + (i % 3), i * 0.5)}/>`)}</g>
<g fill="none" stroke="url(#bgLg)">${[86, 150, 226, 318].map((y, i) => `<path d="M0 ${y}H${W}" stroke-width="${0.8 + i * 0.1}" opacity=".55"/>`).join('')}${ys.map((y, i) => `<path d="M0 ${y}H${W}" stroke-width="${r(0.7 + i * 0.09)}"/>`).join('')}</g>
<path d="M0 ${hz}H${W}" class="bgAs" stroke-width="1.5" opacity=".7"/>
${boat(1210, 1, 'bgB', 46, 0)}${boat(1480, 0.7, 'bgA', 60, 18)}${boat(420, 0.6, 'bgA', 52, 30)}${boat(760, 0.45, 'bgB', 70, 10)}
<g class="bgDx"${an(70, 20)}><g class="bgWs" fill="none" stroke-width="1.6" stroke-linecap="round">${[
        [360, 110], [392, 96], [420, 120], [980, 70], [1010, 86],
      ]
        .map(([x, y]) => `<path d="M${x} ${y}q6 -7 12 0q6 -7 12 0"/>`)
        .join('')}</g></g>
${runner(150, 1, 'B', 30, 4)}${runner(318, -1, 'A', 26, 12)}${runner(pick(ys, 3), 1, 'A', 18, 2)}${runner(pick(ys, 6), -1, 'B', 22, 9)}${runner(pick(ys, 9), 1, 'B', 16, 7)}${runner(pick(ys, 12), -1, 'A', 14, 3)}`,
    ],
    walkers: [
      { feet: hz + 4, x: 900, s: 1.6, t: 120, dir: -1, c: 'medium' },
      { feet: pick(ys, 4), x: 280, s: 1.8, t: 92, dir: 1, c: 'careful' },
      { feet: pick(ys, 8), x: 1300, s: 2.2, t: 74, dir: -1, c: 'other' },
      { feet: pick(ys, 12), x: 600, s: 2.8, t: 58, dir: 1, c: 'fable' },
    ],
    veil: 0.5,
    top: `<path d="M1200 136V${hz}" class="bgTs" stroke-width="5"/><path d="M1186 146h28" class="bgTs" stroke-width="4"/><path d="M1200 148Q1420 236 1640 160" fill="none" class="bgT5s" stroke-width="2"/>
<g class="bgT5"><circle cx="1290" cy="176" r="6"/><circle cx="1312" cy="183" r="5"/><circle cx="1546" cy="186" r="6"/></g>
${art.crab(1376, 192 - 3 * CRAB_H + 6, 'm-sleep', false, true, 3)}`,
  }
}

// 4. Solid: bold flat blocks, dunes and giant filled bars.
const solid = (art: CrabArt): Scene => {
  const pill = (id: string, x: number, y: number, w: number, h: number, fill: number, cls: string, lead: number) =>
    `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/></clipPath>
<g clip-path="url(#${id})"><rect x="${x}" y="${y}" width="${w}" height="${h}" class="bgT3"/><rect x="${x}" y="${y}" width="${r(w * fill)}" height="${h}" rx="${h / 2}" class="${cls}"/><g class="bgSweep"${an(undefined, lead)}><path class="bgH" opacity=".3" d="M${x - 160} ${y}h70l-${h * 0.5} ${h}h-70z"/></g></g>`
  return {
    css: `.bgSweep{animation:bgSweep 7s ease-in-out infinite}@keyframes bgSweep{0%{transform:translateX(0)}55%,100%{transform:translateX(${W * 0.4}px)}}`,
    back: [
      `<circle cx="150" cy="150" r="330" class="bgB" opacity=".28"/><g class="bgBob"${an(20)}><circle cx="150" cy="160" r="210" class="bgA"/></g>
<rect x="1180" y="-260" width="130" height="1000" transform="rotate(24 1245 240)" class="bgA" opacity=".22"/><rect x="1340" y="-260" width="40" height="1000" transform="rotate(24 1360 240)" class="bgB" opacity=".3"/>
<circle cx="1560" cy="760" r="260" class="bgB" opacity=".55"/>
${[
  [640, 150, 260, 50, 50],
  [1000, 230, 180, 36, 64],
]
  .map(([x, y, w, h, t], i) => `<g class="bgDx"${an(t, i * 15)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(h as number) / 2}" class="bgT5" opacity=".3"/></g>`)
  .join('')}
<g class="bgDx"${an(60, 5)}><path class="bgM3" d="M-100 640C200 420 420 520 620 600S1100 640 1300 470S1600 380 1760 430V1000H-100Z"/></g>
<rect x="40" y="300" width="90" height="380" class="bgB" opacity=".9"/><rect x="150" y="390" width="60" height="300" class="bgT4"/><path d="M1250 600a150 150 0 0 1 300 0z" class="bgA" opacity=".85"/>`,
      `<g class="bgDx"${an(46, 20)}><path class="bgM2" d="M-100 760C150 600 380 640 640 720S1200 760 1450 600S1700 560 1760 600V1000H-100Z"/></g>`,
      `<g class="bgDx"${an(34, 8)}><path class="bgM1" d="M-100 880C260 800 520 840 800 880S1300 820 1760 800V1000H-100Z"/></g>
${pill('bgP1', -60, 230, 380, 54, 0.72, 'bgA', 0)}${pill('bgP2', 1240, 450, 420, 64, 0.55, 'bgB', 3)}${pill('bgP3', 560, 70, 300, 26, 0.62, 'bgA', 5)}`,
    ],
    walkers: [
      { feet: 600, x: 300, s: 1.8, t: 88, dir: 1, z: 0, c: 'light' },
      { feet: 730, x: 1200, s: 2.2, t: 70, dir: -1, z: 1, c: 'heavy' },
      { feet: 860, x: 700, s: 2.8, t: 56, dir: 1, z: 2, c: 'm-work' },
      { feet: 420, x: 1000, s: 1.6, t: 110, dir: -1, z: 0, c: 'plan' },
    ],
    veil: 0.68,
    top: `<rect x="1360" y="210" width="210" height="190" class="bgA"/><rect x="1360" y="210" width="210" height="16" class="bgH" opacity=".18"/>${art.crab(1420, 210 - 3 * CRAB_H + 2, 'm-think', false, true, 3)}`,
  }
}

// 5. Dots: a constellation map with dotted orbits.
const dots = (art: CrabArt): Scene => {
  const stars: [number, number, number][] = [
    [200, 210, 150], [150, 570, 130], [330, 810, 120], [720, 130, 110], [1080, 300, 90], [1380, 540, 150], [1320, 810, 120],
  ]
  const constellation = ([cx, cy, R]: [number, number, number], i: number) => {
    const n = 6 + (i % 3)
    const pts = Array.from({ length: n }, (_, j) => {
      const a = (j * 2 * Math.PI) / n + rnd(i, j) * 0.8
      const d = R * (0.35 + 0.65 * rnd(j, i + 9))
      return [r(cx + Math.cos(a) * d), r(cy + Math.sin(a) * d)] as const
    })
    const lines = pts.map((p, j) => (j ? `L${p[0]} ${p[1]}` : `M${p[0]} ${p[1]}`)).join('') + `M${pts[0]?.[0]} ${pts[0]?.[1]}L${pts[n >> 1]?.[0]} ${pts[n >> 1]?.[1]}`
    const cls = i % 2 ? 'bgBs' : 'bgAs'
    const major = pts[1] ?? [cx, cy]
    return `<g class="bgDr${i % 2 ? '2' : ''}"${an(30 + i * 4, i * 5)}><path d="${lines}" fill="none" class="${cls}" stroke-width="1.2" opacity=".5"/>
<circle cx="${major[0]}" cy="${major[1]}" r="16" class="${i % 2 ? 'bgB' : 'bgA'}" opacity=".18"/><circle cx="${major[0]}" cy="${major[1]}" r="6" class="${i % 2 ? 'bgB' : 'bgA'}"/>
<g class="bgW">${pts.map((p, j) => (j === 1 ? '' : `<circle${j % 2 ? ' class="bgTw"' : ''} cx="${p[0]}" cy="${p[1]}" r="${r(2 + rnd(i + j, 3) * 2.6)}"${j % 2 ? an(3 + (j % 3), j + i) : ''}/>`)).join('')}</g></g>`
  }
  const orbit = (x: number, y: number, rr: number, tilt: number, t: number, cls: string) =>
    `<g transform="translate(${x} ${y}) rotate(${tilt}) scale(1 .34)"><g class="bgSpin"${an(t)}><circle r="${rr}" fill="none" class="${cls}" stroke-width="5" stroke-linecap="round" stroke-dasharray="0 18" opacity=".8"/><circle cx="${rr}" r="10" class="bgB"/></g></g>`
  return {
    defs: `<pattern id="bgDg" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="14" cy="14" r="1.3" class="bgT4"/></pattern>
<radialGradient id="bgPl" cx=".35" cy=".3" r=".8"><stop offset="0" class="bgsB"/><stop offset="1" class="bgsA"/></radialGradient>`,
    back: [
      `<rect width="${W}" height="${H}" fill="url(#bgDg)" opacity=".55"/>
<g fill="none" class="bgTs" stroke-width="1" stroke-dasharray="2 10" opacity=".55">${[700, 900, 1100].map(rr => `<circle cx="800" cy="1500" r="${rr}"/>`).join('')}<ellipse cx="800" cy="1500" rx="360" ry="1100"/><ellipse cx="800" cy="1500" rx="760" ry="1100"/></g>
<circle cx="190" cy="200" r="260" fill="url(#bgGA)" opacity=".7"/><circle cx="1420" cy="560" r="300" fill="url(#bgGB)" opacity=".6"/>
${stars.map(constellation).join('')}
${orbit(290, 410, 120, -18, 40, 'bgAs')}<circle cx="290" cy="410" r="44" fill="url(#bgPl)"/>
${orbit(1510, 700, 70, 14, 28, 'bgBs')}<circle cx="1510" cy="700" r="26" class="bgA"/>
${N(8, i => `<circle class="bgA bgSeg" cx="${48 + i * 38}" cy="70" r="7"${an(undefined, 6 - i * 0.4)}/>`)}
${N(8, i => `<circle class="bgB bgSeg" cx="1572" cy="${380 + i * 38}" r="6"${an(undefined, 6 - i * 0.4)}/>`)}`,
    ],
    walkers: [
      { feet: 330, x: 380, s: 1.6, t: 104, dir: 1, c: 'fable' },
      { feet: 500, x: 1240, s: 2, t: 84, dir: -1, c: 'explore' },
      { feet: 670, x: 700, s: 2.4, t: 68, dir: 1, c: 'careful' },
      { feet: 830, x: 1100, s: 2.8, t: 56, dir: -1, c: 'm-think' },
    ],
    veil: 0.55,
    top: `<circle cx="1462" cy="256" r="150" fill="url(#bgGA)" opacity=".6"/><circle cx="1462" cy="256" r="58" fill="url(#bgPl)"/><circle cx="1440" cy="240" r="9" class="bgH" opacity=".18"/><circle cx="1484" cy="276" r="6" class="bgH" opacity=".14"/>${art.crab(1417, 256 - 58 - 3 * CRAB_H + 10, 'm-think', false, true, 3)}`,
  }
}

// 6. Spark: a night sky of sparkles, shooting stars, a crescent moon.
const sparkScene = (art: CrabArt): Scene => {
  const shoot = (x: number, y: number, a: number, t: number, lead: number) =>
    `<g transform="translate(${x} ${y}) rotate(${a})"><g class="bgShoot"${an(t, lead)}><rect x="-190" y="-1.2" width="190" height="2.4" rx="1.2" fill="url(#bgShootG)"/><circle r="2.8" class="bgW"/></g></g>`
  const tree = (x: number, y: number, s: number) => `<path d="M${x} ${y - 46 * s}l${-16 * s} ${30 * s}h${32 * s}zM${x} ${y - 30 * s}l${-20 * s} ${30 * s}h${40 * s}z"/>`
  return {
    defs: `<linearGradient id="bgShootG"><stop offset="0" class="bgsW" stop-opacity="0"/><stop offset="1" class="bgsW" stop-opacity=".95"/></linearGradient>
<mask id="bgMoonM"><rect x="1300" y="100" width="300" height="260" fill="#fff"/><circle cx="1492" cy="200" r="76" fill="#000"/></mask>`,
    css: `.bgShoot{animation:bgShoot 12s linear infinite}@keyframes bgShoot{0%{transform:translateX(0);opacity:0}3%{opacity:1}12%{transform:translateX(760px);opacity:0}100%{transform:translateX(760px);opacity:0}}
.bgSpk{animation:bgSpk 5s ease-in-out infinite}@keyframes bgSpk{0%,100%{transform:scale(.35);opacity:.25}50%{transform:scale(1);opacity:1}}`,
    back: [
      `<rect y="560" width="${W}" height="440" fill="url(#bgGlowLow)"/>
${[0, 1, 2]
  .map(g => `<g class="bgW bgTw"${an(4 + g * 1.6, g * 2)}>${N(30, i => `<circle cx="${Math.round(i % 3 ? edgeX(rnd(i, g)) : rnd(i, g + 4) * W)}" cy="${Math.round(rnd(i, g + 7) * 760)}" r="${r(0.7 + rnd(i, g + 11) * 1.2)}"/>`)}</g>`)
  .join('')}
<circle cx="210" cy="170" r="190" fill="url(#bgGB)"/>
<g class="bgSpin bgFx"${an(120)}><path class="bgB" opacity=".35" d="${spark(210, 170, 120)}"/></g>
<path class="bgB" d="${spark(210, 170, 58)}"/><path class="bgH" opacity=".5" d="${spark(210, 170, 26)}" transform="rotate(45 210 170)"/>
${N(18, i => {
        const x = edgeX(rnd(i, 21), 560)
        const y = 60 + rnd(i, 22) * 640
        const s = 7 + rnd(i, 23) * 16
        return `<path class="${pick(['bgA', 'bgB', 'bgW'], i)} bgSpk bgFx" d="${spark(x, y, s)}"${an(3.5 + rnd(i, 24) * 3, rnd(i, 25) * 6)}/>`
      })}
${shoot(320, 70, 26, 11, 2)}${shoot(880, 40, 30, 15, 7)}${shoot(1150, 130, 22, 19, 12)}${shoot(560, 210, 28, 23, 17)}`,
      `<path class="bgT1" d="M-50 1000V830Q400 770 800 850T1650 810V1000Z"/>
<path class="bgT2" d="M-50 1000V740Q120 620 300 700Q420 760 540 830V1000Z"/><path class="bgT2" d="M1650 1000V690Q1480 590 1320 680Q1200 750 1070 830V1000Z"/>
<g class="bgK">${[
        [60, 720, 1.2], [130, 700, 0.9], [230, 716, 1.1], [420, 790, 0.8], [1220, 730, 0.9], [1340, 690, 1.2], [1440, 660, 1], [1540, 660, 1.3],
      ]
        .map(([x, y, s]) => tree(x as number, y as number, s as number))
        .join('')}</g>
<g>${N(14, i => {
        const x = edgeX(rnd(i, 31), 440)
        return `<circle class="${i % 2 ? 'bgB' : 'bgA'} bgRise" cx="${Math.round(x)}" cy="${Math.round(760 + rnd(i, 32) * 80)}" r="${r(1.6 + rnd(i, 33) * 1.8)}"${an(8 + rnd(i, 34) * 6, rnd(i, 35) * 12)}/>`
      })}</g>`,
    ],
    walkers: [
      { feet: 300, x: 420, s: 1.6, t: 110, dir: 1, z: 0, c: 'plan' },
      { feet: 480, x: 1180, s: 2, t: 86, dir: -1, z: 0, c: 'm-work' },
      { feet: 650, x: 640, s: 2.4, t: 70, dir: 1, z: 0, c: 'medium' },
      { feet: 860, x: 1000, s: 2.8, t: 56, dir: -1, c: 'other' },
    ],
    veil: 0.5,
    top: `<circle cx="1450" cy="230" r="200" fill="url(#bgGB)" opacity=".7"/><circle cx="1450" cy="230" r="86" class="bgB" mask="url(#bgMoonM)"/>${art.crab(1436, 284 - 2.6 * CRAB_H, 'm-sleep', false, true, 2.6)}`,
  }
}

// 7. Classic: a retro terminal, a checker floor, scanlines and a blinking cursor.
const classic = (art: CrabArt): Scene => {
  const hz = 620
  const vx = 800
  const rows = 10
  const rowY = (i: number) => hz + (H - hz) * Math.pow(i / rows, 1.8)
  const colX = (xb: number, y: number) => vx + ((xb - vx) * (y - hz)) / (H - hz)
  let floor = ''
  for (let i = 0; i < rows; i++)
    for (let j = -6; j < 16; j++) {
      if ((i + j) % 2 === 0) continue
      const y0 = rowY(i)
      const y1 = rowY(i + 1)
      const a = j * 160 - 960
      const b = a + 160
      floor += `M${r(colX(a, y0))} ${r(y0)}L${r(colX(b, y0))} ${r(y0)}L${r(colX(b, y1))} ${r(y1)}L${r(colX(a, y1))} ${r(y1)}Z`
    }
  const frame = (x: number, y: number, w: number, h: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" class="bgT2"/><rect x="${x}" y="${y}" width="${w}" height="26" rx="6" class="bgT3"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="none" class="bgAs" stroke-width="2"/>
<rect x="${x + 10}" y="${y + 8}" width="10" height="10" class="bgA"/><rect x="${x + 26}" y="${y + 8}" width="10" height="10" class="bgB"/><rect x="${x + 42}" y="${y + 8}" width="10" height="10" class="bgT5"/>`
  const bar = (x: number, y: number, n: number, full: number, k = 16) =>
    N(n, i => {
      const fill = i < full ? 'class="bgA"' : i < full + 2 ? 'fill="url(#bgD1)"' : i < full + 4 ? 'fill="url(#bgD2)"' : ''
      return fill ? `<rect x="${x + i * (k + 2)}" y="${y}" width="${k}" height="${k}" ${fill}/>` : `<rect x="${x + i * (k + 2) + k / 2 - 2}" y="${y + k / 2 - 2}" width="4" height="4" class="bgT5"/>`
    })
  const textRows = (x: number, y: number, n: number, w: number, seed: number) =>
    N(n, i => {
      let cx = x + 16
      let out = `<rect x="${x}" y="${y + i * 22}" width="8" height="10" class="bgA"/>`
      for (let k = 0; k < 4; k++) {
        const ww = 18 + Math.round(rnd(seed + i, k) * 60)
        if (cx + ww > x + w) break
        out += `<rect x="${cx}" y="${y + i * 22 + 1}" width="${ww}" height="8" class="${k === 0 && i % 3 === 0 ? 'bgB' : 'bgT5'}"/>`
        cx += ww + 10
      }
      return `<g class="bgType"${an(undefined, 16 - i * 0.9)}>${out}</g>`
    })
  return {
    defs: `<pattern id="bgD1" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="2" class="bgA"/><rect y="2" width="2" height="2" class="bgA"/></pattern>
<pattern id="bgD2" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="2" height="2" class="bgA"/><rect x="2" y="2" width="2" height="2" class="bgA"/></pattern>
<pattern id="bgScan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.2" class="bgK"/></pattern>
<linearGradient id="bgBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgsA" stop-opacity="0"/><stop offset=".5" class="bgsA" stop-opacity=".1"/><stop offset="1" class="bgsA" stop-opacity="0"/></linearGradient>
<linearGradient id="bgHz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgsA" stop-opacity="0"/><stop offset="1" class="bgsA" stop-opacity=".3"/></linearGradient>`,
    css: `.bgType{animation:bgType 18s steps(1) infinite}@keyframes bgType{0%{opacity:0}4%,92%{opacity:1}100%{opacity:0}}
.bgCur{animation:bgCur 1s steps(2) infinite}@keyframes bgCur{50%{opacity:0}}
.bgScanY{animation:bgScanY 9s linear infinite}@keyframes bgScanY{from{transform:translateY(0)}to{transform:translateY(1200px)}}`,
    light: () => `#bgScan rect{opacity:.35}`,
    back: [
      `<g class="bgW">${N(24, i => `<rect class="bgTw" x="${Math.round(edgeX(rnd(i, 1), 640))}" y="${Math.round(20 + rnd(i, 2) * 560)}" width="3" height="3"${an(3 + (i % 4), i * 0.5, 'animation-timing-function:steps(2)')}/>`)}</g>
<rect y="${hz - 90}" width="${W}" height="90" fill="url(#bgHz)"/>
<g class="bgBob"${an(12, 3)}>${frame(640, 70, 320, 120)}${bar(664, 116, 15, 9)}${bar(664, 150, 15, 5)}</g>`,
      `<rect y="${hz}" width="${W}" height="${H - hz}" class="bgT1"/><path class="bgM2" d="${floor}"/><rect y="${hz - 1}" width="${W}" height="3" class="bgA"/>`,
    ],
    walkers: [
      { feet: hz + 30, x: 460, s: 1.6, t: 110, dir: 1, c: 'careful' },
      { feet: hz + 110, x: 1180, s: 2, t: 86, dir: -1, c: 'other' },
      { feet: hz + 220, x: 700, s: 2.5, t: 68, dir: 1, c: 'light' },
      { feet: hz + 330, x: 1000, s: 3, t: 56, dir: -1, c: 'm-work' },
    ],
    veil: 0.55,
    top: `<g class="bgBob"${an(10)}>${frame(24, 150, 330, 420)}${textRows(42, 192, 11, 290, 3)}${bar(42, 446, 16, 8)}${bar(42, 476, 16, 4)}<rect class="bgA bgCur" x="42" y="512" width="12" height="18"/></g>
<g class="bgBob"${an(13, 5)}>${frame(1250, 280, 320, 330)}${N(6, i => `<rect x="1268" y="${328 + i * 44}" width="${40 + Math.round(rnd(i, 9) * 30)}" height="8" class="bgT5"/>${bar(1268, 344 + i * 44, 14, Math.round(2 + rnd(i, 10) * 9), 14)}`)}${art.crab(1360, 280 - 3 * CRAB_H + 2, 'm-sleep', false, true, 3)}</g>
<g class="bgScanY"><rect y="-160" width="${W}" height="160" fill="url(#bgBand)"/></g>
<rect width="${W}" height="${H}" fill="url(#bgScan)" opacity=".5"/>`,
  }
}

// 8. Wave: layered rolling waves, foam, a lighthouse sweeping its beam, a surfer.
const wave = (art: CrabArt): Scene => {
  const lv = [
    { y: 440, amp: 8, per: 200, t: 26, cls: 'bgM3', foam: 'bgW', fo: 0.3 },
    { y: 545, amp: 12, per: 260, t: 20, cls: 'bgM2', foam: 'bgB', fo: 0.6 },
    { y: 660, amp: 16, per: 320, t: 16, cls: 'bgM3', foam: 'bgW', fo: 0.4 },
    { y: 775, amp: 18, per: 380, t: 13, cls: 'bgM2', foam: 'bgA', fo: 0.6 },
    { y: 890, amp: 14, per: 440, t: 11, cls: 'bgM1', foam: 'bgW', fo: 0.25 },
  ]
  const layer = (i: number) => {
    const l = lv[i]
    if (!l) return ''
    const dir = i % 2 ? 1 : -1
    return `<g class="bgBob"${an(6 + i, i * 1.3)}><g class="bgRl" style="animation:bgRoll${i} ${l.t}s linear infinite${dir > 0 ? ' reverse' : ''}"><path class="${l.cls}" d="${wavePath(l.y, l.amp, l.per, -l.per * 2, W + l.per * 2)}"/><path class="${l.foam}s" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="${l.per * 0.18} ${l.per * 0.32}" opacity="${l.fo}" d="${wavePath(l.y + 2, l.amp, l.per, -l.per * 2, W + l.per * 2, true)}"/></g></g>`
  }
  const tower = (y0: number, y1: number) => {
    const x = (y: number) => 33 * (1 - (y - 230) / 170) + 23 * ((y - 230) / 170)
    return `M${r(173 - x(y0))} ${y0}L${r(173 + x(y0))} ${y0}L${r(173 + x(y1))} ${y1}L${r(173 - x(y1))} ${y1}Z`
  }
  return {
    defs: `<linearGradient id="bgBeamG" gradientUnits="userSpaceOnUse" x1="173" y1="0" x2="1100" y2="0"><stop offset="0" class="bgsB" stop-opacity=".55"/><stop offset="1" class="bgsB" stop-opacity="0"/></linearGradient>`,
    css:
      lv.map((l, i) => `@keyframes bgRoll${i}{to{transform:translateX(${l.per}px)}}`).join('') +
      `.bgBeam{transform-origin:173px 204px;animation:bgBeam 10s ease-in-out infinite}@keyframes bgBeam{0%,100%{transform:rotate(-7deg);opacity:.55}50%{transform:rotate(9deg);opacity:1}}
.bgSurf{animation:bgSurf 6s ease-in-out infinite}@keyframes bgSurf{0%,100%{transform:translate(0,0) rotate(-4deg)}50%{transform:translate(-70px,-20px) rotate(5deg)}}`,
    back: [
      `<g class="bgW">${N(26, i => `<circle class="bgTw" cx="${Math.round(edgeX(rnd(i, 1), 640))}" cy="${Math.round(20 + rnd(i, 2) * 360)}" r="${r(0.8 + rnd(i, 3))}"${an(4 + (i % 3), i * 0.6)}/>`)}</g>
<ellipse cx="420" cy="420" rx="560" ry="300" fill="url(#bgGB)" opacity=".8"/><ellipse cx="1400" cy="400" rx="420" ry="260" fill="url(#bgGA)" opacity=".6"/><circle cx="420" cy="140" r="46" class="bgB"/>
${[
  [600, 90, 220, 30, 64],
  [980, 160, 160, 24, 50],
  [1240, 70, 200, 28, 72],
]
  .map(([x, y, w, h, t], i) => `<g class="bgDx"${an(t, i * 13)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(h as number) / 2}" class="bgT4" opacity=".4"/></g>`)
  .join('')}
<g class="bgDx"${an(80, 30)}><g class="bgWs" fill="none" stroke-width="1.8" stroke-linecap="round">${[
        [640, 210], [670, 196], [700, 222], [1060, 250], [1090, 238],
      ]
        .map(([x, y]) => `<path d="M${x} ${y}q7 -8 14 0q7 -8 14 0"/>`)
        .join('')}</g></g>
<rect y="${pick(lv, 0).y}" width="${W}" height="${H - pick(lv, 0).y}" class="bgM1"/>${layer(0)}
<g class="bgB">${N(8, i => `<rect class="bgTw" x="${r(420 - (60 - i * 5) / 2 + (rnd(i, 4) - 0.5) * 20)}" y="${452 + i * 12}" width="${60 - i * 5}" height="2.4" rx="1.2"${an(2.4 + (i % 3), i * 0.4)}/>`)}</g>
<path class="bgT2" d="M-20 560L20 400Q80 360 150 392L230 380Q300 390 330 450L350 560Z"/><path class="bgT4" d="${tower(230, 400)}"/><path class="bgA" d="${tower(262, 292)}${tower(330, 360)}"/>
<rect x="136" y="222" width="74" height="9" class="bgT5"/><circle cx="173" cy="204" r="70" fill="url(#bgGB)"/><rect x="152" y="186" width="42" height="36" class="bgB"/><path class="bgT5" d="M146 186L173 160L200 186Z"/>
<path class="bgBeam" fill="url(#bgBeamG)" d="M173 204L1100 110L1100 300Z"/>
<path class="bgT2" d="M1330 560L1360 380L1420 340L1500 330L1560 350L1620 390V560Z"/><path class="bgT4" opacity=".6" d="M1420 340L1500 330L1560 350L1556 358L1500 340L1424 348Z"/>`,
      layer(1),
      `${layer(2)}<g transform="translate(1250 ${pick(lv, 2).y - 84})"><g class="bgSurf bgFx"><ellipse cx="40" cy="80" rx="66" ry="8" class="bgB"/><rect x="-24" y="77" width="128" height="3" rx="1.5" class="bgH" opacity=".4"/>${art.crab(1, 80 - 2.6 * CRAB_H + 3, 'light', false, true, 2.6)}</g></g>`,
      layer(3),
      layer(4),
    ],
    walkers: [
      { feet: pick(lv, 1).y + 8, x: 760, s: 1.6, t: 116, dir: -1, z: 0, c: 'heavy' },
      { feet: pick(lv, 2).y + 10, x: 300, s: 2, t: 90, dir: 1, z: 1, c: 'fable' },
      { feet: pick(lv, 3).y + 12, x: 1100, s: 2.4, t: 72, dir: -1, z: 2, c: 'explore' },
      { feet: pick(lv, 4).y + 14, x: 600, s: 2.8, t: 60, dir: 1, z: 3, c: 'm-think' },
    ],
    veil: 0.5,
    top: art.crab(1418, 336 - 3 * CRAB_H + 4, 'm-think', false, true, 3),
  }
}

// 9. Stripes: a candy beach in striped bands, umbrellas, bunting, a balloon.
const stripes = (art: CrabArt): Scene => {
  const sea = 430
  const sand = 650
  const p1 = 64 / Math.cos((35 * Math.PI) / 180)
  const p2 = 40 / Math.cos((35 * Math.PI) / 180)
  const band = (y: number, h: number, fill: string, op: number, cls: string) =>
    `<svg y="${y}" width="${W}" height="${h}" overflow="hidden"><rect class="${cls}" x="-160" width="${W + 320}" height="${h}" fill="url(#${fill})" opacity="${op}"/></svg>`
  const garland = (x0: number, y0: number, x1: number, y1: number, sag: number, n: number, seed: number) => {
    const cx = (x0 + x1) / 2
    const cy = (y0 + y1) / 2 + sag
    const at = (t: number): [number, number] => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1]
    const flags = N(n, i => {
      const [x, y] = at((i + 0.5) / n)
      return `<path class="${pick(['bgA', 'bgB', 'bgT5'], i + seed)} bgSwing bgFt" d="M${r(x - 13)} ${r(y)}h26l-13 28z"${an(3 + (i % 3) * 0.7, i * 0.4)}/>`
    })
    return `<path d="M${x0} ${y0}Q${cx} ${cy} ${x1} ${y1}" fill="none" class="bgT5s" stroke-width="1.6"/>${flags}`
  }
  const umbrella = (x: number, y: number, rr: number, foot: number, lead: number) => {
    const wedges = N(6, i => {
      const a0 = Math.PI + (i * Math.PI) / 6
      const a1 = a0 + Math.PI / 6
      return `<path class="${i % 2 ? 'bgB' : 'bgA'}" d="M${x} ${y}L${r(x + Math.cos(a0) * rr)} ${r(y + Math.sin(a0) * rr)}A${rr} ${rr} 0 0 1 ${r(x + Math.cos(a1) * rr)} ${r(y + Math.sin(a1) * rr)}Z"/>`
    })
    return `<ellipse cx="${x + 24}" cy="${foot + 6}" rx="${rr * 0.8}" ry="12" class="bgK" opacity=".18"/><path d="M${x} ${y - 6}L${x + 18} ${foot}" class="bgT5s" stroke-width="6" stroke-linecap="round"/>
<g class="bgUmb" style="transform-origin:${x}px ${y}px;animation-delay:-${lead}s">${wedges}<path d="M${x - rr} ${y}${N(6, () => `q${rr / 6} 14 ${rr / 3} 0`)}" class="bgT5s" fill="none" stroke-width="2" opacity=".5"/><circle cx="${x}" cy="${y - rr}" r="6" class="bgT5"/></g>`
  }
  return {
    defs: `<pattern id="bgSt1" width="64" height="64" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="26" height="64" class="bgB"/></pattern>
<pattern id="bgSt2" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><rect width="16" height="40" class="bgA"/></pattern>
<pattern id="bgSt3" width="48" height="48" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="18" height="48" class="bgT5"/></pattern>
<pattern id="bgSt4" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="15" height="30" class="bgA"/><rect x="15" width="15" height="30" class="bgB"/></pattern>
<pattern id="bgSt5" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="10" class="bgA"/><rect y="10" width="20" height="10" class="bgH"/></pattern>`,
    css: `.bgRoll1{animation:bgRoll1 9s linear infinite}@keyframes bgRoll1{to{transform:translateX(${r(p1)}px)}}
.bgRoll2{animation:bgRoll2 5s linear infinite}@keyframes bgRoll2{to{transform:translateX(${r(-p2)}px)}}
.bgUmb{animation:bgUmb 7s ease-in-out infinite}@keyframes bgUmb{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
.bgBall{animation:bgBall 2.2s infinite}@keyframes bgBall{0%,100%{transform:translateY(0);animation-timing-function:cubic-bezier(.2,.6,.4,1)}50%{transform:translateY(-130px);animation-timing-function:cubic-bezier(.6,0,.8,.4)}}`,
    back: [
      `${band(0, sea, 'bgSt1', 0.09, 'bgRoll1')}
<g class="bgSpin" style="transform-origin:190px 150px;animation-duration:140s">${N(16, i => {
        const a0 = (i * Math.PI) / 8
        const a1 = a0 + Math.PI / 16
        return `<path class="${i % 2 ? 'bgB' : 'bgA'}" opacity=".3" d="M190 150L${r(190 + Math.cos(a0) * 360)} ${r(150 + Math.sin(a0) * 360)}L${r(190 + Math.cos(a1) * 360)} ${r(150 + Math.sin(a1) * 360)}Z"/>`
      })}</g>
<circle cx="190" cy="150" r="80" class="bgB"/><circle cx="190" cy="150" r="62" fill="none" class="bgHs" stroke-width="3" opacity=".35"/>
${garland(-10, 40, 560, 60, 110, 14, 0)}${garland(1040, 70, 1610, 40, 110, 14, 1)}
<rect y="${sea}" width="${W}" height="${sand - sea + 30}" class="bgM2"/>${band(sea, sand - sea + 20, 'bgSt2', 0.22, 'bgRoll2')}
<path d="M0 ${sea}H${W}" class="bgAs" stroke-width="2" opacity=".5"/>
<g transform="translate(1250 ${sea + 120})"><g class="bgDx"${an(44)}><g class="bgBob"${an(5)}><path class="bgT5" d="M-34 0h68l-12 12h-44z"/><path fill="url(#bgSt4)" d="M0 -4V-80L44 -6Z"/></g></g></g>`,
      `<path class="bgT4" d="${wavePath(sand, 10, 120, -120, W + 120)}"/>${band(sand + 14, H - sand, 'bgSt3', 0.25, '')}
<path class="bgHs" fill="none" stroke-width="3" opacity=".55" d="${wavePath(sand - 2, 10, 120, -120, W + 120, true)}"/>
<rect x="34" y="770" width="150" height="70" rx="6" fill="url(#bgSt5)" opacity=".85" transform="rotate(-8 109 805)"/>
${umbrella(210, 640, 140, 830, 0)}${umbrella(1430, 690, 124, 860, 3)}
<ellipse cx="1290" cy="868" rx="26" ry="6" class="bgK" opacity=".2"/><g class="bgBall"><circle cx="1290" cy="836" r="28" class="bgH"/><path class="bgA" d="M1290 808A28 28 0 0 1 1318 836H1290Z"/><path class="bgB" d="M1290 864A28 28 0 0 1 1262 836H1290Z"/><circle cx="1290" cy="836" r="28" fill="none" class="bgT5s" stroke-width="2"/></g>`,
    ],
    walkers: [
      { feet: 590, x: 900, s: 1.6, t: 104, dir: -1, z: 0, c: 'medium' },
      { feet: 720, x: 420, s: 2, t: 84, dir: 1, z: 1, c: 'm-work' },
      { feet: 800, x: 1180, s: 2.4, t: 68, dir: -1, z: 1, c: 'plan' },
      { feet: 900, x: 640, s: 2.8, t: 56, dir: 1, z: 1, c: 'careful' },
    ],
    veil: 0.55,
    top: `<g class="bgBob"${an(10)}><path fill="url(#bgSt4)" d="M1450 110C1545 110 1565 210 1505 290L1474 322H1426L1395 290C1335 210 1355 110 1450 110Z"/><ellipse cx="1418" cy="170" rx="18" ry="34" class="bgH" opacity=".22"/>
<path d="M1428 322L1424 352M1472 322L1476 352" class="bgT5s" stroke-width="2"/>${art.crab(1415, 366 - 2.4 * CRAB_H - 14, 'm-think', false, true, 2.4)}<rect x="1418" y="352" width="64" height="34" rx="5" class="bgT5"/><path d="M1418 364h64M1418 376h64" class="bgKs" stroke-width="1.4" opacity=".3"/></g>`,
  }
}

// 10. Neon: a synthwave sun, a perspective grid rolling in, glowing tubes and palms.
const neon = (art: CrabArt): Scene => {
  const hz = 600
  const verts = N(36, i => `M800 ${hz}L${-1650 + i * 140} ${H}`)
  const palm = (x: number, base: number, top: [number, number], lead: number) => {
    const [tx, ty] = top
    const fronds = [
      [-130, 10], [-100, 50], [-40, 70], [70, 60], [120, 30], [140, -10], [-60, -50], [60, -50],
    ]
      .map(([dx, dy]) => `M${tx} ${ty}q${(dx as number) * 0.5} ${-40 + (dy as number) * 0.2} ${dx} ${dy}`)
      .join('')
    return `<path d="M${x} ${base}Q${x - 20} ${(base + ty) / 2} ${tx} ${ty}" class="bgKs" fill="none" stroke-width="14" stroke-linecap="round"/><g class="bgSway" style="transform-origin:${tx}px ${ty}px;animation-delay:-${lead}s"><path d="${fronds}" class="bgKs" fill="none" stroke-width="9" stroke-linecap="round"/></g>`
  }
  const tube = (x: number, y: number, w: number, h: number, cls: string) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="none" class="${cls}" stroke-width="9" opacity=".18"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="none" class="${cls}" stroke-width="3"/>`
  return {
    defs: `<linearGradient id="bgSunG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgsB"/><stop offset="1" class="bgsA"/></linearGradient>
<linearGradient id="bgHzG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgsA" stop-opacity="0"/><stop offset="1" class="bgsA" stop-opacity=".4"/></linearGradient>
<linearGradient id="bgHaze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgsT1"/><stop offset="1" class="bgsT1" stop-opacity="0"/></linearGradient>
<mask id="bgSunM"><rect x="1100" y="300" width="500" height="320" fill="#fff"/>${[
      [478, 4], [504, 6], [532, 8], [562, 10], [592, 12],
    ]
      .map(([y, h]) => `<rect x="1100" y="${y}" width="500" height="${h}" fill="#000"/>`)
      .join('')}</mask>`,
    css: `.bgHz{animation:bgHz 7.2s cubic-bezier(.55,0,1,.45) infinite}@keyframes bgHz{0%{transform:translateY(0);opacity:0}20%{opacity:.9}100%{transform:translateY(${H - hz}px);opacity:1}}
.bgFlick{animation:bgFlick 6s steps(1) infinite}@keyframes bgFlick{0%,90%,94%,100%{opacity:1}91%,95%{opacity:.3}}
.bgSway{animation:bgSway 6s ease-in-out infinite}@keyframes bgSway{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}`,
    back: [
      `<rect y="380" width="${W}" height="${hz - 380}" fill="url(#bgHzG)"/>
<g class="bgW">${N(30, i => `<circle class="bgTw" cx="${Math.round(edgeX(rnd(i, 1), 700))}" cy="${Math.round(20 + rnd(i, 2) * 380)}" r="${r(0.8 + rnd(i, 3))}"${an(3 + (i % 4), i * 0.5)}/>`)}</g>
<circle cx="1350" cy="520" r="380" fill="url(#bgGA)"/><circle cx="1350" cy="560" r="190" fill="url(#bgSunG)" mask="url(#bgSunM)"/>
<g class="bgBs" fill="none" stroke-width="1.6" opacity=".4">${[430, 470, 520].map((y, i) => `<path d="M${-40 + i * 30} ${y}h${360 - i * 60}"/>`).join('')}</g>`,
      `<path class="bgT1" d="M-40 ${hz}L80 430L170 520L280 400L430 ${hz}Z"/><path d="M-40 ${hz}L80 430L170 520L280 400L430 ${hz}" fill="none" class="bgAs" stroke-width="8" opacity=".16"/><path d="M-40 ${hz}L80 430L170 520L280 400L430 ${hz}M80 430L60 ${hz}M80 430L130 ${hz}M280 400L250 ${hz}M280 400L340 ${hz}" fill="none" class="bgAs" stroke-width="2" opacity=".85"/>
<rect y="${hz}" width="${W}" height="${H - hz}" class="bgT1"/>
<path d="${verts}" class="bgAs" stroke-width="6" opacity=".1"/><path d="${verts}" class="bgAs" stroke-width="1.4" opacity=".55"/>
${N(9, i => `<path class="bgHz bgAs" d="M0 ${hz}H${W}" stroke-width="1.6"${an(undefined, i * 0.8)}/>`)}
<rect y="${hz}" width="${W}" height="70" fill="url(#bgHaze)"/><rect y="${hz - 1.5}" width="${W}" height="3" class="bgA"/><rect y="${hz - 8}" width="${W}" height="16" class="bgA" opacity=".12"/>
${palm(90, 900, [60, 520], 0)}${palm(1520, 860, [1548, 470], 2)}
<g class="bgFlick">${tube(36, 150, 270, 96, 'bgBs')}<rect x="70" y="183" width="130" height="30" rx="15" class="bgA"/>${tube(70, 183, 200, 30, 'bgAs')}</g>`,
    ],
    walkers: [
      { feet: hz + 2, x: 700, s: 1.6, t: 120, dir: -1, z: 0, c: 'light' },
      { feet: 700, x: 300, s: 2, t: 88, dir: 1, c: 'other' },
      { feet: 800, x: 1150, s: 2.5, t: 70, dir: -1, c: 'heavy' },
      { feet: 900, x: 640, s: 3, t: 56, dir: 1, c: 'fable' },
    ],
    veil: 0.55,
    top: `<g class="bgFlick" style="animation-delay:-3s">${tube(1290, 250, 250, 64, 'bgAs')}${N(6, i => `<circle class="bgB bgSeg" cx="${1328 + i * 35}" cy="282" r="8"${an(undefined, 5 - i * 0.4)}/>`)}</g>${art.crab(1372, 250 - 3 * CRAB_H + 2, 'm-sleep', false, true, 3)}`,
  }
}

// 11. Glass: soft bokeh, light beams and glossy lenses; a crab floats in a bubble.
const glass = (art: CrabArt): Scene => {
  const lens = (cx: number, cy: number, rr: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="url(#bgLens)" class="bgLr" stroke-width="1.4"/><ellipse cx="${r(cx - rr * 0.36)}" cy="${r(cy - rr * 0.44)}" rx="${r(rr * 0.34)}" ry="${r(rr * 0.16)}" transform="rotate(-30 ${r(cx - rr * 0.36)} ${r(cy - rr * 0.44)})" class="bgH" opacity=".55"/><path d="M${r(cx + Math.cos(0.35) * (rr - 4))} ${r(cy + Math.sin(0.35) * (rr - 4))}A${rr - 4} ${rr - 4} 0 0 1 ${r(cx + Math.cos(1.9) * (rr - 4))} ${r(cy + Math.sin(1.9) * (rr - 4))}" fill="none" class="bgAs" stroke-width="2.4" stroke-linecap="round" opacity=".6"/>`
  const blobs: [number, number, number, string, number][] = [
    [120, 180, 340, 'A', 34], [1480, 200, 370, 'B', 40], [260, 820, 310, 'B', 46], [1380, 800, 350, 'A', 38], [820, 40, 230, 'A', 50], [640, 960, 220, 'B', 44],
  ]
  return {
    defs: `<radialGradient id="bgLens" cx=".5" cy=".5" r=".5"><stop offset="0" class="bgsH" stop-opacity=".02"/><stop offset=".72" class="bgsH" stop-opacity=".06"/><stop offset=".93" class="bgsH" stop-opacity=".22"/><stop offset="1" class="bgsH" stop-opacity=".45"/></radialGradient>
<linearGradient id="bgBeamG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgsH" stop-opacity=".2"/><stop offset="1" class="bgsH" stop-opacity="0"/></linearGradient>`,
    css: `.bgLr{stroke:#fff;stroke-opacity:.5}`,
    light: t => `.bgLr{stroke:${pick(t.t, 3)}}#bgLens stop:last-child{stop-opacity:.7}`,
    back: [
      `${blobs.map(([x, y, rr, c, t], i) => `<g class="bgDr${i % 2 ? '2' : ''}"${an(t, i * 6)}><circle cx="${x}" cy="${y}" r="${rr}" fill="url(#bgG${c})"/></g>`).join('')}
${[
  [120, 18], [330, 28], [1290, -24], [1500, -14],
]
  .map(([x, a], i) => `<g transform="translate(${x} -60) rotate(${a})"><rect class="bgPu" x="-46" width="92" height="1300" fill="url(#bgBeamG)"${an(7 + i * 2, i * 2)}/></g>`)
  .join('')}
${N(34, i => {
        const x = edgeX(rnd(i, 1), 560)
        const y = 30 + rnd(i, 2) * 820
        return `<circle class="${pick(['bgA', 'bgB', 'bgH'], i)} bgTw" cx="${Math.round(x)}" cy="${Math.round(y)}" r="${r(4 + rnd(i, 3) * 16)}" fill-opacity="${r(0.18 + rnd(i, 4) * 0.3)}"${an(6 + rnd(i, 5) * 6, rnd(i, 6) * 10)}/>`
      })}
${[
  [330, 250, 70], [110, 660, 54], [1300, 430, 80], [1500, 620, 60], [1190, 160, 40], [520, 120, 34], [1080, 770, 46],
]
  .map(([x, y, rr], i) => `<g class="bgBob"${an(7 + i * 1.3, i * 1.1)}>${lens(x as number, y as number, rr as number)}</g>`)
  .join('')}
<g transform="translate(1260 520)"><path d="M0 -60L60 50H-60Z" class="bgH" fill-opacity=".1" stroke="#fff" stroke-opacity=".5"/><g class="bgPu"${an(5)}><path d="M30 -5L340 -60L340 -30Z" class="bgA" opacity=".35"/><path d="M34 2L340 -20L340 10Z" class="bgB" opacity=".35"/><path d="M38 9L340 20L340 48Z" class="bgT5" opacity=".35"/></g></g>`,
    ],
    walkers: [
      { feet: 340, x: 420, s: 1.6, t: 108, dir: 1, c: 'explore' },
      { feet: 520, x: 1200, s: 2, t: 86, dir: -1, c: 'm-think' },
      { feet: 690, x: 640, s: 2.4, t: 70, dir: 1, c: 'medium' },
      { feet: 850, x: 1000, s: 2.8, t: 58, dir: -1, c: 'other' },
    ],
    veil: 0.45,
    top: `<g class="bgBob"${an(9)}><g class="bgDx"${an(30)}>${art.crab(200, 438, 'fable', false, true, 2.4)}${lens(236, 470, 96)}</g></g>
<rect x="1300" y="230" width="270" height="26" rx="13" class="bgH" fill-opacity=".14"/><rect x="1300" y="230" width="270" height="26" rx="13" fill="none" class="bgLr" stroke-width="1.4"/><rect x="1316" y="235" width="200" height="3" rx="1.5" class="bgH" opacity=".5"/>
${art.crab(1392, 230 - 3 * CRAB_H + 4, 'm-sleep', false, true, 3)}`,
  }
}

// 12. Stairs: stepped pyramids and terraces; crabs climb them.
const stairs = (art: CrabArt): Scene => {
  const base = 920
  const pyramid = (cx: number, hw: number, n: number, sh: number, inset: number) => {
    let body = ''
    let lip = ''
    let stair = ''
    for (let k = 0; k < n; k++) {
      const x = cx - hw + k * inset
      const w = 2 * hw - 2 * k * inset
      const y = base - (k + 1) * sh
      body += `M${x} ${y}h${w}v${sh}h${-w}z`
      lip += `M${x} ${y}h${w}v5h${-w}z`
      stair += `M${cx - 22} ${y}h44v${sh}h-44z`
    }
    return `<path class="bgM3" d="${body}"/><path class="bgA" opacity=".55" d="${lip}"/><path class="bgB" opacity=".28" d="${stair}"/>`
  }
  const far = (cx: number, hw: number, n: number) => {
    let d = ''
    for (let k = 0; k < n; k++) d += `M${cx - hw + k * 20} ${640 - (k + 1) * 22}h${2 * hw - k * 40}v22h${-(2 * hw - k * 40)}z`
    return d
  }
  let terr = `M0 ${H}`
  let lips = ''
  for (let x = 0; x < W; x += 100) {
    const y = Math.round((690 + 110 * (1 - edge(x + 50)) - 40 * edge(x + 50)) / 20) * 20
    terr += `V${y}h100`
    lips += `M${x} ${y}h100`
  }
  terr += `V${H}Z`
  const climber = (cls: string, x: number, feet: number, s: number, costume: string) =>
    `<g transform="translate(${x} ${r(feet - s * CRAB_H)})"><g class="${cls}">${art.crab(0, 0, costume, false, true, s)}</g></g>`
  const R = { cx: 1470, hw: 396, n: 11, sh: 52, inset: 36 }
  const L = { cx: 150, hw: 360, n: 8, sh: 52, inset: 40 }
  return {
    css: `${climbKeys('bgClimbR', R.n - 1, R.inset, -R.sh)}${climbKeys('bgClimbL', L.n - 1, -L.inset, -L.sh)}
.bgCr{animation:bgClimbR 26s ease-out infinite}.bgCl{animation:bgClimbL 21s ease-out infinite;animation-delay:-8s}`,
    back: [
      `<circle cx="230" cy="170" r="220" fill="url(#bgGB)"/><circle cx="230" cy="170" r="64" class="bgB"/>${[92, 116].map(rr => `<circle cx="230" cy="170" r="${rr}" fill="none" class="bgBs" stroke-width="2" opacity=".3"/>`).join('')}
${N(8, i => `<rect class="bgA bgSeg" x="${1262 + i * 36}" y="${178 - 10 - i * 10}" width="30" height="${10 + i * 10}" rx="4"${an(undefined, 6 - i * 0.4)}/>`)}
${[
  [520, 110, 50],
  [900, 70, 64],
  [1060, 190, 44],
]
  .map(([x, y, t], i) => `<g class="bgDx"${an(t, i * 12)}>${stamp(['..xxxx..', 'xxxxxxxx'], x as number, y as number, 22, { x: 'bgT5' }, ' opacity=".35"')}</g>`)
  .join('')}
<path class="bgM1" d="${far(380, 120, 5)}${far(620, 90, 4)}${far(820, 70, 3)}${far(1020, 90, 4)}${far(1220, 120, 5)}"/>`,
      `<path class="bgM2" d="${terr}"/><path d="${lips}" class="bgAs" stroke-width="2" opacity=".45"/>`,
      `${pyramid(L.cx, L.hw, L.n, L.sh, L.inset)}${pyramid(R.cx, R.hw, R.n, R.sh, R.inset)}`,
    ],
    walkers: [
      { feet: 600, x: 760, s: 1.6, t: 110, dir: 1, z: 0, c: 'heavy' },
      { feet: 760, x: 1100, s: 2.1, t: 84, dir: -1, z: 1, c: 'light' },
      { feet: 900, x: 600, s: 2.8, t: 60, dir: 1, z: 2, c: 'm-work' },
    ],
    veil: 0.55,
    top: `${climber('bgCr', R.cx - R.hw - 30, base, 1.8, 'careful')}${climber('bgCl', L.cx + L.hw - 14, base, 1.8, 'explore')}${art.crab(R.cx - 45, base - R.n * R.sh - 3 * CRAB_H + 3, 'm-think', false, true, 3)}`,
  }
}

const SCENES: Record<HudStyle, (art: CrabArt) => Scene> = {
  pixel,
  segments,
  line,
  solid,
  dots,
  spark: sparkScene,
  classic,
  wave,
  stripes,
  neon,
  glass,
  stairs,
}

const ORDER: HudStyle[] = ['pixel', 'segments', 'line', 'solid', 'dots', 'spark', 'classic', 'wave', 'stripes', 'neon', 'glass', 'stairs']

/** The crabs walking across: each with its own keyframes, so a still frame keeps it mid-screen. */
const parade = (list: Walker[], art: CrabArt, seed: number): { marks: string[]; css: string } => {
  const marks: string[] = []
  let css = ''
  list.forEach((w, i) => {
    const wide = 30 * w.s + 20
    const from = w.dir > 0 ? -w.x - wide : W + 20 - w.x
    const to = w.dir > 0 ? W + 20 - w.x : -w.x - wide
    const lead = (w.t * (0 - from)) / (to - from)
    const costume = w.c ?? pick(COSTUMES, seed * 3 + i * 2)
    css += `.bgC${i}{animation:bgW${i} ${w.t}s linear -${r(lead)}s infinite}@keyframes bgW${i}{from{transform:translateX(${r(from)}px)}to{transform:translateX(${r(to)}px)}}`
    marks.push(`<g transform="translate(${w.x} ${r(w.feet - w.s * CRAB_H)})"><g class="bgC${i}">${art.crab(0, 0, costume, false, true, w.s)}</g></g>`)
  })
  return { marks, css }
}

/**
 * The backdrop for a bar style in a palette: the same string every call, so the
 * app keeps the image; it moves by its own CSS. Dark by default, a light paper
 * version under `prefers-color-scheme: light`, still under reduced motion.
 */
export const sceneSvg = (style: HudStyle, palette: PaletteId, art: CrabArt): string => {
  const p = PALETTES[palette] ?? PALETTES.claude
  const tn = tonesOf(p)
  const make = SCENES[style] ?? SCENES.pixel
  const sc = make(art)
  const walk = parade(sc.walkers, art, Math.max(0, ORDER.indexOf(style)))
  const last = sc.back.length - 1
  const layers = sc.back.map((layer, i) => layer + walk.marks.filter((_, j) => (sc.walkers[j]?.z ?? last) === i).join(''))
  const veil = sc.veil ?? 0.55
  const light = sc.light?.(tn.light) ?? ''
  const css = `${BASE_CSS}
${toneCss(tn.dark)}
@media (prefers-color-scheme: light){${toneCss(tn.light)}${light}}
${sc.css ?? ''}
${walk.css}
@media (prefers-reduced-motion: reduce){[class^="bg"],[class*=" bg"]{animation:none!important}}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<style>${css}</style>${art.css}
<defs>
<linearGradient id="bgSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgs0"/><stop offset="1" class="bgs1"/></linearGradient>
<radialGradient id="bgGA"><stop offset="0" class="bgsA" stop-opacity=".5"/><stop offset="1" class="bgsA" stop-opacity="0"/></radialGradient>
<radialGradient id="bgGB"><stop offset="0" class="bgsB" stop-opacity=".5"/><stop offset="1" class="bgsB" stop-opacity="0"/></radialGradient>
<radialGradient id="bgGlowLow" cx=".5" cy="1" r=".9"><stop offset="0" class="bgsA" stop-opacity=".22"/><stop offset="1" class="bgsA" stop-opacity="0"/></radialGradient>
<radialGradient id="bgVeil" gradientUnits="userSpaceOnUse" cx="800" cy="560" r="600" gradientTransform="matrix(.78 0 0 1.1 176 -56)"><stop offset="0" class="bgsV"/><stop offset=".55" class="bgsV" stop-opacity=".9"/><stop offset="1" class="bgsV" stop-opacity="0"/></radialGradient>
<linearGradient id="bgFoot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="bgsV" stop-opacity="0"/><stop offset="1" class="bgsV" stop-opacity=".8"/></linearGradient>
${sc.defs ?? ''}
</defs>
<rect width="${W}" height="${H}" fill="url(#bgSky)"/>
${layers.join('\n')}
<rect width="${W}" height="${H}" fill="url(#bgVeil)" opacity="${veil}"/><rect y="830" width="${W}" height="170" fill="url(#bgFoot)"/>
${sc.top}
</svg>`
}
