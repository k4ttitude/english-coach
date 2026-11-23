import { expect, test } from 'claude-code/testing'

import { countByLevel, diff, parse, prose, setNewest } from './coach'

test('parse keeps valid items, drops junk, and sorts errors first', () => {
  const reply = `Here you go:
[{"level":"nit","from":"I wanna go","to":"I want to go","why":"informal"},
 {"level":"error","from":"I build claude mode","to":"I build a Claude mode","why":"article"},
 {"level":"bogus","from":"x","to":"y","why":"z"},
 {"level":"better","from":"same","to":"same","why":"no change"}]`

  expect(parse(reply).map(i => i.level)).toEqual(['error', 'nit'])
})

test('parse returns nothing when the reply has no list', () => {
  expect(parse('[]')).toEqual([])
  expect(parse('no json here')).toEqual([])
})

test('parse throws on malformed JSON', () => {
  expect(() => parse('[{"level": oops]')).toThrow()
})

test('countByLevel counts in severity order and skips empty levels', () => {
  const items = parse(
    '[{"level":"nit","from":"a","to":"b","why":""},{"level":"error","from":"c","to":"d","why":""}]',
  )
  expect(countByLevel(items)).toEqual([
    { level: 'error', count: 1 },
    { level: 'nit', count: 1 },
  ])
})

test('diff marks removed and added words, old before new', () => {
  const parts = diff(
    'the colors in the collapsed view is wrong',
    'the colors in collapsed view are wrong',
  )
  const shown = parts
    .map(p => (p.kind === 'del' ? `--${p.text}--` : p.kind === 'add' ? `++${p.text}++` : p.text))
    .join(' ')

  expect(shown).toBe('the colors in --the-- collapsed view --is-- ++are++ wrong')
})

test('prose drops fenced and inline code', () => {
  expect(prose('run `npm test` then\n```\ncode\n```\ncheck it')).toBe('run   then\n \ncheck it')
})

test('setNewest moves a re-sent key to newest and drops the oldest', () => {
  let map: Record<string, number> = {}
  map = setNewest(map, 'a', 1, 2)
  map = setNewest(map, 'b', 2, 2)
  map = setNewest(map, 'a', 3, 2) // a is newest again
  map = setNewest(map, 'c', 4, 2) // so b is dropped

  expect(map).toEqual({ a: 3, c: 4 })
})
