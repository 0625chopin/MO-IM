# RLS 단일 의존 회귀 안전망 — 수동 체크리스트 (I-153 처분, 33일차, CORE)

I-153은 `join_requests` 승인의 archived-크루 차단이 **`join_requests_update_requester_or_staff`
RLS 정책 한 곳에만** 의존한다고 지적했다(nested UPDATE가 `crew_memberships_guard_self_transition`의
officer 분기를 `pg_trigger_depth() > 1`로 건너뛰기 때문). 팀장 결정: 후속 후보 (a) 채택 — CI가
아직 없으므로(R-002) 자동 테스트 대신 **복붙해서 그대로 돌릴 수 있는 SQL 체크리스트**로 회귀
안전망을 만든다. (b)(officer 분기 재설계)는 기각 — 근거는 `docs/DECISIONS.draft.CORE.md` 참고.

이 문서의 각 SQL은 Supabase MCP `execute_sql`(또는 동등한 `psql`)로 그대로 실행 가능하다.

**방법론 — 역할을 두 번 이상 전환하는 스크립트를 쓸 때(34일차, DESIGN, §6 작성 중 실제로
걸렸던 함정)**: `reset role`은 세션 역할만 원복하고 **`request.jwt.claims`는 그대로 남는다** —
둘은 별개 GUC다. 한 트랜잭션 안에서 페르소나 A → B로 갈아탄 뒤 "시스템 컨텍스트"(role 원복
상태)로 되돌아가 검증용 정리 UPDATE를 하면, `auth.uid()`가 여전히 마지막으로 설정한 A(또는 B)의
claims를 읽어 RLS·트리거가 **그 사람 것처럼** 판정한다 — 가짜 예외나 가짜 통과가 둘 다 나올 수
있다. **역할을 되돌릴 때마다 `set local role`을 `reset`하는 것과 별개로
`set local request.jwt.claims = '';`를 명시적으로 실행한다.** 32일차 교훈 2(서비스롤 금지)·
3(가짜 양성 방지)과 같은 층위의 규칙이다 — **이번 회차(34일차)에 RLS 실측이 다섯 차례 이상
있었고, 한 트랜잭션 안에서 페르소나를 갈아탄 스크립트는 전부 이 함정에 걸렸을 수 있으므로
재점검 대상이다**(팀장 지시로 CREW가 자기 스크립트를 재점검 중). 실제로 이 문제가 §6 초안
작성 중 발생한 사례는 아래 §6 "행동 검증" 절에 원인·재현과 함께 남아 있다.

---

## 1. 정책 조회 — `is_crew_active`가 USING·WITH CHECK 양쪽에 살아있는가

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where tablename = 'join_requests' and policyname = 'join_requests_update_requester_or_staff';
```

**기대 출력** (33일차 실측, 33일차 시점 배포본과 바이트 단위로 대조):

```
qual       = "((crew_id IN ( SELECT cm.crew_id FROM crew_memberships cm WHERE
              ((cm.profile_id = ( SELECT auth.uid() AS uid)) AND (cm.status = 'active'::text)
              AND (cm.role = ANY (ARRAY['staff'::text, 'owner'::text]))))) AND
              private.is_crew_active(crew_id))"
with_check = qual과 동일한 구조(문자 그대로 같음 — staff/owner 조건 + private.is_crew_active(crew_id))
```

**판정 기준**: `qual`과 `with_check` 문자열 양쪽에 `private.is_crew_active(crew_id)` 서브스트링이
**반드시** 있어야 한다. 하나라도 없으면 이 정책이 재작성되며 조건이 누락된 것 — **즉시 회귀**다.

---

## 2. 행동 검증 — archived 크루를 향한 승인이 실제로 0행인가

**픽스처 재사용 불가 — 이유부터.** 기존 archived 픽스처 크루(`2724533e-9e02-4609-8ad3-88becec6fe24`,
"I-067 검증용")를 그대로 쓰려 했으나, 거기엔 pending `join_requests`가 없고 **새로 하나를 걸 수도
없다** — `crew_memberships_guard_self_insert_request` 트리거가 자기서비스 INSERT를
"공개(public)·활성(active) 크루"로만 한정하기 때문에(I-120), archived 크루에는 `requested` 멤버십
자체가 생기지 않는다. 또 이 크루를 잠시 `active`로 되돌려 셋업할 수도 없다 —
`crews_guard_archived_immutable`이 **`old.status = 'archived'`인 행의 모든 UPDATE를 예외 없이
차단**하기 때문에(재활성화 기능 자체가 없음, 의도된 단방향 전이). 그래서 **브랜드뉴 스크래치
크루**를 만들어 `active` 상태에서 셋업하고, 트랜잭션 안에서 `archived`로 전환한 뒤 검증하고
**반드시 `rollback`으로 정리**한다(아래 스크립트가 그 자체로 정리다 — 커밋하지 않는다).

```sql
begin;

