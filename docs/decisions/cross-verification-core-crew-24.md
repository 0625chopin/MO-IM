# 24일차 교차검증 — CORE(테스트 러너·I-095·I-110) · CREW(I-111~114·I-030)

**작업자**: DESIGN · **일자**: 2026-07-29(24일차) · **배정**: 팀장(리뷰 짝 CORE·CREW)

이 문서는 팀장이 지정한 두 산출물에 대한 교차검증 결과다. 원 산출물을 다시 만들지 않고,
**주장을 재현·독립 확인**하는 데 집중했다 — 코드를 읽고 "맞겠지"라고 넘어가지 않고 SQL로
직접 재현하거나 `grep`/`tsc`/`npm test`로 재실행했다.

---

## 1. CORE — 테스트 러너 도입 · I-095 · I-110

### 1.1 소관 밖 파일 9곳(`assertAuthenticatedSession` 제거) — **PASS**

`git diff`로 9개 호출부(6개 도메인 컨테이너 + `admin/layout.tsx`·`crews/[crewId]/layout.tsx`·
`settings/page.tsx`)를 전부 직접 대조했다. **9곳 전부 `assertAuthenticatedSession(session)` →
`if (!isAuthenticated(session)) return null;` 동일한 3줄 패턴**이고, 곁들인 docstring도 각
파일 맥락에 맞게 갱신돼 있어 "기계적 교체"라는 CORE 자체 평가가 정확하다.

