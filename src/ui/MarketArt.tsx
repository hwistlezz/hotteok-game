import { memo, useLayoutEffect, useRef } from 'react'

type Drawing = CanvasRenderingContext2D
const ink = '#352d38'
const teal = '#27645d'
function box(c: Drawing, x: number, y: number, w: number, h: number, color: string) {
  c.fillStyle = color
  c.fillRect(x, y, w, h)
}
// Horizontal pixel runs keep the edges crisp at every sprite size.
function oval(c: Drawing, x: number, y: number, rx: number, ry: number, color: string) {
  for (let row = -ry; row <= ry; row++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (row / (ry + .4)) ** 2)))
    box(c, x - half, y + row, half * 2 + 1, 1, color)
  }
}
function pancake(c: Drawing, x: number, y: number, r: number, raw = false, burnt = false) {
  const ry = Math.round(r * .65)
  oval(c,x,y+3,r+1,ry+1,ink)
  oval(c,x,y+2,r,ry,burnt ? '#4c3836' : '#af602f')
  oval(c,x,y-1,r,ry,burnt ? '#715347' : raw ? '#f2d7a2' : '#edac48')
  oval(c,x-1,y-3,r-2,ry-2,burnt ? '#594039' : raw ? '#ffedc2' : '#ffd57b')
  if (raw) {
    box(c,x-Math.floor(r/2),y-Math.floor(ry/2),Math.ceil(r/4),2,'#fff6d9')
    box(c,x+3,y+3,Math.ceil(r/3),1,'#f1d7a4')
    return
  }
  for (const [dx,dy,sz] of [[-.5,-.18,.21],[.2,.22,.23],[.47,-.24,.13],[-.2,.38,.13],[-.05,-.51,.12]]) {
    const spotX = x+Math.round(r*dx), spotY = y+Math.round(ry*dy)-2
    oval(c,spotX,spotY,Math.max(1,Math.round(r*sz)),Math.max(1,Math.round(ry*sz*.6)),burnt ? '#362f32' : '#cf843c')
    box(c,spotX,spotY-2,Math.ceil(r*sz),2,burnt ? '#443337' : '#e7a551')
  }
}
function bear(c: Drawing, x: number, y: number) {
  c.save(); c.translate(x,y)
  oval(c,0,25,25,22,ink); oval(c,0,24,22,20,'#dd8750')
  box(c,-13,14,27,26,teal); box(c,-8,25,16,8,'#71a68a')
  for (const dx of [-17,17]) {
    oval(c,dx,-13,8,8,ink); oval(c,dx,-13,6,6,'#f0c28c'); oval(c,dx,-13,3,3,'#c07f61')
  }
  oval(c,0,-1,24,19,ink); oval(c,0,-1,22,17,'#f2cb95')
  oval(c,-2,-5,19,12,'#ffe1ac')
  box(c,-11,-5,3,4,ink); box(c,9,-5,3,4,ink)
  oval(c,0,4,9,6,'#fff2ce'); box(c,-2,0,5,3,ink); box(c,0,3,1,3,ink)
  box(c,-14,2,4,2,'#da907c'); box(c,13,2,4,2,'#da907c')
  box(c,-19,13,38,5,'#98433c'); box(c,-18,13,35,2,'#e76d49'); box(c,8,15,6,11,'#ae4436')
  oval(c,-4,-22,15,6,'#874235'); box(c,-22,-22,32,5,'#cb533c'); box(c,-19,-22,24,2,'#f19258')
  c.restore()
}

export const MarketArt = memo(function MarketArt({ motif }: { motif: 'pancake' | 'bear' }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [w,h] = motif === 'bear' ? [58,74] : [84,68]
  useLayoutEffect(() => {
    const c = ref.current?.getContext('2d')
    if (!c) return
    c.clearRect(0,0,w,h)
    if (motif === 'bear') bear(c,29,30)
    else pancake(c,42,34,33)
  }, [motif,w,h])
  return <canvas className="market-art" ref={ref} width={w} height={h} aria-hidden="true" />
})
