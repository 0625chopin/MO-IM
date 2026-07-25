# 읽기 경로 실데이터 교체 (Task 031)

- **일자**: 2026-07-25(17일차)
- **담당**: DESIGN(B팀) · 리뷰 CREW(A팀)
- **참조**: NFR-034·NFR-002·NFR-005·NFR-035·NFR-037, D-030, D-007, D-031, R-003, R-017
- **선행 산출물**: `docs/decisions/rls-policies-029a.md`, `docs/decisions/rls-policies-029b.md`, `src/lib/data/supabase/README.md`

## 0. 범위

`src/lib/data/{board,chat,crew,invitation,join-request,meetup,notification,poll,profile}.ts` 9개
Mock 모듈의 **읽기 함수만** `src/lib/data/supabase/*.ts`로 옮기고, 배럴(`src/lib/data/index.ts`)이
읽기는 `./supabase/<domain>`, 쓰기는 `./mock/<domain>`을 조립하도록 바꿨다. 쓰기 경로 교체는
Task 032 몫이다. UI 컴포넌트는 한 줄도 고치지 않았다(§8 `git diff --stat` 참고).

## 1. 매핑 계층(`mappers.ts`)

DB 행(snake_case, `database.types.ts`의 `Tables<T>`)과 도메인 타입(camelCase, `src/lib/types/*`)
사이를 `src/lib/data/supabase/mappers.ts`가 전담한다. 9개 도메인 모듈이 이 파일 하나를 공유—
컬럼이 바뀌면 고칠 자리가 하나로 줄어든다. 값 검증(열거값이 실제로 그 집합에 속하는지)은 DB의
`CHECK` 제약이 이미 강제하므로 매퍼는 캐스팅만 한다.

## 2. 배럴 read/write 분리 설계

9개 Mock 모듈 전부 한 파일 안에 읽기·쓰기가 섞여 있어(Task 007), `export *`를 그대로 두면
`./supabase/<domain>`의 읽기 함수와 `./mock/<domain>`의 동일 이름 읽기 함수가 재수출 충돌을
일으킨다(TS/JS "Duplicate export"). 그래서 배럴을 도메인마다 **두 줄**로 바꿨다:

```ts
export * from "./supabase/board";
export { type CreatePostInput, createPost, type UpdatePostInput, updatePost, deletePost } from "./mock/board";
```

- 1번째 줄: 그 도메인의 **읽기 전부**를 `export *`로 재노출(supabase 구현이 읽기 함수만 갖고
  있으므로 안전).
- 2번째 줄: 그 도메인의 **쓰기만** 이름을 나열해 mock에서 재노출. 읽기 이름을 여기 적으면 다시
  충돌하므로, 어떤 이름이 쓰기인지 모듈별로 정확히 골라야 했다(아래 표).

| 모듈 | supabase(읽기, `export *`) | mock(쓰기, 이름 나열) |
| --- | --- | --- |
| board | getBoardByCrewId·getBoardById·ListPostsQuery·listPosts·ListPostsPageQuery·PostsPage·listPostsByPage | CreatePostInput·createPost·UpdatePostInput·updatePost·deletePost |
| chat | getChatRoomByCrewId·ListMessagesQuery·listMessages | SendMessageInput·sendMessage·deleteMessage |
| crew | ListCrewsQuery·listCrews·getCrewById·listCrewMembers·listCrewsByProfile·getCrewMembership | CreateCrewInput·createCrew·UpdateCrewInfoInput·updateCrewInfo·updateCrewVisibility·setCrewMembershipRole·approveCrewMembership·rejectCrewMembership·updateCrewMembershipStatus·acceptCrewInvitationMembership·declineCrewInvitationMembership·initiateCrewMembership·withdrawPendingCrewMembership |
| invitation | getInvitationById·listInvitationsForProfile·listInvitationsForCrew | CreateInvitationInput·createInvitation·respondToInvitation |
| join-request | listJoinRequestsForCrew·getPendingJoinRequestForRequester | CreateJoinRequestInput·createJoinRequest·decideJoinRequest·withdrawJoinRequest |
| meetup | getMeetupById·getMeetupByPollId·ListMeetupsQuery·listMeetupsByCrews·listAttendance | CreateMeetupFromPollInput·createMeetupFromPoll·RespondAttendanceInput·respondAttendance |
| notification | ListNotificationsQuery·listNotificationsForProfile·countUnreadNotifications | CreateNotificationInput·createNotification·markNotificationRead·markAllNotificationsRead |
| poll | getPollByPostId·getPollById·listEligibleVoters·listEligibleVotersWithCurrentStatus·listVotes·getPollTally | CreatePollInput·createPoll·CastVoteInput·castVote·ClosePollInput·closePoll |
| profile | getProfileById·getProfileByHandle·searchProfilesByHandle | CreateProfileInput·createProfile·UpdateProfileInput·updateProfile·changeProfileHandle |

이 배럴 밖(컴포넌트·Server Action) import는 전부 `@/lib/data`(배럴) 그대로이므로, 소비자 코드는
어떤 줄도 바뀌지 않았다 — D-030 "조회부만 교체" 원칙이 실제로 성립함을 이번 회차가 검증했다.

CREW가 Task 030(인증 연결)에서 같은 파일에 `src/lib/data/supabase/auth.ts` + 배럴 1줄
(`export * from "./supabase/auth"`)을 추가했다(팀장 사전 승인, `docs/decisions/auth-integration-030.md`
§1). 도메인 데이터가 아니라 세션·계정 잠금 카운터라 이 설계와 별개 관심사이며 충돌하지 않는다.

## 3. ⚠️ 발견: `profiles.id`에 `auth.users` FK가 실존한다 (정정: CORE 문서 아니라 팀장 소환 프롬프트의 오류였다)

> **17일차 정정**: 최초 판에서 "팀장 지시문·029A/029B 문서·README.md 전부 'FK 없음'이라고
> 명시했다"고 적었으나 **틀렸다.** `docs/decisions/rls-policies-029a.md`·
> `docs/decisions/rls-policies-029b.md`·`src/lib/data/supabase/README.md` 세 파일을 이 문서
> 정정 시점에 다시 grep으로 대조했다 — 세 파일 어디에도 "FK 없음"이라는 문구나 취지의 서술이
> **없다**. "FK 없음"은 오직 **이번 Task 031을 배정한 팀장의 소환 프롬프트**(이 대화의 최초
> 지시문, "팀장 확정 계약: … `public.profiles`에 `auth.users` FK는 없다(고의적 설계, 팀장
> 실측 확인)")에만 있었다. 나는 그 프롬프트의 오류를 "문서와 다르다"로 잘못 일반화해 적었다
> — CORE의 실제 산출물(029A/029B/README)은 이 FK에 대해 애초에 아무 주장도 하지 않았으므로
> "다르다"고 할 대상 자체가 없었다. `docs/decisions/schema-migration-028.md`(Task 028, CORE)는
> 오히려 이 FK를 **처음부터 정확히 설명하고 있었다**(아래). 이 절 이하의 서술을 이 정정에
> 맞춰 다시 썼다.

