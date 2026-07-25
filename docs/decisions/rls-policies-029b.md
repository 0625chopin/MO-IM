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

## 12. 산출물

- `supabase/migrations/2026072501{5228,5307,5601,5614,5631,5645,5801}_*.sql` — 마이그레이션 7건(최초 구현).
- `supabase/migrations/20260725022234_rls_fix_profile_search_exact_match.sql` — 16일차 교차검증 MAJOR 1·2 수정.
- 정책 총 **58건**(public, 불변) + **2건**(realtime, 신규). `private` 스키마 함수 **6개**.
- `src/lib/data/supabase/database.types.ts` — 재생성.
- 본 문서.
- `docs/ROADMAP/team/01.CORE.md` Task 029B 완료 마커.
- `src/lib/data/supabase/README.md` 갱신(profile_search 시그니처 변경·FR-020 인계·§2.4 경고 반영).
