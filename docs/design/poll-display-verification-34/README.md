# I-089/D-054 Tier A 실렌더 검증 — 34일차, BOARD

DESIGN이 33일차 `docs/design/display-layer-audit-33/README.md` §9에서 정렬해 둔 **순위 1
(I-089/D-054, CRITICAL — 투표 조작 방어)**의 Tier A를 실행한다. 신규 데이터 생성 0건 원칙
아래, 이미 닫힌 poll 2건의 **SQL 진실값**과 **화면 표시값**을 대조한다.

## 0. 범위

- **Tier A(이번 회차 범위)**: §9가 지목한 poll 2건에 대해 SQL 재계산 진실값과 실제 렌더를
  대조한다. 판정 로직은 `src/lib/rules/poll-decision.ts`(`decidePollOutcome`·`isPollTie`)와
  `src/lib/rules/quorum.ts`(`computeQuorum`·`countVotedForQuorum`) 순수 함수의 결과와도
  대조해 "판정 로직 한 벌" 원칙(내 프로필, `docs/team/04.BOARD.md`)을 지킨다.
- **Tier B(이번 회차 범위 아님)**: §1 끝에 사유를 남긴다.

## 1. SQL 진실값 — 34일차 재실측(33일차 §9 표를 다시 세어 확인)

**추출 방법**: `public.polls`를 `public.posts`→`public.boards`로 조인해 `crew_id`를 얻고,
`public.poll_eligible_voters`(정족수 분모 스냅샷, D-003)와 `public.poll_votes`
(`invalidated = false`인 행만, `private.poll_vote_tally` SQL 함수와 동일 필터)를 각각
`count(*)`로 집계했다. 33일차 문서 수치를 그대로 베끼지 않고 **오늘 다시 쿼리해서** 드리프트
여부까지 확인했다 — 아래 "일치" 열이 그 결과다.

| 항목 | poll `2433fd02-…cb98` | poll `622cb2f7-…14ef` |
| --- | --- | --- |
| 크루 | 알고리즘 스터디(`f202047b-…`, public) — chopin0625 role=**staff** | 홈쿠킹 클럽(`863e8ff0-…`, private) — chopin0625 role=**member** |
| post_id (URL의 board 세그먼트) | `379c5f4f-519e-447e-a1f6-dbd8388f9d76` | `e2736eb9-9259-4122-82ba-b80dd11ab89f` |
| `poll_eligible_voters` 행 수(대상자) | **5** | **4** |
| 찬성(`for`, invalidated=false) | **1** | **4** |
| 반대(`against`) | **1** | **0** |
| 기권(`abstain`) | **0** | **0** |
| 참여자 수(`participant_count` = 세 합) | **2** | **4** |
| `invalidated=true` 행 | 0 | 0 |
| 정족수 `required = ceil(대상자/3)` | ceil(5/3) = **2** | ceil(4/3) = **2** |
| 정족수 충족(`participant ≥ required`) | 2 ≥ 2 → **충족** | 4 ≥ 2 → **충족** |
| 동수(`for === against`) | 1 === 1 → **동수** | 4 !== 0 → 동수 아님 |
| **판정(`decidePollOutcome`)** | **rejected**(동수) | **passed** |
| DB `polls.status`/`polls.result`(트리거 확정값) | `closed_rejected` / `rejected` | `closed_passed` / `passed` |
| SQL 재계산 판정 vs DB 저장값 | **일치** | **일치** |
| 33일차 §9 표 수치와 오늘 재실측 | **일치**(드리프트 없음) | **일치**(드리프트 없음) |

세는 방법: `poll_eligible_voters where poll_id = $1`의 `count(*)`, `poll_votes where poll_id
= $1 and not invalidated and choice = $2`의 `count(*)` — `private.poll_vote_tally` SQL
함수(마이그레이션 `20260725015801_rls_move_definer_logic_to_private_wrappers.sql`)와 정확히
같은 필터 조건(“`not pv.invalidated`”)을 썼다. 실측 쿼리·원본 결과는 이 회차 세션 로그에
있다(읽기 전용 `execute_sql`, 쓰기 없음 — 정리할 임시 데이터 자체가 없다).

## 2. 순수 함수 대조

`decidePollOutcome({ tally, quorum })`을 손으로 대입:

