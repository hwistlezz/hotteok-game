import { expect, test, type Page } from '@playwright/test'

async function cookOne(page: Page) {
  for (let index = 0; index < 8; index += 1) {
    await page.getByRole('button', { name: '반죽 둥글리기' }).tap()
  }
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

async function holdWithTouch(page: Page) {
  const target = page.getByRole('button', { name: '누르개 길게 누르기' })
  const box = await target.boundingBox()
  if (!box) throw new Error('누르개가 표시되지 않았습니다.')
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }],
  })
  await page.clock.runFor(900)
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await client.detach()
}

test('모바일에서 연습을 완료하고 일시정지 뒤 재개한다', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button', { name: '조작 방법' }).tap()
  await page.getByRole('button', { name: '일시정지' }).tap()
  await page.clock.fastForward(22_000)
  await expect(page.getByRole('dialog', { name: '일시정지' })).toBeVisible()
  await page.getByRole('button', { name: '재개' }).tap()
  for (let index = 0; index < 8; index += 1) {
    await page.getByRole('button', { name: '반죽 둥글리기' }).tap()
  }
  await holdWithTouch(page)
  await expect(page.getByRole('heading', { name: '앞면 굽기' })).toBeVisible()
  await page.clock.fastForward(2_600)
  await page.getByRole('button', { name: '뒤집기' }).tap()
  await page.clock.fastForward(2_600)
  await page.getByRole('button', { name: '꺼내기' }).tap()
  await page.getByRole('button', { name: '호떡 제출' }).tap()
  await expect(page.getByRole('heading', { name: '연습 완료!' })).toBeVisible()
  await page.getByRole('button', { name: '처음으로 돌아가기' }).tap()
  await expect(page.getByRole('heading', { name: '호떡 만들기' })).toBeVisible()
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
  for (const duration of [28_050, 28_050, 38_050]) {
    await page.clock.fastForward(duration)
  }
  await expect(page.getByRole('heading', { name: '오늘 장사 끝!' })).toBeVisible()

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
  await page.getByRole('button', { name: '랭킹에 등록' }).tap()
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
  expect((await ranking.json()).entries).toEqual([{ nickname, score: 2_000 }, { nickname: tieName, score: 2_000 }])
  await page.getByRole('button', { name: '랭킹 보기' }).tap()
  await expect(page.getByRole('listitem').filter({ hasText: nickname })).toBeVisible()
  await page.getByRole('button', { name: '돌아가기' }).tap()
  await page.getByRole('button', { name: '다시 시작' }).tap()
  await expect(page.getByLabel('매출')).toHaveText('0원')
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
