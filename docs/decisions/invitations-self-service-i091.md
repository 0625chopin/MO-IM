# `invitations` self-service 익스플로잇 재현·수정 — I-091 후속 1순위 (22일차)

## 배경

21일차 BOARD가 I-091(패턴 정식화: "self-service RLS 분기가 새 컬럼값을 제한하는지는 테이블마다
제각각")을 정식화하면서 남긴 전수 표에서 `invitations`가 유일하게 "컬럼값 제한 전무 +
미수정 + 미실측" 칸으로 남아 있었다. 관측은 이랬다:

- self-service 분기: `invitee_id = auth.uid()`
- 컬럼값 제한 지점: 전무. BEFORE 트리거 없음(AFTER 트리거만 2개)
- 다운스트림 캐스케이드: 있음 — `trg_invitations_sync_membership_on_response`(AFTER UPDATE)이
  `crew_memberships`를 건드린다
- I-091의 심각도 기준: "이 self-service 경로가 다운스트림 트리거를 발동시키는가" — `invitations`는
  발동시킨다. 미실측 상태로는 CRITICAL 가능성을 배제할 수 없었다.

이 문서는 22일차에 실제로 익스플로잇을 재현하고(추정이 아니라 실 SQL/HTTP), 심각도를 판정하고,
수정한 근거를 남긴다.

## 0. FR-021 원문 확인 — "한 번 응답하면 끝"이 명시 요구사항인가

`docs/requirements/requirements.md` §FR-021을 다시 읽었다:

- **행위자**: "초대받은 회원" — 단수, 응답 행위의 주체가 명시적으로 초대 대상 본인이다.
- **AC2**: "Given 거절한 초대, When 같은 크루가 재초대, Then **새 초대가 정상 생성된다**(거절이
  영구 차단이 아니다)." — 재도전 경로는 명시적으로 **새 `invitations` 행의 INSERT**(초대자가
  주도)다. 기존 행의 `status`를 초대받은 사람이 되돌리는 경로가 아니다.
- **E1**: "만료된 초대 → 처리 불가 안내" — 응답(수락·거절) 자체가 만료 후 불가능해야 한다.

즉 "한 번 응답하면 끝"은 BOARD가 "암묵적 전제"라고 낮춰 부른 것보다 근거가 강하다 — **AC2가
재도전 경로를 새 행 생성으로 명시**하고, **행위자가 본인 단수로 한정**되고, **E1이 만료 후
전체 응답 불가를 명시**한다. 세 가지 모두 실제 AC/행위자 정의에서 도출되므로, 이번 수정은
"보완적 강화"가 아니라 **명시 요구사항 미비 이행**에 해당한다.

## 1. 익스플로잇 재현 (수정 전, `begin…rollback`)

세 크루(`32aca4a8` 심야 독서 모임, `5cd01483` 국내 여행 메이트, `97082c1a` 강아지 산책 모임 —
전부 `chopin0625@gmail.com`이 staff)를 써서 `chopin_0625`(`0625chopin@gmail.com`)를
invitee로 하는 시나리오를 만들고, `set_config('request.jwt.claim.sub', ...)` +
`set local role authenticated`로 PostgREST의 `auth.uid()` 해석을 그대로 재현해 RLS·트리거를
통과시켰다(REST 직접 호출과 검증 지점이 동일 — DB의 RLS+트리거가 유일한 강제 경계다).

