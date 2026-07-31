# CREW 산출물 교차검증 — 34일차, DESIGN

리뷰 짝(CORE·CREW) 중 CORE가 작업 중이라 팀장 지시로 CREW의 완료분 2건(I-038·I-159)을
검증한다. **서비스롤을 쓰지 않았다** — 권한 관련 축은 전부 `set local role authenticated` +
`request.jwt.claims`로 실제 세션을 흉내냈다. CREW와 **다른 프로필·다른 UUID·다른 스크립트
구조**로 재현했다(같은 SQL을 그대로 다시 돌리지 않았다).

**방법론 주의(이번 검증 중 실제로 걸린 함정, 재사용 가능한 규칙으로 승격)**: 한 트랜잭션
안에서 페르소나를 두 번 이상 전환하는 RLS 스크립트를 쓸 때 `reset role`만으로는 부족하다 —
`request.jwt.claims`는 별개 GUC라 그대로 남고, 그 뒤 "시스템 컨텍스트"로 되돌아간 UPDATE도
`auth.uid()`가 이전 페르소나의 claims를 계속 읽어 RLS·트리거를 그 사람 것처럼 오판정한다.
**전체 규칙·재현 사례는 `docs/design/rls-regression-checklist-33/README.md` 머리말에
올렸다** — 32일차 교훈 2(서비스롤 금지)·3(가짜 양성 방지)과 같은 층위다. 이번 회차 RLS
실측이 다섯 차례 이상 있었으므로(CREW 3건·BOARD·이 문서) 페르소나를 갈아탄 다른 스크립트도
재점검 대상이다(팀장이 CREW에게 별도 지시).

---

## 대상 1 — I-038 정책 확정(A안 채택)

### ① FR-010 원문 인용 대조 — 독립 재확인, 정확함

`docs/requirements/requirements.md:484` 원문을 직접 읽었다:

> E3 금칙어 포함 → 거부.

CREW·팀장이 인용한 그대로다 — 토씨 하나 다르지 않다. 원문에 금칙어 목록의 완전성이나 우회
표기 대응 수준을 요구하는 문구가 없다는 CREW의 관찰도 FR-010 전체(478~491행)를 다시 읽어
확인했다 — E1(크루명 중복 허용)·E2(개설 상한 없음, D-014)·E3(금칙어 거부)뿐이고, 목록
내용에 대한 요구는 어디에도 없다.

### ② `BANNED_WORDS` 값·로직 변경 0건 — `git diff`로 확인, 정확함

```
git diff HEAD -- src/lib/rules/crew-name-validation.ts src/lib/rules/crew-description-validation.ts
```

두 파일의 diff 전체를 확인한 결과 **변경은 docstring/주석뿐**이다. 실행 코드 라인은:

- `export const CREW_NAME_MAX_LENGTH = 30;` — 변경 없음
- `const BANNED_WORDS: readonly string[] = ["씨발", "병신", "좆", "지랄", "fuck", "shit"];` —
  6단어 그대로, 변경 없음
- `export const CREW_DESCRIPTION_MAX_LENGTH = 300;`(파일 밖이지만 같은 파일 내 상수) — 변경
  없음(diff에 코드 라인 자체가 등장하지 않음)

**정확함.**

### ③ D-082 준수 — 새 헤딩 없음, 이력 보존 — 확인, 정확함

```
grep -n "^### I-038" docs/ISSUES.md   → 1건뿐(중복 없음)
git diff HEAD -- docs/ISSUES.md | grep "^+### "   → I-096 하나만(무관한 별개 항목, CORE/BOARD 소관으로 추정)
```

I-038 블록 안에 28일차(D-083)·29일차(DB CHECK 적용)·33일차(BOARD 분할 제안)·34일차(CREW
제안·팀장 확정) 다섯 단락이 전부 순서대로 보존돼 있다 — 이전 이력을 지우거나 요약으로
뭉개지 않았다. **새 `### I-038` 헤딩이 추가되지 않았고(D-082 준수), 이력도 그대로다.**

