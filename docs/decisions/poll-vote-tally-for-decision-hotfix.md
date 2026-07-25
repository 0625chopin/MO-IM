# 판정 전용 집계 RPC `poll_vote_tally_for_decision` 신설 (17일차, 팀장 배정 핫픽스)

- **일자**: 2026-07-25(17일차)
- **담당**: CORE(A팀)
- **참조**: D-031(대상자 5명 미만 진행 중 집계 숨김), D-003(투표 규칙·종료 트리거 ①②③),
  D-032(정족수 ceil), D-022(트리거③ 미투표자 정의), FR-043·FR-044
- **선행 산출물**: `docs/decisions/rls-policies-029b.md`(`public.poll_vote_tally`의 2단 구조 최초
  설계), `src/lib/data/supabase/poll.ts` §모듈 docstring("실재하는 버그" 절 — 팀장이 이번 회차에
  직접 등재)

## 0. 문제 (팀장 실측, 원문 그대로 재확인)

`src/lib/actions/poll-auto-close.ts`의 `decideAndClosePoll`이 종료 판정에 `getPollTally`(=
`public.poll_vote_tally` RPC 경유)를 쓴다. 그 RPC는 D-031을 강제해 **대상자 5명 미만 + `open`**
이면 `for_count`/`against_count`/`abstain_count`를 `null`로 반환하고, `getPollTally`가 이를 0으로
매핑한다. `decideAndClosePoll`은 poll이 **`open`인 동안**(트리거①②③ 중 무엇이 발화했든, 종료
처리가 끝나기 전) 호출되므로 이 숨김 조건이 그대로 걸려 **정족수·가결을 0표 기준으로 계산**한다.

**직접 확인한 사실**: `src/lib/actions/cast-vote.ts`(트리거③, 마지막 투표 직후 동기 체크)와
`src/lib/actions/close-poll.ts`의 `closePollEarlyAction`(트리거②)·
`simulateScheduledPollClosureAction`(트리거①의 QA 시뮬레이터)이 이미 프로덕션 경로에서
`decideAndClosePoll`을 호출한다 — 미래에 생길 코드가 아니다. `closePoll`(마지막 저장 단계)이
아직 Mock 쓰기라 Supabase 실 UUID에는 항상 `not_found`를 반환해 오늘은 이 잘못된 판정 결과가
저장되지 않지만, 이건 **설계된 방어가 아니라 우연한 폐기**다 — Task 032가 poll 쓰기를 Supabase로
옮기는 순간 그대로 저장되어 대상자 5명 미만 크루의 모든 투표가 항상 `closed_invalid`(정족수
0/필요치)로 잘못 판정된다.

## 1. 왜 별도 RPC인가 (기각한 대안)

- **대안 A(기각) — `poll_vote_tally`의 숨김 조건에 "판정 호출인지" 플래그를 추가한다.** 표시용
  함수 하나가 두 가지 계약(화면 노출 vs 서버 판정)을 겸하게 되어 호출부마다 플래그를 올바로
  넘겼는지 추적해야 한다 — 지금 버그가 정확히 "겸용"에서 나왔으므로 겸용을 유지한 채 플래그만
  얹는 수정은 같은 클래스의 버그를 재생산할 위험이 크다.
- **대안 B(기각) — TS 레이어(`decideAndClosePoll`)에서 `poll_votes` 원본 테이블을 직접 집계한다.**
  `poll_votes`는 RLS가 본인+임원 이상만 개별 행을 허용하므로(D-003 "개인 선택 비공개") 일반
  크루원(트리거③을 발화시킨 마지막 투표자가 임원이 아닐 수 있다)이 호출하는 Server Action에서는
  애초에 원본 행을 못 읽는다. 결국 SECURITY DEFINER 우회가 필요해 RPC로 돌아온다.
