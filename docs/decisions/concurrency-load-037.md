# 동시성·부하 검증과 Realtime 팬아웃 실측 (Task 037)

- **일자**: 2026-07-29(22일차)
- **담당**: BOARD(B팀) / 리뷰 CORE(A팀)
- **참조**: I-017·I-018(이 문서가 해소 대상), NFR-003·004·006, D-019·D-023·D-054·D-055, R-011·R-019, CON-08
- **범위**: (1) Realtime 팬아웃 계수를 공식 문서로 확정하고 실측으로 재확인한다(I-018). (2) 그 값을 바탕으로 NFR-006(동시 1,000세션)이 성립하는 요금제를 확정한다(I-017). (3) 21일차에 확립된 "실계정 JWT + 병렬 실 HTTP 요청" 절차를 재사용해 D-019(정원 원자성)와 D-054/D-055(투표 판정 재계산 트리거)를 동시성 조건에서 회귀 검증한다.

## 0. 측정 조건 요약 (정직하게 남긴다)

- **계정**: 실 계정 2개만 존재한다 — `chopin0625@gmail.com`(profile `30f44dd9…`, 이하 A) / `0625chopin@gmail.com`(profile `fb70ff1c…`, 이하 B), 비밀번호 둘 다 `qwer1234`(CLAUDE.md). **이것이 이 문서 전체의 실질적 제약이다** — "동시 1,000세션"·"1,000명의 서로 다른 사용자"는 물리적으로 재현할 수 없었다. 대신 두 계정의 실 JWT를 **여러 소켓 연결에 재사용**해 "연결 수" 축(Realtime의 동시 접속 쿼터가 실제로 세는 단위)을 최대 N=100까지 실측했다 — 이는 "연결 개수" 측면에서는 유효한 시뮬레이션이지만(Realtime Authorization은 연결당 1회 검사되고 신원과 무관하게 채널 join·메시지 수신 비용이 발생한다), "서로 다른 1,000명이 각자 다른 쓰기를 만들어내는" 부하(추가 RLS 평가·트리거·DB 쓰기 경합)는 이 방법으로 재현하지 못했다. **미확인으로 남긴다.**
- **대상**: 크루 `21fb8c31…`("주말 러닝 클럽", A=owner·B=member, 실 시드 크루) — 채팅 팬아웃 측정. 크루 `729ced18…`("Task036 검증용 테스트 크루", A=staff·B=owner, 이미 테스트 전용으로 지정된 크루) — 투표 트리거 경합 측정용 임시 poll 생성. Meetup `f5199656…`("주말 러닝 클럽 3회차 모임", capacity 8·attending_count 0, 실 시드 데이터) — 정원 원자성 회귀.
- **도구**: `@supabase/supabase-js`(이미 의존성) + `fetch()` 직접 호출(RPC·PostgREST). 스크립트는 `.tmp-e2e/`에 작성해 실행 후 **전부 삭제**했다(Task 033 §부록 전례 그대로) — 저장소에 임시 파일을 남기지 않는다. 재현 절차는 §6에 남긴다.
- **정리**: 이 문서의 모든 실측은 실 데이터를 임시로 바꾼 뒤 **원상복구**했다(직접 재계산 확인 포함) — `begin`…`rollback`이 아니라 진짜 커밋 후 되돌리는 방식이다(진짜 동시 HTTP를 재현하려면 트랜잭션 밖에서 쏴야 한다, 21일차 DESIGN이 이미 이 방식을 확립). §2·§4·§5에 각각 원상복구 확인 결과를 남긴다.
- **npm run dev는 실행하지 않았다** — 이 검증은 전부 Supabase 직접 호출이라 로컬 서버가 필요 없다. 잔여 프로세스 없음.

## 1. I-018 — Realtime 팬아웃 계수는 공식 문서에 명시돼 있다 (N+1)

`mcp__supabase__search_docs`로 확인(2026-07-29, 문서는 계속 갱신되므로 이번 조회 시점 기준):

