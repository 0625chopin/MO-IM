# 15일차 작업 로그 (2026-07-25)

## 회차 요약
- 활성 팀원: **CORE · DESIGN 2명** (CREW 대기). 리뷰어로 **BOARD**를 교차검증에 소환.
- 이번 회차 배치 근거: 완료 집합 {Task 001~028 전량} 기준으로 선행조건이 모두 풀린 미완료 Task는 **029A**(CORE, 의존 028 ✓)와 **035**(DESIGN, 의존 027 ✓·028 ✓) 2건이다. CREW(030)는 029A·029B 의존, BOARD(038)는 030 의존·(033)은 031·032 의존이라 계속 대기.
- **12일차부터 이어진 CORE 단독 직렬 구간이 이번 회차에 처음 풀렸다** — 028 완료가 DESIGN 035의 선행이었다. Phase 4에서 2명이 병렬로 움직인 첫 회차다.
- 두 Task는 서로 의존하지 않으나 `chat_messages`에서 경계가 만난다(RLS 정책 ↔ cron DELETE 잡). 동시 소환하되 상호 침범 금지와 가정 문서화를 각각 지시했고, 양쪽이 독립적으로 같은 결론(`postgres`의 `rolbypassrls=true`로 충돌 없음)에 도달했다.
- 결과: 이슈 **3건**(major 1 · minor 2) 발견 / 전건 해소. 전체 테스트 3/3 통과.

## 팀원별 완료 내역

### CORE (01.CORE.md)
- 완료 Task: **029A · RLS 정책 설계와 적용 — 기본 거부·테이블별 정책·`TO` 절·서브쿼리 래핑**
- 산출물:
  - 신규 마이그레이션 13건 — 8개 도메인 그룹(`20260725003849_rls_profile_and_auth_policies.sql`, `..004000_rls_crew_and_membership_policies.sql`, `..004031_rls_invitation_join_request_policies.sql`, `..004112_rls_board_post_comment_policies.sql`, `..004204_rls_poll_policies.sql`, `..004238_rls_meetup_policies.sql`, `..004307_rls_chat_policies.sql`, `..004336_rls_notification_moderation_audit_policies.sql`) + 재귀 수정·후속 5건(`..004924_rls_fix_crew_membership_recursion.sql`, `..005001_rls_invitation_join_request_membership_sync.sql`, `..005356_rls_revoke_execute_on_membership_sync_triggers.sql`, `..005526_rls_crew_ownership_transfer_sync.sql`, `..005643_rls_fix_membership_guard_trigger_depth.sql`)
  - 신규 — `docs/decisions/rls-policies-029a.md`(테이블별 정책 설계 근거·D-028 4규약 적용 방식·재귀 회피·앱 권한 매트릭스 대조·029B 이월 목록·실측 로그)
  - 수정 — `docs/ROADMAP/team/01.CORE.md`(Task 029A 상태 완료 마커), `src/lib/data/supabase/README.md`(RLS 적용 사실 반영)
- 실측 수치: **정책 58건 · 21개 테이블 전 커버리지**(정책 0건 테이블 없음), 트리거 함수 13개(가드 6·프로비저닝/동기화 5·`poll_votes` 1·`profiles` 상태전이 1), 인덱스 6건 신규(`crews.owner_id`·`poll_votes.voter_id`·`comments.author_id`·`chat_messages.sender_id`·`invitations.inviter_id`·`meetup_attendances.profile_id` — 나머지는 `pg_indexes` 확인 후 028 기존 인덱스 재사용).
- `get_advisors(security)` 전후: 착수 전 `rls_enabled_no_policy` INFO **21건** → 최종 **lint 0건**.
- 비고:
  - **착수 전 D-037 확인(실측)** — 21개 도메인 테이블·마이그레이션 11건 확인, 낯선 테이블 없음 → 정상 진행.
  - **상호 재귀를 실측으로 발견·수정(정적 리뷰로는 못 잡는 유형).** D-028이 경고한 자기참조 재귀뿐 아니라 `crews`↔`crew_memberships`가 **서로를** 서브쿼리해도 `42P17 infinite recursion`이 난다는 것을 트랜잭션 롤백 테스트 중 확인했다. `crew_memberships`를 **자기 행 전용 리프 노드**(`profile_id=(select auth.uid())` 단독 조건)로 좁히고, 초대(FR-020·021)·가입신청(FR-022·023)·오너 이양(FR-025)은 `invitations`/`join_requests`/`crews`의 안전한 인가 + `postgres` 소유 트리거의 부수효과로 우회 구현했다.
  - **자가 role 상승 차단 가드를 `pg_trigger_depth()`로 구현.** 초기엔 `auth.uid()` 비교로 만들었다가 **오너 이양 시 구오너의 자기 강등이 막히는 버그**를 실측으로 발견해, "클라이언트 직접 UPDATE(depth≤1)" ↔ "신뢰된 부수효과(depth>1)"를 구조적으로 구분하는 방식으로 재수정했다.
  - **028이 만든 `poll_votes` 불변성 트리거가 D-003을 위반하던 버그를 발견해 수정.** 14일차에는 `choice`/`voted_at` 갱신을 전면 차단했으나, D-003은 투표가 **open인 동안 무제한 변경 가능**을 요구한다. "open 중 가변 · 종료 후 불변"으로 고쳐 **D-003과 NFR-032를 양립**시켰다.
  - **029A 범위 준수** — `private` 스키마·SECURITY DEFINER 헬퍼·Realtime Authorization·검색 3필드 제한은 만들지 않았다(029B 범위). `npx tsc --noEmit` 통과, `npm run build`·개발 서버 미실행(I-037 절차).
  - **D-030 경계 유지** — UI 컴포넌트·`@/lib/data` 배럴·Mock 구현 무변경.

