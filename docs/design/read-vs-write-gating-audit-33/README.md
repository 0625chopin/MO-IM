# 읽기/쓰기 게이팅 전수 훑기 (33일차, CREW) — I-152와 같은 결함 클래스가 다른 화면에도 있는가

## 배경

I-152 처분 중 발견한 핵심 문장: **"'누가 신청했는가'는 결정 가능 여부와 무관하게 사실이다."**
31일차(CREW 자신)가 `CrewMembersContainer`에서 "로스터(읽기)는 archived에서도 의미 있다"고
판단해 놓고, 바로 옆의 가입 신청 목록(그 자체도 읽기다)은 같은 논리를 적용하지 않고
`canApprove`(쓰기 권한 판정) 뒤에 함께 숨겼다 — 이것이 결함이었다.

팀장 지시: 정의된 결함 클래스 — **`X && isActive`/`X && crew?.status === "active"` 형태의
단일 플래그가 열람과 조작을 동시에 게이팅해, 그 플래그가 false일 때 조작 UI뿐 아니라 정보
자체도 사라지는 자리** — 가 다른 화면에도 있는지 **코드 정적 분석으로만**(브라우저 미점유)
전수 훑는다.

## 방법 — 후보를 어떻게 셌는가

`src/components/**`·`src/app/**`에서 아래 두 grep으로 후보를 모았다:

```
grep -rn "isActive\b" src/components src/app --include="*.tsx" --include="*.ts"   # isActiveMembership(...) 호출은 제외
grep -rn 'status === "active"\|crew?.status\|crew\.status' src/components src/app --include="*.tsx" --include="*.ts"
grep -rn "const can[A-Z][a-zA-Z]* =" src/components src/app --include="*.tsx" --include="*.ts"
```

세 grep의 결과를 합쳐 **파일·변수 단위로 중복 제거**한 뒤, "크루 archived 상태(또는 유사한
활성/비활성 상태)와 결합해 무언가를 조건부 렌더링하는 지점"만 후보로 추렸다(주석 전용 라인,
문자열 리터럴, 순수 타입 선언은 제외). **후보 13건**을 얻었다 — 컨테이너 단위로 그룹화한 개수다
(한 컨테이너 안에 여러 개별 플래그가 있어도 같은 판정 근거를 공유하면 한 행으로 묶었다).

## 판정 — 두 질문

각 후보에 (a) 이 플래그가 false일 때 **사라지는 것이 조작 UI뿐인가, 정보도 함께인가?**
(b) 정보도 사라진다면 그 정보는 **archived 크루에서도 사실로서 의미가 있는가?**를 물었다.
(b)가 예이면 I-152와 같은 결함이다.

