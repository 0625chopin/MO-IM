# 23일차 작업 로그 (2026-07-29)

## 회차 요약

- 활성 팀원: **4명 전원**(CORE · DESIGN · CREW · BOARD).
- 이번 회차 배치 근거: 완료 집합 {Task 001~042B 전량 · 044 · 045} 기준으로 22일차 Task 037 완료가 **043A 하나를 열었다.** 043B는 043A 의존이라 직렬이며, 사용자가 **이번 회차 범위를 043A만으로 확정**했다. 나머지 3명은 잔여 로드맵 Task가 0건이라 22일차 워크로그가 최우선으로 지목한 이슈를 배정했다 — CORE **I-099**, DESIGN **I-098**, CREW **I-101 축 전수 조사**.
- 결과: **완료 로드맵 Task 1건(043A)** + 신규 이슈 **9건 등재(I-102~I-110)**, **그중 7건을 같은 회차에 닫았다.** 마이그레이션 **7건** 적용. 신규 결정 **7건**(D-065~D-071). 전체 테스트 3종 통과.
- **이번 회차의 성격**: **로드맵이 사실상 끝난 회차이면서, 동시에 CRITICAL 2건을 새로 찾은 회차**다. 남은 로드맵 Task는 043B 하나뿐이다. 22일차가 "기능 확장이 결함을 드러낸 회차"였다면 이번은 **"이전 회차가 남긴 빈 축을 메우자 그 축에서 CRITICAL이 나온 회차"**다 — 22일차 BOARD가 §9에 "전수 조사 안 했다"고 남긴 한 문장이 출발점이었다.

## 사용자 결정 2건

이 회차는 시작 시점과 중간에 각각 사용자 판단을 받았다. 둘 다 요구사항·제품 정체성 층위라 팀장이 단독으로 정할 수 없는 것이었다.

1. **430px 모바일 프레임을 유지하고 `/sample`만 예외로 뺀다**(회차 시작 시). I-098·I-099의 뿌리인 설계 결정이다. 프레임 폐기(뷰포트 반응형 복귀)와 브레이크포인트마다 프레임 확대는 검토 후 기각됐다.
2. **FR-063 정상 흐름 ②의 "패널(데스크톱: 사이드 / 모바일: 바텀시트)"를 비구속으로 본다**(회차 중반). BOARD가 교차검증 중 발견한 요구사항 원문과 D-066의 상충을 닫기 위한 판단이다. 근거는 ① AC가 아니라 「정상 흐름」 서술이고 AC1~AC4는 데스크톱/모바일을 언급하지 않는다, ② PRD 백업이 없다, ③ 원문 №10을 확정한 D-012는 "표시" 오타 해석만 다뤘다.

## 팀원별 완료 내역

### BOARD (04.BOARD.md)

- 완료 Task: **043A · 성능 최적화 — LCP/INP/CLS 렌더링 전략** (6.5인일 L, NFR-001)
- 산출물:
  - 신규 문서 — `docs/decisions/performance-043a.md`(측정 조건·원시 수치·재현 절차·사고 보고)
  - 수정 — `docs/ISSUES.md`(I-105 등재·2차 갱신) · `docs/ROADMAP/team/04.BOARD.md`
  - **코드 변경 0건** — 렌더링 전략 위반(수동 메모이제이션·누락된 Suspense·원시 `<img>`·필요한 윈도잉 없음)이 0건이라 고칠 것이 없었다. 근거 없는 수정을 하지 않았다.
- 실측: 격리 헤드리스 Chromium(`node_modules/playwright` 직접 구동, 공유 슬롯 경합 회피) + Lighthouse "Slow 4G"(1.6Mbps↓/750Kbps↑/150ms) + CPU 4배 저하 + 390×844. **16개 라우트에 각 페이지 고유의 무거운 상호작용**을 실제 실행 — 투표 찬성 클릭(실투표)·채팅 타이핑·댓글 타이핑·캘린더 날짜선택·크루 검색·참석 응답·알림 모두읽음·탭 전환. LCP 236~800ms · INP 근사 16~80ms · CLS 대부분 0(calendar 0.0537). **표본 1건씩이라 p75가 아니며, 그 사실을 문서 전체에 명시했다.**
- **I-105 발견·조사**: `PollLiveContainer` 왕복이 4회 재현 전부 실패. DB는 정상 발신, 채널은 `SUBSCRIBED` 도달, 그런데 `channel.on("broadcast")` 콜백이 **한 번도 호출되지 않는다.** 후보 3개를 전부 실측으로 기각했다 — 와일드카드 매칭(팀장이 realtime-js 소스로 배제), 다중화(Node에서 같은 구성으로 정상 동작, 180ms), `binaryType`(phoenix 소스로 배제). 팀장이 특정한 `setAuth` 타이밍 가설은 **1차에 재현되고 `_performAuth` 코드 근거까지 맞아떨어졌으나 반복하자 6분의 1로 무너져 기각했다**(브라우저는 4/4 결정론적 실패). **"Node에서는 되고 실 브라우저에서는 안 된다"까지 좁히고 멈췄다.**
- 비고: **가설이 맞아 보였는데도 재현율이 낮자 코드를 고치지 않은 판단**이 이 회차 최고 판단 중 하나다. D-029의 "측정 근거 없는 예외 금지"를 반대 방향으로 정확히 적용했다.

