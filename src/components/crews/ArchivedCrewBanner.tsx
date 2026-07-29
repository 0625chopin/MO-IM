import { ArchiveIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { strings } from "@/lib/strings";

/**
 * 해산된 크루 안내 배너(FR-013 AC2, Task 040 UI/게이트 절반, BOARD, 19일차 — I-066·I-067
 * 해소). `(app)/crews/[crewId]/layout.tsx`가 `crews.status==='archived'`일 때 하위 화면
 * 공통으로 렌더한다 — 게시판·채팅·멤버 관리·설정 등 라우트마다 각자 안내를 만들지 않고
 * 이 한 지점에서 "왜 글을 쓸 수 없는지" 알린다. 순수 표현 컴포넌트(`lib/data` 미참조,
 * D-030 ①) — 서버 컴포넌트 트리에서 그대로 렌더한다(상호작용 없음, 클라이언트 컴포넌트일
 * 필요가 없다).
 */
export function ArchivedCrewBanner() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pt-4">
      <Alert>
        <ArchiveIcon aria-hidden="true" />
        <AlertTitle>{strings.crew.archivedNotice.title}</AlertTitle>
        <AlertDescription>{strings.crew.archivedNotice.description}</AlertDescription>
      </Alert>
    </div>
  );
}
