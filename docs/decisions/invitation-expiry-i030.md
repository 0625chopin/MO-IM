# I-030 조사 — 초대 만료 시 짝 `crew_memberships` 상태 실측과 설계 후보 (+ I-114 보안 우회 발견·수정)

- **일자**: 2026-07-30(24일차)
- **담당**: CREW(A팀) — 팀장 배정. I-112(초대 DELETE 축)를 판 직후 같은 컨텍스트에서 이어 조사.
- **참조**: I-030(11일차 원 이슈)·I-091(21일차, 방법론)·I-107(23일차, "완결 지점만 막고
  진입점을 놓친" 결함 모양의 선례)·`docs/decisions/insert-axis-audit-102-103.md` §10(같은
  모양의 우회를 실 REST로 재현한 선례)
- **성격**: **이 문서는 결정 문서가 아니다.** §3의 실증된 보안 우회(I-114)는 이미 수정
  완료했지만, §4의 "만료 시 다음 상태가 무엇인가"는 요구사항 층위 결정이 필요해 **팀장이
  판단하거나 사용자에게 올려야 한다**(팀장 지시). 이 문서는 실측 결과와 후보안을 정리해
  전달하는 것이 목적이다.

## 1. 원 이슈(I-030) 요약

`requirements.md` 2.4절 상태 다이어그램은 `invited`에서 나가는 화살표를 `accept_invitation`
(→active)·`decline_invitation`(→declined) 둘로만 정의한다. `Invitation`은 `expiresAt`(발급
후 14일)과 `InvitationStatus`에 `"expired"` 값을 갖고 있는데, **그 시점에 이미 만들어져 있는
`invited` 상태 `crew_memberships` 행이 어떻게 되는지가 정의돼 있지 않다.**

## 2. 실측 ① — 현재 실 DB는 무엇을 하는가(가설 아님, `begin…rollback`으로 확인)

**결론: 아무것도 하지 않는다.** 만료는 순수하게 "계산된 상태"이고, DB에 저장된 값은 시간이
지나도 스스로 바뀌지 않는다.

- 마이그레이션·`pg_cron` job(`list_migrations`) 전수 확인 — `invitations.status`를
  `'expired'`로 바꾸는 배치·트리거가 **존재하지 않는다**(존재하는 job은
  `purge_expired_chat_messages`·`anonymize_expired_deactivated_profiles`·레이트리밋 카운터
  purge job뿐, 전부 `invitations`와 무관).
- 앱 코드 전수 검색(`src/lib/data/supabase/invitation.ts`, `src/lib/actions/*`) 결과
  `status: "expired"`를 쓰는 곳이 **0건**이다 — `"expired"`는 `InvitationStatus` 타입과
  Mock 시드(`generate-crews.ts`)에만 존재하고, 실 DB 쓰기 경로에는 없다.
- 실측: `expires_at`이 과거인 초대를 직접 INSERT(정당 경로 — RLS `with_check`가 `expires_at`
  값 자체를 검사하지 않는다, 이것도 이번에 처음 확인) → 성공, 대응하는 `crew_memberships`
  행이 정상적으로 `invited` 상태로 생성된다. **즉 이미 만료된 초대조차 발급 시점에 걸러지지
  않고 짝 멤버십 행이 만들어진다.**
- 결과적으로 **`invitations.status='pending'`이고 `crew_memberships.status='invited'`인
  행은, 응답 시각이 지나도 개입 없이는 영원히 그 상태로 남는다.**

## 3. 실측 ② — "만료됐지만 상태는 안 바뀐다"가 실제로 보안 문제를 만드는가 → 만든다(I-114, 이미 수정)

I-091(23일차)이 `invitations` UPDATE 경로에 만료 검사(`old.expires_at <= now()`)를 걸어
뒀지만, **`crew_memberships`의 self-service `invited→active` 직접 PATCH 경로는 그 검사를
전혀 참조하지 않는다는 것을 실측으로 발견했다** — I-107이 이미 닫은 "역할(role) 우회"와
정확히 같은 모양의 잔여 경로가, 이번엔 "만료" 규칙에 대해서도 있었다.

