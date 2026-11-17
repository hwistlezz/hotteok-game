import { useEffect, useRef } from 'react'
import type { GameAction, GameState, Phase } from '../game/game'
import { COOK_BURN, COOK_IDEAL_END, COOK_MIN, PRESS_IDEAL_END, PRESS_MIN } from '../game/rules'

const steps: Record<Phase, { title: string; hint: string; button: string; index: number }> = {
  knead: { title: '반죽 동그랗게', hint: '반죽을 문지르거나 버튼을 여러 번 눌러요.', button: '반죽 둥글리기', index: 0 },
  press: { title: '납작하게 꾹', hint: '게이지가 노란 구간에 들어오면 손을 떼요.', button: '누르개 길게 누르기', index: 1 },
  front: { title: '앞면 굽기', hint: '호떡이 노릇해지면 뒤집어요.', button: '뒤집기', index: 2 },
  back: { title: '뒷면 굽기', hint: '뒷면도 노릇해지면 꺼내요.', button: '꺼내기', index: 2 },
  serve: { title: '호떡 완성!', hint: '구운 호떡을 주문에 담아요.', button: '호떡 제출', index: 3 },
  burnt: { title: '호떡이 탔어요', hint: '탄 호떡을 버리고 새 반죽으로 시작해요.', button: '탄 호떡 버리기', index: 2 },
}

type Appearance = 'raw' | 'golden' | 'done' | 'charred'

export function Griddle({ appearance, pressing = false, leaked = false, sugar = false, doughScale = 1 }: {
  appearance: Appearance; pressing?: boolean; leaked?: boolean; sugar?: boolean; doughScale?: number
}) {
  return (
    <div className={`stove stove--${appearance}${pressing ? ' stove--pressed' : ''}`} aria-hidden="true">
      <div className="burner">
        <div className="griddle">
          <div className="dough" style={{ scale: doughScale }}>
            <i /><i /><i /><i />
          </div>
          {sugar && <span className="sugar" />}
          {leaked && <div className="syrup" />}
        </div>
        <div className="handle" />
        <div className="steam"><i /><i /><i /></div>
        {pressing && <div className="press-tool" />}
      </div>
    </div>
  )
}

export type InputAction = GameAction extends infer Action
  ? Action extends GameAction ? Omit<Action, 'now'> : never
  : never

export function Kitchen({ game, now, enabled, send }: {
  game: GameState; now: number; enabled: boolean; send: (action: InputAction) => void
}) {
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null)
  useEffect(() => { if (!enabled) pointer.current = null }, [enabled])
  const { phase } = game
  const step = steps[phase]
  const cooking = phase === 'front' || phase === 'back'
  const elapsed = phase === 'press'
    ? game.pressAt === null ? 0 : now - game.pressAt
    : now - game.since
  const progress = phase === 'knead' ? game.dough
    : phase === 'press' ? elapsed / 17
    : cooking ? elapsed / (COOK_BURN / 100) : 100
  const appearance = phase === 'burnt' ? 'charred' : phase === 'serve' ? 'done'
    : phase === 'back' || (cooking && elapsed >= COOK_MIN) ? 'golden' : 'raw'
  const instructions = phase === 'press' && game.pressAt !== null
    ? elapsed > PRESS_IDEAL_END ? '시럽이 샐 수 있어요. 이제 손을 떼세요.'
      : elapsed >= PRESS_MIN ? '지금 손을 떼세요!' : '조금 더 길게 누르세요.'
    : cooking && elapsed > COOK_IDEAL_END ? '타기 전에 서둘러요!'
      : cooking && elapsed >= COOK_MIN ? `지금 ${step.button === '뒤집기' ? '뒤집어요' : '꺼내요'}!` : step.hint

  function activate() {
    if (phase === 'knead') send({ type: 'knead', amount: 14 })
    if (cooking) send({ type: 'cook' })
    if (phase === 'serve') send({ type: 'serve' })
    if (phase === 'burnt') send({ type: 'discard' })
  }

  function cancel() {
    pointer.current = null
    if (phase === 'press') send({ type: 'cancel-press' })
  }

  return (
    <section className="station" aria-labelledby="phase-title">
      <ol className="process" aria-label="조리 순서">
        {['반죽', '누르기', '굽기', '제출'].map((label, index) =>
          <li key={label} aria-current={step.index === index ? 'step' : undefined}>{label}</li>,
        )}
      </ol>
      <h1 id="phase-title">{step.title}</h1>
      <p className="hint" id="phase-hint">{instructions}</p>
      <div className="counter">
        <button
          type="button"
          className={`griddle-input griddle-input--${phase}`}
          disabled={!enabled}
          aria-label={step.button}
          aria-describedby="phase-hint"
          onClick={activate}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary || (phase !== 'press' && phase !== 'knead')) return
            pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
            event.currentTarget.setPointerCapture(event.pointerId)
            if (phase === 'press') send({ type: 'press-start' })
          }}
          onPointerMove={(event) => {
            const last = pointer.current
            if (!last || last.id !== event.pointerId || phase !== 'knead') return
            const distance = Math.hypot(event.clientX - last.x, event.clientY - last.y)
            if (distance < 2) return
            pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
            send({ type: 'knead', amount: Math.min(16, distance / 3) })
          }}
          onPointerUp={(event) => {
            if (pointer.current?.id !== event.pointerId) return
            pointer.current = null
            if (phase === 'press') send({ type: 'press-release' })
          }}
          onPointerCancel={cancel}
          onLostPointerCapture={(event) => {
            if (pointer.current?.id === event.pointerId) cancel()
          }}
          onKeyDown={(event) => {
            if (phase !== 'press' || ![' ', 'Enter'].includes(event.key)) return
            event.preventDefault()
            if (!event.repeat) send({ type: 'press-start' })
          }}
          onKeyUp={(event) => {
            if (phase !== 'press' || ![' ', 'Enter'].includes(event.key)) return
            event.preventDefault()
            send({ type: 'press-release' })
          }}
          onBlur={cancel}
        >
          <Griddle
            appearance={appearance}
            pressing={game.pressAt !== null}
            leaked={game.leaked}
            sugar={phase === 'press'}
            doughScale={phase === 'knead' ? 0.72 + game.dough * 0.0028 : 1}
          />
          <span className="action-label">{step.button}</span>
        </button>
      </div>
      <div
        className={`gauge gauge--${phase}`}
        role="progressbar"
        aria-label={phase === 'knead' ? '반죽 진행' : '조리 진행'}
        aria-valuenow={Math.round(Math.min(100, progress))}
      >
        <div className="gauge-fill" style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
      <div className="quality" role="status">
        {game.lastStars !== null && `지난 호떡 ${game.lastStars} / 3 ★`}
      </div>
    </section>
  )
}
