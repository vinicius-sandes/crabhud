import type { Register } from 'claude-code'

// savvy-progress's two tools, kept under their old names for savvy-flow's skill and
// agents, which call mcp__savvy-progress__progress and mcp__savvy-progress__step.
// crabhud answers both; this mod only declares them. Without crabhud loaded, a call
// gets a short note instead of an error.

const PHASES = ['plan', 'design', 'delegate', 'review', 'close']

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
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
    return started
  })

  on('tool.call', { tool: 'mcp__savvy-progress__progress' }, async ($, e, next) => {
    try {
      return await next(e)
    } catch {
      return { result: 'skipped: crabhud is not loaded' }
    }
  })
  on('tool.call', { tool: 'mcp__savvy-progress__step' }, async ($, e, next) => {
    try {
      return await next(e)
    } catch {
      return { result: 'skipped: crabhud is not loaded' }
    }
  })
}
