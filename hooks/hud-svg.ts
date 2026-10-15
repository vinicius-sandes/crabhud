// The HUD in the app: one SVG the hooks module draws (the desktop's Client
// draws text only), closed in one row or open in four or more. The bars come
// from bar-styles; the spinner's turn and Ultracode's wave are CSS
// animations, so the drawing moves without redrawing. Pure, no `$`.

import type { HudLimit, HudProps } from '../types'
import { BAR_CSS, barSvg } from './bar-styles'
import { EFFORT_COLOR, GREEN, ORANGE, PURPLE, RED, WORDS, fmtLeft, fmtTok, pctText, tone } from './hud-words'

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"
// Ultracode's palette, purple to pink, along the bars and its label.
const ULTRA = ['#8B83E6', '#A58BEB', '#C86DD7', '#E46FB0', '#F25F8B']
const ultraAt = (f: number): string => ULTRA[Math.min(ULTRA.length - 1, Math.max(0, Math.floor(f * ULTRA.length)))] ?? PURPLE

const xml = (s: string): string => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
const charEm = (ch: string): number => (/[\s.,:;'|!il1()[\]/↻]/.test(ch) ? 0.3 : /[A-ZmMw%$—]/.test(ch) ? 0.72 : 0.56)
const textWidth = (s: string, size: number, bold = false): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0) * (bold ? 1.06 : 1)

const CSS = `.t{fill:#1f1f1f}.m{fill:#6f6d67}.sep{fill:#c9c7c0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.sep{fill:#4a4a47}}
.spin{transform-box:fill-box;transform-origin:center;animation:hs 1.4s linear infinite}@keyframes hs{to{transform:rotate(360deg)}}
.uw{animation:uw 7s linear infinite}@keyframes uw{from{transform:translateX(-50%)}to{transform:translateX(0)}}
@media (prefers-reduced-motion: reduce){.spin,.uw{animation:none}}`

type Lim = (HudLimit & { isReset: boolean }) | undefined

/** The HUD as one SVG `W` px wide: its markup, height and what it says. */
export function hudSvg(p: HudProps, W: number, open: boolean): { svg: string; height: number; alt: string } {
  const words = WORDS[p.lang] ?? WORDS.en
  const now = p.now
  const limits = p.limits.map(l => (l.resetsAt !== null && l.resetsAt <= now ? { ...l, percent: 0, resetsAt: null, isReset: true } : { ...l, isReset: false }))
  const five: Lim = limits.find(l => l.kind === 'five_hour')
  const week: Lim = limits.find(l => l.kind === 'seven_day')
  const others = limits.filter(l => l.kind !== 'five_hour' && l.kind !== 'seven_day')
  const ctxP = p.chat?.ctxPercent ?? null
  const alert = [ctxP ?? 0, ...limits.map(l => l.percent)].some(v => v >= 90)
  const cost = p.chat?.costUsd != null ? `$${p.chat.costUsd.toFixed(2)}` : '$—'
  const ultra = p.ultracode
  // The app's picker sets Ultracode on top of Extra: then it reads just "Ultracode".
  const level = ultra && (p.effort === 'xhigh' || p.effort === null) ? null : p.effort
  const levelName = level === null ? null : (words.effortNames[level] ?? level)
  const effortText = [levelName, ultra ? 'Ultracode' : null].filter(Boolean).join(' · ') || '—'
  let n = 0
  const uid = () => `h${n++}`

  const T = (x: number, y: number, s: string, o: { cls?: string; size?: number; bold?: boolean; fill?: string; anchor?: string } = {}) =>
    `<text${o.cls ? ` class="${o.cls}"` : ''} x="${Math.round(x * 10) / 10}" y="${y}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''} font-family="${FONT}" font-size="${o.size ?? 12.5}"${o.bold ? ' font-weight="600"' : ''}${o.fill ? ` fill="${o.fill}"` : ''} font-variant-numeric="tabular-nums">${xml(s)}</text>`
  // Working: the ✻ turns; an alert: a red !; else a green check.
  const status = (x: number, cy: number) =>
    p.working
      ? `<text class="spin" x="${x + 6}" y="${cy + 4.5}" text-anchor="middle" font-family="${FONT}" font-size="14" fill="${ORANGE}">✻</text>`
      : alert
        ? T(x + 6, cy + 4.5, '!', { size: 14, bold: true, fill: RED, anchor: 'middle' })
        : `<path d="M${x + 1} ${cy}l3 3 6-6.5" fill="none" stroke="${GREEN}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  // The effort, its level in its colour and Ultracode in its gradient.
  const effort = (x: number, y: number): string => {
    const out: string[] = []
    if (levelName !== null && level !== null) {
      out.push(T(x, y, levelName, { bold: level === 'xhigh' || level === 'max', fill: EFFORT_COLOR[level] ?? PURPLE }))
      x += textWidth(levelName, 12.5, true) + 4
    }
    if (ultra) {
      if (levelName !== null) {
        out.push(T(x, y, '·', { cls: 'm' }))
        x += 9
      }
      const id = uid()
      const w = textWidth('Ultracode', 12.5, true)
      out.push(`<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x}" x2="${x + w}">${ULTRA.map((c, i) => `<stop offset="${i / (ULTRA.length - 1)}" stop-color="${c}"/>`).join('')}</linearGradient></defs>`)
      out.push(T(x, y, 'Ultracode', { bold: true, fill: `url(#${id})` }))
    }
    if (!out.length) out.push(T(x, y, '—', { cls: 'm' }))
    return out.join('')
  }
  const effortW = levelName === null && !ultra ? 10 : textWidth(effortText, 12.5, true) + 6
  // A bar's colours: the tone of its reading, or Ultracode's palette below 90%.
  const colors = (v: number | null, base: string) => {
    const c = tone(v ?? 0, base)
    return ultra && (v ?? 0) < 90 ? { colorAt: ultraAt, head: ULTRA[ULTRA.length - 1] ?? c } : { colorAt: () => c, head: c }
  }
  // Ultracode's wave: a dot grid behind everything, lit by a band of light that drifts across.
  const wave = (H: number) => {
    if (!ultra) return ''
    const id = uid()
    return `<defs><pattern id="d${id}" width="6" height="6" patternUnits="userSpaceOnUse"><rect x="2" y="2" width="1.6" height="1.6" fill="${PURPLE}"/></pattern>
<linearGradient id="l${id}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".25" stop-color="#fff" stop-opacity=".9"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="m${id}"><rect class="uw" width="${W * 2}" height="${H}" fill="url(#l${id})"/></mask></defs>
<rect width="${W}" height="${H}" fill="url(#d${id})" mask="url(#m${id})" opacity=".55"/>`
  }
  const left = (l: Lim, tight: boolean) => (l?.resetsAt != null ? fmtLeft(l.resetsAt - now, tight, words.now) : '')
  const svg = (H: number, body: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" data-hud="1" data-style="${p.style}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>${CSS}${BAR_CSS}</style>${wave(H)}${body}</svg>`

  if (!open) {
    // Closed: shrink the bars first, then drop the reset times, the effort,
    // the bars and at last the model, so the cost at the right never gets cut.
    const H = 26
    const y = 17
    const layout = (barW: number, resets: boolean, head: boolean, model = true) => {
      const parts: string[] = []
      let x = 0
      const put = (s: string, o: { cls?: string; bold?: boolean; fill?: string } = {}) => {
        parts.push(T(x, y, s, o))
        x += textWidth(s, 12.5, o.bold) + 7
      }
      const sep = () => {
        x += 5
        parts.push(`<rect class="sep" x="${Math.round(x)}" y="7" width="1" height="12"/>`)
        x += 12
      }
      parts.push(status(x, 13))
      x += 18
      if (model) put(p.model, { cls: 't', bold: true })
      if (head) {
        parts.push(effort(x, y))
        x += effortW + 4
      }
      const mini = (label: string, v: number | null, base: string, reset: string) => {
        put(label, { cls: 'm' })
        if (barW > 0) {
          parts.push(barSvg({ style: p.style, x, y: 8, w: barW, h: 10, p: v ?? 0, ...colors(v, base), live: p.working, uid: uid() }))
          x += barW + 7
        }
        put(pctText(v), { cls: 't', bold: true })
        if (resets && reset) put(`↻ ${reset}`, { cls: 'm' })
      }
      sep()
      mini('ctx', ctxP, PURPLE, '')
      sep()
      mini('5h', five?.percent ?? null, GREEN, left(five, true))
      sep()
      mini('7d', week?.percent ?? null, GREEN, left(week, true))
      sep()
      put(cost, { cls: 't', bold: true })
      return { parts, width: x - 7 }
    }
    let best = layout(0, false, false)
    if (best.width > W) best = layout(0, false, false, false)
    search: for (const [resets, head] of [[true, true], [false, true], [false, false]] as const) {
      for (let barW = 76; barW >= 28; barW -= 8) {
        const l = layout(barW, resets, head)
        if (l.width <= W) {
          best = l
          break search
        }
      }
    }
    const alt = [
      p.working ? words.working : alert ? words.alert : words.ready,
      `${p.model} ${effortText}`,
      `ctx ${pctText(ctxP)}`,
      `5h ${pctText(five?.percent ?? null)}${left(five, true) ? ` ↻ ${left(five, true)}` : ''}`,
      `7d ${pctText(week?.percent ?? null)}${left(week, true) ? ` ↻ ${left(week, true)}` : ''}`,
      cost,
    ].join(' · ')
    return { svg: svg(H, best.parts.join('')), height: H, alt }
  }

  // Open: a row per reading, every bar on the same columns.
  const RH = 28
  const rows = 3 + others.length
  const H = RH * (rows + 1) + 6
  const L = 22
  const BX = 116
  const DW = Math.min(210, Math.max(120, W * 0.28))
  const BW = Math.max(60, W - BX - DW - 14)
  const parts: string[] = []
  const stateWord = p.working ? { t: words.working, c: ORANGE } : alert ? { t: words.alert, c: RED } : { t: words.ready, c: GREEN }
  parts.push(status(0, 14), T(L, 18, stateWord.t, { bold: true, fill: stateWord.c }), T(BX, 18, p.model, { cls: 't', bold: true }))
  const ex = BX + textWidth(p.model, 12.5, true) + 16
  parts.push(T(ex, 18, words.effort, { cls: 'm' }), effort(ex + textWidth(words.effort, 12.5) + 7, 18))
  parts.push(`<text x="${W - 2}" y="18" text-anchor="end" font-family="${FONT}" font-size="12.5"><tspan class="m">${xml(words.chat)} </tspan><tspan class="t" font-weight="600">${xml(cost)}</tspan></text>`)
  const lines: string[] = [`${stateWord.t} · ${p.model} · ${words.effort} ${effortText} · ${words.chat} ${cost}`]
  const row = (i: number, label: string, v: number | null, base: string, detail: string) => {
    const y = RH * i + 6
    const c = tone(v ?? 0, base)
    parts.push(
      `<circle cx="6" cy="${y + 11}" r="4" fill="${ultra && (v ?? 0) < 90 ? ultraAt(i / (rows + 1)) : c}"/>`,
      T(L, y + 15, label, { cls: 'm' }),
      barSvg({ style: p.style, x: BX, y: y + 3, w: BW, h: 16, p: v ?? 0, ...colors(v, base), live: p.working, uid: uid(), label: pctText(v) }),
      T(BX + BW + 14, y + 15, detail, { cls: 'm' }),
    )
    lines.push(`${label} ${pctText(v)}${detail ? ` · ${detail}` : ''}`)
  }
  const u = p.chat
  row(1, words.context, ctxP, PURPLE, u?.ctxTokens != null ? `${fmtTok(u.ctxTokens)} / ${fmtTok(u.ctxWindow)}` : u ? `— / ${fmtTok(u.ctxWindow)}` : '')
  const limitDetail = (l: Lim) =>
    l?.isReset ? `${words.reset} · ${words.account}` : l?.resetsAt != null ? `${words.resetsIn(left(l, false))} · ${words.account}` : l ? words.account : words.noReading
  row(2, words.fiveHour, five?.percent ?? null, GREEN, limitDetail(five))
  row(3, words.sevenDay, week?.percent ?? null, GREEN, limitDetail(week))
  others.forEach((l, i) => row(4 + i, l.kind === 'spend_limit' ? words.spend : l.kind, l.percent, GREEN, limitDetail(l)))
  return { svg: svg(H, parts.join('')), height: H, alt: lines.join('; ') }
}
