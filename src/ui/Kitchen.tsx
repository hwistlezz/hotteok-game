import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { GameAction, GameState, Phase } from '../game/game'
import { cookTarget, doughBonus } from '../game/game'
import { COOK_BURN, COOK_MIN, PRESS_IDEAL_END, PRESS_MIN } from '../game/rules'
import { MarketArt } from './MarketArt'

const steps: Record<Phase, { title: string; hint: string; button: string; index: number }> = {
  knead: { title: '반죽 동그랗게', hint: '반죽을 좌우로 문질러요. 여러 번 톡톡 눌러도 돼요.', button: '반죽 둥글리기', index: 0 },
  press: { title: '납작하게 꾹', hint: '꾹 누르고 있다가 눈금 안에서 손을 떼요.', button: '누르개 길게 누르기', index: 1 },
  front: { title: '앞면 굽기', hint: '노릇해지면 톡 누르거나 위로 밀어 뒤집어요.', button: '뒤집기', index: 2 },
  back: { title: '뒷면 굽기', hint: '눈금 안에서 꺼내면 가장 맛있어요.', button: '꺼내기', index: 2 },
  serve: { title: '호떡 완성!', hint: '호떡을 톡 눌러 손님에게 건네요.', button: '호떡 제출', index: 3 },
  burnt: { title: '호떡이 탔어요', hint: '탄 호떡을 걷어내고 다시 구워요.', button: '탄 호떡 버리기', index: 2 },
}
export type InputAction = GameAction extends infer Action
  ? Action extends GameAction ? Omit<Action, 'now'> : never
  : never

