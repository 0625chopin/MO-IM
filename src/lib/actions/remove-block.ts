"use server";

import { refresh } from "next/cache";

import { isAuthenticated } from "@/components/shell/auth-session";
import { getAuthSession } from "@/components/shell/get-auth-session";
import { removeBlock } from "@/lib/data";
import { strings } from "@/lib/strings";

/**
 * FR-081 차단 해제 Server Action(Task 042A, 계정 설정 "차단 관리" 목록의 "차단 해제" 버튼).
 * 요구사항 AC에 명시된 항목은 아니지만(FR-081은 차단·초대 거부만 규정) 차단 UI를 만들면서
 * 해제 경로가 없으면 실수로 누른 차단을 되돌릴 방법이 없다 — `blocks_delete_self` RLS(본인
 * 스코프)만으로 이미 안전한 단일 DELETE라 새 RPC가 필요 없다(`block.ts` 모듈 docstring).
 */
export interface RemoveBlockFormState {
  formError?: string;
  success?: boolean;
}

export async function removeBlockAction(
  _prevState: RemoveBlockFormState,
  formData: FormData,
): Promise<RemoveBlockFormState> {
  const blockedId = String(formData.get("blockedId") ?? "");

  const session = await getAuthSession();
  if (!isAuthenticated(session)) {
    return { formError: strings.block.errors.notAllowed };
  }

  const result = await removeBlock(blockedId);
  if (!result.ok) {
    return { formError: strings.block.manage.errors.removeFailed };
  }

  refresh();
  return { success: true };
}
