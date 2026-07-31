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
      chat_room_reads: {
        Row: {
          last_read_at: string | null
          profile_id: string
          room_id: string
          updated_at: string
        }
        Insert: {
          last_read_at?: string | null
          profile_id: string
          room_id: string
          updated_at?: string
        }
        Update: {
          last_read_at?: string | null
          profile_id?: string
          room_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_room_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_room_reads_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "chat_rooms"
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
      handle_availability_check_attempts: {
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
          decided_at: string | null
          decided_by: string | null
          id: string
          message: string | null
          requester_id: string
          status: string
        }
        Insert: {
          created_at?: string
          crew_id: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          message?: string | null
          requester_id: string
          status?: string
        }
        Update: {
          created_at?: string
          crew_id?: string
          decided_at?: string | null
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
          invalidated_at: string | null
          meetup_id: string
          profile_id: string
          responded_at: string
          status: string
        }
        Insert: {
          invalidated_at?: string | null
          meetup_id: string
          profile_id: string
          responded_at?: string
          status: string
        }
        Update: {
          invalidated_at?: string | null
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
      meetup_schedule_changes: {
        Row: {
          changed_at: string
          id: string
          meetup_id: string
          new_capacity: number | null
          new_date: string
          new_place: string | null
          new_start_time: string | null
          poll_id: string
          previous_capacity: number | null
          previous_date: string
          previous_place: string | null
          previous_start_time: string | null
        }
        Insert: {
          changed_at?: string
          id?: string
          meetup_id: string
          new_capacity?: number | null
          new_date: string
          new_place?: string | null
          new_start_time?: string | null
          poll_id: string
          previous_capacity?: number | null
          previous_date: string
          previous_place?: string | null
          previous_start_time?: string | null
        }
        Update: {
          changed_at?: string
          id?: string
          meetup_id?: string
          new_capacity?: number | null
          new_date?: string
          new_place?: string | null
          new_start_time?: string | null
          poll_id?: string
          previous_capacity?: number | null
          previous_date?: string
          previous_place?: string | null
          previous_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetup_schedule_changes_meetup_id_fkey"
            columns: ["meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetup_schedule_changes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: true
            referencedRelation: "polls"
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
          target_meetup_id: string | null
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
          target_meetup_id?: string | null
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
          target_meetup_id?: string | null
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
          {
            foreignKeyName: "posts_target_meetup_id_fkey"
            columns: ["target_meetup_id"]
            isOneToOne: false
            referencedRelation: "meetups"
            referencedColumns: ["id"]
          },
        ]
      }
      product_events: {
        Row: {
          actor_id: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
        }
        Insert: {
          actor_id: string
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
        }
        Update: {
          actor_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "product_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          is_system_admin: boolean
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
          is_system_admin?: boolean
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
          is_system_admin?: boolean
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
      admin_grant_system_admin: {
        Args: { p_profile_id: string }
        Returns: {
          ok: boolean
          reason_code: string
        }[]
      }
      admin_grant_system_admin_by_handle: {
        Args: { p_handle: string }
        Returns: {
          ok: boolean
          profile_id: string
          reason_code: string
        }[]
      }
      admin_list_reports: {
        Args: { p_status?: string }
        Returns: {
          created_at: string
          reason: string
          report_id: string
          reporter_display_name: string
          reporter_handle: string
          reporter_id: string
          status: string
          target_author_handle: string
          target_author_id: string
          target_exists: boolean
          target_id: string
          target_preview: string
          target_removed: boolean
          target_type: string
        }[]
      }
      admin_list_system_admins: {
        Args: never
        Returns: {
          avatar_url: string
          display_name: string
          handle: string
          profile_id: string
          status: string
        }[]
      }
      admin_resolve_report: {
        Args: { p_action: string; p_report_id: string }
        Returns: {
          ok: boolean
          reason_code: string
          status: string
        }[]
      }
      admin_revoke_system_admin: {
        Args: { p_profile_id: string }
        Returns: {
          ok: boolean
          reason_code: string
        }[]
      }
      anonymize_expired_deactivated_profiles: {
        Args: { batch_size?: number; max_duration?: string }
        Returns: number
      }
      create_block: {
        Args: { p_blocked_id: string }
        Returns: {
          already_blocked: boolean
          ok: boolean
          reason_code: string
        }[]
      }
      create_join_request: {
        Args: { p_crew_id: string; p_message?: string }
        Returns: {
          created_at: string
          crew_id: string
          decided_at: string
          decided_by: string
          id: string
          message: string
          ok: boolean
          reason_code: string
          requester_id: string
          status: string
        }[]
      }
      create_poll: {
        Args: {
          p_closes_at: string
          p_eligible_voter_ids?: Json
          p_opens_at: string
          p_post_id: string
        }
        Returns: {
          closed_by: string
          closes_at: string
          decided_at: string
          id: string
          ok: boolean
          opens_at: string
          post_id: string
          reason_code: string
          result: string
          status: string
        }[]
      }
      create_report: {
        Args: { p_reason: string; p_target_id: string; p_target_type: string }
        Returns: {
          id: string
          merged: boolean
          ok: boolean
          reason_code: string
        }[]
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
      finalize_closed_poll: { Args: { p_poll_id: string }; Returns: undefined }
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
      hot_public_meetups: {
        Args: { p_limit?: number }
        Returns: {
          activity_score: number
          attending_count: number
          capacity: number
          crew_category: string
          crew_color_key: number
          crew_id: string
          crew_name: string
          id: string
          meetup_date: string
          start_time: string
          title: string
        }[]
      }
      list_pending_invitations_for_self: {
        Args: never
        Returns: {
          created_at: string
          crew_id: string
          expires_at: string
          id: string
          invitee_id: string
          inviter_id: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "invitations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      meetup_directory_summary: {
        Args: { p_meetup_id: string }
        Returns: {
          crew_id: string
          id: string
        }[]
      }
      poll_eligible_voter_progress: {
        Args: { p_poll_id: string }
        Returns: {
          current_membership_status: string
          has_voted: boolean
        }[]
      }
      poll_eligible_voters_with_status: {
        Args: { p_poll_id: string }
        Returns: {
          current_membership_status: string
          profile_id: string
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
      purge_expired_handle_availability_check_attempts: {
        Args: never
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
      run_poll_auto_close_job: {
        Args: { batch_size?: number; max_duration?: string }
        Returns: number
      }
      withdraw_join_request: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          crew_id: string
          decided_at: string
          decided_by: string
          id: string
          message: string
          ok: boolean
          reason_code: string
          requester_id: string
          status: string
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
