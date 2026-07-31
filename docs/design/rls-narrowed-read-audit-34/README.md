# RLS 역할별 행 축소 결함 클래스 — 앱 전체 전수조사 (34일차, CREW)

## 배경

BOARD가 Tier A 실렌더 중 `listEligibleVotersWithCurrentStatus`(`src/lib/data/supabase/poll.ts`)가
`poll_eligible_voters`를 직접 조회하면서 그 테이블 RLS(`poll_eligible_voters_select_self_or_staff`
= 본인 행 OR staff/owner 크루)에 걸려 **일반 멤버 시점에서 대상자 수가 자기 자신 1명으로 축소**됨을
발견했다(팀장 독립 검증: 진실 4 → member 시점 1, staff 시점 5). BOARD가 이 건의 수정을 맡고,
CREW는 **같은 결함 클래스를 앱 전체에서 전수로 찾는** 분업을 배정받았다.

**판정 질문**: *"이 조회가 반환한 행 수가 호출자의 role·멤버십에 따라 달라질 수 있는가, 그리고
그 수가 화면의 숫자나 판정에 쓰이는가."* 둘 다 참이면 같은 결함이다. 명단만 표시하는 자리(개수로
안 쓰는 자리)는 "일부만 보인다"이지 "틀린 숫자"가 아니므로 이 판정에서 제외한다(33일차
`AccountSettingsContainer` 오탐 판정과 같은 절제).

**34일차 팀장 정정 — 판정 기준에 한 줄 추가한다**: **같은 함수 안에서 축소되는 조회를 여러 개
합성해 쓸 때는, 각 조회를 독립적으로 평가하지 말고 합성된 결과로 판정해야 한다.** 아래 §2
(`poll_votes`)의 최초 서술이 정확히 이 함정에 걸렸다 — `listVotes` 하나만 떼어서 "축소되면
분모가 과대평가된다"고 판정했는데, 실제로는 **같은 호출 경로에서 `listEligibleVotersWithCurrentStatus`
도 동시에 축소돼** 분자·분모가 함께 줄어들며 방향이 뒤집힌다. 아래는 정정된 서술이다.

## 방법 — 어디를 얼마나 훑었는지 (31일차 §6 규칙)

1. **RLS 정책 전수 열거**: `pg_policies`로 `public` 스키마의 **SELECT 정책 전부(23개, 20개
   테이블)** 를 조회하고, 각 정책의 `qual`을 "자기 행 OR staff/owner 크루 멤버십"(role 기반
   축소 — 후보) 패턴과 "크루 활성 멤버면 누구나 전체를 본다"(축소 없음 — 안전) 패턴,
   "본인 전용"(self-only — 별개 취급) 패턴 셋으로 분류했다. **role 기반 축소 후보는 정확히
   4개 테이블**이었다: `poll_eligible_voters`·`poll_votes`·`invitations`·`join_requests`(전부
   `... = ( SELECT auth.uid()) OR crew_id IN (... role = ANY(ARRAY['staff','owner'])) ...` 형태,
   문자 그대로 동일 구조).
2. **직접 조회 지점 전수**: `grep`으로 `src/lib/data/supabase/*.ts` 전체에서 위 4개 테이블에
   대한 `.from(...)` 직접 호출을 찾았다 — **11곳**(`poll.ts` 5곳, `invitation.ts` 5곳,
   `join-request.ts` 3곳 — 일부는 단일 행 조회라 아래 "제외" 절에서 걸러진다).
3. **호출부 추적**: 위 각 함수를 호출하는 `src/components/**`·`src/lib/actions/**`를 전부
   열어 반환값이 `.length`·`.size`·집계·분모·정족수·"N명" 문자열에 쓰이는지, 아니면 알려진
   ID(대개 `session.profileId` 자신)로 `.find`/`.filter` 조회만 하는지 구분했다.
4. **대조 확인**: role 기반 축소가 **없는** 이웃 테이블(`crew_memberships`·`meetup_attendances`)의
   RLS 정책·헬퍼 함수(`private.is_active_crew_member`)를 직접 대조해 "왜 이건 안전한가"를
   구조적으로 확인했다(추론이 아니라 정책 본문 대조).

## 결과 — role 기반 축소 후보 4개 테이블, 조회 지점별 판정

### 1. `poll_eligible_voters` — **확정 결함(BOARD 처분 중, 이 전수조사의 발단)**

