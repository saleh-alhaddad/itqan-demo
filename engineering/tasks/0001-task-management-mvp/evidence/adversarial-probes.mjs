const BASE = 'http://127.0.0.1:3100'
const u = () => Date.now() + '-' + Math.random().toString(36).slice(2, 9)
const results = []
const check = (name, pass, detail) => results.push({ name, pass, detail: detail || '' })

async function account(name) {
  const email = 'adv-' + u() + '@example.test'
  const r = await fetch(BASE + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-perfectly-fine-password', name: name || 'Adv Person' }) })
  const cookie = r.headers.get('set-cookie').split(';')[0]
  const b = await r.json()
  const board = await (await fetch(BASE + '/api/boards/' + b.boardId, { headers: { cookie } })).json()
  return { cookie, boardId: b.boardId, teamId: b.teamId, email, columnId: board.columns[0].id, columns: board.columns }
}
const j = (cookie, method, body) => ({ method, headers: { 'content-type': 'application/json', cookie },
  body: body === undefined ? undefined : JSON.stringify(body) })

const a = await account()
const post = (col, body) => fetch(BASE + '/api/columns/' + col + '/tasks', j(a.cookie, 'POST', body))

{ const r = await post(a.columnId, { title: 'x'.repeat(100000) })
  check('100k-char title rejected', r.status === 400, 'status ' + r.status) }

{ const weird = '\u{1F648} \u0645\u0631\u062D\u0628\u0627 \u05E9\u05DC\u05D5\u05DD e\u0301 <script>'
  const r = await post(a.columnId, { title: weird }); const t = await r.json()
  check('unicode/RTL/emoji/combining title round-trips verbatim', r.status === 201 && t.title === weird, JSON.stringify(t.title)) }

{ const r = await post(a.columnId, { title: 'nul\u0000byte' })
  check('null byte in title does not 500', r.status < 500, 'status ' + r.status) }

{ const r1 = await fetch(BASE + '/api/columns/' + a.columnId + '/tasks',
    { method: 'POST', headers: { 'content-type': 'application/json', cookie: a.cookie }, body: '{not json' })
  const r2 = await fetch(BASE + '/api/columns/' + a.columnId + '/tasks',
    { method: 'POST', headers: { cookie: a.cookie }, body: 'title=x' })
  check('malformed JSON returns 400 not 500', r1.status === 400, 'status ' + r1.status)
  check('missing content-type returns 4xx not 500', r2.status >= 400 && r2.status < 500, 'status ' + r2.status) }

{ const t = await (await post(a.columnId, { title: 'pos probe' })).json()
  const big = await fetch(BASE + '/api/tasks/' + t.id, j(a.cookie, 'PATCH', { position: Number.MAX_SAFE_INTEGER }))
  const neg = await fetch(BASE + '/api/tasks/' + t.id, j(a.cookie, 'PATCH', { position: -5 }))
  const board = await (await fetch(BASE + '/api/boards/' + a.boardId, { headers: { cookie: a.cookie } })).json()
  const dense = board.columns.every((c) => c.tasks.every((x, i) => x.position === i))
  check('MAX_SAFE_INTEGER position does not 500', big.status < 500, 'status ' + big.status)
  check('negative position rejected', neg.status === 400, 'status ' + neg.status)
  check('positions stay dense after absurd input', dense, JSON.stringify(board.columns.map((c) => c.tasks.map((x) => x.position)))) }

{ const inj = String.fromCharCode(39) + '; DROP TABLE "Task"; --'
  const r = await post(a.columnId, { title: inj })
  const still = await fetch(BASE + '/api/boards/' + a.boardId, { headers: { cookie: a.cookie } })
  check('SQL payload stored as text, tables intact', r.status === 201 && still.status === 200, r.status + '/' + still.status) }

{ const tampered = a.cookie.slice(0, -3) + 'AAA'
  const r = await fetch(BASE + '/api/boards/' + a.boardId, { headers: { cookie: tampered } })
  check('tampered session token rejected', r.status === 401 || r.status === 404, 'status ' + r.status) }

{ const owner = await account('Race Owner'); const other = await account('Race Other')
  const added = await fetch(BASE + '/api/teams/' + owner.teamId + '/members', j(owner.cookie, 'POST', { email: other.email }))
  const oid = (await added.json()).userId
  await fetch(BASE + '/api/teams/' + owner.teamId + '/members/' + oid, j(owner.cookie, 'PATCH', { role: 'OWNER' }))
  const [r1, r2] = await Promise.all([
    fetch(BASE + '/api/teams/' + owner.teamId + '/members/' + oid, j(owner.cookie, 'DELETE')),
    fetch(BASE + '/api/teams/' + owner.teamId + '/members/' + oid, j(owner.cookie, 'DELETE'))])
  check('concurrent duplicate owner removal does not 500', r1.status < 500 && r2.status < 500, r1.status + '/' + r2.status)
  const s = await fetch(BASE + '/teams/' + owner.teamId + '/settings', { headers: { cookie: owner.cookie } })
  check('team survives the race and stays reachable', s.status === 200, 'status ' + s.status) }

{ const t = await (await post(a.columnId, { title: 'assign probe' })).json()
  const many = Array.from({ length: 500 }, (_, i) => '00000000-0000-4000-8000-' + String(i).padStart(12, '0'))
  const r = await fetch(BASE + '/api/tasks/' + t.id + '/assignees', j(a.cookie, 'PUT', { userIds: many }))
  check('500 bogus assignee ids rejected without 500', r.status === 400, 'status ' + r.status) }

{ const t = await (await post(a.columnId, { title: 'comment probe' })).json()
  const ok = await fetch(BASE + '/api/tasks/' + t.id + '/comments', j(a.cookie, 'POST', { body: 'y'.repeat(5000) }))
  const over = await fetch(BASE + '/api/tasks/' + t.id + '/comments', j(a.cookie, 'POST', { body: 'y'.repeat(5001) }))
  check('comment at the 5000 limit accepted', ok.status === 201, 'status ' + ok.status)
  check('comment past the limit rejected', over.status === 400, 'status ' + over.status) }

{ const email = 'dup-' + u() + '@example.test'
  const opts = { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'a-perfectly-fine-password', name: 'Dup' }) }
  const [x, y] = await Promise.all([fetch(BASE + '/api/auth/signup', opts), fetch(BASE + '/api/auth/signup', opts)])
  const codes = [x.status, y.status].sort()
  check('simultaneous duplicate signup: exactly one succeeds', codes[0] === 201 && codes[1] === 409, 'statuses ' + codes) }

