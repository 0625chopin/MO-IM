-- I-112 (MAJOR) — DELETE/TRUNCATE 축 전수조사(24일차, CREW)
-- `invitations_delete_inviter_or_staff`(초대자 본인 또는 그 크루 staff/owner)는 초대의
-- status(pending/accepted/declined/expired)를 전혀 제한하지 않는다. 실측(실 REST 시뮬레이션,
-- 신규 테스트 크루): A(오너)가 B를 초대 → B가 정상 수락(status=accepted) → A가 그 이미
-- 수락된 초대 행을 직접 DELETE → 성공. `invitations` 발급·수락은 audit_logs에 별도로
-- 기록되지 않는다(AuditAction 유니온에 invitation.* 없음) — 즉 이 테이블이 "누가 누구를
-- 초대했는가"의 유일한 기록이며, 이 DELETE 정책은 그 기록을 사후에 지울 수 있게 한다.
-- 앱 코드 전수 조사 결과 `.from("invitations").delete()`를 호출하는 곳이 0건이다 — 정당한
-- 클라이언트 사용처가 없는 죽은 표면이다(D-064 "정리 대상" 판단, 23일차 boards/chat_rooms
-- INSERT 정리와 같은 패턴). requirements.md FR-020 E3(초대 철회)는 join_requests의
-- withdrawn 패턴처럼 상태 전이로 구현돼야 할 것으로 보이나(현재 invitations.status CHECK에
-- withdrawn 값 자체가 없다), 그 구현은 이번 조사 범위 밖이라 별도로 남긴다.
revoke delete on public.invitations from anon, authenticated;
drop policy if exists "invitations_delete_inviter_or_staff" on public.invitations;
