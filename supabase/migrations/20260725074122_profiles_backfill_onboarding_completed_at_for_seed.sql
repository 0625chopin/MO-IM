-- Task 032 교차검증(CORE, 18일차) minor 1 수정.
-- mock 픽스처(src/lib/data/mock/seed/generate-profiles.ts)는 시드 프로필을 온보딩 완료
-- (onboardingCompletedAt: "2026-06-01T00:00:00.000Z")로 명시하는데, profiles_add_onboarding_
-- completed_at 마이그레이션은 컬럼만 추가하고 값을 채우지 않아 실 DB 19개 시드 행이 전부
-- null로 남아 픽스처와 어긋났다. 시드 이메일 네임스페이스(seed-N@mo-im.invalid, read-path-
-- realdata-031.md §3.1 조건 1)로 한정해 백필한다 — 실 테스트 계정 2개
-- (chopin0625@gmail.com·0625chopin@gmail.com)는 CLAUDE.md가 "온보딩 미완료"로 문서화하고
-- 있으므로 이 백필 대상에서 명시적으로 제외한다(이메일 네임스페이스가 다르므로 자동으로도
-- 제외되지만, 조건을 명시해 의도를 남긴다).
update public.profiles p
set onboarding_completed_at = '2026-06-01T00:00:00.000Z'::timestamptz
from auth.users u
where u.id = p.id
  and u.email like 'seed-%@mo-im.invalid'
  and p.status != 'withdrawn'
  and p.onboarding_completed_at is null;
