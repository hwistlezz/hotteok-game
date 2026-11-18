import type { CSSProperties } from 'react'

const guests = [
  { name: '목도리 곰', kind: 'bear', coat: '#408e87', fur: '#cc9466' },
  { name: '겨울 토끼', kind: 'rabbit', coat: '#cc7687', fur: '#f4d9c9' },
  { name: '밤마실 고양이', kind: 'cat', coat: '#7587ae', fur: '#c4a28b' },
]

function GuestPortrait({ guest }: { guest: typeof guests[number] }) {
  return <div className={'guest guest-'+guest.kind} aria-hidden="true"
        style={{'--coat':guest.coat,'--fur':guest.fur} as CSSProperties}>
        <i className="guest-body"/><i className="guest-ear ear-left"/><i className="guest-ear ear-right"/>
        <i className="guest-head"><i className="guest-eye"/><i className="guest-eye eye-right"/>
          <i className="guest-muzzle"/><i className="guest-cheek"/><i className="guest-cheek cheek-right"/></i>
        <i className="guest-scarf"/><i className="guest-paw paw-left"/><i className="guest-paw paw-right"/>
      </div>
}

export function CounterGuest({ index, mood, message, delivery, previous, onServe }: {
  index: number; mood: 'waiting' | 'happy' | 'urgent'; message: string; delivery: number | null
  previous: 'served' | 'timeout' | null; onServe?: () => void
}) {
  const guest = guests[index % guests.length]
  return <div className="guest-window" data-mood={mood}>
    <div className="guest-scenery" aria-hidden="true"><i/><i/><i/></div>
    <div className="guest-arrival" key={index} data-changing={previous!==null}><GuestPortrait guest={guest}/></div>
    {previous && <div key={'out'+index} className="guest-leaving"><GuestPortrait guest={guests[(index-1)%guests.length]}/>
      {previous==='served'&&<i className="held-bag" aria-hidden="true">호떡</i>}</div>}
    <div className="guest-bubble"><small>{guest.name}</small><strong>{message}</strong></div>
    {delivery!==null && !previous && <i key={delivery} className="flying-bag" aria-hidden="true">호떡</i>}
    <div className="guest-sill" aria-hidden="true"/>
    {onServe && <button type="button" className="give-to-guest" aria-label="손님에게 건네기" onClick={onServe}/>}
  </div>
}
