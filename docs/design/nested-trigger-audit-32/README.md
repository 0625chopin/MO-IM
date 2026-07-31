# 중첩 트리거(`pg_trigger_depth`) 전수조사 · `private` 스키마 REST 노출 실증 — 32일차, CORE

31일차 I-147의 근본 원인은 CREW가 새로 넣은 아카이브 가드가 `pg_trigger_depth() > 1`
때문에 통째로 스킵된 것이었다. 이 문서는 "이게 결함 클래스인가"를 확인하기 위해
`pg_trigger_depth`를 참조하는 **모든 함수를 전수 열거**하고, 각각의 스킵이 의도(재귀
방지)인지 사고(가드 무력화)인지 실측으로 가른 기록이다.

## 0. 방법

- 전수 열거: `pg_proc.prosrc ilike '%pg_trigger_depth%'`를 **전 스키마**(`pg_catalog` 포함,
  실제로는 `public`만 해당) 대상으로 실행 — `pg_get_functiondef`가 집계함수 등에서 예외를
  던지는 문제가 있어 `prokind = 'f'` 필터를 먼저 걸고 후보를 좁힌 뒤 정의를 조회했다.
- 각 후보마다: 어떤 테이블·이벤트에 걸려 있는가 → 어떤 다른 트리거/RPC가 같은 테이블에
  중첩 쓰기를 유발하는가(`pg_proc.prosrc`에서 대상 테이블 INSERT/UPDATE 패턴을 다시
  전수 검색해 인라인 주석에 의존하지 않고 재확인) → 스킵되는 구체적 가드가 무엇인가 →
  그 스킵이 없으면 정상 기능이 깨지는가(의도) 아니면 순수하게 보호가 뚫리기만 하는가(사고).
- 의심 케이스는 `begin`…`rollback`으로 직접 재현을 시도했다. 실측에는 픽스처 크루
  (`729ced18-…` active·`2724533e-…` archived)를 건드리지 않고, 매번 새 리터럴 UUID의
  임시 크루·초대·가입신청 행을 만들어 검증한 뒤 롤백했다 — 트랜잭션 종료 후
  `crews=14`·`crew_memberships=54`·`invitations=9`·`join_requests=8`·`profiles=21`이
  시작과 동일함을 매 실측 세션마다 확인했고, 두 픽스처의 이름·상태·공개범위도 최종
  확인했다(무변경).

## 1. 전수 열거 결과 — **5개**

`pg_trigger_depth()`를 참조하는 사용자 정의 함수는 데이터베이스 전체에 **정확히 5개**다
(전 스키마 스캔, `pg_catalog.pg_trigger_depth` 원시 함수 자신은 제외):

| # | 함수(스키마.이름) | 트리거 이벤트 |
| --- | --- | --- |
| 1 | `public.crew_memberships_guard_self_insert_request` | BEFORE INSERT `crew_memberships` |
| 2 | `public.crew_memberships_guard_self_transition` | BEFORE UPDATE `crew_memberships` |
| 3 | `public.invitations_guard_response_transition` | BEFORE UPDATE `invitations` |
| 4 | `public.poll_eligible_voters_guard_insert_scope` | BEFORE INSERT `poll_eligible_voters` |
| 5 | `public.poll_votes_guard_immutability` | BEFORE UPDATE `poll_votes`(`invalidated` 필드 한정) |

## 2. 표 — 스킵 경로 · 의도/사고 · 재현 결과

