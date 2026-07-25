# 19일차 작업 로그 (2026-07-25)

## 회차 요약

- 활성 팀원: **4명 전원**. 로드맵 Task는 **BOARD 033**·**CREW 040** 2건이고, 담당 Task가 없던 **CORE**·**DESIGN**에는 18일차 워크로그가 "19일차 착수 전에 확인할 것"으로 남긴 두 건(I-058 해소 / 미검증 인증 왕복 4항목 브라우저 검증)을 팀장이 추가 배정했다.
- 이번 회차 배치 근거: 완료 집합 {Task 001~032 전량 · 035 · 038 · 039} 기준으로 의존·선행 대기가 모두 풀린 미완료 Task는 **033**·**041**(BOARD)·**040**·**042A**(CREW) 4건이었고, 1인 1건 폭 제한으로 각 담당자의 주차 순번이 앞인 **033**·**040**을 골랐다. CORE의 잔여 044는 Task 036 의존, DESIGN의 036·042B·045는 전부 033/034/042A 의존이라 미개시 상태였다.
- 결과: **완료 Task 2건(033 · 040)** + **추가 배정 6건 완료**(I-058 해소 · 인증 왕복 검증 4항목 · I-066 · I-067 · I-069 조사 · I-060/061/068 수정). 이슈 **major 3 · minor 다수 발견, 전건 해소**. `docs/ISSUES.md` 신규 등재 **10건**(I-060~I-069), 그중 **7건을 같은 회차에 닫았다**(I-060·061·062·064·066·067·068). 결정 신규 **2건**(D-045 · D-046). 마이그레이션 **8건** 적용. 전체 테스트 3종 통과(**4회 실행**) + 프로덕션 서버 **2회 재빌드·재기동** 후 런타임 확인.
- **이번 회차의 성격**: 18일차가 "비즈니스 규칙이 앱 레이어에만 있고 DB에는 없다"를 다섯 번 드러냈다면, 19일차는 **"원격 DB와 저장소가 어긋난다"** 를 세 번 드러냈다. 셋 다 `apply_migration`이 로컬 파일을 만들지 않는 I-051의 파생이고, 그중 하나는 **저장소만 보면 보안 구멍이 되살아나는 상태**였다. 자세히는 아래 "이번 회차가 드러낸 구조적 문제".

## 팀원별 완료 내역

### BOARD (04.BOARD.md)

- 완료 Task: **033 · Realtime Broadcast 연결**
- 산출물:
  - 마이그레이션 1건 — `20260725085443_realtime_broadcast_triggers_033`(트리거 4개: `chat_messages_broadcast`·`notifications_broadcast`·`poll_votes_broadcast`·`polls_broadcast`)
  - 신설 — `src/lib/realtime/get-realtime-auth-token.ts`, `src/components/chat/chat-topic.ts`, `src/components/poll/{poll-topic.ts,PollLiveContainer.tsx}`, `src/components/sample/sections/RealtimeAuthErrorDemoContainer.tsx`, `src/components/crews/ArchivedCrewBanner.tsx`
  - 수정 — `src/lib/realtime/{broadcast,index,types}.ts`, `MessageRoomContainer.tsx`·`PollPanelContainer.tsx`·`notification-channel.ts`·`simulate-notification-event.ts`·`use-notification-feed.ts`·`ToastHostContainer.tsx`, `(app)/crews/[crewId]/layout.tsx`, `BoardListContainer`·`PostWriteContainer`·`MessageListContainer`, `eslint`/문자열/`sample` 섹션
  - `docs/decisions/realtime-broadcast-033.md`(+ "§8-후속" 절), `ops-foundation-038.md` 보강, 신규 결정 **D-045**, 신규 이슈 **I-063**·**I-064**
- 실측 수치: 실 계정 2개로 **진짜 소켓·진짜 INSERT** E2E — 구독 인가 **6/6** 기대 일치(소속 크루 채팅·투표 SUBSCRIBED / 비소속·존재하지 않는 크루·타인 알림 토픽 **CHANNEL_ERROR**), 채팅 실전달 **188ms**(표본 1건, p95 아님), 알림 실전달 확인(ms는 clock skew로 미측정). **JWT 만료를 실제 토큰 디코드로 실측**(`exp - iat = 3600초`) — 팀장·CORE가 "1시간 가정"으로 두었던 값을 사실로 바꿨다. I-066 SQL↔UI 정합성 독립 회귀 **5/5**(활성 크루 글쓰기 성공 / 해산 크루 글쓰기·채팅 발신 RLS 거부 / 해산 크루 게시판·채팅 **열람 성공**).
- 비고:
  - **Mock 단계 토픽 문자열이 029B RLS 정규식과 애초에 맞지 않았다**(`notification:{id}`·`chat_rooms.id`) — 실데이터에서는 항상 거부됐을 잠복 결함을 실측으로 발견해 크루 기준 토픽으로 통일했다.
  - **httpOnly 세션(NFR-010)과 Realtime Authorization이 Supabase 아키텍처 수준에서 충돌한다**는 것을 처음 드러냈다(브라우저가 JWT를 직접 쥐어야 사설 채널이 열린다). Server Action으로 `access_token`만 최소 노출해 해소(**D-045**) — 팀장이 `refresh_token` 미포함·저장소 미사용을 실측 확인했다.
  - D-045 문서에 **"팀장 재검토 대상으로 남긴다 / 더 나은 대안은 검토하지 않았다"** 를 스스로 적었고, 그 덕에 CORE 교차검증이 정확히 그 각(오류 로깅 유출·재호출 주기·초단기 토큰 대안)을 파고들 수 있었다.
  - 후속 3건 처리: 지적받지 않은 `use-notification-feed.ts`·`ToastHostContainer.tsx`까지 같은 노출 경로라 함께 고쳤고, `refreshAuth` 재시도(5초·30초·2분)를 넣은 뒤에도 **"극단적으로 실패가 겹치면 이론상 완전 차단은 아니다"** 를 §8-6에 남겼다.
  - I-066 UI 절반에서 **RSC 제약**(레이아웃이 `children`에 값을 주입할 수 없다)을 정확히 진단해 "알림은 공통 1곳 + 쓰기 차단은 각 컨테이너"로 나눴다. 기존 `canWrite`/`canSend` prop을 재사용해 표현 컴포넌트(`BoardList`·`Composer`)를 수정하지 않았다(D-030 ①).

