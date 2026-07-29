# 24일차 작업 로그 (2026-07-29)

## 회차 요약

- 활성 팀원: **4명 전원**(CORE · DESIGN · CREW · BOARD).
- 이번 회차 배치 근거: 완료 집합 {Task 001~042B 전량 · 043A · 044 · 045} 기준으로 23일차 043A 완료가 **043B 하나를 열었고, 그것이 v0.1 로드맵의 마지막 Task였다.** 나머지 3명은 잔여 로드맵 Task가 0건이라 23일차 워크로그가 최우선으로 지목한 항목을 배정했다 — CORE **테스트 러너 도입 + I-095 + I-110 이월분**, CREW **DELETE/TRUNCATE 축 전수조사**, DESIGN **미확인 실측 3종**.
- 결과: **완료 로드맵 Task 1건(043B) — 이로써 v0.1 로드맵 Task는 전량 완료됐다.** 신규 이슈 **11건 등재**(I-111~I-115 · I-117~I-122, **I-116은 결번**), 그중 **5건을 같은 회차에 닫았다**(I-111 · I-112 · I-113 · I-114 · I-119). 기존 이슈 **5건 추가 해소**(I-076 · I-080 · I-095 · I-105 · I-110). 마이그레이션 **5건** 적용. 신규 결정 **1건**(D-072). 전체 테스트 4종 통과.
- **이번 회차의 성격**: **"충족"이라고 적혀 있던 판정 두 개가 교차검증에서 무너진 회차**다. 23일차가 "빈 축을 메우자 그 축에서 CRITICAL이 나온 회차"였다면, 이번은 **"관측 조건이 결론을 만들어 냈던 것을 두 번 잡아낸 회차"**다. 그리고 그 둘은 정반대 방향으로 무너졌다 — 하나는 "죽었다"던 것이 살아 있었고(I-105), 하나는 "충족"이던 것이 조건부였다(FR-055).

## 사용자 결정 1건

**테스트 러너(vitest)를 최소 스펙으로 도입한다**(회차 시작 시). D-052가 "043B가 마지막 판단 자리"라고 명시적으로 다음 판단 시점을 남겨 뒀고, 그 043B가 이번 회차에 진행되므로 팀장이 사용자 확인을 받았다. 선택지는 ① 최소 스펙 도입 ② 미루고 R-002를 "수용"으로 재분류 ③ SQL·TS 대조까지 포함이었고, **①이 선택됐다.** → **D-072**로 승격.

## 팀원별 완료 내역

### BOARD (04.BOARD.md)

- 완료 Task: **043B · 성능 최적화 — 투표 집계·캘린더 렌더·동시 1,000세션** (5.5인일 M, NFR-004·005·006) — **v0.1 로드맵의 마지막 Task**
- 해소 이슈: **I-105**(재분류 닫힘) · **I-119**(신규 발견·수정) · **I-121**(신규 등재)
- 산출물:
  - 신규 문서 — `docs/decisions/performance-043b.md`(측정 조건·원시 수치·재현 절차 §7.2에 CDP 계측 코드 스니펫 포함)
  - 수정 — `src/lib/types/poll.types.ts`(`PollTally.participantCount` 신설) · `src/lib/data/supabase/poll.ts`(**실제 버그 수정 지점**) · `src/lib/rules/quorum.ts` · `src/lib/rules/poll-vote-tally.ts` · `src/lib/data/mock/poll.ts` · `src/components/sample/sections/poll.tsx` · `docs/ISSUES.md` · `docs/ROADMAP/team/04.BOARD.md`
