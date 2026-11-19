import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { cookingRules, newGame, reduceGame } from '../game/game'
import { normalizeNickname, orderLimit, orderQuantity, UNIT_PRICE } from '../game/rules'
import { beginRound, bestKey, fetchLeaderboard, readBest, registerScore, saveBest, won } from './api'
import { Kitchen, type InputAction } from './Kitchen'
import { MarketArt } from './MarketArt'
import { CounterGuest } from './CounterGuest'
import { CounterSound } from './CounterSound'

import { KitchenScene } from './KitchenScene'

type Session = { seed: number; key: number; nickname: string | null; practice: boolean }

export function App() {
  const [keyboard, setKeyboard] = useState(() => !window.matchMedia('(pointer: coarse)').matches)
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState(false)
  const [best, setBest] = useState(readBest)
  const [practised, setPractised] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [ranks, setRanks] = useState(false)
  const sessionKey = useRef(0)

  function openSession(nickname: string | null, practice: boolean) {
    sessionKey.current += 1
    setSession({ seed: crypto.getRandomValues(new Uint32Array(1))[0], key: sessionKey.current, nickname, practice })
  }

  const updateBest = useCallback((score: number) => {
    setBest((current) => Math.max(current, score))
    void saveBest(score).then((saved) => setBest((current) => Math.max(current, saved)))
  }, [])

  useEffect(() => {
    function syncBest(event: StorageEvent) {
      if (event.key !== bestKey) return
      const stored = readBest()
      setBest((current) => Math.max(current, stored))
    }
    window.addEventListener('storage', syncBest)
    return () => window.removeEventListener('storage', syncBest)
  }, [])

  return (
    <main className="game-shell" onPointerDownCapture={() => setKeyboard(false)}
      onKeyDownCapture={event => { if (['Tab','Enter',' ','ArrowRight','ArrowLeft'].includes(event.key)) setKeyboard(true) }}>
      <header className="masthead">
        <span className="brand"><MarketArt motif="pancake" />달밤오락실</span>
        <span className="marquee-rule" aria-hidden="true" />
        <span className="open-sign">{session ? '조리 중' : '영업 중'}</span>
      </header>
      {session ? (
        <Play keyboard={keyboard}
          key={session.key}
          session={session}
          best={best}
          onBest={updateBest}
          onHome={() => setSession(null)}
          onReplay={() => openSession(session.nickname, false)}
          onPracticeExit={() => {
            setPractised(true)
            if (session.nickname) openSession(session.nickname, false)
            else setSession(null)
          }}
        />
      ) : ranks ? (
        <Leaderboard onBack={() => setRanks(false)} />
      ) : (
        <div className="home-layout">
          <figure className="shop-poster">
            <div className="poster-window"><KitchenScene scene="finished" /></div>
            <figcaption><strong>달밤 호떡집</strong><span>한 장 <b>2,000원</b></span></figcaption>
          </figure>
          <div className="home-card">
            <h1>호떡 만들기</h1>
            <p className="intro">빙글빙글 반죽을 젓고, 한 덩이씩 철판에 올려요.<br />손님이 떠나기 전에 뜨거운 호떡을 건네세요.</p>
            <form onSubmit={(event) => {
              event.preventDefault()
              const nickname = normalizeNickname(input)
              setInputError(!nickname)
              if (nickname) openSession(nickname, !practised)
            }}>
              <label htmlFor="nickname">닉네임</label>
              <input
                id="nickname"
                value={input}
                onChange={(event) => { setInput(event.target.value); setInputError(false) }}
                placeholder="예: 눈꽃호떡"
                maxLength={32}
                autoComplete="off"
                aria-invalid={inputError}
                aria-describedby="nickname-note"
              />
              <p className="field-note" id="nickname-note" role={inputError ? 'alert' : undefined}>
                {inputError ? '글자, 숫자, 공백, -, _를 2~16자로 입력해 주세요.'
                  : '주문을 완료하거나 게임이 끝나면 닉네임과 매출이 랭킹에 자동 공개돼요.'}
              </p>
              <button className="primary" type="submit">게임 시작 <span aria-hidden="true">▶</span></button>
            </form>
            <div className="home-links">
              <button type="button" className="quiet" onClick={() => openSession(null, true)}>조작 방법</button>
              <button type="button" className="quiet" onClick={() => setRanks(true)}>랭킹 보기</button>
            </div>
            <div className="record"><span>개인 최고 기록</span><strong>{won(best)}</strong></div>
          </div>
        </div>
      )}
    </main>
  )
}