- **채택 — 판정 전용 RPC를 새로 둔다.** 029B가 이미 확립한 "표시용 RPC(`private.*` DEFINER +
  `public.*` INVOKER 2단)" 패턴을 그대로 재사용하되, 계약을 분리한다: `poll_vote_tally`(화면
  노출, D-031 항상 적용) / `poll_vote_tally_for_decision`(서버 판정 전용, D-003 트리거가 참일
  때만 D-031을 건너뛴다). 16일차에 `public`에 SECURITY DEFINER를 직접 뒀다가
  `anon/authenticated_security_definer_function_executable` WARN이 뜨고
  `rls_move_definer_logic_to_private_wrappers` 마이그레이션으로 뒤늦게 2단 구조로 재구성한 실수
  (`rls-policies-029b.md` 참고)를 반복하지 않으려고 **처음부터** 2단 구조로 작성했다.

## 2. 함수 시그니처 (DESIGN·BOARD가 그대로 받아 쓸 계약)

```sql
public.poll_vote_tally_for_decision(p_poll_id uuid)
returns table (
  poll_id uuid,
  poll_status text,
  eligible_count integer,
  participant_count integer,
  for_count integer,
  against_count integer,
  abstain_count integer,
  tally_hidden boolean
)
```

`public.poll_vote_tally`와 **반환 shape이 완전히 동일**하다(의도적 — 아래 §3의 "동일 함수로
위임" 논증이 이 동일성에 의존하고, DESIGN이 `getPollTallyForDecision`을 작성할 때 기존
`getPollTally`의 매핑 코드를 거의 그대로 재사용할 수 있다). 구현체는 `private.poll_vote_tally_for_decision(p_poll_id uuid)`(같은 시그니처, `security definer`)이며
`public.*`는 `select * from private.poll_vote_tally_for_decision(p_poll_id)` 한 줄짜리
`security invoker` 래퍼다.

**DESIGN·BOARD에게**: `tally_hidden`이 `true`로 돌아오면 이 함수가 "판정 시점이 아니다"라고
판단했다는 뜻이다(§3) — `decideAndClosePoll`은 이미 자체적으로 트리거 조건을 확인한 뒤에만
호출하므로 정상 흐름에서는 절대 `true`가 오면 안 된다. `getPollTallyForDecision`(DESIGN)이나
`decideAndClosePoll`(BOARD) 쪽에서 `tally_hidden === true`를 방어적으로 검사해 발생 시 예외로
처리하는 것을 권한다 — 이 필드가 참으로 온다는 것은 TS 레이어의 트리거 판정과 DB 레이어의
트리거 판정이 어긋났다는 신호이기 때문이다(버그를 조용히 삼키지 않기 위한 장치).

## 3. D-031을 무력화하지 않는다는 논증 (이 작업의 핵심)

`private.poll_vote_tally_for_decision`은 먼저 `private.is_active_crew_member`로 크루 소속을
확인한다(비소속이면 예외 — `poll_vote_tally`와 동일, §5 실측에서 확인). 그다음 **D-003이 정의한
세 종료 트리거 중 하나가 "지금 이 순간 이미 참"인지**(`v_decision_ready`)만 본다:

1. **트리거① 기한 도래**(`closes_at <= now()`)
2. **트리거② 조기 종료 권한자** — 제안자 본인(`auth.uid() = posts.author_id`) 또는 임원·오너
   (`private.is_crew_staff_or_owner`)
3. **트리거③ 미투표자 0명** — D-022 정의 그대로("스냅샷 ∩ 현재 활성 크루원") 미투표자가
   존재하지 않음

`v_decision_ready`가 거짓이면 `private.poll_vote_tally(p_poll_id)`를 **그대로 위임 호출**해
표시용 함수와 바이트 단위로 동일한 결과(숨김 포함)를 돌려준다 — 숨김 조건을 이 함수 안에
다시 베끼지 않는다(R-015, 두 곳이 갈리는 위험 원천 차단). 즉 **이 함수가 `poll_vote_tally`보다
더 보여주는 유일한 경우는 트리거가 참일 때뿐**임을 SQL 재사용으로 구조적으로 보장한다 —
"우회 불가"를 코드 리뷰로 매번 재확인해야 하는 약속이 아니라 컴파일(정확히는 실행) 시점에
성립하는 성질로 만들었다.

