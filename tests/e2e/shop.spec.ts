import { expect, test, type Page } from '@playwright/test'

async function stirWithKeyboard(page: Page) {
  const bowl = page.getByRole('button', { name: '반죽 젓기' })
  await expect(bowl).toBeEnabled()
  for(let i=0; i<24 && await bowl.count(); i++) {
    const clockwise = await bowl.getAttribute('data-direction') === '1'
    await bowl.press(clockwise ? 'ArrowRight' : 'ArrowLeft')
  }
}

async function prepareWithKeyboard(page: Page) {
  await stirWithKeyboard(page)
  await page.getByRole('button', { name: '반죽 옮기기' }).press('Enter')
}

async function cookOne(page: Page) {
  await prepareWithKeyboard(page)
  await page.getByRole('button', { name: '누르개 길게 누르기' }).focus()
  await page.keyboard.down('Space')
  await page.clock.runFor(900)
  await page.keyboard.up('Space')
  await expect(page.getByRole('heading', { name: '앞면 굽기' })).toBeVisible()
  await page.clock.fastForward(2_600)
  await page.getByRole('button', { name: '뒤집기' }).tap()
  await page.clock.fastForward(2_600)
  await page.getByRole('button', { name: '꺼내기' }).tap()
  await page.getByRole('button', { name: '호떡 제출' }).tap()
}

async function holdWithTouch(page: Page, duration = 900) {
  const target = page.getByRole('button', { name: '누르개 길게 누르기' })
  const box = await target.boundingBox()
  if (!box) throw new Error('누르개가 표시되지 않았습니다.')
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  })
  await page.clock.runFor(duration)
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await client.detach()
}

test('입력 안내를 바꾸고 너무 짧은 누르기의 위치를 잠시 유지한다', async ({page}) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button',{name:'조작 방법'}).tap()
  const hint = page.locator('.quality')
  await expect(hint).toContainText('그릇 가장자리')
  const bowl = page.getByRole('button',{name:'반죽 젓기'})
  await expect(bowl).toBeEnabled()
  await bowl.press('ArrowRight')
  await expect(hint).toContainText('← 반시계')
  await bowl.tap()
  await expect(hint).toContainText('그릇 가장자리')
  await prepareWithKeyboard(page)
  await holdWithTouch(page,400)
  await expect(page.getByText('조금 더 눌러요')).toBeVisible()
  const gauge = page.getByRole('progressbar',{name:'누르는 힘'})
  expect(Number(await gauge.getAttribute('aria-valuenow'))).toBeGreaterThan(15)
  await page.clock.fastForward(1000)
  await expect(gauge).toHaveAttribute('aria-valuenow','0')
  await holdWithTouch(page)
  await expect(page.getByRole('heading',{name:'앞면 굽기'})).toBeVisible()
})

test('매출 저장 확인은 서버의 성공 응답 뒤에만 잠시 표시된다', async ({page}) => {
  await page.clock.install()
  await page.route('**/api/rounds', r => r.fulfill({json:{id:'preview'}}))
  let attempts = 0
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/rounds/preview/score', async r => {
    if (++attempts === 1) return r.fulfill({status:503})
    await pending
    await r.fulfill({json:{score:2000}})
  })
  await page.goto('/')
  await page.getByLabel('닉네임').fill('저장손님')
  await page.getByRole('button',{name:'게임 시작'}).tap()
  await page.getByRole('button',{name:'건너뛰기'}).tap()
  await cookOne(page)
  const status = page.locator('.rank-save-status')
  await expect(status).toHaveText('저장 재시도 중')
  await page.clock.fastForward(5001)
  await expect(status).toHaveText('저장 중…')
  release()
  await expect(status).toHaveText('✓ 2,000원 저장됨')
  await page.clock.fastForward(2300)
  await expect(status).toBeEmpty()
})

