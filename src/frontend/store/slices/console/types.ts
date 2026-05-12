import type { LogObject } from '../../../../middleware/shared/ports/types'

export type LogLevel = 'debug' | 'info' | 'warning' | 'error'

export type TimestampFormat = 'full' | 'time' | 'none'

export type ConsoleFilters = {
  levels: Record<LogLevel, boolean>
  searchTerm: string
  timestampFormat: TimestampFormat
}

/**
 * A compiler diagnostic associated with a specific POU and line.
 * Used to display red squiggly lines (error markers) in the Monaco editor.
 */
export type CompilerDiagnosticEntry = {
  /** The POU name this diagnostic belongs to */
  pouName: string
  /** Line number in the POU body (1-based) */
  line: number
  /** Start column (1-based) */
  startColumn: number
  /** End column (1-based) */
  endColumn: number
  /** The error/warning message */
  message: string
  /** Severity level */
  severity: 'error' | 'warning' | 'info'
}

export type ConsoleState = {
  logs: LogObject[]
  filters: ConsoleFilters
  /** Compiler diagnostics keyed by POU name for editor markers */
  compilerDiagnostics: CompilerDiagnosticEntry[]
}

export type ConsoleActions = {
  addLog: (log: LogObject) => void
  removeLog: (id: string) => void
  clearLogs: () => void
  setLevelFilter: (level: LogLevel, enabled: boolean) => void
  setSearchTerm: (term: string) => void
  setTimestampFormat: (format: TimestampFormat) => void
  /** Set compiler diagnostics (replaces all existing diagnostics) */
  setCompilerDiagnostics: (diagnostics: CompilerDiagnosticEntry[]) => void
  /** Clear all compiler diagnostics */
  clearCompilerDiagnostics: () => void
}

export type ConsoleSlice = ConsoleState & {
  consoleActions: ConsoleActions
}
