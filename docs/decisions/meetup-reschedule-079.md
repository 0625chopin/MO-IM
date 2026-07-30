# Meetup 일정 변경 스키마·트리거 (I-079, FR-065 AC2) — 결정·근거

> 26일차(2026-07-30), CORE. 참조: `docs/ISSUES.md` I-079, `docs/prioritization-and-risks.md`
> D-051(정정 이력 포함)·D-003, `docs/requirements/requirements.md` FR-065·FR-066·FR-067,
> `docs/decisions/poll-pipeline-034.md`(Task 034 funnel), `docs/decisions/community-
> expansion-041.md`(Task 041의 임시 경로).

## 0. 배정 범위

I-079가 열어 둔 gap: FR-065 AC2("날짜 변경 → 저장 → 캘린더 바가 새 날짜로 이동 + 변경 이력이
남는다")를 만족하는 설계는 D-051이 이미 정리해 뒀지만("재투표를 거친 뒤 기존 Meetup을
UPDATE"), `polls.post_id`·`meetups.poll_id` UNIQUE 제약 때문에 "기존 Meetup을 겨냥하는 새
투표"를 표현할 자리가 스키마에 없어 21일차(Task 041)엔 시도조차 못 했다. 이번 회차 배정:

1. 그 자리를 만드는 스키마 설계(UNIQUE 제약과 충돌하지 않게).
2. `finalize_closed_poll`(Task 034 funnel)에 "새 Meetup INSERT" 대신 "기존 UPDATE + 이력
   기록" 분기 추가 — 회귀 검증 비중이 크다는 전제로 배정됨.
3. 팀장이 사용자에게 받아 확정한 제품 결정 — **날짜 변경 시 기존 참석 응답을 전부
   무효화하고 재확인을 요구한다** — 를 DB 레벨에서 강제.

## 1. 채택안 — 스키마

### 1.1 `posts.type`에 `'meetup_reschedule_proposal'` 추가 + `posts.target_meetup_id`

```sql
alter table public.posts
  add constraint posts_type_check
  check (type = any (array['general','meetup_proposal','meetup_reschedule_proposal']));

alter table public.posts
  add column target_meetup_id uuid references public.meetups(id) on delete restrict;

alter table public.posts
  add constraint posts_target_meetup_id_check
  check ((type = 'meetup_reschedule_proposal') = (target_meetup_id is not null));
```

`polls.post_id`·`meetups.poll_id` UNIQUE는 **건드리지 않는다** — "제안글 1개 : 투표 1개"라는
불변식은 그대로 유지되고, "이 제안글이 기존 Meetup 중 무엇을 겨냥하는가"만 `posts` 쪽에 새
컬럼으로 추가했다. 결과: 일정 변경 투표도 여전히 자기 자신의 새 `post`·새 `poll` 행을
갖는다(그래야 재투표라는 D-003 요구를 만족한다) — 다만 그 poll이 가결됐을 때 **새 Meetup을
만드는 대신 `target_meetup_id`가 가리키는 기존 Meetup을 UPDATE**하도록 `finalize_closed_poll`이
분기한다(§1.3).

**크루·상태 스코프는 CHECK가 못 하므로 트리거로 강제한다**(`posts_guard_reschedule_target_scope`,
`BEFORE INSERT OR UPDATE OF type, target_meetup_id, board_id`): `target_meetup_id`가 가리키는
Meetup이 (a) 이 post와 같은 크루 소속이고 (b) `status = 'confirmed'`인지 확인한다. 실패하면
예외를 던진다. `UPDATE OF` 절을 넣은 이유 — 작성자 본인은 `posts_update_author_or_staff_delete`
RLS상 자기 게시글의 어떤 필드든 바꿀 수 있어(트리거는 "본인 외의 변경"만 막는다, §5.2 한계
참고), 나중에 `type`을 `meetup_reschedule_proposal`로 바꿔치기하는 경로까지 재검증 대상에
넣는다.

`polls_insert_proposal_author` RLS도 `p.type in ('meetup_proposal', 'meetup_reschedule_proposal')`
로 확장했다 — 그 외 투표 생성 정책·판정 로직은 전혀 건드리지 않는다.

### 1.2 `meetup_schedule_changes` — FR-065 AC2 "변경 이력" 테이블

```sql
create table public.meetup_schedule_changes (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete restrict,
  poll_id uuid not null references public.polls(id) on delete restrict,
  previous_date date not null, previous_start_time text, previous_place text, previous_capacity integer,
  new_date date not null, new_start_time text, new_place text, new_capacity integer,
  changed_at timestamptz not null default now(),
  constraint meetup_schedule_changes_poll_id_key unique (poll_id)
);
```

`poll_id` UNIQUE가 멱등성의 핵심이다(§3.3). RLS는 그 Meetup이 속한 크루의 활성 크루원에게만
SELECT를 연다(`meetup_schedule_changes_select_members`). `anon`·`authenticated` 모두
INSERT/UPDATE/DELETE/TRUNCATE 권한을 명시적으로 회수했다 — 쓰기는 `finalize_closed_poll`
(SECURITY DEFINER) 하나뿐이다.

### 1.3 `finalize_closed_poll` 분기

```
if v_result = 'passed' then
  if post.type = 'meetup_reschedule_proposal' then
    -- 멱등 가드: 이미 이 poll_id로 반영된 이력이 있으면 스킵
    -- UPDATE meetups SET date/start_time/place/capacity/attending_count=0 WHERE id=target AND status='confirmed'
    -- (found) → INSERT meetup_schedule_changes(이전값, 새값) + UPDATE meetup_attendances SET invalidated_at=now() WHERE invalidated_at IS NULL
  else
    -- 기존 그대로: INSERT meetups ... ON CONFLICT(poll_id) DO NOTHING
  end if
end if
-- 알림(FR-045) 부분은 무변경 — poll_closed 알림은 두 갈래 모두 동일하게 적재된다
```

### 1.4 `meetup_attendances.invalidated_at` — 팀장 결정의 DB 강제

**팀장이 사용자에게 받은 결정**: 날짜가 바뀌면 기존 참석/불참 응답을 전부 무효화하고
재확인을 요구한다("7/1에 간다"가 "7/8에 간다"를 의미하지 않으므로, 응답을 유지하면 못 오는
사람이 참석자로 남아 정원(FR-066 E1) 계산이 왜곡된다).

새 컬럼 `meetup_attendances.invalidated_at timestamptz`(nullable). `poll_votes.invalidated`
(D-003 강퇴 무효화)와 같은 소프트-무효화 패턴을 그대로 따랐다 — 행을 지우지 않고 이력을
남긴다. `finalize_closed_poll`의 reschedule 분기가 `attending_count`를 0으로 되돌리는 것과
**같은 트랜잭션**에서 기존 응답 전부를 무효화하므로, 두 값이 항상 함께 움직인다(DB
레벨에서 왜곡 불가능 — 앱 레이어가 이 UPDATE를 건너뛸 방법이 없다).

`private.respond_meetup_attendance`(FR-066·067 RPC)도 함께 고쳤다: `invalidated_at`이 채워진
행은 `status`가 같아도 "이전 응답 없음"과 동일하게 취급해 재확인을 강제하고, 재확인이
성공하면 `invalidated_at`을 다시 null로 되돌린다. 이 수정이 없었다면 재확인 요청이
"이미 같은 상태"로 오판정돼 조용히 no-op 처리되고 `attending_count`가 영원히 0에 머물렀을
것이다 — §3.4의 실측이 이 시나리오를 직접 재현해 확인했다.

## 2. 기각안

이번 회차에 검토하고 접은 대안들 — D-051이 이미 기각한 ①무가드 직접 UPDATE, ②낙관적
UI 위장, ③`superseded_by_meetup_id` 링크만 추가는 재론하지 않는다(D-051 참고). 이번 회차
고유의 대안:

- **① `meetups.poll_id`를 새 reschedule poll로 repoint** — 가결 시 `meetups.poll_id`를
  최신 승인 poll로 바꿔치기하는 안. **기각** — `meetups.poll_id`는 "이 Meetup을 최초로 만든
  poll"이라는 의미로 코드베이스 전역(`getMeetupByPollId`, `meetups_guard_attendee_scope`의
  제안자 판정 등)에 이미 쓰이고 있다. Repoint하면 원본 제안자 추적이 끊기고, 오히려
  `meetups_guard_attendee_scope`의 기존 author-match 조건(`new.poll_id`→post→author)이
  reschedule 제안자와 어긋나는 문제를 낳는다(§3.2에서 실제로 겪은 문제와 같은 종류). 대신
  `posts.target_meetup_id`로 "누가 이 Meetup을 겨냥했는가"를 표현하고, `meetups.poll_id`는
  불변으로 둔 채 `meetups_guard_attendee_scope`에 별도 조건을 추가하는 쪽을 택했다(§3.2).