- **I-105는 실시간 결함이 아니었다.** 23일차 인계는 "채팅·알림이 같은 `subscribeToRoomViaBroadcast`를 쓰고 fallback이 없어 실시간 기능 전체가 브라우저에서 죽어 있을 수 있다"였다. 실 브라우저에서 CDP `Network.webSocketFrameReceived` + `WebSocket.prototype` 계측(**소스 무수정**)으로 확인한 결과 **파이프라인 전 구간이 작동**했다 — DB 발신 → WS 프레임 수신(kind=4, Node와 동일) → `onmessage` 실행 → 300ms 디바운스와 일치하는 `router.refresh()` RSC 재요청(200).
- **진짜 원인은 I-119**(표시 전용): `getPollTally`가 `poll_vote_tally` RPC의 `participant_count`를 버리고 `for+against+abstain`으로 재계산해, **대상자 5명 미만(D-031 숨김)인 모든 진행 중 투표에서 "참여 N명"이 항상 0**이었다. **실 계정이 2개뿐이라 이 조건을 벗어날 수 없어 100% 재현됐다** — 왜 재현됐는지까지 설명한 것이 이 결론을 믿을 수 있게 만든다.
- 실측 원시 수치: 투표 커밋 t=6917.8ms → WS 프레임 수신 t=7029.4(kind=4) → `router.refresh()` t=7331.0(커밋 후 **301.6ms**, 디바운스와 일치) → 200 응답 t=7603.6. 수정 전/후 대조(대상자 2명): "참여 0명/대상 2명"(B가 투표해도 불변) → "참여 1명/대상 2명, 정족수 미달→충족"(3초 이내).
- NFR-005: 2026-07(대조군) LCP 800ms / 2026-08(크루 14개·Meetup 61건) LCP 608ms, CLS 0.0537 동일. **원문 기준선 "월 200건"은 못 채웠다(61/200, 31%) — 정직하게 갭으로 남겼다.**

### CORE (01.CORE.md)

- 완료 Task: **없음**(잔여 로드맵 Task 0건). 대신 팀장이 배정한 3건 전부 완료 + **교차검증에서 이번 회차 유일한 FAIL 판정**을 냈다.
- 해소 이슈: **I-095**(해소) · **I-110**(이월분 해소) · **I-115**(신규 등재) · **I-122**(신규 등재, MAJOR)
- 신규 결정: **D-072**(vitest 최소 도입)
- 산출물:
  - 신규 — `vitest.config.ts` · `src/lib/rules/{quorum,poll-decision,poll-eligibility}.test.ts` (**27개 테스트**)
  - 수정 — `package.json`(`"test": "vitest run"`) · `CLAUDE.md` · `docs/prioritization-and-risks.md`(D-072 신규, D-052·R-002·I-071 후속) · `docs/requirements/requirements.md`(§2.4) · `src/components/shell/auth-session.ts` · `(app)` 레이아웃 3곳 + 도메인 컨테이너 6개
- **I-095 원인**: Next 16이 `(app)/layout.tsx`와 그 자식을 **병렬 렌더**하므로, 게스트가 이미 `RedirectToLogin`으로 처리될 브랜치에서 자식 컨테이너가 독립적으로 `assertAuthenticatedSession`(throw)을 실행해 서버 콘솔에 오진단 예외가 남았다. **함수 자체를 삭제**하고 호출부 9곳을 Next.js 공식 인증 가이드가 권장하는 `if (!isAuthenticated(session)) return null;` 조기 반환으로 교체했다. HTTP 200은 D-040/D-048 기존 정책이라 그대로 뒀다.
- **I-110**: `requirements.md` §2.4 다이어그램에 누락 전이 3종(재신청·강퇴 해제·재초대) 8개 화살표 반영, 더 이상 사실이 아닌 `--> [*]` 종결 표기 4개 제거.

### CREW (03.CREW.md)

- 완료 Task: **없음**(잔여 로드맵 Task 0건). 대신 **CRITICAL 2건 포함 4건을 발견·수정**했다 — 이번 회차 최다.
- 해소 이슈: **I-080**(→ I-113으로 실증·수정) · **I-111**(CRITICAL) · **I-112** · **I-113** · **I-114**(CRITICAL) · **I-030**(후보 정리, 결정은 보류)
- 산출물:
  - 신규 문서 — `docs/decisions/delete-truncate-axis-audit-111-112.md`(26개 테이블 DELETE 표 · TRUNCATE 그랜트 표 · FK 41건 표 · 자기반증 §6, §9~10에 I-080/I-113 실증 합철) · `docs/decisions/invitation-expiry-i030.md`
  - 마이그레이션 **5건** — `major_fix_i111_revoke_truncate_from_client_roles` · `major_fix_i112_revoke_invitations_delete_dead_surface` · `major_fix_i113_comments_reply_depth_guard` · `major_fix_i114_crew_memberships_invited_active_expiry_guard` · `fix_i114_grant_execute_on_invitation_expiry_helper`