-- 1) 스크래치 크루(active) 생성 — AFTER INSERT crews_provision_owner_bootstrap이
--    오너 멤버십을 자동 생성한다(신뢰된 nested 호출, depth>1이라 archived 가드 무관).
insert into public.crews (id, name, description, category, visibility, color_key, owner_id, status)
values ('22222222-2222-2222-2222-222222222222', 'RLS 체크리스트 스크래치', '', 'etc', 'public', 1,
        'fb70ff1c-3736-44ee-a4a3-96993a3c62ed', 'active');

-- 2) 가입 신청자 멤버십(requested) + 가입 신청(pending) — 크루가 아직 active이므로 정상 삽입된다.
insert into public.crew_memberships (crew_id, profile_id, role, status, joined_at)
values ('22222222-2222-2222-2222-222222222222', '30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a', 'member',
        'requested', now());

insert into public.join_requests (id, crew_id, requester_id, message, status, created_at)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
        '30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a', '체크리스트 검증용', 'pending', now());

-- 3) 오너 세션으로 전환 — 이제부터 authenticated 롤 + 실제 오너 JWT claims로 동작한다.
set local role authenticated;
set local request.jwt.claims = '{"sub":"fb70ff1c-3736-44ee-a4a3-96993a3c62ed","role":"authenticated"}';

-- 4) 크루를 archived로 전환 — old.status가 아직 active라 crews_guard_archived_immutable 통과.
update public.crews set status = 'archived' where id = '22222222-2222-2222-2222-222222222222';

-- 5) 핵심 검증 — 오너가 archived 크루의 가입 신청을 승인 시도.
update public.join_requests
  set status = 'approved', decided_by = 'fb70ff1c-3736-44ee-a4a3-96993a3c62ed', decided_at = now()
  where id = '11111111-1111-1111-1111-111111111111';

reset role;

-- 6) 판정 — 둘 다 원래 값(pending/requested)이면 RLS가 0행으로 막은 것이다.
select
  (select status from public.join_requests where id = '11111111-1111-1111-1111-111111111111')
    as join_request_status_after,
  (select status from public.crew_memberships
     where crew_id='22222222-2222-2222-2222-222222222222'
       and profile_id='30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a') as membership_status_after;

