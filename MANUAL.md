# QR Quiz 프로젝트 매뉴얼

이 문서는 이 프로젝트를 구성하는 각 서비스(Supabase, Vercel, GitHub)의 역할과
전체 작업 흐름을 정리한 안내서입니다.

---

## 1. 한눈에 보는 전체 구조

```
[로컬 PC: 코드 작성]
        |
        | git commit, git push
        v
[GitHub: 코드 저장소]
        |
        | push를 감지해서 자동으로 빌드+배포
        v
[Vercel: 실행 서버 / 호스팅]
        |
        | 코드가 데이터를 읽고 쓸 때마다 호출
        v
[Supabase: 데이터베이스 + 로그인 인증]
        |
        v
[실제 유저 (진행자 PC, 참가자 폰)]
```

이 프로젝트는 Python이 전혀 없고, 전부 **TypeScript(Next.js)** 로 작성되어 있습니다.
화면(UI)과 서버 로직(DB 접근, 인증 등)이 같은 코드 안에 같이 들어있는 구조입니다
(Next.js "App Router" 방식).

---

## 2. 각 서비스의 역할

### 2-1. GitHub — 코드 저장소

- 이 프로젝트의 모든 소스코드가 저장되는 곳.
- `git push`로 코드를 올리면, Vercel이 그 변화를 자동으로 감지합니다.
- 저장소 주소: `https://github.com/Jake8775/-QR-quiz`

### 2-2. Vercel — 배포 / 호스팅 (실행 서버)

- GitHub에 올라온 코드를 실제로 "실행"시켜서 인터넷에서 접속 가능한 웹사이트로 만들어주는 곳.
- 로컬에서 `npm run dev`로 띄우는 것과 똑같은 걸, Vercel이 24시간 켜진 서버에서 대신 돌려주는 개념.
- **코드 자체는 저장하지 않고**, GitHub에서 매번 최신 코드를 가져와 빌드함.
- 현재 운영 주소: `https://qr-quiz-nu.vercel.app`
- **환경변수(Environment Variables)** 를 별도로 등록해야 함 — 로컬의 `.env.local` 파일과는
  별개로, Vercel 프로젝트 설정(Settings → Environment Variables)에서 Supabase 키를
  직접 입력해둬야 코드가 Supabase에 접속할 수 있음.

### 2-3. Supabase — 데이터베이스 + 로그인 인증

Supabase는 세 가지 역할을 동시에 함:

1. **Postgres 데이터베이스** — 퀴즈, 방(room), 참가자, 답변, 점수 등 모든 데이터가 저장되는 곳.
2. **로그인 인증(Auth)** — 진행자(presenter) 계정의 이메일/비밀번호 로그인을 처리.
3. **RLS(Row Level Security)** — "누가 어떤 데이터를 볼 수 있는지"를 DB 차원에서 강제하는 보안 규칙.
   예: 참가자는 정답 데이터(`answer_keys` 테이블)를 절대 읽을 수 없도록 설계되어 있음.

Supabase 프로젝트 URL: `https://sbqbigqdixaebrozgfgs.supabase.co`

---

## 3. Supabase 키 3종 — 각각 무엇을 하는가

`.env.local` 파일과 Vercel 환경변수에 들어가는 값들입니다.

| 변수명 | 용도 | 노출 가능 여부 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 주소 | 브라우저에 노출됨 (문제 없음) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 일반 사용자(로그인한 진행자) 권한. RLS 규칙을 그대로 적용받음 | 브라우저에 노출됨 (RLS로 보호되므로 안전) |
| `SUPABASE_SERVICE_ROLE_KEY` | **RLS를 완전히 무시하는 만능 키.** 참가자처럼 로그인 계정이 없는 경우, 서버 코드에서만 사용 | **절대 브라우저/클라이언트에 노출되면 안 됨** |

> `NEXT_PUBLIC_` 접두사가 붙은 변수는 빌드 시점에 코드 안에 그대로 박혀서 브라우저에서도 보이게 됩니다.
> 그래서 `SUPABASE_SERVICE_ROLE_KEY`에는 절대 이 접두사를 붙이면 안 됩니다 (실제로도 안 붙어있음).

