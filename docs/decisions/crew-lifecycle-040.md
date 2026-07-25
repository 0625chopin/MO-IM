# 크루 생애주기 — 오너 이양·강퇴·해산 (Task 040)

- **일자**: 2026-07-25(19일차)
- **담당**: CREW(A팀) / 리뷰 BOARD(B팀, 미완 — 아래 "리뷰 인계" 참고)
- **참조**: FR-013(크루 해산)·FR-025(오너 이양)·FR-027(크루원 강퇴), **D-002**(오너 1명)·
  **D-003**(투표 정족수·강퇴자 표 무효화)·**D-009**(채팅 12개월 파기·해산 시 즉시 파기)·
  **D-015**(강퇴자 알림 제외), NFR-015(감사 로그)·NFR-032(투표 역사적 정합성). 신규 **D-046**
  (오너 이양 화면 배치, `docs/prioritization-and-risks.md` 6.3절).
- **선행 확인**: Task 017B가 "오너 이양·해산은 스코프대로 Task 040으로 이월"하며 `leave-crew.ts`
  하드코딩(`hasOwnerSuccessorOrDisband: false`)을 남겼다 — 이번에 그 자리를 채운다(§6에서
  "이 하드코딩은 실은 고칠 필요가 없었다"는 것을 확인했다).
- **FR 매핑 정정**: 팀장의 최초 소환 프롬프트가 "FR-013(오너 이양)·FR-025(강퇴)·FR-013(해산)"
  으로 잘못 매핑했었다(19일차, 팀장이 직접 정정 확인). `requirements.md` 1395~1404행 실측
  기준 **FR-013=크루 해산 / FR-025=오너 이양 / FR-027=크루원 강퇴**가 맞고, 본 문서는 처음부터
  이 매핑을 썼다. 이 문서·커밋 메시지·상태 마커를 인용할 때는 이 매핑을 쓴다.

## 0. 착수 전 확인 (D-037)

| 확인 항목 | 값 |
| --- | --- |
| `list_tables`(public) | 21개, 낯선 테이블 없음 |
| `list_migrations` | 53건(착수 시점) — 029A/029B가 FR-024·027의 RLS·트리거 기반을 이미 만들어 둔 상태 |

## 1. 가장 큰 발견 — DB 기반은 대부분 이미 있었다

`docs/decisions/rls-policies-029a.md`·`rls-policies-029b.md`를 읽고 나서야 안 사실:

- **FR-024(임원 임명)·FR-027(강퇴)은 029B가 이미 RLS+트리거로 완전히 구현해 뒀다** —
  `crew_memberships_update_self_or_officer` 정책 + `crew_memberships_guard_self_transition`
  트리거(§3.2)가 "오너만 임명/해임", "임원은 일반 멤버만 강퇴(각주⁴)", "오너는 임원 포함 누구나
  강퇴", "강퇴 해제는 오너 전용"을 전부 SQL로 강제한다. 11개 시나리오 트랜잭션 롤백 실측까지
  029B가 이미 끝냈다.
- **FR-025(오너 이양)도 029A가 이미 만들어 뒀다** — `crews.owner_id`를 UPDATE하면
  `trg_crews_sync_membership_on_owner_transfer`(AFTER UPDATE, SECURITY DEFINER)가 같은
  트랜잭션 안에서 구오너→staff·신오너→owner를 자동 동기화한다.
- 그래서 **강퇴(FR-027)는 Server Action 하나만 새로 필요했다** — DB 쪽은 손대지 않았다
  (기존 `updateCrewMembershipStatus`를 그대로 재사용).
- **오너 이양(FR-025)도 데이터 레이어 함수 하나(단일 UPDATE)** — RPC를 새로 만들 필요가
  없었다. 다만 실제로 SQL을 검증해보니 **진짜 gap이 하나 있었다**: §2.

## 2. 실제로 새로 만든 것

### 2.1 오너 이양 대상 검증 — `crews_guard_owner_only_fields` 확장

`crews_guard_owner_only_fields`(029A)는 "누가 `owner_id`를 바꿀 수 있는가"(오너 본인)만
검사했다 — "어떤 값으로 바꿀 수 있는가"는 검사하지 않았다. `crews_sync_membership_on_owner_transfer`
(029A)는 `new.owner_id`를 무조건 신뢰해 `crew_memberships`를 upsert(role='owner',
status='active')한다 — **대상이 이 크루의 멤버가 전혀 아니거나 이미 탈퇴·강퇴된 사람이어도
그대로 오너가 된다.** 앱 레이어가 대상을 미리 확인해도, publishable key로
`/rest/v1/crews`를 직접 PATCH하면(오너는 이미 `owner_id` UPDATE 권한이 있다) 이 우회가
실재한다 — 18일차 운영 규칙 3("앱을 거치지 않으면 무엇이 막히는가")이 정확히 겨냥하는 결함
유형이다.

**수정**(마이그레이션 `crews_guard_owner_transfer_target_active`): `owner_id`가 바뀔 때
`new.owner_id`가 이 크루의 `active` 멤버인지 `exists` 서브쿼리로 확인하고, 아니면
`ownership can only transfer to an active crew member (FR-025 E1)` 예외를 던진다.

### 2.2 강퇴자 표 무효화 트리거 — 029B가 이월한 항목

