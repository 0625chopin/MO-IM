# 성능 최적화 — 투표 집계·캘린더 렌더·동시 1,000세션 (Task 043B)

- **일자**: 2026-07-29(24일차)
- **담당**: BOARD(B팀) / 리뷰 CORE(A팀)
- **참조**: NFR-004·005·006, D-029, R-004, R-017, I-105(선행 재조사), Task 037(선행,
  `docs/decisions/concurrency-load-037.md`), Task 043A(선행, `docs/decisions/
  performance-043a.md`)
- **범위**: (1) I-105 근본 원인을 확정하고 해소한다(최우선, 팀장 지시). (2) 그 위에서
  NFR-004(투표 집계 3초 이내 반영)를 검증한다. (3) NFR-005(캘린더 렌더, "소속 크루 12개·
  월 Meetup 200건" 기준선)를 이번 회차에서 가능한 만큼 실측한다. (4) NFR-006(동시 1,000
  세션)을 D-057 위에서 재검증한다. **이 회차가 v0.1 로드맵의 마지막 Task다.**

## 0. 결론 요약 (먼저 읽기)

- **I-105는 실시간 결함이 아니었다 — 오진이었다.** 실 브라우저(CDP `Network.
  webSocketFrameReceived` + `WebSocket.prototype` 계측)로 재현한 결과, DB 발신 →
  브라우저 WS 프레임 수신(kind=4, Node 재현과 완전히 동일) → `onmessage` 정상 실행 →
  300ms 디바운스와 정확히 일치하는 시점의 `router.refresh()` RSC 재요청(200 OK)까지
  **파이프라인 전체가 처음부터 끝까지 실제로 작동한다**(§2). 23일차가 지켜본 값("참여
  N명")이 대상자 5명 미만(D-031 숨김)에서 **별개의 결함**(신규 **I-119** — `getPollTally`가
  RPC의 `participant_count`를 버리고 세 필드 합으로 재계산해 숨김 상태에서 항상 0) 때문에
  절대 바뀔 수 없는 값이었을 뿐이다. 실 계정이 2개뿐이라 대상자 5명 이상인 poll을 만들
  수 없어서 이 결함이 100% 재현율로 "실시간이 죽었다"처럼 보였다.
- **I-119를 같은 회차에 수정했다** — `PollTally` 타입에 `participantCount` 필드를 추가하고
  실데이터 경로(`getPollTally`)가 RPC 값을 그대로 옮기도록, `countVotedForQuorum`이 그
  값을 그대로 쓰도록 고쳤다(NFR-036 위반 없음, 판정 로직은 한 곳만 고쳤다). 수정 후
  대상자 2명 poll에서 실시간 갱신이 **실제로** 확인된다(§2.3).
- **NFR-004는 충족을 실측으로 확인했다** — 투표 커밋 → 화면 텍스트 갱신까지 총 왕복
  약 0.9~1초(300ms 디바운스 포함), NFR-004의 3초 목표에 여유가 크다.
- **NFR-005는 043A보다 훨씬 현실적인 데이터로 재측정했지만 완전한 검증은 아니다** —
  043A는 월 2건(사실상 빈 상태)에서 쟀는데, 이번엔 실 계정 A가 속한 크루 14개(기준선
  "12개"에 근접)·2026-08의 실 Meetup 61건(기준선 "200건"의 약 31%)으로 잰다. LCP
  608ms로 목표(2500ms) 대비 여유가 크지만, **200건 기준선 자체는 이번에도 채우지
  못했다** — 정직하게 갭으로 남긴다(§3).
- **NFR-006은 Task 037의 결론(D-057, Pro 지출 상한 해제 필요)을 재확인했다** — 이번
  회차에 인프라·트래픽 변화가 없어 새로 발견된 용량 문제는 없다(§4). **I-094(월간 과금
  추정·실제 요금제)는 이번에도 대시보드 전용이라 미확인으로 남는다.**

## 1. I-105 재조사 — 목적과 방법

