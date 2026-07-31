# I-143 해소 — 자진 철회 함수 2곳의 `TRANSITIONS` 경유 재작성 (30일차, CREW)

## 배경

`docs/ISSUES.md` I-143: 크루 멤버십 **자진 철회** 함수 2곳
(`src/lib/data/mock/crew.ts`의 `withdrawPendingCrewMembership`,
`src/lib/data/supabase/join-request.ts`의 `withdrawJoinRequest`)이
`src/lib/rules/crew-membership-transition.ts`의 `TRANSITIONS`(2.4절 상태 전이 단일 소스,
NFR-036)를 우회해 상태를 하드코딩하고 있었다. 하드코딩 값이 `TRANSITIONS` 산출값과
우연히 같아 지금은 잘못된 동작이 없지만, 두 정의가 미래에 갈라지면 조용히 어긋날 위험이
있었다(R-015).

## 1. Mock — `withdrawPendingCrewMembership` 재작성

**변경 전** (`src/lib/data/mock/crew.ts:362-375`):

```ts
if (membership.status !== "requested") {
  return err("conflict", ...);
}
membership.status = "rejected";
```

**변경 후**:

```ts
const next = transitionCrewMembershipStatus(membership.status, "reject_request");
if (!next) {
  return err("conflict", ...);
}
membership.status = next;
```

같은 파일의 `rejectCrewMembership`(임원 반려, FR-023)과 정확히 같은 이벤트
(`reject_request`)를 공유하도록 맞췄다 — 두 함수는 "누가 끝냈는지"만 다를 뿐(`JoinRequest.
decidedBy`로 구분, I-040) 멤버십 쪽 전이 자체는 항상 같았다는 사실이 이제 코드에도 드러난다.

### 동작 동일성

`TRANSITIONS.requested.reject_request === "rejected"`이고, 이 전이는 `requested` 상태에만
정의돼 있어 그 외 상태에서는 `transitionCrewMembershipStatus`가 `null`을 반환한다
(`crew-membership-transition.ts:92-95`). 즉:

- 가드 조건: 이전 `!== "requested"` ⇔ 이후 `next === null`(같은 조건 — `requested`에서만
  이벤트가 정의됨)
- 대입값: 이전 `"rejected"` 리터럴 ⇔ 이후 `next`(항상 `"rejected"`, `requested`에서
  `reject_request`가 정의하는 유일한 목적지)

두 표현은 외연적으로 동일하다. `src/lib/rules/crew-membership-transition.test.ts`(신규)에
`requested --reject_request--> rejected`와 그 외 상태에서의 `null` 반환을 vitest로 고정했다
— `npm test` 37건 전부 통과(신규 3건 포함). `npx tsc --noEmit` 0 errors, `npx eslint`도
해당 파일 기준 0 warning.

## 2. Supabase — `withdrawJoinRequest` / `withdraw_join_request` RPC는 경유시키지 않는다

**결론: 경유가 자연스럽지 않다 — 대신 SQL이 `TRANSITIONS`와 같은 결론을 내는지 별도로
재확인하는 쪽을 택했다.**

`withdraw_join_request` RPC(`supabase/migrations/20260730033748_i141_withdraw_join_request_
atomic_rpc.sql`, 29일차 CORE가 I-141 해소로 신설)는 `crew_memberships` 되돌리기를 PL/pgSQL
안에서 직접 수행한다:

```sql
update public.crew_memberships cm
set status = 'rejected'
where cm.crew_id = v_row.crew_id
  and cm.profile_id = v_requester
  and cm.status = 'requested';
```

`src/lib/data/supabase/join-request.ts`의 `withdrawJoinRequest`는 이 RPC를 호출만 할 뿐
— 상태 전이 자체는 DB 트랜잭션 안에서 이미 끝나 있다. TS 쪽 `TRANSITIONS`를 이 함수가
"경유"하게 만들려면 RPC 호출 **전에** `transitionCrewMembershipStatus`로 사전 계산해 그
결과를 SQL에 파라미터로 넘기는 식이 돼야 하는데, 이러면:

- 판정을 앱 레이어에서 미리 내리고 SQL은 그 값을 그대로 쓰기만 하는 이상한 이중 구조가 된다
  (I-071이 이미 지적한 "TS·SQL 이중 구현" 문제를 새로 하나 더 만드는 방향).
- 어차피 SQL의 `where cm.status = 'requested'` 가드가 동시성 하에서 최종 방어선이라
  (같은 트랜잭션 안의 조건부 UPDATE), TS가 미리 계산한 값을 신뢰하고 건너뛸 수 없다 — 결국
  SQL이 다시 같은 조건을 검사해야 해서 "경유"의 실익이 없다.

