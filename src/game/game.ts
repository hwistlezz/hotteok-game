import {
  COOK_BURN, COOK_IDEAL_END, COOK_MIN, orderLimit, orderQuantity,
  PRESS_IDEAL_END, PRESS_MIN, STARTING_HEARTS, UNIT_PRICE, type Receipt,
} from './rules'

export type Phase = 'knead' | 'press' | 'front' | 'back' | 'serve' | 'burnt' | 'redo'
export type GameState = {
  practice: boolean
  phase: Phase
  dough: number
  prepped: number
  streak: number
  bestStreak: number
  since: number
  pressAt: number | null
  leaked: boolean
  stars: number
  lastStars: number | null
  placed: number
  hearts: number
  score: number
  servedOrders: number
  orderAt: number
  receipts: Receipt[]
  finished: boolean
}

export type GameAction = { now: number } & (
  { type: 'knead' | 'prep'; amount: number } |
  { type: 'tick' | 'press-start' | 'press-release' | 'cancel-press' | 'cook' | 'serve' | 'discard' }
)

const freshDough = {
  phase: 'knead' as const,
  dough: 0,
  pressAt: null,
  stars: 0,
  leaked: false,
}

const doneness = [
  { label: '노릇하게', start: COOK_MIN, end: COOK_IDEAL_END },
  { label: '바삭하게', start: COOK_MIN + 900, end: COOK_IDEAL_END + 750 },
  { label: '부드럽게', start: COOK_MIN, end: COOK_IDEAL_END - 350 },
]

export function cookTarget(orderIndex: number) {
  return doneness[orderIndex % doneness.length]
}

const shifts = [
  { label: '첫 영업', required: 2, window: 750, grace: 1_000, pressEnd: PRESS_IDEAL_END },
  { label: '손님 몰림', required: 2, window: 520, grace: 620, pressEnd: 1_100 },
  { label: '피크 타임', required: 3, window: 320, grace: 420, pressEnd: 1_020 },
]

export function cookingRules(game: GameState) {
  const taste = cookTarget(game.receipts.length)
  if (game.practice) return { ...taste, shift: '연습', required: 0, pressEnd: PRESS_IDEAL_END, burn: COOK_BURN }
  const shift = shifts[Math.min(game.servedOrders, shifts.length - 1)]
  // Alternate the hot spot by batch and side. Both the gauge and the judge use this clock.
  const offset = game.servedOrders > 0 && (game.placed + Number(game.phase === 'back')) % 2 === 1 ? 250 : 0
  const start = taste.start + offset
  const end = start + Math.min(shift.window, taste.end - taste.start)
  return { label: taste.label, start, end, shift: shift.label, required: shift.required,
    pressEnd: shift.pressEnd, burn: Math.min(COOK_BURN, end + shift.grace) }
}

export function doughBonus(stars: number, prepped: number) {
  return stars === 3 ? Math.min(25, 100 - prepped) : 0
}

export function newGame(practice: boolean): GameState {
  return {
    ...freshDough, practice, since: 0, lastStars: null, placed: 0, prepped: 0, streak: 0, bestStreak: 0,
    hearts: STARTING_HEARTS, score: 0, servedOrders: 0, orderAt: 0,
    receipts: [], finished: false,
  }
}

function expireOrder(game: GameState, now: number, limit: number): GameState {
  const hearts = game.hearts - 1
  return {
    ...game, ...freshDough, since: now, hearts, orderAt: now,
    placed: 0, lastStars: null, prepped: 0, streak: 0, finished: hearts === 0,
    receipts: [...game.receipts, { outcome: 'timeout', elapsedMs: limit }],
  }
}

export function reduceGame(game: GameState, action: GameAction): GameState {
  if (game.finished) return game
  const quantity = orderQuantity(game.receipts.length)
  const limit = orderLimit(quantity)
  const elapsed = action.now - game.since

  if (!game.practice && action.now - game.orderAt >= limit) {
    return expireOrder(game, action.now, limit)
  }
  const rules = cookingRules(game)
  if ((game.phase === 'front' || game.phase === 'back') && elapsed >= rules.burn) {
    // Apply the burn before interpreting a late flip or removal.
    return { ...game, phase: 'burnt', stars: 0, streak: 0 }
  }

  switch (action.type) {
    case 'prep':
      if (game.practice || (game.phase !== 'front' && game.phase !== 'back') || game.prepped >= 100) return game
      return { ...game, prepped: Math.min(100, game.prepped + action.amount) }
    case 'knead': {
      if (game.phase !== 'knead') return game
      const dough = Math.min(100, game.dough + action.amount)
      return { ...game, dough, phase: dough === 100 ? 'press' : 'knead' }
    }
    case 'press-start':
      return game.phase === 'press' && game.pressAt === null
        ? { ...game, pressAt: action.now } : game
    case 'press-release': {
      if (game.phase !== 'press' || game.pressAt === null) return game
      const duration = action.now - game.pressAt
      if (duration < PRESS_MIN) return { ...game, pressAt: null }
      const leaked = duration > rules.pressEnd
      return { ...game, phase: 'front', since: action.now, pressAt: null, leaked, stars: leaked ? 0 : 1 }
    }
    case 'cancel-press':
      return game.pressAt === null ? game : { ...game, pressAt: null }
    case 'cook': {
      if ((game.phase !== 'front' && game.phase !== 'back') || elapsed < COOK_MIN) return game
      const perfect = elapsed >= rules.start && elapsed <= rules.end
      const stars = game.stars + Number(perfect)
      if (game.phase === 'back' && stars < rules.required) {
        return { ...game, phase: 'redo', since: action.now, stars, streak: 0 }
      }
      return {
        ...game, phase: game.phase === 'front' ? 'back' : 'serve',
        since: action.now, stars,
      }
    }
    case 'serve': {
      if (game.phase !== 'serve') return game
      if (game.practice) return { ...game, finished: true, lastStars: game.stars }
      const placed = game.placed + 1
      const streak = game.stars === 3 ? game.streak + 1 : 0
      const dough = game.prepped + doughBonus(game.stars, game.prepped)
      const next = { ...game, ...nextDough(dough), lastStars: game.stars, placed,
        streak, bestStreak: Math.max(streak, game.bestStreak) }
      if (placed < quantity) return next
      return {
        ...next, placed: 0, orderAt: action.now, score: game.score + quantity * UNIT_PRICE,
        servedOrders: game.servedOrders + 1,
        receipts: [...game.receipts, { outcome: 'served', elapsedMs: action.now - game.orderAt }],
      }
    }
    case 'discard':
      return game.phase === 'burnt' || game.phase === 'redo'
        ? { ...game, ...nextDough(game.prepped), lastStars: game.stars } : game
    case 'tick':
      return game
  }
}

function nextDough(prepped: number) {
  return { ...freshDough, dough: prepped, phase: prepped === 100 ? 'press' as const : 'knead' as const, prepped: 0 }
}