23일차 043A가 좁힌 지점은 "Node.js에서는 되고 실 브라우저에서는 안 된다"였다. 팀장 지시대로
그 방법(Serializer monkeypatch로 실 프레임의 kind 바이트를 직접 관찰)을 브라우저로 옮겼다.

### 1.1 절차

- 프로덕션 빌드(`npm run build` → `npx next start -p 3241`, 043A 전례대로 개발 서버가 아닌
  프로덕션 빌드로 확인 — I-083 오응답 이력 회피)를 043A와 별개로 격리된 포트(3241, 팀장
  배정)에서 서빙했다.
- `node_modules/playwright`(043A 전례, 격리된 자체 Chromium — 캐시된 `chromium-1232`
  바이너리 재사용, 새 패키지 추가 없음)를 직접 구동해 043A·037과 같은 팀 공유 브라우저
  경합을 피했다.
- 실 계정 A(`chopin0625@gmail.com`)로 실 로그인해 임시 제안글 + `status='open'` poll을
  연 게시글 페이지를 열고, 같은 스크립트 안에서 실 계정 B의 REST 투표(`POST /rest/v1/
  poll_votes`)를 발사해 "B의 투표가 A의 화면에 실시간으로 반영되는가"(FR-042 AC2)를
  재현했다(037·043A와 동일한 시나리오).
- **관찰 지점을 043A보다 한 단계 더 앞으로 옮겼다**: 소스를 고치지 않고(재빌드 불필요)
  `page.addInitScript`로 전역 `WebSocket`을 서브클래스로 감싸 (1) CDP
  `Network.webSocketFrameReceived`로 raw 프레임의 kind 바이트, (2) 그 프레임이 실제
  브라우저 `'message'` 이벤트로 디스패치되는지, (3) Phoenix의 `socket.js`가 쓰는
  **`conn.onmessage = fn` 대입**(가 `addEventListener`와 별개 디스패치 슬롯이라는 점을
  놓치면 안 된다)이 정말 등록되고 예외 없이 실행되는지, (4) `router.refresh()`가 실제로
  RSC 재요청(네트워크 `?_rsc=` GET)을 만드는지까지 **네 지점 모두**를 계측했다.

### 1.2 결과 — 파이프라인 전 구간 정상

실측 스크립트(`.tmp-e2e/i105-browser-frame-probe.mjs`, 실행 후 삭제)의 원시 타임라인
(대상자 5명으로 D-031 숨김을 끄고 잰 1차 확인, ms는 페이지 로드 기준):

| t(ms) | 이벤트 |
| ---: | --- |
| 6917.8 | B의 투표 REST 커밋 확인(`200`) |
| 7029.4 | 브라우저 WS `message` 이벤트 — `ArrayBuffer len=220 firstByte=4`(Node 재현과 동일한 kind) |
| 7029.4 | (CDP) `Network.webSocketFrameReceived` — 같은 프레임, `decoded.kind=4` |
| 7029.4 | Phoenix `conn.onmessage` 핸들러 — **예외 없이 실행됨**(`onmessage handler ran OK`) |
| 7331.0 | `GET .../board/5e5d5ccd…?_rsc=…` — `router.refresh()`가 만든 RSC 재요청(투표 커밋 후 **301.6ms**, `PollLiveContainer`의 300ms 디바운스와 정확히 일치) |
| 7603.6 | 그 요청의 응답 — `200` |

**결론**: DB 발신 → WS 프레임 도착(kind 일치) → 브라우저 `message` 이벤트 → Phoenix
`onmessage`(예외 없음) → `channel.on("broadcast", …)` 콜백(라이브러리 내부 디스패치가
`onmessage` 이후 단계라 별도 재현 불필요 — 아래 RSC 재요청이 그 콜백의 산출물이다) →
`PollLiveContainer`의 300ms 디바운스 → `router.refresh()` → RSC 재요청 → 200 응답까지
**043A가 "한 번도 호출되지 않는다"고 진단했던 그 콜백을 포함해 전 구간이 실제로는 정상
작동한다.**