### DESIGN (02.DESIGN.md)
- 완료 Task: **035 · 채팅 12개월 자동 파기 배치**
- 산출물:
  - 신규 마이그레이션 2건 — `supabase/migrations/20260725003109_create_chat_retention_purge_job.sql`(파기 함수 + cron 잡 등록), `20260725011149_fix_chat_purge_permissions_and_timing.sql`(교차검증 대응 후속)
  - 신규 — `docs/decisions/chat-retention-035.md`(보존기간 요구사항 근거·함수 설계·검증·RLS 결론·운영 지침·크루 해산 파기와의 관계·인계 사항)
  - 수정 — `docs/decisions/cron-foundation.md`(3절에 잡 등록 현황 1줄 부기, 027 문서 구조 유지), `docs/ROADMAP/team/02.DESIGN.md`(Task 035 상태 완료 마커)
- 실측 수치: 잡 `purge_expired_chat_messages`, 스케줄 `0 18 * * *`(18:00 UTC = 03:00 KST), `cron.job` 실측 `jobid=1 · username='postgres' · active=true`. CON-10 동시 잡 8개 중 현재 1개.
- 비고:
  - 함수 `public.purge_expired_chat_messages(batch_size int default 5000, max_duration interval default '7 minutes')` — `security invoker`, `set search_path=''`(14일차 `function_search_path_mutable` WARN을 재발시키지 않도록 **처음부터** 고정), 배치 크기 제한 루프 + 배치당 `statement_timeout='2min'`.
  - **경계 조건은 `created_at < now() - interval '12 months'`** — NFR-033의 "13개월 전 메시지가 조회되지 않는다"를 만족하고, "정확히 12개월 전" 행은 보존된다(파기는 12개월+1일부터). DB `TimeZone=UTC` · `timestamptz` 비교라 저장 타임존과 무관(NFR-025와 충돌 없음).
  - 검증은 트랜잭션 안에서 `auth.users`→`profiles`→`crews`→`chat_rooms`→`chat_messages` 합성 데이터를 만들어 실행 후 **ROLLBACK**했고, 롤백 후 전 테이블 잔여 0건을 재확인했다(실 데이터 오염 없음).
  - **한계를 정직하게 기록** — `EXPLAIN (ANALYZE, BUFFERS)`상 삭제 대상 선별 서브쿼리는 `idx_chat_messages_created` Index Scan이지만, `chat_messages`가 0행이라 DELETE 바깥쪽 id 매칭은 플래너가 **Seq Scan을 선택**했다. CORE가 동일 쿼리로 독립 재현해 같은 플랜(내부 Index Scan이나 "never executed", 외부 Seq Scan)을 확인했다.
  - **RLS 상호작용**: `SECURITY DEFINER` 불필요. `chat_messages` 소유자=`postgres`, `pg_roles.postgres.rolbypassrls=true`, cron 잡이 `postgres`로 등록돼 잡 실행 시 RLS를 항상 우회한다 — **029A가 채우는 정책 개수·내용과 무관하게 결론이 바뀌지 않는다**(정책이 아니라 role의 BYPASSRLS 속성에 의존). `FORCE ROW LEVEL SECURITY`는 어디에도 적용하지 않았다.
  - **범위 밖 명시** — 크루 해산 시 즉시 파기(D-009 후반)는 크루 해산 기능 Task 착수 시의 별도 삭제 로직이며, 문서 6절에 구현 지침을 남겼다. Task 034(투표 자동 종료) 잡은 등록하지 않았다(`cron.job` 실측 도메인 잡 1개로 확인).