### CREW (03.CREW.md)

- 완료 Task: **040 · 크루 생애주기 (FR-013 해산 · FR-025 오너 이양 · FR-027 강퇴)**
- 산출물:
  - 마이그레이션 4건 — `20260725085454_crews_guard_owner_transfer_target_active` · `085508_crew_memberships_invalidate_votes_on_removal` · `085528_disband_crew_function` · `093855_disband_crew_move_to_private_wrapper`
  - 신설 — `src/lib/actions/{transfer-crew-ownership,remove-crew-member,disband-crew}.ts`, `src/components/crews/DisbandCrewForm.tsx`
  - 수정 — `src/lib/data/supabase/crew.ts`, `MemberList`·`CrewMembersContainer`·`CrewSettingsContainer`·`crew-member-view-models`, `permission.types.ts`(`targetRole`이 `UserRole`로 잘못 선언돼 있던 것을 `CrewMembershipRole`로 — Task 009B 이후 첫 실사용에서 발견), `notification.types.ts` + 소비처 4곳, `strings/ko.ts`, `sample/sections/crews.tsx`, `src/lib/audit/audit-log.ts`(팀장 승인 하에 `AuditAction` 3값 순수 추가)
  - I-061 수정 — `restore-account.ts`·`deactivate-account.ts`·`disband-crew.ts`·`leave-crew.ts`·`create-crew.ts` **5개 파일**의 `refresh()` 누락
  - I-068 수정 — `ko.ts` 탈퇴 카피 시점 정정
  - `docs/decisions/crew-lifecycle-040.md`, 신규 결정 **D-046**, 신규 이슈 **I-066**·**I-067**
- 실측 수치: 합성 데이터로 **10개 시나리오** 전부 PASS. 앱 우회 2건 — 비소속 외부인에게 직접 `crews.owner_id` PATCH → 트리거가 `ownership can only transfer to an active crew member (FR-025 E1)`로 거부 / `anon`의 `disband_crew` 직접 호출 → `permission denied for function disband_crew`(42501). 해산 성공 시 `cancelled_polls=1, cancelled_meetups=1, purged_messages=1`, 재조회로 크루 `archived`·투표 `cancelled`·미래 Meetup `cancelled`·**과거 Meetup은 `confirmed` 그대로**(AC2)·채팅 0건 확인. 2단 구조 재구성 후 3케이스 재실행으로 동작 불변 확인.
- 비고:
  - **`disband_crew`가 신규 advisor WARN을 만들었다** — `authenticated`에 노출된 RPC 6개 중 이것만 SECURITY DEFINER 직접 노출이었다(팀장 `pg_proc` 전수 대조로 발견). 029B가 이 WARN을 구조적으로 없애려 세운 `private` DEFINER + `public` INVOKER 2단 구조로 재구성해 **신규 WARN 0건 기준선을 복구**했고, "최초 설계에서 WARN을 의도된 것으로 본 판단이 틀렸다"를 정정 형태로 남겼다.
  - **I-061 점검에서 지시 범위를 실제로 수행해 4곳을 추가로 찾았다.** 더 중요한 발견은 `leave-crew.ts:25`의 docstring이 **틀린 가정("`refresh()` 대신 `redirect()`를 쓴다")을 주석으로 복제하며 퍼뜨렸다**는 것 — `disband-crew.ts`가 그 복제본이었다. Next 16 문서를 먼저 읽어 "`redirect()`는 예외를 던지므로 `refresh()`는 반드시 그 앞"이라는 근거를 확보했다(팀장이 `refresh.md`로 재확인).
  - I-061 기록에서 **"배선 수정"과 "증상 확인"을 섞지 않았다** — DESIGN이 실제 증상을 관찰한 `restore-account.ts` 1건과 문서 근거로 선제 수정한 4건을 구분해 적었다.
  - `crew.disbanded`의 `targetId`는 팀장이 `actorId` 안을 반려하고 **`crewId`** 로 정정시켰다("누가 누구에게" 축이 무너진다).
  - 신규 결정 **D-046**: 오너 이양 UI를 SC-15 원문의 크루 설정이 아니라 **멤버 관리 화면**에 둔다(이양 대상이 "이미 아는 크루원 중 한 명"이라 핸들 검색이 더 번거롭고 `MemberList`가 이미 역할 정렬 목록을 갖고 있다).

