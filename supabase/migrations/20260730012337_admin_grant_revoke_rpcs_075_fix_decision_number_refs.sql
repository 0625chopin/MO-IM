-- 27일차 후속(같은 회차) — CORE가 이 마이그레이션 작성 시 다음 결정 번호를 D-077로 예상했으나,
-- 같은 시각 CREW가 I-134(BEFORE 가드 트리거 EXECUTE 권한 관례)를 D-077로 먼저 등재했다.
-- "최소 1명 관리자 보장" 결정은 D-078로 재등재한다(docs/prioritization-and-risks.md) — 여기서는
-- 이미 DB에 저장된 코멘트 문구만 D-077 -> D-078로 고친다(admin_console_042b_fix_decision_
-- number_refs와 같은 선례).

comment on function private.admin_revoke_system_admin(uuid) is
  'I-075 AC — 관리자 회수(D-076·D-078). 호출자가 관리자가 아니거나(forbidden), 대상이 없거나(target_not_found)/비활성이거나(target_not_active)/이미 관리자가 아니면(not_admin) 거부한다. 이 회수로 관리자가 0명이 되면 last_admin_forbidden(D-078, 최소 1명 보장) — cannot_target_self(D-076)보다 먼저 검사한다(마이그레이션 상단 주석 참고).';
