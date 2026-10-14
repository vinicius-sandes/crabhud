import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, SessionRateLimit, SessionUsage, ToolCallInput, TurnStepResult } from 'claude-code'

import type { Activity, AgentRun, Flow, HudChat, HudLang, HudLimit, HudLimits, HudProps, Panel, Phase, PlannedTask, StepGroup } from '../types'

// crabhud: the crab and the progress bar on top of the band above the prompt, the HUD
// under them, and the agents panel beside the chat. The engine follows $ only into
// functions of this same file, so every hook lives here; drawing that needs no $ may
// move to files of its own.

// ===========================================================================
// Progress bar, crab and agents panel
// ===========================================================================

const flow = atom({ plugin: 'crabhud', key: 'flow' } as const, null)
const agents = atom({ plugin: 'crabhud', key: 'agents' } as const, [])
const panel = atom({ plugin: 'crabhud', key: 'panel' } as const, {
  isCompact: false,
  isDoneCollapsed: false,
  autoOpenedFor: '',
})
const now = atom({ plugin: 'crabhud', key: 'now' } as const, 0)
// The main agent's tool in flight, for the crab's mood; null between tools.
const activity = atom({ plugin: 'crabhud', key: 'activity' } as const, null)

const TOOL = 'mcp__crabhud__progress'
const STEP_TOOL = 'mcp__crabhud__step'
const PANE = 'crabhud-agents'
const PHASES: readonly Phase[] = ['plan', 'design', 'delegate', 'review', 'close']
const ACCENT = '#8f8cf4'
const DONE = '#5fbf8f'

type ProgressInput = {
  title?: string
  total?: number
  done?: number
  phase?: Phase
  finished?: boolean
  tasks?: { title?: string; tier?: string; after?: number[] }[]
  step?: string
  groups?: { name?: string; steps?: (string | { name?: string; short?: string })[] }[]
}

// ---------------------------------------------------------------------------
// Language: the `language` option, else Claude Code's `language` setting, else the
// process locale; English when nothing says Russian or Portuguese.

type Lang = 'en' | 'ru' | 'pt'

const STRINGS = {
  en: {
    pane: 'Agents',
    cost: 'Cost',
    tokens: 'Tokens',
    time: 'Time',
    collapse: 'Collapse',
    expand: 'Expand',
    running: 'Running',
    finished: 'Finished',
    planned: 'Planned',
    empty: 'No subagents yet.',
    round: 'round',
    failed: 'error',
    after: 'after',
    tokensWord: 'tokens',
    agentsCount: 'agents',
    isRunning: 'running',
    isFinished: 'finished',
    isPlanned: 'planned',
    opened: 'Agents panel opened.',
    closed: 'Agents panel closed.',
    done: 'Done',
    plan: 'Plan',
    design: 'Design',
    tasks: 'Tasks',
    review: 'Review',
    busy: 'running',
    sleep: 'sleeping',
    sleepHint: 'waiting for the next task',
    think: 'thinking',
    analyze: 'analyzing',
    work: 'working',
    delegate: 'coordinating',
    agentsN: (n: number) => `${n} ${n === 1 ? 'agent' : 'agents'}`,
    reading: 'reading',
    searching: 'searching',
    editing: 'editing',
    running_: 'running',
    browsing: 'browsing',
  },
  ru: {
    pane: 'Агенты',
    cost: 'Стоимость',
    tokens: 'Токены',
    time: 'Время',
    collapse: 'Свернуть',
    expand: 'Развернуть',
    running: 'Работают',
    finished: 'Завершены',
    planned: 'Запланированы',
    empty: 'Субагентов пока нет.',
    round: 'раунд',
    failed: 'ошибка',
    after: 'после',
    tokensWord: 'токенов',
    agentsCount: 'агентов',
    isRunning: 'работает',
    isFinished: 'завершён',
    isPlanned: 'запланирована',
    opened: 'Панель агентов открыта.',
    closed: 'Панель агентов закрыта.',
    done: 'Готово',
    plan: 'План',
    design: 'Дизайн',
    tasks: 'Задачи',
    review: 'Ревью',
    busy: 'в работе',
    sleep: 'спит',
    sleepHint: 'ждёт следующую задачу',
    think: 'думает',
    analyze: 'анализирует',
    work: 'работает',
    delegate: 'координирует',
    agentsN: (n: number) => `${n} агент.`,
    reading: 'читает',
    searching: 'ищет',
    editing: 'правит',
    running_: 'запускает',
    browsing: 'смотрит',
  },
  pt: {
    pane: 'Agentes',
    cost: 'Custo',
    tokens: 'Tokens',
    time: 'Tempo',
    collapse: 'Recolher',
    expand: 'Expandir',
    running: 'Rodando',
    finished: 'Concluídos',
    planned: 'Planejados',
    empty: 'Nenhum subagente rodando agora.',
    round: 'rodada',
    failed: 'erro',
    after: 'depois de',
    tokensWord: 'tokens',
    agentsCount: 'agentes',
    isRunning: 'rodando',
    isFinished: 'concluído',
    isPlanned: 'planejada',
    opened: 'Painel de agentes aberto.',
    closed: 'Painel de agentes fechado.',
    done: 'Pronto',
    plan: 'Plano',
    design: 'Design',
    tasks: 'Tarefas',
    review: 'Revisão',
    busy: 'rodando',
    sleep: 'dormindo',
    sleepHint: 'esperando a próxima tarefa',
    think: 'pensando',
    analyze: 'analisando',
    work: 'trabalhando',
    delegate: 'coordenando',
    agentsN: (n: number) => `${n} ${n === 1 ? 'agente' : 'agentes'}`,
    reading: 'lendo',
    searching: 'buscando',
    editing: 'editando',
    running_: 'rodando',
    browsing: 'pesquisando',
  },
} as const

// Module scope is fine here: session.start sets it again on every (re)load.
let lang: Lang = 'en'
const tr = () => STRINGS[lang]

const langOf = (v: unknown): Lang | null =>
  typeof v !== 'string' ? null : /^(ru|russian|рус)/i.test(v.trim()) ? 'ru' : /^(pt|portug)/i.test(v.trim()) ? 'pt' : null

async function detectLang($: EngineInterface, option: unknown): Promise<Lang> {
  if (option === 'en' || option === 'ru' || option === 'pt') return option
  try {
    const settings = (await $.settings.read()) as Record<string, unknown>
    if (typeof settings.language === 'string' && settings.language.trim()) return langOf(settings.language) ?? 'en'
  } catch {
    // No settings: fall through to the locale.
  }
  const locale = (await $.env.get('LC_ALL')) || (await $.env.get('LC_MESSAGES')) || (await $.env.get('LANG'))
  return langOf(locale) ?? 'en'
}

const blank = (): Flow => ({
  title: 'savvy-flow',
  total: 0,
  done: 0,
  running: 0,
  phase: 'plan',
  isFinished: false,
  tasks: [],
  step: '',
  groups: [],
})

const isNewFlow = (prev: Flow | null, input: ProgressInput): boolean =>
  !prev || prev.isFinished || (input.title !== undefined && input.title.trim() !== prev.title)

const cleanTasks = (tasks: ProgressInput['tasks']): PlannedTask[] | undefined =>
  tasks
    ?.filter(t => t.title?.trim())
    .map(t => ({
      title: (t.title ?? '').trim(),
      tier: (t.tier ?? '').replace(/^savvy-/, '').trim().toLowerCase(),
      after: (t.after ?? []).filter(n => Number.isInteger(n) && n > 0),
    }))

// Step names start with a capital, on the bar and in the panel.
const capital = (s: string): string => s.replace(/\p{L}/u, c => c.toLocaleUpperCase())

const cleanGroups = (groups: ProgressInput['groups']): StepGroup[] | undefined =>
  groups
    ?.map(g => {
      const steps = (g.steps ?? [])
        .map(t => (typeof t === 'string' ? { name: t, short: '' } : { name: t?.name ?? '', short: t?.short ?? '' }))
        .map(t => ({ name: capital(t.name.trim()), short: capital(t.short.trim()) }))
        .filter(t => t.name)
      return { name: (g.name ?? '').trim(), steps: steps.map(t => t.name), short: steps.map(t => t.short) }
    })
    .filter(g => g.steps.length)

const stepsOf = (f: Flow): string[] => f.groups.flatMap(g => g.steps)
const shortsOf = (f: Flow): string[] => f.groups.flatMap(g => g.steps.map((name, i) => g.short?.[i] || name))

const merge = (prev: Flow | null, input: ProgressInput): Flow => {
  // A new title means a new flow: never carry counters over from an earlier one.
  const base = isNewFlow(prev, input) || !prev ? blank() : { ...blank(), ...prev }
  const tasks = cleanTasks(input.tasks) ?? base.tasks
  const groups = cleanGroups(input.groups) ?? base.groups
  const counted = input.groups ? groups.reduce((n, g) => n + g.steps.length, 0) : input.tasks ? tasks.length : base.total
  const total = Math.max(0, Math.round(input.total ?? counted))
  const done = Math.min(total || Infinity, Math.max(0, Math.round(input.done ?? base.done)))
  const phase = input.phase && PHASES.includes(input.phase) ? input.phase : base.phase
  // A named step lasts until it is renamed or the count moves on.
  const step = input.step !== undefined ? input.step.trim() : done !== base.done ? '' : base.step
  return {
    ...base,
    title: input.title?.trim() || base.title,
    total,
    done,
    phase: input.finished ? 'close' : phase,
    isFinished: input.finished === true,
    tasks,
    step,
    groups,
  }
}

// The step in progress, as short as the bar's pill wants it: the one the caller named, else
// the next one in `groups`.
const currentStep = (f: Flow): string => {
  if (f.isFinished) return ''
  const steps = shortsOf(f)
  return capital(f.step) || steps[Math.min(f.done, steps.length - 1)] || ''
}

const label = (f: Flow): string => {
  const s = tr()
  if (f.isFinished) return s.done
  const step = currentStep(f)
  const count = f.total ? `${f.done}/${f.total}` : `${f.running} ${s.busy}`
  if (step) return `${clip(step, 16)} · ${count}`
  if (f.phase === 'plan') return s.plan
  if (f.phase === 'design') return s.design
  return `${f.phase === 'review' ? s.review : s.tasks} ${count}`
}

// The crab in the corner acts out what Claude is doing right now.
type Mood = 'sleep' | 'think' | 'analyze' | 'work' | 'delegate'

const READS = new Set(['Read', 'Grep', 'Glob', 'LS', 'NotebookRead'])
const WEB = new Set(['WebFetch', 'WebSearch'])
const WRITES = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const RUNS = new Set(['Bash', 'PowerShell'])

const kindOf = (tool: string): Activity['kind'] =>
  READS.has(tool) ? (tool === 'Read' || tool === 'NotebookRead' ? 'read' : 'search') : WEB.has(tool) ? 'web' : WRITES.has(tool) ? 'write' : RUNS.has(tool) ? 'run' : 'other'

const baseName = (p: string): string => p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? p

