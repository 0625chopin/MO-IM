-- Task 039: 회원 탈퇴(FR-005)의 30일 유예 상태를 스키마에 반영한다.
-- 참조: D-010(개인정보 파기·콘텐츠 익명 보존), NFR-031(30일 유예 파기), docs/decisions/account-lifecycle-039.md
--
-- 029A가 만든 profiles.status는 ('active','suspended','withdrawn') 3값이었고, 자기 자신에
-- 대한 self-service 전이는 트리거로 active->withdrawn 1건만 허용했다. 그런데 FR-005 정상
-- 흐름은 "④ deactivated 전이 + 30일 유예 → ⑤ 유예 후 개인정보 파기" 2단계다 — 유예 중(복구
-- 가능, PII 원본 유지)과 파기 완료(복구 불가, PII 파기 완료)는 서로 다른 상태라 값 하나로는
-- AC3("30일 미경과 시 동일 이메일로 복구")를 표현할 수 없다. 그래서 새 값 'deactivated'를
-- 추가해 "유예 중"을 표현하고, 'withdrawn'은 "유예가 끝나 파기까지 완료된 최종 상태"로
-- 재정의한다(029A 당시 mock 픽스처가 이미 withdrawn=즉시 익명화 완료로 가정했던 것과 합치).
--
-- 기존 파일(20260725003849_rls_profile_and_auth_policies.sql)은 032의 관례대로 건드리지
-- 않고, CHECK 제약과 트리거 함수 둘 다 새 마이그레이션에서 확장한다.

alter table public.profiles
  drop constraint profiles_status_check,
  add constraint profiles_status_check
    check (status in ('active', 'suspended', 'withdrawn', 'deactivated'));

-- 유예 시작 시각(= 탈퇴 요청 시각). anonymized_at과 의도적으로 분리한다 — anonymized_at은
-- "실제로 PII를 파기한 시각"만 기록해야 AC4("anonymizedAt이 기록되어 있다")가 파기 완료를
-- 그대로 증언한다. 30일 경과 판정은 이 컬럼(deactivated_at) 기준이다.
alter table public.profiles
  add column deactivated_at timestamptz;

comment on column public.profiles.deactivated_at is
  'FR-005 탈퇴 요청(deactivated 전이) 시각. NFR-031의 30일 유예 판정 기준 — anonymize_expired_deactivated_profiles()가 이 값 + 30일을 넘긴 행만 파기한다. 파기 후에도 감사 목적으로 값을 지우지 않는다.';

-- self-service 상태 전이 확장: active->deactivated(탈퇴 요청) 신규 허용,
-- deactivated->active(복구, AC3)는 30일 이내에만 허용. active->withdrawn(029A 원안)은
-- 더 이상 self-service 경로가 아니므로 제거한다 — withdrawn은 이제 anonymize_expired_
-- deactivated_profiles()(postgres role, auth.uid() 없음 -> 이 트리거의 auth.uid()=old.id
-- 조건 자체가 성립하지 않아 애초에 이 가드 대상이 아니다)만 도달하는 시스템 전용 종착 상태다.
create or replace function public.profiles_guard_self_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() = old.id and new.status is distinct from old.status then
    if old.status = 'active' and new.status = 'deactivated' then
      return new;
    end if;
    if old.status = 'deactivated' and new.status = 'active'
       and old.deactivated_at is not null
       and now() - old.deactivated_at <= interval '30 days' then
      return new;
    end if;
    raise exception 'self profile updates may only transition active<->deactivated within the 30-day grace window (FR-005)';
  end if;
  return new;
end;
$$;

comment on function public.profiles_guard_self_status_transition() is
  'Task 039 — 본인 프로필 상태 전이를 active<->deactivated(30일 유예 이내)로 제한한다. withdrawn 전이는 시스템 전용(anonymize_expired_deactivated_profiles)이라 auth.uid()=old.id 조건 밖이다. 관리자 제재 경로도 마찬가지로 대상 밖(029A 원안 그대로).';
