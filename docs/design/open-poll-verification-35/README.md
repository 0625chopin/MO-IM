# `open` 상태 poll에서 I-164·I-165·I-166 실물 재검증 — 35일차, BOARD

34일차 BOARD가 신설한 두 RPC(`private.poll_eligible_voters_with_status`·
`private.poll_eligible_voter_progress`)와 `cast-vote.ts` 트리거③ 수정은 DB에 `open` 상태
poll이 **0건**이라 코드 리뷰로 대체됐다(워크로그 §"다음 회차에 열리는 Task"). 이번 회차는
그 미착수를 직접 닫는다 — **실 DB에 open poll을 커밋해서 만들고**, member/staff 두 실 계정
세션으로 두 RPC·`cast-vote` 경로를 실측한 뒤 정리한다.

## 0. 계정 확인 (스스로 검증, 인계값을 그대로 믿지 않는다)

```sql
select p.id as profile_id, p.handle, p.display_name, u.email
from profiles p join auth.users u on u.id = p.id
where u.email in ('chopin0625@gmail.com','0625chopin@gmail.com')
order by u.email;
```

| 이메일 | 핸들 | profile_id |
| --- | --- | --- |
| `chopin0625@gmail.com` | `chopin0625` | `30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a` |
| `0625chopin@gmail.com` | `chopin_0625` | `fb70ff1c-3736-44ee-a4a3-96993a3c62ed` |

CLAUDE.md·34일차 인계값과 **일치**(이번 회차엔 뒤바뀜 없음).

## 1. 사전 확인 — open poll 0건

```sql
select status, count(*) from polls group by status order by status;
-- closed_passed 61, closed_rejected 1 (open 0건, 62건 전부 closed)
```

34일차 워크로그의 "62건 전부 closed"와 일치 — 드리프트 없음.

## 2. 스크래치 데이터 생성 — 마이그레이션이 아니라 데이터 삽입, 자연 경로(`create_poll` RPC) 사용

**크루 재사용**: 알고리즘 스터디(`f202047b-2478-43bd-a30c-60f082ccba8e`, public) — 34일차
poll `2433fd02-…`와 같은 크루. 활성 멤버 5명 그대로 재사용(신규 프로필 생성 0건):

| profile_id | role |
| --- | --- |
| `fb70ff1c-…`(0625chopin, 실계정) | member |
| `f1692173-…`(seed) | member |
| `c64e5973-…`(seed) | member |
| `20a56163-…`(seed) | owner |
| `30f44dd9-…`(chopin0625, 실계정) | staff |

**절차**: 미완결 제안글(poll 없는 `meetup_proposal`)이 크루 안에 없어(사전 쿼리로 확인,
0행) 새 제안글 1건을 만들어야 했다. **원시 INSERT가 아니라 앱이 실제로 쓰는 경로**를
썼다 — `public.create_poll(post_id, opens_at, closes_at, eligible_voter_ids)`
(`20260730024330_i054_fix_ambiguous_out_param_column_refs.sql`, `SECURITY DEFINER`,
28일차 I-054 신설)가 `posts` INSERT 이후 실제 앱의 "제안글 작성 → 투표 생성" 흐름이 거치는
유일한 쓰기 경로다(RLS가 `polls`·`poll_eligible_voters`에 대한 client INSERT를 이미 회수해
뒀다 — 28일차 D-064 패턴, 이 RPC 없이는 애초에 poll을 만들 수 없다).

```sql
begin;
select set_config('request.jwt.claims',
  json_build_object('sub','fb70ff1c-3736-44ee-a4a3-96993a3c62ed','role','authenticated')::text, true);
set local role authenticated;

with new_post as (
  insert into public.posts (board_id, author_id, type, title, body, meetup_date, start_time, place, capacity)
  values ('4ae65d6f-096d-4f58-a72c-6dc4189d003e', 'fb70ff1c-3736-44ee-a4a3-96993a3c62ed', 'meetup_proposal',
    '[35일차 스크래치] open poll 실물 재검증용 — 확인 직후 삭제 예정',
    '35일차 BOARD가 I-164/I-165/I-166을 open poll에서 재검증하기 위해 만든 스크래치 제안글입니다. 확인 직후 삭제됩니다.',
    '2026-09-01', '19:00', '스크래치 장소', 10)
  returning id
),
new_poll as (
  select cp.* from new_post, lateral public.create_poll(
    new_post.id, now(), now() + interval '2 days',
    '["fb70ff1c-3736-44ee-a4a3-96993a3c62ed","f1692173-8785-4555-b17e-3050b8167b81","c64e5973-3592-4f34-a11c-46fd3dab6da6","20a56163-698b-4778-b6d0-ae9b6a3fd97c","30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a"]'::jsonb
  ) as cp
)
select new_post.id as post_id, new_poll.ok, new_poll.reason_code, new_poll.id as poll_id, new_poll.status
from new_post, new_poll;
commit;
```