## 교차검증 결과
활성 2명의 리뷰 짝을 각 Task의 지정 리뷰어대로 배치했다 — Task 029A 리뷰어 **BOARD**(CORE 프로필 리뷰 짝 = DESIGN·BOARD), Task 035 리뷰어 **CORE**(DESIGN 프로필 리뷰 짝 = CORE·CREW). 양쪽 모두 supabase MCP로 실제 DB를 직접 조회·실행해 실측했고, 파괴적 검증은 전부 트랜잭션 + ROLLBACK으로 처리했다(잔여 행 0건 재확인).

- **BOARD → CORE(029A) 1차**: 9개 검증 항목 **전부 PASS**, minor 1건 발견(아래 이슈 3).
  1. 정책 커버리지 — 21개 테이블 전부 정책 1건 이상, 0건 테이블 없음. 다만 총수가 실측 **58건**으로 CORE 보고(60건)와 불일치.
  2. D-028 4규약 — `pg_policies.roles`에 `{public}` **0건**(TO절 전수 명시), `qual`/`with_check`에 미래핑 `auth.uid()` **0건**(정규식 전수 grep), 재귀 없음, 인덱스 대조 완료.
  3. 재귀 부재 실증 — 여러 role로 크루/멤버십/게시글/투표 CRUD를 반복 실행, `42P17` 전혀 미재현.
  4. **권한 매트릭스 대조(가장 중요)** — `set local role authenticated` + `request.jwt.claim.sub`로 role을 바꿔가며 8개 시나리오를 실행: 비크루원의 private 크루 조회 `count=0`(D-007) / 일반 멤버 자가 role 상승 `EXCEPTION` / 남의 게시글 UPDATE `rows_affected=0` / 남의 `poll_votes` SELECT·UPDATE 전부 차단 / 임원의 `crews.visibility` 변경 `EXCEPTION`·`description` 변경 허용(D-007·D-012 정합) / **오너의 남의 `crew_memberships.role` 변경 `rows_affected=0`** — CORE가 자백한 029B 이월 gap이 실제로도 막혀 있음을 확인(과장 없음).
  5. **`poll_votes` 트리거 정당성(가장 엄격히 확인)** — open 상태 본인 투표 UPDATE 성공(`'for'`→`'against'`) → poll을 `closed_rejected`로 종료 후 같은 행 UPDATE 시도 `EXCEPTION` → 최종 저장값 재조회 `against`(open 중 변경분 유지). **D-003과 NFR-032 양립을 실측으로 확인**했고, CORE의 "028 트리거가 D-003을 위반했다"는 판단과 수정 모두 타당하다고 판정.
  6. SECURITY DEFINER 노출 차단 — `prosecdef=true`인 5개 트리거 함수 전부 `has_function_privilege(anon/authenticated/public, execute)=false`, `get_advisors(security)` `lints: []`.
  7. 029B 범위 침범 없음 — `private` 스키마 없음, `realtime.messages` 정책 없음. "멤버 목록 조회조차 막혀 있다"는 인계도 실측으로 사실 확인했고, **재귀 없는 리프 노드 설계상 불가피한 트레이드오프이며 029A 범위에서 헬퍼 없이 풀 방법이 없다는 CORE 판단에 동의**·029B 최우선 이월이 합당한 분할이라고 판정.
  8. 경계·문서 정합성 — `git diff`상 UI·배럴·Mock 무변경(D-030), `list_migrations` 25건이 파일과 1:1 일치.
  9. Task 035 충돌 없음 — `chat_messages` `relrowsecurity=true`·`relforcerowsecurity=false`, 파기 잡은 `postgres`로 실행돼 정책이 0→58건으로 늘어도 영향 없음. **CORE·DESIGN 양쪽 마이그레이션 주석이 독립적으로 동일 결론을 기록**했고 실측도 일치.
