/**
 * Compiler Diagnostics Utility
 *
 * Parses compilation error messages from iec2c, arduino-cli, and other tools
 * to extract structured diagnostic information (line, column, message, severity).
 * These diagnostics are then used to set Monaco editor markers (red squiggly lines).
 */

export interface CompilerDiagnostic {
  /** The POU name this error belongs to (if identifiable) */
  pouName?: string
  /** Line number in the POU source (1-based) */
  line: number
  /** Start column (1-based, defaults to 1) */
  startColumn: number
  /** End column (1-based, defaults to end of line) */
  endColumn: number
  /** Error message */
  message: string
  /** Severity: error, warning, info */
  severity: 'error' | 'warning' | 'info'
}

/**
 * Patterns for parsing iec2c (matiec) error messages.
 *
 * matiec outputs errors in several formats:
 * - "filename.st":lineNum:colStart..colEnd: error : message
 * - filename.st:lineNum: error: message
 * - Error in POU 'POUNAME': message
 * - line X: error message
 */
const IEC2C_PATTERNS = [
  // Pattern: "file.st":line:colStart..colEnd: error/warning : message
  /(?:"[^"]*"|[\w./\\]+\.st):(\d+):(\d+)\.\.(\d+):\s*(error|warning)\s*:\s*(.+)/i,
  // Pattern: "file.st":line:col: error/warning : message
  /(?:"[^"]*"|[\w./\\]+\.st):(\d+):(\d+):\s*(error|warning)\s*:\s*(.+)/i,
  // Pattern: file.st:line: error: message (simpler format)
  /(?:"[^"]*"|[\w./\\]+\.st):(\d+):\s*(error|warning):\s*(.+)/i,
  // Pattern: line X col Y: message (from some iec2c versions)
  /line\s+(\d+)\s+col\s+(\d+):\s*(.+)/i,
  // Pattern: line X: message
  /line\s+(\d+):\s*(.+)/i,
]

/**
 * Patterns for parsing Arduino CLI / GCC error messages.
 * Format: filename.c:line:col: error/warning: message
 */
const ARDUINO_PATTERNS = [
  // GCC-style: file:line:col: error/warning: message
  /[\w./\\]+\.\w+:(\d+):(\d+):\s*(error|warning):\s*(.+)/i,
  // GCC-style without column: file:line: error/warning: message
  /[\w./\\]+\.\w+:(\d+):\s*(error|warning):\s*(.+)/i,
]

/**
 * Pattern to extract POU name from error context.
 * iec2c often mentions the POU in the error or in surrounding context lines.
 */
