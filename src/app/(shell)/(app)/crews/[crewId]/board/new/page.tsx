import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { getBoardListHref } from "@/components/board/board-links";
import { PostWriteContainer } from "@/components/board/PostWriteContainer";
import { strings } from "@/lib/strings";

/**
 * 글쓰기 페이지(SC-11, FR-030·034, Task 018B). 얇은 껍데기 — 유형 토글·필드·검증·임시 저장은
 * `PostWriteForm`이, 권한 판정은 `PostWriteContainer`가 한다(D-030 ①). Next.js 16에서
 * `params`는 비동기다 — await 한다.
 */
export default async function CrewBoardWritePage({
  params,
}: {
  params: Promise<{ crewId: string }>;
}) {
  const { crewId } = await params;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4">
      <Link
        href={getBoardListHref(crewId)}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {strings.board.list.title}
      </Link>
      <h1 className="font-heading text-lg font-medium text-foreground">{strings.board.write.title}</h1>
      <PostWriteContainer crewId={crewId} />
    </main>
  );
}