`listEligibleVotersWithCurrentStatus`(`poll.ts:87`) → `eligibleVoterCount`(`countQuorumEligibleVoters`)
→ 정족수 분모·"대상 N명" 화면 표시(`PollPanelContainer.tsx`) + `decideAndClosePoll`의 정족수 계산
(`poll-auto-close.ts:68`) + `withdraw-poll.ts`의 알림 대상자 필터. **BOARD가 실측 확정, 수정
담당.**

### 2. `poll_votes` — **신규 확정 결함(같은 클래스, 새로 발견) — 34일차 팀장 지적으로 방향 정정**

`listVotes`(`poll.ts:146`, `.from("poll_votes").select("*").eq("poll_id", pollId)`)는
`poll_votes_select_self_or_staff`(본인 행 OR staff/owner)에 그대로 걸린다. 호출부 2곳:

- **`PollPanelContainer.tsx:76`** — `votes.find((vote) => vote.voterId === session.profileId)`로
  **본인 선택(`myChoice`)만** 조회한다. 본인 행은 role과 무관하게 항상 보이므로(RLS의 self 분기가
  role 조건과 OR로 묶여 있다) **이 사용처는 안전하다** — 개수가 아니라 알려진 자기 ID로 찾는
  자리다(위 판정 질문의 "명단 표시 예외"와 정확히 같은 형태).