### CREW (03.CREW.md)

- 완료 Task: **없음**(잔여 로드맵 Task 0건). 이슈 **5건** 발견·수정 — 이번 회차 최다.
- 산출물:
  - 마이그레이션 **6건** — `major_fix_i102_crew_memberships_self_insert_guard` · `major_fix_i103_poll_eligible_voters_insert_scope_guard` · `cleanup_revoke_insert_boards_chat_rooms_dead_surface` · `revoke_execute_on_i102_i103_guard_triggers` · `major_fix_i104_membership_role_normalization_on_approval`(내용은 I-106) · `major_fix_i107_membership_self_transition_role_normalization` · `major_fix_i109_removed_reinstate_role_normalization`
  - 신규 문서 — `docs/decisions/insert-axis-audit-102-103.md`(전수 표·재현·수정·회귀 전문)
  - 코드 — `src/lib/rules/crew-membership-transition.ts`
  - 신규 결정 **D-065** · **D-067** · **D-068** · **D-071** / 등재 — I-102 · I-103 · I-106 · I-107 · I-109 · I-110
- **INSERT 축 전수 조사**: `pg_policies`에서 `cmd IN ('INSERT','ALL')` × `authenticated`/`public` 정책을 전수 열거(초기 23건, REVOKE 2건 반영 후 21건). 각 테이블마다 `WITH CHECK`가 참조하는 컬럼·도메인 불변식·BEFORE INSERT 트리거 유무·정당 경로를 표로 만들고 결함 후보를 **실 REST로** 재현했다.
- **I-102(CRITICAL)**: `crew_memberships_insert_self_request`가 `role`과 크루 `visibility`/`status`를 검사하지 않았다. 공격자가 `role=owner, status=requested`로 자기 행을 직접 INSERT → 정상으로 보이는 가입 신청 제출 → 오너가 **평범하게 승인** → `role=owner, status=active` 확정. **정상적인 가입 승인 한 번으로 크루 공동 오너가 됐다.** private 크루 직접 가입 신청도 뚫렸다(대조군인 `join_requests` 정책은 이미 안전했다).
- **I-103(MAJOR)**: `poll_eligible_voters` 자기 INSERT가 `profile_id`·poll 상태를 안 봐서 비회원 유령 인원 추가(정족수 분모 오염)와 **투표 종료 후 분모 사후 조작**(D-025 스냅샷 불변 위반)이 가능했다.
- **자기반증에서 결함이 3건 더 나왔다**: 팀장 지시로 "가드가 정당 경로를 죽이지 않는가"를 스스로 반증하다가 I-106·I-107·I-110의 실마리가 나왔다. 특히 (a)에서 강퇴 후 재가입이 **PK가 자연복합키라 애초에 INSERT가 될 수 없다**는 구조적 이유까지 내려갔고, (b)에서 `finalize_closed_poll`이 grep에 매치됐지만 본문 확인 결과 INSERT가 아니라 JOIN이었다며 **자기 매치를 스스로 기각**했다.
- 비고: **자기 비판을 문서에 남겼다** — "'검사됨' 판정 대부분이 실제로는 '몇 행이 생기는가'만 봤고 '그 값이 무엇인가'는 일부만 봤다", "I-091이 두 축(행 소유권 제한 / 값 자체 제한)을 한 질문에 뭉뚱그렸다"까지 일반화하고 다음 전수조사에 열 분리를 제안했다.

### CORE (01.CORE.md)

- 완료 Task: **없음**(잔여 로드맵 Task 0건). 이슈 2건 처리.
- 산출물:
  - 신규 문서 — `docs/decisions/appframe-responsive-audit-099.md`(전수 조사·판정·실측·인계 전문)
  - 코드 — `src/components/calendar/DayDetailPanel.tsx`(`useMediaQuery` 제거) · `src/components/ui/drawer.tsx`(x축 프레임 정합) · docstring 4곳 · **죽은 반응형 클래스 28곳 제거** · `D-065`→`D-066` 오인용 18곳 수정
  - 문서 — `docs/requirements/requirements.md`(FR-063 정정, 원 서술은 이력 보존) · `docs/ISSUES.md` · `docs/prioritization-and-risks.md`
  - 신규 결정 **D-066** · **D-070** / 등재 — I-104
