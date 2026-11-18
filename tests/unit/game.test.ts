import { describe, expect, it } from 'vitest'
import { contactSurface, cookingRules, newGame, stirCue, reduceGame, type GameState } from '../../src/game/game'
import {
  normalizeNickname, orderLimit, orderQuantity, ROUND_REQUEST_TIMEOUT_MS, scoreReceipts, scoreRound,
} from '../../src/game/rules'

function mix(game: GameState, now = 0) {
  while (game.phase === 'knead') {
    game = reduceGame(game, { type: 'knead', amount: stirCue(game).direction * .5, now })
  }
  return game
}

function readyToServe(start = 0) {
  let game = mix(newGame(false), start)
  game = reduceGame(game, { type: 'portion', now: start })
  game = reduceGame(game, { type: 'press-start', now: start })
  game = reduceGame(game, { type: 'press-release', now: start + 900 })
  game = reduceGame(game, { type: 'cook', now: start + 3_400 })
  return reduceGame(game, { type: 'cook', now: start + 5_900 })
}

describe('조리 게임', () => {
  it('반죽을 다 저어도 한 덩이를 옮겨야 누르기를 시작한다', () => {
    for (let seed=0; seed<16; seed++) {
      let batch = newGame(false, seed)
      const directions = new Set<number>()
      for (let stage=0; stage<3; stage++) {
        const { direction } = stirCue(batch)
        directions.add(direction)
        batch = reduceGame(batch, { type:'knead', amount:-direction, now:1 })
        expect(batch.turns).toBe(stage*4)
        for(let i=0;i<8;i++) batch=reduceGame(batch,{type:'knead',amount:direction*.5,now:2})
      }
      expect(directions.size).toBe(2)
      expect(batch.phase).toBe('portion')
    }
    const game = mix(newGame(false))
    expect(reduceGame(game, { type:'press-start', now:60 })).toBe(game)
    expect(reduceGame(game, { type:'portion', now:70 }).phase).toBe('press')
  })
  it('실전에서 덜 익은 면을 일찍 들면 찢어지고 같은 주문을 다시 만든다', () => {
    const game: GameState = { ...newGame(false), phase:'front', placed:1, since:200 }
    expect(reduceGame(game, {type:'cook',now:649})).toBe(game)
    const torn=reduceGame(game, {type:'cook',now:650})
    expect(torn).toMatchObject({phase:'redo',score:0,placed:1})
    expect(reduceGame(torn,{type:'discard',now:800})).toMatchObject({phase:'portion',placed:1,hearts:3})
  })
  it('피크 타임에서 눈금을 1ms 놓친 호떡은 납품할 수 없고 예약 반죽으로 다시 굽는다', () => {
    const back: GameState = { ...newGame(false), servedOrders: 2, phase: 'back', stars: 2, prepped: 2 }
    const { start, end, burn, required } = cookingRules(back)
    expect([end - start, required]).toEqual([150, 3])
    for (const now of [start, end]) {
      expect(reduceGame(back, { type: 'cook', now })).toMatchObject({ phase: 'serve', stars: 3 })
    }
    const rejected = reduceGame(back, { type: 'cook', now: end + 1 })
    expect(reduceGame(rejected, { type: 'serve', now: end + 2 })).toBe(rejected)
    expect(reduceGame(rejected, { type: 'discard', now: end + 3 })).toMatchObject({
      phase: 'portion', turns: 12, prepped: 2, score: 0, placed: 0, hearts: 3, orderAt: 0,
    })
    expect(reduceGame(back, { type: 'cook', now: burn }).phase).toBe('burnt')
  })

  it('뒤집을 때만 윗면에 직전 접촉면의 색을 기록하고 불판에서 타도 윗면 색은 유지한다', () => {
    const front = { ...newGame(false), phase:'front' as const }
    expect(reduceGame(front,{type:'tick',now:2400}).exposed.toast).toBe(0)
    const back = reduceGame(front,{type:'cook',now:2600})
    expect(back.exposed).toEqual(contactSurface(2600,cookingRules(front)))
    expect(reduceGame(back,{type:'tick',now:4600}).exposed).toBe(back.exposed)
    expect(reduceGame(back,{type:'tick',now:7600})).toMatchObject({phase:'burnt',exposed:back.exposed})
  })

  it('누르기 합격 구간의 양 끝과 앞뒤 1ms를 구분한다', () => {
    const game={...newGame(false),phase:'press' as const,pressAt:0,servedOrders:2}
    const {pressStart,pressEnd}=cookingRules(game)
    for(const [now,stars] of [[pressStart-1,0],[pressStart,1],[pressEnd,1],[pressEnd+1,0]]) {
      expect(reduceGame(game,{type:'press-release',now}).stars).toBe(stars)
    }
  })

  it('영업 실적으로만 난이도가 오르고 연습은 별이 부족해도 끝까지 익힐 수 있다', () => {
    const base = newGame(false)
    const missed = reduceGame(base, { type: 'tick', now: 18_000 })
    expect(cookingRules(missed).shift).toBe('첫 영업')
    expect(cookingRules({ ...base, servedOrders: 1 }).shift).toBe('손님 몰림')
    const practice = { ...newGame(true), phase: 'back' as const, stars: 0 }
    expect(reduceGame(practice, { type: 'cook', now: 4_000 })).toMatchObject({ phase: 'serve', stars: 0 })
  })
  it('두 면을 익힌 주문에만 매출을 한 번 적립한다', () => {
    const game = readyToServe()
    expect(game).toMatchObject({ phase: 'serve', stars: 3 })
    const served = reduceGame(game, { type: 'serve', now: 6_000 })
    expect(served).toMatchObject({ score: 2_000, phase: 'knead', turns: 1 })
    expect(reduceGame(served, { type: 'serve', now: 6_000 })).toBe(served)
  })

  it('동일 시각의 제출보다 주문 만료를 먼저 처리한다', () => {
    const timedOut = reduceGame(readyToServe(), { type: 'serve', now: 18_000 })
    expect(timedOut).toMatchObject({ score: 0, hearts: 2, phase: 'knead' })
    expect(reduceGame(timedOut, { type: 'tick', now: 18_000 })).toBe(timedOut)
  })

  it('타는 시각에 뒤집어도 폐기해야 하며 하트는 차감되지 않는다', () => {
    let game = mix(newGame(false), 0)
    game = reduceGame(game, { type: 'portion', now: 0 })
    game = reduceGame(game, { type: 'press-start', now: 0 })
    game = reduceGame(game, { type: 'press-release', now: 800 })
    game = reduceGame(game, { type: 'cook', now: 5_800 })
    expect(game).toMatchObject({ phase: 'burnt', hearts: 3, stars: 0 })
    expect(reduceGame(game, { type: 'discard', now: 5_900 }).phase).toBe('portion')
  })

  it('눌림 입력을 취소한 뒤 커서 해제나 복귀가 누르기 판정을 만들지 않는다', () => {
    const kneaded = mix(newGame(false), 0)
    const placed = reduceGame(kneaded, { type: 'portion', now: 0 })
    const pressed = reduceGame(placed, { type: 'press-start', now: 10 })
    const canceled = reduceGame(pressed, { type: 'cancel-press', now: 500 })
    expect(reduceGame(canceled, { type: 'press-release', now: 1_000 })).toBe(canceled)
  })

  it('연습은 주문 제한시간을 넘겨도 하트를 잃지 않는다', () => {
    const game = newGame(true)
    expect(reduceGame(game, { type: 'tick', now: 180_000 })).toBe(game)
  })

  it('굽는 동안 준비한 반죽은 다음 손님에게 한 번만 전달한다', () => {
    const front = { ...newGame(false), phase: 'front' as const, stars: 1 }
    let game = reduceGame(front, { type: 'prep', now: 100 })
    game = reduceGame(game, { type: 'cook', now: 2_600 })
    game = reduceGame(game, { type: 'prep', now: 2_800 })
    game = reduceGame(game, { type: 'cook', now: 5_200 })
    game = reduceGame(game, { type: 'serve', now: 6_000 })
    expect(game).toMatchObject({ phase: 'knead', turns: 2, prepped: 0, score: 2_000, streak: 1, bestStreak: 1 })
    expect(reduceGame(game, { type: 'prep', now: 6_100 })).toBe(game)
  })

  it('바삭한 주문은 늦은 눈금에서 별을 주고, 주문 만료 시 준비량과 연속 기록을 초기화한다', () => {
    const order = reduceGame(readyToServe(), { type: 'serve', now: 6_000 })
    const front = { ...order, phase: 'front' as const, since: 6_000, prepped: 1 }
    expect(reduceGame(front, { type: 'cook', now: 8_600 }).stars).toBe(0)
    expect(reduceGame(front, { type: 'cook', now: 9_500 }).stars).toBe(1)
    expect(reduceGame(front, { type: 'tick', now: 34_000 })).toMatchObject({
      hearts: 2, prepped: 0, streak: 0, bestStreak: 1, lastStars: null,
    })
  })

  it('주문 수량은 5개까지 늘어나며 일부만 제출한 주문에는 매출을 적립하지 않는다', () => {
    expect(Array.from({ length: 11 }, (_, index) => orderQuantity(index)))
      .toEqual([1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5])
    const served = reduceGame(readyToServe(), { type: 'serve', now: 6_000 })
    const second = { ...readyToServe(6_000), orderAt: 6_000, score: served.score, receipts: served.receipts }
    const partial = reduceGame(second, { type: 'serve', now: 12_000 })
    expect(partial).toMatchObject({ phase: 'portion', placed: 1, score: 2_000 })
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
