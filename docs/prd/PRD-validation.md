# PRD 기술적 검증 결과: mo_im (크루 모임 웹 서비스) v0.1

> ## 이 문서를 읽는 법 (2026-07-23 편입 시 추가)
>
> - 이 문서는 **2026-07-23 시점의 검증 기록**이다. **이후 갱신하지 않는다.** 당시 무엇을 근거로 어떻게 판단했는지를 재현하기 위해 남긴다.
> - **후속 처리의 단일 소스는 [`../prioritization-and-risks.md`](../prioritization-and-risks.md) 6.3절의 D-\*** 다. 이 문서의 권고와 D-\* 가 어긋나면 **D-\* 가 이긴다.**
> - 본문의 `C-*` / `M-*` / `m-*` / `U-*` 는 **이 문서 내부 번호**이며 저장소의 D/R/I 체계와 다르다. 아래 대응표로 연결한다.
>
> ### 편입 시 정정한 사실 하나
>
> C-1이 "기존 `cron_run` 21행 → pg_cron 잡 슬롯 경합"이라 했으나, `list_extensions` 확인 결과 **`pg_cron`은 미설치**(사용 가능 1.6.4)다. 기존 앱의 스케줄러는 애플리케이션 레벨이며, 경합은 **잡 슬롯이 아니라 DB 커넥션·요금제 한도 공유**로 좁혀진다. **결론(전용 프로젝트 신설)은 바뀌지 않는다.** 본문은 시점 기록이므로 고치지 않았다.
>
> ### 이 문서 번호 → 저장소 번호 대응표
>
> | 보고서 | 저장소 | 처리 |
> | --- | --- | --- |
> | C-1 | **D-018**, R-018 | mo_im 전용 Supabase 프로젝트 |
> | C-2 | **D-019** | 정원 원자성 = 카운터 + 조건부 UPDATE |
> | C-3 | **D-020** | 계정 잠금 자체 구현 |
> | C-4 | **D-021**, I-016 | 커스텀 SMTP 필수 / 공급자 미정 |
> | C-5 | **D-022** | 트리거 ③ 미투표자 정의 |
> | M-1, m-9 | **D-023**, I-017 | Realtime Broadcast 채택 / 요금제 미정 |
> | M-2 | **D-024** | t=0 = 판정 완료 시각 |
> | M-3 | **D-025** | `poll_eligible_voter` 조인 테이블 |
> | M-4 | **D-026** | 팔레트 CVD 순서 — D-006 충돌 회피 규칙 일부 대체 |
> | M-5 | **D-027** | 스케줄 = Supabase Cron(pg_cron) |
> | M-6 | **D-028** | RLS 헬퍼를 비노출 스키마에 |
> | M-7 | **D-029** | React Compiler 예외 절차 |
> | M-8 | **D-030** | Mock↔실데이터 경계 4개 |
> | M-9 | **D-035** | PRD §7 누락 필드 복구 |
> | M-10 | **D-031** | 대상자 5명 미만이면 종료 후 집계 공개 |
> | m-1 | **D-034** | `Meetup.status`에 `confirmed` |
> | m-2, m-3 | **D-032** | 정족수 `ceil` / `quorumRatio` 제거 |
> | m-7, m-8 | **D-036** | PRD §8 설치됨/도입예정 구분 |
> | m-10, U-1 | **R-019** | Realtime 팬아웃·채널 한도 |
> | m-11 | **D-033** | 채팅 파기는 배치 루프 |
> | m-4, m-5, m-6 | — | PRD 본문 오류라 **번호 없이 직접 수정** |
> | U-2 / U-4 / U-5 | I-017 / I-019 / I-016 | 미결 |
> | U-3 | D-024 | 해소 |
> | U-6 | — | D-019 채택으로 확인 불필요 |
> | U-7 | D-030 ③ | 해소 |
> | §6 인일 추정 | **R-020** | v0.1 168.5인일이 기대와 어긋날 위험 |

- **검증 대상**: `/mnt/e/claudeStudy/workspaces/tProject/mo_im/docs/prd/PRD.md` (781줄)
- **상위 문서**: `docs/requirements/requirements.md` (1388줄), `docs/prioritization-and-risks.md` (540줄), `CLAUDE.md`, `AGENTS.md`, `package.json`
- **검증일**: 2026-07-23
- **검증 범위**: v0.1 = FR 39건 (F001~F039)
- **최종 판정**: ⚠️ **조건부 통과**

---

## 0. 태그 규약과 근거 출처

| 태그 | 뜻 | 이 보고서에서의 근거 |
| --- | --- | --- |
| `[FACT]` | 1차 문서/실측으로 확인됨 | `node_modules/next/dist/docs/` (Next.js 16.2.11 동봉 문서), Supabase 공식 문서(MCP `search_docs` + docs 사이트), PostgreSQL 공식 문서, **이 저장소·이 Supabase 프로젝트에 대한 직접 조회 결과**, 직접 계산한 수치 |
| `[INFERENCE]` | 확인된 사실에서 논리적으로 도출 | 도출 경로를 함께 표기 |
| `[UNCERTAIN]` | 검증 못 함 | 해소 방법을 §9에 명시 |
| `[ASSUMPTION]` | 명시적 가정 | 가정임을 문장 안에 표기 |
| `[ALTERNATIVE]` | 발견한 대안 기술·우회 설계 | — |

> **Next.js에 대한 근거는 전부 로컬 동봉 문서(`node_modules/next/dist/docs/`)에서 가져왔다.** 웹의 Next.js 문서는 15 기준 서술이 섞여 있어 근거로 쓰지 않았다.

---

## 1. Chain of Thought 검증 요약

### 1.1 추론 경로 (Reasoning Path)

```
Step 0  실물 확인      → 저장소 4파일 / package.json 의존성 3개 / Supabase 프로젝트 실조회
   ↓                     ⚠︎ 여기서 최초의 중대 발견이 나옴 (C-1)
Step 1  초기 관찰·가설  → "PRD는 내부 정합성이 매우 높다. 위험은 PRD 안이 아니라
                           PRD가 '서버에서 한다'고만 쓰고 넘긴 경계에 있을 것이다"
   ↓
Step 2  기술 주장 검증  → 10개 지정 항목 + 발견 항목을 1차 문서로 개별 확인
   ↓
Step 2.5 대안 탐색      → '불가능' 판정 전에 각 항목마다 최소 3개 대안 검토
   ↓
Step 3  논리 정합성     → FR 간 상호작용·상태기계·데이터 플로우 교차 추적
   ↓                     ⚠︎ 여기서 스펙 자체의 논리 모순 발견 (C-5)
Step 4  복잡도·기간     → 영역별 인일 산정
   ↓
Step 5  가설 검증·수정  → 초기 가설 대비 실제 결과 대조
```

### 1.2 초기 가설 vs 최종 결론

| | 내용 |
| --- | --- |
| **초기 가설** | "PRD는 요구사항에서 파생된 요약본이므로 정합성 오류는 적을 것이다. 진짜 위험은 PRD가 '서버에서 원자적으로', '데이터 접근 규칙으로' 같은 표현으로 **수단을 특정하지 않고 넘긴 지점**에 몰려 있을 것이다." |
| **실제 결과** | **가설의 절반은 맞고 절반은 틀렸다.** 정합성은 실제로 매우 높다(§11 체크리스트가 실효적이다). 수단 미특정 지점이 위험한 것도 맞다(C-2, C-3, C-4). **그러나 예상 못 한 두 가지가 나왔다** — ① PRD가 백엔드로 지정한 Supabase 프로젝트가 **이미 다른 애플리케이션에 점유**돼 있고(C-1), ② 상위 문서(D-003)에 **투표 자동 종료 트리거가 영구히 발화하지 않는 논리 모순**이 있다(C-5). 둘 다 PRD 내부 정합성 검사로는 절대 잡히지 않는 종류다. |

### 1.3 기술적 확신도 분포

| 확신도 | 비중 | 대상 |
| --- | --- | --- |
| `[FACT]` | 약 70% | Next.js 16 규약, Supabase Realtime·Auth·Cron 한도, PostgreSQL 격리수준, 저장소·Supabase 실측, 팔레트 대비 계산 |
| `[INFERENCE]` | 약 22% | 위 사실들의 조합에서 도출한 설계 판정 |
| `[UNCERTAIN]` | 약 8% | Realtime 메시지 과금 계수, 실제 요금제, 팀 규모 |

---

## 2. Step 0 — 공식 문서 확인 및 실물 검증

<thinking>
PRD의 어떤 문장을 검증하기 전에, PRD가 사실로 전제한 것부터 실물로 확인한다.
PRD §0은 "저장소 현재 상태: 4개 파일뿐"이라 했고, §8은 "Supabase(project ref damruradpliktkrlkakl)"를 백엔드로 지정했다.
전자는 검증 가능하고, 후자도 MCP로 검증 가능하다. 검증 가능한 것을 안 하고 넘어갈 이유가 없다.
</thinking>

### 2.1 저장소 실물

```
src/app/{favicon.ico, globals.css, layout.tsx, page.tsx}   ← 4개, PRD §0 서술과 일치
```

`[FACT]` PRD §0의 "저장소 현재 상태" 서술은 **정확하다.** `lib/`·`components/`·API 라우트·`/sample`·`proxy.ts` 모두 없다.

`[FACT]` `package.json` 의존성은 **`next@16.2.11`, `react@19.2.4`, `react-dom@19.2.4` 3개뿐**이다. devDependencies에 `babel-plugin-react-compiler@1.0.0`, `tailwindcss@^4`, `eslint@^9`, `typescript@^5`.

`[INFERENCE]` → PRD §8이 기술 스택으로 명시한 **Supabase 클라이언트(`@supabase/supabase-js`, `@supabase/ssr`)가 아직 의존성에 없다.** 마찬가지로 폼·검증·날짜·캘린더·가상 스크롤 라이브러리가 전무하다. PRD §8 "기술 스택"은 **현재 설치된 것이 아니라 도입할 것의 목록**이며, PRD가 이를 구분해 적지 않았다.

`[FACT]` `next.config.ts`는 `reactCompiler: true` 한 줄뿐이다. `cacheComponents`·`turbopack` 설정 없음.

`[FACT]` `src/app/globals.css` 실측: 라이트 배경 `#ffffff`, 다크 배경 `#0a0a0a`. `@theme inline`에는 `--color-background`/`--color-foreground`/폰트 4개만 있다. **캘린더 12색 팔레트는 존재하지 않는다** (CON-04·D-006이 요구하는 대상).

### 2.2 Supabase 프로젝트 실물 — **최대 발견**

<thinking>
검증 지시문은 "이 프로젝트의 project ref는 damruradpliktkrlkakl이며 아직 스키마가 없습니다(테이블 0개)"라고 했다.
확인 없이 이 전제를 받아들이면 안 된다. list_tables로 직접 본다.
</thinking>

`[FACT]` `mcp__supabase__get_project_url` → `https://damruradpliktkrlkakl.supabase.co` (`.mcp.json`의 ref와 동일, 즉 조회 대상이 맞다).

`[FACT]` `mcp__supabase__list_tables(public)` 결과 — **테이블 0개가 아니라 43개**다. 그리고 mo_im 도메인이 **전혀 아니다**:

```
world, league, season, team, team_season, manager, player, player_attribute,
player_attribute_history, player_position, player_state, contract, transfer, loan,
fixture, match_event, match_lineup, weather, player_match_stat, player_season_stat,
player_career_stat, team_season_stat, standing, injury, youth_prospect,
news_feed_item, sanction, sponsor, sponsor_contract, point_transaction, award, trophy,
common_code_group(38행), common_code(155행), common_code_history,
sim_constant_snapshot, cron_run(21행), cron_gap,
audit_log, club_owner, profile(2행), wallet(2행), wallet_transaction
```

`[FACT]` `mcp__supabase__list_migrations` → **마이그레이션 33건**, 2026-07-20 ~ 2026-07-22:
`core_tables_phase1`, `task032_rls_first_pass_group_a/b/c`, `task032_rls_hardening_search_path`,
`reduce_security_definer_exposure`, `tick_advisory_lock`, `tick_run_idempotent_claim`,
`tick_run_batch_cap`, `tick_run_retry_catchup`, `tick_run_gap_detect`, `cron_interval_divisor`,
`auth_profile_wallet_provisioning`, `handle_new_user_restrict_execute`,
`profile_locale_column`, `wallet_apply_transaction`, …

`[FACT]` 43개 테이블 **전부 `rls_enabled: true`**다.

`[INFERENCE]` 이 프로젝트는 **축구 매니저 시뮬레이션 애플리케이션이 활발히 개발 중인 라이브 프로젝트**다. 근거: ① 도메인 엔티티 구성 ② 3일에 걸친 33건 마이그레이션 ③ `tick_*` 계열 마이그레이션 5건 + `cron_run` 21행 = **시뮬레이션 틱 스케줄러가 실제로 돌았다** ④ `auth_profile_wallet_provisioning` + `handle_new_user_restrict_execute` = **`auth.users`에 신규 가입 시 `profile`·`wallet`을 자동 생성하는 트리거가 이미 걸려 있다**.

`[INFERENCE]` → 따라서 **검증 지시문의 "테이블 0개"와 `R-003`의 "클라이언트 코드·스키마·마이그레이션이 없다"는 둘 다 사실이 아니다.** PRD §8이 이 ref를 mo_im 백엔드로 명시한 것은 **검증되지 않은 전제 위에 서 있다.** → **C-1** 참조.

### 2.3 확인한 1차 문서 목록

| 대상 | 경로/URL | 확인 방법 |
| --- | --- | --- |
| Next.js 16 업그레이드 가이드 | `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md` (1255줄) | 직접 열람 |
| `reactCompiler` 설정 | `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/reactCompiler.md` | 직접 열람 |
| `cacheComponents` 설정 | 동 디렉터리 `cacheComponents.md` | 직접 열람 |
| React Compiler 한계 | `https://react.dev/learn/react-compiler/introduction` | WebFetch |
| Supabase Realtime 한도 | `https://supabase.com/docs/guides/realtime/quotas` | WebFetch |
| Postgres Changes 한계 | `https://supabase.com/docs/guides/realtime/postgres-changes` | WebFetch |
| Supabase RLS + 성능 | MCP `search_docs` (Row Level Security / RLS Performance / lint 0003) | MCP |
| Supabase Cron | MCP `search_docs` (Cron / Install / pg_cron 디버깅 / Edge Function 스케줄) | MCP |
| Supabase Auth 한도 | `https://supabase.com/docs/guides/auth/rate-limits` + MCP(Password-based Auth) | WebFetch + MCP |
| PostgreSQL 트랜잭션 격리 | `https://www.postgresql.org/docs/current/transaction-iso.html` | WebFetch |
| Vercel Cron 한도 | `https://vercel.com/docs/cron-jobs/usage-and-pricing` | WebFetch |
| 이 Supabase 프로젝트 | MCP `list_tables` / `list_extensions` / `list_migrations` / `get_project_url` | MCP |

---

## 3. Step 1 — 초기 분석

<thinking>
PRD의 구조를 먼저 파악한다. 무엇이 이미 잘 돼 있는지 알아야 어디를 봐야 할지 알 수 있다.
</thinking>

### 3.1 관찰한 사실

| 항목 | 내용 |
| --- | --- |
| 프로젝트 유형 | 다중 테넌트(크루 단위) 소셜 앱. 실시간 채팅 + 투표 + 캘린더 + 권한 모델 |
| 기술 스택 | Next.js 16.2.11 App Router / React 19.2.4 / TS strict / Tailwind v4 / Supabase / Vercel |
| 외부 의존 | Supabase(Auth·Postgres·Realtime), Vercel. **PRD에 없으나 필요한 것: SMTP 공급자** (§C-4) |
| 범위 | v0.1 = FR 39건. 단 v0.1의 릴리스 정의는 **"Mock 데이터 기반 화면·컴포넌트 완성"**(6.1절), 실데이터는 v0.2 |
| 화면 | 19개 MVP 페이지, 컴포넌트 약 70종, 각 4상태 |

### 3.2 PRD의 강점 (공정한 평가)

`[FACT]` 다음은 실제로 확인되어 문제가 없었다:

1. **F↔FR 추적**: 9.1/9.2절 39쌍을 역방향 대조 → **완전 일치**. 9.3절 15건 + 39건 = 54건이 6.1절 총계(M36+S14+C3+W1)와 **일치**.
2. **SC 대응**: 22개 화면 중 19개 포함, 제외 3개(SC-04·SC-21·SC-22)의 사유가 각각 FR 등급으로 뒷받침됨.
3. **원본 우선 규약**: §0이 "충돌 시 원본이 이긴다"를 명시 → 파생 문서의 표준적 처리.
4. **모호점 자기 발견**: §12가 원본의 집계 오류 2건과 모호점 3건을 스스로 찾아 D-015~D-017로 승격시켰다. **이건 드물게 잘한 것이다.**
5. **저장소 현실 인식**: §0이 "이번 PRD가 만들 대상이며 현재 존재하지 않는다"를 명시 → R-006(문서가 목표 상태를 현재형으로 기술) 재발 방지.