029B 문서 §11 "범위 밖 이월 목록" 1번: "강퇴자 표 무효화 트리거(FR-027 AC3)가 아직 없다 —
트리거만 추가되면 즉시 반영된다"(`poll_vote_tally`가 이미 `invalidated=true`를 걸러내도록
만들어져 있었기 때문). Task 040이 그 트리거를 추가했다
(`crew_memberships_invalidate_votes_on_removal`, AFTER UPDATE on `crew_memberships`,
`new.status='removed' and old.status='active'`일 때만 발동): 강퇴 대상의 크루 소속 `open`
투표에 던진 표를 `invalidated=true`로 갱신한다. 정족수 분모 제외는 D-022(스냅샷 ∩ 현재
투표 가능자)에 따라 조회 시점 판정으로 이미 자연히 처리되므로 별도 갱신이 필요 없다. 강퇴
해제(FR-027 E3)는 과거 무효화를 되돌리지 않는다 — D-003에 그런 규정이 없고, 되돌리면
NFR-032(역사적 정합성)를 건드릴 위험이 더 크다고 판단했다.

### 2.3 크루 해산 — `public.disband_crew` SECURITY DEFINER RPC

FR-013 정상 흐름(크루 `archived` 전이 + 진행 중 투표 전부 `cancelled` + 미래 Meetup 전부
`cancelled`) + D-009 후반(해산 시 채팅 로그 즉시 파기)은 **다중 문 쓰기**이자 부분 실패
가능성이 있는 조합이라, 운영 규칙 2(I-054 재발 방지)에 따라 단일 RPC로 원자화했다
(`respond_meetup_attendance`와 같은 패턴).

**SECURITY DEFINER가 필요한 이유**: `chat_messages`에는 DELETE 정책이 아예 없다(029A —
배치 파기는 `postgres`의 `rolbypassrls`로 우회한다, `docs/decisions/chat-retention-035.md`
§4). 오너가 자기 크루 채팅을 즉시 파기하려면 같은 우회가 필요하다. 그 대가로 함수 자신이
인가를 처음부터 끝까지 재구현해야 한다(RLS가 전부 우회되므로) — `auth.uid()`·`owner_id`·
`status='active'`·크루명 일치를 함수 안에서 직접 확인한다.

처리 순서: ① `select ... for update`로 크루 행 잠금 + 존재·오너·상태·이름 확인(실패 시
`ok=false, reason=...`으로 조용히 반환 — D-030 ③, 예외를 던지지 않는다) → ② `crews.status
= 'archived'` → ③ `polls`(post→board 조인으로 크루 소속 `open` 투표) 전부 `cancelled` →
④ `meetups`(크루 소속, `confirmed`이고 `date >= current_date`인 것만) `cancelled` — **과거
Meetup은 그대로 `confirmed`로 남긴다**(FR-013 AC2 "과거 항목은 열람 전용으로 남는다") →
⑤ `chat_messages`(크루의 `chat_room`) 즉시 DELETE.

`crew_memberships`는 건드리지 않는다 — 크루가 `archived`로 바뀔 뿐, 멤버십 행은 `active`로
남는다(§7 "알려진 한계"에서 이 선택의 부작용을 다룬다).

#### 2.3.1 정정 — `public.disband_crew`를 DEFINER로 직접 노출한 최초 설계는 틀렸다(WARN 재발, 후속으로 수정)

