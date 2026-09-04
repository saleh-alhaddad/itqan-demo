import { prisma } from '@/lib/db'

type Client = typeof prisma
/** The two things this project orders. Written generically so there is only ever one. */
type Orderable = 'column' | 'task'
/** Which parent scopes the ordering: columns within a board, tasks within a column. */
export type Scope = { boardId: string } | { columnId: string }

/**
 * The single ordering funnel (I5 / decision D1).
 *
 * D1 chose dense integers with NO `unique(parentId, position)` constraint, so nothing in the
 * database stops two rows sharing an index. What replaces the constraint is this module —
 * and that only works while **every** write to `position` goes through it. A review found
 * exactly that premise broken: the cross-column move and both create paths computed a
 * position outside these functions, and concurrent callers duplicated it
 * (`[0,0,0]` on three simultaneous moves, `[0,0,0,1,2]` on five simultaneous creates).
 *
 * Two things now hold that line:
 *
 *  1. **Every ordering write takes an advisory lock on its parent** and does its reads and
 *     writes inside one transaction. A transaction alone was not enough: two callers can
 *     both read `max = 4` and both insert `5` without ever conflicting, because they touch
 *     different rows. The lock makes ordering operations on one board or column serial,
 *     which is precisely the guarantee dense integers need.
 *  2. **Positions come from `max + 1`, never `count()`.** Those agree only while a run is
 *     dense, so `count()` silently collided the moment a gap existed.
 *
 * `pg_advisory_xact_lock` releases automatically at commit or rollback, so no code path can
 * leak one.
 */

const WRITE_CONFLICT = 'P2034'

/**
 * Re-runs a transaction that lost a write conflict.
 *
 * Far rarer now that the advisory lock serialises same-parent work, but still reachable when
 * two different parents touch overlapping rows. The abort itself is correct — no partial
 * state — and transient, so retrying is right where surfacing a 500 was not.
 *
 * Bounded and narrow: only P2034, three attempts, randomised backoff so racing callers do
 * not collide again in lockstep. Any other error propagates untouched, because retrying a
 * genuine failure hides it.
 */
async function retryOnWriteConflict<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      const isConflict =
        typeof err === 'object' && err !== null && 'code' in err &&
        (err as { code: unknown }).code === WRITE_CONFLICT
      if (!isConflict || attempt >= attempts) throw err
      await new Promise((r) => setTimeout(r, 10 * attempt + Math.random() * 15))
    }
  }
}

type Tx = Parameters<Parameters<Client['$transaction']>[0]>[0]

const scopeKey = (scope: Scope) => ('columnId' in scope ? scope.columnId : scope.boardId)

/**
 * Serialises ordering work on one parent for the rest of the transaction.
 *
 * Two scopes are locked in sorted key order, always. Locking them in call order would let a
 * move A→B and a simultaneous move B→A each hold one lock and wait for the other.
 */
