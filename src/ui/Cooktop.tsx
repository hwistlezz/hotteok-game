import type { CSSProperties, RefObject } from 'react'
import type { GameState, Phase } from '../game/game'

type Props = {
  phase: Phase; spoonTurns: number; direction: number; exposed: GameState['exposed']; contact: GameState['exposed']; pressure: number
  orbit: RefObject<HTMLSpanElement | null>; source: RefObject<HTMLSpanElement | null>
  target: RefObject<HTMLSpanElement | null>; drag: { x: number; y: number } | null
}

export function Cooktop({ phase, spoonTurns, direction, exposed, contact, pressure, orbit, source, target, drag }: Props) {
  const mixing = phase === 'knead'
  const placing = phase === 'portion'
  const cooking = phase === 'front' || phase === 'back'
  const serving = phase === 'serve'
  const style = {
    '--spoon-angle': (spoonTurns*360-25)+'deg', '--heat': exposed.toast, '--char': exposed.char,
    '--edge-heat': contact.toast, '--edge-char': contact.char,
    '--press-y': pressure, '--drag-x': (drag?.x ?? 0)+'px', '--drag-y': (drag?.y ?? 0)+'px',
  } as CSSProperties
  return <span className={'cooktop cooktop-'+phase} data-dragging={Boolean(drag)} style={style} aria-hidden="true">
    <i className="stall-shade"/><i className="board-grain"/>
    <span className="prop-group"><i className="sugar-jar"/><i className="sugar-jar spice-jar"/></span>
    {mixing && <span className="mix-bowl" ref={orbit}>
      <i className="bowl-rim"/><i className="batter"><i className="batter-swirl"/></i>
      <i className="orbit-guide">{direction===1?'↻':'↺'}</i><i className="spoon-orbit"><i className="wood-spoon"/></i>
    </span>}
    {!mixing && !serving && <span className="hob" ref={target}>
      <img className="stove-base" src="/kitchen/stove.webp" draggable={false} alt=""/>
      <i className="pan-handle"/><i className="iron-pan"/>
      {placing && <i className="drop-ring"/>}
      {!placing && <span className="cake-position"><span key={phase === 'back' ? 'back' : 'front'} className="cake-flight">
        <i className="cake"><i className="contact-rim"/><i className="cake-toast"/><i className="cake-char"/></i>
      </span></span>}
      {phase === 'press' && <i className="press-iron"><i/></i>}
      {(cooking || phase==='burnt') && <i className="pan-steam"><i/><i/><i/></i>}
    </span>}
    {placing && <>
      <span className="portion-plate"><img src="/kitchen/plate.webp" draggable={false} alt=""/></span>
      <span className="portion-ball" ref={source}><i/></span>
      {!drag && <i className="carry-arrow">⤴</i>}
    </>}
    {serving && <span className="service-sleeve"><i className="wrapped-cake"><i className="cake-toast"/><i className="cake-char"/></i><i className="paper-wrap"><b>호떡</b></i></span>}
  </span>
}
