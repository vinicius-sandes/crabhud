import { expect, mock, test } from 'claude-code/testing'

// The test runner has a console; the engine's types leave it out.
declare const console: { log: (...args: unknown[]) => void }

const now = Date.now()
const reading = (fivePct: number, weekPct: number) => ({
  context: { tokens: 312000, window: 1000000, percent: 31 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: fivePct, resetsAt: new Date(now + 160 * 60000).toISOString() },
    { kind: 'seven_day', percentUsed: weekPct, resetsAt: new Date(now + 31 * 3600000).toISOString() },
  ],
  cost: { usd: 4.32 },
  changed: ['context', 'rateLimits', 'cost'] as ('context' | 'rateLimits' | 'cost')[],
})
const measure = reading(20, 58)
const SHARED = '/home/me/.claude/crabhud-limits.json'

// What the mods beneath draw in the band; nothing unless a test says so.
let beneath: ((ui: any) => unknown) | null = null

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100 },
} as const

// The world beneath the plugin: a clock, a store, an environment, and a small
// disk in memory (the engine hands paths over in the platform's spelling).
function world(
  on: any,
  env: Record<string, string> = {},
  files: Map<string, string> = new Map(),
  store: Record<string, unknown> = { language: 'en' },
  settings: Record<string, unknown> = {},
) {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '')
  for (const [p, text] of [...files]) {
    files.delete(p)
    files.set(norm(p), text)
  }
  const mtimes = new Map<string, number>()
  let writes = 1
  const clock = mock.clock(on, { now })
  mock.store(on, store)
  on('settings.read', () => ({ value: settings }) as any)
  beneath = null
  // The engine's own band is empty here; a test's mods beneath draw into it.
  on('ui.render', (($: any, e: any) => {
    const ui = $.ui.resolve(e)
    return beneath ? beneath(ui) : ui.Box({})
  }) as any)
  mock.env(on, { HOME: '/home/me', ...env })
  on('session.measure', (_$: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
  on('fs.read', ((_$: unknown, e: { path: string }) =>
    files.has(norm(e.path)) ? { value: files.get(norm(e.path)) } : { deny: 'no such file' }) as any)
  on('fs.write', ((_$: unknown, e: { path: string; text: string }) => {
    files.set(norm(e.path), e.text)
    mtimes.set(norm(e.path), ++writes)
    return { value: undefined }
  }) as any)
  on('fs.stat', ((_$: unknown, e: { path: string }) => {
    const text = files.get(norm(e.path))
    return text === undefined
      ? { deny: 'no such file' }
      : { value: { kind: 'file', size: text.length, mtimeMs: mtimes.get(norm(e.path)) ?? 1 } }
  }) as any)
  on('fs.list', ((_$: unknown, e: { path: string }) => {
    const dir = `${norm(e.path)}/`
    const kinds = new Map<string, string>()
    for (const p of files.keys()) {
      if (!p.startsWith(dir)) continue
      const [name, ...rest] = p.slice(dir.length).split('/')
      kinds.set(name, rest.length > 0 ? 'dir' : 'file')
    }
    return { value: [...kinds].map(([name, kind]) => ({ name, kind, size: 0 })) }
  }) as any)
  // Another chat writing to the shared file (a new text, a newer mtime), and
  // the clock the plugin's timers run on.
  const otherChatWrites = (path: string, text: string) => {
    files.set(norm(path), text)
    mtimes.set(norm(path), ++writes)
  }
  return { otherChatWrites, clock }
}

// What the HUD says: in the app, the drawing's alt; in the terminal, its Texts.
async function shown(ui: any): Promise<string> {
  const svg = await hudSvg(ui)
  if (svg) return String(svg.props.alt)
  const texts = await ui.findAll({ type: 'Text', in: 'hud' })
  return texts.map((t: { text: string }) => t.text).join('')
}

// The app's HUD: one Svg the hook draws, and its ▾/▴ Button.
async function hudSvg(ui: any): Promise<any> {
  return (await ui.findAll({ type: 'Svg' })).find((s: any) => String(s.props.source).includes('data-hud='))
}
// Sizes the terminal's Client; the app's drawing takes the band's width.
async function fit(ui: any, size: { columns: number; rows: number; in: string }): Promise<void> {
  if ((await ui.findAll({ type: 'Client' })).length) await ui.resize(size)
}
async function toggleHud(ui: any): Promise<void> {
  await ui.press({ key: 'hud-toggle' })
  await ui.redraw()
}
const styleOf = async (ui: any) => String((await hudSvg(ui))?.props.source).match(/data-style="(\w+)"/)?.[1]

// session.start with an engine beneath it: what a chat sees when it opens.
async function start($: any, on: any, usage: (e: any) => unknown = () => ({ startedAt: 0, ...measure })) {
  on('session.start', (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }) as any)
  on('tool.register', ((_$: unknown, e: any) => ({ value: { tool: `mcp__crabhud__${e.name}` } })) as any)
  on('session.usage', ((_$: unknown, e: any) => ({ value: usage(e) })) as any)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as any)
  on('session.id', () => ({ value: 'sess-1' }) as any)
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
}

test('desktop: the HUD is one drawing, its bars at the readings', async ($, on) => {
  world(on)
  panes(on)
  await start($, on)
  await $.session.measure(measure)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(await ui.findAll({ type: 'Client' })).toHaveLength(0)
  const closed = await hudSvg(ui)
  console.log(`desktop closed: ${closed.props.alt}`)
  for (const s of ['ctx 31%', '5h 20%', '7d 58%', '$4.32']) expect(closed.props.alt).toContain(s)
  expect(closed.props.width <= 100 * 8).toBe(true)
  expect((await ui.find({ key: 'hud-toggle' }))?.props.label).toBe('▾')
  await toggleHud(ui)
  const open = await hudSvg(ui)
  // Open: each bar carries its percent on a tag, and the drawing is taller.
  for (const p of ['31%', '20%', '58%']) expect(String(open.props.source)).toContain(`>${p}</text>`)
  expect(open.props.height > closed.props.height).toBe(true)
  expect((await ui.find({ key: 'hud-toggle' }))?.props.label).toBe('▴')
  await ui.unmount()
})