{ const b = await account('Move Racer'); const c0 = b.columns[0]; const c1 = b.columns[1]
  for (let i = 0; i < 5; i++) await fetch(BASE + '/api/columns/' + c0.id + '/tasks', j(b.cookie, 'POST', { title: 'm' + i }))
  const fresh = await (await fetch(BASE + '/api/boards/' + b.boardId, { headers: { cookie: b.cookie } })).json()
  const ids = fresh.columns[0].tasks.map((t) => t.id)
  await Promise.all(ids.map((id, i) => fetch(BASE + '/api/tasks/' + id,
    j(b.cookie, 'PATCH', { columnId: i % 2 ? c1.id : c0.id, position: 0 }))))
  const after = await (await fetch(BASE + '/api/boards/' + b.boardId, { headers: { cookie: b.cookie } })).json()
  const dense = after.columns.every((c) => c.tasks.every((t, i) => t.position === i))
  const total = after.columns.reduce((n, c) => n + c.tasks.length, 0)
  check('5 concurrent moves leave every column dense', dense, JSON.stringify(after.columns.map((c) => c.tasks.map((t) => t.position))))
  check('no task lost or duplicated by concurrent moves', total === 5, 'total ' + total) }

for (const r of results) console.log('  ' + (r.pass ? 'PASS' : 'FAIL') + '  ' + r.name + (r.detail ? '  [' + r.detail + ']' : ''))
console.log('')
console.log('  ' + results.filter((r) => r.pass).length + '/' + results.length + ' adversarial probes passed')