결과: `post_id=0f49874a-ca1c-40f4-9873-7b52cee373c9`, `poll_id=bcff9c32-4c3c-46b4-89c8-6f58f68a0df9`,
`ok=true`, `status=open`. 서비스 롤로 재확인: `poll_eligible_voters` 5행(위 표와 정확히 일치,
전원 `active`), `closes_at`은 생성 시각+2일(트리거①이 검증 도중 poll을 만료시키지 않도록
여유를 둠 — 트리거③은 마감과 무관하게 동작하므로 이 여유가 트리거③ 검증을 막지 않는다).

## 3. I-164 재검증 — role별 직접조회 vs RPC 행 수 (open poll)

```sql
-- member(fb70ff1c) 세션
begin;
select set_config('request.jwt.claims', json_build_object('sub','fb70ff1c-3736-44ee-a4a3-96993a3c62ed','role','authenticated')::text, true);
set local role authenticated;
select
  (select count(*) from public.poll_eligible_voters where poll_id='bcff9c32-…') as direct_table,
  (select count(*) from public.poll_eligible_voters_with_status('bcff9c32-…')) as rpc_with_status,
  (select count(*) from public.poll_eligible_voter_progress('bcff9c32-…')) as rpc_progress;
rollback;
```

| 관점 | 직접 테이블 조회(RLS 그대로) | `poll_eligible_voters_with_status` RPC | `poll_eligible_voter_progress` RPC |
| --- | --- | --- | --- |
| member(`fb70ff1c`) | **1** | **5** | **5** |
| staff(`30f44dd9`) | **5** | **5** | **5** |

**결론**: 34일차 closed poll 실측("member 1→4 / staff 5→5")과 같은 패턴이 **open poll에서도
그대로 재현된다** — `poll_eligible_voters` 테이블 자체의 RLS는 여전히 member를 1행으로
좁히지만(D-025 부기 컬럼 보호 설계 그대로, 회귀 아님), 두 RPC는 role 무관하게 5행을 정확히
반환한다. 영향 범위가 "open 상태에도 구조적으로 동일할 것"이라는 34일차 추정이 **실측으로
확정**됐다.

## 4. I-165 재검증 — `cast-vote` 경로의 `remaining` 계산 (실 투표, 실 open poll)

`cast-vote.ts`는 Server Action이라 SQL만으로 그 함수 자체를 호출할 수는 없지만(dev 서버는
팀장 전용, 아래 §7 참고), **그 함수가 실제로 하는 일**(투표 INSERT 직후 같은 세션으로
`poll_eligible_voter_progress`를 호출해 `countRemainingVoters`에 넣는 것)을 **투표자 본인의
실 세션·실 RLS**로 그대로 재현했다 — vitest가 이미 검증한 순수 함수(`countRemainingVoters`)에
RPC의 실제 응답을 그대로 대입했으므로, "코드 리뷰"가 아니라 "RPC 응답 실측 + 순수 함수
재계산"이다(34일차 I-165 항목이 쓴 것과 같은 방법론, 이번엔 committed open poll이 대상).

투표는 `poll_votes_insert_eligible_self` RLS(`voter_id = auth.uid()` AND poll이 `open`
AND 대상자 스냅샷에 존재)를 그대로 타는 **본인 세션 INSERT**로 넣었다(`castVote` 데이터
함수의 `upsert`와 동일한 문 — `on conflict (poll_id, voter_id) do update`).

| 순번 | 투표자 | role | 직후 `poll_eligible_voter_progress` 반환 | `countRemainingVoters` | `shouldAutoCloseByAllVoted` |
| --- | --- | --- | --- | --- | --- |
| 0(투표 전) | — | — | active 5 · 투표함 0 | 5 | false |
| 1 | `fb70ff1c`(제안자·member) | member | active 5 · 투표함 1 | **4** | false |
| 2 | `f1692173`(seed) | member | active 5 · 투표함 2 | **3** | false |
| 3 | `c64e5973`(seed) | member | active 5 · 투표함 3 | **2** | false |
| 4 | `30f44dd9`(chopin0625) | staff | active 5 · 투표함 4 | **1** | false |

