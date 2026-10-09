import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, SessionRateLimit, SessionUsage } from 'claude-code'

import type { HudChat, HudLang, HudLimit, HudLimits, HudProps } from '../types'

// Per chat: its context and cost, model and effort. Global: the account's
// limits, shared between chats through a small file every HUD reads.
const chatA = atom({ plugin: 'pixel-hud', key: 'chat' } as const, null)
const limitsA = atom({ plugin: 'pixel-hud', key: 'limits' } as const, null)
const modelA = atom({ plugin: 'pixel-hud', key: 'model' } as const, '')
const effortA = atom({ plugin: 'pixel-hud', key: 'effort' } as const, null)
const ultraA = atom({ plugin: 'pixel-hud', key: 'ultracode' } as const, false)
const expandedA = atom({ plugin: 'pixel-hud', key: 'expanded' } as const, false)
const hiddenA = atom({ plugin: 'pixel-hud', key: 'hidden' } as const, false)
const alertedA = atom({ plugin: 'pixel-hud', key: 'alerted' } as const, [])
// The HUD's language; null until the person picks one on the first run.
const langA = atom({ plugin: 'pixel-hud', key: 'language' } as const, null)

const LANGS: readonly HudLang[] = ['en', 'pt-BR']
const COMMAND = 'Show or hide the HUD (on / off), or pick its language (language)'

const TEXT = {
  en: {
    hidden: 'HUD hidden. Use /hud on to show it again.',
    shown: 'HUD shown.',
    language: (name: string) => `HUD language: ${name}.`,
    context: 'Context',
    limit: { five_hour: '5-hour limit', seven_day: '7-day limit', spend_limit: 'Spend limit' } as Record<string, string>,
    resets: (t: string) => ` (resets in ${t})`,
    at: (p: number) => ` at ${p}%`,
    now: 'now',
  },
  'pt-BR': {
    hidden: 'HUD escondido. Use /hud on para mostrar.',
    shown: 'HUD visível.',
    language: (name: string) => `Idioma do HUD: ${name}.`,
    context: 'Contexto',
    limit: { five_hour: 'Limite de 5h', seven_day: 'Limite de 7 dias', spend_limit: 'Limite de gasto' } as Record<string, string>,
    resets: (t: string) => ` (reseta em ${t})`,
    at: (p: number) => ` em ${p}%`,
    now: 'agora',
  },
}

function toChat(u: Pick<SessionUsage, 'context' | 'cost'>): HudChat {
  return {
    ctxTokens: u.context.tokens ?? null,
    ctxWindow: u.context.window,
    ctxPercent: u.context.percent ?? null,
    costUsd: u.cost?.usd ?? null,
  }
}

function toLimits(rateLimits: readonly SessionRateLimit[]): HudLimit[] {
  return rateLimits.map(l => ({
    kind: l.kind,
    percent: l.percentUsed,
    resetsAt: l.resetsAt ? Date.parse(l.resetsAt) || null : null,
  }))
}