test('모바일에서 연습을 완료하고 일시정지 뒤 재개한다', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button', { name: '조작 방법' }).tap()
  await page.getByRole('button', { name: '일시정지' }).tap()
  await page.clock.fastForward(22_000)
  await expect(page.getByRole('dialog', { name: '일시정지' })).toBeVisible()
  const resume = page.getByRole('button', { name: '재개' })
  for (const key of ['Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key)
    await expect(resume).toBeFocused()
  }
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: '반죽 젓기' })).toBeFocused()
  await prepareWithKeyboard(page)
  await holdWithTouch(page)
  await expect(page.getByRole('heading', { name: '앞면 굽기' })).toBeVisible()
  const top=page.locator('.cake-toast')
  const rim=page.locator('.contact-rim')
  const opacity=(layer: typeof top)=>layer.evaluate(el=>Number(getComputedStyle(el).opacity))
  await page.clock.runFor(1_200)
  expect(await opacity(top)).toBe(0)
  const warmRim=await opacity(rim)
  await page.clock.runFor(1_400)
  expect(await opacity(top)).toBe(0)
  expect(await opacity(rim)).toBeGreaterThan(warmRim)
  await page.getByRole('button', { name: '뒤집기' }).tap()
  await page.clock.runFor(700)
  const revealed=await opacity(top)
  expect(revealed).toBeGreaterThan(.8)
  await page.clock.runFor(1_900)
  expect(await opacity(top)).toBe(revealed)
  await page.getByRole('button', { name: '꺼내기' }).tap()
  await page.getByRole('button', { name: '호떡 제출' }).tap()
  await expect(page.getByRole('heading', { name: '연습 완료!' })).toBeVisible()
  await page.getByRole('button', { name: '처음으로 돌아가기' }).tap()
  await expect(page.getByRole('heading', { name: '호떡 만들기' })).toBeVisible()
})

test('뒷면이 타도 위에 보이는 첫 면의 무늬와 색은 유지된다', async ({page}) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button',{name:'조작 방법'}).tap()
  await prepareWithKeyboard(page)
  await holdWithTouch(page)
  await page.clock.runFor(2_620)
  await page.getByRole('button',{name:'뒤집기'}).tap()
  await page.clock.runFor(700)
  const surface=()=>page.locator('.cake-toast').evaluate(el=>{
    const art=getComputedStyle(el,'::before')
    return [getComputedStyle(el).opacity,art.transform,art.backgroundPosition,art.filter]
  })
  const firstSide=await surface()
  await page.clock.fastForward(5_100)
  await expect(page.getByRole('button',{name:'탄 호떡 버리기'})).toBeVisible()
  expect(await surface()).toEqual(firstSide)
})

