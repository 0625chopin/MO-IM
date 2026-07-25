# 20일차 작업 로그 (2026-07-25)

## 회차 요약

- 활성 팀원: **4명 전원**. 로드맵 Task는 **BOARD 034**·**CREW 042A** 2건이고, 담당 Task가 없던 **CORE**·**DESIGN**에는 19일차 워크로그가 "20일차 착수 전에 확인할 것"으로 남긴 두 건(I-065 / I-069)을 팀장이 추가 배정했다.
- 이번 회차 배치 근거: 완료 집합 {Task 001~033 전량 · 035 · 038 · 039 · 040} 기준으로 의존·선행 대기가 모두 풀린 미완료 Task는 **034**·**041**(BOARD)·**042A**(CREW) 3건이었고, 1인 1건 폭 제한으로 **034**·**042A**를 골랐다. 034를 041보다 먼저 한 것은 크리티컬 패스 판단이다 — **034 완료로 DESIGN의 036이 열려 다음 회차에 4명 전원 가동이 가능해진다**(19일차 워크로그가 예고한 그대로). CORE의 잔여 044는 Task 036 의존, DESIGN의 036·042B·045는 각각 034·042A 의존이라 미개시 상태였다.
- 결과: **완료 Task 2건(034 · 042A)** + **추가 배정 2건 완료**(I-065 · I-069) + **회차 중 파생 2건 완료**(I-070 · I-072). 이슈 **major 3 · minor 다수 발견, 전건 해소**. `docs/ISSUES.md` 신규 등재 **5건**(I-070~I-074), 그중 **3건을 같은 회차에 닫았다**(I-070·I-071 판정 종결·I-072). 결정 신규 **1건**(D-047), 기존 결정 갱신 **1건**(D-040). 마이그레이션 **7건** 적용. 전체 테스트 3종 통과 + 프로덕션 빌드 브라우저 실측 **4회**(포트 3211·3212·3213·3214).
- **이번 회차의 성격**: 18일차가 "비즈니스 규칙이 DB에 없다", 19일차가 "원격 DB와 저장소가 어긋난다"를 드러냈다면, 20일차는 **"방어를 걸었는데 그 방어가 유일한 진입문이 아니었다"** 를 드러냈다. 그리고 그 수정이 **또 다른 결함을 만들었고 그 원인이 팀장 지시였다** — 아래 "이번 회차가 드러낸 구조적 문제" 참고.

## 팀원별 완료 내역

### BOARD (04.BOARD.md)

- 완료 Task: **034 · 투표 자동 종료·판정·Meetup 생성·알림 파이프라인**
- 산출물:
  - 마이그레이션 1건 — `20260725114938_poll_auto_close_pipeline_034`(`run_poll_auto_close_job()` + `polls` AFTER UPDATE 트리거 `finalize_closed_poll` + pg_cron 잡 `poll_auto_close_and_finalize` `*/5 * * * *`)
  - 신규 문서 — `docs/decisions/poll-pipeline-034.md`
  - 수정(docstring·문구만, 판정 로직 무변경) — `src/lib/actions/close-poll.ts`·`poll-auto-close.ts`, `src/lib/data/supabase/meetup.ts`, `/sample`의 poll 섹션 2개
  - 등재 — `docs/ISSUES.md` I-071
- 실측: D-003 종료 트리거 ①②③ 각각을 실 poll 대상 `begin`…`rollback`으로 검증. 가결 시 Meetup 1건 생성(제목·설명·날짜·시간·장소·crew_id 전부 post에서 반영), 알림 적재, 재호출 시 중복 없음(FR-060 AC3 멱등). 동수 → `rejected`(D-003), 강퇴자 제외 알림(D-015), 정족수 미달 → `invalid`.
- **32일차가 남긴 gap 해소**: `write-path-realdata-032.md` §8이 남긴 "비임원이 마지막 투표자면 RLS가 트리거③을 조용히 막는다"를 SQL 백스톱으로 잡았다. `closes_at`이 미래인 채로 종료됨을 실측해 트리거①이 아니라 백스톱이 닫았음을 증명했다.
- 비고: 절차 교훈 하나 — `begin`과 후속 명령을 별도 `execute_sql` 호출로 나누면 트랜잭션이 이어지지 않는다(호출마다 별도 세션). 첫 시도의 `update`가 조용히 롤백된 것을 뒤늦게 확인했고, 이후 전부 단일 호출로 재작업했다. 실 데이터 손상은 없었다.

### CREW (03.CREW.md)

