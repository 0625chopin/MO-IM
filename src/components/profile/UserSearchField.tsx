"use client";

import { AlertTriangleIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { UserSearchResult } from "@/components/profile/UserSearchResult";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { searchUserByHandleAction } from "@/lib/actions/search-user-by-handle";
import type { HandleSearchResult } from "@/lib/rules/handle-search";
import { strings } from "@/lib/strings";

import type { FormEvent, ReactNode } from "react";

type SearchStatus =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "done"; result: HandleSearchResult };

export interface UserSearchFieldProps {
  /**
   * 검색 결과가 `found`일 때 결과 카드에 끼워 넣을 맥락별 액션(초대 버튼 등). Task 017A(멤버
   * 초대 다이얼로그)가 이 prop으로 "초대" 버튼·"이미 멤버입니다" 배지를 주입할 자리다 — 이
   * 컴포넌트 자신은 크루 맥락(멤버십 여부 등)을 모른다(D-030 ①, 순수 표현). 계정 설정 화면은
   * 비워 둔다.
   */
  renderResultFooter?: (result: Extract<HandleSearchResult, { found: true }>) => ReactNode;
}

/**
 * FR-006 핸들 검색 필드(D-005, Task 015B). `SignupForm`의 핸들 blur 검사와 달리 이 컴포넌트는
 * **제출형 검색**이다 — 입력 도중이 아니라 사용자가 명시적으로 "검색"을 눌렀을 때만
 * `searchUserByHandleAction`을 호출한다(FR-006 정상 흐름 ①~③, 초대 맥락과 무관하게 항상
 * 같은 상호작용).
 *
 * 데이터 조회가 있지만 `*Container.tsx`로 분리하지 않았다 — 이 컴포넌트는 **초기 props로
 * 받을 데이터가 없다**(검색 전에는 아무 결과도 없다). D-030 ①의 "표현/컨테이너 분리"는
 * 서버가 미리 조회해 내려주는 데이터를 다루는 컴포넌트에 적용되는 규칙이고, 이 검색은
 * `SignupForm`이 핸들 중복 검사를 Server Action으로 직접 호출하는 것과 같은 성격의 상호작용이다.
 *
 * `/sample`(Task 015B)은 이 컴포넌트를 실제 인터랙션으로 그대로 등록한다 — 검색은 읽기 전용
 * 조회라 회원가입 폼과 달리 잘못 눌러도 부작용(리다이렉트·Mock 데이터 생성)이 없다.
 *
 * **결과 슬롯은 항상 마운트된 `aria-live="polite"` 컨테이너다**(6일차 교차검증 W-3, DESIGN).
 * 검색 전에는 비어 있고 결과가 생기면 그 안의 내용만 바뀐다 — 컨테이너 자체를 조건부로
 * 마운트하면 일부 보조기술이 새로 생긴 라이브 리전의 첫 콘텐츠를 놓친다. `UserSearchResult`는
 * 이 컨테이너 안에서만 쓰이므로 자신은 `role="status"`를 갖지 않는다(중첩 이중 발화 방지).
 */
export function UserSearchField({ renderResultFooter }: UserSearchFieldProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SearchStatus>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const handle = query.trim();
    if (!handle) return;

    setStatus({ kind: "searching" });
    startTransition(async () => {
      const result = await searchUserByHandleAction(handle);
      setStatus({ kind: "done", result });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <Field className="flex-1">
          <FieldLabel htmlFor="user-search-handle">{strings.account.search.fields.handle}</FieldLabel>
          <Input
            id="user-search-handle"
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setStatus({ kind: "idle" });
            }}
            placeholder={strings.account.search.fields.placeholder}
            autoComplete="off"
          />
        </Field>
        <Button type="submit" disabled={isPending || query.trim().length === 0}>
          {isPending ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : (
            <SearchIcon aria-hidden="true" />
          )}
          {isPending ? strings.account.search.submitPending : strings.account.search.submit}
        </Button>
      </form>

      <div aria-live="polite" aria-atomic="true">
        {status.kind === "done" && !status.result.found && status.result.rateLimited ? (
          <Alert variant="destructive">
            <AlertTriangleIcon aria-hidden="true" />
            <AlertDescription>{strings.account.search.rateLimited}</AlertDescription>
          </Alert>
        ) : (
          status.kind === "done" && (
            <UserSearchResult
              result={status.result}
              footer={status.result.found ? renderResultFooter?.(status.result) : undefined}
            />
          )
        )}
      </div>
    </div>
  );
}
