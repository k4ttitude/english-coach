// Pure helpers: the model's instructions, parsing its reply, and the word diff.
// No engine calls here, so the tests can import them directly.

import type { Item, Level } from '../types'

export const LEVELS: Level[] = ['error', 'better', 'nit']

export const RULES = `You are an English writing coach for a non-native speaker (a software engineer) who wants to write like a native speaker.
They pay special attention to articles (a / an / the / no article), prepositions, verb tense, plurals and word choice.

Review ONLY the prose of the message. Ignore code, file paths, commands, URLs, identifiers, quoted error text and casual chat shorthand that natives also use (e.g. "pls", "wanna", lowercase starts).

Issue levels:
- "error": grammatically wrong; a native speaker would notice it (missing/wrong article, wrong tense, wrong preposition, subject-verb agreement, misspelling).
- "better": correct but unnatural; a native would phrase it differently.
- "nit": tiny polish, optional.

Return one item per sentence that needs changes:
- "from": the sentence copied exactly from the message.
- "to": the same sentence with ALL its fixes applied, changing as few words as possible.
- "level": the most severe level among that sentence's fixes.
- "why": one short reason per fix, joined with "; " (max 20 words total).

Reply with ONLY a JSON array, no prose, no code fence:
[{"level":"error"|"better"|"nit","from":"...","to":"...","why":"..."}]
Max 8 items, most severe first. If the English is fine, reply [].`

/** The key a prompt's feedback is stored under. A UserMessage row gives back only its text. */
export const promptKey = (text: string) => text.trim().replace(/\s+/g, ' ')

/** The prompt without fenced or inline code, so the model only sees prose. */
export const prose = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .trim()

/**
 * Reads the model's reply: the first JSON array in it, keeping only well-formed
 * items that change something, most severe first. Throws on malformed JSON.
 */
export const parse = (reply: string): Item[] => {
  const start = reply.indexOf('[')
  const end = reply.lastIndexOf(']')
  if (start < 0 || end < start) return []

  const list: unknown = JSON.parse(reply.slice(start, end + 1))
  if (!Array.isArray(list)) return []

  return list
    .filter(
      (x): x is Item =>
        x !== null &&
        typeof x === 'object' &&
        LEVELS.includes(x.level) &&
        typeof x.from === 'string' &&
        typeof x.to === 'string' &&
        typeof x.why === 'string' &&
        x.from !== x.to,
    )
    .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level))
}

/** How many items each level has, in severity order, leaving out levels with none. */
export const countByLevel = (items: Item[]) =>
  LEVELS.map(level => ({ level, count: items.filter(i => i.level === level).length })).filter(
    c => c.count > 0,
  )

export type Part = { kind: 'same' | 'del' | 'add'; text: string }

/**
 * Word-level diff of two sentences, by longest common subsequence.
 * Runs of the same kind merge into one part; a deletion comes before its
 * replacement, so "is" → "are" reads `--is-- ++are++`.
 */
export const diff = (from: string, to: string): Part[] => {
  const a = from.split(/\s+/).filter(Boolean)
  const b = to.split(/\s+/).filter(Boolean)

  // lcs[i][j]: length of the longest common subsequence of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const parts: Part[] = []
  const push = (kind: Part['kind'], word: string) => {
    const last = parts[parts.length - 1]
    if (last?.kind === kind) last.text += ` ${word}`
    else parts.push({ kind, text: word })
  }

  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      push('same', a[i++]!)
      j++
    } else if (j === b.length || (i < a.length && lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      push('del', a[i++]!)
    } else {
      push('add', b[j++]!)
    }
  }
  return parts
}

/** Sets `key` to `value` as the newest entry, dropping the oldest past `max`. */
export const setNewest = <T>(
  map: Record<string, T>,
  key: string,
  value: T,
  max: number,
): Record<string, T> => {
  const next = { ...map }
  delete next[key] // re-insert so a re-sent prompt counts as new
  next[key] = value

  const keys = Object.keys(next)
  for (const old of keys.slice(0, Math.max(0, keys.length - max))) delete next[old]
  return next
}