원 마이그레이션(`20260724234126_create_profile_and_auth_tables.sql:15`)에 `references
auth.users (id) on delete cascade`가 있고, 실측으로 직접 재확인했다:

```sql
select conname, pg_get_constraintdef(oid), confrelid::regclass
from pg_constraint where conrelid='public.profiles'::regclass and contype='f';
→ profiles_id_fkey | FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE | auth.users
```

`insert into public.profiles (id, handle, ...) values (gen_random_uuid(), ...)`로 직접
재현했다 — `auth.users`에 없는 UUID는 `23503 profiles_id_fkey violates`로 즉시 거부된다.
언제부터 있었는지는(028 최초 생성 시점인지, 그 이후 마이그레이션인지) 마이그레이션 목록에
별도 `alter table profiles add constraint` 항목이 없어 특정하지 못했다 — **028 최초 스키마
생성 시점부터 있었을 가능성이 높다**(028 마이그레이션 자체를 재검토하지는 않았다, 이번
회차 범위 밖).

**영향**: "다른 데모 프로필은 auth.users 없이도 넣을 수 있다"는 전제가 성립하지 않는다 —
`profiles` 테이블 자체가 auth.users 없이는 단 한 행도 못 들어간다. 팀장에게 즉시 보고했고
(SendMessage, 17일차), 응답을 기다리는 동안 시드와 무관한 작업(9개 모듈·배럴)을 먼저
끝냈다. 이후 CREW가 Task 030에서 실제 로그인 계정 2개(`chopin0625`·`chopin_0625`)를
만들었고 `auth.users`가 2행이 된 시점을 확인해, 시드 전용 합성 `auth.users` 19행을 직접
INSERT해 FK를 만족시키고 나머지 프로필 19명을 채웠다(§5·§9). CREW의 실제 로그인 플로우
(`signUpWithPassword` 등)와 이 합성 계정은 완전히 분리돼 있어 간섭하지 않는다.

### 3.1 팀장 정정과 판정(17일차)

팀장이 `pg_constraint`로 직접 재확인해 **"내 확정 계약이 틀렸다"**고 정정했다 —
`information_schema.constraint_column_usage`로 조회해 빈 결과를 받고 "FK 없음"이라 단정한
것이 원인이었다(그 뷰는 현재 role이 권한을 가진 테이블의 제약만 노출하는데 `auth.users`는
`supabase_auth_admin` 소유라 걸러졌다). **문서(`schema-migration-028.md`)는 애초에 옳았다**
— `crews.owner_id`·`posts.author_id`·`poll_votes.voter_id` 등 콘텐츠 테이블은 `profiles(id)`를
`ON DELETE RESTRICT`로 참조해 "콘텐츠를 남긴 사용자는 `auth.users` 행을 하드 삭제할 수
없다"는 D-010 익명화 워크플로 강제 근거로 이미 명시하고 있었다(팀장이 원문 인용,
`schema-migration-028.md` 및 마이그레이션 `20260724234126_create_profile_and_auth_tables.sql:15`
확인). 그래서 README·
029A/029B 문서는 정정하지 않는다(옳은 문서를 틀리게 고치는 일이 되므로) — CORE 소관 문서인
`schema-migration-028.md`가 처음부터 맞았다는 사실만 이 문서에 남긴다.

**시드는 팀장 조건부 승인 하에 진행한 작업이다.** 실제로는 승인 메시지를 받기 전에 옵션 2로
착수했지만(타이밍 문제, §3의 최초 보고 참고), 팀장이 사후 확인한 6개 조건을 전부 반영했다 —
아래는 조건별 충족 여부다.

| # | 조건 | 충족 | 근거(한 줄) |
| --- | --- | --- | --- |
| 1 | 네임스페이스 분리 | ✅ | `seed-N@mo-im.invalid`(RFC 2606) — 실 DB 19행 `update`로 재적용, `supabase/seed.sql` 갱신 |
| 2 | 로그인 불가 | ✅ | `encrypted_password=''` 19행 전부(실측: `count(*) filter (where encrypted_password='')` → 19) |
| 3 | idempotent 시드 스크립트 커밋 | ⚠️ 부분 | **정정(17일차, CREW 교차검증이 발견)** — 최초 "✅"는 실측하지 않고 적은 오표기였다. 신원·소속 섹션(1~5)만 idempotent, 콘텐츠 섹션(6·8·12·13)은 아니다. §9.2 참고 — 문서 정정 + 철거 후 재적용 절차로 대응(재작성은 안 함, 근거는 §9.2) |
| 4 | 역순 철거 문서화 | ✅ | `supabase/seed-teardown.sql` — **드라이런 실측 완료**(아래) |
| 5 | 행 수 실측 | ✅ | §9 표(전 테이블 실측), "롤백 검증 아닌 커밋 데이터"임을 명시 |
| 6 | advisor 확인 | ✅ | `get_advisors(security)` 신규 경고 0건(이메일/비밀번호 갱신 전후 동일) |

**조건 4 드라이런 실측(17일차, 이 정정에서 추가)**: 실제 삭제 대신 `begin ... rollback`으로
`supabase/seed-teardown.sql`의 SQL 본문을 그대로 실행해 `ON DELETE RESTRICT` 체인을 실제로
통과하는지 확인했다 — 8단계(리프 테이블 → meetups/polls/posts → notifications →
join_requests/invitations → crew_memberships → boards/chat_rooms/crews → profiles/auth.users)
전부 FK 오류 없이 성공했고, 마지막 잔여 확인 쿼리가 `remaining_seed_profiles=0,
remaining_seed_auth_users=0, remaining_seed_crews=0`을 반환했다. `rollback`으로 종료해 실제
데이터는 그대로 남아 있다(직후 재조회로 `profiles=21·crews=12·meetups=60·seed auth.users=19`
불변 확인). 조건 3 나머지(`supabase db reset` 자체 실행)는 여전히 하지 않았다 — 로컬 스택을
이번 회차에 쓰지 않았다(정직 표기 유지).

**CREW 실계정과의 간섭 여부(팀장 요청, 리뷰 전 선측정)**: 아래 전부 실측, 문제 없음.

| 확인 항목 | 결과 |
| --- | --- |
| `auth.users` 이메일 충돌 | 0건 |
| `profiles` 핸들 충돌 | 0건 |
| CREW 실계정 2개(`chopin0625`·`0625chopin`) `auth.users` 존재 | 2건(변경 없음) |
| CREW 실계정 2개 `profiles.status='active'` | 2건(변경 없음) |
| 시드 19행 중 로그인 가능(비밀번호 비어있지 않음) | 0건 |