test("another chat's newer limits reading wins; this chat's context stays its own", async ($, on) => {
  const { otherChatWrites, clock } = world(on)
  await start($, on)
  // A response in this chat: its reading goes out to the other chats.
  await $.session.measure(reading(92, 58))
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(await shown(ui)).toContain('92%')
  // Then another chat, later, sees the 5-hour window at 97%.
  otherChatWrites(SHARED, JSON.stringify({
    limits: [
      { kind: 'five_hour', percent: 97, resetsAt: now + 100 * 60000 },
      { kind: 'seven_day', percent: 60, resetsAt: now + 31 * 3600000 },
    ],
    at: now + 60000,
  }))
  await clock.advance(600)
  await ui.redraw()
  const line = await shown(ui)
  console.log(`after another chat: ${line}`)
  expect(line).toContain('97%')
  expect(line).toContain('31%')
  await ui.unmount()
})

test('the first run asks for the language, once, in English', async ($, on) => {
  world(on, {}, new Map(), {})
  await start($, on)
  await $.session.measure(measure)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'crabhud', surface, ...BAND } as any)
    const ask = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join(' ')
    console.log(`${surface} first run: ${ask}`)
    expect(ask).toContain('Choose the HUD language')
    expect(ask).toContain('/crabhud language')
    expect(await ui.find({ key: 'lang-en' })).toBeDefined()
    if (surface === 'desktop') {
      await ui.press({ key: 'lang-pt-BR' })
      await ui.redraw()
      await toggleHud(ui)
      const open = await shown(ui)
      console.log(`after picking: ${open}`)
      expect(open).toContain('contexto')
      expect(await ui.find({ key: 'lang-en' })).toBeUndefined()
    }
    await ui.unmount()
  }
  // Once picked, a new drawing does not ask again.
  const again = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(await again.find({ key: 'lang-en' })).toBeUndefined()
  await again.unmount()
})

test('labels follow the picked language', async ($, on) => {
  world(on, {}, new Map(), { language: 'pt-BR' })
  await start($, on)
  await $.session.measure(measure)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  await toggleHud(ui)
  const open = await shown(ui)
  console.log(`pt-BR expanded: ${open}`)
  expect(open).toContain('contexto')
  expect(open).toContain('reseta em')
  await ui.unmount()
})

test('ultracode shimmers behind the band and stays readable', async ($, on) => {
  // The desktop app's record of this chat, with Ultracode switched on, where
  // the Mac app keeps it: under APPDATA, the record was found only when the
  // tests ran on Windows (on a Mac the mod never got that variable).
  const files = new Map<string, string>()
  files.set('/home/me/Library/Application Support/Claude/claude-code-sessions/org/acct/local_1.json', JSON.stringify({
    cliSessionId: 'sess-1',
    model: 'claude-opus-5-5',
    effort: 'xhigh',
    sessionSettings: { ultracode: true },
  }))
  world(on, {}, files)
  panes(on)
  await start($, on)
  await $.session.measure(measure)
  // The app: the wave and the label's gradient are in the drawing, moved by CSS.
  const app = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  const drawing = await hudSvg(app)
  console.log(`desktop ultracode: ${drawing.props.alt}`)
  expect(drawing.props.alt).toContain('Ultracode')
  expect(drawing.props.alt).toContain('$4.32')
  expect(String(drawing.props.source)).toContain('class="uw"')
  expect(String(drawing.props.source)).toContain('#F25F8B')
  await app.unmount()
  for (const surface of ['terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'crabhud', surface, ...BAND } as any)
    await fit(ui, { columns: 100, rows: 1, in: 'hud' })
    const a = await shown(ui)
    await (ui as any).advance(1000)
    const b = await shown(ui)
    console.log(`${surface} ultracode: ${b}`)
    expect(b).toContain('Ultracode')
    expect(b).toContain('$4.32')
    expect(a === b).toBe(false)
    // The bars take the Ultracode palette: several colours, and they flow.
    const barColors = async () =>
      (await ui.findAll({ type: 'Text', in: 'hud' }))
        .filter((t: any) => /^[█▓▒⣁-⣿○◔◑◕●]+$/.test(t.text) && t.props.color)
        .map((t: any) => String(t.props.color))
    const c1 = await barColors()
    await (ui as any).advance(400)
    const c2 = await barColors()
    expect(new Set(c1).size > 1).toBe(true)
    expect(c1.join() === c2.join()).toBe(false)
    await ui.unmount()
  }
})

test('compact fits every width and the cost is never cut', async ($, on) => {
  world(on)
  await start($, on)
  await $.session.measure(measure)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
  for (const columns of [140, 100, 80, 60, 45]) {
    await fit(ui, { columns, rows: 1, in: 'hud' })
    const line = await shown(ui)
    console.log(`terminal ${columns}: ${line} (${line.length})`)
    expect(line).toContain('$4.32')
    expect(line.length <= columns).toBe(true)
  }
  await ui.unmount()
  // The app: the drawing fits the band, and the cost ends inside it.
  for (const bodyColumns of [160, 100, 70, 45]) {
    const app = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND, props: { ...BAND.props, bodyColumns } } as any)
    const d = await hudSvg(app)
    const src = String(d.props.source)
    const costX = Number(src.match(/x="([\d.]+)"[^>]*>\$4\.32<\/text>/)?.[1])
    console.log(`desktop ${bodyColumns}: width ${d.props.width}, cost at ${costX}`)
    expect(d.props.width <= bodyColumns * 8).toBe(true)
    expect(costX + 40 <= d.props.width).toBe(true)
    await app.unmount()
  }
})

test('compact: the spinner turns in a box of fixed width, so the row never moves', async ($, on) => {
  world(on)
  await start($, on)
  await $.session.measure(measure)
  const status = async (ui: any) => {
    const box = await ui.find({ type: 'Box', key: 'status', in: 'hud' })
    return { width: box?.props.width, glyph: box?.text }
  }
  // Idle: the ✓, in the same box the spinner will turn in.
  const idle = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
  await fit(idle, { columns: 100, rows: 1, in: 'hud' })
  const ready = await status(idle)
  await idle.unmount()
  expect(ready.glyph).toBe('✓')

  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND, props: { ...BAND.props, isWorking: true } } as any)
  await fit(ui, { columns: 100, rows: 1, in: 'hud' })
  const frames = []
  for (let i = 0; i < 6; i++) {
    frames.push(await status(ui))
    await (ui as any).advance(200)
  }
  console.log(`terminal spinner: ${frames.map(f => `${f.glyph}@${f.width}`).join(' ')}`)
  expect(new Set(frames.map(f => f.glyph)).size > 1).toBe(true)
  expect(frames.every(f => typeof f.width === 'number' && f.width === ready.width)).toBe(true)
  await ui.unmount()
  // The app: the ✻ turns in CSS, in place; idle, a check.
  const appIdle = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(String((await hudSvg(appIdle)).props.source)).not.toContain('class="spin"')
  await appIdle.unmount()
  const appBusy = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND, props: { ...BAND.props, isWorking: true } } as any)
  expect(String((await hudSvg(appBusy)).props.source)).toContain('class="spin"')
  await appBusy.unmount()
})

