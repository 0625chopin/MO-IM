# I-067 — `CrewHomeContainer` archived 렌더 검증 (30일차, CREW)

## 배경

19일차 BOARD 교차검증이 `CrewHomeContainer.tsx`에 `crew.status`·`archived` 참조가 코드
어디에도 없다는 것을 확인했지만("archived 전용 분기 자체가 없다"), 29일차 D-083 CHECK
선행조건으로 DB의 유일한 archived 크루가 캐스케이드 삭제돼 그 이후 실제 브라우저로
재검증할 픽스처가 없었다. 이번 회차 목표는 ① 픽스처 재생산 ② 그 발견이 30일차에도 여전히
맞는지 코드·브라우저 양쪽으로 재확인 ③ 결함이면 최소 범위로 수정.

## 픽스처 재생산

`chopin_0625`(`0625chopin@gmail.com`) 계정으로 로그인해 **실제 UI 플로우**로 재생산했다
(SQL 직접 조작이 아니라 앱이 실사용자에게 노출하는 것과 같은 경로) — `/crews/new`에서 신규
크루 "I-067 검증용 archived 픽스처 크루"(공개, 스터디 카테고리)를 만든 뒤(id
`2724533e-9e02-4609-8ad3-88becec6fe24`), 그 크루의 설정 화면에서 "크루 해산" →
크루명 재입력 확인 → "해산하기"로 `public.disband_crew` RPC(Task 040)를 실제로 호출해
`archived`로 전이시켰다. 보호 대상 `729ced18-2016-459a-94c3-e7959dfe808c`(Task 036 검증용)는
건드리지 않았다 — 전이 전후 모두 `active`임을 SQL로 재확인.

```sql
select id, name, status from crews where id = '2724533e-9e02-4609-8ad3-88becec6fe24';
-- {"status":"archived", ...}  (해산 직후)
select id, name, status from crews where id = '729ced18-2016-459a-94c3-e7959dfe808c';
-- {"status":"active", ...}  (보호 대상, 무변경 재확인)
```

## 코드 확인

`CrewHomeContainer.tsx`(활성 멤버십 분기)를 다시 읽었다 — 19일차 BOARD의 발견이 30일차에도
그대로였다: `crew.status`를 전혀 읽지 않고 `canManageSettings`(role 기준)만으로 "설정" 버튼
노출 여부를 정했다. `crew:update_info` 판정 자체는 role만 보고 크루 상태를 모른다(I-066과
같은 근본 원인).

## 브라우저 실측 (수정 전)

오너(`chopin_0625`)로 archived 픽스처 크루 홈(`/crews/2724533e-.../`)을 열었다.

- `i067-crew-home-active-before.png` — 해산 **전** 베이스라인(정상 크루 홈, 비교용).
- `i067-crew-home-archived-before-fix.png` — 해산 **직후** 크루 홈. **결함 확정**: 배너 없음,
  "게시판·채팅·멤버 관리·크루 설정" 4버튼이 평상시와 동일하게 전부 노출(활성 크루와 시각적
  구분 전혀 없음) — I-067이 우려한 "최악의 경우"가 그대로 재현됐다.
- `i067-settings-archived-banner-check.png` — 참고용. `/settings`(이미 `(app)/crews/
  [crewId]/layout.tsx`가 가드하는 하위 라우트)는 `ArchivedCrewBanner`("해산된 크루예요")가
  뜬다 — 그런데 그 아래 크루명·소개·카테고리·색상 편집 폼과 "저장" 버튼은 전부 그대로
  살아있다(비활성화 없음). 이건 **I-070**(DB CHECK가 막는 UPDATE를 앱이 도메인 오류로 못
  바꾼다는 이미 등록된 별개 이슈)의 영역이라 이번 수정 범위에 넣지 않았다 — 참고 스크린샷만
  남긴다.

## 수정

`CrewHomeContainer.tsx`의 활성 멤버십 분기에 `(app)/crews/[crewId]/layout.tsx`와 정확히
같은 패턴을 적용했다:

```tsx
return (
  <>
    {crew.status === "archived" && <ArchivedCrewBanner />}
    <CrewHome ... canManageSettings={canManageSettings} />
  </>
);
```

**"설정" 버튼 자체는 숨기지 않는다** — 그 레이아웃과 같은 "알려라"만 담당하는 경계를
유지했다(폼 자체를 막는 것은 I-070의 몫). `npx tsc --noEmit`·`eslint` 둘 다 통과.

## 브라우저 재검증 — 30일차 최초 시도(CREW) 실패 → 같은 회차 DESIGN이 완료