- **② 별도 `meetup_reschedule_polls` 조인 테이블** — `polls`에 손대지 않고 poll_id ↔
  target_meetup_id 매핑만 새 테이블로 분리하는 안. **기각** — `posts.target_meetup_id` 하나로
  이미 충분하고(post 1개 : poll 1개가 불변이므로 post 쪽에 두면 자동으로 poll과 1:1
  대응된다), 새 테이블은 `createPost`/`createPoll` 기존 파이프라인을 그대로 재사용하지 못하게
  만들 뿐 추가 표현력이 없다. `posts.type` 구분이 이미 "일반 제안과 구분 가능해야 한다"는
  요구를 만족한다.
- **③ 참석 응답 DELETE(하드 삭제)** — 재확인 요구를 "행 자체를 지워 미응답 상태로 되돌리기"로
  구현하는 안. **기각** — `poll_votes.invalidated` 소프트 플래그 선례와 일관성이 없고, "누가
  예전 일정에 어떻게 응답했었는지" 감사 이력이 사라진다. `invalidated_at` 컬럼이 같은 효과
  (정원 계산에서 제외)를 내면서 이력도 보존한다.
- **④ 동시 reschedule 제안 상호 배제(락)** — 한 Meetup에 이미 열려 있는 reschedule 투표가
  있으면 새 reschedule 제안 자체를 막는 안. **이월(기각 아님)** — 유용하지만 "동시에 여러
  일정 변경 제안이 경합"하는 시나리오는 요구사항에 명시가 없고, 구현하려면 posts INSERT
  트리거에 "이 meetup을 겨냥한 열린 poll이 이미 있는가" 상관 서브쿼리가 필요해 범위가
  커진다. §5.1에 한계로 남긴다.