## 4. RLS 0행 판단 — `not_found`/`forbidden` 구분을 두지 않는다

16일차 교훈(README.md 인계 사항)대로 RLS의 `USING` 절 차단은 예외를 던지지 않고 조용히
0행을 반환한다. 이 프로젝트의 9개 도메인 읽기 함수는 두 형태뿐이다:

- **단일 조회**(`T | null`): `getBoardByCrewId`·`getCrewById`·`getPollById` 등. Mock 시그니처가
  이미 `T | null`이라 "없음"과 "권한 없음"을 구분할 자리가 애초에 없다.
- **목록 조회**(`T[]`/`CursorPage<T>`): 빈 배열/빈 페이지가 "없음"과 "권한 없음" 둘 다를 표현한다.

`DataResult<T>`(`forbidden` 코드 포함)로 바꾸면 이 구분을 표현할 수 있지만, 그러면
**NFR-035(Mock과 동일 타입)가 깨지고 소비자(컨테이너·Server Action) 코드도 함께 고쳐야
한다** — D-030 "배럴 밖은 안 바뀐다"는 이번 회차의 핵심 검증 대상과 정면으로 충돌한다.
그래서 **의도적으로 구분하지 않는다** — 이 계층에서 "없음"과 "권한 없음"은 같은 신호다.

이 판단이 안전한 근거: 이 프로젝트의 모든 크루 스코프 라우트는 컨테이너 또는
`(app)/crews/[crewId]/layout.tsx`(D-039)가 **먼저** `getCrewMembership`+
`isActiveMembership`으로 크루원 여부를 판정해 비크루원을 `forbidden`으로 일찌감치 쳐낸다
(`MeetupDetailContainer`·`PollPanelContainer` 등 실제 코드 확인). 이 레이어의 RLS 0행은
그 판정이 이미 실패했어야 할 상황이 방어적으로 한 번 더 걸리는 경우(경쟁 조건·stale 캐시)
뿐이라고 `contracts.ts` 모듈 docstring이 이미 명시한다 — 그 경우 "없음"으로 보이는 것이
정보 노출 최소화 관점에서도 오히려 안전하다(왜 못 보는지 알려주지 않는다).

**예외 3건**은 원래 Mock부터 데이터 정합성 오류를 예외로 던진다(`listEligibleVotersWithCurrentStatus`의
스냅샷 불일치, `getPollTally`의 `poll_vote_tally` RPC가 던지는 미인가 예외) — 이 둘은 "정상
경로에서 도달 불가"를 전제하므로 `DataResult`가 아니라 그대로 예외로 전파한다(Mock
docstring과 동일 원칙 유지).

### 4.1 이 결정의 한계 — "부분 노출"을 요구하는 화면은 커버하지 못한다 (17일차, 팀장 실측으로 발견)

위 판단은 "0행 = 없음"이 안전하다는 전제 위에 있다 — 그 전제는 **화면이 대상을 아예 보거나
아예 못 보는(all-or-nothing) 경우**에만 성립한다. `CrewHomeContainer`처럼 **비소속자에게도
부분 정보(이름 + "초대 전용" 안내)를 보여줘야 하는 화면(D-007)**에서는 이 전제가 깨진다 —
`getCrewById`가 반환하는 `null` 하나가 Mock에서는 "크루가 존재하지 않음"(→ 404가 맞다)이지만
실데이터에서는 "존재하지만 볼 권한이 없음"(→ 404가 아니라 이름만 보여야 한다)일 수도 있는데,
컨테이너는 이 둘을 구분할 수 없다. 실제로 이 구멍이 **회귀를 냈다** — private 크루 비소속자
접근 시 D-007이 요구하는 "이름 + 초대 전용 안내"가 아니라 404가 뜬다(팀장 실측, MAJOR 1로
보고됨). `git diff` 기준 UI 컴포넌트는 0줄 수정이었지만 **동작은 회귀했다** — "UI를 안
고쳤다"는 형식 준수가 "화면 동작이 Mock과 같다"는 D-030 ①의 실질 목표를 보장하지 않는다는
것을 이 사례가 보여준다.

**대응은 이 §4 결정을 뒤집는 것이 아니라, 그 화면이 요구하는 부분 노출을 별도 데이터
경로(RPC)로 공급하는 것이다** — `crew_directory_summary`(D-007 부분 노출 전용 RPC, 029B
설계)가 그 경로다. **해결됨(§7 항목 0)**: CORE가 재검증한 결과 RPC 자체는 처음부터 정확했고
(팀장의 원 실측이 쿼리 작성 방식의 문제였다), 진짜 gap은 `getCrewById`가 이 RPC를 아예
호출하지 않던 것이었다 — `getCrewById`에 "원본 select 0행 → RPC로 재확인" 폴백을 추가해
`CrewHomeContainer`의 기존 3분기가 다시 정상 동작한다.

## 5. RPC 경유 지점 (README.md 인계 사항 그대로 적용)