| # | 시나리오 | 절차 | 실제 결과(수정 전) |
| --- | --- | --- | --- |
| (a)(b) | 이미 `accepted`한 초대를 `declined`로 되돌릴 수 있는가 / 그때 `crew_memberships`는? | invA: pending→(genuine accept)→invitee가 직접 `declined`로 self-flip | **`invitations.status`는 `declined`로 성공**. 그러나 `crew_memberships.status`는 `active`로 **그대로 남음**(트리거의 `where status='invited'` 가드가 우연히 막아 줌) — **감사 기록이 실제 멤버십과 어긋나는 데이터 무결성 결함**으로 확인 |
| (c) | `declined`→`accepted` 재전환으로 **초대자 의사 없이** 거절한 크루에 재입장할 수 있는가 | invB: pending→(genuine decline, membership `declined`)→invitee가 직접 `accepted`로 self-flip | `invitations.status`는 `accepted`로 성공하지만 `crew_memberships.status`는 `declined`로 **그대로 남음** — 실제 재입장(멤버십 승격)까지는 **이어지지 않음**. 다만 초대 테이블 자체의 응답 이력은 위조 가능 |
| (d) | `expires_at`이 지난(만료된) `pending` 초대를 `accepted`로 되살릴 수 있는가 | invC: `expires_at`을 과거로 한 채 INSERT(=시간 경과 시뮬레이션, 실제로는 `status`가 자동으로 `expired`가 되는 크론이 없어 DB엔 영원히 `pending`으로 남음) → invitee가 직접 `accepted`로 UPDATE | **성공. `crew_memberships`가 `invited`→`active`로 실제 전이됨** — FR-021 E1("만료된 초대 처리 불가")이 앱 레이어(`evaluateInvitationResponseEligibility`)에만 있고 DB가 독립 강제하지 않아 REST 직접 호출로 뚫린다. **이번 조사에서 유일하게 실제 멤버십 상태가 바뀐(=다운스트림 캐스케이드가 실제로 발동한) 케이스** |
| (e) 추가 발견 | staff/owner가 **타인(invitee)의 동의 없이** 남의 pending 초대를 `accepted`로 강제 전이시킬 수 있는가 | invD(크루 `ff844e3a`): chopin0625(staff)가 자기 자신을 inviter로 초대를 만들고, **같은 chopin0625가 invitee 대신** `status='accepted'`로 UPDATE | **성공. `crew_memberships`가 `invited`→`active`로 전이됨** — `invitations_update_invitee_or_staff` RLS의 원 코멘트("초대 수락·거절(FR-021, **본인**) + 임원 이상의 취소/관리")가 명시한 "본인" 원칙을 실제로는 강제하지 않음. staff/owner가 대상자 동의 없이 크루에 강제 편입시킬 수 있는 별도 결함 |
| (e-부수) | 추가 확인 — invitee가 자기 초대의 `expires_at`을 스스로 연장할 수 있는가 | invitee가 `status`는 그대로 두고 `expires_at`만 미래로 UPDATE | **성공**(수정 전) — `status` 외 컬럼도 self-service UPDATE에서 전혀 제한되지 않았다 |

