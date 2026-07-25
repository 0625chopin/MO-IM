# RLS 정책 설계와 적용 — 기본 정책 몫 (Task 029A)

- **일자**: 2026-07-25(15일차)
- **담당**: CORE(A팀) · 리뷰 BOARD(B팀)
- **참조**: NFR-011·NFR-012, D-028·D-019, PRD §2.2, `docs/decisions/schema-migration-028.md` §5(인계 사항)
- **범위**: 21개 도메인 테이블에 "정책을 채운다." ENABLE은 028이 이미 끝냈다. `private` 스키마 SECURITY DEFINER 헬퍼·Realtime Authorization·검색 3필드 제한은 029B 범위라 만들지 않았다.

## 0. 착수 전 실측 확인

| 확인 항목 | 값 |
| --- | --- |
| `list_tables`(public) | 21개, 전부 `rls_enabled=true`, 낯선 테이블 없음 |
| `list_migrations` | 11건(028까지) + DESIGN의 `20260725003109_create_chat_retention_purge_job`(Task 035, 병행) |
| `get_advisors(security)` 착수 시점 | `rls_enabled_no_policy` INFO **21건**(테이블마다 1건), 그 외 0건 |
| `pg_roles.rolbypassrls` | `postgres`·`service_role`·`supabase_admin` = true, `anon`·`authenticated`·`authenticator` = false |
| `pg_tables.tableowner` | 21개 테이블 전부 `postgres` |

마지막 두 확인이 §7(Task 035 경계)의 근거다.

## 1. D-028 4대 규약 적용 방식

1. **`TO` 절 명시** — 모든 정책에 `to anon` 또는 `to authenticated`를 명시했다. `anon`을 대상으로 하는 정책은 `crews_select_anon_public`(공개 크루 소개, D-007) 하나뿐이다.
2. **서브쿼리 래핑** — `auth.uid()`는 정책·트리거를 막론하고 전부 `(select auth.uid())`로 감쌌다. initPlan 캐싱을 확인하려고 대표 정책 하나(`posts_select_members`)에 `explain (analyze, buffers)`를 돌려 `InitPlan`이 한 번만 평가되고 `Index Scan`/`Nested Loop` 경로로 잡히는지 확인했다(행 수가 0~십수 건뿐이라 계획 자체는 가벼웠지만, `(select auth.uid())` 유무에 따라 계획에 `InitPlan 1 (returns $0)` 노드가 잡히는 것으로 래핑이 실제로 적용됐음을 확인했다).
3. **재귀 회피** — §3 참고. 이 회차의 가장 큰 발견이 여기 있다.
4. **인덱스** — `crews(owner_id)`·`poll_votes(voter_id)`·`comments(author_id)`·`chat_messages(sender_id)`·`invitations(inviter_id)`·`meetup_attendances(profile_id)` 6개를 추가했다. 나머지 정책 참조 컬럼(`crew_memberships.profile_id`·`crew_id`, `posts.board_id`·`author_id`, `comments.post_id`, `invitations.crew_id`·`invitee_id`, `join_requests.crew_id`·`requester_id`, `notifications.recipient_id`, `reports.reporter_id` 등)은 **028이 이미 인덱싱해 두었다** — `pg_indexes` 실측으로 확인 후 중복 생성하지 않았다.

## 2. 처음 설계와 실제로 부딪힌 문제 — crews ↔ crew_memberships 상호 재귀

D-028은 "`crew_membership`이 자기 자신을 서브쿼리하면 재귀"라고 경고했다. 그래서 처음에는 "crew_memberships는 자기 행 또는 `crews.owner_id`(다른 테이블)만 본다"로 설계하면 안전하다고 판단했다 — **틀렸다.**

트랜잭션 롤백 실측(§6)에서 `ERROR: 42P17 infinite recursion detected in policy for relation "crew_memberships"`를 실제로 만났다. 원인은 **두 테이블이 서로를 가리키는 상호 재귀**였다:

