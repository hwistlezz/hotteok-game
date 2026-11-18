import type { GameState } from '../game/game'

type Scene = 'mix' | 'shape' | 'press' | 'raw' | 'golden' | 'finished' | 'burnt'
type Art = 'plate' | 'bowl' | 'dough' | 'stove' | 'press-pan' | 'raw-pan' | 'golden-pan' | 'finished' | 'burnt' | 'clap'

// Coordinates are in the 393-unit design frame. Show the working area below the phone header.
const frameWidth = 393
const sceneTop = 237
const sceneHeight = 529

function piece(art: Art, x: number, y: number, width: number, className = '') {
  return <img src={'/kitchen/'+art+'.webp'} alt="" draggable={false} className={'scene-piece '+className}
    style={{ left: x/frameWidth*100+'%', top: (y-sceneTop)/sceneHeight*100+'%', width: width/frameWidth*100+'%' }} />
}

export function sceneFor(game: GameState): Scene {
  switch (game.phase) {
    case 'knead': return game.dough < 42 ? 'mix' : 'shape'
    case 'press': return game.pressAt === null ? 'press' : 'raw'
    case 'front': return 'raw'
    case 'back': return 'golden'
    case 'serve': return 'finished'
    case 'redo': return 'golden'
    case 'burnt': return 'burnt'
  }
}

export function KitchenScene({ scene, pressing = false, turning = false, progress = 0 }: {
  scene: Scene; pressing?: boolean; turning?: boolean; progress?: number
}) {
  const onStove = scene === 'press' || scene === 'raw' || scene === 'golden'
  const plated = scene === 'finished' || scene === 'burnt'
  return <span className={'kitchen-scene scene-'+scene} aria-hidden="true">
    <span className="scene-plane">
      {scene === 'mix' && piece('bowl',1,356,394,'mixing-bowl')}
      {scene === 'shape' && <>{piece('plate',-42,325,480)}{piece('dough',-11,340,416,'soft-dough')}</>}
      {onStove && <>
        {piece('stove',-85,398,564)}
        {scene === 'press' && piece('press-pan',40,344,332)}
        {scene === 'raw' && piece('raw-pan',34,349,331,pressing ? 'pressing-pan' : '')}
        {scene === 'raw' && !pressing && <span style={{opacity:progress}}>{piece('golden-pan',45,348,323)}</span>}
        {scene === 'golden' && piece('golden-pan',45,348,323,turning ? 'turning-pan' : '')}
      </>}
      {plated && piece('plate',-42,335,480)}
      {scene === 'finished' && <>{piece('finished',-32,296,446,'fresh-hot')}
        {piece('clap',4,293,144,'clap-left')}{piece('clap',250,223,144,'clap-right')}</>}
      {scene === 'burnt' && piece('burnt',-27,315,446)}
    </span>
  </span>
}
