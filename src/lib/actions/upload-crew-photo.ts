"use server";

import { refresh } from "next/cache";

import { getAuthSession } from "@/components/shell/get-auth-session";
import {
  CREW_PHOTO_ALLOWED_MIME_TYPES,
  CREW_PHOTO_MAX_BYTES,
  createCrewPhotoRow,
  getCrewById,
  getCrewMembership,
  removeCrewPhotoObject,
  uploadCrewPhotoObject,
} from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

/**
 * `useActionState` 계약(`invite-crew-member.ts`와 같은 형태) — 폼 하나가 한 번에 한 장을
 * 올리므로 필드별 오류를 나눌 필요가 없어 폼 전체 오류 하나만 둔다.
 */
export interface UploadCrewPhotoFormState {
  formError?: string;
  success?: boolean;
}

/**
 * 활동 사진 업로드 Server Action(팀장 요청). 입력이 파일이라 `FormData`를 그대로 받는다 —
 * 직렬화 가능한 평범한 객체로는 바이트를 실을 수 없다.
 *
 * **두 단계 쓰기(오브젝트 → 메타데이터 행)라 실패 보상이 있다.** Storage 업로드가 성공한 뒤
 * 행 삽입이 실패하면 버킷에 아무도 참조하지 않는 바이트가 남는다 — 그 경우 올린 오브젝트를
 * 되돌려 지운다. 반대 순서(행 먼저)로는 만들 수 없다: `storage_path`가 NOT NULL이라 경로를
 * 모르는 채로 행을 넣을 수 없다.
 *
 * 크기·형식 검증은 여기서 한 번, 버킷 설정(`file_size_limit`·`allowed_mime_types`)이 다시 한
 * 번 본다. 여기 검증은 사용자에게 한국어 사유를 돌려주기 위한 것이고, 실제 강제 경계는 버킷과
 * RLS 쪽이다 — 이 액션을 우회해도 뚫리지 않는다.
 */
export async function uploadCrewPhotoAction(
  _prevState: UploadCrewPhotoFormState,
  formData: FormData,
): Promise<UploadCrewPhotoFormState> {
  const e = strings.crew.photos.upload.errors;

  const crewId = String(formData.get("crewId") ?? "");
  const caption = String(formData.get("caption") ?? "").trim();
  const meetupIdRaw = String(formData.get("meetupId") ?? "").trim();
  const file = formData.get("file");

  if (!crewId) return { formError: e.failed };
  if (!(file instanceof File) || file.size === 0) return { formError: e.fileRequired };
  if (file.size > CREW_PHOTO_MAX_BYTES) return { formError: e.tooLarge };
  if (!(CREW_PHOTO_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { formError: e.unsupportedType };
  }
  if (caption.length > 500) return { formError: e.captionTooLong };

  const session = await getAuthSession();
  if (session.status !== "authenticated") {
    return { formError: e.sessionExpired };
  }

  const [crew, membership] = await Promise.all([
    getCrewById(crewId),
    getCrewMembership(crewId, session.profileId),
  ]);
  if (!crew) return { formError: e.failed };

  const role = deriveUserRoleForPermissionCheck(membership);
  if (!checkPermission({ role, action: "photo:create" }).allowed) {
    return { formError: e.notAllowed };
  }
  // 해산된 크루는 쓰기가 동결된다(D-089) — RLS도 같은 판정을 하지만 사용자에게 돌려줄 사유를
  // 여기서 만든다.
  if (crew.status !== "active") {
    return { formError: e.crewArchived };
  }

  const uploaded = await uploadCrewPhotoObject({
    crewId,
    fileName: file.name,
    contentType: file.type,
    body: await file.arrayBuffer(),
  });
  if (!uploaded.ok) {
    return { formError: uploaded.error.code === "forbidden" ? e.notAllowed : e.failed };
  }

  const created = await createCrewPhotoRow({
    crewId,
    uploaderId: session.profileId,
    storagePath: uploaded.data,
    caption: caption.length > 0 ? caption : null,
    meetupId: meetupIdRaw.length > 0 ? (meetupIdRaw as Id) : null,
  });
  if (!created.ok) {
    // 참조 없는 바이트를 남기지 않는다(위 docstring 참고).
    await removeCrewPhotoObject(uploaded.data);
    return { formError: e.failed };
  }

  refresh();
  return { success: true };
}
