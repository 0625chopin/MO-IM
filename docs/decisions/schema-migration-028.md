# 데이터베이스 스키마 마이그레이션 (Task 028)

- **일자**: 2026-07-25(14일차)
- **담당**: CORE(A팀)
- **참조**: D-019·D-020·D-025·D-032·D-033·D-034·D-035, NFR-032·035, R-003, PRD §7
- **범위**: PRD §7 엔티티(`DevicePushToken` 제외, D-004) 21종을 Supabase(`damruradpliktkrlkakl`, MO-IM)에 SQL 마이그레이션으로 생성한다. RLS 정책 설계는 이번 범위 밖(Task 029A·029B) — 스키마·인덱스·제약까지만.

## 0. 착수 전 D-037 확인 (실제 값)

| 확인 항목 | 값 |
| --- | --- |
| `list_tables`(public) | `[]` — 0개 |
| `list_migrations` | 2건(`enable_pg_cron`, `revoke_public_from_cron_tables`) — Task 027 산출물뿐 |
| `list_extensions` 중 `pg_cron` | `installed_version: "1.6.4"` |
| `auth.users` 등 Auth 스키마 | 정상 존재(0행) — Supabase Auth 관리 테이블 |

낯선 테이블(`player`·`fixture` 등 축구 시뮬레이션 잔재)은 없었다. 계속 진행했다.

## 1. 엔티티 수 — "20종"과 "22종"의 차이

팀장 지시문은 "PRD §7 엔티티 20종"이라 했고, `requirements.md` 5.2절 원문은 "**엔티티 22종**"이라 명시한다. 실제로 이번에 만든 테이블은 **21개**다 — 22종에서 `DevicePushToken`(FR-073, 차기 v1.0+, D-004로 이번엔 테이블 미생성, 타입 자리만 유지)을 제외한 수다. "20종"은 팀장 지시문의 근사치·오기로 보이며, 단일 소스인 `requirements.md`(22종 − DevicePushToken 1종 = 21개 테이블)를 따랐다.

생성한 21개 테이블: `profiles`, `auth_attempts`, `crews`, `crew_memberships`, `invitations`, `join_requests`, `boards`, `posts`, `comments`, `polls`, `poll_eligible_voters`, `poll_votes`, `meetups`, `meetup_attendances`, `chat_rooms`, `chat_messages`, `notifications`, `notification_preferences`, `reports`, `blocks`, `audit_logs`.

## 2. 되돌리기 비싼 결정들 — 이번에 스키마로 고정한 것

### 2.1 열거형 표현: 네이티브 ENUM이 아니라 `text` + `CHECK`

`ProfileStatus`·`CrewVisibility`·`PollStatus` 등 모든 열거형 필드를 Postgres 네이티브 `ENUM` 타입이 아니라 `text` 컬럼 + `CHECK (col in (...))`로 구현했다.

**근거**: 네이티브 ENUM에 값을 추가하는 `ALTER TYPE ... ADD VALUE`는 PostgreSQL 12+에서도 **같은 트랜잭션 안에서 그 새 값을 바로 쓸 수 없다**(커밋 후에만 사용 가능). `apply_migration`은 마이그레이션 하나를 단일 트랜잭션으로 적용하므로, "값 추가 + 그 값 사용"을 한 마이그레이션에 담을 수 없어 항상 2단계 배포가 필요해진다. `CHECK` 제약은 `ALTER TABLE ... DROP CONSTRAINT` + `ADD CONSTRAINT`로 한 마이그레이션 안에서 끝난다. FR 성격상 `NotificationType`·`PermissionAction` 등은 기능 추가마다 값이 늘어날 개연성이 커서(예: FR-072 확장, v0.2 Comment 알림 등) 이 확장성을 우선했다. `generate_typescript_types`가 `CHECK` 기반 열거형도 `string`으로만 좁혀 생성한다는 제약은 있다(네이티브 ENUM이면 리터럴 유니온이 나온다) — 도메인 타입(`src/lib/types`)의 리터럴 유니온과의 매핑은 데이터 접근 레이어(NFR-034)가 좁혀야 한다.