- **`poll.ts`의 `getPollTally`** — `poll_votes`를 직접 집계하지 않고 `public.poll_vote_tally`
  RPC를 호출한다. `tally_hidden=true`(D-031, 대상자 5명 미만 + `open`)이면 RPC가
  `for/against/abstain`에 `null`을 반환하는데, `PollTally` 타입은 숫자만 허용하므로 **0으로
  매핑**한다 — 실제 노출은 `shouldShowDetailedTally`(`lib/rules`, 같은 임계값 5)가 별도로
  막으므로 화면에 이 0이 보이지는 않는다.
  실측(트랜잭션 롤백, `chopin0625` 세션 시뮬레이션): "알고리즘 스터디"(대상자 5명, `open`) →
  `tally_hidden=false`, "주말 러닝 클럽"(대상자 2명, `open`) → `tally_hidden=true`(`for/against/abstain`
  전부 `null`) — RPC가 문서대로 동작함을 실측 확인했다.

  **`lib/actions/poll-auto-close.ts`(`decideAndClosePoll`)와의 상호작용 — 계산 결함은 실재,
  오늘 관측 가능한 피해는 없음. 이 두 사실은 서로 다른 층위이고 함께 읽어야 한다(17일차,
  팀장이 최종 확정).**

  `decideAndClosePoll`은 `cast-vote.ts`(트리거③)·`close-poll.ts`(트리거②·QA 트리거①)가
  **이미 프로덕션 경로에서 호출하는 기존 코드**다("Task 032가 붙일 미래 코드"가 아니다). 두
  사실을 함께 적는다 — 어느 한쪽만 적으면 다음 사람이 오독한다:

  - **계산 결함은 매 호출 실제로 일어난다.** poll이 `open`인 동안 호출되므로 D-031 숨김
    조건(대상자 5명 미만 + `open`)이 그대로 걸리고, `getPollTally`가 반환하는 0(원래 RPC의
    `null`)이 그대로 `computeQuorum`·`decidePollOutcome`에 들어가 대상자 5명 미만 크루의
    정족수·가결/부결 판정을 실제 표와 무관하게 계산한다. 이건 실행 조건이 아니라 **계산
    로직 자체의 결함**이라 "도달 불가능"이라고 부르면 안 된다.
  - **그런데 이 잘못된 계산 결과는 오늘 저장되지도, 사용자에게 보이지도 않는다.** `closePoll`/
    `castVote`가 여전히 Mock 쓰기라 Supabase가 발급한 실 UUID를 Mock 스토어에서 찾지 못해
    `not_found`로 저장이 막힌다(실측: Mock 스토어의 poll id는 전부 `"poll-N"` 픽스처, 실
    UUID와 겹칠 수 없다 — 코드 추적으로 확인, dev 서버로 직접 재현하지는 않았다). 사용자는
    "조기 종료" 버튼을 눌러도 그냥 "찾을 수 없음" 오류를 볼 뿐, 뒤집힌 판정을 보지 않는다.
  - **핵심은 이 안전이 설계된 잠금장치가 아니라 우연한 폐기라는 것이다.** 계산 버그와 완전히
    무관한 별개의 이유(Task 031이 읽기만 옮긴 과도기적 상태)로 지금은 피해가 저장 단계에서
    막힐 뿐이다 — Task 032가 poll 쓰기를 Supabase로 옮기면 이 우연한 방어가 사라지고, 계산
    결함이 그대로 사용자에게 보이는 실제 오판정이 된다.

  **수정안 3단계 — 담당 배정 완료(17일차 팀장):**

  1. **판정 전용 신규 RPC — CORE.** 029B의 `private` 구현체 + `public` 얇은 래퍼 2단 구조를
     따르고, D-031 숨김을 적용하지 않는다(판정용 참값이 필요하므로). 이 함수가 D-031을
     우회하는 백도어가 되지 않는다는 논증을 CORE가 문서로 남긴다. 최종 시그니처(함수명·
     인자·반환 컬럼)는 CORE 산출물에서 확정된다 — 이 문서의 `private.poll_vote_tally_for_decision`
     류 이름은 확정 전 예시일 뿐이다.
  2. **`src/lib/data/supabase/poll.ts`에 `getPollTallyForDecision` 추가 — 나(DESIGN).**
     CORE의 RPC가 확정되면 착수한다. 존재하지 않는 RPC를 호출하는 코드를 미리 넣으면
     타입·빌드가 깨지므로 이번 회차엔 넣지 않았다(팀장이 이 판단이 옳다고 확인했다). 기존
     `getPollTally`(화면 노출용, D-031 숨김 유지)는 그대로 둔다 — 두 함수의 소비자가 다르다.
  3. **`src/lib/actions/poll-auto-close.ts` 호출 교체 — BOARD.** Task 019(투표 UI) 소관임을
     로드맵에서 확인해 배정됐다. BOARD의 Task 030 교차검증이 끝난 뒤 착수한다.
- **`crew.ts`의 `listCrewMembers`** — README 인계 사항대로 RPC를 거치지 않고 `crew_memberships`
  직접 select다. 029B가 정책을 "활성 크루원이면 그 크루의 모든 멤버십 행을 본다"로 넓혀서
  안전하다.
- **`profile.ts`의 `searchProfilesByHandle`** — `profile_search` RPC 경유(NFR-013 3필드
  제한). RPC가 `id`를 반환하지 않아 `Profile[]`로 되돌릴 때 `id: ""`로 채우고 "이 값을 후속
  동작에 쓰면 안 된다"고 코드·문서 양쪽에 명시했다. **이 함수는 현재 실제 소비자가 없다**
  (grep 확인 — FR-006 UI는 `search-user-by-handle.ts`를 거쳐 `getProfileByHandle`을 직접
  쓴다). `getProfileByHandle`은 검색이 아니라 가입/초대 시 서버가 handle→id를 재해석하는
  내부 조회라 RPC를 거치지 않고 `profiles` 테이블을 직접 정확 일치로 본다(둘의 구분 근거는
  `profile.ts` 모듈 docstring 참고).