- poll `2433fd02-…`: `quorum.met = true`(2≥2) → `isPollTie({forCount:1, againstCount:1})`
  = `true` → **`outcome = "rejected"`**. `computeQuorum({eligibleVoterCount:5, votedCount:2})`
  = `{ required: 2, actual: 2, met: true }`(`Math.ceil(5/3)=2`).
- poll `622cb2f7-…`: `quorum.met = true`(4≥2) → tie 아님 → `forCount(4) > againstCount(0)`
  → **`outcome = "passed"`**. `computeQuorum({eligibleVoterCount:4, votedCount:4})` =
  `{ required: 2, actual: 4, met: true }`.

두 poll 모두 **순수 함수 결과 = DB 저장값(트리거 확정값) = SQL 재계산값** 세 갈래가 전부
일치한다. 이 문서가 검증할 것은 마지막 남은 네 번째 갈래 — **화면이 이 값을 그대로
보여주는가**다.

## 3. 화면에서 기대하는 정확한 문구·선택자 (실측 전 코드 추적, `Explore` 서브에이전트로 확인)

`src/components/board/PollStatusBadge.tsx`·`src/components/poll/PollResult.tsx`·
`src/components/poll/PollTally.tsx`·`src/lib/strings/ko.ts`를 코드로 추적해 아래 문구를
확정했다(브라우저 미접촉, 정적 추적):

| 항목 | poll `2433fd02-…`(부결) | poll `622cb2f7-…`(가결) |
| --- | --- | --- |
| `PollStatusBadge` 텍스트 | `"부결"`(`strings.vote.status.closedRejected`) | `"가결"`(`strings.vote.status.closedPassed`) |
| `PollResult` 사유 `<p>` | `"찬반 동수로 부결되었습니다"`(`resultReason.rejectedTie`, `isPollTie`로 선택) | `"정족수 충족 · 찬성 우세로 가결되었습니다"`(`resultReason.passed`) |
| `PollTally` 참여 문구 | `"참여 2명 / 대상 5명"`(`vote.summary.participants`) | `"참여 4명 / 대상 4명"` |
| `PollTally` 정족수 문구·배지 | `"정족수 2명"` + 배지 `"정족수 충족"` | `"정족수 2명"` + 배지 `"정족수 충족"` |
| `PollTally` 찬/반/기권 `<dd>` | 찬성 1 · 반대 1 · 기권 0 | 찬성 4 · 반대 0 · 기권 0 |
| URL | `/crews/f202047b-2478-43bd-a30c-60f082ccba8e/board/379c5f4f-519e-447e-a1f6-dbd8388f9d76` | `/crews/863e8ff0-f2b0-4c8e-9e9b-19959f216ac4/board/e2736eb9-9259-4122-82ba-b80dd11ab89f` |

DOM 선택자 단서: `PollStatusBadge`는 `Badge`(`data-slot="badge"` 관례)의 텍스트 노드,
`PollResult` 사유는 `<p className="text-sm text-foreground">`, `PollTally`는
`<div aria-live="polite" aria-atomic="true">` 루트 아래 `<dl>`의 `<dt>`/`<dd>` 쌍 —
텍스트 콘텐츠 직접 매칭이 class/aria 셀렉터보다 안정적이라 그쪽을 우선한다.

## 4. 실렌더 전 필수 절차 — 계정 대조(33일차에 가짜 양성을 실제로 막은 절차)

브라우저를 열기 전에 SQL로 대상 계정을 미리 확정했다(브라우저를 연 직후에도 **같은 쿼리로
현재 세션이 이 계정인지 다시 대조**한다 — 이 절차 자체는 아직 실행하지 않음, 브라우저 열림
직후 §6에 기록):

| 계정 | profile id | `f202047b-…`(알고리즘 스터디) 멤버십 | `863e8ff0-…`(홈쿠킹 클럽) 멤버십 |
| --- | --- | --- | --- |
| `chopin0625@gmail.com`(핸들 `chopin0625`) | `30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a` | staff·active | member·active |
| `0625chopin@gmail.com`(핸들 `chopin_0625`) | `fb70ff1c-3736-44ee-a4a3-96993a3c62ed` | member·active | **없음** |

**결론: 이번 Tier A는 `chopin0625@gmail.com`으로 로그인해야 한다.** `0625chopin@gmail.com`은
홈쿠킹 클럽에 멤버십이 없어 두 번째 poll이 `forbidden`으로 막힌다 — 계정을 착각하면 "화면이
깨졌다"가 아니라 "권한이 없다"는 다른 결론으로 오판할 위험이 있다. 33일차 배정 지시가 경고한
"엉뚱한 계정" 함정이 정확히 이 두 계정 사이에서 발생할 수 있다는 뜻이라 여기 명시해 둔다.

