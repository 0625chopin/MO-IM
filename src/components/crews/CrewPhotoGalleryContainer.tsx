import { formatShortDateRangeLabelKo } from "@/components/calendar/date-grid";
import type {
  CrewPhotoMeetupOption,
  CrewPhotoView,
} from "@/components/crews/crew-photo-view-models";
import { CrewPhotoGallery } from "@/components/crews/CrewPhotoGallery";
import { CrewPhotoUploadDialog } from "@/components/crews/CrewPhotoUploadDialog";
import { getAuthSession } from "@/components/shell/get-auth-session";
import {
  createCrewPhotoSignedUrls,
  getCrewById,
  getCrewMembership,
  getProfileById,
  listCrewPhotos,
  listPastMeetupsForCrew,
} from "@/lib/data";
import { deriveUserRoleForPermissionCheck } from "@/lib/rules/crew-membership-transition";
import { checkPermission } from "@/lib/rules/permission";
import { strings } from "@/lib/strings";
import type { Id, ISODateString } from "@/lib/types";

/** 업로드 폼의 "관련 모임" 후보. 오래된 모임까지 다 넣으면 고르기가 더 어렵다. */
const MEETUP_OPTION_LIMIT = 20;

/**
 * 크루 활동 사진 갤러리 컨테이너(팀장 요청, D-030 ①) — 사진 행·업로더 프로필·서명 URL을
 * 조인하고 삭제 권한을 사진마다 판정한다.
 *
 * **서명 URL은 한 번에 발급한다**(`createSignedUrls` 일괄) — 사진마다 따로 부르면 60장짜리
 * 갤러리가 60번의 왕복이 된다. 발급에 실패한 사진은 목록에서 빼지 않고 `url: null`로 남긴다
 * (`crew-photo-view-models.ts` 참고).
 *
 * **업로더 프로필 조회는 중복을 제거한다** — 한 사람이 사진 열 장을 올렸으면 조회도 한 번이면
 * 된다(`BoardListContainer`가 글마다 `getProfileById`를 부르는 것과 대비되는 자리다. 거기는
 * 페이지당 20건이고 여기는 60장이라 중복이 훨씬 크다).
 */
export async function CrewPhotoGalleryContainer({ crewId }: { crewId: Id }) {
  const session = await getAuthSession();
  const viewerId = session.status === "authenticated" ? session.profileId : null;

  const today = new Date().toISOString().slice(0, 10) as ISODateString;
  const [crew, membership, photos, pastMeetups] = await Promise.all([
    getCrewById(crewId),
    viewerId ? getCrewMembership(crewId, viewerId) : Promise.resolve(null),
    listCrewPhotos(crewId),
    listPastMeetupsForCrew(crewId, { before: today, limit: MEETUP_OPTION_LIMIT }),
  ]);

  const role = deriveUserRoleForPermissionCheck(membership);
  const canDeleteAny = checkPermission({ role, action: "photo:delete_any" }).allowed;
  const canUpload =
    checkPermission({ role, action: "photo:create" }).allowed && crew?.status === "active";

  const [signedUrls, uploaderNames] = await Promise.all([
    createCrewPhotoSignedUrls(photos.map((photo) => photo.storagePath)),
    resolveUploaderNames(photos.map((photo) => photo.uploaderId)),
  ]);

  const meetupTitles = new Map(pastMeetups.map((meetup) => [meetup.id, meetup.title]));

  const views: CrewPhotoView[] = photos.map((photo) => {
    const isSelf = photo.uploaderId === viewerId;
    const canDeleteOwn = checkPermission({
      role,
      action: "photo:delete_own",
      context: { isSelf },
    }).allowed;

    return {
      photoId: photo.id,
      url: signedUrls.get(photo.storagePath) ?? null,
      caption: photo.caption,
      uploaderName: uploaderNames.get(photo.uploaderId) ?? strings.common.profile.unknownAuthor,
      uploadedAtLabel: formatUploadedAt(photo.createdAt),
      canDelete: canDeleteOwn || canDeleteAny,
      meetupTitle: photo.meetupId ? (meetupTitles.get(photo.meetupId) ?? null) : null,
    };
  });

  const meetupOptions: CrewPhotoMeetupOption[] = pastMeetups.map((meetup) => ({
    meetupId: meetup.id,
    label: `${formatShortDateRangeLabelKo(meetup.date, meetup.endDate)} · ${meetup.title}`,
  }));

  return (
    <CrewPhotoGallery
      photos={views}
      uploadSlot={
        canUpload ? <CrewPhotoUploadDialog crewId={crewId} meetupOptions={meetupOptions} /> : undefined
      }
    />
  );
}

async function resolveUploaderNames(uploaderIds: Id[]): Promise<Map<Id, string>> {
  const unique = [...new Set(uploaderIds)];
  const profiles = await Promise.all(unique.map((id) => getProfileById(id)));
  const result = new Map<Id, string>();
  unique.forEach((id, index) => {
    const displayName = profiles[index]?.displayName;
    if (displayName) result.set(id, displayName);
  });
  return result;
}

/**
 * 업로드 시각 — 날짜까지만 보여준다. 사진은 "언제 찍었나"가 관심사이지 "몇 시 몇 분에
 * 올렸나"가 아니다(채팅 메시지와 다른 자리다).
 */
function formatUploadedAt(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}