실 재현(신규 테스트 크루, `begin…rollback`):

1. A가 B에게 이미 만료된 초대 발급(성공 — 위 §2의 발견).
2. B가 `invitations` UPDATE로 수락 시도 → I-091 가드가 정상 거부.
3. **B가 `crew_memberships`를 직접 `PATCH {status:"active"}`** → **성공**(수정 전).

이 부분은 요구사항 층위 결정이 필요 없는 **명백한 버그**(FR-021 E1을 한쪽 경로에서만
지키고 다른 경로에서는 안 지킨 것)라 팀장 지시("실증으로 뚫리면 막아라")대로 즉시 마이그레이션
으로 수정했다 — `private.has_valid_pending_invitation()` SECURITY DEFINER 헬퍼를 추가해
`crew_memberships_guard_self_transition`의 `invited→active` self 분기에서 유효한(만료 안 된,
`pending`) 초대가 실제로 존재하는지 검사한다. 상세·회귀 검증 3종 표는 `docs/ISSUES.md`
**I-114** 참고.

**이 수정은 §4의 질문(만료 시 다음 상태가 무엇이어야 하는가)에 대한 답이 아니다** — "아직
결정되지 않은 정상 상태(`invited`가 계속 유지됨)"에서 부정 우회만 막았을 뿐이다. §4가 여전히
열려 있다.

## 4. 실측 ③ — 이 미정의가 만드는 실제 UX 문제(왜 "그냥 두면 안 되는가")

"받은 초대함"(`InvitationInboxContainer`, SC-20, FR-021·028) 화면을 추적한 결과:

```ts
const pendingInvitations = await listInvitationsForProfile(session.profileId, "pending");
```

이 조회는 **DB `status` 컬럼**으로만 필터링한다. `status`가 절대 `'expired'`로 바뀌지
않으므로, **몇 달 전에 만료된 초대가 오늘 막 도착한 초대와 똑같은 모습으로 영원히 목록에
남는다.** `InvitationCard`(`InvitationList.tsx`)도 `expiresAt` 값으로 UI를 미리 비활성화하지
않는다 — 사용자가 "수락"을 눌러야 비로소(`evaluateInvitationResponseEligibility`가 앱
레이어에서 `expired` 사유를 반환해) "만료된 초대예요" 메시지를 본다. **서버 액션의 에러
처리 자체는 이미 우아하다**(원시 DB 예외가 아니라 정확한 한국어 메시지로 감싸져 있다) — 문제는
그 지점까지 도달하기 전, **목록 자체가 스스로 정리되지 않는다는 것**이다.

크루 쪽(오너·임원)에는 "보낸 초대 목록"을 보여주는 화면 자체가 없다(`listInvitationsForCrew`
호출부 0건, grep 확인) — 그래서 이 문제가 지금 눈에 띄는 유일한 표면은 받은 초대함이다.

## 5. 설계 후보 — 결정은 팀장/사용자 몫

### 후보 A — 아무것도 안 만든다(현상 유지 + 최소 보강만)

`invitations.status`·`crew_memberships.status` 둘 다 영구히 `pending`/`invited`로 둔다.
"만료"는 계속 **계산된 값**(`expiresAt`과 현재 시각의 비교)으로만 존재한다.

- 장점: 스키마·배치 job 추가가 전혀 없다. 최소 변경.
- 단점: §4의 UX 문제(영원히 안 사라지는 받은 초대함 항목)가 그대로 남는다 — 이건 **후보와
  무관하게 반드시 고쳐야 하는 최소 보강**이다(아래 "공통 보강" 참고). 오너 쪽에 "보낸 초대"
  화면이 미래에 생기면 같은 문제가 그쪽에도 나타난다.

### 후보 B — 배치 job으로 `invitations.status='expired'` + `crew_memberships` 상태 전이 (권장)