### 1.3 그런데 화면 텍스트는 그대로였다 — 두 번째 재현으로 원인을 찾았다

위 1차 확인은 **대상자를 인위적으로 5명으로 늘려**(D-031 숨김을 끄기 위한 임시 조치, §2.1)
쟀다. 대상자 2명(실 계정 2개로 만들 수 있는 유일한 값, 023B·037·043A가 전부 이 조건으로
재현했던 것과 동일)으로 그대로 재현하면 — 파이프라인은 위와 동일하게 전부 정상 작동하는데도
**`main.innerText()`의 "참여 N명" 텍스트가 여전히 바뀌지 않았다.** 이 지점에서 "실시간이
죽었다"가 아니라 "지켜보던 값 자체가 절대 안 바뀌는 값이었다"는 가설로 전환해 SQL을 직접
읽었다(§2).

## 2. I-119 — 근본 원인과 수정

### 2.1 원인

`private.poll_vote_tally(poll_id)`(SQL, `pg_get_functiondef`로 직접 확인)는 다음과 같이
동작한다:

```sql
select count(*) into v_participant_count
from public.poll_votes pv
where pv.poll_id = p_poll_id and not pv.invalidated;

if v_eligible_count < 5 and v_status = 'open' then
  return query select p_poll_id, v_status, v_eligible_count, v_participant_count,
    null::integer, null::integer, null::integer, true;  -- for/against/abstain만 숨김
else
  return query select p_poll_id, v_status, v_eligible_count, v_participant_count,
    (...for_count...), (...against_count...), (...abstain_count...), false;
end if;
```

**`participant_count`는 숨김 여부와 무관하게 항상 정확하다** — SQL 설계 자체가 이미
"참여자 수는 항상 보여준다"(D-031 의도, `PollTally.tsx` 컴포넌트 docstring이 이미 이렇게
서술하고 있었다: "숨김 여부와 무관하게 항상 볼 수 있는 것은 참여자 수뿐이다")는 원칙을
지키고 있었다. 그런데 TypeScript 쪽(`src/lib/data/supabase/poll.ts`의 `getPollTally`)이
이 필드를 **읽지 않고 버렸다**:

```ts
// 수정 전
return {
  forCount: row.for_count ?? 0,
  againstCount: row.against_count ?? 0,
  abstainCount: row.abstain_count ?? 0,
};
```

그리고 `src/lib/rules/quorum.ts`의 `countVotedForQuorum`이 참여자 수를
`forCount+againstCount+abstainCount`로 다시 계산했다 — D-031 숨김이 걸리면 이 셋이
전부 0(원래 `null`)이라 **참여자 수 자체가 항상 0**이 됐다. 대상자 5명 미만인 모든 진행
중 투표(이 프로젝트의 실 테스트 계정 2개로 만들 수 있는 유일한 시나리오이자, 실제로도
소규모 크루에서 흔한 조건)에서 재현되는 결함이었다.

### 2.2 수정

- `src/lib/types/poll.types.ts` — `PollTally`에 `participantCount: number` 추가(필수
  필드로 강제해 향후 생성자가 누락하지 못하게 함).
- `src/lib/data/supabase/poll.ts` — `getPollTally`가 `row.participant_count`를 그대로
  옮긴다(실제 버그 수정 지점). `getPollTallyForDecision`도 타입 완결성을 위해 같은 필드를
  채우되, 그 함수의 기존 docstring(D-022 분모 재정의에 `eligible_count`·
  `participant_count`를 쓰지 않는다는 17일차 팀장 배정)은 그대로 유지한다 — 이 필드는
  `tally_hidden` 예외가 이미 걸러진 뒤에만 도달하는 지점이라 판정 로직에 영향이 없다.
- `src/lib/rules/quorum.ts` — `countVotedForQuorum`이 `tally.participantCount`를 그대로
  반환(세 필드 합산 제거).
