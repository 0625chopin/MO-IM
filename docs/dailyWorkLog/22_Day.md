# 22일차 작업 로그 (2026-07-29)

## 회차 요약

- 활성 팀원: **4명 전원**(CORE · DESIGN · CREW · BOARD).
- 이번 회차 배치 근거: 완료 집합 {Task 001~036 전량 · 038 · 039 · 040 · 041 · 042A · 042B} 기준으로 21일차 Task 036 완료가 **037 · 044 · 045 세 건을 한꺼번에 열었다.** 1인 1건 폭 제한을 적용해 CORE 044 · DESIGN 045 · BOARD 037로 배정했고, 잔여 로드맵 Task가 없는 **CREW에는 21일차 워크로그가 "22일차 최우선 후보"로 지목한 I-091 후속(`invitations`)을 배정**했다. 043A·043B는 037 의존이라 이번 회차 밖이다.
- 결과: **완료 로드맵 Task 3건(037 · 044 · 045)** + 이슈 처리 다수. 마이그레이션 **8건** 적용. 신규 결정 **9건**(D-056~D-064). `docs/ISSUES.md` 신규 등재 **9건**(I-093~I-101), **그중 6건을 같은 회차에 닫았다.** 전체 테스트 3종 통과.
- **이번 회차의 성격**: **로드맵 Task 3건을 끝낸 회차이면서, 동시에 CRITICAL 1건·MAJOR 4건을 새로 찾은 회차**다. 21일차가 "통합 테스트가 결함을 드러낸 회차"였다면 이번은 **"기능 확장이 결함을 드러낸 회차"**다 — 새 기능을 붙이려고 기존 구조를 건드리는 과정에서 잠복 결함이 나왔고, 교차검증이 그것을 또 한 번 확장했다.

## 팀원별 완료 내역

### BOARD (04.BOARD.md)

- 완료 Task: **037 · 동시성·부하 검증과 Realtime 팬아웃 실측**
- 산출물:
  - 신규 문서 — `docs/decisions/concurrency-load-037.md`(측정 조건·원시 수치·재현 절차) · `docs/decisions/meetups-insert-bypass-101.md`
  - 마이그레이션 1건 — `major_fix_i101_meetups_direct_insert_bypass`
  - 수정 — `docs/ISSUES.md`(I-017·I-018 해결됨 갱신, I-094 등재) · `docs/ROADMAP/team/04.BOARD.md`
  - 신규 결정 **D-057**(요금제 확정) · **D-064**(팀장 등재, I-101 수정 원칙)
