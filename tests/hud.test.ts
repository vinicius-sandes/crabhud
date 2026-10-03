import { expect, mock, test } from 'claude-code/testing'

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
const SHARED = '/home/me/.claude/pixel-hud-limits.json'

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

async function shown(ui: any): Promise<string> {
  const texts = await ui.findAll({ type: 'Text', in: 'hud' })
  return texts.map((t: { text: string }) => t.text).join('')
}

// session.start with an engine beneath it: what a chat sees when it opens.
async function start($: any, on: any) {
  on('session.start', (_$: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: {} }) as any)
  on('session.usage', () => ({ value: { startedAt: 0, ...measure } }) as any)
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as any)
  on('session.id', () => ({ value: 'sess-1' }) as any)
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
}

test('desktop bars fill in proportion to the percentage', async ($, on) => {
  world(on)
  await start($, on)
  await $.session.measure(measure)
  const ui = await $.ui.mount({ plugin: 'pixel-hud', surface: 'desktop', ...BAND } as any)
  await ui.resize({ columns: 100, rows: 4, in: 'hud' })
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'hud' })
  const texts = await ui.findAll({ type: 'Text', in: 'hud' })
  const runs: string[] = texts.map((t: any) => t.text).filter((t: string) => /^[█▓▒·]$/.test(t))
  const n = runs.length / 3
  const bars = [runs.slice(0, n), runs.slice(n, 2 * n), runs.slice(2 * n)]
  const filled = bars.map(b => b.filter(c => c !== '·').length / n)
  console.log(`cells per bar ${n}, filled ${filled.map(f => Math.round(f * 100)).join('/')}`)
  expect(Math.abs(filled[0] - 0.31) < 0.06).toBe(true)
  expect(Math.abs(filled[1] - 0.2) < 0.06).toBe(true)
  expect(Math.abs(filled[2] - 0.58) < 0.08).toBe(true)
  await ui.unmount()
})

test("another chat's newer limits reading wins; this chat's context stays its own", async ($, on) => {
  const { otherChatWrites, clock } = world(on)
  await start($, on)
  // A response in this chat: its reading goes out to the other chats.
  await $.session.measure(reading(92, 58))
  const ui = await $.ui.mount({ plugin: 'pixel-hud', surface: 'desktop', ...BAND } as any)
  await ui.resize({ columns: 120, rows: 1, in: 'hud' })
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
    const ui = await $.ui.mount({ plugin: 'pixel-hud', surface, ...BAND } as any)
    const ask = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join(' ')
    console.log(`${surface} first run: ${ask}`)
    expect(ask).toContain('Choose the HUD language')
    expect(ask).toContain('/hud language')
    expect(await ui.find({ key: 'lang-en' })).toBeDefined()
    if (surface === 'desktop') {
      await ui.press({ key: 'lang-pt-BR' })
      await ui.redraw()
      await ui.resize({ columns: 100, rows: 4, in: 'hud' })
      await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'hud' })
      const open = await shown(ui)
      console.log(`after picking: ${open}`)
      expect(open).toContain('contexto')
      expect(await ui.find({ key: 'lang-en' })).toBeUndefined()
    }
    await ui.unmount()
  }
  // Once picked, a new drawing does not ask again.
  const again = await $.ui.mount({ plugin: 'pixel-hud', surface: 'desktop', ...BAND } as any)
  expect(await again.find({ key: 'lang-en' })).toBeUndefined()
  await again.unmount()
})

test('labels follow the picked language', async ($, on) => {
  world(on, {}, new Map(), { language: 'pt-BR' })
  await start($, on)
  await $.session.measure(measure)
  const ui = await $.ui.mount({ plugin: 'pixel-hud', surface: 'desktop', ...BAND } as any)
  await ui.resize({ columns: 100, rows: 4, in: 'hud' })
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'hud' })
  const open = await shown(ui)
  console.log(`pt-BR expanded: ${open}`)
  expect(open).toContain('contexto')
  expect(open).toContain('reseta em')
  await ui.unmount()
})