- **이번 축의 무게중심은 DELETE가 아니라 TRUNCATE였다.** "DELETE 정책 26개를 훑어라"에서 멈추지 않고 **TRUNCATE는 RLS가 원천적으로 관여하지 않는 별도 권한 체계**임을 실측으로 증명했고, 거기서 CRITICAL이 나왔다. **26개 public 테이블 중 24개**에서 `anon`/`authenticated`에 TRUNCATE가 살아 있었다(Supabase 기본 GRANT가 21~23일차 내내 한 번도 점검되지 않았다). `ALTER DEFAULT PRIVILEGES`까지 막아 **미래 신규 테이블의 재발**을 닫았다.
- **FK `ON DELETE` 41건 전수**로 간접 삭제 우회가 구조적으로 없음을 확인했고, **RPC 25개 전수**로 "현재 공개 API로는 재현 안 된다"를 과장 없이 명시했다(DESIGN 교차검증에서 `private` 20개를 더해 **45개 전수**로 보강됐다).
- **I-114는 I-030 조사 중 발견한 별개 CRITICAL이다.** I-091이 막은 건 `invitations` UPDATE 경로의 만료 검사뿐이었고, **`crew_memberships`의 self-service `invited→active` 직접 PATCH는 만료를 전혀 안 봤다** — I-107과 정확히 같은 모양(완결 지점만 막고 진입점은 안 막음)이며 **같은 축에서 세 번째**다.
- **자기반증 중 낸 회귀를 스스로 잡았다**: 헬퍼 EXECUTE를 회수해 정당 경로(유효한 초대의 정상 수락)까지 막는 회귀를 냈고, 재검증에서 발견해 별도 마이그레이션으로 되돌렸다. **그 실수도 이슈 본문에 그대로 남겼다.**
- **I-030 실측 결과: 실 DB는 현재 아무것도 안 한다** — `invitations.status`를 `'expired'`로 바꾸는 배치·트리거가 전혀 없고(`pg_cron` job 전수 확인), `crew_memberships.status='invited'`도 영원히 남는다. **요구사항 층위라 확정하지 않고 후보만 정리했다.**

### DESIGN (02.DESIGN.md)

- 완료 Task: **없음**(잔여 로드맵 Task 0건). 대신 이전 회차들이 "미확인"으로 남긴 실측 3종을 수행했다.
- 해소 이슈: **I-076**(닫음) · **I-117**(신규) · **I-118**(신규) · **I-120**(신규, 교차검증 중 발견)
- 산출물: `docs/decisions/browser-observation-055-072-042b-24.md`(신규) · `docs/decisions/cross-verification-core-crew-24.md`(신규) · `docs/ISSUES.md`. **코드 수정 0건**(관측 전용, `git diff --stat src/` 무출력 확인)
- 실 계정 2개(일반회원·관리자)를 **host-only 쿠키 특성을 이용해 `localhost`/`127.0.0.1`로 한 브라우저에서 동시 로그인**시켜 관측했다.
- **판정 앞에 양성·음성 대조를 먼저 세운 것**이 이 보고를 믿을 수 있게 만들었다 — FR-072는 뮤트하지 않은 상태의 토스트를 먼저 확인한 뒤 뮤트 상태를 쟀고, FR-055는 "아직 안 본 메시지를 앞서 읽음 처리하지 않는다"는 음성 대조까지 세웠다.
- **042B**: 비관리자 → `/admin` 404(일반 404와 구분 불가 확인), 관리자 → 정상. 실 클릭으로 "콘텐츠 삭제"·"기각" 재현, `report.post_removed` 감사 로그가 클릭 시각과 일치 — **I-076 닫음.** 계정 제재는 실 계정 보호를 위해 클릭 재현하지 않고 이유를 문서에 명시했다.
- **다만 FR-055 판정은 CORE 교차검증에서 조건부로 정정됐다**(아래 "발견·해결한 이슈" 6번).

## 교차검증 결과

리뷰 짝(프로필 기준)대로 **4명 전원이 상호 검증**했다. 이번 회차는 배치가 4자 전원이라 교차 조합이 6쌍 나왔다.