- 실측: **I-018 팬아웃** — 공식 문서의 N+1 규칙을 확인하고 실 소켓 N=10/30/60/**100**(NFR-006의 크루당 100세션 값)으로 측정. p95 = 79.9 / 66.9 / 65.8 / **71.5ms**(NFR-003 1초 목표의 약 7%). `get_logs(realtime)` 쿼터 초과 0건. **I-017 요금제** — Realtime Limits(Free 200 / Pro 500 / Pro-상한해제 10,000 연결, 100/500/2,500 msg/sec)와 대조해 NFR-006(전체 1,000세션)은 **Pro(지출 상한 해제)만 충족**으로 확정.
- **D-019 정원 원자성 회귀**: 진짜 동시 HTTP(`Promise.all`, 실 JWT 2개) 5회 반복 → **5/5 정확히 1명만 성공**, 승자가 매번 교대(진짜 경합 확인).
- **D-054/D-055 투표 트리거 경합**(아무도 안 쟀던 항목을 자발적으로 추가): 동시 조기종료 2건 발사 → 행 잠금이 안전 직렬화, **승자가 틀린 값(`passed`)을 보냈는데도 트리거가 진짜 값(`rejected`, D-003 동수부결)으로 덮어씀** 확인. 21일차 자신의 I-089 수정이 경합 상황에서도 성립함을 입증했다.
- 비고: **이번 회차 최대 발견자다** — I-101(CRITICAL)을 실 REST로 재현·확정·수정했고, CORE의 Task 044 교차검증에서 I-097의 **과거 실사고 증거**까지 찾아냈다.

### CORE (01.CORE.md)

- 완료 Task: **044 · 잔여 C등급 기능 (FR-046 · FR-055 · FR-072)** — 9.5인일 L, 이번 회차 최대 분량
- 산출물:
  - 마이그레이션 3건 — `poll_withdrawal_guard_fix_and_notification_types_044` · `create_chat_room_reads_table_044` · `notification_preferences_mandatory_guard_and_mute_aware_broadcast_044`
  - 신규 — `lib/actions/{withdraw-poll,mark-room-read,update-notification-preference}.ts` · `lib/data/supabase/notification-preference.ts` · `lib/rules/notification-preference-rules.ts` · `components/poll/PollWithdrawControl.tsx` · `components/notifications/{NotificationPreferencesContainer,NotificationPreferencesPanel,NotificationPreferencesPanelSkeleton,notification-preference-view-models}.tsx` · `components/ui/switch.tsx`
  - 신규 문서 — `docs/decisions/remaining-c-features-044.md`
  - 신규 결정 **D-061**(FR-046) · **D-062**(FR-055) · **D-063**(FR-072, I-091 판정 부분 번복)
  - 등재 — I-096 · I-097
- 실측: FR-046 철회·재개 거부를 `begin`…`rollback`으로, FR-055 `chat_room_reads` RLS를 크루원/비소속자 양쪽으로, FR-072 필수 알림 차단을 INSERT·UPDATE 양쪽으로 확인.
- 자체 발견: **I-096**(`disband_crew`가 투표 취소를 무력화) · **I-097**(`notifications.type` CHECK 누락으로 FR-013·025 알림 100% 실패) — 둘 다 FR-046 작업 중 실측으로 나왔다.
- **범위를 정확히 그었다**: 팀장이 배정 시 "FR-046이 재투표를 다루니 I-079(D-051 Meetup UNIQUE 제약)에 부딪힐 것"이라고 경고했는데, 대조로 **"I-079는 FR-065 AC2 문제이고 FR-046과 무관"**임을 확정하고 I-079를 열린 채로 뒀다.
- **I-095 조사**(DESIGN이 넘긴 건): 결함이 아님을 확정 — Next 16이 레이아웃·페이지를 **병렬 렌더**하므로(공식 문서 "Parallel data fetching") 레이아웃이 `{children}`을 안 쓰기로 해도 페이지 브랜치는 이미 예외를 던진다. **어서션 메시지가 오진단**이고 화면·가드는 정확하다. D-040과 같은 뿌리. 데이터 유출은 RSC 플라이트 페이로드의 도메인 필드 키까지 훑어 5개 라우트 전부 0건. docstring만 추가했다.

### DESIGN (02.DESIGN.md)

- 완료 Task: **045 · 관측과 브라우저 지원 (NFR-030 · 040 · 041)**
- 산출물:
  - 마이그레이션 2건 — `kpi_045_join_requests_decided_at` · `kpi_045_product_events` (+ 교차검증 대응 `major_fix_join_requests_decided_at_client_forgery`)
  - 신규 — `lib/data/supabase/product-event.ts` · `lib/types/product-event.types.ts` · `lib/actions/{record-crew-search-event,record-notification-impression,record-notification-click}.ts`
  - 신규 문서 — `docs/decisions/observability-browser-045.md`
  - 신규 결정 **D-058**(`product_events` 자체 적재, 외부 SaaS 미도입) · **D-059**(KPI-4는 새 이벤트가 아니라 `decided_at` 컬럼) · **D-060**(NFR-041 명시 종결)
  - 등재 — I-095 · I-098 · I-099 · I-100
- **인프라를 최소화한 판단이 좋았다**: KPI-1~5 중 새 이벤트가 실제로 필요한 것은 **3개뿐**임을 밝혔다. KPI-1·2는 기존 타임스탬프로 산출 가능하고, KPI-4는 컬럼 하나로 해결된다. 근거는 **"같은 사실을 두 곳에 기록하면 I-071류 결함군을 스스로 만든다"** — 이 저장소가 이미 겪은 교훈을 선제 적용했다.
- **`audit_logs`와 신뢰 모델을 대조**해 `product_events`를 별도로 세웠다: 감사 로그는 service-role 전용 쓰기(**"본인이 자기 행위를 스스로 감사하면 감사가 아니다"**), KPI 이벤트는 self-service INSERT. 외부 SaaS(Vercel Analytics·PostHog)는 검토 후 "KPI-3·5가 요구하는 사용자 단위 퍼널을 스키마로 표현 못 한다"는 근거로 기각.
- 비고: **브라우저 실검증에서 MAJOR 2건을 찾았다**(아래 I-098·I-099). 1차 시도 때 공유 Playwright 인스턴스 충돌로 못 했다고 정직하게 §5.3에 남겼고, 팀장 재시도 지시 후 **원인이 "다른 팀원이 사용 중"이 아니라 정리 안 된 좀비 Chrome 프로세스**임을 밝혀 해결했다.

### CREW (03.CREW.md)

- 완료 Task: **없음**(잔여 로드맵 Task 0건). 이슈 2건 처리.
- 산출물:
  - 마이그레이션 1건 — `major_fix_i091_invitations_response_transition_guard`
  - 신규 문서 — `docs/decisions/invitations-self-service-i091.md`
  - 수정 — `docs/CONVENTIONS.md`(zone 1~8 전체 표 신설, I-088 해소) · `eslint.config.mjs`(상단 주석에 "표 동시 갱신" 규칙)
  - 신규 결정 **D-056** / 등재 — I-093
- **I-091 후속(`invitations`) — MAJOR 2건 실증**: 21일차 표에서 유일하게 "컬럼값 제한 전무 + 미수정 + 미실측"으로 남은 칸이었다. 실 REST로 재현한 결과 **(d) 만료된 초대를 직접 accept하면 `crew_memberships`가 `invited`→`active`로 실제 전이**되고, **(e) staff/owner가 invitee 동의 없이 남의 초대를 승인해 크루에 강제 편입**시킬 수 있었다. **(e)는 21일차 BOARD의 추정 범위 밖의 발견이다.**
- **FR-021 원문 재확인으로 21일차 서술을 정정했다**: BOARD가 "암묵적 전제"라 부른 "한 번 응답하면 끝"이 사실은 **명시 AC**임을 밝혔다(AC2가 재도전 경로를 새 행 INSERT로 명시, E1이 만료 후 응답 불가 명시, 행위자가 본인 단수로 한정). 따라서 이 수정은 보완적 강화가 아니라 **명시 요구사항 미비 이행**이다.
- 비고: **이번 회차의 사슬을 시작한 사람이다** — DESIGN의 Task 045를 검증하다 I-100을 찾았고, **인접 발견으로 한 줄 남긴 `meetups` RLS 지적이 I-101(CRITICAL)로 이어졌다.**

## 교차검증 결과

- **BOARD → CREW**(I-093): **5항목 전부 PASS.** 팀장이 최대 위험으로 지목한 "정당한 기능을 죽였나"에 대해 **초대 취소는 UPDATE가 아니라 DELETE 경로**(`invitations_delete_inviter_or_staff`)임을 밝혀 갈랐다. CREW가 SQL 시뮬레이션으로만 한 (d)(e)를 **실 REST로 다시 쏴서** 막힘을 재확인했고, `pg_trigger_depth()>1` **전수 조사를 직접 수행**(CREW 문서에 없던 것)해 `invitations`를 UPDATE하는 함수가 신규 트리거 자신뿐임을 확정했다.
- **CREW → BOARD**(037): 4 PASS / **1 FAIL**. **정리 주장이 FAIL** — BOARD가 4개 테이블만 확인하고 `notifications`를 빠뜨려 테스트 poll의 `poll_closed` 알림 2건이 두 실계정 받은편지함에 남아 있었다(CREW가 직접 정리). 21일차와 같은 패턴의 재발이다. NFR-006 원문에서 **"전체 1,000세션"의 "전체"**를 확인해 크루 수 가정 없이 결론이 서는 것도 밝혔다. **p95 역전 항목은 BLOCKED**(아래 참고).
- **BOARD → CORE**(044 · FR-046 · I-096 · I-097): **5항목 전부 PASS.** `cancelled`가 D-054 재계산 트리거와 **양방향으로 안전**함을 실측(철회된 투표를 `closed_passed`로 강제 재계산 시도 → 400 차단, 반대 방향도 동일 불변식이 차단). **I-097에 과거 실사고 증거를 추가** — `audit_logs`에 `crew.disbanded` 실행 기록이 있는데 `notifications`에 `crew_disbanded`는 지금도 0건, 즉 그때 알림이 실제로 조용히 실패했음을 증명했다(CORE는 재현만 했다). I-096 실데이터 영향은 **0건**으로 집계.
- **DESIGN → CORE**(044 · FR-055 · FR-072): 6 PASS / **2 FAIL** → 수정 후 **재검증 전 항목 PASS**. FR-072 "끌 수 없는 알림"을 INSERT뿐 아니라 **UPDATE 경로까지** SQL로 재현했고, 배지 정확성을 실 데이터(타인 5건·본인 6건)로 `last_read_at` null 경계까지 검증했다.
- **CREW → DESIGN**(045): **I-100 발견**(아래). `product_events` self-service 판정을 I-091 기준으로 검토했다.
- **CREW → BOARD 재검증**(I-101): **5항목 전부 PASS.** 정상 경로(수동 종료 + pg_cron 종료) 생존, UPDATE 경로(참석 응답·취소) 생존, 익스플로잇 2축 재현이 전부 `403 permission denied`로 전환됨, DELETE 호출부 0건, advisors 신규 WARN 0건. **정리에서 `notifications`까지 확인**했다 — 자신이 BOARD에게 지적했던 그 교훈을 스스로 적용했다.
- **DESIGN → CORE 재검증**(스켈레톤 · I-091 표): **3건 전부 PASS.** 스켈레톤을 형식이 아니라 **치수까지 대조**(`h-[18.4px] w-8`이 실제 `Switch`와 일치)했고, **대조 대상이던 `BlockedUsersListSkeleton`보다 이번 것이 더 충실하다**고 정직하게 뒤집어 말했다. "나머지 11종" 서술의 산수도 직접 검산했다.

## 발견·해결한 이슈

1. **[CREW] CRITICAL · I-101 — 제안 작성자·임원이 투표 가결 없이 `meetups`에 직접 INSERT해 "확정된" 모임을 위조할 수 있었다** (CREW가 인접 발견으로 지적 → 팀장 SQL 1차 확인 → BOARD 실 REST 재현·확정) → `meetups_insert_proposal_author_or_staff`의 `WITH CHECK`가 **`polls.status`를 전혀 안 봤고**, `meetups`에 BEFORE INSERT 트리거가 **0개**였다(`guard_attendee_scope`는 UPDATE 전용). **RLS가 INSERT의 유일한 문이었는데 D-003·FR-060의 핵심 불변식을 안 봤다.** 실측 5종 중 4종 성공 — 작성자는 poll이 open·closed_rejected·cancelled 어느 상태든, **임원은 DB 전체의 아무 poll_id로나**(자기 크루 것이 아니어도) 위조 가능했고, 생성된 행은 `status='confirmed'`라 진짜와 구별되지 않아 캘린더·참석 신청까지 반응했다. **21일차 I-089가 막은 문(트리거 유도)과 완전히 독립된 두 번째 문이다.** → BOARD가 I-090 선례대로 `revoke insert, delete, truncate`로 전면 금지(손으로 쓴 다중 조인 boolean식은 미묘하게 틀릴 수 있지만 REVOKE는 그럴 수 없다는 근거) + 죽은 정책 삭제. **정당 경로 2갈래(사람 조기종료·pg_cron)를 모두 실측**해 생존 확인 (재검증 CREW 5/5 PASS, **D-064**)
2. **[CREW] MAJOR · I-093 — 만료된 초대 accept와 임원의 대리 승인으로 크루에 편입할 수 있었다** → 위 CREW 항목 참고. self-service RLS가 컬럼값을 전혀 제한하지 않았고 BEFORE 트리거가 없었다. → `invitations_guard_response_transition()` 신설(21일차 확립 패턴 재사용: RLS는 "어떤 행", BEFORE 트리거가 "어떤 전이") (재검증 BOARD 5/5 PASS, **D-056**)
3. **[CORE] MAJOR · I-097 — `notifications.type` CHECK 제약 누락으로 FR-013·025 알림이 100% 실패하고 있었다** (CORE가 FR-046 작업 중 발견, BOARD가 과거 실사고 증거 추가) → TS `NotificationType`에는 있는데 DB CHECK에 없는 타입들이 있어 INSERT가 조용히 실패했다. **21일차 Task 036이 권한 매트릭스 34행을 전수 검증하고도 못 잡은 자리** — I-091이 말한 "매트릭스가 닿지 못하는 영역"의 또 다른 실례다. → CHECK 확장(13종 일치)
4. **[DESIGN] MAJOR · I-100 — `join_requests.decided_at`(KPI-4)를 self-service·staff 양쪽이 위조할 수 있었다** (CREW 발견) → 트리거가 `new.decided_at is null`일 때만 채워서, REST로 위조값을 실어 보내면 그대로 저장됐다. **팀장이 배정 시 미리 경고한 그 형태("앱만 막고 DB가 강제 안 함")가 DESIGN 자신의 신규 작업에서 재발했다.** KPI-4 집계를 조작할 수 있다. → D-054의 "거부가 아니라 덮어쓰기" 패턴 재사용 — `pending→approved/rejected`에서는 클라이언트가 무엇을 보내든 항상 `now()`로 덮어쓴다 (재검증 DESIGN 3시나리오 PASS)
5. **[DESIGN] MAJOR · I-099 — 앱 셸의 헤더↔탭바 전환이 어떤 화면 폭에서도 일어나지 않는다** → `globals.css`가 `md:`를 `@container appframe (min-width: 48rem)`로 재정의했는데 프레임이 `max-w-app`(430px)에 캡돼 있어 **48rem에 영원히 도달할 수 없다.** 390·1024·1280px 전부에서 header nav `display:none` / 탭바 `display:flex`로 동일했다. **21일차 "로그아웃 버튼이 `hidden md:flex`라 한 번도 안 뜬" 결함은 컴포넌트 교체로 봉합됐을 뿐 근본 원인이 남아 있었다.** `AppShell.tsx` docstring("데스크톱은 HeaderNav 인라인 링크")과 `MobileTabBar.tsx` docstring("계속 안 보인다")이 서로 다른 말을 하고 있다. → **사용자 판단으로 23일차 이월**(수정 방향이 "모바일 프레임을 유지할 것인가"라는 설계 결정을 먼저 요구한다)
6. **[DESIGN] MAJOR · I-098 — `/sample`의 폭 토글(768/1280/전체)이 실제로는 아무 효과가 없다** → `/sample`도 `AppShell`에 감싸여 1280을 요청해도 실제 렌더 폭이 430px에 머문다(grid-template-columns가 양쪽 다 "175px 175px"). **R-002·CON-09가 "`/sample`이 유일한 회귀 확인 지점"이라고 못박은 그 기능이 죽어 있다.** → **23일차 이월**(I-099와 같은 뿌리)
7. **[CORE] MAJOR · I-096 — `disband_crew`가 투표 취소를 무력화하고 있었다** (CORE 발견) → 트리거 버그. 실 데이터 영향은 BOARD가 SQL로 집계해 **0건**(해산된 크루는 c4283f8a 하나뿐이고 그 크루에 열린 poll·확정 미래 meetup이 없다) — 데이터 정정 불필요. → 수정 완료 (재검증 BOARD PASS)
8. **[CREW] minor · I-088 — `CONVENTIONS.md`에 eslint zone 1~8 전체 표가 없었다** → 신설 zone이 문서 등재 없이 늘어나는 관행이 문제였다. → zone 1~8(6b 포함) 전체 표를 신설하고, **`eslint.config.mjs` 상단 주석에도 "표를 같은 커밋에서 갱신한다"는 규칙을 남겨** 재발을 막았다
9. **[DESIGN] 판정 · I-095 — `(app)` 인증 가드 미통과 요청이 HTTP 200 + 콘솔 예외로 응답한다** (DESIGN 발견, CORE 조사) → **결함이 아니다.** Next 16의 병렬 렌더링 때문에 폐기될 브랜치의 예외가 콘솔에 남는 것이고, D-040이 이미 승인한 범주다. **어서션 메시지가 오진단**이다. → 수정하지 않음(완화하면 다른 자리의 진짜 가드 붕괴 탐지력이 약해진다는 근거). 콘솔 소음은 NFR-028 개선 후보로 이월
10. **[팀장] 오진 정정 · CREW의 "`chat_messages` INSERT가 REST에서 막혀 있다"는 테스트 오류였다** → CREW가 037 검증 중 "시급"으로 올렸으나 팀장이 대조 실험으로 반증했다: 진짜 room_id → RLS 통과(400은 `type` NOT NULL), **crew_id를 room_id 자리에 넣음 → 403 42501**(CREW가 본 것과 동일), 완전한 페이로드 → **201 Created**. **경로 차이(REST/SQL)가 아니라 입력값 차이였다.** → 이슈 미등재. Task 037 §3 팬아웃 실측은 유효

**미해결로 남긴 것**: I-094(월간 Realtime 과금·실제 요금제 확인 — 실 트래픽·대시보드 접근 필요) · I-095(콘솔 소음, 개선 후보) · I-098 · I-099(23일차 이월) · I-079(FR-065 AC2, 21일차부터 계속) · I-080 · I-075~078.

## 이번 회차가 드러낸 구조적 문제

**"앱 레이어만 막고 DB가 독립 강제하지 않는다"가 세 번째 회차 연속으로 지배적 결함 형태였다.** I-093·I-097·I-100·I-101이 전부 같은 형태다. 그런데 이번엔 새로운 사실이 하나 더 붙었다 — **I-100은 DESIGN이 이번 회차에 새로 만든 코드에서 나왔고, 배정 메시지에서 팀장이 정확히 그 형태를 미리 경고했는데도 재발했다.** 경고를 읽는 것과 자기 코드에 적용하는 것은 다르다.

**I-091의 표가 UPDATE만 훑었다는 것이 I-101로 드러났다.** 21일차 BOARD가 만든 전수 표는 "self-service RLS **UPDATE** 분기가 컬럼값을 제한하는가"를 물었고, 그 기준으로 `invitations`까지 이번에 닫았다. 그런데 I-101은 **INSERT** 쪽 결함이었고, 그 축에는 표가 아예 없다. **결함 분류 체계 자체에 빈 축이 있으면 그 축의 결함은 아무리 성실히 표를 훑어도 안 나온다.** BOARD가 §9에 "같은 패턴이 다른 테이블에 더 있는지 전수 조사 안 했다"고 남긴 것이 23일차의 출발점이다.

**"한 줄 인접 지적"이 CRITICAL이 됐다.** I-101의 출발은 CREW가 DESIGN의 Task 045를 검증하다 "범위 밖이라 깊이 안 팠다"며 남긴 한 문장이었다. 그것을 팀장이 SQL로 확인하고 BOARD에 넘겨 CRITICAL로 확정했다. **검증자가 범위 밖이라고 판단한 것을 버리지 않고 기록한 것이 결정적이었다.** 21일차 워크로그가 `invitations`를 "미실측"으로 정직하게 표시해 이번 회차 배정이 가능했던 것과 같은 구조다.

**브라우저를 아무도 안 열어봐서 21일차 결함이 절반만 고쳐져 있었다.** I-098·I-099는 21일차 모바일 프레임 도입의 부수효과인데, 그때 발견된 "로그아웃 버튼이 한 번도 안 뜸"은 **컴포넌트 교체로 증상만 봉합**됐고 근본 원인(`md:`가 영원히 안 켜짐)은 그대로였다. 코드 정적 검토·SQL·REST로는 이 종류가 안 나온다.

**팀장의 검증도 얕을 수 있다.** 팀장이 브라우저로 "430px 프레임이 정확히 그려진다"를 확인하고 정상으로 판정했으나, DESIGN이 같은 구조의 귀결(`md:` 도달 불가)까지 파고들어 MAJOR 2건을 찾았다. **21일차 교훈("'실증했다'가 '충분히 실증했다'는 아니다")이 이번엔 팀장에게 적용됐다.**

## 팀장 전체 테스트 (항상 실행)

잔여 `next-server` 프로세스를 정리하고 `.next`를 삭제한 뒤 깨끗한 상태에서 실행했다.

- `npm run lint`: **통과**(0 errors / 0 warnings)
- `npx tsc --noEmit`: **통과**(exit 0)
- `npm run build`: **통과** — Compiled 11.1s / TypeScript 12.6s / 정적 페이지 21개, **26개 라우트** 전부 `ƒ` 동적 서버 렌더링(21일차와 동일)

**팀장 브라우저 실검증**(NFR-040, DESIGN이 못 채운 자리 보완): 프로덕션 빌드 + Chromium으로 확인 — 모바일 프레임 430px(`--container-app` 토큰 일치) · 테마 3상태 팝오버(밝게/어둡게/시스템) 정상 · 크루 12색 팔레트 라이트·다크 양쪽 식별 가능 · **FR-055 배지와 접근성 라벨** · **FR-072 "투표 종료" 스위치 비활성 + 안내 문구** · 미인증 `/notifications` → `/login?redirect=` 정상 · 로그인 상태 콘솔 오류 **0건**.

## 문서 갱신

- `docs/ROADMAP/team/*.md` 상태 마커: **01.CORE.md Task 044**(완료) · **02.DESIGN.md Task 045**(완료 + I-098·I-099 23일차 이월 명시) · **04.BOARD.md Task 037**(완료).
- `docs/team/*.md`: **변경 없음**(팀원 상태 변화 없음).
- `docs/prioritization-and-risks.md`: **D-056 ~ D-064 신규 9건**. D-059는 I-100 대응으로 정정.
- `docs/ISSUES.md`: **I-093 ~ I-101 신규 9건**, 그중 6건을 같은 회차에 닫음. I-017·I-018(해결) · I-088 · I-091 표도 갱신.
- `docs/CONVENTIONS.md`: eslint zone 1~8 전체 표 신설(I-088).
- 신규 결정 문서 5건: `concurrency-load-037.md` · `remaining-c-features-044.md` · `observability-browser-045.md` · `invitations-self-service-i091.md` · `meetups-insert-bypass-101.md`.
- 마이그레이션 **8건** 적용, DB ↔ 로컬 `supabase/migrations/` 전건 일치 확인.

## 다음 회차에 열리는 Task

완료 집합이 {001~037 전량 · 038~042B · 044 · 045}가 되어 다음이 열린다:

- **043A · 성능 최적화 — LCP/INP/CLS 렌더링 전략** (BOARD, 의존 037 ✓) — 6.5인일 L. **037 완료로 새로 열렸다.**
- **043B · 성능 최적화 — 투표 집계·캘린더 렌더·동시 1,000세션** (BOARD, 의존 037 ✓ · 043A) — 5.5인일 M. **043A 완료 후에 열린다.**

**남은 로드맵 Task는 043A·043B 둘뿐이고 둘 다 BOARD 담당이며 직렬이다.** CORE·DESIGN·CREW는 잔여 로드맵 Task가 없어 이슈 배정이 필요하다 — 23일차 산정 시 재계산한다.

**23일차 착수 전에 확인할 것**:

1. **I-098·I-099가 최우선이다** — 사용자 판단으로 이번 회차에 이월했다. **먼저 "430px 모바일 프레임을 유지할 것인가"라는 설계 결정이 필요하고**, 그다음에 `md:`/`lg:` 클래스 89곳의 처리(살릴 것인가 정리할 것인가)와 `/sample` 폭 토글 복원이 따라온다. `AppShell.tsx`·`MobileTabBar.tsx` docstring 불일치도 함께 조율한다(CORE·DESIGN).
2. **I-101의 축을 전수 조사하라** — BOARD가 §9에 남긴 대로 "RLS만 있고 상태 검사 없음 + SECURITY DEFINER 정당 경로" 패턴이 다른 테이블에 더 있는지 안 봤다. **I-091 표가 self-service UPDATE를 훑었다면, INSERT 축에는 같은 표가 없다.** 21일차에 I-091 표를 만든 뒤 그 범주에서 CRITICAL이 나왔던 것과 같은 기대를 걸 수 있다.
3. **043A·043B가 BOARD 직렬이라 나머지 3명의 이슈 배정이 회차 폭을 결정한다.** 위 1·2가 자연스러운 후보다.
4. **테스트 러너는 여전히 없다(D-052)** — 21일차에 "037·044·045 중 어디서 도입할지 판단할 시점"이라고 남겼는데 셋 다 끝났고 도입하지 않았다. **더 미룰 자리가 043A·043B밖에 없다.**
5. **I-094(요금제 실물 확인)는 운영자 조치가 필요하다** — 현재 프로젝트가 실제로 어느 요금제인지는 MCP로 조회할 수 없다(대시보드 전용). D-057이 "Pro 지출 상한 해제 필요"로 확정했으므로 **실제 플랜이 그에 미달하면 NFR-006이 미충족 상태로 남는다.**
6. **DB 잔존물은 21일차와 동일하다** — DESIGN의 Task 036 테스트 크루 `729ced18-…`(active). 이번 회차 테스트 데이터는 4명 모두 정리 후 재확인했다(CREW가 BOARD의 `notifications` 누락분까지 정리). **여전히 시드 크루를 archived로 만들지 말 것.**
7. **미확인으로 남은 실측**: FR-055 AC2(`IntersectionObserver` 스크롤 발화 → 배지 소멸) · FR-072 토스트 억제 브라우저 관측 · 채팅 삭제 브로드캐스트 실 소켓 전달(21일차부터) · 042B 관리자 콘솔 브라우저 E2E · 회원가입 실측(신규 계정 생성 금지) · I-057(비밀번호 재설정 메일).

## git

- 브랜치: `day-22`
- 커밋: 아래 커밋 절 참고
- 푸시: 사용자 확인 후 결정
