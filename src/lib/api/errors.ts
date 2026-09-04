import { NextResponse } from 'next/server'

/**
 * The single error contract for the whole API.
 *
 * Every failure serialises as `{ error: { code, message } }` with a stable machine-readable
 * `code`. Built in one place because SC5 asserts that an inaccessible resource and an
 * absent one are BYTE-IDENTICAL — two hand-written 404 bodies will differ eventually, and
 * the difference is an oracle telling an attacker which other teams' ids exist.
 */
export type ErrorCode =
  | 'INVALID_INPUT'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'NOT_FOUND'
  | 'UNAUTHENTICATED'
  /** SC7: a deliberately SPECIFIC miss. Adding a member by email tells the actor that no
      account exists, because the alternative is a silent no-op they cannot diagnose. It is
      also an enumeration oracle, which `harden` is tasked with reconciling. */
  | 'NO_SUCH_ACCOUNT'
  /** I6: a team must always keep at least one owner. */
  | 'LAST_OWNER'
  /** I4: an assignee must be a member of the team owning the task's board. */
  | 'NOT_A_MEMBER'
  /** SC6: the actor may see the resource but not perform THIS action on it. */
  | 'FORBIDDEN'
  /** Two transactions wrote the same rows; one aborted. Transient and safe to retry. */
  | 'WRITE_CONFLICT'

export class ApiError extends Error {
  constructor(readonly code: ErrorCode, readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export function apiError(code: ErrorCode, status: number, message: string) {
  return NextResponse.json({ error: { code, message } }, { status })
}

/**
 * The ONE not-found response (I2/SC5).
 *
 * Deliberately takes no arguments: anything that varied by caller — a resource name, an id,
 * a subtly different message — would let a client distinguish "this board is not yours"
 * from "this board does not exist". Do not add a parameter to this function.
 */
export function notFound() {
  return apiError('NOT_FOUND', 404, 'Not found')
}

/** Wraps a handler so a thrown ApiError becomes its response instead of a 500. */
export async function handleErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.code, err.status, err.message)
    throw err
  }
}
