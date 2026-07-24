# 12일차 작업 로그 (2026-07-24)

## 회차 요약
- 활성 팀원: **CORE 1명** (DESIGN·CREW·BOARD 대기). 리뷰어로 **DESIGN**을 교차검증에 소환.
- 이번 회차 배치 근거: 완료 집합 {Task 001~025 전량} 기준으로 선행조건이 모두 풀린 유일한 미완료 Task는 **026**(의존 025 ✓, 11일차 완료, 선행 대기 없음). 나머지 3명의 다음 Task는 전부 026~029 의존이라 대기 — DESIGN(031·035), CREW(030, +I-016 차단), BOARD(038·033). **Phase 4(Supabase 실데이터) CORE 단독 직렬 구간의 실질 시작점**이다. 단 026은 클라이언트 라이브러리 설치·서버/클라 경계 배치·env 구성까지이고 **스키마 마이그레이션(028)은 아직 아니라 DB에 손대지 않는 회차**다.
- 결과: 이슈 **0건** 발견(교차검증 5개 항목 전부 pass) / 해소 대상 없음. 전체 테스트 3/3 통과.
- 부수 발견: 이번 설치 작업 중 **I-045**(temporal-polyfill peer 충돌로 플래그 없는 `npm install`/`npm ci`가 항상 ERESOLVE 실패)를 등재했다 — 근본 해결은 `@schedule-x` 캘린더(DESIGN 담당 021·022) 영역이라 이번 범위 밖으로 두고 발견만 했다.

## 팀원별 완료 내역

### CORE (01.CORE.md)
- 완료 Task: **026 · Supabase 클라이언트 도입과 환경 구성**
- 산출물:
  - 신규 — `src/lib/data/supabase/env.ts`(두 팩터리 공유 env 검증 헬퍼 `requireEnv`), `src/lib/data/supabase/server.ts`(`createSupabaseServerClient()` — `@supabase/ssr`의 `createServerClient` + Next.js 16 비동기 `cookies()`, getAll/setAll 쿠키 어댑터, setAll try/catch로 Server Component 호출 실패를 정상 처리), `src/lib/data/supabase/client.ts`(`createSupabaseBrowserClient()` — `createBrowserClient`)
  - 수정 — `src/lib/data/supabase/README.md`(팩터리 사용법·service_role 관리자 클라이언트는 Task 027/029 시점 명시), `docs/prd/PRD.md`(§8.1/8.2 — Supabase 클라이언트를 "도입 예정"→"이미 설치됨"으로 이동, 런타임 의존성 카운트 3→5), `package.json`·`package-lock.json`(`@supabase/supabase-js@2.110.8`·`@supabase/ssr@0.12.3` 설치)
  - 등재 — `docs/ISSUES.md`에 I-045(아래) + 다음 이슈 번호 I-046으로 갱신