### CORE (01.CORE.md) — 담당 Task 없음, 추가 배정 2건

- 완료 Task: **없음**(잔여 044가 Task 036 의존이라 미개시). 대신 **I-058 해소**(팀장 추가 배정) + **I-066 SQL 절반** + **BOARD 033 교차검증**.
- 산출물:
  - 마이그레이션 3건 — `20260725085327_profiles_narrow_select_policy_and_public_profile_rpcs` · `090854_profiles_drop_public_handle_lookup_rpc_i058_major1` · `094141_crews_block_writes_in_archived_crew_i066`
  - 수정 — `src/lib/data/supabase/profile.ts`·`database.types.ts`, `src/lib/actions/{search-user-by-handle,check-handle-availability}.ts`, `src/lib/rules/handle-search.ts`
  - `docs/decisions/rls-policies-029b.md` §16·§17·§17.6·§18 신설, `docs/ISSUES.md` I-058 재작성 + 신규 **I-062**·**I-065**, `docs/prioritization-and-risks.md` R-012에 19일차 단락 추가
- 실측 수치:
  - I-058 — 벌크 덤프 `authenticated` 기준 **21행 → 1행**, 타인 행 직접 select **0행**, self 행 전 컬럼 유지, `authenticated`로 삭제된 RPC 호출 시 **`42883 undefined_function`**, `anon`은 이전과 동일하게 전면 차단, `get_advisors(security)` 신규 WARN 0건.
  - I-066 — 회귀 **9/9**(활성 크루 게시글·댓글·채팅·가입신청 4건 성공 / 해산 크루 5건 전부 RLS 거부), `begin`…`rollback` 후 잔여 0행.
  - 033 교차검증 — 토픽 문자열이 정책 정규식(`^crew:[0-9a-fA-F-]{36}:(chat|polls)$` 등)과 바이트 일치, 트리거 4개 전부 DEFINER·`search_path=""`·소유자 `postgres`·EXECUTE는 `postgres`·`service_role`만, 구독 거부 6개 시나리오를 **다른 계정·다른 크루 조합으로 독립 재현** 6/6.
- 비고:
  - **I-058 1차 수정이 같은 구멍을 새 자리에 다시 만들었다** — `public.get_profile_public_by_handle`가 `authenticated` EXECUTE + `STABLE`(부수효과 불가라 리밋 기록이 구조적으로 불가능) + 6필드 반환(`search_opt_out` 포함)이라 D-005·R-012·FR-006 옵트아웃이 그 경로에서 그대로 열려 있었다(팀장 발견, major ①). **옵션 (b)를 택해 내부 handle→id 재해석은 service-role로, FR-006 검색은 리밋이 걸린 `profile_search`로 완전 분리**하고 해당 RPC를 양쪽 스키마에서 삭제했다.
  - **그 수정이 다른 경로를 활성화했다**(팀장 발견, major ②) — `check-handle-availability.ts`가 미인증 blur 호출인데 service-role 경로가 되어 정상 동작하지만 무제한 핸들 존재 오라클이 됐다. **I-065로 등재하고 이번 회차에 구현하지 않는 판단**을 내렸다: `HANDLE_SEARCH_RATE_LIMIT`(20/60)은 **계정당·인증** 위협모델의 D-005 승인값이라 **IP당·익명** 위협모델에 숫자만 옮기면 그 자체가 근거 없는 값이 되고, Task 039도 같은 이유로 비밀번호 재설정 리밋을 Supabase 내장에 위임했다는 선례를 찾았다.
  - **I-066에서 기존 헬퍼 확장 안을 기각한 근거가 이 작업의 성패를 갈랐다** — `private.is_active_crew_member`는 읽기 경로(동료 멤버십 조회·`poll_vote_tally`·Broadcast 구독 인가·`respond_meetup_attendance`)에서도 쓰여서 거기에 `crews.status`를 넣으면 **해산 크루의 과거 열람까지 막혀 FR-013 AC2를 위반**했을 것이다. 새 헬퍼 `private.is_crew_active`로 우회했다.
  - **로컬 마이그레이션 파일 누락 사고**(아래 "구조적 문제" 참고)를 냈고, 팀장 지적 후 `supabase_migrations.schema_migrations`의 `statements`와 **바이트 단위 대조**로 복구했다. 그 절차를 §17.6에 남겼고 이후 회차 표준이 됐다.
  - 역할 분담 서술이 이번 회차 문서 중 가장 정확하다: **"지금 이 순간도 UI는 폼을 보여주지만 제출은 RLS로 막힌다 — 데이터 무결성은 이미 확보, UX만 남음."**

### DESIGN (02.DESIGN.md) — 담당 Task 없음, 추가 배정 3건

