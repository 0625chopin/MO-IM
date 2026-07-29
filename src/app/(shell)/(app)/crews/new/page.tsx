import { CrewCreateFormContainer } from "@/components/crews/CrewCreateFormContainer";
import { PageHeader } from "@/components/shell/PageHeader";
import { strings } from "@/lib/strings";

/**
 * 크루 개설 페이지 (SC-08, PRD §6 "크루 개설 페이지", F005, Task 016B). 색상은 자동 배정이라
 * 이 폼에서 묻지 않는다(D-016). 인증 가드는 `(app)/layout.tsx`가 이미 맡는다(D-030 ④) —
 * `page.tsx`는 얇은 껍데기로 컨테이너만 조립한다.
 */
export default function CrewCreatePage() {
  return (
    <main className="flex flex-1 flex-col">
      <PageHeader title={strings.crew.create.title} description={strings.crew.create.description} />
      <div className="mx-auto w-full max-w-lg p-4">
        <CrewCreateFormContainer />
      </div>
    </main>
  );
}
