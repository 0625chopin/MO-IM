-- I-113 (MAJOR) — I-080(BOARD, 21일차 발견) 실증·수정. `comments_insert_members` RLS의
-- with_check는 author_id·크루 소속·크루 활성 여부만 검사하고 parent_id의 깊이는 전혀 보지
-- 않는다 — 실측(begin…rollback, 24일차): depth1 답글에 다시 답글(depth2)을 직접 INSERT하면
-- 성공한다(예외 없음, 신규 행 1건 생성 확인). FR-033 "범위 판단"이 확정한 depth-1 제한을
-- 앱 레이어(`canReplyToComment`)만 지키고 DB는 강제하지 않았다 — I-091 계열과 같은 모양
-- (앱은 막고 DB는 안 막음)이지만 대상이 self-service 컬럼값이 아니라 트리 구조 자체다.
--
-- CHECK 제약으로는 자기참조 깊이를 표현할 수 없어(I-080이 이미 지적) BEFORE INSERT 트리거로
-- 막는다: 새 댓글의 parent_id가 가리키는 부모 댓글 자신이 이미 답글(parent_id not null)이면
-- 거부한다. I-102/I-085 등 이번 회차 전반의 관례대로 SECURITY DEFINER로 만들어 호출자의
-- comments SELECT 가시성에 우연히 기대지 않게 한다(I-092/D-055 원칙).
create or replace function public.comments_guard_reply_depth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_parent_id uuid;
begin
  if new.parent_id is not null then
    select parent_id into v_parent_parent_id
    from public.comments
    where id = new.parent_id;

    if v_parent_parent_id is not null then
      raise exception 'comments: replies are limited to depth 1 (FR-033 범위 판단) — cannot reply to a reply';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_comments_guard_reply_depth
  before insert on public.comments
  for each row execute function public.comments_guard_reply_depth();

-- 트리거 전용 함수의 client EXECUTE 회수(I-054/029A §3 관례, 이번 회차에도 반복 적용).
revoke all on function public.comments_guard_reply_depth() from public, anon, authenticated;
