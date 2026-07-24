import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicEnv } from "./env";

/** 브라우저(클라이언트 컴포넌트·`src/lib/realtime/broadcast.ts`)에서 쓰는 Supabase 클라이언트 팩터리. */
export function createSupabaseBrowserClient() {
  const { url, publishableKey } = getSupabasePublicEnv();

  return createBrowserClient(url, publishableKey);
}