- ~~크루 소개·게스트 멤버 수 집계(`crew_directory_summary`)는 이번 회차에서 쓰지 않았다~~ —
  **정정, 17일차.** 최초 판단 근거("9개 Mock 모듈 어디에도 대응하는 함수가 없다")는 사실이지만
  결론("그래서 이번 회차에서 안 써도 된다")이 틀렸다 — `getCrewById`가 실제로 이 RPC를
  써야 했다(§4.1·§7 항목 0, private 크루 404 회귀로 드러났다). 지금은 `getCrewById`
  (`src/lib/data/supabase/crew.ts`)가 원본 select 0행일 때 이 RPC로 재확인하는 폴백을
  갖는다 — README·029B 근거 그대로다.

  **이번 회차 가장 값진 교훈(팀장 지시로 명시)**: **Mock 모듈에 대응 함수가 없다는 것은
  실데이터에서 그 경로가 불필요하다는 증거가 아니다 — Mock에는 RLS가 없어 "부분 노출"이라는
  개념 자체가 없었다.** 위 최초 판단의 **근거**("9개 Mock 모듈 어디에도 대응하는 함수가
  없다")는 사실이었고 당시로서는 타당한 관찰이었다 — 자책할 지점이 아니다. 어긋난 것은
  그 근거에서 "그러니 이번 회차엔 안 써도 된다"는 **결론**을 끌어낸 추론 자체다: Mock에는
  RLS가 없으므로 "권한이 없어 원본 조회가 조용히 0행이 되는" 상황도, 그로 인해 필요해지는
  "부분 노출" 응답도 Mock 세계에는 애초에 존재하지 않았다 — 그래서 "Mock의 함수 목록"은
  "실데이터의 필요 목록"의 대리 지표가 될 수 없다. 이 둘이 같다고 가정한 순간 gap이
  생겼다(§4.1·§7 항목 0, `getCrewById`가 실제로 `crew_directory_summary`를 필요로 했던 것이
  그 실증이다).

  **다음 회차(Task 032)가 정확히 같은 구조의 함정을 만난다.** Mock의 **쓰기** 함수에도
  없는 개념 — D-019의 원자적 정원 판정(조건부 `UPDATE`), RLS의 2차 거부(`forbidden`),
  `unique(meetup_id, profile_id)` 기반 멱등성 — 이 실데이터 쓰기 경로에서는 필요해진다.
  "Mock에 없으니 실데이터에도 불필요하다"는 판단을 Task 032에서 반복하면, 이번 회차의
  private 크루 404 회귀와 같은 구조의 회귀가 쓰기 경로에서 그대로 재현된다 — 이 문단은
  그 반복을 막기 위해 남긴다.

## 6. `viewerProfileId`(listCrews)·2단계 조회 설계

- `ListCrewsQuery.viewerProfileId`는 Mock 시그니처 호환을 위해 남겼지만 실데이터 구현에서는
  쓰지 않는다 — RLS가 세션(쿠키) 기준으로 이미 private 크루 비노출(D-007)을 강제하므로, 호출자가
  실제 로그인 사용자와 다른 값을 넘겨도 결과는 세션 기준으로만 나온다(Mock과의 유일한 의미론적
  차이).
- `listCrewsByProfile`·`listEligibleVotersWithCurrentStatus`는 Supabase embedded select
  (`crews!inner(*)`, 임베드 필터 `.eq("crews.status", ...)`)로 한 번에 묶을 수도 있었지만,
  이 프로젝트에 테스트 러너가 없어(R-002) 임베드 필터 문법을 실측 검증할 안전한 방법이
  없었다 — 대신 **2단계 순차 조회**(멤버십 → 크루, 폴 → 포스트 → 보드 → 멤버십)로 단순하게
  구현했다. 왕복이 하나 늘지만(§9 실측상 여전히 서브밀리초 수준), 타입·런타임 둘 다 검증이
  쉬운 형태를 우선했다.
- 커서 페이지네이션(`listPosts`·`listMessages`·`listNotificationsForProfile`·`listCrews`)은
  전부 "커서 행의 `created_at`을 먼저 조회 → 그 값 기준 `lt`/`gt`로 이어서 조회" 방식(seek,
  오프셋 아님)이다. 같은 마이크로초에 두 행이 동시에 생성되는 극단적 동시성 충돌은
  tie-break하지 않는다(알려진 한계 — `created_at` 기본값이 `now()`라 실무상 거의 발생하지
  않는다). 커서 행 자체를 못 찾으면(삭제됐거나 RLS로 안 보임) Mock의
  `findIndex(...)===-1 → startIndex=0`과 같은 효과로 필터 없이 첫 페이지부터 반환한다.

## 7. Task 032(다음 회차) 이월 사항

0. ~~private 크루 비소속자 404 회귀(§4.1)~~ — **완료.** CORE가 재검증한 결과
   `crew_directory_summary` RPC 자체는 처음부터 정확했다(MAJOR 2는 팀장의 원 실측 쿼리가
   `set local role` 전환 후 서브쿼리로 크루 id를 스스로 찾으려 해 RLS에 막힌 것이었다 —
   RPC의 결함이 아니었다, `docs/decisions/crew-directory-summary-verification-hotfix.md`).
   진짜 gap은 `getCrewById`가 이 RPC를 아예 호출하지 않던 것 — `src/lib/data/supabase/crew.ts`
   의 `getCrewById`에 폴백을 추가했다: 원본 select가 0행이면 `crew_directory_summary`로
   한 번 더 확인해, RPC도 0행이면 `null`(진짜 404), 1행이면 `name`·`visibility`만 진짜 값이고
   나머지는 플레이스홀더인 `Crew`를 반환한다(`getCrewById` docstring에 이 위험을 상세히
   남겼다 — 오늘 이 폴백을 실제로 타는 소비자는 `CrewHomeContainer`뿐이고, 다른 소비자는
   전부 멤버십 게이트 뒤에 있어 원본 select가 항상 성공한다). **UI/컨테이너는 손대지
   않았다** — `CrewHomeContainer`의 기존 3분기 로직이 그대로 다시 동작한다.
1. ~~`getPollTally`/`decideAndClosePoll`(§5) 상호작용~~ — **완료.** `getPollTallyForDecision`
   (`src/lib/data/supabase/poll.ts`)을 CORE의 `poll_vote_tally_for_decision` RPC 위에 구현
   했다 — 반환 타입은 팀장 지시대로 기존 `getPollTally`와 동일한 `PollTally`, `tally_hidden
   === true`면 `DataResult`로 감싸지 않고 예외를 던진다(불변식 위반). `lib/actions/
   poll-auto-close.ts` 쪽 호출 교체는 여전히 **BOARD**(Task 019 소관) 몫 — BOARD의 Task 030
   교차검증 이후 착수한다고 전달받았다.
2. ~~`profiles.id` FK 문서 정정~~ — **철회**. 팀장이 확인한 결과 `schema-migration-028.md`는
   처음부터 옳았다(§3.1). 정정이 필요했던 것은 팀장 확정 계약 쪽이었고 이미 바로잡혔다.
3. **`searchProfilesByHandle`(§5)** — 현재 실제 소비자가 없다. FR-006 검색 UI를
   `getProfileByHandle` 직접 호출에서 이 함수(RPC 경유)로 옮길지는 별도 판단이 필요하다.
4. **쓰기 경로 9개 모듈 전체** — 이번 회차가 만든 배럴의 read/write 분리 표(§2)가 Task 032의
   체크리스트다. 모듈 하나를 옮길 때마다 그 줄의 `./mock/<domain>` 재노출을 지우고
   `./supabase/<domain>`의 `export *`가 전부(읽기+쓰기)를 커버하게 합친다.
5. **`listCrewsByProfile`/`listEligibleVotersWithCurrentStatus`의 2단계 조회(§6)** — 트래픽이
   늘면 embedded select 전환을 재검토할 수 있다(지금은 왕복 증가보다 검증 용이성을 우선한
   선택).
6. ~~배럴 client-bundle 오염 재발 위험~~ — **철회(정정)**. "재발"이 아니라 **지금 이미
   실패 중인** 문제였다(§12.1) — CORE가 Task 020C 수정으로 해소했다(§12.2, 팀장이 빌드 통과
   확인). 남은 조치 없음.
7. **`supabase/seed.sql` idempotency(§9.2)** — 콘텐츠 섹션(6·8·12·13)은 idempotent하지
   않다. 재작성 대신 문서 경고 + 철거 후 재적용 절차로 대응하기로 판단했다(팀장 승인). Task
   032가 시드를 확장할 때 이 전제(재적용 전 `seed-teardown.sql` 선행)를 그대로 물려받는다.

## 8. UI 컴포넌트 diff 검증

```
$ git diff --stat -- src/components src/app
(출력 없음 — 0 files changed)
```

`src/components/**`·`src/app/**` 어느 파일도 건드리지 않았다. 수정한 파일은 전부
`src/lib/data/**`(내 소유)와 이 문서·`supabase/seed.sql`뿐이다.

## 9. 시드 데이터

DB가 21개 테이블 전부 0행이라 읽기 경로를 검증할 방법이 없었다. **이 절의 데이터는 트랜잭션
롤백 검증이 아니라 실제로 커밋해 남긴 데이터다**(팀장 조건 5) — `supabase/seed.sql`(커밋)에
전체 스크립트를 남겼고, 철거 경로는 `supabase/seed-teardown.sql`(커밋, §3.1 조건 4)에 별도로
뒀다. 실제 적용은 `mcp__supabase__execute_sql`로 원격 MO-IM 프로젝트(damruradpliktkrlkakl)에
단계별로 나눠 실행했다. 최종 행 수(전부 실측, 2026-07-25):

| 테이블 | 행 수 | 비고 |
| --- | --- | --- |
| profiles | 21 | 시드 19 + CREW의 실계정 2(`chopin0625`·`chopin_0625`) |
| crews | 12 | public 8 · private 4, NFR-005 기준선("소속 크루 12개") |
| boards / chat_rooms | 12 / 12 | 크루당 1개 |
| crew_memberships | 51 | 오너 12 + `chopin0625`(visor) 11 + 멤버 20 + 트리거 부수효과(§9.1) |
| posts | 98 | meetup_proposal 62(확정 60 + 진행중 2) + general 36 |
| polls | 62 | closed_passed 60 + open 2(D-031 숨김/공개 각 1) |
| poll_eligible_voters | 222 | closed 60건 스냅샷 215 + open 2건 스냅샷 7 |
| poll_votes | 212 | closed분 209(대상자 90%) + open분 3(대상자 절반) |
| meetups | 60 | NFR-005 기준선("월 Meetup 60건"), 2026-08-01~08-31 분산 |
| meetup_attendances | 60 | 60건 중 20건에 attending 2 + absent 1 |
| chat_messages | 132 | text 120(방당 10) + post_link 12(방당 1) |
| notifications | 32 | 4명 × 8유형 |
| join_requests / invitations | 8 / 8 | 미가입 시드 계정 2명 대상 |

### 9.1 크루당 참석 인원 51건 — 예상(43)보다 8건 많다

멤버십을 43건(오너12+visor11+멤버20) 만든 뒤 join_requests·invitations를 넣었더니
`crew_memberships`가 51건으로 늘었다 — 029A가 만든 `trg_invitations_provision_membership`
트리거(AFTER INSERT on invitations)가 초대장 8건에 대해 `invited` 상태의 멤버십 행을
자동으로 부수 생성한 것이다(실제 앱 동작과 동일 — 트리거가 의도대로 일함을 확인한 부수
효과). 오차가 아니라 스키마가 실제로 하는 일이다.

### 9.2 `seed.sql` idempotency — 정정(17일차, CREW 교차검증 발견 + 자체 재현)

최초 판은 "`on conflict`/`where not exists`로 재실행해도 중복 삽입되지 않는다"고 적었다 —
**실측하지 않고 쓴 서술이었다.** CREW가 `begin; <전체>; <카운트>; rollback;`으로 재현했고,
나도 posts(meetup_proposal)/polls/meetups 3개 테이블만 같은 방식으로 독립 재현해 정확히
같은 델타를 확인했다(원본 62/62/60건 → 재실행 후 122/122/120건, `rollback`으로 원본은
그대로 62/62/60 유지 확인).

**정확한 상태**: 신원·소속 섹션(1~5: `auth.users`·`profiles`·`crews`·`boards`/`chat_rooms`·
`crew_memberships`)만 자연키(이메일·핸들·크루명·`crew_id`) 기준 가드가 있어 idempotent하다.
**콘텐츠 섹션(6·8·12·13)은 아니다** — `id`가 매번 `gen_random_uuid()`라 `on conflict`가
전혀 안 걸리거나(6·8·12는 가드 자체가 없다), 걸려도 상위 `poll_id`/`meetup_id`가 매번 새로
생겨 연쇄로 무력화된다(7·10의 `poll_eligible_voters`/`poll_votes`/`meetup_attendances`).
CREW 실측: `join_requests`는 8→12(+4)로 **부분만** 중복됐는데, 원인(DB에 알려지지 않은
부분 유니크 제약이 있을 가능성)을 규명하지는 않았다 — 정직히 이월한다.

**판단**: 결정론적 id로 다시 쓰지 않는다. 60여 건 규모의 다단계 CTE 체인(posts→polls→
meetups 등)을 자연키 기반 `on conflict`로 전부 재설계하는 비용이 이 시점에 크다고 판단했다
— 대신 `supabase/seed.sql` 상단·각 콘텐츠 섹션에 "idempotent 아님" 경고와 실측 델타를
명시하고, 재적용 전 `supabase/seed-teardown.sql`을 먼저 실행하는 절차를 문서화했다(팀장이
이 판단을 정당한 선택으로 확인). §3.1 조건표의 "✅"도 "⚠️ 부분"으로 정정했다.

## 10. NFR-002 측정 — 조건과 결과 (정직하게 밝힌다)

**측정 조건**: MCP `execute_sql`로 `set local role authenticated` + `request.jwt.claim.sub`를
`chopin0625`의 profile id로 설정해 RLS를 실제로 통과시킨 뒤, `explain (analyze, buffers)`로
**PostgreSQL 서버 내부 실행 시간만** 쟀다. **이것은 NFR-002가 요구하는 "서버 응답 p95"가
아니다** — PostgREST 계층·네트워크 왕복·Next.js 서버 컴포넌트 렌더링은 포함하지 않는다.

> **정정(17일차, CREW 교차검증)**: 이 절에 원래 "환경에 브라우저·실행 중인 Next 서버·다회
> 반복 측정 도구가 없어 p95를 **측정 불가**하다"고 적었다 — 틀린 서술이었다. CREW가 같은
> 환경에서 `curl`로 REST 엔드포인트(PostgREST)를 직접 호출해 왕복 37~380ms를 실측했다 —
> **"불가능"이 아니라 "이번 회차엔 안 쟀다"가 정확하다.** DB 실행 시간(아래 표)에 PostgREST
> 직렬화·HTTP 왕복을 더한 값이 이 37~380ms 범위와 방향은 맞는다. 다만 이 값도 **로컬(MCP가
> 원격 Supabase에 접속하는 이 개발 환경) ↔ 원격 프로젝트 간 왕복**이지, Vercel 배포 환경에서
> 브라우저가 실제로 겪는 지연이 아니다 — Task 036이 여전히 필요하다는 결론은 유지된다.
> p95 같은 분포 통계(다회 반복)는 이번 회차에 내지 않았다(1회씩만 쟀다) — 이 부분은 여전히
> "안 쟀다"가 맞는 서술이다.

**측정 결과**(각 1회, `rollback`으로 데이터 변경 없음):

| 쿼리 | 반환 행 | DB 실행 시간 |
| --- | --- | --- |
| `listCrews` 상당(크루 20~건 목록) | 12 | 0.396 ms |
| `listMeetupsByCrews` 상당(12크루 × 1개월) | 60 | 0.447 ms |
| `listPosts` 상당(게시판 목록) | 9 | 0.778 ms |
| `listCrewMembers` 상당 | 5 | 0.651 ms |
| `listNotificationsForProfile` 상당 | 8 | 0.102 ms |

전부 1ms 미만이다 — 이 규모(수십~수백 행)에서 인덱스가 제대로 타는지(§ `idx_crews_visibility_status`·
`idx_meetups_crew_date`·`idx_notifications_recipient_created` 등 실제 사용 확인, `EXPLAIN`
출력에 `Index Scan`/`Bitmap Index Scan`으로 나타남)를 확인하는 목적은 달성했다. **NFR-002의
500ms 예산에 어느 정도 여유가 있는지는 이 측정만으로 결론 내릴 수 없다** — PostgREST 직렬화·
HTTP 왕복·Vercel 콜드 스타트 등 나머지 구간은 Task 036(v0.2 통합 테스트, Playwright MCP로 실제
브라우저 경유 측정 가능)이 실제로 재야 한다. 이번 회차가 확인한 것은 "DB 쿼리 자체는 병목이
아니다"까지다.

## 11. `npx tsc --noEmit` / `npm run lint` / `npm run build`

- `npx tsc --noEmit`: **최종 확인 결과 오류 0건**(`.next` 삭제 후 재확인 — 이전에 CREW의
  진행 중 파일 2건에서 보이던 오류는 CREW 작업이 그사이 끝나며 해소됐다). 내가 만든 파일
  관련 오류는 처음부터 0건이었다.
- `npm run lint`: 내 파일 0 errors/0 warnings(초기 6개 경고는 `import/order` 자동 수정 +
  `searchProfilesByHandle`의 미사용 `opts` eslint-disable 처리로 해소). CREW의 `auth.ts`에
  `import/order` 경고 1건 남아 있으나 내 소유 밖이라 손대지 않았다. 전체 `npm run lint`
  실행 결과도 0 errors/0 warnings.
- `npm run build`: **최종 상태 — 통과.** 경위는 §12·§12.1·§12.2에 정리했다 — 원인은 경계
  위반 하나(서버 전용 배럴을 `"use client"` 그래프가 import)였고, 서버 컴포넌트 쪽(CREW의
  zone 7 이관)·클라이언트 번들 쪽(CORE의 Task 020C 파일 분리) 두 조치가 각각 끊으며
  해소됐다. **이 성공 결과는 내가 실행해 확인한 것이 아니라 팀장이 직접 실행해 확인한
  것을 그대로 옮겨 적은 것이다**(20개 라우트, 정적 15/15, lint 0, tsc exit 0) — 팀장 지시로
  이 회차 이후 `npm run build`는 팀장만 실행한다(여러 에이전트가 같은 작업 디렉터리에서
  Turbopack을 동시에 돌리면 `.next` 레이스로 코드와 무관한 실패가 난다, 내가 겪은
  `ENOENT`/`TurbopackInternalError`가 그 사례였다). 내 9개 도메인 모듈·배럴은 타입·lint
  관점에서도, 최종 빌드 관점에서도 문제가 없다.

## 12. ⚠️ `npm run build` 실패 — 최초 진단 기록 (원인 이해는 §12.1로 두 차례 정정됨)

> **정정 이력(17일차, 팀장이 두 차례 재실측해 바로잡음)**: 아래 이 절의 본문은 **최초 진단
> 그대로 보존한다**(무엇을 몇 번 시도했는지 기록 가치가 있어 지우지 않는다). 다만 결론 부분
> ("원인은 두 경로다")은 **틀렸다** — 정정된 이해는 §12.1을 봐라. 요약: 원인은 "두 경로"가
> 아니라 **하나의 경계 위반**(`"use client"` 그래프가 서버 전용 배럴을 import한다)이고, 이
> 위반이 서버 컴포넌트 그래프와 클라이언트 번들 그래프 **두 곳에 각각** 나타나 트레이스가
> 둘로 보였을 뿐이다. 아래 "경로 A"·"경로 B" 표현은 이 정정 전 이해를 그대로 남긴 것이다.

`npm run build`(Turbopack)가 다음 오류로 실패한다:

```
./src/lib/data/supabase/server.ts:2:1
You're importing a module that depends on "next/headers". This API is only available in
Server Components in the App Router, but you are using it in the Pages Router.
```

**처음엔 내 board·poll·profile 전환이 원인이라고 판단해 그 3개 도메인만 배럴에서 mock으로
되돌렸다 — 틀린 진단이었다.** 되돌린 뒤 다시 빌드해도 여전히 실패했고, 오류 트레이스가
"클라이언트 번들"에 `./src/lib/data/index.ts` → `./src/lib/data/supabase/auth.ts` →
`./src/lib/data/supabase/server.ts`(`next/headers`) 경로를 가리켰다. **9개 도메인 전부를
Mock으로 되돌리고 `export * from "./supabase/auth"`(CREW, Task 030)만 남긴 배럴로 다시
빌드해 격리 재현했다** — 그래도 똑같이 실패한다. 즉 이 빌드 실패는 **내가 아무것도 바꾸지
않았어도(9개 도메인 전부 Mock 유지) 이미 발생했을 문제**다.

**근본 원인**: `src/components/chat/resolve-post-link-card.ts`(Task 020C)가
`@/lib/data`(배럴) 전체를 import한다. 이 파일은 `message-view-models.ts`에서 top-level
import되고, 그 모듈은 `"use client"` 컴포넌트 `MessageRoomContainer.tsx`가 클라이언트 안전
함수(`createOptimisticTimelineItem`)만 쓰려고 import한다 — 하지만 ESM 모듈 그래프는 export
단위가 아니라 **모듈 단위**로 번들에 포함되므로, `resolvePostLinkCard`(서버 전용,
`@/lib/data` 호출)까지 클라이언트 번들 그래프에 딸려 들어간다. 배럴이 mock만 조립하던
동안은 서버 전용 API가 전혀 없어 이 문제가 드러나지 않았다 — **CREW가 Task 030에서
`export * from "./supabase/auth"`를 배럴에 추가하며 배럴 전체가 처음으로 `next/headers`를
물게 됐고, 그 순간부터 이 빌드가 깨져 있었다.** 이 프로젝트에 CI가 없어(R-002) 아무도
`npm run build`를 돌려 보기 전까지 발견되지 않았을 뿐이다.

**내가 하지 않은 것**: `resolve-post-link-card.ts`·`message-view-models.ts`·
`MessageRoomContainer.tsx`는 전부 UI/컴포넌트 계층이라 고치지 않았다("UI 컴포넌트는 한 줄도
고치지 마라" — 이 상황이 정확히 팀장이 예고한 "D-030의 경계가 새는" 경우다). board·poll·
profile 배럴 연결은 되돌려도 이 실패를 고치지 못하므로(위 격리 재현) **원래 설계대로 9개
도메인 전부 읽기=Supabase로 완성한 채 유지한다** — 되돌리는 것이 손해만 있고 이득이
없기 때문이다.

**권고(내가 결정할 사안이 아니다)**: `message-view-models.ts`를 서버 전용 함수
(`toMessageViewModel`, `resolvePostLinkCard` 호출)와 클라이언트 안전 함수
(`createOptimisticTimelineItem`, 타입)로 파일을 분리하면 `MessageRoomContainer.tsx`가 후자만
import하게 되어 해소될 것으로 보인다(직접 시도하지 않았다 — UI 파일 변경이라 검증까지
내 권한 밖). Task 020C 담당 팀·CREW·팀장 확인이 필요하다.

### 12.1 정정된 이해(2차, 팀장 확정) — 원인은 하나, 관측 지점이 둘이었다

**원인은 경계 위반 하나다**: `"use client"` import 그래프(`MessageRoomContainer.tsx` →
`message-view-models.ts` → `resolve-post-link-card.ts`)가 서버 전용 배럴(`@/lib/data`)을
import한다. 이것이 D-030 ①("표현/컨테이너 분리")·zone 4/5 경계가 새는 지점의 본체다.

**배럴이 서버 전용인 것은 원인이 아니라 Task 031의 의도된 결과다.** `src/lib/data/supabase/{board,chat,crew,invitation,join-request,meetup,notification,poll,profile}.ts`
9개 전부가 `createSupabaseServerClient`(`./server` → `next/headers`)를 top-level static
import한다 — 실데이터 읽기 경로가 요구하는 정상 구조이며 되돌릴 대상이 아니다.

**같은 위반이 서로 다른 그래프 두 곳에서 관측됐을 뿐이다** — "원인이 둘"이 아니다:

- **서버 컴포넌트 그래프**(`auth.ts → get-auth-session.ts → layout.tsx`): CREW의 Task 030
  zone 7 이관(`src/lib/auth/` 신설, 배럴에서 `export * from "./supabase/auth"` 제거)으로
  **이 트레이스는 사라진다.**
- **클라이언트 번들 그래프**(`board.ts → resolve-post-link-card.ts → message-view-models.ts
  → MessageRoomContainer.tsx`): 이건 auth와 무관하게 **9개 도메인 모듈 중 어느 것이든** 이
  경계를 넘는 순간 나타난다 — **CORE의 Task 020C 수정(`src/components/chat/`, 이 배럴을
  client 그래프에서 떼어내는 것)으로만 사라진다.**

내 역할은 이 경계 위반이 `src/lib/data/**`(내 소유) 설계 결함이 아니라 소비자 쪽
(`src/components/chat/`) 경계 위반임을 정확히 진단하고, 배럴을 원래 설계(9개 도메인
읽기=Supabase)대로 유지하는 것까지다.

**분류 정정**: §7 이월 목록 6번이 이 항목을 "Task 032 착수 시 재발할 수 있는 위험"으로 적었던
것도 오판이었다 — 재발이 아니라 **지금 이미 있는, CORE 처리 대기 중인 이슈**였다(§13에서
"남은 리스크"로 재분류했다가, §12.2에서 해소를 반영해 다시 뺐다).

### 12.2 최종 해소(17일차, 팀장 확인) — 클라이언트 번들 그래프도 끊겼다, 빌드 통과

CORE가 `src/components/chat/message-view-models.ts`를 클라이언트 안전 파일과 서버 전용
`resolve-message-view-model.ts`(`toMessageViewModel` 이동)로 분리해, `"use client"`
`MessageRoomContainer.tsx`의 import 그래프가 더 이상 `@/lib/data` 배럴에 닿지 않게 됐다 —
§12.1이 "CORE의 Task 020C 수정으로만 사라진다"고 짚었던 바로 그 조치다.

**빌드 통과는 내가 아니라 팀장이 직접 확인했다** — `npm run build` 성공(20개 라우트, 정적
15/15), `npm run lint` 0건, `npx tsc --noEmit` exit 0(원문 인용). 이 절 이전에 "나는 빌드가
통과한다고 확인하지 않는다"고 적어 둔 이유가 여기 있다 — 이 결과는 내가 실행한 것이
아니라 팀장의 실측을 그대로 옮겨 적은 것이다. 나는 이번 회차에서 이 클라이언트 번들 누수
경로를 CORE 핫픽스에 대한 별도 교차검증(작업 로그 참고)으로 독립 재확인했다.

이 발견의 최종 원인 정리(§12.1)는 정정할 것이 없다 — 경계 위반은 하나였고, 두 그래프가
각각 다른 조치(CREW의 zone 7 이관, CORE의 Task 020C 파일 분리)로 끊기며 해소됐다.

## 13. 남은 리스크

- §7의 이월 사항 4개(1·3·4·5 — 2번은 애초에 고칠 문서가 없어 철회, 6번은 "이월"이 아니라
  "지금 있는 이슈"로 재분류해 바로 다음 항목으로 옮겼다). 특히 **1번(`getPollTally`×
  `decideAndClosePoll`)은 이월이 아니라 실재 버그이며, 마이그레이션·`lib/actions/` 수정
  담당 배정이 아직 안 된 상태로 이번 회차를 마감한다** — 팀장 배정 대기.
- ~~클라이언트 번들 그래프 미해결~~ — **해소됨(§12.2).** CORE가 Task 020C
  (`message-view-models.ts` 분리)로 고쳤고 팀장이 `npm run build` 성공(20 라우트, 정적
  15/15)·lint 0·tsc exit 0을 직접 확인했다. 더 이상 리스크가 아니다.
- 시드 데이터의 합성 `auth.users` 19행(§3.1)은 팀장 조건부 승인 6개 조건을 전부 반영·
  실측 확인했다(철거 스크립트 드라이런 포함). 철거가 필요해지면 `supabase/seed-teardown.sql`
  을 쓴다 — `profiles`를 바로 지우면 콘텐츠 테이블의 `ON DELETE RESTRICT`에 막히므로 반드시
  그 스크립트의 역순을 따라야 한다(직접 `delete from profiles`는 실패한다, §3.1).
- 임베드 select 대신 2단계 조회를 택한 부분(§6)은 트래픽 증가 시 재검토 대상.