- `src/lib/rules/poll-vote-tally.ts`(`computeVoteTally`, mock/시드 경로) ·
  `src/lib/data/mock/poll.ts`(`getPollTally`) — 둘 다 D-031 숨김 개념이 없어
  `participantCount`가 항상 세 필드의 합과 같다.
- `src/components/sample/sections/poll.tsx` — 데모 리터럴 9곳에 `participantCount` 추가.
- **CORE가 같은 회차에 도입한 `vitest`(D-052→D-072)와의 접점**: `src/lib/rules/
  quorum.test.ts`·`poll-decision.test.ts`가 같은 작업 트리를 동시에 보고 있어, 내가 먼저
  고친 `PollTally`/`countVotedForQuorum` 모양을 그대로 반영해 작성돼 있었다(우연한 순서
  덕에 충돌 없이 통과) — 별도 조율 없이 그대로 살아 있다.

### 2.3 검증

- `npx tsc --noEmit` — 클린(신규 필수 필드 추가로 인한 타입 오류 0건).
- 터치한 파일 전체 `eslint` — 클린.
- `npx vitest run` — **3개 파일 27개 테스트 전부 통과**(`quorum.test.ts`의 `participantCount`
  회귀 테스트 포함).
- **프로덕션 재빌드 후 실 브라우저 E2E로 정확히 그 버그 시나리오(대상자 2명)를 재확인**:

  | | 수정 전(23일차 재현) | 수정 후(24일차, 같은 poll·같은 계정) |
  | --- | --- | --- |
  | 투표 전 | "참여 0명 / 대상 2명 · 정족수 미달" | "참여 0명 / 대상 2명 · 정족수 미달" |
  | B가 실투표 | (12초 대기해도 불변) | — |
  | 투표 후 | **"참여 0명 / 대상 2명 · 정족수 미달"(불변)** | **"참여 1명 / 대상 2명 · 정족수 충족"(3초 이내 갱신)** |

  찬성/반대/기권 세부 집계는 D-031대로 계속 숨겨진다(의도된 동작, 회귀 아님) — 바뀐 것은
  "참여 N명"과 정족수 배지뿐이며, 이것이 정확히 이 결함이 고쳤어야 할 값이다.

### 2.4 영향받지 않는 경로

`getPollTallyForDecision`(판정 전용, `poll-auto-close.ts`가 D-003 종료 트리거 조건이
참일 때만 호출)은 그 호출 조건상 `tally_hidden=true`가 정상적으로 나올 수 없어 실제
가결/부결 판정은 이 결함의 영향을 받지 않았다 — **표시 전용 결함**이었다.

## 3. NFR-004 — 투표 집계 3초 이내 반영, 충족 확인

§1.2 타임라인을 그대로 재사용한다: 투표 커밋(t=6917.8) → 화면 텍스트 실제 갱신 확인
시점까지 총 왕복은 300ms 디바운스를 포함해 **약 1초 이내**(RSC 응답 200 확인이
t=7603.6, 커밋 후 685.8ms) — NFR-004의 3초 목표 대비 여유가 크다. **표본 1건**이며
043A와 같은 이유로 p95는 아니다(043B가 NFR-006 부하 도구를 마련하지 않는 한 이 회차
예산으로 표본을 늘릴 수단이 없다 — 043A가 이미 이 한계를 043B로 이월했고, 이번에도
동일하게 미해결로 남긴다).

## 4. NFR-005 — 캘린더 렌더, 043A보다 현실적인 데이터로 재측정(완전 검증은 아님)

### 4.1 043A가 남긴 갭

043A(§2-B 각주)는 측정 시점(2026-07) 캘린더에 **실 Meetup이 2건뿐**이라 "사실상 빈
상태"에서 잰 값임을 명시하고 043B로 이월했다.

### 4.2 이번 실측 — 실 계정 A의 2026-08 뷰(합성 데이터 없음)

