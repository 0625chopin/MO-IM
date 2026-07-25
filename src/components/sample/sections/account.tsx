import { AlertTriangleIcon, Loader2Icon } from "lucide-react";

import { ProfileCard } from "@/components/profile/ProfileCard";
import { UserSearchField } from "@/components/profile/UserSearchField";
import { UserSearchResult } from "@/components/profile/UserSearchResult";
import { PreviewFrame } from "@/components/sample/PreviewFrame";
import { defineSection } from "@/components/sample/showcase-types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { strings, t } from "@/lib/strings";

/**
 * SC-19 계정 설정 + FR-006 핸들 검색(D-005, Task 015B). 실제 화면은 `/settings` —
 * `AccountSettingsContainer`가 `ProfileCard`·`ProfileEditForm`·`UserSearchField`를 조립한다.
 *
 * **`ProfileCard`는 실제 컴포넌트를 그대로 4번 렌더한다** — `status` prop 하나로 4상태를
 * 전부 표현하는 구조(`PageHeader`와 같은 패턴)라 정적 프리뷰를 손으로 다시 짤 필요가 없다.
 *
 * **`ProfileEditForm`은 정적 프리뷰다** — `auth.tsx`의 `SignupForm`과 같은 이유다. 이 화면의
 * 실제 Server Action(`updateAccountProfileAction`·`changeAccountHandleAction`)은 진짜
 * 로그인 세션(`getAuthSession()`)을 요구하는데 `/sample`은 게스트로 렌더되므로, 실제 컴포넌트를
 * 그대로 두면 항상 "로그인이 만료됐어요"만 뜬다 — 유용한 데모가 아니다. 그래서 같은 UI 원자·
 * 문구로 상태별 정적 모습만 보여준다(실제 저장·핸들 변경 인터랙션은 `/settings`에서 확인).
 *
 * **`UserSearchField`는 반대로 실제 컴포넌트를 그대로 등록한다** — 검색은 읽기 전용 조회라
 * 잘못 눌러도 부작용(리다이렉트·데이터 변경)이 없다.
 *
 * **정정(6일차 교차검증 W-4, BOARD)**: 이전 버전 이 주석은 "NFR-012가 v0.2 등급이라 Server
 * Action 자체의 인증 재검사를 넣지 않았다"고 적었는데, 그 인용이 틀렸다 — NFR-012가 v0.2로
 * 미루는 것은 **RLS(Supabase 정책) 구현**이지, 이미 있는 순수 함수(`checkPermission`)를 서버
 * 액션에서 호출하는 것까지 미뤄도 된다는 뜻이 아니다. `searchUserByHandleAction`은 이제
 * `search:by_handle`(매트릭스 `guest: deny`)을 실제로 검사한다(`lib/actions/
 * search-user-by-handle.ts` docstring 참고) — 라우트 가드(`/settings`)와 별개로, Server
 * Action은 그 페이지를 거치지 않고 직접 호출될 수 있기 때문이다.
 *
 * **그 결과 이 데모는 게스트로 렌더되는 `/sample`에서 어떤 핸들을 검색해도 "없음"이 뜬다** —
 * 이건 버그가 아니라 권한 검사가 실제로 작동한다는 증거다(미인증 호출은 "권한 없음"과
 * "결과 없음"을 구분하지 않고 똑같이 `{ found: false }`를 받는다, 위 액션 docstring 참고).
 *
 * **정정 2(6일차 교차검증 W-5, DESIGN)**: 그런데 "권한 검사가 작동한다는 증거"라는 설명이
 * "그러니 '찾음' 상태를 굳이 안 보여줘도 된다"로 읽히면 안 된다 — **권한 검사 동작 증명과
 * `UserSearchResult`(이 컴포넌트의 존재 이유인 아바타·표시 이름·핸들 카드) 시각 상태 시연은
 * 별개 목적**이다. `/sample`이 유일한 회귀 확인 지점(R-002)인데 "찾음" 카드가 네 패널 어디에도
 * 없으면 그 상태의 시각적 회귀를 잡을 수 없다. 그래서 `default` 패널 아래쪽에 **정적 예시**로
 * `<UserSearchResult result={{ found: true, ... }} />`를 함께 둔다 — `UserSearchResult`는
 * `result`를 props로만 받는 순수 표현 컴포넌트라(Server Action·세션 어디에도 의존하지 않는다)
 * 이 값을 직접 넘기는 것이 `empty` 패널이 이미 하던 것과 같은 방식이다. 새 상태 슬롯을 만들
 * 필요는 없다.
 *
 * **R-012 시연**: `UserSearchResult`의 "빈 상태" 패널은 `{ found: false }`를 직접 넘긴
 * 실제 컴포넌트다 — 핸들이 존재하지 않는 경우와 존재하지만 옵트아웃인 경우가 **코드 레벨에서
 * 이미 같은 값**이므로(`lib/rules/handle-search.ts`), 이 패널 하나가 두 시나리오를 동시에
 * 대표한다. "오류" 패널(429)은 **Task 038(18일차 BOARD)부터 실제로 카운팅하는 상태**의 정적
 * 재현이다 — `/sample`은 게스트 세션이라 `searchUserByHandleAction`을 20회 넘게 눌러도 권한
 * 검사(`search:by_handle` guest:deny)에서 먼저 막혀 실제 429를 재현할 수 없으므로, 여기서는
 * `UserSearchField`가 `rateLimited` 결과를 받았을 때 그리는 것과 같은 `Alert`을 정적으로
 * 보여준다(실제 429 재현은 로그인 세션에서 분당 21회 검색해 확인, `docs/decisions/
 * ops-foundation-038.md` 참고).
 */
