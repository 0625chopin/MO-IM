# 14일차 작업 로그 (2026-07-25)

## 회차 요약
- 활성 팀원: **CORE 1명** (DESIGN·CREW·BOARD 대기). 리뷰어로 **DESIGN**을 교차검증에 소환.
- 이번 회차 배치 근거: 완료 집합 {Task 001~027 전량} 기준으로 선행조건이 모두 풀린 유일한 미완료 Task는 **028**(의존 026 ✓·027 ✓ 완료, 선행 대기 없음). 나머지 3명의 다음 Task는 전부 028/029B 의존이라 대기 — DESIGN(031·035), CREW(030, +I-016 차단), BOARD(038·033). **Phase 4(Supabase 실데이터) CORE 단독 직렬 구간의 세 번째 회차이자 되돌리기가 가장 비싼 Task.**
- **이번 회차에 도메인 스키마를 처음 만들었다** — Supabase(ref damruradpliktkrlkakl, MO-IM)에 마이그레이션 8건을 적용해 `public` 도메인 테이블 **21개**를 생성했다. 12일차(026 클라이언트)·13일차(027 pg_cron 기반)에 이어 Phase 4에서 스키마 본체가 놓인 회차다.
- 결과: 이슈 **3건(전부 경미·비차단)** 발견 / 전건 해소. 전체 테스트 3/3 통과.

## 팀원별 완료 내역

### CORE (01.CORE.md)
- 완료 Task: **028 · 데이터베이스 스키마 마이그레이션**
- 산출물:
  - 신규 마이그레이션 8건 — `supabase/migrations/`에 `20260724234126_create_profile_and_auth_tables.sql`, `..234205_create_crew_membership_invitation_tables.sql`, `..234220_create_board_post_comment_tables.sql`, `..234239_create_poll_tables.sql`, `..234252_create_meetup_tables.sql`, `..234305_create_chat_tables.sql`, `..234319_create_notification_tables.sql`, `..234330_create_moderation_and_audit_tables.sql`
  - 후속 마이그레이션 1건(교차검증 대응) — `20260724235931_fix_poll_votes_guard_search_path.sql`
  - 신규 — `src/lib/data/supabase/database.types.ts`(`generate_typescript_types` 산출), `docs/decisions/schema-migration-028.md`(설계 근거·되돌리기 비싼 결정 7종·R-003 전수 대조·다음 회차 인계)
  - 수정 — `src/lib/data/supabase/server.ts`·`client.ts`(`createServerClient`/`createBrowserClient`에 `Database` 제네릭 연결), `src/lib/data/supabase/README.md`(스키마 타입 연결 절 추가), `docs/ROADMAP/team/01.CORE.md`(Task 028 상태 완료 마커)
- 생성 테이블 21종(list_tables 실측 확인): `profiles`, `auth_attempts`, `crews`, `crew_memberships`, `invitations`, `join_requests`, `boards`, `posts`, `comments`, `polls`, `poll_eligible_voters`, `poll_votes`, `meetups`, `meetup_attendances`, `chat_rooms`, `chat_messages`, `notifications`, `notification_preferences`, `reports`, `blocks`, `audit_logs`
- 비고:
  - **착수 전 D-037 확인(실측)** — `list_tables`(public) 0개, `list_migrations` 2건(pg_cron 관련뿐), `pg_cron installed_version 1.6.4`, `auth.users` 정상 존재(0행). 낯선 테이블(player·fixture 등) 없음 → 정상 진행. 적용 후 재확인 — migrations 9건(028 8건 + search_path 후속 1건 = 11건 총계), public 도메인 테이블 21개.
  - **엔티티 수 정정** — 팀장 지시문의 "20종"은 근사치. 단일 소스 `requirements.md` 5.2절이 "엔티티 22종"이라 명시하며, `DevicePushToken`(FR-073, 차기 v1.0+, D-004)을 제외한 **21개** 테이블을 만들었다. CORE가 지시문과 요구사항 문서의 차이를 스스로 규명·문서화(schema-migration-028.md §1).
  - **되돌리기 비싼 결정 7종을 스키마로 고정**(schema-migration-028.md §2) — ① 열거형은 네이티브 ENUM이 아니라 `text`+`CHECK`(단일 마이그레이션 확장성, D-025), ② `poll_eligible_voters` 조인 테이블+발송상태 컬럼(D-025), ③ **NFR-032 투표 불변성** — `poll_votes_guard_immutability()` BEFORE UPDATE 트리거로 `choice`/`voted_at` 갱신 차단(`invalidated`만 허용, D-003), ④ 정족수·판정 매핑을 CHECK로 고정하고 `quorumRatio` 컬럼 제거(D-032·D-035), ⑤ 정원 CHECK 안전망(D-019, 원자성은 앱 조건부 UPDATE 몫), ⑥ `chat_messages` 파티셔닝 미채택+`created_at` 인덱스로 배치 DELETE 지원(D-033·NFR-033), ⑦ `Meetup.status` 2종 고정(D-034).
  - **D-010 하드 삭제 차단** — 콘텐츠 테이블 19종이 `profiles(id)`를 `ON DELETE RESTRICT`로 참조해, 콘텐츠를 남긴 사용자는 `auth.users` 행 자체를 하드 삭제할 수 없다(익명화 워크플로만 통과).
  - **RLS 기본 거부 선제 적용** — 21개 테이블 전부 `ENABLE ROW LEVEL SECURITY`(정책 0개=기본 거부). NFR-011("정책 없는 테이블=사실상 전체 공개")을 028~029A 공백 구간에서 미리 막는 조치. 정책 설계(SECURITY DEFINER 헬퍼·TO절·서브쿼리 래핑 D-028)는 029A/029B 범위 — 침범 아님.
  - **R-003 전수 대조** — `database.types.ts` ↔ `src/lib/types/*.types.ts` 필드 단위 대조, 구조적 불일치(누락 엔티티·잘못된 관계·타입 오류) 0건. 차이는 전부 "DB 부기 컬럼(`created_at` 등) 추가" 또는 "수기 타입 쪽 시각 필드 공백"뿐이며, 데이터 접근 레이어가 부기 컬럼을 도메인 타입에 매핑하지 않는다(NFR-035 대칭 원칙).
  - **D-030 경계 유지** — UI 컴포넌트·`@/lib/data` 배럴(`index.ts`)·Mock 구현 무변경. `server.ts`/`client.ts` 변경은 `Database` 제네릭 추가뿐(런타임 시그니처 불변, 두 팩터리는 아직 미소비).