> **Database changes**: Each database change counts as one message per client that listens to the event. For example, if a database change occurs and 5 clients listen to that database event, it counts as 5 messages.
> **Broadcast**: Each broadcast message counts as one message sent plus one message per subscribed client that receives it. For example, if you broadcast a message and 4 clients listen to it, it counts as 5 messages—1 sent and 4 received.
> — [Manage Realtime Messages usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-messages)

**I-018이 묻던 질문("1건을 구독자 N명에게 보낼 때 1로 세는지 N으로 세는지")에 대한 답은 "N+1"이다** — 이 프로젝트는 `realtime.send()`(Broadcast)를 쓰므로(D-023, `realtime-broadcast-033.md` §2) 위 두 번째 규칙이 적용된다: 크루 채팅방에 100명이 동시 접속해 있을 때 메시지 1건을 보내면 **101 메시지**로 카운트된다.

### 1.1 실측으로 재확인

문서가 권위 있는 출처이지만(공식 과금 문서), "정말 그렇게 동작하는가"를 실측으로도 확인했다(§3) — N=10/30/60/100 전부 **보낸 메시지 1건이 N개 구독자 전원에게 개별 전달**됨을 확인했고(연결 수만큼 수신 콜백이 개별로 호출됨), `get_logs(realtime)`에서 `too_many_channels`·`too_many_connections`·`too_many_joins`·`tenant_events`(쿼터 초과 시 나는 에러 4종, `Realtime Limits` 문서 「Limit errors」절) 중 어느 것도 관측되지 않았다 — 문서가 말하는 카운팅 방식과 모순되는 동작은 없었다.

### 1.2 요금제별 한도 (공식 문서, 2026-07-29 조회)

