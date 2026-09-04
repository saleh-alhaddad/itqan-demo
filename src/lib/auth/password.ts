import { hash, verify } from '@node-rs/argon2'

/**
 * Password hashing (SC11).
 *
 * argon2id via @node-rs/argon2 — native Rust bindings, so there is no node-gyp build step
 * in CI. Cost parameters are the library defaults on purpose: tuning them is `harden`'s
 * job, made against real hardware, not a number guessed here.
 */
export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext)
}

/**
 * Returns false rather than throwing on a malformed stored hash.
 *
 * A corrupt row must fail the login it belongs to, not 500 the endpoint: a crash here
 * would turn one bad row into an outage, and would tell an attacker that this particular
 * account is different from the others.
 */
export async function verifyPassword(storedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext)
  } catch {
    return false
  }
}