`[INFERENCE]` → **PRD 내부 정합성을 다시 검증하는 것은 투자 대비 효과가 낮다.** 검증 자원을 ① PRD가 수단을 특정하지 않은 지점 ② 상위 문서에서 상속된 결함 ③ 플랫폼 한도에 집중한다.

### 3.3 검증할 핵심 기술 주장

| # | 주장 | 출처 |
| --- | --- | --- |
| ① | 정원 선착순 동시성을 "서버에서 원자적으로" 판정할 수 있다 | FR-066 E2·AC2 |
| ② | 투표 기한 자동 종료가 동작한다 | D-003, FR-043 |
| ③ | 채팅 12개월 파기 배치가 v0.2에 가능하다 | D-009, NFR-033 |
| ④ | Realtime으로 채팅·집계·토스트를 모두 감당한다 | NFR-007, R-011 |
| ⑤ | `private` 비노출 + `public` 비로그인 노출을 한 테이블 정책으로 만족한다 | D-017 + D-007 |
| ⑥ | `eligibleSnapshot: profileId[]` 배열 설계가 타당하다 | requirements 5.2 |
| ⑦ | React Compiler 제약이 INP 목표와 충돌하지 않는다 | CON-03, NFR-001 |
| ⑧ | 12색 팔레트가 라이트·다크 양쪽에서 3:1을 통과한다 | D-006, NFR-018 |
| ⑨ | UI 수정 없이 데이터 조회부만 교체 가능하다 | CLAUDE.md, NFR-034 |
| ⑩ | 네이티브 전환 시 재사용 가능한 구조다 | 원문 №13, R-015 |

---

## 4. Step 2 — 지정 항목 10건 개별 검증

### ① 정원 선착순의 동시성 — FR-066 AC2

<thinking>
관찰: FR-066 AC2는 "정원이 찬 Meetup에 2명이 동시에 참석 요청 → 정확히 0명만 추가"를 요구한다.
E2는 "후행 요청 거부(서버에서 원자적으로 판정)"라고만 쓴다. requirements 5.2 MeetupAttendance 행은
"본인 행만 insert/update. 정원 판정은 서버에서 원자적으로 수행(클라이언트 판정 금지)"이라 쓴다.

추론: Supabase에서 "서버"는 셋 중 하나다 — (a) RLS 정책, (b) DB 함수(RPC), (c) Edge Function.
PRD/요구사항은 (a)를 강하게 암시한다("본인 행만 insert"는 RLS 문법 그대로다).
그렇다면 RLS의 WITH CHECK 안에 "현재 참석자 수 < 정원" 서브쿼리를 넣으면 되는가?
이게 성립하는지가 핵심 질문이다.
</thinking>

**검증한 사실:**

`[FACT]` Supabase RLS의 INSERT 정책은 `with check (<불리언 식>)`이며, 그 식 안에 서브쿼리를 쓸 수 있다 (Supabase RLS 문서, `exists (select 1 from roles_table where ...)` 예시가 공식 문서에 있음).

`[FACT]` PostgreSQL 공식 문서(`transaction-iso.html`)는 Read Committed에 대해 다음을 명시한다:

> "Because of the above rules, it is possible for an updating command to see an inconsistent snapshot… **This behavior makes Read Committed mode unsuitable for commands that involve complex search conditions.**"
>
> "**Attempts to enforce business rules by transactions running at this isolation level are not likely to work correctly without careful use of explicit locks to block conflicting transactions.**"
>
> "a Read Committed or Repeatable Read transaction which wants to ensure data consistency may need to take out a lock on an entire table… or it may use **`SELECT FOR UPDATE` or `SELECT FOR SHARE`**"

`[FACT]` PostgreSQL의 기본 격리 수준은 Read Committed이며, PostgREST 경유 요청은 요청당 트랜잭션으로 이 기본값에서 실행된다.

**추론 체인:**

`[INFERENCE]` RLS `WITH CHECK` 안의 `(select count(*) from meetup_attendance where meetup_id = ...) < capacity`는 **삽입 대상 행이 아닌 다른 행들에 대한 검색 조건**이다. 두 트랜잭션 T1·T2가 동시에 실행되면 둘 다 커밋 전 스냅샷에서 `count = 9`를 보고, 둘 다 `9 < 10`을 통과하고, 둘 다 커밋한다 → **정원 10에 11명**. 이것이 정확히 PostgreSQL 문서가 말하는 "complex search conditions"에 해당하는 상황이다.

→ **결론: `[INFERENCE]` RLS 정책만으로는 FR-066 AC2를 만족할 수 없다.** 이는 Supabase의 결함이 아니라 MVCC의 정의다. 그리고 이 실패는 **조용하다** — 부하가 없으면 재현되지 않아 수동 QA(R-002: 테스트 러너 없음)로는 절대 잡히지 않는다.

**대안 탐색 (Step 2.5 — 4개 검토):**

| # | 방식 | 원자성 | 평가 |
| --- | --- | :-: | --- |
| A `[ALTERNATIVE]` | **카운터 컬럼 + 조건부 UPDATE** — `meetup.attending_count` 유지, `update meetup set attending_count = attending_count + 1 where id = $1 and capacity is not null and attending_count < capacity` | ✅ | **권장.** UPDATE가 대상 행에 배타 락을 잡고, 락 획득 후 **갱신된 최신 행으로 WHERE를 재평가**한다(PostgreSQL Read Committed의 UPDATE 재검사 규칙). 영향 행 0 = 마감. `check (attending_count <= capacity)` 제약을 최후 방어선으로 추가. 조회 성능도 얻는다(FR-064 AC3 "참석 N/정원 M"이 집계 없이 O(1)) |
| B `[ALTERNATIVE]` | **`SECURITY DEFINER` RPC + `select … for update`** — meetup 행을 잠그고 count 후 insert | ✅ | 유효. 단 함수를 **노출 스키마 밖**에 둬야 함(Supabase 공식 경고: "Security-definer functions should never be created in a schema in the Exposed schemas"). A보다 왕복이 많음 |
| C `[ALTERNATIVE]` | **`pg_advisory_xact_lock(meetup_id)`** | ✅ | 유효하나 A의 행 락으로 충분해 추가 이점 없음 |
| D `[ALTERNATIVE]` | **SERIALIZABLE + 재시도** | ✅ | 정확하나 직렬화 실패 재시도 루프가 클라이언트까지 올라와 UX가 나빠짐 |

`[INFERENCE]` → **부분 구현이 아니라 완전 구현이 가능하다.** 다만 **수단이 A/B로 특정되어야 하며, 그 특정이 문서 어디에도 없다.**

**추가 발견 `[FACT]`:** PRD §7 `MeetupAttendance`에 **`(meetupId, profileId)` 유일 제약이 없다.** FR-067 E2가 "이미 불참 상태 → 무시(멱등)"를 요구하므로 upsert가 필요한데, upsert(`on conflict`)는 유일 제약을 전제한다. 이 제약이 없으면 이중 클릭만으로 한 사람이 두 자리를 차지한다.

→ **C-2**

---

### ② 투표 자동 종료 트리거 — D-003, FR-043

<thinking>
관찰: D-003의 종료 트리거는 셋이다.
  ① 기한 도래 자동 ② 수동 조기 종료 ③ 미투표자 0명이면 즉시 자동 종료
②③은 사용자 요청 안에서 동기 처리되므로 스케줄러가 필요 없다. ①만 스케줄이 필요하다.
그러면 Vercel + Supabase에서 스케줄 수단이 무엇이고 최소 주기가 얼마인가?
</thinking>

**검증한 사실 — 수단과 주기:**

`[FACT]` Supabase Cron 공식 문서:
> "Cron Jobs … **can run anywhere from every second to once a year** depending on your use case."
> "For best performance, we recommend **no more than 8 Jobs run concurrently**. Each Job should run **no more than 10 minutes**."

`[FACT]` pg_cron 디버깅 가이드: "pg_cron supports up to **32 concurrent jobs**, each using a database connection."

`[FACT]` 이 프로젝트에서 `pg_cron`은 `default_version: 1.6.4`, `installed_version: null` — **설치 가능하나 아직 미설치**. `pg_net`(0.20.4)도 동일.

`[FACT]` Vercel Cron 공식 문서:

| | 프로젝트당 개수 | **최소 간격** | 정밀도 |
| --- | --- | --- | --- |
| **Hobby** | 100 | **하루 1회** | 시간 단위 (±59분) |
| **Pro** | 100 | 1분 | 분 단위 |
| **Enterprise** | 100 | 1분 | 분 단위 |

> "Hobby accounts are limited to cron jobs that run once per day. Cron expressions that would run more frequently **will fail during deployment**."
> "`0 1 * * *` will trigger anywhere between 1:00 am and 1:59 am."

**추론 체인:**

`[INFERENCE]` **Vercel Hobby의 Cron은 이 제품에 쓸 수 없다.** 하루 1회 + ±59분 오차로는 "투표 마감 시각 도래 시 종료"가 성립하지 않는다(마감이 최악 24시간 늦게 처리됨). 배포 자체가 실패한다.

`[INFERENCE]` → **pg_cron이 Vercel Cron보다 명백히 우월한 선택이다.** 초 단위까지 내려가고, 요금제 게이트가 없고(확장이 이 프로젝트에서 이미 사용 가능), 네트워크 왕복이 없다. `[ALTERNATIVE]` `pg_cron` + `net.http_post`로 Edge Function을 호출하는 조합도 공식 문서에 예시가 있으나, 투표 종료·판정·Meetup 생성·알림 적재는 **전부 SQL로 표현 가능**하므로 Edge Function을 경유할 이유가 없다.

**체감 지연 분석 (FR-045 AC2 / FR-060):**

`[FACT]` FR-043 E3: "실패해도 **열람 시점에 마감 시각이 지났으면 종료로 간주한다**", AC4: "자동 종료 작업이 5분 지연, When 사용자가 상세 조회, Then 마감 시각이 지난 투표는 종료 상태로 보인다."

`[INFERENCE]` → 이건 **read-time fallback 설계**이며, 스케줄러 지연에 대한 좋은 방어다. **그러나 이 방어는 표시(display)에만 유효하다.** 다음 셋은 쓰기 부작용이므로 fallback으로 대체되지 않는다:
- FR-060 Meetup 생성 (캘린더에 실제로 행이 생겨야 함)
- FR-045 알림 레코드 생성 (AC1: 정확히 9건)
- FR-025/F025 토스트 발송

→ `[INFERENCE]` **"화면에는 종료로 보이는데 Meetup은 없고 알림도 안 온 상태"**가 스케줄 주기만큼 존재한다. FR-043 AC4가 이 상태를 정상으로 규정했으므로 스펙 위반은 아니지만, PRD 여정 C의 5→6→7단계(판정→알림→캘린더)가 그 사이 끊긴다. **PRD/요구사항 어디에도 이 중간 상태의 UI 규정이 없다.**

**FR-045 AC2 "5초 이내"의 t=0 문제:**

`[INFERENCE]` AC2는 "Given 접속 중인 대상자, When **투표 종료**, Then 5초 이내 토스트"라 쓴다. `투표 종료`가
- (가) **판정 완료 시각**이면 → Realtime 전달만 걸리므로 5초는 여유롭게 달성 가능
- (나) **마감 시각(`closesAt`)**이면 → 지연 = 스케줄 주기 + 처리시간. 1분 주기면 최악 60초+ → **AC2 위반**

`[UNCERTAIN]` 원문이 t=0을 정의하지 않아 어느 쪽인지 확정할 수 없다. **(가)로 읽는 것이 자연스럽고 pg_cron 1분 주기로 충분하지만, 이 해석이 문서화돼야 한다.** → **M-2**

**결론:** `[FACT]` 스케줄 수단은 존재하고(pg_cron, 초 단위 가능, 무료 티어 게이트 없음), 무료 티어에서도 실행 가능하다. `[INFERENCE]` **기술적 장애는 없다.** 다만 ① Vercel Cron을 쓰려면 Pro가 필요하고 Hobby는 배포 실패 ② AC2의 t=0 정의 ③ 종료-표시/미생성 중간 상태 UI가 미정.

---

### ③ 채팅 12개월 자동 파기 배치 — D-009, NFR-033

<thinking>
②와 같은 스케줄 문제이므로 수단은 이미 확인됐다. 남은 것은 실행 시간이다.
Supabase 문서가 "Each Job should run no more than 10 minutes"를 권고했으므로,
삭제 대상이 커졌을 때 이 10분을 넘길 수 있는지가 질문이다.
</thinking>

`[FACT]` NFR-033은 **M / v0.2**다. 즉 v0.1(Mock) 범위 밖이며, 이 검증의 대상 범위(v0.1) 밖이다.

`[FACT]` Supabase Cron 권고: 잡당 10분 이내, 동시 8잡 이내.

`[INFERENCE]` 대량 `DELETE`의 문제는 실행 시간만이 아니다. 단일 `delete from chat_message where created_at < now() - interval '12 months'`는 ① 긴 트랜잭션 동안 대량 행 락 ② WAL 급증 ③ autovacuum이 따라오지 못하면 테이블 팽창 ④ 10분 초과 시 잡 타임아웃(공식 디버깅 가이드가 "Long running jobs may show timeout errors"를 명시).

**대안 탐색 `[ALTERNATIVE]` (3개):**

| # | 방식 | 평가 |
| --- | --- | --- |
| A | **배치 삭제 루프** — `delete … where id in (select id … limit 5000)`을 반복, 잡당 상한 시간 내에서 끊고 다음 주기로 이월 | 단순, 즉시 적용 가능. 이 Supabase 프로젝트가 이미 `tick_run_batch_cap`·`tick_run_retry_catchup` 마이그레이션으로 **같은 패턴을 쓰고 있다** |
| B | **`pg_partman` 월 단위 파티셔닝 + `DETACH`/`DROP`** — 12개월 지난 파티션을 통째로 드롭 | 삭제가 O(1). `pg_partman 5.3.1`이 이 프로젝트에서 **설치 가능**(`[FACT]` list_extensions 확인). 채팅처럼 append-only + 시간 기반 파기에 정확히 맞는 도구 |
| C | 소프트 삭제 후 야간 물리 삭제 | D-009의 "파기"(개인정보 처리방침 고지 대상)와 상충 — 조회만 막고 데이터는 남으므로 **부적합** |

`[INFERENCE]` → **B가 정답에 가깝다.** 다만 파티셔닝은 **테이블 생성 시점에 결정**해야 소급 비용이 없다. NFR-033이 v0.2이고 스키마 설계도 v0.2이므로, **스키마를 그릴 때 `chat_message`를 파티션 테이블로 만들지 결정해야 한다.** 지금 결정하지 않으면 나중에 전체 재적재가 필요하다.

`[INFERENCE]` **부수 효과 하나**: D-009는 "크루 해산 시 함께 파기"도 요구한다. 파티셔닝은 시간 기준이므로 크루 기준 삭제는 여전히 일반 DELETE다. 두 경로가 필요하다.

**결론:** `[INFERENCE]` **기술적으로 문제없다.** 단 "12개월 배치"를 **스키마 설계 시점의 파티셔닝 결정**과 묶어야 하며, 현재 문서는 이를 "v0.2에 배치 작업 추가"로만 서술해 **결정 시점을 놓칠 위험**이 있다.

---

### ④ Realtime 부하와 한도 — R-011, NFR-006

<thinking>
NFR-006: 전체 1,000세션 / 크루당 100세션.
채팅(FR-051), 투표 집계(NFR-004 ≤3초), 알림 토스트(FR-045 AC2 ≤5초)가 전부 Realtime 의존(NFR-007).
요금제별 한도와 대조한다. 그리고 "어떤 Realtime을 쓰느냐"가 한도보다 더 중요할 수 있다.
</thinking>

**검증한 사실 — 요금제 한도:**

`[FACT]` Supabase Realtime Quotas (공식):

| 지표 | Free | Pro | **Pro (지출 상한 해제)** | Team | Enterprise |
| --- | ---: | ---: | ---: | ---: | ---: |
| 동시 연결 | **200** | **500** | **10,000** | 10,000 | 10,000+ |
| 초당 메시지 | 100 | 500 | 2,500 | 2,500 | 2,500+ |
| 초당 채널 조인 | 100 | 500 | 2,500 | 2,500 | 2,500+ |
| 연결당 최대 채널 | 100 | 100 | 100 | 100 | 100+ |

`[FACT]` 공식 정의: "An **event** is a WebSocket message delivered to, **or sent from** a client."

**추론 체인 — 요금제 판정:**

`[INFERENCE]` NFR-006의 **전체 1,000세션은 Free(200)와 Pro-지출상한(500)을 모두 초과한다.** 세션 1개 = 연결 1개라면 **최소 Pro + 지출 상한 해제(10,000)** 가 필요하다. → **NFR-006은 특정 요금제를 전제하는 요구사항인데, 문서 어디에도 요금제가 적혀 있지 않다.**

`[INFERENCE]` 완화 요인: **NFR-006은 등급 C / 릴리스 v1.0**이다. 즉 v0.1·v0.2 판정 대상이 아니다. 반면 NFR-003(채팅 1초)은 **M / v0.2**다. → **v0.2 시점의 실제 부하 목표가 문서에 없다.** R-011이 지적한 "한도가 검증되지 않았다"가 여전히 유효하다.

