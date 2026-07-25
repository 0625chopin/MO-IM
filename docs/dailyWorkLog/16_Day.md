# 16일차 작업 로그 (2026-07-25)

## 회차 요약
- 활성 팀원: **CORE 1명**. 리뷰어로 **DESIGN**을 교차검증에 소환(Task 029B의 지정 리뷰 = DESIGN).
- 이번 회차 배치 근거: 완료 집합 {Task 001~028 전량 · 029A · 035} 기준으로 선행조건이 모두 풀린 미완료 Task는 **029B**(CORE, 의존 028 ✓ · 029A ✓, 선행 대기 없음) 1건뿐이다. DESIGN 031·CREW 030·BOARD 033·038은 전부 029B 완료가 선행이라 대기했다.
- **이번 회차로 12일차부터 이어진 CORE 단독 직렬 사슬이 끝났다.** 029B는 그 사슬의 마지막 고리였고, 다음 회차부터 DESIGN·CREW·BOARD 3명이 동시에 열린다.
- 결과: 이슈 **5건**(major 2 · minor 3) 발견 / 전건 해소. 전체 테스트 3/3 통과.

## 팀원별 완료 내역

### CORE (01.CORE.md)
- 완료 Task: **029B · RLS 정책 설계와 적용 — `private` 차단 · `SECURITY DEFINER` 헬퍼 · Realtime Authorization**
- 산출물:
  - 신규 마이그레이션 8건 — `supabase/migrations/20260725015228_rls_private_schema_and_helpers.sql`, `..015307_rls_crew_membership_officer_actions.sql`, `..015601_rls_poll_vote_tally_function.sql`, `..015614_rls_crew_directory_summary_function.sql`, `..015631_rls_realtime_authorization_policies.sql`, `..015645_rls_profile_search_function.sql`, `..015801_rls_move_definer_logic_to_private_wrappers.sql`, `..022234_rls_fix_profile_search_exact_match.sql`(교차검증 대응)
  - 신규 — `docs/decisions/rls-policies-029b.md`(설계 근거·헬퍼 시그니처·재귀 회피 논증·권한 매트릭스 실측·Realtime 토픽 규칙과 Task 033 인계·범위 밖 이월·교차검증 대응 §13)
  - 수정 — `docs/ROADMAP/team/01.CORE.md`(Task 029B 완료 마커), `src/lib/data/supabase/README.md`(RPC 3종 사용 지침·FR-020 초대 경로 인계·`private` 운영 경고), `src/lib/data/supabase/database.types.ts`(재생성)
- 실측 수치: `pg_policies` public **58건 불변**(029A 기준선 그대로 — 신규 정책 0건, 기존 2건의 qual만 OR 확장) + `realtime` 스키마 **2건 신규**. `private` 스키마 SECURITY DEFINER 함수 **6개**. `get_advisors(security)` **0건**. 트랜잭션 롤백 시나리오 **23개 전부 기대와 일치**, `42P17` 미재현. `list_migrations` **34건**.
- 비고:
  - **029A가 남긴 최대 gap을 재귀 없이 해소했다.** 029A는 `42P17 infinite recursion`을 피하려 `crew_memberships`를 "자기 행 전용 리프 노드"로 좁혔고, 그 결과 임원 임명(FR-024)·강퇴(FR-027)·멤버 목록 조회(FR-028)가 DB 레벨에서 전면 차단돼 있었다(오너조차 남의 멤버십 행을 못 봤다). 헬퍼 4개(`my_active_crew_ids`·`my_crew_role`·`is_active_crew_member`·`is_crew_staff_or_owner`)를 SECURITY DEFINER 블랙박스로 두어 정책 재작성 단계의 순환 탐지를 우회했고, **정책을 새로 만들지 않고 기존 2건의 qual만 확장**해 029A 기준선을 보존했다.
  - **자체 교차검증에서 SECURITY DEFINER 노출 WARN을 스스로 발견해 구조로 해소했다.** RPC 3종을 처음엔 `public`에 SECURITY DEFINER로 만들었다가 `anon/authenticated_security_definer_function_executable` WARN 2건이 뜨자, **`private.*` 구현체 + `public.*` SECURITY INVOKER 얇은 래퍼** 2단 구조로 재구성(7번 마이그레이션)해 advisor 0건으로 되돌렸다.
  - **외부 문서를 기억이 아니라 조회로 확인했다.** 팀장 지시에 따라 `mcp__supabase__search_docs`로 Realtime Authorization·Broadcast·Subscribing to DB Changes·Using Custom Schemas·Securing your API 5건을 직접 조회해 근거로 삼고 출처를 문서 §1에 명시했다. Realtime Authorization은 버전에 따라 스키마·정책 형태가 달라진 영역이라 기억 의존을 금지한 조치다.
  - **작업 중 사고 1건을 자진 신고했다.** 첫 `crew_memberships` 검증에서 `rollback` 대신 `commit`을 적어 테스트 데이터 4행이 잠깐 커밋됐다. 즉시 발견해 수동 삭제하고 잔여 0건을 재확인했으며 문서 §10에 정직히 기록했다. 전 테이블이 0행 상태여서 실사용자 데이터 영향은 없었다. DESIGN이 21개 도메인 테이블 + `auth.users`를 전수 COUNT해 뒷정리를 독립 확인했다.
  - **범위 준수** — UI·`@/lib/data` 배럴·Mock 무변경(D-030). `system_admin` 식별은 스키마 추가가 필요해 새 결정 사안으로 명시 이월했다.