- **CORE → DESIGN**: **중점 1·2·4 FAIL**, 중점 3·5 PASS. → **I-122 등재(MAJOR)**. 이번 회차 유일한 FAIL이자 가장 중요한 검증 결과.
- **CREW → DESIGN**: 중점 1 **FAIL(근거만, 판정은 유지)**, 중점 2·3·4 PASS. → 문서 §1.3 근거 문장 정정.
- **DESIGN → CORE**: 3/3 PASS. `git diff`로 9곳 전부 대조, `grep`으로 실호출 0건 확인, §2.4 다이어그램 15개 화살표를 FR 원문과 전수 대조.
- **DESIGN → CREW**: 전부 PASS + 보강 2건. → **I-120 등재(MINOR)**, I-030 **네 번째 축** 제안.
- **BOARD → CORE**: 3/3 PASS. → **I-121 등재(MINOR)**.
- **CREW → BOARD**: 5/5 PASS, 새 이슈 없음.

## 발견·해결한 이슈

1. **[CREW] I-111 (CRITICAL)** — `anon`/`authenticated`가 `audit_logs`·`poll_votes` 포함 **24개 테이블을 TRUNCATE 가능**. leaf 테이블은 CASCADE 없이 명령 한 줄로 즉시 전멸. → `REVOKE` + `ALTER DEFAULT PRIVILEGES`. 수정 후 `42501 permission denied` 확인 (재검증 DESIGN pass).
2. **[CREW] I-112 (MAJOR)** — `invitations` DELETE가 `status` 미검사로 **이미 수락된 초대까지 삭제 가능**. `invitation.*`은 감사 로그에 없어 이 테이블이 "누가 누구를 초대했는가"의 유일한 기록. 앱 코드 사용처 0건(죽은 표면)이라 D-064대로 REVOKE (재검증 DESIGN pass).
3. **[CREW] I-113 (MAJOR)** — 댓글 depth 1 제한이 앱 레이어에서만 강제되고 RLS는 막지 않음(I-080 실증). **BOARD의 21일차 정적 분석이 옳았음을 실행으로 확인**한 뒤 BEFORE INSERT 트리거로 차단 (재검증 DESIGN pass — depth1 **생존**을 처음 실측).
4. **[CREW] I-114 (CRITICAL)** — `crew_memberships`의 self-service `invited→active` PATCH가 **초대 만료를 전혀 검사하지 않음**. I-107과 같은 결함군 세 번째. → `private.has_valid_pending_invitation()` 가드 (재검증 DESIGN pass — 잔여 우회 경로 추가 발견 없음, 정당 경로 독립 재현 성공).
5. **[BOARD] I-119 (MAJOR)** — `getPollTally`가 RPC `participant_count`를 버리고 재계산해 대상자 5명 미만 투표에서 "참여 N명"이 항상 0. **I-105의 진짜 원인** → RPC 값을 그대로 옮기도록 수정 (재검증 CREW pass — **과거 오판정된 투표 없음**을 세 독립 경로로 확인).
6. **[CORE] I-122 (MAJOR)** — **DESIGN의 FR-055 "충족" 판정이 짧은 방에서만 우연히 성립했다.** DESIGN이 쓴 방은 메시지 9~11건이라 412×915 뷰포트에 전부 들어가, 하단 sentinel이 로드 시점에 이미 화면 안에 있었다. CORE가 같은 방에 임시 메시지 40건을 넣어 컨테이너를 5,000px 이상으로 늘려 재현: **sentinel이 화면 아래 5,153px, `window.scrollY`는 시종일관 0인데 `last_read_at`이 마운트 시각으로 채워졌고, 6초 더 기다리자 또 전진했다**(13:07:52 → 13:08:53). 원인은 `IntersectionObserver`가 `root: scrollRef.current`를 받는데 **I-118 때문에 그 컨테이너가 아무것도 클리핑하지 않아** sentinel이 관찰 시작 즉시, 그리고 레이아웃 재계산마다 계속 "교차 중"으로 보고되는 것. **DESIGN이 "원인 미상"으로 남긴 27초 전진이 잡음이 아니라 같은 구조적 특성이었다.** → 판정 정정(§1.3 실측은 유지, §1.4 "영향 없음"은 철회)과 I-118 심각도 상향. **코드는 고치지 않았다** — `AppShell` 수정은 19개 페이지 × 라이트/다크 × 3뷰포트 회귀 위험이 있어 별도 회차가 필요하다.
7. **[CORE] I-095** — `(app)` 인증 가드 미통과 요청의 오진단 예외 로그. 병렬 렌더가 원인 → `assertAuthenticatedSession` 삭제, 조기 반환 9곳 교체. 게스트 10개 라우트 실측으로 예외 0건 확인 (재검증 DESIGN·BOARD pass — BOARD가 `curl /calendar`로 HTTP 200 + 로그인 유도 본문 + `<main>` 0개까지 확인).
8. **[CORE] I-110** — `requirements.md` §2.4가 FR-020·FR-022·FR-027 E3와 모순. 23일차에 모듈은 고쳤고 이번에 문서를 맞췄다 (재검증 DESIGN pass — 15개 화살표 전수 대조).
9. **[DESIGN] I-076** — `report.post_removed` 감사 로그 미실측. 실 클릭으로 확인해 닫음 (재검증 CREW pass — **I-076 원문을 다시 읽어 "보존이 아니라 실측 커버리지"가 요구사항임을 확인**).
10. **[BOARD] I-105** — "실시간 갱신 안 됨" → **오진으로 판명, 재분류 닫힘**(위 BOARD 절 참고).