- **BOARD → CORE(029A) 재검증**: 정책 수치 정정 후 재조회. 총합 58 및 **테이블별 분포 표 전체 일치**, 세 문서에서 살아 있는 "60" 잔존 0건(마이그레이션 타임스탬프 `20260725...`에 걸리는 grep 오탐은 스스로 걸러냄), `01.CORE.md` 변경이 1줄 삽입뿐(범위 침범 없음), §10 정정 이력이 029B 기준선으로 충분함 — **전 항목 pass**.
- **CORE → DESIGN(035) 1차**: 7개 항목 중 5개 PASS, **major 1 · minor 1** 발견(아래 이슈 1·2).
  1. 보존 기간 근거 PASS — NFR-033 원문과 문서 인용 일치, "정확히 12개월 전" 행으로 경계 재현해 보존 확인.
  2. 잡·함수 실측 **FAIL(major)** — 아래 이슈 1.
  3. CON-10 준수 **부분 우려(minor)** — 아래 이슈 2.
  4. 파기 동작 PASS — DESIGN 결과를 믿지 않고 **직접** 경계값 5건(13개월/정확히 12개월/12개월+1일/1개월/소프트삭제분)으로 재현, 반환값·생존 행 일치. 검증 중 트랜잭션 경계가 깨질 뻔한 것을 스스로 발견해 단일 호출로 재구성하고 오염 없음을 별도 확인했다.
  5. RLS 상호작용 PASS — `rolbypassrls`·`relforcerowsecurity` 실측 확인, 029A 정책 58건 중 어느 것과도 충돌 없음.
  6. FK 연쇄 PASS — `chat_messages`를 참조하는 FK **0건**(`pg_constraint` 실측). `chat_messages`가 참조하는 3개 FK는 전부 RESTRICT지만 방향이 반대라 무관 — 연쇄도, RESTRICT로 인한 삭제 실패 경로도 없다.
  7. 문서 정합성·범위 PASS — `list_migrations`와 파일 1:1, `cron-foundation.md` 구조 미파괴, Task 034 범위 침범 없음, "0행이라 Seq Scan" 서술은 독립 재현으로 정확함을 확인.
- **CORE → DESIGN(035) 재검증**: 6개 항목 **전부 PASS · 추가 이슈 0건**. grantee 4개→**2개**(`postgres`·`service_role`) 실측, `pg_get_functiondef` 최종 정의가 파일과 1:1 일치(`'00:07:00'` interval·`set local statement_timeout='2min'`), worst-case 산식 검증(`started_at` 1회 설정 + 매 배치 후 누적 경과 체크 구조 → 다음 배치 시작 시점 누적은 항상 ≤7분, 그 배치는 2분에서 강제 종료 → **상한 정확히 9분**), 잡·RLS 불변·`lints: []`, 문서-DB 정합, 경계값 4건 독립 재현.

## 발견·해결한 이슈
3건 — major 1 · minor 2. 전건 회차 내 해소.

1. **[CORE 발견 · DESIGN 035] 함수 EXECUTE 권한이 문서 주장과 달랐다(major).** `chat-retention-035.md` §4는 "PUBLIC 회수 후 postgres·service_role에만 부여"라고 적었으나 `information_schema.routine_privileges` 실측 grantee는 **`anon`·`authenticated`를 포함한 4개**였다. 원인은 `revoke all on function ... from public`이 Supabase가 신규 함수에 붙이는 **`anon`/`authenticated` 개별 grant**를 회수하지 못하기 때문이다(`public` 슈도롤과 별개). `security invoker`이고 `chat_messages`에 DELETE 정책이 0개라 실제 피해는 없었으나, **의도한 권한 경계(운영자 전용)가 성립하지 않았고** 향후 DELETE 정책이 추가되면 즉시 악용 표면이 된다. → DESIGN이 후속 마이그레이션(`20260725011149`)에서 `revoke execute ... from public, anon, authenticated`로 세 대상을 명시 회수. 재실측 grantee **2개**. CORE 재검증 pass.
   - **부수 발견**: `get_advisors`가 이 gap을 못 잡은 이유는 `*_security_definer_function_executable` 계열 lint가 **SECURITY DEFINER 함수만** 검사하기 때문이다. **"새 WARN 없음"이 "권한이 좁다"를 뜻하지 않는다** — invoker 함수의 EXECUTE 권한은 advisor가 아니라 `routine_privileges`로 직접 확인해야 한다. 문서에 교훈으로 기록했다.
