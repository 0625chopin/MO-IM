import "server-only";

import type { RecordProductEventInput } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { createSupabaseServerClient } from "./server";

import type { Json } from "./database.types";

/**
 * ProductEvent 쓰기 전용 실데이터 구현(NFR-030, Task 045). `lib/audit/audit-log.ts`
 * (`recordAuditLog`)와 짝을 이루는 자리지만 **의도적으로 `lib/audit/`가 아니라 여기(`lib/data`)에
 * 둔다** — 감사 로그는 service-role 전용 쓰기라 `lib/audit/`(CON-05·CON-06, 쿠키·세션을 직접
 * 읽지 않는 서비스롤 계층)에 속하지만, 이 이벤트는 반대로 **호출자 자신의 인증 세션으로
 * self-service INSERT** 한다(`product_events_insert_self` RLS, `actor_id=auth.uid()`) —
 * 다른 도메인 쓰기(`cast-vote.ts` 등)와 같은 `createSupabaseServerClient`(쿠키 기반) 경로다.
 *
 * 읽기(집계) 함수를 이 파일에 두지 않는다 — `product_events`는 v0.1에 조회 화면이 없고
 * anon/authenticated SELECT 권한 자체가 없다(마이그레이션에서 REVOKE). 집계가 필요해지면
 * service_role 경로(별도 파일)를 그때 추가한다.
 *
 * 실패해도 예외를 던지지 않는다(D-030 ③과 같은 원칙, `recordAuditLog`·`captureError`와 동일) —
 * 관측 이벤트 기록이 실패했다고 검색·알림 열람 같은 주 기능을 막으면 배보다 배꼽이 커진다.
 * 호출부는 반환값을 대개 무시한다(`DataResult`는 방어적으로만 유지).
 */
export async function recordProductEvent(input: RecordProductEventInput): Promise<DataResult<void>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("product_events").insert({
    actor_id: input.actorId,
    event_type: input.eventType,
    payload: (input.payload ?? {}) as Json,
  });
  if (error) {
    console.error("[product-events] insert 실패", { input, error });
    return err("validation_failed", error.message);
  }
  return ok(undefined);
}