- 완료 Task: **없음**(036·042B·045가 전부 033/034/042A 의존이라 미개시). 대신 **18일차 미검증 인증 왕복 4항목 브라우저 검증** + **I-060 수정** + **CORE I-058 교차검증** + **18일차 마이그레이션 파일 3건 rename**.
- 산출물:
  - `docs/decisions/auth-roundtrip-verification-019.md`(재현 절차·타임라인·§7 시점 재구성)
  - 수정 — `src/components/shell/HeaderNav.tsx`(`getSessionErrorBannerMessage` 헬퍼 신설, exhaustive switch), `src/lib/strings/ko.ts`(`error.deactivated` 추가), `sample/sections/shell.tsx`(`SESSION_DEACTIVATED` 변형)
  - `docs/ISSUES.md` — 신규 **I-060**·**I-061**·**I-068**, I-057 19일차 각주, I-051 후속 추가
  - 마이그레이션 rename 3건 — `073553`·`073702`·`074122`(18일차 Task 032 산출물, 원격 version과 어긋나 있던 것)
- 실측 수치: 4항목 중 **3항목 PASS**(① 레이트 리밋 429 UI 08:50:40 / ② `requested` 대상 초대 차단 08:52:36 / ③ 탈퇴→복구 클릭 왕복 — `status='deactivated'` → 재로그인 시 `/account/restore` 자동 유도 → 복구 후 `status='active', deactivated_at=null` 원복). ④ 비밀번호 재설정 메일은 **검증 불가**(Gmail 수신함 접근 수단 없음 — GoTrue `POST /recover` 200·`user_recovery_requested`까지만 확인, I-057 열림 유지).
- 비고:
  - **팀장의 잘못된 통보를 근거로 반박해 재작업을 막았다.** 팀장이 CORE의 정책 변경 시각을 "09:00 무렵"(실은 idle 통지 시각)이라고 통보하며 ①②를 무효 처리하라고 지시했는데, DESIGN이 `list_migrations`로 실제 version이 **`20260725085327`(08:53:27 UTC)** 임을 확인하고 자기 증거 시각(08:50:40·08:52:36)이 그보다 앞선다는 것을 논증했다. 팀장이 독립 확인 후 정정했다.
  - **I-060**: `HeaderNav.tsx:86-88`의 `reason` 이분법이 Task 039가 추가한 `deactivated`를 못 받아 탈퇴 유예 사용자에게 "연결에 문제가 있어요"(네트워크 오류)를 표시했다. `default` 분기에서 `never` 대입으로 **유니온 확장 시 컴파일 타임에 걸리게** 고쳐 재발 경로 자체를 없앴고, 배너 유지 여부를 **페이지별로 확인해 나눴다**(`/account/restore`는 본문이 이미 안내하므로 숨김, `/login`·`/reset-password`는 본문 안내가 없어 유지 + 문구 정정) — 팀장이 제시한 두 안을 그대로 따르지 않고 코드로 확인해 더 나은 배선을 택했다.
  - **I-068**: 팀장의 "UUID를 알아야 하므로 위험 낮음" 프레임을 반박했다. `request_account_deactivation()`은 `display_name`을 건드리지 않고 `anonymize_expired_deactivated_profiles()`가 30일 후에만 갱신하는데, 탈퇴 확인 카피(`ko.ts:667`)가 시점 없이 "작성자는 '탈퇴한 사용자'로 표시돼요"라고 약속한다 — **공격이 필요 없이 통상 동작으로 노출되는 축**이고, RPC 설계는 D-044와 맞으므로 카피 문제로 좁혔다.
  - CORE 교차검증 5관점 중 ⓔ에서 `createSupabaseServiceRoleClient`를 쓰는 **다른 5개 파일 전수 확인**으로 동형 경로 없음을 결론지었다(`lockout.ts`는 호출자 자신의 identifier만, `notification.ts`는 쓰기 전용).

## 교차검증 결과

- **CORE → BOARD (Task 033)**: **5개 항목 전건 PASS, 신규 이슈 0건.** 토픽↔정책 정합·트리거 권한·구독 거부 6/6 독립 재현·D-045 3개 각·I-063 심각도. 발견 2건(콘솔 `cause` 노출 폭·`refreshAuth` 재시도 부재)은 새 이슈로 올리지 않고 D-045·§8-6에 종속시켰다 — 팀장도 그 판단에 동의했다.
- **BOARD → CREW (Task 040)**: **8개 항목 전건 PASS, blocking 0건.** 감사 로그 3종·해산 `status` 전이·단일 RPC 원자성·앱 우회 거부 독립 재현(**에러 문자열 글자 단위 일치**)·알림 파일 3개 병합·`/sample` 4상태. `crew.disbanded`가 명사 없는 형태인 것을 오타가 아니라 `poll.closed_early`와 같은 패턴으로 판정하고 **그것이 `targetId=crewId` 정정과 논리적으로 맞물린다**는 것까지 연결했다. I-066·I-067 서술을 보강해 **"API 우회 필요"가 아니라 "평상시 UI 클릭으로 재현"** 임을 밝혔다.
- **DESIGN → CORE (I-058)**: ⓐⓑⓓⓔ PASS, **ⓒ에서 판단이 갈려 I-068을 새로 냈다**(위 참고). ⓑ에서 소비처 6곳을 실제로 열어 "RPC 반환이 필요 필드의 상위집합"임을 논증해 조용한 실패 0건을 결론지었다.
- **BOARD → CORE (I-066 SQL↔UI 정합)**: 5/5 PASS. CORE의 헬퍼가 읽기 정책에 들어가지 않은 설계를 코드로 확인했다.

## 발견·해결한 이슈

**major 3건 (전부 팀장 발견)**

