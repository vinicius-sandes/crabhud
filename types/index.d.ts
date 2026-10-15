// ---- HUD (model, effort, context, limits, cost) ----

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
  /** The autocompact window when the engine names one, else the model's. */
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

/** How the bars look (`/crabhud style`), after claude-deck's six, plus pixel-hud's classic blocks. */
export type HudStyle = 'pixel' | 'segments' | 'line' | 'solid' | 'dots' | 'spark' | 'classic'

/** The style picked on each surface: the desktop app and the terminal keep their own. */
export type HudStyles = { terminal: HudStyle; desktop: HudStyle }

/** What the hooks module hands the drawing (plain JSON). */
export type HudProps = {
  surface: 'terminal' | 'desktop'
  lang: HudLang
  style: HudStyle
  /**
   * The style picker's preview: draw one sample bar this many cells long,
   * alive, instead of the HUD.
   */
  preview?: number
  chat: HudChat | null
  limits: HudLimit[]
  model: string
  effort: string | null
  /** Ultracode: the app's picker's top step, or the terminal's Tab switch. */
  ultracode: boolean
  working: boolean
  expanded: boolean
  now: number
}

// ---- Progress bar, crab and agents panel ----

export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

/** A named stretch of the bar (one skill, say) and the steps it holds, in order. */
export type StepGroup = {
  name: string
  steps: string[]
  /** A short name per step for the bar's pill ('' = use the step's name). */
  short: string[]
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
  /** The step in progress, when the caller names it; else read from `groups`. */
  step: string
  groups: StepGroup[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
}

/** The main agent's tool in flight, for the crab's mood. */
export type Activity = {
  id: string
  kind: 'read' | 'search' | 'web' | 'write' | 'run' | 'other'
  target: string
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  autoOpenedFor: string
}

declare module 'claude-code' {
  interface PluginState {
    crabhud: {
      // HUD
      chat: HudChat | null
      limits: HudLimits | null
      model: string
      effort: string | null
      ultracode: boolean
      expanded: boolean
      hidden: boolean
      alerted: string[]
      language: HudLang | null
      style: HudStyles
      // Progress bar and agents panel
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
      activity: Activity | null
    }
  }
}