const POU_NAME_PATTERNS = [
  // "in POU 'name'" or "POU 'name'"
  /(?:in\s+)?POU\s+['"](\w+)['"]/i,
  // "in function/program/function_block 'name'"
  /in\s+(?:function|program|function_block)\s+['"](\w+)['"]/i,
  // "PROGRAM name" or "FUNCTION name" or "FUNCTION_BLOCK name" in context
  /(?:PROGRAM|FUNCTION_BLOCK|FUNCTION)\s+(\w+)/,
]

/**
 * Parse a single error message line and extract diagnostic info.
 */
function parseSingleLine(line: string): CompilerDiagnostic | null {
  // Try iec2c patterns first
  for (const pattern of IEC2C_PATTERNS) {
    const match = line.match(pattern)
    if (match) {
      return parseIec2cMatch(match, pattern)
    }
  }

  // Try Arduino/GCC patterns
  for (const pattern of ARDUINO_PATTERNS) {
    const match = line.match(pattern)
    if (match) {
      return parseArduinoMatch(match, pattern)
    }
  }

  return null
}

function parseIec2cMatch(match: RegExpMatchArray, pattern: RegExp): CompilerDiagnostic {
  // Determine which pattern matched based on capture groups
  const source = pattern.source

  if (source.includes('colStart..colEnd')) {
    // Pattern: file:line:colStart..colEnd: severity : message
    return {
      line: parseInt(match[1], 10),
      startColumn: parseInt(match[2], 10),
      endColumn: parseInt(match[3], 10),
      severity: (match[4].toLowerCase() as 'error' | 'warning') || 'error',
      message: match[5].trim(),
    }
  } else if (source.includes('error|warning') && match.length >= 5) {
    // Pattern: file:line:col: severity : message
    return {
      line: parseInt(match[1], 10),
      startColumn: parseInt(match[2], 10),
      endColumn: parseInt(match[2], 10) + 1,
      severity: (match[3].toLowerCase() as 'error' | 'warning') || 'error',
      message: match[4].trim(),
    }
  } else if (source.includes('line') && source.includes('col')) {
    // Pattern: line X col Y: message
    return {
      line: parseInt(match[1], 10),
      startColumn: parseInt(match[2], 10),
      endColumn: parseInt(match[2], 10) + 1,
      severity: 'error',
      message: match[3].trim(),
    }
  } else if (source.includes('line')) {
    // Pattern: line X: message
    return {
      line: parseInt(match[1], 10),
      startColumn: 1,
      endColumn: 1000,
      severity: 'error',
      message: match[2].trim(),
    }
  }

  // Fallback for simpler patterns: file:line: severity: message
  return {
    line: parseInt(match[1], 10),
    startColumn: 1,
    endColumn: 1000,
    severity: 'error',
    message: match[match.length - 1].trim(),
  }
}

function parseArduinoMatch(match: RegExpMatchArray, pattern: RegExp): CompilerDiagnostic {
  const source = pattern.source

  if (source.includes(':col:')) {
    // file:line:col: severity: message
    return {
      line: parseInt(match[1], 10),
      startColumn: parseInt(match[2], 10),
      endColumn: parseInt(match[2], 10) + 1,
      severity: (match[3].toLowerCase() as 'error' | 'warning') || 'error',
      message: match[4].trim(),
    }
  }

  // file:line: severity: message
  return {
    line: parseInt(match[1], 10),
    startColumn: 1,
    endColumn: 1000,
    severity: (match[2].toLowerCase() as 'error' | 'warning') || 'error',
    message: match[3].trim(),
  }
}

/**
 * Try to extract a POU name from an error message or surrounding context.
 */
function extractPouName(message: string): string | undefined {
  for (const pattern of POU_NAME_PATTERNS) {
    const match = message.match(pattern)
    if (match) {
      return match[1]
    }
  }
  return undefined
}

/**
 * Parse multiple lines of compiler output and extract all diagnostics.
 * Attempts to associate diagnostics with POU names when possible.
 *
 * @param output - The full compiler output (may contain multiple lines)
 * @param pouNames - List of known POU names in the project (for matching)
 * @param pouBodies - Map of POU name -> body text (for line offset calculation)
 */
export function parseCompilerOutput(
  output: string,
  pouNames: string[] = [],
  pouBodies?: Map<string, string>,
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []
  const lines = output.split('\n')

  let currentPouName: string | undefined

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Try to extract POU name from context
    const pouFromLine = extractPouName(trimmed)
    if (pouFromLine) {
      currentPouName = pouFromLine
    }

    // Parse the line for diagnostic info
    const diagnostic = parseSingleLine(trimmed)
    if (diagnostic) {
      // Try to associate with a POU
      if (!diagnostic.pouName) {
        diagnostic.pouName = currentPouName
      }

      // If we still don't have a POU name, try to find it from the line number
      // by checking which POU's line range contains this line
      if (!diagnostic.pouName && pouBodies && pouBodies.size > 0) {
        diagnostic.pouName = findPouByLineNumber(diagnostic.line, pouNames, pouBodies)
      }

      diagnostics.push(diagnostic)
    }
  }

  return diagnostics
}

/**
 * Given a line number in the combined program.st file, find which POU it belongs to
 * and adjust the line number to be relative to that POU's body.
 *
 * The program.st file is structured as:
 *   PROGRAM/FUNCTION/FUNCTION_BLOCK PouName
 *     VAR ... END_VAR
 *     <body>
 *   END_PROGRAM/END_FUNCTION/END_FUNCTION_BLOCK
 *
 * This is a best-effort heuristic since we don't have the exact generated file.
 */
function findPouByLineNumber(
  _lineNumber: number,
  _pouNames: string[],
  _pouBodies: Map<string, string>,
): string | undefined {
  // This is a placeholder - exact mapping requires reading the generated program.st
  // For now, we rely on POU name extraction from error messages
  return undefined
}

/**
 * Parse a single compiler error/warning message and return diagnostics.
 * This is the main entry point used by the compilation flow.
 *
 * @param message - A single error message from the compiler
 * @param pouNames - Known POU names for context matching
 */
export function parseCompilerMessage(message: string, pouNames: string[] = []): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []
  const lines = message.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    const diagnostic = parseSingleLine(trimmed)
    if (diagnostic) {
      // Try to extract POU name
      if (!diagnostic.pouName) {
        diagnostic.pouName = extractPouName(message)
      }

      // Try to match POU name from the message context
      if (!diagnostic.pouName && pouNames.length > 0) {
        for (const pouName of pouNames) {
          if (message.toUpperCase().includes(pouName.toUpperCase())) {
            diagnostic.pouName = pouName
            break
          }
        }
      }

      diagnostics.push(diagnostic)
    }
  }

  return diagnostics
}
