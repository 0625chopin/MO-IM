"use client";

import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { CrewFilterOption } from "@/components/calendar/calendar-types";
import { writeCrewFilterCookie } from "@/components/calendar/crew-filter-client";
import { CrewLegend } from "@/components/calendar/CrewLegend";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { strings } from "@/lib/strings";
import { cn } from "@/lib/utils";

/**
 * 크루 필터 — Task 021B(FR-061 AC5, D-014·R-017). 소속 크루가 12개를 넘으면 팔레트 색이
 * 반드시 겹치므로(D-014) 이 컴포넌트가 그 상황의 유일한 복구 수단이다(E5).
 *
 * **왜 표현/컨테이너 어느 쪽도 아니고 이 파일 하나로 끝나는가**: D-030 ①은 "표현 컴포넌트는
 * props만 받는다"를 요구하지만, 이 컴포넌트가 하는 부수효과(쿠키 쓰기 + `router.refresh()`)는
 * `lib/data`를 호출하지 않는다 — 서버 데이터를 다시 읽어 오라고 Next.js에 요청할 뿐이고, 실제
 * 조회는 여전히 `MonthCalendarContainer`(서버)가 쿠키를 다시 읽어서 한다. 그래서 이 파일은
 * ESLint zone 4(표현 컴포넌트의 `@/lib/data` import 차단) 대상 그대로 남아 있고, 별도
 * `CrewFilterPanelContainer`를 만들 이유가 없다 — `MonthCalendar.tsx`가 roving tabindex를
 * 자기 안에 갖고도 "표현 컴포넌트"로 남는 것과 같은 논리다.
 *
 * **선택 상태를 어디에 유지하는가**: `document.cookie`에 직접 쓴다(Server Action이 아니다).
 * 이유는 `crew-filter-cookie.ts` 모듈 docstring 참고 — 인증·개인정보가 아니라 순수 UI
 * 선호도라 쓰기 경로를 굳이 서버 왕복으로 만들지 않았다. 토글 즉시 로컬 상태로 체크박스가
 * 반응하고(낙관적 업데이트), `router.refresh()`가 `startTransition`으로 감싸여 있어 서버
 * 재조회가 진행되는 동안에도 **체크박스는 계속 조작 가능하다** — 여러 크루를 빠르게 연달아
 * 토글해도 매번 이전 재조회가 끝나길 기다리지 않는다(R-017, 소속 크루 12개 규모에서 응답성을
 * 우선했다).
 *
 * **이 재조회는 실재하는 pending 상태이고, 화면에도 보인다**(CREW 재검증 지적, 021B 등록
 * 회차에서 놓친 부분 — `useTransition()`의 `isPending`을 처음엔 `const [, startTransition]`로
 * 버려서 실제로 걸리는 시간이 화면 어디에도 드러나지 않았다). `isPending`이 참인 동안 그룹에
 * `aria-busy`를 걸고 제목 옆에 스피너를 보여준다 — **체크박스를 `disabled`로 잠그지는
 * 않는다**: 잠그면 "입력이 막히지 않는다"는 위 설계를 스스로 어기게 된다. 이 스피너는
 * 장식(`aria-hidden`)이고 옆의 텍스트(`common.status.loading`)만 접근성 트리에 남는다 —
 * 매 토글마다 라이브 리전으로 다시 낭독시키지는 않는다(불필요한 낭독 스팸을 피한다, 채팅
 * 리뷰에서 확인한 것과 같은 절제 원칙).
 */
export interface CrewFilterPanelProps {
  crews: CrewFilterOption[];
  /** `MonthCalendarContainer`가 쿠키+실제 소속 크루 교집합으로 이미 계산해 넘긴 초기 선택. */
  initialSelectedCrewIds: string[];
  className?: string;
}

export function CrewFilterPanel({
  crews,
  initialSelectedCrewIds,
  className,
}: CrewFilterPanelProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(
    () => new Set(initialSelectedCrewIds),
  );
  const [isPending, startTransition] = useTransition();

  function persist(next: ReadonlySet<string>) {
    setSelected(next);
    writeCrewFilterCookie([...next]);
    startTransition(() => router.refresh());
  }

  function toggle(crewId: string) {
    const next = new Set(selected);
    if (next.has(crewId)) next.delete(crewId);
    else next.add(crewId);
    persist(next);
  }

  return (
    <fieldset className={cn("@container flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <legend className="text-sm font-medium text-foreground">
            {strings.calendar.month.filter.title}
          </legend>
          {/* isPending 가시화(CREW 재검증 지적) — 체크박스는 잠그지 않으므로 장식용 스피너 +
           *  텍스트 하나로만 "재조회 중"을 알린다. 매번 새로 마운트되는 요소라 스크린 리더가
           *  지나가다 만나면 한 번은 읽지만, `aria-live`로 강제 낭독시키지는 않는다. */}
          {isPending && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2Icon aria-hidden="true" className="size-3 animate-spin" />
              {strings.common.status.loading}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => persist(new Set(crews.map((c) => c.id)))}
          >
            {strings.calendar.month.filter.selectAll}
          </Button>
          <Button type="button" variant="ghost" size="xs" onClick={() => persist(new Set())}>
            {strings.calendar.month.filter.clearAll}
          </Button>
        </div>
      </div>

      <div
        role="group"
        aria-label={strings.calendar.month.filter.groupAriaLabel}
        aria-busy={isPending}
        className="flex max-h-56 flex-col gap-1 overflow-y-auto @sm:grid @sm:grid-cols-2 @sm:gap-x-3"
      >
        {crews.map((crew) => (
          <Label key={crew.id} className="min-w-0 gap-2 py-1 font-normal">
            <Checkbox checked={selected.has(crew.id)} onCheckedChange={() => toggle(crew.id)} />
            <CrewLegend
              crewName={crew.name}
              colorIndex={crew.colorIndex}
              dimmed={!selected.has(crew.id)}
              badge={crew.isArchived ? strings.calendar.month.filter.archivedCrewBadge : undefined}
            />
          </Label>
        ))}
      </div>

      {crews.length > 12 && (
        <p className="text-xs text-muted-foreground">
          {strings.calendar.month.filter.collisionNotice}
        </p>
      )}
    </fieldset>
  );
}