| # | 스킵 조건 | 건너뛰는 가드 | 중첩을 유발하는 실제 호출자(재확인) | 의도/사고 | 재현 시도·결과 |
| --- | --- | --- | --- | --- | --- |
| 1 | `pg_trigger_depth() > 1` | self-service INSERT 제약 전부(`status='requested'`·`role='member'`·크루 public+active) | ①`crews_provision_owner_bootstrap`(AFTER INSERT `crews`, 오너 부트스트랩) ②`invitations_provision_membership`(AFTER INSERT `invitations`, 초대 프로비저닝) ③`crews_sync_membership_on_owner_transfer`(AFTER UPDATE `crews`, 오너이양의 `INSERT…ON CONFLICT DO UPDATE`) | **의도.** ①②는 함수 인라인 주석에 명시. **③은 주석에서 누락**(문서 갭) — 그러나 위험은 없다: 대상 프로필은 `crews_guard_owner_only_fields`가 이미 "활성 멤버여야 이양 가능"으로 사전 검증했고, 이 upsert가 넣는 값(`role='owner', status='active'`)은 전부 트리거가 하드코딩하지 사용자 입력이 아니다 | 사고가 아니므로 재현 대상 아님. **문서만 수정**(§3) |
| 2 | `pg_trigger_depth() > 1` | 자기서비스 화이트리스트 + "남의 행"(officer) 분기 전부(archived 크루 차단·강퇴/해임 권한 검사 등) | ①`invitations_sync_membership_on_response`(수락/거절) ②`join_requests_sync_membership_on_decision`(승인/반려) ③`crews_sync_membership_on_owner_transfer`(구오너 강등 UPDATE + 신오너 upsert) | **의도, 주석이 3개 원인 전부 정확히 명시.** 코드로 직접 확인: 이 스킵이 없으면 ①②③ 전부 "self-service 화이트리스트 미포함"(role 변경만 있고 상태 변경이 없는 전이)으로 예외를 던져 **정상 기능 자체가 깨진다.** | **②(join_requests 승인이 archived 크루를 향하는 조합)을 실제로 재현 시도 — 재현 실패(불성립).** `join_requests_update_requester_or_staff` RLS(31일차 마이그레이션)가 `private.is_crew_active(crew_id)`를 USING·WITH CHECK 양쪽에 이미 걸어 둬서, 크루가 archived면 이 UPDATE 자체가 RLS 단계에서 **트리거 depth와 무관하게** 0행으로 조용히 막힌다 — outer RLS가 inner 스킵을 완전히 흡수한다. 실측: 임시 public crew 생성 → `requested` 멤버십·`pending` 가입신청 삽입 → crew를 `archived`로 전환 → 오너 세션으로 `UPDATE join_requests SET status='approved'` 시도 → `join_request_status_after='pending'`·`membership_status_after='requested'`(둘 다 불변, 즉 갱신 0건) |
| 3 | `pg_trigger_depth() > 1 OR auth.uid() IS NULL` | pending·만료·행위자 검사 + 31일차 신설 "archived 크루 수락 차단" 전부 | **현재 없음.** `invitations` UPDATE를 유발하는 다른 트리거·RPC·cron 잡을 전수 검색했으나 0건(`pg_proc.prosrc` 전수 스캔 + `cron.job` 5건 전부 크로스체크 — 모두 chat/rate-limit/profile/poll 관련, invitations 무관) | **의도(선제적 방어), 현재 미도달.** 주석 자체가 "향후 시스템 경로"로 명시 | 스킵 대상 호출자가 없어 재현할 게 없음. 대신 **정상 경로(depth=1)가 실제로 막히는지** 재확인: private+archived 임시 크루에서 초대 대상자가 `accepted`로 UPDATE 시도 → **예외 발생**(`invitations: cannot accept an invitation to an archived crew (FR-013)`, `P0001`). 같은 조합에서 `declined`는 성공(회귀 없음) — I-147 해소가 32일차에도 유효함을 재확인 |
| 4 | `pg_trigger_depth() > 1` | open 투표 한정 스냅샷 추가 + 대상자 활성멤버십 검사 | **현재 없음.** `poll_eligible_voters` INSERT는 `private.create_poll` RPC의 직접 INSERT뿐(항상 depth=1) | **의도(선제적 방어), 현재 미도달.** 주석 자체가 "현재는 이런 경로가 없지만…향후" | 호출 경로 자체가 없어 재현 대상 아님 |
| 5 | `pg_trigger_depth() <= 1`일 때 **예외**(반대 방향 게이트 — nested일 때만 허용) | `invalidated` 필드의 직접(top-level) 변경을 차단 | 유일한 신뢰 경로: `crew_memberships_invalidate_votes_on_removal`(AFTER UPDATE `crew_memberships`, `WHEN (new.status='removed' AND old.status='active')`로 발동 조건 자체가 좁혀져 있음을 `pg_get_triggerdef`로 확인) | **의도.** 게이트 방향이 반대(스킵이 아니라 "중첩이어야만 허용")라 다른 4건과 위험 성격이 다르다 — 우연히 깊어진 depth가 있어도 허용되는 대상은 이 필드 하나뿐이고, 그 유일한 트리거 소스도 `WHEN` 절로 좁혀져 있다 | 사고 여지가 구조적으로 낮아 별도 재현 생략 |

## 3. 분류 요약

