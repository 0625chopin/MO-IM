# `invitations` RLS 이중화 실측 — I-159 처분 근거 (34일차, CREW)

33일차 I-153 조사(CORE)의 부산물로 등재된 I-159는 `invitations_update_invitee_or_staff` RLS가
`private.is_crew_active(crew_id)`를 (join_requests와 달리) USING·WITH CHECK 어디에도 갖고 있지
않다고 지적하면서, 후속 후보로 join_requests와 같은 패턴(양쪽에 그대로 추가)을 제시했다. 동시에
자체 경고를 남겼다: **"RLS는 status로 조건 분기를 할 수 없으므로, 이중화하면 '거절(declined)은
archived 크루에서도 허용한다'는 기존 규칙까지 막을 위험이 있다."**

이 문서는 그 위험이 **실재하는지를 추론이 아니라 실측으로 확정**한 기록이다(팀장 배정).
결론부터: **위험은 실재한다** — 나이브 이중화(join_requests와 완전히 같은 패턴)는 archived 크루의
초대 거절을 막는다. 다만 **WITH CHECK 한 곳에만, `status = 'declined'` 예외를 넣는 좁은 이중화**는
거절을 막지 않으면서 수락만 막는 것도 함께 실측으로 확인했다. 처분 결정(정본)은
`docs/prioritization-and-risks.md` 6.3절(팀장 승인 후 번호 부여)과 `docs/DECISIONS.draft.CREW.md`에
있다 — 이 문서는 그 결정이 딛고 선 실측 근거만 보관한다.

## 방법

전부 `begin ... rollback` 안에서, **서비스롤이 아니라** `set local role authenticated` +
`select set_config('request.jwt.claims', ...)`로 실제 invitee(`0625chopin@gmail.com`,
`fb70ff1c-3736-44ee-a4a3-96993a3c62ed`)의 신원을 흉내내 RLS를 그대로 통과시켰다(32일차 교훈 2 —
서비스롤 검증은 RLS를 우회해 결함을 구조적으로 못 잡는다). 픽스처는 브랜드뉴 UUID로 만든
합성 크루·초대뿐이라 기존 데이터 오염 경로가 원천적으로 없지만, 그래도 **실측 직전에 별도
질의로 사전 상태를 증명**했다(32일차 교훈 3). 사전 상태 질의에서 `invitee_membership_rows = 1`이
나와 한 차례 멈춰 원인을 추적했다 — `trg_invitations_provision_membership`(AFTER INSERT)이
초대 생성 시 `crew_memberships`에 `role='member', status='invited'` 행을 자동 프로비저닝하는
정상 동작이었다(`pg_get_functiondef`로 직접 확인). `staff/owner` 분기가 요구하는
`status='active'`도 `role in (staff,owner)`도 아니므로 이후 판정에 개입하지 않는다 — 가짜 양성이
아님을 확인하고 계속했다.

## STEP A — 현재 상태: 트리거 단일 방어가 거절을 막지 않는가