- `crews`의 `authenticated` SELECT 정책이 "내가 속한 크루"를 알려고 `crew_memberships`를 서브쿼리한다(비소속 회원에게 private 크루를 감추는 D-007의 필수 조건).
- `crew_memberships`의 (최초 버전) SELECT/INSERT/UPDATE 정책이 "내가 오너인 크루"를 알려고 `crews`를 서브쿼리한다.

Postgres는 이 순환을 **평가 시점의 데이터와 무관하게, 정책 재작성(rewrite) 단계에서 정적으로** 감지해 즉시 실패시킨다 — "느려지는 게 아니라 아예 실행되지 않는다"는 점이 직접 재귀와 같다. 자기 자신을 향하지 않아도 두 테이블이 맞물리면 같은 오류가 난다는 것이 이번에 확인한 사실이다.

**수정**: 한쪽 방향만 남긴다. `crews -> crew_memberships`(D-007에 필수)는 유지하고, `crew_memberships -> crews`는 완전히 제거했다. 그 결과:

- `crew_memberships`의 SELECT/INSERT/UPDATE는 전부 `profile_id = (select auth.uid())`(자기 행) 조건 하나만 남는다 — 서브쿼리가 전혀 없는 **리프 노드**가 됐다. 어떤 다른 테이블의 정책이 `crew_memberships`를 참조해도(전부 `profile_id=(select auth.uid())`로 필터링해 자기 행만 요청하므로) 재귀가 발생하지 않는다.
- **부작용**: "오너/임원이 다른 사람의 crew_memberships 행에 쓰는" 경로(초대·가입 승인·강퇴·임원 임명·오너 이양)가 crew_memberships 자체의 정책만으로는 더 이상 성립하지 않는다. §4에서 이를 어떻게 메웠는지, 어디까지 메웠는지 정리한다.

## 3. crew_memberships 부수효과 — "다른 테이블의 인가 + 신뢰된 트리거"로 메운 부분

`private` SECURITY DEFINER 헬퍼(029B 범위) 없이 이 부작용을 메우려고, **인가는 안전하게 검증 가능한 다른 테이블에서 받고, crew_memberships 갱신은 그 인가된 이벤트의 부수효과로 테이블 소유자(`postgres`, `rolbypassrls=true`) 권한 트리거가 대신 쓰게** 했다. 이 트리거들은 정책 predicate 안에서 여러 곳이 재사용하는 "접근 판정 헬퍼"가 아니라, 좁고 1회성인 **프로비저닝/동기화 로직**이다 — 029B가 만들 헬퍼와는 성격이 다르다(§9에 이 판단을 재확인할 수 있게 근거를 남겼다).

| 이벤트 | 인가는 어디서(재귀 없음) | crew_memberships 갱신은 어떻게 |
| --- | --- | --- |
| 크루 개설(FR-010) + 오너 부트스트랩 | `crews` INSERT 정책(`owner_id = auth.uid()`) | `trg_crews_provision_owner_bootstrap`(AFTER INSERT on crews) — 오너 `active` 행 + `boards` + `chat_rooms` 1건씩 생성 |
| 초대(FR-020, 임원 이상) | `invitations` INSERT 정책(crew_memberships **자기 행** 기준 staff/owner 확인 — 안전, §5) | `trg_invitations_provision_membership`(AFTER INSERT) — `invited` 행 생성/갱신 |
| 초대 응답(FR-021, 본인) | `invitations` UPDATE 정책(`invitee_id=auth.uid()`) | `trg_invitations_sync_membership_on_response`(AFTER UPDATE) — 수락→`active`, 거절→`declined` |
| 가입 신청(FR-022, 본인) | `crew_memberships` INSERT 정책(자기 행, `status='requested'`) — 재귀 없음 | 신청자 본인이 직접 `requested` 행을 만든다(트리거 불필요) |
| 승인/반려(FR-023, 임원 이상) | `join_requests` UPDATE 정책(crew_memberships 자기 행 기준) | `trg_join_requests_sync_membership_on_decision`(AFTER UPDATE) — 승인→`active`, 반려→`rejected` |
| 오너 이양(FR-025) | `crews` UPDATE 정책 + `crews_guard_owner_only_fields` 트리거(오너 전용) | `trg_crews_sync_membership_on_owner_transfer`(AFTER UPDATE, `owner_id` 변경 시) — 구오너 `staff`로 강등, 신오너 `owner`로 승격(upsert) |