**열린 채 남은 신규 이슈**: I-115(`/admin` 게스트 42501, DESIGN 소관 이월) · I-117(신고 UI 진입점 없음) · I-118(`AppShell` 높이 제약) · I-120(가입신청 트리거의 `new.status` 미검사, MINOR) · I-121(D-072 범위 밖 — 데이터 레이어 매핑에 자동 테스트 없음) · I-122(위 6번).

## 팀장 전체 테스트 (항상 실행)

- `npm test`: **27/27 통과** (3 test files) — 이번 회차 신규 도입
- `npm run lint`: **통과** (0 errors)
- `npx tsc --noEmit`: **통과** (exit 0)
- `npm run build`: **성공** (Turbopack, 21개 라우트)

## 문서 갱신

- `docs/ROADMAP/team/04.BOARD.md`: **Task 043B 상태: 완료 (24일차, 2026-07-29)** — 이 일정의 마지막 Task
- `docs/ROADMAP/team/{01.CORE,02.DESIGN,03.CREW}.md`: 변경 없음(잔여 로드맵 Task 0건, 이번 회차 배정은 전부 이슈)
- `docs/team/*.md`: **변경 없음**(팀원 상태 변화 없음)
- `docs/prioritization-and-risks.md`: **D-072 신규**, D-052·R-002·I-071 후속 갱신
- `docs/requirements/requirements.md`: §2.4 멤버십 상태 다이어그램 정정
- `CLAUDE.md`: "테스트 러너·포매터·CI 미설정" 문장을 D-072 반영해 수정
- `docs/ISSUES.md`: 신규 11건 등재, 기존 5건 상태 갱신, **팀장이 헤더를 세 번 정정하고 회차 종료 시 I-111~I-122 구간을 번호순으로 재정렬**(바이트 수 동일 확인)

## 이번 회차가 남긴 운영 규칙

1. **빌드 락을 `flock`으로 바꿨다.** 23일차의 "팀장만 빌드"는 임시방편이었고 4명 동시 회차에서는 응답 지연만 만든다. `flock <lock> -c "npm run build"`는 동시 실행을 **에러가 아니라 대기**로 바꾼다. `tsc --noEmit`·`lint`는 `.next`에 쓰지 않으므로 락 없이 쓴다.
2. **서버 종료는 포트 해제를 확인하고 재기동한다.** BOARD가 **이전 회차 서버 프로세스(pid 161219)가 안 죽고 남아 있던 것**을 발견했다. `kill` 뒤 `while fuser PORT/tcp; do sleep 0.5; done`으로 실제 해제를 확인하고 재기동해야 한다 — `next start` 프로세스가 구 `.next` 청크를 쥔 채 남으면 새 빌드 후 500을 낸다(043A가 기록한 공유 `.next` 사고 패턴과 같은 계열).
3. **이슈 번호 충돌은 "등재 직전 grep"으로 못 막는다 — 이번 회차에 네 번 났다**(I-111 두 번 · I-115 두 번 · I-120 · I-122). grep과 쓰기 사이의 간격이 원인이고, **팀장이 지시한 번호조차 낡아 있었다.** 4명이 같은 파일 끝에 append하는 구조 자체를 바꾸지 않으면 반복된다 — 다음 회차에 구조적 대안(팀원별 초안 파일 분리 후 팀장이 병합, 또는 등재를 팀장 단일 창구로)을 결정해야 한다. **I-116은 결번으로 남겼다**(이미 등재된 번호를 당기면 상호 참조가 깨진다).
4. **임시 산출물 디렉터리를 `.gitignore`에 넣어야 한다.** 이번 회차에 세 명이 `.tmp-e2e/`를 공유해 쓰다 서로 남의 파일로 오인했다. 재현 가치가 있는 것은 **문서에 코드 스니펫으로 옮기고 파일은 지운다**(BOARD가 `performance-043b.md` §7.2에, DESIGN이 관측 문서 §1.4에 그렇게 했다).