- **I-099 — "요구사항 해석 정정"으로 종결**: NFR-026 원문에 "데스크톱↔모바일 전환" 요구가 없고 `AppShell.tsx`의 옛 docstring이 **원문에 없는 조건을 스스로 추가**했던 것임을 확정했다.
- **반응형 클래스 전수 조사**: `globals.css`가 "앱 코드 89곳"이라고 적어 둔 것을 **실제로 세어 55개 토큰으로 검산 정정**했다. 그리고 팀장이 배정 메시지에서 준 분류 (b)("`fixed`라 뷰포트 기준으로 동작")가 **이 코드베이스에 0건**임을 밝히고 되짚어 말했다 — 컨테이너 쿼리는 DOM 조상 관계로 평가되지 `position`과 무관하다. 대신 **(a′)** 를 신설했다: `Dialog`/`Drawer`/`Toast`는 Portal로 `<body>`에 붙어 **DOM 트리에 `appframe` 조상 자체가 없다.**
- **I-104 — 추정을 실측으로 바꾸자 실제 결함이었다**: 1280px에서 `DayDetailPanel`이 **960px로 열려 430px 프레임을 완전히 감싸고 뷰포트 우측 끝까지 덮고 있었다**(768px에서도 오른쪽 169px 초과). `Dialog`·`Toast`를 대조군으로 함께 재서 **`Drawer` x축만 프레임 정합이 빠져 있었다**고 범위를 정확히 그었다. 사용자 결정 후 `useMediaQuery` 분기를 제거해 프레임 안 바텀시트로 통일했고, **이 저장소에 남아 있던 마지막 실 뷰포트 반응형 분기가 사라졌다.**
- 비고: 공유 `.next` 충돌을 두 번 겪자 **저장소 전체를 격리 복제해 측정**했다. 1차 수정(`ui/drawer.tsx` x축 정합)은 소비자가 0곳이 됐는데도 **되돌리지 않고 프리미티브에 남겼다** — 나중에 `left`/`right`를 쓸 때 처음부터 맞는 기본값이 되도록.

### DESIGN (02.DESIGN.md)

- 완료 Task: **없음**(잔여 로드맵 Task 0건). 이슈 1건 해소 + 교차검증 3회.
- 산출물:
  - **route-group 재구성** — `src/app/layout.tsx` → `src/app/(shell)/layout.tsx`, AppShell이 필요한 라우트 전부를 `git mv`로 이동. `src/app/sample/layout.tsx`(신규, AppShell 없음)를 형제 루트 레이아웃으로 분리.
  - 신규 — `src/app/global-not-found.tsx` · `src/app/sample/{layout,error,not-found}.tsx` · `docs/decisions/sample-frame-escape-098.md`
  - 수정 — `next.config.ts`(`experimental.globalNotFound`) · `src/components/sample/PreviewFrame.tsx` · `src/app/sample/page.tsx` · `globals.css` 주석
  - 신규 결정 **D-069** / 등재 — I-108
- **I-098 해소**: 폭 토글 4단계가 이제 **전부 다른 값**이다 — 프레임 360 / 768 / 1280 / 1392px, 그리드 1열 / 3열(236px) / 3열(407px) / 3열(445px). 22일차에 "양쪽 다 175px 175px"였던 그 자리다.
- **인계 문서가 다루지 않은 공백 3건을 실행 중 발견·해소했다**: ① `error.tsx`/`not-found.tsx`가 세그먼트 경계 파일이라 최상위에 홀로 남으면 안 됨 → 함께 이동·짝 신설. ② **복수 루트 레이아웃에서 "아무 라우트에도 안 걸리는 URL"이 구조적으로 처리되지 않음**(실측 확인) → `global-not-found.tsx`. ③ **`/sample`을 프레임 밖으로 빼면 CORE가 "c"로 인계한 5곳이 오히려 영구 사망**할 상황 → named container를 다시 세움.
- 비고: **지시를 그대로 집행하지 않고 결과가 성립하는지까지 봤다.** ③은 팀장 지시와 CORE 조사 문서가 둘 다 놓친 것이다.

## 교차검증 결과

