-- D-083 확정값을 DB CHECK 제약으로 승격 (29일차, CREW)
-- 앱 레이어 정의(단일 소스):
--   src/lib/rules/handle-validation.ts       HANDLE_MIN_LENGTH=3, HANDLE_MAX_LENGTH=20, HANDLE_PATTERN=/^[a-z][a-z0-9_]*$/
--   src/lib/rules/bio-validation.ts          BIO_MAX_LENGTH=150
--   src/lib/rules/crew-name-validation.ts    CREW_NAME_MAX_LENGTH=30
--   src/lib/rules/crew-description-validation.ts  CREW_DESCRIPTION_MAX_LENGTH=300
-- 선행조건(38자 archived 테스트 크루 c4283f8a-... 캐스케이드 삭제)은 같은 세션에서 이 마이그레이션
-- 직전에 완료했다(문서: docs/decisions/product-value-check-constraints-29.md).
-- 길이 비교는 앱 레이어가 .trim() 후 length를 재는 것과 대조하기 위해 btrim()을 쓴다
-- (handle은 정규식이 공백을 애초에 허용하지 않으므로 btrim 불필요).

alter table public.profiles
  add constraint profiles_handle_check
  check (
    char_length(handle) >= 3
    and char_length(handle) <= 20
    and handle ~ '^[a-z][a-z0-9_]*$'
  );

alter table public.profiles
  add constraint profiles_bio_check
  check (
    bio is null or char_length(btrim(bio)) <= 150
  );

alter table public.crews
  add constraint crews_name_check
  check (
    char_length(btrim(name)) <= 30
  );

alter table public.crews
  add constraint crews_description_check
  check (
    char_length(btrim(description)) <= 300
  );
