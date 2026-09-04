# Security review — 0001 · Task management app · 2026-09-04

Read-only audit at commit `a8c5f22`, branch `task/0001-task-management-mvp`.
Every finding names the actor who reaches it, the boundary it violates, demonstrated impact,
and a concrete fix. Dismissals carry the same evidence as findings.

## Threat model

**Assets, ranked** — (1) account credentials and the ability to act as another user;
(2) another team's board contents; (3) members' email addresses (the only PII stored);
(4) availability of a shared board.

**Entry points** — enumerated from the router, not the screens: 16 API route files
(20 handlers) and 5 server-rendered pages. Four are anonymous by design: `POST /api/auth/signup`,
`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/health`. **Every one of the other
16 handlers resolves a guard** (`requireUser` plus a resource guard); there is no middleware,
so authorization lives in the handlers and inside the queries themselves.

**Actors** — anonymous · self-registered user · a member of a *different* team · a plain
member of the same team (vs. its owner) · someone holding a stolen session cookie.

**Trust boundaries** — (a) anonymous → authenticated, at the three auth routes; (b) one team's
data → another's, at every team-scoped query; (c) member → owner, at the three destructive
rules; (d) client input → Postgres, at every handler.

**STRIDE, kept to what is concrete here** — *Spoofing*: credential guessing at the login
boundary (C1). *Information disclosure*: account existence (H1), stack disclosure (I1, I2).
*Elevation*: member → owner, and cross-team access — both covered by the guard matrix.
*Denial of service*: unthrottled auth (C1). *Tampering/repudiation*: no finding; all writes
are authorized and parameterized.

---

## Critical

### C1 — Login has no rate limiting, no lockout, and no backoff
- **Who reaches it:** anonymous.
- **Boundary:** anonymous → authenticated.
- **Demonstrated:** 100 wrong-password attempts against one account completed in **0.7s** —
  a sustained **~138 attempts/second from a single client**, every one answered `401`, none
  `429`. After 100 failures the correct password still logged in: **there is no lockout of
  any kind.** Parallel clients multiply this linearly.
- **Impact:** credential stuffing. The 12-character minimum makes blind brute force
  impractical, but stuffing known breach pairs is the attack that actually takes accounts
  over, and nothing here slows it. There is no password reset, so a stolen account is also
  unrecoverable by its owner.
- **Fix:** per-account and per-IP throttling on `POST /api/auth/login` with exponential
  backoff, plus a temporary lock after N consecutive failures. `spec.md` explicitly deferred
  "exact password policy, lockout, and login rate limiting" to this phase.
- **Note:** `security.md` requires explicit human approval before adding or changing a
  rate-limit or auth flow, so this is raised, not unilaterally built.

---

## High

### H1 — Signup discloses whether any given email has an account
- **Who reaches it:** anonymous.
- **Boundary:** anonymous → account existence.
- **Demonstrated:** `POST /api/auth/signup` with an existing address returns **409
  `EMAIL_TAKEN`**; an unused address returns 201. The two are trivially distinguishable, at
  the same ~138 req/s as C1.
- **Impact:** an attacker can confirm which addresses from a breach list are users here,
  turning C1 from a guess into a targeted list. The two findings compose.
- **Variant analysis (Step 3b) — the same class appears twice more:**
  - `POST /api/teams/:id/members` returns `NO_SUCH_ACCOUNT` vs. success. **Deliberate** —
    `spec.md` SC7 requires the explicit miss so an owner can tell a typo from a person who
    never signed up, and records that harden must reconcile the two. Reach is narrower
    (a team owner, authenticated), so this is the acceptable half of the trade.
  - `POST /api/auth/login` is **clean**: wrong-password and unknown-email return byte-identical
    401s, and the handler verifies against a dummy argon2id hash when no user matched so the
    two paths take comparable time. That control is already correct.
- **Fix options, in order of preference:** (a) accept the signup 409 as the cost of a usable
  signup form, and mitigate by fixing C1 — with throttling, enumeration is slow enough to be
  impractical; (b) return 201 always and send a "this address is already registered" email —
  **not available**, the MVP ships no email; (c) put the signup form behind the same
  throttle as login. **(a) + (c) is the honest MVP answer.**

---

## Medium

### M1 — No security response headers at all
Verified live on `GET /`: **CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
Strict-Transport-Security and Permissions-Policy are all absent**, and `X-Powered-By: Next.js`
is present.

