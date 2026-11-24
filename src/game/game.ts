import {
  COOK_BURN, COOK_IDEAL_END, COOK_MIN, orderLimit, orderQuantity,
  PRESS_IDEAL_END, PRESS_MIN, STARTING_HEARTS, UNIT_PRICE, type Receipt,
} from './rules'

export type Phase = 'knead' | 'portion' | 'press' | 'front' | 'back' | 'serve' | 'burnt' | 'redo'
export type GameState = {
  practice: boolean
  phase: Phase
  seed: number
  turns: number
  exposed: Surface
  prepped: number
  folded: boolean
  streak: number
  bestStreak: number
  since: number
  shortPress: { duration: number; until: number } | null
  pressAt: number | null
  redoReason: null | 'early-lift' | 'low-rating'
  leaked: boolean
  stars: number
  lastStars: number | null
  deliveredAt: number | null
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
  { type: 'tick' | 'prep' | 'portion' | 'press-start' | 'press-release' | 'cancel-press' | 'cook' | 'serve' | 'discard' }
)

const freshDough = {
  phase: 'knead' as const,
  turns: 0,
  exposed: { toast: 0, char: 0 },
  shortPress: null,
  pressAt: null,
  stars: 0,
  redoReason: null,
  leaked: false,
  folded: false,
}

type Surface = { toast: number; char: number }

// A batch has three four-turn cues. Masks 1–6 all contain both directions.
export function stirCue(game: GameState) {
  let hash = Math.imul(game.seed ^ game.receipts.length, 0x45d9f3b)
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
  const mask = 1 + ((hash ^ (hash >>> 16)) >>> 0) % 6
  const stage = Math.min(2, Math.floor(game.turns / 4))
  const direction = mask & (1 << stage) ? 1 : -1
  const changed = stage > 0 && ((mask >> stage) & 1) !== ((mask >> (stage-1)) & 1)
  return { stage, direction, changed, within: game.turns - 4 * stage }
}

export function contactSurface(elapsed: number, rules: ReturnType<typeof cookingRules>): Surface {
  const toast = Math.max(0, Math.min(1, elapsed / rules.start * .85))
  const char = Math.max(0, Math.min(1, (elapsed - rules.end) / (rules.burn - rules.end)))
  return { toast, char }
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
  { label: '첫 영업', required: 2, window: 320, grace: 650, pressWindow: 180 },
  { label: '손님 몰림', required: 3, window: 220, grace: 430, pressWindow: 140 },
  { label: '피크 타임', required: 3, window: 150, grace: 320, pressWindow: 100 },
]

export function cookingRules(game: GameState) {
  const taste = cookTarget(game.receipts.length)
  if (game.practice) return { ...taste, shift: '연습', required: 0, pressStart: PRESS_MIN, pressEnd: PRESS_IDEAL_END, burn: COOK_BURN }
  const shift = shifts[Math.min(game.servedOrders, shifts.length - 1)]
  // Alternate the hot spot by batch and side. Both the gauge and the judge use this clock.
  const offset = game.servedOrders > 0 && (game.placed + Number(game.phase === 'back')) % 2 === 1 ? 250 : 0
  const start = taste.start + offset
  const end = start + Math.min(shift.window, taste.end - taste.start)
  const pressStart = 840 + (game.servedOrders ? (game.placed + game.receipts.length) % 3 * 120 : 0)
  return { label: taste.label, start, end, shift: shift.label, required: shift.required,
    pressStart, pressEnd: pressStart + shift.pressWindow, burn: Math.min(COOK_BURN, end + shift.grace) }
}

export function doughBonus(stars: number, prepped: number) {
  return stars === 3 ? Math.min(1, 2 - prepped) : 0
}

export function newGame(practice: boolean, seed = 0): GameState {
  return {
    ...freshDough, practice, seed, since: 0, lastStars: null, deliveredAt: null, placed: 0, prepped: 0, streak: 0, bestStreak: 0,
    hearts: STARTING_HEARTS, score: 0, servedOrders: 0, orderAt: 0,
    receipts: [], finished: false,
  }
}

