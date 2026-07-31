# 표시 층 실렌더 감사 — 34일차, DESIGN

두 배정을 담는다: **배정 1**(D-093/I-152의 실브라우저 확인, 33일차 1순위 인계)과 **배정 2**
(33일차 `display-layer-audit-33` §8의 I-062 후속 정렬 — 실렌더 필요 여부 판정과, 필요하면
다음 회차가 그대로 집어 실행할 계획서).

---

## 1. 배정 1 — D-093(I-152) 실브라우저 확인

### 1.1 배경

33일차 CREW가 I-152를 처분해 D-093을 남겼다 — archived 크루의 `/crews/{id}/members`에서
"로스터·가입 신청 **목록**"은 열람이므로 항상 보이게 하고, 승인/반려 같은 **결정**만
`crew.status === "active"`로 추가로 가둔다. SQL(`begin`…`rollback`, authenticated 롤 + 실
JWT claims)과 코드 3중 방어(UI·Server Action·RLS)까지는 확인됐지만, **실브라우저 확인은
못 했다** — 32일차에 CREW의 1차 수정이 같은 종류(권한 경계)에서 시드로는 안 잡히는 회귀를
낸 전례가 있어 다음 회차 1순위로 지정됐다.

### 1.2 대상·계정 (profile UUID까지 특정)

DB로 먼저 확인: archived 크루는 현재 **1건**뿐이다.

```sql
select id, name, status, owner_id, visibility from crews where status = 'archived';
-- 2724533e-9e02-4609-8ad3-88becec6fe24 | I-067 검증용 archived 픽스처 크루 | archived
-- | owner_id = fb70ff1c-3736-44ee-a4a3-96993a3c62ed | public
```

이 크루의 멤버십은 **오너 1건뿐**이다(`crew_memberships` 조회, 아래 §1.7 참고) — 일반
크루원(staff/member) 페르소나를 이 크루에서 실 계정으로 재현할 방법이 구조적으로 없다.

| 페르소나 | 계정(이메일/핸들) | profile UUID | 이 크루에서의 상태 |
| --- | --- | --- | --- |
| 오너 | `0625chopin@gmail.com` / `chopin_0625` | `fb70ff1c-3736-44ee-a4a3-96993a3c62ed` | 오너, active 멤버십 |
| 비소속자 | `chopin0625@gmail.com` / `chopin0625` | `30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a` | 멤버십 0건 |
| 일반 크루원 | (실 계정 없음 — §1.5 참고) | — | — |

### 1.3 절차 — 세션 대조를 먼저 했다(33일차 교훈)

dev 서버(`localhost:3000`)를 이번 회차에 내가 처음 띄웠다(PID 기록, 재기동 없음). 브라우저를
열어 `/home`에 진입하자 **이전 세션이 남긴 `chopin0625`(30f44dd9) 세션이 그대로 남아 있었다**
(최초 요청이 `PGRST303 JWT issued at future`로 500을 낸 뒤 재시도에서 복구 — 과도기적
현상으로 보이며 이후 재현되지 않았다). `/settings`에서 `@chopin0625`를 확인해 세션 계정을
먼저 특정했다 — 33일차 교훈("실렌더 전에 현재 세션이 계획서가 지정한 계정인지 먼저 확인")을
그대로 적용했다.

이 잔존 세션(`chopin0625`)이 마침 "비소속자" 페르소나와 정확히 일치해(§1.2 표) 그대로
1번째 측정에 재사용하고, 이후 명시적으로 로그아웃 → `0625chopin@gmail.com`으로 재로그인해
오너 페르소나를 측정했다(재로그인 후 `/settings`에서 `@chopin_0625` 재확인 완료). **측정
순서(비소속자 먼저 → 오너 나중)이므로 §1.8에서 브라우저를 닫아 BOARD에게 넘긴 시점의
실제 세션은 마지막에 로그인한 `chopin_0625`(fb70ff1c)다** — 이 순서를 명확히 남긴다(아래
§1.3.1 참고, 팀장이 이 순서를 인계 정보로 옮기는 과정에서 한 차례 뒤바뀌었다).

**§1.3.1(추가) — 대조 대상은 "잔존 세션"뿐 아니라 "인계받은 세션 정보"이기도 하다.** 팀장이
BOARD에게 "DESIGN의 직전 세션은 `chopin0625`"로 전달했는데, 실제로는 위 순서대로 마지막
세션이 `chopin_0625`였다 — 내 보고의 서술 순서(오너를 §1.4에서 먼저 적음)를 실행 순서로
오독한 전달 오류였다. BOARD가 브라우저를 연 직후 `/settings` 대조로 이를 잡았다. 이번
회차로 확장되는 절차: **실렌더 전 세션 대조는 "브라우저에 실제로 남아 있는 세션"과 "인수인계
문서·구두 전달로 들은 세션 정보"를 모두 독립적으로 재확인해야 한다** — 후자도 틀릴 수
있다는 것이 이번에 실증됐다(전달자의 선의와 무관하게, 서술 순서만으로도 오독이 발생한다).

### 1.4 측정 결과

**비소속자(`chopin0625`, 30f44dd9) — `/crews/2724533e-.../members` 진입**

| 항목 | 관측값 |
| --- | --- |
| `[data-slot="empty-title"]` | `"접근 권한이 없어요"` |
| `[data-slot="empty-description"]` | `"이 크루의 크루원만 볼 수 있어요"` |
| 로스터·가입신청 등 새로 보이는 정보 | 0건 |
| 콘솔 에러 | 0건 |

