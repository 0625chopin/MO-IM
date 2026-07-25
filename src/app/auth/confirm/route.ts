import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";

import { verifyEmailOtp, type EmailConfirmType } from "@/lib/auth";
import { sanitizeRedirectTarget } from "@/lib/rules/auth-credentials";

/**
 * PKCE 토큰 교환 엔드포인트(Task 039, FR-003) — Supabase 공식 Next.js 패턴을 그대로 따른다
 * (`mcp__supabase__search_docs`로 조회한 "Password-based Auth" 가이드 "PKCE flow" 절,
 * `app/auth/confirm/route.ts` 예시와 동일 구조). 가입 확인(`type=signup`)과 비밀번호 재설정
 * (`type=recovery`) **둘 다 이 라우트 하나를 공유한다** — 두 흐름 모두 "이메일 링크 클릭 →
 * token_hash 교환 → 세션 발급 → next로 리다이렉트"라는 동일한 뼈대이기 때문이다.
 *
 * **이 파일이 생기기 전에는 가입 확인 이메일 링크를 눌러도 세션이 발급되지 않았다** —
 * Task 030(17일차)이 이메일 발송 자체가 막혀(§3, `docs/decisions/auth-integration-030.md`)
 * 이 결손을 발견하지 못하고 넘어갔다. FR-003이 이 라우트를 요구해서 만들었지만, 결과적으로
 * FR-001(가입 확인)의 누락도 함께 메운다 — 범위는 FR-003이고 부수 효과로 적어 둔다.
 *
 * **`src/app/auth/confirm/`은 D-030 ④ 게스트 전용 진입 페이지 4개(랜딩·로그인·회원가입·온보딩)
 * 목록에 없는 다섯 번째 경로다.** 그 넷은 "페이지"이고 이건 "API 엔드포인트"라 성격이 달라
 * `docs/CONVENTIONS.md`의 그 목록(고정된 4개)과 모순되지 않는다 — 목록은 게스트 전용 *화면*
 * 얘기다. `(app)/` 그룹 밖에 두는 이유는 동일하게 인증 여부와 무관하게(오히려 아직 인증되지
 * 않은 상태에서) 호출돼야 하기 때문이다.
 *
 * `next`는 클라이언트가 통제 가능한 값이 아니라 **Supabase 대시보드의 이메일 템플릿**이
 * 채운다(운영자 설정, `docs/decisions/account-lifecycle-039.md` 참고) — 그래도 방어적으로
 * `sanitizeRedirectTarget`(오픈 리다이렉트 방어, `lib/rules/auth-credentials.ts`)을 한 번 더
 * 거친다. 이메일 발송 경로가 이미 신뢰할 수 있는 채널이라는 가정에 기대지 않는다.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = sanitizeRedirectTarget(searchParams.get("next") ?? "");

  if (tokenHash && (type === "signup" || type === "recovery")) {
    const result = await verifyEmailOtp(type as EmailConfirmType, tokenHash);
    if (result.ok) {
      redirect(next);
    }
  }

  return NextResponse.redirect(new URL("/auth/confirm-error", request.url));
}