## 3. 자기반증 — 실측 전문(전부 `begin`…`rollback`, 실 시드 데이터, 커밋 없음)

### 3.1 대상

크루 `9fc186fc-72a6-4097-aa22-76cbee61e9d8`(활성 멤버 4명: 오너 1·크루원 3), Meetup
`24ee3462-a109-4879-9609-a6e4d5792eaf`(확정, 2026-08-02, 정원 없음, 참석 2명 — 응답 3건:
attending 2·absent 1). 크로스크루 대조군은 `863e8ff0-…`의 Meetup(`d5e5f2bd-…`).

### 3.2 1차 실측에서 발견한 회귀 — `meetups_guard_attendee_scope`가 자체 UPDATE를 막음

첫 실측 시도에서 `finalize_closed_poll`의 reschedule UPDATE가 즉시 실패했다:

```
ERROR: P0001: only staff/owner/proposal author may edit meetup fields other than
attending_count (D-019 conditional UPDATE excepted)
CONTEXT: PL/pgSQL function public.meetups_guard_attendee_scope() line 18 at RAISE
```

원인 둘(Task 032가 만든 이 트리거는 **UPDATE만** 막고, Task 034의 `finalize_closed_poll`은
지금까지 `meetups`에 **INSERT만** 해 왔으므로 이 트리거에 한 번도 걸린 적이 없었다 — 이번이
`finalize_closed_poll`이 처음으로 `meetups` UPDATE를 시도한 경우다):

