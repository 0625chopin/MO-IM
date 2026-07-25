"use server";

import { refresh } from "next/cache";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { createBlock } from "@/lib/data";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";

/**
 * FR-081 사용자 차단 Server Action(Task 042A). `BlockButton`이
 * `useActionState(createBlockAction, ...)`로 건다. `report:create`(create-report.ts)와 같은
 * 이유로 크루 스코프가 아니다 — 로그인 여부만 확인한다.
 *
 * **자기 차단 금지는 3중 방어다** — ① `blocks_check` 테이블 CHECK(`blocker_id <>
 * blocked_id`, 028부터 존재) ② `create_block` RPC의 명시적 `cannot_block_self` 사전 확인(친절한
 * 문구) ③ 이 액션은 별도 확인을 하지 않는다(중복 확인이 아니라 RPC 결과를 그대로 신뢰).
 * **멱등** — 이미 차단한 사용자를 다시 눌러도 오류가 아니라 `already_blocked: true`로
 * 성공한다(`BlockButton`은 이 값으로 "차단됨" 상태를 그대로 유지).
 */
export interface CreateBlockFormState {
  formError?: string;
  success?: boolean;
  alreadyBlocked?: boolean;
}

export async function createBlockAction(
  _prevState: CreateBlockFormState,
  formData: FormData,
): Promise<CreateBlockFormState> {
  const blockedId = String(formData.get("blockedId") ?? "");

  const session = await getAuthSession();
  const role = isAuthenticated(session) ? "member" : "guest";
  const permission = checkPermission({ role, action: "block:create" });
  if (!permission.allowed || !isAuthenticated(session)) {
    return { formError: strings.block.errors.notAllowed };
  }

  const result = await createBlock(blockedId);
  if (!result.ok) {
    const code = result.error.message as keyof typeof strings.block.errors;
    return { formError: strings.block.errors[code] ?? strings.block.errors.failed };
  }

  refresh();
  return { success: true, alreadyBlocked: result.data.alreadyBlocked };
}