`[INFERENCE]` **연결당 최대 채널 100**은 R-011의 완화책("사용자당 1개로 다중화")과 잘 맞는다. D-014로 크루 수 상한이 없으므로 **소속 크루 100개를 넘으면 한 연결로 전부 구독할 수 없다** — 이론적 경계이나 D-014가 상한을 없앤 이상 정의되지 않은 구간이다.

**검증한 사실 — 더 중요한 것: 어떤 Realtime인가:**

`[FACT]` Supabase 공식 문서(Subscribing to Database Changes):
> "**Broadcast.** This is the **recommended** method for scalability and security."
> "**Postgres Changes.** This is a simpler method. It requires less setup, but **does not scale as well** as Broadcast."

`[FACT]` Postgres Changes 한계(공식):
> **Authorization Overhead**: "The system authorizes each database modification against **every connected subscriber individually**. When 100 users subscribe to a table, a single change triggers **100 separate authorization checks** rather than one broadcast. This means throughput scales **inversely with subscriber count**, not write volume."
>
> **Single-Threaded Processing**: "Changes are processed **sequentially on a single thread**… **Larger compute add-ons don't meaningfully improve Postgres Changes throughput**."
>
> "For scenarios expecting thousands of concurrent subscribers on identical changes… **use Broadcast to stream database changes instead.**"

`[FACT]` Broadcast 벤치마크(공식): 동시 사용자 250,000 / 채널당 100명 / 처리량 >800,000 msgs/sec / 중앙값 지연 58ms.

**추론 체인:**

`[INFERENCE]` 크루당 100세션(NFR-006)은 Postgres Changes 문서가 든 **예시 그대로**다. 채팅 메시지 1건 → 100회 인가 검사, 단일 스레드. 여기에 RLS 정책이 크루 멤버십 조인을 포함하면 검사 1회의 비용도 커진다. → **NFR-003(p95 ≤ 1초)은 Postgres Changes로는 달성 위험이 크고, 컴퓨트 증설로도 개선되지 않는다.**

`[INFERENCE]` → **Broadcast(트리거 + `realtime.broadcast_changes()`)로 가야 한다.** 이 경우 벤치마크상 여유가 충분하다. 단 Broadcast는 **Realtime Authorization용 별도 RLS 정책(`realtime.messages` 테이블)** 이 필요하다 — 즉 **RLS 설계 대상이 도메인 테이블 20종에서 그치지 않는다.**

`[UNCERTAIN]` **초당 메시지 과금 계수.** 공식 정의("delivered to, or sent from a client")는 **팬아웃이 계산된다**고 읽히지만, 문서가 브로드캐스트 1건 대 N구독자를 1로 세는지 N으로 세는지 명시하지 않았다. N으로 센다면 Pro(500/s)에서 100명 방의 채팅은 **초당 5건**이 상한이 된다. 이 계수가 용량 계획을 20배 바꾼다. → §9 참조.

**결론:** `[INFERENCE]` **NFR-006은 실현 가능하나 무료 요금제로는 불가능하다.** 최소 Pro + 지출 상한 해제. 그리고 **요금제보다 앞서는 조건은 Postgres Changes가 아니라 Broadcast를 쓰는 것**이다. NFR-007이 "Supabase Realtime 구독"이라고만 쓰고 둘을 구분하지 않은 것이 실질적 공백이다. → **M-1**

---

### ⑤ D-017의 RLS 구현 가능성 (+ D-007과의 양립)

<thinking>
D-017: private 크루는 모든 조회 경로에서 비소속자에게 비노출. 화면 필터가 아니라 데이터 접근 규칙.
D-007: public 크루는 비로그인(anon)에게도 노출.
두 요구를 한 테이블 정책으로 동시에 만족할 수 있는가?
</thinking>

**검증한 사실:**

`[FACT]` Supabase는 모든 요청을 `anon`(미인증) 또는 `authenticated`(인증) **PostgreSQL 역할**로 매핑하며, 정책에 `TO` 절로 역할을 지정할 수 있다. 공식 문서 예시:
```sql
create policy "Profiles are viewable by everyone"
on profiles for select to authenticated, anon using ( true );
```

`[FACT]` "You can attach **as many policies as you want** to each table." (PostgreSQL PERMISSIVE 정책은 OR로 결합)

`[FACT]` 성능 권고(공식, 벤치마크 포함):
- `TO` 절 명시: `TO authenticated` 지정 시 anon 접근은 정책 평가 전에 중단 → **170ms → <0.1ms**
- 함수를 `select`로 감싸기: `(select auth.uid()) = user_id` → **179ms → 9ms** (initPlan 캐싱)
- 조인 방향 뒤집기: `auth.uid() in (select user_id from team_user where team_id = table.team_id)` → `team_id in (select team_id from team_user where user_id = (select auth.uid()))` → **9,000ms → 20ms**
- `security definer` 함수로 조인 테이블 RLS 우회: `has_role() = role` → `(select has_role()) = role` → **178,000ms → 12ms**

**추론 체인:**

`[INFERENCE]` **두 요구는 한 테이블에 두 개의 PERMISSIVE SELECT 정책으로 자연스럽게 표현된다.** PERMISSIVE는 OR 결합이므로 "공개면 누구나 OR 소속이면 본다"가 그대로 정책 구조가 된다:

```sql
-- 정책 1: D-007 — public 크루는 anon 포함 전원
create policy crew_public_read on crew for select
  to anon, authenticated
  using ( visibility = 'public' and status = 'active' );

-- 정책 2: D-017 — private 크루는 active 멤버만 (비소속자에게는 "존재하지 않음")
create policy crew_member_read on crew for select
  to authenticated
  using ( id in (select private.my_active_crew_ids()) );
```

`[INFERENCE]` **D-017의 "화면 필터가 아니라 데이터 접근 규칙"이라는 요구가 오히려 구현을 쉽게 한다.** RLS는 정의상 "모든 쿼리에 붙는 암묵적 WHERE"(공식 표현)이므로, 키워드 검색·카테고리 필터·전체 목록·추천 목록이 **어떤 경로로 오든 같은 정책을 통과한다.** 조회 경로별로 챙길 필요가 없다. → **D-017은 기술적으로 문제없을 뿐 아니라, 화면별 필터보다 안전하고 저렴하다.**

**그러나 — 발견한 함정 `[INFERENCE]`:**

정책 2를 소박하게 쓰면 이렇게 된다:
```sql
using ( id in (select crew_id from crew_membership
               where profile_id = (select auth.uid()) and status='active') )
```
`crew_membership` 자신에게도 RLS가 걸려 있고(NFR-011: 전 테이블 기본 거부), requirements 5.2는 `CrewMembership`의 접근 규칙을 **"같은 크루의 `active` 멤버만 조회"** 로 정의했다. 즉 `crew_membership`의 SELECT 정책이 다시 `crew_membership`을 조회한다 → **PostgreSQL RLS 무한 재귀(`infinite recursion detected in policy for relation`)**. 이는 Supabase에서 가장 흔한 다중 테넌트 RLS 실패 모드다.

`[ALTERNATIVE]` 해법 (공식 문서가 직접 권장하는 것):
1. **노출 스키마 밖의 `SECURITY DEFINER` 함수**로 자기 멤버십을 조회 (`private.my_active_crew_ids()`) — 이 함수는 RLS를 우회하므로 재귀가 끊긴다. 공식 경고 준수: "Security-definer functions **should never** be created in a schema in the Exposed schemas."
2. 함수를 `(select …)` 또는 `= any(array(select …))`로 감싼다 — 공식 벤치마크에서 `team_id=any(user_teams())` **>2분/타임아웃** → `team_id=any(array(select user_teams()))` + 인덱스 **2ms**.
3. `crew_membership.crew_id`, `crew_membership.profile_id`에 인덱스.

`[FACT]` 공식 주의: "if the `in` list gets to be over 10K items, then extra analysis is likely needed." → D-014(크루 수 상한 없음)와 맞물려 **한 사용자의 소속 크루 수가 10K를 넘는 병리적 계정**은 정의되지 않은 구간이나, 현실적으로 무시 가능.

**결론:** `[FACT]`+`[INFERENCE]` **D-007과 D-017은 한 테이블에서 동시에 만족 가능하다.** 두 개의 PERMISSIVE 정책 + `TO` 역할 분리로 표현된다. **단 `crew_membership` 자기참조 재귀를 `SECURITY DEFINER` 헬퍼로 끊지 않으면 구현 즉시 실패하며, 이 함수의 배치 스키마·`(select …)` 래핑·인덱스가 성능을 4~5자리수 바꾼다.** 이 셋 중 어느 것도 문서에 없다. → **M-9**

---

### ⑥ `Poll.eligibleSnapshot`이 `profileId[]` 배열

<thinking>
requirements 5.2: Poll.eligibleSnapshot(profileId[]).
크루원 수백 명일 때 정족수 계산·RLS 판정·인덱싱 관점에서 타당한가, 조인 테이블이 나은가?
네 관점으로 나눠 본다: 계산 / RLS / 인덱싱 / 파생 요구사항.
</thinking>

**(a) 정족수 계산** `[INFERENCE]`
`cardinality(eligible_snapshot)`은 O(1)이고 분모로 쓰기 좋다. **여기서는 배열이 유리하다.**
그러나 D-003은 "**강퇴자는 분모에서도 제외**"를 요구한다 → 판정 시점에 배열을 `crew_membership`과 대조해야 하므로 **결국 조인이 발생한다.** 배열의 O(1) 이점이 판정 경로에서는 사라진다.
```sql
-- 강퇴자 제외 분모: 배열을 결국 펼쳐야 한다
select count(*) from unnest(p.eligible_snapshot) pid
  where not exists (select 1 from crew_membership m
                    where m.profile_id = pid and m.crew_id = ... and m.status = 'removed')
```

**(b) RLS 판정** `[INFERENCE]`
"이 사용자가 투표 대상자인가"는 `(select auth.uid()) = any(p.eligible_snapshot)`로 **단일 행에 대해** 평가되므로 비용이 작다. **여기서는 배열이 무해하다.**
단 `[FACT]` 공식 벤치마크가 경고하듯, 배열/함수를 `select`로 감싸지 않으면(`=any(user_teams())` 형태) 100만 행 테이블에서 **2분 초과/타임아웃**이 나온다. `=any(array(select …))`로 감싸야 한다. 배열 설계 자체보다 **작성 형태**가 성능을 지배한다.

**(c) 인덱싱** `[INFERENCE]`
`uuid[]`에 GIN(`array_ops`) 인덱스를 걸면 "내가 대상자인 열린 투표 목록"을 뽑을 수 있다. **인덱싱은 가능하다.**
그러나 `[INFERENCE]` **행 크기 문제가 있다.** UUID는 16바이트. 크루원 500명 → 배열 약 8KB. PostgreSQL의 `TOAST_TUPLE_THRESHOLD`는 기본 약 2KB이므로 **대략 120명을 넘는 순간 `eligible_snapshot`이 TOAST로 밀려나고**, Poll 행을 읽을 때마다 out-of-line 접근 + 압축 해제가 붙는다. FR-042(투표 현황)는 게시글 상세를 열 때마다 이 행을 읽는다.

**(d) 파생 요구사항 — 결정적 관점** `[INFERENCE]`
배열은 **원소별 상태를 가질 수 없다.** 그런데 스펙이 요구하는 것은 원소별 상태다:

| 요구사항 | 필요한 원소별 상태 |
| --- | --- |
| D-015 / FR-045 AC1 (강퇴자 제외, **정확히 9건**) | 대상자별 "발송 대상 여부" |
| NFR-029 (알림 실패 감지·재시도 3회) | 대상자별 "발송 상태/시도 횟수" |
| FR-042 AC1 (**미투표 수** 표시) | 대상자별 "투표 여부" (PollVote와 대조 필요) |
| D-003 (탈퇴자 미투표 처리 / 강퇴자 무효) | 대상자별 "이탈 종류" |

`[INFERENCE]` → 배열을 유지하면 이 상태들이 **전부 다른 테이블로 흩어지거나 매번 재계산**된다. 특히 NFR-029의 재시도는 "누구에게 아직 못 보냈는가"를 **영속화**해야 하는데, 배열에는 그 자리가 없다.

**대안 `[ALTERNATIVE]`:**

| 안 | 구조 | 평가 |
| --- | --- | --- |
| A **조인 테이블** | `poll_eligible_voter(poll_id, profile_id, notified_at, notify_attempts, PK(poll_id, profile_id))` | **권장.** FK 무결성, 원소별 상태, `count(*)` 분모(인덱스 온리 스캔), 재시도 대기열이 한 테이블에서 해결. 비용: 행 수 증가(투표 1건 × 크루원 N) — 크루 300명 × 투표 1,000건 = 30만 행, PostgreSQL에게 사소함 |
| B **배열 + 별도 발송 테이블** | 현행 유지 + `notification_dispatch` 추가 | 절충안이나 두 곳이 항상 동기화돼야 함. 스냅샷의 존재 이유(불변 명단)가 흐려짐 |
| C **배열 유지, 재시도 포기** | — | NFR-029(M/v0.2)와 충돌하므로 **부적합** |

**결론:** `[INFERENCE]` **배열은 "명단 고정"이라는 원래 목적에는 맞지만, D-015·NFR-029·FR-042가 요구하는 원소별 상태를 담지 못한다.** 크루원 수백 명 규모에서 TOAST 경계도 넘는다. **조인 테이블이 명백히 낫다.** 이건 "지금 안 바꾸면 나중에 못 바꾸는" 종류다(투표 데이터는 NFR-032가 소급 변경을 금지한다). → **M-3**

---

### ⑦ React Compiler 제약과 INP 목표

<thinking>
next.config.ts에 reactCompiler: true. CLAUDE.md와 CON-03은 수동 useMemo/useCallback/memo 금지.
실시간 채팅·캘린더처럼 렌더가 잦은 화면에서 이 제약이 NFR-001(INP p75 ≤200ms)과 충돌하는가?
두 가지를 확인해야 한다: (1) 컴파일러가 무엇을 하고 무엇을 안 하는가 (2) 탈출구가 있는가.
</thinking>

**검증한 사실 — 컴파일러가 하는 일:**

`[FACT]` Next.js 16 업그레이드 가이드:
> "Built-in support for the React Compiler is now **stable** in Next.js 16… automatically memoizes components, reducing unnecessary re-renders with zero manual code changes."
> "**Expect compile times in development and during builds to be higher** when enabling this option as the React Compiler relies on Babel."

`[FACT]` `reactCompiler.md`:
> "Next.js includes a custom performance optimization written in SWC that makes the React Compiler more efficient… only applies the React Compiler to relevant files—like those with JSX or React Hooks."

**검증한 사실 — 컴파일러가 안 하는 일 (react.dev 공식):**

`[FACT]`
> "React Compiler's automatic memoization is primarily focused on **improving update performance** (re-rendering existing components), so it focuses on these two use cases: 1. Skipping cascading re-rendering of components 2. Skipping expensive calculations from outside of React"

`[FACT]`
> "**Not** memoized by React Compiler, since this is not a component or hook: `function expensivelyProcessAReallyLargeArrayOfObjects() {…}`"
> "React Compiler only memoizes **React components and hooks, not every function**" / "React Compiler's memoization is **not shared across multiple components or hooks**."

**검증한 사실 — 탈출구 (2개, 둘 다 공식):**

`[FACT]` react.dev:
> "`useMemo` and `useCallback` hooks **can continue to be used with React Compiler as an escape hatch** to provide control over which values are memoized."

`[FACT]` Next.js `reactCompiler.md`:
> "You can also use the **`"use no memo"`** directive from React for the opposite effect, to opt-out a component or hook."
> `compilationMode: 'annotation'` — 옵트인 모드도 존재

**추론 체인:**

`[INFERENCE-1]` **CLAUDE.md/CON-03의 "수동 메모이제이션 금지"는 React 공식 문서보다 엄격하다.** React는 `useMemo`/`useCallback`을 **탈출구로 명시적으로 인정**하고, Next.js는 `"use no memo"`를 문서화한다. → 이 규칙은 **관습(convention)으로는 타당하나 물리적 벽이 아니다.** "충돌하면 어떻게 하나"의 답이 문서에 없을 뿐, 답 자체는 공식적으로 존재한다.

`[INFERENCE-2]` **그러나 진짜 문제는 규칙이 아니다.** 채팅·캘린더의 INP를 결정하는 요인을 나열하면:

| INP 저해 요인 | React Compiler가 해결? | 실제 해법 |
| --- | :-: | --- |
| 메시지 2,000건 전량 DOM 렌더 | ❌ | 가상 스크롤/윈도잉 (FR-051 AC3의 "최신 50건 + 위로 로드"가 부분 대응) |
| Realtime 이벤트마다 리스트 전체 재조정 | ⚠️ 부분 | 안정 key + 불변 업데이트 + `startTransition` |
| 캘린더 42셀 × 크루필터 × Meetup 재계산 | ❌ (컴포넌트/훅이 아닌 순수 함수는 대상 아님) | 모듈 레벨 캐시 / 사전 인덱싱 |
| `hash(crew.id) mod 12` 색 배정 (NFR-036이 **React 비의존 순수 함수**로 요구) | ❌ **명시적으로 대상 밖** | 자체 메모 테이블 |
| 입력 중 composer 리렌더 | ✅ | 컴파일러가 처리 |
| 토스트 큐 갱신이 전 페이지 리렌더 | ✅ | 컴파일러가 처리 |