| # | 위치 | 플래그 | (a) 정보도 사라지는가 | (b) 그 정보가 archived에서도 사실인가 | 판정 |
|---|---|---|---|---|---|
| 1 | `CrewMembersContainer` | `canInvite` (`&& isActive`) | 아니오 — `InviteMemberDialog` 트리거 버튼만 감춘다. 로스터는 무관하게 항상 렌더 | — | **결함 아님** |
| 2 | `CrewMembersContainer` | `canViewJoinRequests`/`canDecideJoinRequests` (구 `canApprove`) | **예 — 원래 목록 자체가 사라졌었다** | **예 — "누가 신청했는가"는 결정 가능 여부와 무관한 사실** | **I-152, 이번 회차에 이미 수정함**(열람/결정 분리) |
| 3 | `CrewMembersContainer` | `canAppoint` (`&& isActive`, 행별) | 아니오 — "임원 임명" 버튼만 감춘다. `MemberList`의 해당 행(이름·역할·아바타)은 무관하게 항상 렌더 | — | **결함 아님** |
| 4 | `CrewMembersContainer` | `canTransferOwnership` (`&& isActive`, 행별) | 아니오 — "오너로 임명" 버튼만 | — | **결함 아님** |
| 5 | `CrewMembersContainer` | `canRemove` (`&& isActive`, 행별) | 아니오 — "강퇴" 버튼만 | — | **결함 아님** |
| 6 | `BoardListContainer` (**팀장 지정 확인 대상**) | `canWrite` (`&& crew?.status === "active"`) | 아니오 — `listPostsByPage`는 `canWrite`와 무관하게 항상 실행되고, `BoardList.tsx`가 `canWrite`로 감싸는 것은 "새 글쓰기" 버튼 2곳(목록 헤더·빈 상태 CTA)뿐이다(코드 확인, `BoardList.tsx:43`·`63`) | — | **결함 아님 — 게시글 목록(읽기)은 완전히 독립적이다** |
| 7 | `MessageListContainer` | `canSend` (`&& crew?.status === "active"`) | 아니오 — `listMessages`는 `canSend`보다 먼저, 무관하게 실행된다. `canSend`는 입력창(Composer) 렌더 여부에만 쓰인다(모듈 docstring 65~69행이 이미 이 구분을 명시) | — | **결함 아님** |
| 8 | `PostWriteContainer`(`/board/new`) | 컨테이너 전체 `crew?.status !== "active"` → `RouteErrorBoundary` | 예 — 화면 전체가 사라진다 | **아니오 — 이 라우트에는 애초에 읽기 콘텐츠가 없다**(순수 쓰기 폼 하나뿐, 19일차 결정의 원래 대상) | **결함 아님 — 19일차 원칙이 정확히 적용된 자리** |
| 9 | `CrewSettingsContainer`(`/settings`) | 컨테이너 전체 `crew.status !== "active"` → `RouteErrorBoundary` | 예 — 화면 전체가 사라진다 | **아니오 — 전수 확인 결과 `CrewInfoForm`·`CrewVisibilityForm`·`DisbandCrewForm` 셋 다 순수 쓰기 폼**(I-152 처분 중 이미 재확인) | **결함 아님 — 19일차 원칙이 정확히 적용된 자리** |
| 10 | `MeetupRescheduleContainer`(`/meetups/[id]/reschedule`) | 컨테이너 전체 `crew.status !== "active"` → `RouteErrorBoundary` | 예 — 화면 전체가 사라진다 | **아니오 — `MeetupRescheduleForm` 하나뿐인 순수 쓰기 폼**(기존 일정 정보는 이 라우트가 아니라 `MeetupDetailContainer`가 보여준다, 그쪽은 이 플래그 자체가 없다) | **결함 아님** |
| 11 | `PollPanelContainer` | `canVote` (`votePermission.allowed && isActiveMember && isInSnapshot`, 다른 축 — 크루 archived 아니라 **멤버십** active) | 아니오 — `viewModel`의 `tally`·`quorum`·`status`·`showDetailedTally` 등은 `canVote`와 무관하게 항상 계산·전달된다. `canVote`는 `viewer.canVote`(투표 버튼 활성화 여부)에만 쓰인다 | — | **결함 아님**(축이 다르지만 같은 방식으로 확인함) |
| 12 | `CrewHomeContainer` | `canManageSettings` (`crew:update_info` 판정, archived와 무관) | 아니오 — "크루 설정" 링크 버튼만. 크루명·소개·카테고리·멤버 수는 무관하게 항상 렌더 | — | **결함 아님** |
| 13 | `AccountSettingsContainer` | `ownedActiveCrews` (`crew.status === "active"`로 필터) | 예 — archived 소유 크루는 이 목록에서 빠진다 | **아니오 — 이 목록의 용도 자체가 "탈퇴를 막는 활성 오너십"이고(FR-005 AC1), archived 크루 오너십은 탈퇴를 막지 않으므로 여기 나올 필요가 없는 사실이다.** I-152의 "결정 가능 여부와 무관한 사실"과 다르다 — 여기는 "이 결정(탈퇴 가능 여부)에 영향을 주는가"가 애초의 판단축이고 archived는 실제로 영향을 안 준다 | **결함 아님(다른 판단축)** |

## `BoardListContainer` 확인 결과 (팀장 지정 대상)

31일차 CREW 주석·33일차 내 `CrewMembersContainer` docstring이 "`BoardListContainer`의
`canWrite = permission && crew?.status === "active"` 패턴과 같다"를 근거로 인용했다 — 이번에
그 근거 자체를 검증했다. `BoardListContainer.tsx:55`의 `listPostsByPage(board.id, { page })`는
`canWrite` 계산과 **완전히 독립된 코드 경로**이고, `canWrite`는 함수 반환값의 한 필드로 아래로
흘러가 `BoardList.tsx`의 두 지점(빈 상태 CTA·목록 헤더 버튼)에서만 소비된다 — 게시글 자체
(`posts`, `totalCount`, 페이지네이션)는 이 플래그와 무관하게 항상 렌더된다. **인용이 정확했다** —
새로 발견된 결함 없음.

## 결론

- **후보 13건, 결함 1건**(I-152, `CrewMembersContainer`의 가입 신청 열람/결정 미분리) —
  **이미 이번 회차 앞 배정에서 수정 완료**했고 새로 발견된 추가 결함은 **0건**이다.
- 결함이 반복되지 않은 이유는 대체로 두 갈래다: ① 대부분의 `X && isActive` 조합은 애초에
  "행/카드 자체"가 아니라 "그 옆의 조작 버튼 하나"만 감싸도록 설계돼 있었다(6~7·3~5·12번) ②
  전체 화면을 막는 자리(8~10번)는 그 화면에 애초에 읽기 콘텐츠가 없는 순수 쓰기 라우트라
  19일차 원칙의 정확한 적용 대상이었다(이번에 `CrewSettingsContainer`를 I-152에서, 이번
  훑기에서 나머지 둘을 재확인).