2. **[CORE 발견 · DESIGN 035] CON-10 "잡당 10분" 보장 문구가 엄밀하지 않았다(minor).** `statement_timeout`은 **배치(statement) 단위로 매번 리셋**되고 `max_duration` 소프트 체크는 각 배치가 **끝난 뒤에만** 평가되므로, 실제 상한은 두 값의 **합**이다. 원래 값(`max_duration` 8분 + `statement_timeout` 9분)의 진짜 worst-case는 **최대 약 17분**이어서 CON-10을 실질적으로 보장하지 못했다. → DESIGN이 (a)안(파라미터 실제 조정)을 채택해 `max_duration` **7분** + `statement_timeout` **2분** = **worst-case 9분 < 10분**(1분 여유)으로 재계산했고, 원래 값이 17분이었다는 사실도 문서에 정직히 남겼다. CORE 재검증 pass(산식이 실제 상한과 일치함을 구조 근거로 논증).
   - 문서 교훈으로 기록: **"소프트 예산 체크 + 하드 타임아웃" 조합의 worst-case는 항상 두 값의 합으로 계산해야 하며, "이중 방어"라는 표현만으로 예산 준수를 주장하면 안 된다.**
3. **[BOARD 발견 · CORE 029A] 정책 총수 문서 수치 오류(minor).** CORE가 "정책 60건"으로 보고해 `rls-policies-029a.md` §9·`src/lib/data/supabase/README.md`에 기재했으나 `pg_policies` 실측은 **58건**이었다. → CORE가 재조회해 58을 확인하고, **세는 기준 차이가 아니라 최종 보고문 작성 시의 단순 계수 오류**임을 규명했다(8개 도메인 마이그레이션 적용 직후 집계도 이미 58이었고, 이후 마이그레이션은 정책을 증감시키지 않았다). 팀장이 지정한 2개 파일 외에 **`docs/ROADMAP/team/01.CORE.md`에도 같은 오류가 옮겨 적힌 것을 스스로 발견해 함께 정정**했고, §10에 정정 이력과 "029B는 58을 기준선으로 삼을 것"을 남겼다. BOARD 재검증 pass(분포 표 전체 일치).

### 팀장 오판 1건 (기록)
BOARD 재검증 중 "`20260725011149` 마이그레이션이 CORE의 범위 밖 변경"이라는 지적이 나왔고, **팀장이 파일 헤더의 "Task 035 후속(15일차 교차검증, CORE)"를 작성자 표기로 오독해 CORE에 경계 위반을 지적했다.** 실제로는 **"CORE의 교차검증에 따른 후속"이라는 뜻이었고 작성자는 DESIGN**이며, 파일 mtime(10:11:40)과 보고 순서가 이를 뒷받침한다. 팀장이 사실 확인 후 CORE에 지적을 철회하고 BOARD에도 정정을 통지했다. 함께 지적됐던 "`chat-retention-035.md` 미갱신"도 **DESIGN이 저장하기 직전에 읽은 타이밍 레이스**였다(현재 문서는 2min/7min·worst-case 9분으로 정확히 갱신됨). 이슈로 세지 않는다 — 코드·문서에 남은 결함이 없기 때문이다.
- **교훈**: ① 동시 교차검증 2건이 도는 회차에서는 **마이그레이션 헤더에 작성자와 지적자를 구분해 적어야** 한다("작성: DESIGN / 지적: CORE" 형태). ② 동시 작업 중 문서 정합성을 판정할 때는 읽은 시각과 저장 시각의 창을 고려해야 한다.

## 팀장 전체 테스트 (항상 실행)
- `npm run lint`: **통과** (exit 0, 출력 없음)
- `npx tsc --noEmit`: **통과** (exit 0, 출력 없음)
- `npm run build`: **통과** (exit 0). `Compiled successfully in 9.8s`, `Finished TypeScript in 11.2s`, 정적 페이지 15/15, 20개 라우트 전부 `ƒ (Dynamic)`. RLS 정책·cron 잡은 앱 번들과 무관해 라우트 구성 변화 없음
- 참고: 빌드는 `--force`로 복구된 로컬 `node_modules`에서 돌았다 — I-045(temporal-polyfill peer 충돌)는 이번 회차와 무관하게 열려 있다

