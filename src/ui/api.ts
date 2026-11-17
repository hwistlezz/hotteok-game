import type { Receipt } from '../game/rules'

async function request<T>(path: string, payload?: object): Promise<T> {
  const response = await fetch(path, {
    signal: AbortSignal.timeout(6_500),
    ...(payload && {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  })
  if (!response.ok) throw new Error('랭킹 요청 실패')
  return await response.json() as T
}

export const beginRound = (nickname: string) => request<{ id: string }>('/api/rounds', { nickname })
export const registerScore = (id: string, receipts: Receipt[]) =>
  request<{ score: number }>(`/api/rounds/${id}/score`, { receipts })
export const fetchLeaderboard = () => request<{ entries: { nickname: string; score: number }[] }>('/api/leaderboard')

const bestKey = 'hotteok-best'

export function readBest() {
  try {
    const best = Number(localStorage.getItem(bestKey))
    return Number.isSafeInteger(best) && best >= 0 ? best : 0
  } catch {
    return 0
  }
}

export function writeBest(best: number) {
  try {
    localStorage.setItem(bestKey, String(best))
  } catch {
    // The current session still keeps the personal record in memory.
  }
}

export const won = (value: number) => `${value.toLocaleString('ko-KR')}원`