- **`cast-vote.ts:99~109`(트리거③, FR-043 "미투표자 0명이면 즉시 종료") — 여기가 결함이다.**
  ```ts
  const [voters, votes] = await Promise.all([
    listEligibleVotersWithCurrentStatus(input.pollId),
    listVotes(input.pollId),
  ]);
  const votedProfileIds = new Set(votes.map((v) => v.voterId));
  const remaining = countRemainingVoters(voters, votedProfileIds);
  if (shouldAutoCloseByAllVoted(remaining)) {
    await decideAndClosePoll(input.pollId, null);
  }
  ```
  **정정(팀장 지적) — 방향이 반대였다.** 최초 서술은 `listVotes` 하나만 떼어 "분모가 과대평가돼
  자동 종료가 실패한다"고 판정했는데, **`listEligibleVotersWithCurrentStatus`도 같은 "본인 OR
  staff/owner" RLS에 걸려 동시에 축소된다** — 이 함수 안에서 두 축소 조회가 합성된다. 방금
  투표한 사람이 staff/owner가 **아니면**: `voters` = [자기(active) 1행], `votedProfileIds` =
  {자기} → `countRemainingVoters`는 "active인데 투표 안 한 사람"을 세는데, 유일한 후보(자기)는
  이미 투표했으므로 → **`remaining = 0`** → `shouldAutoCloseByAllVoted(0) = true` →
  **`decideAndClosePoll`이 항상 호출된다** — 다른 사람이 아직 투표했든 안 했든 무관하게, non-staff
  멤버가 표를 던질 **때마다** 이 게이트가 열린다.

  **`decideAndClosePoll` 내부까지 따라가면 더 정확한 파급이 나온다** — 이게 BOARD의 "항상 즉시
  닫힌다"보다 이 조사가 더 정밀한 지점이다. `decideAndClosePoll`(`poll-auto-close.ts`)은:
  ```ts
  const [tally, voters] = await Promise.all([
    getPollTallyForDecision(pollId),        // RPC(SECURITY DEFINER) — 축소 없음, 실제 값
    listEligibleVotersWithCurrentStatus(pollId), // 같은 세션 재호출 — non-staff면 또 [자기]로 축소
  ]);
  const quorum = computeQuorum({
    eligibleVoterCount: countQuorumEligibleVoters(voters), // = 1 (자기뿐)
    votedCount: countVotedForQuorum(tally),                // = 실제 참여자 수(정확)
  });
  const decision = decidePollOutcome({ tally, quorum });
  const result = await closePoll({ pollId, closedBy: null, outcome: decision.outcome });
  ```
  `computeQuorum`은 `required = ceil(eligibleVoterCount / 3)`이므로 `eligibleVoterCount=1`이면
  `required=1` — **자기 한 표만 있어도 이 TS 계산상 정족수는 "충족"으로 나온다.**

  **정정(팀장 지적, 2차) — "정족수 무력화"는 성립하지 않는다.** 위 `computeQuorum`이 산출하는
  `quorum.met`은 `decidePollOutcome(...)`이 `closePoll({..., outcome: decision.outcome})`에
  넘기는 **`outcome` 값**에만 쓰인다. 그런데 `closePoll`의 실제 UPDATE는
  `polls_guard_decision_integrity`(BEFORE UPDATE, SECURITY DEFINER) 트리거를 통과해야 하고,
  이 트리거는 새 status가 `closed_*`이면 **클라이언트가 보낸 `new.status`/`new.result`를 전부
  버리고** `private.compute_poll_decision(old.id)`의 결과로 **통째로 덮어쓴다**(`pg_get_functiondef`
  로 원문 직접 확인). `compute_poll_decision`도 SECURITY DEFINER라 `poll_eligible_voters`·
  `crew_memberships`를 RLS 축소 없이 직접 세어(`v_eligible_count`) `v_required = ceil(v_eligible_count
  / 3.0)`를 **다시 계산**하고, `v_participant_count < v_required`면 무조건 `invalid`로 강제한다.
  **즉 저장되는 판정의 분모는 언제나 진짜 대상자 수이고, TS의 축소된 `computeQuorum`은 화면
  표시와 "closePoll을 호출할지"라는 시도 여부에만 관여할 뿐 DB에 저장되는 값에는 전혀 관여하지
  않는다.** FR-044 AC3는 무력화되지 않는다 — 이 주장은 철회한다.

  더해서 `poll_vote_tally_for_decision`(SECURITY DEFINER, 실제 정의를 `pg_get_functiondef`로
  직접 읽었다)의 "판정 준비됐는가"(`v_decision_ready`) 조건에는
  `(select auth.uid()) = v_post_author`(제안자 본인이면 무조건 참)가 **의도적으로** 들어 있다 —
  이건 FR-043 AC3(제안자 본인의 "조기 종료" 권한)를 위한 정상 설계다. 문제는 이 조건이 위
  `computeQuorum`의 축소된 분모와 **우연히 만나** 다음 결과를 만든다는 것이다:

  - **① 마지막(가장 최근) 투표자가 staff/owner** — 이 호출 경로 전체가 축소되지 않는다(RLS의
    staff 분기가 본인 분기와 별개로 전체를 허용). `remaining`도 `eligibleVoterCount`도 정확하다.
    **영향 없음 — 원래 의도대로 "진짜 전원 투표 완료" 때만 닫힌다.**
  - **② 제안자 본인(staff 아님)이 투표할 때 — 관측 가능한 회귀, 단 "값 위조"가 아니라
    "시점" 문제다.** `v_decision_ready`가 "제안자"라는 이유만으로 참이 되고(FR-043 AC3 조기
    종료 권한을 위한 정상 설계), `closePoll`도 제안자를 허용하므로
    (`polls_update_proposal_author_or_staff`) UPDATE가 **실제로 성공한다** — poll이 조기
    종료된다. **저장되는 판정 자체는 위조가 아니다** — `polls_guard_decision_integrity`가
    `compute_poll_decision`(DEFINER, 축소 없는 진짜 분모)으로 다시 계산해 덮어쓰므로, 정족수도
    진짜 값으로 강제되고 미달이면 `closed_invalid`가 저장된다. **문제는 값이 아니라 시점이다**
    — 제안자가 표를 던지는 순간 다른 크루원이 아직 투표할 기회가 남아 있어도 그 시점에서
    조기 종료가 트리거되고, 그 결과 대개는 정족수 미달로 `closed_invalid` 처리된다(FR-041의
    투표 기회·D-022 미투표자 정의를 실질적으로 위반 — 아직 투표 가능한 사람이 있는데도 poll이
    끝난다). 심각도는 여전히 (A)급이지만 근거는 "정족수 위조"가 아니라 "투표 기회 조기 박탈"
    이다.
  - **③ 제안자도 staff도 아닌 일반 크루원이 투표할 때** — `v_decision_ready`의 마지막 조건
    (`not exists(...)`, 진짜 "전원 투표 완료"인지)만 남는데 이건 SECURITY DEFINER라 축소 없이
    정확하게 계산된다. 아직 전원이 안 끝났으면 `poll_vote_tally`(표시용)로 위임되고 D-031 숨김
    조건에 걸리면 `tally_hidden=true`가 나와 `getPollTallyForDecision`이 예외를 던진다 — 바깥
    `try/catch`가 잡아 `console.error`만 남기고 끝난다. 숨김 조건에 안 걸려도(크루가 커서
    D-031 임계값 이상) `closePoll`이 결국 RLS로 거부된다(제안자도 staff도 아니므로) —
    **`closePoll`은 예외를 던지지 않고 `DataResult`의 `err("conflict", …)`를 반환하는데,
    `cast-vote.ts`가 그 반환값을 검사하지 않는다** (`await decideAndClosePoll(...)`만 하고
    끝, `.ok` 미확인) — 즉 **이 경우는 결함 유무와 무관하게 완전히 조용한 무동작이다.** (최초
    서술의 "I-049 진단 로그 차이"는 부정확했다 — I-049는 던져진 예외만 잡고, `closePoll`의
    `DataResult` 거부는 애초에 검사하지 않아 로그 자체가 안 남는다. 정정한다.)

  **결론(2차 정정)**: 실제 회귀는 **"제안자 본인(staff 아님)이 투표하면 poll이 조기 종료된다.
  저장되는 판정 자체는 DB가 진짜 분모로 재계산하므로 위조가 아니고 정족수도 강제된다 — 문제는
  아직 투표하지 않은 다른 크루원이 기회를 잃고, 그 결과 대개 정족수 미달로 closed_invalid가
  된다는 시점 문제다."** BOARD가 본 "항상 즉시 닫힌다"는 ①·③에서는 성립하지 않고 **②에서만**
  실제로 성립한다. ("정족수 게이트 무력화"라는 최초 2차 서술은 `polls_guard_decision_integrity`
  ·`compute_poll_decision`을 직접 읽지 않고 TS 쪽 `computeQuorum` 계산만으로 저장 값까지
  추정한 것이었다 — 철회한다.)

  **판정 기준 추가(팀장 지적, 감사 방법론에 반영)**: **"클라이언트가 계산한 값이 그대로 저장된다"고
  가정하지 않는다.** 이 프로젝트는 판정을 DB 트리거가 다시 계산해 덮어쓰는 구조(D-054·I-089
  방어, `polls_guard_decision_integrity`가 그 예)를 여러 곳에 쓴다 — 클라이언트 계산이 틀렸다는
  것을 확인해도, 그 값이 실제로 저장되는지(재계산 트리거로 덮어써지지 않는지)까지 확인하기
  전에는 "저장된 값이 틀렸다"로 넘어가면 안 된다.

  **실측 여부(정직하게 남긴다)**: 이번에도 실 DB 픽스처로 재현하지 않았다 —
  `crew_memberships_guard_self_insert_request`/`crew_memberships_guard_self_transition` 두
  트리거가 self-service 경로 밖의 직접 INSERT/UPDATE로 "활성 일반 멤버"를 만드는 걸 막아
  예산 안에서 크루+게시판+투표+대상자 스냅샷 전체를 구성하는 픽스처를 완결하지 못했다. 이번
  정정도 (a) `pg_get_functiondef`로 `poll_vote_tally_for_decision`·`computeQuorum`·
  `decidePollOutcome`·`closePoll`·`cast-vote.ts` 원문을 전부 직접 읽고 (b) 팀장이 독립적으로
  `cast-vote.ts:100-108`과 두 정책 정의를 대조해 방향을 확인한 결과를 반영한 것이다 — **코드
  추적 신뢰도는 최초 서술보다 높아졌지만(팀장 교차검증 포함) 여전히 실 DB 재현은 아니다.**
  다음 사람이 이 건을 집으면 `begin...rollback` + 역할별 JWT claims로 "제안자가 투표 → 정족수
  미달 상태에서도 즉시 확정되는지"를 직접 재현하는 것을 권한다(I-158 전례를 감안).