1. **트리거①(pg_cron → `run_poll_auto_close_job` → `finalize_closed_poll`)은 `auth.uid()`가
   없다**(postgres 시스템 컨텍스트, JWT 없음). 기존 가드는 "임원/오너 아니면 → 제안자
   본인인가"만 보고 "actor가 아예 없는 시스템 트랜잭션"을 봐주지 않았다.
2. **트리거②/③(사람이 직접 종료)에서도** 이 가드의 제안자-매치 조건은 `new.poll_id`(=Meetup을
   **최초로 만든** poll)의 작성자만 인정한다. 일정 변경 제안(다른 post, 다른 poll)의 작성자는
   전혀 다른 poll_id를 거치므로 이 조건에 걸리지 않는다 — `meetup:cancel_or_update` 각주⁵
   ("제안 작성자 본인")가 요구하는 대상에 reschedule 제안자가 빠져 있었다.

**수정**(`meetup_reschedule_079_fix_guard_attendee_scope` 마이그레이션): `polls_guard_
decision_integrity`가 이미 쓰는 관용구("actor가 null이면 통과") 도입 + 제안자 매치 조건에
"이 Meetup을 `target_meetup_id`로 겨냥한 post의 작성자"를 추가. `RLS`가 `to authenticated`뿐이라
`auth.uid()`가 null인 채로 `authenticated` 역할 UPDATE가 실제로 들어올 방법이 없다(유효한
Supabase JWT는 항상 `sub`를 담는다) — 이 회피가 새 공격 표면을 늘리지 않는다는 근거다.

### 3.3 전체 시나리오 실측 결과 (수정 후, 22개 체크 전부 PASS)

| 구분 | 체크 | 결과 |
| --- | --- | --- |
| E1 | 크로스크루 target_meetup_id → INSERT 거부(트리거) | ✅ PASS |
| E2 | 취소된(status≠confirmed) target_meetup_id → INSERT 거부(트리거) | ✅ PASS |
| F1 | 비작성자가 reschedule post의 poll을 INSERT 시도 → RLS 거부 | ✅ PASS (`new row violates row-level security policy for table "polls"`) |
| F2 | 작성자 본인이 reschedule post의 poll을 INSERT → 허용(RLS 확장 확인) | ✅ PASS |
| **A(회귀)** | 일반 FR-034 제안 가결 → **새** Meetup 생성, 필드 정확 반영, target Meetup(24ee3462) 불변 | ✅ PASS ×2 |
| **B(신규)** | 일정 변경 제안 가결 → **기존** Meetup UPDATE(새 Meetup 미생성), 이력 1건 기록(이전/새 값 정확), 참석 응답 3건 전부 무효화, `attending_count`→0, `poll_closed` 알림 4명 | ✅ PASS ×7 |
| **C(멱등성)** | 재확인된 응답을 만든 뒤 `finalize_closed_poll` 재호출(재시도 스윕 시뮬레이션) → 이력 중복 없음(여전히 1건), 재확인된 응답 재무효화 안 됨, `attending_count` 재리셋 안 됨 | ✅ PASS ×3 |
| **D(재확인 의미론)** | 무효화 후 같은 값으로 재확인 → `changed=true`(진짜 재확인으로 취급) + `invalidated_at` 클리어 + 카운트 정확히 1회만 증가, 그 후 동일 재호출 → 진짜 no-op(`changed=false`), 카운트 불변 | ✅ PASS ×6 |

**롤백 후 잔존 확인**: `meetup_schedule_changes` 0행, `[TEST]` 접두 게시글 0행, 대상 Meetup의
날짜·참석 카운트·상태·무효화 행 수 전부 원상태(원본 그대로) — 실측이 실 데이터를 전혀
바꾸지 않았음을 재확인했다.