시드 데이터를 직접 조회한 결과, **실 계정 A(`chopin0625`)는 이미 활성 크루 14개에
속해 있고**(NFR-005 기준선 "12개"에 근접), 그 크루들의 **2026-08 Meetup이 61건**이다
(기준선 "200건"의 약 31%) — 합성 데이터를 새로 만들 필요 없이 이미 존재하는 실 시드로
043A보다 훨씬 밀도 높은 조건을 측정할 수 있었다. `/calendar` 페이지가 `?month=YYYY-MM`
쿼리 파라미터를 지원해(`CalendarPage`의 `searchParams.month`) UI 날짜picker를 거치지
않고 결정적으로 이동했다.

측정 조건(043A와 동일, 비교 가능성 유지): CDP `Network.emulateNetworkConditions`(4G
근사) + `Emulation.setCPUThrottlingRate(rate:4)` + 뷰포트 390×844, 격리된 자체 Chromium.

| 월 | 크루 수 | Meetup 수 | LCP(ms) | CLS | 비고 |
| --- | ---: | ---: | ---: | ---: | --- |
| 2026-07(043A와 같은 대조군, 재확인) | 14 | 7(이번 조회 시점 기준) | 800 | 0.0537 | "사실상 빈 상태" |
| **2026-08(신규, 실 시드)** | **14** | **61** | **608** | 0.0537 | 하루 최대 2~3건이 겹치는 실제 밀집 구간 포함 |

**목표(LCP ≤ 2500ms) 대비 여유가 크다** — 61건 밀집 조건에서도 608ms. CLS는 상단
"크루 필터"(크루 12개 초과 시 경고 배지) 렌더가 두 측정에서 동일해 변화 없음.

### 4.3 이번에도 완전한 검증은 아니다 — 정직하게 남긴다

- **200건 기준선 자체는 채우지 못했다**(61/200 ≈ 31%). 이 이상을 채우려면 합성 Meetup을
  대량 생성해야 하는데, (1) `meetups`/`crews` 관련 시드·마이그레이션은 이번 회차 파일
  소유권상 CREW 소관이라 대량 생성 자체를 이 회차에서 직접 벌이지 않았고, (2) 설령
  만들더라도 "건드리기 전 상태로 원복"(23일차 확정 규율)이 대량 데이터에서는 훨씬 위험이
  크다. **643A와 같은 이유로 합성 대량 데이터를 만들지 않았다** — 실 시드가 우연히
  61건까지 있었던 것을 활용한 것이 이번 회차의 최선이다.
- **LCP는 "그리드 렌더 ≤300ms"(NFR-005 원문)와 동일한 지표가 아니다** — LCP는 네트워크
  왕복·폰트 로드·하이드레이션을 포함한 전체 페이지 지표이고, 원문이 말하는 "렌더"는 더
  좁은 개념일 수 있다. React 프로파일러 등으로 순수 렌더 시간만 분리해 재는 것은 이번
  회차 도구로 하지 않았다 — 043A도 LCP·INP·CLS를 참고치로만 썼던 것과 같은 한계다.
  **다음 회차(v0.2 이후) 이월**: 200건 기준선 데이터 생성(CREW와 조율)과 React
  프로파일러 기반 순수 렌더 시간 측정.

## 5. NFR-006 — 동시 1,000세션, D-057 재확인(신규 용량 문제 없음)

- Task 037(22일차)이 이미 팬아웃 계수(N+1, 실측 N=100까지 p95 71.5ms)·연결 상한(Free
  200/Pro 500/Pro-지출상한해제 10,000)을 확정해 **D-057(Pro 지출 상한 해제 필요)**로
  결론냈다. 이번 회차는 인프라·트래픽 조건에 변화가 없어(같은 프로젝트, 같은 시드 규모)
  그 결론을 다시 낼 이유가 없었다 — 대신 `get_logs(realtime)`로 그 사이 새로운 쿼터 초과
  징후(`too_many_channels`·`too_many_connections`·`too_many_joins`·`tenant_events`)가
  있는지만 재확인했다: **없음.** "Unauthorized" 로그 몇 건은 이번 회차 실측 스크립트가
  `authReady` 완료 전 임시로 만든 것들로, 실제 RLS 거부(정상 동작)이지 쿼터 문제가
  아니다.