## 5. Tier B를 이번 회차에 수행하지 않는 이유

§9 원문 그대로: Tier B(적대적 분기 — 클라이언트가 위조한 `status`/`result`를 트리거가 조용히
교정하는 경로)를 브라우저로 확인하려면 **커밋된 위조 UPDATE**가 있어야 한다. `begin`…
`rollback` 트랜잭션 안에서는 롤백 전 상태를 Next.js 서버(별도 커넥션)가 볼 수 없으므로
브라우저로 관찰할 방법이 없다 — 확인하려면 스크래치 크루·제안글·`open` poll을 실제로 커밋해야
한다. 이는 이번 배정이 요구하는 **"신규 데이터 생성 0건"** 원칙과 구조적으로 충돌한다. 그래서
Tier B는 이번 회차 범위 밖으로 두고 손대지 않았다 — 착수 여부는 팀장 판단으로 남긴다(§9 원문과
동일 결론).

## 6. 실렌더 결과 — 34일차, 실행 완료

### 6.0 세션 계정 대조 — 1차 불일치 발견·정정(실제로 함정에 걸렸다가 빠져나옴)

브라우저를 연 직후 `/settings` DOM을 읽어 §4 절차대로 대조했더니 **실제로 어긋나 있었다.**
표시 이름 "테스트계정2" · 핸들 "chopin_0625"가 보였다 — 이건 `0625chopin@gmail.com`
(profile `fb70ff1c-…`)이다. 팀장이 전달한 "DESIGN이 방금 쓴 세션은 chopin0625"라는 정보와
실제 DOM 값이 어긋났다(원인 미확인 — DESIGN 보고 시점과 내가 확인한 시점 사이에 세션이
바뀌었을 수도, 정보 전달 오류일 수도 있다, 추적하지 않았다). `/settings`의 "크루별 알림"
목록에도 홈쿠킹 클럽이 없어 SQL 사실(`fb70ff1c`은 그 크루 비멤버)과 일치 — DOM 관찰과 SQL이
서로를 검증했다.

**정정**: 로그아웃 → `chopin0625@gmail.com`/`qwer1234` 재로그인 → `/settings`에서 표시
이름 "테스트계정1" · 핸들 "chopin0625" 확인, "크루별 알림" 목록에 알고리즘 스터디·홈쿠킹
클럽 둘 다 포함됨을 재확인 — 계획서가 지정한 계정으로 정정 완료. **재로그인 후 대조한
profile UUID는 `30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a`다**(§4 표의 `chopin0625@gmail.com`
행과 일치, SQL로 재확인) — "재로그인했다"가 아니라 이 UUID 일치를 실측값으로 남긴다.
**이 절차가 없었다면 두 번째 poll을 "화면 결함"이 아니라 "권한 없음"으로 오판할 뻔했다**
— 33일차 교훈이 이번에도 실제로 가짜 양성을 막았다.

**절차 강화(팀장 지시, 34일차)**: 이번에 어긋난 것은 브라우저의 "잔존 세션"이 아니라
**팀장이 전달한 "직전 세션 계정" 정보 자체**였다 — 팀장은 DESIGN 보고서의 서술 순서
(오너 persona가 먼저 적히고 비소속자 persona가 나중에 적힘)를 실행 순서로 오독해 "직전
세션은 `chopin0625`"라고 전달했지만, 실제로는 DESIGN이 잔존 세션(`chopin0625`)으로
비소속자를 먼저 보고 그 뒤 `chopin_0625`로 갈아탄 것이라 **최종 세션은 `chopin_0625`**였다.
**실렌더 전 세션 대조는 "잔존 세션"뿐 아니라 "인계받은 세션 정보"도 대상이다.** 34일차에
팀장이 전달한 직전 세션 계정이 실제와 달랐고(문서 서술 순서를 실행 순서로 오독), 절차를
생략했으면 대상 poll 2건 중 하나가 `forbidden`으로 막혀 "화면 결함"으로 오판될 수 있었다.
"인계받은 정보라서 검증을 생략해도 된다"는 예외는 없다 — 33일차엔 잔존 세션이, 34일차엔
전달받은 정보가 각각 걸렸고 둘 다 같은 SQL 대조 절차 하나로 잡혔다.