이 트리거 5개는 전부 `security definer` + `postgres` 소유라 내부 INSERT/UPDATE가 `crew_memberships`의 RLS **정책**을 우회한다(테이블 소유자 우회, 재귀와 무관). `get_advisors(security)`가 이 함수들을 `anon`/`authenticated`가 RPC로 직접 호출 가능하다고 WARN 했고(`crews_provision_owner_bootstrap`이 `/rest/v1/rpc/...`로 노출), 트리거 전용이라 직접 호출될 이유가 없으므로 `revoke execute ... from public, anon, authenticated`로 해소했다(§6 전후 비교).

**주의(트리거는 RLS와 별개)**: `postgres`가 RLS **정책**을 우회하는 것과 무관하게, `crew_memberships` 위의 `BEFORE UPDATE` **트리거**(`crew_memberships_guard_self_transition`)는 role·역할과 무관하게 항상 발동한다 — RLS 우회 권한이 트리거 실행을 건너뛰게 하지 않는다. 이 트리거는 처음에 `auth.uid() = new.profile_id`로 "본인 self-service"를 판별했는데, 오너 이양 부수효과가 **기존 오너 자신의 행을 owner→staff로 강등**할 때도 이 조건이 참이 되어(행위자=기존 오너, 대상 행도 기존 오너 소유) role 변경이 막히는 버그를 트랜잭션 롤백 실측에서 발견했다. `pg_trigger_depth()`(클라이언트의 직접 UPDATE는 depth 1, 위 트리거들 내부에서 중첩 호출되면 depth 2 이상 — 클라이언트가 조작할 수 없는 구조적 신호)로 바꿔 고쳤다(`20260725005643_rls_fix_membership_guard_trigger_depth.sql`). depth 1일 때만 self-service 규칙(role 불변, `invited→active/declined`·`active→left`만 허용)을 강제하고, 중첩 호출(depth>1)은 상위 테이블에서 이미 인가됐다고 보고 통과시킨다.

## 4. 029A에서 여전히 막혀 있는 것 — 029B로 넘긴다

§3의 우회로도 메우지 못한, 진짜로 남는 gap이다. 전부 "짝이 되는 다른 테이블이 없어" 부수효과 트릭을 쓸 수 없는 경우다.

1. **임원 임명·해임(FR-024, `crew:appoint_staff`)** — 오너가 *다른 사람의* `crew_memberships.role`을 바꾸는 행위. 짝이 될 테이블이 없다.
2. **강퇴(FR-027, `crew:remove_member`)** — 오너/임원이 *다른 사람의* `crew_memberships.status`를 `removed`로 바꾸는 행위. 임원의 강퇴(각주⁴, 일반 크루원만)는 물론, **오너의 강퇴조차** 이번엔 막혀 있다(오너도 crew_memberships 자기 행 정책만 통과하므로 남의 행은 못 건드린다).
3. **crew_memberships "동료 조회"** — 오너/임원/크루원 누구도 `crew_memberships`에서 **자기 행 외의 다른 멤버 행**을 볼 수 없다(멤버 목록 UI가 이 테이블에 직접 의존하면 빈 목록만 보인다). §2에서 본 것처럼 오너조차 `crews.owner_id`를 거치는 순간 재귀에 걸리므로, 오너 전용 예외조차 둘 수 없었다.
4. **poll_votes 집계 공개** — §8.3 참고.
5. **crews 공개 소개의 "멤버 수" 집계·private 크루의 "크루명만" 노출** — §8.4 참고.
6. **system_admin 식별** — §8.5 참고.