rollback;
```

**33일차 실측 결과**: `join_request_status_after = "pending"`, `membership_status_after = "requested"`
— 둘 다 불변, 즉 5번 UPDATE가 **0행**이었다. `rollback` 이후 `select count(*) from public.crews
where id='22222222-2222-2222-2222-222222222222'` = `0`으로 스크래치 흔적이 남지 않았음을 재확인했다.

**판정 기준**: `join_request_status_after`가 `"approved"`로 바뀌어 있으면 **회귀** — 위 §1의 정책
조건이 깨졌거나 `is_crew_active`의 의미가 바뀐 것이다.

---

## 3. `private.is_crew_active` 시그니처·본문 대조

```sql
select pg_get_functiondef('private.is_crew_active'::regproc);
```

**기대 출력** (33일차 배포본):

```sql
CREATE OR REPLACE FUNCTION private.is_crew_active(p_crew_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select status = 'active' from public.crews where id = p_crew_id
$function$
```

**판정 기준**: 인자 이름·타입(`p_crew_id uuid`)과 반환 타입(`boolean`)이 바뀌면 이 함수를 참조하는
모든 RLS 정책(`join_requests_update_requester_or_staff` 포함)의 호출부를 다시 확인해야 한다.
본문이 `status = 'active'`가 아닌 다른 조건으로 바뀌면 "archived만 막는다"는 전제 자체가 깨진다 —
예를 들어 `status <> 'archived'`로 바뀌면 향후 추가될 수 있는 제3의 상태(예: `suspended`)를
활성으로 오판할 수 있다.

---

## 4. 이 체크리스트를 언제 돌리는가 (트리거 조건)

다음 중 **하나라도** 해당하면 §1~§3을 전부 재실행한다:

- `join_requests_update_requester_or_staff` 정책을 다시 `create`/`alter`하는 마이그레이션이 있을 때
- `private.is_crew_active`의 시그니처·본문을 바꾸는 마이그레이션이 있을 때
- `crew_memberships_guard_self_transition`·`join_requests_sync_membership_on_decision`·
  `crew_memberships_guard_self_insert_request` 중 하나라도 수정하는 마이그레이션이 있을 때
  (officer 분기·nested 스킵 조건이 걸려 있는 함수들 — `docs/design/nested-trigger-audit-32/README.md`
  §1 참고)
- `join_requests` 테이블에 새 UPDATE 트리거를 추가할 때(중첩 깊이가 달라질 수 있다)
- 분기별 정기 배포 전 점검(권장, 강제는 아님 — CI가 없으므로 사람이 기억해야 한다는 게 이
  체크리스트의 존재 이유다)

---

## 5. 같은 결함 클래스가 다른 테이블에도 있는가 — 전수 확인

`docs/design/nested-trigger-audit-32/README.md` §1이 이미 `pg_trigger_depth()`를 참조하는 함수를
**전 스키마 5개로 전수 열거**했고, 그중 `crew_memberships_guard_self_transition`(officer 분기를
건너뛰는 함수, I-153의 원인)의 스킵을 유발하는 **신뢰된 nested 호출자는 정확히 3개**임을 같은
문서 §2 표 #2에서 확인했다. 이번 회차는 그 3개 각각에서 "archived 크루 방어가 RLS 한 곳에만
의존하는가"를 다시 확인했다 — 새로 검색하지 않고 기존 전수조사의 완전성 위에 검증만 추가했다.

| # | 호출자(nested UPDATE 유발) | archived 방어 소재 | RLS 단일 의존인가 | 판정 |
| --- | --- | --- | --- | --- |
| 1 | `join_requests_sync_membership_on_decision`(가입 신청 승인) | `join_requests_update_requester_or_staff` RLS(`private.is_crew_active`, USING·WITH CHECK 양쪽) | **예** — officer 분기가 스킵되고 이 정책만 남는다 | **I-153의 대상.** 이 문서 §1·§2가 다룬다 |
| 2 | `invitations_sync_membership_on_response`(초대 수락) | `invitations_guard_response_transition` 트리거 자체(`new.status='accepted' and not private.is_crew_active(new.crew_id)`) — **RLS가 아니라 트리거 단일 지점** | 아니오(RLS 의존은 아님) — 다만 이 트리거도 depth<=1에서만 검사하므로 **트리거 관점에서 단일 지점**은 맞다. `invitations_update_invitee_or_staff` RLS의 `qual`/`with_check`에는 `private.is_crew_active`가 **없다**(직접 조회로 확인) | nested caller가 이 경로에 **현재 없다**(32일차 전수조사 재확인, invitations UPDATE를 유발하는 다른 트리거/RPC/cron 잡 0건) — 즉 "nested가 archived 방어를 건너뛰는" 시나리오 자체가 성립하지 않는다. 다만 **defense-in-depth 비대칭**(join_requests는 RLS+트리거 이중, invitations는 트리거만)은 실재한다 — draft 이슈로 별도 기록(`docs/ISSUES.draft.CORE.md`) |
| 3 | `crews_sync_membership_on_owner_transfer`(오너 이양) | `crews_guard_archived_immutable`(`old.status='archived'`인 행의 **모든** UPDATE를 `pg_trigger_depth` 무관하게 차단) | 아니오 — 이 가드는 nested 스킵 대상이 아니다(별도 트리거, depth 체크 자체가 없음) | **갭 없음.** archived 크루는애초에 오너 이양 UPDATE 자체가 원천 차단된다(실측: `crews_guard_owner_only_fields`·`crews_guard_archived_immutable` 본문 직접 대조로 확인, 재현 생략 — 이미 §2류 시나리오로 트리거 로직이 "old.status='archived'면 무조건 예외"임이 코드로 자명) |

**결론(0건/1건 카운트 근거)**: "RLS 정책 한 곳에만 의존하는 nested-UPDATE 우회" 패턴은 **정확히
1건**(join_requests, 이미 I-153이 지적한 그 건) 뿐이다. 나머지 2개 nested 호출자는 각각 (2) 트리거
단일 지점(현재 도달 불가능한 경로라 우회 시나리오 자체가 없음), (3) depth 무관 무조건 차단(갭
없음)으로 **다른 방어 성격**을 가진다 — 세 경로 모두 "코드를 읽어서" 판단한 게 아니라 각 트리거의
`pg_get_functiondef` 본문을 직접 대조하고, join_requests 건은 실제 `begin`…`rollback` 재현까지
거쳤다.

---

## 6. `invitations` 트리거 단일 방어 — accepted는 막고 declined는 통과시키는가 (34일차, CREW 추가)

I-159(33일차, CORE 발견 — §5 표 #2가 다룬 그 건)는 `invitations_update_invitee_or_staff` RLS에
`private.is_crew_active`가 없어 archived 크루 초대 수락 차단이
`invitations_guard_response_transition` 트리거 단일 지점에만 의존한다고 지적했다. 34일차에
이 트리거를 RLS로 이중화하는 안(나이브·좁은 대안 둘 다)을 실측했고, 팀장이 **둘 다 기각**했다
— 이득(트리거 회귀 방어)이 BEFORE UPDATE 트리거가 WITH CHECK보다 먼저 실행되는 구조상 RLS로는
관측조차 안 되고, 나이브 안은 "거절은 archived에서도 허용" 규칙을 실제로 깨뜨렸다(좁은 대안도
`invitations_status_check`의 `expired` 값을 못 커버하는 구멍이 있었다). 상세 근거는
`docs/DECISIONS.draft.CREW.md`(병합 전) · `docs/ISSUES.md` I-159(해결됨) 참고.

**결론**: DDL 이중화 대신 이 트리거 자체를 회귀 감지 대상에 넣는다 — 트리거가 조용히 무력화되면
(재작성으로 조건이 빠지면) 이 체크리스트가 잡아야 한다.

```sql
select pg_get_functiondef('public.invitations_guard_response_transition'::regproc);
```

**기대 출력** (34일차 DESIGN 재확인 시점):

```sql
CREATE OR REPLACE FUNCTION public.invitations_guard_response_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then
    -- 신뢰된 중첩 호출(향후 시스템 경로) 또는 service_role 컨텍스트 — self-service 제한
    -- 대상이 아니다(reports_guard_self_update_reason_only와 같은 컨벤션).
    return new;
  end if;

  if new.crew_id is distinct from old.crew_id
     or new.invitee_id is distinct from old.invitee_id
     or new.inviter_id is distinct from old.inviter_id
     or new.expires_at is distinct from old.expires_at
     or new.created_at is distinct from old.created_at then
    raise exception 'invitations: this update may only change status (FR-021)';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'pending' then
      raise exception 'invitations: only a pending invitation may be responded to (FR-021)';
    end if;
    if new.status not in ('accepted', 'declined') then
      raise exception 'invitations: a pending invitation may only become accepted or declined (FR-021)';
    end if;
    if auth.uid() is distinct from old.invitee_id then
      raise exception 'invitations: only the invitee may respond to this invitation (FR-021, 행위자 = 초대받은 회원)';
    end if;
    if old.expires_at <= now() then
      raise exception 'invitations: this invitation has expired and can no longer be responded to (FR-021 E1)';
    end if;
    -- 31일차(CREW, archived 크루 쓰기 표면 감사 후속) — 수락(accepted)만 막는다. 거절
    -- (declined)은 archived 크루에서도 허용한다(자기 정리, 무해).
    if new.status = 'accepted' and not private.is_crew_active(new.crew_id) then
      raise exception 'invitations: cannot accept an invitation to an archived crew (FR-013)';
    end if;
  end if;

  return new;
end;
$function$
```

**판정 기준**: 본문에 `new.status = 'accepted' and not private.is_crew_active(new.crew_id)`
(또는 동등한 조건)가 없으면 archived 크루 초대 수락 차단이 사라진 것 — **즉시 회귀**다. 덧붙여
**`new.status not in ('accepted', 'declined')` 조건이 사라지면 `expired` 등 다른 상태로의
전이가 가능해진다는 뜻**이다 — 이 조건도 함께 지켜봐야 한다(아래 "34일차 DESIGN 갱신" 참고).

행동 검증 — **실행 가능한 스크립트로 교체**(34일차 DESIGN, §2와 같은 방식으로 브랜드뉴 스크래치
크루 + invitee 신원 사용). **역할 전환마다 `request.jwt.claims`를 명시적으로 비우는 것이
핵심이다** — `reset role`은 세션 역할만 되돌리고 이전 JWT claims는 그대로 남아, 그 다음
"시스템 컨텍스트" UPDATE(아래 5번)에서도 트리거가 이전 호출자의 `auth.uid()`를 계속 읽어
`old.status <> 'pending'` 오탐 예외를 낼 수 있다(34일차 DESIGN이 이 스크립트를 처음 작성할 때
실제로 이 함정에 걸렸다가 원인을 찾아 고쳤다 — 아래에 그대로 남긴다):

```sql
begin;

-- 1) 스크래치 크루(active) 생성
insert into public.crews (id, name, description, category, visibility, color_key, owner_id, status)
values ('33333333-3333-3333-3333-333333333333', 'I-159 트리거 검증', '', 'etc', 'public', 2,
        '30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a', 'active');