코드에서 이 두 권한은 파일로 분리되어 있습니다:
- `src/lib/supabase/server.ts`, `src/lib/supabase/client.ts` → anon key 사용 (RLS 적용)
- `src/lib/supabase/admin.ts` → service role key 사용 (RLS 무시, 서버 전용)

---

## 4. "진행자" vs "참가자" — 권한이 완전히 다름

이 앱에는 두 종류의 사용자가 있고, 인증 방식이 전혀 다릅니다.

| | 진행자 (Presenter) | 참가자 (Participant) |
|---|---|---|
| 계정 | Supabase Auth 이메일/비밀번호 로그인 | 계정 없음, 닉네임만 입력 |
| 식별 방법 | Supabase 세션 쿠키 (자동 관리) | `qz_participant` 쿠키 (앱이 직접 발급) |
| DB 접근 방식 | `anon key` + RLS 규칙 적용 | 서버 코드가 `service role key`로 대리 접근 |
| 접근 가능 데이터 | 자기가 만든 퀴즈/방만 | 본인이 입장한 방의 현재 문제/결과만 |

참가자는 로그인 계정이 없기 때문에, 참가자가 쓰는 모든 기능
(`/room/[joinCode]/...` 경로)은 서버 코드 안에서 `createAdminClient()`
(service role key)를 사용해서, 쿠키에 담긴 `participant_session_id`가
맞는지 서버가 직접 검증합니다.

---

## 5. 실제 작업 흐름 (코드 수정 → 배포까지)

### 5-1. 로컬에서 개발/테스트

```
npm run dev
```
→ `http://localhost:3000`에서 직접 확인. 이때는 `.env.local`의 값을 사용함.

### 5-2. 빌드 확인 (배포 전 최종 점검)

```
npm run build
```
→ 타입 에러, 빌드 에러가 없는지 확인. Vercel도 내부적으로 똑같은 빌드를 돌림.

### 5-3. GitHub에 올리기

```
git add -A
git commit -m "변경 내용 설명"
git push origin main
```

### 5-4. Vercel 자동 배포

- `git push`가 되는 순간, Vercel이 자동으로 감지해서 새로 빌드 + 배포를 시작함 (보통 1~2분).
- 사람이 Vercel 사이트에서 따로 "배포" 버튼을 누를 필요 없음.
- 배포 완료 여부는 Vercel 대시보드의 **Deployments** 탭에서 확인 가능.

### 5-5. 운영 사이트 확인

- `https://qr-quiz-nu.vercel.app`에서 실제 동작 확인.
- 문제가 있으면 Vercel 대시보드 → 해당 Deployment → **Logs**에서 서버 에러 로그 확인 가능.

---

## 6. 자주 막히는 포인트 (실제로 겪었던 문제들)

### 6-1. QR로 PC는 되는데 폰은 안 됨
- **원인**: `NEXT_PUBLIC_APP_URL` 환경변수가 Vercel에 잘못 설정(`localhost:3000` 등)되어 있으면,
  QR에 찍히는 주소가 실제 배포 주소가 아니라 그 값 그대로 박혀버림.
- **해결**: 이 환경변수를 Vercel에서 완전히 삭제. 코드(`resolveOrigin()`)가 자동으로
  요청 헤더에서 올바른 도메인을 계산해서 씀.

### 6-2. 참가자 관련 API가 전부 401 에러
- **원인**: `qz_participant` 쿠키가 `path: /room/{joinCode}`로 범위가 제한되어 있는데,
  참가자용 API를 `/api/room/...` 경로에 만들면 쿠키 범위 밖이라 브라우저가 쿠키를 안 보냄.
- **규칙**: 참가자용 엔드포인트는 반드시 `/room/[joinCode]/...` 경로 아래에 만들어야 함
  (`/api/...`가 아니라).

### 6-3. 로컬 npm 레지스트리 설정이 lockfile에 섞여 빌드 실패
- **원인**: 회사 내부망 npm 레지스트리 설정이 `package-lock.json`에 그대로 박혀서,
  Vercel 빌드 환경(외부 인터넷)에서는 그 주소에 접근 못 해 실패.
- **해결**: `.npmrc`로 `registry.npmjs.org`를 프로젝트 레지스트리로 고정.

