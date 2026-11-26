import { test, expect, type Page, type Browser } from "@playwright/test";

// Same rationale as normal-mode.spec.ts's ASSERT_TIMEOUT -- this dev
// environment sees variable request latency (300ms-1.5s per request,
// worse right after a server restart).
const ASSERT_TIMEOUT = 15_000;

const EMAIL = process.env.E2E_PRESENTER_EMAIL ?? "kkamsi032@naver.com";
const PASSWORD = process.env.E2E_PRESENTER_PASSWORD ?? "2626221448ok?";

type GroupInfo = { id: string; name: string; pin: string };

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin");
}

// TEAM mode's quiz-authoring screen is now exactly QuizEditor (title +
// questions, same as NORMAL mode's /admin/quizzes/new) -- team count is
// no longer part of quiz authoring, it's collected separately at room-
// creation time (see createTeamRoomFromList below) so the same TEAM
// quiz can be reused across multiple rooms with a different team count
// each time.
async function createTeamQuiz(
  presenter: Page,
  title: string,
  questions: { text: string; correct: string; wrong: string }[],
) {
  await presenter.goto("/admin/quizzes/new-team");
  await presenter.fill('input[placeholder="퀴즈 제목"]', title);

  for (let i = 0; i < questions.length; i++) {
    if (i > 0) {
      await presenter.getByRole("button", { name: "문제 추가" }).click();
    }
    const q = questions[i];
    const card = presenter
      .locator("div.rounded-lg.border.border-zinc-200.bg-white.p-4")
      .nth(i);
    await card.locator('input[placeholder="질문을 입력하세요"]').fill(q.text);
    const options = card.locator('input[placeholder="보기 내용"]');
    await options.nth(0).fill(q.correct);
    await options.nth(1).fill(q.wrong);
    await card.getByLabel("정답으로 지정").first().check();
  }

  await presenter.getByRole("button", { name: "저장" }).click();
  await presenter.waitForURL("**/admin");
}

// Drives the /admin list row's "방 만들기" -> TeamGroupCountModal flow
// for a given quiz title, exactly like a presenter reusing a saved TEAM
// quiz would.
async function createTeamRoomFromList(
  presenter: Page,
  title: string,
  groupCount: number,
) {
  const row = presenter
    .locator("div")
    .filter({ hasText: title })
    .filter({ hasText: "방 만들기" })
    .last();
  await row.getByText("방 만들기").click();
  await presenter.locator('input[type="number"]').fill(String(groupCount));
  await presenter.getByRole("button", { name: "방 생성", exact: true }).click();
  await presenter.waitForURL(/\/admin\/rooms\/[0-9a-f-]+$/, { timeout: ASSERT_TIMEOUT });
  const roomUrl = presenter.url();
  await expect(presenter.getByText(/참가자 \d+명/)).toBeVisible({ timeout: ASSERT_TIMEOUT });
  const joinUrl = (
    await presenter.locator("code").filter({ hasText: /^http/ }).first().textContent()
  )!.trim();
  const groupsData = await presenter.evaluate(async () => {
    const roomId = location.pathname.split("/").pop();
    const r = await fetch(`/api/admin/rooms/${roomId}/groups`);
    return r.json();
  });
  const groups: GroupInfo[] = groupsData.groups.map((g: { id: string; name: string; pin: string }) => ({
    id: g.id,
    name: g.name,
    pin: g.pin,
  }));
  return { roomUrl, joinUrl, groups, allConfirmed: groupsData.allConfirmed };
}

async function joinTeam(browser: Browser, joinUrl: string, nickname: string, group: GroupInfo) {
  const member = await (await browser.newContext()).newPage();
  await member.goto(joinUrl);
  await member.fill('input[placeholder="닉네임"]', nickname);
  await member.click('button:has-text("참여하기")');
  await expect(member.getByText("소속 조를 선택해주세요")).toBeVisible({ timeout: ASSERT_TIMEOUT });
  await member.getByRole("button", { name: new RegExp(group.name) }).click({ timeout: ASSERT_TIMEOUT });
  await member.fill('input[inputmode="numeric"]', group.pin);
  await member.getByRole("button", { name: "입장하기" }).click();
  // TEAM teams are pre-created CONFIRMED -- there is no authoring
  // workspace to land in, just the normal waiting-room screen.
  await expect(member.getByText("대기실에 입장했습니다")).toBeVisible({ timeout: ASSERT_TIMEOUT });
  return member;
}