- **CREW → BOARD**(043A): 6항목 중 **2 FAIL · 1 표기 미흡 · 1 확대**. **①** NFR-001 원문이 p75를 요구하는데 §0·§2가 단일 표본을 "PASS"로 단정 — **BOARD 자신이 §1에서 그은 선을 §0·§2가 넘었다**는 구조로 짚었다. **②** 19개 라우트 중 **18개를 같은 헤더의 "테마 변경" 버튼 하나로** 쟀다 — *"성격이 완전히 다른 페이지들이 거의 다 48ms로 같게 나온 것 자체가 증거"*라는 논증으로 수치의 이상함에서 방법론의 결함을 역추적했다. **④** 토픽 문자열을 DB·클라이언트 양쪽에서 대조해 19일차식 불일치를 **먼저 배제한 뒤**, 채팅·알림이 같은 `subscribeToRoomViaBroadcast`를 쓰고 **셋 다 fallback이 없다**는 것으로 I-105 파급을 확대했다. → BOARD가 4건 전부 반영, **재검증 4 PASS · 1 경미한 잔여**.
- **BOARD → CORE**(I-099 · D-066 · I-104): 5항목 중 **1 부분 FAIL · 4 PASS + 별건 1건**. 부분 FAIL이 이 회차의 분기점이었다 — NFR-026 원문에는 CORE 말대로 데스크톱 요구가 없지만, **`requirements.md:868` FR-063 정상 흐름 ②에 있었다**("데스크톱: 사이드 / 모바일: 바텀시트", 문서 전체에서 "데스크톱"이 나오는 **유일한** 자리). D-066이 **"추정과 상충 가능성"이 아니라 요구사항 원문과 명시적으로 상충**하는 상태였음이 드러났다. 428px vs 430px(`min-[26.875rem]:border-x`의 좌우 1px)도 정확히 설명했고, `LogoutButton`이 `/settings`에 살아 있는 진입점을 따로 가져 21일차 함정의 재발이 아님을 실제 동작으로 확인했다. 별건으로 **`D-065` 오인용 18곳**을 찾았다.
- **DESIGN → CREW**(I-102 · I-103): **전 항목 PASS.** `pg_policies`를 직접 재조회해 21건(CREW의 23건에서 REVOKE 2건을 뺀 것과 정확히 일치)을 확인하고, 공격·정상 경로를 **전부 실 REST로** 다시 쐈다. `pg_proc.prosrc` 독립 재조회로 `crew_memberships` INSERT 지점이 정확히 3개임을 CREW와 무관하게 검산했다. **자기 테스트로 생긴 `notifications` 1건을 스스로 발견해 정리했다** — 22일차에 CREW가 지적했던 그 누락 패턴을 이번엔 검증자가 스스로 잡았다. 추가로 **분류 공백 1건**(`chat_room_reads.last_read_at`)을 찾았다.
- **DESIGN → CREW**(I-106 · I-107 · FR-027 E3): 5 PASS + **1 이견**. ②에서 **"self 재신청 시점에 이미 role=member로 정규화됨"**을 잡아내 진입점 가드가 완결 지점보다 먼저 덮는다는 **순서까지 실측으로 보였다** — 이중 방어가 실제로 이중인지를 확인한 셈이다. 이견은 아래 I-109 항목 참고.
- **CORE → DESIGN**(I-098): **5항목 전부 PASS.** `experimental.globalNotFound`가 공식 문서에서 **정확히 이 상황("multiple root layouts... no single layout to compose a global 404 from")을 위해 지정한 유일한 경로**임을 원문 인용으로 확인했다. 라우트 rename 매핑을 전수 확인해 R-016·FR-052 영향 0건을 밝혔다. **항목 4가 특히 좋다** — named container 중첩 시 어느 조상이 이기는지 W3C·MDN 어디에도 명문이 없자 **독립 정적 HTML로 중첩 컨테이너를 직접 렌더해 "가장 가까운 이름 일치 조상이 이긴다"를 실측으로 확정**했다.
- **DESIGN → CREW 최종**(`TRANSITIONS` 양방향 대조): 2 PASS · **1 FAIL · 1 이견**. **DB→모듈 방향**에서 `invitations_provision_membership`의 `ON CONFLICT ... WHERE status IN (...)`가 허용하는 **`{declined,rejected,left,removed} → invited`(재초대)가 모듈에 없다**는 것을 찾았다(`invite-eligibility.ts`가 이미 의도된 동작으로 문서화해 둔 전이다). 한 방향만 봤으면 안 나왔을 것이다.

## 발견·해결한 이슈