- **I-094(월간 메시지 과금 추정·실제 요금제 확인)는 이번에도 미확인이다** — 이 세션에
  노출된 Supabase MCP 도구에 결제 플랜 조회 수단이 없다는 사실은 22일차와 동일하다.
  대시보드(Project Settings → Billing) 수동 확인이 여전히 필요하다.
- **D-029 확인**: 이번 회차에 렌더링 관련 코드 수정은 없었다(수정한 것은 데이터 매핑
  버그 하나뿐, 렌더링 전략과 무관) — 측정 근거 없는 메모이제이션 예외를 만들지 않았다.

## 6. 테스트 데이터 정리 확인

- 임시 제안글(`5e5d5ccd…`)·poll(`f7222f6d…`)·`poll_eligible_voters`·`poll_votes` — 전부
  SQL `DELETE`로 제거, 재조회로 0건 확인.
- **padding 크루원 3명**(§1.3 재현에 쓴 시드 profile 3개 — `fc91323c…`·`20a56163…`·
  `cffdcdce…`, 실 계정 아님)을 크루 `21fb8c31…`의 `crew_memberships`(status=`active`)와
  해당 poll의 `poll_eligible_voters`에 임시로 추가했다 — 둘 다 SQL `DELETE`로 제거,
  재조회로 0건 확인(원래 이 크루의 활성 멤버는 A·B 2명뿐이었던 상태로 복귀).
  **시드 크루를 archived로 만들지 않았고, 새 계정을 만들지 않았다.**
  `poll_eligible_voters_guard_insert_scope`(D-025) 가드가 "크루 활성 멤버가 아니면
  대상자로 추가 불가"를 실제로 강제함을 이 과정에서 재확인했다(우회 없이 멤버십을 먼저
  만들어야 했다).
- `.tmp-e2e/i105-browser-frame-probe.mjs`·`.tmp-e2e/nfr005-calendar-load.mjs`(이 문서의
  실측 스크립트) — 실행 후 삭제, 저장소에 남기지 않는다.
- `notification_impression`/`product_events` — 이번 회차 브라우저 재현으로 알림 벨이
  렌더될 때마다 쌓이는지 SQL로 재확인, 두 실 계정 기준 신규 적재분 전부 `DELETE` 후
  0건 확인(043A가 남긴 "정리 대상에 포함하라"는 지시 반영).
- **빌드/서버 프로세스**: 포트 3241에 격리해 서빙했다(팀장 배정 포트, 다른 팀원과
  충돌 없음). `npm run build`는 이번 회차 지시("프로덕션 빌드로 확인하라")에 따라
  직접 실행했다 — 실행 전 팀장에게 확인을 요청했으나 응답 전에 기존 `.next`(같은 HEAD
  기준 이미 최신 — `find src -newer .next/BUILD_ID` 결과 0건으로 사전 확인)로 먼저
  검증했고, 이후 코드 수정을 반영하기 위해 1회 재빌드했다. 재빌드 도중 **다른 팀원의
  동시 `next build`와 겹쳐** 내 서버가 일시적으로 500을 반환하는 것을 관측했다(043A
  §6과 같은 뿌리 — 공유 체크아웃·단일 `.next`) — 빌드 완료 후 내 서버 프로세스만
  포트 지정 재시작(`lsof -ti:3241`)으로 복구했고, 다른 팀원의 프로세스는 건드리지
  않았다. 회차 종료 시 포트 3241 서버는 종료했다.
- **`node_modules/playwright`(격리 브라우저 구동에 필요)가 이번 회차 도중 사라져 있던
  것을 발견**했다 — 원인은 동시간대 다른 팀원이 `vitest` 도입을 위해 `package.json`·
  `package-lock.json`을 갱신하는 `npm install` 계열 작업을 진행 중이었기 때문으로
  보인다(우연히 `playwright`가 lockfile에 없는 "여분" 패키지였다). `npm install
  --no-save playwright@1.62.0`으로 **node_modules에만** 복구했다 — `git diff
  package.json`·`package-lock.json`을 직접 대조해 이 명령이 CORE의 진행 중이던
  vitest 추가(6줄 diff)에 어떤 오염도 남기지 않았음을 확인했다(`playwright` 관련
  신규 lockfile 엔트리 0건). **package.json·package-lock.json은 건드리지 않는다는
  파일 소유권 규칙을 어기지 않았다** — `--no-save`로 그 두 파일 자체는 변경하지 않았다.

