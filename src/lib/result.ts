export interface CommandIssue { code: string; message: string; path?: string }
export type CommandResult<T> = { ok: true; value: T } | { ok: false; errors: CommandIssue[] }

export class ValidationError extends Error {
  readonly code = 'INVALID_STATE'
  constructor(readonly path: string, expectation: string) {
    super(`Backup ungültig: ${path} ${expectation}.`)
  }
}

export function commandResult<T>(run: () => T): CommandResult<T> {
  try { return { ok: true, value: run() } } catch (error) {
    return { ok: false, errors: [{ code: error instanceof ValidationError ? error.code : 'COMMAND_REJECTED', message: error instanceof Error ? error.message : 'Änderung nicht möglich.', ...(error instanceof ValidationError ? { path: error.path } : {}) }] }
  }
}

export function requireSuccess<T>(result: CommandResult<T>): T {
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join(' '))
  return result.value
}