1. **[CREW] CRITICAL · I-102 — 정상적인 가입 승인 한 번으로 크루 공동 오너가 될 수 있었다** → `crew_memberships_insert_self_request`의 `WITH CHECK`가 `role` 컬럼과 대상 크루의 `visibility`/`status`를 전혀 안 봤다. 공격자가 `role=owner, status=requested`로 자기 행을 직접 INSERT하면 그 뒤는 **오너가 평범하게 승인하는 것만으로** 완성됐다 — `join_requests_sync_membership_on_decision`이 `status`만 바꾸고 `role`을 건드리지 않기 때문이다(팀장이 SQL로 독립 확인). **D-002 오너 단일성을 정면으로 깬다.** private 크루 직접 가입 신청도 뚫렸다(FR-022 E1 위반). → BEFORE INSERT 트리거 가드 신설(정당 생성 경로가 SECURITY DEFINER가 아니라 클라이언트 직접 INSERT라 REVOKE가 아닌 트리거를 썼다) (재검증 DESIGN 전 항목 PASS, **D-065**)
2. **[CREW] CRITICAL · I-107 — I-106 수정을 통째로 우회하는 진입점이 따로 열려 있었다** (팀장이 SQL로 좁힌 벡터를 CREW가 실 REST로 재현) → invitee가 `invitations`를 **아예 거치지 않고** `crew_memberships`를 직접 `{status:"active"}`로 PATCH하면 승인·수락 트리거를 통과하지 않는다. 기존 가드의 설계 주석이 이 경로를 명시적으로 허용하고 있었다. **완결 지점만 막고 진입점을 안 막으면 방어가 성립하지 않는다.** → `crew_memberships_guard_self_transition`에서 self-service `invited→active`·`{declined,rejected,left}→requested` 시 `new.role`을 `'member'`로 무조건 덮어씀(진입점·완결점 이중 방어) (재검증 DESIGN PASS, **D-068**)
3. **[CREW] MAJOR · I-106 — 탈퇴·강퇴한 임원이 평범한 가입 승인 한 번으로 임원 권한을 되찾았다** (팀장이 `crew_memberships_guard_self_transition` 정의를 읽고 벡터를 특정) → self 분기가 `{declined,rejected,left} → requested`를 허용하면서 **`role`은 바꿀 수 없게 막는다** — 그래서 `staff`인 채 탈퇴하면 role이 그대로 보존되고, 재신청 후 오너가 평범하게 승인하면 `staff`로 복귀했다. **앱 코드(`join-request.ts:109`)는 이미 `role: "member"`로 되돌리고 있었는데 DB가 강제하지 않았다.** CREW가 지시받지 않은 **초대 수락 경로(`invitations_sync_membership_on_response`)에도 같은 공백**이 있음을 스스로 찾아 함께 고쳤다 (재검증 DESIGN PASS, **D-067**)
4. **[CREW] MAJOR · I-103 — 투표 종료 후에도 정족수 분모를 조작할 수 있었다** → `poll_eligible_voters` 자기 INSERT가 `profile_id`(크루원인가)와 poll 상태를 안 봤다. 비회원 유령 인원 추가와 `closed_passed` 확정 후 인원 추가가 둘 다 201로 성공했다(D-025 스냅샷 불변 위반). 유령의 실투표는 403이었는데 그건 **우연한 방어**였고, 이번 수정이 그 우연 자체를 제거했다 (재검증 DESIGN PASS)
5. **[CORE] MAJOR · I-104 — 1280px에서 상세 패널이 430px 프레임을 완전히 감싸고 뷰포트 우측 끝까지 덮고 있었다** (CORE가 정적 분석으로 추정 → 팀장이 실측 지시 → 실제 결함 확인) → `DayDetailPanel`이 `useMediaQuery("(min-width: 768px)")`로 `Drawer`의 `swipeDirection`을 전환하는데, `Drawer` x축만 프레임 정합이 빠져 있었다(768px에서 오른쪽 169px 초과, 1280px에서 960px 폭). **D-066을 실제로 위반하고 있었다** — 프레임이 제품 정체성이라고 결정해 놓고 그 결정의 유일한 반례를 추정으로 남길 뻔했다. → 사용자 결정(FR-063 비구속) 후 `useMediaQuery` 분기 제거 + `Drawer` x축 프레임 정합. 재실측 결과 세 폭 전부 Δ0px (**D-070**)
6. **[CREW] MAJOR · I-109 — 오너의 강퇴 해제가 임원 권한을 조용히 복원했다** (DESIGN이 CREW의 "의도된 예외" 판정에 반대, 팀장이 원문 대조로 확정) → CREW는 "오너가 대상을 지목한 명시적 행위라 안전"으로 예외 처리했으나, DESIGN이 ① 앱의 상태 모델(`crew-membership-transition.ts`)에 이 전이가 아예 없고 ② 호출하는 Server Action·UI가 **0건**이라 그 명시성을 검증할 방법이 없으며 ③ **FR-024가 "대상은 active 멤버"를 요구하므로 원래 ①복귀 ②임명 두 단계인 것을 한 클릭이 뭉쳤다**고 반박했다. 팀장이 FR-027 E3 원문을 확인한 결과 **"강퇴 해제 → 오너만 가능"이 전부이고 role 복원을 요구하는 문장이 없어** DESIGN 손을 들어줬다 → `removed→active`에도 정규화 적용 (재검증 DESIGN 6시나리오 전부 PASS, **D-071**)
7. **[CREW] MAJOR · I-110 — 요구사항 문서가 자기 자신과 모순되고, 규칙 모듈이 틀린 쪽을 따라가 있었다** (DESIGN이 `removed: {}`를 지적 → 팀장이 범위를 네 상태 전부로 확대) → `requirements.md` §2.4 상태 다이어그램은 `declined`·`rejected`·`left`·`removed` **넷 다 종결**로 그리는데, FR-020·FR-022·FR-027 E3는 그 상태에서 나가는 경로를 명시하고 DB는 실제로 **세 종류**를 정당하게 허용한다. **NFR-036이 판정의 단일 소스로 지정한 `crew-membership-transition.ts`가 다이어그램 쪽을 따라가 DB·FR과 어긋나 있었다.** 지금까지 이 회차가 본 형태는 "앱만 막고 DB가 강제 안 함"이었는데 이건 **방향이 반대인 같은 종류의 불일치**다. → 모듈에 `reapply`·`reinstate`·`reinvite` 세 전이를 근거 FR 주석과 함께 반영, 이름과 동작이 정반대가 된 `isTerminalMembershipStatus` 삭제. **`requirements.md` §2.4 다이어그램 정정은 다음 회차 이월**(CORE가 FR-063 정정으로 같은 파일을 만져 충돌 회피)
8. **[DESIGN] MAJOR · I-098 — `/sample`의 폭 토글이 죽어 있었다**(22일차 이월) → 사용자 결정에 따라 Next.js 16 복수 루트 레이아웃으로 `/sample`만 프레임 밖 형제 루트 트리로 분리. 폭 토글 4단계가 전부 다른 값으로 회복됐다 (재검증 CORE 5/5 PASS, **D-069**)
9. **[CORE] MAJOR · I-099 — 앱 셸의 데스크톱·모바일 전환이 어떤 폭에서도 일어나지 않는다**(22일차 이월) → **결함이 아니라 요구사항 해석 오류였다.** 430px 프레임 유지가 NFR-026을 충족하며, `AppShell.tsx`의 옛 docstring이 원문에 없는 조건을 스스로 추가했던 것이다. docstring 4곳 일치, 죽은 반응형 클래스 28곳 제거, `globals.css`의 "89곳" 서술을 55로 검산 정정 (재검증 BOARD 4 PASS + 1 부분 FAIL → 사용자 결정으로 종결, **D-066**)
10. **[BOARD] MAJOR · I-105 — 실시간 투표 갱신이 브로드캐스트를 받고도 화면을 갱신하지 않는다** → **미해결이나 범위를 좁혔다.** DB 정상 발신·채널 `SUBSCRIBED` 도달은 확정, 후보 3개(와일드카드·다중화·`binaryType`)와 팀장이 제시한 `setAuth` 타이밍 가설까지 **전부 실측으로 기각**. "Node에서는 되고 실 브라우저에서는 안 된다"까지 확정하고 멈췄다. **FR-042 AC2 미충족이 실증됐고**, 채팅·알림이 같은 코드 경로에 fallback도 없어 **구조적으로 함께 죽어 있을 가능성이 높다.** 다음 회차 최우선.
11. **[DESIGN] MINOR · I-108 — `chat_room_reads.last_read_at`을 임의 값(미래 포함)으로 위조할 수 있다** → PK가 "1행"은 보장하지만 값 자체를 막는 트리거가 없다. 자기 안읽음 배지(FR-055)만 왜곡되는 자기 한정 영향이라 **등재하되 고치지 않았다**(`reports_insert_self`와 같은 급).
12. **[팀장] 가설 배제 · `event: "*"`는 브로드캐스트에서도 정상 지원된다** → BOARD가 I-105 후보로 올린 것을 `node_modules/@supabase/realtime-js/dist/main/RealtimeChannel.js:684-695`에서 직접 확인해 배제했다. 팀원이 그 후보에 시간을 쓰지 않게 했다.