- 완료 Task: **042A · 신고·차단 (FR-080·081)**
- 산출물:
  - 마이그레이션 4건 — `report_block_rpcs_042a`(신고 병합 부분 유니크 인덱스·자기신고/빈사유 CHECK·`create_report`·`create_block` RPC·`private.is_blocked` 헬퍼·`invitations_insert_staff_or_owner` 확장) · `reports_add_self_update_policy_and_guard_trigger` · `fix_anon_execute_on_report_block_rpcs` · `fix_reports_guard_trigger_execute_grant`
  - 신규 — `src/lib/rules/report-eligibility.ts`·`block-content-visibility.ts`, `src/lib/data/supabase/report.ts`·`block.ts`, `src/lib/actions/create-report.ts`·`create-block.ts`·`remove-block.ts`, `src/components/moderation/`(6개), `src/components/sample/sections/moderation.tsx`, `src/components/ui/collapsible.tsx`, `docs/decisions/report-block-042a.md`
  - 수정 — `src/lib/data/index.ts`, `invitation.ts`+`invite-crew-member.ts`(DataResult 반환), `invite-eligibility.ts`, `ko.ts`, `src/components/crews/{MemberList,CrewMembersContainer,crew-member-view-models}`, `src/app/(app)/settings/page.tsx`, `/sample`의 `registry.ts`·`crews.tsx`
  - **후속 배선(팀장 판정)** — 게시판: `board-view-models.ts`(`isAuthorBlocked`)·`BoardListContainer`·`PostDetailContainer`·`BoardListItem`·`PostDetail` / 채팅: `MessageListContainer`·`MessageRoomContainer`·`MessageList`·`MessageBubble` / `/sample`의 `board.tsx`·`chat.tsx` 각 2항목
  - 등재 — `docs/ISSUES.md` I-072(같은 회차에 닫음)
- 실측: `begin`…`rollback` 14개 시나리오 전건 PASS — 신고 최초 접수/병합/자기신고 거부/빈사유 거부, 차단 생성/멱등/자기차단 거부, **차단자→가해자 초대 시 RLS 거부(+비차단 대조군 정상 성공으로 회귀 없음 확인)**, `anon`의 두 RPC 직접 호출 거부, self-service의 `status` 직접 변경 거부·`reason` 변경 허용.
- 비고: **FR-081 AC2(초대 차단)는 DB RLS로 완전 강제**되어 앱 우회가 불가능하다. AC1(콘텐츠 접힘)은 처음에 크루원 목록에만 배선하고 게시판·채팅을 범위 밖으로 뒀으나(동시 작업 충돌 회피), **팀장 판정으로 같은 회차에 배선을 완료**했다 — 아래 "발견·해결한 이슈" 4번.

### CORE (01.CORE.md)

- 완료 Task: **없음**(잔여 044가 Task 036 의존이라 미개시). 대신 팀장 추가 배정 **I-065**(익명 흐름 레이트 리밋) + **I-066 잔여분**(archived 크루 UPDATE 차단), 그리고 회차 중 자체 등재한 **I-070**을 조사 후 같은 회차에 닫았다.
- 산출물:
  - 신규 결정 **D-047** — 익명 핸들 존재 확인은 **IP당 분당 10회**(고정 윈도 60초), `x-forwarded-for` 첫 값 신뢰(Vercel 전제), 헤더 없으면 `"unknown"` 폴백
  - 마이그레이션 2건 — `crews_guard_archived_immutable_i066`(archived 크루 UPDATE 전면 차단 트리거) · `handle_availability_ip_rate_limit_i065`(`handle_availability_check_attempts` 테이블 + RLS 전체 거부 + 전용 정리 잡 19:30 UTC)
  - 신규 — `src/lib/data/supabase/handle-availability-rate-limit.ts`(zone 3)
  - 수정 — `src/lib/rules/rate-limit.ts`(`ANONYMOUS_HANDLE_AVAILABILITY_RATE_LIMIT`), `src/lib/data/index.ts`, `src/lib/actions/check-handle-availability.ts`, `src/lib/actions/signup.ts`, `src/components/auth/SignupForm.tsx`, `src/lib/data/supabase/profile.ts`(docstring 규약), `src/lib/data/supabase/crew.ts`(I-070), `ko.ts`
  - 등재 — I-070(닫음) · I-074(다음 회차 후보)