test('a click anywhere expands, another collapses', async ($, on) => {
  world(on)
  await start($, on)
  await $.session.measure(measure)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
  await fit(ui, { columns: 100, rows: 4, in: 'hud' })
  await (ui as any).pointer({ type: 'down', x: 40, y: 0, button: 'left', in: 'hud' })
  const open = await shown(ui)
  console.log(`terminal expanded: ${open}`)
  expect(open).toContain('context')
  expect(open).toContain('resets in')
  expect(open).toContain('account')
  await (ui as any).pointer({ type: 'down', x: 5, y: 2, button: 'left', in: 'hud' })
  expect(await shown(ui)).not.toContain('context')
  await ui.unmount()
  // The app: the ▾ beside the drawing opens it, the ▴ closes it, and the pick stays.
  const app = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  await toggleHud(app)
  const appOpen = await shown(app)
  console.log(`desktop expanded: ${appOpen}`)
  for (const s of ['context', 'resets in', 'account']) expect(appOpen).toContain(s)
  await app.unmount()
  const again = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(await shown(again)).toContain('context')
  await toggleHud(again)
  expect(await shown(again)).not.toContain('context')
  await again.unmount()
})

test('terminal: effort from settings and /effort; xhigh purple, max every colour', async ($, on) => {
  world(on, {}, new Map(), { language: 'en', expanded: true }, { modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' } } })
  on('config.list', () => ({ value: [] }) as any)
  let effortLine = ''
  on('session.messages', () => ({ value: [{ type: 'system', content: effortLine }] }) as any)
  // What the terminal's /effort leaves in the conversation, read as a session opens.
  const effortRow = () => $.session.start({ cwd: 'C:/x', surface: 'terminal', isInteractive: true })
  await start($, on)
  await $.session.measure(measure)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
  await fit(ui, { columns: 140, rows: 1, in: 'hud' })
  const barColors = async () =>
    (await ui.findAll({ type: 'Text', in: 'hud' }))
      .filter((t: any) => /[█○◔◑◕●]/.test(t.text) && t.props.color)
      .map((t: any) => String(t.props.color))
  const RAINBOW = ['#F25F8B', '#F08A4B', '#E9C46A', '#3FB68B', '#5AA9E6', '#8B83E6', '#C86DD7']

  // The effort saved for the model, before anything else is known; no theme.
  const high = await shown(ui)
  console.log(`terminal high: ${high}`)
  expect(high).toContain('High')
  expect(new Set(await barColors()).size).toBe(2) // the purple ctx bar, the green limits

  // /effort picks max with Ultracode: every colour, and it says so.
  effortLine = 'Set effort level to max (this session only): Maximum capability · Ultracode on'
  await effortRow()
  await (ui as any).advance(400)
  const max = await shown(ui)
  console.log(`terminal max: ${max}`)
  expect(max).toContain('Max · Ultracode')
  const maxColors = new Set(await barColors())
  expect(maxColors.size > 2).toBe(true)
  expect([...maxColors].every(c => RAINBOW.includes(c) || c === '#E5534B')).toBe(true)

  // xhigh: purple only. A line that does not name Ultracode keeps it on.
  effortLine = 'Set effort level to xhigh (saved as your default for new sessions)'
  await effortRow()
  await (ui as any).advance(400)
  const xhigh = await shown(ui)
  console.log(`terminal xhigh: ${xhigh}`)
  expect(xhigh).toContain('Extra · Ultracode')
  const purple = ['#6E64D8', '#8B83E6', '#A58BEB', '#BBA8F2']
  expect([...new Set(await barColors())].every(c => purple.includes(c))).toBe(true)
  await ui.unmount()
})

test('linux: the record under XDG_CONFIG_HOME, the shared limits under ~/.claude', async ($, on) => {
  // A Linux home: no APPDATA, a custom XDG config folder holding the app's
  // record of this chat.
  const files = new Map<string, string>()
  files.set('/home/me/.cfg/Claude/claude-code-sessions/org/acct/local_1.json', JSON.stringify({
    cliSessionId: 'sess-1',
    model: 'claude-sonnet-5-5',
    effort: 'medium',
    sessionSettings: { ultracode: false },
  }))
  world(on, { XDG_CONFIG_HOME: '/home/me/.cfg' }, files)
  await start($, on)
  await $.session.measure(reading(25, 58))
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  await fit(ui, { columns: 120, rows: 1, in: 'hud' })
  const line = await shown(ui)
  console.log(`linux: ${line}`)
  expect(line).toContain('Sonnet 5.5')
  expect(line).toContain('Medium')
  // The limits went out to the other chats through ~/.claude.
  expect(JSON.parse(files.get(SHARED) ?? 'null')?.limits?.[0]?.percent).toBe(25)
  await ui.unmount()
})

for (const lang of ['en', 'pt-BR'] as const) {
  test(`a Remote Control viewer (no Client) gets two still lines, marked remote (${lang})`, async ($, on) => {
    world(on, {}, new Map(), { language: lang })
    await start($, on)
    await $.session.measure(measure)
    const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'mobile', ...BAND, props: { ...BAND.props, isWorking: true } } as any)
    expect(await ui.findAll({ type: 'Client' })).toHaveLength(0)
    // Under the crab's row: the mark alone, small, its last word green.
    const mark = (await ui.findAll({ type: 'Svg' })).find((s: any) => String(s.props.alt).startsWith('Remote Control'))
    const word = lang === 'en' ? 'ON' : 'ATIVO'
    expect(mark?.props.alt).toBe(`Remote Control: ${word}`)
    expect(String(mark?.props.source)).toContain(`fill="#3FB68B">${word}</text>`)
    expect(String(mark?.props.source)).toContain('font-size="11"')
    // Then the row, on one line, never wrapping.
    const line = (await ui.findAll({ type: 'Text' })).map((t: { text: string }) => t.text).join(' ')
    console.log(`mobile ${lang}: ${line}`)
    expect(line).not.toContain('Remote Control')
    for (const s of ['Opus 5.5', 'ctx', '31%', '5h', '20%', '↻', '7d', '58%', '$4.32', '✻']) expect(line).toContain(s)
    await ui.unmount()
    // The computer running the chat keeps its own HUD, with no remote mark.
    const home = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
    expect(await hudSvg(home)).toBeDefined()
    expect((await home.findAll({ type: 'Svg' })).filter((s: any) => String(s.props.alt).startsWith('Remote Control'))).toHaveLength(0)
    await home.unmount()
  })
}