// The one thing about a call worth naming: the file, the pattern, the command's first word.
const targetOf = (input: Record<string, unknown>): string => {
  const str = (k: string) => (typeof input[k] === 'string' ? (input[k] as string) : '')
  const path = str('file_path') || str('notebook_path') || str('path')
  if (path) return baseName(path)
  if (str('command')) return str('command').trim().split(/\s+/).slice(0, 2).join(' ')
  return str('pattern') || str('query') || str('url').replace(/^https?:\/\//, '').split('/')[0] || ''
}

const moodOf = (isWorking: boolean, running: number, act: Activity | null): Mood =>
  running > 0 ? 'delegate' : !isWorking ? 'sleep' : !act ? 'think' : act.kind === 'write' || act.kind === 'run' || act.kind === 'other' ? 'work' : 'analyze'

const moodText = (mood: Mood, running: number, act: Activity | null): string => {
  const s = tr()
  if (mood === 'sleep') return `${s.sleep} · ${s.sleepHint}`
  if (mood === 'delegate') return `${s.delegate} ${s.agentsN(running)}`
  if (mood === 'think' || !act) return `${s.think}…`
  const verb = { read: s.reading, search: s.searching, web: s.browsing, write: s.editing, run: s.running_, other: s.running_ }[act.kind]
  return `${mood === 'work' ? s.work : s.analyze} · ${verb}${act.target ? ' ' + act.target : ''}`
}

const ratio = (f: Flow): number => (f.isFinished ? 1 : f.total ? f.done / f.total : 0)

// Deterministic noise so the dither does not shimmer between redraws.
const noise = (x: number, y: number): number => {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453
  return s - Math.floor(s)
}

// The whole row is one SVG: the desktop wraps sibling elements onto new lines,
// so title, bar, percent and the crab live in one drawing; only the count and
// the dismiss are Buttons beside it.
const H = 26
const BAR_H = 16
const CRAB_W = 28
const CELL = 3
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',sans-serif"

const xml = (s: string): string =>
  s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const clip = (s: string, max: number): string => (s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s)

// Rough advance of system UI text, in em; good enough to size the title's slot.
const charEm = (ch: string): number =>
  /[\s.,:;'|!il1()[\]]/.test(ch) ? 0.3 : /[A-ZА-ЯЁmwшщжюМШЩЖЮ@%]/.test(ch) ? 0.72 : 0.56

const textWidth = (s: string, size: number): number => [...s].reduce((w, ch) => w + charEm(ch) * size, 0)

// Cuts `s` to fit `maxW` pixels, with an ellipsis when it had to cut.
const fitText = (s: string, size: number, maxW: number): string => {
  if (textWidth(s, size) <= maxW) return s
  let out = ''
  for (const ch of s) {
    if (textWidth(out + ch + '…', size) > maxW) break
    out += ch
  }
  return out + '…'
}

// A stretch of the bar per group (one per skill): base, intermediária, final keep their
// colors whichever of them are called; anything else takes the next free color.
const GROUP_COLOR: Record<string, string> = { base: '#3B7FF5', 'intermediária': '#A259E6', intermediaria: '#A259E6', final: '#F08C2E' }
const GROUP_PALETTE = ['#3B7FF5', '#A259E6', '#F08C2E', '#D9649B', '#3FA7B5']
const groupColor = (name: string, i: number): string => GROUP_COLOR[name.toLowerCase()] ?? GROUP_PALETTE[i % GROUP_PALETTE.length] ?? ACCENT

// The row is taller when the bar carries the groups' names under it.
const rowHeight = (f: Flow): number => (f.groups.length ? 40 : H)

const rowSvg = (f: Flow, W: number, mood: Mood): string => {
  const RH = rowHeight(f)
  // The title takes what it needs, up to 40% of the row; the bar takes the rest.
  const title = fitText(f.title, 13, Math.max(60, W * 0.4))
  const BAR_X = Math.round(16 + textWidth(title, 13) + 12)
  const BAR_W = Math.max(60, W - BAR_X - 46 - CRAB_W)
  const y0 = f.groups.length ? 3 : (H - BAR_H) / 2
  const mid = y0 + BAR_H / 2
  const fillW = Math.round(BAR_W * ratio(f))
  const runW = f.total ? Math.round((BAR_W * Math.min(f.total, f.done + f.running)) / f.total) : 0

  // Where each group starts and ends on the bar, and which one is in progress.
  const spans: { name: string; color: string; x0: number; x1: number; done: number; size: number }[] = []
  let before = 0
  f.groups.forEach((g, i) => {
    const size = g.steps.length
    spans.push({
      name: g.name,
      color: f.isFinished ? DONE : groupColor(g.name, i),
      x0: f.total ? Math.round((BAR_W * before) / f.total) : 0,
      x1: f.total ? Math.round((BAR_W * (before + size)) / f.total) : BAR_W,
      done: Math.max(0, Math.min(size, f.done - before)),
      size,
    })
    before += size
  })
  const live = spans.find(sp => sp.done < sp.size) ?? spans[spans.length - 1]
  const color = f.isFinished ? DONE : (live?.color ?? ACCENT)
  const spanAt = (x: number): number => Math.max(0, spans.findIndex(sp => x < sp.x1))
  const colorAt = (x: number): string => (spans.length ? (spans[spanAt(x)]?.color ?? color) : color)

  // Dithered fill: sparse at the start, dense toward the head; each pixel takes its group's color.
  const dots = new Map<string, string[]>()
  const put = (c: string, r: string) => dots.set(c, [...(dots.get(c) ?? []), r])
  const cols = Math.floor(fillW / CELL)
  const rows = Math.floor(BAR_H / CELL)
  for (let c = 0; c < cols; c++) {
    const density = 0.35 + 0.6 * Math.pow(c / Math.max(1, cols), 1.2)
    for (let r = 0; r < rows; r++) {
      if (noise(c, r) < density) put(colorAt(c * CELL + 1), `<rect class="t${Math.floor(noise(r, c) * 4)}" x="${c * CELL + 1}" y="${r * CELL + 1}" width="2" height="2"/>`)
    }
  }
  // Handed to workers, not yet accepted: a faint second layer.
  const faint: string[] = []
  for (let c = cols; c < Math.floor(runW / CELL); c++) {
    for (let r = 0; r < rows; r++) {
      if (noise(c + 7, r + 3) < 0.2) faint.push(`<rect class="t${Math.floor(noise(r + 5, c) * 4)}" x="${c * CELL + 1}" y="${r * CELL + 1}" width="1.7" height="1.7"/>`)
    }
  }

  const ticks: string[] = []
  for (let i = 1; i < f.total; i++) {
    const x = Math.round((BAR_W * i) / f.total)
    if (x > fillW + 4) ticks.push(`<rect x="${x}" y="${BAR_H / 2 - 4}" width="1.5" height="8" rx="0.75"/>`)
  }
  // A gap where one group ends and the next begins, and each group's name and count under it.
  const gaps = spans.slice(1).map(sp => `<rect class="k" x="${sp.x0 - 1}" width="2.5" height="${BAR_H}"/>`)
  const names = spans.map(sp => {
    const isLive = sp === live && !f.isFinished
    const text = fitText(`${sp.name} ${sp.done}/${sp.size}`, 10.5, Math.max(10, sp.x1 - sp.x0 - 6))
    return `<rect x="${sp.x0 + 1}" y="${BAR_H + 4}" width="${Math.max(2, sp.x1 - sp.x0 - 3)}" height="2" rx="1" fill="${sp.color}" opacity="${isLive ? 0.9 : 0.4}"/>
<text x="${sp.x0 + 2}" y="${BAR_H + 17}" font-family="${FONT}" font-size="10.5" font-weight="${isLive ? 600 : 400}" fill="${sp.color}" >${xml(text)}</text>`
  })

  const text = label(f)
  const pillW = Math.min(BAR_W, Math.round(18 + textWidth(text, 11) * 1.08))
  const pillX = Math.max(0, Math.min(BAR_W - pillW, fillW - pillW))
  const percent = `${Math.round(ratio(f) * 100)}%`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${RH}" viewBox="0 0 ${W} ${RH}">
<style>
.t{fill:#1f1f1f}.m{fill:#6f6d67}.k{fill:#f7f6f2}.kb{stroke:#d9d7d0}.tk{fill:#c4c2bb}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}.k{fill:#2c2c2c}.kb{stroke:none}.tk{fill:#5a5a5a}}
/* Pixels twinkle in four out-of-phase groups; a finished bar settles to a slow glow. */
.t0,.t1,.t2,.t3{animation:tw ${f.isFinished ? 3.2 : 2.2}s ease-in-out infinite}
.t1{animation-duration:${f.isFinished ? 3.8 : 2.8}s;animation-delay:-.7s}.t2{animation-duration:${f.isFinished ? 4.4 : 1.9}s;animation-delay:-1.3s}.t3{animation-duration:${f.isFinished ? 3.5 : 3.3}s;animation-delay:-.4s}
@keyframes tw{0%,100%{opacity:1}50%{opacity:${f.isFinished ? 0.8 : 0.3}}}
@media (prefers-reduced-motion: reduce){.t0,.t1,.t2,.t3{animation:none}}
</style>
<defs><clipPath id="c"><rect x="0" y="0" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/></clipPath></defs>
<circle cx="5" cy="${mid}" r="4" fill="${color}"/>
<text class="t" x="16" y="${mid + 4.5}" font-family="${FONT}" font-size="13" font-weight="500">${xml(title)}</text>
<g transform="translate(${BAR_X},${y0})">
<rect class="k" width="${BAR_W}" height="${BAR_H}" rx="${BAR_H / 2}"/>
<g clip-path="url(#c)">
${[...dots].map(([c, rs]) => `<g fill="${c}">${rs.join('')}</g>`).join('')}
<g fill="${color}" opacity="0.45">${faint.join('')}</g>
<g class="tk">${ticks.join('')}</g>
${gaps.join('')}
</g>
<rect class="kb" x="0.5" y="0.5" width="${BAR_W - 1}" height="${BAR_H - 1}" rx="${(BAR_H - 1) / 2}" fill="none" stroke-width="1"/>
<rect x="${pillX}" width="${pillW}" height="${BAR_H}" rx="${BAR_H / 2}" fill="${color}"/>
<text x="${pillX + pillW / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle" font-family="${FONT}" font-size="11" font-weight="600" fill="#ffffff">${xml(text)}</text>
${names.join('')}
</g>
<text class="m" x="${W - CRAB_W - 6}" y="${mid + 4.5}" text-anchor="end" font-family="${FONT}" font-size="12.5" font-variant-numeric="tabular-nums">${percent}</text>
${CRAB_CSS}${crab(W - CRAB_W + 1, 0, 'm-' + mood, false, true, 0.9)}
</svg>`
}

// The line between this bar and the mods drawn below it in the band.
const hairline = (W: number): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="13" viewBox="0 0 ${W} 13"><style>.l{stroke:#bdbbb5}@media (prefers-color-scheme: dark){.l{stroke:#5c5b57}}</style><line class="l" x1="0" y1="6.5" x2="${W}" y2="6.5" stroke-width="1"/></svg>`

// No flow running: the crab and what Claude is doing, in one drawing.
const moodSvg = (W: number, mood: Mood, text: string): string => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>.t{fill:#1f1f1f}.m{fill:#6f6d67}@media (prefers-color-scheme: dark){.t{fill:#ececec}.m{fill:#9a9a9a}}</style>
${CRAB_CSS}${crab(0, 0, 'm-' + mood, false, true, 0.9)}
<text x="${CRAB_W + 8}" y="${H / 2 + 4.5}" font-family="${FONT}" font-size="13"><tspan class="t" font-weight="600">${xml(text.split(' · ')[0] ?? text)}</tspan><tspan class="m">${xml(text.includes(' · ') ? ' · ' + fitText(text.split(' · ').slice(1).join(' · '), 13, W - CRAB_W - 120) : '')}</tspan></text>
</svg>`

const barText = (f: Flow, width: number): string => {
  const filled = Math.round(width * ratio(f))
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

// ---------------------------------------------------------------------------
// Agents panel: every subagent of the session, plus the tasks the flow planned.

const TIER_COLOR: Record<string, string> = {
  fable: '#7F77DD',
  heavy: '#D85A30',
  careful: '#BA7517',
  medium: '#378ADD',
  light: '#1D9E75',
  other: '#888780',
}

// What each savvy tier runs on, for planned tasks that have no run yet.
// Apoio's own agents (the apoio-edicao-base, apoio-edicao-intermediaria and apoio-edicao-final skills):
// a costume and a color per role, matched by agent type.
const ROLE_OF: Record<string, string> = {
  'legendista-apoio': 'legendista',
  'revisor-edicao-apoio': 'revisor',
  'roteirista-apoio': 'roteirista',
  'capa-apoio': 'capa',
  'headlines-figma': 'headlines',
  'conferente-apoio': 'conferente',
  'curador-broll-apoio': 'curador',
}

const ROLE_COLOR: Record<string, string> = {
  legendista: '#D4537E',
  revisor: '#B83A3A',
  roteirista: '#5E8C31',
  capa: '#2B9FB3',
  headlines: '#9B59B6',
  conferente: '#3F7CAC',
  curador: '#A0522D',
}

const colorOf = (tier: string): string => TIER_COLOR[tier] ?? ROLE_COLOR[tier] ?? '#888780'

const TIER_MODEL: Record<string, string> = {
  fable: 'Fable · high',
  heavy: 'Opus · xhigh',
  careful: 'Opus · high',
  medium: 'Opus · medium',
  light: 'Opus · low',
}

// USD per million tokens: input, output, cache read, cache write (5-minute TTL).
// The engine reports tokens, not money, so the panel's cost is an estimate.
const PRICES: [RegExp, [number, number, number, number]][] = [
  [/fable|mythos/, [10, 50, 0.25, 12.5]],
  [/opus-5-5/, [4, 20, 0.2, 5]],
  [/opus/, [5, 25, 0.5, 6.25]],
  [/sonnet/, [2, 10, 0.2, 2.5]],
  [/haiku/, [1, 5, 0.1, 1.25]],
]

type Usage = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens: number
  cache_creation_input_tokens: number
}

const priceOf = (model: string): [number, number, number, number] =>
  PRICES.find(([re]) => re.test(model.toLowerCase()))?.[1] ?? [4, 20, 0.2, 5]

const costOf = (model: string, u: Usage): number => {
  const [i, o, r, w] = priceOf(model)
  return (
    ((u.input_tokens || 0) * i +
      (u.output_tokens || 0) * o +
      (u.cache_read_input_tokens || 0) * r +
      (u.cache_creation_input_tokens || 0) * w) /
    1e6
  )
}

const windowOf = (model: string): number => (/haiku/i.test(model) ? 200_000 : 1_000_000)

// `savvy-careful`, or `savvy-flow:savvy-careful` when the agents ship in a plugin.
const tierOf = (type: string): string => {
  const bare = type.replace(/^[^:]*:/, '')
  const t = bare.replace(/^savvy-/, '').toLowerCase()
  return t in TIER_COLOR && bare.startsWith('savvy-') ? t : 'other'
}

const modelName = (id: string): string => {
  const m = /(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d{1,2})(?!\d))?/i.exec(id)
  const [, family = '', major = '', minor] = m ?? []
  if (!family) return id.replace(/^claude-/, '').replace(/\[.*\]$/, '') || '—'
  return `${family.charAt(0).toUpperCase()}${family.slice(1).toLowerCase()} ${major}${minor ? '.' + minor : ''}`
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const fmtTokens = (n: number): string =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${Math.round(n)}`

const fmtCost = (usd: number): string => `$${usd < 10 ? usd.toFixed(2) : usd.toFixed(1)}`

const fmtTime = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

const elapsed = (a: AgentRun, at: number): number => (a.endedAt ?? Math.max(at, a.startedAt)) - a.startedAt

type Planned = PlannedTask & { n: number }

const plannedOf = (f: Flow | null, list: AgentRun[]): Planned[] => {
  if (!f || f.isFinished) return []
  const started = new Set(list.map(a => norm(a.description)))
  return (f.tasks ?? []).map((t, i) => ({ ...t, n: i + 1 })).filter(t => !started.has(norm(t.title)))
}

const totals = (list: AgentRun[], at: number) => {
  const cost = list.reduce((s, a) => s + a.costUsd, 0)
  const tokens = list.reduce((s, a) => s + a.tokens, 0)
  const start = Math.min(...list.map(a => a.startedAt))
  const end = Math.max(...list.map(a => a.endedAt ?? Math.max(at, a.startedAt)))
  return { cost, tokens, time: list.length ? end - start : 0 }
}

// --- desktop drawings: each row is one SVG, as the band above the prompt is.

const PANE_CSS = `<style>
.t{fill:#1f1f1f}.s{fill:#6b6b68}.m{fill:#6f6d67}.k{fill:#ecebe8}.ln{stroke:#e4e4e1}.tile{fill:#f4f3f0}
@media (prefers-color-scheme: dark){.t{fill:#ececec}.s{fill:#a8a8a4}.m{fill:#7d7d79}.k{fill:#2c2c2b}.ln{stroke:#333331}.tile{fill:#262625}}
.live{animation:p 1.6s ease-in-out infinite}@keyframes p{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.live{animation:none}}
</style>`

// Pixel Clawd from DockCrab (Clawdy): a 24×18 crab on a 30×28 grid, one costume per tier.
// The body keeps the brand clay; the tier's color lives in the costume's accent.
const CLAY = '#D97757'
const INK = '#1F1E1D'

// `cls` puts a pixel in a named group: `bd` (the default) is the body and its
// costume, `la`/`lb` the leg pairs, anything else a prop with its own motion.
type Fill = (x: number, y: number, w: number, h: number, c: string, cls?: string) => void

const stamp = (f: Fill, x: number, y: number, rows: string[], map: Record<string, string>, cls?: string): void =>
  rows.forEach((row, dy) => [...row].forEach((ch, dx) => map[ch] && f(x + dx, y + dy, 1, 1, map[ch] ?? '', cls)))

// `armCls` lets a raised claw travel with the prop it holds.
const crabBody = (f: Fill, armFront = 0, armCls?: string): void => {
  f(7, 10, 16, 12, CLAY)
  f(3, 14, 4, 4, CLAY)
  f(23, 14 + armFront, 4, 4, CLAY, armCls)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

// The body and legs alone, for a role that places its own claws; and the desk a role sits at.
const crabTrunk = (f: Fill): void => {
  f(7, 10, 16, 12, CLAY)
  f(9, 12, 2, 2, INK)
  f(19, 12, 2, 2, INK)
  f(7, 22, 2, 4, CLAY, 'la')
  f(17, 22, 2, 4, CLAY, 'la')
  f(11, 22, 2, 4, CLAY, 'lb')
  f(21, 22, 2, 4, CLAY, 'lb')
}

const desk = (f: Fill): void => {
  f(0, 22, 30, 1, '#9C7A55', 'fr')
  f(0, 23, 30, 2, '#7A5A3C', 'fr')
}

// A big magnifier held in front of the right eye, which shows through it zoomed in (a 4×4 eye
// on paler, magnified skin); `ey`/`el` let both eyes glance and blink. Draw it over a trunk.
const magnifier = (f: Fill): void => {
  f(9, 12, 2, 2, CLAY); f(19, 12, 2, 2, CLAY)
  f(9, 12, 2, 2, INK, 'el')
  stamp(f, 14, 7, ['..kkkkkk..', '.k......k.', 'k........k', 'k........k', 'k........k', 'k........k', 'k........k', 'k........k', '.k......k.', '..kkkkkk..'], { k: '#3A3A3C' })
  stamp(f, 15, 8, ['.pppppp.', 'pppppppp', 'pppppppp', 'pppppppp', 'pppppppp', 'pppppppp', 'pppppppp', '.pppppp.'], { p: '#F2C2AE' })
  f(16, 9, 2, 1, '#fff'); f(16, 10, 1, 1, '#fff')
  f(17, 10, 4, 4, INK, 'ey'); f(19, 11, 1, 1, '#fff', 'ey')
  f(23, 15, 1, 1, '#7A4A26'); f(23, 16, 2, 1, '#7A4A26')
  f(23, 17, 4, 4, CLAY)
}

// Pure CSS, run by the compositor: no redraws. Periods divide one second, so the
// once-a-second redraw of a running row restarts them in phase. Every crab walks;
// each costume adds its prop's own motion on top.
const CRAB_CSS = `<style>
.run .la{animation:st .5s steps(1) infinite}.run .lb{animation:st .5s steps(1) infinite -.25s}
.run .bd{animation:bob .5s steps(1) infinite -.125s}
.run g{transform-box:fill-box}
@keyframes st{50%{transform:translateY(-1px)}}@keyframes bob{50%{transform:translateY(1px)}}
.c-fable.run{animation:float 1s ease-in-out infinite}
.c-fable.run .la,.c-fable.run .lb,.c-fable.run .bd{animation:none}
.c-fable.run .ant{animation:blink 1s steps(1) infinite}
.c-fable.run .star{animation:blink .5s steps(1) infinite -.25s}
@keyframes float{50%{transform:translateY(-2px)}}@keyframes blink{50%{opacity:.15}}
.c-heavy.run .it{animation:scan 1s steps(1) infinite}
.c-heavy.run .gl{animation:blink 1s steps(1) infinite -.5s}
@keyframes scan{25%{transform:translate(-1px,1px)}50%{transform:translate(-2px,2px)}75%{transform:translate(-1px,1px)}}
.c-careful.run .it{transform-origin:100% 100%;animation:twist .5s ease-in-out infinite}
@keyframes twist{50%{transform:rotate(-35deg)}}
.c-medium.run .pan{transform-origin:0 50%;animation:tilt 1s ease-in-out infinite}
.c-medium.run .egg{animation:flip 1s ease-in-out infinite}
@keyframes tilt{20%,40%{transform:rotate(-12deg)}}@keyframes flip{30%{transform:translateY(-5px) scaleY(-1)}60%{transform:translateY(0)}}
.c-light.run .la{animation-duration:.25s}.c-light.run .lb{animation-duration:.25s;animation-delay:-.125s}
.c-light.run .flag{transform-origin:0 50%;animation:wave .25s steps(1) infinite}
@keyframes wave{50%{transform:skewY(-12deg) scaleX(.85)}}
.c-explore.run .it{transform-origin:50% 100%;animation:fence .5s ease-in-out infinite}
@keyframes fence{50%{transform:rotate(25deg)}}
.c-legendista.run .la,.c-legendista.run .lb,.c-revisor.run .la,.c-revisor.run .lb,.c-roteirista.run .la,.c-roteirista.run .lb,
.c-capa.run .la,.c-capa.run .lb,.c-headlines.run .la,.c-headlines.run .lb,.c-conferente.run .la,.c-conferente.run .lb,
.c-curador.run .la,.c-curador.run .lb{animation:none}
.c-legendista.run .kl{animation:tap .25s steps(1) infinite}.c-legendista.run .kr{animation:tap .25s steps(1) infinite -.125s}
@keyframes tap{50%{transform:translateY(-1px)}}
.c-legendista.run .tx1{animation:blink 1s steps(1) infinite}.c-legendista.run .tx2{animation:blink 1s steps(1) infinite -.5s}
.c-revisor.run .mk{animation:blink .5s steps(1) infinite}
.c-roteirista.run .pn{animation:write 1s steps(1) infinite}
.c-roteirista.run .ln{transform-origin:0 50%;animation:grow 1s steps(1) infinite}
@keyframes write{0%{transform:translate(-8px,0)}12%{transform:translate(-7px,-1px)}25%{transform:translate(-6px,0)}37%{transform:translate(-5px,-1px)}50%{transform:translate(-4px,0)}62%{transform:translate(-3px,-1px)}75%{transform:translate(-2px,0)}87%{transform:translate(-1px,-1px)}100%{transform:translate(0,0)}}
@keyframes grow{0%{transform:scaleX(.06)}12%{transform:scaleX(.125)}25%{transform:scaleX(.25)}37%{transform:scaleX(.375)}50%{transform:scaleX(.5)}62%{transform:scaleX(.625)}75%{transform:scaleX(.75)}87%{transform:scaleX(.875)}100%{transform:scaleX(1)}}
.c-capa.run .fl{animation:flash 1s steps(1) infinite}@keyframes flash{0%,19%{opacity:1}20%,100%{opacity:0}}
.c-headlines.run .br{animation:dip 1s ease-in-out infinite}
@keyframes dip{0%,100%{transform:translate(1px,-3px)}45%,60%{transform:translate(-5px,3px)}}
.c-conferente.run .k1{animation:c1 1s steps(1) infinite}.c-conferente.run .k2{animation:c2 1s steps(1) infinite}.c-conferente.run .k3{animation:c3 1s steps(1) infinite}
@keyframes c1{0%,24%{opacity:0}25%,100%{opacity:1}}@keyframes c2{0%,49%{opacity:0}50%,100%{opacity:1}}@keyframes c3{0%,74%{opacity:0}75%,100%{opacity:1}}
.c-curador.run .sp{animation:roll .5s steps(1) infinite}@keyframes roll{50%{transform:translateX(-1px)}}
.c-curador.run .st{animation:press 1s ease-in-out infinite}@keyframes press{0%,30%,100%{transform:translateY(-1px)}45%,60%{transform:translateY(3px)}}
.c-curador.run .ok,.c-curador.run .no{animation:c2 1s steps(1) infinite}
.c-m-sleep.run .la,.c-m-sleep.run .lb,.c-m-sleep.run .bd,.c-m-think.run .la,.c-m-think.run .lb,.c-m-analyze.run .la,.c-m-analyze.run .lb,.c-m-delegate.run .la,.c-m-delegate.run .lb{animation:none}
.c-m-sleep.run .bd{animation:breathe 2s ease-in-out infinite}@keyframes breathe{50%{transform:translateY(1px)}}
.c-m-sleep.run .z1{animation:zz 2s ease-in infinite}.c-m-sleep.run .z2{animation:zz 2s ease-in infinite -1s}
@keyframes zz{0%{transform:translate(0,3px);opacity:0}30%{opacity:1}100%{transform:translate(2px,-3px);opacity:0}}
.c-m-think.run .d1{animation:c1 1s steps(1) infinite}.c-m-think.run .d2{animation:c2 1s steps(1) infinite}.c-m-think.run .d3{animation:c3 1s steps(1) infinite}
.c-m-analyze.run .ey,.c-m-analyze.run .el,.c-revisor.run .ey,.c-revisor.run .el{transform-origin:center;animation:peek 2s steps(1) infinite}
@keyframes peek{0%{transform:none}25%{transform:translateX(-1px)}50%{transform:translateX(1px)}75%{transform:none}85%{transform:scaleY(.25)}90%{transform:none}}
.c-m-work.run .hm{transform-origin:0 100%;animation:hammer .4s ease-in infinite}@keyframes hammer{50%{transform:rotate(-40deg)}}
.c-m-work.run .sp{animation:blink .4s steps(1) infinite}
.c-m-delegate.run .w1{animation:blink .5s steps(1) infinite}.c-m-delegate.run .w2{animation:blink .5s steps(1) infinite -.25s}
@media (prefers-reduced-motion: reduce){.run,.run g{animation:none!important}}
</style>`

const COSTUMES: Record<string, (f: Fill, t: string) => void> = {
  // Fable: astronaut in a glass dome; floats instead of walking, the antenna and the star blink.
  fable: (f, t) => {
    crabBody(f)
    f(6, 7, 18, 1, '#E6E8EE'); f(5, 8, 1, 14, '#E6E8EE'); f(24, 8, 1, 14, '#E6E8EE'); f(6, 22, 18, 1, '#C9CCD2')
    f(6, 8, 18, 14, 'rgba(169,214,245,.32)'); f(8, 9, 2, 1, '#fff'); f(8, 10, 1, 2, '#fff')
    f(14, 4, 2, 3, '#C9CCD2'); f(14, 2, 2, 2, t, 'ant'); f(13, 18, 4, 2, t)
    f(27, 3, 1, 3, '#F5C542', 'star'); f(26, 4, 3, 1, '#F5C542', 'star')
  },
  // Heavy: detective with a deerstalker; the magnifier sweeps and glints.
  heavy: (f, t) => {
    crabBody(f, -4, 'it')
    stamp(f, 6, 3, ['......bbbbbb......', '....bbcbbcbbbb....', '...bbbbbbbbbbbb...', '..bcbbcbbcbbcbbb..', '.bbbbbbbbbbbbbbbb.', 'dddddddddddddddddd'], { b: '#7A4A26', c: '#A0703F', d: '#5A3519' })
    f(6, 9, 18, 1, t)
    stamp(f, 23, 1, ['.kkk.', 'k...k', 'k...k', 'k...k', '.kkk.'], { k: '#3A3A3C' }, 'it')
    f(24, 2, 3, 3, 'rgba(169,214,245,.7)', 'it'); f(25, 6, 1, 4, '#7A4A26', 'it'); f(24, 2, 1, 1, '#fff', 'gl')
  },
  // Careful: engineer in a hard hat; the wrench turns a bolt.
  careful: (f, t) => {
    crabBody(f)
    stamp(f, 6, 4, ['.....yyyyyyyy.....', '...yyyyyhhyyyyy...', '..yyyyyyhhyyyyyy..', '..yyyyyyhhyyyyyy..', '.yyyyyyyhhyyyyyyy.', 'dddddddddddddddddd'], { y: '#F5C542', h: '#FBE08A', d: '#C99A1E' })
    f(13, 5, 4, 2, t)
    stamp(f, 0, 10, ['.s.s', 'sss.', '.s..', '.s..'], { s: '#8E929A' }, 'it')
  },
  // Medium: chef, the toque traced from DockCrab's Sprites.chefHat; tosses the omelette.
  medium: (f, t) => {
    crabBody(f, -4, 'pan')
    stamp(f, 6, 0, ['........lll.......', '.......lllll......', '.wwwwgwwwwwwgwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwww', 'wwwwwgwwwwwggwwwww', '.wwwwgwwwwwggwwwww', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.', '.dddbbbbbbbbbbbbb.'], { w: '#F4F3EE', l: '#F7F6F2', g: '#D2D1C8', b: t, d: '#B45F43' })
    f(22, 8, 7, 2, '#4A4A48', 'pan'); f(26, 10, 1, 1, '#4A4A48', 'pan'); f(24, 7, 3, 1, '#F5B731', 'egg')
  },
  // Light: racer in a helmet; runs at double pace, the checkered flag flutters.
  light: (f, t) => {
    crabBody(f, -4)
    stamp(f, 6, 5, ['....rrrrrrrrrr....', '..rrrrrrwwrrrrrr..', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.rrrrrrrwwrrrrrrr.', '.kkkkkkkkkkkkkkkkr'], { r: t, w: '#F8F6F1', k: INK })
    f(25, 1, 1, 9, '#8E929A')
    stamp(f, 26, 1, ['wkwk', 'kwkw', 'wkwk'], { w: '#F8F6F1', k: INK }, 'flag')
  },
  // Explore: pirate scouting the code; the cutlass fences.
  explore: f => {
    crabBody(f)
    stamp(f, 5, 3, ['.kk..............kk.', '.kkk....kkkk....kkk.', '..kkkkkkkwwkkkkkkk..', '..kkkkkkkkkkkkkkkk..', '.gggggggggggggggggg.'], { k: '#55514C', w: '#F8F6F1', g: '#F5C542' })
    f(7, 11, 11, 1, INK); f(18, 11, 4, 3, INK)
    f(27, 6, 1, 9, '#C9CCD2', 'it'); f(26, 15, 3, 1, '#7A4A26', 'it')
  },
  // Apoio's roles act their job out: what they work on stands in front of them
  // (a class with `fr` draws over the legs), and each wears its trade.
  // Legendista: headphones and a hoodie; types the captions on the laptop beside him.
  legendista: (f, t) => {
    crabTrunk(f)
    f(7, 16, 16, 6, t); f(12, 16, 1, 3, '#F8F6F1'); f(17, 16, 1, 3, '#F8F6F1')
    f(8, 7, 14, 1, '#3A3A3C'); f(7, 8, 1, 2, '#3A3A3C'); f(22, 8, 1, 2, '#3A3A3C')
    f(5, 10, 3, 4, '#3A3A3C'); f(22, 10, 3, 4, '#3A3A3C'); f(6, 11, 1, 2, t); f(23, 11, 1, 2, t)
    desk(f)
    f(23, 13, 7, 7, '#3A3A3C', 'fr'); f(24, 14, 5, 5, '#BFE3F5', 'fr')
    f(24, 15, 4, 1, '#A83E62', 'fr tx1'); f(24, 17, 3, 1, '#A83E62', 'fr tx2')
    f(11, 20, 19, 2, '#8E929A', 'fr')
    for (let x = 12; x < 29; x += 2) f(x, 20, 1, 1, '#5A5A5C', 'fr')
    f(13, 18, 4, 3, CLAY, 'fr kl'); f(18, 18, 4, 3, CLAY, 'fr kr')
  },
  // Revisor: shirt and tie at the desk; reads the screen through a big magnifier at his eye.
  revisor: (f, t) => {
    crabTrunk(f)
    f(7, 16, 16, 6, '#F1EFEA'); f(12, 16, 2, 1, '#D2D1C8'); f(16, 16, 2, 1, '#D2D1C8'); f(14, 16, 2, 5, t)
    desk(f)
    f(0, 11, 8, 9, '#3A3A3C', 'fr'); f(1, 12, 6, 7, '#F4F3EE', 'fr')
    f(2, 13, 4, 1, '#9A9A96', 'fr'); f(2, 15, 3, 1, '#9A9A96', 'fr'); f(2, 17, 4, 1, '#9A9A96', 'fr')
    f(2, 16, 3, 1, t, 'fr mk'); f(3, 20, 2, 2, '#3A3A3C', 'fr')
    f(8, 19, 4, 3, CLAY, 'fr')
    magnifier(f)
  },
  // Roteirista: beret, scarf and a striped shirt; writes the script on the sheet in front of him.
  roteirista: (f, t) => {
    crabTrunk(f)
    f(7, 16, 16, 6, '#2F3E5C'); for (const y of [16, 18, 20]) f(7, y, 16, 1, '#F8F6F1')
    f(8, 15, 14, 1, t); f(10, 16, 2, 3, t)
    stamp(f, 6, 5, ['.........s........', '....bbbbbbbbbb....', '..bbbbbbbbbbbbbb..', '.bbbbbbbbbbbbbbbbb', 'dddddddddddddddd..'], { s: '#466A24', b: t, d: '#466A24' })
    desk(f)
    f(6, 16, 15, 6, '#F8F6F1', 'fr')
    f(8, 17, 10, 1, '#9A9A96', 'fr'); f(8, 19, 11, 1, '#9A9A96', 'fr')
    f(8, 21, 8, 1, INK, 'fr ln')
    f(3, 17, 4, 3, CLAY, 'fr')
    f(18, 18, 3, 3, CLAY, 'fr pn')
    f(16, 21, 1, 1, INK, 'fr pn'); f(17, 20, 1, 1, '#E8C9A0', 'fr pn')
    for (let i = 0; i < 4; i++) f(18 + i, 19 - i, 1, 1, '#F5C542', 'fr pn')
    f(22, 15, 1, 1, '#8E929A', 'fr pn'); f(23, 14, 1, 1, '#E88A9A', 'fr pn')
  },
  // Capa: photographer's vest and a cap worn backwards; looks through the camera and fires the flash.
  capa: (f, t) => {
    crabTrunk(f)
    f(7, 16, 4, 6, '#A08A5C'); f(19, 16, 4, 6, '#A08A5C'); f(8, 18, 2, 2, '#8A7449'); f(20, 18, 2, 2, '#8A7449')
    stamp(f, 7, 8, ['..cccccccccccc..', 'cccccccccccccccc'], { c: t }); f(3, 9, 4, 1, '#1E7887')
    f(15, 8, 4, 1, '#3A3A3C'); f(13, 9, 12, 7, '#3A3A3C'); f(21, 7, 3, 2, '#E6E8EE')
    stamp(f, 16, 10, ['.ggg.', 'gkkkg', 'gkkkg', 'gkkkg', '.ggg.'], { g: '#8E929A', k: INK })
    f(17, 11, 1, 1, '#fff')
    f(10, 14, 3, 3, CLAY); f(25, 11, 3, 4, CLAY)
    f(21, 5, 3, 2, '#FFF7D6', 'fl'); f(22, 1, 1, 3, '#F5C542', 'fl')
    f(17, 5, 3, 1, '#F5C542', 'fl'); f(25, 5, 3, 1, '#F5C542', 'fl')
    f(19, 2, 1, 1, '#F5C542', 'fl'); f(25, 2, 1, 1, '#F5C542', 'fl')
  },
  // Headlines: a painter in beret and smock; holds the palette in front, dips the brush and raises it.
  headlines: (f, t) => {
    crabTrunk(f)
    f(7, 15, 16, 7, '#F1EFEA')
    f(9, 17, 1, 1, '#D0453F'); f(20, 16, 1, 1, '#378ADD'); f(18, 20, 1, 1, '#F5C542'); f(11, 20, 1, 1, t)
    stamp(f, 6, 6, ['........s.........', '...bbbbbbbbbbbb...', '.bbbbbbbbbbbbbbbb.', 'bbbbbbbbbbbbbbbbbb', '..dddddddddddddd..'], { s: '#7A4192', b: t, d: '#7A4192' })
    f(4, 17, 3, 3, CLAY)
    stamp(f, 3, 15, ['..wwwwwwwww.', '.wwrwwywwwww', 'wwwwwwwwwbww', 'ww..wwwgwwww', 'wwwwwwwwwwww', '.wwwwwwwwww.', '...wwwwww...'],
      { w: '#D9B382', r: '#D0453F', y: '#F5C542', b: '#378ADD', g: '#3B9C5F' }, 'pal')
    f(23, 8, 4, 4, CLAY, 'br')
    for (let i = 0; i < 3; i++) f(22 - i, 12 + i, 1, 1, '#7A4A26', 'br')
    f(19, 15, 1, 1, '#8E929A', 'br'); f(18, 16, 1, 1, t, 'br'); f(17, 17, 1, 1, t, 'br')
  },
  // Conferente: glasses on; checks the table on his clipboard while the tasks above tick green.
  conferente: (f, t) => {
    crabTrunk(f)
    for (const x of [8, 18]) {
      f(x, 11, 4, 1, '#3A3A3C'); f(x, 14, 4, 1, '#3A3A3C'); f(x, 11, 1, 4, '#3A3A3C'); f(x + 3, 11, 1, 4, '#3A3A3C')
    }
    f(12, 12, 6, 1, '#3A3A3C')
    f(7, 15, 16, 7, t)
    f(8, 15, 14, 9, '#7A4A26', 'fr'); f(9, 16, 12, 7, '#F8F6F1', 'fr'); f(13, 14, 4, 2, '#8E929A', 'fr')
    f(9, 18, 12, 1, '#D2D1C8', 'fr'); f(9, 20, 12, 1, '#D2D1C8', 'fr'); f(12, 16, 1, 7, '#D2D1C8', 'fr')
    for (const [y, k] of [[16, 'k1'], [19, 'k2'], [21, 'k3']] as const) {
      f(10, y, 1, 1, '#C9CCD2', 'fr'); f(10, y, 1, 1, '#3B9C5F', `fr ${k}`)
      f(14, y, 5, 1, '#9A9A96', 'fr')
    }
    f(5, 17, 3, 3, CLAY, 'fr'); f(22, 17, 3, 3, CLAY, 'fr')
    for (const [x, y, k] of [[0, 1, 'k1'], [11, 0, 'k2'], [22, 1, 'k3']] as const) {
      f(x, y, 8, 4, '#F8F6F1'); f(x + 1, y + 1, 2, 2, '#C9CCD2'); f(x + 1, y + 1, 2, 2, '#3B9C5F', k)
      f(x + 4, y + 1, 3, 1, '#9A9A96'); f(x + 4, y + 2, 2, 1, '#9A9A96')
    }
  },
  // Curador: suit, bow tie and monocle; stamps the approved b-roll on the filmstrip while the rest go dark.
  curador: (f, t) => {
    crabTrunk(f)
    f(7, 15, 16, 7, '#3A3A3C'); f(13, 15, 4, 7, '#F1EFEA')
    stamp(f, 12, 14, ['bb..bb', 'bbbbbb', 'bb..bb'], { b: t }); f(14, 15, 2, 1, '#6B3419')
    stamp(f, 18, 11, ['.gg.', 'g..g', 'g..g', '.gg.'], { g: '#D4AF37' }); f(19, 12, 1, 1, '#fff')
    f(22, 14, 1, 1, '#D4AF37'); f(21, 15, 1, 1, '#D4AF37')
    desk(f)
    f(0, 18, 30, 5, '#2A2A2C', 'fr')
    for (let x = 1; x < 30; x += 3) { f(x, 18, 1, 1, '#8E929A', 'fr sp'); f(x, 22, 1, 1, '#8E929A', 'fr sp') }
    for (const [x, sky] of [[2, '#C9CCD2'], [11, '#E8A87C'], [20, '#8FC9E8']] as const) {
      f(x, 19, 7, 2, sky, 'fr'); f(x, 21, 7, 1, '#5E9E4A', 'fr'); f(x + 5, 19, 1, 1, '#F5C542', 'fr')
    }
    f(2, 19, 7, 3, 'rgba(31,30,29,.65)', 'fr no'); f(11, 19, 7, 3, 'rgba(31,30,29,.65)', 'fr no')
    f(19, 18, 9, 1, '#3B9C5F', 'fr ok'); f(19, 22, 9, 1, '#3B9C5F', 'fr ok'); f(19, 18, 1, 5, '#3B9C5F', 'fr ok'); f(27, 18, 1, 5, '#3B9C5F', 'fr ok')
    f(4, 15, 3, 3, CLAY, 'fr')
    f(23, 6, 4, 2, '#7A4A26', 'fr st'); f(24, 8, 2, 4, '#7A4A26', 'fr st'); f(22, 12, 6, 2, t, 'fr st'); f(22, 14, 6, 1, '#6B3419', 'fr st')
    f(25, 9, 3, 3, CLAY, 'fr st')
  },
  // The corner crab's moods. Sleeping: eyes shut, claws down, Zs drifting up.
  'm-sleep': f => {
    f(7, 10, 16, 12, CLAY); f(3, 17, 4, 4, CLAY); f(23, 17, 4, 4, CLAY)
    f(9, 13, 2, 1, INK); f(19, 13, 2, 1, INK)
    f(7, 22, 2, 4, CLAY, 'la'); f(17, 22, 2, 4, CLAY, 'la'); f(11, 22, 2, 4, CLAY, 'lb'); f(21, 22, 2, 4, CLAY, 'lb')
    stamp(f, 22, 3, ['zzzz', '..z.', '.z..', 'zzzz'], { z: '#9a9a96' }, 'z1')
    stamp(f, 26, 0, ['zzz', '.z.', 'zzz'], { z: '#9a9a96' }, 'z2')
  },
  // Thinking: eyes up, a claw at the chin, and a white thought bubble with a grey rim (it reads
  // on light and dark) whose three dots fill in one by one.
  'm-think': f => {
    f(7, 10, 16, 12, CLAY); f(3, 14, 4, 4, CLAY); f(23, 16, 4, 4, CLAY); f(21, 18, 3, 2, CLAY)
    f(9, 11, 2, 2, INK); f(19, 11, 2, 2, INK)
    f(7, 22, 2, 4, CLAY, 'la'); f(17, 22, 2, 4, CLAY, 'la'); f(11, 22, 2, 4, CLAY, 'lb'); f(21, 22, 2, 4, CLAY, 'lb')
    const bubble = { k: '#8A8984', w: '#FFFFFF' }
    stamp(f, 13, 7, ['kk', 'kk'], bubble)
    stamp(f, 15, 4, ['.k.', 'kwk', '.k.'], bubble)
    stamp(f, 17, 0, ['.kkkkkkkkkkk.', 'kwwwwwwwwwwwk', 'kwwwwwwwwwwwk', 'kwwwwwwwwwwwk', 'kwwwwwwwwwwwk', '.kkkkkkkkkkk.'], bubble)
    f(19, 2, 2, 2, '#3A3A3C', 'd1'); f(22, 2, 2, 2, '#3A3A3C', 'd2'); f(25, 2, 2, 2, '#3A3A3C', 'd3')
  },
  // Analyzing: the big magnifier at the eye; the eyes glance left and right, then blink.
  'm-analyze': f => {
    crabTrunk(f)
    f(3, 14, 4, 4, CLAY)
    magnifier(f)
  },
  // Working: a hard hat; the hammer comes down, sparks fly.
  'm-work': f => {
    crabBody(f, -4)
    stamp(f, 6, 5, ['.....yyyyyyyy.....', '...yyyyyyyyyyyy...', '..yyyyyyyyyyyyyy..', 'dddddddddddddddddd'], { y: '#F5C542', d: '#C99A1E' })
    f(26, 5, 1, 6, '#7A4A26', 'hm'); f(24, 3, 5, 3, '#8E929A', 'hm')
    f(28, 12, 1, 1, '#F5C542', 'sp'); f(26, 14, 1, 1, '#F5C542', 'sp'); f(29, 15, 1, 1, '#F5C542', 'sp')
  },
  // Coordinating: a megaphone, calling the subagents to work.
  'm-delegate': f => {
    crabBody(f, -4)
    f(23, 8, 3, 3, '#D97757'); f(25, 7, 2, 5, '#E6E8EE'); f(27, 5, 2, 9, '#E6E8EE')
    f(29, 6, 1, 1, '#8f8cf4', 'w1'); f(29, 9, 1, 1, '#8f8cf4', 'w2'); f(29, 12, 1, 1, '#8f8cf4', 'w1')
  },
  other: f => crabBody(f),
}

const costumeOf = (type: string): string =>
  type === 'Explore' ? 'explore' : (ROLE_OF[type.replace(/^[^:]*:/, '')] ?? tierOf(type))

const CRAB_SCALE = 1.1

// Body and props nest inside `bd` so a prop rides the bob and adds its own motion;
// legs stay outside it and step on their own.
const crab = (x: number, y: number, costume: string, dim = false, isWalking = false, scale = CRAB_SCALE): string => {
  const groups = new Map<string, string[]>([['bd', []]])
  const f: Fill = (cx, cy, w, h, c, cls = 'bd') => {
    if (!groups.has(cls)) groups.set(cls, [])
    groups.get(cls)?.push(`<rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${c}"/>`)
  }
  const draw = COSTUMES[costume] ?? ((g: Fill) => crabBody(g))
  draw(f, colorOf(costume))
  const group = (cls: string) => `<g class="${cls}">${(groups.get(cls) ?? []).join('')}</g>`
  const isFront = (k: string) => k.split(' ').includes('fr')
  const props = [...groups.keys()].filter(k => k !== 'bd' && k !== 'la' && k !== 'lb' && !isFront(k))
  const front = [...groups.keys()].filter(isFront)
  const body = `<g class="bd">${(groups.get('bd') ?? []).join('')}${props.map(group).join('')}</g>`
  return `<g transform="translate(${x},${y}) scale(${scale})" opacity="${dim ? 0.45 : 1}" shape-rendering="crispEdges"><g class="c-${costume}${isWalking ? ' run' : ''}">${body}${group('la')}${group('lb')}${front.map(group).join('')}</g></g>`
}

const statusMark = (x: number, y: number, status: string, color: string): string => {
  if (status === 'running') return `<circle class="live" cx="${x}" cy="${y}" r="3.5" fill="${color}"/>`
  if (status === 'done') return `<path d="M${x - 5} ${y}l3.5 3.5 6.5-7" fill="none" stroke="#3B9C5F" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  if (status === 'failed') return `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#D0453F" stroke-width="1.8" stroke-linecap="round"/>`
  return `<circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#9a9a96" stroke-width="1.4"/><path d="M${x} ${y - 2.5}v2.8l1.8 1.2" fill="none" stroke="#9a9a96" stroke-width="1.4" stroke-linecap="round"/>`
}

const svg = (W: number, H: number, body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${PANE_CSS}${CRAB_CSS}${body}</svg>`

// The pane's own title already says "Agents": the header names the flow, if any.
const headerSvg = (W: number, title: string, t: ReturnType<typeof totals>): string => {
  const s = tr()
  const gap = 6
  const tw = (W - gap * 2) / 3
  const top = title ? 28 : 0
  const tile = (i: number, k: string, v: string) =>
    `<rect class="tile" x="${i * (tw + gap)}" y="${top}" width="${tw}" height="40" rx="8"/>
<text class="s" x="${i * (tw + gap) + 9}" y="${top + 16}" font-family="${FONT}" font-size="11">${k}</text>
<text class="t" x="${i * (tw + gap) + 9}" y="${top + 33}" font-family="${FONT}" font-size="15" font-weight="600" font-variant-numeric="tabular-nums">${v}</text>`
  return svg(
    W,
    headerHeight(title),
    `${title ? `<text class="t" x="0" y="15" font-family="${FONT}" font-size="14" font-weight="600">${xml(fitText(title, 14, W))}</text>` : ''}
${tile(0, s.cost, '≈' + fmtCost(t.cost))}${tile(1, s.tokens, fmtTokens(t.tokens))}${tile(2, s.time, fmtTime(t.time))}`,
  )
}

const headerHeight = (title: string): number => (title ? 72 : 44)

// The flow's steps, group by group: done, in progress, still to come. Two columns when wide.
const STEP_ROW = 18
const stepColumns = (W: number): number => (W >= 380 ? 2 : 1)
const stepsHeight = (f: Flow, W: number): number =>
  f.groups.reduce((h, g) => h + 22 + Math.ceil(g.steps.length / stepColumns(W)) * STEP_ROW, 4)

const stepsSvg = (W: number, f: Flow): string => {
  const n = stepColumns(W)
  const colW = W / n
  const out: string[] = []
  let y = 0
  let index = 0
  f.groups.forEach((g, gi) => {
    const color = groupColor(g.name, gi)
    const gDone = Math.max(0, Math.min(g.steps.length, f.done - index))
    out.push(`<text x="0" y="${y + 15}" font-family="${FONT}" font-size="12" font-weight="600" fill="${color}">${xml(fitText(g.name, 12, W - 60))}</text>
<text class="m" x="${W}" y="${y + 15}" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${f.isFinished ? g.steps.length : gDone}/${g.steps.length}</text>`)
    y += 22
    g.steps.forEach((name, i) => {
      const at = index + i
      const state = f.isFinished || at < f.done ? 'done' : at === f.done ? 'now' : 'next'
      const x = (i % n) * colW
      const ry = y + Math.floor(i / n) * STEP_ROW
      const mark =
        state === 'done'
          ? `<path d="M${x + 1} ${ry + 9}l3 3 6-6.5" fill="none" stroke="#3B9C5F" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`
          : state === 'now'
            ? `<circle class="live" cx="${x + 5}" cy="${ry + 9}" r="3.5" fill="${color}"/>`
            : `<circle cx="${x + 5}" cy="${ry + 9}" r="3.5" fill="none" stroke="#9a9a96" stroke-width="1.2"/>`
      out.push(`${mark}<text class="${state === 'next' ? 'm' : 't'}" x="${x + 16}" y="${ry + 13}" font-family="${FONT}" font-size="12" font-weight="${state === 'now' ? 600 : 400}">${xml(fitText(name, 12, colW - 22))}</text>`)
    })
    y += Math.ceil(g.steps.length / n) * STEP_ROW
    index += g.steps.length
  })
  return svg(W, stepsHeight(f, W), out.join('\n'))
}

// The task's own progress when the worker reports steps; a finished run is full.
const progressOf = (a: AgentRun): number | null => {
  if (a.status === 'done') return 1
  if (a.stepTotal) return Math.min(1, (a.stepDone ?? 0) / a.stepTotal)
  return null
}

const ctxOf = (a: AgentRun): number => (a.contextMax ? Math.min(100, Math.round((a.contextTokens / a.contextMax) * 100)) : 0)

const agentSvg = (W: number, a: AgentRun, at: number): string => {
  const s = tr()
  const tier = tierOf(a.type)
  const color = colorOf(costumeOf(a.type))
  const ctx = ctxOf(a)
  const textW = W - 42 - 22
  const meta = [a.effort ? `${modelName(a.model)} · ${a.effort}` : modelName(a.model)]
  if (a.round > 1) meta.push(`${s.round} ${a.round}`)
  if (a.status === 'failed') meta.push(s.failed)
  const barW = textW
  const progress = progressOf(a)
  const stats = `ctx ${ctx}% · ${fmtTokens(a.contextTokens)}  ≈${fmtCost(a.costUsd)}  ${fmtTime(elapsed(a, at))}`
  const steps = a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' · ' + a.stepNote : ''}` : ''
  const stepsW = Math.max(0, barW - textWidth(stats, 11) - 12)
  // Without reported steps the bar falls back to the context, drawn grey.
  const fillW = Math.round(barW * (progress ?? ctx / 100))
  return svg(
    W,
    66,
    `${crab(0, 14, costumeOf(a.type), false, a.status === 'running')}
<text class="t" x="42" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(a.description || a.type, 13, textW))}</text>
<text x="42" y="34" font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tier === 'other' ? a.type : tier)}</tspan><tspan class="s">  ${xml(meta.join('  ·  '))}</tspan></text>
${steps && stepsW > 30 ? `<text class="t" x="42" y="49" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${xml(fitText(steps, 11, stepsW))}</text>` : ''}
<text class="s" x="${42 + barW}" y="49" text-anchor="end" font-family="${FONT}" font-size="11" font-variant-numeric="tabular-nums">${stats}</text>
<rect class="k" x="42" y="55" width="${barW}" height="4" rx="2"/><rect${progress === null ? ' class="m"' : ''} x="42" y="55" width="${fillW}" height="4" rx="2"${progress === null ? '' : ` fill="${color}"`}/>
${statusMark(W - 8, 16, a.status, color)}
<line class="ln" x1="0" y1="65.5" x2="${W}" y2="65.5"/>`,
  )
}

const plannedSvg = (W: number, p: Planned): string => {
  const tier = p.tier in TIER_COLOR ? p.tier : 'other'
  const color = colorOf(tier)
  const textW = W - 42 - 22
  const meta = [TIER_MODEL[tier] ?? '']
  if (p.after.length) meta.push(`${tr().after} ${p.after.join(', ')}`)
  return svg(
    W,
    46,
    `${crab(0, 6, tier, true)}
<text class="s" x="42" y="18" font-family="${FONT}" font-size="13" font-weight="600">${xml(fitText(`${p.n}. ${p.title}`, 13, textW))}</text>
<text x="42" y="34" font-family="${FONT}" font-size="11"><tspan fill="${color}">${xml(tier)}</tspan><tspan class="m">  ${xml(meta.filter(Boolean).join('  ·  '))}</tspan></text>
${statusMark(W - 8, 16, 'planned', color)}
<line class="ln" x1="0" y1="45.5" x2="${W}" y2="45.5"/>`,
  )
}

const compactSvg = (W: number, list: AgentRun[], planned: Planned[], t: ReturnType<typeof totals>): string => {
  const icons = [
    ...list.filter(a => a.status === 'running').map(a => ({ k: costumeOf(a.type), c: colorOf(costumeOf(a.type)), s: 'running', dim: false })),
    ...list.filter(a => a.status !== 'running').map(a => ({ k: costumeOf(a.type), c: colorOf(costumeOf(a.type)), s: a.status, dim: false })),
    ...planned.map(p => ({ k: p.tier in TIER_COLOR ? p.tier : 'other', c: colorOf(p.tier), s: 'planned', dim: true })),
  ]
  const fit = Math.max(1, Math.floor((W - 150) / 36))
  const shown = icons.slice(0, fit)
  const more = icons.length - shown.length
  const body = shown
    .map((ic, i) => crab(i * 36, 0, ic.k, ic.dim, ic.s === 'running') + (ic.s === 'running' ? `<circle class="live" cx="${i * 36 + 32}" cy="4" r="3" fill="${ic.c}"/>` : ''))
    .join('')
  const x = shown.length * 36 + (more ? 4 : 0)
  return svg(
    W,
    32,
    `${body}${more ? `<text class="s" x="${x}" y="21" font-family="${FONT}" font-size="12">+${more}</text>` : ''}
<text class="s" x="${W}" y="21" text-anchor="end" font-family="${FONT}" font-size="12" font-variant-numeric="tabular-nums">≈${fmtCost(t.cost)} · ${fmtTokens(t.tokens)} · ${fmtTime(t.time)}</text>`,
  )
}

// --- terminal drawing: the same rows in text.

const ctxBar = (pct: number, width: number): string => {
  const filled = Math.round((width * pct) / 100)
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled))
}

const STATUS_GLYPH: Record<string, string> = { running: '●', done: '✓', failed: '✗', planned: '◷' }

// Opens the agents pane, or closes it when it is up; true when it ends up open.
async function togglePane($: EngineInterface): Promise<boolean> {
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isOpen) {
    await $.ui.close({ id: PANE })
    return false
  }
  const at = await $.clock.now()
  await update($, now, () => at)
  await $.ui.open({ id: PANE, title: tr().pane })
  return true
}

async function autoOpen($: EngineInterface, key: string): Promise<void> {
  const p = await read($, panel)
  if (p.autoOpenedFor === key) return
  await update($, panel, prev => ({ ...prev, autoOpenedFor: key }))
  void $.ui.open({ id: PANE, title: tr().pane })
}

// Session start, after the other hooks: the language, the tools and the clock.
// The mod's register.tsx calls it (one session.start hook for the whole mod).
async function progressStart($: EngineInterface, options: Parameters<Register>[1]): Promise<void> {
  lang = await detectLang($, options.language)
  await $.tool.register({
    name: 'progress',
    description:
      'Report /savvy-flow progress to the progress bar above the prompt and the agents panel. ' +
      'Call it after presenting the plan (title, total, tasks, phase "delegate"), each time a task is accepted (done), ' +
      'when switching phase or re-planning (tasks), and once at the end with finished: true. Fields left out keep their previous value. ' +
      'Optional for any long job: `groups` splits the bar into named stretches (one per stage) with their steps, and the bar and the agents panel then show the step in progress.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short name of the overall task, a few words.' },
        total: { type: 'integer', minimum: 0, description: 'Number of planned worker tasks.' },
        done: { type: 'integer', minimum: 0, description: 'Number of tasks accepted after review.' },
        phase: { type: 'string', enum: [...PHASES] },
        finished: { type: 'boolean', description: 'True once the flow is closed.' },
        step: { type: 'string', description: 'The step in progress, a few words; shown on the bar. Not needed with `groups`, which name it from `done`.' },
        groups: {
          type: 'array',
          description:
            'Named stretches of the bar, in order, each with its steps in order. The total is the number of steps unless `total` is given; `done` counts steps across all groups.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'A word or two, shown under its stretch of the bar.' },
              steps: {
                type: 'array',
                description: 'The steps of this stretch, in order: a few words each, or { name, short } to give the bar a shorter name than the panel.',
                items: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'object', properties: { name: { type: 'string' }, short: { type: 'string', description: 'One word or two, for the bar.' } }, required: ['name'] },
                  ],
                },
              },
            },
            required: ['name', 'steps'],
          },
        },
        tasks: {
          type: 'array',
          description:
            'The planned worker tasks in order, numbered from 1. Each title must equal the Agent tool `description` the task will be delegated with, so the panel can match runs to tasks.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'A few words; reused verbatim as the Agent description.' },
              tier: { type: 'string', enum: ['fable', 'heavy', 'careful', 'medium', 'light'] },
              after: { type: 'array', items: { type: 'integer' }, description: 'Numbers of the tasks this one waits for.' },
            },
            required: ['title', 'tier'],
          },
        },
      },
    },
  })
  await $.tool.register({
    name: 'step',
    description:
      'For savvy-flow workers: report progress on your own task to the agents panel. ' +
      'Right after reading the brief, call it with `total` (your plan in 3-8 steps) and `done: 0`; ' +
      'call it again as each step finishes. Cheap and silent: it only draws a bar.',
    inputSchema: {
      type: 'object',
      properties: {
        done: { type: 'integer', minimum: 0, description: 'Steps finished so far.' },
        total: { type: 'integer', minimum: 1, description: 'Steps planned; may change if the plan changes.' },
        note: { type: 'string', description: 'The step in progress, a few words.' },
      },
      required: ['done'],
    },
  })
  await $.command.register({
    name: 'agents-info',
    description: 'Show or hide the panel of subagents: running, finished and planned, with model, context, cost and time',
  })

  // The agents pane stays open, like the file tree: empty until a subagent runs.
  if (!(await $.ui.panes()).some(p => p.id === PANE)) void $.ui.open({ id: PANE, title: tr().pane })

  // Ticks the running agents' clocks; quiet when nothing runs.
  $.clock.every(1000, () => {
    void (async () => {
      const list = await read($, agents)
      if (!list.some(a => a.status === 'running')) return
      const at = await $.clock.now()
      await update($, now, () => at)
    })()
  })
}

