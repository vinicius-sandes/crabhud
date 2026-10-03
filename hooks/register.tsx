import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit, SessionUsage } from 'claude-code'

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

async function findRecord($: EngineInterface): Promise<string | null> {
  const [appData, home, id] = await Promise.all([
    $.env.get('APPDATA'),
    $.env.get('HOME'),
    $.session.id(),
  ])
  const roots = [
    appData && `${appData}/Claude/claude-code-sessions`,
    home && `${home}/Library/Application Support/Claude/claude-code-sessions`,
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
    if (!('Client' in els)) return next(e)
    const { Box, Button, Client, Text } = els

    // First run: ask for the language, in English, once.
    const lang = await read($, langA)
    if (lang === null) {
      return (
        <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2}>
          <Text bold>Choose the HUD language:</Text>
          <Button key="lang-en" label="English" hotkey="1" onPress={() => chooseLanguage($, 'en')} />
          <Button key="lang-pt-BR" label="Português (BR)" hotkey="2" onPress={() => chooseLanguage($, 'pt-BR')} />
          <Text dimColor>You can change it anytime with /hud language</Text>
        </Box>
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

    return <Client key="hud" module="./hud-client.tsx" width="100%" props={props} />
  })
}