test('정상 주문, 게임 오버, 등록 실패 복구 및 동시 제출을 검증한다', async ({ page, request }) => {
  test.setTimeout(150_000)
  await page.clock.install()
  await page.goto('/')
  const nickname = `호떡${Date.now().toString().slice(-8)}`
  await page.getByLabel('닉네임').fill(nickname)
  await page.getByRole('button', { name: '게임 시작' }).tap()
  const started = page.waitForResponse((response) => response.url().endsWith('/api/rounds') && response.status() === 201)
  await page.getByRole('button', { name: '건너뛰기' }).tap()
  await started
  const startedAt = Date.now()
  const tieName = '나중에등록'
  const tieRun = await request.post('/api/rounds', { data: { nickname: tieName } })
  expect(tieRun.status()).toBe(201)
  await cookOne(page)
  await expect(page.getByLabel('매출')).toHaveText('2,000원')
  await expect.poll(async () => (await (await request.get('/api/leaderboard')).json()).entries).toContainEqual({ nickname, score: 2_000 })
  const nextBowl = page.getByRole('button', { name: '반죽 젓기' })
  await expect(nextBowl).toBeFocused()
  await page.keyboard.press(await nextBowl.getAttribute('data-direction') === '1' ? 'ArrowRight' : 'ArrowLeft')
  // The browser clock is simulated. The server still checks that a real round could have elapsed.
  let attempts = 0
  await page.route('**/api/rounds/*/score', async (route) => {
    attempts += 1
    if (attempts === 1) {
      await route.fulfill({ status: 503 })
      return
    }
    const [first, second] = await Promise.all([route.fetch(), route.fetch()])
    expect(first.ok()).toBe(true)
    expect(second.ok()).toBe(true)
    expect(await first.json()).toEqual(await second.json())
    await route.fulfill({ response: first })
  })
  for (const duration of [28_050, 28_050, 38_050]) {
    await page.clock.fastForward(duration)
  }
  await expect(page.getByRole('heading', { name: '오늘 장사 끝!' })).toBeVisible()


  await expect(page.getByText('랭킹 등록에 실패했어요.')).toBeVisible()
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, 103_000 - (Date.now() - startedAt))))
  await page.getByRole('button', { name: '랭킹 등록 다시 시도' }).tap()
  await expect(page.getByText('랭킹에 등록했어요.')).toBeVisible()
  const tie = await request.post(`/api/rounds/${(await tieRun.json()).id}/score`, {
    data: { receipts: [
      { outcome: 'served', elapsedMs: 6_000 },
      ...[28_000, 28_000, 38_000].map((elapsedMs) => ({ outcome: 'timeout', elapsedMs })),
    ] },
  })
  expect(tie.ok()).toBe(true)
  const ranking = await request.get('/api/leaderboard')
  expect(ranking.ok()).toBe(true)
  const entries: {nickname: string; score: number}[] = (await ranking.json()).entries
  expect(entries.filter(entry => entry.nickname === nickname || entry.nickname === tieName)).toEqual([{ nickname, score: 2_000 }, { nickname: tieName, score: 2_000 }])
  await page.getByRole('button', { name: '랭킹 보기' }).tap()
  await expect(page.getByRole('listitem').filter({ hasText: nickname })).toBeVisible()
  await page.getByRole('button', { name: '돌아가기' }).tap()
  await page.getByRole('button', { name: '다시 시작' }).tap()
  await expect(page.getByLabel('매출')).toHaveText('0원')
})

test('숨긴 탭의 시간을 멈추고 다른 탭의 최고 기록을 보존한다', async ({ page, context }) => {
  await page.clock.install()
  await page.route('**/api/rounds', (route) => route.fulfill({ status: 503 }))
  await page.goto('/')
  await page.getByLabel('닉네임').fill('호떡손님')
  await page.getByRole('button', { name: '게임 시작' }).tap()
  await page.getByRole('button', { name: '건너뛰기' }).tap()
  await expect(page.getByRole('button', { name: '일시정지' })).toBeEnabled()

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('dialog', { name: '일시정지' })).toBeVisible()
  const time = await page.getByLabel('주문 남은 시간').textContent()
  await page.clock.fastForward(60_000)
  await expect(page.getByLabel('주문 남은 시간')).toHaveText(time ?? '')
  const otherTab = await context.newPage()
  await otherTab.goto('/')
  await otherTab.evaluate(() => localStorage.setItem('hotteok-best', '6000'))
  await otherTab.close()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.getByRole('button', { name: '재개' }).tap()
  await cookOne(page)
  for (const duration of [28_050, 28_050, 38_050]) {
    await page.clock.fastForward(duration)
  }
  await expect(page.getByRole('heading', { name: '오늘 장사 끝!' })).toBeVisible()
  await expect(page.getByText('랭킹 연결을 시작하지 못했어요.', { exact: false })).toBeVisible()
  await expect(page.getByText('6,000원')).toBeVisible()
  await page.reload()
  await expect(page.getByText('6,000원')).toBeVisible()
})

test('잘못된 닉네임과 너무 이른 결과 등록을 거부한다', async ({ request }) => {
  expect((await request.post('/api/rounds', { data: { nickname: '<script>' } })).status()).toBe(400)
  const round = await request.post('/api/rounds', { data: { nickname: '새로운손님' } })
  expect(round.status()).toBe(201)
  const { id } = await round.json()
  const result = await request.post(`/api/rounds/${id}/score`, {
    data: {
      receipts: [18_000, 28_000, 28_000].map((elapsedMs) => ({ outcome: 'timeout', elapsedMs })),
    },
  })
  expect(result.status()).toBe(400)
})