### 6.1 URL별 원시 관측값

**URL 1** — `/crews/f202047b-2478-43bd-a30c-60f082ccba8e/board/379c5f4f-519e-447e-a1f6-dbd8388f9d76`
(알고리즘 스터디, chopin0625 role=staff):

```
배지 텍스트: "부결"
사유: "찬반 동수로 부결되었습니다"
"참여 2명 / 대상 5명"
"정족수 충족"
"정족수 2명"
찬성 1 / 반대 1 / 기권 0
```

§1·§3 기대값과 **전부 일치**. 콘솔 0 errors(경고 1건은 무관한 CSS preload 경고). `null`/
`undefined`/`NaN`/`[object Object]` 없음.

**URL 2** — `/crews/863e8ff0-f2b0-4c8e-9e9b-19959f216ac4/board/e2736eb9-9259-4122-82ba-b80dd11ab89f`
(홈쿠킹 클럽, chopin0625 role=**member**):

```
배지 텍스트: "가결"
사유: "정족수 충족 · 찬성 우세로 가결되었습니다"
"참여 4명 / 대상 1명"   ← §1 SQL 진실값(대상 4명)과 불일치
"정족수 충족"
"정족수 1명"            ← §1 SQL 진실값(정족수 2명)과 불일치
찬성 4 / 반대 0 / 기권 0
```

배지·사유·찬반기권 숫자는 일치하지만 **"대상"·"정족수" 두 숫자가 SQL 진실값과 다르다.**
콘솔은 여기도 0 errors, 플레이스홀더 오염 없음 — "조용히 틀린 숫자"라 콘솔에는 아무 흔적이
안 남는다.

### 6.2 불일치 근본 원인 — 코드 추적으로 확정(추정 아님)

`PollPanelContainer.tsx`가 `eligibleVoterCount`를 `countQuorumEligibleVoters(voters)`로
계산하고, `voters`는 `listEligibleVotersWithCurrentStatus(poll.id)`
(`src/lib/data/supabase/poll.ts:87-141`)가 채운다. 이 함수는 `poll_eligible_voters` 테이블을
PostgREST로 **직접** 조회한다(`SECURITY DEFINER` RPC를 경유하지 않는다). 그 테이블의 실제
SELECT RLS 정책(`pg_policies`로 확인):

```
poll_eligible_voters_select_self_or_staff:
  profile_id = auth.uid()
  OR (그 poll이 속한 크루에서 auth.uid()가 role IN ('staff','owner')인 active 멤버)
```

**즉 "member" 역할은 자기 자신의 스냅샷 행 1개만 볼 수 있다.** chopin0625는 알고리즘
스터디에서 staff라 poll 1은 전체 5행이 보였고, 홈쿠킹 클럽에서는 member라 poll 2는 자기
행 1개만 보였다 — `eligibleVoterCount = 1`, `required = ceil(1/3) = 1`이 그 결과다.
**RLS를 원인 후보에서 배제하지 않고 role-시뮬레이션 SQL로 직접 확인**했다(begin/rollback,
`request.jwt.claims`로 `auth.uid()`를 `30f44dd9-…`로 설정 후 같은 조건으로 조회) — RLS
없이(service role) 집계한 §1 표의 4행과 달리, **RLS를 chopin0625(member)로 시뮬레이션하면
정확히 1행만 반환됨을 SQL로 재현**해 이 원인이 추정이 아니라 확정임을 검증했다. 대조로
`getPollTally`(찬성/반대/기권/참여자 수)는 `public.poll_vote_tally` RPC(`SECURITY DEFINER`)를
경유해 RLS를 우회하므로 정확했다 — **같은 화면 안에서 어떤 숫자는 RPC를 거쳐 맞고, 어떤
숫자는 원본 테이블 직접 조회라 role에 따라 조용히 틀린다**는 것이 이 결함의 구조다.

**영향 범위**: `eligibleVoterCount`·`quorumRequired`·`quorumMet`은 `open` 상태의
`PollTally`(진행 중 집계)에도 같은 함수·같은 RLS로 공급되므로, **닫힌 poll뿐 아니라 진행
중인 poll에서도 일반 멤버(staff/owner가 아닌 전원)에게 "대상자 수"·"정족수" 배지가 항상
틀리게 보일 것으로 추정된다**(코드 경로는 동일 — 이번 회차엔 poll 1·2가 둘 다 `closed_*`라
`open` 상태 화면으로는 실측하지 못했다, 다음 사람 확인 필요).