**미해결로 남긴 것**: I-105(브라우저 고유 원인 미확정, 다음 회차 최우선) · I-108(저위험 보류) · I-110의 요구사항 문서 정정분(다음 회차 이월) · I-094(요금제 실물 확인, 운영자 조치 필요) · I-095(콘솔 소음) · I-079(FR-065 AC2, 21일차부터) · I-080 · I-075~078 · `reports_insert_self`(status 미검사, 저위험 보류) · DELETE/TRUNCATE 축 전수조사(미착수).

## 이번 회차가 드러낸 구조적 문제

**"분류 체계에 빈 축이 있으면 그 축의 결함은 아무리 성실히 표를 훑어도 안 나온다"가 두 번 연속 증명됐다.** 22일차 BOARD가 §9에 남긴 한 문장("같은 패턴이 다른 테이블에 더 있는지 전수 조사 안 했다")으로 시작한 INSERT 축 조사가 **CRITICAL 1건·MAJOR 1건**을 즉시 냈다. 그리고 그 조사가 끝나자 CREW 스스로 **"'검사됨' 판정이 몇 행이 생기는가만 봤고 그 값이 무엇인가는 일부만 봤다"**는 다음 빈 축을 찾아냈고, 거기서 I-108이 나왔다. **DELETE/TRUNCATE 축에는 아직 표가 없다.**

**"제한이 곧 보존"이라는 형태를 기존 질문이 못 잡았다.** I-091 표는 "self-service 분기가 컬럼값을 제한하는가"를 물었고, `crew_memberships`의 self 분기는 role을 **바꿀 수 없게 막고 있어서** 그 기준으로는 안전 판정을 받았다. 그런데 **못 바꾸게 막는 것과 안전한 값으로 되돌리는 것은 다른 요구**다 — 과거에 정당하게 부여된 `staff`가 그대로 보존되어 재활성화 한 번으로 되살아났다(I-106·I-107·I-109). 세 이슈가 전부 같은 뿌리다.

**완결 지점만 막으면 진입점이 남는다.** I-106 수정(승인·수락 트리거에 `role='member'` 강제)이 적용된 직후 CREW가 **그 수정을 통째로 우회하는 진입점**을 찾았다(I-107). 방어를 어디에 두는가가 방어가 성립하는가를 결정한다.

