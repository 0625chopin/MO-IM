-- 크루 활동 사진 갤러리 — 크루원이 활동하며 찍은 사진을 올리고 함께 보는 자리(D-111).
-- 저장소는 private Storage 버킷(`crew-photos`)이고, 메타데이터(작성자·설명·소속 모임)는
-- 이 테이블이 갖는다. 버킷을 public으로 두지 않는 이유는 private 크루의 사진이 경로만
-- 알면 누구나 열리는 상태가 되기 때문이다 — 읽기는 항상 서명 URL로 나간다.

-- 1) 버킷. 5MB·이미지 MIME 4종으로 제한한다(업로드 경로의 애플리케이션 검증과 이중).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'crew-photos',
  'crew-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

-- 2) 오브젝트 경로 규약: `{crew_id}/{uuid}.{ext}`. 첫 세그먼트를 crew_id로 읽어 멤버십을
--    판정한다. 잘못된 경로(uuid 형식이 아닌 첫 세그먼트)에서 cast 예외가 나면 정책 평가
--    자체가 실패하므로, 형식을 먼저 확인하고 아니면 null을 준다 — null이면 아래 정책의
--    `is_active_crew_member(null)`이 false가 되어 안전하게 거부된다.
create or replace function private.crew_photo_path_crew_id(p_object_name text)
returns uuid
language sql
immutable
set search_path to ''
as $$
  select case
    when (storage.foldername(p_object_name))[1] ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(p_object_name))[1])::uuid
    else null
  end;
$$;

-- 3) 메타데이터 테이블.
create table if not exists public.crew_photos (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.crews (id) on delete cascade,
  -- 어느 모임에서 찍은 사진인지(선택). 모임이 지워져도 사진은 남는다.
  meetup_id uuid references public.meetups (id) on delete set null,
  uploader_id uuid not null references public.profiles (id) on delete cascade,
  -- 버킷 안 오브젝트 경로. 한 오브젝트가 두 행을 갖지 않도록 UNIQUE.
  storage_path text not null unique,
  caption text,
  created_at timestamptz not null default now(),
  -- 소프트 삭제. posts·comments·chat_messages와 같은 규약이다.
  deleted_at timestamptz,
  constraint crew_photos_caption_length_check
    check (caption is null or char_length(caption) <= 500),
  constraint crew_photos_storage_path_prefix_check
    check (storage_path like (crew_id::text || '/%'))
);

comment on table public.crew_photos is
  '크루 활동 사진 메타데이터. 실제 바이트는 private Storage 버킷 crew-photos에 있고 이 테이블의 storage_path가 그 오브젝트를 가리킨다. 읽기는 서명 URL 전용.';

create index if not exists crew_photos_crew_created_idx
  on public.crew_photos (crew_id, created_at desc)
  where deleted_at is null;

create index if not exists crew_photos_meetup_idx
  on public.crew_photos (meetup_id)
  where deleted_at is null and meetup_id is not null;

alter table public.crew_photos enable row level security;

-- 열람: 활성 크루원만. 해산(archived)된 크루에서도 과거 사진은 열람 전용으로 남는다
-- (FR-013 AC2 "과거 항목은 열람 전용으로 남는다"와 같은 원칙).
create policy crew_photos_select_members
  on public.crew_photos
  for select
  to authenticated
  using (private.is_active_crew_member(crew_id));

-- 업로드: 본인 명의로, 활성 크루원이, 활성 크루에만. archived 크루는 쓰기가 동결된다(D-089).
create policy crew_photos_insert_members
  on public.crew_photos
  for insert
  to authenticated
  with check (
    uploader_id = (select auth.uid())
    and private.is_active_crew_member(crew_id)
    and private.is_crew_active(crew_id)
  );

-- 삭제(소프트)·설명 수정: 올린 본인 또는 임원 이상. posts_update_author_or_staff_delete와
-- 같은 구조다.
create policy crew_photos_update_uploader_or_staff
  on public.crew_photos
  for update
  to authenticated
  using (
    uploader_id = (select auth.uid())
    or private.is_crew_staff_or_owner(crew_id)
  )
  with check (
    uploader_id = (select auth.uid())
    or private.is_crew_staff_or_owner(crew_id)
  );

-- 4) Storage 오브젝트 정책. 위 테이블 정책과 같은 판정을 경로에서 파생한 crew_id로 반복한다 —
--    메타데이터 행이 없어도 바이트에 직접 접근하는 경로가 있으므로 별도로 막아야 한다.
create policy crew_photos_objects_select_members
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'crew-photos'
    and private.is_active_crew_member(private.crew_photo_path_crew_id(name))
  );

create policy crew_photos_objects_insert_members
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'crew-photos'
    and owner_id = (select auth.uid()::text)
    and private.is_active_crew_member(private.crew_photo_path_crew_id(name))
    and private.is_crew_active(private.crew_photo_path_crew_id(name))
  );

create policy crew_photos_objects_delete_uploader_or_staff
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'crew-photos'
    and (
      owner_id = (select auth.uid()::text)
      or private.is_crew_staff_or_owner(private.crew_photo_path_crew_id(name))
    )
  );