**029B 권고**: `private.my_active_crew_ids()`류 SECURITY DEFINER 헬퍼(또는 crew별 role을 얻는 `private.my_crew_role(crew_id)`)를 만들면 1~3이 한 번에 풀린다 — crew_memberships 자기 정책이 이 헬퍼를 호출해도, 헬퍼 내부는 `security definer`로 실행되어 정책 재작성 단계의 순환 탐지 대상이 되지 않는다(§2에서 확인한 재귀는 "정책이 정책을 참조"할 때만 발동하고, "정책이 SECURITY DEFINER 함수를 호출"하는 것은 다른 경로다 — 이것이 D-028이 처음부터 헬퍼를 권고한 이유다).

## 5. 테이블별 정책 요약

전부 `to anon`/`to authenticated` 명시, 서브쿼리는 `(select auth.uid())` 래핑, "크루원인가"·"임원 이상인가" 판정은 항상 **`crew_memberships`를 자기 행으로 필터링**(`profile_id = (select auth.uid())`)해 조회한다 — 이는 재귀가 아니다(§2).

- **profiles**: `authenticated` 전체 SELECT(공개 프로필 정보, D-005 — 검색 옵트아웃은 앱 쿼리가 별도 필터링), 본인 INSERT/UPDATE. `status` self-service 전이는 `active→withdrawn` 1건만(트리거).
- **auth_attempts**, **audit_logs**: `anon`/`authenticated` 완전 거부(`using(false)`) — 서버 전용 테이블임을 명시적으로 문서화(advisor INFO를 "의도된 거부"로 확정).
- **crews**: `anon`은 public만, `authenticated`는 public+본인 소유+본인 소속(private 포함). INSERT는 본인=오너. UPDATE는 임원 이상(정보 수정) + 트리거로 `visibility`/`status`/`owner_id`를 오너 전용으로 제한.
- **crew_memberships**: 자기 행만(§2·§3).
- **invitations**·**join_requests**: 당사자(초대자/피초대자, 신청자) + 크루 임원 이상. §3의 부수효과 트리거가 붙어 있다.
- **boards**·**chat_rooms**: 크루원 SELECT, 오너 INSERT(1:1 부트스트랩은 트리거가 대신하므로 사실상 미사용 경로지만 방어적으로 남겨둠).
- **posts**·**comments**: 크루원 SELECT/INSERT, 본인 수정, 본인 또는 임원 이상의 소프트 삭제(`deleted_at`)만 — 트리거로 "타인 콘텐츠 수정"을 차단(§8.2).
- **polls**·**poll_eligible_voters**·**poll_votes**: 크루원 SELECT(단, `poll_votes`는 본인 표+임원 이상만, §8.3). 제안자/임원 이상만 조기 종료·발송 상태 갱신. `poll_votes` INSERT는 `open` 상태+대상자 스냅샷 포함 여부를 직접 확인. `poll_votes_guard_immutability` 트리거를 "항상 불변"에서 "open 동안 가변, 종료 후 불변"으로 수정(§8.1 — 가장 중요한 매트릭스 대조 결과).
- **meetups**: 크루원 SELECT, 제안자/임원 이상 INSERT/전체 UPDATE, **크루원 누구나 `attending_count`만** UPDATE 가능(D-019, 트리거로 필드 분리, §8.2).
- **meetup_attendances**: 크루원 SELECT, 본인 INSERT/UPDATE(참석/불참 응답).
- **chat_messages**: 크루원 SELECT/INSERT, 본인 또는 임원 이상 UPDATE(소프트 삭제 전용 — "메시지 수정" 자체가 매트릭스에 없으므로 트리거가 발신자 포함 누구에게도 `deleted_at` 외 변경을 막는다).
- **notifications**: 본인 SELECT/UPDATE(`read_at`만, 트리거). INSERT 정책 없음(서버 전용).
- **notification_preferences**·**reports**·**blocks**: 본인 스코프.

## 6. 실측 검증 결과

### 6.1 advisor 전후 비교