test('the remote row shrinks to a narrow width and keeps the cost', async ($, on) => {
  world(on)
  await start($, on)
  await $.session.measure(measure)
  for (const bodyColumns of [100, 70, 50]) {
    const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'mobile', ...BAND, props: { ...BAND.props, bodyColumns } } as any)
    const texts = (await ui.findAll({ type: 'Text' })).map((t: { text: string }) => t.text)
    console.log(`mobile ${bodyColumns}: ${texts.join(' ')}`)
    // Laid out: one cell between a group's pieces, three around each │.
    const drawn: any = await ui.drawn()
    const row = drawn.children[1]
    const width = (el: any): number => {
      if (typeof el === 'string') return el.length
      const kids = (el.children ?? []).map(width).reduce((a: number, b: number) => a + b, 0)
      const gap = (el.props?.columnGap ?? 0) * Math.max(0, (el.children ?? []).length - 1)
      return kids + gap + 2 * (el.props?.marginX ?? 0)
    }
    console.log(`  laid out ${width(row)} of ${bodyColumns}`)
    expect(width(row) <= bodyColumns).toBe(true)
    expect(texts.join('')).toContain('$4.32')
    expect(texts.filter(t => t === '│')).toHaveLength(4)
    await ui.unmount()
  }
})

test("another mod's row in the band stays beside the HUD", async ($, on) => {
  world(on)
  await start($, on)
  await $.session.measure(measure)
  beneath = ui => ui.Text({ key: 'other-mod', children: ['savvy: 2/5'] })
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect((await ui.find({ type: 'Text', text: /savvy/ }))?.text).toBe('savvy: 2/5')
  expect(await shown(ui)).toContain('31%')
  await ui.unmount()
})

test('the context gauge measures against the autocompact window, and follows it', async ($, on) => {
  const { clock } = world(on)
  // The engine's /context figures: autoCompactWindow set to 400k, later 200k.
  let compact = 400000
  await start($, on, (e: { breakdown?: string }) => ({
    startedAt: 0,
    ...measure,
    context: { ...measure.context, ...(e.breakdown ? { breakdown: { rawMaxTokens: compact } } : {}) },
  }))
  await $.session.measure(measure)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  await toggleHud(ui)
  const at400 = await shown(ui)
  console.log(`autocompact at 400k: ${at400}`)
  expect(at400).toContain('312k / 400k')
  expect(at400).toContain('78%')
  // The setting changes: within ten seconds the gauge follows.
  compact = 200000
  await clock.advance(10_000)
  await ui.redraw()
  const at200 = await shown(ui)
  console.log(`autocompact at 200k: ${at200}`)
  expect(at200).toContain('312k / 200k')
  expect(at200).toContain('156%')
  await ui.unmount()
})

test('terminal, fresh install: no saved effort, no desktop record → not Ultracode', async ($, on) => {
  // A first run under CLAUDE_CONFIG_DIR: nothing saved, no app record on
  // Linux, and "Dynamic workflows" on by default; that switch is not Ultracode.
  world(on, { CLAUDE_CONFIG_DIR: '/home/me/app/.work/claude' })
  on('config.list', () => ({ value: [{ key: 'workflows', label: 'Dynamic workflows', kind: 'boolean', value: true }] }) as any)
  // The model's own words may quote an /effort line: never read as one.
  let history: unknown[] = [
    { role: 'assistant', text: 'Set effort level to max (this session only) · Ultracode on', toolUses: [] },
  ]
  on('session.messages', () => ({ value: history }) as any)
  on('turn.step', async function* (_$: unknown, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [] }
  } as any)
  await start($, on)
  await $.session.measure(measure)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
  await fit(ui, { columns: 140, rows: 1, in: 'hud' })
  const fresh = await shown(ui)
  console.log(`terminal fresh: ${fresh}`)
  expect(fresh).toContain('Opus 5.5')
  expect(fresh).not.toContain('Ultracode')

  // The first request carries the session's real effort (the footer's "medium").
  const step = $.turn.step({ turnId: 't1', index: 0, model: 'claude-opus-5-5', effort: 'medium', messageCount: 1 } as any)
  for await (const _ of step);
  await (ui as any).advance(1200)
  const first = await shown(ui)
  console.log(`terminal after a request: ${first}`)
  expect(first).toContain('Medium')
  expect(first).not.toContain('Ultracode')

  // `/effort ultracode on` and `off` leave lines of their own, read as a
  // session opens.
  const said = async (text: string) => {
    history = [{ role: 'user', text, toolUses: [] }]
    await $.session.start({ cwd: 'C:/x', surface: 'terminal', isInteractive: true })
    await (ui as any).advance(1200)
    return shown(ui)
  }
  const on1 = await said('Ultracode on (this session only): standing dynamic workflows. Effort stays medium.')
  console.log(`terminal ultracode on: ${on1}`)
  expect(on1).toContain('Medium · Ultracode')
  const off = await said('Ultracode off. Effort stays medium.')
  console.log(`terminal ultracode off: ${off}`)
  expect(off).toContain('Medium')
  expect(off).not.toContain('Ultracode')
  await ui.unmount()
})

test('terminal: Ultracode set in settings (--settings) shows from the start', async ($, on) => {
  world(on, {}, new Map(), { language: 'en' }, { ultracode: true })
  on('config.list', () => ({ value: [{ key: 'workflows', label: 'Dynamic workflows', kind: 'boolean', value: true }] }) as any)
  on('session.messages', () => ({ value: [] }) as any)
  await start($, on)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
  await fit(ui, { columns: 140, rows: 1, in: 'hud' })
  expect(await shown(ui)).toContain('Ultracode')
  await ui.unmount()
})

// ---- Bar styles (/crabhud style) ----

const PICKER = {
  component: 'Pane',
  requestId: 'crabhud-style',
  props: { title: 'HUD style', isFocused: true, bodyColumns: 90, placement: 'inline' },
} as const

// The bar cells the HUD draws, in its compact row.
// The engine's answers the style tests need beyond the world: the open
// panes (none) and opening one.
function panes(on: any, opened: any[] = []) {
  on('ui.panes', () => ({ value: [] }) as any)
  on('ui.open', ((_$: unknown, e: any) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  }) as any)
  return opened
}

