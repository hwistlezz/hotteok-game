import {
  COOK_BURN, COOK_IDEAL_END, COOK_MIN, orderLimit, orderQuantity,
  PRESS_IDEAL_END, PRESS_MIN, STARTING_HEARTS, UNIT_PRICE, type Receipt,
} from './rules'

export type Phase = 'knead' | 'press' | 'front' | 'back' | 'serve' | 'burnt'
export type GameState = {
  practice: boolean
  phase: Phase
  dough: number
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
  { type: 'knead'; amount: number } |
  { type: 'tick' | 'press-start' | 'press-release' | 'cancel-press' | 'cook' | 'serve' | 'discard' }
)

const freshDough = {
  phase: 'knead' as const,
  dough: 0,
  pressAt: null,
  stars: 0,
  leaked: false,
}

export function newGame(practice: boolean): GameState {
  return {
    ...freshDough, practice, since: 0, lastStars: null, placed: 0,
    hearts: STARTING_HEARTS, score: 0, servedOrders: 0, orderAt: 0,
    receipts: [], finished: false,
  }
}

function expireOrder(game: GameState, now: number, limit: number): GameState {
  const hearts = game.hearts - 1
  return {
    ...game, ...freshDough, since: now, hearts, orderAt: now,
    placed: 0, lastStars: null, finished: hearts === 0,
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
  if ((game.phase === 'front' || game.phase === 'back') && elapsed >= COOK_BURN) {
    // Apply the burn before interpreting a late flip or removal.
    return { ...game, phase: 'burnt', stars: 0 }
  }

  switch (action.type) {
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
      const leaked = duration > PRESS_IDEAL_END
      return { ...game, phase: 'front', since: action.now, pressAt: null, leaked, stars: leaked ? 0 : 1 }
    }
    case 'cancel-press':
      return game.pressAt === null ? game : { ...game, pressAt: null }
    case 'cook':
      if ((game.phase !== 'front' && game.phase !== 'back') || elapsed < COOK_MIN) return game
      return {
        ...game, phase: game.phase === 'front' ? 'back' : 'serve',
        since: action.now, stars: game.stars + Number(elapsed <= COOK_IDEAL_END),
      }
    case 'serve': {
      if (game.phase !== 'serve') return game
      if (game.practice) return { ...game, finished: true, lastStars: game.stars }
      const placed = game.placed + 1
      const next = { ...game, ...freshDough, lastStars: game.stars, placed }
      if (placed < quantity) return next
      return {
        ...next, placed: 0, orderAt: action.now, score: game.score + quantity * UNIT_PRICE,
        servedOrders: game.servedOrders + 1,
        receipts: [...game.receipts, { outcome: 'served', elapsedMs: action.now - game.orderAt }],
      }
    }
    case 'discard':
      return game.phase === 'burnt' ? { ...game, ...freshDough, lastStars: 0 } : game
    case 'tick':
      return game
  }
}