// A subagent's response landed: its model, context, tokens and cost.
async function progressAfterStep(
  $: EngineInterface,
  e: { agentId?: string; effort?: unknown; model: string },
  result: TurnStepResult,
): Promise<void> {
  const agentId = e.agentId
  const usage = result.usage
  if (!agentId || !usage) return

  const model = usage.model || e.model
  await update($, agents, list =>
    list.map(a =>
      a.agentId !== agentId
        ? a
        : {
            ...a,
            model,
            effort: typeof e.effort === 'string' ? e.effort : a.effort,
            status: 'running',
            endedAt: undefined,
            contextTokens:
              (usage.input_tokens || 0) +
              (usage.cache_read_input_tokens || 0) +
              (usage.cache_creation_input_tokens || 0) +
              (usage.output_tokens || 0),
            contextMax: windowOf(model),
            tokens:
              a.tokens +
              (usage.input_tokens || 0) +
              (usage.output_tokens || 0) +
              (usage.cache_read_input_tokens || 0) +
              (usage.cache_creation_input_tokens || 0),
            costUsd: a.costUsd + costOf(model, usage),
            steps: a.steps + 1,
          },
    ),
  )
}

// The flow's progress, reported to the bar.
async function reportProgress($: EngineInterface, e: ToolCallInput) {
  const input = e as unknown as ProgressInput
  const prev = await read($, flow)
  if (isNewFlow(prev, input) && input.title !== undefined) {
    // A new flow starts with a clean list; agents still running stay.
    await update($, agents, list => list.filter(a => a.status === 'running'))
  }
  const next = await update($, flow, p => merge(p, input))
  if (next && input.tasks?.length) await autoOpen($, next.title)
  return { result: `ok: ${label(next ?? blank())}` }
}