test('드래그 반죽, 위로 밀어 뒤집기, 다음 반죽 예약이 한 주문으로 이어진다', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByLabel('닉네임').fill('달밤손님')
  await page.getByRole('button', { name: '게임 시작' }).tap()
  await page.getByRole('button', { name: '건너뛰기' }).tap()
  const stir = page.getByRole('button', { name: '반죽 젓기' })
  await expect(stir).toBeEnabled()
  await stir.tap()
  await expect(page.getByRole('progressbar', { name: '젓기' })).toHaveAttribute('aria-valuenow','0')
  const bowl = (await page.locator('.mix-bowl').boundingBox())!
  const x=bowl.x+bowl.width/2, y=bowl.y+bowl.height/2
  const client=await page.context().newCDPSession(page)
  for (let stage=0; stage<3; stage++) {
    const direction=Number(await stir.getAttribute('data-direction'))
    await expect(stir).toHaveAccessibleDescription(new RegExp(`${stage+1}번째 지시, ${direction===1?'시계':'반시계'} 방향`))
    for (let i=0; i<=33; i++) {
      const angle = i * direction * Math.PI / 4
      await client.send('Input.dispatchTouchEvent', { type:i===0?'touchStart':'touchMove',
        touchPoints:[{x:x+Math.cos(angle)*bowl.width*.33,y:y+Math.sin(angle)*bowl.height*.33}] })
    }
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  }
  await client.detach()
  const source=(await page.locator('.portion-ball').boundingBox())!
  const pan=(await page.locator('.hob').boundingBox())!
  const dragBall=async (toX:number,toY:number)=>{
    await page.mouse.move(source.x+source.width/2,source.y+source.height/2)
    await page.mouse.down()
    await page.mouse.move(toX,toY,{steps:6})
    await page.mouse.up()
  }
  await dragBall(source.x,source.y)
  await expect(page.getByRole('button',{name:'반죽 옮기기'})).toBeEnabled()
  await dragBall(pan.x+pan.width/2,pan.y+pan.height/2)
  await holdWithTouch(page)
  const prep = page.getByRole('button', { name: /다음 반죽 준비/ })
  await prep.tap()
  await expect(prep).toBeDisabled()
  await page.clock.fastForward(2_600)
  await page.mouse.move(x,y)
  await page.mouse.down()
  await page.mouse.move(x,y-45,{ steps: 3 })
  await page.mouse.up()
  await expect(page.getByRole('heading', { name: '뒷면 굽기' })).toBeVisible()
  await page.clock.fastForward(2_600)
  await page.getByRole('button', { name: '꺼내기' }).tap()
  await page.getByRole('button', { name: '호떡 제출' }).tap()
  await expect(page.getByText('바삭하게 2개')).toBeVisible()
  await expect(page.getByRole('heading', { name: '반죽 젓기' })).toBeVisible()
  await stirWithKeyboard(page)
  for (const [front,back] of [[3_500,3_760],[3_760,3_500]]) {
    await page.getByRole('button',{name:'반죽 옮기기'}).press('Enter')
    await holdWithTouch(page, front===3_500 ? 1000 : 1120)
    await page.clock.fastForward(front)
    await page.getByRole('button',{name:'뒤집기'}).tap()
    await page.clock.fastForward(back)
    await page.getByRole('button',{name:'꺼내기'}).tap()
    await page.getByRole('button',{name:'손님에게 건네기'}).tap()
    if (front===3_500) {
      await expect(page.getByLabel('포장 1/2')).toBeVisible()
      await expect(page.getByLabel('매출')).toHaveText('2,000원')
      await expect(page.getByRole('button',{name:'반죽 옮기기'})).toBeEnabled()
    }
  }
  await expect(page.getByLabel('매출')).toHaveText('6,000원')
})

