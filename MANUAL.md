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

## 7. 현재 구현된 기능 (Stage 1-4)

1. **인증**: 진행자 이메일/비밀번호 로그인 (Supabase Auth)
2. **퀴즈 작성**: 문제/보기/정답/제한시간 설정, 생성·수정·복제·삭제
3. **방 생성 & 대기실**: QR코드로 참가자 입장, 실시간(폴링) 참가자 목록
4. **퀴즈 진행** (Stage 4):
   - 진행자가 "퀴즈 시작" → 문제 출제
   - 참가자가 답 제출 → 응답 속도에 따라 점수 차등 계산
   - 진행자가 "결과 보기" → 정답 공개 + 이번 문제 순위
   - 진행자가 "다음 문제"/"퀴즈 종료" → 다음 문제로 진행 또는 최종 결과

실시간 갱신은 Supabase Realtime(구독) 대신, 모두 **폴링(HTTP 주기적 재조회)** 방식으로
구현되어 있습니다 — 진행자 화면은 3초마다, 참가자 화면은 2.5초마다 서버에 상태를 물어봅니다.

---

## 8. 자주 쓰는 경로/명령 정리

| 용도 | 경로/명령 |
|---|---|
| 로컬 개발 서버 실행 | `npm run dev` (기본 `localhost:3000`) |
| 프로덕션 빌드 테스트 | `npm run build` |
| 진행자 로그인 | `/admin/login` |
| 진행자 대시보드(내 퀴즈 목록) | `/admin` |
| 참가자 입장 | `/room/{joinCode}` (QR에 찍히는 주소) |
| Vercel 환경변수 설정 위치 | Vercel 프로젝트 → Settings → Environment Variables |
| Vercel 배포 로그 확인 위치 | Vercel 프로젝트 → Deployments → 해당 배포 클릭 → Logs |