### 2.2 PollEligibleVoter 조인 테이블 (D-025)

`Poll.eligibleSnapshot` 배열 대신 `poll_eligible_voters(poll_id, profile_id)` 조인 테이블로 구현했다 — 대상자별 알림 발송 상태(`notified_at`, `notify_attempts`)를 담을 자리가 배열 컬럼에는 없기 때문이다. 생성 후 행을 추가·삭제하지 않는다(정족수 분모 불변) — 이 불변성은 트리거로 강제하지 않았다(RLS/애플리케이션 계층 책임으로 남김, 029A/029B에서 재검토 권고).

### 2.3 투표 기록 불변성 (NFR-032) — `poll_votes` BEFORE UPDATE 트리거

`NFR-032`("탈퇴·강퇴 이후에도 투표 집계의 역사적 정합성이 유지된다 — 소급 변경 금지")를 `CHECK` 제약만으로는 표현할 수 없다(`CHECK`는 같은 행의 컬럼 간 관계만 보고, "이전 값과 달라지면 안 된다"는 `OLD`/`NEW` 비교가 필요하다). `poll_votes_guard_immutability()` 함수 + `trg_poll_votes_guard_immutability` 트리거로 `choice`·`voted_at`의 `UPDATE`를 차단했다 — `invalidated`(강퇴 시 무효화, D-003)만 갱신을 허용한다.

**스키마 설계 시점이 이 규칙을 되돌릴 수 있는 마지막 기회라는 팀장 지시의 근거를 그대로 실행에 옮겼다** — 투표 데이터가 쌓인 뒤에는 기존 행을 감사 없이 고치는 경로 자체가 존재하지 않게 된다.

### 2.4 정족수·판정 매핑을 CHECK로 고정 (D-032·D-024·D-035)

`polls` 테이블에 `quorumRatio` 컬럼을 두지 않았다(D-032 — 정족수는 `ceil(대상자/3)` 고정이며 설정 가능성을 암시하는 컬럼 자체를 없앤다). 그리고 `status`(`PollStatus`)와 `result`(`PollOutcome`)의 1:1 대응(D-035/D-024 — `closed_passed`↔`passed` 등)을 `CHECK` 제약으로 강제했다. 이 매핑이 애플리케이션 버그로 어긋나면 모든 집계 화면의 신뢰도가 무너지므로, DB가 그 불일치 자체를 거부하게 했다.

### 2.5 정원 원자성 (D-019) — CHECK 안전망 + 애플리케이션 조건부 UPDATE

`meetups.attending_count`에 `CHECK (attending_count >= 0 and (capacity is null or attending_count <= capacity))`를 걸었다. **이 CHECK는 동시성을 보장하지 않는다** — D-019가 요구하는 원자성(동시 참석 신청 2건이 마지막 1자리를 두고 경합할 때 하나만 성공)은 애플리케이션의 `UPDATE ... WHERE attending_count < capacity` 조건부 갱신이 담당해야 한다(데이터 접근 레이어 몫, 이번 범위 밖). CHECK는 그 결과가 항상 유효 범위 안에 있는지 확인하는 최종 방어선일 뿐이다.

`meetup_attendances`는 자연 복합 PK `(meetup_id, profile_id)`로 두어, 도메인 타입 주석의 `UNIQUE(meetupId, profileId)` 요구와 FR-067 E2 멱등 upsert 전제를 그대로 만족시킨다.

### 2.6 채팅 파기 — 배치 DELETE, 파티셔닝 미채택 (D-033)

`chat_messages`는 파티셔닝하지 않았다(D-033 — 테이블 생성 시점에 파티션 키를 정해야 하고 나중에 바꾸려면 재생성이 필요하다는 근거를 그대로 받아들였다). 대신 `created_at`에 일반 btree 인덱스(`idx_chat_messages_created`)를 두어 "12개월 경과 행을 찾아 배치 삭제"(Task 035, NFR-033) 스캔을 지원한다. 다른 테이블이 `chat_messages.id`를 참조하지 않으므로 배치 `DELETE`가 FK 제약에 막히지 않는다 — 이 성질을 스키마 주석에 명시해 두었다(향후 새 테이블이 `chat_messages`를 참조하게 되면 이 전제가 깨진다는 것도 함께).