- 실측: 리밋 경계(10건 기록 상태에서 11번째 `{allowed:false, retryAfterSeconds:10}`, 9건에서 10번째 `{allowed:true}`, 윈도 경계 정상 제외), `anon`/`authenticated` 카운터 SELECT·INSERT 모두 `42501` 거부, archived 크루는 **오너 권한으로도** 수정 차단(해산 RPC 회귀 없음), `pg_trigger`로 `auth.users` non-internal 트리거 0건 확인.
- **미확인(정직하게 남김)**: 실제 Server Action 왕복(브라우저·curl)은 하지 않았고 코드 추적으로만 확인했다.
- 비고: D-005의 20회/60초를 그대로 옮기지 않았다 — 그 값은 **계정당·인증** 위협 모델이고 IP는 공유 자원(NAT/CGNAT·사무실 공용망)이라 다른 모델이라는 판단이다. `SignupForm` blur 정상 패턴을 상한 근거로 삼았다.

### DESIGN (02.DESIGN.md)

- 완료 Task: **없음**(036·042B·045가 전부 034/042A 의존이라 미개시). 대신 팀장 추가 배정 **I-069 근본 해결**.
- 산출물:
  - 전환 4곳 — `src/app/(app)/crews/[crewId]/layout.tsx`(children 대신 `<main>`으로 감싼 `RouteErrorBoundary` 직접 렌더) · `src/components/meetup/MeetupDetailContainer.tsx` · `src/components/crews/CrewSettingsContainer.tsx`(`crew:update_info` 거부 분기만) · `src/components/board/PostWriteContainer.tsx`(`crew_archived` 분기만)
  - 신규 문서 — `docs/decisions/domain-error-channel-069.md`
  - 갱신 — `docs/prioritization-and-risks.md` D-040("20일차 갱신 — 부분 전환 채택"), `docs/ISSUES.md` I-069, `/sample`의 `errors.tsx`·`meetup.tsx`·`board.tsx`
  - 등재 — I-073
- 실측(프로덕션 빌드 `npm run build && npm start`, 총 4회): 비크루원의 크루 게이트·임원 미만의 크루 설정 → "접근 권한이 없어요" 정상 렌더(HTTP 200). **archived 분기**는 새 테스트 크루를 만들어 실제 "크루 해산" 버튼을 클릭(`disband_crew` 커밋)한 뒤 `/board/new` 접근으로 확인 — "접근 권한이 없어요" + `ArchivedCrewBanner` 정상.
- 비고: **DB에 영구 잔존물이 하나 있다** — 위 검증용 테스트 크루(`c4283f8a-139c-4c69-ac4e-3c92e355e3bc`, archived, 이름에 "재사용 금지" 명시). CORE가 이번 회차에 넣은 `crews_guard_archived_immutable` 트리거가 archived를 종착 상태로 강제하므로 **되돌릴 수 없다.** 공유 시드는 건드리지 않았다.

## 교차검증 결과

- **DESIGN → CORE**(I-065·I-066): major 0 · minor 2. 7개 항목 전부 pass. Vercel 공식 문서로 `x-forwarded-for` 스푸핑 차단을 확인해 "첫 값 신뢰" 전제 성립을 입증. `disband_crew` 함수 원문 대조로 archived 트리거와 해산 경로의 무충돌 확인.
- **BOARD → CORE**(I-065·I-066): **major 1** · pass 6. `signup.ts:87`의 리밋 우회 발견(아래 1번). 나머지는 카운터 RLS·archived 트리거·마이그레이션 md5를 **독립 재현**으로 확인.
- **CORE → DESIGN**(I-069): major 0 · minor 3. 컴파일된 Next 런타임(`app-page.runtime.prod.js`)까지 내려가 "클라이언트가 빈 Error를 새로 만든다"를 확인 — 문서 인용을 넘어선 메커니즘 재현. 요구사항 번호 오인용과 Meetup 프레임 오류를 정정(아래 2·3번).
- **DESIGN → CREW**(042A): major 0 · 실질 minor 0. **FR-081 AC1 미충족을 요구사항 원문으로 판정**(아래 4번). anon EXECUTE 누락을 CREW가 스스로 발견해 고친 이력은 "오히려 좋은 신호"로 평가.
- **CREW → BOARD**(034): **이슈 없음**, 7/7 pass. I-071 불가피성을 반증 시도 끝에 확정(아래 5번). TS↔SQL 판정 공식 4지점 원문 대조 + 새 시나리오 5개 독립 실측.
- **BOARD → CREW**(042A, SQL·권한·운영 축): **이슈 없음**, 7/7 pass. `private.is_blocked`의 42P17 미발생, 042B service-role 경로(`auth.uid()`가 실제 null임을 먼저 확인 후 시뮬레이션), 감사 로그 판정을 전부 실측으로 확인. **"검증이 아니라 재현이었다"고 명시.**
- **BOARD → CORE 재검증 ①**: 우회는 닫힘 pass, **새 major 1건**(고아 `auth.users`, 아래 6번).
- **BOARD → CORE 재검증 ②(최종)**: **pass.** stale 캐시 우려를 코드로 반증(단일 엔트리 캐시라 A→B→A는 캐시 미스), "형식 오류 + 리밋 동시"가 구조적으로 발생 불가임을 확인.
- **DESIGN → CREW 재검증 ①**(AC1 배선): **FR-081 완료 판정.** 프로덕션 빌드 + 브라우저 엔드투엔드 실측. minor 1건(접근성, 아래 7번).
- **DESIGN → CREW 재검증 ②(최종)**: **pass.** 포커스·`aria-expanded`·키보드 왕복을 DOM에서 직접 확인.