-- 2) invitee에게 pending 초대 발급(크루가 아직 active이므로 정상 삽입)
insert into public.invitations (id, crew_id, invitee_id, inviter_id, status, expires_at)
values ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333',
        'fb70ff1c-3736-44ee-a4a3-96993a3c62ed', '30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a',
        'pending', now() + interval '1 day');

-- 3) 오너 세션으로 크루를 archived로 전환
set local role authenticated;
set local request.jwt.claims = '{"sub":"30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a","role":"authenticated"}';
update public.crews set status = 'archived' where id = '33333333-3333-3333-3333-333333333333';
reset role;
set local request.jwt.claims = '';  -- 함정 회피: 다음 블록이 이전 claims를 물려받지 않게 한다

create temporary table i159chk_log(seq serial, step text, detail jsonb);

-- 4) ① invitee가 declined로 UPDATE 시도 — 성공해야 정상(거절은 archived에서도 허용)
set local role authenticated;
set local request.jwt.claims = '{"sub":"fb70ff1c-3736-44ee-a4a3-96993a3c62ed","role":"authenticated"}';
update public.invitations set status='declined' where id='44444444-4444-4444-4444-444444444444';
reset role;
set local request.jwt.claims = '';

insert into i159chk_log(step, detail) select 'decline_on_archived', jsonb_build_object(
  'status', (select status from public.invitations where id='44444444-4444-4444-4444-444444444444'));