**요약**: `invitations`는 I-091 표의 서술("전무")이 정확했다. 반복 status 플립은 `crew_memberships`
쪽 `where status='invited'` 가드 덕분에 멤버십 재승격까지는 대체로 막혔지만(시나리오 c),
**만료된 초대의 직접 accept(시나리오 d)는 실제로 멤버십을 생성**했고, **staff/owner의 타인
초대 강제 승인(시나리오 e)도 실제로 멤버십을 생성**했다 — 둘 다 I-091의 심각도 기준("다운스트림
트리거 발동")을 충족하는 진짜 결함이다.

## 2. 심각도 판정

**MAJOR로 판정한다** (I-089 CRITICAL·I-090 MAJOR와 같은 급의 실제 캐스케이드가 있지만, 공격
표면이 "임의의 제3자가 아무 크루에나 들어간다"가 아니라 "이미 초대자가 지정한 특정 invitee가
그 초대의 유효기간·1회성 제약만 우회한다(d)" 또는 "그 크루의 이미 신뢰된 staff/owner가 절차를
생략한다(e)"로 한정되기 때문이다):

- **다운스트림 캐스케이드 있음**(I-091의 심각도 기준 충족) — (d), (e) 둘 다 `crew_memberships`에
  실제 행 상태 변화를 일으켰다.
- **공격자 범위가 제한적**이다 — (d)는 이미 초대받은 본인만 실행 가능(임의 사용자가 아니다),
  (e)는 이미 그 크루의 staff/owner(신뢰된 역할)만 실행 가능하다. `polls`(I-089, 크루 전체
  결과를 조작 가능)나 `join_requests`(I-085, 아무나 자가 승인 가능)만큼 넓지 않다.
- 그럼에도 **FR-021의 명시 AC/E1을 정면으로 위반**하고(§0 참고), (e)는 **당사자 동의 없는 크루
  편입**이라는 프라이버시·동의 원칙 위반이라 무시할 수 없다.

## 3. 수정

새 메커니즘을 만들지 않았다 — 21일차에 확립된 패턴(`reports_guard_self_update_reason_only`,
`crew_memberships_guard_self_transition`과 동일 구조: RLS는 "어떤 행"만 표현하고 "어떤 컬럼·
전이"는 BEFORE 트리거가 맡는다)을 그대로 따랐다.

마이그레이션 `major_fix_i091_invitations_response_transition_guard`
(`supabase/migrations/20260729075027_major_fix_i091_invitations_response_transition_guard.sql`):

`invitations_guard_response_transition()` (BEFORE UPDATE, SECURITY DEFINER, `search_path=''`,
client `EXECUTE` 회수):

1. `pg_trigger_depth() > 1`(향후 신뢰된 중첩 호출) 또는 `auth.uid() is null`(service_role) —
   self-service 제한 대상이 아니므로 통과(`reports_guard_self_update_reason_only`와 동일 컨벤션).
2. `status` 외 컬럼(`crew_id`·`invitee_id`·`inviter_id`·`expires_at`·`created_at`)은 **UPDATE로
   전혀 바꿀 수 없다** — (e-부수)의 `expires_at` 자가 연장을 막는다.
3. `status`가 바뀌는 경우:
   - `old.status`가 `pending`이 아니면 거부 — (a)(b)(c) 전부 여기서 막힌다(한 번 응답하면 끝).
   - `new.status`가 `accepted`/`declined` 외의 값이면 거부.
   - `auth.uid()`가 `old.invitee_id`와 다르면 거부 — (e) staff/owner의 대리 승인을 막는다.
   - `old.expires_at <= now()`이면 거부 — (d) 만료된 초대 accept를 막는다.

## 4. 수정 후 재현 시도 (SQL 시뮬레이션 + 실 REST 둘 다)

**SQL 시뮬레이션**(`begin…rollback`, `set_config`+`set local role authenticated`로 RLS 재현):
아래 7개 케이스 전부 기대대로 동작(정상 흐름은 성공, 공격 시나리오는 전부 예외로 거부).

| # | 시나리오 | 결과 |
| --- | --- | --- |
| 1 | 회귀: genuine pending→accepted | 성공(회귀 없음) |
| 2 | (a) accepted→declined self-flip | **거부**: `invitations: only a pending invitation may be responded to (FR-021)` |
| 3 | 회귀: genuine pending→declined | 성공(회귀 없음) |
| 4 | (c) declined→accepted self-flip | **거부**: 동일 메시지 |
| 5 | (d) 만료된 pending 초대 직접 accept | **거부**: 동일 메시지(만료 이전에 `old.status<>'pending'` 검사가 먼저 걸리는 게 아니라, pending 상태이므로 그다음 만료 검사(`old.expires_at<=now()`)에서 거부 — 로그로 별도 확인, 아래 REST 재현 참고) |
| 6 | (e) staff의 타인 초대 강제 accept | **거부**: `invitations: only the invitee may respond to this invitation (FR-021, 행위자 = 초대받은 회원)` |
| 7 | (e-부수) invitee의 `expires_at` 자가 연장 | **거부**: `invitations: this update may only change status (FR-021)` |

**실 REST 재현**(실 로그인 토큰, `curl` 직접 호출 — 앱 서버 액션을 전혀 거치지 않음):

1. `chopin0625@gmail.com`(staff)가 `POST /rest/v1/invitations`로 `chopin_0625`를 심야 독서
   모임(`32aca4a8`)에 초대 → `201`, `status=pending`.
2. `0625chopin@gmail.com`(invitee, `chopin_0625`)가 `PATCH .../invitations?id=eq.<id>`로
   `{"status":"accepted"}` → `200`, 정상 수락(회귀 없음, `crew_memberships`가 `active`로 전이).
3. 같은 invitee가 곧바로 `PATCH .../invitations?id=eq.<id>`로 `{"status":"declined"}`
   (앱의 `respondToInvitation`이 쓰는 `.eq("status","pending")` 없이 **직접** 호출) →
   **`400 P0001 invitations: only a pending invitation may be responded to (FR-021)`**.
   앱 서버 액션을 전혀 거치지 않고 DB가 독립적으로 거부함을 실측으로 확인했다.
4. 테스트로 만든 `invitations` 행과 `crew_memberships`(active) 행은 **직접 DELETE로 정리**했다
   (REST로 실제 커밋된 데이터라 `rollback`으로 되돌릴 수 없었다 — 정리 후 두 카운트 모두 0 확인).

## 5. 미확인으로 남긴 것

- **실 브라우저 클릭 검증**(`InvitationCard`의 수락·거절 버튼 실클릭)은 하지 않았다 — SQL
  시뮬레이션과 실 REST(curl) 직접 호출로 DB 강제 경계를 검증했지만, Server Action 경유
  end-to-end 클릭 흐름은 이번 조사 대상이 아니었다(다른 팀원들도 반복 지적한 Playwright
  세션 공유 제약, Task 039/040과 같은 한계).
- **`invitations_update_invitee_or_staff` RLS의 staff/owner OR-분기 자체**는 건드리지 않았다 —
  이번 트리거로 인해 그 분기는 "행 접근"만 가능하고 실제 컬럼 변경(= 유의미한 동작)은 전부
  거부되는 사실상 죽은 코드가 됐다. RLS 자체를 좁혀 정리하는 것은 별도 청소 작업으로 남긴다
  (동작상 위험은 없다 — 이미 트리거가 막는다).
- **`status='expired'`를 실제로 기록하는 크론 잡의 필요성**은 이번 스코프 밖이다. 현재 DB엔
  그런 잡이 없고(`cron.job`에 `invitation` 관련 잡 0건 확인), `status`는 만료 후에도 영원히
  `pending`으로 남는다 — 이번 수정으로 그 상태에서의 accept/decline은 막히지만(E1), 화면의
  "만료됨" 표시는 여전히 `expires_at` 비교로 애플리케이션이 계산한다(기존과 동일).

## 6. 관련 이슈·결정

- 신규 이슈: `docs/ISSUES.md` I-093(해결됨, 이 문서 참고).
- I-091 전수 표의 `invitations` 행 갱신(다른 행은 건드리지 않음).
- 신규 결정: `docs/prioritization-and-risks.md` §6.3 D-056.