- 13번(`AccountSettingsContainer`)은 겉보기엔 "archived 정보가 목록에서 빠진다"는 점에서
  비슷해 보이지만, I-152의 원칙("결정 가능 여부와 무관한 사실은 숨기지 않는다")이 적용되는
  자리가 아니다 — 그 목록의 존재 이유 자체가 "이 결정(탈퇴)에 영향을 주는 사실만 보여주는 것"
  이고, archived 오너십은 실제로 그 결정에 영향을 주지 않기 때문이다. 결함 클래스의 조건 (b)를
  "정보가 일반적으로 사실인가"가 아니라 "그 화면의 목적에 비추어 봐도 사실인가"로 정확히 물어야
  이런 오탐을 피할 수 있다는 것이 이번 훑기의 방법론적 부산물이다.

## 지킨 것

- 브라우저 미점유 — 전부 코드 정적 분석(grep + 직접 읽기)으로 판정했다.
- 새 이슈·결정 없음(추가 결함 0건이라 draft에 새로 쓸 것이 없다).
- `npx tsc --noEmit`·`npm run lint`·`npm test` — 이번 훑기는 코드를 변경하지 않았으므로 재실행
  불필요(직전 I-152 수정 커밋 시점 기준 전부 clean).

---

## 부록 — I-124 "4개 액션의 버튼 도달성" 판별 (33일차, CREW, 팀장 추가 배정)

DESIGN이 `display-layer-audit-33`에서 I-124(순위 2)를 코드 추적하다 남긴 질문: *"일반 크루원
세션으로 이 4개 액션을 UI 버튼으로 실제 트리거할 수 있는지부터가 불확실하다."* 이 절이 그
판별이다. **위 본문의 게이팅 감사(특히 후보 3~5, `CrewMembersContainer`의 `canAppoint`·
`canTransferOwnership`·`canRemove`)를 재사용했고, 새로 훑지 않았다.**

### 대상 4개 액션 (I-124, 26일차 CREW가 raw throw → `err("forbidden", …)`로 감싼 것들)

`setCrewMembershipRole`·`updateCrewMembershipStatus`(`crew.ts`) · `updateComment`(`comment.ts`)
· `cancelMeetup`(`meetup.ts`).

### 판별 방법 — "버튼이 뜨는가"에서 한 걸음 더

단순히 "버튼이 렌더되는가"만 보면 오판한다. **버튼이 뜨는 정상 세션이 있어도, 그 버튼의
정상 클릭 경로로 트리거의 raw exception 조건에 실제로 도달할 수 있는지**까지 봐야 한다 —
그래서 각 액션마다 (i) 어떤 role이 버튼을 보는가, (ii) 트리거가 정확히 무엇을 막는가
(`pg_get_functiondef`로 직접 확인), (iii) 그 Server Action이 **쓰기 직전에 대상 상태를 새로
재조회하는 방어(TOCTOU 재확인)를 이미 갖고 있는가**를 순서대로 확인했다.

### 판정

