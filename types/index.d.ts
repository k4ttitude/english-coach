export type Level = 'error' | 'better' | 'nit'
export type Item = { level: Level; from: string; to: string; why: string }
export type Check =
  | { status: 'checking' }
  | { status: 'done'; items: Item[] }
  | { status: 'failed'; reason: string }

declare module 'claude-code' {
  interface PluginState {
    // Keyed by the prompt's trimmed text, the only link a UserMessage row gives back.
    'english-coach': { checks: Record<string, Check>; open: Record<string, boolean> }
  }
}
