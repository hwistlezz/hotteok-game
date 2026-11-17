export const STARTING_HEARTS = 3
export const UNIT_PRICE = 2_000
export const PRESS_MIN = 800
export const PRESS_IDEAL_END = 1_200
export const COOK_MIN = 2_500
export const COOK_IDEAL_END = 3_500
export const COOK_BURN = 5_000

export type Receipt = {
  outcome: 'served' | 'timeout'
  elapsedMs: number
}

export function orderQuantity(orderIndex: number) {
  return Math.min(5, 1 + Math.ceil(orderIndex / 2))
}

export function orderLimit(quantity: number) {
  return 8_000 + quantity * 10_000
}

export function normalizeNickname(value: string) {
  const nickname = value.normalize('NFC').trim().replace(/ +/g, ' ')
  return /^[\p{L}\p{N} _-]{2,16}$/u.test(nickname) ? nickname : null
}

export function scoreReceipts(receipts: unknown[], availableMs: number) {
  let hearts = STARTING_HEARTS
  let elapsed = 0
  let score = 0
  let servedOrders = 0

  for (const [index, receipt] of receipts.entries()) {
    if (
      !hearts ||
      typeof receipt !== 'object' ||
      receipt === null ||
      !('outcome' in receipt) ||
      !('elapsedMs' in receipt) ||
      typeof receipt.elapsedMs !== 'number' ||
      !Number.isSafeInteger(receipt.elapsedMs)
    ) return null

    const quantity = orderQuantity(index)
    const limit = orderLimit(quantity)
    if (receipt.outcome === 'timeout' && receipt.elapsedMs === limit) {
      hearts -= 1
    } else if (
      receipt.outcome === 'served' &&
      receipt.elapsedMs >= quantity * (PRESS_MIN + 2 * COOK_MIN) &&
      receipt.elapsedMs < limit
    ) {
      score += quantity * UNIT_PRICE
      servedOrders += 1
    } else {
      return null
    }
    elapsed += receipt.elapsedMs
    if (elapsed > availableMs) return null
  }

  return hearts === 0 ? { score, servedOrders } : null
}