`purge_expired_chat_messages`·`anonymize_expired_deactivated_profiles`와 같은 `pg_cron`
패턴을 재사용한다:

```sql
update public.invitations set status='expired'
where status='pending' and expires_at <= now();
```

**`crew_memberships`의 짝 `invited` 행을 무엇으로 옮길지가 이 후보의 핵심 하위 결정이다**:

- **B-1: `declined`로 통합.** 기존 값 재사용, 스키마 변경 없음. 단점: "명시적으로
  거절함"과 "시간이 지나 응답 안 함"을 UI·감사 관점에서 구분할 수 없다.
- **B-2: 새 상태값(예: `'invited_expired'` 또는 요구사항 2.4절 표기에 맞는 이름)** 도입.
  `CrewMembershipStatus` CHECK 제약·타입·`crew-membership-transition.ts` `TRANSITIONS`·
  이 상태를 렌더하는 UI(현재는 없음, 있다면) 전부 갱신 필요. 장점: 의미가 정확히 구분된다.
  단점: 블라스트 반경이 넓다 — **이게 "요구사항 층위 결정"의 실체다**(D-002류 결정과 같은
  급, 팀장/사용자 확인 필요).
- **B-3: 행 자체를 삭제.** 이 프로젝트 전반이 하드 삭제 대신 상태 전이를 쓰는 일관된
  패턴(이번 DELETE/TRUNCATE 축 조사 §2가 확인한 26개 테이블 전수)과 어긋난다 — **비권장**.

### 후보 C — `crew_memberships`는 건드리지 않고 `invitations.status`만 배치로 정리

B의 `invitations` 부분만 채택하고 `crew_memberships`는 계속 `invited`로 둔다.
`crew_memberships.status='invited'`의 의미를 "한때 초대받았다(결과 무관)"로 재정의하고,
"지금 응답 가능한가"는 항상 `invitations` 테이블을 조인해서 판단하게 한다.

- 장점: `CrewMembershipStatus` 스키마 변경이 없다(B-2보다 작은 변경).
- 단점: `crew_memberships.status`만 보고 판단하는 미래 코드(예: "크루의 초대 대기자 수"
  집계)가 있다면 오염된 값을 셀 위험이 있다 — 현재는 그런 집계가 없어(§4 확인) 당장은
  안전하지만, 생기면 매번 `invitations` 조인을 강제해야 한다는 규율이 필요하다.

### 후보 D — 배치 job 없이 서버 쿼리에 `expires_at > now()` 조건만 추가 (DESIGN 교차검증 지적, 24일차 보강)

**DB 상태를 전혀 바꾸지 않는다.** `InvitationInboxContainer`가 부르는
`listInvitationsForProfile(profileId, "pending")`(`src/lib/data/supabase/invitation.ts`)의
쿼리에 `expires_at > now()` 조건 하나만 추가하면, `invitations.status`가 여전히 영원히
`'pending'`으로 남아 있어도(§2가 확인한 현재 동작 그대로) **만료된 초대는 조회 결과에서
빠져 목록에서 사라진다.** 배치 job(pg_cron)도, 스키마 변경도, `crew_memberships` 전이도
필요 없다 — 딱 이 컨테이너가 쓰는 SELECT 조건 하나다.

**§4의 "공통 보강"(클라이언트 배지)과는 다른 축이다** — 그건 이미 받아 온 데이터를 화면에서
비활성화 표시만 하는 것이고, 이건 **애초에 서버에서 만료된 행을 걸러 내려보내지 않는 것**이다.
클라이언트 배지만으로는 "만료된 초대가 목록에 계속 보인다"(§4가 지적한 문제 자체)는 해결되지
않는다 — 사용자는 여전히 스크롤해서 지나간 초대를 봐야 한다. 서버 쿼리 필터링이라야 §4의
문제를 실제로 없앤다.

**다른 후보와의 관계**:

- **A(현상 유지)와 결합 가능** — "DB는 그대로 두되 이 조건만 추가"는 A의 최소 변경 성격을
  유지하면서 §4의 UX 문제만 없앤다. 사실상 **A′(A 강화판)**로 볼 수 있다.