## 교차검증 결과
Task 029B의 지정 리뷰어인 **DESIGN**을 소환했다. DESIGN은 이번 회차 담당 구현 Task가 없었고(031이 029B 완료를 기다린다), 후속으로 029B 산출을 직접 이어받는 당사자라 인계 관점 검증까지 함께 맡겼다.

- **DESIGN → CORE(029B) 1차**: 9개 항목 중 **8개 PASS**, **major 1 · minor 3** 발견(아래 이슈 1~4). CORE의 보고문을 그대로 믿지 않고 `execute_sql`·`get_advisors`·**실제 HTTP 호출**로 전부 독립 재현했으며, 파괴적 검증은 전부 `begin`…`rollback` + 잔여 0건 재확인으로 처리했다.
  1. 잔여 테스트 데이터 — 21개 테이블 + `auth.users` 전수 COUNT **0행**(CORE의 commit 사고 뒷정리 확인).
  2. 정책 총수·분포 — public **58** · realtime **2**, 029A 문서 §9 기준선과 테이블별 분포 1:1 대조 전부 일치.
  3. D-028 4규약 — `roles='{public}'` 0건, 확장된 qual의 `auth.uid()` 전부 `(SELECT auth.uid())` 래핑, 정책 컬럼 인덱스 존재.
  4. 재귀 부재 — owner/staff/member/outsider 4개 프로필로 약 10개 시나리오 반복, `42P17` 미재현.
  5. 권한 매트릭스 — 오너의 임원 임명(FR-024) 성공 / 임원의 강퇴(FR-027) 성공 / 임원의 타 임원 강퇴 예외(E1) / 일반 멤버 자가 상승 차단 / 비크루원 조회 0행 / `poll_vote_tally` D-031 특례(대상 2명 open → `tally_hidden=true`, closed 전환 후 집계 공개) / 게스트의 `crew_directory_summary`가 D-007대로 공개 크루는 전체·비공개는 이름만.
  6. **`private` 격리를 SQL 추론이 아니라 실제 네트워크로 증명** — PostgREST에 `Accept-Profile: private`로 직접 HTTP 요청을 보내 **406 `"Only the following schemas are exposed: public, graphql_public"`** 을 받아냈다.
  7. Realtime — 정규식 8케이스(잘못된 entity·uuid·접미 조작·36자 비하이픈 문자열·prefix 부착 등) 직접 실행 전부 기대대로. CORE의 "파티션 0개라 end-to-end 실측 불가" 주장을 `pg_inherits` 조회 + **직접 INSERT 시도로 `no partition of relation "messages" found for row` 재현**해 정직성을 이중 확증했다.
  8. 문서 정합성 — `list_migrations`가 파일과 버전 문자열까지 1:1, 029A 문서 무변경, D-030 경계 유지, 이월 6건이 참조 결정 어디에도 근거가 없어 범위 밖 판단 타당.
  9. Task 031 인계 — README의 RPC 사용 지침은 충분하나 `database.types.ts` 미재생성 지적(이슈 3).
- **DESIGN → CORE(029B) 재검증**: 지시 6개 항목 **전부 PASS**, 신규 **minor 1건** 발견(이슈 5). 정확 일치를 8개 시나리오로 재현했고, 구 시그니처 제거는 CORE가 쓴 `routine_privileges`(grant 0건)보다 강한 **`pg_proc` 직접 조회**로 오버로드가 1개뿐임을 확증했다. 타입 파일에 RPC 3종이 실제로 들어갔고 `private` 스키마는 노출되지 않았음을 확인, `npx tsc --noEmit`도 직접 실행해 exit 0을 재확인했다.
- **DESIGN → CORE 3차(문서 정정)**: MINOR 5 해소를 CORE가 자체 재확인(동일 실측 재현)으로 마감. DB 변경 없음.

