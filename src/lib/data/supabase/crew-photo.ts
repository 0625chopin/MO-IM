import "server-only";

import type { CrewPhoto, Id } from "@/lib/types";

import { type DataResult, err, ok } from "../contracts";

import { toCrewPhoto } from "./mappers";
import { createSupabaseServerClient } from "./server";

/**
 * 크루 활동 사진(FR-대응 없음 — 팀장 요청으로 신설) 읽기·쓰기. 다른 도메인 모듈과 달리 이
 * 파일은 **테이블과 Storage 버킷 둘 다**를 다룬다 — 사진은 메타데이터 행(`crew_photos`)과
 * 오브젝트 바이트(`crew-photos` 버킷)가 짝을 이뤄야 의미가 있고, 그 짝을 맞추는 책임을 두
 * 모듈에 쪼개 두면 한쪽만 남는 고아 상태를 만들기 쉽다.
 *
 * **버킷은 private이다.** 열람은 항상 만료가 있는 서명 URL로 나간다(`createCrewPhotoSignedUrls`).
 * public 버킷으로 두면 `private` 크루의 사진이 경로 문자열만 알면 열리는 상태가 되는데, 그건
 * D-007("private 크루는 소개조차 보여주지 않는다")과 정면으로 어긋난다. RLS는 테이블 정책
 * (`crew_photos_select_members` 등)과 `storage.objects` 정책 양쪽에 같은 판정을 걸어 뒀다 —
 * 메타데이터 행 없이 바이트에만 직접 접근하는 경로가 따로 있기 때문이다.
 *
 * **권한 사전 판정은 이 레이어의 몫이 아니다**(`contracts.ts` 참고). 호출자(Server Action)가
 * `lib/rules`로 먼저 판정하고, 여기서 걸리는 RLS 거부는 2차 방어선이라 예외가 아니라
 * `err("forbidden", …)`로 표현한다(D-030 ③).
 */

/** 업로드 허용 MIME. 버킷의 `allowed_mime_types`와 같은 목록이다(둘 다 고쳐야 한다). */
export const CREW_PHOTO_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** 업로드 크기 상한(5MB). 버킷의 `file_size_limit`와 같은 값이다. */
export const CREW_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** 서명 URL 유효 기간(초). 갤러리 한 화면을 보는 동안 만료되지 않을 만큼만 준다. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const BUCKET = "crew-photos";

export interface ListCrewPhotosQuery {
  /** 기본 60장. 갤러리는 페이지네이션 대신 "더 보기"가 없는 최신 N장 그리드다. */
  limit?: number;
  /** 특정 모임의 사진만 보고 싶을 때. 생략하면 크루 전체. */
  meetupId?: Id;
}

/** 최신순 활동 사진 목록. 삭제된 사진은 제외한다. */
export async function listCrewPhotos(crewId: Id, opts: ListCrewPhotosQuery = {}): Promise<CrewPhoto[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("crew_photos")
    .select("*")
    .eq("crew_id", crewId)
    .is("deleted_at", null);
  if (opts.meetupId) query = query.eq("meetup_id", opts.meetupId);

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit ?? 60);
  if (error) throw error;
  return (data ?? []).map(toCrewPhoto);
}

/** 크루 사진 총 장수(삭제 제외). 요약 지표용 — 목록을 통째로 읽지 않으려고 count만 쓴다. */
export async function countCrewPhotos(crewId: Id): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("crew_photos")
    .select("id", { count: "exact", head: true })
    .eq("crew_id", crewId)
    .is("deleted_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function getCrewPhotoById(id: Id): Promise<CrewPhoto | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("crew_photos").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toCrewPhoto(data) : null;
}

/**
 * 경로 → 서명 URL 맵. 만료되는 값이라 엔티티에 담지 않고 화면 조립 시점에 따로 계산한다
 * (`crew-photo.types.ts` docstring 참고).
 *
 * 서명에 실패한 경로는 맵에서 **빠진다** — 던지지 않는다. 사진 한 장의 오브젝트가 사라졌다고
 * 갤러리 전체가 오류 화면이 되면 안 되고, 호출부는 URL이 없는 항목을 "불러오지 못한 사진"으로
 * 표시하면 된다.
 */
export async function createCrewPhotoSignedUrls(storagePaths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (storagePaths.length === 0) return result;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(storagePaths, SIGNED_URL_TTL_SECONDS);
  if (error) return result;

  for (const entry of data ?? []) {
    if (entry.signedUrl && entry.path) result.set(entry.path, entry.signedUrl);
  }
  return result;
}

