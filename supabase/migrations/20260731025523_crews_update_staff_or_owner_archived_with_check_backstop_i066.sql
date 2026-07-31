-- I-066 잔여 범위 — crews_update_staff_or_owner(RLS, "누가" crews를 UPDATE할 수 있는지)에
-- archived 방어를 WITH CHECK 한 곳에만 이중화한다. join_requests_update_requester_or_staff가
-- 쓰는 패턴(USING·WITH CHECK 양쪽에 private.is_crew_active)을 그대로 옮기지 않는다 — 35일차
-- 실측(docs/design/crews-archived-defense-35/README.md §4.0)으로 USING에 넣으면 archived
-- 크루 UPDATE가 RLS 스캔 단계에서 조용히 0행 처리되어 crews_guard_archived_immutable 트리거가
-- 아예 발동하지 않게 됨을 확인했다 — 그 결과 지금은 명시적 P0001(FR-013, I-066)로 실패하는
-- updateCrewInfo/updateCrewVisibility 시도가, USING까지 이중화하면 err("not_found", ...)로
-- 바뀐다(크루가 존재하는데 "찾을 수 없다"는 잘못된 오류 — updateCrewInfo/updateCrewVisibility의
-- `if (error) return err("forbidden"); if (!data) return err("not_found");` 순서 때문이다).
--
-- WITH CHECK만 추가하면 이 비용이 사라진다 — USING이 행을 거르지 않으므로 archived 크루도
-- 여전히 스캔되고, BEFORE UPDATE 트리거(crews_guard_archived_immutable)가 WITH CHECK보다
-- 먼저 실행돼 오늘과 똑같이 P0001로 막는다(35일차 실측: 대조군과 결과 완전히 동일, 비용 0).
-- 이 WITH CHECK 조건이 실제로 발화하는 것은 오직 그 트리거가 사라지거나(회귀) 우회되는
-- 시나리오뿐이다 — 그때는 42501("new row violates row-level security policy")로 즉시·자동
-- 방어한다(같은 문서 §4.1, 트리거를 트랜잭션 안에서 disable하고 실측 확인). 즉 이 이중화는
-- "오늘은 아무것도 안 바꾸고, 트리거가 미래에 조용히 무력화됐을 때만 발동하는 보험"이다.
--
-- USING까지 건드리지 말 것 — 다음에 이 정책을 또 고치는 사람은 "왜 반쪽만 넣었지" 하고
-- WITH CHECK 조건을 USING에도 마저 넣고 싶어질 수 있다. 넣으면 위에서 설명한 조용한 0행이
-- 실제로 재현된다(35일차 CREW·BOARD가 독립적으로 각각 실측 확인, 팀장 조건부 승인).
-- 적용된 이 파일은 이후 절대 사후 편집하지 않는다(I-167 — 주석 한 글자도 안 된다).
alter policy "crews_update_staff_or_owner" on public.crews
  with check (
    id in (
      select cm.crew_id from public.crew_memberships cm
      where cm.profile_id = (select auth.uid()) and cm.status = 'active' and cm.role in ('staff', 'owner')
    )
    and private.is_crew_active(id)
  );