**Advisor**: `get_advisors(security)` — 마이그레이션 2건 적용 전후 모두 신규 WARN·ERROR
0건(기존 `auth_leaked_password_protection` 1건만, 무관).

## 4. BOARD 인계 — 인터페이스 단일 소스

### 4.1 "일정 변경 제안" 작성 — 새 Server Action 불필요, 기존 파이프라인 확장만 하면 된다

일반 FR-034 제안과 **정확히 같은 2단계 호출**(`createPost` → `createPoll`)을 쓴다. 새 RPC가
없다 — `createPostAction`(`src/lib/actions/create-post.ts`)을 확장하면 된다:

```ts
// 1) 새로 제안하는 일정으로 post 생성
const post = await createPost({
  boardId, authorId,
  type: "meetup_reschedule_proposal",
  title, body,
  meetupDate, startTime, place, capacity, // 새로 "제안하는" 값
  targetMeetupId, // 기존 확정 Meetup의 id
});

// 2) 그 post를 대상으로 투표 생성 — meetup_proposal과 완전히 동일한 호출
await createPoll({ postId: post.id, opensAt, closesAt, eligibleVoterIds });
```

`createPostAction`의 현재 분기(`input.type === "meetup_proposal"`)를 그대로 넓혀
`input.type === "meetup_reschedule_proposal"`도 같은 갈래(권한 체크·일정 검증·`createPoll`
호출)를 타게 하면 된다 — `poll:create_proposal` 권한 매트릭스 행도 그대로 재사용(추가 권한
불필요, `permission.ts` 무변경).

**반드시 추가해야 하는 것 — Server Action 쪽 사전 검증.** DB 트리거
(`posts_guard_reschedule_target_scope`)가 크루·상태 스코프를 최종 방어하지만, 그건 **raise
exception**으로 막는다(`DataResult`가 아니다) — Server Action이 사전 확인 없이 바로
`createPost`를 부르면 사용자에게 처리되지 않은 500이 노출된다. `cancelMeetupAction`이 이미
하는 패턴과 동일하게, `createPost` 호출 **전에** 다음을 확인해 깔끔한 도메인 오류로
전환할 것을 강력히 권장한다:

```ts
if (input.type === "meetup_reschedule_proposal") {
  if (!input.targetMeetupId) return { ok: false, kind: "denied", code: "forbidden" };
  const target = await getMeetupById(input.targetMeetupId);
  if (!target || target.crewId !== input.crewId) {
    return { ok: false, kind: "denied", code: "not_found" };
  }
  if (target.status !== "confirmed") {
    // CreatePostActionResult에 새 kind("conflict" 등) 추가를 고려할 것 — 지금은 kind가
    // "fields"|"denied" 둘뿐이라 적당한 자리가 없다. BOARD 판단에 맡긴다.
    return { ok: false, kind: "denied", code: "not_found" };
  }
}
```

트리거가 던지는 원문 예외 메시지(참고용, 파싱해 분기하지 말 것 — 위 사전 검증으로 애초에
도달하지 않게 만드는 것이 맞는 방향이다):
- `"일정 변경 제안은 같은 크루의 Meetup만 대상으로 할 수 있다(FR-065 AC2, target_meetup_id=%)"`
- `"취소된 Meetup은 일정 변경 대상이 될 수 없다(FR-065 AC3, target_meetup_id=%)"`

### 4.2 Meetup 상세 — "일정 변경 이력" 표시

```ts
export async function listMeetupScheduleChanges(meetupId: Id): Promise<MeetupScheduleChange[]>
```

`src/lib/data/{mock,supabase}/meetup.ts` 양쪽에 있다(배럴 자동 재노출, `@/lib/data`에서
바로 import). 최신 변경이 먼저 오도록 정렬돼 있다. 빈 배열 = "이력 없음"(AC2 빈 상태 —
`/sample`에 빈 상태로 등록할 때 그대로 쓰면 된다). 타입:

