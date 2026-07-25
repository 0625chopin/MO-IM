/**
 * Supabase 프로젝트(damruradpliktkrlkakl, MO-IM)의 `public` 스키마로부터
 * `generate_typescript_types`로 생성한 타입. Task 028 최초 생성, Task 029B(16일차)에서
 * RLS 신규 RPC(`poll_vote_tally`·`crew_directory_summary`·`profile_search`) 반영을 위해
 * 재생성. **17일차(Task 031 후속) 재생성** — CORE의 `poll_vote_tally_for_decision`
 * RPC(D-031 숨김을 적용하지 않는 판정 전용 집계, `docs/decisions/
 * poll-vote-tally-for-decision-hotfix.md`)와 CREW의 `email_resend_attempts` 테이블
 * (`create_email_resend_attempts_table` 마이그레이션)을 반영했다.
 *
 * **18일차(Task 032, 쓰기 경로) 재생성** — `profiles.onboarding_completed_at`(I-046) 컬럼과
 * `public.respond_meetup_attendance` RPC(D-019 정원 원자성, `docs/decisions/
 * write-path-realdata-032.md`)를 반영했다.
 *
 * **18일차(Task 039, 계정 생애주기) 재생성** — `profiles.deactivated_at` 컬럼(FR-005 30일
 * 유예)과 `public.request_account_deactivation`·`public.restore_deactivated_account`·
 * `public.anonymize_expired_deactivated_profiles` RPC(D-010·NFR-031, `docs/decisions/
 * account-lifecycle-039.md`)를 반영했다. 이 재생성 시점에 `handle_search_attempts` 테이블도
 * 함께 나타났다 — BOARD가 병렬로 작업 중인 레이트 리밋 모듈(`src/lib/actions/
 * search-user-by-handle.ts` 등) 소관이라 이 회차에서 손대지 않는다.
 *
 * **19일차(I-058 해소) 재생성** — `public.get_profile_public_by_id`·
 * `public.get_profile_public_by_handle` RPC 2건이 새로 나타난다. `profiles_select_authenticated`
 * 정책을 self-row 전용으로 좁히면서(마이그레이션
 * `profiles_narrow_select_policy_and_public_profile_rpcs`), 타인 프로필의 "작성자 표기"용
 * 조회는 이 두 RPC로 이전했다 — `profiles` 테이블 자체의 `Row` 타입(컬럼 목록)은 바뀌지 않았다.
 * 상세: `docs/decisions/rls-policies-029b.md` §16, `docs/ISSUES.md` I-058.
 *
 * **19일차(I-058 major① 교차검증) 재재생성** — 위 `get_profile_public_by_handle`이 팀장
 * 교차검증에서 "무제한 핸들 오라클"로 지적돼(`authenticated` EXECUTE + `STABLE`이라 리밋을
 * 넣을 수 없는 구조) `public`·`private` 양쪽에서 완전히 삭제됐다(마이그레이션
 * `profiles_drop_public_handle_lookup_rpc_i058_major1`) — 그래서 `Functions`에서
 * `get_profile_public_by_handle`이 다시 사라진다. `get_profile_public_by_id`는 그대로 남는다
 * (UUID 기반이라 팀장이 수정 대상에서 제외). handle→id 내부 재해석은 이제 RPC 없이
 * `profile.ts`의 `getProfileByHandle`이 service-role 클라이언트로 직접 처리한다(client-
 * invokable 엔드포인트 자체가 없다). 상세: `docs/decisions/rls-policies-029b.md` §17,
 * `docs/ISSUES.md` I-058·I-062.
 *
 * 이 파일은 자동 생성 파일이다 — 손으로 고치지 않는다. 스키마가 바뀌면
 * 새 마이그레이션을 적용한 뒤 다시 생성해 이 파일을 통째로 교체한다.
 *
 * src/lib/types/*(Task 006 수기 도메인 타입)와는 별개다. 도메인 타입은
 * camelCase·React/Mock 친화적 형태이고, 이 파일은 DB 컬럼명(snake_case)을
 * 그대로 반영한다 — 데이터 접근 레이어(NFR-034)가 둘 사이를 매핑한다.
 * R-003 대조 결과는 docs/decisions/schema-migration-028.md 참고.
 *
 * `private` 스키마(SECURITY DEFINER 헬퍼·RPC 구현체)는 여기 나타나지 않는다 — PostgREST
 * Exposed schemas에 없어 애초에 API 표면이 아니기 때문이다(docs/decisions/rls-policies-029b.md
 * §8 참고). `public.*` RPC 래퍼(`poll_vote_tally`·`poll_vote_tally_for_decision`·
 * `crew_directory_summary`·`profile_search`·`respond_meetup_attendance`·
 * `request_account_deactivation`·`restore_deactivated_account`·
 * `anonymize_expired_deactivated_profiles`·`get_profile_public_by_id`·`disband_crew`)만
 * `Functions`에 나타나는 것이 정상이다(`get_profile_public_by_handle`은 위 major① 재재생성
 * 단락 참고 — 삭제되어 더 이상 나타나지 않는다).
 *
 * **19일차(Task 040, 크루 생애주기) 재생성** — `public.disband_crew` RPC(FR-013 크루 해산,
 * `docs/decisions/crew-lifecycle-040.md`)가 새로 나타난다. 오너 이양(FR-025)·강퇴(FR-027)는
 * 기존 `crews`·`crew_memberships` 테이블의 단순 UPDATE라 새 RPC가 필요 없었다 — 관련 트리거
 * 변경은 `Row`/`Insert`/`Update` 컬럼 목록에 나타나지 않는다(트리거는 타입에 반영되지 않는다).
 * 이 재생성 시점에 CORE의 `profiles_narrow_select_policy_and_public_profile_rpcs`(I-058)도
 * 함께 반영됐다 — `get_profile_public_by_id`·`get_profile_public_by_handle`는 그쪽 소관이며
 * 이 회차에서 손대지 않았다(단, `get_profile_public_by_handle`은 이후 CORE가 삭제했다 — 위
 * major① 재재생성 단락 참고).
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          crew_id: string | null
          id: string
          target_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          crew_id?: string | null
          id?: string
          target_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          crew_id?: string | null
          id?: string
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
      auth_attempts: {
        Row: {
          attempted_at: string
          id: number
          identifier: string
          succeeded: boolean
        }
        Insert: {
          attempted_at?: string
          id?: never
          identifier: string
          succeeded: boolean
        }
        Update: {
          attempted_at?: string
          id?: never
          identifier?: string
          succeeded?: boolean
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      boards: {
        Row: {
          crew_id: string
          id: string
        }
        Insert: {
          crew_id: string
          id?: string
        }
        Update: {
          crew_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boards_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: true
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          body: string | null
          client_key: string
          created_at: string
          deleted_at: string | null
          id: string
          ref_post_id: string | null
          room_id: string
          sender_id: string
          type: string
        }
        Insert: {
          body?: string | null
          client_key: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          ref_post_id?: string | null
          room_id: string
          sender_id: string
          type: string
        }
        Update: {
          body?: string | null
          client_key?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          ref_post_id?: string | null
          room_id?: string
          sender_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_ref_post_id_fkey"
            columns: ["ref_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rooms: {
        Row: {
          crew_id: string
          id: string
        }
        Insert: {
          crew_id: string
          id?: string
        }
        Update: {
          crew_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_rooms_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: true
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          parent_id: string | null
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_id?: string | null
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_id?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      crew_memberships: {
        Row: {
          crew_id: string
          joined_at: string
          profile_id: string
          removed_reason: string | null
          role: string
          status: string
        }
        Insert: {
          crew_id: string
          joined_at?: string
          profile_id: string
          removed_reason?: string | null
          role: string
          status: string
        }
        Update: {
          crew_id?: string
          joined_at?: string
          profile_id?: string
          removed_reason?: string | null
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crew_memberships_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crew_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crews: {
        Row: {
          category: string
          color_key: number
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string
          status: string
          visibility: string
        }
        Insert: {
          category: string
          color_key: number
          created_at?: string
          description?: string
          id?: string
          name: string
          owner_id: string
          status?: string
          visibility: string
        }
        Update: {
          category?: string
          color_key?: number
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string
          status?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "crews_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_resend_attempts: {
        Row: {
          id: number
          identifier: string
          requested_at: string
        }
        Insert: {
          id?: never
          identifier: string
          requested_at?: string
        }
        Update: {
          id?: never
          identifier?: string
          requested_at?: string
        }
        Relationships: []
      }
      handle_search_attempts: {
        Row: {
          id: number
          identifier: string
          requested_at: string
        }
        Insert: {
          id?: never
          identifier: string
          requested_at?: string
        }
        Update: {
          id?: never
          identifier?: string
          requested_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "handle_search_attempts_identifier_fkey"
            columns: ["identifier"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          crew_id: string
          expires_at: string
          id: string
          invitee_id: string
          inviter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          expires_at: string
          id?: string
          invitee_id: string
          inviter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          expires_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          created_at: string
          crew_id: string
          decided_by: string | null
          id: string
          message: string | null
          requester_id: string
          status: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          decided_by?: string | null
          id?: string
          message?: string | null
          requester_id: string
          status?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          decided_by?: string | null
          id?: string
          message?: string | null
          requester_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetup_attendances: {
        Row: {
          meetup_id: string
          profile_id: string
          responded_at: string
          status: string
        }
        Insert: {
          meetup_id: string
          profile_id: string
          responded_at?: string
          status: string
        }
        Update: {
          meetup_id?: string
          profile_id?: string
          responded_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetup_attendances_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_attendances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      meetups: {
        Row: {
          attending_count: number
          capacity: number | null
          created_at: string
          crew_id: string
          date: string
          description: string | null
          id: string
          place: string | null
          poll_id: string
          start_time: string | null
          status: string
          title: string
        }
        Insert: {
          attending_count?: number
          capacity?: number | null
          created_at?: string
          crew_id: string
          date: string
          description?: string | null
          id?: string
          place?: string | null
          poll_id: string
          start_time?: string | null
          status?: string
          title: string
        }
        Update: {
          attending_count?: number
          capacity?: number | null
          created_at?: string
          crew_id?: string
          date?: string
          description?: string | null
          id?: string
          place?: string | null
          poll_id?: string
          start_time?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetups_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetups_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: true
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          crew_id: string | null
          enabled: boolean
          id: string
          profile_id: string
          type: string
        }
        Insert: {
          crew_id?: string | null
          enabled?: boolean
          id?: string
          profile_id: string
          type: string
        }
        Update: {
          crew_id?: string | null
          enabled?: boolean
          id?: string
          profile_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_crew_id_fkey"
            columns: ["crew_id"]
            isOneToOne: false
            referencedRelation: "crews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_eligible_voters: {
        Row: {
          notified_at: string | null
          notify_attempts: number
          poll_id: string
          profile_id: string
        }
        Insert: {
          notified_at?: string | null
          notify_attempts?: number
          poll_id: string
          profile_id: string
        }
        Update: {
          notified_at?: string | null
          notify_attempts?: number
          poll_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_eligible_voters_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_eligible_voters_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          choice: string
          invalidated: boolean
          poll_id: string
          voted_at: string
          voter_id: string
        }
        Insert: {
          choice: string
          invalidated?: boolean
          poll_id: string
          voted_at?: string
          voter_id: string
        }
        Update: {
          choice?: string
          invalidated?: boolean
          poll_id?: string
          voted_at?: string
          voter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_voter_id_fkey"
            columns: ["voter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          closed_by: string | null
          closes_at: string
          decided_at: string | null
          id: string
          opens_at: string
          post_id: string
          result: string | null
          status: string
        }
        Insert: {
          closed_by?: string | null
          closes_at: string
          decided_at?: string | null
          id?: string
          opens_at: string
          post_id: string
          result?: string | null
          status?: string
        }
        Update: {
          closed_by?: string | null
          closes_at?: string
          decided_at?: string | null
          id?: string
          opens_at?: string
          post_id?: string
          result?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "polls_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          board_id: string
          body: string
          capacity: number | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          meetup_date: string | null
          place: string | null
          start_time: string | null
          title: string
          type: string
        }
        Insert: {
          author_id: string
          board_id: string
          body: string
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          meetup_date?: string | null
          place?: string | null
          start_time?: string | null
          title: string
          type: string
        }
        Update: {
          author_id?: string
          board_id?: string
          body?: string
          capacity?: number | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          meetup_date?: string | null
          place?: string | null
          start_time?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "boards"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          anonymized_at: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          deactivated_at: string | null
          display_name: string
          handle: string
          handle_changed_at: string | null
          id: string
          onboarding_completed_at: string | null
          search_opt_out: boolean
          status: string
        }
        Insert: {
          anonymized_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          deactivated_at?: string | null
          display_name: string
          handle: string
          handle_changed_at?: string | null
          id: string
          onboarding_completed_at?: string | null
          search_opt_out?: boolean
          status?: string
        }
        Update: {
          anonymized_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          deactivated_at?: string | null
          display_name?: string
          handle?: string
          handle_changed_at?: string | null
          id?: string
          onboarding_completed_at?: string | null
          search_opt_out?: boolean
          status?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reporter_id: string
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reporter_id: string
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reporter_id?: string
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      anonymize_expired_deactivated_profiles: {
        Args: { batch_size?: number; max_duration?: string }
        Returns: number
      }
      crew_directory_summary: {
        Args: { p_crew_id: string }
        Returns: {
          category: string
          description: string
          id: string
          member_count: number
          name: string
          visibility: string
        }[]
      }
      disband_crew: {
        Args: { p_confirm_name: string; p_crew_id: string }
        Returns: {
          cancelled_meetups: number
          cancelled_polls: number
          ok: boolean
          purged_messages: number
          reason: string
        }[]
      }
      get_profile_public_by_id: {
        Args: { p_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          handle: string
          id: string
          status: string
        }[]
      }
      poll_vote_tally: {
        Args: { p_poll_id: string }
        Returns: {
          abstain_count: number
          against_count: number
          eligible_count: number
          for_count: number
          participant_count: number
          poll_id: string
          poll_status: string
          tally_hidden: boolean
        }[]
      }
      poll_vote_tally_for_decision: {
        Args: { p_poll_id: string }
        Returns: {
          abstain_count: number
          against_count: number
          eligible_count: number
          for_count: number
          participant_count: number
          poll_id: string
          poll_status: string
          tally_hidden: boolean
        }[]
      }
      profile_search: {
        Args: { p_handle: string }
        Returns: {
          avatar_url: string
          display_name: string
          handle: string
        }[]
      }
      purge_expired_chat_messages: {
        Args: { batch_size?: number; max_duration?: string }
        Returns: number
      }
      purge_expired_rate_limit_counters: { Args: never; Returns: number }
      request_account_deactivation: {
        Args: never
        Returns: {
          changed: boolean
          ok: boolean
          reason: string
        }[]
      }
      respond_meetup_attendance: {
        Args: { p_meetup_id: string; p_status: string }
        Returns: {
          changed: boolean
          ok: boolean
          reason: string
        }[]
      }
      restore_deactivated_account: {
        Args: never
        Returns: {
          changed: boolean
          ok: boolean
          reason: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