CREW가 수정 후 인증된 Playwright 세션으로 같은 URL을 재요청했지만, 당시 남긴
`i067-crew-home-archived-after-fix.png`가 `i067-crew-home-archived-before-fix.png`와
**바이트 단위로 동일했다**(둘 다 42,251바이트) — 배너가 여전히 보이지 않았다. `.next/dev/logs/next-development.log`에
이 파일의 재컴파일 로그가 없어(다른 라우트 컴파일은 계속 쌓이고 있어 서버 자체는 살아있음)
`docs/ISSUES.md` **I-135**(Turbopack이 WSL2 drvfs 마운트에서 소스 변경을 놓칠 수 있음,
재시작만이 확인된 해소책)의 3번째 관찰로 기록했다. 그 시점엔 이 dev 서버를 다른 팀원과
공유 중이라 "절대 kill 하지 마라"는 지침에 따라 재시작을 시도하지 않았다 — **그래서 CREW의
수정은 정적 검증(타입·린트, 기존에 이미 검증된 컴포넌트를 동일 패턴으로 재사용)만 됐고,
CREW 본인이 남긴 "after-fix" 스크린샷은 실제로는 수정 전 렌더였다.**

### DESIGN 재검증 (같은 30일차, CORE·CREW 세션 종료 후)

CORE·CREW가 세션 한도로 종료돼 공유자가 없어졌다는 팀장 판단에 따라 재시작 제약이 풀렸다.
`.next`를 먼저 지우지 않고 프로세스만 종료(PID 324078·npm/324090·next dev 바이너리/324102·
next-server, 포트 3000 해제 확인)한 뒤 `npm run dev`로 재기동(3.5초 만에 `Ready`)했다 —
**재시작만으로 해소됐다**(I-135의 4번째 관찰, `docs/ISSUES.md` I-135 블록에 기록. 3번째
관찰이 "확정 못한 채 열림"으로 남긴 바로 그 사례가 이제 I-135로 확정 귀속된다).

오너(`chopin_0625`)로 인증된 Playwright 세션에서 archived 픽스처 크루 홈을 다시 열자
`ArchivedCrewBanner`("해산된 크루예요")가 **실제로 렌더됐다** — `browser_find`로 배너
텍스트를 확인하고, "크루 설정" 버튼이 여전히 노출됨(숨기지 않는다는 설계 의도대로)도 확인한
뒤 새 스크린샷으로 `i067-crew-home-archived-after-fix.png`를 **교체**했다(옛 파일과 MD5가
다름 — `d9fa35a3...` vs `cd353f34...`, 진짜 다른 렌더). 이어서 **회귀 확인**: 같은 오너가
속한 활성 크루(`729ced18-2016-459a-94c3-e7959dfe808c`, Task 036 검증용, 보호 대상 —
archived로 만들지 않고 조회만 함)를 열어 배너가 뜨지 않음을 확인하고
`i067-crew-home-active-no-regression-30.png`로 남겼다.

**결론**: I-067의 `CrewHomeContainer` 부분은 이제 코드 수정·정적 검증·브라우저 실측(배너
표시 + 회귀 없음) 전부 완료됐다. `docs/ISSUES.md` I-067 블록도 이 결과로 갱신했다.

### `i067-settings-archived-banner-check.png`도 같은 함정인지 별도 확인

팀장 지시로 이 파일도 재확인했다 — CREW의 `i067-crew-home-archived-after-fix.png`가
미반영 상태였던 전례가 있어 다른 스크린샷도 같은 함정에 걸렸을 가능성을 배제할 수 없었다.

같은 archived 픽스처 크루의 `/settings`를 재시작된 서버에서 다시 열어 `browser_find`로
직접 확인한 결과 배너("해산된 크루예요")와 편집 폼("저장" 버튼 2개, 색상·공개범위 등)이
**실제로 렌더되고 있음**을 확인했다. 새로 찍은 스크린샷의 MD5(`268c50683...`)가 기존
`i067-settings-archived-banner-check.png`와 **완전히 같았다** — 다만 이번엔 이것이
staleness 증거가 **아니다**: 이 라우트를 렌더하는 `(app)/crews/[crewId]/layout.tsx`는
이번 회차에 CREW가 수정한 파일이 아니다(수정 대상은 `CrewHomeContainer.tsx`뿐이었다) —
바뀌지 않은 파일이 두 시점에 같은 화면을 내는 것은 정상이다. 판단 기준은 파일 해시
일치 여부 자체가 아니라 "그 라우트가 이번에 바뀐 코드를 실제로 거치는가"였다 — 이
스크린샷은 거치지 않으므로 재촬영 없이 기존 파일을 그대로 유지한다(중복 파일을
새로 남기지 않았다).

## 픽스처 보존 여부

**브라우저 재검증이 끝났으므로 삭제 여부는 팀장 판단에 맡긴다** — 재검증 자체는 더 이상
이 픽스처에 의존하지 않는다. 다만 회차 마감 검증(`tsc --noEmit` 등)에서 archived 크루가
하나 더 있는 상태가 걸림돌이 되지 않는지는 팀장이 판단할 사안이다.
