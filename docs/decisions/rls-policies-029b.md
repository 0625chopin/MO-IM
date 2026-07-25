# RLS 정책 설계와 적용 — `private` 차단·SECURITY DEFINER 헬퍼·Realtime Authorization (Task 029B)

- **일자**: 2026-07-25(16일차)
- **담당**: CORE(A팀) · 리뷰 DESIGN(B팀)
- **참조**: D-017·D-028·D-023·D-007, NFR-013, R-012, `docs/decisions/rls-policies-029a.md`(선행 문서, 이하 "029A 문서")
- **범위**: 029A가 "crew_memberships를 자기 행 전용 리프 노드로 좁히며" 남긴 gap(임원 임명·강퇴·동료 조회)을 `private` 스키마 SECURITY DEFINER 헬퍼로 풀고, poll 집계·게스트 크루 정보·검색 3필드 제한을 column-level 노출 전용 함수로 채우고, Realtime Authorization(`realtime.messages` 정책)을 추가한다. **029A의 정책 58건은 건드리지 않는 것을 원칙으로 하되, 불가피하게 수정한 2건(§3)은 근거를 남긴다.**

## 0. 착수 전 실측 확인 (D-037)

| 확인 항목 | 값 |
| --- | --- |
| `list_tables`(public) | 21개, 낯선 테이블(`player`·`fixture` 등) 없음 — 정상 진행 |
| `list_migrations` | 26건(029A까지 025건 + DESIGN 035 후속 1건), project ref `damruradpliktkrlkakl`(MO-IM 전용) |
| `get_advisors(security)` 착수 시점 | `lints: []` (029A가 0건으로 마감한 상태 그대로) |

## 1. 조회한 외부 문서 (팀장 지시 — 기억이 아니라 문서로 근거를 남긴다)

`mcp__supabase__search_docs`로 아래를 실제로 조회했다(본문에 인용된 코드·문구는 이 조회 결과에서 가져왔다):