| 시점 | security lints | 비고 |
| --- | --- | --- |
| 착수 전 | `rls_enabled_no_policy` INFO 21건 | 테이블마다 1건 |
| 8개 도메인 그룹 마이그레이션 적용 직후 | INFO 0건, **WARN 0건** | `multiple_permissive_policies`·`auth_rls_initplan` 없음 — 정책마다 `TO` 절을 분리하고 역할·명령별로 1개씩만 둔 결과 |
| 재귀 수정 + 동기화 트리거 추가 직후 | `anon_security_definer_function_executable`·`authenticated_security_definer_function_executable` WARN **4건** | §3의 신규 SECURITY DEFINER 트리거 함수가 PostgREST RPC로 노출된 것 |
| `revoke execute ... from public, anon, authenticated` 적용 후 | **0건** | 최종 상태 |

performance advisor는 `unindexed_foreign_keys` INFO 5건(`blocks.blocked_id`·`chat_messages.ref_post_id`·`join_requests.decided_by`·`notification_preferences.crew_id`·`polls.closed_by`)과 `unused_index` INFO 다수(행이 0건이라 당연 — 트래픽 발생 후 재평가 대상)만 남았다. **이 5개 FK는 내가 만든 정책이 참조하는 컬럼이 아니라 028이 만든 기존 컬럼**이라 이번 범위로 보지 않았다 — 필요하면 후속 마이그레이션에서 인덱스를 추가한다.

### 6.2 트랜잭션 롤백 시나리오 (실 데이터 오염 없음, 전부 `rollback`으로 종료)

`set local role authenticated; set local request.jwt.claim.sub = '<uuid>';`로 `auth.uid()`를 시뮬레이션해 아래를 전부 확인했다(전부 통과):

- 크루 생성 → 트리거가 오너 멤버십+게시판+채팅방을 원자적으로 부트스트랩.
- 초대 생성 → `invited` 행 자동 생성 → 피초대자 수락 → `active`로 동기화.
- private 크루가 비소속 회원에게 완전히 안 보임(D-007), 비소속 회원의 해당 크루 가입 신청이 거부됨.
- **재귀 없음**: 크루원이 `crews`·`crew_memberships`를 조회해도 42P17이 나지 않음(§2 수정 확인).
- 본인 크루 role 자가 상승 시도 차단("members cannot change their own crew role").
- 게시글: 작성자 외 수정 불가, 임원 이상의 소프트 삭제는 허용.
- 크루 정보: 임원의 `visibility` 변경 차단, `description` 변경은 허용.
- 오너 이양: `crews.owner_id` 변경 + `crew_memberships.role` 양쪽(구오너→staff, 신오너→owner) 동기화 확인.
- public 크루 가입 신청 → 승인 → `crew_memberships`가 `active`로 동기화.
- 투표: `open` 동안 재투표 허용(D-003), 종료 후 변경 시도는 차단(NFR-032) — §8.1 버그 수정 확인.

### 6.3 Task 035(채팅 파기 배치) 경계 확인 — 실측

- `pg_roles`: `postgres`·`service_role`·`supabase_admin`의 `rolbypassrls = true`. `pg_tables`: 21개 테이블 전부 `tableowner = postgres`.
- DESIGN의 `20260725003109_create_chat_retention_purge_job.sql`은 `security invoker` 함수를 `postgres` role로 등록된 pg_cron 잡이 실행한다 — **테이블 소유자 우회**로 `chat_messages`의 RLS 정책(0개→58개로 늘어난 지금도 마찬가지)과 무관하게 삭제된다.
- 029A는 `chat_messages`에 `FORCE ROW LEVEL SECURITY`를 켜지 않았다 — 켰다면 테이블 소유자에게도 RLS가 적용돼 위 우회가 깨졌을 것이다. 이 사실을 여기 명시한다.
- DESIGN 쪽 마이그레이션 주석도 동일한 실측 결과를 독립적으로 기록해 뒀다("029A가 만드는 정책 객체는 이 마이그레이션에서 건드리지 않는다") — 양쪽 문서가 서로 어긋나지 않음을 상호 확인했다.

