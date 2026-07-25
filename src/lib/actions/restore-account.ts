"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { restoreOwnAccount } from "@/lib/auth";
import { strings } from "@/lib/strings";

/**
 * FR-005 AC3 — `/account/restore`가 `useActionState(restoreAccountAction, ...)`로 건다.
 * 비밀번호 재확인은 두지 않는다 — 이 화면에 도달했다는 사실 자체가 이미 유효한 Supabase Auth
 * 세션(로그인 성공)을 전제하므로, 탈퇴(파괴적 행위)와 달리 복구(원상 복구)에 같은 마찰을 둘
 * 이유가 약하다고 판단했다(FR-005 원문도 복구에 재인증을 요구하지 않는다).
 *
 * 성공하면 `/home`으로 보낸다 — `restore_deactivated_account`가 이미 `status`를 `active`로
 * 되돌려 뒀으므로 다음 `getAuthSession()` 호출은 정상 `authenticated`를 반환한다.
 *
 * **정정(19일차, I-061 — DESIGN 실측·팀장 확인)**: 원래 `redirect("/home")`만 호출하고
 * `refresh()`를 호출하지 않았다 — CLAUDE.md "쓰기 후 갱신은 Server Action + `refresh()`
 * 패턴"과 어긋난 배선이었다. 증상: 복구 후 `/home` 본문(서버 컴포넌트가 매번 새로 조회)은
 * 정상 인증 데이터를 보여주는데, 같은 렌더 트리를 공유하는 헤더(`HeaderNav`)는 이전 게스트
 * 상태의 클라이언트 라우터 캐시를 그대로 재사용해 로그아웃 상태로 보였다 — 주소창 재로드하면
 * 정상 갱신됐다(전형적인 클라이언트 라우터 캐시 잔존 증상). **근본 원인은 호출 순서였다** —
 * `redirect()`는 내부적으로 예외를 던져 렌더를 즉시 종료시키므로(`next/dist/docs/01-app/
 * 03-api-reference/04-functions/redirect.md`), `redirect()` **다음**에 `refresh()`를
 * 두면 그 줄은 영영 실행되지 않는다. `node_modules/next/dist/docs/01-app/03-api-reference/
 * 04-functions/refresh.md`와 `01-app/01-getting-started/07-mutating-data.md` "Redirect
 * after a mutation" 예시 모두 `revalidatePath`/`refresh` 계열 호출을 `redirect()` **이전**에
 * 둔다 — 그 순서를 그대로 따라 고쳤다(아래).
 */
export interface RestoreAccountState {
  status: "idle" | "error";
  errorMessage?: string;
}

export async function restoreAccountAction(
  // useActionState의 액션 시그니처(prevState, formData)를 맞추기 위한 자리다 — 이 액션은
  // 폼 필드를 쓰지 않는다(모듈 docstring 참고, 비밀번호 재확인을 두지 않기로 한 결정).
  _prevState: RestoreAccountState,
  formData: FormData,
): Promise<RestoreAccountState> {
  void formData;
  const result = await restoreOwnAccount();
  if (!result.ok) {
    if (result.reason === "grace_expired") {
      return { status: "error", errorMessage: strings.account.restore.errors.graceExpired };
    }
    if (result.reason === "not_deactivated") {
      return { status: "error", errorMessage: strings.account.restore.errors.notDeactivated };
    }
    return { status: "error", errorMessage: strings.account.restore.errors.unknown };
  }

  refresh();
  redirect("/home");
}
