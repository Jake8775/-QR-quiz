import { test, expect, type Page, type Browser } from "@playwright/test";

// Same rationale as normal-mode.spec.ts's ASSERT_TIMEOUT -- this dev
// environment sees variable request latency (300ms-1.5s per request,
// worse right after a server restart).
const ASSERT_TIMEOUT = 15_000;

const EMAIL = process.env.E2E_PRESENTER_EMAIL ?? "kkamsi032@naver.com";
const PASSWORD = process.env.E2E_PRESENTER_PASSWORD ?? "2626221448ok?";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin");
}

async function createSoloRoom(
  presenter: Page,
  topic: string,
  questionsPerPerson: number,
  timeLimitSeconds: number,
) {
  await presenter.goto("/admin/rooms/new-solo");
  await presenter.fill('input[placeholder="예: 자기소개"]', topic);
  const numberInputs = presenter.locator('input[type="number"]');
  await numberInputs.nth(0).fill(String(questionsPerPerson));
  await numberInputs.nth(1).fill(String(timeLimitSeconds));
  await presenter.getByRole("button", { name: "방 생성" }).click();
  await presenter.waitForURL(/\/admin\/rooms\/[0-9a-f-]+$/, { timeout: ASSERT_TIMEOUT });
  const roomUrl = presenter.url();
  // SOLO's LOBBY (GroupModeLobbyDashboard branch) has no "참가자 N명"
  // text -- that only exists in the plain-NORMAL LOBBY branch -- so wait
  // for the start button instead.
  await expect(presenter.getByRole("button", { name: "게임 시작" })).toBeVisible({
    timeout: ASSERT_TIMEOUT,
  });
  const joinUrl = (
    await presenter.locator("code").filter({ hasText: /^http/ }).first().textContent()
  )!.trim();
  return { roomUrl, joinUrl };
}

// SOLO has no team-selection/PIN step -- nickname join goes straight
// into the authoring workspace, with the participant's own nickname as
// their 1-person "group" name.
async function joinSolo(browser: Browser, joinUrl: string, nickname: string) {
  const member = await (await browser.newContext()).newPage();
  await member.goto(joinUrl);
  await member.fill('input[placeholder="닉네임"]', nickname);
  await member.click('button:has-text("참여하기")');
  await expect(member.getByText("소속 조를 선택해주세요")).not.toBeVisible();
  await expect(member.getByText(`${nickname} 문제 작성`)).toBeVisible({ timeout: ASSERT_TIMEOUT });
  return member;
}

async function fillAndSaveSlot(
  page: Page,
  cardIndex: number,
  questionText: string,
  correctText: string,
  wrongText: string,
) {
  const card = page.locator("div.rounded-lg.border.border-zinc-200.bg-white.p-4").nth(cardIndex);
  const lockResponse = page.waitForResponse(
    (res) => /\/group\/slot\/[^/]+\/lock$/.test(res.url()) && res.request().method() === "POST",
  );
  await card.locator('input[placeholder="질문을 입력하세요"]').fill(questionText);
  await lockResponse;
  const options = card.locator('input[placeholder="보기 내용"]');
  await options.nth(0).fill(correctText);
  await options.nth(1).fill(wrongText);
  await card.getByLabel("정답으로 지정").first().check();
  await page.getByRole("button", { name: "저장" }).first().click();
  await page.waitForFunction(
    (idx) => {
      const m = (document.body.textContent || "").match(/완성 문제 (\d+)/);
      return m && Number(m[1]) >= idx + 1;
    },
    cardIndex,
    { timeout: ASSERT_TIMEOUT },
  );
}

async function submitSlots(page: Page) {
  const submitBtn = page.getByRole("button", { name: "제출하기" });
  await expect(submitBtn).toBeEnabled({ timeout: ASSERT_TIMEOUT });
  page.once("dialog", (d) => d.accept());
  await submitBtn.click();
  await expect(page.getByText("제출됨 (검토 중)")).toBeVisible({ timeout: ASSERT_TIMEOUT });
}

