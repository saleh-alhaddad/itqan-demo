import { prisma } from '@/lib/db'

type Client = typeof prisma
/** The two things this project orders. Written generically so there is only ever one. */
type Orderable = 'column' | 'task'
/** Which parent scopes the ordering: columns within a board, tasks within a column. */
type Scope = { boardId: string } | { columnId: string }

/**
 * The single ordering funnel (I5 / decision D1).
 *
 * D1 chose dense integers with NO `unique(parentId, position)` constraint: a dense shift
 * transiently collides, so uniqueness would force either deferrable constraints (which
 * Prisma Migrate does not express) or a two-phase update through sentinel values —
 * machinery to protect a guarantee the surrounding transaction already gives.
 *
 * What replaces the constraint is this function plus the tests that assert positions are
 * exactly 0..n-1 afterwards. That only holds while this is the ONLY code that writes
 * `position`: a second reorder path would break density in whichever path is used less,
 * and nothing would notice. Both columns and tasks go through here for that reason.
 */

/** Rows are only ever addressed through these two names, so the cast is contained here. */
const modelOf = (client: Client, kind: Orderable) =>
  (kind === 'column' ? client.column : client.task) as {
    findMany: (args: unknown) => Promise<{ id: string }[]>
    count: (args: unknown) => Promise<number>
    update: (args: unknown) => Promise<unknown>
  }

/** The next free position for an append — i.e. the current count. */
export async function appendPosition(client: Client, kind: Orderable, scope: Scope): Promise<number> {
  return modelOf(client, kind).count({ where: scope })
}

/**
 * Moves one row to `targetIndex` within its scope and rewrites every affected position so
 * the run stays dense.
 *
 * The whole rewrite is one transaction: a partial reorder would leave duplicate or missing
 * positions, and with no unique constraint the database would happily keep them.
 *
 * `targetIndex` is clamped rather than validated-and-rejected. A client asking for index 99
 * on a three-column board means "put it last", and honouring that is friendlier than an
 * error — while an unclamped index would write a gap.
 */
export async function reorderWithin(
  client: Client,
  kind: Orderable,
  scope: Scope,
  id: string,
  targetIndex: number,
): Promise<void> {
  await client.$transaction(async (tx) => {
    const model = modelOf(tx as unknown as Client, kind)
    const rows = await model.findMany({ where: scope, orderBy: { position: 'asc' }, select: { id: true } })

    const from = rows.findIndex((r) => r.id === id)
    if (from === -1) return // not in this scope; nothing to reorder

    const to = Math.max(0, Math.min(targetIndex, rows.length - 1))
    if (from === to) return

    const ordered = [...rows]
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)

    // Rewrite only the rows whose index actually changed — the untouched head and tail of
    // the list do not need a write.
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    for (let i = lo; i <= hi; i++) {
      await model.update({ where: { id: ordered[i].id }, data: { position: i } })
    }
  })
}

/**
 * Renumbers a scope to 0..n-1 in one transaction. Used after a delete, where removing a row
 * from the middle otherwise leaves a hole in the sequence.
 */
export async function compactPositions(client: Client, kind: Orderable, scope: Scope): Promise<void> {
  await client.$transaction(async (tx) => {
    const model = modelOf(tx as unknown as Client, kind)
    const rows = await model.findMany({ where: scope, orderBy: { position: 'asc' }, select: { id: true } })
    for (let i = 0; i < rows.length; i++) {
      await model.update({ where: { id: rows[i].id }, data: { position: i } })
    }
  })
}