// A worker's own progress: the call runs in the worker's loop, so agentId names it.
async function reportStep($: EngineInterface, e: ToolCallInput) {
  const input = e as unknown as { done?: number; total?: number; note?: string }
  const agentId = e.agentId
  if (!agentId) return { result: 'ignored: only subagents report steps' }
  await update($, agents, list =>
    list.map(a => {
      if (a.agentId !== agentId) return a
      const total = Math.max(0, Math.round(input.total ?? a.stepTotal ?? 0))
      const done = Math.max(0, Math.round(input.done ?? a.stepDone ?? 0))
      return { ...a, stepTotal: total, stepDone: total ? Math.min(total, done) : done, stepNote: input.note?.trim() || undefined }
    }),
  )
  return { result: 'ok' }
}

const registerProgress: Register = on => {
  on('command.run', { command: 'agents-info' }, async $ => {
    const isOpen = await togglePane($)
    return { text: isOpen ? tr().opened : tr().closed }
  })

  on('tool.call', { tool: TOOL }, reportProgress)

  on('tool.call', { tool: STEP_TOOL }, reportStep)

  // Safety net: worker launches move the faint layer even if the orchestrator forgets to report.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    // `savvy-heavy`, or `crabhud:savvy-heavy` as the Agent tool lists the mod's own agents.
    const type = String(e.subagent_type ?? '').replace(/^[^:]*:/, '')
    if (!type.startsWith('savvy-')) return next(e)

    await update($, flow, prev => {
      const base = prev && !prev.isFinished ? { ...blank(), ...prev } : blank()
      return { ...base, running: base.running + 1, phase: base.phase === 'plan' ? 'delegate' : base.phase }
    })
    try {
      return await next(e)
    } finally {
      await update($, flow, prev => (prev ? { ...prev, running: Math.max(0, prev.running - 1) } : prev))
    }
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if (started.deny !== undefined) return started

    const at = await $.clock.now()
    await update($, agents, list => {
      const round = 1 + list.filter(a => norm(a.description) === norm(e.description) && e.description).length
      const run: AgentRun = {
        id: started.agentId ?? e.tool_use_id,
        agentId: started.agentId,
        type: e.subagentType,
        description: e.description,
        model: started.model,
        status: 'running',
        startedAt: at,
        contextTokens: 0,
        contextMax: windowOf(started.model),
        tokens: 0,
        costUsd: 0,
        steps: 0,
        round,
      }
      return [...list.filter(a => a.id !== run.id), run].slice(-200)
    })
    await update($, now, () => at)
    if (e.subagentType.replace(/^[^:]*:/, '').startsWith('savvy-')) {
      const f = await read($, flow)
      await autoOpen($, f && !f.isFinished ? f.title : 'savvy-flow')
    } else if (!(await $.ui.panes()).some(p => p.id === PANE)) {
      void $.ui.open({ id: PANE, title: tr().pane })
    }
    return started
  })

  // Each model request of a subagent: live context, tokens and cost.
  on('turn.complete', async ($, e, next) => {
    const agentId = e.agentId
    if (agentId) {
      const at = await $.clock.now()
      await update($, agents, list =>
        list.map(a => {
          if (a.agentId !== agentId) return a
          // A run whose steps went unseen still gets the turn's own sum.
          const fallback = a.steps === 0 && e.usage
          return {
            ...a,
            status: e.reason === 'answer' ? 'done' : 'failed',
            endedAt: at,
            ...(fallback && e.usage
              ? {
                  model: e.usage.model || a.model,
                  tokens:
                    e.usage.input_tokens +
                    e.usage.output_tokens +
                    e.usage.cache_read_input_tokens +
                    e.usage.cache_creation_input_tokens,
                  costUsd: costOf(e.usage.model || a.model, e.usage),
                }
              : {}),
          }
        }),
      )
      await update($, now, () => at)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const s = tr()
    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    const list = await read($, agents)
    const f = await read($, flow)
    const p: Panel = await read($, panel)
    const at = Math.max(await read($, now), ...list.map(a => a.startedAt), 0)

    const running = list.filter(a => a.status === 'running').reverse()
    const finished = list.filter(a => a.status !== 'running').reverse()
    const planned = plannedOf(f, list)
    const t = totals(list, at)
    // The pane's title says "Agents"; inside, only the flow's own name.
    const title = f && !f.isFinished ? f.title : ''

    const toggleCompact = (
      <Button
        key="compact"
        label={p.isCompact ? s.expand : s.collapse}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isCompact: !prev.isCompact }))}
      />
    )
    const toggleDone = (
      <Button
        key="done"
        label={`${p.isDoneCollapsed ? '▸' : '▾'} ${s.finished} · ${finished.length}`}
        plain
        onPress={() => update($, panel, prev => ({ ...prev, isDoneCollapsed: !prev.isDoneCollapsed }))}
      />
    )
    const isEmpty = list.length === 0 && planned.length === 0
    const summary = `≈${fmtCost(t.cost)}, ${fmtTokens(t.tokens)} ${s.tokensWord}, ${fmtTime(t.time)}`

    if (e.surface === 'desktop' && 'Svg' in ui) {
      const { Svg } = ui
      const W = Math.max(240, Math.min(900, (e.props.bodyColumns || 40) * 8 - 8))
      const section = (key: string, text: string) => (
        <Text key={key} dimColor>
          {text}
        </Text>
      )

      if (p.isCompact) {
        return (
          <Box flexDirection="column" gap={1}>
            <Svg source={compactSvg(W, list, planned, t)} alt={`${list.length} ${s.agentsCount}, ${summary}`} width={W} height={32} />
            {toggleCompact}
          </Box>
        )
      }
      return (
        <Box flexDirection="column">
          <Svg source={headerSvg(W, title, t)} alt={title ? `${title}: ${summary}` : summary} width={W} height={headerHeight(title)} />
          {f && f.groups.length > 0 && (
            <Svg source={stepsSvg(W, f)} alt={stepsOf(f).map((x, i) => `${i < f.done || f.isFinished ? '✓' : i === f.done ? '→' : '○'} ${x}`).join(', ')} width={W} height={stepsHeight(f, W)} />
          )}
          {toggleCompact}
          {isEmpty && <Text dimColor>{s.empty}</Text>}
          {running.length > 0 && section('h-run', `${s.running} · ${running.length}`)}
          {running.map(a => (
            <Svg key={a.id} source={agentSvg(W, a, at)} alt={`${a.description}: ${modelName(a.model)}, ${s.isRunning}`} width={W} height={66} />
          ))}
          {finished.length > 0 && toggleDone}
          {!p.isDoneCollapsed &&
            finished.map(a => (
              <Svg key={a.id} source={agentSvg(W, a, at)} alt={`${a.description}: ${modelName(a.model)}, ${s.isFinished}`} width={W} height={66} />
            ))}
          {planned.length > 0 && section('h-plan', `${s.planned} · ${planned.length}`)}
          {planned.map(pl => (
            <Svg key={`plan-${pl.n}`} source={plannedSvg(W, pl)} alt={`${pl.n}. ${pl.title}: ${s.isPlanned}`} width={W} height={46} />
          ))}
        </Box>
      )
    }

    // Terminal: the same content in text rows.
    const cols = Math.max(24, e.props.bodyColumns || 40)
    const barW = Math.max(6, Math.min(20, cols - 34))
    const row = (a: AgentRun) => {
      const tier = tierOf(a.type)
      const color = colorOf(costumeOf(a.type))
      const ctx = ctxOf(a)
      const progress = progressOf(a)
      const model = a.effort ? `${modelName(a.model)} · ${a.effort}` : modelName(a.model)
      const steps = a.stepTotal ? `${a.stepDone ?? 0}/${a.stepTotal}${a.stepNote ? ' ' + a.stepNote : ''} · ` : ''
      return (
        <Box key={a.id} flexDirection="column" marginBottom={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={color}>▣</Text>
            <Text bold wrap="truncate-end">
              {a.description || a.type}
            </Text>
            <Text color={a.status === 'failed' ? 'red' : a.status === 'done' ? 'green' : color}>{STATUS_GLYPH[a.status]}</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {tier === 'other' ? a.type : tier} · {model}
            {a.round > 1 ? ` · ${s.round} ${a.round}` : ''}
          </Text>
          <Text wrap="truncate-end">
            {'  '}
            {progress === null ? <Text dimColor>{ctxBar(ctx, barW)}</Text> : <Text color={color}>{ctxBar(progress * 100, barW)}</Text>}
            <Text dimColor>
              {' '}
              {steps}ctx {ctx}% · {fmtTokens(a.contextTokens)} ≈{fmtCost(a.costUsd)} {fmtTime(elapsed(a, at))}
            </Text>
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold wrap="truncate-end">
            {title}
          </Text>
          {toggleCompact}
        </Box>
        <Text dimColor>
          ≈{fmtCost(t.cost)} · {fmtTokens(t.tokens)} {s.tokensWord} · {fmtTime(t.time)}
        </Text>
        {p.isCompact ? (
          <Text wrap="truncate-end">
            {[...running, ...finished].map(a => (
              <Text key={a.id} color={colorOf(costumeOf(a.type))}>
                {STATUS_GLYPH[a.status]}{' '}
              </Text>
            ))}
            {planned.map(pl => (
              <Text key={`plan-${pl.n}`} dimColor>
                ◷{' '}
              </Text>
            ))}
          </Text>
        ) : (
          <Box flexDirection="column" marginTop={1}>
            {isEmpty && <Text dimColor>{s.empty}</Text>}
            {running.length > 0 && <Text dimColor>{s.running} · {running.length}</Text>}
            {running.map(row)}
            {finished.length > 0 && toggleDone}
            {!p.isDoneCollapsed && finished.map(row)}
            {planned.length > 0 && <Text dimColor>{s.planned} · {planned.length}</Text>}
            {planned.map(pl => {
              const tier = pl.tier in TIER_COLOR ? pl.tier : 'other'
              return (
                <Box key={`plan-${pl.n}`} flexDirection="column" marginBottom={1}>
                  <Text dimColor wrap="truncate-end">
                    <Text color={colorOf(tier)}>▢</Text> {pl.n}. {pl.title} ◷
                  </Text>
                  <Text dimColor wrap="truncate-end">
                    {'  '}
                    {tier} · {TIER_MODEL[tier] ?? ''}
                    {pl.after.length ? ` · ${s.after} ${pl.after.join(', ')}` : ''}
                  </Text>
                </Box>
              )
            })}
          </Box>
        )}
      </Box>
    )
  })

  // The main agent's tool in flight: what the crab in the corner acts out.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined || e.tool === 'Agent' || e.tool === TOOL || e.tool === STEP_TOOL) return next(e)
    const id = e.tool_use_id
    await update($, activity, () => ({ id, kind: kindOf(e.tool), target: targetOf(e as unknown as Record<string, unknown>) }))
    try {
      return await next(e)
    } finally {
      await update($, activity, prev => (prev?.id === id ? null : prev))
    }
  })

  // Always on, above the other mods in the band: the flow's bar when one runs,
  // else the crab and what Claude is doing.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const f = await read($, flow)

    const ui = $.ui.resolve(e)
    const { Box, Text, Button } = ui
    // The band is shared: the bar sits on top, a hairline under it, and what the
    // other mods draw stays below.
    const theirs = await next(e)
    // About 8 CSS px per reported column. No floor above the slot: a row wider than it would wrap.
    const slot = (e.props.bodyColumns || 100) * 8
    const list = await read($, agents)
    const running = list.filter(a => a.status === 'running').length
    const act = await read($, activity)
    const mood = moodOf(e.props.isWorking, running, act)
    const status = moodText(mood, running, act)
    const crew = list.length + plannedOf(f, list).length
    // Opens or closes the agents pane; says how many subagents this session ran.
    const crewButton = crew ? (
      <Button key="savvy-agents" label={tr().agentsN(crew)} plain onPress={() => void togglePane($)} />
    ) : null
    // The drawing gets the slot minus the buttons beside it (the count, the dismiss) and their gaps.
    const buttons = (crew ? Math.round(textWidth(tr().agentsN(crew), 13)) + 36 : 0) + (f ? 40 : 0)
    const width = Math.max(180, Math.min(1600, slot - Math.max(24, buttons) - 16))
    const divider =
      'Svg' in ui ? (
        <ui.Svg source={hairline(width)} alt="—" width={width} height={13} />
      ) : (
        <Text dimColor>{'─'.repeat(Math.max(4, e.props.bodyColumns || 40))}</Text>
      )
    const above = (bar: RenderElement) => (
      <Box flexDirection="column">
        {bar}
        {divider}
        {theirs}
      </Box>
    )

    if (f === null) {
      if ('Svg' in ui) {
        const { Svg } = ui
        return above(
          <Box flexDirection="row" alignItems="center" gap={1}>
            <Svg source={moodSvg(width, mood, status)} alt={status} width={width} height={H} />
            {crewButton}
          </Box>,
        )
      }
      return above(
        <Box flexDirection="row" gap={1}>
          <Text color={CLAY}>▣</Text>
          <Text wrap="truncate-end" dimColor={mood === 'sleep'}>
            {status}
          </Text>
          {crewButton}
        </Box>,
      )
    }

    const percent = `${Math.round(ratio(f) * 100)}%`
    const dismiss = (
      <Button
        key="savvy-dismiss"
        label="✕"
        plain
        role="dismiss"
        onPress={() => update($, flow, () => null)}
      />
    )

    if ('Svg' in ui) {
      const { Svg } = ui
      return above(
        <Box flexDirection="row" alignItems="center" gap={1}>
          <Svg source={rowSvg(f, width, mood)} alt={`${f.title}: ${label(f)}, ${percent} · ${status}`} width={width} height={rowHeight(f)} />
          {crewButton}
          {dismiss}
        </Box>,
      )
    }

    const cols = e.props.bodyColumns
    const titleW = Math.max(8, Math.min(30, f.title.length + 2, Math.floor(cols / 3)))
    const barW = Math.max(6, Math.min(40, cols - titleW - 32))
    return above(
      <Box flexDirection="row" gap={2}>
        <Box width={titleW} flexShrink={0}>
          <Text color={f.isFinished ? DONE : ACCENT}>● </Text>
          <Text wrap="truncate-end">{f.title}</Text>
        </Box>
        <Text color={f.isFinished ? DONE : ACCENT}>{barText(f, barW)}</Text>
        <Text bold>{label(f)}</Text>
        <Text dimColor>{percent}</Text>
        <Text color={CLAY}>▣</Text>
        {crewButton}
        {dismiss}
      </Box>,
    )
  })
}

