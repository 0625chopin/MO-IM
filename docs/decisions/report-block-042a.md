# 신고·차단 (Task 042A)

- **일자**: 2026-07-25(20일차)
- **담당**: CREW(A팀) · 리뷰 DESIGN(B팀) — major 0건, 팀장 판정으로 항목 7(§9) 후속 배선 지시
- **참조**: FR-080·081, D-008·D-014, NFR-015, `docs/decisions/schema-migration-028.md`(§3.3
  다형 참조·§3.1 하드 삭제 금지), `docs/decisions/rls-policies-029a.md`·`029b.md`(private
  SECURITY DEFINER 헬퍼 패턴), `docs/decisions/write-path-realdata-032.md`(I-054 원 보고)
- **범위**: 신고 접수(FR-080)·사용자 차단(FR-081) 쓰기 경로. **관리자 콘솔(FR-082)은 범위
  밖**(Task 042B, 다른 팀원) — 다만 042B가 소비할 상태 전이·처리 필드는 이 문서 §6에 정한다.

## 0. 착수 전 확인

`list_tables`(public) 결과 `reports`·`blocks` 테이블이 **이미 존재**했다(Task 028이 스키마를,
Task 029A가 RLS 기본 정책을 만들어 뒀다 — `reports_select_self`·`reports_insert_self`,
`blocks_select_self`·`blocks_insert_self`·`blocks_delete_self`). 둘 다 0행. 그래서 이번 회차는
**새 테이블을 만들지 않고 정책·RPC만 얹었다** — 지시문이 요구한 순서 그대로다.

## 1. I-054 회피 — 신고·차단 쓰기는 처음부터 단일 RPC

`create_report`·`create_block` 둘 다 `security invoker`(호출자 자신의 행만 다루므로 RLS를
우회할 필요가 없다 — `respond_meetup_attendance`(Task 032)와 같은 신뢰 수준)로, 각각 하나의
SQL 함수 호출이 곧 하나의 DB 트랜잭션이다. `createJoinRequest`·`createPoll`(I-054가 지적한
"여러 PostgREST 호출을 순서대로" 패턴)과 달리 처음부터 이 문제가 생기지 않는다.

- **`create_report`**: `INSERT ... ON CONFLICT (reporter_id, target_type, target_id) WHERE
  status='pending' DO UPDATE SET reason=...`로 FR-080 AC1의 "중복 신고 병합"을 단일 문장으로
  구현했다(`xmax <> 0`로 실제 upsert 여부를 감지해 `merged` 플래그를 채운다). 자기 프로필
  신고 금지는 **테이블 CHECK**(`reports_no_self_profile_report`)로 걸어 이 RPC를 우회해도
  성립한다. 빈 사유 금지도 CHECK(`reports_reason_not_blank`).
- **`create_block`**: `INSERT ... ON CONFLICT (blocker_id, blocked_id) DO NOTHING` + `get
  diagnostics`로 멱등을 구현했다(이미 차단한 대상을 다시 차단해도 오류가 아니라
  `already_blocked=true`). 자기 차단 금지는 028부터 있던 테이블 CHECK(`blocks_check`)가 이미
  강제하고 있었다 — RPC는 그 위에 친절한 `reason_code`(`cannot_block_self`)만 얹었다.

둘 다 `{ok, reason_code, ...}` 계약이다 — `respond_meetup_attendance`·
`crew_memberships_guard_self_transition`(FR-024/027)이 이미 쓰는 형태를 그대로 따랐다.

## 2. FR-081 AC2 — 초대 차단을 앱이 아니라 RLS에서 막았다