function expireOrder(game: GameState, now: number, limit: number): GameState {
  const hearts = game.hearts - 1
  return {
    ...game, ...freshDough, since: now, hearts, orderAt: now,
    placed: 0, lastStars: null, deliveredAt: null, prepped: 0, streak: 0, finished: hearts === 0,
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
      if (game.practice || game.folded || (game.phase !== 'front' && game.phase !== 'back') || game.prepped >= 2) return game
      return { ...game, folded: true, prepped: Math.min(2, game.prepped + 1) }
    case 'knead': {
      if (game.phase !== 'knead') return game
      const { stage, direction } = stirCue(game)
      const start = stage * 4
      const end = start + 4
      const advanced = Math.max(start, game.turns + direction * action.amount)
      const turns = advanced >= end - 1e-7 ? end : advanced
      return { ...game, turns, phase: turns === 12 ? 'portion' : 'knead' }
    }
    case 'portion':
      return game.phase === 'portion' ? { ...game, phase: 'press', since: action.now } : game
    case 'press-start':
      return game.phase === 'press' && game.pressAt === null
        ? { ...game, pressAt: action.now, shortPress: null } : game
    case 'press-release': {
      if (game.phase !== 'press' || game.pressAt === null) return game
      const duration = action.now - game.pressAt
      if (duration < PRESS_MIN) return { ...game, pressAt: null, shortPress: { duration, until: action.now + 900 } }
      const leaked = duration > rules.pressEnd
      return { ...game, phase: 'front', since: action.now, pressAt: null, leaked, stars: Number(!leaked && duration >= rules.pressStart) }
    }
    case 'cancel-press':
      return game.pressAt === null ? game : { ...game, pressAt: null }
    case 'cook': {
      if (game.phase !== 'front' && game.phase !== 'back') return game
      const exposed = contactSurface(elapsed, rules)
      if (elapsed < COOK_MIN) {
        // A committed early lift tears the pancake. Ignore a release from the preceding gesture.
        return !game.practice && elapsed >= 450
          ? { ...game, exposed, phase: 'redo', redoReason: 'early-lift', stars: 0, streak: 0, since: action.now } : game
      }
      const perfect = elapsed >= rules.start && elapsed <= rules.end
      const stars = game.stars + Number(perfect)
      if (game.phase === 'back' && stars < rules.required) {
        return { ...game, exposed, phase: 'redo', redoReason: 'low-rating', since: action.now, stars, streak: 0 }
      }
      return {
        ...game, exposed, phase: game.phase === 'front' ? 'back' : 'serve',
        since: action.now, stars, folded: false,
      }
    }
    case 'serve': {
      if (game.phase !== 'serve') return game
      if (game.practice) return { ...game, finished: true, lastStars: game.stars }
      const placed = game.placed + 1
      const streak = game.stars === 3 ? game.streak + 1 : 0
      const dough = game.prepped + doughBonus(game.stars, game.prepped)
      const next = { ...game, ...nextDough(dough), lastStars: game.stars, deliveredAt: action.now, placed,
        streak, bestStreak: Math.max(streak, game.bestStreak) }
      if (placed < quantity) return { ...next, phase: 'portion', turns: 12, prepped: game.prepped }
      return {
        ...next, placed: 0, orderAt: action.now, score: game.score + quantity * UNIT_PRICE,
        servedOrders: game.servedOrders + 1,
        receipts: [...game.receipts, { outcome: 'served', elapsedMs: action.now - game.orderAt }],
      }
    }
    case 'discard':
      return game.phase === 'burnt' || game.phase === 'redo'
        ? { ...game, ...freshDough, phase: 'portion', turns: 12, lastStars: game.stars } : game
    case 'tick':
      return game
  }
}

function nextDough(prepped: number) {
  return { ...freshDough, turns: prepped, prepped: 0 }
}
