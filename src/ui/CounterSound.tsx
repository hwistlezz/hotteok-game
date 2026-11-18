import { useEffect, useRef, useState } from 'react'
import type { Phase } from '../game/game'

const cues: Partial<Record<Phase, number[]>> = {
  portion:[310,405], press:[185], front:[135], back:[250,385], serve:[500,630,750], redo:[210,155], burnt:[180,110],
}

export function CounterSound({phase,paused}:{phase:Phase;paused:boolean}) {
  const audio=useRef<AudioContext|null>(null)
  const [on,setOn]=useState(false)
  const prior=useRef(phase)
  useEffect(()=>()=>{void audio.current?.close()},[])
  useEffect(()=>{
    const changed=prior.current!==phase
    prior.current=phase
    const ctx=audio.current
    if(!on||paused||!changed||!ctx||ctx.state!=='running')return
    for(const [i,hz] of (cues[phase]??[]).entries()){
      const start=ctx.currentTime+i*.075, end=start+.085
      const tone=ctx.createOscillator(), gain=ctx.createGain()
      tone.type='triangle'
      tone.frequency.setValueAtTime(hz,start)
      gain.gain.setValueAtTime(.001,start)
      gain.gain.exponentialRampToValueAtTime(.07,start+.012)
      gain.gain.exponentialRampToValueAtTime(.001,end)
      tone.connect(gain).connect(ctx.destination)
      tone.start(start); tone.stop(end)
      tone.onended=()=>{tone.disconnect();gain.disconnect()}
    }
  },[phase,on,paused])
  async function toggle(){
    try {
      if(on){setOn(false);await audio.current?.suspend();return}
      const ctx=audio.current??new AudioContext()
      audio.current=ctx
      await ctx.resume()
      setOn(ctx.state==='running')
    } catch {setOn(false)}
  }
  return <button className="quiet" type="button" aria-pressed={on} onClick={()=>void toggle()}>효과음 {on?'켬':'끔'}</button>
}
