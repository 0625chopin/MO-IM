# `src/lib/rules/`

**React 비의존 순수 함수**(NFR-036). 투표 판정·정족수(D-032: `ceil(대상자 수 / 3)`)·권한 판정·
색 해시(`hash(crew.id) mod 12`) 등 — 네이티브 앱 전환(R-015) 시 그대로 재사용해야 하는 핵심
비즈니스 규칙이 여기 있다. React Compiler는 컴포넌트·훅만 메모이즈하므로(`CLAUDE.md`) 이 계층은
애초에 최적화 대상이 아니다.

## 무엇이 여기 오는가

- 입력을 인자로 받고 출력을 반환하는 **순수 함수**만 둔다.
- `react`·`react-dom`·`next`·`@/app/*`·`@/components/*`·`@/lib/data/*`·`@/lib/realtime/*`·
  Supabase 클라이언트를 import하지 않는다 — `eslint.config.mjs`(zone 1)가 이를 강제한다.
  데이터는 **인자로 받는다**, 직접 조회하지 않는다.

## 권한·멤버십·색 해시 (CREW, Task 009B, 3일차)

- **`permission.ts`** — `checkPermission(input: PermissionCheckInput): PermissionCheckResult`.
  3.3절 권한 매트릭스는 총 35행이며, 회원가입(FR-001)·로그인(FR-002) 2행은 크루 스코프가
  아니라 `PermissionAction`에서 이미 제외돼 33행이 대상이다. 그중 FR-032("자기 게시글
  수정·삭제") 1행이 "타인 게시글 삭제"와의 대칭을 위해 `post:update_own`·`post:delete_own`
  두 액션으로 갈려 `PermissionAction`·`PERMISSION_MATRIX`는 33행이 아니라 **34개 액션**이다
  (1:1 대응이 아님 — 3일차 교차검증에서 BOARD가 지적). 이후 댓글 3행(Task 041)과 활동 사진
  3행(D-111)이 더해져 현재는 **40개 액션**이다. 이 액션 전부를
  `Record<PermissionAction, Record<UserRole, "allow"|"conditional"|"deny">>` 리터럴로 옮기고,
  "○"(조건부 허용) 셀만 각주 1~5(`isSelf`·`hasOwnerSuccessorOrDisband`·`crewVisibility`·
  `targetRole`·`isProposalAuthor`, 전부 `permission.types.ts`의 `PermissionCheckContext` 그대로)로
  판정한다. `permission.types.ts`의 `PermissionAction`·`PermissionCheckContext`·
  `PermissionCheckInput`·`PermissionCheckResult`를 그대로 입출력에 쓰며 확장하지 않았다.
- **`crew-membership-transition.ts`** — 요구사항 2.4절 "Crew 멤버십 상태" 다이어그램을
  `Record<CrewMembershipStatus, Partial<Record<CrewMembershipEvent, CrewMembershipStatus>>>`로
  옮긴 `transitionCrewMembershipStatus`/`createCrewMembershipStatus`(초대·가입신청의 `[*]` 시작
  상태)/`isTerminalMembershipStatus`. 부가로 `deriveUserRoleForPermissionCheck`를 둬서
  `CrewMembership.role`+`status` → 3.1절 `UserRole` 투영을 한 곳에 모았다 — 각 컨테이너가
  이 변환을 따로 구현하면 판정이 화면마다 갈리는 R-015 신호가 된다.
- **`crew-color-hash.ts`** — D-006 `hash(crew.id) mod 12`(`hashCrewId`·`crewColorIndex`)와
  D-026 같은 날짜 셀 충돌 회피(`resolveCrewColorCollision`, 아래 "crew-palette.ts와의 경계"
  참고), 둘을 합친 편의 함수 `assignCrewColorForDateCell`.

### `src/lib/crew-palette.ts`와의 경계 — 1일차 이월 결정 처리 (3일차)

1일차 교차검증에서 "`resolveCrewColorCollision`·`normalizePaletteIndex`를 `lib/rules/`로
옮기는 작업은 CREW의 `hash(crewId)` 함수가 합류하는 시점에 함께 처리한다"고 이월했다
(`docs/CONVENTIONS.md` 남은 리스크 절). 이번 회차(Task 009B)가 그 시점이라 실제로 판단·실행했다.
저장소 전체에 두 함수의 기존 소비자가 없어(`grep` 확인) 이동 비용은 0이었다:

- **이관함 — `resolveCrewColorCollision`** → `lib/rules/crew-color-hash.ts`. D-026의 충돌 회피
  "판정"(후보 인덱스 + 점유 인덱스 집합 → 실제 인덱스 결정) 그 자체이고, 새로 만든
  `crewColorIndex`(`hash(crewId) mod 12`)와 항상 한 파이프라인으로 호출되므로 판정 로직을
  한 파일에 모아 R-015를 줄였다.
- **현행 유지 — `normalizePaletteIndex`** → `lib/crew-palette.ts`에 남는다. `CREW_PALETTE_SIZE`
  (팔레트 **데이터**의 크기)에 대한 나머지 연산일 뿐이고, 데이터 조회 함수 `getCrewColor`가
  계속 이를 쓴다. 옮기면 데이터 모듈(`crew-palette.ts`)이 판정 모듈(`lib/rules/`)에 의존해야
  해서 방향이 거꾸로 된다 — 대신 `crew-color-hash.ts`가 `crew-palette.ts`에서
  `CREW_PALETTE_SIZE`·`normalizePaletteIndex`를 가져와 쓴다(판정이 데이터에 의존하는 자연스러운
  방향).

`docs/CONVENTIONS.md`의 남은 리스크 절도 이 결정에 맞춰 갱신했다. 판단 근거의 전문은
`crew-color-hash.ts`의 모듈 docstring에 있다.

자세한 배치 원칙은 [`docs/CONVENTIONS.md`](../../../docs/CONVENTIONS.md) 참고.

## 크루 개설·가입 신청 (CREW, Task 016B, 7일차)

- **`crew-name-validation.ts`** — `validateCrewName`(길이·금칙어). 상한·금칙어 목록 둘 다
  요구사항에 근거가 없는 잠정값이다(I-038).
- **`crew-description-validation.ts`** — `validateCrewDescription`(필수·길이). 상한은 잠정값
  (I-038).
- **`crew-category.ts`** — `CREW_CATEGORIES`(고정 5개 taxonomy)·`isValidCrewCategory`. 개설 폼과
  Task 016A(크루 탐색) 카테고리 필터가 같은 목록을 공유해야 어긋나지 않는다.
- **`join-request-eligibility.ts`** — `evaluateJoinRequestEligibility`. FR-022 사전조건(공개
  범위)·예외 흐름(중복 신청·강퇴 이력)을 판정한다. `request-join-crew.ts`(Server Action)와
  `join-request-button-state.ts`(아래) 둘 다 이 함수를 호출해 같은 기준으로 "신청 가능한가"를
  판정한다.
- **`join-request-button-state.ts`** — `resolveJoinRequestButtonState`. 크루 홈의 "가입 신청
  버튼 상태 기계"(ROADMAP) 그 자체 — 세션 인증 여부·크루 공개 범위·멤버십을 조합해 버튼이
  어떤 모습이어야 하는지(`kind`)만 반환한다. `evaluateJoinRequestEligibility`를 재사용해
  판정을 중복 구현하지 않는다.

## 투표·정족수·타임존 (BOARD, Task 009A, 3일차)

- **`quorum.ts`** — `computeQuorum`(D-032 `ceil(대상자 수/3)`), `countVotedForQuorum`(D-003 기권
  포함 참여자 수). `poll.types.ts`의 `QuorumCheckInput`/`QuorumCheckResult`를 그대로 구현한다.
- **`poll-eligibility.ts`** — `SnapshotVoterStatus`(3일차 교차검증 후 `@/lib/types/poll.types.ts`가
  정의하고 데이터 레이어의 `listEligibleVotersWithCurrentStatus`가 생산하며 이 모듈이 소비하는
  조인 계약 — 스냅샷×현재 멤버십 상태를 조인한 결과다. 원래 이 파일의 로컬 정의였으나 승격됨,
  필드는 그대로), `countQuorumEligibleVoters`(D-003 강퇴자 분모 제외), `countRemainingVoters`/
  `shouldAutoCloseByAllVoted`(D-022 종료 트리거③).
- **`poll-vote-tally.ts`** — `computeVoteTally`(무효화 표 제외 집계), `invalidateVotesForRemovedMember`
  (D-003 강퇴 시 표 무효화).
- **`poll-decision.ts`** — `decidePollOutcome`(D-003 정족수/동수/가결 3갈래 판정 트리).
  `poll.types.ts`의 `PollDecisionInput`/`PollDecisionResult`를 그대로 구현한다.
- **`poll-timezone.ts`** — `isPollExpired`·`getPollRemainingMs`·`toZonedDateString`·
  `validatePollDuration`·`isPollClosingBeforeMeetupDate`(NFR-025, D-003 기한 범위·Meetup
  예정일 순서). epoch 비교와 `Intl.DateTimeFormat`만 쓰고 외부 라이브러리는 도입하지 않았다.

## 게시판 글쓰기 (BOARD, Task 018B, 7일차)

- **`meetup-proposal-schedule.ts`** — `validateMeetupProposalSchedule`. FR-034 E1~E3의 날짜
  판정을 조립한다. 타임존 경계 처리는 새로 만들지 않고 위 `poll-timezone.ts`의
  `isPollExpired`·`isPollClosingBeforeMeetupDate`·`toZonedDateString`·`validatePollDuration`을
  그대로 재사용한다 — 이 파일은 그 넷을 FR-034가 요구하는 순서로 호출만 한다. 고정 타임존
  `Asia/Seoul`(v0.1 한국 단독 시장, D-011)을 기본값으로 둔다.
- **`post-content-validation.ts`** — `validatePostContent`. FR-030 E1(제목·본문 필수)의
  판정. 일반글·모임 제안글 공통이라 `meetup-proposal-schedule.ts`와 분리했다. 글자 수 상한은
  요구사항에 값이 없어 두지 않았다(I-038과 같은 결).

배럴(`index.ts`)은 만들지 않았다 — CREW가 같은 디렉터리에서 권한·멤버십·색 해시 파일을 동시
작업 중이라 충돌을 피하기 위해서다. 배럴 도입 여부는 팀장이 직렬로 판단한다.

## 캘린더 크루 필터 (DESIGN, Task 021B, 7일차)

- **`crew-filter-selection.ts`** — `parseCrewFilterSelection`. 크루 필터 쿠키 원본(`undefined`/
  빈 문자열/유효한 값/전부 stale 네 갈래)과 실제 소속 크루 목록을 받아 최종 선택 목록을
  결정한다(FR-061 AC5). 처음엔 `src/components/calendar/calendar-types.ts`(plain ts 공유
  모듈)에 있었으나, CORE 재검증에서 "`use client` 값 export 함정 회피는 `MonthCalendar.tsx`에
  두면 안 된다는 근거는 되지만 `calendar-types.ts`에 있어야 한다는 근거는 아니다"는 지적을
  받고 이 파일로 옮겼다 — `resolveCrewColorCollision`이 위 "crew-palette.ts와의 경계" 절에서
  데이터 모듈→판정 모듈로 이관된 것과 같은 이유(값이 아니라 판정)다. 반대로 순수 포맷팅인
  `serializeCrewFilterSelection`(쉼표 join, 분기 없음)은 `normalizePaletteIndex`가
  `crew-palette.ts`에 남은 것과 같은 이유로 `calendar-types.ts`에 그대로 둔다. 판단 근거 전문은
  `crew-filter-selection.ts` 모듈 docstring에 있다.

## Meetup 상세와 참석 (DESIGN, Task 022, 8일차)

- **`meetup-attendance-eligibility.ts`** — `isMeetupFull`(정원 마감 여부, capacity·attendingCount
  비교)·`isMeetupAttendanceOpen`(FR-066 사전조건 — confirmed 상태 + 예정일 미경과). 처음부터
  이 디렉터리에 뒀다 — "정원 마감·참석 가능 여부 판정은 `lib/rules/`에 두고 컨테이너에
  인라인하지 마라"는 이 회차 지시를 그대로 따랐다(R-015). **원자성 자체는 이 파일의 몫이
  아니다** — 동시 요청에서 정확히 0명만 추가되는 보장(D-019)은 `lib/data/mock/meetup.ts`의
  `respondAttendance`(조건부 UPDATE와 동등한 순차 실행) 몫이고, 이 파일은 버튼 표시를 위한
  낙관적 판정만 한다.
- **`meetup-attendance-button-state.ts`** — `resolveMeetupAttendanceButtonState`. Meetup
  상세의 "참석/불참 버튼 상태 기계" — `join-request-button-state.ts`와 같은 자리다. 위
  `isMeetupFull`·`isMeetupAttendanceOpen`을 재사용해 판정을 중복 구현하지 않는다. 크루원
  여부는 입력에 없다 — `MeetupDetailContainer`가 이미 그 관문(FR-064 AC2, 403)을 통과시킨
  뒤에만 이 함수를 호출한다.
- **`meetup-participant-grouping.ts`** — `groupMeetupParticipantIds`(FR-068 참석자 3구분).
  **판단이 갈린 지점**: "참석/불참/미응답으로 나누는 것"이 순수 포맷팅인지 판정인지 — 응답
  기록이 없는 크루원을 "미응답"에 넣으려면 "지금 이 모임에 응답할 자격이 있는 크루원"(활성
  크루원만, 탈퇴·강퇴자는 제외하되 이미 남긴 응답은 유지)을 먼저 정해야 한다는 점에서
  판정으로 보고 이 디렉터리에 뒀다. `docs/CONVENTIONS.md`의 "판정이면 lib/rules, 순수
  포맷팅·직렬화면 데이터/타입 모듈에 잔류" 기준을 이 새 사례에 처음 적용한 것이라 근거를
  여기 남긴다 — 교차검증 대상.

배럴(`index.ts`)은 여전히 만들지 않았다(위 "게시판 글쓰기" 절 참고 — 여러 팀원이 동시에 이
디렉터리에서 작업 중이면 충돌을 피하기 위해서다).