test('별이 부족한 호떡은 포장할 수 없고 같은 손님의 주문을 다시 굽는다', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByLabel('닉네임').fill('첫손님')
  await page.getByRole('button', { name: '게임 시작' }).tap()
  await page.getByRole('button', { name: '건너뛰기' }).tap()
  await expect(page.getByText('첫 영업 · 별 2개 필요')).toBeVisible()
  await prepareWithKeyboard(page)
  await page.getByRole('button', { name: '누르개 길게 누르기' }).focus()
  await page.keyboard.down('Space')
  await page.clock.runFor(900)
  await page.keyboard.up('Space')
  await page.clock.runFor(950)
  await page.getByRole('button', { name: '뒤집기' }).tap()
  await expect(page.getByRole('button', { name: '다시 굽기' })).toHaveAccessibleDescription(/너무 일찍 들어 반죽이 찢어졌어요/)
  await page.getByRole('button', { name: '다시 굽기' }).tap()
  await page.getByRole('button', { name: '반죽 옮기기' }).press('Enter')
  await page.getByRole('button', { name: '누르개 길게 누르기' }).focus()
  await page.keyboard.down('Space')
  await page.clock.runFor(1_350)
  await page.keyboard.up('Space')
  await page.clock.fastForward(2_990)
  await page.getByRole('button', { name: '뒤집기' }).tap()
  await page.clock.fastForward(2_990)
  await page.getByRole('button', { name: '꺼내기' }).tap()
  await expect(page.getByRole('heading', { name: '다시 구워주세요' })).toBeVisible()
  await expect(page.getByRole('button', { name: '다시 굽기' })).toHaveAccessibleDescription(/별 0개 · 2개가 필요해요/)
  await expect(page.getByRole('button', { name: '호떡 제출' })).toHaveCount(0)
  await page.getByRole('button', { name: '다시 굽기' }).tap()
  await expect(page.getByRole('button',{name:'반죽 옮기기'})).toBeEnabled()
  await expect(page.getByLabel('매출')).toHaveText('0원')
  await expect(page.getByLabel('하트 3개')).toBeVisible()
})

test('모바일 브라우저 높이가 경계를 넘어도 조리대가 갑자기 줄지 않는다', async ({page}) => {
  await page.setViewportSize({width:375,height:680})
  await page.goto('/')
  await page.getByRole('button',{name:'조작 방법'}).tap()
  const cooktop = page.locator('.cooktop')
  const before = await cooktop.boundingBox()
  await page.setViewportSize({width:375,height:681})
  const after = await cooktop.boundingBox()
  expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1)
})

for (const [width,height] of [[320,568],[360,681],[375,700],[390,740],[390,844],[844,390],[1280,800]]) {
  test(`주문과 조리대가 화면 안에 배치된다 (${width}×${height})`, async ({ page }) => {
    await page.clock.install()
    await page.setViewportSize({ width,height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    await page.getByLabel('닉네임').fill('시장손님')
    await page.getByRole('button', { name: '게임 시작' }).tap()
    await page.getByRole('button', { name: '건너뛰기' }).tap()
    const stove = await page.getByRole('button', { name: '반죽 젓기' }).boundingBox()
    const order = await page.getByRole('complementary', { name: '주문대' }).boundingBox()
    expect(stove).toBeTruthy()
    expect(order).toBeTruthy()
    expect(stove!.y+stove!.height).toBeLessThanOrEqual(height)
    if (width>=800) expect(order!.x+order!.width).toBeLessThan(stove!.x)
    else expect(order!.y+order!.height).toBeLessThan(stove!.y)
    await prepareWithKeyboard(page)
    async function expectGaugeOnScreen(name: string) {
      await page.evaluate(() => window.scrollTo(0, 0))
      const gauge = page.getByRole('progressbar', { name })
      await expect(gauge).toBeInViewport({ ratio: 1 })
    }
    await expectGaugeOnScreen('누르는 힘')
    await holdWithTouch(page)
    await expectGaugeOnScreen('굽기 정도')
    await page.clock.fastForward(2_600)
    await page.getByRole('button', { name: '뒤집기' }).tap()
    await expect(page.getByRole('heading', { name: '뒷면 굽기' })).toBeVisible()
    await expectGaugeOnScreen('굽기 정도')
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })
}
