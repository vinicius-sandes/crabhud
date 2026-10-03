/** One rate-limit window: `five_hour`, `seven_day`, or a gateway's `spend_limit`. */
export type HudLimit = {
  kind: string
  percent: number
  /** Epoch milliseconds, or null when the engine gave no reset time. */
  resetsAt: number | null
}

/** What belongs to this chat alone: its context window and its cost. */
export type HudChat = {
  ctxTokens: number | null
  ctxWindow: number
  ctxPercent: number | null
  costUsd: number | null
}

/**
 * The account's limits, shared by every chat: the freshest reading any chat
 * running the HUD got, and when it got it (epoch ms).
 */
export type HudLimits = {
  limits: HudLimit[]
  at: number
}

export type HudLang = 'en' | 'pt-BR'

/** What the hooks module hands the drawing (plain JSON). */
export type HudProps = {
  surface: 'terminal' | 'desktop'
  lang: HudLang
  chat: HudChat | null
  limits: HudLimit[]
  model: string
  effort: string | null
  working: boolean
  expanded: boolean
  now: number
}

declare module 'claude-code' {
  interface PluginState {
    'pixel-hud': {
      chat: HudChat | null
      limits: HudLimits | null
      model: string
      effort: string | null
      expanded: boolean
      hidden: boolean
      alerted: string[]
    }
  }
}
