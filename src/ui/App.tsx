import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { newGame, reduceGame } from '../game/game'
import { normalizeNickname, orderLimit, orderQuantity } from '../game/rules'
import { beginRound, bestKey, fetchLeaderboard, readBest, registerScore, saveBest, won } from './api'
import { Griddle, Kitchen, type InputAction } from './Kitchen'

type Session = { key: number; nickname: string | null; practice: boolean }

export function App() {
  const [input, setInput] = useState('')
  const [inputError, setInputError] = useState(false)
  const [best, setBest] = useState(readBest)
  const [practised, setPractised] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [ranks, setRanks] = useState(false)
  const sessionKey = useRef(0)

  function openSession(nickname: string | null, practice: boolean) {
    sessionKey.current += 1
    setSession({ key: sessionKey.current, nickname, practice })
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
    <main className="game-shell">
      {session ? (
        <Play
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
        <>
          <header className="hero">
            <div className="awning" aria-hidden="true" />
            <h1>호떡 만들기</h1>
            <p>노릇하게 구워 손님의 주문을 채워봐요.</p>
            <Griddle appearance="done" />
          </header>
          <div className="home-card">
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
                  : '랭킹에 등록하면 닉네임이 공개돼요.'}
              </p>
              <button className="primary" type="submit">게임 시작</button>
            </form>
            <div className="home-links">
              <button type="button" className="quiet" onClick={() => openSession(null, true)}>조작 방법</button>
              <button type="button" className="quiet" onClick={() => setRanks(true)}>랭킹 보기</button>
            </div>
            <div className="record"><span>개인 최고 기록</span><strong>{won(best)}</strong></div>
          </div>
        </>
      )}
    </main>
  )
}

function Play({ session, best, onBest, onHome, onReplay, onPracticeExit }: {
  session: Session; best: number; onBest: (score: number) => void
  onHome: () => void; onReplay: () => void; onPracticeExit: () => void
}) {
  const [game, dispatch] = useReducer(reduceGame, session.practice, newGame)
  const [now, setNow] = useState(0)
  const [ready, setReady] = useState(false)
  const [paused, setPaused] = useState(false)
  const [ranks, setRanks] = useState(false)
  const [round, setRound] = useState<{ id: string | null; loading: boolean }>({
    id: null, loading: !session.practice,
  })
  const [registration, setRegistration] = useState<'idle' | 'sending' | 'saved' | 'error'>('idle')
  const clock = useRef({ elapsed: 0, anchor: null as number | null })

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
    }, 50)
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
  const seconds = Math.max(0, Math.ceil((orderLimit(quantity) - (now - game.orderAt)) / 1000))

  function send(action: InputAction) {
    if (clock.current.anchor === null || document.hidden) return
    const timestamp = readTime()
    setNow(timestamp)
    dispatch({ ...action, now: timestamp })
  }

  async function saveScore() {
    if (!round.id || registration === 'sending' || registration === 'saved') return
    setRegistration('sending')
    try {
      await registerScore(round.id, game.receipts)
      setRegistration('saved')
    } catch {
      setRegistration('error')
    }
  }

  if (ranks) return <Leaderboard onBack={() => setRanks(false)} />
  if (game.finished) {
    return (
      <div className="result">
        <button type="button" className="quiet back" onClick={onHome}>← 처음으로</button>
        <Griddle appearance="done" />
        <h1>{session.practice ? '연습 완료!' : '오늘 장사 끝!'}</h1>
        {session.practice ? (
          <p>노릇한 호떡 한 장을 완성했어요.</p>
        ) : (
          <dl className="result-stats">
            <div><dt>이번 매출</dt><dd>{won(game.score)}</dd></div>
            <div><dt>완료한 주문</dt><dd>{game.servedOrders}건</dd></div>
            <div><dt>개인 최고 기록</dt><dd>{won(Math.max(game.score, best))}</dd></div>
          </dl>
        )}
        <button type="button" className="primary" onClick={
          session.practice ? onPracticeExit : onReplay
        }>{session.practice ? session.nickname ? '실전 시작' : '처음으로 돌아가기' : '다시 시작'}</button>
        {!session.practice && (
          <>
            {round.id && registration !== 'saved' && (
              <button type="button" className="secondary" disabled={registration === 'sending'} onClick={() => void saveScore()}>
                {registration === 'sending' ? '등록 중…' : registration === 'error' ? '랭킹 등록 다시 시도' : '랭킹에 등록'}
              </button>
            )}
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
        <button type="button" className="quiet" disabled={paused || !ready} onClick={pause}>일시정지</button>
      </div>
      <div className="play-area">
        {session.practice ? (
          <div className="order-card">
            <div><strong>연습 주문</strong><span>호떡 1개</span></div>
            <button type="button" className="quiet" onClick={onPracticeExit}>건너뛰기</button>
          </div>
        ) : (
          <>
            <div className="scorebar">
              <span className="hearts" aria-label={`하트 ${game.hearts}개`}>
                <span aria-hidden="true">{'♥'.repeat(game.hearts)}{'♡'.repeat(3 - game.hearts)}</span>
              </span>
              <strong aria-label="매출">{won(game.score)}</strong>
            </div>
            <div className="order-card">
              <div><strong>호떡 {quantity}개</strong><span>제출 {game.placed}/{quantity}</span></div>
              <span className={`timer${seconds <= 5 ? ' timer--urgent' : ''}`} aria-label="주문 남은 시간">
                {seconds}초
              </span>
            </div>
          </>
        )}
        <Kitchen game={game} now={now} enabled={ready && !paused} send={send} />
        {paused && (
          <section className="pause" role="dialog" aria-modal="true" aria-label="일시정지">
            <div>
              <h2>잠깐 쉬는 중</h2>
              <button type="button" autoFocus className="primary" onClick={() => {
                if (document.hidden) return
                clock.current.anchor = performance.now()
                setPaused(false)
              }}>재개</button>
            </div>
          </section>
        )}
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
