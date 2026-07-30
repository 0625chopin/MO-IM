-- 진단: private 스키마에 ALTER DEFAULT PRIVILEGES가 애초에 먹히는지 확인 — GRANT 방향으로
-- 시험(REVOKE 방향에서 효과가 없었으므로 메커니즘 자체가 안 먹는지, 방향의 문제인지 분리).
alter default privileges for role postgres in schema private
  grant execute on functions to service_role;