export function Kitchen({ game, now, enabled, send }: {
  game: GameState; now: number; enabled: boolean; send: (action: InputAction) => void
}) {
  const pointer = useRef<{ id: number; x: number; y: number; startY: number; phase: Phase } | null>(null)
  const ignoreClick = useRef(false)
  const [miss, setMiss] = useState({ text: '', until: 0, phase: game.phase })
  const { phase } = game
  useEffect(() => { if (!enabled) pointer.current = null }, [enabled])
  const step = steps[phase]
  const cooking = phase === 'front' || phase === 'back'
  const elapsed = Math.max(0, phase === 'press' ? now - (game.pressAt ?? now) : now - game.since)
  const max = phase === 'press' ? 1700 : COOK_BURN
  const target = cookTarget(game.receipts.length)
  const min = phase === 'press' ? PRESS_MIN : target.start
  const idealEnd = phase === 'press' ? PRESS_IDEAL_END : target.end
  const timed = cooking || phase === 'press'
  const inZone = timed && elapsed >= min && elapsed <= idealEnd
  const late = timed && elapsed > idealEnd
  const progress = phase === 'knead' ? game.dough : timed ? Math.min(100, elapsed / max * 100) : 100
  const signal = inZone ? phase === 'press' ? '지금 손 떼기!' : phase === 'front' ? '지금 뒤집기!' : '지금 꺼내기!'
    : late ? phase === 'press' ? '시럽이 새요!' : '곧 타요!' : ''
  const feedback = signal || (miss.phase === phase && now < miss.until ? miss.text : '')
  const held = game.pressAt !== null
  const bonus = doughBonus(game.stars, game.prepped)
  const hint = phase==='serve' && !game.practice && bonus>0
    ? `별 셋! 건네면 다음 반죽이 ${bonus}% 더 준비돼요.` : step.hint
  const heat = cooking ? Math.min(1,elapsed/target.start) : phase === 'serve' ? 1 : 0
  const stageStyle = {
    '--heat': heat, '--toast-shade': cooking ? Math.max(.58,1-Math.max(0,elapsed-COOK_MIN)/(COOK_BURN-COOK_MIN)*.42) : 1,
    '--zone-start': min / max * 100 + '%', '--zone-width': (idealEnd-min) / max * 100 + '%',
    '--flatten': held ? 1 + Math.min(elapsed/1200,1)*.28 : 1,
    '--squash': held ? 1 - Math.min(elapsed/1200,1)*.33 : 1,
    '--knead-size': phase === 'knead' ? .72 + game.dough * .0028 : 1,
    '--knead-turn': phase === 'knead' ? Math.sin(game.dough*.26)*12+'deg' : '0deg',
  } as CSSProperties

  function activate() {
    if (phase === 'knead') send({ type: 'knead', amount: 14 })
    if (cooking) {
      if (elapsed < COOK_MIN) setMiss({ phase, until: now+700, text: '조금 더 구워요' })
      send({ type: 'cook' })
    }
    if (phase === 'serve') send({ type: 'serve' })
    if (phase === 'burnt') send({ type: 'discard' })
  }
  function releasePress() {
    if (held && elapsed < PRESS_MIN) setMiss({ phase, until: now+850, text: '조금 더 길게 꾹!' })
    send({ type: 'press-release' })
  }
  function cancel() {
    pointer.current = null
    if (phase === 'press') send({ type: 'cancel-press' })
  }

  return <section className="station" aria-labelledby="phase-title" style={stageStyle} data-paused={!enabled}>
    <ol className="process" aria-label="조리 순서">
      {['반죽', '누르기', '굽기', '포장'].map((label,i) =>
        <li key={label} aria-current={step.index===i?'step':undefined} data-done={i<step.index}>{label}</li>)}
    </ol>
    <h1 id="phase-title">{step.title}</h1>
    <p className="hint" id="phase-hint">{hint}</p>
    <button type="button" className={'griddle-input stage--'+phase} aria-label={step.button}
      aria-describedby="phase-hint" disabled={!enabled}
      onClick={e => {
        if (e.detail && ignoreClick.current) { ignoreClick.current = false; return }
        activate()
      }}
      onPointerDown={e => {
        if (e.button !== 0 || !e.isPrimary) return
        ignoreClick.current = false
        pointer.current = { id:e.pointerId, x:e.clientX, y:e.clientY, startY:e.clientY, phase }
        e.currentTarget.setPointerCapture(e.pointerId)
        if (phase === 'press') send({ type:'press-start' })
      }}
      onPointerMove={e => {
        const last = pointer.current
        if (!last || last.id !== e.pointerId || last.phase !== 'knead' || phase !== 'knead') return
        const distance = Math.hypot(e.clientX-last.x,e.clientY-last.y)
        if (distance < 2) return
        last.x = e.clientX; last.y = e.clientY
        send({ type:'knead', amount:Math.min(20,distance/2) })
      }}
      onPointerUp={e => {
        const last = pointer.current
        if (!last || last.id !== e.pointerId) return
        pointer.current = null
        if (last.phase !== phase) { ignoreClick.current = true; return }
        if (phase === 'press') { ignoreClick.current = true; releasePress() }
        if (cooking && last.startY-e.clientY >= 25) { ignoreClick.current = true; activate() }
      }}
      onPointerCancel={cancel} onLostPointerCapture={e => { if (pointer.current?.id===e.pointerId) cancel() }}
      onKeyDown={e => {
        if (phase !== 'press' || ![' ','Enter'].includes(e.key)) return
        e.preventDefault()
        if (!e.repeat) send({ type:'press-start' })
      }}
      onKeyUp={e => {
        if (phase !== 'press' || ![' ','Enter'].includes(e.key)) return
        e.preventDefault(); releasePress()
      }} onBlur={cancel}>
      <span className="work-surface" aria-hidden="true">
        <MarketArt motif={phase==='knead'||phase==='press'?'board':'pan'} className="grill-art" />
        <span key={phase} className="food-flight"><span className="food">
          <MarketArt motif={phase==='burnt'?'burnt':'raw'} />
          {phase!=='burnt' && <MarketArt motif="pancake" className="toasted" />}
        </span></span>
        {held && <i className="iron" />}
        {phase==='press' && !held && <i className="sugar" />}
        {phase==='serve' && <i className="sleeve" />}
        {phase==='back' && <i className="spatula" />}
        {game.leaked && <i className="syrup" />}
        {cooking && <span className="steam"><i/><i/><i/></span>}
      </span>
      {feedback && <span className={'signal'+(late?' late':'')} role="status">{feedback}</span>}
      {phase==='serve' && <span className="signal stars" aria-label={`별 ${game.stars}개`}>{'★'.repeat(game.stars)}{'☆'.repeat(3-game.stars)}</span>}
      <span className="action-label">{step.button}</span>
    </button>
    <div className="meter-label"><span>{phase==='knead'?'반죽 모양':phase==='press'?'누르는 힘':cooking?'굽기 정도':'조리 결과'}</span>
      <b>{cooking ? '▧ '+target.label : timed ? '▧ 알맞은 구간' : phase==='knead' ? Math.round(progress)+'%' : phase==='burnt'?'탔어요':'포장 준비 완료'}</b></div>
    <div className="gauge" role="progressbar" aria-label={phase==='knead'?'반죽 진행':'조리 진행'} aria-valuenow={Math.round(progress)}>
      <i className="gauge-fill" style={{ transform:`scaleX(${progress/100})` }} />
      {timed && <i className="zone"/>}<i className="needle" style={{left:progress+'%'}}/>
    </div>
    <div className="quality" role="status">{game.lastStars!==null && (game.streak>0 ? `★ 별 셋 연속 ${game.streak}장` : `지난 호떡  ★ ${game.lastStars}/3`)}</div>
  </section>
}