```sql
begin;
create temporary table i159_log (seq serial, step text, detail jsonb);

insert into public.crews (id, name, description, category, visibility, color_key, owner_id, status)
values ('8f89798b-961a-4b5a-aea0-5de9d25f6383', 'I-159 실측 archived 크루', '', '취미', 'private', 3,
        '30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a', 'archived');

insert into public.invitations (id, crew_id, invitee_id, inviter_id, status, expires_at)
values ('75ef8bf8-783a-4aaa-991f-532bd40791d6', '8f89798b-961a-4b5a-aea0-5de9d25f6383',
        'fb70ff1c-3736-44ee-a4a3-96993a3c62ed', '30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a',
        'pending', now() + interval '1 day');

-- 사전 상태 증명 (별도 질의)
insert into i159_log(step, detail) select 'pre_state', jsonb_build_object(
  'invitee_membership_rows', (select count(*) from public.crew_memberships
     where crew_id='8f89798b-961a-4b5a-aea0-5de9d25f6383' and profile_id='fb70ff1c-3736-44ee-a4a3-96993a3c62ed'),
  'invitee_profile_status', (select status from public.profiles where id='fb70ff1c-3736-44ee-a4a3-96993a3c62ed'),
  'crew_status', (select status from public.crews where id='8f89798b-961a-4b5a-aea0-5de9d25f6383'),
  'invitation_status', (select status from public.invitations where id='75ef8bf8-783a-4aaa-991f-532bd40791d6'));

select set_config('request.jwt.claims', json_build_object('sub','fb70ff1c-3736-44ee-a4a3-96993a3c62ed','role','authenticated')::text, true);
set local role authenticated;
update public.invitations set status='declined' where id='75ef8bf8-783a-4aaa-991f-532bd40791d6';
reset role;
select set_config('request.jwt.claims', '', true);

insert into i159_log(step, detail) select 'step_A_baseline_decline_on_archived_current_rls',
  jsonb_build_object('status_after_update', (select status from public.invitations where id='75ef8bf8-783a-4aaa-991f-532bd40791d6'));
-- (B로 계속, 아래 전체 스크립트는 커밋 로그 참고 — 여기선 요약만)
rollback;
```

**결과(실측)**:

| step | 값 |
| --- | --- |
| `pre_state` | `invitee_membership_rows=1`(설명됨, 위 방법 절), `invitee_profile_status="active"`, `crew_status="archived"`, `invitation_status="pending"` |
| `step_A_baseline_decline_on_archived_current_rls` | `status_after_update="declined"` — **현재는 성공한다.** |

## STEP B — 나이브 이중화(join_requests와 동일 패턴): 거절이 실제로 막히는가

같은 트랜잭션 안에서 상태를 `pending`으로 되돌린 뒤, `invitations_update_invitee_or_staff`의
USING·WITH CHECK 양쪽에 `private.is_crew_active(crew_id)`를 join_requests와 완전히 같은 형태로
추가하고(`alter policy`), 같은 invitee로 같은 archived 크루 초대를 다시 거절 시도했다.

**결과**: `status_after_update="pending"` — **업데이트가 조용히 0행 처리됐다(에러 없이, USING이
행 자체를 필터링).** 경고가 예측한 대로 **거절이 막혔다** — 위험이 실재함을 실측으로 확정한다.

## STEP C — 좁은 대안: WITH CHECK 한 곳에만 `status = 'declined'` 예외를 넣으면?

USING은 원본 그대로 두고, WITH CHECK에만
`private.is_crew_active(crew_id) OR status = 'declined'`를 추가하는 별도 트랜잭션으로 재검증했다
(WITH CHECK의 비한정 컬럼 참조는 UPDATE의 **새 행** 값을 가리킨다 — PostgreSQL RLS 표준 동작).

1. **표현식 자체의 단위 검증** (별도 SELECT, 실제 UPDATE 없이 순수 평가):
   - `is_crew_active(archived 크루) OR 'accepted' = 'declined'` → `false` (수락은 막힘)
   - `is_crew_active(archived 크루) OR 'declined' = 'declined'` → `true` (거절은 통과)
2. **실제 UPDATE 재확인**: 같은 invitee가 같은 archived 크루 초대를 거절 → `status_after_update="declined"`
   — **성공.** 나이브 안과 달리 거절이 막히지 않는다.
3. 트랜잭션 종료 후 `rollback`으로 정리 — `select`로 잔존 크루·초대·정책 원상복구를 재확인했다
   (`leftover_crews=0`, `leftover_invitations=0`, `qual`이 원본 문자열과 일치).