→ (d) "비임원·비소속자에게 새로 보이는 것이 없는가" **충족**. 크루원 게이트(D-039, 라우트
레이아웃)가 이 컨테이너에 도달하기 전에 이미 forbidden으로 막아, `CrewMembersContainer`
내부의 열람/결정 분리 로직 자체에 비소속자는 도달하지 않는다는 것도 함께 확인됐다.

**오너(`chopin_0625`, fb70ff1c) — 같은 URL 진입**

| 항목 | 관측값 |
| --- | --- |
| 로스터 렌더 | "멤버 관리" / "크루원 1명" / 본인 행에 `(나)` 표시, 역할 `오너` |
| `<button>` 전수 텍스트(페이지 전체) | `["9+읽지 않음 10건", "로그아웃", "대기 중", "처리 내역"]`만 — **초대 버튼이 DOM에 없음**(disabled 아니라 부재) |
| "승인"/"반려" 텍스트 | `body.textContent` 전수 검색 0건 |
| `JoinRequestPanel` 탭 | "대기 중"·"처리 내역" 둘 다 렌더됨 |
| "대기 중" 탭 내용 | `"대기 중인 가입 신청이 없어요"`(`pendingEmpty`) — 이 크루의 `join_requests`가 실제로 0건이라(§1.7) |
| "처리 내역" 탭 내용 | `"처리한 가입 신청이 없어요"`(`historyEmpty`) |
| 콘솔 에러 | 0건(반복 경고 1건은 CSS preload 경고로 이 페이지·다른 모든 페이지에 공통, 무관) |

→ (a) 로스터 렌더 **충족**. (b) 가입 신청 **패널 자체**의 렌더(탭 구조) **충족**하나, 실제
pending 행 렌더는 **미확인**(§1.5). (c) 승인/반려 버튼 부재는 페이지 전체 기준으로는
**충족**하지만 "원래 있던 자리에서 사라졌는가"는 **행 자체가 없어 미확인**(§1.5). (e)
`archivedNotice` 안내 문구는 `pending.length > 0`일 때만 렌더되는데 이 크루는 pending이
0건이라 **미확인**(§1.5).

**일반 크루원 페르소나 — 방증(다른 크루로 대체)**

이 archived 크루엔 오너 외 멤버가 없어 실 계정으로 재현 불가(§1.2). 대신 같은 계정
(`chopin_0625`)이 `role=member`인 **active** 크루(`f202047b-2478-43bd-a30c-60f082ccba8e`,
"알고리즘 스터디")의 `/members`에서:

| 항목 | 관측값 |
| --- | --- |
| `[role="tablist"]` 존재 여부 | 없음 |
| "대기 중"/"승인"/"반려" 텍스트 | 0건 |
| `<button>` 전수 텍스트 | `[..., "신고", "차단", "신고", "차단", "신고", "차단", "신고", "차단", "탈퇴하기"]` |

`canViewJoinRequests`가 역할만 보고 `crew.status`와 무관하다는 것은 코드로 이미 확정돼
있다(`CrewMembersContainer.tsx:95`, `checkPermission({role, action:"crew:approve_join_request"})`
— `member`/`crew_member`는 `permission.ts:168`에서 `deny`). active 크루에서 일반 크루원에게
패널 자체가 렌더되지 않는다는 걸 실측으로 확인했으므로, "역할 판정 자체가 crew.status와
무관하다"는 코드 사실과 결합하면 **archived 크루에서도 같은 결론이 유지될 개연성은 높다** —
그러나 archived+일반크루원의 정확한 조합 자체는 이번에 실측하지 못한 채 남는다.

### 1.5 스크래치 픽스처 — 팀장 승인 → 준비 → 실행 → 원복까지 완료

archived 크루의 `join_requests`가 pending·history 모두 **0건**이었다(SQL 확인, 아래 §1.6).
(b)목록의 실제 행 렌더, (c)승인/반려 버튼이 "있던 자리"에서 사라졌는지, (e)
`archivedNotice` 문구가 실제로 뜨는지 세 가지를 확인하려면 **커밋된 스크래치 가입 신청
1건**이 필요했다 — `begin`…`rollback`으로는 Next.js 서버가 별도 커넥션을 쓰므로 브라우저가
롤백 전 상태를 볼 기회가 없다(D-054 Tier B와 같은 제약, `display-layer-audit-33` §9).

**팀장이 승인했다** — 근거: "D-093의 핵심 주장(가입 신청 목록은 열람이므로 archived에서도
보인다)을 이 크루의 `join_requests` 0건 상태로는 하나도 검증하지 못한 것이 32일차 I-151과
같은 형태의 오보 위험"이라는 판단. 조건 6가지(기준선 대조, 프로필 재사용, pending 1건만,
DOM 대조 방법, 즉시 원복, 자연 경로 여부 기록)를 전부 지켜 아래처럼 진행했다.

**§1.5.1 기준선 대조** — 팀장이 독립 측정한 값과 내가 방금 측정한 값이 **정확히 일치**했다:

| 지표 | 팀장 측정 | 내 측정(INSERT 전) |
| --- | --- | --- |
| `join_requests` 총 | 8 | 8 |
| `join_requests`(대상 크루) | 0 | 0 |
| `notifications` 총 | 47 | 47 |
| 대상 크루 멤버십 | 1 | 1 |
| `profiles` 총 | 21 | 21 |