export const accountSection = defineSection({
  id: "account",
  label: "계정",
  title: "계정 설정 · 사용자 검색",
  description:
    "FR-004·006(D-005, R-012). 실제 라우트는 /settings — 프로필 편집 폼은 정적 프리뷰(실제 인터랙션은 /settings에서 확인), 사용자 검색은 실제 컴포넌트를 그대로 등록했습니다. 검색 '오류'(429) 패널은 NFR-016(레이트 리밋, Task 038부터 실제 카운팅)이 게스트 세션인 /sample에서는 재현되지 않아 정적으로 보여주는 상태입니다.",
  items: [
    {
      name: "ProfileCard",
      note: "status prop 하나로 4상태를 표현합니다(PageHeader와 같은 패턴) — 손으로 다시 짠 정적 마크업이 아니라 실제 컴포넌트입니다.",
      panels: {
        default: (
          <PreviewFrame height={200}>
            <div className="p-4">
              <ProfileCard
                handle="seo_runs"
                displayName="서지훈"
                bio="주말마다 한강 러닝합니다."
                avatarUrl={null}
                searchOptOut={false}
              />
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <ProfileCard
                handle=""
                displayName=""
                bio={null}
                avatarUrl={null}
                searchOptOut={false}
                status="loading"
              />
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <ProfileCard
                handle=""
                displayName=""
                bio={null}
                avatarUrl={null}
                searchOptOut={false}
                status="empty"
              />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={140}>
            <div className="p-4">
              <ProfileCard
                handle=""
                displayName=""
                bio={null}
                avatarUrl={null}
                searchOptOut={false}
                status="error"
              />
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "ProfileEditForm",
      note: "핸들 변경 절은 30일 쿨다운(FR-004 AC1)이 있는 폼과 표시 이름·소개 폼이 서로 다른 Server Action입니다 — '오류' 패널은 쿨다운이 아직 안 풀린 상태를 보여줍니다. 핸들 중복 오류는 회원가입 폼(인증 섹션)의 handleTaken과 같은 FieldError 표현을 그대로 재사용합니다.",
      panels: {
        default: (
          <PreviewFrame height={560}>
            <div className="mx-auto w-full max-w-sm p-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sample-account-name">
                    {strings.account.settings.fields.displayName}
                  </FieldLabel>
                  <Input id="sample-account-name" defaultValue="서지훈" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sample-account-bio">{strings.account.settings.fields.bio}</FieldLabel>
                  <Textarea id="sample-account-bio" defaultValue="주말마다 한강 러닝합니다." />
                </Field>
                <Field orientation="horizontal">
                  <Checkbox id="sample-account-opt-out" />
                  <FieldContent>
                    <FieldLabel htmlFor="sample-account-opt-out">
                      {strings.account.settings.fields.searchOptOut}
                    </FieldLabel>
                    <FieldDescription>
                      {strings.account.settings.fields.searchOptOutDescription}
                    </FieldDescription>
                  </FieldContent>
                </Field>
              </FieldGroup>
              <Button className="mt-6 w-full">{strings.account.settings.submit}</Button>

              <FieldSeparator className="my-6" />

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sample-account-handle">
                    {strings.account.settings.handle.label}
                  </FieldLabel>
                  <Input id="sample-account-handle" defaultValue="seo_runs" />
                  <FieldDescription>{strings.account.settings.handle.description}</FieldDescription>
                </Field>
              </FieldGroup>
              <Button variant="outline" className="mt-4 w-full">
                {strings.account.settings.handle.submit}
              </Button>
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={200}>
            <div className="mx-auto flex w-full max-w-sm justify-center p-4">
              <Button disabled className="w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.account.settings.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={480}>
            <div className="mx-auto w-full max-w-sm p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                새로 가입해 아직 소개를 채우지 않은 상태입니다.
              </p>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sample-account-name-empty">
                    {strings.account.settings.fields.displayName}
                  </FieldLabel>
                  <Input id="sample-account-name-empty" defaultValue="김유나" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sample-account-bio-empty">
                    {strings.account.settings.fields.bio}
                  </FieldLabel>
                  <Textarea id="sample-account-bio-empty" placeholder={strings.account.settings.fields.bioPlaceholder} />
                </Field>
              </FieldGroup>
              <Button className="mt-6 w-full">{strings.account.settings.submit}</Button>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={280}>
            <div className="mx-auto w-full max-w-sm p-4">
              <FieldGroup>
                <Field data-disabled>
                  <FieldLabel htmlFor="sample-account-handle-err">
                    {strings.account.settings.handle.label}
                  </FieldLabel>
                  <Input id="sample-account-handle-err" defaultValue="seo_runs" disabled />
                  <FieldDescription>
                    {t((s) => s.account.settings.handle.lockedNotice, { date: "2026.08.15" })}
                  </FieldDescription>
                </Field>
              </FieldGroup>
              <Button variant="outline" disabled className="mt-4 w-full">
                {strings.account.settings.handle.submit}
              </Button>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "UserSearchField / UserSearchResult",
      note: "위 필드는 실제 컴포넌트라 게스트로 렌더되는 /sample에서는 무엇을 입력해도 '없음'만 뜹니다(search:by_handle이 guest:deny라 권한 검사가 실제로 작동한다는 증거입니다 — 로그인한 실제 '찾음' 상호작용은 /settings에서 확인하세요). '찾음' 모습 자체는 아래 정적 예시로 확인합니다. '빈 상태' 패널은 존재하지 않는 핸들과 옵트아웃된 핸들이 코드 레벨에서 이미 같은 값(R-012)이라는 것을 보여줍니다. '오류'(429)는 NFR-016(레이트 리밋)이 아직 구현되지 않은 미래 상태의 정적 미리보기입니다 — 실제로 카운팅하지 않습니다.",
      panels: {
        default: (
          <PreviewFrame height={360}>
            <div className="mx-auto flex w-full max-w-sm flex-col gap-4 p-4">
              <UserSearchField />
              <div className="flex flex-col gap-1.5 border-t border-border pt-4">
                <p className="text-xs text-muted-foreground">
                  정적 예시 — 로그인 상태에서 seo_runs를 검색하면 실제로 이렇게 보입니다.
                </p>
                <UserSearchResult
                  result={{ found: true, handle: "seo_runs", displayName: "서지훈", avatarUrl: null }}
                />
              </div>
            </div>
          </PreviewFrame>
        ),
        loading: (
          <PreviewFrame height={160}>
            <div className="mx-auto w-full max-w-sm p-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="sample-search-loading">{strings.account.search.fields.handle}</FieldLabel>
                  <Input id="sample-search-loading" defaultValue="seo_runs" disabled />
                </Field>
              </FieldGroup>
              <Button disabled className="mt-3 w-full">
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                {strings.account.search.submitPending}
              </Button>
            </div>
          </PreviewFrame>
        ),
        empty: (
          <PreviewFrame height={140}>
            <div className="mx-auto w-full max-w-sm p-4">
              <UserSearchResult result={{ found: false }} />
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={160}>
            <div className="mx-auto w-full max-w-sm p-4">
              <Alert variant="destructive">
                <AlertTriangleIcon aria-hidden="true" />
                <AlertDescription>{strings.account.search.rateLimited}</AlertDescription>
              </Alert>
            </div>
          </PreviewFrame>
        ),
      },
    },
    {
      name: "AccountWithdrawSection",
      note: "FR-005 회원 탈퇴(D-010, Task 039). 실제 라우트는 /settings 맨 아래 — 실제 컴포넌트를 그대로 렌더하면 다이얼로그 제출이 진짜 Server Action(계정 탈퇴)을 호출하므로, SignupForm과 같은 이유로 정적 프리뷰만 둔다. '오류' 패널은 AC1(오너로 있는 크루 보유 시 차단)입니다.",
      panels: {
        default: (
          <PreviewFrame height={160}>
            <div className="mx-auto w-full max-w-sm p-4">
              <div className="flex flex-col gap-3 border-t border-border pt-6">
                <div>
                  <h2 className="text-sm font-medium text-foreground">{strings.account.settings.withdraw.heading}</h2>
                  <p className="text-sm text-muted-foreground">{strings.account.settings.withdraw.description}</p>
                </div>
                <Button type="button" variant="destructive" className="w-fit">
                  {strings.account.settings.withdraw.confirmDialog.submit}
                </Button>
              </div>
            </div>
          </PreviewFrame>
        ),
        /** minor 1(팀장 지적, 18일차) — 탈퇴는 서버 왕복이 있는 파괴적 동작이라 제출 중
         *  구간에 버튼이 재클릭 가능한 상태로 남으면 이중 제출 위험이 있다. 실제
         *  `AccountWithdrawSection`은 `isPending`일 때 제출 버튼을 비활성화하고 스피너를
         *  보여준다 — 이 패널은 다이얼로그가 열린 채 그 상태를 보여준다(빈 상태는 폼에
         *  의미가 없다는 기존 관례 그대로 두지 않는다). */
        loading: (
          <PreviewFrame height={320}>
            <div className="mx-auto w-full max-w-sm p-4">
              <div className="flex flex-col gap-4 rounded-xl bg-popover p-4 text-sm ring-1 ring-foreground/10">
                <div>
                  <p className="font-medium text-foreground">
                    {strings.account.settings.withdraw.confirmDialog.title}
                  </p>
                  <p className="text-muted-foreground">
                    {strings.account.settings.withdraw.confirmDialog.description}
                  </p>
                </div>
                <Field>
                  <FieldLabel htmlFor="sample-withdraw-password">
                    {strings.account.settings.withdraw.confirmDialog.passwordLabel}
                  </FieldLabel>
                  <Input id="sample-withdraw-password" type="password" disabled defaultValue="••••••••" />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" disabled>
                    {strings.account.settings.withdraw.confirmDialog.cancel}
                  </Button>
                  <Button type="button" variant="destructive" disabled>
                    <Loader2Icon aria-hidden="true" className="animate-spin" />
                    {strings.account.settings.withdraw.confirmDialog.submitPending}
                  </Button>
                </div>
              </div>
            </div>
          </PreviewFrame>
        ),
        error: (
          <PreviewFrame height={220}>
            <div className="mx-auto w-full max-w-sm p-4">
              <div className="flex flex-col gap-3 border-t border-border pt-6">
                <div>
                  <h2 className="text-sm font-medium text-foreground">{strings.account.settings.withdraw.heading}</h2>
                  <p className="text-sm text-muted-foreground">{strings.account.settings.withdraw.description}</p>
                </div>
                <Alert>
                  <AlertTriangleIcon aria-hidden="true" />
                  <AlertDescription className="flex flex-col gap-2">
                    <span className="font-medium text-foreground">
                      {strings.account.settings.withdraw.blockedByOwnership.title}
                    </span>
                    <span>{strings.account.settings.withdraw.blockedByOwnership.description}</span>
                    <ul className="flex flex-col gap-1">
                      <li>
                        <span className="font-medium text-foreground underline underline-offset-4">
                          주말 러닝 크루
                        </span>
                      </li>
                    </ul>
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </PreviewFrame>
        ),
      },
    },
  ],
});
