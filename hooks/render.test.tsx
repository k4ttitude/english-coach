import { expect, test } from 'claude-code/testing'

const PROMPT = 'can i export it so my friend can install it themself?'
const REPLY = JSON.stringify([
  {
    level: 'error',
    from: PROMPT,
    to: 'Can I export it so my friend can install it themselves?',
    why: 'capital I; themselves',
  },
])
const USAGE = {
  input_tokens: 1,
  output_tokens: 1,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
}

// The background check resolves on the engine's own schedule; give it a moment.
const settle = () =>
  new Promise(resolve =>
    (globalThis as unknown as { setTimeout: (fn: unknown, ms: number) => void }).setTimeout(
      resolve,
      50,
    ),
  )

for (const kind of ['composer', 'sdk', 'bridge'] as const) {
  test(`a ${kind} prompt gets a feedback card under its message`, async ($, on) => {
    // Stand-ins for the engine beneath the plugin.
    on('model.complete', () => ({ value: { isAnswered: true, text: REPLY, usage: USAGE } }) as never)
    on('prompt.submit', (_, e) => ({ text: e.text }))
    on('ui.render', () => ({ type: 'engine', ref: 1 }) as never)
    on('clock.after', () => ({ value: {} }) as never)

    await $.prompt.submit({ text: PROMPT } as never)
    await settle()

    const ui = await $.ui.mount({
      plugin: 'english-coach',
      component: 'UserMessage',
      requestId: 'm1',
      surface: 'desktop',
      props: { text: PROMPT, origin: { kind }, isExpanded: true },
    } as never)

    const summary = await ui.find({ type: 'Text', text: /error/ })
    expect(summary?.text).toBe('1 error')
  })
}
