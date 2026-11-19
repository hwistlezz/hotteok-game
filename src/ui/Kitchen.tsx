import { useEffect, useRef, useState, type CSSProperties, type RefObject, type PointerEvent } from 'react'
import { contactSurface, cookingRules, stirCue, type GameAction, type GameState, type Phase } from '../game/game'
import { COOK_MIN } from '../game/rules'
import { Cooktop } from './Cooktop'

const steps: Record<Phase, [title:string,hint:string,button:string,index:number]> = {
  knead:['반죽 젓기','화살표 방향으로 그릇을 저어요. 네 바퀴마다 다음 지시가 나와요.','반죽 젓기',0],
  portion:['한 덩이 떼기','왼쪽 접시의 반죽 한 덩이를 오른쪽 불판으로 옮겨요.','반죽 옮기기',1],
  press:['납작하게 꾹','길게 눌렀다가 눈금 안에서 놓아요.','누르개 길게 누르기',2],
  front:['앞면 굽기','가장자리를 보고 눈금에 맞춰 뒤집어요.','뒤집기',3],
  back:['뒷면 굽기','반대쪽도 눈금 안에 익으면 한 장을 꺼내요.','꺼내기',3],
  serve:['한 장 완성!','손님이나 봉투를 눌러 한 장을 건네요.','호떡 제출',4],
  redo:['다시 구워주세요','같은 손님에게 낼 새 반죽을 한 덩이 떼요.','다시 굽기',3],
  burnt:['호떡이 탔어요','탄 호떡을 걷어내고 같은 주문을 계속해요.','탄 호떡 버리기',3],
}
export type InputAction = GameAction extends infer A ? A extends GameAction ? Omit<A,'now'> : never : never

type Gesture = { id:number; phase:Phase; x:number; y:number; angle:number|null }
type Point = { x:number; y:number }

function stirringAngle(rect: DOMRect, point: Point) {
  const x=(point.x-rect.left)/rect.width*2-1, y=(point.y-rect.top)/rect.height*2-1
  const r=Math.hypot(x,y)
  return r>=.23 && r<=1.2 ? Math.atan2(y,x) : null
}
function inside(rect: DOMRect | undefined, point: Point) {
  return rect && point.x>=rect.left && point.x<=rect.right && point.y>=rect.top && point.y<=rect.bottom
}

