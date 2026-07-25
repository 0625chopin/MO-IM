# `src/lib/data/supabase/`

실데이터(Supabase) 접근 구현. `src/lib/data/mock/`을 참조하지 않는다(NFR-034, ESLint zone 3으로 강제).
`@supabase/supabase-js`·`@supabase/ssr` 클라이언트를 직접 import할 수 있는 몇 안 되는 위치 중 하나다
(`src/lib/realtime/`의 구현체 파일과 함께).

담당: CORE, Task 026(Supabase 클라이언트 도입)·028(스키마 마이그레이션) 이후 채워진다(20주차~).
Mock 단계(Task 007)에서는 비어 있는 것이 정상이다. 자세한 내용은 [`../README.md`](../README.md) 참고.

## 클라이언트 팩터리 (Task 026, 20일차)

- **`env.ts`**: `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 읽기 + 누락 시
  즉시 에러. `server.ts`·`client.ts`가 공유한다.
- **`server.ts`**: `createSupabaseServerClient()` — 서버 컴포넌트·Server Action·Route Handler용.
  `@supabase/ssr`의 `createServerClient` + Next.js 16의 비동기 `cookies()`(`next/headers`)를 쓴다.
  Server Component에서 호출하면 `setAll`이 실패하는데, 이는 정상이다 — 세션 갱신은 인증 경계
  (레이아웃, D-030 ④)의 몫이며 `proxy.ts`는 D-011로 이번 범위 밖이라 아직 없다.
- **`client.ts`**: `createSupabaseBrowserClient()` — 클라이언트 컴포넌트·
  `src/lib/realtime/broadcast.ts`(Phase 4, Task 033)에서 쓸 브라우저 클라이언트.
- 이 두 팩터리는 **아직 어디서도 호출되지 않는다** — Task 028(스키마 마이그레이션) 이후 이
  디렉터리에 도메인별 실데이터 구현(예: `board.ts`)이 생기면 그 안에서 `./server`를 가져다
  쓰는 식으로 소비된다. `@/lib/data`(배럴, `../index.ts`)는 아직 Mock만 조립하므로
  (NFR-034 — mock/supabase 동시 노출 금지), 이 팩터리들은 배럴에 재노출하지 않는다.
- **`SUPABASE_SERVICE_ROLE_KEY`(RLS 우회, service_role)는 이번 회차에서 다루지 않는다.** `.env.local`에
  값만 채워 두었고, 이를 쓰는 관리자/스케줄 전용 클라이언트는 필요해지는 시점(Task 027 pg_cron
  또는 029 RLS)에 만든다 — 지금 만들면 쓰는 곳 없는 죽은 코드가 된다.

## RLS 정책 (Task 029A, 15일차 / Task 029B, 16일차)

- 21개 테이블 전부에 정책이 채워졌다(정책 **58건**, `get_advisors(security)` INFO/WARN 0건). 설계 근거·
  발견한 재귀 버그·앱 규칙 대조 결과는 `docs/decisions/rls-policies-029a.md`, 029B가 이어받아 채운
  `private` 헬퍼·집계 RPC·Realtime Authorization은 `docs/decisions/rls-policies-029b.md` 참고.
- **`server.ts`(anon key + 사용자 세션)로 쓰는 모든 조회·쓰기는 RLS의 영향을 받는다** — 이
  디렉터리에 도메인별 실데이터 구현을 추가할 때 `.from("...")` 호출이 정책상 허용된 범위를
  벗어나면 조용히 실패하는 게 아니라 빈 결과·403류 오류로 나타난다. 화면 구현 전 위 두 문서를
  확인할 것.
- **029B로 다음이 새로 열렸다**:
  - `crew_memberships` 동료 조회(FR-028)·임원 임명(FR-024)·강퇴(FR-027)가 이제 DB 레벨에서
    동작한다. `crew_memberships_select_self_or_fellow_member`(동료 조회)·
    `crew_memberships_update_self_or_officer`(임원의 타인 행 갱신) 정책 + 트리거
    `crew_memberships_guard_self_transition`이 세부 업무 규칙(누가 무엇을 바꿀 수 있는지)을
    강제한다 — RLS 정책만 보고 "이 행에 쓸 수 있다"고 판단하지 말 것, 트리거가 추가로 막을 수
    있다.
  - `public.poll_vote_tally(poll_id)` — `poll_votes` 개별 행을 노출하지 않고 찬성/반대/기권
    집계만 반환하는 RPC(D-031: 대상자 5명 미만 + 진행 중이면 `tally_hidden=true`로 집계를
    숨긴다). 크루 화면 구현 시 `poll_votes` 테이블을 직접 집계하지 말고 이 RPC를 쓸 것.
  - `public.crew_directory_summary(crew_id)` — `anon` 포함 누구나 호출 가능. 공개 크루는 멤버
    수까지, 비공개 크루는 크루명만 반환한다(D-007). 크루 탐색·소개 페이지가 비로그인 상태를
    지원하려면 이 RPC를 쓴다.
  - `public.profile_search(p_handle text)` — FR-006 핸들 검색은 **반드시 이 RPC를 통해서만**
    구현할 것(NFR-013 3필드 제한). **16일차 DESIGN 교차검증으로 시그니처가 바뀌었다**: 최초
    버전(`p_query`+`ilike`+`p_limit`, `id` 포함 4필드)이 FR-006 AC2(부분 일치 불가)와 NFR-013(3필드만)
    을 둘 다 위반해 `p_handle`**정확 일치**로 좁히고 `id`를 제거했다(0~1건만 반환, `handle`이
    UNIQUE라 식별자로 충분). `profiles` 테이블을 직접 조회하면 3필드 제한이 깨진다(테이블
    자체는 여전히 전 컬럼 공개 — `rls-policies-029b.md` §7 잔여 위험 참고).
    - **초대(FR-020) 구현 시 주의**: 이 함수는 `id`를 반환하지 않는다. 초대 버튼은 검색 결과의
      **`handle`을 그대로 초대 요청에 넘기고**, 서버(Server Action)가 `handle → profile_id`를
      다시 조회해 `invitations.invitee_id`를 채워야 한다. 클라이언트가 검색 결과의 `id`를 들고
      있다가 바로 쓰는 방식은 이 스키마에서 성립하지 않는다.
  - `realtime.messages`에 Authorization 정책 2건 추가(토픽 규칙 `crew:{id}:chat`·
    `crew:{id}:polls`·`user:{id}:notifications`). Realtime 클라이언트(Task 033, `src/lib/realtime/`)
    구현 시 `channel(topic, { config: { private: true } })` + `supabase.realtime.setAuth()`가
    필요하다. **DB 트리거(`realtime.broadcast_changes()`)는 아직 없다** — 채팅/투표/알림 테이블에
    붙이는 것은 Task 033 몫이다(예시 SQL은 `rls-policies-029b.md` §6.2).
  - `system_admin` 식별 컬럼은 여전히 없다(029A/029B 둘 다 판단해 이월 — 새 결정 필요).
  - **⚠️ `private` 스키마 격리는 대시보드 설정(Exposed schemas)에 의존한다, 코드가 아니다.**
    `private.*` 함수들은 이미 `authenticated`(+일부 `anon`)에 EXECUTE 권한이 있다 — 안전한 건
    오직 `private`가 PostgREST Exposed schemas 목록에 없기 때문이다. 이 목록에 `private`를
    추가하면 `private.poll_vote_tally` 등이 `public.*` 래퍼를 거치지 않고 바로 RPC로 노출된다.
    절대 추가하지 말 것 — 확인 방법은 `rls-policies-029b.md` §2.4 참고.
- `SUPABASE_SERVICE_ROLE_KEY` 클라이언트는 **여전히 만들지 않았다** — `auth_attempts`·`audit_logs`·
  `notifications` INSERT처럼 "서버 전용" 테이블은 client 정책을 아예 열지 않았다(의도적
  전체 거부). 이 경로들을 실제로 구현할 때 service_role 클라이언트가 필요해진다.

## 스키마 타입 연결 (Task 028, 14일차 / Task 029B 재생성, 16일차)

- **`database.types.ts`**: `generate_typescript_types`로 생성한 자동 생성 파일. PRD §7 22종 엔티티 중
  `DevicePushToken` 1종을 제외한 **21종**(D-004 — 차기 릴리스 대상이라 이번엔 테이블을 만들지 않고
  타입 자리만 유지) 마이그레이션 적용 후 산출했다 — 손으로 고치지 않는다. 스키마가 바뀌면 새
  마이그레이션 적용 후 다시 생성해 통째로 교체한다. **16일차(029B)에서 신규 RPC 3종
  (`poll_vote_tally`·`crew_directory_summary`·`profile_search`) 반영을 위해 재생성**했고
  (`npx tsc --noEmit` exit 0 확인), `private` 스키마 함수는 노출 스키마가 아니라 타입에도
  나타나지 않는다(의도된 결과).
- `server.ts`/`client.ts`의 `createServerClient`/`createBrowserClient` 제네릭에 이 `Database` 타입을
  연결했다. `.from("...")` 호출의 테이블명·컬럼이 실제 스키마와 어긋나면 타입 오류로 잡힌다.
- 이 타입은 DB 컬럼명(snake_case)을 그대로 반영한다. `src/lib/types/*`(Task 006 수기 도메인 타입,
  camelCase)와는 별개이며, 이 디렉터리에 앞으로 생길 도메인별 실데이터 구현(예: `board.ts`)이
  둘 사이를 매핑하는 책임을 진다(NFR-034). 필드별 대조 결과는
  `docs/decisions/schema-migration-028.md` 참고.