test('ultracode shimmers behind the band and stays readable', async ($, on) => {
  // The desktop app's record of this chat, with Ultracode switched on.
  const files = new Map<string, string>()
  files.set('C:/fake/Claude/claude-code-sessions/org/acct/local_1.json', JSON.stringify({
    cliSessionId: 'sess-1',
    model: 'claude-opus-5-5',
    effort: 'xhigh',
    sessionSettings: { ultracode: true },
  }))
  world(on, { APPDATA: 'C:/fake' }, files)
  await start($, on)
  await $.session.measure(measure)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pixel-hud', surface, ...BAND } as any)
    await ui.resize({ columns: 100, rows: 1, in: 'hud' })
    const a = await shown(ui)
    await ui.advance(1000)
    const b = await shown(ui)
    console.log(`${surface} ultracode: ${b}`)
    expect(b).toContain('Ultracode')
    expect(b).toContain('$4.32')
    expect(a === b).toBe(false)
    // The bars take the Ultracode palette: several colours, and they flow.
    const barColors = async () =>
      (await ui.findAll({ type: 'Text', in: 'hud' }))
        .filter((t: any) => /^[█▓▒]+$/.test(t.text) && t.props.color)
        .map((t: any) => String(t.props.color))
    const c1 = await barColors()
    await ui.advance(400)
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
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pixel-hud', surface, ...BAND } as any)
    for (const columns of [140, 100, 80, 60, 45]) {
      await ui.resize({ columns, rows: 1, in: 'hud' })
      const line = await shown(ui)
      console.log(`${surface} ${columns}: ${line} (${line.length})`)
      expect(line).toContain('$4.32')
      expect(line.length <= columns).toBe(true)
    }
    await ui.unmount()
  }
})

test('a click anywhere expands, another collapses', async ($, on) => {
  world(on)
  await start($, on)
  await $.session.measure(measure)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'pixel-hud', surface, ...BAND } as any)
    await ui.resize({ columns: 100, rows: 4, in: 'hud' })
    await ui.pointer({ type: 'down', x: 40, y: 0, button: 'left', in: 'hud' })
    const open = await shown(ui)
    console.log(`${surface} expanded: ${open}`)
    expect(open).toContain('context')
    expect(open).toContain('resets in')
    expect(open).toContain('account')
    await ui.pointer({ type: 'down', x: 5, y: 2, button: 'left', in: 'hud' })
    expect(await shown(ui)).not.toContain('context')
    await ui.unmount()
  }
})

test('terminal: effort from settings and /effort; xhigh purple, max every colour', async ($, on) => {
  world(on, {}, new Map(), { language: 'en' }, { modelSettings: { 'claude-opus-5-5': { effortLevel: 'high' } } })
  on('config.list', () => ({ value: [] }) as any)
  let effortLine = ''
  on('session.messages', () => ({ value: [{ type: 'system', content: effortLine }] }) as any)
  // What the terminal's /effort leaves in the conversation, read as a session opens.
  const effortRow = () => $.session.start({ cwd: 'C:/x', surface: 'terminal', isInteractive: true })
  await start($, on)
  await $.session.measure(measure)
  const ui = await $.ui.mount({ plugin: 'pixel-hud', surface: 'terminal', ...BAND } as any)
  await ui.resize({ columns: 140, rows: 1, in: 'hud' })
  const barColors = async () =>
    (await ui.findAll({ type: 'Text', in: 'hud' }))
      .filter((t: any) => t.text.includes('█') && t.props.color)
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
  await ui.advance(400)
  const max = await shown(ui)
  console.log(`terminal max: ${max}`)
  expect(max).toContain('Max · Ultracode')
  const maxColors = new Set(await barColors())
  expect(maxColors.size > 2).toBe(true)
  expect([...maxColors].every(c => RAINBOW.includes(c) || c === '#E5534B')).toBe(true)

  // xhigh: purple only. A line that does not name Ultracode keeps it on.
  effortLine = 'Set effort level to xhigh (saved as your default for new sessions)'
  await effortRow()
  await ui.advance(400)
  const xhigh = await shown(ui)
  console.log(`terminal xhigh: ${xhigh}`)
  expect(xhigh).toContain('Extra · Ultracode')
  const purple = ['#6E64D8', '#8B83E6', '#A58BEB', '#BBA8F2']
  expect([...new Set(await barColors())].every(c => purple.includes(c))).toBe(true)
  await ui.unmount()
})
