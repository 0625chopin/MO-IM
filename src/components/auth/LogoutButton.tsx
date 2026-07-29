"use client";

import { Loader2Icon, LogOutIcon } from "lucide-react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { logoutAction } from "@/lib/actions/logout";
import { strings } from "@/lib/strings";

import type { ComponentProps } from "react";

/**
 * FR-002 로그아웃 버튼. `logoutAction`(세션 폐기 → `/` 리다이렉트)을 거는 폼 하나가 전부다 —
 * 클라이언트 상태도, 확인 다이얼로그도 두지 않는다. 되돌리는 비용이 "다시 로그인"뿐이라
 * `AccountWithdrawSection`(탈퇴)처럼 비밀번호 재확인을 요구할 근거가 없다.
 *
 * **왜 별도 컴포넌트인가**: 지금까지 로그아웃 UI는 `HeaderNav`에 인라인 `<form>`으로만 있었는데,
 * 그 자리는 계정 내비(`hidden md:flex`) 안이다. `AppShell`이 앱을 `max-w-app`(430px) 프레임에
 * 묶고 `globals.css`가 `md:`를 **뷰포트가 아니라 그 프레임 폭** 기준(48rem)으로 재정의해 뒀으므로
 * — 430px는 48rem에 영원히 닿지 않는다 — 그 계정 내비는 어떤 화면 크기에서도 켜지지 않는다.
 * 즉 로그아웃 버튼은 코드에 있었지만 실제로는 어디에도 렌더되지 않았다. 이 컴포넌트로 뽑아
 * `/settings`(모바일 탭바의 계정 진입점) 안에도 같은 버튼을 세워 그 구멍을 막는다.
 *
 * **(23일차 정정, I-099·D-066)**: 이 문단은 원래 "헤더 쪽은 프레임이 넓어지면 자동으로 다시
 * 보이므로 제거하지 않고 그대로 이 컴포넌트로 교체했다"고 적었었다 — 그 "넓어지면"이 실제로
 * 일어날 변화라는 전제였다. 팀장 판정(D-066)은 프레임을 태블릿 폭으로 넓히는 안을 **기각**하고
 * "항상 430px 모바일 프레임"을 확정했으므로, 헤더 쪽 로그아웃 자리는 당장 켜질 계획이 없는
 * **영구 휴면 코드**다. 그런데도 지우지 않은 이유는 여전히 유효하다 — `HeaderNav`가 이미 같은
 * 공용 컴포넌트로 교체돼 있어(위 문단) 유지비가 0에 가깝고, 프레임 정책이 다음에 또 바뀌어도
 * (`HeaderNav.tsx`의 `accountNav` 주석 참고) 코드 변경 없이 그대로 살아난다.
 *
 * pending 표시에 `useActionState`가 아니라 `useFormStatus`를 쓴다 — `logoutAction`은 성공 시
 * `redirect()`로 끝나 돌아올 상태(state)가 없고, 필요한 것은 "제출 중" 한 비트뿐이다.
 */
export function LogoutButton({
  variant = "outline",
  size = "default",
  className,
  formClassName,
}: {
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  /** 버튼 자체에 붙는 클래스. 헤더처럼 내비 링크와 톤을 맞춰야 할 때 쓴다. */
  className?: string;
  /** 감싸는 `<form>`에 붙는 클래스. 폼이 레이아웃 흐름에 끼어드는 자리(flex 행)에서 쓴다. */
  formClassName?: string;
}) {
  return (
    <form action={logoutAction} className={formClassName}>
      <LogoutSubmitButton variant={variant} size={size} className={className} />
    </form>
  );
}

/**
 * `useFormStatus`는 **감싸는 `<form>`의 자식**에서만 상태를 읽는다(같은 컴포넌트 안에서 폼을
 * 렌더하면서 호출하면 항상 `pending: false`다) — 그래서 제출 버튼만 따로 분리했다.
 */
function LogoutSubmitButton({
  variant,
  size,
  className,
}: {
  variant: ComponentProps<typeof Button>["variant"];
  size: ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending}>
      {pending ? (
        <Loader2Icon aria-hidden="true" className="animate-spin" />
      ) : (
        <LogOutIcon aria-hidden="true" />
      )}
      {pending ? strings.auth.logoutPending : strings.auth.logout}
    </Button>
  );
}