---

## 7. 출제 모드 4종

`/admin` 대시보드에 방 생성 버튼이 4개 있고, 각각 전혀 다른 "누가 문제를 내는가" 흐름을 탑니다.
모든 모드는 `quizzes.mode` 컬럼 값(`NORMAL`/`TEAM`/`SOLO`/`GROUP`)과 `run_questions.source_group_id`가
null인지 여부만으로 게임 진행 로직이 갈리도록 설계되어 있어서, 진행/채점 화면 코드 대부분을
모드별로 새로 만들지 않고 공유합니다.

| 모드 | 버튼 | 문제는 누가 작성 | 참가자 입장 방식 | 조/팀 순위 |
|---|---|---|---|---|
| **개인전** (`NORMAL`) | 개인전 | 진행자 1인 | 닉네임만 | 없음 |
| **팀전** (`TEAM`) | 팀전 | 진행자 1인 (개인전과 동일 방식) | 조 선택 + PIN 입력 | 있음 (조원 평균) |
| **개인별 출제전** (`SOLO`) | 개인별 출제전 | 참가자 각자 1인 1조 | 닉네임만 (PIN 없음, 입장 즉시 작성화면) | 없음 (개인순위만) |
| **조별 출제전** (`GROUP`) | 조별 출제전 | 조원들이 조 단위로 공동 작성 | 조 선택 + PIN 입력 | 있음 (조원 평균) |

- **개인전/팀전**: 둘 다 "퀴즈 작성(제목+문제+보기+정답, 저장만)"과 "그 퀴즈로 방 만들기"가
  분리되어 있어서, 같은 퀴즈로 여러 방을 반복해서 만들 수 있습니다. 목록 화면에서 수정/복제/
  삭제도 둘 다 동일하게 가능합니다.
  - 개인전: `/admin/quizzes/new`에서 작성 → 목록의 "방 만들기"를 누르면 즉시 방 생성.
  - 팀전: `/admin/quizzes/new-team`에서 작성(조 개수는 이 화면에 없음) → 목록의
    "방 만들기"를 누르면 **조 개수를 입력받는 작은 창**이 뜨고, 입력 후 방이 생성됩니다.
    조 개수는 방을 만들 때마다 다르게 정할 수 있습니다.
- **개인별/조별 출제전**: 방생성 화면에서는 "주제/문제 수/제한시간/보기 개수(몇지선다)"만
  정하고, 실제 문제 내용은 참가자가 입장 후 직접 작성합니다(`/admin/rooms/new-solo`,
  `/admin/rooms/new-group`). 진행자는 대기실에서 각 참가자(개인별)/조(조별)가 제출한 문제를
  확인해서 **확정(승인)** 하거나 **반려**(사유를 적어 다시 쓰게 함)할 수 있고, 제출 전이라면
  직접 수정도 가능합니다. 모든 참가자/조가 확정되어야 "게임 시작"이 가능합니다.
- **보기 개수 고정**: 개인별/조별 출제전은 방 생성 시 정한 보기 개수로 모든 참가자의 문제가
  통일되도록 강제됩니다(UI에서 추가/삭제 버튼이 숨겨지고, 서버에서도 개수가 다르면 저장을
  거부합니다) — 어떤 참가자는 2지선다, 어떤 참가자는 5지선다를 내는 불공정을 막기 위함입니다.
- **관전(spectator) 규칙**: 개인별/조별 출제전에서는 자기(자기 조)가 낸 문제가 나오면 그
  문제를 풀 수 없고 "관전 중"으로 표시됩니다. 참가자 수·정답자 수 등 화면 표시는 관전자를
  제외한 숫자를 보여줍니다.
- **보기 중복 금지**: 네 모드 전부, 같은 문제 안에 완전히 같은 텍스트의 보기를 두 개 이상
  넣으면 저장이 거부됩니다.

---

## 8. 현재 구현된 기능 요약

