import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUser, requireColumnAccess } from '@/lib/auth/guard'
import { handleErrors, apiError } from '@/lib/api/errors'
import { appendPosition } from '@/lib/ordering'

/**
 * Only the title is required. A card the user cannot name is not a card, but everything
 * else — description, due date, assignees — is added later from the detail dialog, so
 * demanding them up front would put a form between the user and capturing a thought.
 */
const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(10_000).optional(),
  dueDate: z.iso.date().optional(),
})

export async function POST(request: Request, ctx: { params: Promise<{ columnId: string }> }) {
  return handleErrors(async () => {
    const { columnId } = await ctx.params
    const user = await requireUser()
    await requireColumnAccess(user.id, columnId)

    const parsed = createTaskSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return apiError('INVALID_INPUT', 400, 'A task needs a title.')

    const position = await appendPosition(prisma, 'task', { columnId })
    const task = await prisma.task.create({
      data: {
        columnId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        // A plain calendar date: parsed as UTC midnight so the DATE column stores the day
        // the user picked, not the day it happened to be in the server's timezone.
        dueDate: parsed.data.dueDate ? new Date(`${parsed.data.dueDate}T00:00:00Z`) : null,
        position,
      },
    })

    return NextResponse.json(task, { status: 201 })
  })
}
