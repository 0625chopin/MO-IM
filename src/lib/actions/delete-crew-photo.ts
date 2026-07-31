"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import {
  getCrewMembership,
  getCrewPhotoById,
  removeCrewPhotoObject,
  softDeleteCrewPhoto,
} from "@/lib/data";
import { type DataResult, err } from "@/lib/data/contracts";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import type { CrewPhoto, Id } from "@/lib/types";

export interface DeleteCrewPhotoActionInput {
  photoId: Id;
}

/**
 * 활동 사진 삭제 Server Action. 올린 본인(`photo:delete_own`) 또는 임원 이상의 타인 사진 삭제
 * (`photo:delete_any`) 중 하나면 통과한다 — `deletePostAction`과 같은 구조다.
 *
 * **행을 먼저 소프트 삭제하고, 성공했을 때만 바이트를 지운다.** 순서를 뒤집으면 권한 판정이
 * 실패한 경우에도 이미 원본이 사라진 뒤가 된다. 바이트 삭제가 실패해도 사용자에게는 성공이다 —
 * 화면에서 사라지는 것이 사용자가 요구한 결과이고, 남은 오브젝트는 아무도 참조하지 않는다.
 */
export async function deleteCrewPhotoAction(
  input: DeleteCrewPhotoActionInput,
): Promise<DataResult<CrewPhoto>> {
  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return err("forbidden", "로그인 후 이용할 수 있다.");
  }

  const photo = await getCrewPhotoById(input.photoId);
  if (!photo || photo.deletedAt) {
    return err("not_found", `사진 ${input.photoId} 를 찾을 수 없다.`);
  }

  const membership = await getCrewMembership(photo.crewId, session.profileId);
  const role = deriveUserRoleForPermissionCheck(membership);
  const isSelf = photo.uploaderId === session.profileId;
  const canDeleteOwn = checkPermission({ role, action: "photo:delete_own", context: { isSelf } });
  const canDeleteAny = checkPermission({ role, action: "photo:delete_any" });
  if (!canDeleteOwn.allowed && !canDeleteAny.allowed) {
    return err("forbidden", "이 사진을 삭제할 권한이 없다.");
  }

  const result = await softDeleteCrewPhoto(input.photoId);
  if (result.ok) {
    await removeCrewPhotoObject(photo.storagePath);
    refresh();
  }
  return result;
}