## 발견·해결한 이슈

1. **[CORE] major · `signup.ts:87`이 D-047 리밋을 완전히 우회한다** (BOARD 발견) → `checkHandleAvailabilityAction`을 거치지 않고 같은 오라클 `getProfileByHandle`(service-role, RLS 우회)을 리밋 없이 직접 호출했고, 95~97행 조기 반환 때문에 `signUpWithPassword`(Auth 내장 리밋)에도 닿지 않았다. **I-058 major①("다른 경로로 같은 오라클에 도달")과 정확히 같은 구조.** → `checkHandleAvailabilityAction` 재사용으로 교체 (재검증 BOARD pass)
2. **[DESIGN] minor · 요구사항 번호 오인용** (CORE 발견) → 전환으로 HTTP 500→200이 됐는데 그게 걸리는 요구사항(**NFR-012**·**FR-011 E1**·**FR-012 AC4**)이 문서에 인용돼 있지 않았다(팀장이 지시에서 NFR-014를 언급한 것도 잘못이었다). → 세 문서에 정확한 번호 인용 + "403을 내려면 `forbidden()`이 필요한데 experimental이라 보류 — 무지가 아니라 프레임워크 제약 아래의 의식적 선택" 명시 (재검증 CORE pass)
3. **[DESIGN] minor · Meetup 404를 "R-012 관점에서 의도된 것일 수 있다"고 프레임한 것이 틀렸다** (CORE 발견) → **FR-064 AC2가 문자 그대로 403을 요구**하므로 승인된 설계가 아니라 미해소 위반이다. → 세 문서에서 프레임 제거·정정, `/sample` note에 caveat 추가, **I-073으로 별개 등재**(I-069 각주로 두면 함께 묻힌다) (재검증 CORE pass)
4. **[CREW] 판정 · FR-081 AC1 미충족** (DESIGN 발견) → `requirements.md:989` 원문이 명시한 "게시판·채팅" 두 위치 중 어느 쪽도 배선되지 않아 AC2만 충족 상태였다. **팀장 판정: 이월하지 않고 배선한다** — 부품 3조각이 이미 만들어져 있어 비용이 낮고, 축소 사유였던 "동시 작업 충돌"이 소멸했다(해당 파일을 잡고 있는 사람이 없었다). → 게시판·채팅 양쪽 배선, I-072 닫음 (재검증 DESIGN "완료 표기 가능")
5. **[BOARD] 판정 · I-071 판정 공식 TS/SQL 이중화가 불가피한가** (CREW 검증) → `poll_vote_tally_for_decision`이 `auth.uid()`를 하드코딩하고 override 인자가 없어 cron 컨텍스트(JWT 없음)에서 항상 예외를 던짐을 정의 원문으로 확인. 더 근본적으로 순수 TS 함수를 Postgres가 호출할 방법이 없다. **TS↔SQL 4지점(정족수·분모·판정 분기·트리거③ 대상자) 원문 대조 전부 일치.** → **불가피한 이중화로 확정**, I-071은 열린 채로 유지(동기화 강제 수단 없음, 계약 테스트 도입 제안)
6. **[CORE] major · 1번 수정이 고아 `auth.users` 경로를 새로 열었다** (BOARD 발견) → 리밋 초과 시 사전 확인을 건너뛰게 한 결과, `signUpWithPassword` 성공 후 `createProfile`이 `23505`로 실패하면 프로필 없는 계정이 남는다(되돌리는 코드 없음). 로그인하면 `forbidden`만 보이는 복구 불가 상태. **메커니즘 자체는 전부터 있었으나 진짜 레이스 컨디션이었고, 수정이 이를 레이스 불필요한 단일 요청·결정론적 트리거로 바꿨다.** → **팀장이 자기 지시를 뒤집어** 리밋 시 제출 차단 + 클라이언트 dedup 추가 (재검증 BOARD 최종 pass)
7. **[CREW] minor · `BlockedContentNotice` 접근성** (DESIGN 브라우저 실측 발견) → 펼치기 클릭 후 `document.activeElement`가 `<body>`로 빠지고 `aria-expanded`가 없었다. 원인은 `expanded` 상태에 따라 완전히 다른 JSX를 반환해 트리거 버튼 자체가 사라진 것. → Base UI Collapsible 기반 `src/components/ui/collapsible.tsx` 신설 후 재작성, 트리거가 항상 같은 위치에 남게 함. **부수 효과로 다시 접기가 가능해졌다**(이전엔 한 번 펼치면 되돌릴 수 없었다) (재검증 DESIGN 최종 pass)