세 트리거가 참인 경우 각각 "진짜 집계가 이미 다른 경로로 곧(또는 즉시) 공개될 숫자"라는 것도
논증했다(마이그레이션 파일 주석 참고, 요약):

- ① 기한 도래 → 종료 처리되면 `poll_vote_tally` 자신도 `status <> 'open'`이 되어 숨김이 풀린다.
  마감 직후 아주 짧은 창(cron/수동 처리 지연 구간)에 한해 몇 초~몇 분 먼저 보일 뿐이다.
- ② 조기 종료 권한자 → 그 사람은 **지금 당장 실제로 "조기 종료" 버튼을 눌러 같은 숫자를 즉시
  공개시킬 수 있는 사람**이다. 새 권한이 아니라 이미 가진 "종료해서 공개" 권한을 한 스텝
  앞당길 뿐이다.
- ③ 미투표자 0명 → 호출자 자신이 방금 마지막 표를 던져 전원이 투표를 마친 시점이다. 이 시점
  집계는 이 호출 직후 자동 종료로 어차피 공개된다.

**알려진 트레이드오프(수용, 은폐하지 않는다 — 17일차 BOARD 교차검증으로 논거 정정)**: 임원·
오너는 조건②를 항상 만족하므로 실제로 종료하지 않고도 이 함수를 반복 호출해 실시간 집계
변화를 관찰할 수 있다.

**최초 논거(부정확, 아래에서 정정)**: "종료해서 공개"는 1회성 파괴적 행위(재개 불가)인 반면
이 함수 호출은 비파괴적으로 반복 가능하다는 점까지는 정확했지만, 거기서 "임원·오너는 이미
'종료해서 공개' 권한을 가진 신뢰 경계이므로 **새로운 권한이 아니다**"라고 결론 내린 것은
과장이었다.

**BOARD의 지적(팀장이 전달, 타당하다고 판단해 반영)**: "종료"와 "이 RPC 반복 호출"은 동등한
대체 수단이 아니다 — 종료는 **1회성 · 비가역 · 전원에게 즉시 드러남**인 반면, RPC 반복 호출은
**무기록 · 가역(아무 일도 안 일어난 것처럼 되돌아감) · 타인에게 드러나지 않음**이다. 즉
**정보의 "양"은 같아도 정보를 얻는 "양태"가 다르다** — "조용히 추세를 지켜보다 유리한 시점에만
종료한다"는, 종료 권한 하나만으로는 할 수 없는 행동이 새로 가능해진다. 이건 권한이 아니라
**관찰의 은밀성·반복성**이 새로 생긴 것이므로 "새 권한이 아니다"는 정확한 표현이 아니다.

**그럼에도 수용하는 이유(결론은 유지)**: ① 이 프로젝트에 감사 로그 요구사항이 아직 없다
(`rls-policies-029b.md` §8 이월 목록 2번 "FR-024·FR-027 AC4 감사 로그 — audit_logs 쓰기
경로 부재"로 이미 기록해 뒀다 —
있었더라도 이 호출을 기록·검토할 장치 자체가 없다). ② 임원·오너는 크루 운영 전권(멤버 강퇴·
크루 설정 변경 등)을 가진 신뢰 경계 **내부**의 행위자다 — 은밀한 관찰이 가능해졌다는 것과
그 관찰로 실제 악용 시나리오가 성립하는 것은 별개이며, 소규모 투표 결과를 몰래 엿본다고
할 수 있는 일이 이미 그들이 할 수 있는 다른 권한 남용(강퇴·설정 변경)보다 크지 않다. ③ 더
강한 방어(예: "종료 프로시저 안에서만" 호출되도록 세션 변수로 재확인)는 이번 핫픽스 범위를
넘는 설계 변경이라 하지 않았다.

