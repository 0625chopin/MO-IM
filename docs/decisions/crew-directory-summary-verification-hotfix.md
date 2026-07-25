# `crew_directory_summary` 재검증 — 결론: RPC는 이미 D-007을 만족한다 (17일차)

- **일자**: 2026-07-25(17일차)
- **담당**: CORE(A팀)
- **참조**: D-007(공개 범위 2단계), R-012(사용자 열거), NFR-016(레이트 리밋)
- **선행 산출물**: `docs/decisions/rls-policies-029b.md` §5(`crew_directory_summary` 최초 설계·
  실측), `docs/decisions/read-path-realdata-031.md` §5(DESIGN, Task 031 범위 결정)

## 0. 배정 경위

팀장이 `crew_directory_summary`가 D-007의 private 부분 노출("URL을 직접 알아도 크루명과 '초대
전용' 안내까지만 보인다")을 실제로 못 한다고 실측 결과를 보고하며 수정을 배정했다 — private
크루에 대해 `anon`·authenticated 비소속자 양쪽 모두 0행을 반환했다는 보고였다. 이 결과가 사실이면
029B가 "D-007 담당"이라 문서화한 함수가 처음부터 동작하지 않았다는 뜻이라 심각한 결함이다.

## 1. D-007 원문 재확인

`docs/prioritization-and-risks.md` D-007 원문(요약이 아니라 직접 읽음):

> **`public`**: 비로그인 방문자를 포함해 누구나 검색 결과에 노출되고 크루 소개(이름·설명·멤버
> 수·공개 범위)를 열람할 수 있다. 게시판·채팅·멤버 목록·캘린더는 크루원에게만 보인다.
> **`private`**: 같은 크루의 크루원만 검색·열람할 수 있다. 비소속 회원의 검색 결과에 나타나지
> 않으며, URL을 직접 알아도 크루명과 "초대 전용" 안내까지만 보인다. 가입은 초대로만 가능하다.

핵심: `public`은 **인증 여부와 무관하게 전부 공개**, `private`은 **크루명 + visibility(안내
분기용)만** 공개하고 나머지(설명·카테고리·멤버 수)는 **누구에게도**(크루원이 아니면) 감춘다.
"URL 직접 접근"이 로그인 여부를 조건으로 걸지 않으므로 `anon`과 authenticated 비소속자를 다르게
볼 근거가 없다 — **동일하게 취급하는 것이 원문에 맞다.**

## 2. 재검증 — RPC는 D-007을 이미 정확히 만족한다 (10개 시나리오, `begin`…`rollback` 실측)

`private.crew_directory_summary`·`public.crew_directory_summary`(029B, `rls_crew_directory_
summary_function.sql` → `rls_move_definer_logic_to_private_wrappers.sql`에서 2단 구조로 정착,
그 이후 무변경)를 대상으로, 팀장이 실측에 썼다고 밝힌 프로필(`seed_outsider01` =
`b7470f13-9b36-4039-9300-294424c6c37e`)을 포함해 크루원·오너·비소속 authenticated·`anon` 네
시점 × private/public 크루 두 종류 + 존재하지 않는 크루(임의 UUID) 를 한 트랜잭션 안에서
`set_config('request.jwt.claims', ..., true)`로 호출자를 바꿔가며 실행하고 **`rollback`으로
종료**했다(쓰기 없음 — `select`만 수행해 커밋 사고 리스크 자체가 없다).

대상 크루: private = `32aca4a8-…`("심야 독서 모임", 크루원 4명 — 오너 `fc91323c`·임원
`30f44dd9`·멤버 `53b745d6`·멤버 `f1692173`), public = `21fb8c31-…`("주말 러닝 클럽").

| # | 시나리오 | 반환 |
| --- | --- | --- |
| 1 | private, 일반 크루원(`53b745d6`) | `id, "심야 독서 모임", "private", null, null, null` |
| 2 | private, 오너(`fc91323c`) | 동일 |
| 3 | private, 비소속 authenticated(`seed_outsider01`) | 동일 |
| 4 | private, `anon` | 동일 |
| 5 | public, 크루원(`fb70ff1c`) | `id, "주말 러닝 클럽", "public", "운동", "매주 토요일…", 2` |
| 6 | public, 오너(`30f44dd9`) | 동일 |
| 7 | public, 비소속 authenticated(`seed_outsider01`) | 동일 |
| 8 | public, `anon` | 동일 |
| 9 | 존재하지 않는 크루(`00000000-…`), `anon` | **0행** |
| 10 | 존재하지 않는 크루, 비소속 authenticated | **0행** |

**결론**: `private.crew_directory_summary`/`public.crew_directory_summary`는 이미 D-007을 정확히
구현한다 — private 크루는 누가 호출하든(크루원 포함) `id·name·visibility`만 채우고 나머지는
`null`이며(§3에서 왜 크루원에게도 마스킹되는 게 맞는지 설명), public 크루는 누가 호출하든 전
필드가 채워진다. **존재하지 않는 크루(0행)와 존재하지만 private인 크루(1행, 마스킹)가 반환
행 수로 명확히 구분된다** — 팀장이 요구한 "핵심 요구"가 이미 성립한다. `rls-policies-029b.md`
§5의 최초 실측("`비공개크루B|<null>|<null>|<null>`")과도 정확히 일치한다.

**적용한 SQL 변경: 없음.** 재검증만으로 결론이 났다 — 존재하지 않는 결함을 고치려고 마이그레이션을
새로 만들지 않았다. `get_advisors(security)`는 재검증 전후로 **동일**(신규 0건, 기존
`auth_leaked_password_protection` 1건만 — 이 함수와 무관, Auth 대시보드 설정).

## 3. 왜 크루원에게도 private 크루는 마스킹되는가 (설계 확인, 문제 아님)

`crew_directory_summary`는 애초에 **"조회 대상 크루의 정보를 요약해서 보여주는 디렉터리/미리보기
전용 함수"**다(029B §5 맥락 — 게스트 멤버 수 집계 + private 부분 노출). **크루원용 전체 상세는
이 함수의 책임이 아니다** — `getCrewById`(원본 테이블 직접 조회)가 그 역할이고, RLS
`crews_select_authenticated` 정책이 "활성 크루원이거나 오너면 전체 행을 본다"를 이미 보장한다
(§4에서 실측). 즉 크루원이 이 요약 함수를 호출하면 마스킹된 값을 받는 게 **맞는 동작**이다 —
크루원은 애초에 이 함수를 호출할 이유가 없다(전체 상세가 필요하면 `getCrewById`를 쓴다).

## 4. 진짜 원인 — `getCrewById`가 이 RPC를 아예 호출하지 않는다 (팀장이 관찰한 회귀의 실체)

`src/lib/data/supabase/crew.ts`의 `getCrewById`:
```ts
export async function getCrewById(id: Id): Promise<Crew | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("crews").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toCrew(data) : null;
}
```
**`crew_directory_summary`를 호출하는 코드가 저장소 전체에 없다**(`grep -rn
"crew_directory_summary" src/` → `database.types.ts`·`supabase/README.md`의 타입/문서 언급
뿐, 실제 호출부 0건). `getCrewById`는 원본 `crews` 테이블을 RLS로만 걸러 읽는다 — 이 RLS
(`crews_select_authenticated`: `visibility='public' OR owner_id=auth.uid() OR 활성
크루원`)는 **"보이거나 안 보이거나"만 표현**할 수 있어, private+비소속자에게는 행 자체가
안 보여 `data`가 `null`이 되고 `getCrewById`도 `null`을 반환한다.

`src/components/crews/CrewHomeContainer.tsx`는 `getCrewById`가 `null`이면 곧장
`notFound()`를 던진다(크루가 아예 없는 경우와 같은 처리) — **"private이라 못 본다"와 "크루가
없다"를 구분하지 못한다.** Mock 단계에는 RLS가 없어 `getCrewById`가 항상 전체 행을 반환했으므로
`crew.visibility === "private"` 분기(`<PrivateCrewNotice crewName={crew.name} />`)가 정상
동작했다 — Task 031이 읽기를 실 Supabase로 바꾸면서 이 분기에 도달하는 경로 자체가 막혔다.
**이것이 팀장이 관찰한 "UI는 한 줄도 안 바뀌었는데 동작이 회귀했다"의 정확한 메커니즘이다.**

이건 **의도된 설계 결정의 부작용**이다 — DESIGN이 Task 031에서 이미 이렇게 적어 두었다
(`docs/decisions/read-path-realdata-031.md` §5, 원문 그대로):

> **크루 소개·게스트 멤버 수 집계(`crew_directory_summary`)는 이번 회차에서 쓰지 않았다** —
> 9개 Mock 모듈 어디에도 대응하는 함수가 없다(크루 탐색은 `listCrews`가 이미 커버하고, 게스트용
> "멤버 수만" 요약 화면은 아직 구현되지 않았다). 필요해지는 시점(크루 소개 페이지 구현 시)에
> 새 함수로 추가하면 된다 — README·029B에 근거가 이미 남아 있다.

DESIGN은 "RLS가 이미 D-007을 강제하므로 안전하다"고 판단했는데, 그 판단은 **"private 크루를
완전히 숨기는" 요구**에는 맞지만 **"private 크루가 있다는 사실 + 이름만은 보여줘야 하는"**
`CrewHomeContainer`의 요구(D-007 후반부, "URL을 직접 알아도 크루명과 안내까지는 보인다")까지는
커버하지 못한다 — Task 031 시점엔 이 함수의 실제 소비자(`CrewHomeContainer`의 private 분기)가
아직 실 데이터로 옮겨지지 않았거나 이 gap이 별도로 눈에 띄지 않았던 것으로 보인다. **비난할
실수가 아니라 두 Task(029B: RPC 준비, 031: 배럴 교체) 사이의 인계 gap이다.**

## 5. 팀장이 관찰한 "rpc_rows = 0"과의 불일치 — 원인 규명(팀장이 직접 재검증·확정)

§2의 재검증이 §0에서 인용된 팀장의 최초 실측(`anon_rpc_rows = 0`)과 정면으로 어긋났다. 이
문서의 이전 판은 그 원인을 "MCP 도구가 마지막 문장 결과만 반환하기 때문일 것"이라고
**추정**했는데, 그 추정은 부정확했다 — 팀장이 자신의 원 쿼리를 직접 재현해 **진짜 원인**을
찾았다. 아래는 그 결과를 그대로 옮긴다.

**팀장의 원 쿼리(재구성)**:
```sql
set local role authenticated;
select ... from public.crew_directory_summary(
  (select id from public.crews where visibility='private' limit 1)  -- ← 문제 지점
) s;
```

**실제 원인**: 이 안쪽 서브쿼리(`select id from public.crews where visibility='private'
limit 1`)가 **`set local role authenticated`로 역할을 전환한 뒤에** 평가된다. 그 시점의
`authenticated`(비소속자)는 RLS(`crews_select_authenticated`: `public이거나 오너이거나
활성 크루원`)에 걸려 private 크루 행을 **볼 수 없으므로** 서브쿼리 자체가 `NULL`을 반환하고,
`crew_directory_summary(NULL)`이 인자가 없으니 당연히 0행을 준다. 즉 팀장은 "이 역할이
private 크루의 id를 **스스로 찾을 수** 있는가"(정답: 못 찾는다 — RLS가 정상 동작한다는 뜻)를
잰 것이었고, 정작 D-007이 요구하는 "**URL을 이미 알고 있는 상태**에서 RPC가 올바르게
마스킹하는가"는 테스트하지 못했다 — 인자를 얻는 단계에서 이미 걸러졌기 때문이다. 이 문서
§2가 크루 id를 **`postgres`(역할 전환 전) 시점에 먼저 확보**해 리터럴 UUID로 넘긴 것("이미
URL을 아는 상태"를 정확히 모델링)이 팀장의 재현과 갈린 지점이었다.

**MCP 도구 동작에 대한 추가 확인(팀장이 독립적으로 검증, §4 이전 판의 추정을 정밀화)**:
`mcp__supabase__execute_sql`에 여러 문장을 이어 보내면 결과 하나만 돌아오는데, **그게
마지막 문장이라고 단정할 수 없다** — 팀장은 `begin; select set_config(...); set local role
...; select <본 쿼리>;` 를 보냈을 때 **첫 문장(`set_config`)의 결과**가 돌아온 사례를 실제로
겪었다(다른 호출에서는 마지막 `select` 결과가 왔다). 즉 **어느 문장의 결과가 반환되는지
불확정적**이다 — 이 문서 §2가 쓴 방식(임시 테이블에 각 probe를 `insert`로 쌓고 **마지막에
한 번만 `select`**해 전부 회수)이 이 불확정성을 피하는 유일하게 신뢰할 수 있는 방법론이다.
**주의**: 그 임시 테이블은 `postgres`(연결 기본 역할)가 만들므로, 이후 `set local role
authenticated`/`anon`으로 전환해 그 테이블에 `insert`하려면 **먼저
`grant insert, select on <temp_table> to public;`(또는 authenticated·anon을 명시)을
해 둬야 한다** — 안 하면 `42501: permission denied for table`이 난다(§2 작성 중 실제로
한 번 걸렸다. 팀장도 별도로 같은 오류를 겪었다고 확인했다).

**결론(변경 없음)**: `crew_directory_summary` SQL 함수 자체는 처음부터 결함이 없었다. 팀장의
최초 실측이 함수가 아니라 **함수 호출 전 인자 확보 단계에서 RLS에 막힌 것**이었고, 그 오류를
"RPC가 0행을 준다"로 잘못 해석했다 — 진단 대상이 함수 밖(쿼리 작성 방식)에 있었다는 점에서
§3~§4("`getCrewById`가 이 RPC를 호출하지 않는 gap")의 진짜 결함 진단과는 **별개의 사안**이다.
간극은 여전히 §4에 남아 있다: `getCrewById`가 이 RPC를 부르지 않는다.

## 6. 열거(enumeration) 방지 논증 (R-012)

`public.crew_directory_summary`는 `anon`을 포함해 임의의 호출자가 **크루 UUID를 안다면**
private 크루의 존재·이름을 확인할 수 있다. 이것이 R-012가 경계하는 열거 표면인지 검토한다.

- **UUID는 순차적이지 않고 128비트 무작위값**이다(`gen_random_uuid()`로 생성, `crews.id`
  컬럼). 무차별 대입으로 실재하는 크루 UUID를 맞힐 확률은 사실상 0이며, 설령 시도하더라도
  1회 호출당 하나의 UUID만 검증할 수 있어(존재 여부는 0행/1행으로만 갈린다) **URL이나 UUID
  자체를 이미 알고 있는 경우에만 의미가 있는 조회**다 — 이는 D-007 원문이 명시적으로 허용한
  범위("URL을 직접 알아도 크루명과 '초대 전용' 안내까지는 보인다")와 정확히 일치한다. **이
  함수가 새로 여는 노출면이 아니라 D-007이 애초에 요구한 노출면**이다.
- **16일차 `profile_search` 사고와의 결정적 차이**: 그 사고는 `ilike` 부분 일치로 구현해
  임의 문자열 접두사만으로 **다수의 실재 핸들을 훑어낼 수 있는** 열거 프리미티브를 재도입했다
  (R-012가 막으려던 것 그 자체). 이 함수는 **정확히 하나의 UUID에 대해서만** 존재 여부·이름을
  반환하며, 순차 접두사 탐색이나 "비슷한 값 나열" 같은 확장 검색 표면이 전혀 없다 — UUID
  공간에서 이런 탐색은 계산적으로 무의미하다. 그래서 "UUID는 추측 불가능하므로 열거 비용이
  사실상 무한하다"는 논증이 **성립한다**고 판단했다.
- **레이트 리밋(NFR-016, S등급·v0.2)은 이번에도 적용하지 않는다** — 크루 검색(`listCrews`)이
  이미 `visibility='public'`만 노출하므로 이 함수가 크루 존재 여부를 "찾아내는" 주 경로가 아니고,
  이미 URL/UUID를 아는 사람(초대받은 적이 있거나 링크를 공유받은 사람)의 재확인 용도가
  주 사용처이기 때문이다.

**결론: 열거 취약점을 새로 만들지 않는다.** `anon`·`authenticated` 양쪽에 EXECUTE를 유지하는
현행 권한 설정(029B가 이미 그렇게 부여했다)을 그대로 둔다 — 변경하지 않았다.

## 7. `rls-policies-029b.md` 갱신

§5에 짧은 후속 각주를 추가했다("17일차 CORE 재검증: RPC 자체는 재확인 결과 변함없이 정확하다,
실제 gap은 `getCrewById`가 이 RPC를 아직 호출하지 않는 것 — 이 문서로 인계"). **원문 서술 자체는
고치지 않았다** — §2·§5 조사 결과 원문이 틀리지 않았기 때문이다(§2 참고).

## 8. 최종 시그니처 (DESIGN이 그대로 받아 쓸 계약 — 변경 없음)

```sql
public.crew_directory_summary(p_crew_id uuid)
returns table (
  id uuid, name text, visibility text, category text, description text, member_count integer
)
```
- **크루 없음 또는 `status <> 'active'`(해산)**: 0행.
- **`visibility = 'private'`**: 1행, `id·name·visibility`만 값이 있고 `category`·`description`·
  `member_count`는 `null`. 호출자가 크루원인지 여부와 **무관**(§3).
- **`visibility = 'public'`**: 1행, 전 필드 값 있음(`member_count`는 활성 멤버 수). 호출자와
  무관.
- `anon`·`authenticated` 둘 다 호출 가능(변경 없음).

**DESIGN에게**: `getCrewById`가 raw select로 `null`을 반환했을 때(= RLS가 막았거나 진짜 없음,
구분 불가) **이 RPC로 한 번 더 확인**해 0행이면 진짜 404, 1행이면 `PrivateCrewNotice`용
`{ name, visibility }`를 반환하는 폴백을 `CrewHomeContainer`(또는 `getCrewById` 자체)에 추가하는
것을 권한다. `member`/`owner`가 이 RPC를 호출해도 마스킹된 값만 오므로(§3), 전체 상세가 필요한
경로에는 기존 raw select(`getCrewById`)를 그대로 쓴다 — 두 경로를 같이 쓰는 것이 이 함수의
원래 설계다.
