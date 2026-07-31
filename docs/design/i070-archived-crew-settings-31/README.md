# I-070 잔여 실측 — archived 크루 설정 폼의 도메인 오류 노출 (31일차, CREW)

## 배경

I-070은 20일차(CORE)에 `src/lib/data/supabase/crew.ts`의 `updateCrewInfo`·`updateCrewVisibility`가
`if (error) throw error`에서 `return err("forbidden", error.message)`로 바뀌며 데이터 계층은
"해결됨"으로 닫혔다. 다만 그 `forbidden`이 `CrewSettingsContainer` → `useActionState` → 폼을
거쳐 사용자에게 실제로 어떤 문구로 보이는지는 브라우저 실측이 한 번도 없었다(`docs/ISSUES.md`
I-070 블록 "후속(적용, 20일차 CORE)" 절이 스스로 이 잔여를 남겨 뒀다). 30일차 CREW가 I-067
검증 중 "archived 크루의 설정 폼이 편집 가능한 채로 열린다"는 사실을 확인하고 D-030 ③ 대상으로
남겼다 — 이번 회차가 그 끝을 본다.

## 실측 대상

- 픽스처 크루: `2724533e-9e02-4609-8ad3-88becec6fe24`("I-067 검증용 archived 픽스처 크루",
  `status='archived'`, `visibility='public'`, 오너 `fb70ff1c-…`)
- 로그인 계정: `0625chopin@gmail.com`(핸들 `chopin_0625`) — 위 크루의 **오너**, 실측 전 SQL로
  멤버십(`crew_memberships.status='active', role='owner'`)까지 확인했다.
- 대조군(회귀 확인 전용, 쓰기 없이 GET만): `729ced18-2016-459a-94c3-e7959dfe808c`("Task036
  검증용 테스트 크루", `status='active'`) — 절대 archived로 만들지 말라는 지시대로 조회만 했다.

## 도중에 발견한 것 — I-135 재발(진짜 버그 아님)

크루 홈(`/crews/<id>`)은 정상 200을 반환하며 `ArchivedCrewBanner`까지 잘 뜨는데, 같은
크루의 `/crews/<id>/settings`·`/members`(둘 다 `(app)/crews/[crewId]/layout.tsx` 하위)는
`getCrewById`가 크루를 찾지 못한 것처럼 **404**를 반환했다. 코드·RLS·DB 어느 쪽에도 원인이
없었고(직접 SQL로 크루·멤버십 존재 확인 완료), `.next` 캐시를 지우고 dev 서버를 재시작하자
즉시 정상 200으로 돌아왔다 — 이번 회차 안내가 경고한 **I-135**(WSL2 `/mnt/e` 경로 Turbopack
캐시 문제)가 코드 변경 없이도 라우트별로 재발할 수 있다는 사례다. 코드 결함이 아니므로 이
문서에서는 사실만 기록하고 별도 이슈로 새로 등재하지 않는다(기존 I-135 범위 안).

## 실측 결과 — 세 갈래 중 (b)

오너 계정으로 크루 정보(이름)와 공개 범위 둘 다 수정을 시도했다. 데이터는 트리거
(`crews_guard_archived_immutable`)가 그대로 막아 DB에는 변경이 반영되지 않았다(SQL로 재확인).
다만 화면에는 **사람이 읽을 수 있는 도메인 오류("이 크루는 보관되어 수정할 수 없어요" 같은
문구)가 아니라 범용 실패 문구**만 떴다:

- 정보 폼: "저장하지 못했어요. 다시 시도해 주세요."(`strings.crew.settings.info.errors.failed`)
- 공개 범위 폼: "변경하지 못했어요. 다시 시도해 주세요."(`strings.crew.settings.visibility.errors.failed`)

원인은 `updateCrewInfoAction`/`updateCrewVisibilityAction`(Server Action)이 `!result.ok`
분기에서 `result`가 실어 온 실제 사유(`error.message`, SQL 트리거 메시지)를 버리고 고정
문자열만 반환하기 때문이다 — 이 부분 자체는 이번 회차에 고치지 않았다(아래 "고치지 않은 것"
참고).

## 판정과 최소 수정

세 갈래 판정: **(b)** — 범용 실패 문구만 뜬다. 그리고 30일차에 이미 "폼이 편집 가능한 것 자체가
D-030 ③ 위반"이라고 남겨 둔 판단이 있어, 문구를 정교화하는 대신 **애초에 저장이 불가능한 상황에서
편집 가능한 폼을 열어 주지 않는 쪽**을 택했다.

새 UI 패턴은 만들지 않았다. 이 라우트에는 이미 레이아웃이 띄우는 `ArchivedCrewBanner`가 있고,
같은 성격의 쓰기 전용 라우트(`/board/new`, `PostWriteContainer`, Task 040)가 이미 "크루가
`active`가 아니면 `RouteErrorBoundary(kind="forbidden")`를 값으로 반환해 폼을 그리지 않는다"는
패턴을 쓰고 있었다. `CrewSettingsContainer`도 바로 위에서 `crew:update_info` 거부를 같은 방식
(`RouteErrorBoundary kind="forbidden"`)으로 처리하고 있어, `crew.status !== "active"` 조건을
그 직후에 같은 방식으로 추가했다 — 새 컴포넌트·새 오류 종류·새 문자열 없이 기존 분기 하나를
늘린 것뿐이다. 크루 설정 페이지의 세 폼(정보 수정·공개 범위·해산) 전부가 쓰기 전용이라 이
분류가 그대로 맞는다 — 해산은 이미 archived된 크루에서는 어차피 의미가 없다.

문구 트레이드오프도 `PostWriteContainer` 전례를 그대로 따른다: `RouteErrorBoundary
kind="forbidden"`의 문구("접근 권한이 없어요 / 이 크루의 크루원만 볼 수 있어요")는 "archived라서
막혔다"는 실제 사유와 정확히 들어맞지 않는다 — 하지만 바로 위 레이아웃의 `ArchivedCrewBanner`가
실제 사유("해산되어… 제한됩니다")를 이미 안내하고, 이 트레이드오프는 이미 20일차 팀장 지시로
같은 성격의 라우트에 적용된 전례라 이번에 새로 만든 문제가 아니다.

수정 파일: `src/components/crews/CrewSettingsContainer.tsx`(조건 1개 추가 + docstring).

## 검증

- `npx tsc --noEmit`, `npx eslint src/components/crews/CrewSettingsContainer.tsx` 모두 clean.
- **I-135 재발 방지 규율을 지켰다**: 코드 수정 후 dev 서버 프로세스를 완전히 죽이고
  (`.next` 캐시 재삭제 포함) 재기동한 뒤에만 재촬영했다. 스크린샷 5장의 MD5가 전부 다르다
  (`md5sum *.png` 확인 — 표 참고).
- 활성 크루(`729ced18-…`) 설정 화면은 **GET 조회만** 하고 아무 것도 저장하지 않았다 — 폼이
  수정 전과 동일하게 정상 렌더됨을 확인해 회귀가 없음을 확인했다.
- 두 픽스처 크루 모두 이 세션이 끝난 시점에 원래 상태 그대로다(`2724533e-…`는 여전히
  `archived`/`public`/이름 원본, `729ced18-…`는 여전히 `active`/`public`/이름 원본) — SQL로
  재확인했다.

## 스크린샷 (5장, 본문 참조 1:1)

1. `01-before-editable-form.png`(MD5 `268c50683dbe2f587367d34fa8241187`) — **수정 전.**
   archived 픽스처 크루의 `/settings`. 배너("해산된 크루예요")는 뜨지만 그 아래 정보 수정
   폼·공개 범위 폼·해산 버튼이 전부 정상 활성 상태로 열려 있다(30일차에 사실로 확인된 것과
   동일).
2. `02-before-generic-error.png`(MD5 `327e4de74fb40dd9a91049af83747a85`) — **수정 전.**
   크루명을 바꾸고 저장을 누른 직후. "저장하지 못했어요. 다시 시도해 주세요."라는 범용
   문구만 뜬다(archived라는 언급 없음).
3. `03-before-visibility-generic-error.png`(MD5 `61ac63fb757404c5a7fdd812a19b1b23`) —
   **수정 전.** 공개 범위를 "비공개"로 바꾸고 저장을 누른 직후. "변경하지 못했어요. 다시
   시도해 주세요."라는 범용 문구만 뜬다(위 정보 폼의 실패 문구도 화면에 함께 남아 있다 —
   같은 세션에서 두 폼을 순서대로 시도한 결과).
