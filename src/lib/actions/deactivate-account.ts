"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { deactivateOwnAccount, reauthenticateWithPassword } from "@/lib/auth";
import { strings } from "@/lib/strings";

/**
 * FR-005 정상 흐름 ③~④ — 계정 설정 화면의 탈퇴 다이얼로그가
 * `useActionState(deactivateAccountAction, ...)`로 건다.
 *
 * **비밀번호 재확인(③)을 이 액션이 직접 수행한다** — `reauthenticateWithPassword`가 현재
 * 세션의 이메일로 `signInWithPassword`를 다시 호출해 자격 증명을 검증한다. 이 단계를
 * 통과해야만 `request_account_deactivation` RPC(④)를 호출한다 — RPC 자신은 비밀번호를
 * 모른다(`auth.uid()`만 신뢰), 재확인은 애플리케이션 계층의 책임이다(RPC 함수 docstring 참고).
 *
 * **AC1(오너 크루 차단)은 RPC가 최종 판정한다** — `owns_active_crew` reason을 그대로
 * 사용자에게 보여준다. 어떤 크루인지 나열하는 것은 이 액션의 몫이 아니다(컨테이너가
 * `listCrewsByProfile`로 이미 렌더해 둔 목록을 그대로 쓴다, `AccountWithdrawSection` 참고) —
 * 이 액션은 차단 여부만 판정해 반환한다.
 *
 * 성공하면 `/account/restore`로 보낸다 — 탈퇴 직후에도 Supabase Auth 세션 자체는 유효하므로
 * (30일 유예, 로그인은 계속 가능) `(app)/layout.tsx`를 다시 거치면 어차피 그리로 리다이렉트된다
 * (`get-auth-session.ts`의 `reason:"deactivated"` 분기) — 여기서 먼저 보내 왕복을 줄인다.
 *
 * **정정(19일차, I-061 점검 중 발견·수정)**: `restore-account.ts`와 같은 결함이 여기도
 * 있었다 — `redirect()` 앞에 `refresh()`가 없었다. `redirect()`는 예외를 던져 렌더를
 * 즉시 종료시키므로 `refresh()`는 반드시 **그 이전**에 호출해야 한다(`next/dist/docs/
 * 01-app/03-api-reference/04-functions/refresh.md`). 이 액션은 DESIGN 실측에서 증상이
 * 직접 관찰되지는 않았지만("목적지 페이지가 매번 서버에서 세션을 다시 읽어 드러나지
 * 않았다"), 증상이 없다는 것이 배선이 옳다는 뜻은 아니다 — 헤더 등 공유 레이아웃 세그먼트가
 * 클라이언트 라우터 캐시를 재사용하는 조건에서는 여기서도 같은 증상이 재현될 수 있어
 * 함께 고쳤다.
 */
export interface DeactivateAccountState {
  status: "idle" | "error";
  errorMessage?: string;
}

export async function deactivateAccountAction(
  _prevState: DeactivateAccountState,
  formData: FormData,
): Promise<DeactivateAccountState> {
  const password = String(formData.get("password") ?? "");
  if (password.length === 0) {
    return { status: "error", errorMessage: strings.account.settings.withdraw.errors.incorrectPassword };
  }

  const reauth = await reauthenticateWithPassword(password);
  if (!reauth.ok) {
    return { status: "error", errorMessage: strings.account.settings.withdraw.errors.incorrectPassword };
  }

  const result = await deactivateOwnAccount();
  if (!result.ok) {
    if (result.reason === "owns_active_crew") {
      return { status: "error", errorMessage: strings.account.settings.withdraw.errors.ownsActiveCrew };
    }
    return { status: "error", errorMessage: strings.account.settings.withdraw.errors.unknown };
  }

  refresh();
  redirect("/account/restore");
}