// ===========================================================================
// HUD: model, effort, context, 5-hour and 7-day limits, cost
// ===========================================================================

// Per chat: its context and cost, model and effort. Global: the account's
// limits, shared between chats through a small file every HUD reads.
const chatA = atom({ plugin: 'crabhud', key: 'chat' } as const, null)
const limitsA = atom({ plugin: 'crabhud', key: 'limits' } as const, null)
const modelA = atom({ plugin: 'crabhud', key: 'model' } as const, '')
const effortA = atom({ plugin: 'crabhud', key: 'effort' } as const, null)
const ultraA = atom({ plugin: 'crabhud', key: 'ultracode' } as const, false)
const expandedA = atom({ plugin: 'crabhud', key: 'expanded' } as const, false)
const hiddenA = atom({ plugin: 'crabhud', key: 'hidden' } as const, false)
const alertedA = atom({ plugin: 'crabhud', key: 'alerted' } as const, [])
// The HUD's language; null until the person picks one on the first run.
const langA = atom({ plugin: 'crabhud', key: 'language' } as const, null)

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

// The window autocompaction measures against, as /context shows it: the
// person's autoCompactWindow (the app's setting, settings.json or the
// environment) or else the model's own. Null until the engine answers; then
// the model's window stands in.
let compactWindow: number | null = null

