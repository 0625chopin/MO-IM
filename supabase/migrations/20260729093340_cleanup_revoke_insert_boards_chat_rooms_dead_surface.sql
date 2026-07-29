-- 부수 정리(D-065, CRITICAL 아님 — 방어선 강화): boards_insert_owner·chat_rooms_insert_owner
-- RLS는 crew_id가 자기 소유 크루인지만 검사한다. 두 테이블 모두 crew_id에 UNIQUE
-- 제약이 있어("Board/ChatRoom은 Crew와 1:1") 실제 불변식 위반은 구조적으로 불가능하지만
-- (실측: 두 테이블 다 crew_id unique 확인), grep 결과 이 정책을 쓰는 클라이언트 코드가
-- 0건이다 — 정당한 생성 경로는 trg_crews_provision_owner_bootstrap(SECURITY DEFINER,
-- crews AFTER INSERT의 부수효과) 하나뿐이고, 그 함수의 EXECUTE는 이미
-- 20260725005356_rls_revoke_execute_on_membership_sync_triggers에서 회수돼 트리거로만
-- 호출된다. D-064 원칙("정당 경로가 전부 SECURITY DEFINER면 REVOKE가 우선")대로,
-- 쓰이지 않는 client INSERT 표면을 미리 없앤다 — I-101이 겪은 것과 같은 패턴
-- ("지금은 무해하지만 나중에 정책이 바뀌면 조용히 열린다")을 선제 차단한다.
revoke insert on public.boards from anon, authenticated;
revoke insert on public.chat_rooms from anon, authenticated;

drop policy if exists "boards_insert_owner" on public.boards;
drop policy if exists "chat_rooms_insert_owner" on public.chat_rooms;
