-- I-120 (MINOR): crew_memberships_guard_self_insert_request가 new.status를 확인하지
-- 않아, "가입 신청(FR-022) 전용"이라는 전제가 RLS 정책(crew_memberships_insert_self_request
-- 의 with_check: profile_id=auth.uid() AND status='requested')에만 암묵적으로 의존하고
-- 있었다. 트리거 자체에 명시적 검사를 추가해 두 레이어가 같은 불변식을 각자 독립적으로
-- 강제하게 한다 — RLS가 먼저 바뀌거나 다른 self-service INSERT 정책이 새로 생겨도 이
-- 트리거가 "가입 신청 상태 전이만 본다"는 전제를 스스로 지킨다.
--
-- pg_trigger_depth() > 1(신뢰된 중첩 호출 — 크루 개설 오너 부트스트랩·초대 프로비저닝)
-- 분기는 그대로 둔다 — 그 경로들은 status='active'/'invited'로 합법적으로 INSERT하므로
-- 이 검사 대상이 아니다.
create or replace function public.crew_memberships_guard_self_insert_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_visibility text;
  v_crew_status text;
begin
  if pg_trigger_depth() > 1 then
    -- 신뢰된 중첩 호출(크루 개설 오너 부트스트랩·초대 프로비저닝) — 그대로 통과.
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
$$;

comment on function public.crew_memberships_guard_self_insert_request() is
  'I-102 — crew_memberships_insert_self_request RLS가 role·크루 공개여부/활성여부를 검사하지 않아 (1) 가입 승인 한 번으로 role=owner 격상 (2) private/archived 크루 직접 가입 신청이 가능했다. BEFORE INSERT로 FR-022·D-002·D-017 불변식을 강제한다. I-120(25일차) — new.status<>requested 명시 검사 추가, RLS with_check 암묵 의존을 트리거 레벨 명시 검사로 승격.';