// The bars' glyphs: in the terminal, those it drew; in the app, whose drawing
// names its style, a sample of that style's.
const SAMPLE_GLYPHS: Record<string, string> = { pixel: '⣿⣀', segments: '▰▱', line: '━─', solid: ' ', dots: '●○', spark: '▇▁', classic: '█·' }
async function barGlyphs(ui: any): Promise<string> {
  const style = await styleOf(ui)
  if (style) return SAMPLE_GLYPHS[style] ?? ''
  return (await shown(ui)).replace(/[^█▓▒·▰▱━╸─●◐◉○▁▂▃▄▅▆▇⣀-⣿ ]/g, '')
}

test('/crabhud style <name> sets the bars on every surface and keeps the pick', async ($, on) => {
  // Expanded: the closed HUD draws rings, the bars are in the open one.
  world(on, {}, new Map(), { language: 'en', expanded: true })
  panes(on)
  await start($, on)
  await $.session.measure(measure)
  const said = await $.command.run({ command: 'crabhud', args: 'style segments' } as any)
  expect(said.text).toBe('HUD style: Segments.')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'crabhud', surface, ...BAND } as any)
    await fit(ui, { columns: 120, rows: 1, in: 'hud' })
    const g = await barGlyphs(ui)
    console.log(`${surface} segments: ${g}`)
    expect(g).toContain('▰')
    expect(g).toContain('▱')
    expect(g).not.toContain('█')
    await ui.unmount()
  }
  const bad = await $.command.run({ command: 'crabhud', args: 'style plaid' } as any)
  expect(bad.text).toContain('No style "plaid"')
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
  await fit(ui, { columns: 120, rows: 1, in: 'hud' })
  expect(await barGlyphs(ui)).toContain('▰')
  await ui.unmount()
})

test('a saved style comes back with the next session', async ($, on) => {
  world(on, {}, new Map(), { language: 'en', expanded: true, style: { terminal: 'line', desktop: 'dots' } })
  panes(on)
  await start($, on)
  await $.session.measure(measure)
  const term = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
  await fit(term, { columns: 120, rows: 1, in: 'hud' })
  expect(await barGlyphs(term)).toContain('━')
  await term.unmount()
  const desk = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  await fit(desk, { columns: 120, rows: 1, in: 'hud' })
  expect(await barGlyphs(desk)).toContain('●')
  await desk.unmount()
})

test('/crabhud style opens the picker: seven live previews (Client in the terminal, Svg in the app), a key each, the pick per surface', async ($, on) => {
  world(on, {}, new Map(), { language: 'en', expanded: true })
  const opened = panes(on)
  await start($, on)
  await $.session.measure(measure)
  await $.command.run({ command: 'crabhud', args: 'style' } as any)
  expect(opened.at(-1)).toMatchObject({ id: 'crabhud-style', focus: true, closeOnEscape: true })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'crabhud', surface, ...PICKER } as any)
    // The terminal previews through the Client; the app draws each sample as an Svg.
    const previews = surface === 'terminal'
      ? (await ui.findAll({ type: 'Client' })).map((c: any) => c.props.props.style)
      : (await ui.findAll({ type: 'Svg' })).map((c: any) => String(c.props.source).match(/data-preview="(\w+)"/)?.[1])
    expect(previews).toEqual(['pixel', 'segments', 'line', 'solid', 'dots', 'spark', 'classic'])
    if (surface === 'desktop') expect(await ui.findAll({ type: 'Client' })).toHaveLength(0)
    const words = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join(' ')
    expect(words).toContain('← now')
    expect(words).toContain('Press 1/2/3/4/5/6/7')
    // Key 5, Dots: for this surface only.
    await ui.press({ key: 'style-dots' })
    await ui.unmount()
    // Dots now on the surface the key was pressed on; the other keeps its
    // default (classic's blocks in the terminal, pixel's braille on the
    // desktop) until its own pick.
    for (const where of ['terminal', 'desktop'] as const) {
      const band = await $.ui.mount({ plugin: 'crabhud', surface: where, ...BAND } as any)
      await fit(band, { columns: 120, rows: 1, in: 'hud' })
      const g = await barGlyphs(band)
      const picked = where === 'terminal' || surface === 'desktop'
      expect(g.includes('●')).toBe(picked)
      expect(/[█⣀-⣿]/.test(g)).toBe(!picked)
      await band.unmount()
    }
  }
})

test('every style draws a full-width bar at 0%, 64% and 100%', async ($, on) => {
  world(on)
  panes(on)
  await start($, on)
  for (const style of ['pixel', 'segments', 'line', 'solid', 'dots', 'spark', 'classic']) {
    await $.command.run({ command: 'crabhud', args: `style ${style}` } as any)
    for (const surface of ['terminal', 'desktop'] as const) {
      for (const pct of [0, 64, 100]) {
        await $.session.measure(reading(pct, pct))
        const ui = await $.ui.mount({ plugin: 'crabhud', surface, ...BAND } as any)
        await fit(ui, { columns: 140, rows: 1, in: 'hud' })
        const line = await shown(ui)
        expect(line).toContain('$4.32')
        expect(line).toContain(`${pct}%`)
        await ui.unmount()
      }
    }
  }
})

test('the Remote Control row draws the picked style too', async ($, on) => {
  world(on)
  panes(on)
  await start($, on)
  await $.session.measure(measure)
  await $.command.run({ command: 'crabhud', args: 'style segments' } as any)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'mobile', ...BAND } as any)
  const line = (await ui.findAll({ type: 'Text' })).map((t: { text: string }) => t.text).join('')
  console.log(`remote segments: ${line}`)
  expect(line).toContain('▰')
  expect(line).not.toContain('█')
  await ui.unmount()
})

// ---- The progress bar and the agents panel in the picked styles ----

// The flow as an orchestrator reports it: two groups, 5 of 14 steps done.
const PROGRESS = {
  tool: 'mcp__crabhud__progress',
  title: 'Sample project',
  done: 5,
  groups: [
    { name: 'start', steps: Array.from({ length: 8 }, (_, i) => `b${i}`) },
    { name: 'middle', steps: Array.from({ length: 6 }, (_, i) => `i${i}`) },
  ],
}

const PANEL = {
  component: 'Pane',
  requestId: 'crabhud-agents',
  props: { title: 'Agents', isFocused: false, bodyColumns: 60, placement: 'side' },
} as const

const progressRow = async (ui: any) => (await ui.findAll({ type: 'Svg' })).find((s: any) => String(s.props.alt).startsWith('Sample project'))
const allText = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')

