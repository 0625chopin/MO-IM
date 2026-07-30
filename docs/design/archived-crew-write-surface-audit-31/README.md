# archived 크루 쓰기 표면 전수 감사 (31일차 추가 배정, CREW)

## 배경

I-070 잔여 실측(같은 31일차, `docs/design/i070-archived-crew-settings-31/`)에서 크루 설정
폼이 archived 크루에서도 편집 가능한 채로 열리는 것을 확인하고 최소 수정했다. 팀장이 "한
곳이 빠져 있었다면 다른 곳도 빠져 있을 가능성이 높다"고 판단해 archived 크루에서 도달 가능한
**쓰기 진입점 전체**를 코드 정적 분석(+ 배포된 DB 트리거·RLS 소스 직접 확인)으로 감사했다.
1차 감사에서는 DB 데이터를 바꾸지 않고 SELECT만 했다.

**같은 31일차 후속** — 1차 감사가 "SQL 레벨 잔여"로 권고만 남긴 3건 중 2건(트리거 가드)을
팀장 지시로 같은 회차에 마이그레이션으로 소진했다(아래 "SQL 레벨 조치" 절). 이 단계에서는
`begin`…`rollback` 트랜잭션 안에서만 데이터를 만들고 지웠다 — 실 데이터에는 흔적이 없다.
브라우저 실측은 두 단계 모두 하지 않았다(dev 서버 회수 시점).

## 방법

- **DB 배포본을 직접 읽었다** — `pg_policies`(RLS)·`pg_proc`(트리거·RPC 함수 본문,
  `prosrc`)를 Supabase MCP `execute_sql`로 조회해 "코드가 뭐라고 주장하는지"가 아니라
  "배포된 SQL이 실제로 뭘 하는지"를 확인했다. 데이터는 SELECT만 했다(INSERT/UPDATE/DELETE
  없음).
- **각 진입점을 4개 층으로 나눠 봤다** — (컨테이너/버튼 노출) → (Server Action) → (RLS) →
  (트리거/RPC 내부 로직). 어느 한 층에서 막혀도 "막힘"으로 세지만, **막는 층이 다르면 실패
  모양이 다르다**는 것을 특히 신경 썼다(DB만 막고 앱이 그 사유를 안 보여주면 I-070과 같은
  "(b) 범용 실패 문구" 패턴이 재현된다).
- **`disband_crew` RPC 본문을 읽어 "해산 시 실제로 뭐가 정리되는가"를 먼저 확정했다** — 이게
  많은 항목의 "실제로 도달 가능한가"를 좌우한다. 확인 결과: `crews.status='archived'` 전이
  + **진행 중(open) 투표 취소** + **미래(date≥오늘) Meetup 취소** + **채팅 메시지 즉시 삭제**
  넷뿐이다. **`join_requests`·`invitations`는 건드리지 않는다** — 해산 직전의 대기 중 신청·
  초대가 그대로 `pending`으로 남는다는 뜻이고, 이게 아래 표의 여러 항목이 "이론이 아니라
  실제로 도달 가능하다"는 근거다.

## 진입점 표

범례 — **컨테이너**: 버튼/폼이 노출되는가(D-030 ① 표현 계층). **Action**: Server Action이
crew.status를 직접 판정하는가. **DB**: RLS·트리거·RPC가 강제하는가. **판정**: 세 갈래 중
하나 — `방어됨`(최소 한 층이 확실히 막고, 실패 시 문구도 정확함) / `(b) 문구만 부정확`(DB는
막지만 앱이 범용/오탐 문구로 보여줌, I-070과 동형) / `(안 막힘)`(어느 층도 막지 않아 실제로
mutation이 성공함, 데이터 정합성 문제).

