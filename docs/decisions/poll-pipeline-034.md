# 투표 자동 종료·판정·Meetup 생성·알림 파이프라인 (Task 034)

- **일자**: 2026-07-25(20일차)
- **담당**: BOARD(B팀) · 리뷰 CREW(A팀)
- **참조**: FR-043·044·045·060, D-003·D-015·D-022·D-024·D-027, NFR-029·032·036
- **선행 산출물**: `docs/decisions/cron-foundation.md`(Task 027)·`docs/decisions/
  realtime-broadcast-033.md`(Task 033)·`docs/decisions/write-path-realdata-032.md`(Task 032)·
  `docs/decisions/poll-vote-tally-for-decision-hotfix.md`(17일차 핫픽스)

## 0. 범위

D-003 종료 트리거 ①(기한 도래)②(수동 조기 종료)③(미투표자 0명) 중 **판정 후 처리**
(FR-060 Meetup 생성, FR-045 알림 적재)가 이번 회차 전까지 **아무 경로에도 없었다**(grep으로
확인 — `createMeetupFromPoll`·`createNotification`을 poll 종료 문맥에서 호출하는 코드가 전무).
트리거②③(제안자·임원의 수동 종료, 마지막 투표 직후 동기 체크)은 이미 `decideAndClosePoll`
(TS, `src/lib/actions/poll-auto-close.ts`)로 동작하지만 트리거①(마감 시각 도래)을 **주기적으로
찾아 발화하는 주체가 없었다** — pg_cron이 설치만 되고 도메인 잡이 0개였다(Task 027 인계).

이번 Task가 만든 것:

1. **트리거①의 실제 자동화**(pg_cron 잡, 5분 주기).
2. **FR-060·FR-045의 최초 구현**(Meetup 생성 + 알림 적재, D-015 강퇴자 제외) — 트리거①②③
   전부가 공유하는 단일 지점.