test('the progress bar takes the app style in the app and the terminal style in the terminal', async ($, on) => {
  world(on, {}, new Map(), { language: 'en', style: { terminal: 'dots', desktop: 'segments' } })
  panes(on)
  await start($, on)
  await $.tool.call(PROGRESS as any)
  const app = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  const src = String((await progressRow(app))?.props.source)
  expect(src).toContain('data-style="segments"')
  // Each group keeps its colour along the bar, and the count sits on the tag.
  expect(src).toContain('#3B7FF5')
  expect(src).toContain('#A259E6')
  expect(src).toContain('5/14')
  await app.unmount()
  const term = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
  const line = await allText(term)
  console.log(`terminal progress (dots): ${line}`)
  expect(line).toContain('●')
  expect(line).toContain('○')
  expect(line).not.toContain('░')
  await term.unmount()
})

test('every style draws the progress bar, unfinished and finished', async ($, on) => {
  world(on)
  panes(on)
  await start($, on)
  for (const style of ['pixel', 'segments', 'line', 'solid', 'dots', 'spark', 'classic']) {
    await $.command.run({ command: 'crabhud', args: `style ${style}` } as any)
    for (const done of [5, 14]) {
      await $.tool.call({ ...PROGRESS, done } as any)
      const app = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
      expect(String((await progressRow(app))?.props.source)).toContain(`data-style="${style}"`)
      await app.unmount()
      const term = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
      const line = await allText(term)
      expect(line).toContain('Sample project')
      expect(line).toContain(done === 14 ? '100%' : '36%')
      await term.unmount()
    }
  }
})

test("the panel's bars follow the styles too: the app's in the app, the terminal's in the terminal", async ($, on) => {
  world(on, {}, new Map(), { language: 'en', style: { terminal: 'segments', desktop: 'line' } })
  panes(on)
  on('agent.spawn', () => ({ agentId: 'agent-1', model: 'claude-fable-5-1' }) as any)
  await start($, on)
  await $.agent.spawn({ tool_use_id: 'tu-1', prompt: 'review', description: 'Review register.tsx', subagentType: 'savvy-fable' } as any)
  const app = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...PANEL } as any)
  const card = (await app.findAll({ type: 'Svg' })).find((s: any) => String(s.props.alt).startsWith('Review'))
  expect(String(card?.props.source)).toContain('data-style="line"')
  await app.unmount()
  const term = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...PANEL } as any)
  const text = await allText(term)
  console.log(`terminal panel (segments): ${text}`)
  expect(text).toContain('Review register.tsx')
  expect(text).toContain('▱')
  expect(text).not.toContain('░')
  await term.unmount()
})

// ---- Phase 3: the walking crab, waiting on the person, sounds, the limits' pace, the gliding tag ----

const WORKING_BAND = { ...BAND, props: { ...BAND.props, isWorking: true } } as const
const svgWith = async (ui: any, mark: string) => (await ui.findAll({ type: 'Svg' })).find((s: any) => String(s.props.source).includes(mark))

test('at work the crab walks the free part of the row; asleep it keeps still', async ($, on) => {
  world(on)
  panes(on)
  await start($, on)
  const busy = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...WORKING_BAND } as any)
  const walk = await svgWith(busy, 'data-walk=')
  expect(String(walk?.props.source)).toContain('data-walk="think"')
  // The smoke behind it, and its clothes on the way.
  expect(String(walk?.props.source)).toContain('class="sm0')
  expect(String(walk?.props.source)).toContain('c-m-think walk')
  await busy.unmount()
  const idle = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(await svgWith(idle, 'data-walk=')).toBeUndefined()
  await idle.unmount()
})

test("Claude's question turns the row amber until it is answered", async ($, on) => {
  const { clock } = world(on)
  panes(on)
  on('tool.call', (async () => {
    await clock.sleep(5000)
    return { result: 'answered' }
  }) as any)
  await start($, on)
  const asked = $.tool.call({ tool: 'AskUserQuestion', tool_use_id: 'q1', questions: [{ question: 'Which style?' }] } as any)
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...WORKING_BAND } as any)
  const wait = await svgWith(ui, 'data-wait=')
  expect(String(wait?.props.alt)).toMatch(/waiting for your answer/)
  expect(String(wait?.props.alt)).toContain('Which style?')
  await ui.unmount()
  await clock.advance(5000)
  await asked
  const after = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...WORKING_BAND } as any)
  expect(await svgWith(after, 'data-wait=')).toBeUndefined()
  await after.unmount()
})

test('a permission prompt that stands turns the row amber; in the terminal too', async ($, on) => {
  const { clock } = world(on)
  panes(on)
  on('tool.check', () => ({ decision: 'ask' }) as any)
  on('tool.call', (async () => {
    await clock.sleep(5000)
    return { result: 'ran' }
  }) as any)
  await start($, on)
  const ran = $.tool.call({ tool: 'Bash', tool_use_id: 'b1', command: 'npm test' } as any)
  await clock.settle()
  // The engine decides on the call while it is in flight: the mode will ask.
  await $.tool.check({ tool: 'Bash', input: { command: 'npm test' }, tool_use_id: 'b1' } as any)
  await clock.advance(700)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...WORKING_BAND } as any)
  const text = await allText(ui)
  await ui.unmount()
  await clock.advance(5000)
  await ran
  expect(text).toMatch(/waiting for your permission/)
  expect(text).toContain('Bash: npm test')
})

test('sounds are off by default; /crabhud sound on plays the chime when Claude waits', async ($, on) => {
  const { clock } = world(on)
  panes(on)
  const played: string[] = []
  on('audio.play', ((_$: unknown, e: any) => {
    played.push(String(e.clip.asset))
    return { value: undefined }
  }) as any)
  on('tool.call', (async () => {
    await clock.sleep(1000)
    return { result: 'ok' }
  }) as any)
  await start($, on)
  const ask = (id: string) => $.tool.call({ tool: 'AskUserQuestion', tool_use_id: id, questions: [{ question: 'Ok?' }] } as any)
  let p = ask('q1')
  await clock.advance(1000)
  await p
  expect(played).toEqual([])
  const r = await $.command.run({ command: 'crabhud', args: 'sound on' } as any)
  expect(String((r as any).text)).toContain('Sounds on')
  p = ask('q2')
  await clock.advance(1000)
  await p
  expect(played).toEqual(['sounds/wait.wav'])
})