- **열거 개수**: 5개(전 스키마, 중복·누락 없음)
- **의도(재귀·자기잠금 방지) 판정**: 5/5
- **사고(가드 무력화) 판정**: 0/5
- **실제 재현 시도**: 2건(#2 join_requests→archived 승인 조합, #3 invitations 정상 경로 재확인) — **재현 성공 0건**
- **재현이 불필요했던 건**(호출 경로 자체가 없음, "안 판 것"과 구분): #3의 `pg_trigger_depth()>1` 분기, #4 전체
- **문서만 수정한 건**: #1 — `crews_sync_membership_on_owner_transfer`가 세 번째 신뢰 호출자라는 사실이 인라인 주석에서 누락돼 있었다. 위험은 없지만(§2 근거) 다음 감사자의 "인라인 주석을 그대로 믿지 말라"는 이 프로젝트의 반복된 교훈에 맞춰 배포본을 `pg_get_functiondef`로 그대로 복사해 주석 한 줄만 추가하는 마이그레이션을 적용했다 — 로직은 한 글자도 바꾸지 않았다(마이그레이션:
  `20260730_comment_fix_crew_memberships_guard_self_insert_request_nested_callers_32.sql`
  형태로 적용, 배포본 대조 완료).

## 4. 결론

**31일차 I-147은 이 결함 클래스의 유일한 실사고였다.** 이번 32일차 전수조사로, 31일차에
적용된 세 가드(크루 memberships officer 가드·join_requests RLS·invitations accept 가드)가
서로 다른 계층(트리거 vs RLS)에서 겹치지 않게 이 클래스를 덮고 있다는 것을 코드 대조 +
실측 양쪽으로 확인했다. 특히 "트리거가 중첩으로 스킵되더라도 RLS가 바깥에서 막는다"는
구조(#2)는 **의도적으로 설계된 것은 아니지만 결과적으로 안전망 역할을 한다** — 이 이중
방어가 우연이라는 점은 다음 회차에 트리거·RLS 중 하나만 고치고 다른 하나를 건드리지 않을
때 특히 주의가 필요하다는 뜻이기도 하다(둘 중 하나가 없어지면 그 순간 커버리지 갭이 생긴다).

## 5. 깊이 파기 축 ③ — `private` 스키마가 실제로 PostgREST에 노출되는가 (실증)

팀장이 사전 조사로 확인한 것: **`private` 스키마 함수 26개가 `authenticated`에게 EXECUTE
권한을 갖는다**(PostgreSQL 함수 기본값 — 명시적 REVOKE가 없으면 PUBLIC EXECUTE가 남는다).
이게 안전한 유일한 이유는 "PostgREST가 `private` 스키마를 노출하지 않는다"는 **가정**이었고,
이 저장소 어디에도 실증돼 있지 않았다. 아래는 추론이 아니라 **실 REST 호출 결과**다.

### 5.1 SQL 권한 계층 — 무엇이 열려 있는가 (실측)

```sql
select nspname, nspacl::text from pg_namespace where nspname in ('private','public');
-- private = {postgres=UC/postgres, authenticated=U/postgres, anon=U/postgres, service_role=U/postgres}
```

`private` 스키마에 `USAGE`가 `anon`·`authenticated`·`service_role` **전부에 명시적으로
부여돼 있다**(`postgres`가 부여). 즉 **SQL 권한만 보면 이 스키마는 잠겨 있지 않다** —
`USAGE` 미부여로 막고 있는 게 아니다. 함수 26개의 `EXECUTE`도 위 팀장 조사대로 이미 열려
있다. 이 레이어만으로는 **아무것도 막지 못한다.**

### 5.2 REST 실증 — 3중 확인

Auth REST로 실 계정(`chopin0625@gmail.com`) 로그인 후 access token 획득, 컨트롤로 이미 알려진
노출 RPC(`public.crew_directory_summary`)를 먼저 호출해 하네스 자체가 정상 작동함을 확인했다
(HTTP 200, 실제 데이터 반환 — 픽스처 `729ced18-…`는 조회만 했고 쓰기 없음).

| 시도 | 요청 | 결과 |
| --- | --- | --- |
| 1 | `POST /rest/v1/rpc/is_crew_active`(기본 경로, 프로파일 헤더 없음), `authenticated` | `HTTP 404 PGRST202` — `public.is_crew_active`를 찾을 수 없음(기본 검색 스키마가 `public`뿐이라는 뜻) |
| 2 | 동일 + `Content-Profile: private`, `authenticated` | **`HTTP 406 PGRST106` — `"Invalid schema: private"`, hint: `"Only the following schemas are exposed: public, graphql_public"`** |
| 3 | 동일 + `Accept-Profile: private`, `authenticated` | `HTTP 404 PGRST202`(Accept-Profile은 GET 계열 프로파일 지정용이라 POST RPC엔 적용 안 되고 기본 `public` 검색으로 되돌아감) |
| 4 | #2와 동일 요청을 **비로그인 `anon`** 토큰으로 재확인 | 동일하게 `HTTP 406 PGRST106`(role 무관, 스키마 자체가 프로파일 협상 단계에서 거부) |
| 5 | **가장 위험한 함수** `private.disband_crew`로 #2를 재현(더 위험한 인자를 일부러 무효 UUID로 채워 실제 해산은 방지) | 동일하게 `HTTP 406 PGRST106` — **함수 이름 해석 단계까지 가지도 못하고 스키마 협상에서 거부됨**(즉 이 호출로 `disband_crew`의 로직은 전혀 실행되지 않았다 — 스키마 검증이 함수 조회보다 먼저 일어난다는 걸 이번 실측으로 확인) |

**결론: 노출되지 않는다.** 그리고 "왜"가 정확히 나온다 — PostgREST 자신의 오류 메시지가
현재 `db-schemas`(Supabase 대시보드 "Exposed schemas") 값을 **`public, graphql_public`**로
직접 알려준다. `private`는 그 목록에 없다.

### 5.3 무엇이 막고 있는가 — 정확한 소재

- **막는 것**: PostgREST의 `db-schemas` 설정(Supabase 프로젝트 API 설정의 "Exposed schemas"
  필드) 하나. `pg_roles.rolconfig`(authenticator 롤)·`current_setting('pgrst.db_schemas')`
  양쪽을 조회했으나 **DB 안에는 이 값이 전혀 저장돼 있지 않다** — 이 값은 Postgres가 아니라
  **Supabase 컨트롤 플레인(대시보드)이 관리하는 PostgREST 프로세스 설정**이라는 뜻이다.
- **막지 않는 것**: `private` 스키마 `USAGE`(§5.1에서 이미 부여돼 있음 확인), 함수별
  `EXECUTE`(팀장 조사대로 26개 전부 열림). 이 두 레이어는 방어에 **전혀 기여하지 않는다.**
- **잔여 리스크(핵심)**: 이 방어는 **`supabase/migrations/*.sql`에 없다** — 즉 git으로
  추적되지 않고, 마이그레이션 재적용·프로젝트 복제·대시보드 설정 실수 어느 경로로도
  조용히 사라질 수 있는 **단일 장애점**이다. `docs/decisions/rls-policies-029b.md`가 이미
  "`private` 스키마 격리가 대시보드 Exposed schemas 설정에 의존한다"고 운영 경고로
  남겨 뒀는데, 이번 실측으로 **그 경고가 현재는 사실임을 확인**했을 뿐 — 근본적으로
  해소된 건 아니다. 대시보드 설정이 바뀌는 순간 §5.1의 이미 열려 있는 26개 함수
  `EXECUTE` + 스키마 `USAGE`가 **즉시** 실사용 가능해진다(SQL 쪽엔 막을 게 이미 없다).
- **후속 후보**(처분은 팀장 판단): (a) `private` 스키마·함수 26개에 대해 SQL 레벨 방어도
  이중화한다 — `USAGE`를 `anon`/`authenticated`에서 명시 REVOKE(§4의 "실효 방어는 USAGE
  미부여 유지"라는 `cron` 스키마 선례와 같은 패턴을 `private`에도 적용). 이러면 대시보드
  설정이 실수로 바뀌어도 SQL 권한이 2차 방어선이 된다. (b) 최소한 이 대시보드 설정값을
  주기적으로(또는 배포 검증 체크리스트에) 확인하는 절차를 문서화한다 — 지금은 아무도
  검증하지 않는 값이다.

## 부록 — I-148 재검증과의 연결

배정 1(I-148)을 조사하며 `private.crew_directory_summary`의 배포본을 다시 읽다가, 이
문서 §2의 #2·#3 재현 실측에 쓴 것과 같은 `begin`…`rollback` 기법으로 I-148의 전제
자체가 성립하지 않음을 확인했다. 상세는 `docs/ISSUES.md`의 I-148 항목(32일차 재검증
절)과 `src/lib/data/supabase/crew.ts`의 `getCrewById` 갱신된 불변식 주석을 참고할 것 —
이 문서에 중복 서술하지 않는다.
