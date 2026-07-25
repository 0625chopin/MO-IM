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

## RLS 정책 (Task 029A, 15일차)

- 21개 테이블 전부에 정책이 채워졌다(정책 58건, `get_advisors(security)` INFO/WARN 0건). 설계 근거·
  발견한 재귀 버그·앱 규칙 대조 결과·029B 인계 목록은 `docs/decisions/rls-policies-029a.md` 참고.
- **`server.ts`(anon key + 사용자 세션)로 쓰는 모든 조회·쓰기는 이제 RLS의 영향을 받는다** — 이
  디렉터리에 도메인별 실데이터 구현을 추가할 때 `.from("...")` 호출이 정책상 허용된 범위(예:
  `crew_memberships`는 자기 행만 SELECT/INSERT/UPDATE 가능, 임원의 강퇴·임명 등 FR-024·027은
  029B 전까지 DB 레벨에서 막혀 있음)를 벗어나면 조용히 실패하는 게 아니라 빈 결과·403류 오류로
  나타난다. 화면 구현 전 위 문서의 §4·§5를 확인할 것.
- `SUPABASE_SERVICE_ROLE_KEY` 클라이언트는 **여전히 만들지 않았다** — `auth_attempts`·`audit_logs`·
  `notifications` INSERT처럼 "서버 전용" 테이블은 029A가 client 정책을 아예 열지 않았다(의도적
  전체 거부). 이 경로들을 실제로 구현할 때 service_role 클라이언트가 필요해진다.

## 스키마 타입 연결 (Task 028, 14일차)

- **`database.types.ts`**: `generate_typescript_types`로 생성한 자동 생성 파일. PRD §7 22종 엔티티 중
  `DevicePushToken` 1종을 제외한 **21종**(D-004 — 차기 릴리스 대상이라 이번엔 테이블을 만들지 않고
  타입 자리만 유지) 마이그레이션 적용 후 산출했다 — 손으로 고치지 않는다. 스키마가 바뀌면 새
  마이그레이션 적용 후 다시 생성해 통째로 교체한다.
- `server.ts`/`client.ts`의 `createServerClient`/`createBrowserClient` 제네릭에 이 `Database` 타입을
  연결했다. `.from("...")` 호출의 테이블명·컬럼이 실제 스키마와 어긋나면 타입 오류로 잡힌다.
- 이 타입은 DB 컬럼명(snake_case)을 그대로 반영한다. `src/lib/types/*`(Task 006 수기 도메인 타입,
  camelCase)와는 별개이며, 이 디렉터리에 앞으로 생길 도메인별 실데이터 구현(예: `board.ts`)이
  둘 사이를 매핑하는 책임을 진다(NFR-034). 필드별 대조 결과는
  `docs/decisions/schema-migration-028.md` 참고.
