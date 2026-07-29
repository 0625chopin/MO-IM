# INSERT 축 전수조사 — I-101이 드러낸 빈 축을 메운다 (I-102·I-103)

- **일자**: 2026-07-29(23일차)
- **담당**: CREW(A팀), 이번 회차 로드맵 Task 0건 — I-101 후속 전수조사 단독 배정
- **참조**: I-101(22일차, CRITICAL)·`docs/decisions/meetups-insert-bypass-101.md`, I-091(21일차,
  방법론)·D-064(REVOKE 우선 원칙), I-092/D-055(가드가 다른 테이블 RLS 가시성에 의존하면
  "우연한 방어"가 된다는 원칙)

## 0. 요약

I-101 결정 문서 §7("남긴 것")은 "같은 패턴이 다른 테이블에 더 있는지 전수 조사하지 않았다"고
명시했다. I-091이 이미 전수 조사한 축은 **self-service UPDATE**(행 소유권이 새 컬럼값을
제한하는가)였고, I-101은 **INSERT** 축의 결함이었는데 **그 축에는 표가 아예 없었다** — "분류
체계에 빈 축이 있으면 그 축의 결함은 아무리 성실히 표를 훑어도 안 나온다"는 것이 이번 배정의
전제다.

`pg_policies`에서 `cmd IN ('INSERT','ALL')`이고 `authenticated`/`public` 롤에 열린 정책을
**23건** 전수 열거했다(쿼리 결과 행 수로 완전성을 확인 — 아래 §1). 그중 **2건이 I-101과 완전히
같은 모양의 결함**이었다:

- **I-102(CRITICAL)**: `crew_memberships_insert_self_request`가 `role`·크루 `visibility`/
  `status`를 검사하지 않아, 정상적인 가입 승인 한 번만으로 **role=owner 격상**이 가능했다.
- **I-103(MAJOR)**: `poll_eligible_voters_insert_proposal_author_or_staff`가 `profile_id`·
  `poll.status`를 검사하지 않아, 비회원 유령 인원 추가와 **투표 종료 후 정족수 분모 사후
  조작**이 가능했다.

둘 다 실 REST(실 로그인 토큰, 신규 테스트 크루/글/투표로 재현 — 시드 데이터 미오염)로 재현했고,
BEFORE INSERT 트리거로 수정했다(마이그레이션 4건, §4). 정당 경로(크루 개설 부트스트랩·초대
프로비저닝·정상 가입 신청·정상 poll 생성)는 전부 실측으로 생존을 확인했다(§5). 부수로
`boards`/`chat_rooms`의 죽은 client INSERT 표면도 REVOKE했다(§4.3).

## 1. 전수 열거 — INSERT/ALL 정책 23건

```sql
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public'
  and (cmd = 'INSERT' or cmd = 'ALL')
  and (roles::text[] && array['authenticated','public'] or roles::text = '{public}')
order by tablename, cmd, policyname;
```

결과 **23행**. `meetups`·`meetup_attendances`는 이 목록에 **없다** — I-090·I-101 수정으로 INSERT
GRANT 자체가 회수돼 있음을 재확인했다(이 조사가 그 수정이 여전히 유효함도 함께 검증한 셈이다).