각 단계 직후 `select status from polls where id=…`로 재확인 — **전 구간 `open` 유지**
(조기 종료 없음). 특히 순번 2(`f1692173`, 일반 크루원 · 제안자도 staff도 아님)가 34일차
결함의 핵심 시나리오다 — 수정 전이었다면 이 투표자의 세션은 `poll_eligible_voters`·
`poll_votes` 둘 다 자기 1행만 봐서 `remaining`이 **항상 0**으로 나왔을 것이다(자기 자신이
이미 투표했으므로). 실측값은 **3**(대상 5 − 투표 2, 진짜 값과 일치) — 조기 종료 유발 없음을
committed 데이터로 확정했다.

## 5. I-166 재검증 — 위치 zip 방어가 open poll에서도 유지되는가

### 5.1 1차 시도 — 우연한 100% 일치, 그 자체를 결함으로 오판하지 않는다

3표(`fb70ff1c`·`f1692173`·`c64e5973` 투표함, `30f44dd9`·`20a56163` 미투표) 상태에서 같은
세션으로 두 RPC를 호출해 `row_number() over ()`로 위치 zip:

- `poll_eligible_voters_with_status` 반환 순서: `20a56163 → 30f44dd9 → c64e5973 → f1692173 → fb70ff1c`
  (profile_id 알파벳순 — **투표 순서·삽입 순서와 무관하게 안정적**, 아래 §5.3에서 재확인)
- `poll_eligible_voter_progress` 반환 순서(`order by 1,2`): `false, false, true, true, true`
- 위치 zip 결과: 이 특정 데이터셋에서는 **5행 전부 우연히 일치**했다.

**이 100%를 결함으로 보고하지 않는 이유**: 이번에 투표한 3명(`fb70ff1c`·`f1692173`·
`c64e5973`)이 하필 profile_id 알파벳순으로 **뒤쪽 3개**였다 — 즉 "투표함=알파벳 뒤쪽"이라는
이번 데이터셋 고유의 우연한 상관이 zip을 우연히 맞아떨어지게 만들었을 뿐, `order by 1,2`
방어가 무력화된 것이 아니다(34일차 문서가 이미 남긴 교훈 — "몇 %가 맞았는가"는 진실값을
아는 검증자만 관측 가능한 사후 정보다). 이 우연을 실측으로 확인하고 넘어가지 않은 것이
아래 §5.2다.

### 5.2 2차 시도 — 비단조 패턴으로 재검증(진짜 시험)

서비스 롤로 투표 상태를 의도적으로 **비단조**(알파벳순과 무관)하게 재배열했다 — 정리 예정
스크래치 데이터라 이 조작 자체는 최종 결과에 영향 없다: `f1692173`·`c64e5973`의 표를
삭제하고 `20a56163`의 표를 추가, 최종 투표함 = `{20a56163, fb70ff1c}`(알파벳 첫째·마지막만
투표, 중간 3명은 미투표).

```sql
delete from poll_votes where poll_id='bcff9c32-…'
  and voter_id in ('f1692173-…','c64e5973-…');
insert into poll_votes (poll_id, voter_id, choice, voted_at)
values ('bcff9c32-…', '20a56163-…', 'for', now());
```

같은 zip 절차 재실행:

| profile_id(알파벳순, `with_status` 반환 순서 그대로) | zip 추측(`progress` 위치 대응) | 실제 진실값 | 일치? |
| --- | --- | --- | --- |
| `20a56163` | false | **true** | **불일치** |
| `30f44dd9` | false | false | 일치(우연) |
| `c64e5973` | false | false | 일치(우연) |
| `f1692173` | true | **false** | **불일치** |
| `fb70ff1c` | true | true | 일치(우연) |

