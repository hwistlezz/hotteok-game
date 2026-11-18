// The still life is used on the title and closing screens.
export function KitchenScene({ scene }: { scene: 'finished' | 'burnt' }) {
  return <span className={'kitchen-scene scene-'+scene} aria-hidden="true">
    <span className="scene-plane">
      <img className="scene-piece still-plate" src="/kitchen/plate.webp" alt=""/>
      <img className="scene-piece still-food" src={'/kitchen/'+scene+'.webp'} alt=""/>
    </span>
  </span>
}