- 비고:
  - **서버/클라 배치와 R-015 준수** — Supabase 클라이언트를 직접 import할 수 있는 위치는 `src/lib/data/supabase/`·`src/lib/realtime/` 뿐이고, 차단은 기존 `eslint.config.mjs` zone 3(이 zone만 `@supabase/*` 허용, zone 1·2·4·5·6은 `noSupabaseClient`로 차단)이 그대로 담당 — **새 lint 규칙을 추가하지 않았다.** 컴포넌트가 `@supabase/*`를 직접 import하는 곳 0건(grep 실측).
  - **의도적 미노출** — 두 팩터리는 아직 어디서도 소비되지 않는다. `@/lib/data` 배럴(`index.ts`)은 여전히 100% Mock만 조립하며(mock import 줄 무변경), Task 028에서 도메인 실데이터 구현이 생기면 그 안에서 `./server`를 가져다 쓰는 구조다. D-030 "조회부만 교체" 경계를 지키기 위해 배럴에 재노출하지 않았다.
  - **env·D-037** — `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL`(`https://damruradpliktkrlkakl.supabase.co`)·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SERVICE_ROLE_KEY`는 **이미 실값으로 채워져 있었다.** MCP `get_project_url`·`get_publishable_keys` 조회 결과와 URL·publishable key가 정확히 일치함을 확인했고, ref `damruradpliktkrlkakl` 그대로다(교체 0). 값을 새로 채우거나 덮어쓰지 않았다. service_role 키는 MCP로 조회 불가한 항목이라 형식(`sb_secret_`)만 확인하고 이 키를 쓰는 관리자 클라이언트는 이번에 만들지 않았다(README에 Task 027/029 시점 명시).
  - **범위 준수(DB 미변경)** — 착수 전 `list_tables`(public) 0개·`list_migrations` 0건·`pg_cron installed_version: null` 확인(낯선 테이블 없음, D-037·다음 회차 027 전제 그대로). `apply_migration` 호출 없음, 마이그레이션 파일 0.

## 교차검증 결과
활성이 CORE 1명뿐이라 Task 026 지정 리뷰어 **DESIGN**을 소환해 교차검증했다(CORE 프로필 리뷰 짝 = DESIGN·BOARD, Task 026 리뷰어 = DESIGN).
- **DESIGN → CORE(026)**: 5개 검증 항목 **전부 PASS**, 추가 이슈 0건. 보고를 믿지 않고 파일을 직접 열어 실측했다.
  1. **@supabase/ssr 표준 패턴** PASS — 설치본 0.12.3의 `.d.ts` 대조로 구식 `get`/`set`/`remove` 단수 API가 `@deprecated`이고 현재 타입이 `getAll`/`setAll`을 요구(server)·선호(browser)함을 확인. server.ts의 `await cookies()`·setAll try/catch가 공식 주석과 부합.
  2. **R-015** PASS — zone 3만 `@supabase/*` 허용, 나머지 zone은 `noSupabaseClient`로 차단. `grep -rn "@supabase" src` 결과 `src/lib/data/supabase/`·`src/lib/realtime/` 외 실 import 없음(주석 2건뿐).
  3. **env·D-037** PASS — `.env.local` ref 교체 없음, URL/publishable key 실값(redact 확인만), `env.ts`의 `requireEnv`가 `undefined`·빈 문자열 모두 즉시 에러 처리.
  4. **범위 준수(DB 미변경)** PASS — migration 파일 무결과, 배럴 100% `./mock/*` 유지, 새 팩터리를 실제 import하는 곳 전무.
  5. **PRD §8 갱신 + I-045 타당성** PASS — §8.1 카운트 3→5·§8.2 "Supabase JS 클라이언트" 행 삭제 정확. I-045는 `@schedule-x/calendar` peer `temporal-polyfill@0.3.0`(exact) ↔ 루트 `^1.0.1`(resolve 1.0.1) 실제 충돌, `overrides` 없음, npm 11.16.0 — 재현 가능한 실제 문제로 확인(과장·오류 없음).

## 발견·해결한 이슈
교차검증에서 발견한 결함 **0건** — 1차 산출이 규약 위반 없이 완결됐다.

부수 발견(회차 작업의 결함이 아니라 기존 의존성 상태 문제, 등재만):
1. **[CORE 발견 · I-045, 열림] 플래그 없는 `npm install`/`npm ci`가 `@schedule-x/calendar` peer 충돌로 ERESOLVE 실패.** 루트 `temporal-polyfill@^1.0.1` ↔ `@schedule-x/calendar@4.6.1`의 peer `temporal-polyfill@0.3.0`(exact) 충돌. 커밋된 lockfile을 그대로 써도 이 npm(11.16.0)에서 재현 불가. `--legacy-peer-deps`는 peer 자동 설치를 꺼 `preact`가 빠져 `/calendar` 빌드가 깨지고, `--force`만 두 문제를 모두 피한다(현재 로컬 `node_modules`는 `--force`로 복구, lockfile은 HEAD와 바이트 동일). **Vercel 등 CI가 기본 설치 커맨드를 쓰면 막힐 가능성** — Task 025 로컬 빌드는 이미 채워진 `node_modules`에서 돌아 이 경로를 못 잡았다. 근본 해결(temporal-polyfill 버전 정리 / `overrides` / 빌드 커맨드 플래그)은 `@schedule-x` 캘린더(DESIGN 담당 021·022)를 건드려 Task 026 범위 밖 — 발견만 하고 고치지 않았다. **다음 배포 검증 전 반드시 확인.** 상세는 `docs/ISSUES.md` I-045.

## 팀장 전체 테스트 (항상 실행)
- `npm run lint`: **통과** (exit 0, 출력 없음 — 위반 0)
- `npx tsc --noEmit`: **통과** (exit 0, 출력 없음)
- `npm run build`: **통과** (exit 0). `Finished TypeScript in 9.7s`, 정적 페이지 15/15, 20개 라우트 전부 `ƒ (Dynamic)`(인증 경계가 레이아웃/`cookies()` 기반이라 프리렌더 대상 없음이 D-030④ 설계상 정상). Supabase 팩터리는 아직 소비되지 않아 라우트 수 변화 없음
- 참고: 이 빌드는 `--force`로 복구된 로컬 `node_modules`에서 돌았다 — I-045대로 클린 클론+플래그 없는 설치 경로는 별개 문제이며 미검증

## 문서 갱신
- `docs/ROADMAP/team/01.CORE.md`: Task 026에 `- 상태: 완료 (12일차, 2026-07-24)` + 산출 요약·I-045 발견 메모 추가
- `docs/prd/PRD.md`: §8.1/8.2 — Supabase 클라이언트 "도입 예정"→"이미 설치됨" 이동, 런타임 의존성 카운트 3→5
- `docs/ISSUES.md`: I-045 등재 + 다음 이슈 번호 I-046으로 갱신
- `src/lib/data/supabase/README.md`: 팩터리 사용법·service_role 관리자 클라이언트 시점(Task 027/029) 명시
- `docs/team/*.md`: **변경 없음** — 팀원 상태 변화 없음

## 다음 회차에 열리는 Task

| Task | 담당 | 의존 | 비고 |
| --- | --- | --- | --- |
| **027** `pg_cron` 확장 활성화와 스케줄 실행 기반 구축 | CORE | 026 ✓ | **026 완료로 새로 열렸다.** `pg_cron` 현재 `installed_version: null` — 첫 마이그레이션에서 활성화. Supabase Cron(pg_cron) 사용·Vercel Cron 미사용(D-027). 공수 2.0인일. Task 034·035의 선행 |

- **027도 CORE 단독**이다. DESIGN·CREW·BOARD는 다음 회차도 대기 유력 — `026 → 027 → 028 → 029A → 029B`가 CORE 단독 직렬 사슬이며, 이 구간이 끝나야(029B 완료) DESIGN 031·CREW 030이 열린다. **여기서부터가 Phase 4 CORE 단독 장기 직렬 구간의 본격 구간**이다.
- **027부터는 DB에 실제로 손댄다** — `pg_cron` 활성화가 첫 마이그레이션이 될 수 있다. 착수 전 `list_tables`·`list_migrations` 0 재확인(D-037), 되돌리기 비용이 큰 결정은 리뷰어와 대조(01.CORE 프로필 주의). Task 028(스키마)은 `generate_typescript_types`로 Task 006 수기 타입과 대조하고, 그 뒤 `server.ts`/`client.ts` 제네릭에 `Database` 타입을 연결해야 한다(지금은 테이블 없어 제네릭 없이 둠).
- **I-045는 CORE 직렬 구간과 무관하게 열려 있다** — 다음 배포 검증(또는 CI 도입) 전에 근본 해결이 필요하며 `@schedule-x` 캘린더 소유자(DESIGN)와 함께 결정한다.

## git
- 브랜치: `day-12` (`day-11`에서 분기)
- 커밋: 아래 참고
- 푸시: 사용자 확인 대기