**§1.5.2 트리거 확인(사전, INSERT의 안전성 근거)** — `join_requests` 테이블의 트리거는
`pg_trigger` 조회로 정확히 2개뿐이고 **둘 다 `AFTER`/`BEFORE UPDATE`에만 걸린다**
(`join_requests_stamp_decided_at`, `trg_join_requests_sync_membership_on_decision`) — INSERT
트리거는 0건이다. 즉 pending INSERT 자체는 구조적으로 멤버십·`decided_at`에 부수효과를
낼 수 없다(조건 3이 요구한 "실측으로 확인"은 아래 §1.5.3에서 별도로도 했다).

**§1.5.3 스크래치 INSERT + 부수효과 실측** — 신규 프로필을 만들지 않고 기존 21개 중
그 크루에 비소속인 시드 프로필 `seed_member01`(`f1692173-8785-4555-b17e-3050b8167b81`,
표시이름 "강나은")을 `requester_id`로 재사용했다. `postgres`/서비스 커넥션(MCP
`execute_sql`, RLS 우회)으로 `status='pending'` 1건만 INSERT(id
`1b0bd64c-ea94-4101-b3d8-7098fdb36e35`).

| 지표 | INSERT 전 | INSERT 후 | 기대와 일치? |
| --- | --- | --- | --- |
| `join_requests` 총 | 8 | **9** | 예(+1) |
| `join_requests`(대상 크루) | 0 | **1** | 예(+1) |
| `notifications` 총 | 47 | **47** | 예(변화 없음) |
| 대상 크루 멤버십 | 1 | **1** | 예(변화 없음) |
| `profiles` 총 | 21 | **21** | 예(변화 없음 — 재사용만 함) |

