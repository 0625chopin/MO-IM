"use client";

import { ImageOff, Images } from "lucide-react";
import Image from "next/image";
import { useState, useTransition } from "react";

import type { CrewPhotoView } from "@/components/crews/crew-photo-view-models";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ErrorState } from "@/components/ui/error-state";
import { deleteCrewPhotoAction } from "@/lib/actions/delete-crew-photo";
import { strings } from "@/lib/strings";
import type { Id } from "@/lib/types";

export interface CrewPhotoGalleryProps {
  photos: CrewPhotoView[];
  /** 업로드 다이얼로그. 컨테이너가 권한을 판정해 넣거나 뺀다(서버 컴포넌트를 슬롯으로 받는다). */
  uploadSlot?: React.ReactNode;
}

/**
 * 크루 활동 사진 갤러리(팀장 요청). 클라이언트 경계인 이유는 **확대 보기**다 — 그리드에서
 * 사진은 정사각으로 잘리므로(그래야 격자가 흔들리지 않는다) 원본 비율로 볼 수단이 없으면
 * 갤러리가 아니라 썸네일 목록에 그친다.
 *
 * 그리드는 정사각 2열(모바일)/3열(좁은 화면 이상)이다. 사진마다 다른 비율을 그대로 두는
 * 벽돌(masonry) 배치도 후보였지만, 캡션이 붙는 칸과 안 붙는 칸의 높이가 달라져 격자가
 * 어긋나 보인다 — 여기서 정보는 사진 자체이지 배치의 리듬이 아니다.
 */
export function CrewPhotoGallery({ photos, uploadSlot }: CrewPhotoGalleryProps) {
  const s = strings.crew.photos;
  const [expanded, setExpanded] = useState<CrewPhotoView | null>(null);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-base font-medium text-foreground">{s.title}</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">{s.description}</p>
        </div>
        {uploadSlot}
      </div>

      {photos.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Images aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{s.empty}</EmptyTitle>
            <EmptyDescription>{s.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-2 @sm:grid-cols-3">
          {photos.map((photo) => (
            <li key={photo.photoId}>
              <GalleryCell photo={photo} onExpand={() => setExpanded(photo)} />
            </li>
          ))}
        </ul>
      )}

      <PhotoDialog photo={expanded} onClose={() => setExpanded(null)} />
    </section>
  );
}

function GalleryCell({ photo, onExpand }: { photo: CrewPhotoView; onExpand: () => void }) {
  const s = strings.crew.photos;

  if (!photo.url) {
    return (
      <div className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border bg-muted/40 px-2 text-center">
        <ImageOff aria-hidden="true" className="size-5 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">{s.unavailable}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onExpand}
      className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Image
        src={photo.url}
        alt={photo.caption ?? s.title}
        fill
        sizes="(min-width: 640px) 200px, 45vw"
        className="object-cover transition-transform duration-200 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
      />
      {photo.caption && (
        // 캡션은 사진 위에 겹치지만 그라데이션 위라 대비가 확보된다. 사진마다 밝기가 달라
        // 반투명 단색으로는 4.5:1을 보장할 수 없다.
        <span className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/75 to-transparent px-2 pt-6 pb-1.5 text-left text-[11px] leading-tight text-white">
          <span className="line-clamp-2">{photo.caption}</span>
        </span>
      )}
    </button>
  );
}

function PhotoDialog({ photo, onClose }: { photo: CrewPhotoView | null; onClose: () => void }) {
  const s = strings.crew.photos;
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete(photoId: Id) {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await deleteCrewPhotoAction({ photoId });
      if (!result.ok) {
        setErrorMessage(
          result.error.code === "not_found" ? s.delete.errors.notFound : s.delete.errors.notAllowed,
        );
        return;
      }
      onClose();
    });
  }

  return (
    <Dialog
      open={photo !== null}
      onOpenChange={(next) => {
        if (!next) {
          setErrorMessage(null);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {photo && (
          <>
            <DialogHeader>
              <DialogTitle className="text-base">{photo.caption ?? s.title}</DialogTitle>
              <DialogDescription>
                {photo.meetupTitle ? `${photo.meetupTitle} · ` : ""}
                {photo.uploadedAtLabel}
              </DialogDescription>
            </DialogHeader>

            {photo.url && (
              // 원본 비율 유지. 높이를 뷰포트에 묶어 세로로 긴 사진이 화면을 넘지 않게 한다.
              <div className="relative max-h-[60vh] min-h-40 w-full overflow-hidden rounded-md bg-muted">
                <Image
                  src={photo.url}
                  alt={photo.caption ?? s.title}
                  width={1200}
                  height={900}
                  sizes="(min-width: 640px) 512px, 90vw"
                  className="max-h-[60vh] w-full object-contain"
                />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {s.uploadedBy.replace("{name}", photo.uploaderName)}
            </p>

            {errorMessage && <ErrorState title={errorMessage} />}

            {photo.canDelete && (
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>
                  {strings.common.actions.close}
                </DialogClose>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => handleDelete(photo.photoId)}
                >
                  {pending ? s.delete.submitPending : s.delete.button}
                </Button>
              </DialogFooter>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