1. [CORE] I-058 1차 수정의 `public.get_profile_public_by_handle`가 **무제한 핸들 오라클**이었다(`STABLE`이라 리밋 기록이 구조적으로 불가능, `search_opt_out`까지 반환) → 옵션 (b)로 내부용/검색용을 분리하고 RPC를 양쪽 스키마에서 삭제 (실측 `42883`)
2. [CORE] 그 수정이 `check-handle-availability.ts`(미인증 blur 호출)를 활성화해 **미인증 무제한 핸들 존재 오라클**이 됐다 → I-065 등재, 리밋 숫자 근거 부재를 이유로 이번 회차 미구현(팀장 승인, 사용자 판단 대기)
3. [CORE] **`090854` 마이그레이션의 로컬 파일이 없어 저장소만 보면 취약 RPC가 되살아나는 상태**였다(`085327`이 생성하고 후속 삭제 파일이 없음) → 원격 `statements`와 바이트 대조해 복구, 절차를 §17.6에 명문화

**DESIGN이 브라우저 검증에서 발견한 2건 — 둘 다 이번 회차 최대 성과다**

4. **I-067 · FR-013 AC2가 화면에서 깨져 있었다**(위 "브라우저 검증" 참고) → CREW(데이터 레이어)·DESIGN(렌더링) 절반씩 수정, 재검증 4/4 PASS. **DB 실측이 통과했는데 화면은 FAIL이었다** — CREW의 SQL 실측(미래 `cancelled`·과거 `confirmed` 유지)은 정확했고, 그 데이터를 화면에 올리는 경로가 크루 상태로 걸렀다.
5. **I-069 · 프로덕션 빌드에서 서버 컴포넌트가 던진 `cause:{code}` 도메인 오류가 전부 "네트워크 오류"로 분류된다** → 팀장이 Next.js 16 공식 문서로 **확정**(`error.md:110-111` — "Errors forwarded from Server Components show a generic message with an identifier. This is to prevent leaking sensitive details."). **`cause`는 프로덕션에서 클라이언트로 넘어가지 않으며 이건 Next.js의 의도된 보안 동작이다.** BOARD가 실행 throw **8곳/7파일**을 도달 가능성 3등급으로 인벤토리했고(그중 **`CrewSettingsContainer`는 일반 크루원이 `/settings`에 직접 접근하면 항상 도달** — 새로 찾은 최고 도달성 경로), 미분류 fallback을 `network`(원인 단정) → 새 kind `unknown`(원인 불명)으로 분리해 **오안내만 먼저 막았다**. 근본 해결(8곳 재작업 또는 `forbidden()` 도입)은 20일차 이월.
   - **DESIGN이 "매우 유력, 미확정"으로 남긴 것이 옳았다** — 서버 콘솔은 팀장만 볼 수 있어 DESIGN이 단정하면 틀린 확신이 됐을 것이다.
   - **I-044(7일차)가 이 지점을 "정상 렌더 확인"이라고 적은 것은 틀리지 않았다 — `npm run dev` 기준이었다.** 이번이 사실상 최초의 프로덕션 빌드 기준 `cause` 분류 검증이다.
   - BOARD가 **I-052·I-059와 "다른 뿌리"로 판정**했다(I-052=`notFound()`의 HTTP 200, I-059=레이아웃·페이지 병렬 렌더의 콘솔 부작용, I-069=Next.js의 의도적 `cause` 제거). 묶으면 각자 다른 해법이 필요하다는 게 가려진다는 근거다.
   - **기존 결정의 전제가 무너졌다**: BOARD가 조사 중 **D-040(18일차, CREW)이 이미 `forbidden()`/`unauthorized()`/`authInterrupts`를 검토하고 "실험적 API 리스크"로 기각해 뒀다**는 것을 찾아냈고, 그 결정의 **"이유 3(지금 당장 사용자 영향 없음)"이 I-069로 무효화됐다.** 결정을 임의로 바꾸지 않고 재검토 각주만 남겼다.

**팀장이 발견한 그 외**

- **`disband_crew`가 신규 advisor WARN을 만들었다** — `authenticated` 노출 RPC 6개 중 유일한 SECURITY DEFINER 직접 노출(`pg_proc` 전수 대조). 029B 2단 구조로 재구성해 WARN 0건 기준선 복구.
- **`invitations_insert_staff_or_owner` 재생성 시 18일차 조건 보존 여부** — CORE가 drop+create했으므로 `requested` 대상 차단이 조용히 사라질 위험이 있었다. `pg_policies` 실측으로 보존 확인(회귀 없음).
- **`audit_logs.action`에 CHECK 제약이 없다** — action 값의 유일한 강제 경계가 TypeScript 유니온이다. BOARD가 `ops-foundation-038.md`에 보강.
- **`audit_logs_crew_id_fkey`가 `ON DELETE RESTRICT`** — 해산을 `crews` DELETE로 구현하면 감사 로그가 삭제를 막는다. 착수 전 CREW에 경고했고, **같은 체인이 DESIGN의 정리 절차에서 되돌아와** 삭제 순서 지정이 필요했다(`crews` 참조 FK 8개 전부 RESTRICT).
- **결정 번호 카운터가 또 어긋났다**(`다음 결정 번호: D-046`인데 D-046 등재됨) → D-047로 정정. 18일차와 같은 실수의 재발이라 **원인 메커니즘**("두 사람이 각자 자기 번호를 잡고 이 줄을 갱신하면 나중에 등재한 쪽이 이겨 항상 하나 모자란다")을 경고문에 명시하고 팀장 마감 대조를 규칙으로 넣었다.
- **팀장 자신의 오판 2건**: ① CORE의 정책 변경 시각을 idle 통지 시각으로 착각해 DESIGN의 유효한 검증을 무효 처리하라고 지시했다(DESIGN이 `list_migrations`로 반박, 팀장 정정). ② I-066을 "FR-013 AC가 요구하지 않는다"는 근거로 이월 승인했으나, BOARD가 **URL 이동만으로 재현된다**는 것을 밝혀 이월을 철회하고 같은 회차에 닫았다.
- **팀장 지시 오류 2건**: ① 소환 프롬프트의 FR 매핑이 틀렸다(FR-013=해산·FR-025=이양·FR-027=강퇴가 정답). CREW가 지적해 정정. ② `targetId=crewId` 정정 지시가 메시지 유실로 전달되지 않아 반려한 안이 그대로 들어갔다(재지시로 해소).

