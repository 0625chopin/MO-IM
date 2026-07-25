"use client";

import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { subscribeToRoom } from "@/lib/realtime";

/** 존재하지 않는 크루 id — 로그인 여부와 무관하게 `private.is_active_crew_member`가 항상
 *  false를 반환해 Realtime Authorization이 항상 거부한다(029B §6.2). 실제 구독 인가 거부를
 *  재현하는 살아있는 데모라 정적 문구가 아니라 실제 `subscribeToRoom` 호출 결과를 보여준다. */
const BOGUS_TOPIC = "crew:00000000-0000-0000-0000-000000000000:chat";

type DemoState = { kind: "connecting" } | { kind: "denied"; message: string };

/**
 * D-030 ③ "오류" 상태에 도메인 오류(Realtime Authorization 거부)를 실측으로 포함하기 위한
 * 데모(Task 033, 19일차). `/sample`의 다른 항목과 달리 정적 JSX가 아니라 실제
 * `subscribeToRoom(BOGUS_TOPIC, ...)` 호출 하나를 마운트 시 실행하고, `onError` 콜백이
 * 실제로 무엇을 돌려주는지 그대로 화면에 옮긴다 — Mock으로 흉내 낸 오류가 아니라 실
 * `realtime.messages` RLS(029B)가 거부하는 것을 브라우저가 직접 겪는 장면이다. 19일차
 * 실측(Node E2E 스크립트, `docs/decisions/realtime-broadcast-033.md` §6)에서 같은 정규식
 * 패턴(무작위 crew id)이 `CHANNEL_ERROR`로 거부됨을 이미 확인했다 — 이 컴포넌트는 그 사실을
 * 브라우저에서도 재현한다.
 */
export function RealtimeAuthErrorDemoContainer() {
  const [state, setState] = useState<DemoState>({ kind: "connecting" });

  useEffect(() => {
    const unsubscribe = subscribeToRoom(
      BOGUS_TOPIC,
      () => {
        // 이 토픽에는 애초에 아무도 방송하지 않으므로 실제 이벤트를 받을 일은 없다.
      },
      (error) => {
        setState({ kind: "denied", message: error.message });
      },
    );
    return unsubscribe;
  }, []);

  if (state.kind === "connecting") {
    return (
      <Alert>
        <AlertTitle>구독 시도 중…</AlertTitle>
        <AlertDescription>존재하지 않는 크루 토픽을 실제로 구독해 보는 중입니다.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>구독 인가 거부됨 (실측)</AlertTitle>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}
