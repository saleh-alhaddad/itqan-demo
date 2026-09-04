import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUser, requireBoardAccess } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'
import { appendPosition } from '@/lib/ordering'

const createColumnSchema = z.object({ name: z.string().trim().min(1).max(100) })

/** Any member of the board's team may add a column. */
export async function POST(request: Request, ctx: { params: Promise<{ boardId: string }> }) {
  return handleErrors(async () => {
    const { boardId } = await ctx.params
    const user = await requireUser()
    // Throws the shared 404 for a non-member and an absent board alike (I2).
    await requireBoardAccess(user.id, boardId)

    const parsed = createColumnSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'A column needs a name.')

    // Append via the ordering funnel, so "next position" has one definition (I5/D1).
    const position = await appendPosition(prisma, 'column', { boardId })
    const column = await prisma.column.create({ data: { boardId, name: parsed.data.name, position } })

    return NextResponse.json(column, { status: 201 })
  })
}