**minor (요약)**

- [CREW] `permission.types.ts`의 `targetRole`이 `UserRole`로 잘못 선언돼 있었다(Task 009B 이후 첫 실사용에서 발견) → `CrewMembershipRole`
- [CREW] `refresh()` 누락 5개 파일 + 틀린 가정을 퍼뜨리는 docstring → 전부 수정·정정
- [BOARD] `/sample` 알림 시뮬레이터가 Mock 시드 id를 실 DB에 보내 항상 예외로 실패(**I-064**) → 수정
- [DESIGN] 18일차 마이그레이션 파일 3건이 원격 version과 어긋나 있었다 → rename, I-051 후속에 기록

## 이번 회차가 드러낸 구조적 문제

**원격 DB와 저장소가 어긋난 사례가 세 번 나왔다 — 전부 I-051(`apply_migration`이 로컬 파일을 만들지 않는다)의 파생이다.**

| # | 어긋남 | 발견 경로 | 심각도 |
| --- | --- | --- | --- |
| 1 | 파일명 타임스탬프 ≠ 원격 version (6건: BOARD 1 · CREW 3 · **18일차 DESIGN 3**) | BOARD가 로컬 57 ↔ 원격 57 전수 대조 | 리플레이 시 **같은 마이그레이션 2회 적용** |
| 2 | **후속 삭제 마이그레이션의 로컬 파일 부재**(CORE `090854`) | 팀장 grep | 리플레이하면 **취약 RPC가 되살아난다** |
| 3 | 2단 구조 재구성 마이그레이션의 로컬 파일 부재(CREW `093855`, 곧 자체 생성) | 팀장 `list_migrations` 대조 | 리플레이 시 advisor WARN 재발 |

**2번이 이번 회차에서 가장 위험했다.** 원격 DB는 안전한데 저장소는 보안 구멍이 열린 상태를 기술하고 있었다 — 새 환경에 마이그레이션을 리플레이하면 `085327`이 무제한 핸들 오라클 RPC를 만들고, 그것을 지우는 마이그레이션은 없다. **"원격이 안전하다"와 "저장소가 안전한 상태를 기술한다"는 다르다.**

**세워진 절차**(세 팀원이 각각 다른 경로로 같은 결론에 도달했다):

1. `apply_migration` 직후 **다른 작업보다 먼저** `list_migrations`로 부여된 version을 확인한다.
2. **그 version을 파일명으로** 로컬 파일을 만든다(먼저 만들고 나중에 rename하지 않는다).
3. 내용은 `supabase_migrations.schema_migrations`의 `statements`와 **바이트 단위로 대조**한다.
4. **이미 적용된 마이그레이션 파일은 고치지 않는다** — 변경은 후속 마이그레이션으로 표현한다.
5. 팀장은 회차 마감에 **로컬 파일 목록 ↔ 원격 version을 1:1 대조**한다.

## 문서 정확성 — 이번 회차에도 세 번 판단을 바꿨다

1. **틀린 가정이 주석으로 복제되며 퍼진 사례**: `leave-crew.ts`의 "`refresh()` 대신 `redirect()`를 쓴다"가 `disband-crew.ts`로 복제됐고, 그 가정이 이번에 틀렸다고 확인됐다. 두 파일 다 정정 이력으로 남겼다.
2. **팀장 통보가 팀원 검증을 무효화하려 했다**: 변경 시각을 확인하지 않고 통보한 결과다. DESIGN이 마이그레이션 version으로 반박해 막았다.
3. **BOARD가 자기 판정을 갱신했다**: "advisor WARN은 의도된 것"이 CORE의 재구성으로 "WARN 자체를 없앤 게 더 나은 결과"로 바뀌었다.

셋 다 원 서술을 지우지 않았다. **고친 뒤에도 남는 한계를 적는 습관**도 정착했다 — BOARD가 `refreshAuth` 재시도를 넣고도 "극단적으로 실패가 겹치면 이론상 완전 차단은 아니다"를 남긴 것, CORE가 I-058을 "닫힌 것 / 남은 것"으로 나눠 적은 것이 그 예다.

## 팀장 전체 테스트 (항상 실행)