### ④ 상한 30자·300자 DB CHECK 실재 — `pg_constraint` 직접 조회, 정확함

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.crews'::regclass and contype = 'c';
```

결과: `crews_name_check: CHECK (char_length(btrim(name)) <= 30)` ·
`crews_description_check: CHECK (char_length(btrim(description)) <= 300)` — 문서를 믿지 않고
직접 조회했고, 문서 서술과 정확히 일치한다.

**판정 — 대상 1(I-038): 네 축 전부 확인, 결함 없음.**

---

## 대상 2 — I-159 처분(이중화 전면 기각)

### ① 3개 실측 시나리오 독립 재현 — CREW와 다른 방법으로, 결과 일치 + 더 강한 증거 1건 추가

**방법 차이**: CREW는 invitee로 실 계정(`fb70ff1c-…`)을 썼고 세 시나리오를 별도
`begin…rollback` 3개(또는 그 요약)로 나눠 실행했다. 나는 **실 계정을 전혀 쓰지 않고**
시드 프로필(`f1692173-…`=`seed_member01`을 오너/inviter, `120bc5f0-…`=`seed_member02`를
invitee)로, **하나의 트랜잭션 안에서 4단계를 순차 실행**하며 각 단계 사이 상태를 로그
테이블에 남기고 마지막에 `rollback`했다. 위험한 UPDATE는 전부 `do $$ ... exception when
others ...`로 감싸 예외가 스크립트를 중단시키지 않게 했다(SAVEPOINT 대신 이 방식을 택함 —
로그 기록과 예외 캡처를 한 번에 처리할 수 있어서).

| 단계 | 조건 | 결과(내 실측) | CREW 실측과 일치? |
| --- | --- | --- | --- |
| 기준선 | 현재 정책+트리거, invitee가 archived 초대 거절 | `outcome:ok, rows_affected:1, status→declined` | 일치(STEP A) |
| 나이브 이중화 | USING+WITH CHECK 양쪽에 `is_crew_active` 추가, 거절 재시도 | `outcome:ok(예외 아님), rows_affected:0, status 그대로 pending` — **조용히 0행** | 일치(STEP B) |
| 좁은 대안 | WITH CHECK만 `is_crew_active OR status='declined'`, 거절 재시도 | `outcome:ok, rows_affected:1, status→declined` | 일치(STEP C) |
| **`expired` 구멍 — 실제 UPDATE**(CREW는 표현식 평가만 함) | 좁은 대안 유지 + 트리거를 `alter table ... disable trigger`로 잠시 비활성화, `status='expired'`로 실제 UPDATE 시도 | **`outcome:exception, sqlstate:42501, "new row violates row-level security policy for table invitations"`** | CREW의 표현식 평가(`OR 'expired'='declined' → false`) 결론과 **일치하되, 이번엔 실제 UPDATE로 그 결론을 실증했다** — CREW보다 강한 증거 |

트랜잭션 종료 후 `rollback` 밖에서 재확인: 스크래치 크루·초대 **0건 잔존**, 라이브
`invitations_update_invitee_or_staff` 정책의 USING·WITH CHECK **원본과 정확히 일치**,
`trg_invitations_guard_response_transition` **활성 상태('O')** 그대로 — DDL 흔적 0건.

**보너스 — CREW·체크리스트 둘 다 "정적 대조에 그쳤다"고 인정한 것을 동적으로 닫았다**: "수락은
실제로 예외를 던지는가"(§6의 ②)를 별도 스크래치 픽스처로 직접 실행했다:

```
invitee가 archived 크루 초대를 status='accepted'로 UPDATE 시도
→ sqlstate P0001, message "invitations: cannot accept an invitation to an archived crew (FR-013)"
```

원본 정책·트리거 손대지 않고 얻은 결과다. 실행 후 스크래치 행 0건 잔존 확인.

### ② `expired` 구멍 실재 여부 — 독립 확인, CREW 서술 정확함(반박 없음)

- `invitations_status_check`: `CHECK (status = ANY (ARRAY['pending','accepted','declined','expired']))`
  — `pg_constraint` 직접 조회로 확인, 4개 값 허용 정확함.
- `'expired'`를 쓰는 SQL 경로 0건 — 독립 검색:
  - `grep -rn "'expired'" supabase/migrations/` → 테이블 생성 마이그레이션(허용값 정의)
    1건만, 실제로 그 값을 **대입**하는 마이그레이션 0건
  - `select proname, prosrc from pg_proc where prosrc ilike '%expired%'` → 3개 함수 매치,
    전부 무관(`restore_deactivated_account`·`anonymize_expired_deactivated_profiles`는
    `profiles.status`/`deactivated_at` 얘기, `invitations_guard_response_transition`은
    에러 메시지 문자열에 "expired"라는 단어가 들어간 것뿐 — `new.status='expired'` 대입
    자체는 어디에도 없다)
  - `src/lib/data/supabase/invitation.ts:36` D-073 docstring: "`invitations.status`는
    만료돼도 절대 `pending`에서 스스로 바뀌지 않는다(배치·트리거 없음 — 24일차 실측)" —
    코드로도 재확인.
- **CREW 서술이 맞다. 반박할 것이 없다.**
- **독립 검증 중 발견한 추가 사실(CREW·팀장 문서에 없던 내용)**: `invitations_guard_
  response_transition` 트리거 본문 자체가 `if new.status not in ('accepted', 'declined')
  then raise exception`로 **애초에 `expired`로의 전이를 막고 있다** — 즉 트리거가 살아있는
  한(현재 상태) `expired` 구멍은 **RLS든 트리거든 이중으로 막혀 있어 도달 불가능**이다. 이
  구멍이 실제로 문제가 되려면 (a) 트리거가 무력화되거나 우회되고 **동시에** (b) 좁은 대안이
  적용돼 있어야 한다 — 팀장의 "지금은 무해하지만 D-073에 의존한다"는 판단을 뒤집지는
  않지만, **정확히는 D-073 하나가 아니라 이 트리거의 상태 화이트리스트까지 두 겹**이 지금의
  무해함을 떠받치고 있다는 것을 이번 실측(STEP 4, 트리거를 실제로 꺼서 확인)이 처음
  구체적으로 보였다. 이 층 구분을 CREW 문서·결정문에 한 줄 추가할 가치가 있다(아래 "제안"
  참고).

### ③ 체크리스트 §6 항목의 실행 가능성 — **부분 미달로 발견 → 같은 회차에 수정 완료**

**팀장 판정으로 다음 회차 이월이 아니라 이번 회차에 직접 고쳤다** — 이 발견이 MINOR가 아니었던
이유: 팀장이 I-159의 RLS 이중화 기각 근거로 정확히 이 §6("이득은 DDL이 아니라 회귀 감지로
막는다")을 들었는데, 그 회귀 감지 도구 자체가 실행 불가능한 상태였다면 기각 근거가 성립하지
않기 때문이다. 아래는 발견 당시 상태와 수정 내용이다.

`docs/design/rls-regression-checklist-33/README.md` §6을 실제로 그대로 돌려 봤다:

- **`select pg_get_functiondef('public.invitations_guard_response_transition'::regproc);`**
  — 그대로 실행 가능, 트리거 본문을 즉시 반환한다. **이 부분은 실행 가능하다.**
- **"행동 검증" 블록(187~197행)은 실행 불가능하다** — 실제로 그대로 복사해 실행해 봤다:

  ```sql
  begin;
  -- 스크래치 크루(active)로 생성 → invitee에게 pending 초대 → archived로 전환 →
  -- ① ...
  -- ② ...
  rollback;
  ```

  이건 **주석뿐인 빈 트랜잭션**이다 — `begin; rollback;` 사이에 실행 가능한 SQL 문이 하나도
  없다. 33일차 CORE 체크리스트(§2)의 다른 항목들과 비교하면(그쪽은 실제 INSERT/UPDATE 문이
  들어 있다), 이 §6 블록만 "무엇을 해야 하는지 서술"에 그치고 "그것을 실행하는 SQL"이 없다.
  문서 스스로도 "다음에 이 체크리스트를 돌리는 사람은 ②도 `begin...rollback`으로 직접
  재현해 채워 넣는다"고 적어 **이 한계를 인지하고 있었다** — 과장도 은폐도 아니다. 다만
  "체크리스트"라는 문서 종류의 목적(다음 사람이 그대로 복사해 돌린다)에 비추면, 지금 상태로는
  그 목적을 못 채운다.

**수정 완료(같은 회차)**: 위 ①에서 실제로 실행한 스크립트(스크래치 픽스처 + decline 기준선 +
accept 차단 동적 재현, 예외 캡처는 `do $$ ... exception when others ...`로 처리)를
`rls-regression-checklist-33/README.md` §6에 **그대로 옮겨 넣고 기대 출력을 실측 그대로
박았다.** 옮겨 적은 뒤 **문서에 있는 스크립트를 그 파일에서 직접 `sed`로 추출해 다시
실행해 바이트 단위로 같은 출력이 나오는지 재확인했다**(33일차 CREW가 CORE 체크리스트를
검증한 것과 같은 방법) — 재실행 결과가 문서의 "기대 출력"과 정확히 일치했고, `rollback`
후 스크래치 크루·초대 0건 잔존을 재확인했다. **스크립트 작성 중 실제로 걸렸던 함정**
(`reset role` 이후에도 `request.jwt.claims`가 남아 다음 역할의 UPDATE에서 트리거가 이전
호출자의 `auth.uid()`를 계속 읽어 "only a pending invitation may be responded to" 오탐
예외를 낸 것)도 원인과 함께 문서에 남겼다 — 다음 사람이 같은 실수를 반복하지 않도록.
CREW의 "정적 대조에 그친다" 서술은 취소선으로 보존하고 "34일차 DESIGN이 동적으로
해소"로 갱신했다(D-082 범위 — 새 헤딩 없이 §6 안을 채움).

### ④ CREW의 한계 서술("accept 차단은 정적 대조에 그침") — 정확함, 과장·축소 없음

`invitation-defense-symmetry-34/README.md`와 `rls-regression-checklist-33/README.md` §6
어디에도 accept 실패를 실제 UPDATE로 재현했다는 서술이 없다 — STEP A는 decline만 다룬다.
"정적 대조에 그친다"는 표현은 정확히 그 상태를 서술한다 — **축소해서 더 확실한 것처럼
포장하지도, 과장해서 더 불확실한 것처럼 깎아내리지도 않았다.** 위 ①에서 내가 이 부분을
동적으로 닫았으므로, 다음 정본화 때 "34일차 DESIGN 교차검증이 동적으로 재현·확인함"으로
갱신할 수 있다.

**판정 — 대상 2(I-159): 처분 자체(나이브·좁은 대안 모두 기각)는 3개 시나리오 전부
재확인했고 반박할 근거를 찾지 못했다. `expired` 구멍은 실재를 더 강한 증거(실제 UPDATE)로
재확인했고, 트리거가 이미 이중으로 막고 있다는 사실을 추가로 발견했다. 체크리스트 §6의
"행동 검증" 절이 실행 불가능한 서술뿐이던 것을 발견해 같은 회차에 실행 가능한 스크립트로
직접 수정 완료했다(팀장 판정 — 기각한 DDL의 대체 근거였으므로 이월 불가).**

---

## 종합 판정

| 대상 | 판정 | 발견 | 조치 |
| --- | --- | --- | --- |
| I-038 | **확인, 결함 없음** | 없음 | — |
| I-159 | **처분 재확인(반박 없음)** | 체크리스트 §6 "행동 검증" 블록이 실행 불가능한 주석뿐(팀장 판정으로 이월 불가 등급) | **같은 회차에 직접 수정 완료** — 실행 가능한 스크립트 + 실측 출력으로 교체, 재실행으로 바이트 단위 재확인 |

## 지킨 것

- 서비스롤 미사용 — 권한 축 전부 `set local role authenticated` + `request.jwt.claims`.
- CREW와 다른 프로필(시드 전용, 실 계정 0건 사용)·다른 스크립트 구조(단일 트랜잭션 + 예외
  캡처)로 재현 — 같은 SQL을 그대로 다시 돌리지 않았다.
- 모든 실측은 `begin…rollback`(커밋 없음), 실행 후 매번 잔존 행 0건·정책/트리거 원본 일치를
  직접 재조회로 확인했다.
- `git diff`로 코드 변경 범위를 직접 확인(문서 서술을 그대로 믿지 않음).

## 이번 회차에 이미 반영한 것 (팀장 지시로 이월하지 않음)

1. `rls-regression-checklist-33/README.md` §6의 "행동 검증" 블록을 실제로 실행 검증한
   스크래치 스크립트(기준선 decline + accept 예외 재현)로 교체하고 기대 출력을 실측 그대로
   박았다. CREW의 원 한계 서술은 취소선으로 보존하고 갱신 이력을 남겼다 — 새 헤딩 없음.
2. `docs/DECISIONS.draft.CREW.md` I-159 절의 "`expired` 구멍" 항목에 "무해함이 D-073 하나가
   아니라 트리거의 상태 화이트리스트(`accepted`·`declined`만 허용)와도 이중"이라는 실측
   발견을 추가했다 — 새 헤딩 없음, 기존 블록 안에 이어 붙였다.