test("the HUD shows how fast a limit fills, amber when it runs out before its reset", async ($, on) => {
  const { clock } = world(on)
  panes(on)
  await start($, on)
  await $.session.measure(measure)
  await clock.advance(20 * 60000)
  // 20 minutes later the 5-hour window went from 20% to 40%: +60%/h, out in 1h, before its reset.
  await $.session.measure(reading(40, 58))
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  const alt = await shown(ui)
  expect(alt).toContain('+60%/h')
  expect(alt).toContain('runs out in 1h')
  await ui.unmount()
})

test('a step forward makes the progress tag glide from where it was', async ($, on) => {
  const { clock } = world(on)
  panes(on)
  await start($, on)
  await $.tool.call(PROGRESS as any)
  await clock.advance(5000)
  await $.tool.call({ ...PROGRESS, done: 6 } as any)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(String((await progressRow(ui))?.props.source)).toContain('@keyframes bgp')
  await ui.unmount()
  await clock.advance(1000)
  const later = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(String((await progressRow(later))?.props.source)).not.toContain('@keyframes bgp')
  await later.unmount()
})

// ---- Portraits from data: a crabhud-portraits.json in a folder under ~/.claude/mods/ ----

const TEAM_PORTRAITS = JSON.stringify({
  crabhud: 1,
  groups: { prep: '#E46FB0' },
  portraits: {
    barista: {
      agents: ['barista-team'],
      color: '#8B5A2B',
      css: ['.la,.lb{animation:none}', '.cup{animation:blink 1s steps(1) infinite}', 'body{}</style><script>', '@import url(x)'],
      pixels: [
        [7, 10, 16, 12, '#D97757'],
        [9, 12, 2, 2, '#1F1E1D'],
        [7, 22, 2, 4, '#D97757', 'la'],
        [22, 14, 4, 5, 'role', 'fr cup'],
        [0, 0, 'x', 1, 'red'],
      ],
    },
    fable: { agents: ['other-fable'], color: '#000000', pixels: [] },
  },
})

async function teamCard($: any, on: any, files: Map<string, string>) {
  world(on, {}, files)
  panes(on)
  on('agent.spawn', () => ({ agentId: 'agent-1', model: 'claude-opus-5-5' }) as any)
  await start($, on)
  await $.agent.spawn({ tool_use_id: 'tu-1', prompt: 'brew', description: 'Brew the coffee', subagentType: 'barista-team' } as any)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...PANEL } as any)
  const card = (await ui.findAll({ type: 'Svg' })).find((s: any) => String(s.props.alt).startsWith('Brew'))
  const source = String(card?.props.source)
  await ui.unmount()
  return source
}

test('a portraits file under ~/.claude/mods dresses its agents; its bad parts are left out', async ($, on) => {
  const source = await teamCard($, on, new Map([['/home/me/.claude/mods/my-team/crabhud-portraits.json', TEAM_PORTRAITS]]))
  expect(source).toContain('c-barista')
  expect(source).toContain('#8B5A2B')
  // Its motion, scoped to it; what could break out of the drawing never gets in.
  expect(source).toContain('.c-barista.run .cup{animation:blink')
  expect(source).not.toContain('<script>')
  expect(source).not.toContain('@import')
  // A costume of the mod's own is never replaced.
  expect(source).not.toContain('#000000')
})

test('without a portraits file every agent wears the plain crab', async ($, on) => {
  const source = await teamCard($, on, new Map())
  expect(source).toContain('c-other')
  expect(source).not.toContain('c-barista')
})

test("a portraits file's group colours colour the progress bar", async ($, on) => {
  world(on, {}, new Map([['/home/me/.claude/mods/my-team/crabhud-portraits.json', TEAM_PORTRAITS]]))
  panes(on)
  await start($, on)
  await $.tool.call({ ...PROGRESS, groups: [{ name: 'Prep', steps: ['a', 'b'] }, ...PROGRESS.groups] } as any)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(String((await progressRow(ui))?.props.source)).toContain('#E46FB0')
  await ui.unmount()
})

// ---- Phase 5: the bar from Claude's own list or plan, the celebration, rings, the panel's numbers, status, demo ----

const rowOf = async (ui: any, title: string) => (await ui.findAll({ type: 'Svg' })).find((s: any) => String(s.props.alt).startsWith(`${title}:`))
// The engine beneath answering every tool: a task id for TaskCreate, a plan for ExitPlanMode.
function tools(on: any, plan = '') {
  let n = 0
  on('tool.call', ((_$: unknown, e: any) =>
    e.tool === 'TaskCreate' ? { result: { task: { id: String(++n), subject: e.subject } } } : e.tool === 'ExitPlanMode' ? { result: { plan } } : { result: 'ok' }) as any)
}

test("Claude's own task list draws the bar: the step in progress, short, on the tag", async ($, on) => {
  world(on)
  panes(on)
  tools(on)
  await start($, on)
  await $.tool.call({
    tool: 'TodoWrite',
    tool_use_id: 't1',
    todos: [
      { content: 'Read the HUD code', status: 'completed', activeForm: 'Reading the HUD code' },
      { content: 'Draw the rings', status: 'in_progress', activeForm: 'Writing the ring drawing for the HUD' },
      { content: 'Run the tests', status: 'pending', activeForm: 'Running the tests' },
    ],
  } as any)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  const alt = String((await rowOf(ui, 'Tasks'))?.props.alt)
  expect(alt).toContain('Writing the ring · 1/3')
  await ui.unmount()
  // A skill's own bar (the progress tool) wins over the list.
  await $.tool.call(PROGRESS as any)
  await $.tool.call({ tool: 'TodoWrite', tool_use_id: 't2', todos: [{ content: 'Other', status: 'in_progress', activeForm: 'Other' }] } as any)
  const after = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(await progressRow(after)).toBeDefined()
  expect(await rowOf(after, 'Tasks')).toBeUndefined()
  await after.unmount()
})

test('TaskCreate and TaskUpdate draw the bar too; a deleted task leaves it', async ($, on) => {
  world(on)
  panes(on)
  tools(on)
  await start($, on)
  for (const subject of ['Sketch', 'Build', 'Check']) await $.tool.call({ tool: 'TaskCreate', tool_use_id: subject, subject, description: subject } as any)
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u1', taskId: '1', status: 'completed' } as any)
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u2', taskId: '2', status: 'in_progress', activeForm: 'Building the bar' } as any)
  await $.tool.call({ tool: 'TaskUpdate', tool_use_id: 'u3', taskId: '3', status: 'deleted' } as any)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(String((await rowOf(ui, 'Tasks'))?.props.alt)).toContain('Building the bar · 1/2')
  await ui.unmount()
})