// "claude-opus-5-5[1m]" -> "Opus 5.5"; anything else is shown as given.
function prettyModel(id: string): string {
  const clean = id.replace(/\[.*?\]/g, '').trim()
  const m = /(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?!\d)/i.exec(clean)
  if (!m) return clean
  const name = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()
  return `${name} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

function fmtLeft(ms: number, now: string): string {
  if (ms <= 0) return now
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

// The desktop app's record of this chat (model and effort as picked under the
// chat), found by the session id it carries; null under the terminal.
let record: string | null = null
let recordMtime = 0
// The file the HUDs of every chat share the account's limits through.
let shared: string | null = null
let sharedMtime = 0
// This chat's own last limits reading, to publish only what is new.
let ownLimits = ''

// Writes only when the value moved, so an unchanged poll redraws nothing.
async function setChat($: EngineInterface, value: HudChat): Promise<void> {
  if (JSON.stringify(await read($, chatA)) !== JSON.stringify(value)) await update($, chatA, () => value)
}

async function setModel($: EngineInterface, value: string): Promise<void> {
  if ((await read($, modelA)) !== value) await update($, modelA, () => value)
}

async function setEffort($: EngineInterface, value: string | null): Promise<void> {
  if ((await read($, effortA)) !== value) await update($, effortA, () => value)
}

async function setUltra($: EngineInterface, value: boolean): Promise<void> {
  if ((await read($, ultraA)) !== value) await update($, ultraA, () => value)
}

// Where the desktop app keeps its records, per system: Windows' APPDATA,
// macOS's Application Support, and on Linux the XDG config folder
// (XDG_CONFIG_HOME, ~/.config when unset).
async function findRecord($: EngineInterface): Promise<string | null> {
  const [appData, home, xdgConfig, id] = await Promise.all([
    $.env.get('APPDATA'),
    $.env.get('HOME'),
    $.env.get('XDG_CONFIG_HOME'),
    $.session.id(),
  ])
  const roots = [
    appData && `${appData}/Claude/claude-code-sessions`,
    home && `${home}/Library/Application Support/Claude/claude-code-sessions`,
    xdgConfig && `${xdgConfig}/Claude/claude-code-sessions`,
    home && `${home}/.config/Claude/claude-code-sessions`,
  ].filter((r): r is string => Boolean(r))
  const dirs = async (path: string) =>
    (await $.fs.list(path).catch(() => [])).filter(d => d.kind === 'dir').map(d => `${path}/${d.name}`)
  for (const root of roots) {
    for (const org of await dirs(root)) {
      for (const dir of await dirs(org)) {
        const files = (await $.fs.list(dir).catch(() => []))
          .filter(f => f.kind === 'file' && /^local_.*\.json$/.test(f.name))
        for (const f of files) {
          const head = (await $.fs.read(`${dir}/${f.name}`).catch(() => '')).slice(0, 20000)
          if (head.includes(`"cliSessionId":"${id}"`)) return `${dir}/${f.name}`
        }
      }
    }
  }
  return null
}

async function sharedPath($: EngineInterface): Promise<string | null> {
  const [configDir, home, profile] = await Promise.all([
    $.env.get('CLAUDE_CONFIG_DIR'),
    $.env.get('HOME'),
    $.env.get('USERPROFILE'),
  ])
  const dir = configDir || ((home || profile) && `${home || profile}/.claude`)
  return dir ? `${dir}/pixel-hud-limits.json` : null
}

const LANG_NAME: Record<HudLang, string> = { en: 'English', 'pt-BR': 'Português (BR)' }
const asLang = (v: unknown): HudLang | null =>
  typeof v === 'string' ? (LANGS.find(l => l.toLowerCase() === v.toLowerCase()) ?? (/^pt/i.test(v) ? 'pt-BR' : /^en/i.test(v) ? 'en' : null)) : null

// The language picked in the HUD (kept across chats), else one set in
// settings (`pluginConfigs.pixel-hud.options.language`), else none yet: the
// HUD then asks, once.
async function loadLanguage($: EngineInterface): Promise<HudLang | null> {
  const picked = asLang(await $.store.get('language'))
  if (picked) return picked
  const settings = (await $.settings.read().catch(() => ({}))) as {
    pluginConfigs?: Record<string, { options?: Record<string, unknown> }>
  }
  return asLang(settings.pluginConfigs?.['pixel-hud']?.options?.language)
}

async function chooseLanguage($: EngineInterface, lang: HudLang): Promise<void> {
  await update($, langA, () => lang)
  await $.store.set('language', lang)
}

// Toast once per gauge when it crosses 90%; re-arm below 80%.
async function checkAlerts($: EngineInterface) {
  const [chat, limits, now, lang] = await Promise.all([read($, chatA), read($, limitsA), $.clock.now(), read($, langA)])
  const T = TEXT[lang ?? 'en']
  const gauges = [
    { id: 'ctx', percent: chat?.ctxPercent ?? 0, name: T.context, after: '' },
    ...(limits?.limits ?? []).map(l => ({
      id: l.kind,
      // A window whose reset time has passed starts over at zero.
      percent: l.resetsAt !== null && l.resetsAt <= now ? 0 : l.percent,
      name: T.limit[l.kind] ?? l.kind,
      after: l.resetsAt ? T.resets(fmtLeft(l.resetsAt - now, T.now)) : '',
    })),
  ]
  const alerted = await read($, alertedA)
  const fresh = gauges.filter(g => g.percent >= 90 && !alerted.includes(g.id))
  for (const g of fresh) $.ui.toast(`⚠ ${g.name}${T.at(Math.round(g.percent))}${g.after}`)
  const kept = [...alerted.filter(id => (gauges.find(g => g.id === id)?.percent ?? 0) >= 80), ...fresh.map(g => g.id)]
  if (kept.join() !== alerted.join()) await update($, alertedA, () => kept)
}

// A newer reading of the account's limits: show it and hand it to the
// other chats through the shared file.
async function publish($: EngineInterface, limits: HudLimit[]) {
  const value: HudLimits = { limits, at: await $.clock.now() }
  await update($, limitsA, () => value)
  shared ??= await sharedPath($)
  if (shared === null) return
  await $.fs.write(shared, JSON.stringify(value)).catch(() => undefined)
  sharedMtime = (await $.fs.stat(shared).catch(() => null))?.mtimeMs ?? sharedMtime
}

// This chat's usage as the engine has it now: context and cost after every
// response (not only at the end of a turn), limits when they moved.
async function applyUsage($: EngineInterface, u: Pick<SessionUsage, 'context' | 'rateLimits' | 'cost'>) {
  await setChat($, toChat(u))
  const key = JSON.stringify(u.rateLimits)
  if (key !== ownLimits) {
    ownLimits = key
    if (u.rateLimits.length > 0) await publish($, toLimits(u.rateLimits))
  }
  await checkAlerts($)
}

// Another chat's newer reading of the limits, through the shared file.
async function pullShared($: EngineInterface) {
  shared ??= await sharedPath($)
  if (shared === null) return
  const stat = await $.fs.stat(shared).catch(() => null)
  if (!stat || stat.mtimeMs === sharedMtime) return
  sharedMtime = stat.mtimeMs
  const text = await $.fs.read(shared).catch(() => '')
  let theirs: HudLimits | null = null
  try {
    const v = JSON.parse(text) as HudLimits
    if (Array.isArray(v.limits) && typeof v.at === 'number') theirs = v
  } catch {
    return
  }
  const mine = await read($, limitsA)
  if (theirs && (!mine || theirs.at > mine.at)) {
    const value = theirs
    await update($, limitsA, () => value)
    await checkAlerts($)
  }
}

// The model and effort picked under the chat reach the engine only at the
// next turn, but the desktop app saves them to this chat's own record at
// once: watch that file (re-read only when its mtime moves).
async function pullRecord($: EngineInterface) {
  if (record === null) return
  const stat = await $.fs.stat(record).catch(() => null)
  if (!stat) {
    record = null
    return
  }
  if (stat.mtimeMs === recordMtime) return
  recordMtime = stat.mtimeMs
  const head = (await $.fs.read(record)).slice(0, 20000)
  const model = /"model"\s*:\s*"([^"]+)"/.exec(head)?.[1]
  const effort = /"effort"\s*:\s*"([^"]+)"/.exec(head)?.[1]
  // Ultracode is a switch of its own over `xhigh` in the app's picker.
  const ultracode = /"sessionSettings"\s*:\s*\{[^}]*"ultracode"\s*:\s*true/.test(head)
  if (model) await setModel($, prettyModel(model))
  if (effort) await setEffort($, effort)
  await setUltra($, ultracode)
}

// The terminal has no such record. What this session picked with /effort (or
// last sent to the model) wins; before that, the effort saved for the model
// in settings, and Ultracode is the "Dynamic workflows" switch.
let sessionEffort: string | null = null
let sessionUltra: boolean | null = null

// "Set effort level to max (this session only) … · Ultracode on": the line
// the terminal's /effort leaves. One that does not name Ultracode leaves it
// as it was. Answers whether the text held such a line.
async function applyEffortLine($: EngineInterface, text: string): Promise<boolean> {
  const level = /Set effort level to (low|medium|high|xhigh|max)\b/i.exec(text)?.[1]
  if (!level) return false
  sessionEffort = level.toLowerCase()
  await setEffort($, sessionEffort)
  const ultra = /Ultracode (on|off)\b/i.exec(text)?.[1]
  if (ultra) {
    sessionUltra = ultra.toLowerCase() === 'on'
    await setUltra($, sessionUltra)
  }
  return true
}

// A resumed terminal session: its latest /effort line still applies.
async function effortFromHistory($: EngineInterface): Promise<void> {
  const rows = await $.session.messages().catch(() => [])
  for (let i = rows.length - 1; i >= 0; i--) {
    if (await applyEffortLine($, JSON.stringify(rows[i]))) return
  }
}

async function pullTerminal($: EngineInterface) {
  const [model, rows, settings, envEffort] = await Promise.all([
    $.session.model(),
    $.config.list().catch(() => []),
    $.settings.read().catch(() => ({})),
    $.env.get('CLAUDE_EFFORT'),
  ])
  const pretty = prettyModel(model)
  await setModel($, pretty)
  const s = settings as { effortLevel?: unknown; modelSettings?: Record<string, { effortLevel?: unknown }> }
  const saved = Object.entries(s.modelSettings ?? {}).find(([id]) => prettyModel(id) === pretty)?.[1]?.effortLevel
  const effort = sessionEffort ?? (typeof saved === 'string' ? saved : null) ?? envEffort ?? (typeof s.effortLevel === 'string' ? s.effortLevel : null)
  if (effort) await setEffort($, effort)
  const workflows = rows.find(r => r.key === 'workflows')?.value
  await setUltra($, sessionUltra ?? workflows === true)
}

// A surface with no Client (a Remote Control viewer: the mobile app, another
// computer) gets the compact row drawn here, still: no animation, since each
// frame would cross the connection. Two lines: a small mark saying the chat
// is remote, then the row, which shrinks to fit and never wraps.
const RC = { green: '#3FB68B', purple: '#8B83E6', amber: '#E9A23B', red: '#E5534B', orange: '#D97757', pink: '#F25F8B' }
const RC_EFFORT: Record<string, string> = { low: '#9AA0A8', medium: '#5AA9E6', high: RC.purple, xhigh: '#C86DD7', max: RC.pink }
// The mark's own colours: the HUD's purple and green, and a cyan of its own;
// each with a deeper tone for a light theme.
const RC_MARK = {
  dark: { symbol: RC.purple, label: '#3CC6D9', on: RC.green },
  light: { symbol: '#6E64D8', label: '#0E8FA3', on: '#2A9A70' },
}
const RC_WORDS = {
  en: { remote: 'Remote Control:', on: 'ON', efforts: { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra', max: 'Max' } as Record<string, string> },
  'pt-BR': { remote: 'Remote Control:', on: 'ATIVO', efforts: { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Extra', max: 'Máx' } as Record<string, string> },
}

// The mark as a small vector line: Text has no size of its own, and the mark
// is meant to read smaller than the row (the ⇄ larger, the words at 11px).
function remoteMark(remote: string, on: string): string {
  const x = 20
  const onX = x + Math.ceil((remote.length + 1) * 6.7)
  const width = onX + Math.ceil(on.length * 6.7) + 2
  const { dark, light } = RC_MARK
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="18" viewBox="0 0 ${width} 18">` +
    `<style>@media (prefers-color-scheme: light){.s{fill:${light.symbol}}.l{fill:${light.label}}.o{fill:${light.on}}}</style>` +
    `<g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-weight="600">` +
    `<text class="s" x="0" y="14" font-size="15" fill="${dark.symbol}">⇄</text>` +
    `<text class="l" x="${x}" y="13" font-size="11" fill="${dark.label}">${remote}</text>` +
    `<text class="o" x="${onX}" y="13" font-size="11" fill="${dark.on}">${on}</text>` +
    `</g></svg>`
  )
}

