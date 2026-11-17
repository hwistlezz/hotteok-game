import { ROUND_REQUEST_TIMEOUT_MS, type Receipt } from '../game/rules'

async function request<T>(path: string, payload?: object): Promise<T> {
  const response = await fetch(path, {
    signal: AbortSignal.timeout(ROUND_REQUEST_TIMEOUT_MS),
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

export const bestKey = 'hotteok-best'

export function readBest() {
  try {
    const best = Number(localStorage.getItem(bestKey))
    return Number.isSafeInteger(best) && best >= 0 ? best : 0
  } catch {
    return 0
  }
}

export async function saveBest(score: number) {
  function mergeBest() {
    const saved = readBest()
    if (saved >= score) return saved
    try {
      localStorage.setItem(bestKey, String(score))
    } catch {
      // Keep the current session's record when storage is unavailable.
    }
    return score
  }

  try {
    // Serialise the read and write across tabs in browsers that support Web Locks.
    if (navigator.locks) return await navigator.locks.request(bestKey, mergeBest)
  } catch {
    // A restricted context can still attempt a storage read and write.
  }
  return mergeBest()
}

export const won = (value: number) => `${value.toLocaleString('ko-KR')}원`