`[INFERENCE]` → **NFR-036("비즈니스 규칙을 React에 의존하지 않는 순수 함수로 분리")과 React Compiler는 정확히 어긋난다.** React를 import하지 않는 순수 함수는 **정의상 컴파일러 메모이제이션 대상이 아니다.** 투표 판정·정족수·권한 판정·색 배정이 전부 여기 해당한다. 즉 **아키텍처 요구사항(NFR-036)이 성능 도구(React Compiler)의 사각지대를 스스로 만들어 낸다.** 이 상호작용은 R-004에도 R-015에도 적혀 있지 않다.

`[INFERENCE-3]` **빌드 시간**: `[FACT]` 공식이 "expect compile times… to be higher"라 명시하고 R-004도 지적했다. `[FACT]` R-002로 테스트 러너·CI가 없어 **`npm run build`가 사실상 유일한 검증 수단**(NFR-039)이다. → 빌드가 느려지면 **유일한 검증 루프가 느려진다.** 완화: `[FACT]` Next.js는 SWC로 대상 파일을 선별하므로 "impact is small and localized"라 서술.

**결론:** `[INFERENCE]` **충돌하지 않는다 — 단 "충돌하지 않는다"의 이유가 문서의 기대와 다르다.** React Compiler는 이 제품의 INP 병목(가상 스크롤, 순수 함수 계산, 리스트 재조정)에 **애초에 관여하지 않는다.** 따라서 금지 규칙이 성능을 해치지도 않지만, **컴파일러가 성능을 지켜줄 것이라 기대하면 안 된다.** NFR-001은 별도의 렌더링 전략을 요구하며, 그 전략이 PRD·요구사항 어디에도 없다. 그리고 필요 시 `"use no memo"`/`useMemo`라는 **공식 탈출구가 있다는 사실이 CLAUDE.md에 적혀 있지 않다.** → **M-7**

---

### ⑧ 캘린더 12색 팔레트의 WCAG 3:1 대비 — D-006, NFR-018