- [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization) — `realtime.messages` RLS·`realtime.topic()`·`private: true` 채널 설정.
- [Broadcast](https://supabase.com/docs/guides/realtime/broadcast) — DB Broadcast는 항상 Supabase Admin role로 연결됨(권한 우회가 아니라 Realtime 서비스 자체의 접속 방식), 3일 후 자동 삭제.
- [Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes) — `realtime.broadcast_changes()` 트리거 패턴, "Authenticated users can receive broadcasts" 예시 정책.
- [Using Custom Schemas](https://supabase.com/docs/guides/api/using-custom-schemas) — 커스텀 스키마는 **Exposed schemas에 명시적으로 추가해야만** PostgREST에 노출된다는 것을 확인(= 추가하지 않으면 절대 노출되지 않는다).
- [Securing your API](https://supabase.com/docs/guides/api/securing-your-api) — `private.rate_limits` 예시로 "The `private` schema is used as it cannot be accessed over the API!"를 원문으로 확인. 커스텀 스키마의 기본 권한(누구에게도 자동 부여되지 않음)도 이 문서로 확인.

실측(§6.1)까지 함께 확인해, "PostgREST 노출 스키마 목록에 없으면 절대 안 열린다"는 이번 설계의 핵심 전제를 문서+DB 양쪽에서 검증했다.

## 2. `private` 스키마와 SECURITY DEFINER 헬퍼

### 2.1 왜 안전한가 (재귀 회피 논증)

029A §2가 실측으로 확인한 것: `crews`↔`crew_memberships`처럼 **두 정책이 서로(또는 자기 자신)를 서브쿼리로 참조하면** Postgres가 정책 재작성(rewrite) 단계에서 정적으로 `42P17 infinite recursion`을 낸다. 이번 회차에서 다시 확인한 것: **정책이 SECURITY DEFINER 함수를 호출하는 것은 이 탐지 대상이 아니다.** 함수 호출은 옵티마이저에게 불투명한 블랙박스이고, 함수 내부가 같은 테이블을 다시 쿼리하더라도 그 쿼리는 "정책이 정책을 참조"하는 형태가 아니라 별도 실행 컨텍스트의 일반 쿼리다. 게다가 이 함수들은 `crew_memberships` 소유자(`postgres`)로 실행되고 그 테이블에 `FORCE ROW LEVEL SECURITY`가 걸려 있지 않으므로(029A §6.3 실측), 내부 쿼리는 애초에 RLS 자체를 적용받지 않는다 — 재귀는 "정책 A가 정책 B를 참조"할 때만 성립하는데, 테이블 소유자의 쿼리에는 애초에 정책이 적용되지 않으므로 재귀의 전제 자체가 없다.

### 2.2 헬퍼 함수 시그니처 (스키마 `private`, 마이그레이션 `rls_private_schema_and_helpers`)

| 함수 | 반환 | 용도 |
| --- | --- | --- |
| `private.my_active_crew_ids()` | `setof uuid` | 내가 `active` 상태로 속한 크루 id 전체 |
| `private.my_crew_role(p_crew_id uuid)` | `text` (없으면 `null`) | 특정 크루에서 내 role(`active`가 아니면 `null`) |
| `private.is_active_crew_member(p_crew_id uuid)` | `boolean` | 특정 크루의 활성 멤버인가 |
| `private.is_crew_staff_or_owner(p_crew_id uuid)` | `boolean` | 특정 크루의 임원 이상인가 |

넷 다 `language sql stable security definer set search_path = ''`. `search_path=''`는 15일차 교훈대로 **처음부터** 고정했다(사후 수정이 아니다).

### 2.3 권한 부여 — 15일차 교훈의 반대 방향 적용

15일차 교훈: "`revoke ... from public`만으로는 Supabase가 `public` 스키마 신규 함수에 붙이는 anon/authenticated 개별 grant가 회수되지 않는다." 이 교훈은 **`ALTER DEFAULT PRIVILEGES`가 `public` 스키마에만 걸려 있어서** 생긴 현상이다. `private`는 새로 만든 커스텀 스키마라 그 기본 권한 규칙이 적용되지 않는다 — 즉 **아무 role에도 자동으로 아무 권한이 붙지 않는다**(§6.1에서 실측 확인).

그래서 순서를 명시적으로 지켰다:
1. `create schema private` 직후 `revoke all on schema private from public` + `grant usage on schema private to authenticated, anon, service_role`(스키마 USAGE 없이는 role이 정책 평가 중 이 스키마의 함수를 호출할 권한 자체가 없다).
2. 각 함수 생성 직후 `revoke execute ... from public, anon, authenticated` → `grant execute ... to authenticated`(운영상 필요한 role에만).

### 2.4 ⚠️ `private` 격리는 코드가 아니라 대시보드 설정에 의존한다 (16일차 DESIGN 교차검증 MINOR 4)

`authenticated`/`anon`은 이미 `private.poll_vote_tally`·`private.crew_directory_summary` 등에 **EXECUTE 권한을 실제로 갖고 있다**(§6.1 실측 — `public.*` invoker 래퍼가 이 함수들을 호출하려면 호출자 자신의 EXECUTE 권한이 필요하기 때문, §4·§5 참고). `private` 스키마가 안전한 **유일한 이유**는 이 스키마가 PostgREST **Exposed schemas** 목록(Project Settings → Data API)에 없다는 것 하나뿐이다 — 이건 **마이그레이션(코드)이 아니라 프로젝트 설정**이라 이 저장소의 어떤 SQL·코드 리뷰로도 회귀를 막을 수 없다.

**만약 누군가 `private`를 Exposed schemas에 추가하면 무슨 일이 일어나는가**: `private.my_active_crew_ids()`·`private.my_crew_role()`·`private.is_active_crew_member()`·`private.is_crew_staff_or_owner()`·`private.poll_vote_tally()`·`private.crew_directory_summary()` 전부가 `/rest/v1/rpc/...`로 **즉시 직접 호출 가능**해진다. 앞의 넷은 인자를 그대로 신뢰하는 내부 헬퍼라 실질적 피해는 제한적이지만(호출해도 자기 자신의 크루 관계만 알 수 있음), `private.poll_vote_tally`·`private.crew_directory_summary`는 **인가 로직이 함수 안에만 있고 RLS가 없으므로**, `public.*` 래퍼를 거치지 않고 직접 호출해도 똑같이 동작한다 — 이 둘은 위험이 낮지만(어차피 `public.*` 래퍼로도 같은 결과를 얻을 수 있으므로 추가 노출 표면이 크지 않음), **원칙은 지켜야 한다**: private는 절대 노출 목록에 들어가면 안 된다.

**확인 방법(운영 체크리스트 항목으로 추가할 것) — 유효한 수단은 아래 두 가지뿐이다**:
1. Dashboard → Project Settings → Data API → Exposed schemas에 `private`가 없는지 주기적으로 확인한다.
2. **실측(16일차, DESIGN)**: 실제 HTTP 요청으로 `GET {project_url}/rest/v1/rpc/my_active_crew_ids`(anon key, `Accept-Profile: private` 헤더 포함)를 호출해 PostgREST가 스키마 자체를 모른다는 응답(**406** — PostgREST가 `Accept-Profile`로 요청된 스키마를 찾지 못할 때의 응답)을 반환함을 확인했다. 이 결과가 바로 "Exposed schemas 미포함 = 코드가 아니라 설정이 지키는 경계"라는 이번 절의 주장을 실제 트래픽으로 증명한다.

> **⚠️ SQL로는 확인할 수 없다(16일차 DESIGN 재검증에서 발견, MINOR 5).** 최초 버전은 "`current_setting('pgrst.db_schemas')`로도 확인 가능"이라고 적었으나 틀렸다 — Supabase Cloud(호스티드) 환경에서 실측한 결과 `select current_setting('pgrst.db_schemas', true)`는 **항상 `NULL`**이고, `pg_db_role_setting`에서 `authenticator` role 설정을 조회해도 `session_preload_libraries`·`statement_timeout`·`lock_timeout`만 있을 뿐 `pgrst.db_schemas` 자체가 **존재하지 않는다**(자체 재확인 완료 — 두 방법 모두 NULL/부재). Exposed schemas는 이 호스티드 환경에서 Postgres GUC/role 설정이 아니라 **DB 바깥 컨트롤 플레인(PostgREST 프로세스 환경변수)** 으로 주입되는 것으로 보인다. **이 SQL 체크는 항상 NULL을 반환하므로 "확인 안 됨"과 "안전함"을 구분하지 못한다 — NULL을 보고 "private가 없으니 안전하다"고 오독하면 안 된다.** 유효한 수단은 위 1·2뿐이다.



## 3. crew_memberships 재설계 — FR-024·FR-027·FR-028

### 3.1 정책 변경 (2건 — 029A 기준선 58건 불변)

029A의 `crew_memberships_select_self`·`crew_memberships_update_self` 2개 정책의 **qual/with_check만 OR로 넓혔다**(정책 개수 증감 없음 → 58건 그대로). 새 정책을 추가하지 않고 기존 정책을 확장한 이유: 029A가 지킨 "역할·명령별 정책 1개" 관례(`multiple_permissive_policies` 성능 경고 회피)를 유지하기 위해서다.

| 정책 | 029A qual | 029B qual |
| --- | --- | --- |
| `crew_memberships_select_self` → `crew_memberships_select_self_or_fellow_member` | `profile_id = auth.uid()` | `profile_id = auth.uid() OR private.is_active_crew_member(crew_id)` |
| `crew_memberships_update_self` → `crew_memberships_update_self_or_officer` | `profile_id = auth.uid()` | `profile_id = auth.uid() OR private.is_crew_staff_or_owner(crew_id)` |

RLS는 "이 행에 누가 닿을 수 있는가"만 정한다. FR-024(오너만 임명)·FR-027(임원은 일반 멤버만 강퇴)의 **세부 업무 규칙은 RLS가 표현할 수 없어** 트리거(§3.2)가 맡는다 — 029A가 이미 세운 "RLS=누가, 트리거=무엇을" 원칙을 그대로 따른 것이다.

### 3.2 트리거 재설계 — `crew_memberships_guard_self_transition`

029A의 self-service 분기(본인 행, role 불변·`invited→active/declined`·`active→left`만 허용)는 **완전히 그대로** 두었다. `old.profile_id = auth.uid()`로 분기해 "본인 행"과 "남의 행"을 나누고, 남의 행에는 새 분기를 추가했다:

- **오너 행 자체는 이 경로로 못 건드린다**(`old.role = 'owner'`이면 즉시 예외 — 오너 교체는 FR-025 전용 경로).
- **role 변경**(FR-024): 행위자가 `owner`가 아니면 예외(AC2 "임원 임명 시도 → 403"), 대상이 `active`가 아니면 예외(사전조건), `new.role`이 `staff`/`member`가 아니면 예외(오너 승격은 이 경로가 아니라 FR-025), role·status 동시 변경 금지.
- **status→`removed`**(FR-027): 대상이 `active`가 아니면 예외, **`staff`가 대상이면서 `old.role<>'member'`이면 예외**(E1 "임원이 임원·오너 대상 → 403"). 오너는 이 조건에 걸리지 않으므로 임원 포함 누구나 강퇴 가능(오너 행 자체는 위에서 이미 차단).
- **status `removed`→`active`**(FR-027 E3 강퇴 해제): 행위자가 `owner`가 아니면 예외.
- 그 외 조합은 전부 예외(`unsupported officer-managed status transition`).

`pg_trigger_depth()>1`(029A §3의 신뢰된 부수효과 — 초대·가입승인·오너이양)은 이 검사를 전부 건너뛴다. 변경 없음.

**FR-024/027 AC4의 감사 로그(행위자·대상·시각 기록)는 이번에 구현하지 않았다** — `audit_logs`는 여전히 클라이언트 완전 거부(029A)이고, 이걸 채우는 쓰기 경로(트리거 또는 service_role)는 029B의 참조 결정(D-017·D-028·D-023·D-007·NFR-013·R-012) 어디에도 명시되지 않은 별도 작업이다. §8 이월 목록에 남긴다.

### 3.3 실측 검증 (트랜잭션 롤백, 11개 시나리오)

`set local role authenticated` + `request.jwt.claim.sub`로 오너(101)·임원(102)·멤버1(103)·멤버2(104) 4개 프로필을 만들어 실행했다(전부 `rollback`, 잔여 행 0건 재확인):

| # | 시나리오 | 기대 | 실측 |
| --- | --- | --- | --- |
| 1 | 일반 멤버(104)가 동료 조회 | 4행 전부(재귀 없이) | **4** ✅ |
| 2 | 일반 멤버가 남의 role 변경 시도 | RLS가 0행으로 막음 | **0** ✅ |
| 3 | 임원(102)이 다른 멤버(104)를 staff로 임명 시도 | 트리거 예외(오너 전용) | `only the crew owner may appoint or dismiss staff (FR-024 AC2)` ✅ |
| 4 | 오너(101)가 멤버2(104)를 staff로 임명 | 성공 | `staff` ✅ |
| 5 | 임원(102)이 멤버1(103, role=member)을 강퇴 | 성공 | `removed` ✅ |
| 6 | 임원(102)이 이제 staff인 멤버2(104)를 강퇴 시도 | 트리거 예외(임원은 임원 불가) | `staff may only remove general members... (FR-027 E1)` ✅ |
| 7 | 오너(101)가 staff(104)를 강퇴 | 성공(오너는 임원도 강퇴 가능) | `removed` ✅ |
| 8 | 오너(101)가 강퇴된 멤버1(103)을 복귀 | 성공(FR-027 E3, 오너 전용) | `active` ✅ |
| 9 | 오너(101)가 **자기 자신**의 role 변경 시도 | self-service 분기 그대로 차단 | `members cannot change their own crew role` ✅ |
| 11 | 오너(101)가 멤버1(103)을 `role='owner'`로 변경 시도 | 예외(오너 승격은 FR-025 전용) | `invalid target role for appointment (owner transfer uses FR-025)` ✅ |

10개 시나리오 전부 기대와 일치, **42P17 전혀 재현되지 않음.** 오너의 자기 행 강퇴(시나리오10 상당)는 이미 self-service 분기(`active→left`만 허용)로 걸려 별도 시나리오가 필요 없었다.

## 4. `poll_vote_tally` — poll_votes 집계 공개 (D-031)

029A §8.2 인계: `poll_votes`는 본인+임원 이상만 개별 행을 본다(D-003 "개인 선택 비공개" 구현, 변경 없음). 크루원 전체에게 찬성/반대/기권 **집계**를 공개하려면(D-003 "집계는 공개") 개별 행을 노출하지 않는 함수가 필요하고, **D-031**(대상자 5명 미만이면 진행 중 집계를 숨기고 "N명 참여"만 노출, 종료 후 공개)까지 만족해야 한다.

`private.poll_vote_tally(p_poll_id)`(SECURITY DEFINER, 실제 로직) + `public.poll_vote_tally(p_poll_id)`(SECURITY INVOKER 얇은 래퍼, PostgREST RPC 진입점) 2단 구조로 만들었다(§6.2 이유). 반환: `poll_id, poll_status, eligible_count, participant_count, for_count, against_count, abstain_count, tally_hidden`. 크루 소속 확인은 함수 내부에서 `private.is_active_crew_member()`로 직접 하고, 비소속이면 예외를 던진다(SECURITY DEFINER가 `poll_votes`의 제한적 SELECT 정책을 우회하는 대신, 함수 자신이 그 인가를 재구현해야 한다는 뜻 — RLS가 사라지는 대가).

`eligible_count`(=`poll_eligible_voters` 스냅샷 행 수)가 5 미만이고 `poll.status='open'`이면 `for/against/abstain`은 `null`, `tally_hidden=true`, `participant_count`만 채운다. 그 외(5명 이상이거나 이미 종료)에는 셋 다 채우고 `tally_hidden=false`. `invalidated=true`인 표는 항상 제외한다(강퇴자 표 무효화 트리거는 아직 없음 — §8 이월).

**실측(트랜잭션 롤백)**: 대상자 2명(오너+멤버) 크루에서 open 상태 조회 → `true|1|<null>`(집계 숨김) ✅ → `polls.status`를 `closed_passed`로 바꾼 뒤 재조회 → `false|1|1`(공개) ✅ → 비소속 회원이 조회 시도 → `not authorized to view this poll (crew members only)` 예외 ✅.

## 5. `crew_directory_summary` — 게스트 멤버 수·private 부분 노출 (D-007)

029A §8.3·§8.4 인계: (1) `anon`은 `crew_memberships`에 정책이 전혀 없어 `count(*)`가 항상 0이라 게스트용 "멤버 수"를 보여줄 수 없었다. (2) private 크루를 비소속 회원에게 "행 전체 비노출"로 과보호했는데, D-007은 "URL을 직접 알아도 크루명과 '초대 전용' 안내까지는 보인다"는 **부분** 노출을 요구한다.

`private.crew_directory_summary`(SECURITY DEFINER 실제 로직) + `public.crew_directory_summary`(SECURITY INVOKER 래퍼, `anon`+`authenticated` 둘 다 호출) 구조. `crews.status<>'active'`(해산)면 빈 결과. `visibility='public'`이면 `id·name·visibility·category·description·member_count`(활성 멤버 수) 전부, `'private'`면 `id·name·visibility`만 채우고 나머지 3개는 `null`.

**실측**: `anon`으로 공개 크루 조회 → `공개크루A|etc|공개 설명|2`(오너+멤버 2명) ✅. `anon`으로 비공개 크루 조회 → `비공개크루B|<null>|<null>|<null>` ✅.

**17일차 후속(재검증 각주)**: 팀장이 `getCrewById`(원본 테이블 raw select, RLS만 의존)를 통해 private 크루 비소속자가 `null`을 받는 회귀(`CrewHomeContainer`가 이를 `notFound()`로 오인)를 발견했다. 이 RPC 자체를 10개 시나리오(크루원·오너·비소속·`anon` × public/private + 존재하지 않는 크루)로 재검증한 결과 위 실측과 완전히 동일하게 정확히 동작한다 — **원문 서술은 틀리지 않았다.** 실제 gap은 `src/lib/data/supabase/crew.ts`의 `getCrewById`가 이 RPC를 아직 한 번도 호출하지 않는다는 것(Task 031이 명시적으로 미룬 결정, `read-path-realdata-031.md` §5)이다. 재검증 전문과 원인 규명: `docs/decisions/crew-directory-summary-verification-hotfix.md`.

## 6. Realtime Authorization

### 6.1 토픽 명명 규칙 (Task 033 인계)

Supabase 공식 문서(§1)가 권고하는 `scope:id:entity` 관례를 따른다. D-023의 "사용자당 1연결로 다중화"는 아래 세 형태의 채널을 **같은 Supabase Realtime 클라이언트 인스턴스 하나**로 구독하는 것으로 만족한다(연결당 채널 100 한도, R-019 — 크루 100개 초과는 v0.2 이슈로 남아 있음, 029A/15일차 범위 밖).

| 토픽 | 용도 | FR |
| --- | --- | --- |
| `crew:{crewId}:chat` | 채팅 메시지 브로드캐스트 | FR-051 |
| `crew:{crewId}:polls` | 투표 상태·집계 변경 브로드캐스트 | FR-042 |
| `user:{profileId}:notifications` | 개인 알림 브로드캐스트 | FR-070 |

### 6.2 이번에 만든 것 / Task 033에 넘기는 것

이번 마이그레이션(`rls_realtime_authorization_policies`)은 **"누가 구독(select)할 수 있는가"만** 정한다.

```sql
create policy "realtime_messages_select_crew_broadcast"
on "realtime"."messages" for select to authenticated
using (
  extension = 'broadcast'
  and topic ~ '^crew:[0-9a-fA-F-]{36}:(chat|polls)$'
  and private.is_active_crew_member(split_part(topic, ':', 2)::uuid)
);

create policy "realtime_messages_select_own_notifications"
on "realtime"."messages" for select to authenticated
using (
  extension = 'broadcast'
  and topic ~ '^user:[0-9a-fA-F-]{36}:notifications$'
  and split_part(topic, ':', 2)::uuid = (select auth.uid())
);
```

**INSERT 정책은 만들지 않았다** — D-023은 "DB 트리거 + `realtime.broadcast_changes()`"를 전제한다(클라이언트의 `channel.send()` 직접 브로드캐스트가 아니다). Broadcast 발신 자체는 Realtime 서비스가 **Supabase Admin role로 DB에 접속**해 처리하므로(§1 Broadcast 문서 — "Regardless if it's public or private, the Realtime service connects to your database as the authenticated Supabase Admin role"), 클라이언트발 INSERT 경로는 애초에 열 필요가 없다.

**Task 033이 만들어야 하는 것** (이번엔 만들지 않음 — 029B는 "RLS 정책 설계와 적용"이 범위이지 브로드캐스트 트리거 구현이 아니다):

```sql
-- 예시: chat_messages에 부착할 브로드캐스트 트리거(이 프로젝트의 realtime.broadcast_changes
-- 시그니처는 8개 인자다 — 실측: topic_name, event_name, operation, table_name, table_schema,
-- new record, old record, level text. 공식 문서 예시(6개 인자)와 다르니 그대로 베끼지 말 것)
create or replace function public.chat_messages_broadcast()
returns trigger security definer language plpgsql set search_path = '' as $$
begin
  perform realtime.broadcast_changes(
    'crew:' || (select cr.crew_id from public.chat_rooms cr where cr.id = coalesce(new.room_id, old.room_id))::text || ':chat',
    TG_OP, TG_OP, TG_TABLE_NAME, TG_TABLE_SCHEMA, new, old, 'row'
  );
  return null;
end;
$$;
```

클라이언트 쪽에서는 `channel(topic, { config: { private: true } })`로 구독하고 `await supabase.realtime.setAuth()`를 호출해야 한다(Realtime Authorization 필수 단계, §1 문서).

### 6.3 실측 — 부분 성공, 한계를 정직하게 남긴다

- **정규식·파싱 로직은 실측 검증했다.** `crew:{uuid}:chat`/`crew:{uuid}:polls`는 매치, `crew:{uuid}:notifications`(잘못된 entity)와 `crew:not-a-uuid:chat`(잘못된 uuid)는 매치 실패로 정확히 걸러진다. **AND 단락 평가로 매치 실패 시 `split_part(...)::uuid` 캐스팅이 아예 실행되지 않아 캐스팅 예외가 나지 않음도 별도로 확인했다**(`'crew:not-a-uuid:chat' ~ regex and split_part(...)::uuid = ...` → 예외 없이 `false`).
- **`realtime.messages`에 실제 행을 넣는 end-to-end 테스트는 이번 환경에서 불가능했다.** 이 테이블은 `inserted_at` 기준 RANGE 파티션인데 **파티션이 하나도 없다**(실제 브로드캐스트가 한 번도 발생한 적이 없다는 뜻 — 정상). 트랜잭션 안에서 테스트 전용 파티션을 붙여보려 했으나 `must be owner of table messages`로 거부됐다(이 테이블의 소유자는 `postgres`가 아니라 Realtime 확장 전용 role이다 — 021A 세팅이 아니라 Supabase 관리 인프라 영역). `private.is_active_crew_member()` 자체는 §3의 crew_memberships 실측으로 이미 role별 정답을 확인했으므로, "정규식+파싱이 맞다"와 "헬퍼가 맞다"를 각각 검증한 것으로 대체했다. **완전한 end-to-end(실제 broadcast 발생 → RLS로 걸러 받는지)는 Task 033이 트리거를 붙이고 첫 실제 트래픽이 흐를 때 반드시 재검증해야 한다.**

## 7. `profile_search` — 검색 3필드 제한 (NFR-013·R-012)

> **16일차 DESIGN 교차검증에서 MAJOR 2건이 발견돼 수정했다.** 아래는 최종(수정 후) 버전이다 — 최초 버전과 무엇이 왜 틀렸는지는 §13에 정직하게 남긴다.

`public.profile_search(p_handle text)` — `security invoker`, **`p.handle = p_handle` 정확 일치**(부분/접두사 일치 아님) + `search_opt_out=false` + `status='active'` 필터. 반환은 `handle, display_name, avatar_url` **딱 3개**(NFR-013 원문 그대로) — `id`도, `bio`·`search_opt_out`·`anonymized_at`·`handle_changed_at`도 포함하지 않는다.

**정확 일치로 좁힌 근거(requirements.md 실측)**:
- FR-006 설명(:430) "핸들 **정확 일치**로 사용자 1명을 찾는다"
- FR-006 AC2(:435) "존재하는 핸들, 앞 3글자만 입력 → **0건**(부분 일치 불가)"
- 3.6절(:321) "검색 키: 핸들 정확 일치만. 부분 일치·접두사 검색 불가" / (:324) "결과 개수: 정확 일치이므로 0건 또는 1건"

결과가 항상 0~1건으로 확정되므로 최초 버전의 `p_limit`/`limit least(...,20)` 상한 로직은 무의미해 **제거했다**(시그니처 자체가 `profile_search(text)`로 바뀌었다).

**대소문자 처리 — 실측 후 결정**: `information_schema.columns`로 `profiles.handle`을 확인한 결과 `data_type=text`, `collation_name=null`(기본 콜레이션 — **`citext`가 아니다**, 대소문자를 구분한다). `pg_constraint` 실측으로 `profiles` 테이블의 CHECK 제약이 `profiles_status_check` 하나뿐임도 확인했다 — 가입 시 핸들을 소문자로 강제하는 등의 정규화 규칙이 스키마 어디에도 없다. requirements.md에도 대소문자 무시 요구가 없다(3.6절·FR-006 전부 "정확 일치"만 명시하고 대소문자는 언급하지 않는다). 그래서 **스키마 그대로 대소문자 구분 `=` 비교**를 쓴다 — 핸들 정규화(가입 시 소문자 강제 등)가 필요하다고 판단되면 그건 별도 결정(가입 플로우 쪽)이 먼저 있어야 하고, 이 함수는 그 결정을 따라가면 된다.

**`id` 제거가 안전한 근거(실측)**: `pg_constraint`로 `profiles_handle_key`(`UNIQUE (handle)`)를 확인했다 — 핸들 자체가 유일 식별자이므로 검색 결과에 `id`가 없어도 정보 손실이 없다.

**Task 031/032 인계 — 초대 경로는 handle을 받아 서버에서 해석한다**: FR-020(크루원 초대) 정상 흐름 ②·③("② 핸들 검색(FR-006) → ③ 초대")이 이 순서이므로, 검색 결과의 "초대" 버튼은 이 함수가 반환한 **`handle`을 그대로 초대 요청 파라미터로 넘기고**, 서버(Server Action/RPC)가 `handle → profile_id`를 다시 조회해 `invitations.invitee_id`를 채우는 방식으로 구현해야 한다. `profile_search`가 `id`를 반환하지 않으므로 **클라이언트가 검색 결과의 id를 직접 들고 있다가 초대 API에 넘기는 구현은 성립하지 않는다** — 이 문서와 `src/lib/data/supabase/README.md`에 명시해 둔다.

**잔여 위험(정직하게 남긴다)**: `profiles_select_authenticated`(029A, `qual=true`, 전 컬럼)가 이미 모든 인증 사용자에게 열려 있어(D-005 "공개 프로필 정보" 결정), 이 함수를 거치지 않고 `.from('profiles').select('*').eq('handle', ...)`로 직접 조회하면 `id`를 포함한 전 컬럼을 볼 수 있다(정확 일치라 열거 자체는 막히지만, 필드 제한은 이 함수를 쓸 때만 성립한다) — **`profile_search`는 "이 계약을 쓰면 3필드로 제한된다"는 강제이지, "테이블 자체를 3필드로 봉인한다"는 강제가 아니다.** 테이블 자체를 컬럼 단위로 좁히려면 self-row는 넓게, 타인-row는 좁게 보여야 하는데 Postgres의 컬럼 단위 GRANT는 role 단위이지 행 단위가 아니라서 `CASE WHEN id=auth.uid()` 마스킹 뷰가 필요하다 — 이건 029A가 검토·교차검증까지 마친 `profiles_select_authenticated`를 재작업하는 일이라 이번 회차(58건 최소 변경 원칙) 범위 밖으로 이월한다(§11). NFR-016(분당 20회 레이트리밋)도 v0.2 범위라 넣지 않았다(029A가 이미 이렇게 이월해 둔 것과 동일).

**실측(트랜잭션 롤백, 6개 시나리오, 전부 통과)**:

| 시나리오 | 기대 | 실측 |
| --- | --- | --- |
| 정확 일치(`zzsearchoptin`) | 1행, 3컬럼만 | `1 cols=zzsearchoptin\|검색옵트인\|http://example.com/a.png` ✅ |
| 앞 3글자만(`zzs`, AC2) | 0건 | **0** ✅ |
| 부분 문자열(`search`) | 0건 | **0** ✅ |
| 옵트아웃 핸들(`zzsearchoptout`, AC3) | 0건 | **0** ✅ |
| 존재하지 않는 핸들 | 0건 | **0** ✅ |
| 대소문자 다름(`ZZSEARCHOPTIN`) | 0건(대소문자 구분) | **0** ✅ |

**타이밍 사이드채널은 실측하지 않았다(추정으로 남긴다)**: 3.6절은 "미존재 응답... 응답 시간도 상수에 가깝게 유지"를 요구한다. 이 함수의 정확 일치 경로(`handle = p_handle`)는 존재/미존재/옵트아웃 여부와 무관하게 항상 같은 형태의 단일 인덱스 조회(`profiles_handle_key` UNIQUE 인덱스 프로브)를 타므로 코드 경로상 분기가 없다는 **구조적 근거**는 있으나, 실제 응답 시간이 상수에 가까운지는 **측정하지 않았다**(MCP 경유 호출은 지터가 커서 안정적 측정이 애초에 어렵다). 이 프로젝트 규칙대로 추정과 실측을 구분해 명시한다 — **타이밍 상수성은 구조적 추론이며 실측되지 않았고, 실질적 방어선은 NFR-016(계정당 분당 20회 레이트리밋, v0.2 범위로 이미 이월)이다.**

## 8. system_admin 식별 — 판단과 이월

029A §7.5·§8.5가 남긴 질문: "관리자 기능을 029B에서 어떻게 다룰지 판단하고 문서화하라." **판단: 이번 회차 범위 밖으로 명시 이월한다.**

- 029B의 참조 결정(D-017·D-028·D-023·D-007, NFR-013, R-012) **어디에도 `system_admin`·관리자 콘솔이 없다.** 반면 D-008은 "관리자 콘솔은 v0.1에서 사실상 미사용"이라고 이미 정했다.
- `profiles.is_system_admin` 같은 컬럼을 추가하는 것 자체는 쉽지만, **"누가 이 값을 설정할 수 있는가"·"자기 자신을 관리자로 못 올리게 막는 방법"은 새로운 결정이 필요하다**(D-002가 "크루당 오너 1명"을 별도 결정으로 확정한 것과 같은 무게). 이걸 이번 문서 안에서 임의로 정하면 고객 확인 없는 결정을 슬쩍 끼워 넣는 것이 된다.
- **현재 상태 유지**: 관리자 기능은 `service_role` 경로로만 가능하다(029A와 동일). 스키마 추가·RLS 분기는 관리자 콘솔이 실제로 구현되는 시점(별도 Task)에 함께 결정하도록 이월한다.

## 9. 실측 검증 총괄

| 항목 | 결과 |
| --- | --- |
| `get_advisors(security)` — 헬퍼 4개 추가 직후 | `lints: []` |
| `get_advisors(security)` — poll_vote_tally·crew_directory_summary를 `public`+`security definer`로 처음 만들었을 때 | `anon_security_definer_function_executable`·`authenticated_security_definer_function_executable` WARN **3건**(둘 다 anon+authenticated 노출이 의도된 것이었지만, advisor는 의도를 모른다) |
| 위 WARN 해소 후(§6.2 방식 — private 원 구현 + public invoker 래퍼로 재구성) | `lints: []` |
| `get_advisors(security)` 최종 | **0건** |
| `get_advisors(performance)` 최종 | 029A가 이미 이월한 `unindexed_foreign_keys` 5건(내 정책이 참조하지 않는 028 기존 컬럼)·`unused_index` INFO 다수(0행이라 당연, 029A와 동일 판단) 외 **신규 항목 없음** |
| `pg_policies`(public) 총수 | **58건** — 029A 기준선 그대로(신규 정책 0건, 기존 2건의 qual만 확장) |
| `pg_policies`(realtime) 총수 | 2건(신규) |
| `private` 스키마 함수 수 | 6개(정책 헬퍼 4 + RPC 구현체 2) |
| `information_schema.routine_privileges` — `private.*` grantee | `authenticated`(+`crew_directory_summary`는 `anon`도) + `postgres`만. `anon`/`public`에 의도치 않은 grant 없음(실측) |
| 트랜잭션 롤백 검증 | crew_memberships 11개 시나리오(§3.3), poll_vote_tally 3개(§4), crew_directory_summary 2개(§5), profile_search(수정 후) 6개(§7) — **전부 실측, rollback 후 잔여 행 0건 재확인**. 커밋 사고 1건 발생 후 즉시 수동 정리 + 재확인(§10) |
| `profile_search` 수정 후 시그니처 | `(text) → table(handle, display_name, avatar_url)` — `information_schema.routine_privileges`로 구 시그니처 `(text, integer)` 잔존 0건 확인(DROP 처리됨) |
| `generate_typescript_types` 재생성 | `database.types.ts` 갱신, `poll_vote_tally`·`crew_directory_summary`·`profile_search`(수정 후 3필드 시그니처) `Functions`에 반영. `private.*`는 미노출이라 타입에도 나타나지 않음(§2.4 주장과 일치) |
| `npx tsc --noEmit` (재생성 후) | **exit 0**, 에러 0건(이 타입을 소비하는 앱 코드가 아직 없어 파괴적 변경 영향 없음) |

## 10. 작업 중 사고 기록 (정직하게 남긴다)

첫 crew_memberships 검증 시도에서 트랜잭션 끝에 `rollback` 대신 **`commit`을 실수로 적어 테스트 데이터 4명(auth.users·profiles)과 테스트 크루 1개가 실제로 커밋됐다.** 발견 즉시 `delete`로 역순 수동 정리(`crew_memberships`→`boards`/`chat_rooms`→`crews`→`profiles`→`auth.users`)하고 전 테이블 잔여 0건을 재조회로 확인했다. 이후 모든 검증은 반드시 `begin`/`rollback` 쌍을 한 SQL 호출 안에 넣고, 임시 결과 테이블(`on commit drop`)에 시나리오별 결과를 적재해 마지막 `select`로 한 번에 확인하는 방식으로 바꿨다. **원 데이터(실사용자·실크루)에 대한 영향은 없다** — 이번 회차는 아직 실사용자가 없는 상태(전 테이블 0행)였고, 정리 후 실측으로도 해당 UUID들이 존재하지 않음을 확인했다.

## 11. 범위 밖 이월 목록

1. **강퇴자 표 무효화 트리거**(FR-027 AC3 "강퇴 실행 시 진행 중 투표 표 무효 처리·정족수 분모 제외") — `poll_votes.invalidated`/`poll_eligible_voters` 갱신 트리거가 아직 없다. `poll_vote_tally`는 `invalidated=true`를 이미 걸러내도록 만들어 뒀으니, 트리거만 추가되면 즉시 반영된다.
2. **FR-024·FR-027 AC4 감사 로그** — `audit_logs` 쓰기 경로(트리거 또는 service_role)가 아직 없다(§3.2).
3. **profiles 컬럼 단위 self/타인 마스킹** — `profile_search`는 계약으로 3필드를 지키지만 원본 테이블 자체는 여전히 전 컬럼 공개다(§7).
4. **system_admin 식별·관리자 콘솔 RLS 분기** — 새 결정이 필요해 이월한다(§8).
5. **Realtime 브로드캐스트 트리거**(`chat_messages`/`polls`/`notifications`에 `realtime.broadcast_changes()` 부착) — Task 033(§6.2에 예시·인계 지침 남김).
6. **Realtime Authorization end-to-end 실측** — 환경 제약으로 정적 검증까지만 완료, 첫 실트래픽 시 재검증 필요(§6.3).
7. **크루 100개 초과 시 채널 한도 초과 동작**(R-019) — v0.2 설계로 이미 이월된 상태(029A/15일차), 이번에도 손대지 않음.

## 13. 16일차 교차검증(DESIGN) 대응 요약

리뷰어 DESIGN이 실측 검증 9개 항목 중 8개 PASS, 이슈 4건(major 2·minor 2)을 발견해 팀장이 확인 후 지시했다. 전건 이번 회차 안에서 해소했다.

| # | 이슈 | 해소 |
| --- | --- | --- |
| MAJOR 1 | `profile_search`가 `ilike '%..%'` 부분 일치로 구현돼 FR-006/R-012가 막으려던 사용자 열거를 재도입 | `p.handle = p_handle` 정확 일치로 좁힘(§7). 마이그레이션 `rls_fix_profile_search_exact_match` |
| MAJOR 2 | 같은 함수가 `id` 포함 4필드 반환 — NFR-013 "3필드만" 위반(팀장이 major로 승격) | `id` 제거, `profiles_handle_key` UNIQUE 실측 확인 후 handle 자체를 식별자로 채택. 초대 경로(FR-020)는 handle을 서버가 재해석하도록 인계(§7) |
| MINOR 3 | `database.types.ts`가 029A·029B 이후 미재생성(마지막 변경 Task 028) | MAJOR 1·2 수정 뒤 `generate_typescript_types` 재생성, `npx tsc --noEmit` exit 0 확인(§9) |
| MINOR 4 | `private` 격리가 대시보드 설정(Exposed schemas)에만 의존 — 코드로 회귀 방지 불가 | §2.4에 경고·확인 방법·운영 체크리스트 추가(DESIGN의 406 HTTP 실측 인용) |

**참고(이슈 아님)**: DESIGN이 "일반 멤버의 타인 role 변경이 예외를 안 던진다"고 잠깐 오판했다가 `GET DIAGNOSTICS row_count`로 재검증해 정상 차단(RLS `USING`은 예외가 아니라 조용히 0행 처리)임을 스스로 확인했다 — §3.3 시나리오 2와 일치, 구현 문제 아님.

### 13.1 DESIGN 재검증 — 지시 6개 항목 전부 PASS, 신규 MINOR 1건

DESIGN이 위 4건의 해소를 독립 재현(정확 일치 8개 시나리오 자체 재실행·`pg_proc`로 구 오버로드 `(text, integer)` 부재 확인·타입 파일에 `private.*` 미노출 확인·정책 58+2 불변·advisor 0건·잔여 행 0건)해 **전부 PASS**로 확인했다. 다만 §2.4 안에서 새 결함 1건을 발견했다.

| # | 이슈 | 해소 |
| --- | --- | --- |
| MINOR 5 | §2.4 체크리스트 항목 2(`current_setting('pgrst.db_schemas')` SQL 확인법)가 Supabase Cloud(호스티드)에서 항상 `NULL`을 반환해 확인 수단이 되지 못하는데, NULL을 "안전하다"로 오독할 위험이 있었다 | 자체 재확인(`current_setting('pgrst.db_schemas', true)` → `NULL`, `pg_db_role_setting`의 `authenticator` 설정에 `pgrst.db_schemas` 키 자체가 없음 — `session_preload_libraries`·`statement_timeout`·`lock_timeout`만 존재) 후 §2.4에서 해당 SQL 체크 항목을 제거하고, "이 GUC 경로는 호스티드 환경에 존재하지 않으며 NULL을 안전 신호로 오독하면 안 된다"는 경고로 교체. 유효한 확인 수단은 대시보드 육안 확인 + HTTP 프로브 둘뿐임을 명시 |

DESIGN이 추가로 판정한 것(수정 불필요, 근거만 문서화):

- **대소문자 구분 결정에 동의**: 3.6절·FR-006 어디에도 대소문자 규정이 없고, 핸들은 로그인 식별자처럼 정규화가 당연한 값이 아니라 사용자가 정한 표시용 식별자다 — "정확 일치" 문언이 대소문자를 특정하지 않으므로 문언 위반이 아니라 UX 트레이드오프이며, 정규화가 필요하면 가입 플로우(FR-001)에서 새로 결정할 사안이라는 이월 판단이 타당하다고 봤다. 추가 조치 없음.
- **타이밍 사이드채널은 실측 불가 판정** — §7에 "구조적 추론이며 실측되지 않았다, 실질 방어선은 NFR-016" 문구를 추가했다(위 §7 참고).
- **README.md FR-020 인용 오프셋** — `:516`으로 적었던 줄번호가 실제로는 511 근방이었다(사소한 오프셋, 이슈로 잡히지 않음). 줄번호는 문서가 바뀌면 다시 어긋나므로 "FR-020 정상 흐름 ②" 같은 절 참조로 바꿨다(§7·README.md 갱신).

## 14. 18일차 후속 — `profile_search`에 레이트 리밋을 SQL 강제 경계로 이전(구조적 결함 수정)

**배경**: 18일차 Task 032·038 교차검증에서 같은 패턴의 구조적 문제가 세 번 발견됐다 —
`respond_meetup_attendance`의 정원 판정이 RPC 밖(앱 레이어)에만 있었던 것(수정: DESIGN),
`crew_memberships` 강퇴자 재신청 차단이 앱 레이어에만 있었던 것(수정: CORE, §13.1 아님 —
`crew_memberships_block_removed_self_reapply` 마이그레이션), 그리고 `profile_search`의
D-005 레이트 리밋(계정당 분당 20회)이 `search-user-by-handle.ts` Server Action에만 있고
RPC 자체에는 없었던 것 — `authenticated`에게 이미 `EXECUTE` 권한이 있어(§7) publishable
key로 이 RPC를 앱을 거치지 않고 직접 호출하면 리밋이 전혀 적용되지 않았다(Task 038 교차검증
실측 확인).

**수정**(마이그레이션 `profile_search_enforce_rate_limit_in_rpc`): `private.profile_search`
(SECURITY DEFINER, 원래 조회 로직 그대로 + `handle_search_attempts` 카운트 체크·기록) +
`public.profile_search`(얇은 SECURITY INVOKER 래퍼) 2단 구조로 바꿨다 — §5(`crew_directory_
summary`)·§4(`poll_vote_tally`)와 정확히 같은 패턴이다. SECURITY DEFINER가 필요한 유일한
이유는 `handle_search_attempts`가 `anon`/`authenticated` 완전 거부 RLS라 invoker 컨텍스트
에서는 그 INSERT 자체가 막히기 때문이다(조회 로직 자체는 `profiles_select_authenticated`가
이미 `qual=true`라 애초에 RLS 우회가 필요 없었다). `public` 래퍼는 원래 `STABLE`이었으나
이제 내부에서 부수효과(INSERT)가 있어 `VOLATILE`(기본값)로 바꿨다 — STABLE로 잘못 선언하면
옵티마이저가 호출을 생략해 리밋 기록이 누락될 수 있다.

**역할 분담(팀장 지시로 명시)**: **SQL(`private.profile_search`)이 강제 경계**다 — 호출
경로(Server Action이든 publishable key 직접 호출이든)와 무관하게 20회를 넘기면 예외로
거부된다. **`src/lib/rules/rate-limit.ts` + `search-user-by-handle.ts`(앱 레이어)는 UX만
담당**한다 — SQL까지 왕복하지 않고 429 안내·`retryAfterSeconds`를 먼저 보여주는 선제 체크일
뿐, 이게 없어도 SQL이 최종적으로 막는다. 두 곳의 숫자(`{limit:20, windowSeconds:60}`)는
반드시 같은 값으로 유지해야 한다 — 어긋나면 다음 회차가 어느 쪽을 신뢰할지 모른다.

**실측(트랜잭션 롤백)**: `authenticated`로 `profile_search`를 21회 연속 호출 → 1~20회
정상 응답(3필드: `handle`·`display_name`·`avatar_url`), **21회째 정확히 예외로 차단**.
부분 일치(`'seed_owner'`로 `'seed_owner02'` 검색) → 0건(정확 일치 유지 확인). `anon`
EXECUTE 없음(`grantee` 목록에 `authenticated`·`postgres`·`service_role`만). `get_advisors
(security)` — WARN 1건(`auth_leaked_password_protection`, 기존과 동일)뿐, 신규 0건.
`database.types.ts`는 함수 시그니처·반환형이 원래와 동일해 재생성 불필요(대조 확인).

**⚠️ 이 리밋은 `profile_search` 경로만 보호하며, 앱의 실제 검색 경로와 `profiles` 직접
조회는 보호하지 않는다(18일차, 팀장 재실측으로 발견 — `I-058`).** `src/lib/actions/
search-user-by-handle.ts`(FR-006 실제 UI 경로)는 이 RPC를 호출하지 않고 `getProfileByHandle`
(`profiles` 직접 `select("*")`, 3필드 제한도 옵트아웃 필터도 없음)을 쓴다 — RPC를 경유하는
`searchProfilesByHandle`은 소비자가 없다. 게다가 `profiles_select_authenticated`(qual=true,
Task 029A)가 이미 전 컬럼·전 행을 인증 사용자 전체에 공개하고 있어, 이 리밋이 막는 것은
"RPC를 직접 호출하는 경로"뿐이고 "핸들 검색 리밋은 끝났다"고 오독하면 안 된다. 상세·영향·
후속 두 갈래는 `I-058`이 단일 소스다.

**`audit_logs`를 아무도 못 읽는 것에 대한 판단(팀장 채택)**: NFR-015 원문("100% 기록")은
조회 가능성을 요구하지 않고, 감사 로그 열람 UI는 D-008로 이미 v0.1 범위 밖이다 — 결함이
아니다. 관리자 콘솔(Task 042B 등 후속)이 실제로 만들어지는 시점에 읽기 정책을 추가하면
된다. 이 판단을 다음 회차가 다시 조사하지 않도록 여기 남긴다.

## 15. 18일차 후속(2) — `invitations` INSERT WITH CHECK에 `requested` 대상 차단 추가

**배경**: Task 032 major 2(`requested` 상태 사용자 초대 차단)는 `src/lib/rules/invite-
eligibility.ts`(앱 레이어)에서만 막혀 있었다. `invitations_insert_staff_or_owner`(029A)의
WITH CHECK는 초대 대상(invitee)의 현재 `crew_memberships.status`를 전혀 보지 않아, 앱을
거치지 않고(스크립트·향후 다른 클라이언트) `invitations`에 직접 INSERT하면 그 차단이
우회됐다(실측 확인) — 대상자가 초대를 수락해도 `invitations_provision_membership()`의
`ON CONFLICT WHERE` 목록에 `requested`가 없어 `crew_memberships`가 `requested`에 멈춘 채
UI·DB 양쪽이 "성공"으로 보이는 조용한 실패가 재현됐다.

**팀장 판정 — 트리거를 건드리지 않는 이전 결정과 모순이 아닌 이유**: 이전에 기각한 안은
`invitations_provision_membership()`의 `ON CONFLICT WHERE` 목록에 `requested`를 **추가**해
2.4절 상태도에 없는 `requested → invited` 전이를 **새로 만드는** 것이었다. 이번 조치는
정반대로 그 전이를 RLS `WITH CHECK`로 **금지**하는 것이라 같은 상태도를 근거로 하되
일관된 결정이다. 트리거는 이번에도 손대지 않았다.

**수정**(마이그레이션 `invitations_block_requested_target_at_rls`): `invitations_insert_
staff_or_owner` 정책을 `drop` + `create`로 재정의해 세 번째 조건 `not exists (select 1 from
crew_memberships cm2 where cm2.crew_id = invitations.crew_id and cm2.profile_id =
invitations.invitee_id and cm2.status = 'requested')`를 추가했다. `private` SECURITY
DEFINER 헬퍼 없이 직접 서브쿼리로 처리했다 — 이 정책을 통과하려면 호출자가 이미 그 크루의
활성 staff/owner여야 하고, `crew_memberships_select_self_or_fellow_member`(§3.1)의 qual이
활성 크루원에게 같은 크루 다른 사람 행의 SELECT를 이미 허용하므로 우회가 필요 없다. 재귀
걱정도 없다 — `crew_memberships`의 정책은 `invitations`를 참조하지 않아 정책 A→B→A 순환이
생기지 않는다(029A §2와 같은 논증). 서브쿼리 안에서 바깥 행을 가리킬 때
`invitations.crew_id`/`invitations.invitee_id`로 테이블 한정해, 서브쿼리 자체 별칭(`cm2`)과
이름이 겹쳐 스코프가 안쪽으로 잘못 잡히는(자기 자신과 비교하는 항진명제가 되는) 사고를
피했다.

**실측(트랜잭션 롤백, 5개 시나리오 전부 기대와 일치)**:
- (a) `requested` 상태 대상에게 오너가 직접 INSERT → **거부**(`new row violates row-level
  security policy`).
- (b) 비멤버(관계 행 자체가 없는) 대상 초대 → **성공**(FR-020 AC1 회귀 없음).
- (c) `declined` 대상 재초대 → **성공**(FR-021 AC2 회귀 없음).
- (c2) `removed` 대상 재초대 → **성공**(FR-020이 강퇴 이력에 재초대 제한을 두지 않는다는
  원래 판단 유지).
- (d) 일반 크루원(`role=member`)의 초대 INSERT 시도 → **거부**(FR-020 AC3, 기존 그대로).
- `pg_policies`로 `invitations` 정책 재확인 — 여전히 4건(중복 생성 없음).
- `get_advisors(security)` — WARN 1건(`auth_leaked_password_protection`, 기존과 동일)뿐,
  신규 0건.

## 12. 산출물

- `supabase/migrations/2026072501{5228,5307,5601,5614,5631,5645,5801}_*.sql` — 마이그레이션 7건(최초 구현).
- `supabase/migrations/20260725022234_rls_fix_profile_search_exact_match.sql` — 16일차 교차검증 MAJOR 1·2 수정.
- 정책 총 **58건**(public, 불변) + **2건**(realtime, 신규). `private` 스키마 함수 **6개**.
- `src/lib/data/supabase/database.types.ts` — 재생성.
- 본 문서.
- `docs/ROADMAP/team/01.CORE.md` Task 029B 완료 마커.
- `src/lib/data/supabase/README.md` 갱신(profile_search 시그니처 변경·FR-020 인계·§2.4 경고 반영).

## 16. 19일차 후속 — I-058 해소: `profiles_select_authenticated` self-row 좁히기 + 공개 프로필 RPC 2종

**배경**: §7·§11-3·18일차 §14가 이미 "잔여 위험"으로 이월해 온 것 — `profiles_select_
authenticated`(029A, `qual=true`)는 로그인한 계정이면 누구나 `profiles` 테이블을
`.select("*")`로 직접 조회할 수 있게 열려 있었다. 팀장이 실측으로 재확인(18일차 I-058
제보): `set local role authenticated`로 21행 전부(옵트아웃 1건 포함) 덤프 가능. Task
039(계정 생애주기)로 `deactivated`(파기 전, 실 PII 보유) 계정까지 blast radius가 확대돼
19일차에 직접 배정받아 해소했다.

### 16.1 조사 — 어느 경로가 `profiles`의 어떤 컬럼을 읽는가(전수)

`src/lib/data/supabase/*.ts` 중 `profiles`를 직접 참조하는 파일은 **`profile.ts` 하나뿐**이다
(board·chat·crew·meetup·poll·notification·invitation·join-request 도메인 모듈은 임베디드 FK
join을 쓰지 않는다 — grep 확인, `database.types.ts`의 `referencedRelation` 문자열만 걸린다).
따라서 실제 소비 지점은 `getProfileById`·`getProfileByHandle`·`searchProfilesByHandle`
(모두 `profile.ts`)을 호출하는 컨테이너·Server Action 쪽이다.

| 호출부 | 함수 | 대상 행 | 실제로 읽는 필드 |
| --- | --- | --- | --- |
| `getAuthSession`(세션 부트스트랩) | `getProfileById` | **self** | 전 컬럼(`status`·`deactivatedAt`·`onboardingCompletedAt` 등 판정에 사용) |
| `AccountSettingsContainer`·`OnboardingFormContainer` | `getProfileById` | **self** | 전 컬럼 |
| `BoardListContainer`·`PostDetailContainer`(게시글 작성자) | `getProfileById` | 타인 | `displayName`·`avatarUrl` |
| `MessageListContainer`·`load/resync/send-chat-message`(발신자)·`resolve-post-link-card`(원글 작성자) | `getProfileById` | 타인 | `displayName`·`avatarUrl` |
| `CrewMembersContainer`(멤버·가입신청자 2곳) | `getProfileById` | 타인 | `displayName`·`handle`·`avatarUrl` |
| `InvitationInboxContainer`(초대자) | `getProfileById` | 타인 | `displayName`·`avatarUrl` |
| `MeetupDetailContainer`(참석자 3구분) | `getProfileById` | 타인 | `displayName`·`avatarUrl` |
| `check-handle-availability.ts` | `getProfileByHandle` | 자기 자신 또는 타인 | `id`만(중복 판정용, 화면 미노출) |
| `invite-crew-member.ts` | `getProfileByHandle` | 타인 | `id`만(초대 레코드 생성용, 화면 미노출) |
| `signup.ts` | `getProfileByHandle` | 타인(가입 전이라 대부분 anon 컨텍스트) | 존재 여부(truthy)만 |
| `search-user-by-handle.ts`(FR-006) → `projectHandleSearchResult` | `getProfileByHandle` | 타인 | `handle`·`displayName`·`avatarUrl`·`status`·`searchOptOut` |

**결론**: 타인 행에서 `bio`·`search_opt_out`(FR-006 경로 제외)·`anonymized_at`·
`deactivated_at`·`handle_changed_at`·`onboarding_completed_at`을 읽는 호출부는 **0건**이다.
self 행만 전 컬럼이 필요하다. `pg_policies` 실측(변경 전)은 §11의 `qual=true` 그대로였고,
`set local role authenticated`로 재현한 덤프 결과는 아래 16.4 참고.

### 16.2 설계 대안 비교

| 대안 | 설명 | 회귀 위험 | 구현 비용 | 채택 |
| --- | --- | --- | --- | --- |
| A. RLS만으로 self 전체/타인 공개 필드 분리 | 정책 `qual`을 행별 조건으로 표현 | **불가능** — RLS는 행 단위 필터만 표현하고 컬럼 단위 마스킹을 지원하지 않는다. 컬럼 단위 GRANT/REVOKE는 역할 전역이라 "self면 전체 허용"과 공존할 수 없다 | — | 기각(이론적으로 성립하지 않음) |
| B. 컬럼 마스킹 뷰(`public.profiles`를 뷰로, 원본을 `private.profiles`로 이관) | `CASE WHEN id = auth.uid() THEN col ELSE NULL END`로 컬럼별 마스킹 | 테이블명 자체를 바꾸는 대규모 변경 — FK 참조 12개(§ 마이그레이션 파일 목록의 `references public.profiles`) 전부 재확인 필요, PostgREST의 뷰 через INSERT/UPDATE 처리(`instead of` 트리거) 추가 필요, 029A·029B가 이미 검증한 58개 정책·헬퍼 전체에 영향 가능 | 높음(테이블 이관 + 트리거) | 기각 — 이번 회차 범위 대비 과함, 기존 검증 자산을 흔든다 |
| **C. RLS self-row 좁히기 + 타인 조회 전용 SECURITY DEFINER RPC 2종(채택)** | `profiles_select_authenticated`를 `id = auth.uid()`로 좁히고, `crew_directory_summary`(029B, D-007)와 같은 패턴으로 `private.get_profile_public_by_{id,handle}`(SECURITY DEFINER, 컬럼 제한) + `public.*` 얇은 INVOKER 래퍼 신설 | **없음(전수 조사로 확인)** — `getProfileById`/`getProfileByHandle`을 "직접 조회 실패 시 공개 RPC 폴백" 2단으로 바꿔 함수 시그니처·반환 타입·모든 호출부(컨테이너·Server Action)를 그대로 유지 | 낮음 — 마이그레이션 1건 + `profile.ts` 내부 구현만 변경 | **채택** |

C를 채택한 결정적 이유: **호출부를 전혀 바꾸지 않고 닫을 수 있다.** 16.1 조사가 확인한 대로
모든 "타인 행" 소비자가 정확히 `handle`·`displayName`·`avatarUrl`(+ 내부용 `id`, FR-006용
`status`·`searchOptOut`)만 쓰므로, 그 합집합만 반환하는 RPC 폴백이 기존 동작을 바이트 단위로
재현한다 — CLAUDE.md D-030 "조회부만 교체" 원칙과 같은 결의 적용이다.

### 16.3 적용

마이그레이션 `profiles_narrow_select_policy_and_public_profile_rpcs`
(`supabase/migrations/20260725085327_*.sql`):

1. `profiles_select_authenticated`를 `drop`+`create`로 재정의 — `qual: id = (select auth.uid())`.
2. `private.get_profile_public_by_id(p_id uuid)`(SECURITY DEFINER, `stable`) — `id·handle·
   display_name·avatar_url·status` 5필드. **상태 필터 없음** — 게시글·채팅·모임 참석자 등
   "작성자 표기"는 계정이 탈퇴 유예·익명화 상태여도 계속 보여야 한다(익명화 시점에
   `display_name` 자체가 이미 "탈퇴한 사용자"로 바뀌므로 필터가 필요 없다). `public.*` 얇은
   INVOKER 래퍼, `authenticated`에게만 EXECUTE(`anon` 배제 — 기존에도 `anon`은 `profiles`에
   정책이 없었으므로 노출 범위를 넓히지 않는다).
3. `private.get_profile_public_by_handle(p_handle text)`(SECURITY DEFINER, `stable`) —
   `id·handle·display_name·avatar_url·status·search_opt_out` 6필드. handle 정확 일치. 상태
   필터 없음 — 핸들 유일성 확인(가입·초대)은 탈퇴·정지 계정이 쓰던 핸들도 "사용 중"으로
   봐야 한다. `search_opt_out`·`status`를 반환하는 이유는 FR-006 경로
   (`projectHandleSearchResult`)가 그 두 값으로 옵트아웃·비활성 판정을 계속하기 때문 — 이
   RPC 자신은 그 판정을 하지 않는다(R-012 "동일 코드 경로" 불변식은 앱 레이어 몫 그대로).
   같은 2단 구조, `authenticated`에게만 EXECUTE.
4. `src/lib/data/supabase/profile.ts` — `getProfileById`·`getProfileByHandle`을 "원본 테이블
   직접 조회 → (self면 성공, 타인이면 RLS가 0행) → 0행이면 위 RPC로 폴백" 2단으로 재구현.
   호출부(컨테이너 7개·Server Action 4개) **무변경**. `database.types.ts` 재생성(`npx tsc
   --noEmit` exit 0).

### 16.4 실측(트랜잭션 롤백, `chopin0625` 계정으로 impersonate)

| 시나리오 | 변경 전 | 변경 후 |
| --- | --- | --- |
| `authenticated`로 `select count(*), count(*) filter(where search_opt_out) from profiles` | **`total=21`, `opted_out=1`**(팀장 18일차 실측과 일치 재현) | **`total=1`, `opted_out=0`**(self 1행만) |
| `authenticated`로 타인 행(`seed_outsider02`, 옵트아웃) 직접 `select * from profiles where handle=...` | `display_name`·`bio`·`status`·`search_opt_out` 전부 노출 | **0행**(RLS 차단) |
| `authenticated`로 self 행 직접 조회 | 전 컬럼 노출(변경 없음) | **전 컬럼 그대로 노출**(회귀 없음 확인) |
| `authenticated`로 `get_profile_public_by_id(타인 id)` | (RPC 부재) | `id·handle·display_name·avatar_url·status`만(`bio`·`search_opt_out` 없음) |
| `authenticated`로 `get_profile_public_by_handle('seed_outsider02')` | (RPC 부재) | `id·handle·display_name·avatar_url·status·search_opt_out=true` — FR-006 앱 필터가 여전히 이 값으로 옵트아웃을 걸러낼 수 있음 확인 |
| 존재하지 않는 id/handle로 두 RPC 호출 | — | 0행(에러 아님) |
| `anon`으로 직접 조회·두 RPC 호출 | 0행(정책 없음) | **동일하게 0행/`permission denied for function`**(노출 범위 확대 없음) |
| `get_advisors(security)` | WARN 1건(`auth_leaked_password_protection`, 기존) | **동일 1건, 신규 0건** |
| `pg_policies`(profiles) | 3건(`insert_self`·`select_authenticated`·`update_self`) | **동일 3건**(정책 개수 불변, `select_authenticated`의 `qual`만 변경) |

### 16.5 회귀 확인 — 읽기 경로(코드 레벨)

`npx tsc --noEmit` exit 0(변경 후). 16.1 조사표의 7개 컨테이너·4개 Server Action 전부 함수
시그니처·반환 타입이 그대로라 **코드 변경 없이** 계속 동작한다 — 실제 화면
렌더(브라우저 실행)로 재확인하지는 못했다(`npm run dev`/`build`는 팀장 전용, 이번 회차
제약). 이 재확인은 DESIGN의 브라우저 검증이나 다음 회차 실사용 트래픽에서 대신 확인되어야
한다 — 이 문서가 코드 레벨 정적 확인까지만 했다는 한계를 명시해 둔다.

### 16.6 남은 위험·의도적으로 손대지 않은 것

- **`signup.ts`의 핸들 중복 사전 확인(87행)은 이번 변경과 무관하게 이미 무력화돼 있었다** —
  `getProfileByHandle`이 `signUpWithPassword` **이전**(세션 없음, `anon` 컨텍스트)에 호출된다.
  `anon`은 이번에도 이전에도 `profiles`·신규 RPC 어디에도 접근 권한이 없어(`roles=
  {authenticated}`만 부여) 이 사전 확인은 실제로는 "항상 미사용"으로 응답했을 가능성이 있다
  — 최종 방어는 `createProfile`의 `23505` 유니크 제약 처리(이미 있음)가 맡는다. **이번
  회차가 만든 결함이 아니고, I-058의 범위(인증된 사용자의 과다 노출) 밖이라 손대지 않았다**
  — 새 이슈로 등재할지는 팀장 판단에 맡긴다.
- **`get_profile_public_by_id`/`by_handle`은 상태·탈퇴 필터가 없다** — "작성자 표기" 용도에는
  의도된 설계이지만, 이 두 RPC를 다른 용도(예: 향후 "회원 검색" 기능 확장)로 재사용하면
  `profile_search`가 가진 R-012 방어(옵트아웃·비활성 배제)가 없다는 것을 그 시점 구현자가
  반드시 인지해야 한다 — 이름에 `public`이 들어가지만 "검색 안전"을 의미하지 않는다.
- **id 기반 RPC는 UUID 하나씩만 조회**하므로 자원 존재 확인(다른 사람의 UUID를 알면 그
  사람이 가입돼 있다는 사실 자체는 확인 가능)이 이론상 남는다 — 이는 예전에도 동일했고
  (qual=true가 이미 그 확인을 허용했다), UUID는 추측 불가능한 값이라 실질 위험은 낮다고
  판단해 범위에 넣지 않았다.
- **컬럼 마스킹 뷰(대안 B)는 채택하지 않았다** — 위 16.2 표 참고. 향후 `profiles` 테이블
  자체의 구조를 바꿀 계획이 생기면 재검토 대상이다.

## 17. 19일차 같은 날 팀장 교차검증 — major① 수정: `get_profile_public_by_handle` 삭제

**§16이 만든 `get_profile_public_by_handle`가 팀장 교차검증에서 새로운 구멍으로 지적됐다.**
실측(`pg_get_functiondef`·`information_schema.routine_privileges`·`provolatile`): 이 함수는
`authenticated` EXECUTE가 있고 `STABLE`(부수효과 불가 — 그래서 리밋 카운터 INSERT를 넣을 수
없는 구조)이며 `search_opt_out`까지 포함한 6필드를 반환했다. 귀결: 로그인한 아무 계정이나
publishable key로 **임의 핸들을 무제한 조회**할 수 있었고, 그 핸들의 존재 여부는 물론
**옵트아웃 여부**까지 얻을 수 있었다 — D-005(분당 20회)·R-012(열거 방지)·FR-006 옵트아웃이
`profiles` 대신 이 새 RPC에서 다시 우회됐다. 18일차 §14가 `profile_search`에 대해 남긴 한계
문장("이 리밋은 RPC를 직접 호출하는 경로만 보호한다")이 그대로 반복된 것 — 이번엔 그 RPC를
만든 사람(CORE) 스스로가 같은 실수를 반복했다는 뜻이다.

### 17.1 부수적으로 발견한 라이브 회귀

§16의 2단 폴백(`getProfileByHandle`도 `getProfileById`와 같은 "직접조회 → RPC 폴백" 구조)은
`signup.ts`(87행)에서 실제로 실행되면 문제가 있었다 — 이 호출은 `signUpWithPassword`
**이전**, 즉 세션이 없는 `anon` 컨텍스트에서 일어난다. `anon`은 `get_profile_public_by_handle`
에 EXECUTE가 없으므로 그 RPC 호출이 `permission denied for function` 오류를 반환하고,
`profile.ts`의 `if (pubError) throw pubError`가 이를 그대로 던져 **회원가입 핸들 중복 검사
자체가 예외로 깨지는 상태**였다(실측: `set local role anon`으로 재현). 배포·실사용 노출 전에
팀장 교차검증에서 발견됐다 — `docs/ISSUES.md` **I-062**로 등재(상태: 해소).

### 17.2 수정 — 옵션 (b) 채택: 내부 재해석과 사용자 검색을 다른 경로로 분리

팀장이 제시한 두 옵션 중 (b)를 채택했다(옵션 (a) — `by_handle`을 `VOLATILE`로 바꿔 리밋
+ FR-006 필터를 그 안에 넣는 안 — 은 기각):

- **채택 이유**: 내부 판정용(handle→id 재해석)과 사용자 노출용(FR-006 검색)이 한 함수에
  섞여 있던 것이 이 결함의 근인이다 — 분리하면 "이 함수는 누구에게 무엇을 노출하는가"가
  함수 단위로 자명해진다. 비용도 낮았다 — `getProfileByHandle`의 실 소비자가 3곳뿐이고
  (`check-handle-availability.ts`·`invite-crew-member.ts`·`signup.ts`), FR-006 소비자는
  `search-user-by-handle.ts` 1곳뿐이라 재배선 범위가 작았다(옵션 (b)가 비용 크면 (a)로
  가라는 단서가 있었으나 필요 없었다).

**적용**(마이그레이션 `profiles_drop_public_handle_lookup_rpc_i058_major1`):

1. `public.get_profile_public_by_handle`·`private.get_profile_public_by_handle` **완전
   삭제**(drop function). 이제 handle 기준으로 임의 프로필을 조회할 수 있는 client-invokable
   엔드포인트가 하나도 없다.
2. `src/lib/data/supabase/profile.ts` — `getProfileByHandle`을 service-role 클라이언트로
   직접 조회하도록 재구현(2단 폴백 제거, RLS 자체를 우회하므로 self/타인/anon 컨텍스트 구분이
   필요 없다). 모듈 docstring에 "FR-006 검색에 쓰면 안 된다"를 명시.
3. `src/lib/actions/search-user-by-handle.ts` — `getProfileByHandle` 대신
   `searchProfilesByHandle`(`profile_search` RPC 경유)을 쓰도록 재배선. RPC가 0~1건만
   반환하므로 배열의 첫 항목만 `projectHandleSearchResult`에 넘긴다.
4. `src/lib/rules/handle-search.ts` — `status !== "active"` 필터가 이제 이 경로에서는
   방어적 이중 확인(RPC가 이미 필터)이 됐다는 설명으로 docstring 갱신(제거는 하지 않음 —
   이 함수는 여전히 다른 호출부가 상태 필터 없는 값을 넘길 가능성에 대비해야 하는 순수
   함수다, D-029 정신).
5. `database.types.ts` 재생성 — `get_profile_public_by_handle`이 `Functions`에서 사라짐.
   `get_profile_public_by_id`는 그대로(팀장 판단으로 수정 대상 제외 — 아래 17.4).

### 17.3 실측(트랜잭션 롤백)

| 시나리오 | 결과 |
| --- | --- |
| `authenticated`로 `public.get_profile_public_by_handle(...)` 호출 | `42883 undefined_function` — 완전 삭제 확인 |
| `service_role`로 `select * from profiles where handle=...`(= 새 `getProfileByHandle`이 실제로 하는 것) | 정상 조회, self/타인 구분 없음(RLS 완전 우회) |
| `service_role`로 `request.jwt.claims`를 비운 채(= `auth.uid()` null, `signup.ts`의 실제 anon 컨텍스트 재현) 같은 조회 | **정상 조회**(`found:true`) — 이전엔 여기서 예외가 났던 지점 |
| `authenticated`로 `profile_search('seed_outsider02')`(옵트아웃 계정) | 0건(기존과 동일, 이번 수정과 무관해 회귀 없음 재확인) |
| `authenticated`로 `profile_search('seed_owner02')`(일반 계정) | 3필드 정상 반환(회귀 없음) |
| `pg_policies`(profiles) | 3건 그대로(이번 수정은 함수만 다뤘다) |
| `get_advisors(security)` | 신규 WARN 0건(기존 `auth_leaked_password_protection` 1건 + CREW `disband_crew`의 `authenticated_security_definer_function_executable` 1건은 각각 기존/타 팀원 소관, 이번 수정과 무관) |
| `npx tsc --noEmit` | 내가 바꾼 4개 파일(`profile.ts`·`search-user-by-handle.ts`·`handle-search.ts`·`database.types.ts`) 관련 에러 0건. 무관한 에러 2건(`NotificationItem.tsx`·`simulate-notification-event.ts`, `NotificationType`에 `ownership_transferred`·`crew_disbanded` 누락 — CREW의 Task 040 동시 작업으로 보임)은 확인만 하고 손대지 않았다(파일 소유권 밖) |

### 17.4 minor② — 타인 프로필 조회가 왕복 2회가 된 것에 대해

`getProfileById`는 "직접조회(0행) → `get_profile_public_by_id` RPC 폴백" 구조라 **타인
프로필 조회는 항상 왕복 2회**다(self 조회는 1회). `BoardListContainer`·`MessageListContainer`
·`CrewMembersContainer`처럼 게시글/메시지/멤버마다 작성자를 조인하는 화면은 N명이면 최대
2N회 왕복이 된다(현재 구현이 `Promise.all`로 병렬화하므로 순차 합산은 아니다).

**고치지 않는다** — 측정 근거 없이 최적화하지 않는다(D-029 정신, CLAUDE.md). 폴백 순서를
뒤집는 대안(타인 행은 처음부터 RPC로 가고, self만 직접 조회를 시도)도 검토했으나 채택하지
않았다 — 어차피 호출 시점에는 "이 id가 self인지 타인인지" 앱 레이어가 미리 알지 못해(각
컨테이너가 `session.profileId`와 대상 id를 비교하는 코드를 새로 추가해야 한다) 결국 호출부
변경이 필요해지고, 이는 §16.2에서 대안 C를 채택한 핵심 이유("호출부 무변경")와 충돌한다.
INP(NFR-001) 목표에 실제로 영향을 주는지는 이번 회차에서 측정하지 않았다 — **알려진 비용으로
문서에 남기고, 실측(브라우저 프로파일링) 없이는 손대지 않는다.** 다음에 이 경로가 성능
문제로 제보되면 이 문단이 원인 후보 1순위다.

### 17.5 by_id는 왜 그대로인가(팀장 확인)

`get_profile_public_by_id`는 이번 수정 대상이 아니다 — UUID는 추측 불가능하고(오라클 공격에
필요한 "낮은 비용의 총당량" 전제가 성립하지 않는다), "작성자 표기"라는 용도가 명확해 리밋이
없어도 실질 위험이 낮다고 팀장이 판단했다. §16.6의 잔여 위험 1·2번 서술은 그대로 유효하다.

### 17.6 절차 사고(정직하게 남긴다) — drop 마이그레이션의 로컬 파일이 한동안 없었다

**무엇이 잘못됐나**: `apply_migration`으로 `get_profile_public_by_handle` 삭제를 원격에
적용한 뒤(원격 version `20260725090854`), 곧바로 로컬에 같은 이름의 파일을 만들었어야
했는데(CLAUDE.md I-051 절차) **만들지 않고 넘어갔다** — 실측·앱 코드 수정·문서화(17.1~17.4)에
집중하다 이 단계 자체를 빠뜨렸다. 팀장이 `supabase/migrations/`를 직접 뒤져 `090854`로
시작하는 파일이 0개임을 발견하고서야 드러났다.

**왜 위험했나**: 로컬 마이그레이션 디렉터리를 새 환경(다른 개발자·CI·재해복구)에 리플레이하면
`20260725085327`(`get_profile_public_by_handle`을 **생성**하는 마이그레이션)까지만 적용되고,
그것을 지우는 마이그레이션이 로컬에 없으니 **무제한 핸들 오라클 RPC가 그 새 환경에 다시
만들어진다** — 원격 DB만 안전하고 저장소(코드) 이력은 취약한 상태로 남아 있었다. I-051이
경고한 "원격 적용이 로컬 파일을 만들지 않는다"는 한계가 실제로 보안 결함을 재도입할 수 있는
형태로 나타난 사례다.

**수정**: `supabase_migrations.schema_migrations`에서 `version='20260725090854'`의
`statements`를 그대로 읽어 `supabase/migrations/20260725090854_profiles_drop_public_handle_
lookup_rpc_i058_major1.sql`을 새로 만들었다(내용이 내가 `apply_migration`에 넘긴 SQL과
바이트 단위로 일치함을 원격 조회로 재확인). `20260725085327` 파일은 **수정하지 않았다** —
이미 그 내용 그대로 원격에 적용된 상태라, 파일을 고치면 "적용된 것과 다른 이력"이 되어
오히려 더 나빠진다(삭제는 후속 마이그레이션으로 표현하는 것이 정석이고, 지금 두 파일 구성이
바로 그 형태다). `list_migrations` 원격 목록과 로컬 파일을 1:1 대조: `20260725085327`↔
`..._profiles_narrow_select_policy_and_public_profile_rpcs.sql`,
`20260725090854`↔`..._profiles_drop_public_handle_lookup_rpc_i058_major1.sql` — 내 소관
두 건 모두 일치 확인.

**새 절차(이번 사고로 확정)**: `apply_migration` 호출 직후, 다른 어떤 작업(앱 코드 수정·문서화
등)보다 **먼저** `list_migrations`로 그 호출이 만든 정확한 `version`을 확인하고, 그 값을
그대로 파일명 타임스탬프로 써서 로컬 파일을 즉시 만든다 — 나중에 몰아서 하지 않는다. 이번
회차 두 번째 마이그레이션(`090854`)에서 이 순서를 건너뛴 것이 사고 원인이었다.

## 18. 19일차 추가 배정 — I-066 해소(SQL 절반): 해산된 크루의 쓰기 차단

**배경**: CREW가 Task 040(크루 생애주기) 구현 중 등재하고 BOARD가 교차검증(리뷰 짝)에서
"API 우회가 필요한 게 아니라 평상시 UI 클릭만으로 항상 재현된다"고 심각도를 올린 결함 —
`(app)/crews/[crewId]/layout.tsx`(D-039 게이트)도 `crews.status`를 보지 않아, 해산된 크루의
이전 멤버가 URL 이동만으로 글쓰기 폼에 도달한다. 팀장이 이 사실로 최초의 "다음 회차 이월"
판단을 뒤집어 이번 회차에 SQL 절반을 배정했다(UI/라우트 게이트 절반은 BOARD 소관).

### 18.1 전수 조사와 범위 판정

`crew_memberships.status`(멤버십 상태)만 확인하고 `crews.status`(크루 자체 상태)는 보지
않는 INSERT/UPDATE 정책을 `pg_policies` 전수 조회로 찾았다. 판정:

- **포함**: `posts_insert_members`·`comments_insert_members`·`chat_messages_insert_members`
  (I-066 원문이 명시한 "게시글 작성·채팅 발신"), `invitations_insert_staff_or_owner`·
  `join_requests_insert_self_public_crew`(팀장이 "초대 등"으로 예시를 든 범위).
- **제외 ①**: `crews`·`crew_memberships` 테이블 자체의 정책. 팀장 지시 — CREW가 `disband_crew`
  를 029B 2단 구조로 재구성 중(`disband_crew_move_to_private_wrapper`, 20260725093855)이라
  같은 SQL 영역이다. "크루 정보 수정" 차단(`crews_update_staff_or_owner`)은 이 제외에 걸려
  이번 범위 밖으로 이월한다 — I-066 원문 3대 증상(게시글 작성·채팅 발신·크루 정보 수정) 중
  마지막 하나는 이번에 닫지 못했다.
- **제외 ②**: `posts`/`comments`/`chat_messages`의 UPDATE(수정·소프트삭제). I-066 원문의
  핵심 증상은 "새로 쓴다"(INSERT)이지 "기존 걸 고친다"가 아니다 — 편집·모더레이션까지
  차단하면 팀장이 경고한 "과잉"이 된다.
- **제외 ③ poll_votes INSERT**: 실측(`private.disband_crew` 본문 확인) — 해산 시 진행 중
  poll을 전부 `cancelled`로 전이시키고, `poll_votes_insert_eligible_self`는 이미
  `poll_id IN (select id from polls where status='open')`를 요구한다 — 해산 후 투표는 이미
  불가능하다(투명 커버, 새 조건 불필요).
- **제외 ④ polls INSERT(새 제안)**: `meetup_proposal` 타입 post가 있어야 성립하는데 이번
  수정으로 posts INSERT 자체가 막히므로 사실상 도달 불가.
- **제외 ⑤ meetup_attendances INSERT**: `m.status='confirmed'` 요구 + disband가 미래
  Meetup을 `cancelled`로 바꾸므로 대부분 커버되나, **과거(date < today) confirmed Meetup에는
  여전히 응답 가능**하다 — 실사용 가치가 낮은 좁은 잔여 위험으로 판단해 넣지 않았다(문서화만).

### 18.2 설계 — 새 헬퍼 `private.is_crew_active`, 기존 헬퍼는 그대로

`private.is_active_crew_member`를 고쳐 "크루도 active일 것"까지 의미를 넓히는 안을
검토했으나 **기각했다** — 이유 둘:

1. 이번에 손댄 INSERT 정책 대부분이 애초에 이 헬퍼를 호출하지 않는다(`crew_memberships`를
   직접 서브쿼리로 인라인한다) — 헬퍼를 고쳐도 이 정책들에는 효과가 없다.
2. `is_active_crew_member`는 **읽기 경로**에서도 쓰인다 —
   `crew_memberships_select_self_or_fellow_member`(동료 멤버십 조회)·`poll_vote_tally`·
   `poll_vote_tally_for_decision`(투표 집계 열람)·`realtime_messages_select_crew_broadcast`
   (Broadcast 구독 인가)·`respond_meetup_attendance`(참석 응답 RPC 내부 권한 확인). 이 헬퍼의
   의미를 바꾸면 해산된 크루의 **과거 투표 집계 조회·동료 목록 조회·Broadcast 구독**까지
   전부 막혀 FR-013 AC2("과거 항목은 열람 전용으로 남는다")를 정면으로 위반한다.

그래서 새 헬퍼 `private.is_crew_active(p_crew_id uuid) returns boolean`(SECURITY DEFINER,
`crews.status='active'`만 확인)을 신설해 **새 콘텐츠 INSERT 정책에만** 붙였다. 029A crews↔
crew_memberships 상호 재귀(42P17) 걱정은 없다 — 이 함수는 `crews`만 직접 조회하고 다른
정책을 경유하지 않는다(SECURITY DEFINER가 RLS 자체를 우회).

### 18.3 적용 (마이그레이션 `crews_block_writes_in_archived_crew_i066`, 원격 version
`20260725094141`)

`private.is_crew_active` 신설(`authenticated`에게만 EXECUTE) + 5개 INSERT 정책 재정의
(drop+create, 18일차 `invitations_block_requested_target_at_rls`가 추가한 `requested` 대상
차단 조건은 그대로 보존):

1. `posts_insert_members` — `board → crews` 경로에 `private.is_crew_active(b.crew_id)` 추가.
2. `comments_insert_members` — `post → board → crews` 경로에 동일 조건 추가.
3. `chat_messages_insert_members` — `chat_room → crews` 경로에 동일 조건 추가.
4. `invitations_insert_staff_or_owner` — `private.is_crew_active(crew_id)` 최상위 조건 추가.
5. `join_requests_insert_self_public_crew` — 이미 `crews c where c.visibility='public'`을
   직접 서브쿼리하므로 헬퍼 없이 같은 자리에 `and c.status = 'active'`만 추가.

### 18.4 회귀 실측(트랜잭션 롤백, 9개 시나리오)

`chopin_0625`(fb70ff1c, 크루A `주말 러닝 클럽` 21fb8c31 소속)·`chopin0625`(30f44dd9, 크루A
오너·크루B `심야 독서 모임` 32aca4a8 staff)·아웃사이더 2명으로 구성. 크루 상태 전환은
`crews_guard_owner_only_fields` 트리거(CREW, Task 040) 때문에 **오너 권한(auth.uid()=owner_id)
으로만** 가능했다(처음 `postgres`로 직접 UPDATE 시도 시 트리거가 거부 — 실측 중 발견, 오너
jwt claims로 전환해 해소).

| 시나리오 | 크루 상태 | 기대 | 실측 |
| --- | --- | --- | --- |
| A1 게시글 작성(활성 크루, 소속 멤버) | active | 성공 | ✅ 성공 |
| A2 댓글 작성(활성 크루) | active | 성공 | ✅ 성공 |
| A3 채팅 발신(활성 크루) | active | 성공 | ✅ 성공 |
| A4 가입 신청(활성·공개 크루, 비멤버) | active | 성공 | ✅ 성공 |
| B1 게시글 작성(해산 크루, 소속 staff) | archived | 거부 | ✅ RLS 위반으로 거부 |
| B2 댓글 작성(해산 크루) | archived | 거부 | ✅ RLS 위반으로 거부 |
| B3 채팅 발신(해산 크루) | archived | 거부 | ✅ RLS 위반으로 거부 |
| B4 초대 발송(해산 크루, staff) | archived | 거부 | ✅ RLS 위반으로 거부 |
| A5 가입 신청(해산·공개 크루, 비멤버) | archived | 거부 | ✅ RLS 위반으로 거부 |

**활성 크루 회귀 없음(4/4) + 해산 크루 차단(5/5) 전부 확인.** 테스트 후 `rollback` — 잔여
행 0건, 크루 상태 원복(`active` 유지) 재확인. `get_advisors(security)` 신규 WARN 0건(기존
`auth_leaked_password_protection` 1건뿐 — CREW의 `disband_crew` WARN은 이번 확인 시점에
이미 그쪽 재구성으로 해소돼 있었다, 무관).

### 18.5 앱 레이어와의 역할 분담 (18일차 교훈 재확인)

**SQL(이 5개 정책)이 강제 경계다** — 라우트 게이트가 무엇을 하든 실제 쓰기는 여기서 최종
결정된다. **BOARD가 맡을 라우트 게이트(`(app)/crews/[crewId]/layout.tsx`에 `crews.status`
확인 추가)는 UX만 담당한다** — "이 크루는 해산되었습니다"를 글쓰기 폼 진입 전에 미리
안내하는 조기 반환일 뿐, 이게 없어도 SQL이 최종적으로 막는다(지금 이 순간에도 UI는 폼을
보여주지만 제출은 RLS 위반으로 실패한다 — 사용자 경험은 나쁘지만 데이터 무결성은 이미
보장된다). 두 계층의 판정 조건(`crews.status='active'`)은 반드시 같은 의미를 유지해야
한다 — 이번 회차처럼 SQL이 앱보다 먼저 닫히는 순서도 있을 수 있고, 그 반대도 있을 수
있다는 것을 다음 사람이 알아야 한다.

### 18.6 남은 것

1. **"크루 정보 수정" 차단**(`crews_update_staff_or_owner`)은 이번 범위 밖 — `crews`
   테이블 자체 정책이라 CREW의 동시 작업과 겹쳐 다음 회차로 이월한다.
2. **과거 confirmed Meetup의 출석 응답**은 해산 후에도 여전히 가능하다(18.1 제외 ⑤) —
   실사용 가치가 낮은 잔여 위험으로 문서화만 하고 손대지 않았다.
3. **라우트 게이트(UX)**는 BOARD 소관 — SQL이 먼저 닫혔으니 UX 개선이 늦어져도 데이터
   무결성 문제는 없다.