test.describe("team mode (팀전)", () => {
  test.setTimeout(120_000);

  test("presenter-authored questions, team+individual scoring, no spectator gating", async ({
    browser,
  }) => {
    const presenter = await browser.newPage();
    await login(presenter);

    const title = `팀전-${Date.now()}`;
    await createTeamQuiz(presenter, title, [
      { text: "팀전 문제1", correct: "정답1", wrong: "오답1" },
      { text: "팀전 문제2", correct: "정답2", wrong: "오답2" },
    ]);

    const { roomUrl, joinUrl, groups, allConfirmed } = await createTeamRoomFromList(
      presenter,
      title,
      3,
    );
    const [g1, g2] = groups;

    // --- R5-equivalent for TEAM: teams need no presenter review, so the
    // room is already start-ready the moment it's created. ---
    expect(groups).toHaveLength(3);
    expect(allConfirmed).toBe(true);

    const p1 = await joinTeam(browser, joinUrl, "P1", g1);
    const p2 = await joinTeam(browser, joinUrl, "P2", g2);

    await presenter.goto(roomUrl);
    // TEAM's LOBBY is the plain participant-list screen (not
    // GroupModeLobbyDashboard) -- there's nothing to confirm/reject.
    const startBtn = presenter.getByRole("button", { name: "퀴즈 시작" });
    await expect(startBtn).toBeEnabled({ timeout: ASSERT_TIMEOUT });
    await startBtn.click();
    await expect(presenter.getByText(/문제 1 \/ 2/)).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // --- No authoringGroup: the presenter wrote these questions, not a
    // team, so the authoring-group banner must stay hidden everywhere. ---
    const runStatus1 = await presenter.evaluate(async () => {
      const roomId = location.pathname.split("/").pop();
      const r = await fetch(`/api/admin/rooms/${roomId}/run-status`);
      return r.json();
    });
    expect(runStatus1.authoringGroup).toBeUndefined();

    // --- Every participant answers every question -- no spectator gate
    // exists for TEAM (source_group_id stays null on every run_question). ---
    for (const [member, answerText] of [
      [p1, "정답1"],
      [p2, "정답1"],
    ] as const) {
      await expect(member.getByText(/출제:/)).not.toBeVisible();
      await member.getByRole("button", { name: new RegExp(answerText) }).click();
      await member.getByRole("button", { name: "제출하기" }).click();
      await expect(member.getByText("제출 완료")).toBeVisible({ timeout: ASSERT_TIMEOUT });
    }

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
      // --- R6-equivalent for TEAM: team ranking shown alongside
      // individual ranking on every round, not just at FINISHED. ---
      await expect(presenter.getByText("조 순위")).toBeVisible({ timeout: ASSERT_TIMEOUT });

      const nextBtn = presenter.getByRole("button", { name: /다음 문제|퀴즈 종료/ });
      await expect(nextBtn).toBeVisible({ timeout: ASSERT_TIMEOUT });
      await nextBtn.click();

      // Question 2 only opens after the first "다음 문제" click (i===0) --
      // answer it now that presenter has actually advanced to QUESTION_OPEN.
      if (i === 0) {
        for (const member of [p1, p2]) {
          await member.getByRole("button", { name: new RegExp("정답2") }).click();
          await member.getByRole("button", { name: "제출하기" }).click();
          await expect(member.getByText("제출 완료")).toBeVisible({ timeout: ASSERT_TIMEOUT });
        }
      }
    }

    await expect(presenter.getByText("퀴즈가 종료되었습니다")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });

    // --- Every participant answered every question (no exclusion), and
    // team averages equal their single member's total (1 member/team here). ---
    const finalRunStatus = await presenter.evaluate(async () => {
      const roomId = location.pathname.split("/").pop();
      const r = await fetch(`/api/admin/rooms/${roomId}/run-status`);
      return r.json();
    });
    for (const row of finalRunStatus.leaderboard) {
      expect(row.answeredQuestions).toBe(2);
    }
    expect(finalRunStatus.groupScores).toHaveLength(3);
    for (const groupScore of finalRunStatus.groupScores) {
      if (groupScore.members.length === 0) continue;
      const memberTotal = finalRunStatus.leaderboard.find(
        (r: { nickname: string }) => r.nickname === groupScore.members[0].nickname,
      ).totalPoints;
      expect(groupScore.averageScore).toBe(memberTotal);
    }

    await p1.close();
    await p2.close();

    // --- Reuse: the same saved TEAM quiz can be used to create a
    // second room with a different team count, without re-entering any
    // question content -- this is the whole point of splitting quiz
    // authoring from room creation. ---
    await presenter.goto("/admin");
    const { groups: groups2 } = await createTeamRoomFromList(presenter, title, 5);
    expect(groups2).toHaveLength(5);

    await presenter.close();
  });
});