4. `04-after-fix-form-blocked.png`(MD5 `1645c330333561c6b5d1c48722eef62b`) — **수정 후**
   (dev 서버 재기동 뒤 재촬영). 같은 크루의 `/settings`. 배너 아래로 정보·공개 범위·해산
   폼이 아예 렌더되지 않고 `RouteErrorBoundary(kind="forbidden")`("접근 권한이 없어요 /
   이 크루의 크루원만 볼 수 있어요" + "홈으로 가기")가 대신 뜬다 — 저장을 시도할 수 있는
   상태 자체가 사라졌다.
5. `05-after-fix-active-crew-regression-check.png`(MD5 `fe4c19f6b47761e6b6058d2ead538725`) —
   **회귀 확인**(수정 후, 대조군). `active` 상태인 다른 크루(`729ced18-…`)의 `/settings`는
   배너 없이 정보·공개 범위·해산 폼이 이전과 동일하게 정상 렌더된다 — 이 수정이 활성
   크루에 영향을 주지 않았다는 증거.

다섯 MD5가 서로 전부 다르다는 것은 각 스크린샷이 실제로 서로 다른 렌더 상태를 찍었다는
뜻이다(I-135처럼 수정 전 화면이 재사용됐다면 04·05가 01과 같은 MD5를 가졌을 것이다).

## 고치지 않은 것 (다음 회차로 넘김)

- **`updateCrewInfoAction`/`updateCrewVisibilityAction`의 범용 실패 문구 자체는 그대로 둔다.**
  이번 수정으로 archived 경로는 아예 그 코드에 도달하지 않게 됐지만, 이 두 액션은 여전히
  "다른 이유(네트워크·동시 수정 등)로 `result.ok`가 false인 모든 경우"에 같은 범용 문구를
  쓴다 — 그 범위가 이번 이슈(archived 전용)보다 넓어 손대지 않았다. 필요하면 별도 이슈로
  다룬다.
- **`RouteErrorBoundary(kind="forbidden")`의 문구가 "archived라서 막혔다"는 사유를 직접
  말하지 않는 것**도 고치지 않았다 — `PostWriteContainer` 전례와 동일한 트레이드오프를
  그대로 따랐다(위 "판정과 최소 수정" 절 참고). 전용 `kind`(예: `archived`)를 새로 만드는
  것은 이번 회차의 "새 패턴 발명 금지" 지시와 충돌해 보류했다.
- **DisbandCrewForm이 archived 크루에서 어떻게 동작하는지는 이번 수정으로 도달 경로 자체가
  사라져 실측하지 않았다**(이미 렌더되지 않는다) — `disband_crew` RPC의 `already_disbanded`
  분기가 있다는 것은 코드로만 확인했고 브라우저 클릭 실측은 이번 범위 밖이다.