### 3. `invitations` — **활성 결함 0건, 잠재 위험 1건(현재 미사용 함수)**

`listInvitationsForCrew`(`invitation.ts:114`, `.eq("crew_id", crewId)`)는
`invitations_select_participant_or_staff`(초대받은 사람 OR 보낸 사람 OR staff/owner)에 걸린다.
**호출부가 0곳이다**(데이터 레이어 밖에서 import하는 곳이 없음, `grep` 확인) — 지금은 죽은 코드라
활성 결함은 아니지만, 나중에 "이 크루가 보낸 초대 N건" 같은 배지를 이 함수로 만들면 일반
멤버(비staff)는 자기가 보낸 초대만 세게 된다. **잠재 위험으로 기록만 하고 이번엔 손대지 않는다**
(사용되지 않는 코드를 미리 고치는 것은 이번 배정 범위 밖).

`listInvitationsForProfile`(`invitation.ts:95`, `.eq("invitee_id", inviteeId)`)는 항상 호출자
**본인의** `inviteeId`로 조회하는 "받은 초대함"(self-service) 기능이라 RLS의 본인 분기가
role과 무관하게 항상 성립한다 — **안전.**

### 4. `join_requests` — **활성 결함 0건**

`listJoinRequestsForCrew`(`join-request.ts:46`)는 `join_requests_select_requester_or_staff`
(신청자 OR staff/owner)에 걸린다. 유일한 호출부는 `CrewMembersContainer.tsx:150`인데,
`if (canViewJoinRequests)`(= `crew:approve_join_request` 권한, role 매트릭스상 staff/owner
전용) **뒤에서만** 호출한다 — 이 함수를 실제로 호출하는 사람은 항상 RLS의 staff/owner 분기를
이미 만족하므로 **이 호출 지점에서는 축소가 일어나지 않는다.** (앱 권한 게이트와 RLS 축소
경계가 우연이 아니라 같은 "staff/owner"로 일치해 서로를 보강하는 드문 케이스 — 다른 3개 테이블은
이런 사전 게이트가 없어서 결함이 났다는 대조가 된다.)