- `grep -rn "assertAuthenticatedSession" src/`로 전수 재확인 — **남은 참조는 전부 주석/
  docstring 안의 역사적 언급뿐**이고(예: `account/restore/page.tsx`가 "이 페이지는 그 패턴과
  달리 throw 대신 redirect한다"는 비교 설명), 실제 호출은 0건이다. `npx tsc --noEmit`·
  `npm run lint` 둘 다 클린(에러 0) — 삭제가 깨끗하다.
- **`return null`이 화면을 빈 채로 두는 게 맞는 동작인가**: 6개 컨테이너 전부 `page.tsx`가
  `<main>`(2곳은 `<h1>`까지)로 감싸고 `<Suspense>`로 컨테이너를 렌더한다 — `return null`이면
  헤더 아래가 비게 된다. 그런데 이 분기는 **Next 16의 병렬 렌더링이 만드는 폐기 브랜치라
  실제로 클라이언트에 도달하지 않는다**(레이아웃이 `{children}` 대신 `<RedirectToLogin/>`을
  택하면 그 시점에 하위 트리 자체가 응답에 포함되지 않는다 — React Server Component 트리
  구성상 자식은 부모와 독립적으로 병렬 평가되지만, 부모가 자식을 최종 트리에 포함하지 않으면
  그 결과는 폐기된다). **admin/layout.tsx·crews/[crewId]/layout.tsx 두 "진짜 게이트"**도
  같은 패턴으로 바뀌었는데, 레이아웃이 `return null`하면 그 자식 세그먼트 전체가 렌더되지
  않으므로 게이트로서는 여전히 안전하다(정보 유출 없음 — 단지 에러 화면 대신 빈 화면이라는
  UX 차이만 있다, CORE가 이미 docstring에 이 트레이드오프를 밝혔다). **결론: 안전하지만
  가정에 의존한다** — "레이아웃이 아이를 버리면 그 렌더 결과가 실제로 응답에 안 실린다"는
  Next.js 내부 동작을 코드로 강제하지 않고 문서화된 이해에만 의존한다. 실측(브라우저)으로
  깨진 사례를 찾지는 못했다(이번 검증 범위 밖 — I-095 조사 자체가 22일차에 이미 브라우저로
  "레이아웃이 최종적으로 게스트 콘텐츠를 노출하지 않는다"를 확인해 뒀다는 전제를 승계했다).
- D-030 ①(표현/컨테이너 분리) 위반 없음 — 이 변경은 컨테이너 내부의 인증 실패 처리 방식만
  바꿨고, 표현 컴포넌트와의 경계는 그대로다.

### 1.2 vitest 범위 정직성 — **PASS**

- `npm test` 직접 실행 → **27/27 통과**, `vitest.config.ts` 주석·D-072가 주장한 "27개
  테스트 케이스"와 정확히 일치(9+9+9, 파일별 `grep -c "it(\|test("`로 재확인).
- `CLAUDE.md`("나머지는 여전히 자동 테스트가 없다... 전면 커버리지가 아니다")·`R-002`("부분
  완화")·`I-071`(D-072 갱신 절이 "TS 자기 자신의 일관성만 고정, TS↔SQL 계약 테스트는 범위
  아님"이라고 명시) 세 곳 모두 과장 없이 한계를 정확히 적었다. "테스트가 생겼다"는 착시가
  생길 문구를 찾지 못했다.

### 1.3 I-110 요구사항 문서 정정 — **PASS**

`requirements.md` §2.4 크루 멤버십 다이어그램의 15개 전이 화살표를 FR-020(초대·재초대)·
FR-021(수락·거절)·FR-022(자진 재신청, **E3 강퇴 제외** 포함)·FR-023(승인·반려)·FR-026(탈퇴)·
FR-027(강퇴, **E3 강퇴 해제** 포함) 원문과 하나씩 대조했다.

- `declined/rejected/left → requested`(FR-022 자진 재신청) 3개 — **`removed`는 이 목록에서
  정확히 빠져 있다**(FR-022 E3 "과거 강�된 이력 → 재신청 차단"과 일치). 원문이 명시적으로
  금지한 전이를 다이어그램이 실수로 포함하지 않았는지가 이번 대조의 핵심이었는데, 통과했다.
  - `removed → active`(FR-027 E3, 오너 전용) — 원문과 일치.
- `declined/rejected/left/removed → invited`(FR-020 재초대) 4개 — FR-020 원문 자체는
  "재초대"라는 단어를 쓰지 않지만, 그 사전조건("비멤버 + 대기 중 초대 없음")이 과거 상태를
  제한하지 않아 이 4개 전이를 배제할 근거가 없다 — DB(`invitations_provision_membership`의
  `ON CONFLICT ... WHERE status IN (...)`)도 이미 네 상태 전부에서 허용 중이었다는 게
  I-110 조사 원문의 근거였고, 이번에 재대조해도 어긋나지 않는다.
- 원래 있던 `declined/rejected/left/removed --> [*]`(종결 표기) 4개가 실제로 다이어그램에서
  빠져 있음을 확인(더 이상 "종결"로 그리지 않는다는 주장과 일치).
- 새로 추가된 안내 문단("24일차 정정(I-110)")도 `removed`가 자진 재신청 대상에서는 여전히
  제외된다는 예외를 명시적으로 적어 둬, 다이어그램만 보고 "removed도 재신청 가능"으로
  오독할 여지를 남기지 않는다.

**신규 지적 없음.**

---

## 2. CREW — I-111 · I-112 · I-113 · I-114 · I-030

### 2.1 I-114 잔여 경로(다른 우회 진입점이 있는가) — **PASS(추가 발견 없음)**

- `crew_memberships`의 INSERT RLS(`crew_memberships_insert_self_request`)를 직접 조회 —
  self-service INSERT는 `with_check`가 `status = 'requested'`만 허용한다. `invited`·`active`
  상태로 직접 INSERT하는 self-service 경로 자체가 없다(있다면 만료 검사와 무관하게 훨씬 큰
  구멍이었을 것이다).
- `crew_memberships_guard_self_transition` 트리거 전문을 읽고 자기 행(self) 분기·남의 행
  (officer-managed) 분기를 전부 대조 — `invited→active`는 self 분기에만 존재하고, 이번에
  CREW가 추가한 `private.has_valid_pending_invitation()` 검사가 정확히 그 분기 안에 있다.
  다른 상태쌍(`declined/rejected/left→requested`, `active→left`, `requested→rejected`)은
  만료 개념 자체가 없는 FR-022/FR-026 흐름이라 이 결함과 무관하다.
- `invitations` 테이블을 경유하는 정공법(수락 시 `invitations` UPDATE → 신뢰된 중첩 호출로
  `crew_memberships`를 `invited→active`로 프로비저닝)은 I-091(23일차)이 이미 `invitations`
  UPDATE 시점에 만료 검사를 걸어 뒀다 — 이번 조사로 그 검사가 여전히 살아 있음을 재확인
  (아래 2.2의 실측 시나리오 자체가 `invitations` INSERT→provisioning 경로를 타므로 간접
  확인됨).
- **결론**: self-service 직접 PATCH(이번 수정 대상)·`invitations` 경유 정공법(I-091이 방어)
  둘 다 만료를 검사한다. 세 번째 경로를 찾지 못했다.
- **부수 발견(I-120으로 별도 등재, MINOR)**: `crew_memberships_guard_self_insert_request`
  트리거가 `new.status`를 검사하지 않아 "가입 신청 전용"이라는 전제가 RLS의 `with_check`에만
  암묵적으로 의존한다 — 오늘은 안전하지만(RLS가 유일하고 실제로 작동하는 방어선), 다음에
  다른 `status` 값의 self-INSERT를 허용하는 RLS 정책이 추가되면 이 트리거가 의도치 않게
  그 경로에도 적용된다. I-114와 직접 관련은 없으나 같은 파일을 조사하다 발견해 함께 기록한다.

### 2.2 I-114 회귀(정당 경로 생존) — **PASS(독립 재현)**

CREW의 문서 서술을 신뢰하지 않고 직접 `begin…rollback`으로 재현했다(크루 `강아지 산책
모임`, 계정 `0625chopin@gmail.com`, 시드 계정만 사용·테스트 데이터 무흔적 확인):

| 시나리오 | 결과 |
| --- | --- |
| 유효한(만료 안 된) 초대 발급 → 본인이 `crew_memberships` self-PATCH `invited→active` | **성공**, `status='active', role='member'` 반환 |
| 만료된 초대 발급 → 같은 self-PATCH 시도 | **차단**, `crew_memberships: invited->active self-service transition requires a still-valid pending invitation (FR-021 E1)` — CREW 문서가 인용한 에러 메시지와 정확히 일치 |

두 시나리오 다 사전 상태 0행 확인 → 실행 → 사후 상태 0행 재확인(오류 시나리오는 트랜잭션
자동 중단, 정상 시나리오는 명시적 `rollback`)으로 원상태 유지 확인.

### 2.3 I-111 "RPC 25개, TRUNCATE 0건" 전수성 — **PASS, 검증 범위를 넓혀 재확인**

- `has_function_privilege('anon'/'authenticated', oid, 'EXECUTE')`로 `public` 스키마 함수를
  독립적으로 재열거 — **정확히 25개**, CREW 문서의 숫자와 일치.
- `pg_get_functiondef(...) ilike '%truncate%'`로 25개 전부 재확인 — **0건**.
- **추가로 검증한 것(CREW 문서가 명시적으로 다루지 않은 gap)**: `admin_resolve_report`·
  `admin_list_reports`처럼 `public` 스키마의 25개 중 일부는 실제로는 `SECURITY INVOKER`
  얇은 래퍼이고, 진짜 로직은 `private` 스키마의 `SECURITY DEFINER` 함수가 갖고 있다(029B
  "2단 구조"). `private.*`는 `anon`/`authenticated`에 직접 `EXECUTE` 권한이 없어 CREW의
  "25개 전수" 방법(`has_function_privilege`로 직접 grant된 함수만 열거)에는 애초에 안 잡힌다
  — 그런데 이 함수들은 25개 공개 RPC를 통해 **간접적으로는 실행 가능**하다. `private` 스키마
  함수 20개 전부를 별도로 열거해 같은 `ilike '%truncate%'` 검사를 돌렸다 — **여기서도 0건**.
  즉 CREW의 결론("현재 코드 경로로는 TRUNCATE에 도달할 수 없다")은 **더 엄격한 검사에서도
  그대로 성립**하지만, 원 문서의 "25개 전수"라는 표현은 실제로는 "공개 RPC 25개"만을 뜻하고
  그 뒤에 숨은 `private` 계층까지 포함하는 문구로 읽히면 오해의 소지가 있다 — 결론은 맞지만
  방법론 서술을 "공개 25개 + 그 뒤의 `private` 20개, 합 45개 함수 전수"로 보강하면 더
  정확하다.
- `information_schema.role_table_grants`로 TRUNCATE 그랜트 자체도 재조회 — `anon`/
  `authenticated`에 대해 **0행**(DELETE 권한만 남아 있고 이는 이번 조사 대상이 아니다). 수정이
  실제로 반영돼 있음을 재확인.

### 2.4 I-112 · I-113 — 스팟 체크(전용 중점 질문 없음, 상태만 확인) — **PASS**

- I-112: `information_schema.role_table_grants`에서 `invitations` 테이블의 `anon`/
  `authenticated` grant를 조회 — `DELETE`가 목록에 없음(INSERT/SELECT/UPDATE/REFERENCES/
  TRIGGER만 남음). 마이그레이션이 실제로 반영됨.
- I-113: `pg_trigger`에서 `trg_comments_guard_reply_depth`가 `comments`에 걸려 있고
  활성(`tgenabled='O'`)임을 확인. 독립적으로 depth1→depth2 재현(`begin…rollback`, 시드
  게시글 이용) — **depth1 성공, depth2는 정확히 CREW 문서가 인용한 에러 메시지로 차단**.
  depth1이 살아 있다는 것(회귀 없음)까지 이번에 처음 실측했다 — CREW 문서는 depth2 차단만
  재현했고 depth1 생존은 "구조상 당연하다"로 넘겼는데, 실제로 별도 확인할 가치가 있었다
  (트리거가 `new.parent_id is not null`이고 그 부모의 부모가 not null인 경우만 막으므로
  depth1은 이 조건에 안 걸리는 게 코드상 명백하지만, "명백해 보이는 것"과 "실제로 그런 것"은
  이번 회차 전체가 반복 확인한 구분이다).

### 2.5 I-030 후보 완결성·B-1 근거 — **PASS, 후보 목록에 보강 제안 1건**

- 후보 A(현상 유지)·B(배치 job, B-1/B-2/B-3 하위 결정)·C(invitations만 정리) 모두 장단점이
  구체적이고 상호 배타적이다. "공통 보강"(클라이언트 `expiresAt` 계산으로 `InvitationCard`
  비활성화)이 **후보 선택과 독립적으로 항상 적용 가능**하다는 서술도 논리적으로 맞다 — 이미
  `expiresAt`을 props로 받고 있어 서버 쓰기 없이 클라이언트 계산만으로 충분하기 때문이다.
- B-1(만료를 기존 `declined`로 흡수) 추천 근거("스키마 변경 없음, 리스크 최소, 구분이
  필요해지면 그때 B-2로 승격")는 이 저장소의 기존 관행(과설계 회피, 필요해지면 확장)과
  일관되고 이번 조사가 실제로 확인한 사실(현재 어느 화면도 "거절"과 "무응답 만료"를
  구분하지 않는다)에 근거해 방어 가능하다.
- **보강 제안**: §4가 지적한 "받은 초대함에 만료된 초대가 영원히 남는다"는 문제는, 사실
  **후보 B의 배치 job이 없어도** `listInvitationsForProfile`의 쿼리 자체에
  `expires_at > now()` 조건 하나만 더하면(DB 값을 바꾸지 않고 조회만 필터링) 목록에서
  사라진다 — 이건 "공통 보강"(클라이언트 뱃지 표시)과는 다른, **서버 쿼리 필터링**이라는
  네 번째 축이다. 후보 A~C 어디에도 이 축이 명시적인 이름으로 없다(공통 보강이 그 절반
  — 화면 표시만 — 을 이미 제안했지만 "목록에서 아예 뺀다"는 별개 선택지다). 결정 자체를
  대신하지 않는다 — 이 각주를 다음 후보 목록에 추가하면 사용자가 "배치 job 없이 조회만
  고치는 게 제일 싸다"는 선택지도 함께 저울질할 수 있다는 점만 남긴다.

---

## 3. 신규 이슈

- **I-120**(MINOR): `crew_memberships_guard_self_insert_request`가 `new.status`를 확인하지
  않는 결합 — 상세는 `docs/ISSUES.md` I-120.

## 4. 재현에 사용한 테스트 데이터 — 전부 원복 확인

모든 SQL 재현은 `begin…rollback`(성공 시나리오) 또는 트랜잭션 자동 중단(오류 시나리오)
안에서만 실행했다. 각 시나리오 직후 대상 행 수를 재조회해 0건(원상태)임을 확인했다 — 상세는
위 2.2·2.4 각 절. 커밋된 신규 행 0건.