**5행 중 2행 불일치(40%, 3/5 일치)** — 34일차 BOARD·CREW의 재검증(둘 다 "5행 중 2행
불일치")과 표면적으로 같은 수치를 open poll·다른 투표 패턴으로 재현했다.

**정정(팀장 채택, CREW 교차검증) — 이 실측은 5행 표본에서 판별력이 없다.** 3false/2true
분할 5행을 canonical 정렬 후 위치로 zip할 때 가능한 일치 수는 초기하분포로 정확히
`{1, 3, 5}`뿐이고 확률은 각각 `{0.3, 0.6, 0.1}`이다(CREW 조합론 계산, BOARD 독립 재계산으로
확인 — `C(3,x)*C(2,3-x)/C(5,3)`). 즉 **"5행 중 2행 불일치(3/5 일치)"는 방어가 실제로
작동하든 아예 없든 가장 나오기 쉬운 최빈값(P=0.6)**이라, 이 관측 하나만으로 "방어가
데이터 상태와 무관하게 유지됨을 확정했다"는 이전 결론은 근거가 되지 못한다(§5.1의 5/5
완전 일치도 P=0.1로 드물지만 0은 아니므로 "우연"으로 판정한 것 자체는 유지된다 — 그
판정만은 여전히 타당하다). 5행짜리 poll(이 프로젝트의 정상 규모)에서는 표본을 키워
판별력을 확보하기도 어렵다. **이 실측을 표에서 지우지는 않는다** — "해봤고, 이런 이유로
판별력이 없다"를 남겨야 다음 사람이 같은 시험을 반복하며 같은 착각(관측된 불일치율을
방어 증거로 오독)에 빠지지 않는다.

**방어의 진짜 근거는 통계가 아니라 함수 정의 대조다.** D-101의 안전성은 `progress`의 출력이
`(current_membership_status, has_voted)` 다중집합만으로 결정되는 정규형이라는 사실
**하나에** 의존한다 — `order by 1, 2`가 반환 컬럼 전부를 전순 정렬하므로 물리적 스캔
순서·호출 이력이 출력 순서에 전혀 남지 않는다. 이건 zip 실측으로 통계적으로 입증할 대상이
아니라 함수 본문을 읽어 구조적으로 확정할 대상이다:

```sql
select pg_get_functiondef('private.poll_eligible_voter_progress(uuid)'::regprocedure);
```

35일차 재확인 결과 `returns table (current_membership_status text, has_voted boolean)`이고
마지막 `return query ... order by 1, 2;`가 그대로 살아 있다 — **이것이 방어가 유지되는
근거**다. 이 함수 정의 대조를 회귀 감지 체크리스트에 반영했다:
`docs/design/rls-regression-checklist-33/README.md` §8.

### 5.3 부가 발견 — `with_status`의 반환 순서는 함수가 보장하지 않는다(ORDER BY 없음,
정정: "안정 정렬"이 아니라 실행계획의 부수 효과)

§5.1·§5.2 두 시도에서 투표 상태가 완전히 달랐는데도(3표 vs 2표, 다른 투표자 조합)
`poll_eligible_voters_with_status`의 반환 순서는 **관측상으로는 똑같이**
`20a56163 → 30f44dd9 → c64e5973 → f1692173 → fb70ff1c`였다(profile_id 알파벳순과 일치,
`poll_eligible_voters`에 삽입한 순서(`fb70ff1c, f1692173, c64e5973, 20a56163, 30f44dd9`)와는
다름).

**정정(CREW 지적, 팀장 채택)** — `pg_get_functiondef('private.poll_eligible_voters_with_status
(uuid)'::regprocedure)`로 직접 재확인한 결과 이 함수 본문에는 **`ORDER BY`가 아예 없다.**
위 관찰("profile_id 알파벳순으로 안정적")은 **함수의 보장이 아니라 현재 실행계획(인덱스
스캔 순서 등)의 부수 효과**다 — 내가 두 번 다 같은 순서를 봤다고 해서 그게 함수 계약의
일부가 되는 것은 아니다. 쿼리 플래너가 바뀌면(통계 갱신·인덱스 변경·Postgres 버전 업 등)
경고 없이 다른 순서가 나올 수 있다. 이 함수는 `profile_id`를 평문 반환하므로 순서 자체가
불안정해도 D-003/D-101 위반은 아니다(이미 공개된 컬럼의 정렬 기준일 뿐, 추가로 새는 정보가
없다) — 오히려 이번 확인(ORDER BY 부재)은 D-101을 **더 강하게** 뒷받침한다: D-101의
안전성은 애초에 `with_status`가 어떤 순서로 나오든 무관하게 `progress`의 정규형 하나에만
의존하도록 설계됐고, 이번에 `with_status`에 정렬 보장이 전혀 없다는 게 확인됐어도 방어는
전혀 흔들리지 않는다.