## 다음 회차에 열리는 Task

**없다 — v0.1 로드맵 Task는 전량 완료됐다.** 001~045 전부 끝났다.

**따라서 다음 회차는 로드맵이 아니라 잔여 이슈와 사용자 결정으로 구성된다.** 착수 전에 확인할 것:

1. **사용자 결정 대기 — I-030(초대 만료 시 짝 `crew_memberships` 상태).** 요구사항 층위라 팀이 확정하지 않았다. 후보는 A(현상유지+UI 보강) / B(pg_cron 배치, 짝 상태를 B-1 `declined` 재사용·B-2 신규 상태값·B-3 삭제 중 선택, **B-1 권장**) / C(`invitations`만 정리) **+ D(DESIGN 제안: 배치 없이 `listInvitationsForProfile` 쿼리에 `expires_at > now()` 조건만 추가 — 서버 쿼리 필터링)**. 문서: `docs/decisions/invitation-expiry-i030.md`.
2. **I-122 + I-118이 최우선 후보다.** 근본 수정(`AppShell.tsx`의 `min-h-full` → 실제 높이 제약)이 둘을 함께 닫지만 **19개 페이지 × 라이트/다크 × 3뷰포트 회귀 검증**이 필요해 별도 회차가 적절하다. 원 구현자는 CORE(21일차), 현 소유자는 DESIGN이라 **조율이 선행돼야 한다.**
3. **I-117(신고 UI 진입점 없음)은 FR-080 AC1이 실사용 불가라는 뜻이다.** 백엔드는 4종 다 완비돼 있고 순수 UI 배선 누락이다 — 게시판·채팅 컴포넌트 소유팀 몫.
4. **네 축이 전부 소진됐다.** UPDATE(I-091) · INSERT(I-101~103) · DELETE/TRUNCATE(I-111·112)가 각각 CRITICAL을 냈고, **"빈 축"은 이제 없다.** CREW가 문서에 남긴 대로 다음 결함은 새 축이 아니라 **기존 축의 회귀**일 가능성이 높다 — 조사 방법을 바꿔야 한다.
5. **I-121이 D-072의 다음 단계를 가리킨다.** vitest는 순수 함수 3개만 덮어, **I-119의 진원지였던 데이터 레이어 매핑은 같은 결함이 재발해도 `npm test`가 통과한다.** BOARD가 실측으로 대비를 보였다 — `quorum.test.ts`는 옛 구현에서 실제 FAIL하지만 데이터 레이어를 되돌리면 아무것도 실패하지 않는다.
6. **I-071(TS↔SQL 판정 공식 이중화)은 여전히 열려 있다.** D-072가 명시적으로 범위 밖으로 뒀다. 실행 기반 대조가 없으면 자동으로 잡을 방법이 없다는 CORE의 판단은 그대로 유효하다.
7. **여전히 미확인**: I-094(월간 Realtime 과금·실제 요금제 — 대시보드 전용이라 MCP로 불가) · I-057(비밀번호 재설정 메일) · 회원가입 실측(신규 계정 생성 금지) · **NFR-005의 원문 기준선 월 200건**(61/200에서 멈춤, CREW가 합성 데이터 생성의 위험을 근거로 v0.2 이월에 동의).
8. **DB 잔존물**: Task 036 테스트 크루 `729ced18-…`(active) — **여전히 시드 크루를 archived로 만들지 말 것.** 이번 회차 테스트 데이터는 4명 모두 정리했고 **서로 교차 확인했다** — CREW가 DESIGN의 원복 6개 항목을 독립 재조회해 전부 일치 확인, BOARD의 padding 크루원 3명 제거도 확인했다. 회차 중 관측된 카운트 증가(`poll_votes` +1 · `crew_memberships` +3 · `comments`)는 **전부 출처가 규명되고 원복됐다.**

## git

- 브랜치: `day-24`
- 커밋: (아래 참고)
- 푸시: (사용자 승인 후)