**Task 034 인계(후속 설계 옵션, 지금 적용하지 않음)**: 이 비대칭을 구조적으로 없애려면
**"판정과 종료를 한 트랜잭션에 묶어, 읽기만 하는 경로 자체를 없애는" 설계**가 근본 해법이다 —
집계를 진짜 값으로 읽으려면 반드시 그 자리에서 종료도 함께 일어나게 만들면, "조용히 지켜보고
종료는 나중에"가 원천적으로 불가능해진다. 지금 이 핫픽스에서 그렇게 바꾸지 않는 이유는 Task
034(투표 자동 종료·판정·Meetup 생성·알림 파이프라인, `poll-auto-close.ts` 소유는 BOARD)가
이 파이프라인 전체를 재설계하는 자리이고, 지금 손대면 이 핫픽스가 파이프라인 재설계로
번지기 때문이다. Task 034 담당자가 파이프라인을 다시 설계할 때 이 옵션을 검토 대상으로
삼기를 권한다.

## 4. EXECUTE 권한 판단

**`authenticated`에게만 부여한다. `anon`은 끝까지 배제한다** — `public.poll_vote_tally`와 동일
정책(투표는 크루 내부 기능이라 비로그인 방문자에게 열 이유가 없다, D-007 대상도 아니다).
`private.*`·`public.*` 둘 다 생성 시 자동으로 `anon`/`authenticated`에 `EXECUTE`가 붙는
Supabase 기본 동작(15일차에 실측한 교훈, `rls_poll_vote_tally_function.sql` 주석 참고)을 먼저
`revoke all ... from public, anon, authenticated`로 전부 회수한 뒤 `authenticated`에만 다시
부여했다.

`authenticated`로 넓게 허용해도 안전한 이유: 함수 자체가 `is_active_crew_member`로 크루 소속을
재확인하므로(§3, §5 시나리오 0에서 실측) "로그인만 했지 이 크루원이 아닌 사용자"는 여전히
예외로 거부된다 — `authenticated` grant는 "누가 호출 가능한가"의 1차 관문일 뿐이고, 실제
인가는 함수 본문이 담당한다(029B가 확립한 패턴과 동일).

`decideAndClosePoll`이 `createSupabaseServerClient()`(퍼블리셔블 키 + 사용자 세션 쿠키, 곧
`authenticated` 역할)로 호출되므로, `authenticated`보다 좁히면(예: `service_role`만 허용)
**오늘의 정상 호출 경로 자체가 깨진다** — Task 034(pg_cron)가 이 판정을 서버 내부에서 돌리게
되면 그때는 호출 경로가 바뀔 수 있으나, 그건 이번 회차 범위 밖이라 지금은 다루지 않는다.

## 5. 실측 (`begin` … `rollback`, 시드 데이터로 검증, 커밋 없음)

대상: `poll cc7ea7dc-77e6-4e9d-b900-aee987df513c`("주말 러닝 클럽" 크루,
`21fb8c31-4856-4f82-af00-8b6df5e34059`) — 대상자 2명(< 5, D-031 대상), `open`, 마감 미도래,
투표 1건(오너 `30f44dd9…`, 나머지 1명 `fb70ff1c…`는 일반 크루원·미투표). 5개 시나리오를 한
트랜잭션 안에서 `set_config('request.jwt.claims', ..., true)`로 호출자를 바꿔가며 실행하고
**끝에 `rollback`** 했다(팀장이 경고한 16일차 커밋 사고를 반복하지 않기 위해 스크립트 최상단에
`begin`, 최하단에 `rollback`만 두고 중간에 `commit`을 전혀 쓰지 않았다). 실측 후
`select status, closes_at, votes ...`로 poll이 원래 상태(마감 2026-07-27, 투표 1건)로 그대로임을
재확인했다.