## 발견·해결한 이슈
5건 — major 2 · minor 3. 전건 회차 내 해소.

1. **[DESIGN 발견 · CORE 029B] `profile_search`가 부분 일치로 구현돼 사용자 열거 취약점을 재도입했다(major).** `20260725015645` 마이그레이션이 `p.handle ilike '%' || p_query || '%'`로 구현돼, DESIGN이 `profile_search('zzsearch', 20)` 호출 시 부분 포함 핸들(`zzsearchoptin`)이 실제로 반환되는 것을 재현했다. **요구사항 위반이 명확하다** — `requirements.md` FR-006 AC2 "앞 3글자만 입력 → **0건**(부분 일치 불가)", 3.6절 "정확 일치이므로 **0건 또는 1건**", FR-006 설명 "핸들 **정확 일치**로 사용자 1명을 찾는다". 팀장이 원문을 직접 대조해 지적이 정확함을 확인했다. 아이러니하게도 해당 마이그레이션 주석 자체가 "R-012 대응"이라고 밝히면서 R-012가 경계하는 바로 그 열거 공격 표면을 만들었다. → CORE가 `p.handle = p_handle` 정확 일치로 교체하고 무의미해진 `p_limit` 파라미터를 제거. DESIGN 재검증 pass(8시나리오 재현, 구 오버로드 부재를 `pg_proc`으로 확증).
   - **교훈**: 마이그레이션 주석이 참조 리스크 번호를 인용한다고 해서 그 리스크가 실제로 방어됐다는 뜻이 아니다. **참조 문서의 AC를 열어 문언과 대조**해야 한다 — 이 건은 정적 리뷰가 아니라 요구사항 원문 대조로만 잡히는 유형이었다.
2. **[DESIGN 발견 · 팀장 승격 · CORE 029B] 같은 함수가 `id`를 포함해 4필드를 반환해 NFR-013을 위반했다(major).** NFR-013 "handle·displayName·avatarUrl **3필드만** 반환한다", 3.6절 "그 외 어떤 필드도 반환하지 않는다"에 어긋난다. DESIGN은 "초대 버튼(FR-020)에 식별자가 필요하니 요구사항 자체의 누락일 수 있다"며 minor로 올렸으나, **팀장이 major로 승격**했다 — 명문 규정 위반이고 이슈 1과 같은 파일이라 함께 고치는 것이 맞다. 팀장 판단은 "**핸들이 unique면 핸들 자체가 식별자로 충분**하며 초대 경로는 서버가 핸들을 재해석하면 된다"였고, **unique 제약 실측을 전제 조건으로 걸어** 없으면 고치지 말고 보고하도록 지시했다. → CORE가 `profiles_handle_key UNIQUE (handle)`를 `pg_constraint`로 실측 확인한 뒤 `id`를 제거해 3필드로 축소하고, FR-020 초대 경로가 handle 기반 서버 재해석이어야 함을 문서에 인계. DESIGN 재검증 pass(`pg_get_functiondef`로 반환 컬럼 직접 확인, 인계 경로가 현재 스키마에서 실제로 성립함까지 확인).
3. **[DESIGN 발견 · CORE 029B] `database.types.ts`가 029A·029B 이후 재생성되지 않았다(minor).** 마지막 변경 커밋이 `4da0e18`(Task 028, 14일차)이라 새 RPC 3종과 `private` 스키마가 타입에 전혀 없었고, Task 031/032가 `supabase.rpc(...)`에 타입 안전성을 받지 못하는 상태였다. 029B 산출물·이월 목록 어디에도 언급이 없어 누락으로 판단됐다. → CORE가 **major 2건을 먼저 고친 뒤** `generate_typescript_types`로 재생성(순서를 지켜야 타입이 최종 시그니처와 맞는다). DESIGN 재검증 pass(RPC 3종 존재·`private` 미노출·시그니처 일치·`tsc` exit 0 직접 확인).
4. **[DESIGN 발견 · CORE 029B] `private` 격리가 코드가 아니라 대시보드 설정에만 의존한다는 경고가 문서에 없었다(minor).** `authenticated`/`anon`은 public invoker 래퍼가 호출해야 하므로 `private.*`에 EXECUTE를 이미 갖고 있고, 안전한 이유는 오직 `private`가 PostgREST **Exposed schemas** 목록에 없기 때문이다. 이는 마이그레이션이 아니라 프로젝트 설정이라 **코드로 회귀 방지가 되지 않는다**. → CORE가 `rls-policies-029b.md` §2.4에 경고·확인 방법·운영 체크리스트를 신설하고 DESIGN의 406 실측을 근거로 인용.
5. **[DESIGN 발견 · CORE 029B] 위 §2.4에 새로 추가된 체크리스트 항목 하나가 실제로 동작하지 않았다(minor).** `current_setting('pgrst.db_schemas')` SQL 확인법이 Supabase Cloud에서 항상 `NULL`을 반환한다 — `set role authenticator` 후에도 NULL이고, `pg_db_role_setting`을 조회하면 `authenticator`에 해당 키가 **아예 없다**(호스티드 환경에서는 Exposed schemas가 Postgres GUC가 아니라 DB 바깥 관리 평면으로 주입된다). **위험은 결과가 없다는 게 아니라 운영자가 NULL을 "노출 안 됨"으로 오독해 거짓 안심할 수 있다는 점**이다. → CORE가 해당 항목을 제거하고 "이 GUC 경로는 호스티드 환경에 존재하지 않으며 NULL을 안전 신호로 오독하면 안 된다"는 경고로 교체. 유효한 확인 수단은 대시보드 육안 확인과 HTTP 프로브(406) 둘뿐임을 명시했다.
   - **교훈**: **결함을 고치며 추가한 문서가 새 결함이 될 수 있다.** 검증 절차를 문서에 적을 때는 그 절차를 한 번 실행해 보고 적어야 한다.