- **B·C(배치 job)와 배타적이지 않다** — 함께 갈 수 있다. 배치 job은 5분~1일 주기로만 돌기
  때문에(이 프로젝트의 기존 pg_cron 잡들이 전부 그렇다) **job이 아직 안 돈 사이의 창(만료는
  됐지만 `status`는 아직 `pending`인 구간)이 항상 존재한다** — 그 창에서도 D가 있으면 즉시
  걸러진다. B/C를 채택해도 D를 함께 두는 것이 더 안전하다.
- **D 단독으로는 원 질문(I-030 본문)에 답하지 않는다** — "만료 시 `crew_memberships.
  invited` 행이 다음에 무엇이 돼야 하는가"는 여전히 미정의로 남는다. D는 **읽기 경로 하나
  (받은 초대함)의 증상만** 없앤다 — `crew_memberships`가 여전히 `invited`로 남아 있다는
  사실 자체는 바뀌지 않으므로, 오너 쪽 "보낸 초대" 화면이 미래에 생기거나 멤버십 상태를
  직접 세는 다른 집계가 생기면 그 표면엔 D가 아무 도움이 안 된다.

**비용**: 이 컨테이너 파일 한 줄(`.gt("expires_at", nowIso)` 또는 동등한 조건) — 이번
조사에서 구현하지 않았다(요구사항 결정과 얽힌 부분만 다루라는 팀장 지시 범위를 벗어난다고
판단했으나, **결정이 필요 없는 순수 쿼리 보강이라 후보 중 유일하게 팀장 확인만으로 바로 적용
가능하다**).

### 공통 보강(후보와 무관하게 제안) — 받은 초대함 UI

어느 후보를 택하든, `InvitationCard`가 `expiresAt`을 이미 props로 받고 있으니
`expiresAt <= now`일 때 버튼을 비활성화하고 "만료됨" 배지를 보여주는 것은 **DB 결정과
무관하게 지금 바로 할 수 있는 개선**이다 — 서버 데이터가 아직 "만료됨"을 모르더라도 클라이언트
계산만으로 충분하다. 이번 조사에서 구현하지 않았다(요구사항 결정과 얽힌 부분만 다루라는
팀장 지시 범위를 벗어난다고 판단) — 승인되면 다음 회차가 바로 적용할 수 있다.

## 6. 추천(참고용, 결정은 아님)

이 프로젝트가 이미 `purge_expired_chat_messages`·`anonymize_expired_deactivated_profiles`
2건의 pg_cron 배치 패턴을 확립해 뒀고, **후보 B(특히 B-1로 시작해 필요해지면 B-2로 승격)**가
기존 관행과 가장 잘 맞는다고 판단한다 — 다만 이것은 CREW의 제안일 뿐 확정이 아니다. B-1은
스키마 변경이 없어 리스크가 가장 작고, "거절"과 "무응답 만료"를 구분해야 한다는 실제 요구가
나오면 그때 B-2로 넘어가도 늦지 않다(현재 어느 화면도 이 둘을 구분해서 보여주지 않는다,
§4 확인).

**후보 D는 결정과 무관하게 채택을 권한다** — 요구사항 결정이 필요 없는 순수 쿼리 조건이라
B(또는 어느 후보)가 최종 확정되기 전이라도 바로 적용해 §4의 UX 문제를 없앨 수 있고, B가
채택된 뒤에도 배치 주기 사이의 창을 메워 주는 방어선으로 함께 남는다. **이것도 CREW의
제안일 뿐 확정이 아니다.**

## 7. 산출물

- 마이그레이션 2건(§3, 보안 우회 수정): `major_fix_i114_crew_memberships_invited_active_
  expiry_guard`, `fix_i114_grant_execute_on_invitation_expiry_helper`.
- 이슈: `docs/ISSUES.md` **I-114**(해결됨, §3의 보안 우회). **I-030 자체는 이 문서를 근거로
  "실측 완료·후보 제시, 최종 결정 대기"로 상태만 갱신하고 열어 둔다** — §5의 설계 결정은
  CREW가 확정하지 않는다.
- 테스트 데이터: 전부 `begin…rollback` 트랜잭션 내부에서만 생성·조작(§2·§3의 모든 실측
  포함) — 커밋된 임시 행 0건.

---

## 후보 D (교차검증에서 추가) — 조회 쿼리 필터링 · **채택됨(D-073)**

**이 절은 24일차 교차검증과 사용자 결정 이후에 팀장이 추가했다.** 위 본문(A/B/C)은 CREW가
쓴 원문 그대로 두고, 여기에 네 번째 축과 최종 결정을 덧붙인다.

### 후보 D — `listInvitationsForProfile` 쿼리에 `expires_at > now()` 조건 추가

DESIGN이 24일차 CREW 교차검증에서 짚었다. **배치 job 없이 조회 쿼리 한 곳만 고쳐도 만료된
초대가 "받은 초대함"에서 사라진다.** 위 §4가 지적한 UX 문제를 **DB 상태를 전혀 바꾸지 않고**
해결한다. CREW가 "공통 보강"으로 분류한 클라이언트 뱃지와는 다른 축이다 — 그쪽은 클라이언트
표시이고 이쪽은 **서버 쿼리 필터링**이다.

- **A와의 관계**: A(현상유지+UI 보강)에 이것만 얹으면 사실상 "만료된 초대는 안 보인다"가
  달성된다. A의 UI 보강이 클라이언트 몫이라면 D는 서버 몫이라, 둘은 배타적이지 않다.
- **B와의 관계**: B(배치 전이)의 **대안**이다. B가 하려던 것 중 "사용자에게 안 보이게 한다"는
  D로 달성되고, "DB 데이터를 정합적으로 만든다"는 달성되지 않는다.
- **C와의 관계**: C(`invitations`만 정리)도 배치 job이 필요하다 — D는 그조차 필요 없다.

### 최종 결정 (2026-07-29, 사용자) — **후보 D 채택**

근거 셋(전문은 **D-073**):

1. 사용자에게 보이는 문제를 **DB 상태를 바꾸지 않고** 해결한다 — 되돌리기 비용이 가장 낮다.
2. 새 `pg_cron` job도, 새 상태값도, `TRANSITIONS.invited`(NFR-036 단일 소스) 변경도 없다.
3. **만료 자체는 이미 DB 레벨에서 강제된다** — 같은 회차의 I-114 수정으로 `invited→active`
   self-PATCH에 `private.has_valid_pending_invitation()` 가드가 붙어 만료된 초대로는 가입이
   성립하지 않는다. **`invited` 행이 남아도 권한상 무해**하고, 남은 것은 표시 문제뿐이었다.

### 알려진 한계 2건 (이 결정을 택하면 감수하는 것)

1. **`invited` 행이 DB에 남는다.** 멤버십 통계·집계에서 유령 인원으로 잡힐 수 있다 — 집계
   쿼리를 쓰는 쪽이 `invited`를 세지 않도록 각자 확인해야 한다. 실제로 문제가 되면 B-1을
   다시 검토한다.
2. **`requirements.md` §2.4의 공백 자체는 닫히지 않는다.** `invited`에서 만료로 나가는
   화살표가 여전히 없다 — **다만 이 결정에 따르면 그 화살표는 존재하지 않는 것이 정답**
   이므로, 다이어그램에 "만료는 상태 전이가 아니라 조회 필터링으로 다룬다(D-073)"는 주석을
   달아 공백이 아니라 의도임을 명시한다.

### 구현 (다음 회차)

**24일차에는 결정만 하고 구현하지 않았다** — 팀원 4명이 종료된 뒤 사용자 결정이 나왔다.
다음 회차에 **CREW**(초대·멤버십 소관)에 배정한다. 대상은 `listInvitationsForProfile`와
위 한계 2의 §2.4 주석이다.
