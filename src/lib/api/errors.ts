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
  /** harden C1: too many failed authentication attempts; a cooldown is in force. */
  | 'TOO_MANY_ATTEMPTS'
  /** harden M2: a state-changing request arrived from another origin. */
  | 'CROSS_ORIGIN'

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

/**
 * Rejects a state-changing request that did not come from this site (harden M2).
 *
 * SameSite=Lax already stops the browser attaching the session cookie to a cross-site POST,
 * so this is a second layer rather than the only one. It matters because SameSite is a
 * single point of failure: change the cookie to `SameSite=None` for an embed or an
 * integration and every mutation opens at once, silently. This check would still hold.
 *
 * GET and HEAD are exempt — they must not change state, and the read routes are already
 * membership-scoped.
 *
 * A request with NO Origin and no Referer is allowed: same-origin non-browser clients (curl,
 * a server-side call, the test suite) legitimately send neither, and browsers always send
 * Origin on cross-origin state-changing requests. Refusing header-less requests would break
 * real callers without stopping the attack this defends against.
 */
export function assertSameOrigin(request: Request): void {
  const method = request.method.toUpperCase()
  if (method === 'GET' || method === 'HEAD') return

  const origin = request.headers.get('origin')
  const source = origin ?? request.headers.get('referer')
  if (!source) return

  const host = request.headers.get('host')
  let sourceHost: string
  try {
    sourceHost = new URL(source).host
  } catch {
    throw new ApiError('CROSS_ORIGIN', 403, 'This request did not come from this site.')
  }

  if (host && sourceHost !== host) {
    throw new ApiError('CROSS_ORIGIN', 403, 'This request did not come from this site.')
  }
}

/**
 * Wraps a handler so a thrown ApiError becomes its response instead of a 500, and runs the
 * cross-origin check on the way in.
 *
 * The request is a REQUIRED argument, deliberately: every mutating route already funnels
 * through here, so taking the request makes the CSRF check impossible to forget on a new
 * route rather than something the author has to remember. Same reasoning as the guards that
 * return the resource.
 */
export async function handleErrors(request: Request, fn: () => Promise<Response>): Promise<Response> {
  try {
    assertSameOrigin(request)
    return await fn()
  } catch (err) {
    if (err instanceof ApiError) return apiError(err.code, err.status, err.message)
    throw err
  }
}