1. **인증**: 진행자 이메일/비밀번호 로그인 (Supabase Auth)
2. **퀴즈 작성**: 문제/보기/정답/제한시간 설정, 생성·수정·복제·삭제 (개인전)
3. **방 생성 & 대기실**: QR코드로 참가자 입장, 실시간(폴링) 참가자/조 목록
4. **퀴즈 진행**:
   - 진행자가 "퀴즈 시작"/"게임 시작" → 문제 출제 (참가자 작성 모드는 조/개인 순서를
     게임 시작 시점에 무작위로 섞어서 진행)
   - 참가자가 답 제출 → 응답 속도에 따라 점수 차등 계산
   - 진행자가 "결과 보기"(정답 공개) → "순위 보기" → "다음 문제"/"퀴즈 종료"
   - 팀전/조별 출제전은 개인 순위와 조 순위(조원 평균)를 함께 표시

실시간 갱신은 Supabase Realtime(구독) 대신, 모두 **폴링(HTTP 주기적 재조회)** 방식으로
구현되어 있습니다. 대략적인 주기: 진행자 대시보드(문제 진행/반응)는 1초, 참가자 대기실
상태 확인은 2.5초, 참가자 문제 작성 화면(조별/개인별 출제전)은 2초, 참가자 heartbeat(접속
상태 알림)는 15초마다.

---

## 9. 데이터베이스 마이그레이션

`supabase/migrations/`에 번호 순서대로 적용되는 SQL 파일들이 있습니다. 이 프로젝트는
Supabase CLI가 로컬에 연결되어 있지 않은 환경에서 작업하는 경우가 많아서, 새 마이그레이션
파일을 작성한 뒤 **Supabase 대시보드의 SQL Editor에 직접 붙여넣어 실행**하는 방식으로
적용해왔습니다. 새 마이그레이션을 추가했다면 반드시 운영 DB에도 적용했는지 확인하세요.

| 파일 | 내용 |
|---|---|
| `00000000000001_init.sql` | 기본 테이블(quizzes/questions/options/rooms/quiz_runs/participants/answers 등) |
| `00000000000002_rls.sql` | Row Level Security 정책 |
| `00000000000003_grants.sql` | 테이블 GRANT |
| `00000000000004_reactions.sql` | 참가자 이모지 리액션 기능 |
| `00000000000005_reactions_seq_grant.sql` | 리액션 시퀀스 GRANT 보완 |
| `00000000000006_add_revealed_status.sql` | `quiz_runs.status`에 `REVEALED` 단계 추가 |
| `00000000000007_group_mode.sql` | 조별 출제전(GROUP) 전체 스키마(groups/group_question_slots/잠금/설정 등) |
| `00000000000008_team_solo_mode.sql` | 팀전(TEAM)/개인별 출제전(SOLO) 모드 추가, `solo_mode_settings` |
| `00000000000009_group_solo_options_count.sql` | 조별/개인별 출제전에 보기 개수(몇지선다) 고정 설정 추가 |

---

## 10. 자주 쓰는 경로/명령 정리

| 용도 | 경로/명령 |
|---|---|
| 로컬 개발 서버 실행 | `npm run dev` (기본 `localhost:3000`) |
| 프로덕션 빌드 테스트 | `npm run build` |
| 린트 | `npx eslint src/` |
| 타입 체크 | `npx tsc --noEmit` |
| E2E 테스트 (Playwright) | `npm run test:e2e` (또는 `npx playwright test tests/e2e/`) |
| 진행자 로그인 | `/admin/login` |
| 진행자 대시보드(내 퀴즈 목록, 모드별 방 생성 버튼) | `/admin` |
| 개인전 퀴즈 작성 | `/admin/quizzes/new` |
| 팀전 퀴즈 작성 (조 개수는 목록의 "방 만들기"에서 입력) | `/admin/quizzes/new-team` |
| 개인별 출제전 방 생성 | `/admin/rooms/new-solo` |
| 조별 출제전 방 생성 | `/admin/rooms/new-group` |
| 참가자 입장 | `/room/{joinCode}` (QR에 찍히는 주소) |
| Vercel 환경변수 설정 위치 | Vercel 프로젝트 → Settings → Environment Variables |
| Vercel 배포 로그 확인 위치 | Vercel 프로젝트 → Deployments → 해당 배포 클릭 → Logs |
| Supabase 마이그레이션 적용 위치 | Supabase 대시보드 → SQL Editor |