```ts
interface MeetupScheduleChange {
  id: Id; meetupId: Id; pollId: Id;
  previousDate: ISODateString; previousStartTime: string | null;
  previousPlace: string | null; previousCapacity: number | null;
  newDate: ISODateString; newStartTime: string | null;
  newPlace: string | null; newCapacity: number | null;
  changedAt: ISODateTimeString;
}
```

### 4.3 참석자 목록(FR-068) — `invalidatedAt` 처리

`MeetupAttendance.invalidatedAt: ISODateTimeString | null`이 추가됐다. **FR-068 AC1의
참석/불참/미응답 3분류에서, `invalidatedAt !== null`인 행은 `status` 값과 무관하게
"미응답"으로 취급할 것을 권장한다** — 팀장 결정("재확인을 요구한다")의 UI 반영이 이 지점이다.
`status` 필드 자체는 지우지 않았으므로(감사 이력), "예전 일정에는 어떻게 응답했었는지"를
보여주고 싶다면 그 값을 별도로 참고할 수 있다 — 다만 정원(FR-066)·현재 참석 확정 여부에는
관여하지 않는다(`Meetup.attendingCount`가 이미 이 값들을 제외하고 정확하다).

### 4.4 `respond_meetup_attendance` — 앱 레이어 변경 없음

반환 타입·`reason` 목록(`full`|`forbidden`) 무변경. 무효화된 응답의 재확인은 자동으로
"진짜 변경"(`changed: true`)으로 처리되고 카운트가 정확히 반영된다 — Server Action
(`respond-meetup-attendance.ts`)을 고칠 필요가 없다(§3.4 실측 확인).

## 5. 남은 리스크·미확인·후속 이슈

1. **동시 reschedule 제안 상호 배제 없음**(§2 대안④) — 같은 Meetup을 겨냥한 reschedule
   제안 2건이 동시에 진행 중일 수 있고, 둘 다 가결되면 나중에 `finalize_closed_poll`이
   실행되는 쪽이 최종 상태를 덮어쓴다(이력에는 둘 다 남는다 — 데이터 손상은 아니다). 실
   충돌은 실측하지 않았다(현재 시드에 이 상황이 없다) — 이론적 분석만 했다.
2. **Post 필드 잠금이 DB에 없다는 기존 한계의 연장** — `posts_update_author_or_staff_delete`
   RLS + `trg_posts_guard_non_author_delete_only`는 "본인 외의 변경"만 막고, 작성자 본인이
   raw REST로 자기 게시글의 `type`·`target_meetup_id`·`meetup_date` 등을 사후에 바꾸는 것을
   막지 않는다(앱은 애초에 이 필드들을 수정하는 UI/액션이 없을 뿐). `posts_guard_reschedule_
   target_scope`를 `UPDATE OF type, target_meetup_id, board_id`에도 걸어 최소한 "크루·상태
   스코프 위반"은 막았지만, "이미 가결된 일반 제안을 사후에 reschedule로 둔갑시키는" 것
   자체는 막지 않는다(가결 후에는 poll 재사용이 안 되므로 실질적 악용 경로는 제한적이나,
   정직하게 미확인으로 남긴다).
3. **Mock 환경에는 자동 반영 파이프라인이 없다** — `poll-pipeline-034.md`가 이미 남긴 전례
   그대로("Mock의 poll 자동 종료가 Meetup 생성을 자동으로 트리거하지 않는다"), Mock의
   `applyMeetupReschedule`도 자동으로 호출되지 않는다. `/sample` QA 시뮬레이터에서 수동
   호출용으로만 존재한다 — BOARD가 데모 버튼을 만들고 싶다면 이 함수를 직접 부르면 된다.
