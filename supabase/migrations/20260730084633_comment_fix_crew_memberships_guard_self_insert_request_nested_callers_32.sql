-- 32일차(CORE, 중첩 트리거 pg_trigger_depth 전수조사) — 문서 갭 수정, 로직 무변경.
-- 이 함수의 depth>1 스킵을 유발하는 신뢰된 중첩 호출자를 실제로 재확인(pg_proc.prosrc 전수
-- 검색)한 결과 기존 주석이 언급한 "크루 개설 오너 부트스트랩·초대 프로비저닝" 외에
-- crews_sync_membership_on_owner_transfer(오너 이양, AFTER UPDATE crews)의
-- `insert into crew_memberships (...) on conflict (...) do update`도 같은 경로를 탄다는
-- 것을 확인했다 — 값이 전부 트리거가 하드코딩(role='owner', status='active')하고 대상자는
-- crews_guard_owner_only_fields가 사전에 "이미 활성 멤버"임을 검증하므로 위험은 없지만,
-- 주석 목록이 불완전해 다음 감사자가 오해할 수 있었다. 배포본(pg_get_functiondef)을 그대로
-- 복사하고 주석 한 줄만 갱신한다 — 그 외 한 글자도 바꾸지 않았다.
-- 근거: docs/design/nested-trigger-audit-32/README.md §2-#1, §3.
create or replace function public.crew_memberships_guard_self_insert_request()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_visibility text;
  v_crew_status text;
begin
  if pg_trigger_depth() > 1 then
    -- 신뢰된 중첩 호출(크루 개설 오너 부트스트랩·초대 프로비저닝·오너 이양의 upsert,
    -- 32일차 전수조사로 세 번째 호출자를 재확인 — docs/design/nested-trigger-audit-32/
    -- README.md) — 그대로 통과.
    return new;
  end if;

  -- 여기부터는 RLS crew_memberships_insert_self_request가 허용하는 self-service
  -- 직접 INSERT(가입 신청, FR-022) 경로다 — 이 트리거 자체가 "가입 신청 전용"임을
  -- 명시적으로 강제한다(I-120, 기존에는 RLS with_check에만 암묵 의존했다).
  if new.status <> 'requested' then
    raise exception 'crew_memberships 자기 서비스 INSERT는 status=requested(가입 신청, FR-022)만 허용합니다(I-120)';
  end if;

  if new.role <> 'member' then
    raise exception 'crew_memberships 자기 가입 신청 INSERT는 role=member만 허용합니다(FR-022, D-002)';
  end if;

  select visibility, status into v_visibility, v_crew_status
  from public.crews
  where id = new.crew_id;

  if v_visibility is null then
    raise exception 'crew_id %를 찾을 수 없습니다', new.crew_id;
  end if;

  if v_visibility <> 'public' or v_crew_status <> 'active' then
    raise exception 'crew_memberships 자기 가입 신청 INSERT는 공개(public)·활성(active) 크루에만 허용됩니다(FR-022 사전조건·E1, D-017)';
  end if;

  return new;
end;
$function$;