**후속 위험 한 줄(새 이슈로 올리지 않음)**: 나중에 누군가 이 함수의 반환 순서가 안정적이라고
가정하고 위치 기반으로 동작하는 UI·로직(예: "항상 같은 순서로 나오니 인덱스로 매칭해도
된다")을 얹으면, 쿼리 플래너 변경 한 번으로 조용히 깨지는 결함을 심는 셈이다 — 다음에 이
함수를 소비하는 코드를 리뷰할 때 남겨 둔다.

## 6. 정리 — 원상복구 확인

```sql
delete from poll_votes where poll_id = 'bcff9c32-4c3c-46b4-89c8-6f58f68a0df9';
delete from poll_eligible_voters where poll_id = 'bcff9c32-4c3c-46b4-89c8-6f58f68a0df9';
delete from polls where id = 'bcff9c32-4c3c-46b4-89c8-6f58f68a0df9';
delete from posts where id = '0f49874a-ca1c-40f4-9873-7b52cee373c9';
```

| 지표 | 시작 기준선 | 종료(원복 후) | 일치? |
| --- | --- | --- | --- |
| `posts` 총 | 98 | 98 | 예 |
| `polls` 총 | 62 | 62 | 예 |
| `poll_eligible_voters` 총 | 222 | 222 | 예 |
| `poll_votes` 총 | 212 | 212 | 예 |
| `meetups` 총 | 61 | 61 | 예(건드리지 않음) |
| `notifications` 총 | 47 | 47 | 예(건드리지 않음) |
| `open` 상태 poll 수 | 0 | **0** | 예 |

6개 지표 전부 기준선으로 정확히 원복됐다. 스크래치 크루·프로필 신규 생성은 0건(기존 5개
멤버십 전량 재사용).

## 7. 하지 않은 것 — 실브라우저 렌더 (배정 §5, "가능하면")

배정의 5번 항목("가능하면 실브라우저로 poll 화면을 렌더")은 **이번 회차엔 하지 않았다.**
`npm run dev`는 팀장 전용(I-139 `.next` 캐시 오염 전례)이라 직접 띄우지 않았고, 위 §3~§5의
SQL 실측(실 RLS·실 JWT claims·committed open poll·실제 앱이 쓰는 `create_poll` RPC 경로)만으로
배정의 핵심 질문(RPC 반환값이 role별로 정확한가, `remaining`이 조기 종료를 유발하지 않는가,
zip 방어가 유지되는가) 전부에 실측 답을 얻었다고 판단해 우선순위를 SQL 축에 뒀다. 화면
문구·DOM 표시까지 대조하는 것은 다음 회차 몫으로 남긴다 — 필요하면 팀장에게 dev 서버
기동을 요청할 것.

## 8. 정적 검증

- `npx tsc --noEmit`: 0 errors
- `npm run lint`: 0 errors
- `npm test`: 6 files / 41 tests pass
- 코드 변경 없음(`git status` — 이 문서 외 변경 파일 0건). 이번 회차는 **검증만** 수행했고
  마이그레이션·소스 수정 둘 다 하지 않았다(DDL 필요 사항 없음 — 팀장 사전 승인 대상 없음).

## 9. 최종 판정

- **I-164**: open poll에서도 재현 확정, 34일차 수정으로 해소된 상태 유지(member 1→5,
  staff 5→5 실측).
- **I-165**: open poll·실 투표로 재현, `remaining`이 매 단계 진짜 값과 일치(5→4→3→2→1),
  조기 종료 없음(poll이 전 구간 `open` 유지) 확정.
- **I-166**: 1차 시도가 우연히 100% 일치해 보여 "우연"으로 정확히 판정했으나, 그 판정을
  뒷받침하려 시도한 2차 zip 실측(§5.2, "5행 중 2행 불일치")은 **CREW 교차검증으로 통계적
  판별력이 없음이 확정**됐다(5행 표본에서 3/5 일치는 방어 유무와 무관한 최빈값, P=0.6).
  실측을 지우지 않고 이 한계를 명시하는 것으로 정정했다 — **방어가 유지된다는 결론 자체는
  함수 정의 대조**(`order by 1, 2`가 반환 컬럼 전부를 여전히 덮음, §5.2 재확인)로
  뒷받침한다. `poll_eligible_voters_with_status`에 `ORDER BY`가 없다는 것도 이번에
  확인했고(§5.3), 이는 D-101을 약화시키지 않고 오히려 강화한다(방어가 `with_status`의
  순서에 애초에 의존하지 않으므로).
- 회귀 없음, 새 결함 없음. 새 이슈 등재 없음(§5.3은 관찰 기록이지 결함이 아니다 — 다만 후속
  위험 한 줄은 §5.3에 남겨 뒀다). 회귀 감지 체크리스트에 함수 정의 대조 항목을 반영:
  `docs/design/rls-regression-checklist-33/README.md` §8.