**한계(정직하게 남긴다)**: 이 좁은 안이 `pg_trigger_depth() > 1`인 nested 우회 경로(I-159가 우려한
"향후 시나리오")에서도 실제로 막아 주는지는 nested 호출을 인위적으로 만들어 검증하지 않았다 —
BEFORE UPDATE 트리거가 WITH CHECK보다 먼저 실행되므로, 현재 트리거가 살아있는 한 이 케이스를
실제 UPDATE로 관측할 수 없다(트리거가 먼저 예외를 던진다). 표현식 단위 검증(위 1)만으로 논리적
정확성을 확인했고, 트리거가 우회되는 실제 시나리오가 생기기 전까지는 이 이상의 실측이
불가능하다.

## 처분

- **나이브 이중화(join_requests와 동일 패턴)는 기각한다** — "거절은 archived에서도 허용" 규칙을
  실제로 깨뜨림을 확인했다(STEP B).
- **좁은 대안(WITH CHECK 전용, `status='declined'` 예외)은 제안으로 남긴다** — 착수 여부·적용은
  팀장 승인 후. 실제 DDL은 이번 회차에 적용하지 않았다(모든 `alter policy`는 트랜잭션
  안에서만 존재했고 `rollback`으로 원복했다 — 위 마지막 확인 쿼리 참고).
- DDL을 적용하기로 결정되면 로컬 마이그레이션 파일을 만들고, 파일명 version은 원격
  `supabase_migrations.schema_migrations`에서 실제 값을 읽어 쓴다(I-051).

상세 결정문은 `docs/DECISIONS.draft.CREW.md` 참고.

## 34일차 재점검 — `reset role`이 `request.jwt.claims`를 지우지 않는 함정 (팀장 지시로 확인)

DESIGN이 같은 회차 다른 작업에서 **`reset role` 후에도 `request.jwt.claims`가 지워지지 않아
다음 페르소나가 이전 호출자의 `auth.uid()`를 그대로 물려받는** 함정을 실제로 밟았다(엉뚱한
예외 발생으로 발견). 팀장 지시로 이 문서의 스크립트를 다시 열어 같은 함정이 있는지 확인했다.

**결론: 오염 없음, 결론 불변.** 위 STEP A·B·C 스크립트 전부를 다시 읽었다:

- 매 `reset role;` 직후 `select set_config('request.jwt.claims', '', true);`를 **명시적으로**
  호출해 뒀다(위 §"방법" 인용 SQL 참고) — `reset role`이 claims를 지워 준다고 가정한 곳이
  없다. 다음 인증 블록 진입 전에는 항상 `select set_config('request.jwt.claims',
  json_build_object(...)::text, true)`로 **새 값을 명시적으로 덮어썼다** — 이전 값이 남아
  있었어도 그 값으로 대체됐으므로 영향이 없다.
- 더 근본적으로, 이 문서의 모든 시나리오(STEP A·B·C)는 **처음부터 끝까지 단일 신원**
  (invitee `fb70ff1c-...`)만 시뮬레이션한다 — 서로 다른 두 신원을 같은 트랜잭션 안에서
  갈아탄 지점이 아예 없다. 설령 claims가 안 지워졌다 해도 "이전 신원 ≠ 이후 신원"이라는
  조건 자체가 성립하지 않아 이 함정이 발동할 여지가 없다(DESIGN이 밟은 함정은 트랜잭션 안에서
  서로 다른 두 사람 역할을 오갈 때만 발현한다).
- **부수적으로 확인한 것**: 이번 점검 중 별도 세션 격리 실측도 했다 — `set local role
  authenticated` + `request.jwt.claims`를 설정한 실행과, 그 값을 전혀 건드리지 않은 **별도의**
  `execute_sql` 호출을 이어서 실행한 결과 `current_user`가 기본 role로, `request.jwt.claims`가
  `null`로 각각 돌아와 있음을 확인했다(도구 호출 간에는 세션이 격리된다 — `commit`/`rollback`을
  명시하지 않아도 호출 경계에서 정리된다). 오늘 실측한 다른 SQL(교차검증 항목 1·3·4·5·6)도
  전부 인증 블록마다 `set_config`를 새로 호출하는 같은 패턴이라 이 함정의 영향을 받지 않는다.
