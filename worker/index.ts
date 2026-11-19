import { normalizeNickname, scoreRound, ROUND_EXPIRY_MS } from '../src/game/rules'

type Env = { DB: D1Database }
type Round = { started_at: number }
type Score = { score: number; servedOrders: number }

const MAX_BODY_BYTES = 128 * 1024
const RANK_LIMIT = 10

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

function error(code: string, status: number) {
  return json({ error: code }, status)
}

async function readPayload(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json' || !request.body) return null

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel()
        return null
      }
      text += decoder.decode(value, { stream: true })
    }
    const data: unknown = JSON.parse(text + decoder.decode())
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return null
    return data as Record<string, unknown>
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

async function startRound(request: Request, db: D1Database) {
  const payload = await readPayload(request)
  const nickname = typeof payload?.nickname === 'string' ? normalizeNickname(payload.nickname) : null
  if (!nickname) return error('invalid_nickname', 400)

  const id = crypto.randomUUID()
  await db.prepare('INSERT INTO rounds (id, nickname, started_at) VALUES (?, ?, ?)')
    .bind(id, nickname, Date.now()).run()
  return json({ id }, 201)
}

async function submitScore(request: Request, db: D1Database, id: string) {
  const payload = await readPayload(request)
  if (!Array.isArray(payload?.receipts)) return error('invalid_result', 400)

  const round = await db.prepare('SELECT started_at FROM rounds WHERE id = ?').bind(id).first<Round>()
  if (!round) return error('round_not_found', 404)

  const age = Date.now() - round.started_at
  const progress = payload.progress === true
  const score = scoreRound(payload.receipts, age, progress)
  if (!score) return error('invalid_result', 400)

  const findScore = db.prepare('SELECT score, served_orders AS servedOrders FROM scores WHERE round_id = ?')
    .bind(id)
  if (age > ROUND_EXPIRY_MS) {
    const saved = await findScore.first<Score>()
    return saved ? json(saved) : error('round_expired', 410)
  }

  // A repeated or concurrent submit can read the winning result without replacing it.
  const result = await db.batch([
    db.prepare(`INSERT INTO scores (round_id, score, served_orders, finalized) VALUES (?, ?, ?, ?)
      ON CONFLICT(round_id) DO UPDATE SET score = excluded.score,
      served_orders = excluded.served_orders, finalized = excluded.finalized
      WHERE scores.finalized = 0 AND excluded.score >= scores.score`)
      .bind(id, score.score, score.servedOrders, progress ? 0 : 1),
    findScore,
  ])
  return json(result[1].results[0])
}

async function leaderboard(db: D1Database) {
  const { results } = await db.prepare(
    'SELECT rounds.nickname, scores.score FROM scores JOIN rounds ON rounds.id = scores.round_id ' +
    'ORDER BY scores.score DESC, scores.id ASC LIMIT ?',
  ).bind(RANK_LIMIT).all()
  return json({ entries: results })
}

export default {
  async fetch(request: Request, env: Env) {
    const { pathname } = new URL(request.url)
    const { method } = request
    if (pathname === '/api/leaderboard' && method === 'GET') return await leaderboard(env.DB)
    if (pathname === '/api/rounds' && method === 'POST') return await startRound(request, env.DB)
    const scoreRoute = /^\/api\/rounds\/([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\/score$/.exec(pathname)
    if (scoreRoute && method === 'POST') return await submitScore(request, env.DB, scoreRoute[1])
    return error('not_found', 404)
  },
} satisfies ExportedHandler<Env>