-- 5) ①을 되돌리고(pending으로 — 시스템 컨텍스트, auth.uid() null이라 트리거가 스킵한다),
--    ② invitee가 accepted로 UPDATE 시도 → 트리거가 예외를 던져야 정상
update public.invitations set status='pending' where id='44444444-4444-4444-4444-444444444444';

set local role authenticated;
set local request.jwt.claims = '{"sub":"fb70ff1c-3736-44ee-a4a3-96993a3c62ed","role":"authenticated"}';
do $$
begin
  update public.invitations set status='accepted' where id='44444444-4444-4444-4444-444444444444';
  perform set_config('app.i159chk_accept', jsonb_build_object('outcome','unexpected_success')::text, true);
exception when others then
  perform set_config('app.i159chk_accept', jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm)::text, true);
end $$;
reset role;
set local request.jwt.claims = '';

insert into i159chk_log(step, detail) select 'accept_on_archived', (current_setting('app.i159chk_accept'))::jsonb ||
  jsonb_build_object('status_after', (select status from public.invitations where id='44444444-4444-4444-4444-444444444444'));

select * from i159chk_log order by seq;

rollback;
```

**기대 출력(34일차 DESIGN 실측 그대로)**:

```json
[
  {"seq": 1, "step": "decline_on_archived", "detail": {"status": "declined"}},
  {"seq": 2, "step": "accept_on_archived", "detail": {
    "sqlstate": "P0001",
    "message": "invitations: cannot accept an invitation to an archived crew (FR-013)",
    "status_after": "pending"
  }}
]
```

`rollback` 이후 재확인: `select count(*) from public.crews where id='33333333-3333-3333-3333-333333333333'`
= `0`, `select count(*) from public.invitations where id='44444444-4444-4444-4444-444444444444'` = `0`
— 스크래치 흔적 0건.

**34일차 CREW 실측 결과(기준선, 원문 보존)**: ①은 성공(`status` → `declined`), 트리거 본문은
위 조건을 그대로 갖고 있음을 `pg_get_functiondef`로 확인(전문·픽스처는
`docs/design/invitation-defense-symmetry-34/README.md` STEP A 참고). ~~②(수락이 실제로
예외를 던지는 것)는 이 34일차 실측에서 직접 재현하지는 않았다 — 31일차 마이그레이션 원문과
트리거 정의가 일치함을 정적 대조로 확인한 것에 그친다.~~ **34일차 DESIGN 교차검증이 위 스크립트로
동적 재현해 이 한계를 해소했다** — `P0001`, `"invitations: cannot accept an invitation to an
archived crew (FR-013)"`가 실제로 발생함을 확인(위 "기대 출력" 참고). 취소선 문장은 지우지
않고 이력으로 남긴다.