## 7. 앱 권한 매트릭스·요구사항 대조에서 발견한 불일치

### 7.1 poll_votes 불변성 트리거가 D-003을 어기고 있었다 (버그, 수정함)

028의 `poll_votes_guard_immutability`는 `choice`/`voted_at` 변경을 **항상** 막았다. 그런데 requirements.md 3.4절 D-003은 "투표 변경: 종료 전까지 무제한 변경 가능. 최종 선택만 유효"라고 명시한다. NFR-032("탈퇴·강퇴 이후에도 투표 집계의 역사적 정합성이 유지된다")는 "역사적"이라는 표현상 **종료·확정된 이후**의 불변성을 요구하는 것으로 읽는 것이 D-003과 정합한다. "항상 불변"은 이 두 요구를 다 만족하지 못하고 D-003만 위반한다(재투표 기능 자체가 동작하지 않게 된다).

**판단**: D-003이 옳다. `poll_votes_guard_immutability`를 "poll이 `open`일 때는 변경 허용, 아니면 차단"으로 고쳤다(`20260725004204_rls_poll_policies.sql`). §6.2에서 open/closed 양쪽 동작을 실측했다.

### 7.2 posts/comments/chat_messages — "타인 삭제"는 있지만 "타인 수정"은 매트릭스에 없다

3.3절 매트릭스는 "타인 게시글 삭제"(임원 이상)만 별도 행으로 두고 "타인 게시글 수정"이라는 행 자체가 없다(자기 게시글 수정·삭제만 한 행). 채팅 메시지는 "메시지 수정" 행 자체가 아예 없다(자기/타인 삭제만).

RLS UPDATE 정책은 "누가 이 행을 건드릴 수 있는가"만 표현하고 "어떤 컬럼을 바꿀 수 있는가"는 표현하지 못한다 — 그래서 임원 이상에게 UPDATE 권한을 주면 소프트 삭제(`deleted_at`)뿐 아니라 본문 수정까지 열리는 과다 부여가 된다. `posts_guard_non_author_delete_only`·`comments_guard_non_author_delete_only`·`chat_messages_guard_delete_only` 트리거로 작성자가 아닌 갱신자는 `deleted_at` 외 어떤 컬럼도 못 바꾸게 막았다(채팅은 발신자 본인도 수정 자체가 없으므로 전원 대상).

### 7.3 crews 매트릭스 "일반회원=●" vs D-007

3.3절 표는 "크루 상세(공개 정보) 열람"에 일반회원을 무조건 "●"로 적었지만, D-007은 "private 크루는 같은 크루원만 검색·열람 가능"이라고 더 구체적으로 정한다. **D-007을 따랐다** — `crews_select_authenticated` 정책은 비소속 일반회원에게 public 크루만 보여주고 private 크루는 감춘다. 매트릭스 표는 "3.3절 각주가 guest 열에만 달려 있어 비소속 회원 구분이 안 드러난 요약"으로 보고, 더 상세한 D-007을 단일 소스로 삼았다.

### 7.4 D-019 정원 원자성 — 조건부 UPDATE가 일반 크루원에게도 필요

D-019는 참석 신청을 `update meetups set attending_count = attending_count + 1 where ...`(조건부 UPDATE)로 처리한다고 명시하는데, 이 UPDATE의 실제 실행 주체는 참석하려는 **일반 크루원**이다. `meetups`의 전체 필드 UPDATE는 제안자/임원 이상 전용(FR-065)이라, 둘을 하나의 RLS 정책으로 표현할 수 없었다 — `meetups_guard_attendee_scope` 트리거로 "제안자/임원 이상이 아니면 `attending_count` 외 컬럼은 못 바꾼다"로 분리했다.

### 7.5 system_admin을 DB가 판별할 수 없다

