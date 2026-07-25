import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabasePublicEnv } from "./env";

import type { Database } from "./database.types";

/**
 * 서버 컴포넌트·Server Action·Route Handler에서 쓰는 Supabase 클라이언트 팩터리.
 * Next.js 16의 `cookies()`는 비동기라 이 함수도 비동기다.
 *
 * Server Component에서 `setAll`이 실패하는 것은 정상이다 — Server Component는 쿠키를
 * 쓸 수 없고, 세션 갱신은 인증 경계(레이아웃, D-030 ④)가 맡는다.
 *
 * `Database` 제네릭은 Task 028(스키마 마이그레이션) 산출물인 `database.types.ts`에서 온다 —
 * `.from("...")` 호출의 테이블명·컬럼이 실제 스키마와 어긋나면 타입 오류로 잡힌다.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component에서 호출된 경우 — 세션 갱신은 인증 경계가 담당한다.
        }
      },
    },
  });
}
