# 34일차 작업 로그 (2026-07-31)

## 회차 요약
- 활성 팀원: CORE · DESIGN · CREW · BOARD (4명 전원)
- 이번 회차 배치 근거: v0.1 로드맵 Task 001~045는 24일차에 전량 완료됐다. 이번 회차도 로드맵
  Task가 아니라 **열린 이슈 소진**을 배치 단위로 삼았고, 33일차가 남긴 세 갈래 — ① I-089/D-054
  Tier A 실렌더(BOARD) ② I-159·I-160 처분(CREW·CORE) ③ 미탐색 후속 항목 색인화(CORE) — 를
  선행조건으로 열었다.
- 결과: **(A)급 결함 3건이 연쇄로 발견돼 같은 회차에 전부 해소**, 그 수정이 만든 **회귀 2건도
  같은 회차에 해소**, 교차검증 이슈 전건 소진(0건), 전체 테스트 4종 전부 통과.
- 열린 이슈 **31 → 29건**(해소 3 · 신규 잔여 1). **(C) 외부 입력 대기 3 → 2건** — 28일차
  D-083 이후 처음 줄었고, 제품 값 범주는 전건 종결됐다.

## 팀원별 완료 내역

### BOARD (04.BOARD.md)
- 완료 Task: 로드맵 Task 없음 — 이슈 배정 처리(I-089/D-054 Tier A 실렌더 → (A) 결함 3건 해소)
- 산출물:
  - `docs/design/poll-display-verification-34/README.md`(신규)
  - `docs/design/display-layer-audit-34/README.md`(신규)
  - `src/lib/data/supabase/poll.ts` · `src/lib/actions/cast-vote.ts` ·
    `src/lib/types/poll.types.ts` · `src/lib/data/supabase/database.types.ts` 수정
  - `src/lib/realtime/broadcast.ts`(I-161 docstring 정정)
  - 마이그레이션 5건: `20260730145738_poll_eligible_voters_with_status_rpc_i089.sql` ·
    `20260730145758_poll_eligible_voter_progress_rpc_i089.sql` ·
    `20260730151125_poll_i089_rpcs_fix_silent_inner_join.sql` ·
    `20260731010558_poll_eligible_voter_progress_order_by_anti_reidentification.sql` ·
    `20260731013305_poll_eligible_voter_progress_order_by_comment_correction.sql`
- 비고: 실렌더로 "참여 4명 / 대상 1명"을 잡아낸 것이 이번 회차 (A) 3건의 시작점이다.
  세션 계정 확인 절차로 팀장의 인수인계 오류(계정 `chopin0625` ↔ `chopin_0625`)를 먼저 잡아
  가짜 양성을 회피했다.

### CREW (03.CREW.md)
- 완료 Task: 로드맵 Task 없음 — 이슈 배정 처리(I-159 처분 · I-038 처분 · RLS 축소 클래스 전수조사
  · BOARD 수정 독립 재검증)
- 산출물:
  - `docs/design/rls-narrowed-read-audit-34/README.md`(신규)
  - `docs/design/invitation-defense-symmetry-34/README.md`(신규)
  - `docs/design/crew-crosscheck-34/README.md`(신규)
  - `src/lib/rules/crew-name-validation.ts` · `crew-description-validation.ts` docstring 갱신
  - `docs/ISSUES.md` I-038 블록 갱신
- 비고: I-159의 "나이브 이중화가 거절까지 막는다"는 위험을 **추론이 아니라 실측**으로 확정했고
  (조용한 0행 재현), 위치 zip 재식별을 3회 반복 재현해 (A)급 회귀 1건을 열었다.
  `reset role`이 `request.jwt.claims`를 지우지 않는다는 발견을 자기 스크립트에 소급 적용해
  오염 0건을 증명했다.