export function Kitchen({keyboard,buttonRef,game,now,enabled,send}:{
  keyboard:boolean;buttonRef:RefObject<HTMLButtonElement|null>;game:GameState;now:number;enabled:boolean;send:(a:InputAction)=>void
}) {
  const orbit=useRef<HTMLSpanElement>(null), source=useRef<HTMLSpanElement>(null), target=useRef<HTMLSpanElement>(null)
  const gesture=useRef<Gesture|null>(null)
  const suppressClick=useRef(false)
  const [drag,setDrag]=useState<Point|null>(null)
  const [message,setMessage]=useState({phase:game.phase,text:'',until:0})
  const {phase}=game
  const [title,hint,button,index]=steps[phase]
  const rules=cookingRules(game)
  let instruction = hint
  if (game.redoReason === 'early-lift') instruction = '너무 일찍 들어 반죽이 찢어졌어요. 다음에는 굽기 눈금에 맞춰 들어요.'
  if (game.redoReason === 'low-rating') instruction = `별 ${game.stars}개 · ${rules.required}개가 필요해요. 새 반죽으로 다시 구워요.`
  const cue=stirCue(game)
  const turnLabel=cue.direction===1?'↻ 시계 방향':'↺ 반시계 방향'
  const cooking=phase==='front'||phase==='back'
  const held=game.pressAt!==null
  const elapsed=Math.max(0,phase==='press'?now-(game.pressAt??now):now-game.since)
  const max=phase==='press'?1700:rules.burn
  const min=phase==='press'?rules.pressStart:rules.start
  const end=phase==='press'?rules.pressEnd:rules.end
  const timed=cooking||phase==='press'
  const shortPress = phase==='press' && game.shortPress && now<game.shortPress.until ? game.shortPress : null
  const displayedElapsed = shortPress?.duration ?? elapsed
  const progress=phase==='knead'?game.turns/12*100:timed?Math.min(100,displayedElapsed/max*100):100
  const text=timed && elapsed>=min ? elapsed>end ? phase==='press'?'시럽이 새요!':'곧 타요!' :
    phase==='press'?'지금 손 떼기!':phase==='front'?'뒤집을 때!':'꺼낼 때!' : ''
  const notice=(shortPress?'조금 더 눌러요':'') || text || (now<message.until && message.phase===phase ? message.text:'')
  const contact=phase==='burnt'?{toast:1,char:1}:cooking?contactSurface(elapsed,rules):game.exposed
  const label=phase==='knead'?'젓기':phase==='press'?'누르는 힘':cooking?'굽기 정도':''
  function tip(text:string) {setMessage({phase,text,until:now+950})}
  useEffect(()=>{ if(!enabled){gesture.current=null;setDrag(null)} },[enabled])

  function activate(fromKeyboard:boolean) {
    if(phase==='knead'){ tip(fromKeyboard?'← → 키로 저어요':'그릇 가장자리를 따라 원을 그려요');return }
    if(phase==='portion'){ if(fromKeyboard)send({type:'portion'});else tip('반죽을 잡아 불판 위에 놓아요');return }
    if(cooking){if(game.practice && elapsed<COOK_MIN)tip('조금 더 구워요');send({type:'cook'})}
    if(phase==='serve')send({type:'serve'})
    if(phase==='redo'||phase==='burnt')send({type:'discard'})
  }
  function cancel(){
    gesture.current=null;setDrag(null)
    if(phase==='press')send({type:'cancel-press'})
  }
  function down(e:PointerEvent<HTMLButtonElement>){
    if(!enabled||!e.isPrimary||e.button!==0)return
    const p={x:e.clientX,y:e.clientY}
    suppressClick.current=false
    if(phase==='portion'&&!inside(source.current?.getBoundingClientRect(),p))return
    const angle=phase==='knead'&&orbit.current?stirringAngle(orbit.current.getBoundingClientRect(),p):null
    gesture.current={id:e.pointerId,phase,...p,angle}
    e.currentTarget.setPointerCapture(e.pointerId)
    if(phase==='portion')setDrag({x:0,y:0})
    if(phase==='press')send({type:'press-start'})
  }
  function move(e:PointerEvent<HTMLButtonElement>){
    const g=gesture.current
    if(!g||g.id!==e.pointerId||g.phase!==phase)return
    if(phase==='portion'){setDrag({x:e.clientX-g.x,y:e.clientY-g.y});return}
    if(phase!=='knead'||!orbit.current)return
    const angle=stirringAngle(orbit.current.getBoundingClientRect(),{x:e.clientX,y:e.clientY})
    if(angle!==null&&g.angle!==null){
      const delta=Math.atan2(Math.sin(angle-g.angle),Math.cos(angle-g.angle))
      if(Math.abs(delta)<Math.PI/2)send({type:'knead',amount:delta/(2*Math.PI)})
    }
    g.angle=angle
  }
  function up(e:PointerEvent<HTMLButtonElement>){
    const g=gesture.current
    if(!g||g.id!==e.pointerId)return
    gesture.current=null;setDrag(null)
    suppressClick.current=true
    if(g.phase!==phase)return
    if(phase==='portion'){
      if(inside(target.current?.getBoundingClientRect(),{x:e.clientX,y:e.clientY}))send({type:'portion'})
      else tip('불판 안에 놓아요')
    }else if(phase==='press')send({type:'press-release'})
    else if(phase!=='knead')activate(false)
  }

  return <section className="station" aria-labelledby="phase-title" data-paused={!enabled}
    style={{'--zone-start':min/max*100+'%','--zone-width':(end-min)/max*100+'%'} as CSSProperties}>
    <ol className="process" aria-label="조리 순서">{['젓기','떼기','누르기','굽기','건네기'].map((s,i)=>
      <li key={s} aria-current={i===index?'step':undefined} data-done={i<index}>{s}</li>)}</ol>
    <h1 id="phase-title">{title}</h1>
    <p className="hint" id="phase-hint">{instruction}</p>
    {phase==='knead'&&<span id="stir-instruction" role="status" aria-atomic="true" className="stir-instruction">
      {cue.stage+1}번째 지시, {cue.direction===1?'시계':'반시계'} 방향
    </span>}
    <button ref={buttonRef} className={'griddle-input stage--'+phase} type="button" disabled={!enabled}
      data-direction={phase==='knead'?cue.direction:undefined}
      aria-label={button} aria-describedby={phase==='knead'?'phase-hint stir-instruction':'phase-hint'} onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onPointerCancel={cancel} onLostPointerCapture={e=>{if(gesture.current?.id===e.pointerId)cancel()}}
      onBlur={cancel} onClick={e=>{if(!suppressClick.current || !e.detail)activate(e.detail===0);suppressClick.current=false}}
      onKeyDown={e=>{
        if(phase==='knead' && (e.key==='ArrowLeft' || e.key==='ArrowRight')){
          e.preventDefault()
          if(!e.repeat)send({type:'knead',amount:e.key==='ArrowRight'?.5:-.5})
          return
        }
        if(!['Enter',' '].includes(e.key))return
        e.preventDefault()
        if(e.repeat)return
        if(phase==='press')send({type:'press-start'})
        else activate(true)
      }}
      onKeyUp={e=>{
        if(!['Enter',' '].includes(e.key))return
        e.preventDefault()
        if(phase==='press')send({type:'press-release'})
      }}>
      <Cooktop phase={phase} spoonTurns={cue.within*cue.direction} direction={cue.direction} exposed={game.exposed} contact={contact} pressure={held?Math.min(1,elapsed/rules.pressEnd):0}
        drag={drag} orbit={orbit} source={source} target={target}/>
      {notice&&<span className="signal" role="status">{notice}</span>}
      {phase==='serve'&&<span className="signal stars">{'★'.repeat(game.stars)}{'☆'.repeat(3-game.stars)}</span>}
      <span key={phase==='knead'?cue.stage:phase} className="action-label">{phase==='knead'?`${turnLabel} · ${4-Math.floor(cue.within)}바퀴 남음`:phase==='portion'?'반죽 → 불판':button}</span>
    </button>
    {label&&<><div className="meter-label"><span>{label}</span><b>{cooking?'▧ '+rules.label:phase==='press'?'▧ 알맞은 구간':`지시 ${cue.stage+1}/3`}</b></div>
    <div className="gauge" role="progressbar" aria-label={label} aria-valuenow={Math.round(progress)}>
      <i className="gauge-fill" style={{transform:`scaleX(${progress/100})`}}/>{timed&&<i className="zone"/>}
      <i className="needle" style={{left:progress+'%'}}/></div></>}
    <div className="quality" role="status">{cooking?`이번 호떡 ★ ${game.stars}/3${game.leaked?' · 시럽이 샜어요':''}`:
      phase==='knead'?(keyboard?'키보드 · ← 반시계 / → 시계 (½바퀴)':'그릇 가장자리를 따라 원을 그려요'):
      phase==='portion'?(keyboard?'키보드 · Space로 한 덩이 옮기기':'반죽 한 덩이를 불판으로 끌어 놓아요'):''}</div>
  </section>
}
