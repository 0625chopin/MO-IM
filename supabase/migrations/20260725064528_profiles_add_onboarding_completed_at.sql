-- I-046: profiles에 온보딩 완료 여부를 담을 컬럼이 없어 보조 쿠키로 근사하던 것을 실제 컬럼으로 대체한다.
-- FR-004(온보딩), Task 032 인계 사항. null이면 미완료, 값이 있으면 그 시각에 완료.
alter table public.profiles
  add column onboarding_completed_at timestamptz null;

comment on column public.profiles.onboarding_completed_at is
  'FR-004 온보딩 완료 시각. null=미완료. I-046 해소(Task 032) — 이전에는 보조 httpOnly 쿠키로 근사했다.';