**§1.5.3.1 팀장 독립 확인(확장 지표) — 일치**: 팀장이 `crew_memberships`·`crews` **전체
총계**까지 별도로 재확인해, INSERT 후 상태가 `join_requests` 9(대상 크루 1)·`notifications`
47·`crew_memberships` **54**(전체)·`profiles` 21·`crews` **14**(전체)이며 "증가는
`join_requests` +1뿐"이라고 확인했다. 내가 직접 재실행한 결과도 정확히 같다(`crew_memberships_total:54,
crews_total:14, join_requests_total:9, join_requests_target_crew:1, notifications_total:47,
profiles_total:21`) — 대상 크루로 좁힌 내 원래 지표(§1.5.1)보다 넓은 범위(테이블 전체)까지
불변임을 교차 확인한 것이라 신뢰도가 더 높다.

**§1.5.4 자연 경로 여부(조건 6)** — **상태 자체는 자연 경로로 도달 가능하지만, 이 INSERT의
방법은 그 경로를 그대로 재현하지 않았다.** D-093 배경("disband가 `crew_memberships`를
건드리지 않는다")과 §1.5.2의 트리거 확인(UPDATE 트리거뿐, INSERT는 무관)을 결합하면,
실제 앱에서도 "크루가 active일 때 신청 접수 → 오너가 결정하기 전에 크루가 해산" 순서로
정확히 같은 최종 상태(archived 크루 + pending 신청)에 자연히 도달한다 — `join_requests`에는
크루 상태를 참조하는 제약이 없어 해산이 기존 pending 행을 건드리지 않기 때문이다. 다만 이번
INSERT는 그 시간 순서를 실제로 거치지 않고 **직접 최종 상태를 만들었다** — 도달한 상태는
자연스럽지만 도달 방법은 인위적이라는 점을 그대로 남긴다.

**대조군(control) 확보 — 기존 실데이터로 충분, 신규 생성 없음**: `chopin0625`(30f44dd9)이
role=`staff`인 **active** 크루 "알고리즘 스터디"(`f202047b-2478-43bd-a30c-60f082ccba8e`)에
이미 실 pending 가입 신청이 **2건** 있다(SQL 확인, `id: 59b68834-…`·`37f3af67-…`). 승인/반려
버튼이 "정말 그 자리에 그려지는" 대조군으로 그대로 쓴다 — 새로 만들 필요가 없다.

### 1.5.5 실행 결과 — (b)(c)(e) 전부 확인 완료

**세션 대조(팀장 지시 — 정보를 그대로 믿지 않고 화면에서 직접 확인)**: 브라우저를 다시 연
직후 `/settings`에서 `@chopin0625` 잔존 세션을 확인(30f44dd9, 팀장 예측과 일치했지만 예측이
아니라 화면 확인으로 확정). 로그아웃 → `0625chopin@gmail.com` 재로그인 → `/settings`에서
`@chopin_0625`(fb70ff1c) 재확인 완료.

**① 대조군 — "알고리즘 스터디"(active, f202047b-…), `chopin0625`(staff) 세션**

원시값 그대로 기록:
- `[role="tablist"]` `textContent`: `"대기 중2처리 내역"`(배지 2)
- `[role="tabpanel"]` `textContent`: `"남남소율@seed_outsider02한 줄 인사: 함께 하고 싶어요!반려승인백백승기@seed_outsider01한 줄 인사: 함께 하고 싶어요!반려승인"`
- `<form>` 개수: 8 / `<button>` 텍스트에 `"반려"`·`"승인"` 각 2회 포함

**대조**: 기대값(승인/반려 버튼이 그 자리에 실제로 렌더)과 **일치**. pending 배지 "2"도 SQL
진실값(§1.2.1의 대조군 확보 절, 실 pending 2건)과 정확히 일치 — role별 개수 축소 없음.

**② 테스트군 — archived 크루(2724533e-…), `chopin_0625`(오너) 세션**

원시값 그대로 기록:
- `[role="tablist"]` `textContent`: `"대기 중1처리 내역"`(배지 **1**)
- `[role="tabpanel"]` `textContent`: `"이 크루는 해산되어 가입 신청을 승인·반려할 수 없어요. 이 신청은 결정되지 않은 채로 남아요.강강나은@seed_member01한 줄 인사: 34일차 D-093 실렌더 확인용 스크래치 신청 — 확인 직후 삭제 예정"`
- `<form>` 개수: 1(승인/반려 폼이 아니다 — 아래 참고) / `<button>` 텍스트 전체:
  `["9+읽지 않음 10건", "로그아웃", "대기 중1", "처리 내역"]` — **"승인"·"반려" 0회**
- 콘솔 에러: 0건

**대조**:
- **(b) 충족** — 스크래치 신청 행이 실제로 렌더됨: 요청자 "강나은"(`@seed_member01`), 메시지
  "34일차 D-093 실렌더 확인용 스크래치 신청 — 확인 직후 삭제 예정"이 삽입한 그대로 나온다.
  탭 배지도 실제 값 "1"과 일치(SQL 진실값과 화면이 정확히 같다 — role 축소 없음, 아래 참고).
- **(e) 충족** — `archivedNotice` 문구가 목록 카드 위에 정확히 그 문자열로 렌더됨(공백·구두점
  까지 일치).
- **(c) 충족, 대조군 대비 확정** — ①에서 같은 컴포넌트가 같은 위치에 "반려"/"승인" 버튼을
  실제로 그리는 것을 먼저 확인했고, ②의 같은 카드에는 그 버튼이 **0개**(`<form>` 개수도
  1개뿐이며 승인/반려 폼이 아니다 — `PendingRequestCard`의 `canDecide=false` 분기가
  `<CardHeader>`만 렌더하고 `<form>` 자체를 만들지 않는다는 코드와 정확히 일치. 남은 폼
  1개는 `HeaderNav`의 로그아웃 폼으로 추정, 가입 신청과 무관). "disabled가 아니라 부재"가
  대조군 대비로 확정됐다.

**role별 개수 비대칭 점검(팀장 추가 요청)** — **비대칭 없음.** 대조군(대기 중 2)·테스트군
(대기 중 1) 둘 다 화면 배지·목록 행 수가 SQL 진실값과 정확히 일치했다. 브라우저를 열기 전에
미리 `pg_policy`로 조회해 둔 RLS 정의가 이 결과를 뒷받침한다:

```sql
select polname, pg_get_expr(polqual, polrelid) as using_expr
from pg_policy
where polrelid = 'public.join_requests'::regclass and polcmd in ('r','*');
-- join_requests_select_requester_or_staff:
--   requester_id = auth.uid()
--   OR crew_id IN (select cm.crew_id from crew_memberships cm
--                  where cm.profile_id = auth.uid() and cm.status='active'
--                  and cm.role = any(array['staff','owner']))
```

`listJoinRequestsForCrew`(`src/lib/data/supabase/join-request.ts:46-56`)는 이 테이블을
**RPC 없이 직접 조회**한다 — I-062류 "직접조회 vs RPC 경유" 비대칭이 성립하려면 이 직접조회
RLS 자체가 축소돼야 하는데, 위 `OR` 절이 `crew_id IN (...)`으로 **크루 단위**로 걸려 있어
staff/owner에게는 그 크루의 행 전체가 조건을 통과한다(poll 쪽처럼 "이 행이 내 것인가"를
행 단위로 좁히지 않는다). BOARD가 찾은
`poll_eligible_voters_select_self_or_staff`류의 결함(일반 멤버 시점에 대상자 수가 1로 축소)이
여기서 재현되지 않는 이유는 팀장이 짚은 대로 **"같은 정책 형태라도 그 화면을 누가 보는가"가
다르기 때문**이다 — 가입 신청 패널은 애초에 `canViewJoinRequests`(staff/owner 전용)일 때만
렌더되므로, poll 쪽처럼 "일반 멤버가 이 화면을 보는" 관찰 지점 자체가 없다. 구조가 같아도
그 정책이 실제로 노출되는 뷰어 집합이 다르면 결함이 발현되지 않는다는 것을 실측으로 확정했다.

**③ 정리 — 스크래치 행 DELETE + 원복 증명**

```sql
delete from join_requests where id = '1b0bd64c-ea94-4101-b3d8-7098fdb36e35' returning id;
-- 1행 삭제 확인

select
  (select count(*) from join_requests) as join_requests_total,
  (select count(*) from join_requests where crew_id = '2724533e-9e02-4609-8ad3-88becec6fe24') as join_requests_target_crew,
  (select count(*) from notifications) as notifications_total,
  (select count(*) from crew_memberships) as crew_memberships_total,
  (select count(*) from profiles) as profiles_total,
  (select count(*) from crews) as crews_total;
