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
    'savvy-progress': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
      activity: Activity | null
    }
  }
}