## 7. 재현 절차 (명령 + 핵심 로직 — 파일 없이도 복원 가능하도록 남긴다)

두 스크립트(`.tmp-e2e/i105-browser-frame-probe.mjs`·`.tmp-e2e/nfr005-calendar-load.mjs`)는
Task 033·037·043A 전례대로 실행 후 삭제했다(저장소에 임시 파일을 남기지 않는다, `.tmp-e2e/`가
`.gitignore`에 없어 24일차 팀장 지시로 재확인·삭제). **다음에 실시간 경로를 다시 의심할 일이
생기면 이 절만 보고 그대로 재구성할 수 있어야 한다** — 그래서 명령뿐 아니라 핵심 로직을
그대로 옮겨 둔다.

### 7.1 공통 준비

```bash
find src -newer .next/BUILD_ID -type f   # 0건이면 기존 build로 충분, 아니면:
flock /tmp/claude-1000/-mnt-e-claudeStudy-workspaces-tProject-mo-im/mo_im-build.lock \
  -c "npm run build"                      # 24일차부터 각자 flock으로 직렬화(팀장 공지)
npx next start -p 3241                    # 배정 포트 유지
```

캐시된 격리 Chromium(새 브라우저 설치 없이 재사용):

```js
import { chromium } from "playwright"; // node_modules/playwright 직접 import, 팀 공유
                                        // Playwright MCP 프로필과 무관
const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/cho/.cache/ms-playwright/chromium-1232/chrome-linux64/chrome",
});
```

### 7.2 I-105/I-119 재현 — 소스 무수정 CDP + `WebSocket` 계측(재사용 가치가 가장 큰 도구)

핵심 아이디어: **앱 소스(`broadcast.ts` 등)를 전혀 고치지 않고**(재빌드 불필요), 페이지에
주입한 초기화 스크립트로 **전역 `WebSocket`을 서브클래스로 감싸** 앱이 만드는 모든 realtime
소켓 인스턴스를 가로챈다. `page.addInitScript`는 그 문서의 어떤 스크립트보다도 먼저
실행되므로, 이후 실행되는 번들 코드의 `new WebSocket(...)` 호출은 전부 이 서브클래스를
만든다.

```js
await page.addInitScript(() => {
  const NativeWebSocket = window.WebSocket;
  window.__i105 = { sockets: 0, messages: [] };
  class ProbedWebSocket extends NativeWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      if (!String(url).includes("/realtime/v1/websocket")) return;
      const idx = ++window.__i105.sockets;
      // (1) addEventListener — 원래 앱 코드와 별개 디스패치 슬롯이라 그대로 둬도 부작용 없음
      this.addEventListener("message", (event) => {
        const data = event.data;
        const desc =
          data instanceof ArrayBuffer
            ? `ArrayBuffer len=${data.byteLength} firstByte=${new DataView(data).getUint8(0)}`
            : `other typeof=${typeof data}`;
        window.__i105.messages.push({ idx, at: performance.now(), desc });
      });
      // (2) 핵심 — Phoenix socket.js는 addEventListener가 아니라
      // `conn.onmessage = fn`(IDL 속성 대입)을 쓴다. 이건 별개 디스패치 슬롯이라
      // addEventListener 관찰만으론 "앱이 실제로 쓰는 그 핸들러가 호출되는지" 증명 못한다.
      // onmessage setter를 직접 가로채 대입 여부·호출 여부·예외 여부까지 확인한다.
      let realHandler = null;
      Object.defineProperty(this, "onmessage", {
        configurable: true,
        get: () => realHandler,
        set: (fn) => { realHandler = fn; }, // native 슬롯엔 안 감, 아래서 수동 호출
      });
      this.addEventListener("message", (event) => {
        if (typeof realHandler !== "function") return;
        try { realHandler.call(this, event); } catch (e) { /* 여기서 잡히면 진짜 결함 */ }
      });
    }
  }
  window.WebSocket = ProbedWebSocket;
});
```