### 2.7 `Meetup.status` 값 집합 고정 (D-034)

`confirmed`/`cancelled` 2종만 허용한다 — `scheduled` 같은 중간 상태를 추가하지 않았다(투표 가결 즉시 confirmed).

## 3. 스키마 전반의 설계 원칙

### 3.1 Profile은 하드 삭제되지 않는다 (D-010)

`profiles.id`는 `auth.users(id)`를 `ON DELETE CASCADE`로 참조한다. 그런데 `crews.owner_id`·`posts.author_id`·`poll_votes.voter_id` 등 콘텐츠 테이블은 전부 `profiles(id)`를 `ON DELETE RESTRICT`로 참조한다. 이 조합의 효과: **콘텐츠를 하나라도 남긴 사용자는 `auth.users` 행 자체를 하드 삭제할 수 없다** — 삭제 시도는 FK 위반으로 거부된다. 즉 스키마가 "진짜 삭제"를 구조적으로 막고, D-010이 요구하는 익명화(`anonymized_at` 기록 + PII 파기, 콘텐츠는 "탈퇴한 사용자"로 표시) 워크플로만 통하게 강제한다. 콘텐츠가 전혀 없는 갓 가입한 계정은 예외적으로 하드 삭제가 가능하다(가입 취소 등 엣지 케이스).

같은 이유로 `crews`·`profiles` 등은 애플리케이션에서도 `DELETE FROM`을 쓰지 않는다 — `status='archived'`/`anonymized_at` 같은 소프트 삭제만 쓴다는 것이 전제다.

### 3.2 RLS는 이번 범위 밖이지만, "기본 거부"는 지금 켠다

