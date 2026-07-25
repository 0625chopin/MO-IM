import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "./env";

import type { Database } from "./database.types";

/**
 * 브라우저(클라이언트 컴포넌트·`src/lib/realtime/broadcast.ts`)에서 쓰는 Supabase 클라이언트 팩터리.
 * `Database` 제네릭은 Task 028 산출물 `database.types.ts`를 연결한다(server.ts와 동일 근거).
 */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabasePublicEnv();

  return createBrowserClient<Database>(url, publishableKey);
}