// Asks the engine again, so a change to the setting shows within seconds. A
// summary breakdown is counted locally: no request leaves the machine.
async function pullCompactWindow($: EngineInterface): Promise<void> {
  const u = await $.session.usage({ breakdown: 'summary' }).catch(() => null)
  const window = u?.context.breakdown?.rawMaxTokens
  compactWindow = typeof window === 'number' && window > 0 ? window : null
}

function toChat(u: Pick<SessionUsage, 'context' | 'cost'>): HudChat {
  const tokens = u.context.tokens ?? null
  const window = compactWindow ?? u.context.window
  return {
    ctxTokens: tokens,
    ctxWindow: window,
    ctxPercent: tokens === null ? (u.context.percent ?? null) : Math.round((tokens / window) * 100),
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
  return dir ? `${dir}/crabhud-limits.json` : null
}

const LANG_NAME: Record<HudLang, string> = { en: 'English', 'pt-BR': 'Português (BR)' }
const asLang = (v: unknown): HudLang | null =>
  typeof v === 'string' ? (LANGS.find(l => l.toLowerCase() === v.toLowerCase()) ?? (/^pt/i.test(v) ? 'pt-BR' : /^en/i.test(v) ? 'en' : null)) : null

// The language picked in the HUD (kept across chats), else one set in
// settings (`pluginConfigs.crabhud.options.language`), else none yet: the
// HUD then asks, once.
async function loadLanguage($: EngineInterface): Promise<HudLang | null> {
  const picked = asLang(await $.store.get('language'))
  if (picked) return picked
  const settings = (await $.settings.read().catch(() => ({}))) as {
    pluginConfigs?: Record<string, { options?: Record<string, unknown> }>
  }
  return asLang(settings.pluginConfigs?.crabhud?.options?.language)
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
// in settings. Ultracode is a switch of the session's own, off unless the
// settings start it (`ultracode`, as `--settings` can) or /effort turns it
// on; "Dynamic workflows" in /config only allows it, and is on by default.
let sessionEffort: string | null = null
let sessionUltra: boolean | null = null

// The lines the terminal's /effort leaves: "Set effort level to max (this
// session only) … · Ultracode on", "Effort level set to auto · Ultracode off",
// "Ultracode on (this session only): … Effort stays high." and "Ultracode
// off. Effort stays high.". One that does not name Ultracode leaves it as it
// was. Answers whether the text held such a line.
async function applyEffortLine($: EngineInterface, text: string): Promise<boolean> {
  const set = /Set effort level to (low|medium|high|xhigh|max)\b/i.exec(text)
  const stays = /Ultracode (?:on \(this session only\)|off\.).*?Effort stays (low|medium|high|xhigh|max)\b/is.exec(text)
  if (!set && !stays && !/Effort level set to auto\b/i.test(text)) return false
  const level = (set ?? stays)?.[1]
  if (level) {
    sessionEffort = level.toLowerCase()
    await setEffort($, sessionEffort)
  }
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
    // Only rows of the session's own making, never the model's words or a
    // tool's output (a file that quotes such a line).
    if (rows[i].role === 'assistant' || rows[i].toolResults?.length) continue
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
  const s = settings as { effortLevel?: unknown; ultracode?: unknown; modelSettings?: Record<string, { effortLevel?: unknown }> }
  const saved = Object.entries(s.modelSettings ?? {}).find(([id]) => prettyModel(id) === pretty)?.[1]?.effortLevel
  const effort = sessionEffort ?? (typeof saved === 'string' ? saved : null) ?? envEffort ?? (typeof s.effortLevel === 'string' ? s.effortLevel : null)
  if (effort) await setEffort($, effort)
  const workflows = rows.find(r => r.key === 'workflows')?.value
  await setUltra($, (sessionUltra ?? s.ultracode === true) && workflows !== false)
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

// Session start, before the other hooks: the command, what was saved, and the clock.
// The mod's register.tsx calls it (one session.start hook for the whole mod).
async function hudStart($: EngineInterface): Promise<void> {
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
  await pullCompactWindow($)
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
  // this chat's usage every second, the autocompact window every ten. Each
  // is a stat or a local read; nothing here reaches the model.
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
        if (tick % 40 === 0) await pullCompactWindow($)
        if (tick % 4 === 0) await applyUsage($, await $.session.usage())
        if (record === null && tick % 200 === 0) record = await findRecord($)
      } finally {
        busy = false
      }
    })()
  })
}