3. **트리거③의 알려진 gap 백스톱** — `write-path-realdata-032.md` §8이 남긴 인계("마지막
   투표자가 임원이 아니면 RLS가 `closePoll`을 조용히 막아 트리거①까지 지연될 수 있다")를
   같은 잡이 함께 해소.

## 1. 왜 순수 SQL(pg_cron 잡)인가 — HTTP·Edge Function을 쓰지 않는다

`docs/prd/PRD-validation.md`가 이미 이 방향을 확정해 뒀다: "투표 종료·판정·Meetup 생성·알림
적재는 전부 SQL로 표현 가능하므로 Edge Function을 경유할 이유가 없다." pg_cron은 순수 SQL만
실행하고(`anonymize_expired_deactivated_profiles_job.sql`의 I-056 각주가 같은 제약을 이미
기록해 뒀다 — Admin API를 pg_net으로 우회하려면 시크릿 관리·비동기 응답 처리가 새로 필요해
이번 범위를 넘는다) 이 트랜잭션 안에서 Node/TS 런타임을 호출할 방법이 없다. 그래서 트리거①의
판정은 SQL로 다시 쓸 수밖에 없었다 — 이 물리적 제약과 그 대가는 **정직하게** 2절·`docs/
ISSUES.md` I-071에 남긴다.

## 2. "판정 로직을 다시 쓰지 마라" — 정확히 어디까지 지켰는가

배정 지시가 요구한 재사용 대상은 둘이었다: Task 009A의 순수 함수(`src/lib/rules/`)와 029B의
판정 전용 RPC(`poll_vote_tally_for_decision`). 실제로:

- **`private.poll_vote_tally_for_decision`은 전혀 재사용하지 않았다.** 이 함수는
  `private.is_active_crew_member`(→ `auth.uid()`) 의존이라 pg_cron 컨텍스트(호출자가
  `postgres`, JWT 없음)에서 호출하면 항상 "not authorized" 예외가 난다 — 애초에 재사용
  대상이 아니었다(호출자 신원 자체가 다르다). 그래서 이 함수·`poll_vote_tally`·029B의 어떤
  RLS/함수도 이번 마이그레이션에서 건드리지 않았다.
- **`decideAndClosePoll`(TS)도 한 줄도 고치지 않았다.** 트리거②③(사람이 누르는 조기 종료
  버튼, `cast-vote.ts`의 마지막 투표 직후 동기 체크)은 여전히 이 함수 → `computeQuorum`·
  `decidePollOutcome`(순수 함수)를 그대로 호출한다.
- **재사용한 것은 "공식과 상수"뿐이다** — D-003(정족수 1/3, 강퇴자만 분모 제외)·D-032
  (`ceil`, `floor` 아님)·D-022(트리거③ 미투표자 = 스냅샷 ∩ 현재 `active`)를 SQL
  (`public.run_poll_auto_close_job`)에 **동일한 값으로** 옮겼다. 코드(SQL 표현) 자체는
  새로 썼다 — TS 순수 함수를 SQL 트랜잭션에서 호출할 방법이 없으니 물리적으로 피할 수
  없었다. 이 이중화는 **완전히 해소되지 않은 채로 남긴다**(`docs/ISSUES.md` I-071).
- **Meetup 생성(FR-060)·알림 적재(FR-045)는 "다시 쓰기"가 아니라 최초 구현이다** — grep으로
  확인한 대로 이 회차 전까지 아무 데도 없었다. 그래서 이 로직만큼은 지금부터 R-015가
  요구하는 "한 벌"이 성립한다 — `public.finalize_closed_poll` 하나뿐이고, TS 쪽에 이걸
  재구현한 코드는 없다(3절 참고).

## 3. 구조 — 3개 함수 + 트리거 1개 + pg_cron 잡 1개

```
public.finalize_closed_poll(poll_id)   -- Meetup 생성(FR-060) + 알림 적재(FR-045, D-015), 멱등
  ↑ 호출
public.trg_finalize_closed_poll()      -- polls AFTER UPDATE 트리거. open→closed_* 전이마다 발동
  ↑ 이 트리거가 걸리는 UPDATE는 두 갈래:
    - closePoll()(TS, 트리거②③) 의 UPDATE                — 기존 코드, 무변경
    - run_poll_auto_close_job()(SQL, 트리거①+③백스톱) 의 UPDATE — 신규
```

**핵심 설계 결정: Meetup·알림 로직을 "트리거가 실제로 fire된 곳"이 아니라 "polls 행이
바뀌는 지점"(DB AFTER UPDATE 트리거)에 딱 한 곳만 둔다.** 이렇게 하면 트리거①②③ 중 무엇이
poll을 닫았는지와 무관하게 Meetup·알림 로직이 항상 같은 코드를 탄다 — TS에 별도 호출부를
추가할 필요가 없고(트리거②③ 쪽 TS 코드를 전혀 건드리지 않아도 된다), R-015가 요구하는
"한 벌"이 구조적으로 보장된다(코드 리뷰로 매번 확인해야 하는 약속이 아니라 트랜잭션
메커니즘으로 강제된다 — 029B의 `poll_vote_tally_for_decision` 설계와 같은 논증 형태).

### 3.1 `public.finalize_closed_poll(p_poll_id uuid)`

- `security definer`(RLS 우회 — 트리거②③ 경로는 `authenticated` 세션으로 UPDATE가 실행되고,
  그 역할로는 `notifications` INSERT 정책이 아예 없어 항상 막힌다·`meetups` INSERT도 제안자/
  임원이 아닌 사람이 마지막 표를 던지면 막힐 수 있다 — DEFINER가 필수인 이유).
  - FR-060: `result='passed'`일 때만, `meetups.poll_id` UNIQUE + `ON CONFLICT DO NOTHING`으로
  멱등(AC3). 실패해도 예외를 격리해 알림 적재를 막지 않는다.
  - FR-045 + D-015: 강퇴자(`crew_memberships.status='removed'`)만 제외하고 나머지 대상자
  전원(미투표자 포함)에게 `poll_closed` 알림을 적재한다. **시도 횟수(`notify_attempts`)를
  성공 여부와 무관하게 먼저 올린다** — 그래야 NFR-029 "재시도 3회" 상한이 실제로 의미가
  있다(성공했을 때만 올리면 계속 실패하는 행이 무한 재시도된다). 강퇴자도 이 함수가 끝나면
  `notified_at`이 채워져("발송 대상에서 제외 확정") 재시도 스윕이 계속 붙잡지 않는다.

### 3.2 `public.trg_finalize_closed_poll()`

`polls` `AFTER UPDATE ... WHEN (old.status='open' and new.status in (closed_*))`. `finalize_
closed_poll`의 실패를 자체적으로 흡수한다(`begin...exception when others then raise warning`)
— I-049와 같은 원칙("이미 성공한 주 행위 — poll 종료 그 자체 — 를 부속 작업 실패로 되돌리지
않는다"). 실패는 `raise warning`으로만 남아 `get_logs`로 조회 가능하다.

### 3.3 `public.run_poll_auto_close_job(batch_size, max_duration)`

`security invoker`(다른 3개 pg_cron 잡과 같은 관례 — postgres role이 `rolbypassrls=true`라
RLS와 무관하게 동작, `chat-retention-035.md` 선례). 두 루프:

1. **트리거① + 트리거③ 백스톱**: `status='open' and (closes_at <= now() or 미투표자(D-022)
   0명)`인 poll을 찾아 정족수·판정을 SQL로 계산하고 `polls` UPDATE(트리거를 발동시킨다).
   트리거③ 백스톱을 넣은 이유는 `write-path-realdata-032.md` §8의 명시적 인계다 — 사람이
   아닌(비임원) 마지막 투표자가 트리거③을 발화시키면 `closePoll`의 RLS
   (`polls_update_proposal_author_or_staff`)가 조용히 0행을 반환해 poll이 `open`으로 남는
   gap이 있었다. 이 잡은 SECURITY INVOKER로 `postgres` 권한으로 돌아 그 RLS에 걸리지
   않는다.
2. **재시도 스윕(NFR-029)**: 이미 닫혔지만 `finalize_closed_poll`이 처음에 실패해 미완인
   poll(`notified_at is null and notify_attempts < 3`, 또는 가결인데 Meetup이 없음)을 다시
   부른다. 3회를 넘기고도 남은 게 있으면 `raise warning`으로 눈에 띄게 남긴다(자동 복구는
   여기서 멈춘다 — 그 이상은 운영자가 `get_logs`로 확인해야 한다).

**CON-10 방어**: `statement_timeout = '4min'` + 루프 자체 시간 예산(4분) 이중 방어(기존 3개
잡과 같은 패턴). 5분 주기이므로 다음 실행 전에 여유가 남는다.

**스케줄**: `poll_auto_close_and_finalize`, `*/5 * * * *`(5분마다). **FR-043 AC4가 "자동 종료
작업이 5분 지연"을 정상 시나리오로 명시**하는 것과 그대로 맞춘 값이다. 기존 4개 잡은 전부
1일 1회 고정 시각(18:00/18:30/19:00/19:30 UTC)이라 스케줄 형태 자체가 달라 "같은 시각 충돌"
걱정이 없다. 등록 잡 수는 5개(D-027 "동시 잡 8개 이내" 안).

## 4. I-054 회피 — 왜 단일 RPC(트랜잭션)로 충분한가

I-054는 "여러 PostgREST 호출로 나눠 쓰면 진짜 트랜잭션이 아니다"를 경고했다. 이 파이프라인은
그 함정을 두 층에서 피한다:

- **트리거①**: `run_poll_auto_close_job` 안에서 poll 하나당 판정 계산 + `polls` UPDATE가
  전부 **한 함수 호출(=한 트랜잭션) 안**이고, 그 UPDATE에 걸린 AFTER 트리거가 Meetup·알림
  INSERT까지 **같은 트랜잭션**에서 끝낸다 — 추가 왕복이 전혀 없다.
- **트리거②③**: TS `closePoll()`의 UPDATE 한 번이 성공하면, 그 자체가 트리거를 발동시켜
  Meetup·알림까지 같은 DB 트랜잭션 안에서 끝난다 — TS 쪽에서 별도로 Meetup·알림 API를
  호출하지 않는다(만약 호출했다면 `closePoll` 성공 후의 두 번째 왕복이 되어 정확히 I-054가
  경고한 형태가 됐을 것).

## 5. 실측 (전부 `begin`…`rollback`, 실 시드 데이터, 커밋 없음)

실측은 실제 열려 있는 poll 2건(`cc7ea7dc-…`, "주말 러닝 클럽" · `2433fd02-…`, "알고리즘
스터디")을 빌려 진행했다. **매 시나리오 끝에 `rollback`으로 원상 복구를 재확인했다**(아래
"5.5 원상 복구 확인" 참고). 절차상 교훈 하나를 먼저 남긴다: `begin`과 이어지는 명령을
**서로 다른 `execute_sql` 호출로 나누면 트랜잭션이 이어지지 않는다**(첫 실측에서 실제로
겪음 — `begin; update ...;`를 보낸 뒤 다음 호출에서 `select`로 확인했더니 이미 롤백돼 있었다,
호출마다 별도 세션/연결로 처리되는 것으로 보인다) — **반드시 `begin`부터 `rollback`까지
한 호출 안에 전부 담아야 한다.**

### 5.1 트리거① (기한 도래) — `cc7ea7dc`(대상 2명, 둘 다 찬성)

`closes_at`을 과거로 당기고 `run_poll_auto_close_job()`을 호출:

| 확인 항목 | 기대 | 실측 |
| --- | --- | --- |
| `polls.status`/`result` | `closed_passed`/`passed` | ✅ 일치 |
| `decided_at`·`closed_by` | 설정됨 / `null`(트리거①은 human actor 없음) | ✅ 일치 |
| `meetups` 생성 | 1건, `post.title`·`body`(→description)·`meetup_date`·`start_time`·
`place`·crew_id 정확히 반영 | ✅ 일치 |
| `notifications` | 2건(대상자 전원), payload `{pollId, postId, outcome:"passed", crewId}` | ✅ 일치 |
| `poll_eligible_voters.notified_at`/`notify_attempts` | 둘 다 설정, attempts=1 | ✅ 일치 |
| **멱등성(AC3)**: `finalize_closed_poll`을 같은 트랜잭션에서 재호출 | Meetup·알림 중복 없음, attempts 그대로 1 | ✅ 일치(재호출 시 `notified_at`이 이미 있어 0행 처리) |

### 5.2 트리거③ 백스톱(신규 로직) + D-015(강퇴자 제외) + 동수→부결 — `2433fd02`(대상 5명)

**주의**: 최초 진단 쿼리(조인에 `voter_id` 조건 누락)가 "대상 10명·10표"라는 **틀린 값**을
줬다 — 실제로는 대상 5명·기존 표 2건(둘 다 찬성)이었다. 이 오류를 실측 중 발견해 바로잡고
정확한 값으로 재설계했다(정직하게 기록 — 잘못된 진단 쿼리인 것이지 파이프라인의 결함이
아니었다).

나머지 미투표자 3명 중 2명에게 `against` 표를 추가(찬성 2·반대 2 동수를 만들기 위해)하고,
1명(`f1692173…`)은 `crew_memberships.status='removed'`로 바꿔(강퇴 시뮬레이션) "현재 active
미투표자 0명" 조건을 만든 뒤 `run_poll_auto_close_job()` 호출. **`crew_memberships`의
셀프서비스 가드 트리거(`trg_crew_memberships_guard_self_transition`, CREW 소유)가 "임원만
타인 상태 변경 가능"을 막아, 이 트랜잭션 안에서만 `alter table ... disable/enable trigger`로
일시 비활성화하고 즉시 복원했다** — rollback으로 어차피 되돌아가므로 실제 스키마·정책에는
영향이 없다.

| 확인 항목 | 기대 | 실측 |
| --- | --- | --- |
| `closes_at`이 여전히 미래인 채로 종료됨 | 트리거①이 아니라 트리거③ 백스톱임을 증명 | ✅ `closes_at_still_future=true` |
| `polls.result` | 동수 → `rejected`(D-003) | ✅ `rejected` |
| `meetups` 생성 | 0건(가결 아님, FR-060 AC2) | ✅ 0건 |
| `notifications` 수신자 | 강퇴자 제외 4명(오너·staff·비강퇴 member 2명) | ✅ 정확히 4명, 강퇴자 미포함 |
| 강퇴자에게 알림 발송 | 안 됨(D-015) | ✅ `removed_member_got_notification=false` |
| 강퇴자 `notified_at` | 그래도 설정됨(재시도 방지) | ✅ `true` |

### 5.3 트리거② (수동 조기 종료) + 정족수 미달→무효 — `2433fd02` 재사용(신선한 상태)

`poll_votes`를 전부 지워 참여자 0명(정족수 `ceil(5/3)=2` 미달)으로 만든 뒤, `closePollEarly
Action`/`decideAndClosePoll`이 실제로 만드는 것과 같은 형태의 `polls` UPDATE(`closed_by`=
제안자 실제 id)를 직접 실행 — 이 시나리오는 TS 판정 코드를 바꾸지 않았으므로 **"트리거의
발화 방식과 무관하게 finalize 트리거가 반응하는가"**를 확인하는 것이 목적이다.

| 확인 항목 | 기대 | 실측 |
| --- | --- | --- |
| `polls.result`/`closed_by` | `invalid` / 넘긴 제안자 id 그대로(트리거가 건드리지 않음) | ✅ 일치 |
| `meetups` 생성 | 0건(무효, FR-060 AC2) | ✅ 0건 |
| `notifications` | 5건(대상자 전원 — 강퇴자 없음), payload `outcome:"invalid"` | ✅ 일치 |

### 5.4 실 cron 실행(대조군) — 실측 도중 실제로 1회 발화함

수동 실측과 별개로, 등록 직후 **실제 pg_cron이 5분 주기로 1회 실행돼 `cron.job_run_details`에
`succeeded`로 기록됐다.** 이때 실 데이터의 두 poll은 (마감 미도래 + 미투표자 존재라) 그대로
`open`으로 남아 있었다 — **잡이 실제로 돌아도 대상이 아니면 아무것도 건드리지 않는다**는
것을 실제 스케줄러로 확인했다(수동 호출로만 확인한 게 아니다).

### 5.5 원상 복구 확인

모든 시나리오 종료 후: `cc7ea7dc`·`2433fd02` 둘 다 `status='open'`, 원래 `closes_at`·표
개수·`crew_memberships.status`(`f1692173…`가 다시 `active`) 그대로, `meetups`·`notifications`
잔여 0건을 재확인했다.

## 6. Advisor·정적 검사

- `mcp__supabase__get_advisors(security)`: **신규 WARN·ERROR 0건.** 마이그레이션 적용 직후
  재조회 결과 기존에 있던 두 건(`reports_guard_self_update_reason_only` 관련 WARN 2개, CREW
  소관)이 오히려 그새 다른 팀원 마이그레이션으로 해소돼 있었고, 이 작업이 새로 추가한
  WARN은 0건이다(`auth_leaked_password_protection` 1건만 남음 — 기존·무관).
- `npx tsc --noEmit`: 이 작업이 건드린 파일 기준 **0 errors**(전체 실행 결과에 `crews.tsx`
  3건이 있었으나 이는 이번 회차 동시 작업 중인 CREW의 `MemberRowViewModel` 타입 확장과
  `src/components/sample/sections/crews.tsx`(CREW 소유)가 아직 맞춰지지 않은 것 — 내가
  건드리지 않았고 내 소유도 아니다).
- `npm run lint`: 0 errors, 3 warnings(전부 CREW가 동시 작업 중인
  `moderation.tsx`·`create-report.ts`의 `import/order` — 내 파일 아님).

## 7. `database.types.ts` 재생성은 하지 않았다

`generate_typescript_types`를 돌리지 않았다 — 새로 만든 3개 함수(`finalize_closed_poll`·
`trg_finalize_closed_poll`·`run_poll_auto_close_job`)는 어떤 TS 코드도 호출하지 않는다
(pg_cron·DB 트리거 전용). 타입 재생성이 소비자 없는 함수 시그니처만 추가하는 것이라 이번
범위에서는 생략했다 — 다음에 이 함수들을 TS에서 직접 호출할 일이 생기면(현재는 없음)
그때 재생성한다.

## 8. `/sample` 반영

새 컴포넌트는 만들지 않았다 — Meetup·알림은 기존 컴포넌트(캘린더, `NotificationBell`,
`PollResult`)가 이미 실데이터를 그대로 렌더하므로 UI 변경이 필요 없다(D-030 "쓰기 후 UI
무수정" 그대로). 기존 트리거 시뮬레이션 섹션(`poll.tsx`의 "투표 종료 트리거 시뮬레이션")의
설명 문구만 갱신했다 — pg_cron이 이제 실제로 트리거①을 처리하고 트리거③ 백스톱도 있다는
사실, Meetup·알림이 이제 실제로 생성/적재된다는 사실을 반영했다. `PollAutoCloseSimulatorPreview`
버튼은 **걷어내지 않고** QA 단축 경로(5분을 기다리지 않고 즉시 확인)로 남겼다 —
`close-poll.ts`·`poll.tsx`·`PollAutoCloseSimulatorPreview.tsx` docstring을 함께 갱신했다.

## 9. 남은 리스크·정직하게 확인 못 한 것

1. **판정 공식 이중화(TS ↔ SQL)는 완전히 해소되지 않았다** — `docs/ISSUES.md` I-071로
   등재. D-003·D-032·D-022 중 하나가 바뀌면 `lib/rules/quorum.ts`·`poll-decision.ts`·
   `poll-eligibility.ts`와 `run_poll_auto_close_job` SQL을 함께 고쳐야 한다. 자동으로
   맞춰 주는 장치는 없다(R-002, 테스트 러너 미도입).
2. **NFR-029 "재시도 3회"는 지수 백오프나 사람에게 알리는 채널이 없다** — 3회(=cron 3틱,
   약 15분) 넘게 실패하면 `raise warning`만 남고 자동 복구를 멈춘다. 사람이 `get_logs`나
   `poll_eligible_voters.notify_attempts >= 3`을 직접 조회해야 안다 — 알림 채널(예: 관리자
   대시보드 경고)은 이번 범위 밖이다.
3. **실측은 오늘 존재하는 실 poll 2건에 한정됐다** — 대상자가 훨씬 많은 크루(수십~수백명)나
   동시에 여러 poll이 같은 순간 마감되는 상황의 부하는 확인하지 못했다(Task 037의 동시성·
   부하 검증 범위로 남긴다).
4. **`run_poll_auto_close_job`의 트리거③ 백스톱 조건(대상 poll마다 "현재 active 미투표자
   존재?"를 상관 서브쿼리로 매번 계산)은 인덱스를 타지 않는다** — `status='open'`인 poll
   수가 지금처럼 적을 때는(실측 시점 2건) 문제가 없지만, 동시에 열려 있는 poll이 아주
   많아지면(수백 건 이상) 이 부분이 스캔 비용을 키울 수 있다. 지금 규모에서는 실측하지
   않았고(3번과 같은 이유), 필요해지면 `poll_eligible_voters`·`crew_memberships` 조인에
   맞는 부분 인덱스를 추가하는 것을 다음 회차 후보로 남긴다.
5. **채팅 파기(D-009, 원래 Task 034/035 후보였던 "채팅 파기" 몫)는 이 Task 범위가 아니다**
   — `docs/decisions/chat-retention-035.md`(DESIGN, 15일차)가 이미 별도로 처리했다. 이
   문서 제목의 "파이프라인"은 투표 쪽만 가리킨다.
6. **`crews_guard_archived_immutable`(I-070, CORE)처럼 poll이 속한 크루가 해산
   (`status='archived'`)된 상태에서 이 파이프라인이 어떻게 동작하는지는 확인하지 않았다**
   — 오늘 실 데이터에 해산된 크루가 0건이라(I-070과 같은 제약) 실측 불가능했다. `polls`
   UPDATE 자체가 크루 상태와 무관하게 이 트리거를 타므로 이론적으로는 동작하겠지만,
   "해산된 크루의 poll이 실제로 마감을 맞았을 때" 경로는 정직하게 **미확인**으로 남긴다.

## 10. 산출물

- `supabase/migrations/20260725114938_poll_auto_close_pipeline_034.sql`(신규, 원격 적용
  완료 — `apply_migration` 직후 `list_migrations`로 실제 부여된 version을 확인하고 그 값으로
  로컬 파일명을 지었다, I-051/19일차 교훈 준수. `md5(statements[1])`가 로컬 파일의 raw
  byte(말미 개행 포함) md5와 정확히 일치함을 확인).
- `src/lib/actions/close-poll.ts`·`poll-auto-close.ts` — docstring 갱신(pg_cron 실가동
  반영, Meetup·알림 처리 위치 명시). 로직은 무변경.
- `src/lib/data/supabase/meetup.ts` — `createMeetupFromPoll` docstring에 "실제 프로덕션
  경로 아님" 명시(현재 무호출, 삭제하지 않고 보존).
- `src/components/sample/sections/poll.tsx`·`PollAutoCloseSimulatorPreview.tsx` — 설명
  문구 갱신.
- `docs/ISSUES.md`(I-071 신규), 본 문서, `docs/ROADMAP/team/04.BOARD.md`(Task 034 완료
  마커).
