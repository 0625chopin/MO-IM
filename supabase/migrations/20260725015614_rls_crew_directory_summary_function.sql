-- 작성: CORE (Task 029B)
-- 029A §8.3·§8.4/§10 인계: (1) anon은 crew_memberships에 정책이 전혀 없어 count(*)가 항상
-- 0으로 나와 게스트용 "멤버 수" 집계가 안 됐다. (2) private 크루를 비소속 회원에게 "행 전체
-- 비노출"로 과보호했는데, D-007은 "URL을 직접 알아도 크루명과 '초대 전용' 안내까지는 보인다"
-- 는 부분 노출을 요구한다. 둘 다 일반 RLS(행 단위 전부-공개/전부-비공개)로 표현 불가능해
-- column-level 노출 전용 함수가 필요하다.
--
-- 참고: 후속 마이그레이션(rls_move_definer_logic_to_private_wrappers)에서 private.
-- crew_directory_summary(실제 SECURITY DEFINER 구현) + public.crew_directory_summary
-- (SECURITY INVOKER 얇은 래퍼) 2단 구조로 재구성된다. 최종 정의는 그 파일을 참고할 것.
create or replace function public.crew_directory_summary(p_crew_id uuid)
returns table (
  id uuid,
  name text,
  visibility text,
  category text,
  description text,
  member_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_visibility text;
  v_status text;
begin
  select c.visibility, c.status into v_visibility, v_status
  from public.crews c
  where c.id = p_crew_id;

  if v_visibility is null or v_status <> 'active' then
    return; -- 존재하지 않거나 해산된 크루 — 행 0건(404류 처리는 앱 몫)
  end if;

  if v_visibility = 'public' then
    return query
    select c.id, c.name, c.visibility, c.category, c.description,
           (select count(*)::integer from public.crew_memberships cm
              where cm.crew_id = c.id and cm.status = 'active')
    from public.crews c
    where c.id = p_crew_id;
  else
    -- private: D-007 "크루명 + 초대 전용 안내"만. description·category·member_count는 비노출.
    return query
    select c.id, c.name, c.visibility, null::text, null::text, null::integer
    from public.crews c
    where c.id = p_crew_id;
  end if;
end;
$function$;

-- 게스트(anon)도 호출해야 하는 유일한 신규 함수 — D-007이 비로그인 방문자의 열람을 요구한다.
revoke all on function public.crew_directory_summary(uuid) from public, anon, authenticated;
grant execute on function public.crew_directory_summary(uuid) to anon, authenticated;