그래서 **대체 해소 조건**(I-143 원문이 이미 예견한 "SQL이 TRANSITIONS와 같은 결론을 내는지
SQL 쪽에서 별도로 재확인")을 택했다. 위 SQL을 읽고 대조한 결과:

| | TRANSITIONS (TS) | `withdraw_join_request` RPC (SQL) |
|---|---|---|
| 허용 조건 | `current === "requested"` | `cm.status = 'requested'` |
| 목적지 | `"rejected"` | `status = 'rejected'` |

일치한다. 이 표를 대체 해소 조건의 실측 근거로 남긴다 — 코드를 바꾸지 않았다(CORE가 29일차에
같은 RPC를 방금 만들었고, 이번 배정도 "실데이터 경로는 DB RPC가 상태를 바꾼다"는 전제
아래 경유 지점이 실제로 있는지만 먼저 확인하라고 명시했다).

## 3. 중요 발견 — Mock `withdrawPendingCrewMembership`은 이미 죽은 코드다

작업 중 `src/lib/data/index.ts`(데이터 레이어 유일한 배럴)를 확인한 결과, **Task 032
(18일차)부터 9개 도메인 전부 `./supabase/<domain>`만 재노출하고 `./mock/*`는 이 배럴에서
전혀 재노출되지 않는다**(`index.ts` 10-14행 docstring). 앱 코드(`src/actions/**`·서버
컴포넌트·컨테이너)는 오직 이 배럴을 통해서만 데이터 레이어를 쓰므로(딥 임포트는
`eslint.config.mjs` zone 4·5·6이 차단), **`mock/crew.ts`의 `withdrawPendingCrewMembership`을
가리키는 import가 저장소 전체에 하나도 없다**(`grep` 재확인 — 정의 파일 자신의 docstring
인용 외 실제 import 0건). `withdraw-join-request.ts`(Server Action)의 docstring도 "Task
032(18일차) — `withdrawPendingCrewMembership` 호출을 제거했다"고 이미 밝히고 있다.

즉 이 함수는 **실행 경로가 전혀 없는 상태로 8일 넘게 남아 있었다.** 이번 재작성이 실사용자
동작에 미치는 영향은 정확히 0이다(어차피 아무도 호출하지 않으므로) — 하지만 이슈가 우려한
"정의(`TRANSITIONS`)와 사용(하드코딩)이 갈리는" 패턴 자체는 죽은 코드에도 여전히 존재했고,
다음에 이 함수를 되살려 쓸 사람(예: Mock 전용 통합 테스트, `/sample` 확장)이 있다면 그
시점에 조용히 어긋난 채로 부활할 뻔했다 — 그래서 지시대로 재작성하는 편이 맞다고 판단했다.
함수를 삭제하지 않은 이유: 팀장 지시 범위가 "규칙 함수 호출로 교체"였고, Mock↔Supabase
시그니처 동일성(NFR-034/035)을 지키는 관례상 다른 도메인도 죽은 대칭 함수를 즉시 지우지
않는 선례가 있다(`docs/decisions/write-path-realdata-032.md` "crew 도메인에서 사라진 5개
함수" 절 — 그쪽은 아예 배럴 재노출을 끊었지 소스 파일을 지우지는 않았다). 삭제 여부는
번호 없이 후속 이슈 후보로만 남긴다(`docs/ISSUES.draft.CREW.md`).

## 4. D-086 대안 B(`withdraw_request` 이벤트 신설) 재검토 판정

**한 줄 판정: 이번 재작성으로도 대안 B는 여전히 "죽은 타입"을 피하지 못한다 — 재검토
조건이 채워지지 않았다.**

근거: 29일차 판정의 핵심은 "이벤트만 추가하면 경유하는 코드가 없어 죽은 타입이 된다"였다.
이번에 Mock 함수는 `TRANSITIONS` 경유로 바뀌었지만 **기존 이벤트(`reject_request`)를 그대로
쓰도록만 바꿨다** — 새 `withdraw_request` 이벤트를 만들지 않았다(그럴 필요가 없었다, 위 1절
참고). 설사 다음에 `withdraw_request`를 추가하고 이 Mock 함수가 그 이벤트를 쓰도록 한 글자
바꾼다 해도, §3에서 확인했듯 **이 Mock 함수 자체가 데이터 배럴에서 재노출되지 않는 죽은
코드**라 "살아있는 소비자"가 되지 못한다. 그리고 실제로 살아있는 자진 철회 경로(Supabase
`withdraw_join_request` RPC)는 §2에서 확인했듯 **PL/pgSQL 안에서 직접 UPDATE하는 구조라
TS 유니온 타입을 애초에 소비할 수 없다** — 이 경로가 대안 B를 채택할 진짜 이유가 되려면
RPC 자체를 TS 판정에 의존하는 구조로 다시 짜야 하는데, 그건 대안 A(상태 유니온 확장)에
준하는 큰 비용이라 이번 재작성 범위를 넘는다. 결론적으로 대안 B의 재검토 선행조건("경유하는
살아있는 코드가 생긴다")은 이번 작업으로 채워지지 않았고, 계속 보류가 맞다.

## 결과 요약

- `src/lib/data/mock/crew.ts`: `withdrawPendingCrewMembership`을 `TRANSITIONS` 경유로 재작성.
- `src/lib/rules/crew-membership-transition.test.ts`(신규): `reject_request` 전이 동일성 테스트.
- `src/lib/data/supabase/join-request.ts` / `withdraw_join_request` RPC: 코드 변경 없음 —
  SQL이 `TRANSITIONS`와 같은 결론을 내는지 §2 표로 재확인.
- D-086 대안 B: 이번에도 재검토 조건 미충족, 보류 유지.
- 부수 발견: Mock `withdrawPendingCrewMembership`은 Task 032(18일차)부터 죽은 코드 —
  삭제 여부는 번호 없이 후속 이슈 후보로 남김(`docs/ISSUES.draft.CREW.md`).
