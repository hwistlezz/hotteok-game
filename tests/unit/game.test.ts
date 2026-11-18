import { describe, expect, it } from 'vitest'
import { newGame, reduceGame } from '../../src/game/game'
import {
  normalizeNickname, orderLimit, orderQuantity, ROUND_REQUEST_TIMEOUT_MS, scoreReceipts, scoreRound,
} from '../../src/game/rules'

function readyToServe(start = 0) {
  let game = reduceGame(newGame(false), { type: 'knead', amount: 100, now: start })
  game = reduceGame(game, { type: 'press-start', now: start })
  game = reduceGame(game, { type: 'press-release', now: start + 900 })
  game = reduceGame(game, { type: 'cook', now: start + 3_400 })
  return reduceGame(game, { type: 'cook', now: start + 5_900 })
}

describe('조리 게임', () => {
  it('두 면을 익힌 주문에만 매출을 한 번 적립한다', () => {
    const game = readyToServe()
    expect(game).toMatchObject({ phase: 'serve', stars: 3 })
    const served = reduceGame(game, { type: 'serve', now: 6_000 })
    expect(served).toMatchObject({ score: 2_000, phase: 'knead' })
    expect(reduceGame(served, { type: 'serve', now: 6_000 })).toBe(served)
  })

  it('동일 시각의 제출보다 주문 만료를 먼저 처리한다', () => {
    const timedOut = reduceGame(readyToServe(), { type: 'serve', now: 18_000 })
    expect(timedOut).toMatchObject({ score: 0, hearts: 2, phase: 'knead' })
    expect(reduceGame(timedOut, { type: 'tick', now: 18_000 })).toBe(timedOut)
  })

  it('타는 시각에 뒤집어도 폐기해야 하며 하트는 차감되지 않는다', () => {
    let game = reduceGame(newGame(false), { type: 'knead', amount: 100, now: 0 })
    game = reduceGame(game, { type: 'press-start', now: 0 })
    game = reduceGame(game, { type: 'press-release', now: 800 })
    game = reduceGame(game, { type: 'cook', now: 5_800 })
    expect(game).toMatchObject({ phase: 'burnt', hearts: 3, stars: 0 })
    expect(reduceGame(game, { type: 'discard', now: 5_900 }).phase).toBe('knead')
  })

  it('눌림 입력을 취소한 뒤 커서 해제나 복귀가 누르기 판정을 만들지 않는다', () => {
    const kneaded = reduceGame(newGame(false), { type: 'knead', amount: 100, now: 0 })
    const pressed = reduceGame(kneaded, { type: 'press-start', now: 10 })
    const canceled = reduceGame(pressed, { type: 'cancel-press', now: 500 })
    expect(reduceGame(canceled, { type: 'press-release', now: 1_000 })).toBe(canceled)
  })

  it('연습은 주문 제한시간을 넘겨도 하트를 잃지 않는다', () => {
    const game = newGame(true)
    expect(reduceGame(game, { type: 'tick', now: 180_000 })).toBe(game)
  })

  it('주문 수량은 5개까지 늘어나며 일부만 제출한 주문에는 매출을 적립하지 않는다', () => {
    expect(Array.from({ length: 11 }, (_, index) => orderQuantity(index)))
      .toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5])
    const served = reduceGame(readyToServe(), { type: 'serve', now: 6_000 })
    const second = { ...readyToServe(6_000), orderAt: 6_000, score: served.score, receipts: served.receipts }
    const partial = reduceGame(second, { type: 'serve', now: 12_000 })
    expect(partial).toMatchObject({ placed: 1, score: 2_000 })
    const expired = reduceGame(partial, { type: 'tick', now: 34_000 })
    expect(expired).toMatchObject({ placed: 0, score: 2_000, hearts: 2 })
  })
})

describe('랭킹 검증', () => {
  const receipts = [
    { outcome: 'served', elapsedMs: 6_000 },
    ...[1, 2, 3].map((index) => ({
      outcome: 'timeout',
      elapsedMs: orderLimit(orderQuantity(index)),
    })),
  ]

  it('완료된 주문 수량으로만 서버 매출을 계산한다', () => {
    expect(scoreReceipts(receipts, 100_000)).toEqual({ score: 2_000, servedOrders: 1 })
  })

  it('미완료 경기와 불가능한 조리·종료 시간을 거부한다', () => {
    expect(scoreReceipts(receipts.slice(0, -1), 200_000)).toBeNull()
    expect(scoreReceipts(receipts, 99_999)).toBeNull()
    expect(scoreReceipts([{ outcome: 'served', elapsedMs: 5_799 }, ...receipts.slice(1)], 100_000)).toBeNull()
    expect(scoreReceipts([...receipts, receipts[0]], 200_000)).toBeNull()
  })

  it('라운드 발급 요청의 최대 지연까지 허용하고 더 이른 제출은 거부한다', () => {
    const earliest = 100_000 - ROUND_REQUEST_TIMEOUT_MS
    expect(scoreRound(receipts, earliest)).toEqual({ score: 2_000, servedOrders: 1 })
    expect(scoreRound(receipts, earliest - 1)).toBeNull()
  })

  it('공개 닉네임의 문자와 길이를 정규화한다', () => {
    expect(normalizeNickname('  호떡   장인  ')).toBe('호떡 장인')
    expect(normalizeNickname('ㅇ')).toBeNull()
    expect(normalizeNickname('<script>')).toBeNull()
  })
})
