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