| # | 축 | 진입점(파일) | 컨테이너 | Action | DB | 31일차 이전 판정 | 소유 | 31일차 조치 |
|---|---|---|---|---|---|---|---|---|
| 1 | 크루 정보 수정 | `update-crew-info.ts` | ~~없었음~~ | 없음 | 트리거(`crews_guard_archived_immutable`) | (b) 문구만 부정확 | CREW | **수정**(같은 31일차 I-070 1차 작업 — `CrewSettingsContainer`가 archived면 폼 자체를 안 그림) |
| 2 | 크루 공개범위 | `update-crew-visibility.ts` | 위와 동일 컨테이너 | 없음 | 트리거(동일) | (b) | CREW | 위와 동일하게 해소됨(1차 작업) |
| 3 | 크루 해산 | `disband-crew.ts` | 위와 동일 컨테이너 | 없음(RPC가 `already_disbanded` 반환) | RPC 내부 판정 | 방어됨(RPC가 이미 "이미 해산됨" 판정) | CREW | 폼 진입 자체가 1차 작업으로 막혀 도달 안 함(부수 효과) |
| 4 | 크루원 초대 | `invite-crew-member.ts` | `CrewMembersContainer`(초대 버튼) | 없었음 | RLS(`invitations_insert_staff_or_owner`의 `is_crew_active`) | (b) — DB는 막지만 "차단됨" 문구로 오분류 | CREW | **수정** — 컨테이너 버튼 숨김 + Action 조기 판정 + 정확한 문구(`crewArchived`) |
| 5 | 가입 신청 승인/반려 | `decide-join-request.ts` | `CrewMembersContainer`(`JoinRequestPanel`) | 없었음 → **수정** | RLS **미검사 → 수정**(`join_requests_guard_archived_crew_decision_31`) | **(안 막힘) — 진짜 결함이었음**: 승인하면 archived 크루에 실제로 active 멤버가 생겼다 | CREW | **전 계층 수정 완료**(앱 레이어 + SQL, 같은 회차 2차 조치 — 아래 "SQL 레벨 조치" 참고) |
| 6 | 가입 신청 제출 | `request-join-crew.ts` | `JoinRequestButton`(크루 홈) | 없었음(+ 실패 시 항상 `already_pending`으로 오분류) | RPC(`create_join_request`)가 `crew_status<>'active'`를 `forbidden`으로 이미 방어 | (b) 겸 **별개 버그**(사유 오분류는 archived와 무관하게도 발생) | CREW | **수정** — Action 조기 판정 + `created.error.code` 분기로 정확한 문구. 버튼 자체는 의도적으로 안 숨김(아래 "의도적으로 안 고친 것" 참고) |
| 7 | 가입 신청 철회 | `withdraw-join-request.ts` | `JoinRequestButton` | 없음 | self-service, 크루 상태 무관 | 방어됨(무해 판단) | CREW | 미수정(의도적, 아래 참고) |
| 8 | 초대 수락/거절 | `respond-to-invitation.ts` | `InvitationCard` | **있음**(`evaluateInvitationResponseEligibility`가 `crew.status!=='active'`→`crew_unavailable`) | 트리거 **미검사 → 수정**(`invitations_guard_archived_crew_acceptance_31`, 수락만 막고 거절은 허용) | ~~**방어됨** — 이미 올바른 모범 사례였다~~ → **정정: (b)였다, DB는 안 막고 있었다** — 아래 "31일차 후속 정정" 참고 | CREW | **SQL 수정 완료**(앱 레이어는 이미 정상이라 손대지 않음) |
| 9 | 강퇴 | `remove-crew-member.ts` | `CrewMembersContainer`(`MemberList` 행별 버튼) | 없었음 → **수정** | 트리거(`crew_memberships_guard_self_transition` "남의 행" 분기) **미검사 → 수정**(`crew_memberships_guard_archived_officer_actions_31`) | **(안 막힘) — 진짜 결함이었음**: archived 크루에서도 강퇴가 실제로 성공했다 | CREW | **전 계층 수정 완료**(앱 레이어 + SQL) |
| 10 | 임원 임명/해임 | `set-crew-member-role.ts` | 위와 동일 컨테이너 | 없었음 → **수정** | 위와 같은 트리거, 같은 분기 **미검사 → 수정**(같은 마이그레이션) | **(안 막힘) — 진짜 결함이었음** | CREW | **전 계층 수정 완료**(앱 레이어 + SQL) |
| 11 | 오너 이양 | `transfer-crew-ownership.ts` | 위와 동일 컨테이너 | 없었음 | 트리거(`crews_guard_archived_immutable`, `crews.owner_id` UPDATE도 이 트리거를 탄다) | (b) — I-070과 완전히 같은 트리거·같은 패턴 | CREW | **수정** — 컨테이너 버튼 숨김 + Action 조기 판정 |
| 12 | 크루 탈퇴 | `leave-crew.ts` | `MemberList`(본인 행) | 없음 | self-service, 크루 상태 무관 | 방어됨(무해 판단) | CREW | 미수정(의도적) |
| 13 | 게시글 작성 | `create-post.ts` | **있음**(`PostWriteContainer`, `crew.status!=='active'`→`RouteErrorBoundary`) | 없음 | RLS(`posts_insert_members`의 `is_crew_active`) | 방어됨(Task 040 기존 작업) | BOARD | 수정 불필요(내 도메인 아님, 확인만) |
| 14 | 게시글 수정 | `update-post.ts` | **없음**(`PostDetailContainer`의 `canEditTitleBody`가 role만 봄) | 없음 | RLS(`posts_update_author_or_staff_delete`) **미검사** | **(안 막힘)** — archived 크루의 옛 글도 수정 가능 | BOARD | **미수정, 보고만**(아래 "타 도메인 발견" 참고) |
| 15 | 게시글 삭제 | `delete-post.ts` | 위와 동일 컨테이너(`canDelete`) | 없음 | 위와 같은 UPDATE 정책(소프트 삭제) **미검사** | **(안 막힘)** | BOARD | **미수정, 보고만** |
| 16 | 댓글 작성 | `create-comment.ts` | **없음**(`CommentListContainer`의 `canComment`가 role만 봄) | 없음 | RLS(`comments_insert_members`의 `is_crew_active`)는 막지만, **데이터 계층 `createComment`가 `DataResult`가 아니라 원시 예외를 던짐**(`if (error) throw error`, 다른 쓰기들과 다른 패턴) | **(c) 후보** — DB는 막지만 앱이 그 실패를 도메인 오류로 감싸지 않는다 | BOARD | **미수정, 강조 보고**(아래 참고) |
| 17 | 댓글 수정/삭제 | `update-comment.ts`/`delete-comment.ts` | 없음 | 없음 | RLS **미검사**(UPDATE 정책에 `is_crew_active` 없음) | **(안 막힘)** | BOARD | **미수정, 보고만** |
| 18 | 채팅 메시지 전송 | `send-chat-message.ts` | **있음**(`MessageListContainer`의 `canSend = permission && crew.status==='active'`) | 없음 | RLS(`chat_messages_insert_members`의 `is_crew_active`) | **방어됨**(이중 방어, 모범 사례) | BOARD/DESIGN | 수정 불필요 |
| 19 | 채팅 메시지 삭제 | `delete-chat-message.ts` | 없음 | 없음 | RLS **미검사** | 이론상 (안 막힘)이지만 **`disband_crew`가 채팅 메시지를 즉시 전량 삭제**하므로 archived 크루에는 지울 메시지 자체가 안 남는다 — 실질적으로 도달 불가 | BOARD/DESIGN | 보고만(낮은 우선순위, 근거와 함께) |
| 20 | 일정(Meetup) 최초 제안 | `create-post.ts`(type=`meetup_proposal`) | `PostWriteContainer`(13번과 동일 경로) | 없음 | 동일 RLS | 방어됨 | BOARD | 수정 불필요 |
| 21 | 일정 변경 제안 | (`MeetupRescheduleContainer`) | **있음**(`crew.status!=='active'`→`RouteErrorBoundary`, `PostWriteContainer`와 같은 패턴 명시적으로 재사용) | — | — | 방어됨 | BOARD | 수정 불필요 |
| 22 | 일정 취소/응답 | `cancel-meetup.ts`/`respond-meetup-attendance.ts` | 없음(직접 crew.status 미검사) | 없음 | — | 이론상 미검사이지만 **`disband_crew`가 미래 Meetup을 이미 `cancelled`로 취소**하고, 과거 Meetup은 `isMeetupAttendanceOpen`(AC3)이 원래도 차단해 archived 여부와 무관하게 이미 닫혀 있다 | BOARD | 보고만(간접 방어로 충분해 보임, 근거와 함께) |
| 23 | 투표 생성 | `create-post.ts`(poll류) | `PostWriteContainer` | 없음 | 동일 RLS | 방어됨 | BOARD | 수정 불필요 |
| 24 | 투표 참여/조기종료/철회 | `cast-vote.ts`/`close-poll.ts`/`withdraw-poll.ts` | `PollPanelContainer`(poll.status 기반) | `poll.status!=='open'`으로 판정 | — | 직접 crew.status를 안 보지만 **`disband_crew`가 open 투표를 전량 `cancelled`로 취소**해 간접 방어 | BOARD | 보고만(간접 방어로 충분해 보임) |
| 25 | 관리자 지정/회수 | `grant-system-admin.ts`/`revoke-system-admin.ts` | — | — | — | **해당 없음** — `system_admin`은 크루 스코프가 아니라 전역 플래그라 특정 크루의 archived 여부와 무관 | CREW(042B) | 해당 없음 |
| 26 | 신고/차단 | `create-report.ts`/`create-block.ts` | — | — | — | **해당 없음(판단)** — 과거 콘텐츠 신고·사용자 차단은 크루가 archived든 아니든 유효한 행위라 D-030 ③ 대상이 아니다 | CREW(042A) | 해당 없음(의도적) |