NFR-011은 "정책 없는 테이블 = 사실상 전체 공개"라고 경고한다 — Supabase 프로젝트는 새 테이블에 `anon`/`authenticated`용 기본 권한(default privileges)이 이미 걸려 있어, RLS를 켜지 않으면 이 GRANT만으로 즉시 전체 노출된다. Task 029A·029B(정책 설계)까지는 최소 2회차(주 단위로는 몇 주) 간격이 있으므로, **이번 마이그레이션에서 21개 테이블 전부에 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`를 정책 없이 걸었다.** RLS가 켜지고 정책이 0개면 테이블 소유자(및 `service_role`처럼 `bypassrls`인 역할)를 제외한 모든 접근이 기본 거부된다 — "정책 설계"(D-028의 `SECURITY DEFINER` 헬퍼·`TO`절·서브쿼리 래핑)를 하지 않고도 NFR-011의 "기본 거부"만 미리 확보하는 조치다. `service_role`은 RLS를 우회하므로 서버 경로(Server Action 등)는 영향받지 않는다. 029A 착수 시 이 상태(정책 0개, 전체 거부)에서 시작하면 된다.

### 3.3 다형 참조(polymorphic reference)는 FK 없이 문서화로 대체

`reports.target_id`(post/comment/chat_message/profile 4종), `audit_logs.target_id`는 단일 FK로 표현할 수 없다. 스키마 제약을 걸지 않고 주석으로 문서화했다 — 애플리케이션이 `target_type`에 맞는 대상 존재 여부를 검증할 책임을 진다.

### 3.4 시각 필드(`start_time`)는 `text`, `HH:MM` 정규식 CHECK — **가정, 확인 필요**

`Post.startTime`·`Meetup.startTime`(둘 다 도메인 타입에서 `string | null`)을 Postgres `time` 타입이 아니라 `text` + `^([01]\d|2[0-3]):[0-5]\d$` 정규식 CHECK로 구현했다. 도메인 타입 주석에 형식이 명시되어 있지 않아 **24시간제 `HH:MM`이라고 가정**했다 — 실제 입력 폼(D-013 관련 화면, Task 018B 계열)이 다른 형식(예: 12시간제 `2:30 PM`)을 쓴다면 이 CHECK가 유효한 입력을 거부하게 된다. **화면 구현 전 확인 필요** — 확인 전까지는 이 CHECK를 신뢰하지 말고 애플리케이션 레벨에서도 형식을 정규화할 것을 권고한다.

## 4. R-003 대조 — Task 006 수기 타입(`src/lib/types/*`) ↔ 생성 스키마

`generate_typescript_types` 결과(`src/lib/data/supabase/database.types.ts`)와 수기 도메인 타입을 필드 단위로 대조했다. **구조적 불일치(누락 엔티티·잘못된 관계·타입 오류)는 없다.** 발견한 차이는 전부 "DB 전용 부기 컬럼 추가" 아니면 "수기 타입 쪽의 사소한 공백"이다.

### 4.1 완전 일치 (엔티티 12종)

`CrewMembership`·`Board`·`Post`·`Poll`·`PollEligibleVoter`·`PollVote`·`Meetup`·`MeetupAttendance`·`ChatRoom`·`ChatMessage`·`Notification`·`AuditLog` — 필드 이름(camelCase↔snake_case 변환 제외)·널러블 여부·관계가 정확히 대응한다. 추가 컬럼 없음.

### 4.2 DB가 부기 컬럼을 추가한 엔티티 (의도적, 데이터 접근 레이어가 비노출)

수기 타입에 생성/발생 시각 필드가 아예 없어서, 정렬·감사 목적으로 `created_at`을 DB에만 추가했다. **데이터 접근 레이어는 이 컬럼을 도메인 타입에 매핑하지 않는다** — NFR-035("Mock 전용 필드를 타입에 넣지 않는다")의 대칭 원칙: DB 전용 부기 컬럼도 도메인 타입에 넣지 않는다.

| 엔티티 | 추가 컬럼 | 비고 |
| --- | --- | --- |
| `Profile` | `created_at` | 가입 시각 자체가 도메인 타입에 없음 |
| `Crew` | `created_at` | 개설 시각 자체가 도메인 타입에 없음 — Profile과 동일 패턴(14일차 교차검증, DESIGN 지적으로 §4 전수 대조에 추가) |
| `Invitation` | `created_at` | 아래 4.3 참고 — 실은 필요할 수 있는 필드 |
| `JoinRequest` | `created_at` | 아래 4.3 참고 |
| `Comment` | `created_at` | v0.2 대상이라 우선순위 낮음 |
| `Report` | `created_at` | v0.2 대상 |
| `Block` | `created_at` | v0.2 대상 |
| `AuthAttempt` | `id`(대리키) | 수기 타입은 `(identifier, attemptedAt, succeeded)` 3필드뿐, 유일 식별자 없음 — 인덱싱용 대리키 추가, 도메인 로직은 여전히 3필드로 조회 |
| `NotificationPreference` | `id`(대리키) | `crewId`가 nullable이라 자연 복합키를 PK로 쓸 수 없어 대리키 필요(부분 유니크 인덱스 2종으로 유일성 별도 표현) |

### 4.3 수기 타입 쪽 공백으로 보이는 것 (다음 개정 때 검토 권고)

- **`Invitation`에 `createdAt`이 없다.** `expiresAt`(발급 후 14일)만 있고 발급 시각 자체가 없어, "언제 초대했는지" 표시가 필요해지면(화면 요구사항 발생 시) 타입에 추가해야 한다. 지금은 DB에만 부기 컬럼으로 존재.
- **`JoinRequest`에 `createdAt`·`decidedAt`이 둘 다 없다.** `decidedBy`(누가)는 있는데 "언제 승인/반려했는지"를 표현할 필드가 없다 — 신청 목록 정렬·SLA 측정이 필요해지면 공백이 드러난다. 이번엔 DB에 `created_at`만 부기로 추가했고 `decided_at`은 추가하지 않았다(수기 타입에 대응 개념이 아예 없어 자리를 만들지 않음, 필요해지면 다음 마이그레이션에서 추가).
- **`Comment`에 `createdAt`이 없다.** v0.2 대상이라 지금 급하지 않다.

이 셋은 **막는 문제가 아니다** — 스키마의 `created_at` 부기 컬럼이 이미 자리를 마련해 두었으므로, 화면 구현 시점에 수기 타입에 필드를 추가하기만 하면 데이터 접근 레이어가 그 컬럼을 노출하도록 매핑을 한 줄 추가하면 된다. 지금 타입을 고치지 않은 이유는 이번 Task 범위가 "스키마"이고, 도메인 타입(Task 006 산출물) 변경은 화면 요구가 확정된 뒤가 맞다고 판단해서다.

**§4.1(12개) + §4.2(9개) = 21개 — 생성 테이블 전수 대조 완료.**

### 4.4 그 외 특기사항

- `crews.color_key`는 `smallint` — 수기 타입 `number`와 호환(0-11 범위 CHECK로 좁힘).
- `notifications.payload`는 `jsonb` — 수기 타입 `Record<string, unknown>`과 대응(생성 타입은 `Json`).
- `DevicePushToken`은 계획대로 테이블 없음(D-004) — 타입은 `src/lib/types/notification.types.ts`에 그대로 남아 있다.

## 5. 다음 회차(029A)로 넘기는 것

- **RLS 정책 설계·`SECURITY DEFINER` 헬퍼·`TO`절·서브쿼리 래핑(D-028)** — 이번엔 전 테이블 RLS `ENABLE`(정책 0개, 기본 거부)까지만 했다. 029A는 "테이블에 RLS를 켜는 일"이 아니라 "정책을 채우는 일"부터 시작한다.
- **`start_time` 형식(HH:MM 가정) 확인** — 3.4절. 제안/모임 작성 폼 구현 전에 확정 필요.
- **`poll_eligible_voters`의 "생성 후 행 불변" 규칙은 트리거로 강제하지 않았다** — `poll_votes`처럼 트리거를 걸지 않은 이유는 이 테이블은 알림 발송 상태(`notified_at`/`notify_attempts`)가 정상적으로 갱신돼야 하고, 어떤 컬럼이 불변이어야 하는지(포함 여부 자체는 불변, 상태 컬럼은 가변)가 `poll_votes`보다 복잡해 애플리케이션 계층 책임으로 남겼다. 필요시 029A/029B에서 재검토.
- **`Invitation`·`JoinRequest`(·`Comment`) 수기 타입의 시각 필드 공백**(4.3절) — 화면 요구가 생기면 Task 006 타입 개정 + 데이터 접근 레이어 매핑 추가.
- **`chat_messages` 배치 파기 배치 자체는 v0.2**(Task 035) — 이번엔 인덱스만 준비했다.

## 6. 14일차 교차검증(DESIGN) 정리

DESIGN이 6개 항목을 실측 검증했고 전부 pass, 경미한 이슈 3건을 지적했다. 전부 반영했다.

- **이슈 A(§4 커버리지 공백)**: `crews`가 §4.1·§4.2 어디에도 없었다 — `crews.created_at`은 `Crew`(crew.types.ts)에 없는 컬럼이라 Profile과 동일한 "DB 부기 컬럼" 패턴인데 누락됐다. §4.2 표에 `Crew` 행을 추가하고 "12+9=21개 전수 대조 완료" 문구를 남겼다(4.2절).
- **이슈 B(`function_search_path_mutable` WARN)**: `get_advisors(security)`가 `public.poll_votes_guard_immutability`의 search_path 미고정을 지적했다. 마이그레이션 `fix_poll_votes_guard_search_path`(version `20260724235931`)로 함수를 `CREATE OR REPLACE` + `SET search_path = ''`로 재정의했다 — 트리거(`trg_poll_votes_guard_immutability`)는 함수를 이름으로 참조하므로 재생성 불필요, 함수 본문만 교체했다. **재확인**: `get_advisors(security)` 재실행 결과 `function_search_path_mutable` 항목 소멸, 남은 항목은 21개 테이블의 `rls_enabled_no_policy`(INFO, 029A/029B 몫)뿐.
- **이슈 C(표기 불일치)**: `src/lib/data/supabase/README.md`가 "20종"으로 적혀 있어 본 문서 §1의 "21개" 결론과 어긋났다 — "21종(DevicePushToken 제외)"으로 정정했다.