## 교차검증 결과
활성이 CORE 1명뿐이라 Task 028 지정 리뷰어 **DESIGN**을 소환해 교차검증했다(CORE 프로필 리뷰 짝 = DESIGN·BOARD, Task 028 리뷰어 = DESIGN).
- **DESIGN → CORE(028) 1차**: 6개 검증 항목 **전부 PASS**. supabase MCP로 실제 프로젝트를 직접 조회(list_tables·get_advisors·execute_sql)하고 파일을 직접 대조. 트리거·FK·CHECK를 **실제 INSERT/UPDATE/DELETE로 검증**(트랜잭션 내 실행 후 에러 롤백, 잔여 행 0건 재확인 — 실 데이터 오염 없음):
  1. 테이블 생성 완전성 PASS — 21개 전부 존재, requirements.md 22종과 1:1(DevicePushToken만 제외).
  2. R-003 대조 정확성 PASS(이슈 A) — 결론(구조 불일치 0)은 맞으나 §4 대조가 20종만 다뤄 `crews`가 누락.
  3. 되돌리기 비싼 결정 실측 PASS — (a) `poll_votes` `UPDATE choice` → `ERROR P0001`로 실제 거부, `invalidated` 갱신은 통과, (b) NFR-032 동일 근거, (c) 콘텐츠 있는 프로필의 `DELETE FROM auth.users` → `ERROR 23503` 거부(19개 RESTRICT FK 확인), (d) `quorum_ratio` 컬럼 없음, (e) capacity=2·attending_count=3 → `ERROR 23514` 거부.
  4. RLS 기본 거부 PASS — 21개 전부 `rls_enabled: true`, get_advisors에 `rls_enabled_no_policy` INFO 21건(정확히 잡힘, 비차단). 029A 침범 아님.
  5. D-030 경계 PASS — `git diff --stat` 변경은 `supabase/{README,client,server}` 3파일뿐, `src/app`·`src/components`·`src/lib/data/{index,mock}` 무변경. 팩터리 호출부 0건이라 깨질 기존 코드 없음.
  6. enum 표현 PASS(이슈 B 부가발견) — CHECK 열거형이 `string`으로 생성됨을 실물 확인, CORE가 매핑 책임(NFR-034)을 문서화. get_advisors에서 RLS 무관 WARN 1건(`function_search_path_mutable`) 추가 발견.
- **DESIGN → CORE(028) 재검증**: 이슈 A·B·C 수정 후 재조회. A(§4.2에 Crew 행 추가, "12+9=21 전수 대조" 문구)·B(search_path 후속 마이그레이션 적용 → get_advisors에서 `function_search_path_mutable` WARN **소멸**, `rls_enabled_no_policy` INFO 21건만 잔존 = 029A 예정분)·C(README "21종" 정정) 모두 해소. 추가 이슈 0건.

## 발견·해결한 이슈
경미 3건 — 전부 비차단, 회차 내 해소.