## 대조군 — role 기반 축소가 없는 테이블 (오탐 제외 근거)

- **`crew_memberships`**(`crew_memberships_select_self_or_fellow_member` = 본인 행 OR
  `private.is_active_crew_member(crew_id)`): 헬퍼 함수를 직접 열어보면 "이 크루의 활성
  멤버인가"만 보고 role(staff/owner)을 전혀 안 본다 — **활성 멤버라면 누구나 크루 전체
  멤버십을 본다.** `CrewMembersContainer.tsx`의 `members.length`("크루원 N명" 표시)는 role과
  무관하게 항상 같은 값이다. **안전.**
- **`meetup_attendances`**(`meetup_attendances_select_self_or_members`): 마찬가지로 staff
  조건이 없고 "이 Meetup이 속한 크루의 활성 멤버"까지만 요구한다 — **안전.**
- **`blocks`·`reports`·`notifications`·`notification_preferences`·`chat_room_reads`**: 전부
  본인 전용(self-only) RLS이고, 실제 호출부도 전부 호출자 본인 ID로만 조회한다(내 차단 목록·내
  신고 내역·내 알림·안읽음 카운트) — 다른 사용자의 행을 세는 용도가 아니라 **애초에 이 결함
  클래스에 해당하지 않는다.**

## 결론

- **신규 확정 결함 1건(34일차 두 차례 팀장 정정 반영)**: `poll_votes`를 직접 조회하는
  `listVotes`가 `poll_eligible_voters`를 직접 조회하는 `listEligibleVotersWithCurrentStatus`와
  `cast-vote.ts`의 트리거③ 게이트 안에서 **동시에** 축소된다 — non-staff가 투표할 때마다
  `decideAndClosePoll`이 (진짜 전원 완료 여부와 무관하게) 매번 호출된다. **제안자 본인(staff
  아님)이 투표할 때** 이 호출이 `closePoll`의 RLS(제안자도 종료 가능)를 통과해 **poll이
  조기 종료된다.** 다만 **저장되는 판정 값 자체는 위조되지 않는다** —
  `polls_guard_decision_integrity` 트리거가 `compute_poll_decision`(SECURITY DEFINER, RLS
  축소 없이 진짜 대상자 수로 정족수를 재계산)으로 클라이언트가 보낸 값을 통째로 덮어쓰기
  때문이다. 실제 결함은 **"아직 투표하지 않은 다른 크루원이 기회를 잃고, 그 결과 대개
  정족수 미달로 `closed_invalid` 처리되는" 조기 종료(시점 문제)** 다. staff/owner가 투표할
  때·그 외 일반 멤버가 투표할 때는 각각 축소가 없거나 `closePoll` RLS가 최종 방어선이 돼
  영향이 없다. 이슈 초안: `docs/ISSUES.draft.CREW.md`.
- **잠재 위험 1건(비활성)**: `listInvitationsForCrew` — 지금은 호출부가 없어 결함이 아니지만
  나중에 집계 용도로 쓰이면 같은 클래스가 재현된다. 이슈로 등재하지 않고 이 문서에만 기록한다
  (활성 결함이 아닌 것까지 이슈로 만들면 트리아지 부담만 늘린다는 33일차 절제와 같은 기준).
- **오탐 처리 4건**(근거 함께 기록): `listVotes`의 `PollPanelContainer` 사용처(자기 조회),
  `listInvitationsForProfile`(자기 조회), `listJoinRequestsForCrew`(staff 전용 게이트 뒤),
  `crew_memberships`/`meetup_attendances`(애초에 role 축소가 없는 정책 구조).
- **훑은 범위**: `public` 스키마 SELECT 정책 23개 전수 분류, role-축소 후보 4개 테이블의 직접
  조회 지점 11곳 전수, 그 호출부 전부(`components/`·`lib/actions/` grep 기반) 추적. 훑지 않은
  것: Mock 데이터 레이어(RLS가 없어 이 결함 클래스가 성립하지 않는다), INSERT/UPDATE/DELETE
  정책(이 결함 클래스는 SELECT 축소에 한정된다).