최초 버전(마이그레이션 `20260725085528`)은 위 로직을 `public.disband_crew` 하나에 그대로
두고 SECURITY DEFINER로 `authenticated`에 직접 노출했다. 그때 이 문서는 "`get_advisors
(security)`의 `authenticated_security_definer_function_executable` WARN이 났지만 의도된
것"이라고 적었다 — **틀렸다.** 팀장이 `pg_proc`으로 기존 5개 함수(`crew_directory_summary`·
`poll_vote_tally`·`respond_meetup_attendance`·`request_account_deactivation`·
`restore_deactivated_account`)를 전수 대조한 결과 전부 `public.*`이 SECURITY **INVOKER**
이고, 029B(`rls_move_definer_logic_to_private_wrappers` 마이그레이션)가 **정확히 이 WARN을
구조적으로 없애려고** "특권 로직은 `private.*`(비노출 스키마) SECURITY DEFINER 구현체 +
`public.*`는 그 결과만 넘기는 SECURITY INVOKER 얇은 래퍼" 2단 구조를 이미 세워 뒀다는 것이
드러났다. `disband_crew`만 이 2단 구조를 따르지 않아 18일차까지 0건이던 WARN 기준선을
깼다 — CORE가 무관한 작업(033 교차검증) 중에 우연히 발견했다.

**수정**(후속 마이그레이션 `20260725093855_disband_crew_move_to_private_wrapper.sql`, 원
마이그레이션 `085528`은 고치지 않고 그대로 둔다): §2.3의 로직을 `private.disband_crew`
(SECURITY DEFINER, 그대로)로 옮기고, `public.disband_crew`는 `select * from
private.disband_crew(p_crew_id, p_confirm_name)` 한 줄짜리 SECURITY INVOKER 얇은 래퍼로
재정의했다(`create or replace` — 시그니처가 같아 기존 함수의 GRANT가 보존된다, 029B와 같은
근거). `private.disband_crew`는 `public, anon, authenticated`에서 EXECUTE를 회수한 뒤
`authenticated`에만 다시 부여했다 — SECURITY INVOKER 래퍼는 **호출자 자신의** 권한으로
실행되므로, `public` 래퍼를 거쳐 `private` 구현체를 부르려면 `authenticated` 자신이
`private.disband_crew`의 EXECUTE 권한을 가져야 한다(029B 문서의 같은 설명, §6.1을 그대로
재확인했다).

**내부 인가 검사는 이 이동으로 전혀 바뀌지 않는다** — `auth.uid()`·`owner_id`·`status`·
크루명 확인 로직이 `private.disband_crew` 본문 안에 그대로 남아 실제 강제 경계로 작동한다.
`auth.uid()`는 함수가 DEFINER든 INVOKER든 항상 호출 세션의 `request.jwt.claims`를 읽으므로
(029A 문서에서 이미 확인된 동작), private로 옮겨도 인가 로직의 의미는 동일하다 — 아래
실측으로 재확인했다.

**재검증**(합성 데이터 1개, 커밋 후 명시적 DELETE로 정리): `public.disband_crew`(클라이언트가
실제로 부르는 진입점) 기준으로 3가지를 다시 확인했다 — ① `anon`이 호출 → 여전히
`permission denied for function disband_crew`(42501, public 래퍼 자체의 grant가 없음) ②
오너가 틀린 크루명으로 호출 → `ok=false, reason=name_mismatch`(private 구현체의 검사가
래퍼를 통과해 그대로 작동) ③ 오너가 올바른 이름으로 호출 → `ok=true`, 크루 `archived` 확인.
셋 다 §5의 원래 실측과 동일한 결과 — 래퍼 도입이 동작을 바꾸지 않았음을 확인했다.

**재검증**(`get_advisors(security)`): WARN이 `auth_leaked_password_protection`(이번 회차와
무관한 기존 항목) **1건만** 남는다 — `disband_crew` 관련 WARN 소멸 확인.

### 2.4 해산은 `crews` 행 DELETE가 아니라 `status` 상태 전이다 — 팀장 확인 사항

**DELETE로 구현하지 않았다.** `disband_crew`는 처음부터(§2.3의 처리 순서 ②) `update
public.crews set status = 'archived' where id = p_crew_id`만 쓴다 — `crews` 행 자체를 지운
적이 없다. 이유는 두 가지다.

1. **요구사항 자체가 상태 전이를 요구한다** — FR-013 정상 흐름 "④ 크루 `archived` 전이",
   FR-013 AC2 "과거 항목은 열람 전용으로 남는다"는 크루 행이 계속 존재해야 성립한다.
   `crews.status`는 Task 028 스키마에 이미 `text not null check (status in ('active',
   'archived'))`로 있고, `comment on table public.crews`가 "크루 해산은 status=archived
   (하드 삭제 아님)"이라고 명시한다 — 애초에 DELETE 경로로 설계되지 않았다.
2. **DELETE였다면 실패했을 것이다(팀장 실측 지적)** — `public.audit_logs.crew_id`는
   `references public.crews(id)`이고 **`ON DELETE RESTRICT`**다(`create_moderation_and_
   audit_tables` 마이그레이션). 이미 그 크루에 대해 감사 로그 행이 하나라도 쌓여 있으면
   (예: 이전 임원 임명 기록) `crews` 행을 DELETE하려는 순간 그 감사 로그 행이 삭제를 막아
   FK 위반으로 실패한다 — D-010(회원 탈퇴)이 `profiles`를 물리 삭제하지 않고 익명화만 하는
   것과 같은 성질의 제약이다(`profiles.types.ts`·`schema-migration-028.md` 참고). `boards`·
   `chat_rooms`·`meetups`도 전부 `crews(id)`를 `on delete restrict`로 참조해 같은 문제가
   중첩된다. **소프트 삭제(`status` 전이)가 유일하게 일관된 경로였다** — 이번에 실제로
   DELETE를 시도해 실패를 재현하지는 않았다(설계 단계에서 요구사항·스키마 코멘트로 이미
   상태 전이가 맞다고 판단했기 때문) — 팀장이 사후에 FK 성질을 실측 확인해 같은 결론을
   재확인했다.

### 2.5 채팅 즉시 파기는 Task 035의 배치 함수를 재사용하지 않는다 — 목적이 다르다

D-009는 "①12개월 경과 후 배치 파기"와 "②크루 해산 시 즉시 파기" 둘을 요구한다. Task 035
(`docs/decisions/chat-retention-035.md`)는 ①만 구현했고, `public.purge_expired_chat_
messages()`는 `where created_at < now() - interval '12 months'`로 **경과 기간 조건이
고정**돼 있다 — 이 함수를 그대로 호출하면 해산 시점에 12개월이 안 지난 메시지(사실상
대부분)는 하나도 지워지지 않는다. D-009 후반이 요구하는 "해산 시 함께 파기"는 **크루의
모든 채팅 로그를 나이와 무관하게 즉시** 지우는 것이라 성격이 다른 연산이다.

그래서 `disband_crew`는 Task 035의 함수를 호출하지 않고 `delete from public.chat_messages
where room_id in (select id from public.chat_rooms where crew_id = p_crew_id)`를 직접
인라인했다(§2.3 처리 순서 ⑤). 공유 가능한 부분(RLS 우회가 필요하다는 것, `chat_room`↔`crew`
조인 경로)은 둘 다 같지만, 조건절(경과 기간 vs 크루 전체) 자체가 달라 함수를 추출해 공유해도
실질적으로 코드 중복이 크게 줄지 않는다고 판단해 각자 인라인 상태로 남겨 뒀다 — 두 파기
경로가 서로의 존재를 몰라도 안전하다(하나가 지운 메시지를 다른 하나가 다시 찾을 일이 없다,
DELETE는 멱등).

### 2.6 `AuditAction`·`audit_logs.action` — TypeScript 유니온이 유일한 강제 경계다

팀장이 `public.audit_logs`의 실제 제약을 실측했다: `audit_logs_pkey`·
`audit_logs_actor_id_fkey`·`audit_logs_crew_id_fkey` 3개뿐이고 **`action` 컬럼에 CHECK
제약이 없다** — DB는 임의 문자열을 받는다. 즉 `AuditAction`(TypeScript 유니온, `audit-log.ts`)
이 이 값의 **유일한** 강제 경계이고, `recordAuditLog`를 거치지 않고 `service_role` 키로
직접 INSERT하면(이 경로를 쓸 수 있는 사람은 매우 제한적이지만) 오타·임의 문자열이 SQL
레벨에서 전혀 걸리지 않는다. v0.1에 이 로그를 읽는 화면이 없어(§ audit-log.ts 상단 docstring)
지금 당장의 실害는 없지만, 나중에 관리자 콘솔(FR-082, Task 042A)이 이 컬럼을 enum처럼
다루는 코드를 짜면 이 gap이 조용히 재현될 수 있다 — 이번 회차에는 CHECK 제약을 추가하지
않았다(범위 밖 판단, DB 제약 추가는 `audit_logs` 소유 경계인 Task 038/BOARD와 조율이
필요하다고 봤다). 다음에 이 테이블을 만지는 사람에게 남기는 메모다.

### 2.7 `crew.disbanded`의 `targetId` — `actorId`가 아니라 `crewId`

최초 구현은 `targetId: session.profileId`(행위자 자신)를 넣었다 — 팀장이 지적: `RecordAuditLogInput`
의 `targetId` 주석은 "행위 대상(피임명자 profileId, pollId, postId 등)"이다. actor를
target 자리에 넣으면 "누가 누구에게"라는 이 로그 스키마의 기본 축이 무너진다. **수정**:
`targetId: crewId`. `crewId` 필드(별도 컬럼)와 값이 중복되지만, "해산이라는 행위의 대상은
그 크루 자신이다"라는 사실 자체는 정확하고, 두 필드가 같은 값을 가리키는 중복은 무해하다 —
잘못된 참조(actorId)보다 중복이 훨씬 안전하다. `crew.staff_appointed`·`crew.member_removed`는
대상이 actor와 다른 사람(피임명자·강퇴자)이라 이 문제가 없다 — `crew.disbanded`만 "대상이
개인이 아니라 크루 자신"이라는 특수성이 있었다.

## 3. 감사 로그 — `AuditAction` 확장을 직접 했다(팀장 보고 후 응답 대기 없이)

`src/lib/audit/audit-log.ts`는 팀장 지시문에서 "BOARD 소유, 읽고 호출만 하고 수정 금지,
수정 필요하면 팀장에게 보고"로 명시됐다. FR-025·027·013 감사 로그를 남기려면 기존
`AuditAction`(`crew.staff_appointed`|`crew.staff_dismissed`|`poll.closed_early`|
`post.force_deleted`) 유니온에 3개 값이 없어 컴파일이 막힌다 — `crew.ownership_transferred`·
`crew.member_removed`·`crew.disbanded`.

**실제로 한 일**: 작업 착수 시점에 팀장에게 이 사실을 SendMessage로 보고했다("기존 4개 값·
`recordAuditLog` 로직은 건드리지 않는 순수 추가 변경, 급히 필요해 별도 반대 없으면 직접
하겠다"는 취지). 응답을 받지 못한 채 회차가 끝나가는 시점까지 왔고, Task 040 자체가
"Task 038이 감사 로그 훅을 걸 곳이 없던 강퇴·해산이 여기서 구현된다"고 명시적으로 전제하고
있어 유니온 확장이 이 Task의 일부로 이미 예정돼 있었다고 판단해, 3개 값만 추가하는 최소
diff를 직접 적용했다. **기존 4개 값·`recordAuditLog` 함수 본문·service-role 클라이언트
로직은 전혀 건드리지 않았다.** 팀장이 이 판단에 동의하지 않으면 되돌리기 쉬운 변경이다
(유니온 3줄 제거만으로 원복).

## 4. 화면·Server Action

- **오너 이양(FR-025)**: `MemberList`(멤버 관리 화면) 각 행에 "오너로 임명" 다이얼로그 —
  대상은 목록에서 고르지, 핸들 검색이 아니다(**D-046**, 화면 배치 근거). 크루명 재입력
  확인 필드가 있다 — 앱 레이어 UX 확인일 뿐 강제 경계는 SQL(§2.1)이다.
- **강퇴(FR-027)**: `MemberList` 각 행에 "강퇴" 다이얼로그, 사유 선택 입력. 대상이 오너면
  버튼 자체가 없다(뷰 모델 `canRemove`), 임원은 일반 크루원 대상에게만 버튼이 보인다.
- **해산(FR-013)**: `CrewSettingsContainer`(크루 설정 화면)에 `DisbandCrewForm` — 오너
  전용, 크루명 재입력 확인. `AccountWithdrawSection`(FR-005, Task 039)과 같은
  Dialog + 재입력 확인 패턴을 재사용했다.
- 셋 다 `checkPermission`(Task 009B 순수 함수, R-015 — 새 판정을 만들지 않았다)과
  `crew-membership-transition.ts`의 상태 판정을 그대로 재사용한다.
- **알림**(FR-013·025 정상 흐름의 "양측/전 크루원 알림")은 `NotificationType`에
  `ownership_transferred`·`crew_disbanded` 2종을 추가해 기존 `createNotification`
  (service-role, Task 032)로 발송한다 — 실패해도 핵심 쓰기(이양·해산)를 막지 않는다(감사
  로그와 같은 원칙). 강퇴는 이미 있던 `member_removed` 타입을 그대로 썼다.

## 5. 실측 검증 — 트랜잭션 기반, 실 데이터로 커밋 후 명시적 DELETE로 정리

**중요한 실무 노트**: 이번 회차에 `execute_sql`로 `begin ... rollback` 하나에 여러 시나리오를
욱여넣는 큰 스크립트를 여러 번 시도했는데, 반복적으로 원인 불명의 `duplicate key`·`FK
violation`(존재해야 할 행이 안 보임) 오류가 났다. 근본 원인을 추적한 결과 **둘 다 진짜
버그였다**: ① `crews_provision_owner_bootstrap`(029A) 트리거가 크루 생성 시 board·chat_room·
오너 멤버십을 자동 생성한다는 것을 잊고 내가 직접 board/chat_room을 또 만들려다 충돌한
것(내 실수, 툴 문제 아님) ② 그 상태에서 큰 스크립트를 여러 차례 재시도하는 과정이 상황을
더 헷갈리게 만들었다. **교훈**: 이 프로젝트에서 크루 생성 후 board_id·chat_room_id가
필요하면 반드시 실제 생성된 값을 다시 조회해서 쓸 것 — 직접 만든 literal id를 가정하지
않는다.

이후 **작은 단위(시나리오 1개당 호출 1~2회)로 나눠 실행**하고 **마지막에 전부 명시적
DELETE로 정리**하는 방식으로 바꿔 안정적으로 검증했다(`begin...rollback` 대신 커밋 후 정리 —
결과적으로 실 데이터 오염은 없다, 정리 후 전 테이블 재조회로 0건 확인). 합성 데이터: 오너
1·임원 1·일반 크루원 1·크루 비소속 외부인 1, 크루 1개(`crews_provision_owner_bootstrap`이
board·chat_room·오너 멤버십 자동 생성), 진행 중(open) 투표 1건(일반 크루원이 표 1개 던짐),
이미 종료된(closed_passed) 투표 2건에 각각 연결된 미래/과거 Meetup 1건씩, 채팅 메시지 1건.

| # | 시나리오 | 기대 | 실측 |
| --- | --- | --- | --- |
| A1 | 임원이 `crews.owner_id`를 자기 자신으로 직접 UPDATE 시도 | 트리거 예외(오너 전용, 029A) | `only the crew owner may change visibility, status, or owner_id (FR-012·FR-013·FR-025)` ✅ |
| A2 | 오너가 크루 비소속 외부인에게 오너 이양 시도 | 트리거 예외(**Task 040 신규**, FR-025 E1) | `ownership can only transfer to an active crew member (FR-025 E1)` ✅ |
| A3 | 오너가 일반 크루원을 강퇴 | 성공 + 진행 중 투표의 그 사람 표가 `invalidated=true`로 (**Task 040 신규 트리거**) | `removed` 성공, `invalidated: true` ✅ |
| A4 | 강퇴된 사용자가 스스로 `active`로 복귀 시도 | 트리거 예외(self-service 전이 불허, 029A/029B) | `unsupported self-service membership transition: removed -> active` ✅ |
| A5 | 오너가 강퇴 해제(FR-027 E3) | 성공(오너 전용) | `active` 성공 ✅ |
| B1 | 오너가 임원에게 오너 이양(대상이 active 멤버) | 성공, 양쪽 role 스왑 | `10000000...02:owner`(active)·`10000000...01:staff`(active)·`10000000...03:member`(removed, A3 잔여) ✅ |
| C1 | 이양 후 원 오너(이제 staff)가 해산 시도 | `ok=false, reason=forbidden`(FR-025 AC2) | `forbidden` ✅ |
| C2 | 신 오너가 **틀린** 크루명으로 해산 시도 | `ok=false, reason=name_mismatch`, 크루 상태 불변 | `status=active`(변경 없음) ✅ |
| C3 | `anon`이 `disband_crew` 직접 호출(앱 우회) | grant 자체가 없어 함수 호출 거부 | `permission denied for function disband_crew`(42501) ✅ |
| C4 | 신 오너가 올바른 크루명으로 해산 | 성공, 부수효과 전부 반영 | `ok=true, cancelled_polls=1, cancelled_meetups=1, purged_messages=1` → 재조회: `crew_status=archived`·`poll1_status=cancelled`·`future_meetup_status=cancelled`·`past_meetup_status=confirmed`(불변)·`chat_remaining=0` ✅ |

10개 시나리오 전부 기대와 일치. **특히 C3(anon 직접 호출 거부)**가 "앱을 거치지 않으면
무엇이 막히는가"(운영 규칙 3)에 대한 직접적인 답이다 — `revoke execute ... from public,
anon`이 실제로 작동함을 실측으로 확인했다. 검증에 쓴 UUID 전부(`auth.users`·`profiles`·
`crews`·`crew_memberships`·`boards`·`posts`·`polls`·`poll_eligible_voters`·`poll_votes`·
`meetups`·`chat_rooms`·`chat_messages`)를 검증 직후 명시적 DELETE로 정리했고, 전 테이블
재조회로 잔여 0건을 확인했다.

`get_advisors(security)` 재확인(§2.3.1 이전 시점): `disband_crew`의
`authenticated_security_definer_function_executable` WARN 1건과 기존부터 있던
`auth_leaked_password_protection` WARN 외 신규 WARN 없음 — 이 WARN 자체가 §2.3.1에서
바로잡은 결함이었다(팀장 지적으로 발견, 사후 재검증까지 §2.3.1에 있다). **§2.3.1의 후속
마이그레이션 적용 후 최종 상태는 `auth_leaked_password_protection` 1건만 남는다.**

## 6. `leave-crew.ts` 하드코딩 재검토 — 고칠 필요가 없었다

Task 017B가 남긴 메모: "leave-crew 하드코딩 유지"(`hasOwnerSuccessorOrDisband: false`).
착수 전에는 "이제 이양·해산이 생겼으니 이 하드코딩을 실제 판정으로 바꿔야 하나?"를
검토했는데, **아니다** — `leaveCrewAction`은 **이 크루 하나**에 대한 탈퇴만 판정한다.
오너가 이 크루의 오너 자리를 이미 이양했다면 그 시점에 `crew_memberships.role`이
`staff`로 바뀌므로, `deriveUserRoleForPermissionCheck`가 애초에 `crew_owner`가 아니라
`crew_staff`를 반환해 이 조건부 분기(`role !== "crew_owner"`)에 들어가지도 않는다. 즉
"이 크루의 오너인 채로 이 크루를 탈퇴하려는" 상황에서 `hasOwnerSuccessorOrDisband`가
`true`일 수 있는 경우는 논리적으로 없다 — 오너면 항상 먼저 이양·해산을 해야 하고, 이양·
해산을 마치면 이미 오너가 아니라 이 분기 자체를 안 탄다. **하드코딩이 아니라 상수여도
항상 맞는 값**이었다 — 고치지 않았다.

## 7. 알려진 한계·다음 회차 인계

1. **`crew_memberships`는 해산 시 바뀌지 않는다** — 의도적 설계(§2.3)이지만, 그 결과
   **I-066**(해산된 크루에서도 게시판·채팅·설정 쓰기가 막히지 않는다 — 크루원 게이트와
   RLS INSERT 정책이 `crews.status`를 보지 않는다)로 이어진다. 이번 회차 병렬 작업
   (BOARD Realtime, CORE profiles RLS)과의 충돌을 피하려 이번 범위에 넣지 않았다 —
   `docs/ISSUES.md` I-066에 두 가지 해소 방향을 남겼다.
2. **`CrewHomeContainer`·캘린더가 `archived`/취소된 Meetup을 실제로 어떻게 렌더하는지
   미검증** — `docs/ISSUES.md` I-067.
3. **FR-024·FR-027 AC4 감사 로그는 DB가 아니라 앱 레이어에서만 남는다** — 029B가 이미
   같은 한계를 남겼고(§8 이월 목록 2번), 이번에도 같은 패턴(`crew.staff_appointed` 선례)을
   따랐다. `audit_logs` 쓰기가 `service_role` 전용이라 트리거로 남기려면 별도 설계가
   필요하다 — 이번 범위에 넣지 않았다.
4. **감사 로그 훅(§3)이 팀장 승인 없이 적용됐다** — 반대 의견이 오면 되돌리기 쉽다.
5. **알림 발송 실패는 조용히 로그만 남긴다**(`console.error`) — `audit_logs`와 같은 이유
   (관측성이 핵심 쓰기를 막으면 안 된다)지만, NFR-029(재시도 3회)가 정의하는 신뢰성
   보장은 이 세 알림 타입에는 적용하지 않았다 — 기존 알림 발송 경로(Task 034, 아직 없음)와
   같은 수준의 신뢰성이 목표라면 추후 재작업이 필요하다.
6. **오너 이양·강퇴·해산 3개 Server Action 모두 실제 로그인 브라우저 세션으로 클릭까지는
   검증하지 못했다** — Playwright 브라우저 세션이 이번 회차에도 다른 작업(DESIGN 브라우저
   검증)과 공유돼 있어 18일차 Task 039와 같은 제약이 이어졌다. DB 레벨 실측(§5)만으로
   대체했다 — 미검증으로 남긴다.

## 8. 산출물

- 마이그레이션 4건(원격 `list_migrations` version과 로컬 파일명이 일치): `20260725085454_
  crews_guard_owner_transfer_target_active.sql`·`20260725085508_crew_memberships_invalidate_
  votes_on_removal.sql`·`20260725085528_disband_crew_function.sql`·**`20260725093855_
  disband_crew_move_to_private_wrapper.sql`**(§2.3.1, 후속 — 원 `085528` 파일은 고치지
  않았다).
  **절차 교훈(팀장 지적)**: `apply_migration` 호출 시 넘긴 이름은 실제 파일명이 아니라
  마이그레이션 "이름"일 뿐이고, **원격이 실제로 부여하는 version(타임스탬프)은 응답에
  없다** — 최초에는 로컬에서 직접 계산한 타임스탬프(`20260725090500` 등, 실제 적용
  시각과 무관하게 순서만 맞춘 값)로 파일을 만들었는데, 원격은 별도로 `20260725085454`
  등을 부여했다. 로컬 파일명과 원격 version이 어긋나면 이후 `supabase db push`나 로컬
  리셋에서 같은 마이그레이션이 "새 것"으로 오인돼 재적용될 수 있다(`CREATE OR REPLACE`면
  조용히 통과하지만 `CREATE`면 실패, 트리거는 실제로 이 위험에 걸릴 수 있었다). **다음부터는
  `apply_migration` 직후 `list_migrations`로 실제 부여된 version을 확인하고, 로컬 파일을
  그 값으로 만든다(먼저 만들어 두고 나중에 rename하지 않는다).** 이번엔 `supabase_
  migrations.schema_migrations`에서 `statements` 컬럼을 조회해 로컬 파일 내용과 바이트
  단위로 대조한 뒤 rename했다(CORE가 먼저 쓴 방법, 효과적이었다).
- 데이터 레이어(`src/lib/data/supabase/crew.ts`): `transferCrewOwnership`·`disbandCrew`
  신규 함수 2개.
- Server Action 3개(신규): `transfer-crew-ownership.ts`·`remove-crew-member.ts`·
  `disband-crew.ts`.
- 컴포넌트: `DisbandCrewForm.tsx`(신규), `MemberList.tsx`(오너 이양·강퇴 다이얼로그 추가),
  `CrewMembersContainer.tsx`·`CrewSettingsContainer.tsx`(권한 판정·props 배선 추가),
  `crew-member-view-models.ts`(`canTransferOwnership`·`canRemove` 필드 추가).
  `/sample`에 "크루 설정 — 크루 해산(DisbandCrewForm)" 섹션 신설 + 기존 "멤버 관리" 섹션에
  이양·강퇴 데모 반영(기본·로딩·오류 3상태 — 빈 상태는 `CrewVisibilityForm` 선례와 같은
  이유로 비웠다, 제출 오류가 `useActionState` 내부 상태라 정적 prop 주입이 안 된다).
- 타입: `src/lib/types/permission.types.ts`의 `PermissionCheckContext.targetRole`을
  `UserRole`(오타에 가까운 원래 선언, 실제 호출부가 이번에 처음 생겨 발견)에서
  `CrewMembershipRole`로 수정(Task 009B 이후 첫 실사용, 컴파일 에러로 발견). `notification.
  types.ts`에 `ownership_transferred`·`crew_disbanded` 2종 추가 + 그 유니온을 소비하는
  `Record<NotificationType,...>` 4곳(`notification-routing.ts`·`notification-view-models.ts`·
  `NotificationItem.tsx`·`simulate-notification-event.ts`)을 함께 갱신.
  `src/lib/audit/audit-log.ts`의 `AuditAction`에 3종 추가(§3).
  `src/lib/data/supabase/database.types.ts` 재생성(`disband_crew` 반영, CORE의 동시 작업과
  병합 — §9).
- 문서: 본 문서, `docs/prioritization-and-risks.md` **D-046**, `docs/ISSUES.md` **I-066**·
  **I-067**.

## 9. 병렬 작업 경계 — 실측 확인

- `src/lib/audit/**`은 §3에서 다룬 `audit-log.ts` 유니온 확장 1건 외에는 건드리지 않았다.
- `src/lib/realtime/**`·채팅/투표/알림 구독 컨테이너·`chat.ts`의 구독 부분은 건드리지
  않았다. `notifications.ts`(데이터 레이어의 쓰기 부분, `createNotification`)는 기존
  함수를 호출만 했고 수정하지 않았다.
- `profiles` RLS·`profile.ts`·`search-user-by-handle.ts`는 건드리지 않았다. 다만
  `database.types.ts` 재생성 과정에서 CORE가 같은 파일을 거의 동시에 재생성하고 있는 것을
  실측으로 확인했다(`get_profile_public_by_handle` RPC가 CORE의 I-058 major① 수정으로
  삭제되는 것을 두 번째 재생성에서 목격) — 최종적으로는 양쪽 변경(내 `disband_crew` +
  CORE의 함수 삭제)이 모두 반영된 상태로 정리했고, `npx tsc --noEmit`·`npm run lint`
  둘 다 통과를 재확인했다.
- `src/lib/strings/ko.ts`는 crew 관련 키(`crew.settings.transferOwnership`·
  `crew.settings.disband`·`crew.members.remove`·`notification.messages.ownershipTransferred`·
  `crewDisbanded`)만 추가했다. 편집 중 파일이 동시에 바뀌는 것을 두 번 겪었지만(다른
  팀원이 다른 섹션을 건드리는 중으로 추정) 내 편집 대상 텍스트가 고유해 충돌 없이
  적용됐다 — 다른 섹션을 재정렬하지 않았다.

## 10. 검증 요약(팀장 보고용)

- `npx tsc --noEmit`: 통과(0 에러).
- `npm run lint`: 통과(0 에러).
- `npm run build`/`dev`/`start`는 실행하지 않았다(운영 규칙 1).
- DB 실측 10개 시나리오 전부 PASS(§5) — 특히 앱 우회(직접 PATCH/anon RPC 호출) 2건
  (A2·C3)이 정확히 거부됨을 확인했다.

## 11. FR-013 AC2 브라우저 검증 FAIL — DB는 맞았는데 화면이 요구사항을 어겼다(I-067 확정, 후속 수정)

**핵심 교훈**: §5의 DB 레벨 실측(미래 Meetup `cancelled`·과거 Meetup `confirmed` 유지)은
전부 PASS했지만, **DESIGN이 브라우저로 실제 클릭해 캘린더를 본 결과는 FAIL**이었다 — DB
상태가 요구사항대로 정확한 것과, 화면이 그 상태를 요구사항대로 보여주는 것은 **서로 다른
검증**이다. DB 실측만으로 AC를 "PASS"라고 적으면 안 된다는 것을 이번 회차가 직접 보여준
사례로 남긴다.

**현상**(DESIGN 브라우저 실측): 해산된 크루의 캘린더에서 미래 Meetup 바는 정상적으로
사라졌지만(AC2 절반 PASS), **과거 Meetup 바도 함께 완전히 사라졌다**(AC2 "과거 항목은
열람 전용으로 남는다" 위반).

**원인**(DESIGN이 코드로 특정, 팀장이 전달): `MonthCalendarContainer.tsx`(Task 021A, DESIGN
소유)가 `listCrewsByProfile()`로 "내 크루" 목록을 얻어 캘린더 조회 범위·크루 필터·크루명/색상
조인(`crewById`)에 재사용한다. 이 함수(`crew.ts`, 이 문서 §1의 원 구현)가
`.eq("status","active")`로 크루를 걸렀다 — **Meetup 상태가 아니라 크루 상태로 걸러져**
`archived` 크루 자체가 "내 크루" 목록에서 통째로 빠지고, 그 크루의 과거 Meetup도(크루명을
조인할 대상이 없어) 화면에 그려지지 못했다. RLS 문제가 아니다 — 아래 실측대로 `crews`·
`meetups` SELECT 정책은 archived 크루의 과거 데이터를 이미 정상적으로 보여준다. 애플리케이션
레이어의 필터가 너무 넓게(모든 소비처에 일괄) 걸려 있었을 뿐이다.

**수정**(`crew.ts`, 이 파일 소유): `listCrewsByProfile(profileId, opts?)`에
`opts.includeArchived`(기본 `false`)를 추가했다. 1단계(멤버십 조회)는 옵션과 무관하게 항상
`crew_memberships.status='active'`만 본다 — "지금 이 크루에 속해 있는가"는 archived 여부와
별개 판정이다(탈퇴·강퇴된 사용자는 여전히 안 보여야 한다). 2단계(크루 자체 조회)에서만
`includeArchived`가 `crews.status='active'` 필터를 생략할지 결정한다.

**기존 호출자 전수 조사**(`grep -rn "listCrewsByProfile" src`, 4곳) — 옵션을 생략하면 전부
**기존과 동일한 결과**를 받는다:
1. `HomeCalendarSummaryContainer.tsx`(홈 대시보드 "다가오는 모임") — 옵션 생략, active만.
2. `fetch-crew-cards.ts`(크루 탐색 "가입됨" 배지) — 옵션 생략, active만(해산된 크루를 탐색
   결과에 다시 노출할 이유가 없다).
3. `AccountSettingsContainer.tsx`(FR-005 AC1 "오너로 있는 크루" 탈퇴 차단 목록) — 옵션 생략,
   active만(이미 해산된 크루는 탈퇴를 막을 이유가 없다 — 막으면 오히려 새 결함이 된다).
4. `MonthCalendarContainer.tsx`(캘린더, 이번 결함의 진원지) — **`{ includeArchived: true }`
   로 바꿔야 한다.** 이건 DESIGN 소유 파일이라 이 문서에서 고치지 않았다 — 아래 "DESIGN
   인계"에 시그니처를 넘긴다.

**RLS는 이미 정상이다 — 실측 확인**(합성 데이터 1개, 커밋 후 명시적 DELETE로 정리): 오너
멤버십만 있는 `archived` 크루 1개 + 과거(30일 전) `confirmed` Meetup 1개를 만들고, 그 오너
세션으로 조회했다.
- `select * from public.crews where id = <archived 크루>` → **행 반환됨**(`status: archived`
  그대로) — `crews_select_authenticated` 정책은 `crews.status`를 전혀 보지 않는다(가입
  시점 조건만 확인).
- `select * from public.meetups where crew_id = <archived 크루>` → **과거 Meetup 행
  반환됨**(`status: confirmed`) — `meetups_select_members` 정책도 `crew_memberships.status`
  만 보고 `crews.status`는 보지 않는다.
- CORE의 I-066 SQL 절반(마이그레이션 `20260725094141_crews_block_writes_in_archived_crew_
  i066`)을 읽고 교차 확인했다 — CORE도 **SELECT/읽기 정책은 의도적으로 건드리지 않았다**
  (건드리면 FR-013 AC2를 정면으로 위반한다는 이유를 그 마이그레이션 주석에 명시했다). 두
  담당자가 독립적으로 같은 결론(읽기 경로는 그대로 둬야 한다)에 도달한 것을 상호 확인했다.

**DESIGN 인계 — 확정 시그니처**:
```ts
listCrewsByProfile(profileId: Id, opts?: { includeArchived?: boolean }): Promise<Crew[]>
```
`MonthCalendarContainer.tsx:60`에서 `listCrewsByProfile(profileId)` → `listCrewsByProfile(profileId, { includeArchived: true })`로 바꾸면 된다. 캘린더 렌더링 판단(과거 Meetup 바를 "열람 전용"으로 어떻게 시각적으로 구분할지 — 예: 흐리게, 자물쇠 아이콘 등)은 이 문서·이 함수의 책임이 아니다 — DESIGN 몫이다. `ArchivedCrewBanner` 컴포넌트(DESIGN이 작업 중인 것으로 보임)도 이 문서에서 다루지 않는다.

**Mock 구현(`src/lib/data/mock/crew.ts:180`)은 갱신하지 않았다** — Task 032(쓰기 경로 전환)
이후 `src/lib/data/index.ts` 배럴이 mock을 더 이상 재노출하지 않아 이 함수는 죽은 코드다
(호출부 없음, `grep` 확인). NFR-035(Mock·실데이터 시그니처 일치)는 배럴로 소비되는 코드에
적용되는 원칙이라, 죽은 코드까지 동기화하는 비용을 들이지 않았다.

**이 판단이 18일차(Task 039)의 `fixtures.ts` `deactivated` 픽스처 추가와 모순되지 않는
이유(팀장 지적으로 명시)**: 18일차엔 NFR-035를 근거로 **동기화했다** — 정반대로 보일 수
있어 구분을 남긴다. 그때 손댄 `src/lib/data/mock/fixtures.ts`·`seed/generate-profiles.ts`는
**실제 소비자가 있는 파일**이다 — `generate-profiles.ts`는 Task 010(Mock 시드 데이터) 이후
실 Supabase 시드 데이터를 만드는 데 그대로 쓰이고 있어(대량 시드의 상태 분포 생성 로직), 이
쪽에 `deactivated` 분기를 빠뜨리면 시드 데이터 자체가 실제로 그 상태를 대표하지 못하게
된다 — 그래서 "죽은 코드"가 아니라 "여전히 실행되는 코드"였다. 반면 이번 `mock/crew.ts`의
`listCrewsByProfile`은 **어떤 시드 생성기·`/sample` 쇼케이스·실행 경로에서도 import되지
않는다**(`grep -rln "from .*mock/crew\"" src` 결과 자기 자신 외 0건) — 함수 시그니처를
바꿔도 그 변경을 관찰할 수 있는 코드가 아예 없다. **판별 기준**: NFR-035는 "그 mock 코드가
실제로 실행되는가"를 기준으로 적용한다 — 시드 생성·`/sample` 데모처럼 살아 있는 소비자가
있으면 동기화하고(18일차 사례), 배럴에서 빠진 뒤 호출부가 전혀 남지 않은 함수는 동기화
비용을 들이지 않는다(이번 사례).

**검증**: `npx tsc --noEmit` 0 에러 · `npm run lint` 0 에러(이번 수정 반영 후 재확인).
