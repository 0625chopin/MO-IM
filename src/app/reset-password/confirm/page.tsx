import { ConfirmPasswordResetFormContainer } from "@/components/auth/ConfirmPasswordResetFormContainer";

/**
 * FR-003 새 비밀번호 설정 화면(Task 039) — `/auth/confirm?type=recovery&next=/reset-password/confirm`
 * 토큰 교환이 성공한 뒤 도착하는 목적지. 이 페이지는 게스트 전용 4개 목록에 없는 다섯 번째
 * 자기 가드 페이지다(`/auth/confirm/route.ts` docstring과 같은 이유) — 다만 "이미 로그인했으면
 * 다른 곳으로" 반대 방향 가드는 **의도적으로 두지 않는다**: 이 화면에 도달한 사용자는 방금
 * `/auth/confirm`이 발급한 **임시 recovery 세션**으로 `isAuthenticated`가 true가 되므로, 다른
 * 게스트 페이지와 같은 가드를 걸면 정작 필요한 사람이 `/home`으로 튕겨 나간다 — 이 화면의
 * 목적 자체가 "이미(임시로) 로그인된 상태에서 비밀번호를 바꾸는 것"이다.
 */
export default function ResetPasswordConfirmPage() {
  return <ConfirmPasswordResetFormContainer />;
}