| 액션 | (i) 버튼을 보는 역할 | (ii) 트리거가 막는 조건(`pg_get_functiondef` 확인) | (iii) Server Action의 쓰기 직전 재검증 | 판정 |
| --- | --- | --- | --- | --- |
| `setCrewMembershipRole` | **오너만**(`crew:appoint_staff`: crew_member·crew_staff 전부 deny). 일반 크루원은 버튼 자체가 없다. `MemberList`가 오너 자신의 행도 이미 제외(`canAppoint && role !== "owner"`) | `crew_memberships_guard_self_transition`: "target must be an active member to change role"·"only the crew owner may appoint or dismiss staff"·"invalid target role" 등 | `set-crew-member-role.ts:75` — `setCrewMemberRoleAction`이 쓰기 직전 `getCrewMembership(crewId, targetProfileId)`를 **새로 조회**해 `isActiveMembership`·`role==='owner'`를 재확인하고, 걸리면 `targetInactive`/`targetIsOwner` 친절한 문구로 끝낸다(트리거 도달 전 차단) | **REST 우회로만 도달** — 정상 클릭(오너가 로스터를 보고 임명 버튼을 누르는 경로)은 이 재검증에 먼저 걸린다 |
| `updateCrewMembershipStatus`(강퇴/강퇴해제 경로 — 자진 탈퇴 경로는 트리거상 이 가드에 안 걸림, 아래 참고) | **오너·임원**(`crew:remove_member`: crew_staff는 대상이 member일 때만 conditional). 일반 크루원은 남을 강퇴하는 버튼이 없다(본인 탈퇴는 다른 액션·다른 가드) | 같은 트리거의 "남의 행" 분기: "only active members can be removed"·"staff may only remove general members"·"only the crew owner may reinstate" | `remove-crew-member.ts:58-63` — `removeCrewMemberAction`이 쓰기 직전 `getCrewMembership(crewId, targetProfileId)`로 **대상의 현재 상태·role을 새로 조회**해 `checkPermission`에 그 값을 넣는다 — 렌더 시점의 stale 값이 아니라 제출 시점 값으로 재판정 | **REST 우회로만 도달** — 같은 이유 |
| `updateComment` | **작성자 본인**(`comment:update_own`은 `OWN_SCOPED_ACTIONS`라 `isSelf`를 트리거와 동일하게 요구). 댓글 작성자는 절대 바뀌지 않는 불변값이라 "렌더 시점엔 본인이었는데 제출 시점엔 아니게" 되는 경우 자체가 없다 | `comments_guard_non_author_delete_only`: "본문 수정은 작성자만" | `update-comment.ts:28-38` — `getCommentById`로 새로 조회해 `isSelf`를 매 요청마다 다시 계산(애초에 바뀔 수 없는 값이지만 이중 확인) | **REST 우회로만 도달** — 작성자 불변성 때문에 재검증조차 필요 없을 정도로 안전 |
| `cancelMeetup` | **임원·오너·제안자 본인**(`meetup:cancel_or_update`, 일반 크루원은 `isProposalAuthor`일 때만 conditional) | `trg_meetups_guard_attendee_scope`: "임원·오너·제안자만 status 변경 가능" | `cancel-meetup.ts:54-71` — `getMeetupById`+`getPostById`로 새로 조회해 `isProposalAuthor`·role을 제출 시점 값으로 재계산 | **REST 우회로만 도달** — 같은 이유 |

### 결론 — 4개 전부 (가), 실렌더 확인 우선순위 낮음

**정렬 결과: 4개 액션 전부 실렌더가 필요 없는 쪽으로 갈렸다.** 이유는 하나로 수렴한다 — **4개
Server Action 전부가 "쓰기 직전 대상·본인 상태를 새로 재조회해 재검증"하는 같은 패턴을 이미
갖고 있다**(`set-crew-member-role.ts`·`remove-crew-member.ts`·`update-comment.ts`·
`cancel-meetup.ts` 전부). 이 재검증이 렌더 시점의 stale 데이터가 아니라 **제출 시점의 실제
DB 값**을 다시 읽으므로, 26일차가 REST로 재현한 raw exception 조건(대상이 이미 비활성·역할이
바뀜·작성자가 아님 등)은 **정상 UI 클릭 경로로는 Server Action의 이 재검증 단계에서 먼저 걸려
친절한 문구로 끝난다** — 트리거까지 도달하려면 이 재검증 자체를 건너뛰는 REST 직접 호출이
필요하다. **I-131("작성자 본인은 raw REST로 사후 변경할 수 있다, 앱 경로 없음")과 같은
계열로 수렴한다** — 그쪽도 "앱이 막지만 REST는 막지 않는다"는 같은 비대칭이었다.

**남는 이론적 틈(실렌더로도 확인 불가능한 영역)**: Server Action의 재검증(조회)과 실제 쓰기
호출 사이의 밀리초 단위 경합(다른 요청이 그 사이에 끼어드는 경우)은 이론적으로는 여전히
트리거까지 도달할 수 있다 — 하지만 이건 이 프로젝트의 "확인→쓰기" 2단계 패턴을 쓰는 **모든**
쓰기 경로에 보편적으로 있는 원자성 문제지 I-124 4곳만의 특수성이 아니다(D-019가 이미 이런
경우 원자적 UPDATE·RPC를 권고하는 축과 같은 문제). 이 틈을 "실렌더로 확인"하려면 두 요청을
인위적으로 동시에 제출하는 레이스 재현이 필요한데, 그건 **브라우저 클릭이 아니라 SQL 동시성
실험**의 영역이라 이 배정("버튼 도달성 판별")의 범위 밖으로 남긴다.

**무엇을 보면 이 판정이 뒤집히는가(재검토 조건)**: 위 4개 Server Action 중 하나라도 "쓰기 직전
재조회" 단계가 리팩토링으로 제거되거나(예: 캐시된 값을 재사용하도록 "최적화"되면) stale 데이터로
바로 쓰기를 시도하게 되어 이 판정이 무효화된다 — 그 시점엔 이 표를 다시 확인해야 한다.

### DESIGN에게 전달할 것

이 절을 `display-layer-audit-33/README.md`가 참조하도록(I-124를 3절 순위 표에서 "실렌더 불필요
— 근거는 이 문서 부록" 정도로 갱신) DESIGN에게 넘긴다 — 그 문서는 지금 DESIGN이 수정 중이라
직접 편집하지 않았다.
