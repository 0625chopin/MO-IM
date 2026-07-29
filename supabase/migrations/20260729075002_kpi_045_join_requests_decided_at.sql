-- NFR-030 KPI-4(가입 신청 후 72시간 내 승인·반려 처리율) 산출용 원천 이벤트.
-- join_requests에는 "언제 처리됐는지"를 나타내는 컬럼이 없었다(decided_by만 있고 시각이 없음) —
-- created_at(신청 시각)은 있지만 처리 시각이 없어 72시간 창을 계산할 수 없었다.
-- 앱 레이어(decide-join-request.ts)가 아니라 트리거가 채운다 — I-071/D-054가 남긴 교훈
-- (같은 사실을 TS·SQL 두 곳에 중복 구현하지 않는다)과 같은 이유: "처리 시각"은 상태 전이의
-- 부수 효과이지 비즈니스 판단이 아니므로, 그 전이가 어느 경로(app/서비스롤/향후 admin 콘솔)로
-- 일어나든 DB가 스스로 보증하는 편이 안전하다.

alter table public.join_requests
  add column decided_at timestamptz null;

comment on column public.join_requests.decided_at is
  'NFR-030 KPI-4 산출용 — pending에서 approved/rejected로 전이한 시각. 트리거
   (join_requests_stamp_decided_at)가 자동으로 채운다. 앱 레이어는 이 컬럼을 쓰지 않는다.';

create or replace function public.join_requests_stamp_decided_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.status = 'pending'
     and new.status in ('approved', 'rejected')
     and new.decided_at is null then
    new.decided_at := now();
  end if;
  return new;
end;
$$;

create trigger join_requests_stamp_decided_at
  before update on public.join_requests
  for each row
  execute function public.join_requests_stamp_decided_at();