export interface UploadCrewPhotoObjectInput {
  crewId: Id;
  /** 확장자 결정에만 쓴다 — 저장 파일명은 항상 새로 만든 UUID다(원본 이름을 신뢰하지 않는다). */
  fileName: string;
  contentType: string;
  body: ArrayBuffer;
}

/**
 * 오브젝트 업로드. 성공하면 저장된 경로를 돌려준다 — 호출자가 그 경로로 `createCrewPhotoRow`를
 * 이어 부른다.
 *
 * **경로는 항상 새 UUID로 만든다.** 사용자가 준 파일명을 그대로 쓰면 (a) 같은 이름이 서로를
 * 덮어쓰고 (b) 경로 조작(`../`)·제어문자 같은 입력을 버킷 키에 그대로 싣게 된다. 확장자만
 * 화이트리스트로 뽑아 붙인다.
 */
export async function uploadCrewPhotoObject(
  input: UploadCrewPhotoObjectInput,
): Promise<DataResult<string>> {
  const extension = resolveExtension(input.fileName, input.contentType);
  if (!extension) {
    return err("validation_failed", "지원하지 않는 이미지 형식이다.");
  }

  const supabase = await createSupabaseServerClient();
  const objectPath = `${input.crewId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, input.body, {
    contentType: input.contentType,
    upsert: false,
  });

  if (error) {
    // storage.objects INSERT 정책 거부(비크루원·해산된 크루)와 그 밖의 실패를 구분한다.
    const message = error.message.toLowerCase();
    if (message.includes("row-level security") || message.includes("unauthorized")) {
      return err("forbidden", "이 크루에 사진을 올릴 권한이 없다.");
    }
    return err("validation_failed", error.message);
  }
  return ok(objectPath);
}

/** 오브젝트 삭제. 메타데이터 행 삽입이 실패했을 때의 보상 처리에도 쓴다. */
export async function removeCrewPhotoObject(storagePath: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.storage.from(BUCKET).remove([storagePath]);
}

export interface CreateCrewPhotoRowInput {
  crewId: Id;
  uploaderId: Id;
  storagePath: string;
  caption?: string | null;
  meetupId?: Id | null;
}

export async function createCrewPhotoRow(
  input: CreateCrewPhotoRowInput,
): Promise<DataResult<CrewPhoto>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crew_photos")
    .insert({
      crew_id: input.crewId,
      uploader_id: input.uploaderId,
      storage_path: input.storagePath,
      caption: input.caption ?? null,
      meetup_id: input.meetupId ?? null,
    })
    .select("*")
    .single();

  if (error) {
    return err("forbidden", error.message);
  }
  return ok(toCrewPhoto(data));
}

/**
 * 소프트 삭제. `crew_photos_update_uploader_or_staff` 정책이 "올린 본인 또는 임원 이상"을
 * 강제하므로, 권한이 없으면 0행이 갱신되고 여기서 `forbidden`이 된다.
 *
 * **오브젝트 바이트는 함께 지우지 않는다** — 호출자(Server Action)가 행 삭제 성공을 확인한 뒤
 * `removeCrewPhotoObject`를 이어 부른다. 순서를 뒤집으면(바이트 먼저) 행 갱신이 실패했을 때
 * 되살릴 수 없는 손실이 된다.
 */
export async function softDeleteCrewPhoto(id: Id): Promise<DataResult<CrewPhoto>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("crew_photos")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("*")
    .maybeSingle();

  if (error) return err("forbidden", error.message);
  if (!data) return err("not_found", "이미 삭제됐거나 삭제할 권한이 없는 사진이다.");
  return ok(toCrewPhoto(data));
}

/** MIME을 1차 근거로, 파일명 확장자를 보조로 본다. 목록에 없으면 null(=거부). */
function resolveExtension(fileName: string, contentType: string): string | null {
  const byMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const fromMime = byMime[contentType.toLowerCase()];
  if (fromMime) return fromMime;

  const match = /\.([a-z0-9]{1,5})$/i.exec(fileName.trim());
  const candidate = match?.[1]?.toLowerCase();
  if (candidate && Object.values(byMime).includes(candidate)) return candidate;
  if (candidate === "jpeg") return "jpg";
  return null;
}