| # | 테이블 | 정책 | (a) WITH CHECK가 실제로 보는 것 | (b) 도메인 불변식(근거) | (c) BEFORE INSERT 트리거 | (d) 정당 경로 | (e) 판정 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `audit_logs` | `audit_logs_no_client_access`(ALL) | `false` 고정 | NFR-015, 클라이언트 쓰기 불가 | 없음(불필요) | 없음(전부 서버) | 해당없음(전체 차단) |
| 2 | `auth_attempts` | `auth_attempts_no_client_access`(ALL) | `false` 고정 | D-020, 클라이언트 접근 불가 | 없음(불필요) | 없음 | 해당없음 |
| 3 | `blocks` | `blocks_insert_self` | blocker=self ∧ blocked≠self | FR-081, 자기 차단 금지 | 없음 | `create_block` RPC(권장) + 원시 INSERT(허용됨) | 검사됨 — `blocks_check` CHECK(`blocker_id<>blocked_id`)가 이중 방어, PK(blocker,blocked)가 중복 방지 |
| 4 | `boards` | `boards_insert_owner` | crew_id가 자기 소유 크루 | "Board 1:1 Crew" | 없음 | `trg_crews_provision_owner_bootstrap`(SECURITY DEFINER) 유일 — grep 결과 client 코드 0건 사용 | **정리 대상 — 이번에 REVOKE**(§4.3, 실제 위반 가능성은 UNIQUE(crew_id)로 이미 0이지만 죽은 표면) |
| 5 | `chat_messages` | `chat_messages_insert_members` | sender=self ∧ 활성 멤버 ∧ `is_crew_active` | FR-050, 크루 활성 멤버만 발화 | 없음(UPDATE 가드만) | 클라이언트 직접 INSERT(정당) | 검사됨 |
| 6 | `chat_room_reads` | `chat_room_reads_insert_self_member` | profile=self ∧ 활성 멤버 | FR-055, 방마다 사용자당 1행 | 없음 | 클라이언트 직접 INSERT | **부분 미검사(DESIGN 교차검증 발견, 저위험 등재 예정)** — PK(room_id,profile_id)가 "몇 행이 생기는가"(최대 1행)는 강제하지만, **`last_read_at` 값 자체**는 클라이언트가 임의값(미래 포함)으로 넣을 수 있고 막는 트리거가 없다. `reports_insert_self`(#23)와 같은 급의 저위험(자기 배지 카운트만 왜곡, 타인에게 영향 없음)으로 판단해 등재만 하고 고치지 않는다 |
| 7 | `chat_rooms` | `chat_rooms_insert_owner` | crew_id가 자기 소유 크루 | "ChatRoom 1:1 Crew" | 없음 | 위 4번과 동일 | **정리 대상 — 이번에 REVOKE** |
| 8 | `comments` | `comments_insert_members` | author=self ∧ 활성 멤버 ∧ `is_crew_active` | FR-033 | 없음 | 클라이언트 직접 INSERT | 검사됨 |
| 9 | `crew_memberships` | `crew_memberships_insert_self_request` | profile=self ∧ status='requested' | FR-022 사전조건("크루가 public")·E1(private→403)·D-002(오너 1명, role은 개설/이양으로만) | **없음(신규 결함)** | `join-request.ts`의 `createJoinRequest`(클라이언트 직접 INSERT, 정당) | **미검사 — I-102 CRITICAL, 이번에 수정** |
| 10 | `crews` | `crews_insert_self_owner` | owner_id=self | FR-010, 승인 없이 즉시 개설(D-008) | 없음 | 클라이언트 직접 INSERT | 해당없음 — owner_id가 항상 자기 자신이라 추가로 제한할 불변식이 없다(요구사항에 개설 자격 제한 없음) |
| 11 | `email_resend_attempts` | ALL(false) | `false` | FR-001 E4 카운터, 클라이언트 접근 불가 | 없음 | 없음 | 해당없음 |
| 12 | `handle_availability_check_attempts` | ALL(false) | `false` | I-065·D-047 카운터 | 없음 | 없음 | 해당없음 |
| 13 | `handle_search_attempts` | ALL(false) | `false` | D-005·NFR-016 카운터 | 없음 | 없음 | 해당없음 |
| 14 | `invitations` | `invitations_insert_staff_or_owner` | inviter=self ∧ 활성 staff/owner ∧ crew active ∧ 대상이 requested 아님 ∧ 차단 아님 | FR-020, D-005 옵트아웃/차단 | 없음(UPDATE 가드는 있음) | 클라이언트 직접 INSERT | 검사됨 — `role` 컬럼이 이 테이블에 없다(부여되는 role은 `invitations_provision_membership`이 항상 `member`로 하드코딩) |
| 15 | `join_requests` | `join_requests_insert_self_public_crew` | requester=self ∧ crew public+active | FR-022 사전조건 | 없음 | 클라이언트 직접 INSERT | 검사됨 — 정확히 9번(`crew_memberships`)이 놓친 조건을 이 테이블은 이미 갖고 있었다 |
| 16 | `notification_preferences` | `notification_preferences_insert_self` | profile=self | FR-072 AC3(필수 알림 끄기 금지) | **있음**(`notification_preferences_guard_mandatory_types`, D-063) | 클라이언트 직접 INSERT | 검사됨(트리거) |
| 17 | `poll_eligible_voters` | `poll_eligible_voters_insert_proposal_author_or_staff` | poll_id가 자기 작성 poll이거나 그 크루 staff/owner | D-025(스냅샷 고정, 생성 후 불변)·requirements.md "쓰기는 서버 로직 전용"·NFR-032 | **없음(신규 결함)** | `poll.ts`의 `createPoll`(클라이언트 직접 INSERT, 정당) | **미검사 — I-103 MAJOR, 이번에 수정** |
| 18 | `poll_votes` | `poll_votes_insert_eligible_self` | voter=self ∧ poll open ∧ eligible 명단에 존재 | D-003·D-025 | 없음(UPDATE 가드는 있음) | 클라이언트 직접 INSERT | 검사됨 |
| 19 | `polls` | `polls_insert_proposal_author` | post.author=self ∧ type='meetup_proposal' | "Post 1:1 Poll" | 없음 | 클라이언트 직접 INSERT | 검사됨 — `polls_post_id_key` UNIQUE(post_id)가 구조적으로 중복 생성을 막는다 |
| 20 | `posts` | `posts_insert_members` | author=self ∧ 활성 멤버 ∧ `is_crew_active` | FR-030·034 | 없음 | 클라이언트 직접 INSERT | 검사됨 |
| 21 | `product_events` | `product_events_insert_self` | actor_id=auth.uid() | NFR-030(KPI 로그, Task 045) | 없음 | 클라이언트 직접 INSERT | 해당없음/저위험 — 분석 로그이며 다른 사용자·도메인 상태에 영향 없음(설계 의도, 042A~045 선례와 동일 판단) |
| 22 | `profiles` | `profiles_insert_self` | id=self | FR-001 | 없음 | 클라이언트 직접 INSERT(현재 `createProfile`이 id 미전달로 실사용 끊김 — Task 032 소관, I-0xx 기존 이슈) | 부분 미검사이나 **기존에 알려진 별도 결함**(Task 032 범위) — 이번 조사에서 새로 열지 않음. 참고: `status` 컬럼이 CHECK(`active|suspended|withdrawn|deactivated`)만 있고 self-insert가 `active`를 바로 지정할 수 있으나, 온보딩 게이팅은 `hasCompletedOnboarding` 별도 컬럼이 맡아 이 값 하나로 우회되는 권한이 없다(저위험) |
| 23 | `reports` | `reports_insert_self` | reporter=self | FR-080 | 없음 | `create_report` RPC(권장) + 원시 INSERT(허용됨) | 부분 미검사 — `status`(pending/resolved/dismissed) 컬럼이 CHECK만 있고 client가 즉시 `resolved`/`dismissed`로 지정 가능(모더레이션 큐 우회). **다운스트림 캐스케이드 없음**(I-091 심각도 기준: 자기 신고를 자기가 무력화하는 것뿐, 타인에게 영향 없음) — 저위험으로 판단해 이번 회차 수정 보류, 다음 회차 후보로 남김 |

**23행 전수 — 신규 결함 2건(#9, #17), 정리 대상 2건(#4, #7, 사실상 같은 정리 1건을 두 테이블에
적용), 기존 별도 이슈 소관 1건(#22), 저위험 보류 2건(#6, #23), 나머지 15건은 이미 안전.**

**이 표의 한계(DESIGN 교차검증이 찾음, 자기비판으로 남긴다)**: (e) 판정에서 "검사됨"이라고 쓴
칸 대부분은 실제로 **"몇 행이 생기는가"만 확인했고 "그 행에 어떤 값이 들어가는가"는 일부만
확인했다.** #6(`chat_room_reads`)이 정확히 이 틈이다 — PK가 "행 개수"는 완벽히 제한하지만
`last_read_at` 컬럼값 자체는 무제한이라는 것을 처음 표를 만들 때 놓쳤고, 나중에 DESIGN의
독립 교차검증(I-102·I-103 재현 중)에서 지적받아서야 반영했다(위 #6 셀 수정). I-091이 "self-
service 분기가 컬럼값을 제한하는가"라는 질문 하나로 서로 다른 두 축(행 소유권 제한·값 자체
제한)을 한 칸에 뭉뚱그렸다가 I-106/I-107에서 드러난 것과 같은 종류의 맹점이다 — **"몇 행이
생기는가"와 "그 값이 무엇인가"는 별개 질문인데, 이 감사도 후자를 전건 검증하지 않았다.**
다음 전수조사가 이 축을 별도 열로 분리할 것을 제안한다.

## 2. I-102 실측 재현 — `crew_memberships` role/visibility 미검사

실 REST, `chopin0625@gmail.com`=A(테스트 크루 오너)·`0625chopin@gmail.com`=B(공격자), 신규 테스트
크루로 재현(시드 크루 미사용, `729ced18…` 등 기존 데이터 무변경):

| # | 시나리오 | 결과(수정 전) |
| --- | --- | --- |
| 1 | B가 A 소유 **PUBLIC** 크루에 `role=owner, status=requested`로 자기 행 직접 INSERT | **201** |
| 2 | B가 같은 크루에 정상 `join_requests`(가입 신청) 제출 | **201**(정상적인 흐름처럼 보임) |
| 3 | A(오너)가 그 신청을 평범한 `decideJoinRequest` 승인(PATCH `join_requests` `status=approved`) | **200** |
| 4 | 승인 직후 `crew_memberships` 조회 | **`role=owner, status=active`** — B가 정상 승인 한 번으로 크루 공동 오너가 됐다 |
| 5 | B가 A 소유 **PRIVATE** 크루에 `role=member, status=requested`로 직접 INSERT | **201**(FR-022 사전조건·E1 위반) |
| 5-대조군 | 같은 PRIVATE 크루에 `join_requests` INSERT 시도 | **403**(정상 차단 — `join_requests` 정책은 이미 안전) |

원인: `trg_join_requests_sync_membership_on_decision`(승인 시 부수효과 트리거)이 `crew_memberships.status`만 `'active'`로 바꾸고 **`role`은 건드리지 않는다** — 애초에 role이 잘못
심어져 있었다는 전제 자체를 검증하지 않는다. 그리고 self-service INSERT 정책은 애초에 role을
전혀 제한하지 않았다.

## 3. I-103 실측 재현 — `poll_eligible_voters` profile/timing 미검사

같은 두 계정, 신규 테스트 크루·모임 제안글·투표로 재현:

| # | 시나리오 | 결과(수정 전) |
| --- | --- | --- |
| 1 | A(제안자)가 자기 poll에 자기 자신을 eligible voter로 추가 | 201(정상) |
| 2 | A가 같은 poll에 **그 크루 멤버가 전혀 아닌 B**를 eligible voter로 추가 | **201**(유령 인원, 정족수 분모 오염) |
| 2-1 | B가 그 phantom 자격으로 poll_votes INSERT(실제 투표) 시도 | 403(현재는 막힘 — `poll_votes_insert_eligible_self`의 poll 가시성 서브쿼리가 `polls_select_members`에 우연히 기대는 방어, I-092/D-055가 경고한 것과 같은 종류) |
| 3 | A가 실제 투표(for) 후 조기 종료(PATCH `polls` `status=closed_passed`) | 200, 정상적으로 `closed_passed` 확정(finalize 트리거가 실제 Meetup도 생성) |
| 4 | **poll이 이미 확정된 뒤** A가 제3의(크루 무관) 프로필을 eligible voter로 추가 | **201**(D-025 "생성 후 불변" 정면 위반, 사후 정족수 조작) |

## 4. 수정 — D-064 원칙 재적용(트리거 vs REVOKE 분기)

두 경우 모두 **정당한 생성 경로가 클라이언트 직접 INSERT 자체**(SECURITY DEFINER 함수가 아님)라
REVOKE를 쓸 수 없다 — D-064의 "정당 경로가 클라이언트 직접 INSERT인 경우에만 BEFORE INSERT
트리거 가드를 쓴다" 분기를 그대로 적용했다.

### 4.1 `crew_memberships_guard_self_insert_request` (I-102)

```sql
create function public.crew_memberships_guard_self_insert_request()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_visibility text;
  v_crew_status text;
begin
  if pg_trigger_depth() > 1 then
    return new; -- 신뢰된 중첩 호출(오너 부트스트랩·초대 프로비저닝)
  end if;

  if new.role <> 'member' then
    raise exception '... role=member만 허용합니다(FR-022, D-002)';
  end if;

  select visibility, status into v_visibility, v_crew_status
  from public.crews where id = new.crew_id;

  if v_visibility is null then
    raise exception 'crew_id %를 찾을 수 없습니다', new.crew_id;
  end if;

  if v_visibility <> 'public' or v_crew_status <> 'active' then
    raise exception '... 공개(public)·활성(active) 크루에만 허용됩니다(FR-022 사전조건·E1, D-017)';
  end if;

  return new;
end;
$$;

create trigger trg_crew_memberships_guard_self_insert_request
  before insert on public.crew_memberships
  for each row execute function public.crew_memberships_guard_self_insert_request();
```

`pg_trigger_depth() > 1`로 신뢰된 중첩 호출을 우회한다 — `crew_memberships_guard_self_transition`
(UPDATE 가드, 029A §3)이 이미 쓰는 관용구를 그대로 재사용했다. 이 필드가 있어야
`trg_crews_provision_owner_bootstrap`(크루 개설, role=owner/status=active)과
`trg_invitations_provision_membership`(초대, role=member/status=invited) 둘 다 AFTER INSERT
트리거 안에서 실행되는 nested INSERT라 depth>1이 되어 가드를 그대로 통과한다.

SECURITY DEFINER로 만들었다 — I-092/D-055 원칙(가드가 다른 테이블 RLS 가시성에 의존하면
"우연한 방어"가 된다)에 따라, `crews.visibility/status` 조회가 호출자(비멤버일 수 있는 신청자)의
RLS 가시성과 무관하게 항상 정확한 값을 보게 했다.

### 4.2 `poll_eligible_voters_guard_insert_scope` (I-103)

profile_id가 poll이 속한 크루의 **현재 활성 멤버**인지, poll이 아직 **open**인지 검사한다(전문은
마이그레이션 파일 참고). 같은 이유로 SECURITY DEFINER + `pg_trigger_depth()>1` 우회 관용구를
썼다(이 테이블엔 현재 신뢰된 중첩 호출이 없지만, 향후 생길 경우를 대비해 선제 적용).

**수정 범위를 의도적으로 좁혔다**: "생성 시점 단 한 번만" 같은 완전한 단일성 강제는 하지
않았다 — poll이 열려 있는 동안 staff가 정당하게 추가 멤버를 스냅샷에 반영해야 할 가능성을
남겨 두고, 실측된 두 공격(비회원 유령 인원, 종료 후 추가)만 정확히 막는 최소 수정으로 잡았다.

### 4.3 부수 정리 — `boards`/`chat_rooms` 죽은 client INSERT 표면 REVOKE

```sql
revoke insert on public.boards from anon, authenticated;
revoke insert on public.chat_rooms from anon, authenticated;
drop policy if exists "boards_insert_owner" on public.boards;
drop policy if exists "chat_rooms_insert_owner" on public.chat_rooms;
```

두 테이블 다 `crew_id` UNIQUE 제약이 있어 실제 불변식 위반은 이미 불가능했지만(구조적 방어),
grep 결과 이 정책을 쓰는 client 코드가 0건이었다 — 정당 경로는 `trg_crews_provision_owner_
bootstrap`(SECURITY DEFINER, EXECUTE 기 회수) 하나뿐이다. D-064 원칙대로 쓰이지 않는 표면을
미리 없앴다(I-101이 겪은 "지금은 무해하지만 나중에 정책이 바뀌면 조용히 열린다" 패턴 예방).

### 4.4 후속 — 신규 트리거 함수의 EXECUTE 회수

`get_advisors(security)`가 두 신규 SECURITY DEFINER 트리거 함수를 `anon`/`authenticated`가
`/rest/v1/rpc/...`로 직접 호출 가능하다고 WARN(2건×2롤=4건) — Task 040 `disband_crew`·
`20260725005356`과 동일한 패턴. 트리거 실행 자체는 EXECUTE 권한 검사 대상이 아니므로 EXECUTE만
추가로 회수했다(마이그레이션 `revoke_execute_on_i102_i103_guard_triggers`). 재조회 결과 신규
WARN 0건(기존 `auth_leaked_password_protection` 1건만 잔존).

## 5. 정당 경로 생존 실측 — 전부 PASS

| 경로 | 방법 | 결과 |
| --- | --- | --- |
| 크루 개설 부트스트랩(오너 행 role=owner/status=active + 게시판·채팅방) | 신규 크루 6건 생성 | 전부 201, `crew_memberships` 조회로 role=owner/status=active 확인 |
| 정상 가입 신청(role=member/status=requested) | B가 PUBLIC 크루에 직접 INSERT | 201 |
| 정상 승인 흐름(가입 신청 → 승인 → active) | A가 정상 `join_requests` 승인 | 200, 최종 `role=member, status=active`(에스컬레이션 없음) 확인 |
| 초대 프로비저닝(role=member/status=invited) | A가 제3 프로필 초대 | 201, `crew_memberships` 조회로 role=member/status=invited 확인(중첩 트리거 가드 통과 확인) |
| 정상 poll 생성 스냅샷(활성 멤버, poll open) | A가 자기 자신을 eligible voter로 추가 | 201 |
| `boards`/`chat_rooms` 직접 INSERT 차단 확인(회귀 아님, 의도된 차단) | A가 board 직접 INSERT 시도 | 403 `permission denied for table boards` |

## 6. `get_advisors(security)` 최종 상태

신규 WARN 0건(기존 `auth_leaked_password_protection` 1건만 무관하게 잔존, 이번 조사 전후 동일).

## 7. 산출물

- 마이그레이션 4건:
  - `20260729093252_major_fix_i102_crew_memberships_self_insert_guard`
  - `20260729093323_major_fix_i103_poll_eligible_voters_insert_scope_guard`
  - `20260729093340_cleanup_revoke_insert_boards_chat_rooms_dead_surface`
  - `20260729093507_revoke_execute_on_i102_i103_guard_triggers`
- 이슈: `docs/ISSUES.md` I-102·I-103(팀장 배정 번호).
- 결정: `docs/prioritization-and-risks.md` D-065.

## 8. 남은 것 (다음 회차 후보)

- **`reports_insert_self`가 `status` 컬럼을 검사하지 않는다**(§1 #23) — 다운스트림 캐스케이드가
  없어 이번 회차는 저위험으로 보류했다. 관리자 콘솔(Task 042B)이 모더레이션 큐를 `status='pending'`
  기준으로 운영한다면, self-insert로 즉시 `resolved`/`dismissed`를 지정해 자기 신고를 자기가
  무력화하는 경로가 여전히 열려 있다.
- **`profiles_insert_self`**는 Task 032(`createProfile` id 미전달)가 이미 알려진 별도 결함으로
  잡고 있다 — 이번 조사에서 새로 열지 않았지만, Task 032가 `id`를 받도록 고칠 때 role/status류
  자기설정 여지도 함께 재검토할 것을 남긴다.
- **`chat_room_reads_insert_self_member`가 `last_read_at`을 검사하지 않는다**(§1 #6, DESIGN
  교차검증 발견) — PK는 행 개수만 제한하고 값 자체는 무제한이다. `reports_insert_self`와 같은
  급의 저위험(자기 배지 카운트만 왜곡)으로 판단해 등재만 하고 고치지 않았다(DESIGN이 별도
  등재).
- 이번 조사는 **INSERT 축**만 다뤘다. `pg_policies`의 `cmd='UPDATE'` 축은 I-091이 이미 훑었고,
  `DELETE`/`TRUNCATE` 축은 아직 별도 전수 조사가 없다 — 다음 회차 후보로 남긴다.

## 9. 팀장 지시 자기반증(23일차, 같은 날 후속) — I-106 발견

팀장이 보고를 받은 뒤 I-102 수정에 대한 자기반증 2건과, 그 과정에서 발견한 별도 방어 공백
판단을 지시했다. 전부 신규 테스트 크루로 실 REST 재현 후 정리했다.

**번호 표기 주의(2회 연속 충돌)**: 이 섹션과 마이그레이션 `20260729095113_major_fix_i104_
membership_role_normalization_on_approval`은 작성 당시 임시로 `i104`를 썼다 — 같은 회차에
DESIGN이 실제 I-104(`DayDetailPanel` 반응형 이슈)를 먼저 등재했고, 그 직후 다른 팀원이 또
I-105(`PollLiveContainer` 실시간 갱신 이슈)를 먼저 등재해 번호가 두 단계 어긋났다. **정식
등재 번호는 `docs/ISSUES.md`의 I-106, 결정은 `docs/prioritization-and-risks.md`의 D-067이다.**
원격에 이미 적용된 마이그레이션 파일명을 사후에 바꾸는 위험이 번호 표기 불일치보다 크다고
판단해 파일명·아래 본문의 "I-104" 표기는 고치지 않는다 — 실제 참조는 항상 I-106/D-067을 쓴다.

### 9.1 (a) 오너 이양(D-002/FR-025)·강퇴 후 재가입이 살아있는가 — PASS

- **오너 이양 코드 경로 확인**: `src/lib/data/supabase/crew.ts`의 `transferCrewOwnership`은
  `supabase.from("crews").update({ owner_id: newOwnerId })` **단 하나의 UPDATE**만 수행한다 —
  `crew_memberships`를 앱 코드가 직접 건드리지 않는다. 부수효과는 전부
  `crews_sync_membership_on_owner_transfer`(AFTER UPDATE on crews)가 `insert ... on conflict
  (crew_id,profile_id) do update`로 처리한다 — **문법적으로는 INSERT**지만 crews AFTER UPDATE
  트리거 안에서 실행되는 중첩 호출이라 `pg_trigger_depth()`가 항상 2 이상이다.
- **실측**: 정상 크루(A=오너, B=활성 멤버)에서 A→B 이양(PATCH `crews.owner_id`) → 200,
  `crew_memberships` 확인 결과 A=staff/active, B=owner/active로 정확히 동기화. B→A 재이양도
  동일하게 200/정상. **내 가드(`role<>'member'`)에 걸리지 않았다** — `pg_trigger_depth()>1`
  분기가 정확히 우회시켰다.
- **강퇴 후 재가입 — INSERT인가 UPDATE인가**: `crew_memberships`의 PK는 `(crew_id, profile_id)`
  자연 복합키다. 강퇴(`removed`)돼도 행 자체는 삭제되지 않고 남는다 — 즉 "재가입"은 **항상
  기존 행에 대한 UPDATE**이지 새 INSERT가 될 수 없다. 실측: B를 kick(removed) 후 B가 **같은
  (crew_id,profile_id)로 self-insert(INSERT, UPDATE 아님)를 시도** → **409
  `duplicate key value violates unique constraint "crew_memberships_pkey"`**(내 가드의 role·
  crew 체크는 통과한 뒤 PK 위반으로 막힘 — 가드가 막은 게 아니라 애초에 유니크 제약이 이
  시나리오 자체를 봉쇄한다). 대조군으로 self-service UPDATE(`removed`→`requested`) 시도는
  기존 트리거 `crew_memberships_block_removed_self_reapply`가 여전히 `400 unsupported
  self-service membership transition: removed -> requested`로 차단(무변경, 내 수정과 무관).
  **결론: 강퇴 후 재가입 경로는 내 신규 BEFORE INSERT 가드가 관여할 여지 자체가 없다.**

### 9.2 (b) `pg_trigger_depth() > 1` 우회가 다른 SECURITY DEFINER 경로를 막는가 — PASS

`pg_proc.prosrc`를 `crew_memberships` 전체 대상으로 전수 조회(`ilike '%insert into%crew_
memberships%'`)한 결과 4건이 매치됐으나, 본문을 직접 읽어 실제 INSERT 대상을 확인:

| 함수 | 실제로 `crew_memberships`에 INSERT하는가 | 호출 방식 | `anon`/`authenticated` EXECUTE |
| --- | --- | --- | --- |
| `crews_provision_owner_bootstrap` | 예(role=owner,status=active) | AFTER INSERT ON `crews`(트리거 전용) | `false`/`false` |
| `invitations_provision_membership` | 예(role=member 하드코딩,status=invited, ON CONFLICT DO UPDATE 분기는 role 미터치) | AFTER INSERT ON `invitations`(트리거 전용) | `false`/`false` |
| `crews_sync_membership_on_owner_transfer` | 예(role=owner,status=active, ON CONFLICT DO UPDATE) | AFTER UPDATE ON `crews`(트리거 전용) | `false`/`false` |
| `finalize_closed_poll` | **아니오** — "crew_memberships" 텍스트가 매치된 건 `join public.crew_memberships cm on ...`(알림 수신자 필터링용 SELECT 조인)일 뿐, 실제 INSERT 대상은 `meetups`·`notifications`다 | — | — |

`pg_trigger`로 위 세 함수의 트리거 등록을 재확인 — 전부 `crews` 또는 `invitations`의
AFTER INSERT/UPDATE 트리거로만 등록돼 있고, 별도의 RPC 호출부는 없다.
`has_function_privilege('anon'/'authenticated', ..., 'EXECUTE')`로 다섯 함수(위 3개 +
`join_requests_sync_membership_on_decision`·`invitations_sync_membership_on_response`)를
재확인 — **전부 `false`**. 즉 이 함수들은 트리거로만 호출 가능하고 RPC로 직접 부를 방법이
없다 — `pg_trigger_depth()`가 우연히 1 이하가 되는 경로 자체가 **구조적으로 존재하지 않는다**
(트리거 등록 + EXECUTE 회수, 이중 방어). **결론: `crew_memberships`에 INSERT하는 함수는
정확히 3개이며 전부 신뢰된 중첩 호출로만 도달 가능하다.**

### 9.3 (c) `join_requests_sync_membership_on_decision`이 `role`을 정규화하지 않는 공백 — CONFIRMED, 수정함 (I-104)

팀장이 지적한 공백을 실 REST로 재현해 **참**임을 확인했다:

1. A가 B를 FR-024로 정식 **staff** 임명(role=staff, status=active).
2. B가 FR-026 자진 탈퇴(`active`→`left`) — 이 self-service 전이는 `status`만 바꾸고 `role`은
   그대로 `staff`로 남는다(기존 가드의 설계 — role 변경 자체를 자기 서비스로 금지하기 때문에
   역설적으로 "리셋"도 일어나지 않는다).
3. B가 FR-022 자기 서비스 재신청(`left`→`requested`) — 역시 `role`은 `staff` 그대로.
4. B가 완전히 평범해 보이는 새 `join_requests` 행 제출.
5. A(오너)가 **평범한 신규 가입 신청으로 착각하고 승인**.
6. 결과: `crew_memberships`가 **role=staff, status=active**로 확정 — **A가 FR-024 임원 임명을
   다시 하지 않았는데도 B가 staff 권한을 그대로 되찾았다.**

같은 패턴이 `invitations_sync_membership_on_response`(FR-021 초대 수락)에도 있음을 함께
확인했다 — 강퇴 후 재초대(ON CONFLICT DO UPDATE로 `status='invited'`, `role`은 안 건드림) →
수락(`invited`→`active`) → 역시 role=staff가 그대로 살아난다.

**§9.2가 크루 개설/오너 이양 경로에는 이런 공백이 없음을 보였으므로**(그 두 함수는 role을
명시적으로 owner/member로 지정한다), 문제는 정확히 이 두 승인/수락 동기화 함수로 좁혀진다.
I-102가 막은 것은 "진입점(self-insert)에서 role을 조작하는 것"이고, 이건 진입점을 건드리지
않고도 **정당하게 부여됐던 role이 상태 전이 과정에서 결코 reset되지 않아 재신청·재초대 승인
한 번으로 되살아나는** 별개의 경로다 — 팀장의 판단대로 **수정이 맞다**(D-002: role은 크루
개설·FR-024 임원 임명·FR-025 오너 이양으로만 부여돼야 하고, FR-021·FR-023은 이 셋 어디에도
속하지 않는다).

**수정**: `join_requests_sync_membership_on_decision`·`invitations_sync_membership_on_
response` 둘 다, `status='active'`로 확정하는 UPDATE에 `role='member'`를 함께 강제하도록
`CREATE OR REPLACE FUNCTION`(마이그레이션
`20260729095113_major_fix_i104_membership_role_normalization_on_approval`).

**회귀 검증(실측)**: 위 시나리오를 수정 후 재현 → 최종 상태 **role=member, status=active**로
확정(더 이상 staff가 되살아나지 않음). 초대 수락 경로도 동일하게 재현 → **role=member,
status=active** 확정. 정상 최초 가입(첫 신청·첫 초대, role이 애초에 member였던 경우) 회귀도
함께 확인 — 문제없이 `role=member`로 그대로 확정. `get_advisors(security)` 신규 WARN 0건.

### 9.4 산출물 추가

- 마이그레이션: `20260729095113_major_fix_i104_membership_role_normalization_on_approval`
  (파일명은 `i104`, 정식 이슈 번호는 I-106 — 위 "번호 표기 주의" 참고).
- 이슈: `docs/ISSUES.md` I-106.
- 결정: `docs/prioritization-and-risks.md` D-067.
- 테스트 데이터(크루 3·멤버십 6·초대 2·가입신청 4·게시판/채팅방 각 3) 전부 DELETE로 정리,
  notifications 등 부작용 0건 확인.

## 10. 팀장이 SQL로 좁힌 잔여 벡터 — I-107 발견(D-067만으로는 불충분했다)

§9.3(I-106/D-067)을 보고한 뒤, 팀장이 `crew_memberships_guard_self_transition`을 직접 SQL로
대조해 **완결 지점(트리거) 수정만으로는 막히지 않는 벡터**를 지목했다: 이 함수 자체의 기존
설계 주석이 "초대 수락은 invitee가 `invitations`를 거치지 않고 자기 `crew_memberships` 행을
직접 `invited→active`로 옮겨도 된다"고 명시하고 있었다 — 이 대체 경로는
`invitations_sync_membership_on_response`(§9.3에서 고친 두 트리거 중 하나)를 전혀 통과하지
않는다.

### 10.1 실측 재현(신규 테스트 크루, 시드 데이터 미오염)

1. A가 B를 초대 → B가 **정상적으로 `invitations` UPDATE로 수락** → §9.3 수정대로
   role=member로 정상 정규화(회귀 없음, D-067이 의도대로 동작).
2. A가 B를 staff 임명(FR-024) → A가 B를 강퇴(`active`→`removed`, role=staff 보존).
3. A가 B를 재초대 — `invitations_provision_membership`의 `ON CONFLICT DO UPDATE`가
   `status`만 `invited`로 바꾸고 `role`은 안 건드림(§9에서 이미 확인한 사실 재확인).
4. **B가 `invitations` 테이블을 전혀 건드리지 않고 `crew_memberships`를 직접
   `PATCH {status:"active"}`** → **200, `role=staff, status=active`로 확정 — D-067을
   완전히 우회해 강퇴됐던 임원 권한이 되살아났다.**

`declined`(초대 거절 후 재신청)·`rejected`(가입 신청 반려/철회 후 재신청) 경로도 함께
재현했다 — 셋 다 같은 self 분기(`{declined,rejected,left}→requested`)를 타므로 role이
동일하게 보존됨을 확인했다.

### 10.2 심각도

I-106보다 심각하다 — I-106은 오너의 "평범한 승인" 행위 하나를 거쳤지만, 이 경로는 **오너가
초대를 보낸 뒤로는 어떤 추가 행위도 없이** 강퇴자 본인의 self-PATCH 하나만으로 완결된다.

### 10.3 수정 — 진입점 자체를 이중으로 막는다

`crew_memberships_guard_self_transition`에서 self-service `invited→active`·
`{declined,rejected,left}→requested` 전이 시 `new.role`을 무조건 `'member'`로 덮어쓰도록
`CREATE OR REPLACE`했다(마이그레이션
`20260729100244_major_fix_i107_membership_self_transition_role_normalization`). 이제
완결 지점(§9.3의 두 sync 트리거)과 진입점(이 함수) 양쪽이 같은 불변식을 이중으로 강제한다.

**FR-027 E3(오너의 강퇴 해제, `removed→active`)는 의도적으로 그대로 둔다** — "남의 행"
분기(officer-managed)이고, 오너가 특정 대상을 지목해 명시적으로 되돌리는 행위라 D-002가
우려하는 "오너가 모르고 승인" 상황이 아니다. 실측으로 이 경로는 role=staff를 그대로
복원함을 확인했다 — 의도된 동작으로 남긴다.

### 10.4 회귀 검증(실측)

- 공격 재현(재초대 후 crew_memberships 직접 self-PATCH) → 수정 후 **role=member,
  status=active**로 확정.
- `declined`·`rejected` 재신청 경로 → 재신청 시점에 role=member로 정규화 확인.
- 정상 최초 가입(플레인 멤버, 한 번도 staff/owner였던 적 없음)의 탈퇴→재신청→승인 →
  회귀 없이 그대로 진행(role=member 그대로).
- FR-027 E3(오너의 강퇴 해제) → role=staff 복원 그대로 유지(의도된 예외, §10.3 근거).
- `get_advisors(security)` 신규 WARN 0건.

### 10.5 I-091 표가 놓친 축(팀장 지시로 명시)

I-091의 전수 표는 "self-service UPDATE 분기가 **새 컬럼값을 제한하는가**"를 물었다. 이
결함군(I-106·I-107)은 그 질문 자체가 놓치는 형태다 — `crew_memberships`의 self 분기는
`role`을 이미 "제한"하고 있었다(`if new.role is distinct from old.role then raise`로 바꾸는
것 자체를 막는다). 그런데 **제한이 곧 보존**이라 I-091 기준으로는 "컬럼값이 제한된다 = 안전"
판정을 받았을 것이다. 하지만 role을 못 바꾸게 막는 것과, role을 안전한 값(member)으로
되돌리는 것은 다른 요구다 — "값을 제한하는 self-service 분기가 **과거에 정당하게 부여된
값을 그대로 보존해, 상태를 오가는 재활성화 한 번으로 되살리는가**"라는 축이 I-091 표에
없었다. 다음 회차의 전수조사 체크리스트에 이 질문을 추가할 것을 제안한다.

### 10.6 산출물

- 마이그레이션: `20260729100244_major_fix_i107_membership_self_transition_role_normalization`.
- 이슈: `docs/ISSUES.md` I-107.
- 결정: `docs/prioritization-and-risks.md` D-068.
- 테스트 데이터(크루 6·멤버십 12·초대 6·가입신청 5·게시판/채팅방 각 6) 전부 DELETE로 정리,
  notifications 등 부작용 0건 확인.

## 11. FR-027 E3 재판정 — DESIGN 반대·팀장 확정(I-109), `crew-membership-transition.ts`와 DB·FR의 모순 발견(I-110, 별도 이슈)

§10.3에서 CREW는 FR-027 E3(강퇴 해제, `removed→active`)를 "오너가 특정 대상을 지목하는 명시적
행위이므로 role 보존을 그대로 둔다"고 의도된 예외로 남겼다. DESIGN이 이 판정에 반대했고,
팀장이 요구사항 원문을 직접 대조해 **DESIGN 손을 들어줬다.**

### 11.1 판정 근거(팀장이 직접 확인)

1. FR-027 E3 원문(`requirements.md:599` 부근)은 "강퇴 해제 → 오너만 가능"이 전부다 — **role
   복원을 요구하는 문장이 없다.** "임원으로 되살린다"는 요구사항이 아니라 현행 구현의
   부수효과였다.
2. D-002는 "role은 개설·FR-024·FR-025로만 부여된다"고 못박는다 — 강퇴 해제는 그 셋 중
   어디에도 속하지 않는다.
3. FR-024 자체가 "대상은 active 멤버"를 사전조건으로 건다 — 오너가 강퇴자를 다시 임원으로
   만들려면 원래 ①member로 복귀 ②FR-024로 임명 두 단계여야 하는데, 지금 구조는 그 둘을
   강퇴 해제 클릭 한 번으로 뭉친다. **I-106·I-107에서 막 닫은 패턴("평범해 보이는 액션
   하나로 과거 role이 조용히 부활")과 구조적으로 동일하다.**
4. DESIGN의 "UI가 없어서 검증 불가"라는 지적도 유효했다 — `removed`/`reinstate` 전수 검색
   결과 이 전이를 호출하는 Server Action·UI가 **0건**이다. §10.3의 방어 논리("오너가 명시적
   으로 지목하는 행위")는 그 명시성을 보여줄 화면이 존재해야 성립하는데, 지금 그 화면이
   없다 — **없는 UI를 전제로 안전을 주장한 것이 §10.3의 문제였다.**

### 11.2 수정 ①(DB) — `removed→active`도 role='member'로 정규화

`crew_memberships_guard_self_transition`의 "남의 행" 분기(officer-managed)에 D-067·D-068과
대칭으로 `role='member'` 정규화를 추가했다(마이그레이션
`20260729111112_major_fix_i109_removed_reinstate_role_normalization`). staff 복원이 필요하면
오너가 FR-024를 별도로 눌러야 한다.

**실측(신규 테스트 크루)**: staff 임명→강퇴→오너 해제 → 수정 전 role=staff 복원(§10.3의
전제가 실제로 맞았음을 재확인) → 수정 후 **role=member로 정규화 확정**. 회귀: 해제 직후
오너가 FR-024로 재임명(2단계 흐름) → 정상 200, role=staff 재확정 — 정당 경로 생존 확인.
`get_advisors(security)` 신규 WARN 0건.

### 11.3 팀장이 추가로 발견한 것 — `crew-membership-transition.ts`와 요구사항·DB의 모순

팀장이 `requirements.md:160-175`(§2.4 상태 다이어그램 원문)을 다시 읽어 다음을 확인했다:

```
declined --> [*]
rejected --> [*]
left --> [*]
removed --> [*]
```

**네 종결 상태 전부 나가는 전이가 없다고 그려져 있다.** 그런데 DB는 이미 두 종류를 허용한다
— `{declined,rejected,left}→requested`(FR-022 자진 재신청, §9~§10에서 이미 다룬 정당 경로)와
`removed→active`(FR-027 E3, 위 §11.2). **요구사항 문서가 자기 자신과 모순된다** — §2.4
다이어그램은 4개를 종결로 그려 놓고, FR-022·FR-027 E3는 그 상태에서 나가는 경로를 명시한다.
그리고 `src/lib/rules/crew-membership-transition.ts`가 "2.4절의 단일 소스"(NFR-036, R-015)
라고 스스로 선언하면서 **다이어그램 쪽(틀린 쪽)을 그대로 옮겨** DB·FR과 어긋나 있었다.

이번 회차가 반복 확인한 형태의 또 다른 판이다 — 지금까지(I-101~I-108)는 "앱/규칙은 막는데
DB가 강제 안 함"이었다면, 이건 **"규칙 모듈은 종결이라 말하고 DB는 나갈 수 있다고 말한다"**
— 방향이 반대인 같은 종류의 불일치다.

### 11.4 수정 ②(코드) — `TRANSITIONS`가 DB 현실을 반영하도록 정정

`src/lib/rules/crew-membership-transition.ts`:

- `CrewMembershipEvent`에 `reapply`·`reinstate` 두 이벤트를 추가.
- `TRANSITIONS`에 `declined/rejected/left → requested`(`reapply`, FR-022)·`removed →
  active`(`reinstate`, FR-027 E3)를 반영하고 각각 FR 근거를 주석으로 달았다. `removed`가
  `reapply`(자진 재신청) 대상에서 명시적으로 제외되고 오직 `reinstate`(오너 전용)로만
  돌아온다는 것도 주석에 남겼다(FR-022 E3/FR-027 AC2).
- 파일 상단 docstring에 이번 정정의 배경(다이어그램·DB·FR 모순)을 전문 기록.

**`requirements.md` §2.4 다이어그램의 모순은 고치지 않는다(팀장 지시)** — CORE가 같은 파일을
FR-063 건으로 동시에 고치고 있어, 두 사람이 같은 파일을 동시에 고치면 이번 회차에 이미 세 번
난 번호 충돌이 네 번째가 된다. 이슈에만 기록하고 다음 회차로 넘긴다.

### 11.4b DESIGN 최종 대조(DB→모듈 방향) — 재초대 전이 추가 발견, `isTerminalMembershipStatus` 삭제

DESIGN이 팀장 지시("양방향으로 대조하라")에 따라 **DB→모듈 방향**에서 CREW가 놓친 것을
찾았다. `invitations_provision_membership`의 `ON CONFLICT ... WHERE status IN ('declined',
'rejected','left','removed')`가 **네 상태 전부에서 `invited`로 가는 전이**(재초대)를
허용한다 — `src/lib/rules/invite-eligibility.ts`가 "FR-020은 FR-022 E3 같은 재초대 제한을
두지 않는다"고 이미 의도된 동작으로 문서화해 둔 것과 정확히 일치한다. 보안 결함이 아니라
모델 불완전성이었다 — 이 전이는 status만 `invited`로 바꾸고, 그 다음 `invited→active`에서
I-107 수정이 role을 이미 `member`로 정규화한다. `reinstate`(오너의 강퇴 해제, 제3자 행위)를
이미 모듈에 넣은 선례가 있어 같은 성격의 제3자 행위인 재초대를 빼두면 모듈이 애매한 경계에
서게 된다는 지적도 맞았다.

**수정**: `CrewMembershipEvent`에 `reinvite` 추가, `TRANSITIONS`의 네 상태 전부에
`reinvite: "invited"`를 반영(FR-020·`invite-eligibility.ts` 주석 근거 포함). 파일 상단
docstring 다이어그램에도 세 번째 화살표로 추가.

**`isTerminalMembershipStatus`는 삭제로 뒤집었다** — §11.4의 최초 판단("호출부 0건이라
무해하니 독스트링만 정정하고 남긴다")을 DESIGN이 반대했고 팀장도 DESIGN 손을 들었다: 이
함수는 이제(세 전이 추가로) 모든 상태에 대해 `false`를 반환하는데, 이름이 약속하는 의미
("이 상태는 종결인가")와 실제 동작(항상 `false`)이 정반대라 남겨 두면 **다음 개발자가 이름만
보고 호출해 항상 틀린 답을 받을 위험**이 삭제 이익보다 크다 — 이번 회차가 반복 확인한 "지금
안 불려도 이름·기본값만 보고 나중에 잘못 쓰인다"는 교훈의 반대편 사례(보통은 "죽은 코드는
남겨도 무해"가 맞지만, 이 경우는 이름과 동작의 괴리가 위험 요소 그 자체)다. 삭제 사유는 파일
상단 docstring에 남겼다. `npx tsc --noEmit`으로 호출부 0건을 재확인(컴파일 에러 없음),
`npx eslint`도 클린.

### 11.5 산출물

- 마이그레이션: `20260729111112_major_fix_i109_removed_reinstate_role_normalization`.
- 코드: `src/lib/rules/crew-membership-transition.ts`.
- 이슈: `docs/ISSUES.md` **I-109**(§11.2, role 미정규화 — 해결됨) · **I-110**(§11.3~§11.4,
  규칙 모듈·요구사항·DB 삼자 불일치 — 부분 해결, `requirements.md` §2.4 정정은 이월).
  **두 건을 별도 번호로 분리한 이유**: I-109는 이번 회차에 완전히 닫혔지만 I-110은 모듈만
  고치고 요구사항 문서 정정은 남아 있다 — 한 이슈로 묶으면 I-109가 닫혔다는 이유로 전체가
  "해결됨"으로 표시돼 이월분이 닻을 잃는다(팀장 지시로 분리).
- 결정: `docs/prioritization-and-risks.md` D-071.
- 테스트 데이터(크루 1·멤버십 2·가입신청 1·게시판/채팅방 각 1) 전부 DELETE로 정리,
  notifications 부작용 0건 확인.
- **남긴 것**: `requirements.md` §2.4 다이어그램은 여전히 DB·FR과 모순된 상태로 남아 있다 —
  다음 회차가 CORE의 FR-063 수정과 별도로 정리해야 한다.