3.3절 매트릭스는 `report:handle`(FR-082)·`crew:remove_member`(관리자도 가능)·`post:delete_any`/`chat:delete_any_message`(관리자도 가능) 등에 `system_admin` 열을 따로 둔다. 그런데 스키마 어디에도(`profiles`에도) **관리자 여부를 저장하는 컬럼이나 role 테이블이 없다** — 028도 029A도 만들지 않았다. D-008("관리자 콘솔은 v0.1에서 사실상 미사용")과 맞물려 이번엔 admin 전용 RLS 분기를 만들지 않았다. **029B 이후 관리자 콘솔이 실제로 필요해지면 `profiles.is_system_admin`류 컬럼(또는 별도 role 테이블) 추가 + 관련 정책 갱신이 선행돼야 한다** — 지금 상태로는 관리자 기능은 `service_role` 경로로만 가능하다.

### 7.6 poll_eligible_voters·crew_memberships의 "생성 후 불변" — 028이 남긴 재검토 권고 처리

028은 "poll_eligible_voters의 행 불변 규칙을 트리거로 강제하지 않았다"고 남겼다. 029A도 트리거를 추가하지 않았다 — RLS로 "행 삭제/추가 금지"는 이미 DELETE 정책을 아예 두지 않는 것으로, INSERT는 스냅샷 생성 시점(제안자/임원 이상)으로 좁혀 사실상 같은 효과를 얻었다. 상태 컬럼(`notified_at`/`notify_attempts`)만 갱신 가능하게 UPDATE를 열어 뒀으므로 별도 트리거 없이도 028이 우려한 "포함 여부 변경"은 발생하지 않는다.

## 8. 그 외 029B로 명시 이월하는 항목 (§4 요약 + 추가)

1. **`private.my_active_crew_ids()`류 SECURITY DEFINER 헬퍼** — crew_memberships의 "동료 조회"·"임원의 타인 행 쓰기"(FR-024·027)를 풀 유일한 방법(§4).
2. **poll_votes 집계 공개** — D-003 "집계만 공개, 개인 선택은 비공개"를 지키려면 `poll_votes` 개별 행은 본인+임원 이상만 보여야 한다(이번에 그렇게 좁혔다). 크루원 전체에 찬성/반대/기권 **집계 수치**를 공개하려면 개별 행을 노출하지 않는 집계 전용 뷰/RPC가 필요하고, D-031(대상자 5명 미만이면 진행 중 집계 자체를 숨김)까지 고려하면 SECURITY DEFINER 함수가 사실상 유일한 방법이다.
3. **크루 소개 "멤버 수" 집계(게스트 대상)** — `anon`은 `crew_memberships`에 정책이 전혀 없어 `count(*)`가 항상 0으로 나온다. public 크루 소개(D-007 "이름·설명·멤버 수·공개 범위")의 멤버 수를 게스트에게 보여주려면 개별 멤버 신원을 노출하지 않는 집계 전용 뷰/RPC가 필요하다.
4. **private 크루의 "크루명 + 초대 전용" 부분 노출(D-007)** — 이번엔 private 크루를 비소속 회원에게 **행 전체를 숨겼다**(과보호). D-007은 "URL을 직접 알아도 크루명과 '초대 전용' 안내까지는 보인다"고 요구하는데, 일반 RLS는 행 단위 전부-공개/전부-비공개만 표현하므로 이 부분 노출은 컬럼 단위 뷰/RPC가 필요하다.
5. **system_admin 식별**(§7.5).
6. **Realtime Authorization**(`realtime.messages` 정책) — 029B 명시 범위, 이번엔 건드리지 않았다.
7. **검색 3필드 제한** — 029B 명시 범위. 지금 `profiles_select_authenticated`는 전체 컬럼을 노출하므로, 3.6절 "핸들·표시이름·아바타 외 어떤 필드도 반환하지 않는다"는 **앱 쿼리의 select 목록**이 담당해야 한다(현재 이 책임을 RLS가 아니라 데이터 접근 레이어에 명시적으로 넘겨 둔 상태 — 029B에서 column-level GRANT 등으로 강화할지 검토 권고).

