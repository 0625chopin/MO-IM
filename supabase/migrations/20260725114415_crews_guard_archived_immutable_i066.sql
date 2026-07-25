-- I-066 잔여분 해소(20일차 CORE) — "크루 정보 수정" 차단(19일차 각주가 CREW/CORE로 이월한
-- 유일한 남은 항목). status='archived'인 크루는 이후 어떤 UPDATE도 거부한다 — 오너가
-- 시도해도 막힌다("DB 정책 수준" 요구, 앱 레이어에만 규칙이 있고 DB에는 없던 것이 18일차에
-- 반복해서 드러난 구조적 문제).
--
-- crews_update_staff_or_owner(RLS)만으로는 부족한 이유: 그 정책은 "누가"(역할) 고칠 수
-- 있는지만 표현하고 "크루 자체가 archived인가"는 보지 않는다. 오너·임원의
-- crew_memberships.status는 해산으로 바뀌지 않으므로(19일차 실측, crew-lifecycle-040.md)
-- RLS USING 절은 archived crew에서도 그대로 통과한다.
--
-- RLS 정책 수정 대신 트리거로 막는 이유: private.disband_crew(SECURITY DEFINER, 029B 2단
-- 구조)가 status를 active→archived로 바꾸는 그 UPDATE 자체는 함수 소유자 권한으로 실행돼
-- RLS를 우회한다 — RLS USING 절에 조건을 추가해도 그 경로는 원래도 걸리지 않는다. 반대로
-- 트리거는 실행 경로(SECURITY DEFINER 여부·service-role 클라이언트 여부)와 무관하게 테이블에
-- 대한 모든 UPDATE에 무조건 발동한다 — "DB 정책 수준" 요구를 더 강하게 만족한다.
--
-- 해산 전이(활성→archived) 자체는 걸리지 않는다: 이 트리거는 old.status를 보므로, 그 전이
-- 시점엔 old.status='active'라 조건에 해당하지 않는다. private.disband_crew도 호출 전에
-- status<>'active'면 이미 자체 가드('already_disbanded')로 조기 반환하므로, 이미 archived인
-- 크루에 대해 이 함수가 crews UPDATE 문 자체를 실행할 일이 없다(트리거 도달 불가, 안전).
--
-- 범위: crews_guard_owner_only_fields(어떤 컬럼을 누가 바꿀 수 있는가)와 별개의 새 트리거로
-- 둔다 — 그 트리거를 확장하는 대신 새로 만든 이유는 "크루 생애주기가 이미 끝났는가"라는
-- 독립된 축이라 관심사를 분리하는 편이 이후 읽기 쉽고, CREW가 같은 회차에 disband_crew를
-- 재구성 중이던 파일(있었다면)과 충돌 표면을 줄이기 위해서다.
create or replace function public.crews_guard_archived_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'archived' then
    raise exception 'archived crews cannot be modified (FR-013, I-066)';
  end if;
  return new;
end;
$$;

comment on function public.crews_guard_archived_immutable() is
  'I-066 잔여분(20일차) — status=archived인 크루는 이후 어떤 UPDATE도 거부한다. 소유·역할과
   무관 — crews_guard_owner_only_fields(어떤 컬럼을 누가 바꿀 수 있는가)와 별개로 "크루
   생애주기가 이미 끝났는가"만 본다. private.disband_crew(SECURITY DEFINER)의 active→archived
   전이 자체는 old.status=''active''라 걸리지 않는다.';

create trigger trg_crews_guard_archived_immutable
  before update on public.crews
  for each row
  execute function public.crews_guard_archived_immutable();