### 리뷰어의 자기 오판 정정 1건 (기록, 이슈 아님)
DESIGN이 권한 매트릭스 검증 중 "일반 멤버의 타인 role 변경이 예외를 던지지 않는다"며 **UNEXPECTED SUCCESS로 오판**했다가, **RLS의 `USING` 절 차단은 예외를 던지지 않고 조용히 0행 처리한다**는 점을 스스로 깨닫고 `GET DIAGNOSTICS row_count`로 재검증해 실제로는 정상 차단됨을 확인하고 철회했다. CORE 구현의 문제가 아니며 DESIGN이 자기 테스트 설계 실수임을 명시해 보고했다.
- **교훈**: RLS 검증 테스트는 **예외 발생 여부만으로 판정하면 안 된다.** `USING` 절 차단(조용한 0행)과 `WITH CHECK`/트리거 차단(예외)은 실패 형태가 다르므로, 차단 확인은 반드시 영향 행 수까지 확인해야 한다.

## 팀장 전체 테스트 (항상 실행)
- `npm run lint`: **통과** (exit 0, 출력 없음)
- `npx tsc --noEmit`: **통과** (exit 0, 출력 없음) — `database.types.ts` 재생성 후에도 기존 코드 무영향
- `npm run build`: **통과** (exit 0). `Compiled successfully in 9.7s`, `Finished TypeScript in 10.8s`, 정적 페이지 15/15, 20개 라우트 전부 `ƒ (Dynamic)`. RLS 정책·RPC는 앱 번들과 무관해 라우트 구성 변화 없음
- 이슈 해소 전(1차 산출 시점)과 해소 후 **2회 실행**했고 양쪽 모두 3/3 통과했다
- 참고: I-045(temporal-polyfill peer 충돌)는 이번 회차와 무관하게 계속 열려 있다

## 문서 갱신
- `docs/ROADMAP/team/01.CORE.md`: Task 029B에 `- 상태: 완료 (16일차, 2026-07-25)` + 헬퍼·RPC·Realtime 정책·교차검증 결과 반영
- `docs/decisions/rls-policies-029b.md`: 신규 — 설계 근거·`private` 차단 방식과 운영 경고(§2.4)·헬퍼 시그니처·재귀 회피 논증·권한 매트릭스 실측·Realtime 토픽 규칙과 Task 033 인계·타이밍 사이드채널 한계 명시(§7)·이월 목록(§11)·교차검증 대응(§13)
- `src/lib/data/supabase/README.md`: RPC 3종 사용 지침·`profile_search` 최종 시그니처·FR-020 초대 경로(handle 기반)·`private` 운영 경고 반영
- `src/lib/data/supabase/database.types.ts`: 재생성(RPC 3종 반영, `private` 미노출)
- `supabase/migrations/`: 신규 8건
- `docs/team/*.md`: **변경 없음** — 팀원 상태 변화 없음
- `docs/ISSUES.md`: **새 이슈 등재 0건** — 이번 5건은 회차 내 발견·해소돼 등재 대상이 아니다

## 다음 회차에 열리는 Task

**029B 완료로 CORE 단독 직렬 사슬이 끝나 3명이 동시에 열린다.**

