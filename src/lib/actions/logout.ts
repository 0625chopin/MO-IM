"use server";

import { redirect } from "next/navigation";

import { signOutSupabaseSession } from "@/lib/auth";

/**
 * FR-002 로그아웃 Server Action(Task 030, 17일차). "세션 폐기 후 랜딩으로 이동"이 정상 흐름의
 * 일부인데도 이전 회차까지 로그아웃을 실제로 트리거하는 UI가 없었다(grep 확인) — 실 세션을
 * 붙이면서 함께 채운다. `HeaderNav`(`src/components/shell/HeaderNav.tsx`)의 계정 메뉴 폼이
 * 이 액션을 건다.
 */
export async function logoutAction(): Promise<void> {
  await signOutSupabaseSession();
  redirect("/");
}
