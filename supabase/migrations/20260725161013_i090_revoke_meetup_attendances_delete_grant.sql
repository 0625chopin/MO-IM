-- I-090 위생 정리(DESIGN 21일차 재검증에서 발견) — meetup_attendances의 INSERT·UPDATE
-- 권한은 major_fix_i090_meetup_attendances_capacity_bypass에서 정확히 회수됐는데
-- DELETE 권한은 anon·authenticated에 그대로 남아 있었다. 지금은 무해하다 — DELETE 정책이
-- 아예 없어 RLS 기본 거부로 막힌다(실제 DELETE 시도 0행 확인). 다만 이 잔존 GRANT를 두면
-- 나중에 누군가 DELETE 정책을 새로 추가하는 순간 "권한은 이미 회수됐다"는 잘못된 전제로
-- 조용히 문이 열린다 — 이번 회차에 join_requests·polls에서 "한 겹만 믿었다가 뚫린" 사례가
-- 이미 셋(I-085·I-086·I-089)이라, 지금 회수해 방어선을 하나로 줄이지 않는다.
--
-- respond_meetup_attendance(private/public 둘 다)는 DELETE 문을 쓰지 않는다(소스 확인
-- 완료) — 이 REVOKE로 참석/불참 응답 기능에 영향 없다.

revoke delete on public.meetup_attendances from anon, authenticated;