| Task | 담당 | 의존 | 비고 |
| --- | --- | --- | --- |
| **031** 읽기 경로 실데이터 교체 | DESIGN | 029A ✓ · 029B ✓ | 리뷰어로서 029B를 검증하며 인계 사항을 이미 파악했다("031 착수를 막는 요소 없음"으로 판정) |
| **030** 인증 연결과 계정 잠금 구현 | CREW | 029A ✓ · 029B ✓ | **단, I-016 해소가 추가 선행 조건**이다 — 착수 전 `docs/ISSUES.md`에서 상태를 확인해야 한다 |
| **029B 후속 없음** | CORE | — | CORE의 다음 Task 044는 036 의존이라 한참 뒤다. **다음 회차 CORE는 유휴이거나 리뷰어로 투입된다** |

- **032**(DESIGN)는 031 완료가, **033**(BOARD)은 031·032 완료가 선행이라 아직 열리지 않는다.
- **Task 031 착수 시 인계 사항**(`rls-policies-029b.md`·`README.md` 기준):
  1. 멤버 목록은 정책이 이제 허용하므로 **직접 select**한다. 집계는 `poll_vote_tally`, 크루 소개는 `crew_directory_summary`, 사용자 검색은 `profile_search` RPC를 **반드시 경유**한다(원본 테이블 직접 조회로 우회하면 D-007·D-031·NFR-013 제약이 무력화된다).
  2. **FR-020 초대 경로는 `handle`을 그대로 넘기고 서버가 `handle→profile_id`를 재해석**한다(`profile_search`가 `id`를 반환하지 않기 때문). `profiles_select_authenticated`(029A, `qual=true`)가 열려 있어 Server Action에서 이 조회가 가능함을 DESIGN이 확인했다.
  3. `profile_search`는 **대소문자를 구분**한다. `handle`이 `citext`가 아닌 `text`(collation null)이고 요구사항에 대소문자 규정이 없어 스키마 그대로 채택한 결정이며, DESIGN도 "문언 위반이 아닌 UX 트레이드오프"로 동의했다. 핸들 정규화가 필요하면 **FR-001/가입 플로우에서 새로 결정할 사안**이다.
- **029B가 남긴 이월 6건**(`rls-policies-029b.md` §11):
  1. 강퇴자 표 무효화 트리거(FR-027 AC3) 미구현 — `poll_vote_tally`가 `invalidated` 컬럼을 이미 반영하므로 트리거만 추가되면 즉시 동작한다.
  2. FR-024/027 AC4 감사 로그 쓰기 경로 없음(`audit_logs`는 client 완전 거부 유지).
  3. `profiles` 컬럼 단위 self/타인 마스킹 미구현 — `profile_search`는 계약(3필드)일 뿐, 원본 테이블은 여전히 전 컬럼 공개다(029A 결정을 재작업하지 않았고 근거를 문서화했다).
  4. **`system_admin` 식별 — 새 결정이 필요하다.** 스키마에 역할 컬럼·테이블이 028부터 부재하며, 스키마 추가는 029B 범위 밖으로 명시 판단했다. DESIGN도 D-008과 정합하다고 봤다.
  5. Realtime 브로드캐스트 트리거(`realtime.broadcast_changes()` 부착)는 **Task 033 몫**이며 예시 SQL과 인계 지침이 문서 §6.2에 있다.
  6. **Realtime Authorization end-to-end 실측 미완** — `realtime.messages`가 파티션 0개이고 테이블 소유자가 `supabase_realtime_admin`(≠`postgres`)이라 테스트용 파티션 부착 자체가 거부된다. 정규식/파싱 로직과 `private.is_active_crew_member()`는 각각 실측했으나 **조합된 실제 행 기반 테스트는 Task 033이 첫 트래픽 시 재검증**해야 한다. CORE·DESIGN 양쪽이 독립적으로 이 한계를 확인했다.
- **미실측으로 남긴 판단 1건**: `profile_search` 정확 일치 경로의 **타이밍 상수성**(3.6절 "응답 시간도 상수에 가깝게")은 구조적 추론이며 실측되지 않았다 — MCP 경유 호출은 지터가 커서 안정적 측정이 불가능했다. 존재/비존재 모두 `handle` UNIQUE 인덱스를 프로브하는 동일 경로에 분기가 없다는 근거뿐이며, **실제 방어선은 NFR-016 레이트 리밋(분당 20회)**이다.
- **I-045(열림)**: temporal-polyfill peer 충돌은 다음 배포 검증·CI 도입 전 근본 해결이 필요하다. 이번 회차와 독립이다.

## git
- 브랜치: `day-16` (`day-15`에서 분기)
- 커밋: 아래 참고
- 푸시: 사용자 확인 대기
