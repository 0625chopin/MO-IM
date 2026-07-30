-- 31일차(CREW, CORE 실측 발견 — archived 크루 쓰기 표면 감사 후속) — 초대 수락으로
-- archived 크루에 새 active 멤버가 생기는 결함. 원인 3중:
-- ① invitations_update_invitee_or_staff RLS가 crew.status를 검사하지 않는다.
-- ② invitations_guard_response_transition(BEFORE UPDATE)도 pending·만료·행위자만 보고
--    크루 상태는 안 본다.
-- ③ invitations_sync_membership_on_response(AFTER UPDATE)가 수락 시 crew_memberships를
--    직접 UPDATE하는데, 이건 crew_memberships_guard_self_transition 입장에서 중첩 호출
--    (pg_trigger_depth()>1)이라 그 함수 전체(31일차에 추가한 archived 가드 포함)를
--    건너뛴다 — crew_memberships_guard_self_transition은 건드리지 않는다(팀장 지시,
--    중첩 호출 스킵은 의도된 설계이고 잘못 건드리면 정상 크루의 초대 수락까지 막을
--    위험이 있다).
--
-- 고친 지점: ②(invitations_guard_response_transition)에 "accepted로 가는 전이만" 크루
-- active 여부를 검사하는 조건을 추가한다 — decline은 archived 크루에서도 그대로 허용한다
-- (죽은 크루의 초대를 스스로 정리하는 self-service라 무해하다는 것이 이번 회차의 반복된
-- 판단이다, leave-crew·withdraw-join-request와 같은 원칙). RLS(①)가 아니라 트리거(②)를
-- 고친 이유: RLS는 "이 행을 만질 수 있는가"라는 굵은 판정만 표현하고, "accepted만 막고
-- declined는 허용"처럼 값에 따라 갈리는 세밀한 업무 규칙은 이 프로젝트 관례상(예:
-- crew_memberships_guard_self_transition 자신의 주석) 트리거가 맡는다 — 이 트리거는 이미
-- pending·만료·행위자 같은 같은 종류의 세밀한 규칙을 갖고 있어 자연스러운 자리다.
--
-- private.is_crew_active는 posts·comments·invitations INSERT 정책·crew_memberships officer
-- 가드(31일차 마이그레이션 20260730071304)·join_requests 결정 가드(20260730071317)가 이미
-- 쓰는 함수를 그대로 재사용한다 — 새 함수·새 패턴 없음. 함수의 나머지 로직은
-- pg_get_functiondef로 배포본을 그대로 복사해 한 글자도 바꾸지 않았다.
create or replace function public.invitations_guard_response_transition()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;
