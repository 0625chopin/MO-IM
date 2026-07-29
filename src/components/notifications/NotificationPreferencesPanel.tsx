"use client";

import { useState, useTransition } from "react";

import type {
  CrewMuteViewModel,
  NotificationPreferencesViewModel,
  NotificationTypeToggleViewModel,
} from "@/components/notifications/notification-preference-view-models";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Switch } from "@/components/ui/switch";
import {
  updateCrewNotificationMuteAction,
  updateGlobalNotificationTypePreferenceAction,
} from "@/lib/actions/update-notification-preference";
import { strings, t } from "@/lib/strings";

export interface NotificationPreferencesPanelProps {
  viewModel: NotificationPreferencesViewModel;
}

/**
 * FR-072 알림 환경설정 표현 컴포넌트(D-030 ①) — `lib/data`를 참조하지 않고 컨테이너가 이미
 * 조인한 `NotificationPreferencesViewModel`만 받는다. 두 섹션(유형별·크루별)을 그린다.
 *
 * **로컬 상태를 서버 응답 없이 낙관적으로 먼저 뒤집는다.** `PollEarlyCloseControl` 류(Dialog
 * 확인 후 결과가 `refresh()`로 되돌아오는 파괴적 행위)와 달리, 스위치는 즉시 피드백이 없으면
 * "눌렀는데 반응이 없다"로 느껴지는 UI라 로컬 `useState`로 먼저 반영하고, 실패하면 되돌린다
 * (전형적인 설정 토글 패턴 — 이 화면 자체가 표시하는 상태와 서버 상태가 어긋날 위험이 낮다:
 * 본인만 쓰는 자기 소유 설정값이라 동시 수정 충돌 개념이 없다).
 */
export function NotificationPreferencesPanel({ viewModel }: NotificationPreferencesPanelProps) {
  const [types, setTypes] = useState(viewModel.types);
  const [crews, setCrews] = useState(viewModel.crews);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleTypeToggle(target: NotificationTypeToggleViewModel, nextEnabled: boolean) {
    if (target.mandatory) return; // AC3 — 스위치 자체가 disabled라 정상 흐름에서는 도달하지 않는다.
    setErrorMessage(null);
    setTypes((prev) =>
      prev.map((item) => (item.type === target.type ? { ...item, enabled: nextEnabled } : item)),
    );
    startTransition(async () => {
      const result = await updateGlobalNotificationTypePreferenceAction(target.type, nextEnabled);
      if (!result.ok) {
        setTypes((prev) =>
          prev.map((item) => (item.type === target.type ? { ...item, enabled: !nextEnabled } : item)),
        );
        setErrorMessage(result.error.message || strings.account.settings.notifications.errors.updateFailed);
      }
    });
  }

  function handleCrewToggle(target: CrewMuteViewModel, nextMuted: boolean) {
    setErrorMessage(null);
    setCrews((prev) =>
      prev.map((item) => (item.crewId === target.crewId ? { ...item, muted: nextMuted } : item)),
    );
    startTransition(async () => {
      const result = await updateCrewNotificationMuteAction(target.crewId, nextMuted);
      if (!result.ok) {
        setCrews((prev) =>
          prev.map((item) => (item.crewId === target.crewId ? { ...item, muted: !nextMuted } : item)),
        );
        setErrorMessage(result.error.message || strings.account.settings.notifications.errors.updateFailed);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          {strings.account.settings.notifications.typeSection.title}
        </h3>
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {types.map((item) => (
            <li key={item.type} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm text-foreground">{item.label}</span>
                {item.mandatory && (
                  <span className="text-xs text-muted-foreground">
                    {strings.account.settings.notifications.mandatoryHint}
                  </span>
                )}
              </div>
              <Switch
                checked={item.enabled}
                disabled={item.mandatory}
                onCheckedChange={(checked) => handleTypeToggle(item, checked)}
                aria-label={item.label}
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">
          {strings.account.settings.notifications.crewSection.title}
        </h3>
        {crews.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{strings.account.settings.notifications.crewSection.empty}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {crews.map((crew) => (
              <li key={crew.crewId} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-sm text-foreground">{crew.crewName}</span>
                <Switch
                  checked={!crew.muted}
                  onCheckedChange={(checked) => handleCrewToggle(crew, !checked)}
                  aria-label={t((s) => s.account.settings.notifications.crewSection.muteToggleLabel, {
                    crewName: crew.crewName,
                  })}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {errorMessage && <p className="text-sm text-destructive">{errorMessage}</p>}
    </div>
  );
}