**추정을 남기면 결정이 자기 반례를 품는다.** CORE가 I-104를 "정적 분석 추정, D-066과 상충 가능성"으로 남겼는데, 실측하자 **실제로 D-066을 위반하고 있었다.** 같은 회차에 등재한 결정이 같은 회차에 등재한 이슈에 반박당하는 상태로 회차가 닫힐 뻔했다. 21·22일차가 "브라우저를 아무도 안 열어봐서"라는 교훈을 남겼는데, 이번엔 **열어보긴 했으나 필요한 화면을 안 열어본** 형태였다.

**요구사항 문서 자체가 확정되지 않은 서술을 담고 있었다.** FR-063의 "데스크톱: 사이드 / 모바일: 바텀시트"는 AC가 아니라 「정상 흐름」 서술이고 PRD 백업도 D-* 뒷받침도 없다. §2.4 상태 다이어그램은 FR-020·FR-022·FR-027 E3와 모순된다. **"요구사항 원문에 있다"가 곧 "확정된 요구사항"은 아니다** — 이번 회차는 그 구분을 두 번 해야 했고, 둘 다 원문 대조 없이는 못 했다.

**격리 없는 공유 자원이 사고를 세 번 만들었다.** 4명이 같은 체크아웃의 단일 `.next`, 단일 Playwright 프로필, 단일 DB를 공유한다. BOARD의 전역 `pkill`이 남의 서버를 죽였고, 동시 빌드가 남의 서버 청크를 500으로 만들기를 반복했으며, 브라우저 락 경합이 여러 번 났다. **BOARD·DESIGN 둘 다 자기 사고를 자진 보고했고, 원인은 개인 부주의가 아니라 구조다.** 팀장이 빌드 락으로 직렬화했지만 근본 해법은 워크트리 분리다. CORE는 아예 저장소를 격리 복제해 측정했고, BOARD는 MCP를 안 쓰고 `node_modules/playwright`를 직접 구동했다 — **팀원들이 각자 우회로를 발명했다는 것 자체가 신호다.**

**번호 충돌이 네 번 났다.** 4명이 `ISSUES.md`·`prioritization-and-risks.md`에 동시에 번호를 잡으면 반드시 어긋난다. 마이그레이션 파일명(`i104`)과 실제 이슈 번호(I-106)가 어긋난 채 원격에 적용된 건이 하나 남았다(재적용이 이력을 더 헝클어뜨려 그대로 뒀다). DESIGN이 등재 직전 grep으로 최댓값을 재확인하는 절차를 쓴 뒤로는 충돌이 없었다 — **그 절차를 규칙으로 올릴 만하다.**

**교차검증이 이번엔 팀장 판단도 두 번 뒤집었다.** 팀장이 배정 메시지에서 준 분류 (b)가 이 코드베이스에 0건임을 CORE가 되짚어 말했고(컨테이너 쿼리는 `position`과 무관하다), 팀장이 제시한 `setAuth` 가설을 BOARD가 반복 시행으로 기각했다. 그리고 팀장이 CREW에 지시한 (c)는 **CREW의 이전 답변 안에 들어 있던 반례**를 팀장이 읽고 특정한 것이다. 지시-실행이 아니라 상호 검증으로 돌아간 회차다.

## 팀장 전체 테스트 (항상 실행)

`.next`를 삭제하고 깨끗한 상태에서 실행했다.

- `npm run lint`: **통과**(0 errors / 0 warnings)
- `npx tsc --noEmit`: **통과**(exit 0)
- `npm run build`: **통과** — Compiled 12.3s / TypeScript 14.1s / 정적 페이지 21개, **27개 라우트**. `experimental.globalNotFound` 활성 표시. **라우트 경로가 route-group 재구성 이전과 완전히 동일하다** — CORE의 "route group은 URL에 안 나타난다" 검증이 빌드 산출로 확인됐다(R-016·FR-052 영향 0건).

## 문서 갱신

- `docs/ROADMAP/team/*.md` 상태 마커: **04.BOARD.md Task 043A**(완료, "NFR-001은 단일 표본 참고치로만 확인 · p75 검증은 043B 이월" 명시).
- `docs/team/*.md`: **변경 없음**(팀원 상태 변화 없음).
- `docs/prioritization-and-risks.md`: **D-065 ~ D-071 신규 7건.**
- `docs/ISSUES.md`: **I-102 ~ I-110 신규 9건**, 그중 7건을 같은 회차에 닫음. I-098·I-099도 해결 처리.
- `docs/requirements/requirements.md`: **FR-063 정상 흐름 ② 정정**(원 서술은 이력 보존, D-070).
- 신규 결정 문서 4건: `insert-axis-audit-102-103.md` · `appframe-responsive-audit-099.md` · `sample-frame-escape-098.md` · `performance-043a.md`.
- 마이그레이션 **7건** 적용, DB ↔ 로컬 `supabase/migrations/` 전건 일치 확인.

## 다음 회차에 열리는 Task