## 이번 회차가 드러낸 구조적 문제

**"방어를 걸었는데 그게 유일한 진입문이 아니었다."** I-065를 닫으려고 `checkHandleAvailabilityAction`에 리밋을 걸었지만 같은 오라클로 가는 두 번째 문(`signup.ts`)이 잠기지 않았다. 이건 I-058 major①과 **같은 형태의 반복**이다 — 그때도 `profile_search` RPC 직접 호출이 리밋을 우회했다. 두 번째 발생이므로 우연이 아니다. BOARD가 지적한 대로 이 저장소는 구조적 강제가 가능한 곳(zone import 규칙·`private` 스키마)엔 이미 강제를 쓰고 있으나, "같은 함수를 여러 곳에서 부를 수 있는" 경우는 docstring 규약에만 의존한다. **I-074**로 다음 회차 후보에 올렸다.

**그리고 그 수정이 또 다른 결함을 만들었고, 원인은 팀장 지시였다.** "리밋에 걸려도 가입 제출을 막지 마라"는 판단이 레이스 컨디션 경로를 결정론적 경로로 바꿨다. BOARD가 재검증에서 잡아냈고 팀장이 지시를 뒤집었다. `docs/prioritization-and-risks.md` D-047의 "정정" 절과 `docs/ISSUES.md` I-065에 **팀장 지시가 틀렸다는 사실을 그대로** 기록했다 — I-065는 하루 안에 "해결됨 → 우회 발견 → 재수정 → 그 재수정의 결함 발견 → 재재수정"으로 **세 번 손댄 끝에** 닫혔고, 각 단계의 "해결됨" 표시가 그 시점엔 부정확했다는 이력이 지워지지 않고 남아 있다.

**검증 방법이 검증 결과를 바꾼다는 19일차 교훈이 이번에도 유효했다.** DESIGN이 프로덕션 빌드 + 브라우저로 4번 실측했고, 그중 두 건(archived 분기 · 접근성 포커스 소실)은 코드 판독만으로는 확인할 수 없는 것이었다. 반대로 CORE의 major 6번은 **브라우저 검증이 불가능해 코드 추적으로만 찾은** 것이고, BOARD는 "실 브라우저였다면 직접 관찰했을 것"이라고 지적했다 — 검증 수단의 부재가 발견을 늦춘 사례다.

## 팀장 전체 테스트 (항상 실행)

- `npm run lint`: **통과**(0 errors / 0 warnings)
- `npx tsc --noEmit`: **통과**(exit 0)
- `npm run build`: **통과**(25개 라우트 전부 `ƒ` 동적 서버 렌더링으로 빌드)

## 문서 갱신

- `docs/ROADMAP/team/*.md` 상태 마커: **04.BOARD.md Task 034**(완료, 20일차) · **03.CREW.md Task 042A**(완료, 20일차 + 후속 배선 노트). CORE·DESIGN은 이번 회차에 완료한 로드맵 Task가 없어 마커 추가 없음.
- `docs/team/*.md`: **변경 없음**(팀원 상태 변화 없음).
- `docs/prioritization-and-risks.md`: **D-047 신규**(익명 흐름 IP 리밋, 정정 절 포함) · **D-040 갱신**(부분 전환 채택, 원문 보존) · R-012에 20일차 해소 각주.
- `docs/ISSUES.md`: **I-070~I-074 신규 5건**. I-065·I-066·I-069·I-070·I-072 상태 갱신.
- 신규 결정 문서 3건: `poll-pipeline-034.md` · `report-block-042a.md` · `domain-error-channel-069.md`.