async function lockScopes(tx: Tx, ...scopes: Scope[]): Promise<void> {
  const keys = [...new Set(scopes.map(scopeKey))].sort()
  for (const key of keys) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`
  }
}

/** Rows are only ever addressed through these two names, so the cast is contained here. */
const modelOf = (client: Client | Tx, kind: Orderable) =>
  (kind === 'column' ? client.column : client.task) as unknown as {
    findMany: (args: unknown) => Promise<{ id: string; position: number }[]>
    aggregate: (args: unknown) => Promise<{ _max: { position: number | null } }>
    update: (args: unknown) => Promise<unknown>
  }

/**
 * The next free index: `max + 1`, not `count()`.
 *
 * `count()` equals `max + 1` only while the run is dense, so it collided with an existing
 * row the moment a gap appeared — it returned 3 for a column holding `[0, 1, 3]`.
 *
 * Callers that INSERT must use `appendWithin` instead, which computes this under the lock.
 * This is exported for reads and tests.
 */
export async function appendPosition(client: Client | Tx, kind: Orderable, scope: Scope): Promise<number> {
  const { _max } = await modelOf(client, kind).aggregate({ where: scope, _max: { position: true } })
  return _max.position === null ? 0 : _max.position + 1
}

/**
 * Creates a row at the end of its scope, computing the index under the lock so two
 * simultaneous creates cannot choose the same one.
 */
export async function appendWithin<T>(
  client: Client,
  kind: Orderable,
  scope: Scope,
  create: (position: number, tx: Tx) => Promise<T>,
): Promise<T> {
  return retryOnWriteConflict(() => client.$transaction(async (tx) => {
    await lockScopes(tx, scope)
    const position = await appendPosition(tx, kind, scope)
    return create(position, tx)
  }))
}

/** Rewrites a scope's positions to 0..n-1 in the order given. */
async function densify(tx: Tx, kind: Orderable, ordered: { id: string; position: number }[]): Promise<void> {
  const model = modelOf(tx, kind)
  for (let i = 0; i < ordered.length; i++) {
    // Only write rows whose index actually changes — the untouched head and tail cost nothing.
    if (ordered[i].position !== i) {
      await model.update({ where: { id: ordered[i].id }, data: { position: i } })
    }
  }
}

/**
 * Moves one row within its own scope.
 *
 * `targetIndex` is clamped rather than rejected: a client asking for index 99 on a
 * three-item list means "put it last", and honouring that is friendlier than an error —
 * while an unclamped index would write a gap.
 */
export async function reorderWithin(
  client: Client, kind: Orderable, scope: Scope, id: string, targetIndex: number,
): Promise<void> {
  await retryOnWriteConflict(() => client.$transaction(async (tx) => {
    await lockScopes(tx, scope)
    const rows = await modelOf(tx, kind).findMany({
      where: scope, orderBy: { position: 'asc' }, select: { id: true, position: true },
    })

    const from = rows.findIndex((r) => r.id === id)
    if (from === -1) return

    const to = Math.max(0, Math.min(targetIndex, rows.length - 1))
    const ordered = [...rows]
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)
    await densify(tx, kind, ordered)
  }))
}

/**
 * Moves a row from one scope to another — the whole thing in ONE transaction.
 *
 * `spec.md` requires "task move with reordering (I5)" to be all-or-nothing. It previously
 * ran as three separate transactions (detach, compact the source, reorder the destination),
 * so a failure between them left the source gapped and the row at the wrong index.
 *
 * Both scopes are locked before anything is read, so a concurrent move cannot interleave
 * and pick the same destination index.
 */
export async function moveAcross(
  client: Client,
  kind: Orderable,
  id: string,
  from: Scope,
  to: Scope,
  targetIndex?: number,
): Promise<void> {
  await retryOnWriteConflict(() => client.$transaction(async (tx) => {
    await lockScopes(tx, from, to)
    const model = modelOf(tx, kind)

    const destination = await model.findMany({
      where: to, orderBy: { position: 'asc' }, select: { id: true, position: true },
    })
    const index = targetIndex === undefined
      ? destination.length
      : Math.max(0, Math.min(targetIndex, destination.length))

    // Reparent first, then densify both sides from the arrays we already hold.
    await model.update({ where: { id }, data: { ...to, position: index } })

    const inserted = [...destination]
    inserted.splice(index, 0, { id, position: index })
    await densify(tx, kind, inserted)

    const source = await model.findMany({
      where: from, orderBy: { position: 'asc' }, select: { id: true, position: true },
    })
    await densify(tx, kind, source)
  }))
}

/**
 * Renumbers a scope to 0..n-1. Used after a delete, where removing a row from the middle
 * otherwise leaves a hole.
 */
export async function compactPositions(client: Client, kind: Orderable, scope: Scope): Promise<void> {
  await retryOnWriteConflict(() => client.$transaction(async (tx) => {
    await lockScopes(tx, scope)
    const rows = await modelOf(tx, kind).findMany({
      where: scope, orderBy: { position: 'asc' }, select: { id: true, position: true },
    })
    await densify(tx, kind, rows)
  }))
}