1. **[DESIGN 발견 · CORE 028] R-003 대조 문서 커버리지 공백.** `schema-migration-028.md §4`가 "전수 대조"라 했으나 21개 중 `crews`가 §4.1(완전일치 12종)·§4.2(부기컬럼 8종) 어디에도 없었다(12+8=20종만 다룸). 실측상 `crews.created_at`은 도메인 타입 `Crew`에 없는 컬럼이라 Profile과 동일한 "DB 부기 컬럼" 패턴인데 누락. → CORE가 §4.2 표에 Crew 행을 추가하고 "12+9=21개 전수 대조 완료" 문구를 넣어 해소. DESIGN 재검증 pass.
2. **[DESIGN 발견 · CORE 028] `poll_votes_guard_immutability` 함수 `search_path` 미고정(WARN, 미문서화).** get_advisors(security)의 `function_search_path_mutable`. SECURITY DEFINER도 아니고 OLD/NEW 비교만 해 실질 악용성은 낮으나 표준 권장 미준수. → CORE가 후속 마이그레이션 `fix_poll_votes_guard_search_path`로 함수를 `SET search_path = ''`와 함께 CREATE OR REPLACE(트리거 재생성 불필요). 적용 후 get_advisors에서 WARN 소멸. DESIGN 재검증 pass.
3. **[DESIGN 발견 · CORE 028] `README.md:30` 표기 불일치.** 결정문서가 "21개"로 결론 낸 것과 달리 README가 "PRD §7 20종"을 그대로 남김. → CORE가 "21종"으로 정정(DevicePushToken 제외 근거 부기). DESIGN 재검증 pass.

## 팀장 전체 테스트 (항상 실행)
- `npm run lint`: **통과** (exit 0, 출력 없음)
- `npx tsc --noEmit`: **통과** (exit 0, 출력 없음)
- `npm run build`: **통과** (exit 0). `Compiled successfully in 9.3s`, `Finished TypeScript in 10.6s`, 정적 페이지 15/15, 20개 라우트 전부 `ƒ (Dynamic)`. 스키마/마이그레이션은 앱 번들과 무관하고 `Database` 제네릭도 미소비 팩터리에만 걸려 라우트 구성 변화 없음
- 참고: 빌드는 `--force`로 복구된 로컬 `node_modules`에서 돌았다 — I-045(temporal-polyfill peer 충돌)는 이번 회차와 무관하게 열려 있다

## 문서 갱신
- `docs/ROADMAP/team/01.CORE.md`: Task 028에 `- 상태: 완료 (14일차, 2026-07-25)` + 마이그레이션·결정·교차검증 반영
- `docs/decisions/schema-migration-028.md`: 신규 — 스키마 설계 근거·되돌리기 비싼 결정 7종·R-003 전수 대조·029A 인계(교차검증 후 §4.2 Crew 행·search_path 정리 반영)
- `src/lib/data/supabase/{server,client}.ts`: `Database` 제네릭 연결
- `src/lib/data/supabase/README.md`: 스키마 타입 연결 절 추가("21종" 표기)
- `supabase/migrations/`: 신규 9건(도메인 스키마 8 + search_path 후속 1)
- `docs/team/*.md`: **변경 없음** — 팀원 상태 변화 없음
- `docs/ISSUES.md`: **새 이슈 등재 0건** — 이번 3건은 회차 내 발견·해소돼 등재 대상 아님

## 다음 회차에 열리는 Task

| Task | 담당 | 의존 | 비고 |
| --- | --- | --- | --- |
| **029A** RLS 정책 설계와 적용 — 기본 거부·테이블별 정책·`TO` 절·서브쿼리 래핑 | CORE | 028 ✓ | **028 완료로 새로 열렸다.** 이번 회차가 남긴 "전 테이블 RLS ENABLE·정책 0개=기본 거부" 상태에서 시작한다 — "테이블에 RLS를 켜는 일"이 아니라 "정책을 채우는 일". D-028 핵심: 모든 정책에 `TO` 절, 서브쿼리는 `(select …)`로 래핑(래핑 유무가 타임아웃>2분 ↔ 2ms를 가른다). 공수 8.0인일(L, 25~26주차) |

- **029A도 CORE 단독**이다. `029A → 029B`가 CORE 단독 직렬 사슬의 나머지이며, **029B가 끝나야 DESIGN 031·CREW 030이 열린다.**
- **029A 착수 시 인계 사항(schema-migration-028.md §5)**: ① 정책 0개·기본 거부 상태에서 시작, ② `poll_eligible_voters` "생성 후 행 불변"은 트리거 미강제(애플리케이션 책임, 재검토 권고), ③ `start_time` 형식(HH:MM 가정)은 작성 폼 구현 전 확정 필요, ④ `Invitation`·`JoinRequest`·`Comment` 수기 타입의 시각 필드 공백은 화면 요구 발생 시 Task 006 타입 개정.
- **I-045(열림)**: 다음 배포 검증·CI 도입 전 temporal-polyfill peer 충돌 근본 해결 필요(DESIGN과 함께). 029A RLS 작업과는 독립.

## git
- 브랜치: `day-14` (`day-13`에서 분기)
- 커밋: 아래 참고
- 푸시: 사용자 확인 대기
