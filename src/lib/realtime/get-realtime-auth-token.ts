"use server";

import { createSupabaseServerClient } from "@/lib/data/supabase/server";

/**
 * Realtime Authorization 전용 액세스 토큰 조회 — Task 033.
 *
 * **왜 필요한가**: 이 앱의 세션은 httpOnly 쿠키에 있다(NFR-010, Task 030 `auth-integration-030.md`
 * §4) — `createSupabaseServerClient()`가 `cookieOptions: { httpOnly: true }`로 세션 쿠키를 쓴다.
 * `createSupabaseBrowserClient()`(브라우저 쪽)는 `document.cookie`로 쿠키를 읽는데, httpOnly
 * 쿠키는 정의상 JS에서 아예 보이지 않는다 — 즉 브라우저 클라이언트의 `auth.getSession()`은
 * **설계대로** 항상 빈 세션을 반환한다. 반면 Supabase Realtime Authorization(사설 채널)은
 * 클라이언트가 JWT를 직접 쥐고 `channel.subscribe()` 전에 `realtime.setAuth(token)`을 불러야만
 * 성립하는 구조라(Supabase 공식 문서, 029B §1 인용) — 브라우저가 토큰을 전혀 모르면 사설 채널을
 * 열 수 없다. httpOnly와 Realtime Authorization은 이 지점에서 정면으로 부딪힌다.
 *
 * **해소 방법과 노출면 판단**: 쿠키를 읽을 수 있는 쪽(서버)이 이 Server Action으로 현재 세션의
 * `access_token`만 최소 범위로 넘긴다. 브라우저는 이 값을 어떤 저장소(localStorage·비-httpOnly
 * 쿠키 등)에도 쓰지 않고 `realtime.setAuth()` 호출에만 즉시 소비한다(`broadcast.ts`) — 페이지를
 * 새로고침하면 이 값은 남지 않는다. NFR-010이 막으려던 것은 "주입된 스크립트가 `document.cookie`
 * 를 읽어 세션을 통째로 훔쳐 영속시키는 것"이었고, 이 경로는 이미 인증된 그 브라우저 자신에게
 * (다른 Server Action이 이미 하는 것과 동일한 신뢰 경계 안에서) 실시간 채널을 열 목적으로만
 * 토큰을 건네는 것이라 노출면이 다르다 — `docs/decisions/realtime-broadcast-033.md` §5에 판단
 * 근거를 남긴다(신규 결정, 승인 시 prioritization-and-risks.md D-*로 등재).
 *
 * `getUser()`(서버 재검증)가 아니라 `getSession()`을 쓰는 이유: 여기서 필요한 건 검증된
 * 사용자 신원이 아니라 그 신원을 실어 나르는 **원본 JWT 문자열**이다 — Supabase의 Realtime
 * Authorization 공식 예제도 이 지점에서 `getSession()`을 쓴다.
 */
export async function getRealtimeAuthTokenAction(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return null;
  return data.session.access_token;
}
