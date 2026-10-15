// What the HUD says and its colours, shared by the drawing in the app (hud-svg)
// and the Client (hud-client). Pure, no `$`.

export const GREEN = '#3FB68B'
export const PURPLE = '#8B83E6'
export const AMBER = '#E9A23B'
export const RED = '#E5534B'
export const ORANGE = '#D97757'
// Effort from calm to loud on the desktop: grey, sky, the HUD's purple,
// magenta, hot pink.
export const EFFORT_COLOR: Record<string, string> = {
  low: '#9AA0A8',
  medium: '#5AA9E6',
  high: PURPLE,
  xhigh: '#C86DD7',
  max: '#F25F8B',
}
// Every word the HUD draws, per language. The effort names are the app's
// picker's; Ultracode is its own switch on top of `xhigh`, which the hooks
// module reports apart, as `ultracode`.
export const WORDS = {
  en: {
    effortNames: { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra', max: 'Max' } as Record<string, string>,
    ready: 'ready',
    working: 'working',
    alert: 'alert',
    effort: 'effort',
    chat: 'chat',
    context: 'context',
    fiveHour: '5h limit',
    sevenDay: '7d limit',
    spend: 'spend',
    resetsIn: (t: string) => `↻ resets in ${t}`,
    reset: '↻ reset',
    noReading: 'no reading yet',
    account: 'account',
    now: 'now',
  },
  'pt-BR': {
    effortNames: { low: 'Baixo', medium: 'Médio', high: 'Alto', xhigh: 'Extra', max: 'Máx' } as Record<string, string>,
    ready: 'pronto',
    working: 'rodando',
    alert: 'atenção',
    effort: 'esforço',
    chat: 'chat',
    context: 'contexto',
    fiveHour: 'limite 5h',
    sevenDay: 'limite 7d',
    spend: 'gasto',
    resetsIn: (t: string) => `↻ reseta em ${t}`,
    reset: '↻ resetou',
    noReading: 'sem leitura ainda',
    account: 'conta',
    now: 'agora',
  },
}
export function fmtLeft(ms: number, tight: boolean, now: string): string {
  if (ms <= 0) return now
  const min = Math.floor(ms / 60000)
  const d = Math.floor(min / 1440)
  const h = Math.floor((min % 1440) / 60)
  const m = min % 60
  const sp = tight ? '' : ' '
  if (d > 0) return `${d}d${sp}${h}h`
  if (h > 0) return `${h}h${sp}${m}m`
  return `${m}m`
}

export function fmtTok(n: number): string {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

export const pctText = (p: number | null) => (p === null ? '—' : `${Math.round(p)}%`)

export const tone = (p: number, base: string) => (p >= 90 ? RED : p >= 70 ? AMBER : base)
