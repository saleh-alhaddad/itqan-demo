import { z } from 'zod'

/**
 * Text that Postgres can actually store.
 *
 * A `text` column cannot hold U+0000: the insert fails with `invalid byte sequence for
 * encoding "UTF8": 0x00`, which reached the client as a 500 — a trivially reachable
 * unhandled error, found by verify's adversarial pass.
 *
 * REJECTED rather than stripped. A null byte is never something a person meant to type; it
 * arrives from a broken client or a probe. Silently rewriting someone's input is worse than
 * telling them it was not accepted, and stripping would also hide whatever produced it.
 *
 * Every user-supplied string that reaches the database goes through this, so the rule lives
 * in one place instead of being remembered per field.
 */
const NUL = String.fromCharCode(0)

export const storableText = (max: number) =>
  z.string().trim().max(max).refine((v) => !v.includes(NUL), {
    message: 'Text cannot contain null bytes.',
  })

/** The same, where the value must also be non-empty. */
export const requiredText = (max: number) =>
  z.string().trim().min(1).max(max).refine((v) => !v.includes(NUL), {
    message: 'Text cannot contain null bytes.',
  })