function remoteBand(els: { Box: any; Text: any; Svg?: any }, p: HudProps, columns: number) {
  const { Box, Text, Svg } = els
  const W = RC_WORDS[p.lang] ?? RC_WORDS.en
  const T = TEXT[p.lang] ?? TEXT.en
  const tone = (v: number, base: string) => (v >= 90 ? RC.red : v >= 70 ? RC.amber : base)
  const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v)}%`)
  // The same pixels as the HUD: solid, a dithered edge, dots after.
  const bar = (v: number | null, n: number, base: string) => {
    const filled = Math.min(n, Math.round(((v ?? 0) / 100) * n))
    const edge = filled < n && filled >= 2 ? '▒' : ''
    const solid = '█'.repeat(filled - edge.length)
    return (
      <Box flexDirection="row" flexShrink={0}>
        <Text color={tone(v ?? 0, base)}>{solid + edge}</Text>
        <Text dimColor>{'·'.repeat(n - filled)}</Text>
      </Box>
    )
  }
  const limits = p.limits.map(l => (l.resetsAt !== null && l.resetsAt <= p.now ? { ...l, percent: 0, resetsAt: null } : l))
  const ctxP = p.chat?.ctxPercent ?? null
  const alert = [ctxP ?? 0, ...limits.map(l => l.percent)].some(v => v >= 90)
  const status = p.working ? { t: '✻', c: RC.orange } : alert ? { t: '!', c: RC.red } : { t: '✓', c: RC.green }
  const level = p.effort === null ? null : (W.efforts[p.effort] ?? p.effort)
  const cost = p.chat?.costUsd != null ? `$${p.chat.costUsd.toFixed(2)}` : '$—'
  const resetOf = (l: HudLimit | undefined) =>
    l?.resetsAt != null ? `↻${fmtLeft(l.resetsAt - p.now, T.now).replace(/ /g, '')}` : ''
  const five = limits.find(l => l.kind === 'five_hour')
  const week = limits.find(l => l.kind === 'seven_day')

  // Fit the row to the width, as the HUD's compact row does: shorter bars
  // first, then no reset times, then no effort; the cost is never cut. The
  // groups are parted by the HUD's │, one space each side.
  const SEP = 3
  const headText = [p.model, level, p.ultracode ? 'Ultracode' : null]
  const widthOf = (n: number, resets: boolean, head: boolean) => {
    const gauge = (label: string, v: number | null, after: string) =>
      label.length + (n > 0 ? 1 + n : 0) + 1 + pct(v).length + (resets && after ? 1 + after.length : 0)
    const headW = 2 + (head ? headText : [p.model]).filter(Boolean).join(' ').length
    return headW + gauge('ctx', ctxP, '') + gauge('5h', five?.percent ?? null, resetOf(five)) +
      gauge('7d', week?.percent ?? null, resetOf(week)) + cost.length + SEP * 4
  }
  let fit = { n: 0, resets: false, head: false }
  search: for (const [resets, head, min] of [[true, true, 4], [false, true, 3], [false, false, 3], [false, false, 0]] as const) {
    for (let n = 8; n >= min; n--) {
      if (widthOf(n, resets, head) <= columns) {
        fit = { n, resets, head }
        break search
      }
    }
  }
  const gauge = (label: string, v: number | null, base: string, after: string) => (
    <Box flexDirection="row" columnGap={1} alignItems="center" flexShrink={0}>
      <Text dimColor>{label}</Text>
      {fit.n > 0 ? bar(v, fit.n, base) : []}
      <Text bold>{pct(v)}</Text>
      {fit.resets && after ? <Text dimColor>{after}</Text> : []}
    </Box>
  )
  const sep = () => (
    <Box marginX={1} flexShrink={0}>
      <Text dimColor>│</Text>
    </Box>
  )
  const mark = Svg ? (
    <Svg source={remoteMark(W.remote, W.on)} alt={`${W.remote} ${W.on}`} />
  ) : (
    <Box flexDirection="row" columnGap={1}>
      <Text bold color={RC_MARK.dark.symbol}>⇄</Text>
      <Text color={RC_MARK.dark.label}>{W.remote}</Text>
      <Text bold color={RC_MARK.dark.on}>{W.on}</Text>
    </Box>
  )

  return (
    <Box flexDirection="column" width="100%">
      {mark}
      <Box flexDirection="row" alignItems="center" width="100%">
        <Box flexDirection="row" flexWrap="nowrap" overflow="hidden" flexShrink={1} minWidth={0} alignItems="center">
          <Box flexDirection="row" columnGap={1} alignItems="center" flexShrink={0}>
            <Text color={status.c} bold>{status.t}</Text>
            <Text bold>{p.model}</Text>
            {fit.head && level !== null ? <Text color={(p.effort && RC_EFFORT[p.effort]) || RC.purple}>{level}</Text> : []}
            {fit.head && p.ultracode ? <Text bold color={RC.pink}>Ultracode</Text> : []}
          </Box>
          {sep()}
          {gauge('ctx', ctxP, RC.purple, '')}
          {sep()}
          {gauge('5h', five?.percent ?? null, RC.green, resetOf(five))}
          {sep()}
          {gauge('7d', week?.percent ?? null, RC.green, resetOf(week))}
        </Box>
        {sep()}
        <Box flexShrink={0}>
          <Text bold>{cost}</Text>
        </Box>
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hud', description: COMMAND })

    const [savedExpanded, savedHidden, lang] = await Promise.all([
      $.store.get('expanded'),
      $.store.get('hidden'),
      loadLanguage($),
    ])
    if (typeof savedExpanded === 'boolean') await update($, expandedA, () => savedExpanded)
    if (typeof savedHidden === 'boolean') await update($, hiddenA, () => savedHidden)
    await update($, langA, () => lang)

    // What this chat already knows is a baseline, not news: the shared file
    // may hold a fresher reading from another chat.
    const u = await $.session.usage()
    await setChat($, toChat(u))
    ownLimits = JSON.stringify(u.rateLimits)
    if (u.rateLimits.length > 0) await update($, limitsA, () => ({ limits: toLimits(u.rateLimits), at: 0 }))
    await pullShared($)

    record = await findRecord($)
    if (record === null) {
      await effortFromHistory($)
      await pullTerminal($)
    } else {
      await pullRecord($)
    }

    // One quarter-second clock: the chat's record each tick (the settings,
    // under the terminal, each second), the shared limits every half second,
    // this chat's usage every second. Each is a stat or a local read; nothing
    // here reaches the model.
    let tick = 0
    let busy = false
    $.clock.every(250, () => {
      if (busy) return
      busy = true
      tick++
      void (async () => {
        try {
          if (record !== null) await pullRecord($)
          else if (tick % 4 === 0) await pullTerminal($)
          if (tick % 2 === 0) await pullShared($)
          if (tick % 4 === 0) await applyUsage($, await $.session.usage())
          if (record === null && tick % 200 === 0) record = await findRecord($)
        } finally {
          busy = false
        }
      })()
    })

    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    await applyUsage($, e)

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    // Without the app's record (the terminal), what the request carries is
    // what this session runs at.
    if (e.agentId === undefined && record === null) {
      if (e.effort !== undefined) {
        sessionEffort = String(e.effort)
        await setEffort($, sessionEffort)
      }
      await setModel($, prettyModel(e.model))
    }
    const result = yield* next(e)
    // A response just landed: the context and cost moved now, not at the end
    // of the turn.
    if (e.agentId === undefined) await applyUsage($, await $.session.usage())

    return result
  })

  // The terminal's /effort writes what it set into the conversation ("Set
  // effort level to max … · Ultracode on"): read it as the row lands. Only
  // rows of the session's own making, never the model's words.
  on('session.append', async ($, e, next) => {
    const isOwn = e.door !== 'response' && e.door !== 'tool-result' && e.door !== 'tool-message'
    if (record === null && e.agentId === undefined && isOwn) {
      const text = e.message.content.map(b => ('text' in b && typeof b.text === 'string' ? b.text : '')).join('\n')
      await applyEffortLine($, text)
    }

    return next(e)
  })

  on('command.run', { command: 'hud' }, async ($, e) => {
    const [arg = '', value = ''] = e.args.trim().split(/\s+/)
    if (/^lang(uage)?$/i.test(arg)) {
      // `/hud language pt-BR` sets it; a bare `/hud language` asks again.
      const lang = asLang(value)
      if (lang === null) {
        await update($, langA, () => null)
        await update($, hiddenA, () => false)
        return { text: 'Pick the HUD language above the prompt.' }
      }
      await chooseLanguage($, lang)
      return { text: TEXT[lang].language(LANG_NAME[lang]) }
    }
    const T = TEXT[(await read($, langA)) ?? 'en']
    const hidden = arg === 'off' ? true : arg === 'on' ? false : !(await read($, hiddenA))
    await update($, hiddenA, () => hidden)
    await $.store.set('hidden', hidden)

    return { text: hidden ? T.hidden : T.shown }
  })

  on('ui.message', async ($, e, next) => {
    const data = e.data as { expanded?: unknown } | null
    if (data && typeof data === 'object' && typeof data.expanded === 'boolean') {
      const value = data.expanded
      await update($, expandedA, () => value)
      await $.store.set('expanded', value)
    }

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, hiddenA))) return next(e)

    const els = $.ui.resolve(e)
    const { Box, Button, Text } = els

    // The band is shared: what the other mods draw stays, above the HUD.
    const theirs = await next(e)
    const below = (hud: RenderElement) =>
      theirs ? (
        <Box flexDirection="column">
          {theirs}
          {hud}
        </Box>
      ) : (
        hud
      )

    // First run: ask for the language, in English, once.
    const lang = await read($, langA)
    if (lang === null) {
      return below(
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2}>
          <Text bold>Choose the HUD language:</Text>
          <Button key="lang-en" label="English" hotkey="1" onPress={() => chooseLanguage($, 'en')} />
          <Button key="lang-pt-BR" label="Português (BR)" hotkey="2" onPress={() => chooseLanguage($, 'pt-BR')} />
          <Text dimColor>You can change it anytime with /hud language</Text>
        </Box>,
      )
    }

    const props: HudProps = {
      surface: e.surface === 'desktop' ? 'desktop' : 'terminal',
      lang,
      chat: await read($, chatA),
      limits: (await read($, limitsA))?.limits ?? [],
      model: (await read($, modelA)) || '…',
      effort: await read($, effortA),
      ultracode: await read($, ultraA),
      working: e.props.isWorking,
      expanded: await read($, expandedA),
      now: await $.clock.now(),
    }

    // Only the terminal and the desktop draw a Client; every other surface
    // (a Remote Control viewer) gets the still row.
    if ((e.surface === 'terminal' || e.surface === 'desktop') && 'Client' in els) {
      const { Client } = els
      return below(<Client key="hud" module="./hud-client.tsx" width="100%" props={props} />)
    }
    return below(remoteBand(els, props, e.props.bodyColumns || 80))
  })
}