type Step = { agentId?: string; effort?: unknown; model: string }

// Before a model request: without the app's record (the terminal), what the request
// carries is what this session runs at.
async function hudBeforeStep($: EngineInterface, e: Step): Promise<void> {
  if (e.agentId === undefined && record === null) {
    if (e.effort !== undefined) {
      sessionEffort = String(e.effort)
      await setEffort($, sessionEffort)
    }
    await setModel($, prettyModel(e.model))
  }
}

// A response just landed: the context and cost moved now, not at the end of the turn.
async function hudAfterStep($: EngineInterface, e: Step): Promise<void> {
  if (e.agentId === undefined) await applyUsage($, await $.session.usage())
}

const registerHud: Register = on => {
  on('session.measure', async ($, e, next) => {
    await applyUsage($, e)

    return next(e)
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

// ===========================================================================
// The mod: each part calls next(e) and keeps what the other draws. The engine takes
// one hook per event without a matcher, so the events both parts need are hooked
// here once and call into each.
// ===========================================================================

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await hudStart($)
    const started = await next(e)
    await progressStart($, options)
    return started
  })

  on('turn.step', async function* ($, e, next) {
    await hudBeforeStep($, e)
    const result = yield* next(e)
    await progressAfterStep($, e, result)
    await hudAfterStep($, e)
    return result
  })

  registerProgress(on, options)
  registerHud(on, options)
}