### CORE (01.CORE.md)
- 완료 Task: 로드맵 Task 없음 — 이슈 배정 처리(I-160 처분·적용 · 미탐색 후속 항목 색인 신설
  · BOARD 신설 RPC 재검증)
- 산출물:
  - `docs/design/unexplored-followups-index/README.md`(신규, 회차 번호 없는 상시 인덱스)
  - `src/lib/realtime/get-realtime-auth-token.ts` 수정(한 줄)
  - `src/lib/data/supabase/poll.ts` docstring 정정
- 비고: BOARD 신설 RPC의 **INNER JOIN 조용한 탈락**을 독립적으로 발견했다 — 팀장 승인 조건이
  적용되지 않은 채 문서로 대체돼 있던 것을 잡아낸 것으로, 이번 회차 회귀 2건 중 1건이다.

### DESIGN (02.DESIGN.md)
- 완료 Task: 로드맵 Task 없음 — 교차검증 배정(D-091 회귀 체크리스트 §6 실행 가능화 · CORE 색인 검증)
- 산출물:
  - `docs/design/rls-regression-checklist-33/README.md` §6 채움(실행 가능한 스크립트로 교체)
  - `docs/design/display-layer-audit-33/README.md` §9.1 갱신
- 비고: D-091 체크리스트 §6이 `begin; -- 주석; rollback;` 형태로 **실행 불가능**했던 것을
  실스크립트로 교체하고, 문서에서 다시 추출해 재실행하는 방식으로 바이트 수준 일치를 확인했다.
  CORE 색인에서 오인용 1건·stale 1건을 잡아냈다.

## 교차검증 결과
- **CORE → BOARD**: INNER JOIN 조용한 탈락 **fail** → 3차 마이그레이션으로 교정 후 pass.
  배포 정의 전문 재독(예외 도달성)·로컬↔배포 바이트 대조 2건 전부 일치 확인.
- **CREW → BOARD**: 위치 zip 재식별 **fail**(100% 복원 3회 재현) → `order by 1, 2` 적용 후
  **다른 poll·다른 프로필**로 재검증 pass. LEFT JOIN 예외 발화는 실 `delete`로 최초 실물 재현.
  마이그레이션 개수·MD5(회차 표준: version-only) 일치 확인.
- **DESIGN → CORE**: 1차 **fail 2건**(I-024 오인용 · 색인 stale) → 수정 후 2차 **fail 1건**
  (제거 표기 혼재) → 팀장 판정 적용 후 **전건 pass**.
- **BOARD → CREW**: I-159 실측 3시나리오(기준선·나이브·좁은 대안) 교차 확인 pass.
- **팀장 → 전원**: BOARD의 (A) 원인 분석과 CREW의 사후 경로 분석을 대조해 영향 범위를 세 갈래로
  확정. CREW의 영향 방향 오류(과대평가 → 실제는 과소평가)와 과잉 판정(정족수 무력화)을 정정.

## 발견·해결한 이슈
1. [BOARD] **I-164** — `poll_eligible_voters` 직접 조회가 RLS로 role별 다른 행 수를 반환해
   "대상자 수"·"정족수"가 일반 멤버에게 조용히 축소돼 표시 → `private.poll_eligible_voters_
   with_status` RPC 신설(029B 2단, D-025 부기 컬럼 미반환)로 해소. member 1→4 / staff 5→5
   실측. (재검증 CORE·CREW pass)
2. [BOARD] **I-165** — `cast-vote.ts` 종료 트리거③이 일반 멤버 투표마다 poll을 조기 종료
   (두 조회 동시 축소 → `remaining` 항상 0). `withdraw-poll` 알림 수신자 0명도 같은 원인 →
   익명 RPC `poll_eligible_voter_progress` 신설(신원 미반환)로 해소. remaining 0→3,
   수신자 0→4 실측. CREW 독립 조사를 병합했다. (재검증 CREW pass)