**34일차 DESIGN 갱신 — 왜 이 §6이 "MINOR가 아니었는가"**: 팀장이 I-159의 RLS 이중화 기각
근거로 정확히 이 §6("이득은 회귀 감지로 막는다")을 들었다 — 그런데 교차검증 시점에 이 절의
"행동 검증" 블록이 주석뿐인 빈 `begin...rollback`이라 **기각한 방어의 대체물이 실행되지
않는 상태**였다. 위 스크립트로 그 공백을 채웠다 — 이제 이 절이 실제로 "다음 사람이 복붙해서
돌리면 회귀를 잡는" 체크리스트 항목의 형태를 갖췄다.

**부수 발견(34일차 DESIGN, I-159 결정문에도 반영 필요) — `expired` 구멍은 이미 트리거로도
막혀 있다**: I-159 처분에서 팀장이 좁은 대안(`OR status = 'declined'`)도 `expired` 값을 못
커버해 기각한 근거로 들었는데, 위 함수 본문의 `if new.status not in ('accepted', 'declined')
then raise exception`이 **애초에 이 트리거 자체가 `expired`로의 전이를 막고 있다는 뜻**이다.
즉 지금 이 구멍이 무해한 이유는 D-073("만료는 조회 필터링, 상태 전이 아님") 하나가 아니라
**이 트리거의 상태 화이트리스트까지 이중**이다 — RLS 이중화가 없어도 방어가 이미 둘이라는
뜻이라, 팀장의 기각 판정을 더 강하게 만드는 사실이다(`docs/design/crew-crosscheck-34/README.md`
"② `expired` 구멍" 절에 이 발견의 실측 근거가 있다 — 트리거를 `alter table ... disable
trigger`로 실제로 꺼서 WITH CHECK만 남긴 뒤 `status='expired'` UPDATE를 시도해 `42501`을
직접 확보했다).

---

## 확인한 것 (33일차, CORE)

- `pg_policies`에서 `join_requests_update_requester_or_staff`의 `qual`·`with_check` 직접 조회(§1)
- `begin`…`set local role authenticated`+JWT claims…`rollback` 트랜잭션으로 스크래치 크루 생성 →
  active 상태에서 pending 가입 신청 셋업 → archived 전환 → 오너 승인 시도 → **0행 확인**(§2)
- `pg_get_functiondef('private.is_crew_active')` 대조(§3)
- `invitations`·`crews` 테이블의 관련 정책·트리거 3종(`invitations_update_invitee_or_staff`
  정책, `invitations_guard_response_transition`, `crews_guard_archived_immutable`,
  `crews_guard_owner_only_fields`) 본문을 `pg_get_functiondef`/`pg_policies`로 직접 대조(§5)
- 롤백 후 스크래치 크루가 남지 않았음을 `select count(*)`로 재확인
