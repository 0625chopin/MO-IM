# RLS 단일 의존 회귀 안전망 — 수동 체크리스트 (I-153 처분, 33일차, CORE)

I-153은 `join_requests` 승인의 archived-크루 차단이 **`join_requests_update_requester_or_staff`
RLS 정책 한 곳에만** 의존한다고 지적했다(nested UPDATE가 `crew_memberships_guard_self_transition`의
officer 분기를 `pg_trigger_depth() > 1`로 건너뛰기 때문). 팀장 결정: 후속 후보 (a) 채택 — CI가
아직 없으므로(R-002) 자동 테스트 대신 **복붙해서 그대로 돌릴 수 있는 SQL 체크리스트**로 회귀
안전망을 만든다. (b)(officer 분기 재설계)는 기각 — 근거는 `docs/DECISIONS.draft.CORE.md` 참고.

이 문서의 각 SQL은 Supabase MCP `execute_sql`(또는 동등한 `psql`)로 그대로 실행 가능하다.

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

## 확인한 것 (33일차, CORE)

- `pg_policies`에서 `join_requests_update_requester_or_staff`의 `qual`·`with_check` 직접 조회(§1)
- `begin`…`set local role authenticated`+JWT claims…`rollback` 트랜잭션으로 스크래치 크루 생성 →
  active 상태에서 pending 가입 신청 셋업 → archived 전환 → 오너 승인 시도 → **0행 확인**(§2)
- `pg_get_functiondef('private.is_crew_active')` 대조(§3)
- `invitations`·`crews` 테이블의 관련 정책·트리거 3종(`invitations_update_invitee_or_staff`
  정책, `invitations_guard_response_transition`, `crews_guard_archived_immutable`,
  `crews_guard_owner_only_fields`) 본문을 `pg_get_functiondef`/`pg_policies`로 직접 대조(§5)
- 롤백 후 스크래치 크루가 남지 않았음을 `select count(*)`로 재확인