<thinking>
질문: 라이트/다크 양쪽에서 12색 전부가 비텍스트 대비 3:1을 통과하는 팔레트가 구성 가능한가?
이건 추측할 필요가 없다. 계산하면 된다.
globals.css 실측값(라이트 #ffffff, 다크 #0a0a0a)으로 WCAG 2.x 상대휘도 공식을 직접 돌린다.
</thinking>

**검증한 사실 — 휘도 창 (직접 계산):**

`[FACT]` WCAG 대비비 = (L_밝음 + 0.05) / (L_어두움 + 0.05).
- 라이트 배경 `#ffffff` (L = 1.0)에 대해 ≥3:1 → **L ≤ 0.3000**
- 다크 배경 `#0a0a0a` (L = 0.00304)에 대해 ≥3:1 → **L ≥ 0.1091**

`[INFERENCE]` → **두 모드를 동시에 만족하는 휘도 창은 L ∈ [0.109, 0.300]** 으로, 실재하며 결코 좁지 않다.

**검증한 사실 — 구성 가능성 (직접 탐색):**

`[FACT]` 30° 간격 12색상 각각에 대해 HSV 공간을 탐색한 결과, **12/12 색상 전부**에서 두 배경 모두 3:1을 통과하는 색을 찾았다. 실제로는 **모두 약 4.45:1** 로 기준을 크게 상회했다:

| 색상 | 값 | vs `#ffffff` | vs `#0a0a0a` |
| ---: | --- | ---: | ---: |
| 0° | `#b85c5c` | 4.45 | 4.45 |
| 30° | `#b26415` | 4.44 | 4.46 |
| 60° | `#7a7a4e` | 4.45 | 4.45 |
| 90° | `#51851d` | 4.45 | 4.45 |
| 120° | `#218a21` | 4.45 | 4.45 |
| 150° | `#008a45` | 4.45 | 4.45 |
| 180° | `#138585` | 4.45 | 4.45 |
| 210° | `#497bad` | 4.45 | 4.45 |
| 240° | `#6767eb` | 4.45 | 4.45 |
| 270° | `#876ca3` | 4.46 | 4.43 |
| 300° | `#a35fa3` | 4.45 | 4.45 |
| 330° | `#ad5e86` | 4.45 | 4.45 |

`[INFERENCE]` → **D-006/NFR-018/NFR-022는 달성 가능하다.** 더 나아가, **단일 팔레트 하나로 두 모드를 모두 통과시킬 수 있다.** CON-04가 요구하는 "라이트/다크 쌍 12조"는 **필수가 아니라 선택**이다(각 모드에 최적화하고 싶다면 유용하지만, 대비 준수만이 목적이라면 12색 한 벌로 충분하다). 이건 팔레트 정의 작업량을 절반으로 줄인다.

**그러나 — 계산이 드러낸 진짜 문제 `[FACT]`:**

같은 팔레트에 대해 **2형 색각(deuteranopia) 시뮬레이션**(Viénot–Brettel–Mollon)을 적용하고 CIELab ΔE로 쌍별 거리를 측정했다:

| 시각 | 최소 쌍별 ΔE |
| --- | ---: |
| 정상 색각 | **15.0** |
| **2형 색각** | **2.0** |

가장 혼동되는 쌍:
```
#7a7a4e ↔ #008a45   ΔE = 2.0    (60° 올리브 ↔ 150° 초록)
#876ca3 ↔ #a35fa3   ΔE = 2.6    (270° 보라 ↔ 300° 자주)
#51851d ↔ #218a21   ΔE = 3.0    (90° 연두 ↔ 120° 초록)
#b85c5c ↔ #7a7a4e   ΔE = 3.4    (0°  빨강 ↔ 60°  올리브)
#b85c5c ↔ #008a45   ΔE = 5.5    (0°  빨강 ↔ 150° 초록)
```
**66쌍 중 6쌍이 ΔE < 10** — 실질적으로 구분 불가.

`[INFERENCE]` 이건 팔레트를 잘못 골라서가 아니라 **구조적 결과**다. 3:1 × 2모드 제약이 12색을 좁은 휘도 창에 가두면, 색들은 거의 등휘도(isoluminant)가 된다. 색각 이상은 **휘도 차이는 보존하고 색상 차이를 잃으므로**, 등휘도 팔레트에서 가장 크게 무너진다. 즉 **NFR-018을 만족시키려는 압력이 NFR-019가 막으려는 문제를 악화시킨다.**

`[INFERENCE]` → **결론 1: NFR-019(크루명 텍스트 라벨 + `aria-label`)는 보조 장치가 아니라 유일한 구분 수단이다.** 12개 크루 중 최소 6쌍이 색각 이상 사용자에게 같은 색이다. 라벨이 빠지면 캘린더 기능 자체가 성립하지 않는다.

`[INFERENCE]` → **결론 2: D-006의 충돌 처리 규칙에 결함이 있다.** D-006은 "같은 날짜 셀 안에서 색이 겹치면 **팔레트 내 인접하지 않은 다음 인덱스**를 임시 배정"한다. 그러나 **팔레트 인덱스 거리와 지각적 거리는 무관하다** — 위 표에서 인덱스 0(0°)과 인덱스 2(60°)는 "인접하지 않지만" 색각 이상에서 ΔE 3.4로 사실상 동일하다. 이 규칙은 **의도한 효과를 내지 못한다.**

`[ALTERNATIVE]` 완화책 (3개):
1. **팔레트 순서를 색상환 순이 아니라 CVD 시뮬레이션 후 ΔE 최대화 순으로 정의**한다. 그러면 "다음 인덱스"가 실제로 지각적으로 먼 색이 된다.
2. **명도를 창(L ∈ [0.109, 0.300]) 안에서 의도적으로 분산**시킨다. 등휘도를 피하면 CVD 구분성이 회복된다. 창 폭이 2.75배이므로 여지가 있다.
3. **색 외의 제2 신호를 바에 추가**한다(패턴/테두리 스타일). NFR-019의 텍스트 라벨과 중복되지만 좁은 셀에서 라벨이 말줄임될 때를 보완한다.

**결론:** `[FACT]` **12색 팔레트의 3:1 양모드 통과는 가능하다 — 계산으로 증명했다.** `[INFERENCE]` **그러나 그렇게 만든 팔레트는 색각 이상에서 6/66 쌍이 붕괴하며, D-006의 충돌 회피 규칙("인접하지 않은 다음 인덱스")은 이 붕괴를 막지 못한다.** R-013이 "남은 위험은 팔레트 12색이 3:1을 통과하는지 측정하는 일"이라 했는데, **측정해 보니 통과 여부가 아니라 통과한 뒤의 CVD 구분성이 진짜 위험이다.** → **M-4**

---

### ⑨ Mock First 전환 비용

<thinking>
CLAUDE.md: "실제 데이터로 전환할 때 UI 컴포넌트는 수정하지 않고 데이터 조회 부분만 교체"
NFR-034: "컴포넌트는 데이터를 props 또는 전용 훅으로만 받는다"
질문: Next.js 16 App Router(서버 컴포넌트 + 서버 액션 + Realtime 구독 혼재)에서 성립하는가?
성립하려면 어떤 경계 설계가 전제되어야 하는가?
</thinking>

**검증한 사실 — Next.js 16의 경계 사실:**

`[FACT]` 요청 API 비동기화: `params`·`searchParams`·`cookies()`·`headers()`·`draftMode()`는 **동기 접근이 완전히 제거**됐다("Starting with Next.js 16, synchronous access is fully removed"). `PageProps<'/route'>`/`LayoutProps` 타입 헬퍼는 `npx next typegen`으로 생성.

`[FACT]` 캐싱 API: `revalidateTag(tag)` 단일 인자형은 **deprecated이며 TypeScript 오류를 낸다** — `revalidateTag(tag, 'max')`로 cacheLife 프로파일을 반드시 지정. Server Actions 전용 `updateTag(tag)`(read-your-writes), `refresh()`(클라이언트 라우터 갱신) 신설. `cacheLife`/`cacheTag`는 `unstable_` 접두사 제거되어 stable.

`[FACT]` `cacheComponents: true`를 켜야 `use cache`/`cacheLife`/PPR이 활성화된다. 현재 `next.config.ts`에는 **없다** → 기본 동적 렌더링 경로.

`[FACT]` `middleware.ts` → `proxy.ts`. **"The `edge` runtime is NOT supported in `proxy`. The `proxy` runtime is `nodejs`, and it cannot be configured."**

**추론 체인 — 성립하는가:**

`[INFERENCE]` **원칙은 성립한다. 단 "데이터 조회 부분"이 한 종류가 아니라 세 종류라는 것을 문서가 인정하지 않는다.**

| 경계 | Mock 단계 | 실데이터 단계 | 교체가 UI에 미치는 영향 |
| --- | --- | --- | --- |
| **A. 읽기(서버)** | 서버 컴포넌트가 `getCrewList()` 호출, 배열 반환 | 같은 함수가 Supabase 서버 클라이언트 호출 | **없음** — 함수 시그니처만 유지하면 진짜로 무비용 |
| **B. 쓰기(서버 액션)** | Server Action이 mock 배열 변형, `refresh()` | 같은 액션이 RPC/insert 후 `updateTag`/`refresh` | **거의 없음** — 단 **실패 모드가 새로 생긴다**(RLS 403, 정원 마감, 낙관적 잠금 충돌). Mock에는 이 오류 경로가 없어 **UI가 그 상태를 렌더할 준비가 안 된다** |
| **C. 실시간(클라이언트)** | ❓ | `useEffect`로 채널 구독, 상태 병합 | **여기서 원칙이 깨진다** |

`[INFERENCE]` **C가 핵심이다.** Realtime 구독은 본질적으로 **클라이언트 컴포넌트 + 구독 생명주기 + 로컬 상태 병합**을 요구한다. Mock 단계에서 채팅 화면을 "props로 메시지 배열을 받는 순수 컴포넌트"로 만들면, 실데이터 전환 시 그 컴포넌트를 **`'use client'`로 바꾸고 구독 훅을 심고 상태 소유권을 옮겨야** 한다 — 이게 정확히 CLAUDE.md가 금지한 "UI 컴포넌트 수정"이다.

`[INFERENCE]` → **성립시키려면 v0.1부터 다음 경계가 전제되어야 한다** (문서에 없는 것):

1. **표현/구독 분리**: `MessageList`는 `messages: ChatMessage[]`만 받는 순수 표현 컴포넌트. 그 위에 `ChatRoomContainer`(`'use client'`)가 구독을 소유. **Mock 단계에서도 컨테이너를 만들고, mock 이벤트 소스를 붙여 둔다.** 이러면 전환 시 컨테이너 내부만 바뀐다.
2. **구독 인터페이스 추상화**: `subscribeToRoom(roomId, onEvent): Unsubscribe` 같은 계약을 먼저 정의. Mock 구현은 `setInterval`/`EventTarget`, 실구현은 Supabase 채널. **NFR-037("직렬화 가능한 입출력")이 읽기 함수만 다루고 구독을 다루지 않는다.**
3. **오류 상태를 Mock 단계에 미리 심기**: `/sample`의 4상태(정상/로딩/빈/에러)가 이미 이 요구를 담고 있다 — **CON-09가 사실상 B의 해법이다.** 다만 4상태의 "에러"가 RLS 403·정원 마감·충돌 같은 **도메인 오류**까지 포함해야 한다는 규정이 없다.
4. **인증 경계**: `[FACT]` `proxy.ts`는 nodejs 런타임 고정이다. FR-002 AC3(보호 라우트 → 로그인 → 원래 경로 복귀)을 `proxy.ts`에서 처리할지 레이아웃에서 처리할지가 Mock 단계 라우팅 구조를 결정한다. `[FACT]` D-011로 `proxy.ts`는 v0.1 범위 밖이므로 **v0.1은 이 결정 없이 진행되고, v0.2에 도입되면 라우팅이 바뀐다.**

`[INFERENCE]` **긍정적 발견**: Next.js 16의 `updateTag`(read-your-writes)와 `refresh()`는 **정확히 이 전환 시나리오를 위한 API**다. Mock 단계에서 Server Action + `refresh()` 패턴을 미리 쓰면, 실데이터 전환 시 `updateTag` 한 줄을 더하는 것으로 끝난다. **문서가 이 API를 언급하지 않아 기회를 놓치고 있다.**

**결론:** `[INFERENCE]` **읽기·쓰기 경계는 성립한다(A·B). 실시간 경계(C)는 사전 설계 없이는 성립하지 않는다.** NFR-034가 "props 또는 전용 훅"이라 쓴 것은 A만 상정한 문장이다. **전제 조건은 ① 표현/컨테이너 분리 ② 구독 인터페이스 추상화 ③ 도메인 오류를 4상태에 포함 ④ 인증 경계 위치 결정** 넷이며, 넷 다 v0.1 착수 전에 확정돼야 한다(R-007과 함께). → **M-8**

---

### ⑩ 네이티브 앱 전환 전제 — 원문 №13, R-015

<thinking>
질문: PRD의 페이지·데이터 구조가 나중에 네이티브로 옮길 때 재사용 가능한 형태인가?
재사용 가능한 것과 아닌 것을 층별로 나눈다.
</thinking>

`[INFERENCE]` 층별 재사용 가능성:

| 층 | 재사용 | 근거 |
| --- | :-: | --- |
| **데이터 모델 (PRD §7, 20 엔티티)** | ✅ 전면 | 플랫폼 중립. Supabase 스키마는 웹·네이티브가 공유 |
| **비즈니스 규칙 (투표 판정·권한·색 배정)** | ✅ 전면 | **NFR-036이 React 비의존 순수 함수를 강제**하므로 그대로 이식. 잘 설계됨 |
| **데이터 접근 계약 (NFR-037)** | ✅ 대체로 | 직렬화 가능 입출력이면 RN에서 같은 함수 재사용 가능 |
| **사용자 여정 (PRD §3 A·B·C)** | ✅ 전면 | 플랫폼 중립 |
| **19개 페이지 구조** | ⚠️ 부분 | 화면 분해는 재사용, **경로 규약은 아님** — 네이티브는 URL 라우팅이 아니라 스택/탭 내비게이션 |
| **약 70종 컴포넌트** | ❌ | Tailwind v4 CSS-first + DOM 전제. RN에는 CSS도 DOM도 없음. **재작성 대상** |
| **인증 세션** | ⚠️ | `[FACT]` NFR-010이 httpOnly 쿠키를 요구하는데 네이티브에는 쿠키가 없다. **CON-06이 이미 "웹(쿠키)과 네이티브(보안 저장소+토큰)를 모두 수용"을 요구**해 대비돼 있음 |
| **Server Actions / 서버 컴포넌트 데이터 흐름** | ❌ | `[FACT]` R-015가 정확히 지적한 지점. 웹 렌더 파이프라인 전용 |

**발견한 추가 위험 `[INFERENCE]`:**

1. **알림 아키텍처가 오히려 잘 대비돼 있다.** `[FACT]` FR-073 AC2("알림 생성 지점의 코드 변경 없이 발송 어댑터 추가만으로 확장") + NFR-038 채널 추상화 + `Notification.channel(in_app/web_push/native_push)` 필드. → **네이티브 Push 추가 시 도메인 모델 변경이 불필요하다.** 이건 잘 설계된 부분이다.

2. **`[FACT]` R-016(로케일 경로)이 링크 공유와 얽힌다.** D-011로 v0.1은 `/crews/[id]`를 쓴다. FR-052(게시글 링크 공유)가 채팅에 **URL을 저장**하면, ① 다국어 도입 시 `/ko/crews/...`로 전부 무효 ② **네이티브 전환 시 URL 자체가 의미를 잃는다**. R-016의 대응책 ③("경로 문자열이 아니라 **리소스 ID 기준**으로 저장")이 이걸 이미 막고 있다. `[FACT]` PRD §7 `ChatMessage.refPostId`가 실제로 ID 참조다. → **정합적이다.**

3. **`[INFERENCE]` 데이터 접근 계약이 "서버 액션"으로 굳으면 재사용이 깨진다.** Server Action은 웹 전용 RPC 메커니즘이다. 네이티브에서 재사용하려면 같은 로직이 **PostgREST/RPC 또는 Edge Function**으로도 노출돼야 한다. → **Supabase RPC를 1차 계약으로 두고 Server Action은 그 얇은 래퍼로만 쓰면 이 문제가 사라진다.** 이건 ①의 원자성 해법(SECURITY DEFINER RPC)과도 방향이 일치한다.

**결론:** `[INFERENCE]` **재사용 가능한 형태다 — 데이터 모델·비즈니스 규칙·여정 층은 그대로 옮겨진다.** 컴포넌트 재작성은 불가피하며 이는 웹→네이티브의 정상 비용이다. **R-015가 지적한 "서버 컴포넌트/서버 액션에 로직이 흩어지는" 위험은 NFR-034·036·037·CON-06이 이미 겨냥하고 있고, 여기에 "Supabase RPC를 1차 계약으로"라는 한 가지만 추가하면 실효적으로 닫힌다.**

---

## 5. Step 3 — 논리적 일관성 검증 (지정 항목 외 발견)

<thinking>
지정 항목 10건 외에, FR 간 상호작용과 상태 기계를 교차 추적한다.
"발견하면 추가하라"는 지시가 있었으므로 여기가 그 자리다.
</thinking>

### 5.1 🔴 투표 자동 종료 트리거 ③의 논리적 데드락

**추적한 사실:**

`[FACT]` D-003 종료 트리거 ③: "**미투표자가 0명이 되면 즉시 자동 종료**". FR-043 AC2: "Given 미투표자 0명, When 마지막 투표 제출, Then 마감 전이라도 즉시 종료된다."

`[FACT]` D-003 투표 중 이탈: "자진 탈퇴자 — 스냅샷 명단에 **남기되 미투표 처리**. 이미 던진 표는 유효 유지."

`[FACT]` FR-041 행위자: "투표 대상자(**스냅샷 명단의 `active` 크루원**)". FR-026 AC2: 탈퇴 시 해당 크루 접근 403.

**추론 체인:**

```
크루원 A가 투표에 참여하지 않은 상태에서 크루를 탈퇴한다 (FR-026)
  ↓
A는 스냅샷 명단에 남는다                       (D-003)
A는 "미투표 처리"된다                          (D-003)
A는 status='left'이므로 더 이상 active가 아니다  (2.4절 상태 전이)
  ↓
FR-041의 행위자 조건("스냅샷 명단의 active 크루원")을 만족하지 못한다
  ↓
A는 앞으로 영원히 투표할 수 없다
  ↓
"미투표자 수"는 절대 0이 될 수 없다
  ↓
트리거 ③은 이 투표에 대해 영구히 발화하지 않는다
```

`[INFERENCE]` → **탈퇴자가 1명이라도 발생한 투표는 트리거 ③을 잃는다.** 강퇴자는 D-003이 "분모에서도 제외"하므로 미투표 집계에서 빠져 문제가 없지만, **자진 탈퇴자는 명시적으로 "분모에 남기고 미투표 처리"**이므로 정확히 이 함정에 빠진다.

`[INFERENCE]` **영향의 크기**: 치명적이지는 않다 — 트리거 ①(기한 도래)이 여전히 동작하므로 투표는 결국 종료된다. **그러나 "전원이 투표를 마쳤는데도 최대 14일(D-003 허용 상한)을 기다리는" 사용자 경험**이 발생하고, 이건 P4("투표가 끝난 걸 아무도 모른다")를 다시 만든다. 그리고 이 버그는 **테스트 러너 없이는(R-002) 절대 재현되지 않는다** — 재현하려면 "투표 중 탈퇴"라는 특정 시나리오를 수동으로 만들어야 한다.

`[ALTERNATIVE]` 해법 (3개):
1. 미투표자 집계를 `스냅샷 ∩ 현재 active` 로 정의 — 탈퇴자·강퇴자 모두 미투표 분자에서 제외. **분모(정족수) 정의는 D-003을 그대로 유지**하므로 결정을 뒤집지 않는다.
2. 트리거 ③의 조건을 "미투표자 0명" → "**투표 가능한 미투표자 0명**"으로 명확화.
3. `poll_eligible_voter` 조인 테이블(⑥의 대안 A)에 `can_still_vote` 파생 상태를 두면 ①②가 자연히 표현된다.

→ **C-5**

### 5.2 🟡 소규모 크루에서 투표 익명성이 붕괴한다

`[FACT]` D-003/FR-042 확정: "**집계만 공개, 개인 선택 비공개**". requirements 5.2 `PollVote`: "본인 표만 insert/update. **타인 표 조회 불가**(집계는 뷰/함수로 제공)".

`[FACT]` FR-042 AC1: "찬성·반대·기권 수, **미투표 수**, 참여율, 정족수 충족 여부, 남은 시간이 표시된다."

`[INFERENCE]` 크루원 2명(오너 + 크루원 1명)인 크루에서 모임 제안글이 올라오면:
- 대상자 2명, 내 선택은 내가 안다 → **집계에서 내 표를 빼면 상대의 표가 그대로 드러난다.**
- 크루원 3명이어도 두 명이 서로 알면 세 번째가 드러난다.

`[INFERENCE]` → **D-014로 크루 규모 하한이 없으므로 2~3인 크루는 흔하다**(오너가 크루를 만들고 한 명을 초대한 직후가 바로 그 상태다 — 여정 B의 4단계). 즉 **예외적 상황이 아니라 신규 크루의 기본 상태**다.

`[INFERENCE]` → RLS로 `PollVote` 행을 아무리 잘 막아도 **집계 자체가 정보를 누설**한다. 이건 RLS로 풀 수 없는 종류의 문제다.

`[ALTERNATIVE]`: ① 대상자 N < 임계값(예: 5)이면 집계를 숨기고 "진행 중 / 종료됨"만 표시 ② 종료 전까지 집계 비공개(참여율만 표시) ③ 소규모 크루에서는 비공개가 성립하지 않음을 UI에 명시. — **어느 것도 D-003을 뒤집지 않는다. D-003은 "집계 공개"를 정했지 "소규모에서도 공개"를 정하지 않았다.**

### 5.3 🟡 PRD §7 데이터 모델이 AC가 요구하는 필드를 누락했다

`[FACT]` 교차 대조 결과:

| 엔티티 | PRD §7이 누락한 것 | 그것을 요구하는 AC |
| --- | --- | --- |
| `Meetup` | **`title`, `description`** | FR-064 AC1: "**제목**·크루명·날짜·시각·장소·**설명**·원 제안글 링크·투표 결과 요약이 표시된다" (requirements 5.2에는 둘 다 있음) |
| `Poll` | **`closedBy`, `result`** | FR-043 AC3: "**종료 주체가 기록된다**" (requirements 5.2에는 둘 다 있음) |
| `Profile` | **`bio`, `status`** | PRD 계정 설정 페이지: "표시 이름·아바타·**소개** 수정" (requirements 5.2에는 `bio` 있음) |
| `MeetupAttendance` | **`(meetupId, profileId)` 유일 제약** | FR-067 E2 멱등성, FR-066 AC2 원자성 (requirements 5.2에도 없음 — **원본에도 없는 진짜 누락**) |
| `Post` | `createdAt`, `editedAt` | FR-032 AC1: "'수정됨' 표시와 **수정 시각**이 붙는다" (requirements 5.2에는 있음) |

`[INFERENCE]` PRD §7 머리말이 "타입·인덱스·마이그레이션은 포함하지 않는다"고 면책했으나, **위 항목은 타입 세부가 아니라 필드의 존재 여부**다. §0의 "충돌 시 원본이 이긴다"로 복구되긴 하지만, **PRD만 보고 Mock 타입을 정의하면 NFR-035(Mock·실데이터 동일 타입)가 착수 직후 깨진다** — 그리고 이건 v0.1의 첫 작업이다.

### 5.4 🟡 `Meetup.status`에 `confirmed`가 없다

`[FACT]` FR-066 사전조건: "Meetup이 **확정(`confirmed`)** 상태이고 예정일이 지나지 않았다."
`[FACT]` requirements 5.2 `Meetup.status`: `scheduled` / `cancelled`. PRD §7도 동일.

`[INFERENCE]` → **`confirmed`라는 상태값은 어느 열거형에도 없다.** FR-060은 가결 시 Meetup을 생성하며 그때 상태가 `scheduled`가 된다. 즉 의도는 "`scheduled`"로 보이지만, **구현자가 `confirmed` 상태를 추가하거나 사전조건을 무시하게 된다.** 문구 정정만으로 해소.

### 5.5 🟡 F018(게시글 수정)의 MVP 편입 근거가 성립하지 않는다

`[FACT]` PRD F018 "MVP 필수 이유": "재작성으로 우회 가능하나 구현 비용이 낮고, **투표 시작 후 제안글의 날짜·조건 잠금 규칙이 여기 붙음**".
`[FACT]` FR-034 정상 흐름 ④: "게시글 + Poll(**`open`**) **동시 생성**".
`[FACT]` FR-032 AC2: "Given **투표가 시작된** 모임 제안글, When 날짜·투표 조건 수정 시도, Then 거부된다."

`[INFERENCE]` → 투표는 게시글과 **동시에** `open`으로 생성되므로, 제안글의 날짜·조건은 **생성 순간부터 영구히 잠긴다.** "투표 시작 후"라는 조건절이 참조하는 "투표 시작 전"이라는 시간 구간이 **존재하지 않는다.** 따라서 F018의 편입 근거 중 후반부는 무효이고, 잠금 규칙은 조건부가 아니라 **무조건**이다. (전반부 "구현 비용이 낮고"는 여전히 유효하므로 등급 판단 자체는 영향받지 않는다.)

### 5.6 🟡 정족수 1/3의 반올림 규칙이 정의되지 않았다

`[FACT]` D-003: "대상자의 **1/3 이상**이 투표". `Poll.quorumRatio` 필드 존재.
`[FACT]` FR-044 AC1: "대상 10명 · 찬성 4 · 반대 2 · 기권 1(**참여 7 ≥ 정족수 4**)".

`[INFERENCE]` 10 ÷ 3 = 3.33. AC1이 정족수를 **4**로 적었으므로 `ceil`을 의도한 것으로 읽힌다. 그러나 **규칙 문장에는 반올림이 없고 예시에만 있다.** 참여 인원이 정확히 3명일 때 `ceil`(불성립) 대 `floor`/`≥3.33`(불성립) 대 `round`(3 → 성립)로 **판정이 갈린다.** 대상자 수가 3의 배수가 아닌 모든 경우에 영향.

`[INFERENCE]` 또한 `quorumRatio`가 **컬럼**이라는 것은 투표별 설정 가능성을 암시하지만 D-003은 1/3 고정이다. 필드 존재와 결정이 어긋난다(무해하나 구현자가 UI를 만들 수 있다).

### 5.7 🟡 캘린더 패널의 "조회 전용"과 F035 배치가 충돌한다

`[FACT]` PRD 통합 캘린더 페이지 주요 기능: "날짜/바 클릭 → 상세 패널(**조회 전용, 데이터 생성 없음, D-012**)". 같은 페이지 **구현 기능 ID: F030, F031, F032, F033, F035**.
`[FACT]` F035 = FR-066 = 참석/불참 응답 → **데이터를 생성한다.**
`[FACT]` PRD §11 1단계가 이 배치를 의도적으로 추가했다고 기록: "FR-066 원문 정상 흐름에 '①Meetup 상세 **또는 캘린더 패널** 진입'이 명시돼 있어 통합 캘린더 페이지도 관련 페이지에 추가했다."

`[INFERENCE]` → **모순은 아니다.** D-012가 금지한 것은 "**클릭이** 데이터를 생성하는 것"이고, 참석 버튼은 별개의 명시적 액션이다. **그러나 같은 표 안에 "데이터 생성 없음"과 데이터를 생성하는 F035가 나란히 있어 구현자가 오독하기 쉽다.** 문구 분리 필요.

### 5.8 🟢 PRD §0의 D-\* 범위 표기가 낡았다

`[FACT]` PRD §0: "`prioritization-and-risks.md`(6.1 우선순위·6.2 리스크·**6.3 결정 D-001~D-014**)".
`[FACT]` 실제 6.3절: **D-001~D-017**. PRD 본문은 D-015·D-016·D-017을 정상적으로 참조하고 있다.

`[INFERENCE]` 머리말만 갱신 누락. R-006이 경고한 "번호를 여러 곳에 박아 두면 반드시 stale해진다"의 실례.

---

## 6. Step 4 — 복잡도 평가와 인일 추정

<thinking>
지시: person-day 단위로 낼 것. 대상은 v0.1(F001~F039). 영역별로 나눌 것.
주의: 6.1절의 v0.1 정의는 "Mock 데이터 기반 화면·컴포넌트 완성"이다. 실데이터는 v0.2.
따라서 v0.1 추정은 Mock UI 기준이어야 한다. 그러나 v0.1에는 M등급 NFR이 다수 포함된다
(접근성 NFR-017~022, 아키텍처 NFR-034~037, XSS NFR-014, 타임존 NFR-025, 반응형 NFR-026).
이것들이 v0.1 비용의 상당 부분이다.
</thinking>

### 6.1 산정 전제 `[ASSUMPTION]`

| # | 가정 |
| --- | --- |
| A1 | **v0.1 = Mock 데이터 기반 화면·컴포넌트 완성**(6.1절 릴리스 정의). Supabase 스키마·RLS·Realtime·cron은 v0.2이며 아래 합계에 **포함하지 않는다**(§6.4에 별도 참고 수치) |
| A2 | v0.1의 M/S 등급 NFR은 **포함한다** — 접근성(017~022), XSS(014), 타임존(025), 반응형(026·027), 아키텍처 경계(034~037), 문자열 분리(023), 빌드(039) |
| A3 | 1인일 = 집중 개발 8시간. 회의·문서·대기 제외 |
| A4 | 숙련 개발자 기준. Next.js 16·Tailwind v4·React 19 **학습 시간은 별도** |
| A5 | `[FACT]` R-002로 **테스트 러너·CI가 없다.** 모든 검증이 수동이므로 QA 비용이 각 영역에 내재 |
| A6 | `[FACT]` R-007로 **디렉터리 컨벤션이 없다.** 공통 영역에 확정 비용 포함 |
| A7 | 컴포넌트당 4상태(CON-09) + `/sample` 등록 비용을 각 항목에 내재 |

### 6.2 영역별 추정

#### 공통 — 컴포넌트·`/sample`·타입·데이터 레이어

| 작업 | 인일 | 근거 |
| --- | ---: | --- |
| 디렉터리 구조·명명 규약 확정, ESLint 규칙 (R-007) | 1.5 | 첫 코드 전 필수. 되돌리기 비쌈 |
| 도메인 TypeScript 타입 20 엔티티 + 열거형 + 판정 결과 타입 (NFR-035) | 3 | §5.3의 누락 필드 복구 포함 |
| 데이터 접근 레이어 경계 설계 + Mock 구현 (NFR-034·037) | 5 | 39 FR 대응 read/write 시그니처 |
| **구독 인터페이스 추상화 + Mock 이벤트 소스** (⑨ M-8) | 2.5 | 문서에 없으나 필수 |
| Mock 시드 데이터 (크루 15·멤버 300·게시글 200·투표 72·메시지 2,000·Meetup 60, 투표는 가결 60+상태 다양성 12 — FR-060 1:1 제약상 "40"은 성립 불가, I-031) | 3 | 규모가 작으면 캘린더·채팅 성능 문제가 안 드러남 |
| 순수 규칙 모듈 (NFR-036): 투표 판정·정족수·권한 매트릭스·색 해시·타임존 | 4 | NFR-025 타임존 3종 교차 검증 포함 |
| 문자열 모듈 + 추출 규약 (NFR-023, M등급) | 2 | R-016 완화책 |
| 디자인 토큰 + **12색 팔레트 정의·대비 측정·CVD 검토** (CON-04, NFR-018·022) | 3 | §4-⑧ 계산이 초안을 제공하므로 단축 가능 |
| 레이아웃 (AppShell·HeaderNav·MobileTabBar·PageHeader) | 4 | 360/768/1280 3종 |
| 기본 원자 컴포넌트 15종 (Button…ErrorState) — 키보드·포커스·대비 | 8 | NFR-020·027. 모달/바텀시트 포커스 트랩 포함 |
| `/sample` 쇼케이스 셸 + 4상태 토글 + 뷰포트 프리뷰 (CON-09, KPI-6) | 4 | 컨테이너 쿼리 기반 |
| 전역 오류 화면 SC-E1 (403/404/error.tsx/not-found.tsx) | 2 | |
| 접근성·반응형 수동 QA 패스 (NFR-017·020·026) | 6 | 자동화 없음(R-002) |
| **소계** | **48** | |

#### 인증·계정 (F001~F004)

| 작업 | 인일 |
| --- | ---: |
| 회원가입 폼 — 정책 검증, 핸들 실시간 중복 검사(400ms), `aria-describedby` 오류 연결 | 4 |
| 로그인 폼 — 단일 오류 메시지, 5회 실패 잠금 안내 상태, 원래 경로 복귀 | 2.5 |
| 온보딩 — 핸들 확인/수정, 표시이름, 관심 카테고리 | 2 |
| 계정 설정 — 프로필 수정, 핸들 30일 제한 안내, 검색 노출 옵트아웃 | 3 |
| 핸들 검색 필드·결과 (0/1건, 이미 멤버/초대중/옵트아웃 **구분 불가 응답**) | 2.5 |
| 4상태 + `/sample` 등록 | 2 |
| **소계** | **16** |

#### 크루·멤버십 (F005~F015)

| 작업 | 인일 |
| --- | ---: |
| 크루 탐색 — 검색바·카테고리 필터·CrewCard/Grid·무한 스크롤·"가입됨" 배지·**비로그인 상태**(D-007) | 6 |
| 크루 개설 — 4필드(D-016), 금칙어, 중복 허용 + 오너 핸들 병기 | 3 |
| 크루 홈 — public/private × 소속/비소속 4분기 + 가입 신청 버튼 상태 기계 | 4.5 |
| 크루 설정 — 정보 수정, 공개범위(오너 전용), **색 팔레트 선택**, 탈퇴 | 4 |
| 멤버 관리 — 역할 정렬 목록, 초대 다이얼로그, 신청 승인/반려 탭, 임원 임명 | 7 |
| 받은 초대함 | 2 |
| 멤버십 상태 전이 + 권한 매트릭스(3.3절 34행) 순수 함수 구현·대조 | 3 |
| **소계** | **29.5** |

#### 게시판 (F016~F019)

| 작업 | 인일 |
| --- | ---: |
| 게시판 목록 — 20건 페이지네이션, 유형 배지, 투표 상태 배지, 빈/오류 상태 | 3.5 |
| 글쓰기 — 유형 토글, 제안글 필드 6종, 날짜 검증 규칙, 임시 저장/초안 복구 | 5.5 |
| 게시글 상세 — 본문, 수정/삭제, 잠금 규칙, **XSS 이스케이프**(NFR-014, M/v0.1) | 4 |
| **소계** | **13** |

#### 투표 (F020~F025)

| 작업 | 인일 |
| --- | ---: |
| 컴포넌트 6종 (PollCard·ChoiceGroup·ProgressBar·QuorumIndicator·DeadlineTimer·ResultSummary) × 4상태 | 6 |
| 판정·정족수 경계 케이스 (동수, 기권, **반올림**, 스냅샷 이탈) | 3 |
| 종료 3트리거 Mock 시뮬레이션 + 상태 전이 UI (5개 status) | 2.5 |
| 마감 카운트다운 타임존 정확성 (NFR-025) | 1.5 |
| **소계** | **13** |

#### 채팅 (F026~F029)

| 작업 | 인일 |
| --- | ---: |
| MessageList/Bubble/Composer + **윈도잉** + 최신 50건 + 위로 이어 로드 | 6 |
| 낙관적 렌더 + 실패/재전송 + `clientKey` 멱등 | 3 |
| ConnectionBanner + Mock 연결 상태 기계 (NFR-008·009 시나리오 재현) | 2.5 |
| PostLinkCard — 같은 크루만 확장, 삭제된 글, 외부 URL, 파싱 실패 4분기 | 3 |
| 클라이언트 라우팅 이동 + **스크롤 위치·읽음 지점 복원**(FR-053 AC2) | 2 |
| **소계** | **16.5** |

#### 캘린더·Meetup·참석 (F030~F037)

| 작업 | 인일 |
| --- | ---: |
| MonthCalendar 격자 + **360px 무-가로스크롤** + 키보드 셀 내비(FR-063 AC4) | 6 |
| MeetupBar + 오버플로 "+N" + 크루명 라벨 + `aria-label`(NFR-019) | 3 |
| 크루 필터(선택 상태 유지) + CrewLegend (R-017 필수 기능) | 3 |
| DayDetailPanel — 데스크톱 사이드/모바일 바텀시트, 포커스 트랩·Esc·복귀 | 4 |
| Meetup 상세 — 정보, 정원 카운트, 참석/불참, 참석자 3구분 목록 | 4.5 |
| 홈 대시보드 캘린더 요약 | 2 |
| 색 배정 해시 + 같은 날짜 충돌 회피 | 1.5 |
| **소계** | **24** |

#### 알림 (F038, F039)

| 작업 | 인일 |
| --- | ---: |
| ToastHost/ToastItem — 최대 3 동시·큐·`role="status"`·자동 소멸·클릭 이동 | 3.5 |
| NotificationBell/List/Item — 배지·모두 읽음·빈 상태 | 3 |
| 알림 채널 추상화 타입 (NFR-038, FR-073 AC1/AC2) | 1 |
| 알림 유형 → 화면 라우팅 매핑 | 1 |
| **소계** | **8.5** |

### 6.3 v0.1 합계

| 영역 | 인일 | 비중 |
| --- | ---: | ---: |
| 공통 (컴포넌트·`/sample`·타입·데이터 레이어) | 48.0 | 28.6% |
| 크루·멤버십 | 29.5 | 17.6% |
| 캘린더·Meetup·참석 | 24.0 | 14.3% |
| 채팅 | 16.5 | 9.8% |
| 인증·계정 | 16.0 | 9.5% |
| 게시판 | 13.0 | 7.7% |
| 투표 | 13.0 | 7.7% |
| 알림 | 8.5 | 5.1% |
| **기본 합계** | **168.5 인일** | 100% |
| 리스크 버퍼 (+15~25%) — R-002(검증 수단 없음)·R-007(컨벤션 없음)·R-001(Next.js 16 학습) | +25 ~ +42 | |
| **권장 계획치** | **195 ~ 210 인일** | |

**1인 개발자 기준 참고 기간** `[ASSUMPTION]` — **1인, 월 20 생산일, 병렬화 없음**을 가정:

| 시나리오 | 기간 |
| --- | --- |
| 기본 합계 168.5 인일 | **약 8.4개월** |
| 권장 계획치 195~210 인일 | **약 9.8 ~ 10.5개월** |

`[INFERENCE]` **이 프로젝트는 1인 3~6개월 규모가 아니다.** 주된 원인은 기능 개수(39건)가 아니라 **품질 요구의 밀도**다 — 컴포넌트 약 70종 × 4상태 × (라이트/다크) × (360/768/1280) × WCAG 2.2 AA × 키보드 전용 조작. `[FACT]` 6.1절 스스로 "접근성과 아키텍처 경계가 v0.1에 몰려 있다"고 관측했고, 그 관측은 정확하다. **v0.1 비용의 약 29%가 어떤 FR에도 속하지 않는 공통 기반**이라는 점이 이를 뒷받침한다.

`[INFERENCE]` **단축 지렛대 3개**: ① 컴포넌트 라이브러리(shadcn — `.mcp.json`에 MCP가 이미 설정돼 있음) 도입 시 원자 컴포넌트 8인일 + 접근성 QA 일부 절감, 약 **-10~15 인일** ② `/sample` 4상태를 S등급 컴포넌트에 한해 축소 ③ Mock 시드 규모 축소(단, 성능 문제 은폐 위험).

### 6.4 참고 — v0.2 개략 규모 (요청 범위 밖, 계획 맥락용)

`[UNCERTAIN]` 상세 산정은 하지 않았다. 그러나 §4에서 검증한 항목들이 전부 v0.2에 떨어지므로 규모 감각을 남긴다:

| 항목 | 개략 인일 |
| --- | ---: |
| Supabase 스키마 + 마이그레이션 (20 엔티티) | 8 ~ 12 |
| **RLS 정책 20 테이블 + SECURITY DEFINER 헬퍼 + 재귀 회피 + 인덱스**(§4-⑤) | 12 ~ 18 |
| Auth 통합 + **계정 잠금 자체 구현**(C-3) + 커스텀 SMTP(C-4) | 6 ~ 9 |
| **Realtime Broadcast 전환 + 트리거 + Realtime Authorization 정책**(§4-④) | 8 ~ 12 |
| **원자적 정원 판정 RPC + 제약**(§4-①) | 2 ~ 3 |
| pg_cron 잡 (투표 종료·판정·Meetup 생성·알림 적재, 채팅 파기)(§4-②③) | 5 ~ 8 |
| Mock → 실데이터 교체 + 도메인 오류 경로 UI(§4-⑨) | 10 ~ 15 |
| 통합 검증 (권한 매트릭스 34행 × 역할 6종 수동 검증) | 8 ~ 12 |
| **v0.2 개략 합계** | **59 ~ 89 인일** |

`[INFERENCE]` → v0.1 + v0.2 ≈ **255 ~ 300 인일**, 1인 기준 약 **13~15개월**.

---

## 7. Step 5 — 가설 검증 및 수정

<thinking>
초기 가설과 실제 결과를 대조하고, 수정된 이해를 기록한다.
</thinking>

| | |
| --- | --- |
| **예상했던 것** | PRD 내부에 정합성 오류가 몇 건 있고, "서버에서 원자적으로" 류의 수단 미특정이 주된 위험일 것 |
| **실제 발견** | ① PRD 내부 정합성은 **예상보다 훨씬 좋다** — §11 체크리스트가 형식적 알리바이가 아니라 실효적이었고, §12는 원본의 결함까지 잡아냈다. ② 수단 미특정은 예상대로 위험했다(C-2·C-3·C-4). ③ **예상 못 한 것 둘**: Supabase 프로젝트 점유(C-1)와 D-003의 트리거 데드락(C-5) |
| **차이의 원인** | PRD 검증을 **PRD 안에서만** 하면 C-1도 C-5도 나오지 않는다. C-1은 PRD가 사실로 전제한 외부 상태를 실측해야 나오고, C-5는 상위 문서(D-003)와 FR-041의 행위자 정의를 **교차 추적**해야 나온다 |

### 수정된 이해

`[INFERENCE]` **이 PRD의 위험은 PRD가 쓴 것에 있지 않고, PRD가 "상위 문서가 정했으니 됐다"고 넘긴 것에 있다.** D-001~D-017은 **제품 결정**으로는 전부 타당하고 기술적으로 불가능한 것이 하나도 없다. 그러나 그중 넷(D-003의 종료 트리거, D-009의 파기 배치, D-013의 원자적 정원, D-017의 데이터 접근 규칙)은 **결정과 구현 사이에 "수단"이라는 층이 하나 더 있는데 그 층이 비어 있다.** PRD는 파생 문서이므로 이 층을 채울 의무가 없지만, **v0.2 착수 전에 누군가는 채워야 하고 지금은 아무 문서도 그 책임을 지고 있지 않다.**

### 긍정적으로 확인된 것 (공정성)

`[FACT]`/`[INFERENCE]` 다음은 검증 결과 **문제없음**으로 확인됐다:
- D-007 + D-017의 RLS 양립 — 가능하며 화면 필터보다 안전·저렴
- D-006의 12색 3:1 양모드 — **계산으로 구성 가능함을 증명**
- 자동 종료·파기 스케줄 수단 — pg_cron이 초 단위까지 지원, 무료 티어 게이트 없음
- FR-043 read-time fallback — 스케줄 지연에 대한 적절한 방어
- 알림 채널 추상화(NFR-038 + FR-073) — 네이티브 Push 확장에 잘 대비됨
- `ChatMessage.refPostId` ID 참조 — R-016(경로 변경)·네이티브 전환 모두에 정합
- NFR-036 순수 함수 분리 — 네이티브 이식의 핵심을 정확히 겨냥
- F↔FR 추적, SC 대응, 54건 집계 — 전부 일치

---

## 8. 이슈 목록

### 🔴 Critical (즉시 처리 — v0.2 착수 전 또는 즉시)

#### C-1 · PRD가 백엔드로 지정한 Supabase 프로젝트가 이미 다른 애플리케이션에 점유돼 있다

<reasoning>
**발견 과정**: PRD §8이 project ref를 명시했으므로 `list_tables`로 실물을 확인함. "테이블 0개"라는 전제를 검증 없이 수용하지 않은 결과.

**확인된 사실** `[FACT]`: ref `damruradpliktkrlkakl`(= `.mcp.json`의 ref, `get_project_url`로 확인)에 **43개 테이블 / 33건 마이그레이션(2026-07-20~22) / 전 테이블 RLS 활성**. 도메인은 축구 매니저 시뮬레이션(`league`·`player`·`fixture`·`transfer`…). `cron_run` 21행 = 스케줄러 실행 이력 존재. `auth_profile_wallet_provisioning` + `handle_new_user_restrict_execute` = **`auth.users` 신규 가입 시 `profile`·`wallet`을 자동 생성하는 트리거가 이미 걸려 있음.**

**충돌 분석** `[INFERENCE]`:
| mo_im 계획 | 기존 프로젝트 | 결과 |
| --- | --- | --- |
| `Profile` 테이블 | `public.profile` (2행, `profile_locale_column` 마이그레이션 존재) | **이름 충돌** |
| `AuditLog` | `public.audit_log` | **이름 충돌** |
| FR-001 회원가입 → `auth.users` | `handle_new_user` 트리거가 축구 게임용 `profile`·`wallet` 생성 | **mo_im 가입자마다 무관한 지갑이 생성됨** |
| NFR-011 "정책 없는 테이블 0개" | 기존 43테이블의 RLS 정책과 공존 | 검증 범위가 2배 |
| D-009 채팅 파기 pg_cron 잡 | 기존 tick 스케줄러 (공식 권고: 동시 8잡 이내) | **잡 슬롯·DB 커넥션 경합** |

**영향**: PRD §8, R-003(내용 자체가 사실과 다름), NFR-011, FR-001, D-009. v0.2 전체.

**권고 해결책**: **mo_im 전용 Supabase 프로젝트를 신규 생성하고 PRD §8·R-003의 ref를 교체한다.** 기존 프로젝트에 스키마를 얹는 것은 ① `auth.users` 트리거 오염 ② 이름 충돌 ③ 파괴적 마이그레이션 위험 ④ 두 제품의 RLS·cron·요금제 한도 공유 때문에 권장하지 않는다. `[ALTERNATIVE]` 부득이 공유해야 한다면 **전용 스키마(`mo_im`) 분리 + `handle_new_user` 트리거의 앱 구분 분기**가 최소 요건이나, 요금제 한도(§4-④)는 여전히 공유된다.

**긴급도**: **최상** — v0.2에서 첫 마이그레이션을 적용하는 순간 되돌리기 어려워진다.
</reasoning>

#### C-2 · FR-066 AC2의 원자성이 RLS로는 달성 불가능하며, 수단이 특정되지 않았다

<reasoning>
**문제** `[INFERENCE]`: RLS `WITH CHECK`의 count 서브쿼리는 Read Committed에서 동시 트랜잭션 간 격리되지 않는다. `[FACT]` PostgreSQL 공식: "Attempts to enforce business rules by transactions running at this isolation level are not likely to work correctly without careful use of explicit locks."

**부수 결함** `[FACT]`: PRD §7·requirements 5.2 모두 `MeetupAttendance`에 **`(meetupId, profileId)` 유일 제약이 없다** → FR-067 E2의 멱등성(upsert)도 불가능.

**영향**: FR-066 AC2·E2, FR-067 E2, D-013. 실패가 조용하고 부하 상황에서만 발생하므로 R-002(수동 QA)로는 검출 불가.

**권고 해결책**: `meetup.attending_count` 카운터 + 조건부 UPDATE(`where attending_count < capacity`) + `check (attending_count <= capacity)` + `unique(meetup_id, profile_id)`. 조건부 UPDATE는 행 락 획득 후 최신 행으로 WHERE를 재평가하므로 원자적이다. `[ALTERNATIVE]` 비노출 스키마의 `SECURITY DEFINER` RPC + `select … for update`도 동등하게 유효하며, ⑩의 "RPC를 1차 계약으로" 방향과 일치한다.

**긴급도**: 높음 — 스키마 설계 시점에 결정되어야 함.
</reasoning>

#### C-3 · FR-002의 계정 잠금에 대응하는 Supabase Auth 기능이 없다

<reasoning>
**요구** `[FACT]`: FR-002 E2 "5회 연속 실패 → 15분 잠금", AC4 "5회 연속 실패 후 6회째 시도 시 **자격 증명이 맞아도** 잠금 안내", NFR-016 "로그인 5회/15분", PRD 로그인 페이지 "5회 연속 실패 시 잠금 안내".

**확인된 사실** `[FACT]`: Supabase Auth 기본 레이트 리밋은 **IP 또는 프로젝트 단위**다 — 검증 요청 360/시간(IP), 토큰 갱신 1800/시간(IP), MFA 15/시간(IP). **계정 단위 잠금(N회 실패 후 lockout) 기능은 문서에 없다.**

**영향** `[INFERENCE]`: IP 기반 제한은 ① 같은 IP의 다른 사용자를 함께 막고 ② 분산 IP 공격을 못 막으며 ③ **"자격 증명이 맞아도 거부"라는 AC4의 의미론을 표현할 수 없다.** → **애플리케이션에서 실패 시도 카운터를 직접 구현해야 한다**(테이블 + 로그인 경로 게이트 + 15분 윈도우 + 잠금 해제).

**권고 해결책**: v0.2 스키마에 `auth_attempt(identifier, attempted_at, succeeded)` 추가, 로그인을 Server Action/Edge Function으로 감싸 카운터를 선검사. **PRD §8 기술 스택에 "인증 = Supabase Auth"라고만 적혀 있어 이 자체 구현분이 계획에 없다.** v0.1(Mock)에서는 잠금 **화면 상태**만 만들면 되므로 §6.2의 2.5인일에 이미 포함돼 있다.

**긴급도**: 중간(v0.2) — 단 v0.2 산정에 누락돼 있음.
</reasoning>

#### C-4 · FR-001의 인증 메일 재발송 상한이 Supabase 기본 SMTP 한도를 초과한다

<reasoning>
**요구** `[FACT]`: FR-001 E4 "재발송(60초 쿨다운, **시간당 5회 상한**)", E5 "인증 링크 만료(24시간)". PRD 회원가입 페이지 "이메일 인증 메일 발송".

**확인된 사실** `[FACT]`: Supabase 내장 이메일 서비스는 **시간당 2통**이며, 공식 문서가 "availability is on a **best-effort basis**. **For production use, you should consider configuring a custom SMTP server**"라고 명시한다. 또한 가입 확인 메일은 **사용자당 60초 윈도우에 1건**으로 별도 제한된다.

**영향** `[INFERENCE]`: ① 시간당 5회 상한은 내장 SMTP(2통/시간, **프로젝트 전체**)로는 불가능 ② 내장 SMTP는 프로젝트 단위이므로 **동시 가입자 3명이면 3번째부터 메일이 안 간다** ③ 즉 **커스텀 SMTP는 선택이 아니라 필수 의존성**인데 PRD §8 기술 스택에 없다.

**권고 해결책**: PRD §8에 SMTP 공급자(Resend/SendGrid/SES 등)를 **명시적 외부 의존성**으로 추가하고, 비용·발송 도메인 인증(SPF/DKIM) 작업을 v0.2 계획에 넣는다. `[UNCERTAIN]` 어느 공급자를 쓸지는 결정 사항이므로 여기서 특정하지 않는다.

**긴급도**: 중간(v0.2) — 도메인 인증에 리드타임이 있어 늦게 착수하면 릴리스를 막는다.
</reasoning>

#### C-5 · 투표 자동 종료 트리거 ③이 탈퇴자 발생 시 영구히 발화하지 않는다

<reasoning>
**추론 경로**: §5.1 참조. D-003("탈퇴자는 스냅샷에 남기되 미투표 처리") + FR-041 행위자("스냅샷 명단의 **active** 크루원") → 탈퇴자는 영원히 투표 불가 → 미투표자 수가 0에 도달 불가 → 트리거 ③ 사망.

**영향**: D-003, FR-043 AC2, FR-026, PRD F023. 트리거 ①로 결국 종료되므로 데이터 정합성은 깨지지 않으나, **전원 투표 완료 후 최대 14일 대기**가 발생해 P4·원문 №8의 목적을 훼손한다.

**권고 해결책**: 미투표자 집계를 **`스냅샷 ∩ 현재 투표 가능자`** 로 정의한다(분모/정족수 정의는 D-003 그대로 유지 — 결정을 뒤집지 않는다). ⑥의 `poll_eligible_voter` 조인 테이블을 채택하면 `can_still_vote` 파생 상태로 자연히 표현된다.

**긴급도**: 높음 — 판정 로직은 NFR-036의 순수 함수로 v0.1에 이미 구현된다. 지금 고치면 3인일, 나중에 고치면 이미 확정된 투표 기록(NFR-032가 소급 변경 금지)과 얽힌다.
</reasoning>

---

### 🟡 Major (v0.2 설계 착수 전 해결 권장)

#### M-1 · NFR-006이 무료·Pro(상한) 요금제를 초과하고, Realtime 방식이 특정되지 않았다

`[FACT]` 동시 연결: Free **200** / Pro **500** / Pro(상한 해제) **10,000**. NFR-006의 **1,000세션은 앞의 둘을 초과**.
`[FACT]` Postgres Changes는 "변경 1건 × 구독자 N명 = 인가 검사 N회, 단일 스레드, **컴퓨트 증설로 개선 안 됨**". Broadcast는 벤치마크상 250,000 동시 사용자 / >800,000 msgs/sec.
`[INFERENCE]` → **① 최소 Pro + 지출 상한 해제 필요 ② NFR-007이 "Realtime 구독"이라고만 쓰고 Broadcast/Postgres Changes를 구분하지 않은 것이 실질적 공백이며, Broadcast를 택해야 NFR-003(p95 1초)이 성립한다.** Broadcast 채택 시 `realtime.messages`에 대한 **별도 Realtime Authorization RLS 정책**이 추가로 필요하다.
**영향**: NFR-003·006·007, R-011, CON-08, FR-051·042·070.
**권고**: v0.2 착수 전 ① 요금제 확정 ② NFR-007에 "Broadcast(트리거 + `realtime.broadcast_changes()`)" 명시 ③ 구독을 사용자당 1연결로 다중화(연결당 채널 100 한도 내).

#### M-2 · FR-045 AC2 "5초 이내"의 기준 시각(t=0)이 정의되지 않았다

`[INFERENCE]` "판정 완료 시각"이면 달성 가능, "마감 시각"이면 스케줄 주기(pg_cron 최소 1초~권장 1분)에 종속되어 위반. `[FACT]` FR-043 AC4가 "자동 종료 작업 5분 지연"을 정상 시나리오로 규정한 것과 정면으로 어긋난다.
**부수**: read-time fallback(FR-043 E3)은 **표시만** 복구하고 Meetup 생성(FR-060)·알림 적재(FR-045)는 복구하지 않는다 → "종료로 보이나 Meetup 없음" 중간 상태의 UI 규정이 없다.
**영향**: FR-045 AC2, FR-043 AC4, FR-060, NFR-029.
**권고**: t=0 = 판정 완료 시각으로 명문화 + 마감→판정 지연의 별도 목표치 설정 + 중간 상태 UI 규정.

#### M-3 · `Poll.eligibleSnapshot: profileId[]`가 요구되는 원소별 상태를 담지 못한다

`[INFERENCE]` D-015(강퇴자 제외한 정확히 9건), NFR-029(발송 실패 재시도 3회), FR-042(미투표 수), D-003(탈퇴/강퇴 구분)이 전부 **대상자별 상태**를 요구하나 배열에는 자리가 없다. `[INFERENCE]` UUID 16바이트 × 크루원 수 → **약 120명부터 TOAST 경계**를 넘어 Poll 행 조회마다 out-of-line 접근. `[FACT]` 배열/함수를 `select`로 감싸지 않으면 공식 벤치마크상 **>2분/타임아웃 → 2ms**의 4~5자리수 차이.
**영향**: requirements 5.2, PRD §7, FR-042·045, D-003·D-015, NFR-029·032.
**권고**: `poll_eligible_voter(poll_id, profile_id, notified_at, notify_attempts, PK(poll_id, profile_id))` 조인 테이블. NFR-032가 투표 기록의 소급 변경을 금지하므로 **스키마 설계 시점이 마지막 기회**다.

#### M-4 · 3:1 팔레트는 구성 가능하나 색각 이상에서 6/66 쌍이 붕괴하며, D-006의 충돌 회피 규칙이 무효하다

`[FACT]` 계산 결과: 12색 전부 두 배경에서 4.45:1 통과(§4-⑧ 표). **동시에** 2형 색각 시뮬레이션에서 최소 쌍별 ΔE **2.0**, ΔE<10인 쌍 **6개**.
`[INFERENCE]` 3:1 × 2모드 제약이 색을 좁은 휘도 창(L∈[0.109,0.300])에 가두어 **등휘도화**시키고, 색각 이상은 휘도는 남기고 색상을 잃으므로 등휘도 팔레트에서 최악이 된다. **NFR-018을 만족시키려는 압력이 NFR-019가 막으려는 문제를 키운다.**
`[INFERENCE]` D-006의 "인접하지 않은 다음 인덱스" 규칙은 **팔레트 인덱스 거리 ≠ 지각적 거리**이므로 의도한 효과가 없다(인덱스 0↔2가 CVD에서 ΔE 3.4).
**영향**: D-006, NFR-018·019·022, R-013, FR-062 AC2·AC3, CON-04.
**권고**: ① 팔레트 순서를 CVD 시뮬레이션 후 ΔE 최대화 순으로 재정의 ② 휘도 창 안에서 명도를 의도적으로 분산 ③ NFR-019의 텍스트 라벨을 **필수 불가침**으로 취급. **보너스**: 단일 팔레트 한 벌로 두 모드가 모두 통과하므로 CON-04의 "12조 라이트/다크 쌍"은 선택 사항 → 작업량 절감.

#### M-5 · Vercel Hobby Cron으로는 D-003·D-009의 스케줄 요구를 충족할 수 없다

`[FACT]` Vercel Hobby: **하루 1회 · ±59분**, 더 잦은 표현식은 **배포 실패**. Pro/Enterprise: 1분 · 분 단위.
`[FACT]` Supabase Cron(pg_cron): **초 단위 ~ 연 1회**, 요금제 게이트 없음, 이 프로젝트에서 설치 가능(1.6.4). 권고: 동시 8잡 이내, 잡당 10분 이내(pg_cron 자체 상한 32잡).
`[INFERENCE]` → **pg_cron이 명백히 우월하다.** PRD §8이 "Vercel 배포"만 적고 스케줄 수단을 적지 않아 구현자가 Vercel Cron을 고를 위험이 있으며, Hobby라면 배포 자체가 깨진다.
**영향**: D-003(트리거 ①), D-009, NFR-033, FR-043·045·060.
**권고**: PRD §8 백엔드·인프라에 "스케줄: Supabase Cron(pg_cron)" 명시. 채팅 파기는 배치 루프 또는 `pg_partman` 파티셔닝(**스키마 설계 시점 결정**).

#### M-6 · `crew_membership` RLS 자기참조 재귀 — D-017 구현의 실질적 장애물

`[INFERENCE]` `crew` SELECT 정책이 `crew_membership`을 조회하고, `crew_membership`의 정책("같은 크루의 active 멤버만")이 다시 `crew_membership`을 조회 → **PostgreSQL RLS 무한 재귀.**
`[FACT]` 공식 해법: 비노출 스키마의 `SECURITY DEFINER` 함수로 조인 테이블 RLS 우회 + `(select …)`/`= any(array(select …))` 래핑 + 인덱스. 공식 벤치마크: 미적용 **>2분/타임아웃** → 적용 **2ms**.
**영향**: D-007·D-017, NFR-011·012, FR-012·014, 사실상 **크루 종속 전 테이블**(Board·Post·Poll·ChatMessage·Meetup…).
**권고**: RLS 설계 시 ① `private.my_active_crew_ids()` 등 헬퍼를 **`public` 밖 스키마**에 생성(공식 경고: 노출 스키마 금지) ② 모든 정책에 `TO` 절 명시 ③ 조인 방향을 "대상 테이블 컬럼 IN (내 것 집합)"으로 고정.

#### M-7 · React Compiler는 이 제품의 INP 병목에 관여하지 않으며, 금지 규칙에 공식 탈출구가 있다는 사실이 누락됐다

`[FACT]` React 공식: 컴파일러는 **컴포넌트와 훅만** 메모이즈하며 "not every function"이다. `[INFERENCE]` → **NFR-036이 요구하는 "React 비의존 순수 함수"(투표 판정·정족수·권한·색 해시)는 정의상 최적화 대상 밖**이다. 채팅·캘린더의 실제 INP 지렛대(윈도잉, 안정 key, `startTransition`, 사전 인덱싱)도 컴파일러 소관이 아니다.
`[FACT]` 공식 탈출구 2개: React — "`useMemo` and `useCallback` **can continue to be used… as an escape hatch**"; Next.js — **`"use no memo"`** 디렉티브, `compilationMode: 'annotation'`.
`[INFERENCE]` → CLAUDE.md/CON-03의 무조건 금지는 React 공식 문서보다 엄격하다. **관습으로는 타당하나, 예외 절차가 없어 성능 문제 발생 시 팀이 막힌다.**
**영향**: CON-03, R-004, NFR-001, NFR-036, FR-051·061.
**권고**: ① CLAUDE.md에 예외 절차(`"use no memo"` + 측정 근거 기록)를 명시 ② NFR-001 달성 전략을 메모이제이션이 아니라 **렌더링 전략**(윈도잉·전환)으로 기술 ③ `[FACT]` 빌드 시간 증가는 공식이 인정한 사항이며 R-002(빌드가 유일한 검증 수단)와 겹치므로 모니터링.

#### M-8 · Mock→실데이터 무수정 교체가 실시간 경계에서 성립하지 않는다

`[INFERENCE]` 읽기(서버 컴포넌트)·쓰기(Server Action)는 성립하나, **Realtime 구독은 클라이언트 컴포넌트 + 구독 생명주기 + 로컬 상태 병합**을 요구한다. Mock 단계에서 순수 표현 컴포넌트로만 만들면 전환 시 `'use client'` 전환과 상태 소유권 이동이 필요 → 정확히 CLAUDE.md가 금지한 "UI 수정".
**전제되어야 할 경계 4개**: ① 표현/컨테이너 분리(Mock 단계에도 컨테이너 생성) ② `subscribeToRoom(id, onEvent): Unsubscribe` 구독 인터페이스 추상화 ③ `/sample` 4상태의 "에러"에 **도메인 오류**(RLS 403·정원 마감·충돌) 포함 ④ 인증 경계 위치(`proxy.ts` vs 레이아웃) 결정 — `[FACT]` `proxy.ts`는 nodejs 런타임 고정, D-011로 v0.1 범위 밖.
`[INFERENCE]` **기회**: `[FACT]` Next.js 16의 `updateTag`(read-your-writes)·`refresh()`는 이 전환 시나리오를 위한 API다. Mock 단계에서 Server Action + `refresh()` 패턴을 미리 쓰면 전환이 한 줄로 끝난다. **문서가 이 API를 언급하지 않는다.**
**영향**: CLAUDE.md 개발 원칙, NFR-034·037, R-003·R-007, FR-051·042·070.

#### M-9 · PRD §7 데이터 모델이 AC가 요구하는 필드를 5개 엔티티에서 누락했다

`[FACT]` §5.3 표 참조 — `Meetup.title/description`(FR-064 AC1), `Poll.closedBy/result`(FR-043 AC3), `Profile.bio/status`, `Post.createdAt/editedAt`(FR-032 AC1), `MeetupAttendance` 유일 제약(원본에도 없음).
`[INFERENCE]` §0의 "원본이 이긴다"로 복구되나, **v0.1의 첫 작업이 "동일 TypeScript 타입 정의"(NFR-035)** 이므로 PRD만 보고 착수하면 즉시 어긋난다.

#### M-10 · 소규모 크루에서 투표 익명성(D-003)이 집계 공개만으로 붕괴한다

`[INFERENCE]` 대상자 2~3명이면 집계에서 본인 표를 빼는 것만으로 타인의 선택이 드러난다. `[FACT]` D-014로 크루 규모 하한이 없고, **여정 B 4단계(개설 직후 1명 초대)가 정확히 그 상태**다 — 예외가 아니라 신규 크루의 기본 상태.
`[INFERENCE]` RLS로 `PollVote` 행을 막아도 **집계 자체가 누설**하므로 접근 제어로는 해결 불가.
**권고** `[ALTERNATIVE]`: 대상자 N < 임계값이면 집계를 숨기거나 종료 후에만 공개. **D-003을 뒤집지 않는다** — D-003은 "집계 공개"를 정했지 "소규모에서도 공개"를 정하지 않았다.

---

### 🟢 Minor

| # | 내용 | 근거 |
| --- | --- | --- |
| m-1 | `Meetup.status`에 `confirmed`가 없다 — FR-066 사전조건이 존재하지 않는 상태값을 참조 | §5.4 |
| m-2 | 정족수 1/3의 **반올림 규칙 미정** — FR-044 AC1의 예시(10→4)로만 `ceil`이 추정됨. 대상자가 3의 배수가 아닌 모든 경우에 판정이 갈림 | §5.6 |
| m-3 | `Poll.quorumRatio`가 컬럼이나 D-003은 1/3 고정 — 필드 존재가 설정 가능성을 암시 | §5.6 |
| m-4 | F018 MVP 편입 근거의 후반부("투표 시작 후 잠금")가 무효 — 투표가 게시글과 동시 생성되므로 잠금은 무조건적 | §5.5 |
| m-5 | 통합 캘린더 페이지가 "조회 전용·데이터 생성 없음"과 F035(참석 응답)를 같은 표에 병기 — 모순은 아니나 오독 유발 | §5.7 |
| m-6 | PRD §0의 "D-001~D-014" 표기가 낡음(실제 D-017까지). 본문은 정상 참조 | §5.8 |
| m-7 | PRD §8 "기술 스택"이 **설치된 것과 도입할 것**을 구분하지 않음 — 현재 의존성은 next/react/react-dom 3개뿐 | §2.1 |
| m-8 | `globals.css`에 캘린더 12색 팔레트가 없음(CON-04 대상). 현재 토큰은 background/foreground/폰트뿐 | §2.1 |
| m-9 | Broadcast 채택 시 `realtime.messages` Realtime Authorization 정책이 추가로 필요 — NFR-011의 "전 테이블" 범위에 미포함 | §4-④ |
| m-10 | 소속 크루 100개 초과 시 연결당 채널 한도(100)를 넘음 — D-014로 상한이 없어 정의되지 않은 구간 | §4-④ |
| m-11 | 채팅 파기의 파티셔닝 여부는 **테이블 생성 시점** 결정이나, 문서는 "v0.2에 배치 추가"로만 서술해 결정 시점을 놓칠 위험 | §4-③ |

---

## 9. `[UNCERTAIN]`으로 남은 것과 해소 방법

| # | 불확실한 것 | 왜 확인 못 했나 | 해소 방법 |
| --- | --- | --- | --- |
| U-1 | **Realtime 초당 메시지의 팬아웃 계수** — 브로드캐스트 1건 × N구독자를 1로 세는가 N으로 세는가 | 공식 quotas 문서가 "An event is a WebSocket message delivered to, or sent from a client"라고만 정의하고 브로드캐스트 계수를 명시하지 않음 | ① Supabase 대시보드 **Project Settings > Product Reports > Realtime**(공식 기능)에서 소규모 부하로 실측 ② Supabase 지원팀 문의(Postgres Changes 문서가 직접 권하는 경로). **N으로 센다면 Pro(500/s)에서 100명 방 채팅이 초당 5건이 상한이 되어 용량 계획이 20배 달라진다** |
| U-2 | **실제 사용할 Supabase 요금제** | 문서 어디에도 요금제가 없음. NFR-006(1,000세션)은 Pro+상한해제 이상을 전제 | 요금제를 D-\*로 확정. NFR-006이 C/v1.0이므로 v0.2까지는 Free/Pro로 진행 가능하나 **v0.2 실측 시점에 200/500 연결 한도에 걸리는지 확인** 필요 |
| U-3 | **FR-045 AC2 "5초"의 t=0** | 원문이 정의하지 않음 | 요구사항 소유자 확인 → M-2 |
| U-4 | **팀 규모** | 미정(검증 지시문 명시) | 인일 추정을 그대로 인원수로 나눠 쓸 수 있게 §6을 인일 단위로 냈음. 단 공통 영역 48인일은 **병렬화 효율이 낮다**(컨벤션·타입·토큰은 직렬 의존) |
| U-5 | **커스텀 SMTP 공급자 선정** | 결정 사항 | C-4 참조. 도메인 인증 리드타임 고려해 조기 결정 |
| U-6 | **PostgREST 요청의 격리 수준 커스터마이즈 가능성** | 검증하지 않음(C-2를 카운터 UPDATE로 해결하면 불필요해지므로) | C-2의 권고안 채택 시 확인 불필요 |
| U-7 | **`/sample` 4상태의 "에러"에 도메인 오류가 포함되는가** | CON-09가 "기본·로딩·빈 상태·오류"라고만 규정 | M-8 ③ 참조 — 규약 확정 필요 |

---

## 10. 최종 판정

### 종합 추론 체인

```
초기 가설         →  기술 검증        →  논리 정합성      →  복잡도 평가      →  종합 판정
[내부 정합성은      [10개 항목 중        [PRD 내부는          [168.5 인일,       [⚠️ 조건부 통과]
 좋고, 미특정       불가능 0건.          정합. 상위          1인 약 8.4개월.
 수단이 위험]       구성 불가능한        문서에서             공통 기반이
                    결정도 0건]          상속된 모순 1건]     28.6%]
       ↓                  ↓                    ↓                   ↓
   절반 적중         C-2·C-3·C-4         C-5 발견            3~6개월 아님
   (C-1·C-5 예상외)  M-1~M-10
```

### Chain of Thought 요약

1. **Because** `[FACT]` D-001~D-017 중 **기술적으로 불가능한 결정은 하나도 없다** — D-006의 12색 3:1 팔레트는 계산으로 구성 가능함을 증명했고, D-007+D-017은 두 개의 PERMISSIVE RLS 정책으로 동시 표현되며, D-003·D-009의 스케줄은 pg_cron이 초 단위로 지원하고, D-013의 원자성은 조건부 UPDATE로 완전 해결된다.
2. **And** `[FACT]` PRD의 내부 정합성(F↔FR 39쌍, SC 22↔19, FR 54건 집계, §11 체크리스트, §12 모호점 승격)은 **재검증에서 모두 통과**했다.
3. **But** `[FACT]` PRD가 백엔드로 지정한 Supabase 프로젝트는 **43테이블·33마이그레이션의 다른 애플리케이션에 점유**돼 있고(C-1), `[INFERENCE]` D-003의 "미투표자 0명" 트리거는 **탈퇴자 발생 시 영구히 발화하지 않으며**(C-5), `[INFERENCE]` FR-066의 원자성·FR-002의 계정 잠금·FR-001의 메일 재발송은 **각각 RLS·Supabase Auth·내장 SMTP로는 달성 불가**해 별도 구현/외부 의존성이 필요하다(C-2·C-3·C-4).
4. **Therefore** — **PRD는 폐기·재작성 대상이 아니다.** 결함은 PRD가 쓴 것이 아니라 PRD가 상위 결정에 위임하고 넘어간 **"결정과 구현 사이의 수단 층"**과, **아무도 검증하지 않은 외부 전제**에 있다. 이 두 층을 v0.2 착수 전에 채우면 v0.1 진행에 지장이 없다.

### 판정: ⚠️ **조건부 통과**

> **한 문장 근거**: D-001~D-017 어느 것도 기술적으로 불가능하지 않고 PRD 내부 정합성도 재검증을 통과했으나, PRD가 백엔드로 지정한 Supabase 프로젝트가 이미 다른 애플리케이션에 점유돼 있고(C-1) 투표 종료 트리거에 논리적 데드락이 있으며(C-5) 원자성·계정잠금·메일발송의 구현 수단이 특정되지 않아(C-2~C-4), **이 5건을 닫으면 그대로 구현 가능하다.**

**다른 등급을 택하지 않은 이유:**

| 등급 | 배제 근거 |
| --- | --- |
| ✅ 검증 완료 | C-1이 v0.2 백엔드 전제를 무효화하고, C-5가 스펙 수준의 논리 모순이므로 무수정 진행 불가 |
| 🔄 대규모 수정 필요 | 아키텍처 재설계가 필요한 항목이 없다. 데이터 모델·페이지·여정·권한 모델은 전부 유효하며, 수정은 필드 추가·수단 특정·인프라 교체 수준 |
| ⛔ 부분 구현 가능 | v0.1 FR 39건 중 **구현 불가능한 것이 0건**. 정원 원자성도 대안 4개 중 2개가 완전 해결 |
| ❌ 재검토 필요 | 근본적 오류가 없다. 원문 №1~13 커버리지 13/13, 상위 문서 파생 관계도 건전 |

### 신뢰도 및 위험도

| 지표 | 점수 | 근거 |
| --- | :-: | --- |
| **기술적 신뢰도** | **8 / 10** | 검증 항목 대부분을 1차 문서·실측·직접 계산으로 확인. 감점은 U-1(Realtime 과금 계수)·U-2(요금제) |
| **구현 복잡도** | **8 / 10** | v0.1만 168.5 인일. 컴포넌트 약 70종 × 4상태 × 2모드 × 3뷰포트 × WCAG AA. 공통 기반이 28.6% |
| **외부 의존 위험** | **7 / 10** | Supabase(Auth·PG·Realtime·Cron) + Vercel + **미선정 SMTP**. C-1의 프로젝트 점유가 가장 큰 요인 |
| **전체 위험도** | **7 / 10** | 개별 위험은 전부 해결책이 존재하고 식별됨. 잔여 위험의 핵심은 **R-002(검증 수단 없음)** — C-2·C-5처럼 조용히 실패하는 결함을 잡을 층이 없다 |

### 개발 진행 권장사항

| 시점 | 할 일 |
| --- | --- |
| **즉시** | **C-1** mo_im 전용 Supabase 프로젝트 신설 + PRD §8·R-003 ref 교체. **C-5** 미투표자 집계 정의 수정(판정 로직이 v0.1 순수 함수로 구현되기 전에) |
| **v0.1 착수 전** | R-007 디렉터리 컨벤션 확정 · **M-8의 경계 4개** 확정 · **M-9** 데이터 모델 필드 복구(NFR-035의 전제) · m-2 정족수 반올림 규칙 확정 · **M-7** React Compiler 예외 절차 명문화 |
| **v0.1 진행 중** | **M-4** 팔레트를 CVD ΔE 최대화 순으로 정의(§4-⑧ 계산 결과를 초안으로 사용) · m-8 `globals.css`에 12색 등록 · m-1·m-4·m-5·m-6 문구 정정 |
| **v0.2 설계 전** | **C-2** 카운터+조건부 UPDATE+유일제약 확정 · **C-3** 계정 잠금 자체 구현 계획 · **C-4** SMTP 공급자 선정(도메인 인증 리드타임) · **M-1** 요금제 + Broadcast 확정 · **M-3** `poll_eligible_voter` 조인 테이블 · **M-5** pg_cron 명시 · **M-6** RLS 헬퍼 스키마·래핑·인덱스 규약 · m-11 `chat_message` 파티셔닝 결정 |
| **지속** | U-1 Realtime 팬아웃 계수 실측 · R-002(테스트 러너 도입) — **C-2·C-5 같은 조용한 실패를 잡는 유일한 층** |

---

## 부록 A · 검증 체크리스트 실행 결과

### 📚 문서 확인
- ☑ API 공식 문서 직접 확인 — Supabase(WebFetch + MCP 6회), PostgreSQL, Vercel, react.dev
- ☑ **Next.js는 로컬 동봉 문서 우선** — `node_modules/next/dist/docs/` 4개 파일 직접 열람, 웹 문서 미사용
- ☑ 버전·변경사항 확인 — version-16.md 1255줄 중 관련 8개 섹션
- ☑ 제약·요구사항 파악 — 요금제 한도표 3종, RLS 벤치마크, cron 한도

### 🔄 대안 탐색
- ☑ "불가능" 판단 전 3개 이상 대안 검토 — ①4개 ②3개(pg_cron/Vercel/Edge) ③3개 ⑥3개 M-4 3개 M-10 3개
- ☑ 단계적/부분적 구현 가능성 — v0.1(Mock) / v0.2(실데이터) 분리 산정
- ☑ 아키텍처 수정을 통한 해결 — M-8 경계 4개, ⑩ "RPC 1차 계약"
- ☑ 우회적 해결책 — read-time fallback 평가, 파티셔닝, `"use no memo"`

### ⚖️ 균형 평가
- ☑ 긍정 요소 공정 평가 — §3.2, §7 "긍정적으로 확인된 것" 8항목
- ☑ 문제점과 해결 가능성 병기 — 전 이슈에 권고 해결책 명시
- ☑ 과도한 부정 편향 회피 — **구현 불가능 판정 0건**, 불가능한 D-\* 0건
- ☑ 수정 후 실현 가능성 — ⚠️ 조건부 통과, 5건 해소 시 그대로 진행 가능

### 🏷️ 태깅 정확성
- ☑ `[FACT]`는 1차 문서·실측·직접 계산만 — 저장소 실측, MCP 조회, 공식 문서 인용, 대비/CVD 계산
- ☑ `[UNCERTAIN]`으로 미검증 명시 — U-1~U-7, 각각 해소 방법 기재
- ☑ `[ALTERNATIVE]`로 대안 제시 — 6개 항목
- ☑ 추측을 확정으로 표현하지 않음 — U-1(팬아웃 계수)을 단정하지 않고 영향 범위만 기술

### 🎯 최종 판정
- ☑ 5단계 세분화 기준 적용 — 배제 근거 4개 명시
- ☑ 판정 근거의 논리적 연결 — Because/And/But/Therefore
- ☑ 대안·해결책 충분 제시 — Critical 5 + Major 10 전부 권고 포함
- ☑ 실행 가능한 개선 방향 — 시점별 4단계 권장사항

### 준수한 제약
- ☑ **어떤 파일도 편집하지 않음** — 저장소 내 파일 읽기 전용. 이 보고서는 scratchpad에만 작성
- ☑ **새 D-\*/R-\*/I-\* 생성하지 않음** — 자체 번호 체계(C-\*/M-\*/m-\*/U-\*) 사용
- ☑ **코드 작성하지 않음** — 문제 지적용 SQL 스니펫 3개만 보고서 내 인용
- ☑ **"이미 구현됨" 전제하지 않음** — §2.1에서 4파일·의존성 3개를 실측으로 확인 후 진행
- ☑ **확정 결정(D-001~D-017) 재검토 요구하지 않음** — 모두 "기술적으로 가능"으로 확인. 비용이 예상보다 큰 지점(D-003 트리거, D-006 CVD, D-013 원자성, D-017 RLS 재귀)만 검증 결과로 지적

---

## 부록 B · 근거로 인용한 1차 문서 발췌 색인

| 주장 | 출처 | 위치 |
| --- | --- | --- |
| 요청 API 동기 접근 완전 제거 | 로컬 Next.js 문서 | `version-16.md` L294~330 |
| React Compiler stable, Babel 의존, 빌드 시간 증가 | 로컬 Next.js 문서 | `version-16.md` L408~452 |
| `"use no memo"` / `compilationMode: 'annotation'` | 로컬 Next.js 문서 | `05-config/01-next-config-js/reactCompiler.md` |
| `revalidateTag` 2인자 필수, `updateTag`·`refresh` 신설 | 로컬 Next.js 문서 | `version-16.md` L453~582 |
| `proxy` 런타임 nodejs 고정, edge 미지원 | 로컬 Next.js 문서 | `version-16.md` L625~672 |
| 병렬 라우트 `default.js` 필수 | 로컬 Next.js 문서 | `version-16.md` L942~963 |
| `cacheComponents`가 ppr/useCache/dynamicIO 통합 | 로컬 Next.js 문서 | `cacheComponents.md` L56 |
| Realtime 요금제별 한도표 | Supabase | `/docs/guides/realtime/quotas` |
| Postgres Changes 구독자별 인가·단일 스레드 | Supabase | `/docs/guides/realtime/postgres-changes` |
| Broadcast 권장 + 벤치마크 250k/800k msgs/s | Supabase | `/docs/guides/realtime/benchmarks`, `/subscribing-to-database-changes` |
| pg_cron 초 단위 가능, 8잡/10분 권고, 32잡 상한 | Supabase | `/docs/guides/cron`, `/troubleshooting/pgcron-debugging-guide-n1KTaz` |
| RLS 성능 권고 + 벤치마크(178,000ms→12ms 등) | Supabase | `/docs/guides/database/postgres/row-level-security` |
| `anon`/`authenticated` 역할, `TO` 절, 다중 정책 | Supabase | 동상 |
| SECURITY DEFINER는 노출 스키마 금지 | Supabase | 동상 |
| 내장 SMTP 2통/시간, 프로덕션은 커스텀 SMTP | Supabase | `/docs/guides/auth/passwords`, `/docs/guides/auth/rate-limits` |
| Auth 레이트 리밋은 IP/프로젝트 단위, 계정 잠금 없음 | Supabase | `/docs/guides/auth/rate-limits` |
| Read Committed는 복잡 검색 조건에 부적합, 명시적 락 필요 | PostgreSQL | `/docs/current/transaction-iso.html` |
| Vercel Cron: Hobby 하루 1회 ±59분, Pro 1분 | Vercel | `/docs/cron-jobs/usage-and-pricing` |
| React Compiler는 컴포넌트·훅만, useMemo는 탈출구 | React | `react.dev/learn/react-compiler/introduction` |
| 프로젝트 43테이블·33마이그레이션 점유 | 실측 | MCP `list_tables`/`list_migrations`/`get_project_url` |
| pg_cron·pg_partman 설치 가능·미설치 | 실측 | MCP `list_extensions` |
| 저장소 4파일, 의존성 3개, `globals.css` 배경값 | 실측 | 파일 직접 읽기 |
| 12색 3:1 양모드 통과 / CVD ΔE 2.0 | 직접 계산 | WCAG 상대휘도 + Viénot–Brettel–Mollon + CIELab |