**D-054 원 우려(판정값 자체의 위조)와는 다른 결함이라는 점을 명확히 한다**: `poll.status`/
`poll.result` 배지(부결/가결)는 트리거가 확정한 DB 값을 그대로 쓰므로 **이번에도 정확했다**
— I-089/D-054가 걱정한 "판정 자체"는 이번 실측에서 위조·오염 없음(§0의 Tier A 목적 그대로
결론). 이번에 새로 발견한 건 판정을 뒷받침하는 **"근거 숫자"(대상자 수·정족수)가 role에
따라 RLS로 조용히 축소된다**는 별개의 결함이다. 다만 정족수 요구치가 실제보다 작게
보이면(`required`가 과소평가) "정족수 충족"이 실제보다 쉽게 보이는 방향의 오차라 신뢰도
문제로서는 가볍지 않다 — 이번 poll 2건 모두 `participant ≥ 진짜 required`라 표시된 배지
자체는 우연히 안 틀렸지만, 참여자가 적은 poll에서는 "정족수 충족"이 잘못 표시될 수 있는
구조다.

### 6.3 이슈 등재

D-082에 따라 번호 없이 `docs/ISSUES.draft.BOARD.md`에 신규 이슈로 기록했다(§9 아래 별도
후속 절 참고, 번호는 팀장이 마감에 부여).

### 6.4 최종 판정

- **(A) 판정값(배지 부결/가결·부결 사유) 자체는 SQL 진실값·순수 함수 판정과 일치 — 위조
  없음.** I-089/D-054가 찾던 "판정 위조가 화면에 보이는가"는 **2건 다 부정** — Tier A
  목적은 달성했다.
- **(B) 그러나 그 판정을 뒷받침하는 "대상자 수"·"정족수" 표시가 role(member vs staff/owner)에
  따라 RLS로 조용히 틀려진다는 새 결함을 발견했다.** poll 2(member 시점)에서 재현, poll
  1(staff 시점)에서는 재현되지 않음 — role 차이가 원인임을 대조로 확인.
- 체크리스트: 세션 계정 대조(1차 불일치 발견·정정) 완료 / URL 2개 실측 완료 / 반증용 탐색
  (null·undefined·NaN·`[object Object]`) 2 URL 모두 0건 / 콘솔 에러 2 URL 모두 0건(무관한
  경고 1건) / 최종 판정 위와 같이 완료.

## 7. 후속 — §6.2 결함, 같은 회차에 (A) 릴리스 차단으로 수정 완료

§6.2가 발견한 `poll_eligible_voters` RLS role별 축소 결함을 팀장이 (A)로 재분류해 같은
34일차 안에 수정까지 마쳤다. 이 문서는 **Tier A 실렌더 산출물**이라 실렌더 결과(§6)는
그대로 두고, 수정 경위·검증은 별도 문서에 둔다:

- **이슈 경위·해소 상세**: `docs/ISSUES.draft.BOARD.md` — `poll_eligible_voters` 결함
  항목과, 조사 중 별도로 발견한 더 심각한 결함(`cast-vote.ts` 트리거③이 일반 멤버 투표마다
  poll을 조기 종료하는 것) 항목 둘 다.
- **설계 결정**: `docs/DECISIONS.draft.BOARD.md` — "투표 여부는 익명 카운트로만, 신원과 절대
  안 묶는다"는 새 결정(재식별 벡터 봉쇄 근거 포함).
- **마이그레이션**: `20260730145738_poll_eligible_voters_with_status_rpc_i089.sql`·
  `20260730145758_poll_eligible_voter_progress_rpc_i089.sql`.

**Tier A 본래 결론(§6.4)은 그대로 유효하다** — "판정값(배지·사유) 자체의 위조는 없다"는
이 감사가 원래 찾던 것이었고, 그건 확인됐다. §6.2에서 발견한 것은 그 판정을 뒷받침하는
**보조 지표(대상자 수·정족수 표시)**와, 조사 과정에서 우연히 드러난 **판정이 내려지는
시점 자체(트리거③)의 결함**이었다 — 둘 다 D-054가 원래 찾던 "판정 위조"와는 다른 종류의
문제였지만 심각도는 오히려 더 컸다(특히 후자).