3. [BOARD] **I-166** — 두 익명 RPC를 위치로 zip하면 `profile_id ↔ has_voted`가 100% 복원
   (CREW 3회 재현) → `order by 1, 2`(반환 컬럼 전순 정렬)로 해소. **방어 논증이 두 번 틀렸고
   두 번 다 팀장이 기각**했다 — ①"공통 컬럼이 없으니 결합 불가" ②"정렬 기준이 다르니 안전".
   실제 근거는 정규형 논증(순서의 정보량 0, D-101). (재검증 CREW pass)
4. [팀장] **I-167** — 적용된 마이그레이션 파일의 사후 편집을 현재 무결성 검증(개수 + version-only
   MD5)이 구조적으로 탐지하지 못한다. BOARD가 이미 적용된 파일의 주석을 고쳐 로컬과 원격
   `schema_migrations.statements`가 조용히 갈라진 것을 팀장이 원격 직접 SELECT로 발견 →
   **이번 사례는 되돌림 + 정정 마이그레이션 추가로 해소, 탐지 체계 결함은 열림 유지.**
   단순 whole-file MD5로는 안 된다는 것도 실측 확인(무편집 파일도 오탐).
5. [CORE] 신설 RPC의 **INNER JOIN 조용한 탈락** — 팀장 승인 조건(LEFT JOIN + 예외)이 적용되지
   않고 문서 기재로 대체돼 있었다 → 3차 마이그레이션으로 교정. **문서화는 방어가 아니며,
   승인 조건을 대체 판단할 때는 반드시 보고해야 한다**는 규칙을 확인했다.
6. [DESIGN] CORE 색인의 **I-024 오인용**(원문이 완결돼 있는데 "문장이 끊겼다"고 인용 — A등급
   분류 근거 자체가 실물과 어긋남) → A→D 재분류 + 세 곳 정정. **색인 stale**(열림 29 vs 실제
   28) → 재실측값 갱신 + §0에 측정 시각 기준(HEAD·dirty) 명시.
7. [DESIGN] 색인의 **제거 표기 혼재**(§5는 완전 삭제 / §1·§3은 "행 삭제" 라벨의 유령 행) →
   팀장 판정으로 **취소선 + 사유 보존**으로 통일, "집계는 취소선 행을 제외한다"를 §7 규약으로 명시.
8. [DESIGN] **D-091 회귀 체크리스트 §6이 실행 불가능**했다(`begin; -- 주석; rollback;`) →
   실스크립트로 교체하고 문서에서 재추출·재실행해 바이트 일치 확인.
9. [팀장] CREW의 **영향 방향 오류**(remaining 과대평가 주장 → 실제는 두 조회 동시 축소로 0) 및
   **과잉 판정**(정족수 무력화·FR-044 AC3 무력화 주장 → `polls_guard_decision_integrity`가
   DEFINER로 재계산해 덮어쓰므로 저장 값은 정확) 정정. 판정 기준 2개를 남겼다.
10. [팀장] 인수인계 계정 오류(`chopin0625` ↔ `chopin_0625`) — BOARD의 세션 확인 절차가 잡았다.
    **검증 대상에 "남은 세션"뿐 아니라 "인계받은 세션 정보"도 포함**하도록 규칙을 확장했다.

## 팀장 전체 테스트 (항상 실행)
- npm run lint: **통과**(0건)
- npx tsc --noEmit: **통과**(0건)
- npm test: **통과**(6 files / 41 tests)
- npm run build: **통과**(`.next` 삭제 후 클린 빌드)

## 문서 갱신
- `docs/ISSUES.md`: I-164 · I-165 · I-166 · I-167 등재(팀장 단독, D-082). I-038 · I-159 ·
  I-160 "해결됨(34일차)"로 종결. "다음 이슈 번호" I-164 → **I-168**.
