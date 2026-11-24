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

async function createGroupRoom(
  presenter: Page,
  title: string,
  groupCount: number,
  questionsPerGroup: number,
  timeLimitSeconds: number,
) {
  await presenter.goto("/admin/rooms/new-group");
  await presenter.fill('input[type="text"]', title);
  const numberInputs = presenter.locator('input[type="number"]');
  await numberInputs.nth(0).fill(String(groupCount));
  await numberInputs.nth(1).fill(String(questionsPerGroup));
  await numberInputs.nth(2).fill(String(timeLimitSeconds));
  await presenter.getByRole("button", { name: "방 생성" }).click();
  await presenter.waitForURL(/\/admin\/rooms\/[0-9a-f-]+$/, { timeout: ASSERT_TIMEOUT });
  const roomUrl = presenter.url();
  const joinUrl = (await presenter.locator("code").first().textContent())!.trim();
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
  return { roomUrl, joinUrl, groups };
}

async function joinGroup(browser: Browser, joinUrl: string, nickname: string, group: GroupInfo) {
  const member = await (await browser.newContext()).newPage();
  await member.goto(joinUrl);
  await member.fill('input[placeholder="닉네임"]', nickname);
  await member.click('button:has-text("참여하기")');
  await expect(member.getByText("소속 조를 선택해주세요")).toBeVisible({ timeout: ASSERT_TIMEOUT });
  await member.getByRole("button", { name: new RegExp(group.name) }).click({ timeout: ASSERT_TIMEOUT });
  await member.fill('input[inputmode="numeric"]', group.pin);
  await member.getByRole("button", { name: "입장하기" }).click();
  await expect(member.getByText("문제 작성")).toBeVisible({ timeout: ASSERT_TIMEOUT });
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
  // The first keystroke optimistically renders editingDraft (and the
  // "저장" button) immediately, but also kicks off a lock-acquire POST
  // in the background -- handleSave is a silent no-op until that
  // resolves and sets lockVersion, so wait for the actual response
  // rather than guessing a delay.
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

async function submitGroup(page: Page) {
  const submitBtn = page.getByRole("button", { name: "제출하기" });
  await expect(submitBtn).toBeEnabled({ timeout: ASSERT_TIMEOUT });
  page.once("dialog", (d) => d.accept());
  await submitBtn.click();
  await expect(page.getByText("제출됨 (검토 중)")).toBeVisible({ timeout: ASSERT_TIMEOUT });
}

async function confirmAllGroups(presenter: Page, roomUrl: string, groupCount: number) {
  for (let i = 0; i < groupCount; i++) {
    await presenter.goto(roomUrl);
    await presenter.waitForTimeout(1000);
    await presenter.getByRole("button", { name: "확정", exact: true }).first().click();
    await presenter.waitForTimeout(800);
  }
}

test.describe("group mode (조별모드)", () => {
  test.setTimeout(120_000);

  test("spectator gating, flatten order, next-authoring-group banner", async ({ browser }) => {
    const presenter = await browser.newPage();
    await login(presenter);

    const { roomUrl, joinUrl, groups } = await createGroupRoom(
      presenter,
      `조별모드-G1-${Date.now()}`,
      3,
      1,
      15,
    );
    const [g1, g2, g3] = groups;

    const members = [];
    for (const [idx, group] of [g1, g2, g3].entries()) {
      const m = await joinGroup(browser, joinUrl, `M${idx + 1}`, group);
      await fillAndSaveSlot(m, 0, `${group.name}의 문제`, `${group.name} 정답`, `${group.name} 오답`);
      await submitGroup(m);
      members.push(m);
    }

    await confirmAllGroups(presenter, roomUrl, 3);

    await presenter.goto(roomUrl);
    await expect(presenter.getByRole("button", { name: "게임 시작" })).toBeEnabled({
      timeout: ASSERT_TIMEOUT,
    });
    await presenter.getByRole("button", { name: "게임 시작" }).click();
    await expect(presenter.getByText(/문제 1 \/ 3/)).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // --- The run flattened all 3 groups' 1 slot each into 3 questions,
    // each tagged with its authoring group (R2/8-3). ---
    const runStatus1 = await presenter.evaluate(async () => {
      const roomId = location.pathname.split("/").pop();
      const r = await fetch(`/api/admin/rooms/${roomId}/run-status`);
      return r.json();
    });
    expect(runStatus1.totalQuestions).toBe(3);
    expect(runStatus1.authoringGroup?.name).toBeTruthy();

    const authorName = runStatus1.authoringGroup.name as string;
    const authorIdx = [g1, g2, g3].findIndex((g) => g.name === authorName);
    const authorMember = members[authorIdx];
    const nonAuthorIdx = (authorIdx + 1) % 3;
    const nonAuthorMember = members[nonAuthorIdx];

    // --- R2: the author's own member is a spectator on their group's
    // question -- no answer input, excluded from scoring. ---
    await expect(authorMember.getByText("우리 조 문제 · 관전 중")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });

    // --- A non-author member sees the authoring-group banner and can
    // answer normally. ---
    await expect(nonAuthorMember.getByText(new RegExp(`출제: ${authorName}`))).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
    await nonAuthorMember
      .getByRole("button", { name: new RegExp(`${authorName} 정답`) })
      .click();
    await nonAuthorMember.getByRole("button", { name: "제출하기" }).click();
    await expect(nonAuthorMember.getByText("제출 완료")).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // --- The spectator cannot answer their own group's question even via
    // a raw API call (server-side enforcement, not just UI hiding). ---
    const forceSubmitResult = await authorMember.evaluate(async () => {
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
    expect(forceSubmitResult.body.error).toContain("자신의 조가 출제한 문제");

    // --- Presenter advances through all 3 questions; the last two rounds'
    // LEADERBOARD screen announces the next authoring group (D3), and no
    // such banner remains once the last question's results are shown. ---
    for (let i = 0; i < 3; i++) {
      const revealBtn = presenter.getByRole("button", { name: "결과 보기" });
      await expect(revealBtn).toBeVisible({ timeout: ASSERT_TIMEOUT });
      await revealBtn.click();

      const rankingBtn = presenter.getByRole("button", { name: "순위 보기" });
      await expect(rankingBtn).toBeVisible({ timeout: ASSERT_TIMEOUT });
      await rankingBtn.click();
      await expect(presenter.getByText("이번 라운드 순위")).toBeVisible({
        timeout: ASSERT_TIMEOUT,
      });

      if (i < 2) {
        await expect(presenter.getByText(/다음: .+ 출제/)).toBeVisible({
          timeout: ASSERT_TIMEOUT,
        });
      }

      const nextBtn = presenter.getByRole("button", { name: /다음 문제|퀴즈 종료/ });
      await expect(nextBtn).toBeVisible({ timeout: ASSERT_TIMEOUT });
      await nextBtn.click();
    }

    await expect(presenter.getByText("퀴즈가 종료되었습니다")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });

    for (const m of members) await m.close();
    await presenter.close();
  });

  test("group-aware answeredQuestions and group-average score", async ({ browser }) => {
    test.setTimeout(180_000);
    const presenter = await browser.newPage();
    await login(presenter);

    const { roomUrl, joinUrl, groups } = await createGroupRoom(
      presenter,
      `조별모드-G2-${Date.now()}`,
      3,
      2,
      15,
    );
    const [g1, g2, g3] = groups;

    const members = [];
    for (const [idx, group] of [g1, g2, g3].entries()) {
      const m = await joinGroup(browser, joinUrl, `M${idx + 1}`, group);
      await fillAndSaveSlot(m, 0, `${group.name}의 문제1`, `${group.name} 정답1`, `${group.name} 오답1`);
      await fillAndSaveSlot(m, 1, `${group.name}의 문제2`, `${group.name} 정답2`, `${group.name} 오답2`);
      await submitGroup(m);
      members.push(m);
    }

    await confirmAllGroups(presenter, roomUrl, 3);

    await presenter.goto(roomUrl);
    await presenter.getByRole("button", { name: "게임 시작" }).click();
    await expect(presenter.getByText(/문제 1 \/ 6/)).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // Every non-author member answers every question correctly.
    for (let q = 0; q < 6; q++) {
      const runStatus = await presenter.evaluate(async () => {
        const roomId = location.pathname.split("/").pop();
        const r = await fetch(`/api/admin/rooms/${roomId}/run-status`);
        return r.json();
      });
      const authorName = runStatus.authoringGroup?.name;
      const authorIdx = [g1, g2, g3].findIndex((g) => g.name === authorName);

      for (let mi = 0; mi < members.length; mi++) {
        if (mi === authorIdx) continue;
        const member = members[mi];
        // The question just opened server-side (or is about to) -- a
        // member's own /state read can race that transition, so retry
        // briefly rather than silently skipping this member's answer.
        let stateRes;
        for (let attempt = 0; attempt < 10; attempt++) {
          stateRes = await member.evaluate(async () => {
            const joinCode = location.pathname.split("/")[2];
            const r = await fetch(`/room/${joinCode}/state`);
            return r.json();
          });
          if (stateRes.status === "QUESTION_OPEN" && stateRes.question) break;
          await member.waitForTimeout(300);
        }
        if (stateRes.status !== "QUESTION_OPEN" || !stateRes.question) {
          throw new Error(
            `member ${mi} never saw QUESTION_OPEN for question ${q} (last status: ${stateRes.status})`,
          );
        }
        const correctOpt = stateRes.question.options.find((o: { text: string }) =>
          new RegExp(`${authorName} 정답`).test(o.text),
        );
        await member.evaluate(
          async ({ joinCode, runQuestionId, optionId }) => {
            await fetch(`/room/${joinCode}/answer`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ runQuestionId, selectedOptionId: optionId }),
            });
          },
          {
            joinCode: member.url().split("/")[4],
            runQuestionId: stateRes.question.id,
            optionId: correctOpt ? correctOpt.id : stateRes.question.options[0].id,
          },
        );
      }

      const revealBtn = presenter.getByRole("button", { name: "결과 보기" });
      await expect(revealBtn).toBeVisible({ timeout: ASSERT_TIMEOUT });
      await revealBtn.click();
      const rankingBtn = presenter.getByRole("button", { name: "순위 보기" });
      await expect(rankingBtn).toBeVisible({ timeout: ASSERT_TIMEOUT });
      await rankingBtn.click();
      await expect(presenter.getByText("이번 라운드 순위")).toBeVisible({
        timeout: ASSERT_TIMEOUT,
      });

      const nextBtn = presenter.getByRole("button", { name: /다음 문제|퀴즈 종료/ });
      await expect(nextBtn).toBeVisible({ timeout: ASSERT_TIMEOUT });
      await nextBtn.click();
    }

    await expect(presenter.getByText("퀴즈가 종료되었습니다")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });

    // --- R2: every participant's answeredQuestions === (groupCount-1)*K,
    // never the run's full closed-question count (6). ---
    const finalRunStatus = await presenter.evaluate(async () => {
      const roomId = location.pathname.split("/").pop();
      const r = await fetch(`/api/admin/rooms/${roomId}/run-status`);
      return r.json();
    });
    for (const row of finalRunStatus.leaderboard) {
      expect(row.answeredQuestions).toBe((3 - 1) * 2);
      expect(row.correctCount).toBe((3 - 1) * 2);
    }

    // --- R6: each group's score is its game-start member snapshot's
    // average -- with exactly 1 member per group here, that average
    // equals the member's own total. ---
    expect(finalRunStatus.groupScores).toHaveLength(3);
    for (const groupScore of finalRunStatus.groupScores) {
      const memberTotal = finalRunStatus.leaderboard.find(
        (r: { nickname: string }) => r.nickname === groupScore.members[0].nickname,
      ).totalPoints;
      expect(groupScore.averageScore).toBe(memberTotal);
    }

    for (const m of members) await m.close();
    await presenter.close();
  });

  test("presenter review cycle: reject, resubmit, move member, force-release lock, direct edit", async ({
    browser,
  }) => {
    const presenter = await browser.newPage();
    await login(presenter);

    const { roomUrl, joinUrl, groups } = await createGroupRoom(
      presenter,
      `조별모드-G3-${Date.now()}`,
      3,
      1,
      15,
    );
    const [g1, g2, g3] = groups;

    // --- Move-member: before anyone submits, presenter can move a
    // member between groups. ---
    const mover = await joinGroup(browser, joinUrl, "Mover", g1);
    await presenter.goto(roomUrl);
    await expect(presenter.getByRole("button", { name: "이동" }).first()).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
    await presenter.getByRole("button", { name: "이동" }).first().click();
    const moveModal = presenter.locator("div.fixed.inset-0");
    await moveModal.locator("select").selectOption({ label: g2.name });
    const moveResponse = presenter.waitForResponse(
      (res) => /\/move-member$/.test(res.url()) && res.request().method() === "POST",
    );
    await moveModal.getByRole("button", { name: "이동", exact: true }).click();
    await moveResponse;
    const groupsAfterMove = await presenter.evaluate(async () => {
      const roomId = location.pathname.split("/").pop();
      const r = await fetch(`/api/admin/rooms/${roomId}/groups`);
      return r.json();
    });
    const moverGroup = groupsAfterMove.groups.find((g: { members: { nickname: string }[] }) =>
      g.members.some((m) => m.nickname === "Mover"),
    );
    expect(moverGroup?.name).toBe(g2.name);

    // --- Force-release lock: Mover (now in g2) starts typing (acquiring
    // the lock) but never saves; presenter force-releases it. The
    // workspace's own 2s poll picks up the server-side group change
    // without a page reload -- wait for that before interacting. ---
    await expect(mover.getByText(`${g2.name} 문제 작성`)).toBeVisible({ timeout: ASSERT_TIMEOUT });
    const qInput = mover.locator('input[placeholder="질문을 입력하세요"]').first();
    const lockResponse = mover.waitForResponse(
      (res) => /\/group\/slot\/[^/]+\/lock$/.test(res.url()) && res.request().method() === "POST",
    );
    await qInput.fill("잠금 테스트 중");
    await lockResponse;
    await presenter.goto(roomUrl);
    await expect(presenter.getByText(/Mover님 편집 중/)).toBeVisible({ timeout: ASSERT_TIMEOUT });
    await presenter.getByRole("button", { name: "강제 해제" }).first().click();
    await expect(presenter.getByText(/Mover님 편집 중/)).not.toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });

    // --- Reject cycle: g3 submits, presenter rejects with a comment,
    // member sees it and can resubmit. ---
    const m3 = await joinGroup(browser, joinUrl, "M3", g3);
    await fillAndSaveSlot(m3, 0, `${g3.name}의 문제`, `${g3.name} 정답`, `${g3.name} 오답`);
    await submitGroup(m3);

    await presenter.goto(roomUrl);
    await expect(presenter.getByRole("button", { name: "반려" }).first()).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
    await presenter.getByRole("button", { name: "반려" }).first().click();
    const rejectModal = presenter.locator("div.fixed.inset-0");
    await rejectModal.locator("textarea").fill("문제를 더 명확하게 작성해주세요");
    await rejectModal.getByRole("button", { name: "반려", exact: true }).click();
    const g3Card = presenter
      .locator("div.rounded-lg.border.border-zinc-200.bg-white.p-4")
      .filter({ hasText: g3.name });
    await expect(g3Card.getByText("작성 중")).toBeVisible({ timeout: ASSERT_TIMEOUT });

    // m3 never navigated away from its workspace -- its own 2s poll
    // picks up the rejection comment live, no reload needed.
    await expect(m3.getByText("문제를 더 명확하게 작성해주세요")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });

    // --- Presenter direct-edit: resubmit, then presenter edits the slot
    // content directly while SUBMITTED. ---
    await submitGroup(m3);
    await presenter.goto(roomUrl);
    await expect(presenter.getByRole("button", { name: "직접 수정" }).first()).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
    await presenter.getByRole("button", { name: "직접 수정" }).first().click();
    const editModal = presenter.locator("div.fixed.inset-0");
    await editModal.locator('input[placeholder="질문을 입력하세요"]').first().fill("진행자가 수정한 문제");
    await editModal.getByRole("button", { name: "저장" }).click();
    await expect(presenter.getByText("진행자가 수정한 문제")).toBeVisible({
      timeout: ASSERT_TIMEOUT,
    });
    await expect(presenter.getByText("진행자 수정됨")).toBeVisible({ timeout: ASSERT_TIMEOUT });

    await mover.close();
    await m3.close();
    await presenter.close();
  });
});