function Play({ keyboard, session, best, onBest, onHome, onReplay, onPracticeExit }: {
  keyboard: boolean; session: Session; best: number; onBest: (score: number) => void
  onHome: () => void; onReplay: () => void; onPracticeExit: () => void
}) {
  const [game, dispatch] = useReducer(reduceGame, session, ({ practice, seed }) => newGame(practice, seed))
  const [now, setNow] = useState(0)
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [ranks, setRanks] = useState(false)
  const [round, setRound] = useState<{ id: string | null; loading: boolean }>({
    id: null, loading: !session.practice,
  })
  const [registration, setRegistration] = useState<'idle' | 'sending' | 'saved' | 'error'>('idle')
  const clock = useRef({ elapsed: 0, anchor: null as number | null })

  const pauseDialog = useRef<HTMLDialogElement>(null)
  const cookingButton = useRef<HTMLButtonElement>(null)

  useLayoutEffect(() => {
    const dialog = pauseDialog.current
    if (paused && dialog && !dialog.open) dialog.showModal()
    else if (!paused && dialog?.open) {
      dialog.close()
      cookingButton.current?.focus({ preventScroll: true })
    }
  }, [paused])

  function resume() {
    if (document.hidden) return
    clock.current.anchor = performance.now()
    setPaused(false)
  }

  const readTime = useCallback(() => {
    const { elapsed, anchor } = clock.current
    return anchor === null ? elapsed : elapsed + Math.floor(performance.now() - anchor)
  }, [])

  const pause = useCallback(() => {
    const timestamp = readTime()
    clock.current = { elapsed: timestamp, anchor: null }
    dispatch({ type: 'cancel-press', now: timestamp })
    setNow(timestamp)
    setPaused(true)
  }, [readTime])

  useEffect(() => {
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setReady(true)
        if (document.hidden) pause()
        else clock.current.anchor = performance.now()
      })
    })
    return () => { cancelAnimationFrame(firstFrame); cancelAnimationFrame(secondFrame) }
  }, [pause])

  useEffect(() => {
    if (!ready || paused || game.finished) return
    const interval = window.setInterval(() => {
      const timestamp = readTime()
      setNow(timestamp)
      dispatch({ type: 'tick', now: timestamp })
    }, 25)
    const handleVisibility = () => { if (document.hidden) pause() }
    document.addEventListener('visibilitychange', handleVisibility)
    if (document.hidden) pause()
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [game.finished, pause, paused, readTime, ready])

  useEffect(() => {
    if (session.practice || !session.nickname) return
    let current = true
    void beginRound(session.nickname).then(
      ({ id }) => { if (current) setRound({ id, loading: false }) },
      () => { if (current) setRound({ id: null, loading: false }) },
    )
    return () => { current = false }
  }, [session.nickname, session.practice])

  useEffect(() => {
    if (game.finished && !session.practice) onBest(game.score)
  }, [game.finished, game.score, onBest, session.practice])

  const quantity = orderQuantity(game.receipts.length)
  const rules = cookingRules(game)
  const lastOrder = game.receipts.at(-1)
  const seconds = Math.max(0, Math.ceil((orderLimit(quantity) - (now - game.orderAt)) / 1000))

  function send(action: InputAction) {
    if (clock.current.anchor === null || document.hidden) return
    const timestamp = readTime()
    setNow(timestamp)
    dispatch({ ...action, now: timestamp })
  }

  const acknowledged = useRef<unknown>(null)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!round.id) return
    let receipts = game.receipts
    if (!game.finished) {
      let length = receipts.length
      while (length && receipts[length-1].outcome !== 'served') length--
      if (!length || receipts[length-1] === acknowledged.current) return
      receipts = receipts.slice(0, length)
    }
    let current = true
    let retryTimer: number | undefined
    setRegistration('sending')
    void registerScore(round.id, receipts, !game.finished).then(
      () => { if (current) { acknowledged.current = receipts.at(-1); setRegistration('saved') } },
      () => {
        if (!current) return
        setRegistration('error')
        if (!game.finished) retryTimer = window.setTimeout(() => setRetry(n => n + 1), 5000)
      },
    )
    return () => { current = false; window.clearTimeout(retryTimer) }
  }, [round.id, game.receipts, game.finished, retry])

  useLayoutEffect(() => {
    if (ready && !paused && !game.finished) cookingButton.current?.focus({ preventScroll: true })
  }, [ready, paused, game.finished, game.receipts.length])

  if (ranks) return <Leaderboard onBack={() => setRanks(false)} />
  if (game.finished) {
    return (
      <div className="result">
        <button type="button" className="quiet back" onClick={onHome}>← 처음으로</button>
        <div className="result-window"><KitchenScene scene={session.practice || game.servedOrders > 0 ? 'finished' : 'burnt'} /></div>
        <h1>{session.practice ? '연습 완료!' : '오늘 장사 끝!'}</h1>
        {session.practice ? (
          <p>노릇한 호떡 한 장을 완성했어요.</p>
        ) : (
          <dl className="result-stats">
            <div><dt>이번 매출</dt><dd>{won(game.score)}</dd></div>
            <div><dt>완료한 주문</dt><dd>{game.servedOrders}건</dd></div>
            <div><dt>최고 연속 별 셋</dt><dd>{game.bestStreak}장</dd></div>
            <div><dt>개인 최고 기록</dt><dd>{won(Math.max(game.score, best))}</dd></div>
          </dl>
        )}
        <button type="button" className="primary" onClick={
          session.practice ? onPracticeExit : onReplay
        }>{session.practice ? session.nickname ? '실전 시작' : '처음으로 돌아가기' : '다시 시작'}</button>
        {!session.practice && (
          <>
            {registration === 'sending' && <p role="status">랭킹 저장 중…</p>}
            {registration === 'error' && <button type="button" className="secondary" onClick={() => setRetry(n => n + 1)}>랭킹 등록 다시 시도</button>}
            {round.loading && <p role="status">랭킹 연결 확인 중…</p>}
            {!round.loading && !round.id && <p role="status">랭킹 연결을 시작하지 못했어요. 이번 매출은 결과에서 볼 수 있어요.</p>}
            {registration === 'error' && <p role="status">랭킹 등록에 실패했어요.</p>}
            {registration === 'saved' && <p role="status">랭킹에 등록했어요.</p>}
            <button type="button" className="quiet" onClick={() => setRanks(true)}>랭킹 보기</button>
          </>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="topbar">
        <button type="button" className="quiet" onClick={onHome}>← 처음으로</button>
        <span>{session.practice ? '연습' : session.nickname}</span>
        <CounterSound phase={game.phase} paused={paused}/>
        <button type="button" className="quiet" disabled={paused || !ready} onClick={pause}>일시정지</button>
      </div>
      <div className="play-area">
        <aside className="order-rail" aria-label="주문대">
          <div className="scorebar">
            {session.practice ? <strong>연습 주문</strong> : <>
              <span className="hearts" aria-label={`하트 ${game.hearts}개`}>
                <span aria-hidden="true">{'♥'.repeat(game.hearts)}{'♡'.repeat(3-game.hearts)}</span>
              </span><strong aria-label="매출">{won(game.score)}</strong></>}
            {session.practice && <button type="button" className="quiet" onClick={onPracticeExit}>건너뛰기</button>}
          </div>
          <CounterGuest index={game.receipts.length} delivery={game.deliveredAt!==null && now-game.deliveredAt<750 ? game.deliveredAt : null}
            previous={lastOrder && now-game.orderAt<600 ? lastOrder.outcome : null}
            onServe={ready && !paused && game.phase==='serve' ? ()=>send({type:'serve'}) : undefined}
            mood={seconds<=5 && !session.practice ? 'urgent' : game.phase==='serve' ? 'happy' : 'waiting'}
            message={session.practice ? '따끈한 호떡 한 장 주세요!' : seconds<=5 ? '제 호떡 곧 나올까요?' :
              game.phase==='serve' ? '와, 맛있겠다!' : game.placed ? `이제 ${quantity-game.placed}장 남았네요!` :
              `${rules.label} ${quantity}장 주세요!`}/>
          <div className="ticket">
            <div className="ticket-heading"><strong>{session.practice ? '연습' : rules.label+' '+quantity+'개'}</strong>
              {!session.practice && <span className={'timer'+(seconds<=5?' timer--urgent':'')} aria-label="주문 남은 시간">{seconds}초</span>}</div>
            <div className="order-slots" aria-label={`포장 ${game.placed}/${quantity}`}>
              {Array.from({length:quantity},(_,i)=><i key={i} data-filled={i<game.placed} data-active={i===game.placed}><span>{i+1}</span></i>)}
              <b>{game.placed+1}번째 장 조리 중</b></div>
            {!session.practice && <small>{rules.shift} · 별 {rules.required}개 필요</small>}
          </div>
          {!session.practice && (<div className="prep-card">
            <button type="button" disabled={!ready || paused || game.folded || game.prepped >= 2 || (game.phase !== 'front' && game.phase !== 'back')}
              onClick={() => send({ type: 'prep' })}>
              <img src="/kitchen/dough.webp" width="42" height="38" alt="" />
              <span><strong>{game.prepped >= 2 ? '밑준비 완료' : '다음 반죽 준비'}</strong>
              <small>{game.prepped ? `다음 주문 ${game.prepped}바퀴 단축` : '한 면마다 한 번'}</small></span>
            </button>
          </div>)}
          {lastOrder && now-game.orderAt < 1800 && <strong key={game.receipts.length} className="order-feedback" role="status">
            {lastOrder.outcome==='timeout' ? '손님이 떠났어요  ♥ −1' :
              '+'+won(orderQuantity(game.receipts.length-1)*UNIT_PRICE)}
          </strong>}
        </aside>
        <Kitchen keyboard={keyboard} buttonRef={cookingButton} key={game.receipts.length} game={game} now={now} enabled={ready && !paused} send={send} />
        <dialog className="pause" ref={pauseDialog} aria-labelledby="pause-title"
          onCancel={event => { event.preventDefault(); resume() }}
          onKeyDown={event => { if (event.key === 'Tab') event.preventDefault() }}>
          <h2 id="pause-title">일시정지</h2>
          <button type="button" className="primary" onClick={resume}>재개</button>
        </dialog>
      </div>
    </>
  )
}

function Leaderboard({ onBack }: { onBack: () => void }) {
  const [attempt, setAttempt] = useState(0)
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchLeaderboard>> | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let current = true
    void fetchLeaderboard().then(
      (result) => { if (current) setData(result) },
      () => { if (current) setFailed(true) },
    )
    return () => { current = false }
  }, [attempt])

  return (
    <section className="leaderboard">
      <button type="button" className="quiet back" onClick={onBack}>← 돌아가기</button>
      <h1>호떡 랭킹</h1>
      <p>매출이 높은 기록 10개</p>
      {failed ? (
        <>
          <p role="alert">랭킹을 불러오지 못했어요.</p>
          <button className="primary" type="button" onClick={() => {
            setFailed(false); setAttempt((value) => value + 1)
          }}>다시 불러오기</button>
        </>
      ) : !data ? <p role="status">불러오는 중…</p>
        : data.entries.length === 0 ? <p role="status">아직 등록된 기록이 없어요.</p>
          : <ol>{data.entries.map(({ nickname, score }, index) =>
            <li key={index}><span>{nickname}</span><strong>{won(score)}</strong></li>,
          )}</ol>}
    </section>
  )
}
