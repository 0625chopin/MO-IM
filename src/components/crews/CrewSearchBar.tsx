"use client";

import { Loader2Icon, SearchIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { CREW_EXPLORE_HREF } from "@/components/crews/crew-links";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { recordCrewSearchEventAction } from "@/lib/actions/record-crew-search-event";
import { CREW_CATEGORIES } from "@/lib/rules/crew-category";
import { validateCrewSearchQuery } from "@/lib/rules/crew-search-query";
import { strings } from "@/lib/strings";

import type { FormEvent } from "react";

/** URL에는 남기지 않는 내부 sentinel — "카테고리 없음"(전체 보기)을 ToggleGroup의 선택값으로
 *  표현하기 위한 값일 뿐이다. */
const ALL_CATEGORIES_VALUE = "all";

export interface CrewSearchBarProps {
  /** 현재 URL의 `q` — 서버가 이미 유효성(2자 이상)까지 확인한 값이다. */
  initialQuery: string;
  /** 현재 URL의 `category`. 없으면 `null`(전체). */
  initialCategory: string | null;
}

/**
 * FR-014 검색바 + 카테고리 필터(Task 016A). 키워드는 **제출형**(정상 흐름 "② 키워드 입력",
 * `UserSearchField`와 같은 상호작용), 카테고리는 **클릭 즉시 적용**이다 — 둘 다
 * `router.push`로 `/crews?q=&category=` searchParams를 갱신해 서버 컴포넌트
 * (`CrewExploreContainer`)가 다시 조회하게 한다. 클라이언트에서 이미 받은 목록을 다시
 * 걸러내지 않는다 — D-017을 "데이터 접근 규칙"으로 유지하려면 필터 변경이 항상 서버 재조회를
 * 거쳐야 한다(클라이언트 필터링은 `private` 크루가 한 번은 클라이언트에 내려와야 한다는 뜻이라
 * D-017이 명시적으로 배제한 방식이다).
 *
 * 검색어 2자 미만은 제출을 막는다(FR-014 E2) — `crew-search-query.ts`(순수 함수)가 판정한다.
 * 검색어를 아예 비우면(0자) 그대로 제출해 전체 목록 브라우징으로 돌아간다(정상 흐름 "입력
 * 없이 전체 목록 브라우징도 가능").
 *
 * `router.push`를 `startTransition`으로 감싼다(D-029 렌더링 전략) — `page.tsx`가 이 필터 값을
 * `Suspense`의 `key`로 쓰므로, 전환 중에도 이 검색바 자신은 언마운트되지 않고 그 아래
 * `CrewGrid`만 폴백(`CrewGridSkeleton`)으로 바뀐다(AC4).
 */
export function CrewSearchBar({ initialQuery, initialCategory }: CrewSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();

  const validation = validateCrewSearchQuery(query);

  function navigate(nextQuery: string, nextCategory: string | null) {
    const params = new URLSearchParams();
    const trimmed = nextQuery.trim();
    if (trimmed) params.set("q", trimmed);
    if (nextCategory) params.set("category", nextCategory);
    const href = params.size > 0 ? `${CREW_EXPLORE_HREF}?${params.toString()}` : CREW_EXPLORE_HREF;
    startTransition(() => {
      router.push(href);
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validation.valid) return;
    const trimmed = query.trim();
    // NFR-030 KPI-5 분모 — 실제 키워드 검색 제출만 기록한다(카테고리만 바꾸는
    // `handleCategoryChange`는 "검색"이 아니라 "필터"라 여기서 부르지 않는다). 결과를
    // 기다리지 않는다 — 실패해도 검색/이동을 막을 이유가 없다(fire-and-forget).
    if (trimmed) {
      void recordCrewSearchEventAction(trimmed, initialCategory).catch(() => {
        // 관측 실패는 조용히 무시한다 — `recordProductEvent`가 이미 내부에서 로깅한다.
      });
    }
    navigate(query, initialCategory);
  }

  function handleCategoryChange(value: string[]) {
    const next = value[0];
    navigate(query, !next || next === ALL_CATEGORIES_VALUE ? null : next);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex items-start gap-2">
        <Field className="flex-1" data-invalid={!validation.valid}>
          <FieldLabel htmlFor="crew-search-query" className="sr-only">
            {strings.crew.explore.searchLabel}
          </FieldLabel>
          <Input
            id="crew-search-query"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={strings.crew.explore.searchPlaceholder}
            aria-invalid={!validation.valid}
            aria-describedby={!validation.valid ? "crew-search-query-error" : undefined}
          />
          {!validation.valid && (
            <FieldError id="crew-search-query-error">{strings.crew.explore.errors.queryTooShort}</FieldError>
          )}
        </Field>
        <Button type="submit" disabled={!validation.valid || isPending}>
          {isPending ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <SearchIcon aria-hidden="true" />
          )}
          {strings.crew.explore.searchSubmit}
        </Button>
      </form>

      <ToggleGroup
        aria-label={strings.crew.explore.categoryFilterLabel}
        value={[initialCategory ?? ALL_CATEGORIES_VALUE]}
        onValueChange={handleCategoryChange}
        className="flex-wrap"
      >
        <ToggleGroupItem value={ALL_CATEGORIES_VALUE}>{strings.crew.explore.allCategories}</ToggleGroupItem>
        {CREW_CATEGORIES.map((category) => (
          <ToggleGroupItem key={category} value={category}>
            {category}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