| # | 시나리오 | 호출자 | `poll_vote_tally` | `poll_vote_tally_for_decision` |
| --- | --- | --- | --- | --- |
| 0 | 크루 비소속 사용자 | `fc91323c…` | 예외: `not authorized to view this poll (crew members only)` | 예외: 동일 메시지 |
| 1 | 일반 크루원, 미투표, 제안자·임원·오너 아님, 마감 전 | `fb70ff1c…` | `for/against/abstain = null, tally_hidden = true` | **동일**: `null/null/null, hidden = true` |
| 2 | 오너 겸 제안자, 마감 전 | `30f44dd9…` | `null/null/null, hidden = true`(변화 없음) | `for=1, against=0, abstain=0, hidden=false` (트리거② 즉시 반영) |
| 3 | 트리거③ 시뮬레이션(방금 마지막 표를 던진 그 사람이 직접 조회) | `fb70ff1c…` | `null/null/null, hidden = true`(변화 없음 — 아직 종료 처리 전이므로 표시용은 계속 숨김이 맞다) | `for=2, against=0, abstain=0, hidden=false` |
| 4 | 트리거① 시뮬레이션(마감 시각을 과거로 이동), 일반 크루원 | `fb70ff1c…` | `null/null/null, hidden = true`(변화 없음) | `for=1, against=0, abstain=0, hidden=false` |

시나리오 1이 핵심 증거다 — **판정 시점이 아니면 두 함수의 출력이 완전히 같다.** 시나리오 2·3·4는
D-003의 트리거②③①이 각각 참이 되는 순간에만 실제 집계가 나온다는 것을 보여준다. 시나리오 0은
크루 비소속자가 두 함수 모두에서 여전히 거부됨을 보여준다(§4의 근거).

## 6. Advisor

`mcp__supabase__get_advisors(security)` — **신규 WARN·ERROR 0건**. 기존에 있던
`auth_leaked_password_protection`(대시보드 Auth 설정, 이 작업과 무관, 이전부터 존재) 1건만
남았다.

## 7. 파일 목록

- `supabase/migrations/20260725035543_poll_vote_tally_for_decision_function.sql`(신규,
  원격 프로젝트에도 `apply_migration`으로 적용 완료 — 파일명 경위는 §6.1 참고)
- `docs/decisions/poll-vote-tally-for-decision-hotfix.md`(이 문서, 신규)
- `docs/ROADMAP/team/01.CORE.md`(Task 029B 항목에 핫픽스 노트 추가)

### 6.1 마이그레이션 파일 버전 불일치(팀장 발견, 재현성 결함) — 경위와 수정

**`mcp__supabase__apply_migration`은 원격 DB에만 적용하고 로컬 `supabase/migrations/` 파일을
만들지 않는다.** 처음 이 함수를 만들 때 파일을 손으로 `Write`했는데(§0~§4 작성 시점), 그 사이
로컬 시계로 타임스탬프를 `20260725035414`로 잡았지만 실제 `apply_migration` 호출은 그보다
129초 뒤(`20260725035543`)에 원격에 기록됐다 — **로컬 파일명과 원격
`supabase_migrations.schema_migrations.version`이 어긋났다.** 팀장이 로컬↔원격 전수 대조로
발견했다(BOARD도 검증 중 `20260725035543`을 관측). 이 상태로 `supabase db push`/`db reset`을
돌리면 리포지터리가 "이 버전은 미적용"으로 오판해 이미 있는 함수를 다시 만들려다 충돌하거나
(또는 `create or replace`라 조용히) 재적용하는 재현성 결함이었다.