## 9. 산출물

- `supabase/migrations/2026072500{3849,4000,4031,4112,4204,4238,4307,4336,4924,5001,5356,5526,5643}_*.sql` — 마이그레이션 13건(테이블 그룹별 8건 + 재귀 수정 1건 + 동기화 트리거 1건 + EXECUTE 회수 1건 + 오너 이양 동기화 1건 + 가드 트리거 재수정 1건).
- 정책 총 **58건**, 21개 테이블 전 커버리지(`pg_policies` 실측, 15일차 BOARD 교차검증으로 재확인). 테이블당 1~4건 — `audit_logs`·`auth_attempts` 각 1건(완전 거부), `blocks`·`chat_messages`·`comments`·`crew_memberships`·`join_requests`·`meetup_attendances`·`meetups`·`poll_eligible_voters`·`poll_votes`·`polls`·`posts`·`profiles` 각 3건, `boards`·`chat_rooms`·`notifications`·`reports` 각 2건, `crews`·`invitations`·`notification_preferences` 각 4건. **세는 기준**: `pg_policies`의 행 수를 그대로 센다(정책 1개=`CREATE POLICY` 1건, `FOR ALL`처럼 여러 명령에 적용되는 정책도 1건으로 센다 — 예: `audit_logs_no_client_access`·`auth_attempts_no_client_access`는 `cmd='ALL'`이라 1건). 이전 보고("60건")는 이 기준으로 다시 세어도 재현되지 않는 단순 계수 오류였다 — 마이그레이션 적용 직후 실측 원본 데이터는 이미 58이었는데 최종 합산 과정에서 잘못 옮겨 적었다(10절 참고).
- 트리거 함수 13개(가드 6 + 프로비저닝/동기화 5 + poll_votes 수정 1 + profiles 상태 전이 1) — 전부 `set search_path = ''` 고정.
- 본 문서.

## 10. 다음 회차(029B) 인계 사항

- §4·§8의 7개 항목이 029B의 실제 작업 목록이다. 그중 **SECURITY DEFINER 헬퍼(§4)가 가장 우선순위가 높다** — crew_memberships 동료 조회·임원의 타인 쓰기(FR-024·027)가 막혀 있는 채로는 크루 운영 화면(멤버 관리)이 동작하지 않는다.
- `crew_memberships`에 새 정책을 추가할 때 **절대 `crews`를 서브쿼리하지 말 것** — §2의 상호 재귀가 그대로 재현된다. 헬퍼 함수를 거치거나, 다른 안전한 테이블(§3 방식)을 통해야 한다.
- 새 SECURITY DEFINER 함수를 만들면 `get_advisors(security)`로 `anon_security_definer_function_executable` WARN을 반드시 재확인하고, RPC로 직접 호출될 필요가 없으면 `revoke execute ... from public, anon, authenticated`를 짝지어 적용할 것(§6.1의 패턴을 그대로 따르면 된다).
- `poll_votes`·`crew_memberships` 등에 정책을 추가/수정할 때는 **반드시 트랜잭션 롤백 실측**으로 검증할 것(정적 리뷰만으로는 §2·§3의 버그 둘 다 못 잡았다 — 실제로 `execute_sql`을 돌려서야 드러났다).
- **정정(15일차, BOARD 교차검증)**: 최초 보고·본 문서·`src/lib/data/supabase/README.md`에 "정책 60건"으로 적었으나 `pg_policies` 실측은 **58건**이다(§9). 마이그레이션 적용 직후 돌린 원본 집계 쿼리 결과 자체는 이미 58이었다 — 세는 기준이 달랐던 게 아니라, 그 원본 수치를 최종 보고문으로 옮겨 적는 과정에서 단순 계수 오류가 났다. "21개 테이블 전 커버리지·정책 0건 테이블 없음"이라는 기능적 결론에는 영향이 없다. 029B는 **58**을 기준선으로 삼을 것.
