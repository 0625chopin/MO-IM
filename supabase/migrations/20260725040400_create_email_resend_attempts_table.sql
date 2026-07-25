-- FR-001 E4(회원가입 인증 메일 재발송, 60초 쿨다운·시간당 5회 상한) 카운터.
-- D-020의 auth_attempts와 같은 패턴(서버 전용, RLS 완전 거부) — 다른 테이블로 분리한 이유는
-- auth_attempts가 PRD §7 AuthAttempt(로그인 시도 전용) 타입으로 이미 문서화돼 있어, 의미가
-- 다른 "재발송 요청" 이벤트를 같은 테이블에 얹으면(예: identifier 접두사로 구분) 그 테이블의
-- 문서화된 목적과 어긋나고 D-020 잠금 판정(evaluateLoginLockout)과 데이터가 섞여 있다는
-- 오해를 살 수 있다. Task 030(17일차 CREW), BOARD 교차검증 major 지적 반영.
create table public.email_resend_attempts (
  id bigint generated always as identity primary key,
  identifier text not null,
  requested_at timestamptz not null default now()
);

comment on table public.email_resend_attempts is
  'FR-001 E4 인증 메일 재발송 요청 카운터(60초 쿨다운·시간당 5회 상한). 클라이언트 접근 불가 — RLS는 auth_attempts와 동일하게 전체 거부.';

-- D-028 4대 규약: TO 절 명시, 정책 컬럼 인덱스. auth.uid() 래핑·재귀 회피는 이 정책에 해당 없음
-- (블랭킷 거부라 auth.uid() 참조·다른 테이블 참조가 없다).
create index idx_email_resend_attempts_identifier_requested_at
  on public.email_resend_attempts (identifier, requested_at desc);

alter table public.email_resend_attempts enable row level security;

create policy email_resend_attempts_no_client_access
  on public.email_resend_attempts
  for all
  to anon, authenticated
  using (false)
  with check (false);
