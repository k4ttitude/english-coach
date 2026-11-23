import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Check, Level } from '../types'
import { RULES, countByLevel, diff, parse, promptKey, prose, setNewest } from './coach'

// Feedback per prompt, and which cards the person expanded, both keyed by promptKey().
const checks = atom({ plugin: 'english-coach', key: 'checks' } as const, {})
const expanded = atom({ plugin: 'english-coach', key: 'open' } as const, {})

const MODEL = 'haiku'
const MAX_TOKENS = 1500
const TIMEOUT_MS = 30_000
const MIN_WORDS = 3 // skip short replies like "yes" or "ok"
const MAX_STORED = 50

const COLOR: Record<Level, string> = { error: 'red', better: 'yellow', nit: 'gray' }
const CARD_TINT = 'rgba(127, 127, 127, 0.12)'
const CARD_INSET = '20%' // the card takes at most the other 80%, like a chat bubble

// Prompts the person typed: the terminal ('composer'), the desktop app ('sdk')
// and Remote Control ('bridge'). Task notifications and peer messages are skipped.
const TYPED_ORIGINS = new Set(['composer', 'sdk', 'bridge'])

export const register: Register = on => {
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) return next(e)

    const text = prose(e.text)
    if (text.split(/\s+/).length < MIN_WORDS) return next(e)

    const key = promptKey(e.text)
    const save = (check: Check) => update($, checks, all => setNewest(all, key, check, MAX_STORED))
    await save({ status: 'checking' })

    // Runs after this hook returns, so the model call never holds up the prompt.
    $.clock.after(0, async () => {
      try {
        const reply = await $.model.complete({
          model: MODEL,
          system: [{ text: RULES, cache: true }],
          prompt: text,
          maxTokens: MAX_TOKENS,
          timeoutMs: TIMEOUT_MS,
        })
        await save(
          reply.isAnswered
            ? { status: 'done', items: parse(reply.text) }
            : { status: 'failed', reason: reply.reason },
        )
      } catch (err) {
        await save({ status: 'failed', reason: err instanceof SyntaxError ? 'unreadable reply' : String(err) })
      }
    })

    return next(e)
  }).catch(($, e, next) => next(e)) // a failed check must never block the prompt

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!TYPED_ORIGINS.has(e.props.origin.kind)) return next(e)

    const key = promptKey(e.props.text)
    const check = (await read($, checks))[key]
    if (!check) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const message = await next(e)

    // The apps draw the person's message on the right; the terminal and VS Code on the left.
    const isRight = e.surface === 'desktop' || e.surface === 'mobile'

    // The message row, then the feedback card on the same side. Text inside the
    // card stays left-aligned, since Text has no right-align and wrapped lines would look ragged.
    const withCard = (content: JSX.Element | JSX.Element[]) => (
      <Box flexDirection="column">
        {message}
        <Box
          key="english-coach"
          justifyContent={isRight ? 'flex-end' : 'flex-start'}
          marginTop="xs"
          marginBottom="lg"
        >
          {/* Box has no maxWidth: a fixed spacer on the left caps the card's width. */}
          {isRight ? <Box key="spacer" width={CARD_INSET} flexShrink={0} /> : null}
          <Box
            flexDirection="column"
            flexShrink={1}
            paddingX="md"
            paddingY="sm"
            backgroundColor={isRight ? CARD_TINT : undefined}
            // Box has no radius prop: a round border in the fill's color rounds the corners.
            borderStyle={isRight ? 'round' : undefined}
            borderColor={isRight ? CARD_TINT : undefined}
          >
            {content}
          </Box>
        </Box>
      </Box>
    )

    if (check.status === 'checking') return withCard(<Text dimColor>English: checking…</Text>)
    if (check.status === 'failed') {
      return withCard(<Text dimColor>English: check failed ({check.reason})</Text>)
    }
    if (check.items.length === 0) return withCard(<Text dimColor>English: ✓ reads native</Text>)

    const isExpanded = (await read($, expanded))[key] === true

    const header = (
      <Box key="header" alignItems="center" justifyContent="space-between" gap="md">
        <Box>
          <Text dimColor>English: </Text>
          {countByLevel(check.items).map(({ level, count }, idx) => (
            <Text key={level} color={COLOR[level]}>
              {idx > 0 ? ' · ' : ''}
              {count} {level}
            </Text>
          ))}
        </Box>
        <Button
          key="toggle"
          label={isExpanded ? 'Hide' : 'Show'}
          onPress={() => update($, expanded, all => setNewest(all, key, !isExpanded, MAX_STORED))}
        />
      </Box>
    )

    if (!isExpanded) return withCard(header)

    const items = check.items.map((item, itemIdx) => {
      const parts = diff(item.from, item.to)
      return (
        <Box key={`item-${itemIdx}`} flexDirection="column" paddingLeft={2} marginTop="xs">
          <Box flexWrap="wrap">
            <Text color={COLOR[item.level]}>[{item.level}] </Text>
            {parts.flatMap((part, idx) => [
              part.kind === 'same' ? (
                <Text key={`part-${idx}`}>{part.text}</Text>
              ) : part.kind === 'del' ? (
                <Text key={`part-${idx}`} color="red" strikethrough>
                  {part.text}
                </Text>
              ) : (
                <Text key={`part-${idx}`} color="green" underline weight="bold">
                  {part.text}
                </Text>
              ),
              ...(idx < parts.length - 1 ? [<Text key={`space-${idx}`}> </Text>] : []),
            ])}
          </Box>
          <Box paddingLeft={2}>
            <Text dimColor>{item.why}</Text>
          </Box>
        </Box>
      )
    })

    return withCard([header, ...items])
  })
}
