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

function grill(c: Drawing, x: number, y: number, rx: number) {
  const h = Math.round(rx * .32)
  oval(c,x,y+9,rx+1,h+1,ink)
  oval(c,x,y+7,rx,h,'#526460')
  oval(c,x,y+3,rx,h,ink)
  oval(c,x,y,rx,h,'#a6b7a0')
  oval(c,x,y,rx-3,h-2,'#343e40')
  oval(c,x,y-1,rx-8,h-4,'#465353')
  box(c,x-rx+11,y+3,8,1,'#718078'); box(c,x+rx-24,y-3,12,1,'#718078')
}

function market(c: Drawing) {
  box(c,0,0,336,192,'#2e5057')
  box(c,0,54,336,75,'#42666a')
  oval(c,277,31,13,13,'#ffe5a0'); oval(c,282,26,11,11,'#2e5057')
  for (let i=0;i<43;i++) {
    const x = (i*73+21)%336, y=(i*17+4)%77
    box(c,x,y,i%6===0?3:1,1,'#c6d6b1')
    if (i%6===0) box(c,x+1,y-1,1,3,'#c6d6b1')
  }
  for (let i=0;i<15;i++) {
    const x=i*25-8, y=62+(i*23)%27
    box(c,x,y,22,65,'#28494c'); box(c,x-2,y,26,2,'#83a59a')
    for(let j=0;j<4;j++) box(c,x+4+(j%2)*9,y+7+Math.floor(j/2)*8,4,3,(i+j)%3===0?'#dfae69':'#536d68')
  }
  box(c,0,124,336,68,'#adc1ac'); box(c,0,129,336,63,'#849e93')
  for(let i=0;i<36;i++) box(c,(i*49)%336,134+(i*13)%53,3+i%5,1,'#b6c7af')
  // Snow piled on the roof, canvas scallops, timber uprights and a warm shop window.
  box(c,46,45,244,91,ink); box(c,50,50,236,80,'#6e4939')
  box(c,57,57,219,70,'#bd8554'); box(c,63,63,68,52,'#edb96b')
  box(c,68,67,58,46,'#f6cf88'); box(c,91,65,3,48,'#b58154')
  box(c,146,70,114,42,'#8c664a'); box(c,146,92,113,3,'#dbaa70')
  for(let i=0;i<6;i++){
    const x=153+i*18
    box(c,x,82-i%2*3,9,10+i%2*3,i%2?'#b8503d':'#dca968')
    box(c,x+1,79-i%2*3,7,3,ink)
  }
  for(const x of [45,282]) { box(c,x,44,9,94,ink); box(c,x+2,49,4,80,'#a56b45') }
  box(c,35,23,268,15,ink); box(c,40,19,258,9,'#e4e4c6'); box(c,46,17,243,5,'#fff4d5')
  for(let i=0;i<13;i++){
    const x=36+i*20, color=i%2?'#f5d7a2':'#ca6046'
    box(c,x,29,20,18,color); oval(c,x+10,46,10,5,ink); oval(c,x+10,44,9,5,color)
    box(c,x+2,29,3,14,i%2?'#fff0c6':'#e77a51')
  }
  for(const x of [65,265]) {
    box(c,x,50,2,8,ink); oval(c,x+1,63,7,9,ink); oval(c,x+1,63,5,8,'#e9914d')
    box(c,x-2,59,5,8,'#ffe6a2'); box(c,x-3,71,8,2,'#643f36')
  }
  bear(c,128,92)
  box(c,35,121,266,9,ink); box(c,37,121,262,4,'#ffdb9b')
  box(c,48,130,238,47,ink); box(c,51,130,232,44,teal)
  for(let i=0;i<15;i++) box(c,54+i*16,132,2,39,'#367568')
  box(c,45,175,245,6,ink); box(c,49,175,238,3,'#ab7956')
  for(const x of [54,272]) box(c,x,180,6,5,ink)
  grill(c,202,115,40); pancake(c,190,111,11); pancake(c,214,111,9)
  for(let i=0;i<3;i++) pancake(c,71,118-i*3,13)
  box(c,260,105,12,15,'#f2c68a'); box(c,263,97,2,11,ink); box(c,268,93,3,15,'#914d38')
  box(c,109,134,119,34,'#193e3e'); box(c,112,135,113,29,'#f5d6a0')
  box(c,115,138,107,23,'#c7553b'); box(c,117,140,103,19,'#ab4936')
  c.font='bold 14px "Malgun Gothic", sans-serif'; c.textAlign='center'; c.fillStyle='#ffedbe'; c.fillText('달밤 호떡',168,155)
  for(let i=0;i<9;i++) box(c,12+i*38,182+(i%3)*2,15,2,'#ced9bb')
}

type Motif = 'market' | 'pancake' | 'raw' | 'burnt' | 'pan' | 'board' | 'bear'
const sizes: Record<Motif, [number,number]> = {
  market:[336,192], pancake:[84,68], raw:[84,68], burnt:[84,68], pan:[180,94], board:[180,94], bear:[58,74],
}

export const MarketArt = memo(function MarketArt({ motif, className = '' }: { motif: Motif; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [w,h] = sizes[motif]
  useLayoutEffect(() => {
    const c = ref.current?.getContext('2d')
    if (!c) return
    c.clearRect(0,0,w,h)
    if (motif === 'market') market(c)
    else if (motif === 'bear') bear(c,29,30)
    else if (motif === 'board') {
      for (let y=20;y<=68;y++) {
        const edge=18-Math.floor((y-20)/5)
        box(c,edge,y,180-edge*2,1,ink)
        if(y>=22 && y<=63) box(c,edge+3,y,174-edge*2,1,'#edc38b')
      }
      box(c,21,59,32,1,'#d8a570'); box(c,114,27,28,1,'#d8a570')
      for(let i=0;i<23;i++) box(c,33+i*41%112,32+i*11%23,2+i%5,1,'#fff0c7')
    }
    else if (motif === 'pan') {
      box(c,22,48,135,26,ink); box(c,25,51,129,20,teal)
      box(c,31,66,21,3,'#92ad96'); oval(c,137,62,6,6,ink); oval(c,137,62,4,4,'#bcb89b')
      grill(c,90,41,72)
    } else pancake(c,42,34,33,motif==='raw',motif==='burnt')
  }, [motif,w,h])
  return <canvas className={'market-art '+className} ref={ref} width={w} height={h} aria-hidden="true" />
})