요구사항 FR-020 정상 흐름 E3("대상자가 나를 차단(FR-081) → 초대 불가, 사유는 노출하지
않음")을 만족시키는 유일하게 안전한 자리는 **DB다** — 초대자(inviter)는 `blocks_select_self`
RLS상 상대(invitee)가 자신을 차단했는지 조회할 방법이 없고(본인이 만든 차단만 보인다), 만약
앱이 그 정보를 알아내려면 별도의 조회 경로가 필요한데 그 자체가 "차단됐다"는 사실을
노출한다 — 요구사항이 명시적으로 금지하는 바로 그것이다.

그래서 `private.is_blocked(p_blocker, p_blocked)`(SECURITY DEFINER, 029B와 같은 4개 헬퍼와
동일 패턴)를 새로 만들고, `invitations_insert_staff_or_owner`의 `WITH CHECK`에 `and not
private.is_blocked(invitations.invitee_id, invitations.inviter_id)`를 추가했다(18일차
`invitations_block_requested_target_at_rls`와 같은 방식 — 기존 3개 조건 불변, drop+create로
재정의, 정책 개수 증감 없음). 초대 시도가 이 조건에 걸리면 PostgREST가 일반
`42501`(row-level security policy violation)만 반환하므로 **사유가 노출되지 않는다.**

**부수적으로 건드린 파일(최소 침습)**: `src/lib/data/supabase/invitation.ts`의
`createInvitation`이 이제 `Invitation` 대신 `DataResult<Invitation>`을 반환한다 — 42501을
그대로 던지면 D-030 ③(도메인 오류도 값으로)을 어기기 때문이다. 유일한 호출부
`src/lib/actions/invite-crew-member.ts`도 그 반환값을 처리하도록 한 줄 바꿨다(새 문구
`strings.crew.members.invite.errors.blocked`, "이 사용자를 초대할 수 없어요" — 이유를
구분하지 않는다). `lib/rules/invite-eligibility.ts`의 docstring도 "E3는 Task 042A 이후
대상"에서 "E3는 DB RLS 경계에서 구현됨"으로 갱신했다.

## 3. 실측 검증 (전부 `begin`…`rollback`, 잔여 행 0건)

| # | 시나리오 | 기대 | 실측 |
| --- | --- | --- | --- |
| 1 | A가 B(profile)를 최초 신고 | `ok=true, merged=false` | ✅ |
| 2 | A가 같은 B를 다시 신고(다른 사유) | `ok=true, merged=true`, 같은 `id` | ✅ |
| 3 | A가 자기 자신을 신고 | `ok=false, reason_code=cannot_report_self` | ✅ |
| 4 | A가 빈 사유(공백만)로 신고 | `ok=false, reason_code=reason_required` | ✅ |
| 5 | `reports` 실제 행 수(1·2 이후) | 1건(병합 확인) | ✅ **1** |
| 6 | B가 C를 차단 | `ok=true, already_blocked=false` | ✅ |
| 7 | B가 같은 C를 다시 차단 | `ok=true, already_blocked=true` | ✅ |
| 8 | B가 자기 자신을 차단 | `ok=false, reason_code=cannot_block_self` | ✅ |
| 9 | C가 오너(크루 임원 이상)를 차단 | `ok=true` | ✅ |
| 10 | 오너가 (9)의 C를 크루에 초대 시도 | RLS 거부(42501) | ✅ |
| 11 | 오너가 차단하지 않은 D를 초대(대조군) | 성공 — 회귀 없음 | ✅ **success** |
| 12 | A가 **자기 신고**의 `status`를 직접 `resolved`로 UPDATE | 트리거 예외(P0001) | ✅ |
| 13 | A가 자기 신고의 `reason`만 UPDATE | 성공 | ✅ |
| 14 | `anon`이 `create_report`/`create_block` 직접 호출 | `permission denied for function`(42501) | ✅(수정 후) |

**14번은 최초에 실패했다** — `revoke all on function ... from public`만으로는 Supabase가
`public` 스키마 신규 함수에 자동으로 붙이는 `anon`/`authenticated` 개별 grant(`ALTER DEFAULT
PRIVILEGES`)가 회수되지 않는다는 15일차 교훈(rls-policies-029b.md §2.3)을 **똑같이 반복해서
걸렸다** — `information_schema.routine_privileges`로 실측해 `anon`이 EXECUTE를 갖고 있음을
발견하고 `revoke execute ... from anon`을 명시적으로 추가해 해소했다(마이그레이션
`fix_anon_execute_on_report_block_rpcs`). `private.is_blocked`는 `private` 스키마라 이 문제가
없었다(같은 교훈: 기본 권한 규칙은 `public` 스키마에만 걸린다).

**추가로 발견한 것**: `reports_guard_self_update_reason_only` 트리거 함수가 SECURITY
DEFINER인데 anon/authenticated에게 RPC로 직접 노출돼 있었다(`get_advisors(security)` WARN
2건) — 029A §3의 "트리거 전용 함수는 client EXECUTE를 회수한다" 패턴 그대로
`revoke all ... from public, anon, authenticated`로 해소했다(마이그레이션
`fix_reports_guard_trigger_execute_grant`). 최종 `get_advisors(security)`는 **기존
`auth_leaked_password_protection` WARN 1건(무관) 외 신규 0건.**

**중간에 발견해 즉석에서 고친 것 하나 더**: `create_report`의 `ON CONFLICT ... DO UPDATE`가
`reports`에 **UPDATE 정책이 아예 없어서**(029A/B는 SELECT/INSERT self만 만들었다) `USING
expression` RLS 위반으로 막혔다. `reports_update_self`(본인 스코프) 정책 + 셀프서비스가
`reason` 외 컬럼(특히 `status`)을 못 바꾸게 막는 트리거를 함께 추가했다 — status 전이는
`auth.uid()`가 없는 컨텍스트(향후 관리자 콘솔의 service_role 경로)에서는 트리거가 관여하지
않는다(§6).

## 4. 마이그레이션 목록 (전부 적용 + `supabase/migrations/`에 동일 파일 저장, I-051 대응)

1. `20260725114157_report_block_rpcs_042a.sql` — 신고 중복 병합 부분 유니크 인덱스, 자기
   신고·빈 사유 CHECK, `create_report`·`create_block` RPC, `private.is_blocked` 헬퍼,
   `invitations_insert_staff_or_owner` 확장.
2. `20260725114343_reports_add_self_update_policy_and_guard_trigger.sql` — 위 §3에서 발견한
   UPDATE 정책 공백 해소.
3. `20260725114519_fix_anon_execute_on_report_block_rpcs.sql` — anon EXECUTE 회수(15일차
   교훈 재발 수정).
4. `20260725114551_fix_reports_guard_trigger_execute_grant.sql` — 트리거 함수 EXECUTE 회수.

**동시 작업 주의**: 이 사이(114157~114551)에 다른 팀원의 마이그레이션 2건
(`crews_guard_archived_immutable_i066` `114415`, `handle_availability_ip_rate_limit_i065`
`114433`)이 끼어들었다 — 같은 회차에 여러 팀원이 동시에 `apply_migration`을 쓰고 있다는
뜻이다. 그 두 파일은 내 소유가 아니라 로컬 파일 생성을 대신 해 주지 않았다(각 담당자가 I-051
대응을 스스로 해야 한다) — 다만 이 문서에 존재를 남겨 다음 사람이 "내가 놓쳤나" 헷갈리지
않게 한다.

`generate_typescript_types` 재생성 완료(`create_report`·`create_block` `Functions`에 반영,
`private.*`는 미노출이라 타입에도 안 나타남 — 029B와 같은 패턴). `npx tsc --noEmit`·
`npm run lint` 둘 다 0 errors(레지스트리·MemberList·crews.tsx 샘플 데이터에 새 뷰모델 필드
2개(`isBlockedByViewer`·`canReportOrBlock`)를 채워야 했던 것 외에는 타입 에러 없음).

## 5. 앱 레이어 산출물

- **`lib/rules`**: `report-eligibility.ts`(사유 필수·자기 신고 금지, RPC와 같은 판정을
  클라이언트에서 미리 보여줌)·`block-content-visibility.ts`(차단 콘텐츠 접힘 순수 판정,
  `isContentFromBlockedAuthor`).
- **`lib/data/supabase`**: `report.ts`(`createReport`)·`block.ts`(`createBlock`·
  `removeBlock`·`listMyBlockedProfileIds`). **mock 대응물은 만들지 않았다** — Task 032부터
  이 저장소의 새 쓰기 도메인은 mock을 만들지 않는 전례(Task 038 감사 로그, Task
  039·040 신규 RPC)를 그대로 따랐다.
- **`lib/actions`**: `create-report.ts`·`create-block.ts`·`remove-block.ts`(차단 해제 — FR-081
  AC에는 없지만 해제 경로 없이 차단만 있으면 실수를 못 되돌리므로 함께 만들었다, 단일
  DELETE라 RPC 불필요).
- **`components/moderation`**(신규 도메인 디렉터리): `ReportDialog`(범용, targetType+targetId
  props)·`BlockButton`·`BlockedContentNotice`(표현, FR-081 AC1)·`BlockedUsersList`+
  `BlockedUsersListSkeleton`(표현)·`BlockedUsersListContainer`(컨테이너, D-030 ①).
- **배선**: `MemberList.tsx`·`CrewMembersContainer.tsx`(크루원 목록 행별 신고·차단, CREW 소유
  도메인)·`/settings` 페이지(`BlockedUsersListContainer` 추가, 새 라우트 없이 기존 계정 설정
  페이지에 조립 — Task 015B도 CREW 소관이라 같은 파일을 다시 손댈 권한이 있었다).
- **문자열**: `lib/strings/ko.ts`에 `report`·`block`·`moderation` 최상위 키 3개, `crew.members
  .invite.errors.blocked` 1개 추가.
- **`/sample`**: `moderation` 섹션 신규(항목 4개 — ReportDialog·BlockButton·
  BlockedContentNotice·BlockedUsersList, 전부 기본·로딩·오류 상태 포함, BlockedUsersList만
  빈 상태도 포함 — 나머지 셋은 "빈 상태" 개념이 없는 폼/토글 컴포넌트라 비웠다, 관례는
  `InviteMemberDialog` 등록과 동일).

## 6. Task 042B(관리자 콘솔)가 소비할 데이터 모양

- **`reports.status`**: `pending` → `resolved` | `dismissed` 2갈래(FR-082 AC1 "처리(삭제/기각/
  계정 제재)"). 이번 회차는 `pending`만 만든다(INSERT 기본값) — **상태를 바꾸는 쓰기 경로가
  아직 없다.**
- **누가 바꿀 수 있는가**: `reports_update_self`(본인 스코프) + `reports_guard_self_update_
  reason_only` 트리거 조합은 **`auth.uid()`가 있는 일반 로그인 사용자**를 `reason` 컬럼
  하나로만 제한한다. **`auth.uid()`가 없는 컨텍스트(= service_role, 관리자 콘솔이 쓸 경로)는
  이 트리거의 제한을 받지 않는다** — 042B는 service-role 클라이언트(`audit-log.ts`·
  `createProfile`이 쓰는 것과 같은 패턴)로 `status`를 바꾸면 된다. 새 RLS UPDATE 정책을 만들
  필요는 없다(service_role은 RLS를 우회한다) — 다만 `system_admin` 식별 컬럼이 아직 없다는
  것(029A §7.5·029B §8 이월, 이번에도 손대지 않음)은 그대로다.
- **"삭제" 처리(FR-082 AC1)가 실제로 무엇을 의미하는지는 이번 문서가 정하지 않는다** —
  `target_type`에 따라 `posts.deleted_at`/`comments.deleted_at`/`chat_messages.deleted_at`
  소프트 삭제를 트리거하는 것으로 보이지만, 그 판단은 관리자 콘솔 구현자(042B)의 몫으로
  남긴다. 이 문서는 신고 테이블 자체의 상태 전이 계약만 확정한다.
- **감사 로그(FR-082 AC1 "감사 로그가 남는다")**: `audit_logs.action`에 `report.*` 값이
  아직 없다(`lib/audit/audit-log.ts`의 `AuditAction` 유니온에 신고 처리 관련 값을 추가하는
  것은 042B 몫 — 이 파일은 BOARD 소유라 이번 회차에 사전 조율 없이 건드리지 않았다, Task 040이
  했던 것과 달리 이번엔 크루 생애주기처럼 급하지 않아 미리 넣지 않았다).
- **`reports.target_id`는 다형 참조라 FK가 없다**(028부터). 신고 대상 존재 여부를
  `create_report`가 검증하지 않는다(§7 한계) — 관리자 콘솔이 `target_type`에 맞는 테이블을
  직접 조회해 대상이 이미 삭제됐을 가능성을 스스로 처리해야 한다.

## 7. 차단 적용 범위 / 범위 밖 (20일차 후속 갱신 — §9 참고)

**적용함(최종)**:
- 차단 생성·해제·조회(`create_block`·`removeBlock`·`listMyBlockedProfileIds`) — 전부 동작.
- FR-081 AC2(차단자가 나를 크루에 초대할 수 없다) — **DB RLS로 완전히 강제**, 앱 우회
  불가능(publishable key로 직접 INSERT해도 막힌다, 시나리오 10 실측).
- FR-081 AC1(콘텐츠 접힘) — **크루원 목록·게시판(목록·상세)·채팅(말풍선) 전부 배선 완료**
  (§9). 크루원 목록은 "사람" 행이라 `BlockedContentNotice`를 직접 쓰지 않고 `BlockButton`의
  `initialBlocked` 상태로 표현했고, 게시판·채팅은 실제 "콘텐츠"라 `BlockedContentNotice`로
  감쌌다.

**범위 밖으로 남음**(대부분 경미, `docs/ISSUES.md` I-072가 최신 상태를 담는다):
- **채팅 세션 중 차단 갱신 미반영** — `blockedProfileIds`는 채팅방 진입 시점 1회 조회값이라,
  대화 중 새로 차단해도 새로고침 전까지 그 세션에는 반영되지 않는다.
- **댓글**(Comment) — 애초에 v0.2 대상이라 신고·차단 어느 쪽도 화면이 없다(스키마만 선반영,
  `schema-migration-028.md`).
- **신고 대상 실존 확인** — `create_report`는 `target_id`가 실제로 존재하는 행을 가리키는지
  검증하지 않는다(§6 마지막 항목). `profile` 타입은 `profiles_select_authenticated`가
  self-row 전용으로 좁혀져 있어(I-058) 검증하려면 `get_profile_public_by_id` RPC를 또 거쳐야
  하고, `post`/`comment`/`chat_message`는 크루 멤버십에 따라 보일 수도 안 보일 수도 있어
  검증 로직이 대상별로 갈린다 — 이번 회차 시간 예산상 미룬다.
- **"내가 신고한 목록" 사용자 화면** — FR-080 AC에 없어 만들지 않았다(AC2는 "관리자 콘솔
  대기 목록"만 요구한다).

## 8. 확인하지 못한 것 (정직하게 남긴다)

- **브라우저 실클릭 검증을 하지 못했다** — `npm run dev`/`npm run build`는 이 회차 운영
  규칙상 팀장 전용이라(여러 선행 문서가 반복하는 제약) SQL 레벨 실측(§3)과 정적 타입·린트
  검증까지만 했다. `MemberList`·`BoardListItem`·`MessageBubble`의 신고·차단·접힘 UI가 실제
  브라우저에서 정확히 동작하는지는 다음 회차나 팀장 검증이 필요하다. **특히 채팅 실시간
  경로**(§9.2)는 실제 소켓으로 열어 확인하지 못했다 — 코드 경로 분석(구조적 근거)만 있다.
- **`create_report`의 target 존재 검증 부재**(§7)는 한계로 남겨 뒀다 — 악용하면 존재하지
  않는 `target_id`로 신고를 쌓을 수 있으나, `reporter_id`가 항상 실제 로그인 사용자이므로
  익명 스팸은 아니고 관리자 콘솔(042B)이 처리 시점에 걸러낼 수 있다.
- **레이트 리밋 없음** — `handle_search_attempts`류 SQL 강제 레이트 리밋을 신고·차단에는
  적용하지 않았다(요구사항 FR-080·081 어디에도 명시된 수치가 없다 — D-005의 "분당 20회"는
  핸들 검색 전용 결정이라 그대로 재사용할 근거가 없다고 판단했다). 남용 방지가 필요해지면
  별도 결정이 선행돼야 한다.

## 9. 20일차 후속 — 게시판·채팅 배선(FR-081 AC1 완결, 팀장 지시)

**배경**: DESIGN의 042A 교차검증 항목 7이 "AC1 원문(`requirements.md:989`)이 명시한 두 위치
(게시판·채팅) 중 어느 쪽도 배선되지 않았다 — FR-081을 완료로 부르면 AC2만 충족한 것이라
부정확하다"고 지적했다. 팀장이 "충돌 우려(§7 원래 판단 근거)가 이제는 소멸했다 — 그 파일들을
이번 회차에 잡고 있는 사람이 없다"고 판정해 같은 회차 안에 배선을 지시했다.

### 9.1 게시판

- `board-view-models.ts`: `BoardPostSummary`·`PostDetailViewModel`에 `isAuthorBlocked: boolean`
  추가(원본 `authorId`는 노출하지 않는다 — 다른 사전 판정 불리언(`canWrite` 등)과 같은 원칙).
- `BoardListContainer.tsx`·`PostDetailContainer.tsx`: `listMyBlockedProfileIds()`를 페이지당
  한 번만 조회해(N+1 방지) `isAuthorBlocked`를 계산.
- `BoardListItem.tsx`: `isAuthorBlocked`면 카드 전체(`<Link><Card>...</Card></Link>`)를
  `BlockedContentNotice`의 `children`으로 넘긴다 — **왜 카드 전체인가**: 이 카드는 통째로
  `<Link>`이고 `BlockedContentNotice` 내부의 "펼치기"는 `<button>`이다. 접힌 상태에서 `<Link>`
  안에 `<button>`을 두면(원래 계획이었던 "제목만 접기") 상호작용 요소 중첩이 되어 클릭 시
  이벤트가 앵커까지 버블링되는 등 시맨틱이 깨진다(NFR-021) — 그래서 접혔을 때는 `<Link>` 자체를
  DOM에서 아예 빼고, 펼친 뒤에만 평소와 같은 클릭 가능한 카드가 나타나게 했다.
- `PostDetail.tsx`: `isAuthorBlocked`면 본문(`CardContent`)만 감싼다 — 제목·작성자·날짜는
  그대로 둔다(이미 목록에서 보고 클릭해 들어온 정보이고, 신고 대상을 특정하려면 누구 글인지
  계속 보여야 한다). 이 컴포넌트는 `<Link>`로 감싸여 있지 않아 중첩 문제가 없다.

### 9.2 채팅 — Realtime 경로

- `MessageListContainer.tsx`(서버): `listMyBlockedProfileIds()`를 최초 조회 시 한 번만 불러
  **배열**로 `MessageRoomContainer`(클라이언트)에 내려준다 — `Set`은 서버→클라이언트 props로
  직렬화되지 않는다(NFR-037).
- `MessageRoomContainer.tsx`(클라이언트): 배열을 `Set`으로 변환해 `MessageList`에 고정 props로
  내려준다.
- `MessageList.tsx`·`MessageBubble.tsx`: 매 렌더마다 `messages` 배열 전체를 map하며 항목별로
  `blockedProfileIds.has(senderId)`를 판정해 `isSenderBlocked`를 넘긴다. `MessageBubble`은
  `true`(그리고 `!isOwn`)면 말풍선 내용(`MessageContent`)만 `BlockedContentNotice`로 감싼다 —
  아바타·이름·시각은 유지(`PostDetail`과 같은 원칙).
- **실시간 메시지에도 적용되는 이유(구조적 근거, 코드 경로 분석)**: `blockedProfileIds` Set은
  `MessageRoomContainer`가 마운트될 때 한 번 만들어지는 고정 값이고, 실시간으로 도착한
  메시지(`subscribeToRoom`의 콜백이 `setMessages`로 append)도 초기 메시지와 **완전히 같은
  `MessageList`의 map 루프**를 거친다 — "초기 메시지냐 실시간 메시지냐"로 분기하는 코드가
  어디에도 없으므로, 새 메시지도 구조적으로 동일하게 판정받는다.
- **정직한 한계**: 이 결론은 코드를 읽어서 낸 것이지 실제 브라우저에서 두 세션을 열어
  한쪽이 보낸 메시지가 다른 쪽에서 접혀 나오는 것을 **직접 확인하지는 못했다** —
  `npm run dev`가 이번 회차도 팀장 전용 운영 규칙이라 소켓을 열 수 없었다. 다음 회차나
  팀장 검증에서 실측이 필요하다.
- **알려진 한계(새로 발견, 경미)**: `blockedProfileIds`는 세션당 1회 조회값이라, 채팅 중에
  새로 차단해도 그 세션(새로고침 전)에는 반영되지 않는다 — `docs/ISSUES.md` I-072에 남겨
  뒀다.

### 9.3 `/sample` 반영

`src/components/sample/sections/board.tsx`에 2항목(게시판 목록·상세의 차단 데모),
`chat.tsx`에 2항목(메시지 목록·말풍선의 차단 데모) 추가 — 전부 기존 섹션에 자연스럽게
이어지는 위치에 넣었다(새 카테고리를 만들지 않음).

### 9.4 검증

`npx tsc --noEmit`·`npm run lint` clean(배선 후 재확인 — `ChatMessageListPreview.tsx`·
`MessageBubblePreview.tsx`가 새 필수 prop `blockedProfileIds`를 요구하게 되어 `/sample`
소비처 2곳에 기본값을 추가했다). SQL·RLS는 이번 배선에서 건드리지 않았다(순수 앱 레이어
변경) — §3의 실측 결과는 그대로 유효하다.

### 9.5 20일차 재후속 — DESIGN 브라우저 실측 minor 1건(포커스·`aria-expanded`) 수정

DESIGN이 §9.1~9.4의 배선을 **프로덕션 빌드 + 실제 브라우저**로 검증해 FR-081을 완료로
판정했다(major 0건). 다만 `document.activeElement`를 직접 확인해 "펼치기" 클릭 후 포커스가
`<body>`로 빠지는 것과 `aria-expanded` 부재를 minor로 지적했다 — 원인은 `BlockedContentNotice`
의 최초 구현이 `expanded` 상태에 따라 **완전히 다른 JSX 트리를 반환**했기 때문이다(펼치면
"펼치기" 버튼 자체가 대체 트리로 통째로 사라짐 → 포커스를 유지할 요소가 없어짐).

**수정**: `src/components/ui/collapsible.tsx`(신규) — shadcn 레지스트리의 `collapsible`
항목은 `radix-ui` 의존성이라(이 프로젝트의 다른 모든 `ui/*.tsx`는 `@base-ui/react`) 그대로
CLI로 추가하지 않고, Base UI의 동일 파트(`@base-ui/react/collapsible`의 Root/Trigger/Panel)
로 옮겨 적었다 — `DialogPrimitive.Popup` → `DialogContent`처럼 이 프로젝트가 이미 쓰는 이름
관례(`Collapsible`/`CollapsibleTrigger`/`CollapsibleContent`)로 얇게 감싼 얇은 래퍼일
뿐이다. `BlockedContentNotice.tsx`를 이 primitive 위에 다시 작성했다:

- **`aria-expanded`·`aria-controls`는 손으로 붙이지 않는다** — `@base-ui/react/collapsible`
  의 `Trigger` 구현(`node_modules/@base-ui/react/collapsible/trigger/*.js`)을 직접 열어
  `'aria-expanded': open`·`'aria-controls': open ? panelId : undefined`를 이미 내부에서
  설정하는 것을 확인했다. `Panel`의 `id`도 컨텍스트로 자동 등록돼 `Trigger`가 그대로
  참조한다 — 두 속성 다 컴포넌트 트리 구성만으로 자동 완성된다.
- **포커스가 `<body>`로 빠지지 않는 이유**: `Collapsible.Trigger`는 열림/닫힘 상태와
  무관하게 **항상 같은 DOM 위치에 남아 있는 하나의 `<button>`**이다(펼치면 그 옆/아래의
  `Panel`만 마운트되고, 트리거 자신은 트리 교체 대상이 아니다) — 그래서 클릭 후에도
  브라우저 기본 동작으로 포커스가 그 버튼 위에 그대로 남는다. 별도의 `focus()` 호출이나
  `ref` 관리 코드를 추가하지 않았다 — 트리 구조 자체가 문제의 원인이었으므로 트리 구조를
  고치는 것이 근본 수정이다.
- **세 사용처 전부 코드 변경 없이 자동 반영**: `BlockedContentNotice`의 공개 API(`children`
  prop 하나)는 바뀌지 않았다 — `BoardListItem.tsx`(카드 전체)·`PostDetail.tsx`(본문만)·
  `MessageBubble.tsx`(말풍선 내용만) 세 호출부는 손대지 않아도 된다. 부수 효과로 이제
  펼친 뒤 다시 접을 수도 있다(이전 버전은 한 번 펼치면 되돌릴 수 없었다 — 요구사항에
  명시되진 않았지만 표준 disclosure 패턴에 더 가깝다).
- **`/sample` 키보드 왕복**: `Collapsible.Trigger`가 `render={<Button .../>}`로 네이티브
  `<button>`을 렌더하므로(Base UI `NativeButtonProps`) Tab으로 포커스, Enter/Space로
  토글하는 것은 브라우저 기본 동작이다 — 별도 키 핸들러를 추가하지 않았다. **다만 실제
  키보드로 눌러 확인하지는 못했다**(`npm run dev` 팀장 전용 운영 규칙, 이번에도 동일) —
  DESIGN의 다음 브라우저 검증에서 재확인이 필요하다. 정직하게 남긴다.
- `npx tsc --noEmit`·`npm run lint` 전체 기준 재확인, clean.