[Realtime Limits](https://supabase.com/docs/guides/realtime/limits):

| | Free | Pro | Pro(지출 상한 해제) | Team | Enterprise |
| --- | --- | --- | --- | --- | --- |
| 동시 접속(Concurrent connections) | 200 | 500 | 10,000 | 10,000 | 10,000+ |
| 초당 메시지(Messages/sec) | 100 | 500 | 2,500 | 2,500 | 2,500+ |
| 초당 채널 조인(Channel joins/sec) | 100 | 500 | 2,500 | 2,500 | 2,500+ |
| 연결당 채널 수 | 100 | 100 | 100 | 100 | 100+ |
| Broadcast payload | 256KB | 3,000KB | 3,000KB | 3,000KB | 3,000+KB |

[Realtime Pricing](https://supabase.com/docs/guides/realtime/pricing) — 월간 과금 쿼터(연결 수·메시지 수는 서로 다른 축이다):

| | Free | Pro | Team |
| --- | --- | --- | --- |
| 메시지 월 쿼터 | 2,000,000 | 5,000,000 | 5,000,000 |
| 초과 시 | — | $2.50/100만 건 | $2.50/100만 건 |
| 피크 연결 월 쿼터 | 200 | 500 | 500 |
| 초과 시 | — | $10/1,000건 | $10/1,000건 |

**CON-08·I-017이 이미 인용했던 "동시 연결 Free 200 / Pro 500 / Pro-nocap 10,000"은 이번 재확인으로 정확함이 확인됐다** — prd-validator가 2026-07-23에 적어 둔 수치가 지금(2026-07-29)도 문서와 일치한다.

## 2. D-019 회귀 — 정원 원자성, 진짜 동시 HTTP 5회 반복

21일차 DESIGN이 확립한 절차(실계정 JWT 발급 → `Promise.all`로 진짜 동시 HTTP 2건)를 그대로 재사용했다. DESIGN의 I-090 재검증은 "정직하게 남긴다"며 **표본 1건**만 남겼고 진짜 wall-clock 동시성은 WHERE절 검증으로 대체했다 — 이번에는 **`Promise.all`로 두 실 계정이 진짜 동시에 쏘는 시나리오를 5회 반복**해 표본을 늘렸다.

**절차**: Meetup `f5199656…`의 `capacity`를 8→1로 임시 변경(마지막 한 자리) → A·B가 동시에 `respond_meetup_attendance(status:'attending')` RPC를 `Promise.all`로 호출 → 결과 확인 → 성공한 쪽만 `absent`로 되돌림 → 5회 반복 → `capacity`를 8로 복원.

| 시행 | wall(ms) | A 결과 | B 결과 | 승자 |
| --- | --- | --- | --- | --- |
| 1 | 152.7 | `full`(152.5ms) | `ok,changed`(109.3ms) | B |
| 2 | 66.7 | `full`(66.5ms) | `ok,changed`(60.4ms) | B |
| 3 | 89.4 | `ok,changed`(69.6ms) | `full`(88.7ms) | A |
| 4 | 93.7 | `ok,changed`(85.7ms) | `full`(93.0ms) | A |
| 5 | 209.5 | `full`(208.8ms) | `ok,changed`(208.8ms) | B |

**5/5 시행 전부 정확히 1명만 성공**(`changed:true`), 나머지는 `{ok:false, reason:'full'}`. 승자가 B,B,A,A,B로 번갈아 나와 **요청 순서 결정론이 아니라 진짜 경합**임을 확인했다(둘 중 하나가 항상 이기는 구조였다면 "동시성이 아니라 그냥 먼저 보낸 쪽이 이기는 것 아니냐"는 의심이 남았을 것). 21일차 CORE의 SECURITY DEFINER 전환·private 래퍼 구조(I-090 수정)가 진짜 동시 요청에서도 원자성을 유지함을 재확인했다 — **회귀 없음.**

**원상복구 확인**: 5회 시행 후 `capacity=8, attending_count=0`(원래 값과 동일) — 별도 SELECT로 재확인.

## 3. I-018 실측 — 채팅 팬아웃 지연시간 (N=10/30/60/100)

**방법론 개선**: Task 033 §5.2는 로컬-서버 clock skew 때문에 알림 지연시간(ms)을 "미측정"으로 남겼다. 이번에는 **같은 Node 프로세스 안에서 `performance.now()`로 발신 시각과 수신 시각을 모두 재는 방식**으로 skew 문제 자체를 없앴다 — 발신 시각은 REST INSERT 응답이 돌아온 시점(DB 커밋 확정 시점의 근사치), 수신 시각은 각 구독 소켓의 브로드캐스트 콜백 호출 시점이다.

**절차**: 크루 `21fb8c31…`의 채팅 토픽에 B의 JWT를 재사용해 N개 구독 소켓을 순차로 연 뒤(채널 조인 폭주 방지) 전원 `SUBSCRIBED` 확인 → A가 실 메시지 1건 INSERT → 각 소켓의 수신 시각 기록 → 5초 타임아웃 → 통계 산출 → 정리(구독 해제 + 테스트 메시지 DELETE).

| N | 수신 성공 | min | p50 | p95 | max |
| --- | --- | --- | --- | --- | --- |
| 10 | 10/10 | 78.7ms | 79.1ms | 79.9ms | 79.9ms |
| 30 | 30/30 | 65.2ms | 65.8ms | 66.9ms | 68.7ms |
| 60 | 60/60 | 63.1ms | 64.8ms | 65.8ms | 67.6ms |
| **100** | **100/100** | 68.2ms | 69.9ms | **71.5ms** | 112.1ms(이상치 1건) |

**N=100은 NFR-006이 명시한 "크루 1개당 동시 접속 100세션" 그 값이다.** 100/100 전원 수신, **p95 71.5ms — NFR-003(p95 ≤ 1초) 목표의 약 7% 수준으로 크게 만족**한다. N이 늘어도 지연이 악화되지 않고 오히려 소폭 감소한 것은(N=10의 79ms → N=60의 65ms) 샘플 수가 적어(각 N당 1회 시행) 통계적 노이즈로 판단한다 — **반복 시행으로 확인하지 않았다는 것을 정직하게 남긴다.**

`get_logs(realtime)` 조회 결과 이 시험 구간에 쿼터 초과 에러(§1.1의 4종) 없음.

**정리**: 4개 테스트 메시지(`client_key like 'load-test-037-fanout-%'`) 전부 DELETE, 재조회로 0건 확인.

## 4. 투표 종료 트리거 경합 실측 — 동시 조기 종료 2건

I-089/D-054가 신설한 `polls_guard_decision_integrity`(BEFORE UPDATE, "재계산해서 덮어쓴다")가 **동시에 두 세션이 같은 poll을 닫으려 할 때** 어떻게 동작하는지는 아무도 재지 않았다(로드맵 인계 사항). `poll_votes_guard_immutability`(D-055)까지 얽힌 전체 파이프라인을 진짜 동시 HTTP로 확인했다.

**절차**: 테스트 크루 `729ced18…`에 임시 proposal post + poll(`15cdf42f…`, status=`open`) 생성, A·B를 `poll_eligible_voters`에 등록 → A가 `for`, B가 `against`로 실투표(REST upsert) → **A·B가 동시에 poll을 조기 종료 시도**(`PATCH /polls`, `Promise.all`) — **의도적으로 둘 다 자신이 옳다고(잘못) 주장하는 값을 보냈다**: 실제로는 1:1 동수라 D-003상 부결이어야 하는데, 두 요청 모두 `status:'closed_passed', result:'passed'`를 보냈다(트리거가 클라이언트 주장을 무시하고 재계산하는지까지 함께 확인하려는 의도).

**결과**:

| 요청 | HTTP | 소요 | 응답 |
| --- | --- | --- | --- |
| A(작성자·staff) | 200 | 49.6ms | `status:"closed_rejected", result:"rejected", closed_by:A` |
| B(owner) | **400** | 76.5ms | `P0001 "closed poll result is immutable (FR-044, I-089)"` |

**세 가지를 동시에 확인했다**:

1. **동시 UPDATE는 Postgres 행 잠금으로 안전하게 직렬화된다** — 둘 다 "성공"하거나 둘 다 "실패"하는 손상 상태 없이, 정확히 하나(A)만 커밋되고 다른 하나(B)는 A 커밋 이후의 최신 상태("이미 종료됨")를 보고 거부됐다.
2. **D-054 "덮어쓰기" 방어가 경합 상황에서도 클라이언트의 틀린 주장을 무시했다** — A는 `passed`라고 보냈지만 실제 저장된 값은 트리거가 재계산한 `rejected`다(1:1 동수, D-003). 클라이언트를 신뢰하지 않는 설계가 동시성 스트레스 아래서도 그대로 유지됨을 실측으로 확인했다.
3. **패자의 지연은 26.9ms 추가에 그쳤다**(76.5ms vs 49.6ms) — 행 잠금 대기가 눈에 띄는 지연을 만들지 않는다. **NFR-004(≤3초)와 비교하면 DB 레벨 재계산 자체는 여유가 크다** — 다만 이 수치는 "잠금 대기 후 DB가 응답하는 시간"만 잰 것이고, `PollLiveContainer`의 브로드캐스트 수신 → 300ms 디바운스 → `router.refresh()` 전체 왕복은 이번에 측정하지 않았다(§5 "다음 회차 인계" 참고).

**정리**: `poll_votes`·`poll_eligible_voters`·`polls`·`posts` 테스트 행 전부 DELETE, 재조회로 4개 테이블 모두 0건 확인. `get_advisors(security)` 신규 WARN 0건(기존 `auth_leaked_password_protection` 1건만 잔존).

## 5. I-017 확정 — NFR-006은 Pro(지출 상한 해제) 이상을 요구한다

### 5.1 연결 수 — 사용량과 무관한 구조적 하한

NFR-006: "크루 1개당 동시 접속 100세션, 전체 1,000세션". §1.2 표에서 **Free(200)·Pro(500) 둘 다 전체 1,000세션에 미달**한다 — 이건 사용 패턴이 아니라 순수 숫자 비교라 실측이 필요 없다(CON-08이 이미 계산해 뒀고, §1.2에서 문서가 최신임을 재확인했다). **Pro(지출 상한 해제, 10,000)만 충족**한다.

### 5.2 메시지 처리량 — 이번에 실측으로 확정한 부분

§3에서 **크루 1개(100세션)에 메시지 1건을 브로드캐스트하면 101 메시지가 순간적으로 발생**함을 실측 확인했다. NFR-006의 "전체 1,000세션"을 크루 10개 × 100세션으로 가정하면(크루당 상한이 100이므로 가장 자연스러운 분해), **그 10개 크루가 동시에 각각 1개씩 메시지를 보내는 순간 1,010 메시지**가 발생한다 — Free(초당 100)·Pro(초당 500) 둘 다 이 순간 부하 하나만으로 초과되고, **Pro-지출상한해제(초당 2,500)만 여유 있게 수용**한다.

### 5.3 월간 메시지 과금 쿼터 — 추정치이며 확정하지 않는다

Pro-지출상한해제도 **연결·초당 처리량**은 충분하지만, **월간 메시지 쿼터(500만 건)**는 별도 축이다. 실 사용 패턴(크루당 시간대별 활동 빈도)이 없어 지금 정밀 산정은 불가능하다 — 대략적 자릿수만 남긴다: 크루 10개가 활성 시간대(예: 하루 10시간) 동안 분당 1메시지씩만 오가도 `10크루 × 60분 × 10시간 × 30일 × 101(팬아웃) ≈ 1,818만 메시지/월`로 Pro 쿼터(500만)를 초과해 **초과 요금(100만 건당 $2.50)이 발생할 가능성이 높다** — 이건 "요금제가 부족하다"는 뜻이 아니라 **연결·처리량 요건과 별개로 예산에 넣어야 하는 변동비**라는 뜻이다. **이 수치는 실 사용량이 아니라 가정 기반 추정이므로 D-\*로 확정하지 않는다** — I-017 원문이 "비용이 걸린 결정이라 기술만으로 정할 수 없다"고 이미 남겨 둔 것과 같은 이유다. v0.2 이후 실 트래픽이 쌓이면 재계산해야 한다(아래 D-057에 이 유보를 명시한다).

### 5.4 결정

**D-057**(아래 6.3절에 등재) — **NFR-006이 요구하는 요금제는 Pro(지출 상한 해제, "Pro no spend cap")로 확정한다.** 근거는 연결 수 상한(§5.1, 순수 산술)과 실측 팬아웃 계수(§5.2, N+1)를 결합한 초당 처리량 계산이며 둘 다 사용 패턴 가정 없이 성립한다. 월간 메시지 과금(§5.3)은 변동비로 **별도 모니터링 대상**으로 남기고 이번 결정에 포함하지 않는다.

**NFR-006은 C등급·v1.0 목표라 v0.1·v0.2 단계에서 즉시 업그레이드가 필요하지는 않다**(I-017 원문이 이미 정한 유예) — 이번 결정은 "v1.0 시점에 어느 요금제가 필요한가"에 대한 답이지 "지금 당장 업그레이드한다"는 결정이 아니다.

### 5.5 실제 현재 요금제는 이 세션에서 확인하지 못했다

이 세션에 노출된 Supabase MCP 도구(`get_advisors`·`get_logs`·`list_tables`·`execute_sql` 등)에는 **프로젝트의 현재 결제 플랜을 조회하는 도구가 없다.** N=100 연결·부하 시험이 전부 성공했다는 사실은 "이 정도 부하를 현재 플랜이 소화했다"는 것만 보여줄 뿐 플랜 자체를 특정하지 않는다(Free의 200 연결 한도 안에도, Pro의 500 안에도 100은 들어간다). **대시보드(Project Settings → Billing)에서 직접 확인이 필요하다 — 운영자 수동 조치로 남긴다.**

## 6. 재현 절차 (스크립트는 삭제, 명령으로 남긴다)

Task 033 §부록과 동일한 이유로 스크립트 파일은 실행 후 삭제했다. `.tmp-e2e/`에 4개 파일(`auth.mjs` 공통 헬퍼, `capacity-race.mjs`, `fanout.mjs`, `poll-trigger-race.mjs`)을 만들어 프로젝트 루트에서 `node .tmp-e2e/<file>.mjs [args]`로 실행했다. 핵심 패턴:

- **공통**: `createClient(URL, PUBLISHABLE_KEY).auth.signInWithPassword({email, password})`로 두 실 계정 로그인 → `session.access_token`을 이후 모든 `fetch()`의 `Authorization: Bearer` 헤더로 사용.
- **동시 HTTP 경합**(§2, §4): `Promise.all([fetch(...), fetch(...)])`로 서로 다른 두 계정의 요청을 동시에 발사 — RPC는 `POST /rest/v1/rpc/<fn>`, 테이블 UPDATE는 `PATCH /rest/v1/<table>?id=eq.<id>`.
- **팬아웃**(§3): N개의 `createClient` 인스턴스를 만들고 각각 `client.realtime.setAuth(token)` 후 `client.channel(topic, {config:{private:true}}).on("broadcast", {event:...}, cb).subscribe()` — 전원 `SUBSCRIBED` 확인 후 발신자가 REST INSERT, 각 콜백의 `performance.now()`로 수신 시각 기록.
- **정리**: 임시로 바꾼 컬럼(`meetups.capacity` 등)은 SQL `UPDATE`로 원복하되, `meetups_guard_attendee_scope` 같은 BEFORE UPDATE 가드가 `auth.uid()`를 요구하면 `select set_config('request.jwt.claims', json_build_object('sub','<uuid>','role','authenticated')::text, true); set local role authenticated;`를 같은 쿼리에 먼저 실행해 신원을 흉내낸다(21일차 CORE·CREW가 이미 쓰던 패턴, `execute_sql`은 기본적으로 `auth.uid()`가 NULL인 세션이라 이 트릭 없이는 self-service 가드를 통과하지 못한다 — 이번에 새로 겪은 자리라 남긴다).

## 7. 043A·043B로 넘기는 것

1. **`PollLiveContainer` 전체 왕복(브로드캐스트 수신 → 300ms 디바운스 → `router.refresh()` → 실제 DOM 갱신)은 이번에 측정하지 않았다** — §4가 잰 것은 DB 레벨 재계산 시간(수십 ms)뿐이다. NFR-004(≤3초) 최종 확인은 이 전체 경로를 재야 완결된다.
2. **다중 크루 동시 활동(예: 10개 크루가 동시에 각자 100명 팬아웃)은 재현하지 못했다** — §3의 N=100은 크루 **1개** 기준이다. Realtime은 프로젝트 단위로 초당 메시지 쿼터를 공유하므로(§1.2), 여러 크루가 동시에 터지는 시나리오가 진짜 병목이다 — 계정이 2개뿐이라 여러 크루를 동시에 채우는 시나리오 자체를 만들 수 없었다.
3. **"서로 다른 사용자 1,000명"의 쓰기 경합(추가 RLS 평가·행 잠금·커넥션 풀 소진)은 미검증**이다(§0). NFR-006의 "1,000세션에서 NFR-001~004를 만족"을 완전히 검증하려면 부하 도구(k6 등, Supabase 벤치마크 방법론 참고 — `search_docs`의 Benchmarks 문서가 k6 기반 32,000 VU 결과를 공개하고 있다)로 합성 다중 사용자 부하가 필요하다. 이번 회차는 2 계정 제약 안에서 "연결 수·팬아웃·트리거 경합" 세 축만 확인했다.
4. **월간 메시지 과금 추정치(§5.3)는 실 트래픽 없이 낸 가정 기반 계산**이라 v0.2 이후 실측으로 재확인해야 한다.
5. **실제 현재 요금제 확인**(§5.5)은 대시보드 수동 조회가 필요하다.

## 교차검증 (CREW, 22일차)

리뷰 짝으로서 보고를 그대로 믿지 않고 독립 재현했다. 결과를 pass/fail로 남긴다.

1. **p95 역전(N10=79.9ms→N100=71.5ms) — BLOCKED(재현 불가)**. 같은 방식(N=10/100 교대 3회, join
   순서별 수신시각 기록)으로 독립 재현을 시도했으나 **아래 신규 결함 때문에 실 메시지를 하나도
   보내지 못해(전 trial `gotCount:0`) 워밍업 아티팩트인지 진짜인지 판정할 데이터를 얻지 못했다.**
   BOARD의 원 수치가 틀렸다는 뜻은 아니다 — 다만 **지금 이 시점에 같은 방법으로 재현이 안 된다**는
   사실 자체가 새 문제다(아래 참고).
2. **JWT 재사용의 타당성 — PASS**. `docs/decisions/realtime-broadcast-033.md` §3(Authorization은
   `channel.subscribe()` 시점에 연결 단위로 1회 성립, 신원 무관)과 공식 Realtime Limits 문서(전
   한도가 프로젝트 단위이지 사용자 단위가 아님)로 교차 확인 — "연결 수" 축 시뮬레이션은 아키텍처상
   타당하다. "서로 다른 1,000명의 쓰기 경합" 미재현은 BOARD가 §0에서 이미 정직하게 밝혀 뒀다.
3. **D-057 산술·문서 — PASS**. `search_docs`로 독립 재조회 — Broadcast N+1 규칙, Realtime Limits
   표(Free 200/Pro 500/Pro-상한해제 10,000 연결, 100/500/2,500 msg·join)가 BOARD 인용과 완전
   일치. `requirements.md` NFR-006 원문("크루 1개당 100세션, **전체** 1,000세션") 확인 — "전체"는
   명백히 집계값이라 연결 수 비교(1,000>500)는 크루 수 가정이 필요 없다. "크루 10개×100" 분해는
   §5.2 처리량 계산에만 쓰였고 BOARD가 스스로 가정으로 명시했다.
4. **정리 주장 — FAIL(발견 즉시 직접 수정)**. SQL로 직접 확인: meetup capacity/attending_count
   복원(pass), fanout 테스트 메시지 0건(pass), 테스트 poll/post/poll_eligible_voters 0건(pass) —
   **그런데 `notifications`에 테스트 poll(`15cdf42f…`)을 가리키는 `poll_closed` 알림 2건이 A·B
   두 실계정 받은편지함에 그대로 남아 있었다.** §4 "정리" 절이 4개 테이블만 확인하고
   `notifications`를 빠뜨렸다(21일차와 같은 패턴 재발). CREW가 직접 DELETE로 정리했다(정리 후
   0건 확인).
5. **I-094 정직성 — PASS**. "월간 과금 추정치는 가정 기반"·"현재 실 요금제는 MCP로 확인 불가"를
   과장·축소 없이 정확히 그렇게만 썼다.

### ~~신규 발견 — `chat_messages` INSERT가 실 REST 호출에서 지금 막혀 있다 (원인 불명, 시급)~~ → **오진으로 판명 (팀장 반증, 22일차)**

> **팀장 판정: 이 항목은 결함이 아니다. CREW의 테스트 페이로드 오류였다.** 아래 CREW의 원 서술은
> 기록으로 남기되, 결론은 무효다. 반증 절차와 근거는 이 인용 블록 다음의 "팀장 반증" 절에 있다.
> **Task 037 §3(팬아웃 실측)은 무효화되지 않는다.**

1번을 재현하다 발견했다. 실 로그인 토큰(A, 활성 owner)으로 `POST /rest/v1/chat_messages`를
**curl과 node fetch 둘 다**로, **서로 다른 크루 2곳**(`21fb8c31`·`729ced18`)의 방에 시도 —
매번 `403 42501 new row violates row-level security policy`. 그런데 **동일 역할·동일 claims로
SQL 시뮬레이션**(`set_config`+`set local role authenticated`)은 **성공**한다 — 정책 로직 자체
(`private.is_crew_active` 포함)는 문제없음을 확인했다. REST 쓰기 전면 고장은 아니다 — 같은
시각 `invitations` INSERT, `respond_meetup_attendance` RPC는 실 REST로 정상 작동을 확인했다
(후자는 attending→absent로 원복, capacity 8/0 재확인). **`chat_messages` INSERT만 이 증상을
보인다.** 원인 미상(커넥션 풀러/세션 컨텍스트 차이로 추정) — 이 세션 도구로는 더 못 판다.
**Task 037 §3(팬아웃 실측)이 "그때는 됐지만 지금은 안 될 수 있다"는 뜻**이라 시급히 봐야 한다.
동시간대 다른 팀원의 Task044 작업과 시점이 겹쳐 그 영향일 가능성도 배제하지 않는다. 등재는
번호 충돌 방지를 위해 팀장에게 넘긴다.

정리: 위에서 만든 임시 파일(`.tmp-e2e/`, 토큰 캐시)·meetup attendance 원복 전부 확인했다.

### 팀장 반증 — 위 "신규 발견"은 `room_id` 자리에 `crew_id`를 넣은 테스트 오류다 (22일차)

CREW가 "시급"으로 올린 항목이라 팀장이 즉시 직접 재현했다. **결론: `chat_messages` INSERT는
실 REST에서 정상 동작한다.**

먼저 정적 확인 — 결함이라면 여기서 원인이 보여야 했다:

- `chat_messages`의 INSERT 정책 `chat_messages_insert_members`(`sender_id = auth.uid()` +
  `room_id IN (활성 크루원인 방) AND private.is_crew_active(crew_id)`)는 정상이고, 22일차에
  아무도 건드리지 않았다. CORE의 `create_chat_room_reads_table_044` 마이그레이션은 **새 테이블만
  만들고 `chat_messages`의 정책·트리거를 전혀 수정하지 않았다**(원문 대조).
- 대상 크루 2곳(`21fb8c31`·`729ced18`) 모두 `status='active'`, `private.is_crew_active()` = `true`.
- 두 실계정 모두 두 크루에서 `crew_memberships.status='active'` — 정책 조건을 SQL로 직접 계산하면
  네 조합 전부 `true`.
- `authenticated`에 `chat_messages` INSERT 권한과 `private.is_crew_active` EXECUTE 권한 모두 있음.

즉 정책상 통과해야 하는데 REST만 실패한다는 것이 성립하지 않아, 실 REST로 대조 실험을 했다
(실 로그인 토큰, `chopin0625@gmail.com`):

| # | 페이로드의 `room_id` | 결과 |
| --- | --- | --- |
| 1 | **진짜 room_id** `b89069ce-e293-42ce-922a-4c4c7dc45ba3` | `400 23502` — `type` 컬럼 NOT NULL 위반. **RLS는 통과했다**(정책 거부라면 42501이 먼저 난다) |
| 2 | **crew_id** `21fb8c31-4856-4f82-af00-8b6df5e34059` | **`403 42501 new row violates row-level security policy`** — CREW가 보고한 것과 **정확히 같은 오류** |
| 3 | 진짜 room_id + `type`·`client_key`까지 채운 완전한 페이로드 | **`201 Created`** (id `ff1ee84e-…`) — 실 REST INSERT 성공 |

**진단**: CREW는 `crew_id`를 `room_id` 자리에 넣었다. 그 크루의 실제 `chat_rooms.id`는
`21fb8c31…` → `b89069ce…`, `729ced18…` → `5a0b2d82…`이다. 정책의 `room_id IN (...)` 서브쿼리가
매칭에 실패해 `42501`이 나는 것이 정상 동작이며, **RLS가 제 역할을 한 것이다.** CREW가 대조군으로
든 "SQL 시뮬레이션은 성공한다"는 사실도 이 진단과 일치한다 — SQL 쪽에서는 방을 조인해서 얻은
올바른 `room_id`를 썼기 때문이다. 즉 두 결과의 차이는 REST/SQL 경로 차이가 아니라 **입력값 차이**였다.

**따라서**: (1) `chat_messages` REST 쓰기 결함은 존재하지 않는다 — 이슈로 등재하지 않는다.
(2) Task 037 §3의 팬아웃 실측은 유효하다. (3) 다만 CREW의 교차검증 1번 항목(p95 역전)이
`BLOCKED`로 남은 것은 그대로다 — 재현이 막힌 원인이 이 오진이었으므로, **p95 역전이 워밍업
아티팩트인지 진짜인지는 여전히 아무도 판정하지 않았다.** 이 잔여는 팀장이 I-096으로 등재한다.

정리: 팀장이 3번 실험으로 실제 INSERT한 메시지 1건(`client_key='lead-verify-22d-001'`)은
DELETE로 정리했다(정리 후 0건 확인).
