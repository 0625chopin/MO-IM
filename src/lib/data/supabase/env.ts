const NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} 환경변수가 설정되지 않았다 — .env.local을 확인한다.`);
  }
  return value;
}

/** `src/lib/data/supabase/server.ts`·`client.ts`가 공유하는 공개 환경변수. */
export function getSupabasePublicEnv() {
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL", NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