## 문서 갱신
- `docs/ROADMAP/team/01.CORE.md`: Task 029A에 `- 상태: 완료 (15일차, 2026-07-25)` + 마이그레이션·정책 수치·재귀 수정·029B 이월 반영
- `docs/ROADMAP/team/02.DESIGN.md`: Task 035에 `- 상태: 완료 (15일차, 2026-07-25)` + 잡 등록·검증·교차검증 반영
- `docs/decisions/rls-policies-029a.md`: 신규 — RLS 설계 근거·D-028 4규약 적용·재귀 회피·권한 매트릭스 대조·029B 이월·정정 이력
- `docs/decisions/chat-retention-035.md`: 신규 — 보존기간 근거·함수 설계·CON-10 재계산·RLS 경로 구분표·인계 사항
- `docs/decisions/cron-foundation.md`: 3절에 잡 등록 현황 1줄 부기
- `src/lib/data/supabase/README.md`: RLS 적용 사실·정책 58건 반영
- `supabase/migrations/`: 신규 15건(RLS 13 + 채팅 파기 1 + 파기 후속 1)
- `docs/team/*.md`: **변경 없음** — 팀원 상태 변화 없음
- `docs/ISSUES.md`: **새 이슈 등재 0건** — 이번 3건은 회차 내 발견·해소돼 등재 대상 아님

## 다음 회차에 열리는 Task

| Task | 담당 | 의존 | 비고 |
| --- | --- | --- | --- |
| **029B** RLS 정책 설계와 적용 — `private` 차단·`SECURITY DEFINER` 헬퍼·Realtime Authorization | CORE | 028 ✓ · 029A ✓ | **029A 완료로 새로 열렸다.** 공수 7.0인일(L, 27~28주차). 참조 D-017·D-028·D-023·D-007, NFR-013, R-012 |

- **029B는 CORE 단독이고, 이것이 CORE 단독 직렬 사슬의 마지막이다. 029B가 끝나야 DESIGN 031·CREW 030이 열린다.**
- **029B 착수 시 인계 사항(`rls-policies-029a.md` 기준, 우선순위 순)**:
  1. **`private.my_active_crew_ids()`류 SECURITY DEFINER 헬퍼 — 최우선.** 없으면 임원 임명·강퇴(FR-024·027)와 `crew_memberships` 동료 조회(멤버 목록 UI)가 DB 레벨에서 막혀 있다(**오너조차 남의 멤버십 행을 못 본다** — BOARD 실측 확인). 029A가 재귀 회피를 위해 `crew_memberships`를 자기 행 전용 리프 노드로 좁힌 결과다.
  2. `poll_votes` 집계(찬성/반대/기권 수) 크루원 전체 공개 — D-031(5명 미만 특례) 포함, 개별 행 비노출 집계 뷰/RPC 필요.
  3. 게스트용 크루 "멤버 수" 집계, private 크루 "이름만" 부분 노출(D-007) — 둘 다 column-level 뷰/RPC 필요.
  4. **`system_admin` 식별 컬럼·역할 테이블이 스키마 자체에 없다**(028부터 부재). 관리자 기능은 현재 `service_role` 경로로만 가능하다.
  5. Realtime Authorization(`realtime.messages` 정책)·검색 3필드 제한 — 029B 명시 범위, 미착수.
  6. **정책 총수 기준선은 58건이다**(60이 아니다).
- **Task 035 인계**: `batch_size=5000`이 `statement_timeout=2min` 안에 끝나는지는 **현재 0행이라 실측하지 못한 분석적 판단**이다(근거: `chat_messages`에 DELETE 트리거 없음, 유지 인덱스 5개 → 5000행 삭제 시 인덱스 항목 제거 약 25,000건 규모). 실 데이터가 쌓인 뒤(**Task 036 통합 테스트 또는 그 이전**) 실제 배치 소요를 한 번 측정해 검증해야 하며, 2분을 넘기면 `batch_size`를 낮춘다. 같은 시점에 EXPLAIN도 재검증한다(현재 0행이라 외부 매칭이 Seq Scan).
- **그 외 남은 리스크**: 배치 루프가 커밋 없이 단일 트랜잭션에서 도는 구조(긴 트랜잭션·락 유지)는 이번 파라미터 변경으로 악화되지 않았으나 그대로 남아 있다. `cron.job_run_details` 자동 정리 배치는 027부터 계속 없다 — Task 034 등록 시 재검토 권고.
- **I-045(열림)**: 다음 배포 검증·CI 도입 전 temporal-polyfill peer 충돌 근본 해결 필요. 029B와는 독립.

## git
- 브랜치: `day-15` (`day-14`에서 분기)
- 커밋: 아래 참고
- 푸시: 사용자 확인 대기
