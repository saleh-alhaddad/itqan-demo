import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { signedInAs } from '../helpers/session'
import { prisma } from '@/lib/db'
import { POST as createColumn } from '@/app/api/boards/[boardId]/columns/route'
import { PATCH as patchTask, DELETE as deleteTask } from '@/app/api/tasks/[taskId]/route'
import { POST as login } from '@/app/api/auth/login/route'
import { createSession } from '@/lib/auth/session'
import { makeUser, makeTeam, makeBoard } from '../factories'

afterAll(async () => { await prisma.$disconnect() })

const HOST = 'boards.example'
const req = (method: string, origin: string | null, body?: unknown) =>
  new Request(`http://${HOST}/x`, {
    method,
    headers: {
      'content-type': 'application/json',
      host: HOST,
      ...(origin ? { origin } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

let boardId: string, taskId: string

beforeAll(async () => {
  const owner = await makeUser()
  signedInAs((await createSession(owner.id)).token)
  const team = await makeTeam(owner.id)
  const board = await makeBoard(team.id)
  boardId = board.id
  taskId = (await prisma.task.create({ data: { columnId: board.columns[0].id, title: 'T', position: 0 } })).id
})

describe('harden M2 — state-changing requests must come from this site', () => {
  it('refuses a mutation carrying an attacker Origin', async () => {
    const res = await createColumn(req('POST', 'https://evil.example', { name: 'Injected' }), {
      params: Promise.resolve({ boardId }),
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('CROSS_ORIGIN')
    expect(await prisma.column.count({ where: { boardId, name: 'Injected' } })).toBe(0)
  })

  it('allows the same Origin', async () => {
    const res = await createColumn(req('POST', `http://${HOST}`, { name: 'Legitimate' }), {
      params: Promise.resolve({ boardId }),
    })
    expect(res.status).toBe(201)
  })

  it('allows a request with no Origin at all — curl, server-side calls, the test suite', async () => {
    // Browsers always send Origin on a cross-origin state-changing request, so refusing
    // header-less requests would break real callers without stopping the attack.
    const res = await patchTask(req('PATCH', null, { title: 'Renamed' }), {
      params: Promise.resolve({ taskId }),
    })
    expect(res.status).toBe(200)
  })

  it('protects DELETE as well as POST and PATCH', async () => {
    const res = await deleteTask(req('DELETE', 'https://evil.example'), { params: Promise.resolve({ taskId }) })
    expect(res.status).toBe(403)
    expect(await prisma.task.count({ where: { id: taskId } })).toBe(1)
  })

  it('protects the auth routes, which do not use the shared wrapper', async () => {
    const res = await login(req('POST', 'https://evil.example', { email: 'a@b.test', password: 'x' }))
    expect(res.status).toBe(403)
  })
})

describe('harden M2 — the check cannot be forgotten on a new route', () => {
  it('every mutating route file either uses the shared wrapper or checks explicitly', () => {
    // The same enforcement idea as the SC5 matrix: without this, a route added later silently
    // opts out of the protection and nothing says so.
    const apiRoot = join(process.cwd(), 'src', 'app', 'api')
    const files: string[] = []
    const walk = (dir: string, prefix = '') => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) walk(full, `${prefix}${entry}/`)
        else if (entry === 'route.ts') files.push(`${prefix}${entry}`)
      }
    }
    walk(apiRoot)

    const unprotected: string[] = []
    for (const rel of files) {
      const src = readFileSync(join(apiRoot, rel), 'utf8')
      const mutates = /export async function (POST|PATCH|PUT|DELETE)/.test(src)
      if (!mutates) continue
      const covered = src.includes('handleErrors(request') || src.includes('assertSameOrigin')
      if (!covered) unprotected.push(rel)
    }

    expect(unprotected, `mutating routes with no cross-origin check:\n  ${unprotected.join('\n  ')}`)
      .toEqual([])
    // And confirm the scan actually examined something.
    expect(files.length).toBeGreaterThan(10)
  })
})