세 명령을 **3회** 실행했다(착수 전 기준선 · 중간 · 최종). 최종 결과:

- `npm run lint`: **통과** (0 errors)
- `npx tsc --noEmit`: **통과** (0 errors)
- `npm run build`: **통과** (라우트 21 → **25개**)

**프로덕션 서버 재기동 후 런타임 확인**(`npm start`, 포트 3210, 팀장 전용):

| 경로 | 결과 |
| --- | --- |
| `/login` · `/signup` · `/sample` · `/reset-password` · `/home` | 200 |
| `/account/restore` (게스트) | **307 → `/login`** |
| `/sample` 4상태 | 기본 79 · 로딩 49 · **빈 상태 56** · 오류 196 |
| `/sample` 신규 컴포넌트 | `ArchivedCrewBanner` · `DisbandCrewForm` · `RealtimeAuthErrorDemoContainer` 등록 확인 |

**낡은 서버 프로세스를 종료한 뒤 재기동했다** — 18일차에 팀장이 낡은 서버 응답을 현재 코드의 증거로 오인한 사고가 있어, 이번에는 포트를 비우고(`next-server` 종료 확인) 새 빌드로 띄웠다.

## 브라우저 검증 (DESIGN 전담, 팀장이 2회 재빌드)

이번 회차에 브라우저를 쓰는 팀원을 **DESIGN 하나로 한정**했다(18일차에 공유 Playwright 프로필 잠금으로 아무도 검증하지 못한 것의 대응). 이번 회차에는 잠금이 없었다.

**1차 (18일차 이월 4항목)**

| 항목 | 결과 |
| --- | --- |
| ① 레이트 리밋 429 UI(`UserSearchField` Alert) | **PASS** (증거 08:50:40 UTC) |
| ② `requested` 대상 초대 차단 문구 | **PASS** (증거 08:52:36 UTC) |
| ③ 탈퇴 → 복구 클릭 왕복 | **PASS**(핵심 흐름) + 결함 2건 발견(**I-060**·**I-061**) |
| ④ 비밀번호 재설정 메일 링크(I-057) | **검증 불가** — Gmail 수신함 접근 수단 없음. GoTrue `POST /recover` 200·`user_recovery_requested`까지만 확인 |

**2차 (이번 회차 변경분 재확인 + 신규)**

| 항목 | 결과 |
| --- | --- |
| ① 재확인(FR-006이 `profile_search` RPC 경유로 재배선된 뒤) | **PASS** — 정상 검색·21회째 리밋 Alert 둘 다 살아 있음 |
| ② 재확인(handle→id가 service-role 경로로 바뀐 뒤) | **PASS** — 문구 동일 |
| ③ **FR-013 AC2 (I-067)** | **1차 FAIL → 수정 후 PASS** (아래) |
| ④ `ArchivedCrewBanner`·쓰기 차단 | **PASS** — 배너 렌더, `flex-1 min-h-0` 레이아웃 안 깨짐, `Composer` 부재, "새 글쓰기" 부재, RLS 이중 확인(직접 INSERT → `42501`) |
| ④-1 `/board/new` 직접 접근 | **HTTP 500 + "연결에 문제가 있어요"** → **I-069 발견**(아래) |

**FR-013 AC2가 처음엔 FAIL이었다.** DESIGN이 일회용 크루에 과거·미래 Meetup을 넣고 화면에서 해산을 클릭한 뒤 캘린더를 보니 **미래 바는 사라졌지만 과거 바도 함께 사라졌다**("열람 전용"이 아니라 "안 보임"). 원인은 `MonthCalendarContainer.tsx:60`이 `listCrewsByProfile()`(`.eq("status","active")`)을 캘린더 조회 범위에 재사용해 **Meetup 상태가 아니라 크루 상태로 걸러진** 것이다. CREW(데이터 레이어 `includeArchived` 옵션)·DESIGN(렌더링)이 절반씩 고친 뒤 **재검증 4/4 PASS**: 과거 바 복원(6/5) · 미래 바 여전히 숨김(9월 0건) · `DayDetailPanel`에 "해산된 크루"·"취소됨" 배지 **공존**(6/10) · 크루 필터에 기본 체크 + "해산됨" 배지, 체크 해제 시 `dimmed`와 배지 **동시** 표시.

**실 데이터 정리**: 12단계(FK RESTRICT 역순) 막힘 없이 완료, 전 테이블 재조회로 잔여 0건, `chopin0625`의 활성 오너 크루가 "주말 러닝 클럽" 1개만 남는 것까지 매 라운드 재확인했다.

**팀장이 서버 로그로 확인한 것**: 2차 재기동에서 `npm start` 출력을 로그 파일로 리다이렉트한 뒤(1차에는 `tail`로 파이프해 버퍼링 때문에 비어 있었다 — 팀장 실수) 게스트로 `/home`·`/calendar`를 호출하니 **I-059가 그대로 재현**됐다(`assertAuthenticatedSession … 레이아웃 가드가 깨졌다는 뜻이다`, digest `4040717099`·`2683482230`). 18일차 등재 항목이 여전히 열려 있음을 실측으로 확인했고, **digest ↔ 서버 로그 대조 경로가 작동한다**는 것도 확인됐다(I-069 진단에 필요한 수단이다 — 다만 2차 검증 라운드에서는 차단 라우트에 접근하지 않아 새 digest는 나오지 않았다).