## D-030 ③ 위반 판정 요약

- **`(안 막힘)`로 확정된 5건**(#5·#9·#10·#14·#15, #16·#17도 사실상 같은 부류) — **위반이었다.**
  DB가 막아 주지 않는 한 "UI가 안 열어도 된다"는 판단이 통하지 않는다는 것이 이번 감사의
  핵심 확인이다. 내 도메인(#5·#9·#10)은 앱 레이어 + **같은 회차 SQL 마이그레이션**으로 전
  계층을 막았다(아래 "SQL 레벨 조치" 참고 — 최초엔 "SQL 잔여"로 권고만 남겼으나 팀장 지시로
  같은 날 소진했다). BOARD 도메인(#14·#15·#16·#17)은 보고만 한다.
- **`(b) 문구만 부정확`로 확정된 4건**(#1·#2·#4·#6·#11, 정확히는 5건 — #1·#2는 같은
  컨테이너라 1차 작업에서 함께 해소) — **위반이다**(I-070과 동형). 전부 내 도메인이라 이번에
  해소했다.
- **`방어됨`**(#3·#8·#13·#18·#20·#21) — 위반 아님. #8(초대 응답)은 특히 이 프로젝트가 이미
  잘 하고 있던 사례로 눈에 띈다 — "액션이 crew.status를 직접 판정해 정확한 사유를 반환"하는
  정확한 본보기다.
- **간접 방어**(#19·#22·#24) — 직접 가드는 없지만 `disband_crew`의 부수 효과(채팅 삭제·미래
  Meetup 취소·open 투표 취소) 덕분에 실제로 도달하는 입력이 없다. **위반으로 보지 않지만
  취약하다** — `disband_crew`의 정리 로직이 바뀌면(예: 미래 Meetup 취소 조건이 바뀌거나) 조용히
  뚫릴 수 있는 암묵적 결합이다. 31일차에는 코드 주석으로만 남기고 고치지 않았으나, **32일차에
  결합 지점을 실제로 명시화했다**(아래 "결합 지점 명시화(32일차)" 절 참고 — `disband_crew`의
  세 부수 효과 블록에 결합 주석 추가, 로직 무변경).
- **해당 없음**: #25(크루 스코프 아님)·#26(archived와 무관하게 유효한 행위).

## 이번 회차에 고친 파일 (내 도메인만)

- `src/lib/actions/decide-join-request.ts` — archived 크루 판정 추가(`getCrewById` 신규 호출).
- `src/lib/actions/remove-crew-member.ts` — 동일.
- `src/lib/actions/set-crew-member-role.ts` — 동일.
- `src/lib/actions/invite-crew-member.ts` — archived 판정을 권한 판정 직후로 추가.
- `src/lib/actions/transfer-crew-ownership.ts` — 크루명 확인 직후에 archived 판정 추가.
- `src/lib/actions/request-join-crew.ts` — archived 판정 추가 + `createJoinRequest` 실패
  사유를 `already_pending` 고정값이 아니라 `created.error.code`로 분기하도록 수정(별개
  버그였던 것을 archived 조사 중 발견).
- `src/components/crews/CrewMembersContainer.tsx` — `canInvite`·`canApprove`(가입 신청
  패널 자체)·`canAppoint`·`canTransferOwnership`·행별 `canRemove`에 `crew.status==='active'`
  조건을 추가로 곱했다. 멤버 로스터(읽기)는 그대로 둔다.
- `src/components/crews/CrewHomeContainer.tsx` — 비소속 방문자(`CrewIntroPreview`) 분기에도
  `ArchivedCrewBanner`를 단다(기존에는 활성 멤버십 분기에만 있었다). "가입 신청" 버튼 자체는
  숨기지 않는다(아래 참고).
- `src/lib/strings/ko.ts` — 위 각 Action이 쓰는 `crewArchived`/`failed` 문구 7개 추가(기존
  `errors.*` 객체에 자연스럽게 추가, 새 최상위 구조 없음).

모두 `npx tsc --noEmit`·해당 파일 `eslint`·`npm test`(41 tests) 통과 확인. **브라우저 실측은
하지 않았다**(dev 서버 회수 시점) — 논리는 코드·타입 레벨로만 검증했다.

## 의도적으로 안 고친 것 (판단 근거)

- **"가입 신청"/"설정" 진입 버튼 자체를 숨기지 않는다.** `CrewHomeContainer`의 기존(30일차)
  결정문이 정확히 이 논리를 이미 세워 뒀다 — "숨기면 오너가 크루명이라도 다시 확인할 방법이
  없어진다, 배너로 알리는 것으로 충분하다"(활성 멤버십 분기의 "설정" 버튼). 이번에 비소속
  방문자 분기의 "가입 신청" 버튼에도 같은 논리를 그대로 적용했다 — 버튼을 눌러도 이제
  (`request-join-crew.ts` 수정 덕에) 정확한 사유로 안전하게 실패하므로, 애초에 못 누르게
  막는 것보다 "왜 실패하는지 정확히 알려주는" 쪽을 택했다. `CrewMembersContainer`의 개별
  쓰기 버튼(초대·승인·임명·이양·강퇴)은 이것과 다르다 — 그건 **목적지 페이지로 가는 링크가
  아니라 그 자리에서 바로 mutation을 트리거하는 버튼**이라(설정 폼의 "저장" 버튼과 같은
  종류) I-070에서 이미 정한 "쓰기 표면 자체를 막는다" 원칙을 그대로 적용했다.
- **탈퇴(`leave-crew`)·가입 신청 철회(`withdraw-join-request`)는 그대로 둔다.** 둘 다
  자기 자신만 대상으로 하는 self-service 행위이고, archived 크루에서도 "죽은 멤버십에서
  스스로 빠져나가는 것"은 해가 없다고 판단했다 — 오히려 막으면 이상하다(탈퇴하고 싶은데
  크루가 해산됐다고 탈퇴를 막을 이유가 없다).
- **`disband_crew`가 `join_requests`·`invitations`를 정리하지 않는 것 자체는 고치지 않는다.**
  아래 "SQL 레벨 조치"에서 가드(트리거·RLS)만 적용하고 정리 방식은 채택하지 않기로
  판단했다 — 근거는 그 절 참고. 이건 앱 레이어 범위를 넘어선다는 이유가 아니라(실제로
  마이그레이션까지 이번 회차에 적용했다), FR-013 해석이 필요한 별개 결정이라 보류한 것이다.

## SQL 레벨 조치 (팀장 지시로 같은 31일차에 소진 — 최초엔 "잔여"로 권고만 했었다)

1차 감사 시점엔 `crew_memberships_guard_self_transition`의 "남의 행" 분기(강퇴·임원
임명/해임)와 `join_requests_update_requester_or_staff` RLS(가입 신청 승인/반려)가
crew.status를 검사하지 않아 앱 레이어로만 막혀 있었다 — publishable key로 REST를 직접
PATCH하면 여전히 뚫리는 상태였다. 팀장이 "DB가 최종 방어선"(I-125 판정) 원칙에 따라 같은
회차에 마이그레이션으로 소진하라고 지시했고, 다음 2건을 적용했다:

1. `supabase/migrations/20260730071304_crew_memberships_guard_archived_officer_actions_31.sql`
   — `crew_memberships_guard_self_transition()`의 "남의 행" 분기 진입 직후에
   `if not private.is_crew_active(old.crew_id) then raise exception ...` 추가. 함수의 다른
   로직은 배포본을 `pg_get_functiondef`로 그대로 복사해 한 글자도 바꾸지 않았다(회귀 최소화).
2. `supabase/migrations/20260730071317_join_requests_guard_archived_crew_decision_31.sql` —
   `join_requests_update_requester_or_staff` 정책에 `alter policy`로
   `private.is_crew_active(crew_id)`를 `using`·`with_check` 양쪽에 추가.

둘 다 `posts_insert_members`·`comments_insert_members`·`invitations_insert_staff_or_owner`가
이미 쓰는 `private.is_crew_active` 함수를 그대로 재사용했다 — 새 함수·새 패턴 없음.

**요구사항 근거 자체 점검(팀장 지시, 위 FR-013 AC2 오독 사고 이후 — 마이그레이션 적용 후에야
했다는 점을 정직하게 남긴다)**: `requirements.md`를 다시 훑어 FR-013·FR-022·FR-023·FR-024·
FR-027과 2.4절 멤버십 상태 다이어그램 전문을 확인했다. **"archived 크루에서는 강퇴·임원
임명/해임·가입 승인을 할 수 없다"는 문장이 그대로 적힌 원문 줄은 없다** — FR-023(가입 신청
승인·반려)·FR-024(임원 임명·해임)·FR-027(강퇴) 어느 사전조건·예외 흐름에도 크루 상태
언급이 없다. **팀장이 후보로 제시한 FR-013 정상 흐름 ④(`archived` 전이)·⑥(진행 중 투표·
미래 Meetup 취소)도 확인했지만, 이 둘은 "해산 시점에 무엇이 일어나는가"만 적을 뿐 "그
이후 멤버십 변경이 금지된다"고 직접 말하지 않는다** — 팀장 본인이 미리 인정했듯 이건
후보일 뿐 직접 인용은 아니다. 대신 두 개의 다른 원문 조각을 찾아 근거를 세웠다:
- **가입 신청 승인 가드(마이그레이션 2)는 근거가 있다.** ① FR-022 사전조건 원문
  "**크루가 `public`, 신청자가 비멤버**"(571행) — 승인은 정확히 이 조건이 지키려는 것
  (비멤버가 멤버가 되는 것)을 만든다. ② 이 팀이 이미 같은 해석을 두 곳에서 코드로
  확정해 뒀다 — `create_join_request` RPC(Task 032/I-054, 내가 만들지 않았다)가 신청
  **제출** 시점에 `crew_status <> 'active'`를 이미 거부하고, 마이그레이션
  `20260729093252_major_fix_i102_...` 헤더 원문도 "private/archived 크루 **직접 가입 신청이
  가능했다**"고 archived를 명시적으로 결함 조건에 넣었다(I-102). 내 마이그레이션은 신청의
  다른 쪽 끝(오너의 **승인**)에 이미 있는 같은 해석을 적용한 것뿐이다 — 새 해석 발명이
  아니다.
- **강퇴·임원 임명/해임 가드(마이그레이션 1)도 근거를 찾았다 — 처음 보고 때보다 강해졌다.**
  FR-013 원문 "**설명**"란(518행)이 "크루를 **종료**하고 하위 데이터를 처리한다"고 적었고,
  이미 **해결됨으로 닫힌** I-066(19일차, 이번에 내가 판정한 게 아니라 팀이 이미 받아들인
  결정)의 "**영향**" 절이 정확히 이 단어를 근거로 "FR-013의 '**해산 = 종료**'라는 의도와
  어긋난다"고 판정해 게시글 작성 등을 SQL로 막았다 — **이건 내 일반화가 아니라 이미 팀이
  합의하고 적용까지 마친 해석의 인용이다.** 내가 이번에 실측으로 확인한 것("archived
  크루에서도 강퇴·임원 임명/해임이 실제로 성공한다")은 같은 "해산 = 종료" 원칙이 적용되지
  않은 **같은 종류의 잔여**다 — I-066이 "게시글 작성"에 적용한 논리를 "멤버십 관리 행위"에
  적용한 것뿐이다. 다만 이 연결이 명시적 AC 인용보다는 **원칙의 확장 적용**이라는 성격 차이는
  남아 있다는 것을 정직하게 적는다 — 아래 (2)도 참고.

**(2) 과거에 이 범위를 의도적으로 제외한 판정이 있는지 재확인(팀장 지시)** — 이전 보고에서
"19일차 제외 ①이 crews·crew_memberships 정책 전반을 이월했다"고 뭉뚱그렸는데, `grep`으로
I-066 원문("내용" 절, `docs/ISSUES.md` 1917행)을 다시 읽어 보니 **더 정확한 표현이 있다**:
I-066이 처음부터 명시한 증상은 "게시글 작성·채팅 발신·**크루 정보 수정**" 셋뿐이다 — 강퇴·
임원 임명/해임·가입 신청 승인은 **이월된 것이 아니라 애초에 I-066의 문제 정의 자체에
없었다**("이월"은 "검토했지만 미룬 것"이라는 뜻이라 정확한 표현이 아니다). 19일차 마이그레이션
헤더의 제외 ①("crews·crew_memberships 테이블 자체의 정책")도 문맥상
`crews_update_staff_or_owner`(크루 정보 수정) 하나를 가리키는 괄호 설명이었지, 멤버십
UPDATE(강퇴·임명)나 join_requests UPDATE(승인)를 검토 후 제외한다는 뜻이 아니었다. 즉 내
마이그레이션은 "닫힌 결정을 뒤집는 것"도 "이월된 항목을 집는 것"도 아니라 **I-066이 다루지
않은 완전히 새로운 구석**이다 — `docs/ISSUES.md`·`docs/prioritization-and-risks.md` 전체를
훑어도(`grep "강퇴\|임원 임명"` × `"archiv\|해산"` 교차) 이 정확한 조합(강퇴/임원임명 ×
archived)을 이미 다룬 다른 판정은 없었다.

**FR-024·FR-027 원문에 크루 상태 사전조건이 없다는 사실(팀장이 원문 대조로 확인, 숨기지
않는다)** — FR-024(임원 임명·해임)의 **사전조건 원문은 "대상이 `active` 크루원"**(600행)
이다. **"대상 멤버"의 상태를 말할 뿐 크루 자체의 상태는 아니다.** FR-027(강퇴)에는
사전조건 항목 자체가 없다(638행 이하 — 행위자·설명·정상 흐름·예외 흐름·수용 기준만 있고
사전조건 필드가 없다). 즉 **강퇴·임원 임명/해임 가드는 요구사항 원문이 요구해서 만든 게
아니다** — 위에서 인용한 FR-013 "종료" + I-066 "해산=종료" 판정을 이 잔여에 확장 적용한
**논리적 정합성 추론**이다. 가입 신청 승인 가드는 이와 다르게 이미 팀이 코드로 확정해 둔
해석(`create_join_request`·I-102)과의 **정합성**이 근거라 상대적으로 더 탄탄하다.

**31일차 사용자 결정**: 위 근거로 팀장이 사용자에게 확인한 결과 — **가드 2건 모두 유지,
롤백하지 않는다.** 이유: ① 19일차 헤더가 이 범위(멤버십 UPDATE·join_requests UPDATE)를
"기각"이 아니라 "애초에 다루지 않음"으로 남겨 뒀다(위 grep 재확인 참고) — 닫힌 결정을
뒤집는 게 아니다. ② 회귀 3/3 SUCCESS·차단 3/3 BLOCKED가 이미 확인됐고, 막는 방향이라 최악의
경우도 안전 쪽 실패다. ③ **다만 근거의 성격("원문 인용"이 아니라 "논리적 정합성 추론")을
문서에 명시한다** — 나중에 이 가드를 다시 보는 사람이 "요구사항에 있으니 당연하다"고
오해하지 않도록. 이 문단이 그 명시다. `docs/ISSUES.draft.CREW.md`에도 같은 취지로 번호 없이
등재했다(결함이 아니라 "근거의 성격을 기록해 두는 것" — 향후 FR-024·FR-027에 AC를 추가할지
검토할 근거).

**재검토 조건** — 아래 중 하나라도 실제로 발생하면 이 가드를 다시 봐야 한다:
① FR-024·FR-027이 개정되어 "대상 크루가 `active`여야 한다"는 사전조건·AC가 명시적으로
추가되면(그 시점엔 이 절의 "논리적 정합성 추론"이라는 표시를 "요구사항 근거 있음"으로
갱신해도 된다). ② `disband_crew`가 대기 중 `join_requests`·`invitations`를 정리하는 방향
(위 "가드 vs 정리"의 세 번째 후보)으로 별도 결정이 나면 — 가드와 정리가 중복인지, 정리만으로
충분해 가드를 완화해도 되는지 재검토해야 한다. ③ 운영·사용자 쪽에서 "해산된 크루도 오너가
사후 정리 작업(오분류 강퇴 복구, 임원 재배치 등)을 계속할 수 있어야 한다"는 요구가 명시적으로
나오면 — 지금 가드는 이걸 전면 차단하므로 예외 경로 설계가 필요해진다. 그 전까지는 이번 결정
("유지 + 논거 성격 명시")이 유효하다.

**가드 vs 정리, 판단**: 세 번째 후보("`disband_crew`가 대기 중 `join_requests`·`invitations`를
정리")는 채택하지 않았다. 가드(위 1·2)만으로 이미 완전한 SQL 강제 경계이고, 정리까지 하려면
"해산은 동결인가 정리인가"라는 FR-013 해석이 필요한 별개 결정이 되어 이 마이그레이션의
범위를 넘어선다고 판단했다 — 가드가 있으면 정리를 안 해도 위험이 없다(대기 중 신청이 영원히
결정되지 않는 상태로 남을 뿐, 데이터가 조용히 잘못될 경로는 없다).

**실측(전부 `begin`…`rollback`, 실 데이터에 흔적 없음)**: 스크래치 크루 1개(owner=fb70ff1c)를
만들어 임시 멤버 4명 + 가입 신청 2건으로 재현했다.
- **회귀(활성 크루, 3건) 전부 성공** — 가입 신청 승인·강퇴·임원 임명이 이전과 동일하게
  작동함을 확인(트리거·RLS 수정이 정상 크루 동작을 하나도 바꾸지 않았다).
- **위반 재현(archived 크루, 3건) 전부 차단** — 가입 승인은 RLS가 조용히 0행으로 막았고,
  강퇴·임원 해임은 새 트리거 예외(`archived crews cannot have membership role or status
  changed by officers (FR-013)`)로 명시적으로 막혔다. 차단 시도 후 대상 행 상태를 재조회해
  부분 반영이 없었음도 확인했다(X3은 여전히 `active`, X2는 여전히 `staff`).
- `get_advisors(security)` 신규 WARN 0건(기존 `auth_leaked_password_protection` 1건만 유지).
- 트랜잭션 롤백 후 `crews=14`(archived 1)·`profiles=21`로 회차 시작 기준과 동일함을
  재확인했다 — 스크래치 크루·임시 멤버·가입 신청 잔존물 없음. 두 픽스처 크루(`2724533e-…`
  archived, `729ced18-…` active)도 이름·상태·공개범위 불변.
- 로컬 마이그레이션 파일을 원격 버전(`20260730071304`·`20260730071317`)에 맞춰
  `supabase/migrations/`에 남겼다(I-051 재발 방지).

상세 SQL·이슈 등재는 `docs/ISSUES.draft.CREW.md`(번호 없음, 첫 번째 항목).

## 31일차 후속 — 표 #8(초대 수락) 정정: CORE가 발견, 내가 놓친 이유

CORE가 내 마이그레이션 2건을 검증하다 같은 클래스의 결함을 하나 더 찾았다 — **초대 수락으로
archived 크루에 새 active 멤버가 생긴다**(`begin`…`rollback`으로 실측 재현). 원인은 내가 이미
표에 적어 뒀던 것과 같은 모양이다: `invitations_update_invitee_or_staff` RLS와
`invitations_guard_response_transition` 트리거 둘 다 crew.status를 검사하지 않고,
`invitations_sync_membership_on_response`(AFTER UPDATE)가 수락 시 `crew_memberships`를
직접 UPDATE하는 것은 `crew_memberships_guard_self_transition` 입장에서 **중첩 호출**
(`pg_trigger_depth()>1`)이라 31일차에 넣은 archived 가드를 포함해 그 함수 전체를 건너뛴다.

**내가 왜 이걸 "방어됨"으로 잘못 결론지었는지**: 1차 감사 표를 다시 보면 나는 이미 DB 열에
"트리거(응답 자체는 발신자 대상, 크루 상태 미검사)"라고 **정확히 적어 뒀다.** 그런데도
"방어됨"으로 결론 낸 건, `#5·#9·#10`(가입 승인·강퇴·임원 임명)에는 일관되게 적용한 "DB가
막지 않으면 안 막힘"이라는 내 기준을 이 행에서만 느슨하게 적용했기 때문이다 — 앱 레이어
(`evaluateInvitationResponseEligibility`)가 있다는 것에 안심해서 SQL 열의 내용을 결론까지
끌고 가지 않았다. **같은 감사 안에서 같은 축(DB 최종 방어선)을 행마다 다르게 적용한 것이
이번 실수의 정확한 원인**이다.

**CORE의 보고 중 한 가지는 부정확했다 — 확인하고 정정한다.** CORE는 "앱 레이어도 안 막는다
— `respond-to-invitation.ts`에 crew.status 확인이 전혀 없다"고 적었는데, 코드를 직접 다시
읽고 SQL로 재현해 확인한 결과 **이 부분은 사실이 아니다**:
- `respond-to-invitation.ts`는 `evaluateInvitationResponseEligibility({invitation, crew,
  nowIso})`를 호출하고, 그 함수는 `if (!crew || crew.status !== "active") return {eligible:
  false, reason: "crew_unavailable"}`를 이미 갖고 있다(수정 없이 그대로).
- 이 픽스처 크루(`2724533e-…`, `visibility='public'`)로 직접 검증했다 — 비소속 사용자
  컨텍스트로 `select * from crews where id=...`를 실행해도 `status='archived'`가 정확히
  보인다(RLS `crews_select_authenticated`의 `visibility='public'` 절이 멤버십과 무관하게
  통과시킨다). 즉 `getCrewById`가 이 크루에 대해 **진짜 상태**를 돌려주므로,
  `evaluateInvitationResponseEligibility`가 이 시나리오에서 정확히 작동한다.
- CORE의 테스트는 `begin`…`rollback` **SQL 테스트**였다 — 정의상 TypeScript 앱 코드를 전혀
  실행하지 않는다. "SQL이 안 막는다"는 것은 그 테스트로 확인할 수 있지만, "앱 레이어에
  확인이 없다"는 것은 코드를 읽어야 알 수 있는 것이라 SQL 테스트만으로는 세울 수 없는
  결론이었다.
- **그래서 앱 레이어(`respond-to-invitation.ts`)는 손대지 않았다** — 이미 있는 것을
  중복으로 다시 넣는 것은 "재사용, 새 패턴 발명 금지" 원칙에 오히려 어긋난다.

**다만 이 사실 확인에는 한계가 있다** — 위 검증은 `visibility='public'`인 우리 픽스처
크루에서만 확인했다. `crews_select_authenticated` RLS는 `visibility='public' OR owner_id=
auth.uid() OR (활성 멤버)`인데, 초대받은 사람(`crew_memberships.status='invited'`)은 이
셋 중 어디에도 해당하지 않는다 — **만약 크루가 `private`이면** `getCrewById`의 direct
select가 0행이 되어 `crew_directory_summary` RPC 폴백을 타는데, 그 폴백은
`src/lib/data/supabase/crew.ts`의 최근 불변식 주석이 이미 경고했듯 **`status`를 항상
"active"로 고정 반환한다.** 즉 **private + archived 크루에 대한 초대 수락은 앱 레이어에서도
조용히 통과할 가능성이 있다** — 이번엔 확인하지 못했다(픽스처가 public이라 재현 불가,
`crew.ts`는 내 소유 파일이 아니라 조율 없이 고치지 않았다). 이번 SQL 마이그레이션은
public·private 여부와 무관하게 DB 레벨에서 이 경로를 막으므로 **데이터는 안전하다** — 다만
private 크루에서는 사용자가 "수락됐다"는 화면을 잠깐 보고 실제로는 막힌 상태(다음
새로고침에서 발견)일 수 있다는 잔여 UX 리스크를 여기 남긴다.

**SQL 수정**: `supabase/migrations/20260730074232_invitations_guard_archived_crew_
acceptance_31.sql` — `invitations_guard_response_transition` 트리거에 "accepted로 가는
전이일 때만" `private.is_crew_active(new.crew_id)` 검사를 추가했다. `crew_memberships_
guard_self_transition`은 팀장 지시대로 건드리지 않았다(중첩 호출 스킵은 의도된 설계).
**거절(declined)은 archived 크루에서도 그대로 허용한다** — 죽은 크루의 초대를 스스로
정리하는 self-service라 무해하다는, 이번 회차에 반복된 판단(`leave-crew`·
`withdraw-join-request`와 같은 원칙)을 그대로 적용했다.

**실측(`begin`…`rollback`)**: 스크래치 크루 1개 + 초대 3건으로 재현.
- 회귀(활성 크루, 1건) SUCCESS — 수락이 이전과 동일하게 작동.
- 위반 재현(archived 크루) BLOCKED — 새 트리거 예외
  (`invitations: cannot accept an invitation to an archived crew (FR-013)`)로 막혔고,
  대상자의 `crew_memberships`가 여전히 `invited`(active로 승격되지 않음), `invitations`도
  여전히 `pending`(부분 반영 없음) 확인.
- 거절 허용(archived 크루) SUCCESS — 설계대로 통과, `invitations.status='declined'` 확인.
- `get_advisors(security)` 신규 WARN 0건. 롤백 후 `crews=14`(archived 1)·`profiles=21` 재확인,
  잔존물 없음. 두 픽스처 크루 불변.

## 타 도메인 발견 (BOARD 소유, 수정하지 않음)

- **게시글·댓글 수정/삭제가 archived 크루에서도 그대로 성공한다**(#14·#15·#17). ~~FR-013 AC2
  "기존 게시글은 열람 전용으로 남는다"는 요구사항 원문과 직접 충돌한다~~ — 이번 감사에서
  발견한 것 중 **가장 severity가 높은 항목**일 수 있다(내 도메인의 강퇴·임원 임명 결함보다
  파급이 크다 — 과거 기록의 무결성 자체가 걸려 있다).
  > **정정(같은 31일차, 팀장이 BOARD의 반증을 받아 지적)** — 위 취소선 문장은 원문 오독이다.
  > `requirements.md` 527행 FR-013 AC2 원문은 "Given 해산된 크루, When 크루원이 **캘린더
  > 조회**, Then 해당 크루의 **미래 Meetup 바**가 사라지고 **과거** 항목은 열람 전용으로
  > 남는다"이며, **Given/When 절 전체가 캘린더·Meetup 조회에 관한 것이고 "게시글"은 이 AC
  > 어디에도 없다.** 게다가 posts·comments UPDATE에 `is_crew_active` 조건이 없는 것은
  > 결함이 아니라 19일차 마이그레이션(`20260725094141_crews_block_writes_in_archived_crew_
  > i066.sql`) 헤더가 제외 ②로 이미 명시 판정한 것이었다("I-066 원문의 핵심 증상은 '새로
  > 쓴다'이지 '기존 걸 고친다'가 아니다. 편집·모더레이션 차단까지 넣으면 '과잉' 위험이 있어
  > 이번엔 INSERT만 좁힌다") — I-066은 해결됨으로 닫혔고 20일차 각주가 재확인했다. **31일차
  > 사용자 결정으로 "19일차 유지"가 확정돼 BOARD는 이 축의 마이그레이션을 적용하지 않는다.**
  > **발견 자체(정책 비대칭)는 유효하다** — 다만 그 비대칭이 결함이 아니라 의도였다는 것,
  > 그리고 그 근거로 든 요구사항 조항이 틀렸다는 것이 정정 대상이다. "가장 severity가 높은
  > 항목"이라는 내 판단도 이 정정으로 철회한다.
- **댓글 작성(`create-comment.ts`)이 원시 예외를 던진다** — `createComment`(데이터 계층)가
  다른 쓰기 함수들과 달리 `DataResult`를 반환하지 않고 `if (error) throw error`를 쓴다. RLS는
  이미 archived를 막고 있으므로(INSERT 쪽은 `is_crew_active` 있음) 이 경로가 실제로
  탄다 — 즉 archived 크루의 게시글에 댓글을 달려고 하면 도메인 오류가 아니라 **처리되지
  않은 예외**가 올라갈 가능성이 높다(세 갈래 중 (c) 후보). `createCommentAction`의 호출
  방식(`useActionState` FormState 패턴이 아니라 직접 호출)을 보지 못해 클라이언트가 이
  예외를 어떻게 받는지까지는 확인하지 못했다 — 브라우저 실측이 필요하다.
- 근거는 전부 위 표에 파일·정책·트리거 이름으로 남겼다 — BOARD가 재확인 없이 바로 사용할
  수 있게 했다.

## 결합 지점 명시화(32일차, 축 ② — 간접 방어 3건)

위 "간접 방어"(#19·#22·#24)로 분류한 3건은 `disband_crew`의 부수 효과에 암묵적으로 결합돼
있을 뿐, 그 결합이 코드 어디에도 명시돼 있지 않았다(이 문서에만 서술) — "`disband_crew`의
정리 로직이 바뀌면(예: 미래 Meetup 취소 조건이 바뀌거나) 조용히 뚫릴 수 있는 암묵적 결합"이라고
남긴 리스크를 32일차에 실제로 명시화했다.

**행별 결합 지점(정확한 코드 지점까지 특정)**:

| # | 항목 | `disband_crew`의 결합 지점(정확한 SQL) | 소비자 가드(BOARD 도메인) |
| --- | --- | --- | --- |
| 24 | 투표 참여/조기종료/철회 | `update public.polls ... where ... and p.status = 'open'` (private.disband_crew, "FR-013 AC1" 블록) | `cast-vote.ts`·`close-poll.ts`·`withdraw-poll.ts`의 `poll.status !== 'open'` |
| 22 | 일정 취소/응답 | `update public.meetups set status='cancelled' where crew_id=... and status='confirmed' and date >= current_date` (private.disband_crew, "FR-013 AC2" 블록) | `isMeetupAttendanceOpen`(`src/lib/rules/meetup-attendance-eligibility.ts`)의 `status === 'confirmed' && date >= todayIso` — **조건이 정확히 대칭**(부정 관계) |
| 19 | 채팅 메시지 삭제 | `delete from public.chat_messages where room_id in (select id from chat_rooms where crew_id=...)` (private.disband_crew, "D-009 후반" 블록, 전량 하드 삭제) | `delete-chat-message.ts`의 `!message`(대상 없음) 분기 — `getMessageById`가 0행을 반환 |

**명시화 수단 판단 — 코드 주석을 택했다(테스트·DB 제약 대신)**:

- **테스트를 배제한 이유**: `npm test`(vitest)의 자동 테스트 범위는 CLAUDE.md가 명시한 대로
  `quorum.ts`·`poll-decision.ts`·`poll-eligibility.ts` 3개 순수 함수 모듈뿐이다(D-052→D-072).
  Server Action·데이터 접근 계층·RPC 호출은 **전면적으로 자동 테스트가 없는 상태**(R-002 부분
  완화)이고, 이 결합 하나만을 위해 그 범위를 넓히는 것은 별도의 테스트 인프라 결정이지 이번
  UX 감사(간접 방어 3건 명시화) 배정의 범위를 넘어선다.
- **DB 제약을 배제한 이유**: CHECK 제약은 "다른 함수(BOARD 도메인 TS 코드)의 조건이 이 UPDATE의
  조건과 일치해야 한다"는 **교차 함수·교차 계층 결합**을 표현할 수 있는 도구가 아니다 — CHECK은
  한 행의 정적 값 제약이지, "이 SQL 조건이 저 TS 조건과 대칭이어야 한다"는 동작 간 합치 제약이
  아니다.
- **코드 주석을 택한 이유**: ① 결합의 생산자 쪽(`private.disband_crew`)은 CREW 소유라 직접
  갱신할 수 있다. ② 소비자 쪽(`cast-vote.ts`·`close-poll.ts`·`withdraw-poll.ts`·
  `cancel-meetup.ts`·`respond-meetup-attendance.ts`·`delete-chat-message.ts`)은 전부 BOARD
  도메인이라 이번 회차에 직접 수정하지 않는다(위 "타 도메인 발견"과 같은 경계 — 조율 없이
  고치지 않는다). ③ 이 프로젝트는 이미 트리거·RPC 본문 안에 FR 근거 주석을 다는 관례가
  확립돼 있다(`pg_get_functiondef`로 배포본을 읽으면 그대로 보인다) — 새 패턴이 아니라 기존
  관례의 연장이다.

**적용**: `supabase/migrations/20260730090512_disband_crew_annotate_indirect_defense_
coupling_32.sql` — `private.disband_crew`의 세 부수 효과 블록(FR-013 AC1 투표 취소·FR-013 AC2
Meetup 취소·D-009 채팅 파기) 각각에 위 표와 같은 내용의 결합 주석을 추가했다. 로직은 한 글자도
바꾸지 않았다(`pg_get_functiondef` 배포본을 그대로 복사 후 주석 3줄만 삽입).

**실측(`begin`…`rollback`, 스크래치 크루, 마이그레이션 적용 전·후 2회)**: 임시 크루에 open
투표 1건·미래 confirmed Meetup 1건(오늘+7일)·채팅 메시지 1건을 심고 오너로 `disband_crew`를
호출 — **적용 전**: `cancelled_polls=1`·`cancelled_meetups=1`·`purged_messages=1`,
`poll.status: open→cancelled`·`meetup.status: confirmed→cancelled`·`chat_messages: 1건→0건`
(대상 메시지 자체가 사라짐, `delete-chat-message.ts`가 타는 것과 같은 "대상 없음" 상태).
**적용 후(마이그레이션 검증)**: 동일 시나리오 재실행 — 결과 완전히 동일
(`ok=true`·`cancelled_polls=1`·`cancelled_meetups=1`·`purged_messages=1`·
`poll_status_after=cancelled`·`meetup_status_after=cancelled`·`chat_count_after=0`) — 주석
추가가 로직을 바꾸지 않았음을 재확인. `get_advisors(security)` 신규 WARN 0건(기존
`auth_leaked_password_protection` 1건만 유지). 롤백 후 `crews=14`(archived 1) 재확인,
스크래치 크루 잔존물 0건. 두 픽스처 크루(`729ced18-…` active·`2724533e-…` archived) 이름·
상태·공개범위 불변 확인.

**남은 취약점(의도적으로 고치지 않음)**: 이 주석은 **다음 편집자가 읽는다는 전제**로만
작동한다 — `disband_crew`의 세 조건을 실제로 바꾸는 편집이 일어나도 컴파일도 테스트도 실패하지
않는다. 위에서 테스트·DB 제약을 배제한 근거가 그대로 이 잔여 리스크의 근거이기도 하다. 재검토
조건: BOARD 도메인의 poll·meetup·chat 액션이 자동 테스트 대상으로 편입되거나(vitest 범위 확장
결정 발생 시), `disband_crew`가 다시 수정될 때 이 주석을 먼저 읽을 것.