## 다음 회차에 열리는 Task

완료 집합이 {001~034 전량 · 035 · 038 · 039 · 040 · 042A}가 되어 다음이 열린다:

- **036 · v0.2 통합 테스트 (CRUD·인증·RLS·E2E)** (DESIGN, 의존 030 ✓ · 032 ✓ · 033 ✓ · **034 ✓**) — 10.0인일 L. **034 완료로 새로 열렸다.** 이게 열리면서 CORE 044·DESIGN 045·BOARD 037이 뒤따라 풀린다.
- **041 · 커뮤니티 확장** (BOARD, 의존 032 ✓) — 9.5인일 L. 20일차에 폭 제한으로 미뤘던 것.
- **042B · 신고·차단·관리자 콘솔 — 관리자 콘솔** (DESIGN, 의존 042A ✓ · 038 ✓) — 5.8인일 M. **042A 완료로 새로 열렸다.**
- CORE·CREW는 여전히 담당 없음(044가 036 의존, CREW는 잔여 Task 없음).

**1인 1건 폭 제한을 적용하면 DESIGN이 036·042B 중 하나, BOARD가 041**이므로 실제 배치는 2건이고, 21일차 산정 시 재계산한다. **036을 먼저 하면 CORE 044·DESIGN 045·BOARD 037이 한꺼번에 열려** 다시 4명 전원 가동이 가능해진다 — 크리티컬 패스상 036 우선이 유리하다.

**21일차 착수 전에 확인할 것**:

1. **I-073이 최우선 후보다** — 비소속 회원의 Meetup 상세가 FR-064 AC2가 요구하는 403이 아니라 404를 반환한다. 원인은 `getCrewById`에만 있는 RLS 폴백이 `getMeetupById`에 없는 비대칭이고, 해소하려면 RLS 설계 변경이 필요해 **CORE 소관**으로 제안됐다. 036 통합 테스트가 권한 매트릭스를 전수 검증하므로 그 전에 정리하는 게 낫다.
2. **I-074**(`getProfileByHandle` 재발 방지를 정적 검사로) — 20일차에 범위 확대라 미뤘다. BOARD 제안은 ⓐ 커스텀 ESLint 규칙으로 import를 화이트리스트 파일로 제한 ⓑ 함수명에 위험을 새김(`getProfileByHandleUnsafe_ServiceRoleOnly`). **같은 형태의 우회가 이미 두 번 발생했다**(I-058 major① · I-065 후속).
3. **I-071은 열린 채로 유지된다** — 판정 공식이 TS·SQL 두 곳에 있고 동기화를 강제하는 자동 검사가 없다. 계약 테스트 도입이 제안됐으나 이 저장소엔 **테스트 러너 자체가 없다**(R-002). 036이 통합 테스트 Task이므로 그 안에서 테스트 기반을 세울지 판단해야 한다.
4. **NFR-012·FR-011 E1·FR-012 AC4 미충족이 명시적으로 남았다** — 전환한 4곳이 HTTP 200을 반환한다. 036 통합 테스트가 이 지점을 반드시 건드리므로, "실패"로 볼지 "승인된 편차"로 볼지 미리 합의해 두는 게 좋다(D-040에 근거가 정리돼 있다).
5. **DB 잔존물 2건**: DESIGN의 archived 테스트 크루(`c4283f8a-...`, 되돌릴 수 없음)와, CORE의 archived 트리거가 archived를 종착 상태로 만든다는 사실. **036 통합 테스트에서 크루 해산 시나리오를 돌릴 때 기존 시드 크루를 archived로 만들면 영구적이다** — 반드시 새 테스트 크루를 만들어 쓸 것.
6. **I-057**(비밀번호 재설정 메일 템플릿)은 여전히 검증 불가 — 메일 수신함 접근 수단이 없다. 20일차에도 진전 없음.
7. **042B 인계 계약**: CREW가 `reports.status` 전이(pending→resolved|dismissed, service-role 경로 전제)를 `report-block-042a.md`에 정리했고 BOARD가 SQL 동작과 일치함을 실측 확인했다. 042B는 `audit_logs.action`에 `report.*` 값 추가와 소프트삭제 연동을 **새로 결정해야 한다**.

## git

- 브랜치: `day-20`
- 커밋: 아래 커밋 절 참고
- 푸시: 사용자 확인 후 결정
