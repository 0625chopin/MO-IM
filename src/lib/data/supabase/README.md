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
- Task 028에서 `generate_typescript_types`로 DB 스키마 타입을 생성하면, 두 팩터리의
  `createServerClient`/`createBrowserClient` 제네릭에 그 `Database` 타입을 연결한다. 지금은 테이블이
  없어(D-037 확인, `list_tables` 0개) 제네릭 없이 둔다.