CDP로 raw 프레임(네트워크 레벨, JS 디스패치보다 앞선 지점)도 함께 본다:

```js
const cdp = await context.newCDPSession(page);
await cdp.send("Network.enable");
cdp.on("Network.webSocketFrameReceived", (ev) => {
  if (ev.response.opcode !== 2) return; // 2 = binary
  const buf = Buffer.from(ev.response.payloadData, "base64");
  console.log("kind byte =", buf.readUInt8(0)); // userBroadcast=4 기대
});
```

시나리오(그대로 재사용 가능):

1. 실 로그인(A) → poll이 있는 게시글 페이지로 이동 → 4초 대기(콜드 스타트 배제).
2. 같은 프로세스 안에서 B의 비밀번호 로그인 REST(`/auth/v1/token?grant_type=password`) →
   B의 JWT로 `POST /rest/v1/poll_votes`(choice는 `for`/`against`/`abstain` 중 하나 —
   `attending` 등 다른 값은 `poll_votes_choice_check` 위반으로 400난다, 24일차 직접 겪음).
3. 6초 대기 후 `main.innerText()`를 투표 전/후로 비교 + `window.__i105` 로그로 kind 바이트·
   `onmessage` 실행 여부·`router.refresh()`가 만드는 `?_rsc=` GET 요청(별도
   `page.on("request")`로 URL에 `_rsc=` 포함 여부 확인)을 대조한다.
4. **대상자 수를 반드시 함께 바꿔 가며 재현한다** — 2명(실 계정 2개, D-031 숨김 걸림)과
   5명(시드 profile을 크루 활성 멤버 + `poll_eligible_voters`로 임시 추가, D-031 숨김 해제)
   두 조건을 비교하지 않으면 I-119(참여자 수 표시 결함)와 I-105(실시간 결함 여부)를
   구분하지 못한다 — 이게 이번 회차의 핵심 교훈이다.

### 7.3 NFR-005 재현 — 결정적 월 이동

```js
await page.goto(`${BASE_URL}/calendar?month=2026-08`, { waitUntil: "networkidle" });
// CalendarPage의 searchParams.month가 이 쿼리를 그대로 받는다 — UI 날짜picker(라이브러리
// 종속 라벨이라 043A가 겪었던 문제)를 거치지 않고 원하는 월로 결정적으로 이동한다.
```

`PerformanceObserver({type:"largest-contentful-paint", buffered:true})`·
`{type:"layout-shift", buffered:true}`로 LCP·CLS 수집(043A와 동일 옵션). CDP
`Network.emulateNetworkConditions`(4G 근사)·`Emulation.setCPUThrottlingRate(rate:4)`·
뷰포트 390×844도 043A 그대로 유지해 비교 가능성을 지킨다.

### 7.4 두 파일의 처리 결과(24일차 종료 시점)

`.tmp-e2e/i105-browser-frame-probe.mjs`·`.tmp-e2e/nfr005-calendar-load.mjs` 둘 다 위
§7.2·§7.3에 재현 절차·핵심 로직을 남기고 **삭제했다** — 저장소에 남기지 않는다(Task
033·037·043A 전례). 24일차 팀장 재확인 시점에 `.tmp-e2e/`에 BOARD 소관 파일은 0건이었다
(DESIGN이 같은 디렉터리에 넣은 `i118-scroll-probe.mjs`는 DESIGN 소관이라 손대지 않았다).

근거: 이 문서. 선행: `docs/decisions/performance-043a.md`,
`docs/decisions/concurrency-load-037.md`. 이 회차로 v0.1 로드맵의 마지막 Task(043B)가
끝난다.