```

| 지표 | INSERT 전(기준선) | INSERT 후 | DELETE 후(원복) | 일치? |
| --- | --- | --- | --- | --- |
| `join_requests` 총 | 8 | 9 | **8** | 예 |
| `join_requests`(대상 크루) | 0 | 1 | **0** | 예 |
| `notifications` 총 | 47 | 47 | **47** | 예 |
| `crew_memberships` 총 | 54 | 54 | **54** | 예 |
| `profiles` 총 | 21 | 21 | **21** | 예 |
| `crews` 총 | 14 | 14 | **14** | 예 |

**6개 지표 전부 기준선으로 정확히 원복됐다.** 브라우저는 확인 즉시 `browser_close`로 닫아
BOARD/다음 사용자에게 넘겼다.

**운영 교훈(이번 회차, 문서화 지시)**: 이번 회차 중 Playwright 프로필 락 충돌이 있었다 —
원인은 이전 사용자가 `browser_close`를 호출하지 않아 Chrome 프로세스가 프로필 락을 계속
쥐고 있던 것(팀장이 프로세스를 직접 종료해 해소). **"이 턴에서 브라우저를 안 쓴다"와
"브라우저를 놓았다"는 다르다** — 다음 배정으로 넘어가기 전에 반드시 `browser_close`를
호출해야 다음 사용자가 락 충돌 없이 바로 쓸 수 있다. 이번에도 §3에 다시 남긴다.

### 1.6 추가 지시 — 로스터 열람이 role과 무관하게 "멤버십 유무"만 보는지(코드 확인, 실렌더 불필요)

**확정: 그렇다 — 코드 두 지점이 함께 증명한다.**

1. **라우트 게이트**(`src/app/(shell)/(app)/crews/[crewId]/layout.tsx:114-121`) —
   `(app)/crews/[crewId]/*` 전체를 가드하는 이 레이아웃은 `membership &&
   isActiveMembership(membership.status)`만 확인한다. `membership.role`은 아예 조회 결과에서
   꺼내 쓰지 않는다(도달 가능 여부 판정에 role 필드가 등장하지 않음, 파일 전문 재확인). 즉
   owner·staff·member 셋 다 활성 멤버십이기만 하면 이 게이트를 동일하게 통과한다.
2. **컨테이너 내부**(`CrewMembersContainer.tsx:181`) — `<MemberList crewId={crewId}
   crewName={crew.name} members={members} />`는 어떤 `if(role...)`·`canX &&`로도 감싸여
   있지 않다(파일 전문 재확인, 176~192행). `canInvite &&`(178행)·`canViewJoinRequests
   &&`(183행)만 조건부이고, `MemberList` 자체는 무조건 렌더된다.

두 지점을 합치면: **활성 멤버십이 있는 사람은 role과 무관하게 항상 로스터까지 도달하고
항상 로스터를 본다.** 오너로 확인한 §1.4 결과(로스터 렌더)는 일반 크루원·임원에게도 그대로
일반화된다 — 이 결론은 코드 두 지점의 조건문을 직접 읽어 확정했으므로 별도 실렌더가
필요 없다.

### 1.7 SQL 실측 근거(재현용)

```sql
-- archived 크루 전수
select id, name, status, owner_id, visibility from crews where status = 'archived';
-- 1행: 2724533e-9e02-4609-8ad3-88becec6fe24

-- 그 크루의 멤버십 전수
select cm.profile_id, cm.role, cm.status, p.handle
from crew_memberships cm join profiles p on p.id = cm.profile_id
where cm.crew_id = '2724533e-9e02-4609-8ad3-88becec6fe24';
-- 1행: fb70ff1c-..., owner, active, chopin_0625

-- 그 크루의 가입 신청 전수
select id, status, requester_id, message from join_requests
where crew_id = '2724533e-9e02-4609-8ad3-88becec6fe24';
-- 0행

-- 두 실 계정의 전체 멤버십(페르소나 배정 근거)
select cm.profile_id, p.handle, cm.crew_id, c.name, c.status as crew_status, cm.role, cm.status as membership_status
from crew_memberships cm
join profiles p on p.id = cm.profile_id
join crews c on c.id = cm.crew_id
where cm.profile_id in ('30f44dd9-1c0b-4b7f-a195-5a674c0d5d5a','fb70ff1c-3736-44ee-a4a3-96993a3c62ed')
order by p.handle, c.status desc, cm.role;
-- fb70ff1c(chopin_0625)가 role=member인 active crew: f202047b-2478-43bd-a30c-60f082ccba8e(알고리즘 스터디)
```

### 1.8 dev 서버·브라우저 상태

- dev 서버는 이번 회차에 내가 처음 띄웠다(`npm run dev`, `localhost:3000`). **재기동하지
  않았다** — 그대로 두고 팀장·BOARD가 이어서 쓴다.
- 브라우저는 §1.4 측정을 마친 뒤 1차로 닫아 **BOARD에게 해제**했다(작업 중 `SendMessage`로
  즉시 보고 완료). §1.5.5의 2차 사용(스크래치 픽스처 확인)을 마친 뒤에도 **`browser_close`를
  다시 호출해 닫았다.**
- **락 충돌 사고 기록**: 이번 회차 중 BOARD가 `browser_close`를 호출하지 않아 Chrome 프로세스가
  프로필 락(`mcp-chrome-698a372`)을 계속 쥔 채 남아 있었고, 그 상태에서 내가 브라우저를 다시
  열려다 두 차례 락 충돌을 겪었다(팀장이 해당 프로세스를 직접 종료해 해소). **"이 턴에서
  브라우저를 안 쓴다"와 "브라우저를 놓았다"는 다른 사실이다** — 다음 회차부터는 브라우저
  작업을 마치는 시점마다(중간 해제 포함) `browser_close`를 호출하는 것을 팀 운영 규칙으로
  남긴다.

---

## 2. 배정 2 — `display-layer-audit-33` §8 후속 정렬: I-062

### 2.1 범위 확인 — §9(Tier A)는 이번 회차 BOARD 소관, 겹치지 않는다

33일차 §8·§9는 두 후보(I-124·I-062, §8)와 순위 1(I-089/D-054, §9)의 코드 추적만 마치고
결론을 내지 않았다. 이번 배정은 **§9(I-089/D-054)는 BOARD가 실행하므로 손대지 않고**, §8의
**I-062**만 판정한다(I-124는 이번 배정 범위 밖 — 다음에 남긴다).

### 2.2 판정 — 실렌더가 필요하다(코드·SQL만으로 확정 불가)

**데이터 층(이미 확정)**: `getProfileByHandle`을 service-role로 재구현해 RLS·세션 유무와
무관하게 정확히 동작함을 `set local role service_role` 트랜잭션으로 실측 확인했다(I-062
"해소" 처리, `docs/ISSUES.md`). 이 부분은 재검증이 필요 없다.

**표시 층(미확정) — 이번에 코드를 다시 읽었다**: `SignupForm.tsx`(66~133행)의 핸들 상태
기계는 **전부 클라이언트 이벤트·React state·`useRef`로 구성된 로직**이다:

- `onBlur`(`handleHandleBlur`) → 로컬 형식 검사(`validateHandleFormat`, 왕복 없음) → 통과 시
  `checkHandleAvailabilityAction`(서버) 호출 → `rateLimited` 우선 분기 → `available`/`taken`
  상태 확정.
- `lastCheckedHandleRef`가 **같은 값으로 다시 blur해도 서버를 재호출하지 않고 마지막 결과를
  복원**한다(D-047 리밋 소진 완화) — 이건 시간에 따라 달라지는 컴포넌트 인스턴스 상태라 코드
  읽기만으로는 "실제로 그렇게 복원되는지" 확정할 수 없다.
- `onChange`가 `handleStatus`를 즉시 `idle`로 되돌리는데, **`lastCheckedHandleRef`는
  안 지운다** — 그래서 "타이핑했다가 원래 값으로 되돌리고 다시 blur"하면 `checking` 스피너
  없이 바로 이전 결과가 복원되는 게 의도된 동작이다. 이 상호작용(두 state·한 ref·두 이벤트
  핸들러의 시간차 조합)은 정적 코드 대조로는 "그렇게 짜여 있다"까지만 말할 수 있고, "실제
  브라우저에서 그 순서대로 이벤트가 발생했을 때 화면이 그렇게 바뀌는가"는 다른 질문이다.
- `submitDisabled`(156~161행)는 `handleStatus.kind === "taken" || "invalid_format"`일 때
  제출 버튼을 잠근다 — 버튼의 `disabled` 속성이 실제로 이 조건과 함께 토글되는지는 DOM
  이벤트가 실제로 발생해야 확인된다.

**33일차 판단(§8.2)을 그대로 유지한다 — I-124보다 위험도가 높은 이유**: I-124(§8.1)는 4개
Server Action이 **기존에 이미 있던 forbidden 렌더 경로**(다른 원인의 forbidden과 100% 동일한
코드)를 재사용하는 반면, I-062의 이 5갈래 상태 기계는 **이번 데이터 층 수정(19~20일차)이
직접 만든 새 코드 경로**이자 디바운스·캐싱·리밋 falsy 충돌 회피가 겹친 상태라 회귀 표면이
넓다. 코드 추적으로 "논리적으로는 맞게 짜여 있다"까지는 확인했지만, **I-158이 정확히 같은
종류의 "코드로는 안전해 보인다"는 결론이 11일 방치되다 뒤집힌 전례**라 이 상태만으로 종결
처리하지 않는다.

**결론: I-062의 표시 층은 실렌더가 필요하다.** SQL로는 클라이언트 상태 기계의 타이밍·이벤트
순서·DOM 반영을 확인할 수 없고, 이 감사 시리즈(32~33일차)가 반복적으로 증명한 것이 정확히
"코드 대조와 실제 렌더는 다른 것"이라는 사실이다. 아래 §2.3이 다음 회차가 그대로 집어
실행할 수 있는 계획서다.

### 2.2.1 범위 확정 — 계정 설정의 "핸들 변경" 화면은 이 계획에 넣지 않는다(코드로 확인)

`docs/ISSUES.md` I-062 "잔여" 절이 "`checkHandleAvailabilityAction`(핸들 변경 화면)도 같은
함수를 쓰므로 함께 해소됐다 — 별도 확인은 생략했다"고 적어 뒀다 — 이 생략이 정당한지 이번에
코드로 다시 확인했다(대기 시간을 활용한 추가 확인, 팀장 지시 "마저 진행").

`ProfileEditForm.tsx`(계정 설정의 핸들 변경 폼)를 전문 대조한 결과: **`onBlur` 핸들러 자체가
없다.** `#account-handle` 입력란은 `defaultValue`만 있고, 중복·형식 확인은 `changeAccountHandleAction`
(Server Action) 내부에서 **제출 시점에 한 번**만 일어난다(`change-account-handle.ts:69`) —
`SignupForm`의 `handleHandleBlur`·`lastCheckedHandleRef`·`useTransition` 조합(실시간 미리보기·
디바운스·캐싱)이 이 화면엔 전혀 없다. 결과 표시도 `useActionState`가 돌려준 `fieldError`를
그대로 렌더하는 단순 패턴이라 — I-124의 "기존에 이미 있던 forbidden 렌더 경로 재사용"과 같은
낮은 위험 범주에 속한다(디바운스·타이밍 문제가 애초에 발생할 수 없는 구조).

**결론: 이 화면은 §2.3 계획에 포함하지 않는다.** ISSUES.md의 "별도 확인 생략" 판단은
**정당했다** — 같은 함수를 재사용하지만 호출 패턴(제출 시 1회 vs. blur마다 디바운스+캐싱)이
근본적으로 달라 I-062가 우려하는 회귀 표면(클라이언트 상태 기계의 타이밍) 자체가 이 화면에는
없다. 이 판단도 코드 두 파일(`ProfileEditForm.tsx`·`change-account-handle.ts`) 전문 대조로
확정했으므로 별도 실렌더가 필요 없다.

### 2.3 실렌더 실행 계획 (다음 회차용, `display-layer-audit-33` §7 서식)

**측정 방법 원칙(팀장 지시, 배정 1과 동일 조건으로 통일)**: 아래 각 단계에서 기대 문구를
먼저 대조하며 읽지 않는다 — **`textContent`·`aria-invalid`·`disabled` 등 DOM 원시값을 먼저
그대로 기록한 뒤에, 그 다음 표의 기대값과 대조한다.** 기대 문구를 먼저 정해 두고 읽으면
화면의 다른 차이(예상 못 한 문구·레이아웃 붕괴)를 놓친다.

**전제**: `/signup`은 미인증(guest) 전용 라우트다 — 로그인 상태면 `/home`으로 리다이렉트된다
(`src/app/(shell)/signup/page.tsx`). **실렌더 전에 현재 세션이 비로그인 상태인지 먼저
확인한다** — 로그인돼 있으면 `/settings`의 "로그아웃" 버튼으로 먼저 로그아웃한다(33일차·
이번 §1.3 교훈: 세션 대조를 항상 먼저 한다). 계정 전환 자체가 필요 없다(guest 액션이라
UUID 특정 대상이 없다) — 대신 **테스트에 쓰는 핸들 문자열**을 특정한다.

**신규 데이터 생성 0건** — 아래 세 핸들 모두 기존 값을 재사용하거나 조회로 실재 여부를 미리
확정해 둔 값이다. `/signup` 폼을 **끝까지 제출하지 않는다**(제출하면 실제 가입 시도가 되어
Supabase Auth 발송 한도(§ 참고, `auth-integration-030.md` §3)에 영향을 줄 수 있다) — blur
이벤트까지만 재현하고 제출 버튼은 누르지 않는다.

| 목적 | 핸들 | 사전 확인(SQL) | 기대 상태 |
| --- | --- | --- | --- |
| taken | `chopin0625` | `profiles`에 실재(30f44dd9) | `taken` |
| available | `audit34probe` | `profiles`에 부재(이 문서 작성 시점 SQL로 확인, 12자·패턴 통과) | `available` |
| invalid_format | `Chopin` (대문자 시작) | DB 조회 불필요(형식 검사가 서버 호출 전에 로컬로 걸러낸다) | `invalid_format` |

재확인 쿼리(다음 회차가 실행 직전 다시 돌릴 것 — 시드가 바뀌었을 수 있다):

```sql
select handle from profiles where handle in ('chopin0625', 'audit34probe');
-- 기대: chopin0625 1행만, audit34probe 0행
```

**URL**: `http://localhost:3000/signup` 1개면 충분하다(폼 하나, blur만 다르게 3회).

**DOM 조회 계획 — 각 단계는 "먼저 원시값을 기록"까지만 지시한다. 기대값과의 대조는 뒤의
별도 표(§2.3.1)에서 한다(위 측정 방법 원칙):**

1. `browser_navigate`로 `/signup` 진입 → `browser_snapshot` 1회(베이스라인, 이것만 믿지
   않는다 — `display-layer-audit-33` §5 원칙 그대로 적용).
2. 핸들 입력란(`#signup-handle`)에 `chopin0625` 입력 → 다른 필드로 포커스 이동(blur 트리거,
   `browser_press_key Tab` 또는 다른 필드 클릭) → 아래를 **그대로 기록**한다(해석하지 않는다):
   - `document.querySelector('#signup-handle-error')?.textContent`
   - `document.querySelector('#signup-handle')?.getAttribute('aria-invalid')`
   - `document.querySelector('button[type="submit"]')?.disabled`
3. 핸들 값을 지우고 `audit34probe`로 교체 → blur → 같은 3가지를 그대로 기록한다:
   - `#signup-handle-desc`의 `textContent`(체크 아이콘 `svg` 존재 여부도 함께)
   - `#signup-handle`의 `aria-invalid`
   - 제출 버튼 `disabled`(다른 필드가 비어 있으면 `required`로 폼 전체 제출은 막히지만,
     **이 버튼 자체의 `disabled` 속성**은 `submitDisabled` 계산과 별개로 존재한다 —
     `required` validation과 React `disabled` prop을 혼동하지 않는다)
4. 핸들 값을 `Chopin`(대문자 시작)으로 교체 → blur → 같은 3가지를 그대로 기록하고, 추가로
   `browser_network_requests`로 이 blur 시점에 `checkHandleAvailabilityAction`(Server Action
   POST) 호출이 **있었는지 없었는지**를 그대로 기록한다(형식 오류가 리밋을 소모하지 않는다는
   docstring 주장의 직접 증거).
5. **D-047 캐싱 확인(추가 검증)**: `audit34probe`로 다시 blur(같은 값 재입력 없이 blur만
   재트리거 — 예: 클릭으로 포커스만 뺐다 다시 넣고 다시 뺀다) → `browser_network_requests`로
   이 두 번째 blur가 새 요청을 만들었는지 그대로 기록하고, 그 시점의 `#signup-handle-desc`
   `textContent`도 함께 기록한다.
6. **반증용 탐색**: 매 단계마다 `document.body.textContent`에서 `<script>` 태그 밖 텍스트에
   `null`/`undefined`/`NaN`/`[object Object]`가 섞여 있는지 그대로 기록한다(스크립트 태그
   내부 RSC 페이로드는 제외 — 34일차 §1.4에서 이 오탐 패턴을 이미 확인해 뒀다).

### 2.3.1 기록 후 대조표(기대값 — 이 표는 실행 *후* 참고한다)

| 상태 | 항목 | 기대값 |
| --- | --- | --- |
| taken(`chopin0625`) | `#signup-handle-error` | `"이미 사용 중인 핸들이에요"`(`strings.common.handle.taken`) |
| taken | `aria-invalid` | `"true"` |
| taken | 제출 버튼 `disabled` | `true` |
| available(`audit34probe`) | `#signup-handle-desc` | `"사용할 수 있는 핸들이에요"`(`strings.auth.signup.handleStatus.available`) + 체크 아이콘 |
| available | `aria-invalid` | `"false"` 또는 속성 없음 |
| available | 제출 버튼 `disabled` | `false` |
| invalid_format(`Chopin`) | `#signup-handle-error` | `"영문 소문자로 시작하고, 소문자·숫자·밑줄만 3~20자로 써 주세요"`(`strings.common.handle.invalidFormat`) |
| invalid_format | 서버 호출 여부 | 없음(0건) |
| 캐싱 재확인(2차 blur) | 서버 호출 여부 | 없음(0건) |
| 캐싱 재확인 | `#signup-handle-desc` | `available` 상태 문구 유지 |

**판정 기준**: 위 표 10행 전부 기록값과 기대값이 일치하고, 반증용 탐색(6번)이 전부 0건이면
**(A) 0건**으로 결론. 하나라도 어긋나면 그 자리에서 스크린샷 + 원시값을 그대로 팀장에게
보고(추측하지 않는다).

**한계**: D-047 IP 리밋(분당 10회) 자체의 실제 초과 재현(`rate_limited` 상태)은 이 계획에
넣지 않았다 — 로컬 `next dev`는 `x-forwarded-for`가 없어 전체 요청이 `"unknown"` 버킷
하나를 공유하므로(코드 docstring 확인), 이 계획의 3회 blur만으로도 이론상 소진에 조금씩
가까워진다. 만약 다음 회차 실행 중 리밋에 걸리면(`rate_limited` 문구 관측) 그 자체가 이
계획이 건드리지 않은 4번째 상태를 우연히 실측하는 것이므로 버리지 말고 함께 기록한다.

---

## 3. 정직 고지

- 배정 1은 **완료됐다** — D-093(I-152)의 (a)~(e) 다섯 항목 전부 실브라우저로 확인했다(§1.4,
  §1.5.5). 스크래치 픽스처(pending 가입 신청 1건, `1b0bd64c-…`)는 확인 직후 DELETE했고
  6개 지표(join_requests·notifications·crew_memberships·profiles·crews) 전부 기준선으로
  원복을 SQL로 증명했다(§1.5.5 ③). archived+일반크루원 조합만 실 계정 부재로 방증(§1.4)에
  그쳤다는 것을 표에서 지우지 않고 "미확인"으로 남겼다.
- 배정 2는 **판정과 계획을 완결했다**(팀장 지시대로 결론을 실행하지 않았다) — 실렌더 자체는
  다음 회차 몫이다. 대기 시간을 활용해 범위를 한 번 더 넓혀 계정 설정의 "핸들 변경" 화면도
  같은 위험을 공유하지 않는다는 것을 코드로 확정했다(§2.2.1) — 계획에 새 화면을 추가하지
  않는 것 자체가 이번 확장의 결론이다.
- DOM 조회는 배정 1·2 모두 "먼저 원시값을 그대로 기록 → 그 다음 기대값과 대조" 순서로
  통일했다(팀장 지시, §1.5·§2.3 각각의 대조표를 조회 단계와 분리해 뒀다).
- 이번 문서에 적은 행 수(표)는 전부 위 SQL·DOM 조회 결과를 그대로 옮긴 것이고, 요약 문장의
  건수(예: "1건", "0건")는 표의 행을 다시 세어 대조했다(33일차 열거·집계 불일치 재발 방지
  원칙). `crew_memberships`·`crews` 전체 총계(54/14)는 팀장의 독립 확인을 내가 재실행해
  일치를 재확인했다(§1.5.3.1).