Ranked Medium, not High, because the attacks each header blocks are **already behind a working
control** — and that was tested rather than assumed. The session cookie is
`HttpOnly; Secure; SameSite=lax` (read off the wire from a real signup), so it is not sent on
cross-**site** subresource loads: a board framed by an attacker renders logged-out, and its
destructive controls are unreachable. The gap is that SameSite is the *only* layer.
- **Fix:** `headers()` in `next.config.ts` — `frame-ancestors 'none'` (or X-Frame-Options
  DENY), `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS, and a CSP.
  Disable `poweredByHeader`.

### M2 — CSRF defence is SameSite alone
No Origin/Referer check and no CSRF token on any mutating route. SameSite=Lax blocks the
cookie on cross-site POST, so this is not currently exploitable — but as with M1 there is no
second layer, and a future change to `SameSite=None` (for an embed, an integration, a
third-party iframe) would silently open every mutation at once.
- **Fix:** verify `Origin` against an allow-list on mutating handlers — a few lines in the
  shared route wrapper that already exists (`handleErrors`).

### M3 — A CLI is declared as a runtime dependency
`shadcn` (**33 direct dependencies**) sits in `package.json` `dependencies`, not
`devDependencies`. It is not imported by any application code and contributes 0 files to
`.next/server`, but a production install pulls it and its transitive tree onto the server for
no reason — unnecessary supply-chain surface.
- **Fix:** move `shadcn` to `devDependencies`. (`cn` was checked and is legitimate: published
  by `shadcn <m@shadcn.com>` from `github.com/shadcn-ui/cn`, MIT, and genuinely imported by
  three UI components. A package named `cn` whose registry entry dates to 2013 is exactly what
  a typo-squat looks like, which is why it was verified rather than assumed.)

### M4 — 30-day rolling sessions with no absolute lifetime
`readSession` refreshes `expiresAt` on every use, so an active session never expires. There is
no absolute cap and no "sign out of all devices". A stolen cookie stays valid indefinitely as
long as it is used, and its owner has no way to revoke it (there is no password reset either).
- **Fix:** an absolute maximum age alongside the rolling window, and a "sign out everywhere"
  that deletes all `Session` rows for a user. The DB-backed session design already makes both
  cheap — this is the payoff for choosing it over a sealed cookie.

---

## Info

- **I1 — `/` serves the create-next-app starter page** to anonymous visitors (200, 11.8 KB,
  "To get started, edit the page.tsx file", Vercel links). Discloses the stack and reads as an
  unfinished deployment. Should redirect to `/boards` or `/login`.
- **I2 — `X-Powered-By: Next.js`** on every response. Framework disclosure; one config line.
- **I3 — `.env.example` contains a working local password** (`postgresql://itqan:itqan@…`).
  Local-only and not a live credential, but it is a real password in a committed file and
  invites reuse. Prefer a placeholder.
- **I4 — Password policy is length-only** (12–200 characters). No breach-list check. Adequate
  for the MVP given C1 is fixed; worth revisiting with real users.

---

## Checked and found sound (evidence, not assumption)

| Area | Evidence |
|---|---|
| **argon2 cost parameters** — the spec deferred tuning here | Measured from a real hash: `m=19456, t=2, p=1`, which **is exactly the OWASP Password Storage minimum for argon2id**. No change needed. |
| **Dependency advisories** | 3 reported (2× mysql2 high/moderate, 1× deepmerge-ts high). **All unreachable:** the datasource is postgresql, the runtime loads `@prisma/adapter-pg`, `prisma` is a devDependency, and mysql2/deepmerge-ts/@prisma/config contribute **0 files** to `.next/server`. Triaged by reachability, not scanner count. |
| **Next.js advisories** | The August 2026 release patched two RCEs in **16.3.3**; we run **16.3.4**. The mixed-router RCE also needs the Pages Router, which is absent. |
| **SQL injection** | No raw SQL anywhere in application code except `SELECT 1` in the health probe. All access goes through Prisma's query builder. |
| **Authorization / IDOR** | Every team-scoped handler routes through a guard, and authorization lives *in the query* (`loadBoardFor`, `loadTeamFor`, `listBoardsFor`). T18's matrix asserts byte-identical 404s across all 19 endpoints as a non-member, with row counts unchanged, and fails if a new endpoint has no row. |
| **Session token** | 32 bytes of CSPRNG, opaque, not derived from the user. `HttpOnly; Secure; SameSite=lax; Path=/` confirmed on the wire. |
| **Session fixation** | A fresh token is issued at login; a pre-existing cookie is never adopted. |
| **Login timing oracle** | Verifies against a dummy hash when no user matched, so unknown-email and wrong-password take comparable time. |
| **Secrets in the repo** | No tracked `.env`; the one grep hit in `intake.md` is prose *about* not recording secrets. |
| **XSS** | Comments and titles render as text; no `dangerouslySetInnerHTML` anywhere. Asserted end-to-end with a script-tag payload. |
| **LLM Top 10** | Not applicable — no model, prompt, or agent surface in this product. |

## Verdict

**1 Critical, 1 High, 4 Medium, 4 Info.** C1 and H1 must be fixed or explicitly accepted
before release. C1 is the one that matters: it is anonymous, demonstrated, and unmitigated,
and H1 makes it targeted.

Both C1 and the throttling half of H1 change an auth flow, which `security.md` says needs
explicit human approval before building. They are raised here rather than fixed.