**수정**: `select statements from supabase_migrations.schema_migrations where
version='20260725035543'`로 원격에 실제 적용된 SQL 원문을 꺼내 로컬 파일과 대조했다(단순
눈대조가 아니라 `md5()`로 원격 텍스트와 로컬 파일 바이트를 직접 비교해 일치를 확인했다 —
JSON 이스케이프를 손으로 다시 풀면서 실수할 위험을 없애기 위해서다). **내용이 달랐다** —
`diff` 결과, 로컬 파일에는 있고 원격에는 없는 것은 전부 **설명용 인라인 주석과 강조 마크업**
뿐이었다(`⚠️` 이모지, `**굵게**`·백틱 강조, `v_decision_ready` 각 조건 줄 끝의 트리거 설명
주석, `-- D-003 종료 트리거...`/`-- 판정 시점이 아니면...`/`-- public/private 신규 함수...`
등 4개 문단) — **SQL 로직(함수 본문·GRANT/REVOKE)은 완전히 동일**했다. 즉 실행 결과에는
차이가 없었지만, "로컬 파일이 실제 적용된 SQL의 정확한 기록"이라는 재현성 원칙은 깨져
있었다. 파일을 **원격 원문 그대로**(주석 포함해 바이트 단위로) `20260725035543_poll_vote_
tally_for_decision_function.sql`로 다시 쓰고, 옛 파일명(`20260725035414_...`)은 삭제했다 —
설명이 아쉬워도 "원격에 적용된 쪽이 진실"이라는 팀장 지침대로 원격 원문을 우선했다.

**md5 방법론의 함정(팀장이 CREW 파일 대조 중 실제로 걸림, 주의 필요)**:
`schema_migrations.statements[1]`은 **말미 개행을 포함하지 않는다.** 로컬 파일이 (POSIX
텍스트 파일 관례대로) 개행으로 끝나면 그 1바이트 때문에 md5가 달라진다 — **이건 내용
불일치가 아니다.** 비교 전에 말미 개행을 정규화하거나(`printf '%s' "$(cat file)"`처럼
후행 개행을 제거한 뒤 해시), md5가 불일치하면 진짜 내용 차이인지 확인하기 **전에** 먼저
말미 개행 유무부터 확인하라 — 이 문서(§6.1)의 파일은 우연히 개행 없이 저장돼 원격과 md5가
바로 일치했지만, 개행이 있는 게 오히려 정상적인 텍스트 파일이므로 그 경우도 결함으로 오인하면
안 된다.

**교훈(다음에 마이그레이션을 만드는 사람에게)**: `apply_migration`을 호출한 뒤에는 로컬
파일을 손으로 타이핑하지 말고, **원격에 실제로 기록된 버전 번호와 SQL을
`schema_migrations`에서 그대로 가져와** 파일을 만든다(또는 최소한 버전 번호만이라도
`list_migrations`/`schema_migrations`에서 확인해 파일명에 그대로 쓴다). 이 함정은 CREW도
같은 회차에 다른 형태로 겪었다(`docs/ISSUES.md`에 CREW가 등재).

## 8. 이어지는 작업 (내 몫 아님, 인계) — **완료 (17일차, 팀장 확인)**

- **DESIGN**: `src/lib/data/supabase/poll.ts`에 `getPollTallyForDecision(pollId)`를 추가해
  `public.poll_vote_tally_for_decision` RPC를 호출한다. `getPollTally`의 매핑 코드(§2의 동일
  shape 덕에 거의 그대로 재사용 가능)를 참고하되, `tally_hidden === true`가 오면 방어적으로
  처리할지 판단 바란다(§2 권고). **→ 완료.**
- **BOARD**: `src/lib/actions/poll-auto-close.ts`의 `decideAndClosePoll`이 `getPollTally` 대신
  `getPollTallyForDecision`을 호출하도록 교체한다. **→ 완료** — 팀장이 import·호출 교체,
  다른 함수 무변경, 화면 표시용 호출부 2곳 보존, `try/catch` 삼킴 지점 0건을 정적으로 확인했다.

세 단계(RPC 신설 → DESIGN 데이터 레이어 연결 → BOARD 판정 파이프라인 교체) 전부 끝나
FR-043·FR-044의 대상자 5명 미만 크루 오판정 결함이 닫혔다.