- `docs/prioritization-and-risks.md` 6.3절: **D-097**(I-038 처분 — 금칙어 목록 동결) ·
  **D-098**(I-159 처분 — RLS 이중화 기각, DDL 0건) · **D-099**(I-160 처분 — 좁은 수정) ·
  **D-100**(신원과 투표 여부를 어떤 RPC로도 같은 응답에 담지 않는다) · **D-101**(순서도 노출
  채널이며 방어는 정규형 정렬로 정보량을 0으로 만드는 것) 등재. "다음 결정 번호" D-097 → **D-102**.
- `docs/issue-triage-release-readiness.md`: 기준 시점 34일차로 갱신, §2 분류 표 재작성
  (29건), §2-A′ 열림 번호 목록 신설, §2-C((C) 감소의 성격 분석), §3-F(34일차 (A) 서술),
  §4-A(제품 값 전건 종결), §6 34일차 게이트 상태 + 깊이 파기 기록 4회차.
- `docs/ROADMAP/team/*.md` 상태 마커: **갱신 없음**(이번 회차에 완료된 로드맵 Task 0건).
- `docs/team/*.md`: **변경 없음.**
- 초안 파일 5개(`ISSUES.draft.BOARD/CREW`, `DECISIONS.draft.BOARD/CORE/CREW`): 병합 후 삭제.

## 이번 회차가 남긴 판정 기준(다음 회차가 재사용할 것)
1. **축소되는 조회를 합성해 쓸 때는 각 조회를 독립 평가하지 말고 합성 결과로 판정한다.**
   CREW가 `listVotes`만 보고 방향을 반대로 잡은 원인이다.
2. **"클라이언트가 계산한 값이 그대로 저장된다"고 가정하지 않는다.** 이 프로젝트는 판정을 DB
   트리거가 재계산해 덮어쓴다 — 클라이언트 계산이 틀렸음을 확인해도 저장 값까지 틀렸는지는
   따로 확인해야 한다.
3. **문서화는 방어가 아니다.** 승인 조건을 다른 판단으로 대체했으면 반드시 보고한다.
4. **암묵적 공통 순서도 조인 키다.** 컬럼을 분리해도 행 순서가 남아 있으면 결합된다. 방어는
   "정렬 기준이 다르다"가 아니라 **반환 컬럼 전부를 전순 정렬해 순서의 정보량을 0으로 만드는 것**이다.
5. **적용된 마이그레이션 파일은 로컬에서도 사후 편집하지 않는다**(예외 없음). 현재 무결성
   검증은 이 어긋남을 구조적으로 못 본다(I-167).
6. **"우리가 방금 고친 자리"를 다시 파는 것이 가장 수확이 크다.** 이번 회차 (A) 3건 중 2건과
   회귀 2건이 전부 직전 수정의 결과물에서 나왔다.

## 다음 회차에 열리는 Task
- 로드맵 Task는 남아 있지 않다 — 다음 회차도 **열린 이슈 소진**을 배치 단위로 산정한다.
- 1순위 축(§6 34일차 기록의 결론): **직전 회차 산출물의 자기 재검증.**
- 구체 후보: **I-167 전수 감사**(로컬 133건 ↔ 원격 `statements` 대조, 문장 단위 정규화 규칙
  설계 포함 — 이번 회차 미착수 명시) · **`open` 상태 poll에서 I-164·I-165 실물 재현**(DB에
  `open` poll이 0건이라 코드 리뷰로 대체했다) · `docs/design/unexplored-followups-index/`의
  A등급 7건.
- **(C) 2건(I-055 Sentry DSN · I-057 비밀번호 재설정 수신 링크)은 팀이 만들어 낼 수 없다** —
  사용자가 값을 주기 전에는 열려 있다.

## git
- 브랜치: day-34
- 커밋: `91ce12b` — feat: (A)급 3건 연쇄 발견·같은 회차 해소와 그 수정이 만든 회귀 2건까지 소진 (34일차)
- 푸시: `origin/day-34` 성공(2026-07-31, 사용자 승인 후)