4. **`npx tsc --noEmit`이 이번 회차 동안 신뢰할 수 없는 상태였다** — 다른 팀원의 `npm run dev`가
   `.next/dev/types/routes.d.ts`를 계속 재작성 중이라(gitignore된 빌드 산출물) 그 파일이
   파싱 불가 상태로 걸릴 때마다 tsc가 **전체 의미 분석을 건너뛰고 그 구문 오류만 보고**했다
   (실제로 `generate-meetups.ts`의 `MeetupAttendance` 리터럴 누락 필드를 한동안 놓쳤다 —
   `.next`를 제외한 임시 tsconfig로 격리해서 잡았다). 최종 확인은 격리된 설정으로
   `0 errors`를 받았지만, **이 문제가 이 세션에 국한된 것인지, tsconfig의 `include`가
   `.next/dev/types/**/*.ts`를 명시하는 것 자체가 구조적 위험(다른 팀원이 dev 서버를 돌리는
   동안 누구든 `tsc --noEmit`을 돌리면 같은 함정에 빠진다)인지는 이번 회차에서 결론 내지
   않는다** — 팀장 판단이 필요한 별개 사안으로 남겼고, 27일차에 `docs/ISSUES.md` **I-138**로 등재됐다.
5. **`npm run build`(프로덕션 빌드)는 이번 회차에 돌리지 않았다** — 다른 팀원의 `npm run dev`가
   `.next/`를 계속 쓰고 있어 빌드 충돌을 피하려고 생략했다(운영 규칙 "flock 안에서 장기 실행
   서버를 백그라운드로 띄우지 마라"의 취지를 넓게 해석 — 빌드도 같은 디렉터리를 다툰다).
   `npx tsc --noEmit`(격리 설정)과 `npm run lint`·`npm test`로 대체 확인했다.

## 6. 산출물

- 마이그레이션: `meetup_reschedule_pipeline_079`(신규 스키마·트리거·`finalize_closed_poll`
  분기·`run_poll_auto_close_job` 재시도 가드), `meetup_reschedule_079_fix_guard_attendee_scope`
  (§3.2 회귀 수정).
- `src/lib/types/board.types.ts`(`PostType`·`Post.targetMeetupId`),
  `src/lib/types/meetup.types.ts`(`MeetupAttendance.invalidatedAt`·`MeetupScheduleChange`).
- `src/lib/data/supabase/{mappers,board,meetup,database.types}.ts`(읽기·쓰기 함수, 타입
  재생성).
- `src/lib/data/mock/{board,meetup,fixtures}.ts`·`mock/seed/{generate-board,generate-
  meetups}.ts`(NFR-035 타입 동일성 유지 + `applyMeetupReschedule`/`listMeetupScheduleChanges`
  Mock 구현).
- 본 문서, `docs/ISSUES.md`(27일차 병합 완료 — I-137·I-138).

## 각주(33일차, CREW) — `applyMeetupReschedule`(Mock) 완전 삭제

위 §5-3과 §6이 설명하는 Mock의 `applyMeetupReschedule`(`/sample` QA 시뮬레이터·수동 호출용으로
남겨 둔다고 적은 그 함수)는 실제로는 `src/lib/data/index.ts`가 Task 032(18일차)부터 meetup
도메인도 `./supabase/meetup`만 재노출하고 `./mock/*`는 재노출하지 않아, 도입 시점(26일차)
이후로 이 함수를 가리키는 import·호출이 저장소 전체에 0건이었다(정의 자체 제외) — "수동
호출용"이라는 설계 의도가 실제로 소비된 적이 없는 죽은 코드였다. `withdrawPendingCrewMembership`
(I-144, 31일차 CORE)과 같은 클래스로 팀장이 33일차에 발견해 CREW가 완전 삭제로 처분했다
(`src/lib/data/mock/meetup.ts`). 본문 §5-3·§6은 **당시 기록을 그대로 두고 고치지 않는다** —
이 각주가 그 사실 위에 "이후 삭제됐다"만 덧붙인다. 상세: `docs/ISSUES.md`(33일차 CREW 처분,
제보자 팀장).