## 문서 갱신

- `docs/ROADMAP/team/04.BOARD.md` — Task 033 상태 마커(완료, 19일차)
- `docs/ROADMAP/team/03.CREW.md` — Task 040 상태 마커(완료, 19일차)
- `docs/team/*.md` — **변경 없음**(팀원 상태 행이 바뀌지 않았다)
- `docs/ISSUES.md` — **I-060~I-069 등재**(그중 7건 같은 회차에 닫음), I-044·I-051·I-057·I-058 후속 갱신
- `docs/prioritization-and-risks.md` — D-045·D-046 등재, R-012에 19일차 단락, **D-040에 재검토 필요 각주**(전제 무효화), **결정 번호 카운터 D-046→D-047 정정(팀장)**
- `docs/decisions/` 신규 3건 — `realtime-broadcast-033.md` · `crew-lifecycle-040.md` · `auth-roundtrip-verification-019.md`
- `docs/decisions/rls-policies-029b.md` — §16·§17·§17.6·§18 추가(CORE), `ops-foundation-038.md` 보강(BOARD)
- `supabase/migrations/` — **8건 추가**(`085327`·`085443`·`085454`·`085508`·`085528`·`090854`·`093855`·`094141`). 회차 마감에 **로컬 59 ↔ 원격 59 1:1 대조 완료**(18일차부터 있던 드리프트 3건 포함해 전부 해소)

## 다음 회차에 열리는 Task

완료 집합이 {001~032 전량 · 035 · 038 · 039 · 040 · 033}이 되어 다음이 열린다:

- **034 · 투표 자동 종료·판정·Meetup 생성·알림 파이프라인** (BOARD, 의존 027 ✓ · 032 ✓ · **033 ✓**) — 3.5인일 M. 033 완료로 새로 열렸다.
- **041 · 커뮤니티 확장** (BOARD, 의존 032 ✓) — 9.5인일 L.
- **042A · 신고·차단** (CREW, 의존 032 ✓) — 6.5인일 L.
- CORE는 여전히 담당 없음(044가 036 의존), DESIGN도 없음(036이 034 의존 — **034가 끝나면 열린다**).

**1인 1건 폭 제한을 적용하면 BOARD가 034·041 중 하나, CREW가 042A**이므로 실제 배치는 2건이고, 20일차 산정 시 재계산한다. **034를 먼저 하면 DESIGN의 036이 열려 4명 전원 가동이 가능해진다** — 크리티컬 패스상 034 우선이 유리하다.

**20일차 착수 전에 확인할 것**:

0. **I-069이 최우선 후보다** — 프로덕션에서 도메인 오류 표시(D-030 ③)가 무력화된 상태이고, 이번 회차에 넣은 것은 **오안내를 막는 완화**(미분류 → "원인 불명")뿐이다. 근본 해결은 두 갈래이고 **D-040 재검토가 선행**한다: ⓐ `forbidden()`/`unauthorized()` 도입(cause 직렬화를 안 쓰므로 구조적으로 우회하지만 **여전히 experimental**이고 2종만 커버 → 부분 도입) ⓑ 던지지 않고 값 반환 + 페이지가 `ErrorState`를 직접 렌더(6종 전부 커버, **8곳 재작업**). BOARD가 비용·커버리지를 정리해 뒀다. **도달성 "높음" 3곳**(`layout.tsx` 비크루원 · `MeetupDetailContainer` · **`CrewSettingsContainer` — 일반 크루원이 `/settings`에 직접 접근하면 항상 도달**)만 먼저 고치는 부분 대응도 가능하다.
1. **I-065는 사용자 판단이 필요하다**(익명 흐름 레이트 리밋 정책을 정할지 / 잔여 위험으로 수용할지). 어느 쪽도 **새 결정(D-\*) 없이는 닫을 수 없다** — CORE가 임의로 닫지 않도록 명시해 두었다.
2. **I-057**(비밀번호 재설정 메일 템플릿)은 여전히 검증 불가다 — 메일 수신함 접근 수단이 없다. 실제로 확인하려면 사용자가 대시보드 템플릿을 보여주거나 메일 링크를 붙여 줘야 한다.
3. **I-066·I-067의 남은 부분**: 크루 정보 수정 차단(`crews` UPDATE 정책, CORE 이월) / 과거 `confirmed` Meetup 출석 응답(잔여 위험, 저가치) / **`CrewHomeContainer`의 archived 세부 렌더**(BOARD의 공통 배너가 최소 요건만 채운 상태 — 정보 수정 폼 노출 여부 등). 전부 I-066·I-067 각주에 남았다.
4. **I-054**(여러 PostgREST 호출로 나뉜 쓰기가 진짜 트랜잭션이 아니다)는 041의 새 쓰기 경로(댓글)에 같은 형태로 번질 수 있다 — 처음부터 RPC로 만들 것.
5. **I-063**(브로드캐스트 트리거가 `postLinkCard`를 채우지 않는다)은 041이 게시글 공유 쓰기 경로를 만들면 **반드시 재확인**해야 하는 잠복 상태다.

## git

- 브랜치: `day-19`
- 커밋: 아래 커밋 절 참고
- 푸시: 사용자 승인 후 `origin/day-19`
