import { test, expect, type Page } from "@playwright/test";

// This dev environment sees variable request latency under load
// (observed 300ms-1.5s per request, occasionally more right after a
// server restart) -- a generous shared timeout keeps the suite from
// flaking on slow-but-correct responses rather than genuine failures.
const ASSERT_TIMEOUT = 15_000;

// Credentials for the normal-mode regression suite's presenter account.
// Must belong to an existing Supabase Auth user with at least presenter
// access in this environment.
const EMAIL = process.env.E2E_PRESENTER_EMAIL ?? "kkamsi032@naver.com";
const PASSWORD = process.env.E2E_PRESENTER_PASSWORD ?? "2626221448ok?";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin");
}

test.describe("normal mode core flow (regression)", () => {
  test("create quiz -> room -> join -> play -> score -> results", async ({
    browser,
  }) => {
    const quizTitle = `회귀테스트 ${Date.now()}`;
    const presenter = await browser.newPage();

    // --- 1. Presenter login ---
    await login(presenter);

    // --- 2. Create a 1-question quiz (30s time limit, 2 options) ---
    // A generous limit absorbs this environment's variable request
    // latency (observed 300ms-1.5s per request under load) without the
    // "slow responder" step below racing the deadline.
    await presenter.goto("/admin/quizzes/new");
    await presenter.fill('input[placeholder="퀴즈 제목"]', quizTitle);
    const card = presenter
      .locator("div.rounded-lg.border.border-zinc-200.bg-white.p-4")
      .first();
    await card
      .locator('input[placeholder="질문을 입력하세요"]')
      .fill("회귀테스트 문제");
    await card.locator('input[type="number"]').first().fill("30");
    const optionInputs = card.locator('input[placeholder="보기 내용"]');
    await optionInputs.nth(0).fill("정답");
    await optionInputs.nth(1).fill("오답");
    await presenter.getByRole("button", { name: "저장" }).click();
    await presenter.waitForURL("**/admin");

    // --- 3. Create a room for it ---
    const row = presenter
      .locator("div")
      .filter({ hasText: quizTitle })
      .filter({ hasText: "방 만들기" })
      .last();
    await row.getByText("방 만들기").click();
    await presenter.waitForURL("**/admin/rooms/**");
    const joinUrl = (await presenter.locator("code").first().textContent())!.trim();

    // --- 4. Two participants join (separate contexts so each gets its own
    // qz_participant cookie jar, same as distinct devices would) ---
    const p1 = await (await browser.newContext()).newPage();
    const p2 = await (await browser.newContext()).newPage();

    await p1.goto(joinUrl);
    await p1.fill('input[placeholder="닉네임"]', "Reg1");
    await p1.click('button:has-text("참여하기")');

    await p2.goto(joinUrl);
    await p2.fill('input[placeholder="닉네임"]', "Reg2");
    await p2.click('button:has-text("참여하기")');

    await presenter.waitForTimeout(2000);

    // --- 5. Start button enables once participants join ---
    const startBtn = presenter.getByRole("button", { name: "퀴즈 시작" });
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    // Wait for the run to actually flip to QUESTION_OPEN server-side
    // before probing the late-join rejection -- otherwise a late joiner
    // can race the start request and land in LOBBY legitimately.
    await expect(presenter.getByText(/문제 1 \/ 1/)).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // --- 6. Participant joining after start is rejected ---
    const latePage = await (await browser.newContext()).newPage();
    await latePage.goto(joinUrl);
    await latePage.fill('input[placeholder="닉네임"]', "LateJoiner");
    await latePage.click('button:has-text("참여하기")');
    await expect(
      latePage.getByText("이미 시작된 퀴즈에는 새로 입장할 수 없습니다"),
    ).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await latePage.close();

    // --- 7. p1 answers fast (correct), p2 answers slowly (correct) ---
    await p1.waitForTimeout(500);
    await p1.getByRole("button", { name: "정답", exact: true }).click();
    await p1.getByRole("button", { name: "제출하기" }).click();
    await expect(p1.getByText("제출 완료")).toBeVisible({ timeout: ASSERT_TIMEOUT });

    await p2.waitForTimeout(6000);
    await p2.getByRole("button", { name: "정답", exact: true }).click();
    await p2.getByRole("button", { name: "제출하기" }).click();
    await expect(p2.getByText("제출 완료")).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // --- 8. Presenter reveals (QUESTION_OPEN -> REVEALED): bar chart with counts ---
    // Wait for the presenter's own 1s poll to catch up to both
    // submissions before revealing, rather than a fixed sleep.
    await expect(presenter.getByText(/제출 2 \/ 2/)).toBeVisible({ timeout: ASSERT_TIMEOUT });
    const revealBtn = presenter.getByRole("button", { name: "결과 보기" });
    // disabled briefly while a prior action's request is in flight --
    // wait for it to become clickable rather than racing a stale state.
    await expect(revealBtn).toBeEnabled({ timeout: ASSERT_TIMEOUT });
    await revealBtn.click();
    await expect(presenter.getByText(/정답자 2 \/ 2명/)).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // --- 9. Both participants already see their own result at reveal time ---
    await p1.waitForTimeout(1000);
    await expect(p1.getByText(/정답! \+\d+점/)).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await expect(p2.getByText(/정답! \+\d+점/)).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // --- 10. Score check: faster response scores higher than slower one ---
    const p1ScoreText = await p1.getByText(/정답! \+\d+점/).textContent();
    const p2ScoreText = await p2.getByText(/정답! \+\d+점/).textContent();
    const p1Score = Number(p1ScoreText!.match(/\+(\d+)/)![1]);
    const p2Score = Number(p2ScoreText!.match(/\+(\d+)/)![1]);
    expect(p1Score).toBeGreaterThan(p2Score);
    expect(p1Score).toBeLessThanOrEqual(1000);
    expect(p2Score).toBeGreaterThan(0);

    // --- 11. Presenter shows ranking (REVEALED -> LEADERBOARD) ---
    await presenter.getByRole("button", { name: "순위 보기" }).click();
    await presenter.waitForTimeout(500);

    // --- 12. Finish the quiz (single question -> FINISHED) ---
    await presenter.getByRole("button", { name: "퀴즈 종료" }).click();
    await expect(presenter.getByText("퀴즈가 종료되었습니다")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });

    await p1.close();
    await p2.close();
    await presenter.close();
  });

  test("no-submission scores zero", async ({ browser }) => {
    const quizTitle = `회귀테스트-미제출 ${Date.now()}`;
    const presenter = await browser.newPage();
    await login(presenter);

    await presenter.goto("/admin/quizzes/new");
    await presenter.fill('input[placeholder="퀴즈 제목"]', quizTitle);
    const card = presenter
      .locator("div.rounded-lg.border.border-zinc-200.bg-white.p-4")
      .first();
    await card
      .locator('input[placeholder="질문을 입력하세요"]')
      .fill("미제출 테스트 문제");
    await card.locator('input[type="number"]').first().fill("5");
    const optionInputs = card.locator('input[placeholder="보기 내용"]');
    await optionInputs.nth(0).fill("정답");
    await optionInputs.nth(1).fill("오답");
    await presenter.getByRole("button", { name: "저장" }).click();
    await presenter.waitForURL("**/admin");

    const row = presenter
      .locator("div")
      .filter({ hasText: quizTitle })
      .filter({ hasText: "방 만들기" })
      .last();
    await row.getByText("방 만들기").click();
    await presenter.waitForURL("**/admin/rooms/**");
    const joinUrl = (await presenter.locator("code").first().textContent())!.trim();

    const p1 = await (await browser.newContext()).newPage();
    await p1.goto(joinUrl);
    await p1.fill('input[placeholder="닉네임"]', "NoSubmit");
    await p1.click('button:has-text("참여하기")');

    await presenter.waitForTimeout(2000);
    await presenter.getByRole("button", { name: "퀴즈 시작" }).click();

    // QuestionDashboard auto-reveals once the countdown hits 0 (see
    // autoRevealedRef in QuestionDashboard.tsx) -- the 5s deadline passes
    // without submitting and the screen transitions on its own, so wait
    // for that result screen directly instead of a manual "결과 보기"
    // click, which may no longer be there by the time this runs.
    await expect(presenter.getByText(/정답자 0 \/ 1명/)).toBeVisible({
      timeout: ASSERT_TIMEOUT + 6500,
    });

    await p1.waitForTimeout(1000);
    await expect(p1.getByText("오답 또는 미제출")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });

    await p1.close();
    await presenter.close();
  });
});