완료 집합이 {001~042B 전량 · 043A · 044 · 045}가 되어 다음이 열린다:

- **043B · 성능 최적화 — 투표 집계·캘린더 렌더·동시 1,000세션** (BOARD, 의존 037 ✓ · 043A ✓) — 5.5인일 M. **043A 완료로 새로 열렸다.**

**이것이 로드맵의 마지막 Task다.** 043B가 끝나면 v0.1 로드맵 Task는 전량 완료된다. CORE·DESIGN·CREW는 잔여 로드맵 Task가 없어 이슈 배정이 필요하다.

**24일차 착수 전에 확인할 것**:

1. **I-105가 최우선이다** — FR-042 AC2 미충족이 실증됐고, 채팅·알림이 **같은 `subscribeToRoomViaBroadcast`를 쓰고 fallback이 전혀 없어** 구조적으로 함께 죽어 있을 가능성이 높다. **실시간 기능 전체가 브라우저에서 동작하지 않는 상태일 수 있다.** BOARD가 범위를 "Node에서는 되고 실 브라우저에서는 안 된다"까지 좁혔으니, 남은 것은 브라우저에서 `_binaryDecode` monkeypatch나 CDP `Network.webSocketFrameReceived`로 kind 바이트를 직접 대조하는 것이다(BOARD가 Node에서 쓴 그 방법을 브라우저로 옮기면 된다). **채팅·알림 브라우저 실측을 함께 한다.**
2. **DELETE/TRUNCATE 축에 표가 없다** — I-091이 UPDATE 축을, 이번 회차가 INSERT 축을 메웠고 각각에서 CRITICAL이 나왔다. **같은 기대를 걸 수 있는 마지막 축이다.** CREW가 §7에 후보로 남겼다.
3. **I-110의 이월분** — `requirements.md` §2.4 상태 다이어그램이 FR-020·FR-022·FR-027 E3와 모순된다. 이번엔 CORE가 같은 파일을 만져 이월했다. **모듈은 이미 DB 현실로 고쳐졌으니 문서만 맞추면 된다.**
4. **테스트 러너는 여전히 없다(D-052)** — 22일차가 "더 미룰 자리가 043A·043B밖에 없다"고 했는데 043A가 끝났다. **043B가 마지막 자리다.**
5. **워크트리 분리를 검토할 시점이다** — 이번 회차에 공유 자원 사고가 3건 났고 팀원 4명이 각자 우회로를 발명했다(저장소 격리 복제, MCP 우회 직접 playwright 구동, 포트 분리). 팀장 빌드 락은 임시방편이었다.
6. **이슈 번호 등재 절차** — DESIGN이 쓴 "등재 직전 grep으로 최댓값 재확인"을 규칙으로 올리면 이번 회차에 네 번 난 충돌을 막을 수 있다.
7. **DB 잔존물**: 22일차와 동일한 DESIGN Task 036 테스트 크루 `729ced18-…`(active). **여전히 시드 크루를 archived로 만들지 말 것.** 이번 회차 테스트 데이터는 4명 모두 정리했고 서로 교차 확인했다 — BOARD가 `product_events` **130건**(알림 배지 렌더가 자동 적재)을 뒤늦게 발견해 정리했고, DESIGN이 자기 `notifications` 1건을 스스로 잡았다. **08:50~08:51의 `poll_closed` 알림 3건은 이번 회차 시작(09:32) 이전 잔여물**이라 손대지 않았다(크루·poll ID가 이번 회차 것과 전부 불일치, BOARD 확인) — 이전 회차 소관이다.

   **정리 기준이 이번에 명확해졌다**: CREW가 `meetup_attendances`에 `status='absent'` 행이 남은 것을 잡아냈고, BOARD가 **같은 크루의 형제 Meetup 3건을 대조군으로 조회해 "응답 안 한 계정은 행 자체가 없다"**를 확인했다. 즉 이 앱에서 "원래 응답 없음"은 `absent` 행이 아니라 **행의 부재**다 — `attending_count` 숫자만 맞추는 것은 원복이 아니다. 그 과정에서 두 행 중 하나가 `responded_at 07:50`으로 **22일차 Task 037의 미완결 원복**임이 드러났다(037 문서의 "성공한 쪽만 absent로 되돌림" 서술과 일치). BOARD가 같은 기준으로 둘 다 삭제하고 자기 소관을 넘어선 판단임을 명시했다. **"숫자가 맞는가"가 아니라 "건드리기 전 상태와 같은가"가 기준이다.**
8. **미확인으로 남은 실측**: FR-055 AC2(`IntersectionObserver` 스크롤 발화) · FR-072 토스트 억제 브라우저 관측 · 042B 관리자 콘솔 브라우저 E2E · 회원가입 실측(신규 계정 생성 금지) · I-057(비밀번호 재설정 메일) · NFR-001의 진짜 p75(043B).

## git

- 브랜치: `day-23`
- 커밋: 아래 커밋 절 참고
- 푸시: 사용자 확인 후 결정