test.describe("solo mode (개인별 출제전)", () => {
  test.setTimeout(120_000);

  test("no PIN step, PIN/move UI hidden for presenter, spectator gating, no team ranking", async ({
    browser,
  }) => {
    const presenter = await browser.newPage();
    await login(presenter);

    const { roomUrl, joinUrl } = await createSoloRoom(presenter, `개인별-${Date.now()}`, 1, 15);

    const m1 = await joinSolo(browser, joinUrl, "M1");
    const m2 = await joinSolo(browser, joinUrl, "M2");

    await fillAndSaveSlot(m1, 0, "M1의 문제", "M1 정답", "M1 오답");
    await submitSlots(m1);
    await fillAndSaveSlot(m2, 0, "M2의 문제", "M2 정답", "M2 오답");
    await submitSlots(m2);

    // --- Presenter review: PIN UI and "이동" must both be absent (a
    // 1-person group has no PIN to enter and nowhere meaningful to
    // move its only member). ---
    await presenter.goto(roomUrl);
    await expect(presenter.getByText("제출됨 (검토 중)").first()).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
    await expect(presenter.getByText("PIN 확인")).not.toBeVisible();
    await expect(presenter.getByRole("button", { name: "이동" })).not.toBeVisible();

    for (let i = 0; i < 2; i++) {
      await presenter.goto(roomUrl);
      await presenter.waitForTimeout(1000);
      await presenter.getByRole("button", { name: "확정", exact: true }).first().click();
      await presenter.waitForTimeout(800);
    }

    await presenter.goto(roomUrl);
    await expect(presenter.getByRole("button", { name: "게임 시작" })).toBeEnabled({
      timeout: ASSERT_TIMEOUT,
    });
    await presenter.getByRole("button", { name: "게임 시작" }).click();
    await expect(presenter.getByText(/문제 1 \/ 2/)).toBeVisible({ timeout: ASSERT_TIMEOUT });

    const runStatus1 = await presenter.evaluate(async () => {
      const roomId = location.pathname.split("/").pop();
      const r = await fetch(`/api/admin/rooms/${roomId}/run-status`);
      return r.json();
    });
    expect(runStatus1.totalQuestions).toBe(2);
    const authorName1 = runStatus1.authoringGroup?.name as string;
    const authorMember1 = authorName1 === "M1" ? m1 : m2;
    const otherMember1 = authorName1 === "M1" ? m2 : m1;

    // --- R2-equivalent for SOLO: the author is a spectator on their
    // own question; everyone else answers normally. ---
    await expect(authorMember1.getByText("우리 조 문제 · 관전 중")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
    await expect(otherMember1.getByText(new RegExp(`출제: ${authorName1}`))).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
    await otherMember1
      .getByRole("button", { name: new RegExp(`${authorName1} 정답`) })
      .click();
    await otherMember1.getByRole("button", { name: "제출하기" }).click();
    await expect(otherMember1.getByText("제출 완료")).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // --- Server-side enforcement, not just UI hiding. ---
    const forceSubmitResult = await authorMember1.evaluate(async () => {
      const joinCode = location.pathname.split("/")[2];
      const stateRes = await fetch(`/room/${joinCode}/state`);
      const state = await stateRes.json();
      const r = await fetch(`/room/${joinCode}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runQuestionId: state.question.id,
          selectedOptionId: state.question.options[0].id,
        }),
      });
      return { status: r.status, body: await r.json() };
    });
    expect(forceSubmitResult.status).toBe(403);

    for (let i = 0; i < 2; i++) {
      const revealBtn = presenter.getByRole("button", { name: "결과 보기" });
      await expect(revealBtn).toBeVisible({ timeout: ASSERT_TIMEOUT });
      await revealBtn.click();
      const rankingBtn = presenter.getByRole("button", { name: "순위 보기" });
      await expect(rankingBtn).toBeVisible({ timeout: ASSERT_TIMEOUT });
      await rankingBtn.click();
      await expect(presenter.getByText("이번 라운드 순위")).toBeVisible({
        timeout: ASSERT_TIMEOUT,
      });
      // --- Core requirement: SOLO never shows a team/조 ranking,
      // unlike GROUP/TEAM. ---
      await expect(presenter.getByText("조 순위")).not.toBeVisible();

      const nextBtn = presenter.getByRole("button", { name: /다음 문제|퀴즈 종료/ });
      await expect(nextBtn).toBeVisible({ timeout: ASSERT_TIMEOUT });
      await nextBtn.click();

      if (i === 0) {
        await expect(presenter.getByText(/문제 2 \//)).toBeVisible({ timeout: ASSERT_TIMEOUT });
        const runStatus2 = await presenter.evaluate(async () => {
          const roomId = location.pathname.split("/").pop();
          const r = await fetch(`/api/admin/rooms/${roomId}/run-status`);
          return r.json();
        });
        const authorName2 = runStatus2.authoringGroup?.name as string;
        const otherMember2 = authorName2 === "M1" ? m2 : m1;
        await expect(
          otherMember2.getByText(new RegExp(`출제: ${authorName2}`)),
        ).toBeVisible({ timeout: ASSERT_TIMEOUT });
        await otherMember2
          .getByRole("button", { name: new RegExp(`${authorName2} 정답`) })
          .click();
        await otherMember2.getByRole("button", { name: "제출하기" }).click();
        await expect(otherMember2.getByText("제출 완료")).toBeVisible({
          timeout: ASSERT_TIMEOUT,
        });
      }
    }

    await expect(presenter.getByText("퀴즈가 종료되었습니다")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
    // --- FINISHED screen must also never show team ranking for SOLO. ---
    await expect(presenter.getByText("조 순위")).not.toBeVisible();

    const finalRunStatus = await presenter.evaluate(async () => {
      const roomId = location.pathname.split("/").pop();
      const r = await fetch(`/api/admin/rooms/${roomId}/run-status`);
      return r.json();
    });
    expect(finalRunStatus.groupScores).toBeUndefined();
    for (const row of finalRunStatus.leaderboard) {
      // (groupCount-1)*K = (2-1)*1 = 1 -- each of the 2 participants
      // answers only the other's single question, never their own.
      expect(row.answeredQuestions).toBe(1);
    }

    await m1.close();
    await m2.close();
    await presenter.close();
  });
});