test('an approved plan draws its steps on the bar; the answer that ends the turn finishes it', async ($, on) => {
  world(on)
  panes(on)
  tools(on, '# Plan: Ring HUD\n\nWhy we do it.\n\n1. **Draw** the rings — in SVG\n2. Update the tests\n3. README\n')
  on('turn.start', ((_$: unknown, e: any) => ({ turnId: e.turnId })) as any)
  on('turn.complete', () => ({ text: 'Done.' }) as any)
  await start($, on)
  await $.turn.start({ text: 'go', turnId: 'x' } as any)
  await $.tool.call({ tool: 'ExitPlanMode', tool_use_id: 'p1', plan: '' } as any)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  const row = await rowOf(ui, 'Ring HUD')
  expect(String(row?.props.alt)).toContain('0/3')
  await ui.unmount()
  await $.turn.complete({ reason: 'answer', answer: 'Done.', turnId: 'x' } as any)
  const done = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(String((await rowOf(done, 'Ring HUD'))?.props.alt)).toContain('100%')
  await done.unmount()
})

test('at 100% the crab celebrates (and the fanfare plays with sounds on); a list bar then leaves on its own', async ($, on) => {
  const { clock } = world(on)
  panes(on)
  tools(on)
  const played: string[] = []
  on('audio.play', ((_$: unknown, e: any) => {
    played.push(String(e.clip.asset))
    return { value: undefined }
  }) as any)
  await start($, on)
  await $.command.run({ command: 'crabhud', args: 'sound on' } as any)
  const todos = (last: string) => [
    { content: 'One', status: 'completed', activeForm: 'One' },
    { content: 'Two', status: last, activeForm: 'Two' },
  ]
  await $.tool.call({ tool: 'TodoWrite', tool_use_id: 'a', todos: todos('in_progress') } as any)
  await $.tool.call({ tool: 'TodoWrite', tool_use_id: 'b', todos: todos('completed') } as any)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  const src = String((await rowOf(ui, 'Tasks'))?.props.source)
  expect(src).toContain('class="jp"')
  expect(src).toContain('@keyframes cf0')
  await ui.unmount()
  expect(played).toEqual(['sounds/finish.wav'])
  await clock.advance(3000)
  const later = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(String((await rowOf(later, 'Tasks'))?.props.source)).not.toContain('class="jp"')
  await later.unmount()
  await clock.advance(8000)
  const gone = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(await rowOf(gone, 'Tasks')).toBeUndefined()
  await gone.unmount()
})

test('while Claude answers, the row counts its actions and time beside the crab; the panel keeps them', async ($, on) => {
  const { clock } = world(on)
  panes(on)
  tools(on)
  on('turn.start', ((_$: unknown, e: any) => ({ turnId: e.turnId })) as any)
  await start($, on)
  await $.turn.start({ text: 'go', turnId: 'x' } as any)
  for (const id of ['r1', 'r2', 'r3']) await $.tool.call({ tool: 'Read', tool_use_id: id, file_path: '/a.ts' } as any)
  await clock.advance(72_000)
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...WORKING_BAND } as any)
  const walk = String((await svgWith(ui, 'data-walk='))?.props.source)
  expect(walk).toContain('3 actions · 1m12s')
  await ui.unmount()
  const pane = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...PANEL } as any)
  expect(await allText(pane)).toContain('This answer: 3 actions · 1m12s')
  await pane.unmount()
})

test('the closed HUD draws a ring per reading: in the app and in the terminal', async ($, on) => {
  world(on)
  panes(on)
  await start($, on)
  await $.session.measure(measure)
  const app = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  const src = String((await hudSvg(app))?.props.source)
  expect(src.match(/class="rt"/g)?.length).toBe(3)
  expect(src).toContain('class="rb"')
  await app.unmount()
  const term = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...BAND } as any)
  await fit(term, { columns: 140, rows: 1, in: 'hud' })
  const line = await shown(term)
  // ctx 31% and 5h 20% are a quarter ring, 7d 58% a half.
  expect(line).toContain('◔')
  expect(line).toContain('◑')
  await term.unmount()
})

test("the panel adds today's and this month's spend, summed over the chats", async ($, on) => {
  const d = new Date(now)
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  // Another chat already spent $2.00 today.
  world(on, {}, new Map(), { language: 'en', spend: { days: { [day]: 2 }, last: { other: 2 } } })
  panes(on)
  await start($, on)
  // This chat stood at $4.32 when it opened (counted before), then spent 68 cents.
  await $.session.measure({ ...measure, cost: { usd: 5 } })
  const pane = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...PANEL } as any)
  const text = await allText(pane)
  expect(text).toContain('Today ≈$2.68')
  expect(text).toContain('This month ≈$2.68')
  await pane.unmount()
})

test('/crabhud status sums it all up as text', async ($, on) => {
  world(on)
  panes(on)
  await start($, on)
  await $.session.measure(measure)
  const r = (await $.command.run({ command: 'crabhud', args: 'status' } as any)) as any
  const text = String(r.text)
  expect(text).toContain('Model: Opus 5.5')
  expect(text).toContain('Context: 31%')
  expect(text).toContain('5-hour limit: 20%')
  expect(text).toContain('This chat: ≈$4.32')
  expect(text).toContain('Bar: none now')
  expect(text).toContain('Agents: none yet')
})

test('/crabhud demo plays sample bars and agents, then puts everything back', async ($, on) => {
  const { clock } = world(on)
  panes(on)
  await start($, on)
  await $.tool.call(PROGRESS as any)
  const r = (await $.command.run({ command: 'crabhud', args: 'demo' } as any)) as any
  expect(String(r.text)).toContain('Demo')
  const ui = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(String((await rowOf(ui, 'crabhud demo'))?.props.alt)).toContain('0/6')
  await ui.unmount()
  await clock.advance(9000)
  const mid = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(String((await rowOf(mid, 'crabhud demo'))?.props.alt)).toContain('3/6')
  expect(await svgWith(mid, 'data-wait=')).toBeDefined()
  await mid.unmount()
  const pane = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...PANEL } as any)
  expect(await allText(pane)).toContain('Draw the rings')
  await pane.unmount()
  await clock.advance(12_000)
  const end = await $.ui.mount({ plugin: 'crabhud', surface: 'desktop', ...BAND } as any)
  expect(await rowOf(end, 'crabhud demo')).toBeUndefined()
  expect(await progressRow(end)).toBeDefined()
  await end.unmount()
  const after = await $.ui.mount({ plugin: 'crabhud', surface: 'terminal', ...PANEL } as any)
  expect(await allText(after)).not.toContain('Draw the rings')
  await after.unmount()
})
