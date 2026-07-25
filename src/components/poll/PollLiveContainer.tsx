"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { getCrewPollsTopic } from "@/components/poll/poll-topic";
import { describeRealtimeError, subscribeToRoom } from "@/lib/realtime";
import type { Id } from "@/lib/types";

export interface PollLiveContainerProps {
  crewId: Id;
  pollId: Id;
  children: React.ReactNode;
}

function payloadMatchesPoll(payload: unknown, pollId: Id): boolean {
  if (typeof payload !== "object" || payload === null || !("pollId" in payload)) return true;
  return (payload as { pollId: unknown }).pollId === pollId;
}

/**
 * 투표 실시간 갱신 구독 컨테이너(D-030 ①②, Task 033, FR-042 AC2). `PollPanelContainer`(서버
 * 컴포넌트)가 이미 판정을 끝낸 `PollPanel`을 그대로 자식으로 감싼다 — 이 컨테이너는 렌더링에
 * 관여하지 않고 "언제 다시 조회할지"만 결정한다(`MessageRoomContainer` → `PollPanelContainer`와
 * 달리, 집계·정족수·D-031 은닉 판정은 전부 서버에 남아 있어야 하므로(NFR-036) 클라이언트가
 * 직접 집계를 갱신하지 않는다).
 *
 * DB 트리거(`poll_votes_broadcast`·`polls_broadcast`)는 "이 투표가 바뀌었다"는 가벼운 핑
 * (`{pollId}`)만 보낸다 — 받으면 `router.refresh()`로 `PollPanelContainer`를 서버에서 다시
 * 실행해 `poll_vote_tally` RPC·`lib/rules` 순수 함수(정족수·D-031 은닉 등)를 그대로 재사용한다
 * (CLAUDE.md D-030 "Server Action + refresh()" 패턴을 실시간 갱신에도 적용). 짧은 시간에 표가
 * 몰리면(같은 투표에 여러 명이 거의 동시에 투표) refresh 호출이 겹치지 않도록 300ms
 * 디바운스한다.
 */
export function PollLiveContainer({ crewId, pollId, children }: PollLiveContainerProps) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const topic = getCrewPollsTopic(crewId);
    const unsubscribe = subscribeToRoom(
      topic,
      (event) => {
        if (event.type !== "poll_tally_updated" || event.roomId !== topic) return;
        if (!payloadMatchesPoll(event.payload, pollId)) return;
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), 300);
      },
      (error) => {
        // `cause`(supabase-js 원본 소켓 에러) 노출 폭을 줄인다 — MessageRoomContainer와 같은
        // 이유(19일차 CORE 교차검증 후속, `docs/decisions/realtime-broadcast-033.md` §8-후속①).
        console.error("[poll] realtime subscription error", describeRealtimeError(error));
      },
    );
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      unsubscribe();
    };
  }, [crewId, pollId, router]);

  return <>{children}</>;
}
