import { LockIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { strings } from "@/lib/strings";

export interface PrivateCrewNoticeProps {
  crewName: string;
}

/**
 * `private` 크루의 비소속자에게 보이는 전부(D-007, FR-012 AC2, D-030 ①) — 크루명 +
 * "초대 전용" 안내. 게시판·채팅·멤버 목록은 물론, 소개(설명·카테고리·멤버 수)조차
 * `public` 크루(`CrewIntroPreview`)와 달리 보여주지 않는다 — D-007 원문이 "크루명과 안내
 * 까지만"이라고 정확히 못박았기 때문이다.
 *
 * `RouteErrorBoundary`(전역 오류 경계)를 재사용하지 않는다 — 겉모습은 비슷해도 이건 오류가
 * 아니라 정상적으로 도달하는 화면 상태다(URL을 알고 있는 방문자라면 항상 이 모습을 본다).
 * 시각 언어만 `Empty` 원자로 통일해 맞췄다.
 */
export function PrivateCrewNotice({ crewName }: PrivateCrewNoticeProps) {
  return (
    <div className="mx-auto w-full max-w-2xl p-4">
      <h1 className="mb-4 font-heading text-lg font-medium text-foreground">{crewName}</h1>
      <Empty className="rounded-xl border border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{strings.crew.home.privateNotice.title}</EmptyTitle>
          <EmptyDescription>{strings.crew.home.privateNotice.description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
