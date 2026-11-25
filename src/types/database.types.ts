export type QuizRunStatus =
  | "LOBBY"
  | "QUESTION_OPEN"
  | "REVEALED"
  | "LEADERBOARD"
  | "FINISHED";

export type QuizMode = "NORMAL" | "GROUP" | "TEAM" | "SOLO";
export type GroupStatus = "DRAFTING" | "SUBMITTED" | "CONFIRMED";

export interface Database {
  public: {
    Tables: {
      quizzes: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          mode: QuizMode;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          mode?: QuizMode;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          mode?: QuizMode;
          created_at?: string;
          updated_at?: string;
        };
      };
      questions: {
        Row: {
          id: string;
          quiz_id: string;
          order_index: number;
          question_text: string;
          time_limit_seconds: number;
        };
        Insert: {
          id?: string;
          quiz_id: string;
          order_index: number;
          question_text: string;
          time_limit_seconds: number;
        };
        Update: {
          id?: string;
          quiz_id?: string;
          order_index?: number;
          question_text?: string;
          time_limit_seconds?: number;
        };
      };
      options: {
        Row: {
          id: string;
          question_id: string;
          order_index: number;
          option_text: string;
        };
        Insert: {
          id?: string;
          question_id: string;
          order_index: number;
          option_text: string;
        };
        Update: {
          id?: string;
          question_id?: string;
          order_index?: number;
          option_text?: string;
        };
      };
      // Server-only: no client-facing SELECT/INSERT/UPDATE ever reaches this
      // table (RLS has zero policies). Typed here only for the admin
      // (service-role) client's internal use in later stages.
      question_answer_keys: {
        Row: {
          question_id: string;
          correct_option_id: string;
        };
        Insert: {
          question_id: string;
          correct_option_id: string;
        };
        Update: {
          question_id?: string;
          correct_option_id?: string;
        };
      };
      rooms: {
        Row: {
          id: string;
          owner_id: string;
          quiz_id: string;
          public_join_code: string;
          active_run_id: string | null;
          created_at: string;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          owner_id: string;
          quiz_id: string;
          public_join_code: string;
          active_run_id?: string | null;
          created_at?: string;
          closed_at?: string | null;
        };
        Update: {
          id?: string;
          owner_id?: string;
          quiz_id?: string;
          public_join_code?: string;
          active_run_id?: string | null;
          created_at?: string;
          closed_at?: string | null;
        };
      };
      quiz_runs: {
        Row: {
          id: string;
          room_id: string;
          run_number: number;
          status: QuizRunStatus;
          current_question_index: number;
          started_at: string | null;
          finished_at: string | null;
          state_version: number;
        };
        Insert: {
          id?: string;
          room_id: string;
          run_number: number;
          status?: QuizRunStatus;
          current_question_index?: number;
          started_at?: string | null;
          finished_at?: string | null;
          state_version?: number;
        };
        Update: {
          id?: string;
          room_id?: string;
          run_number?: number;
          status?: QuizRunStatus;
          current_question_index?: number;
          started_at?: string | null;
          finished_at?: string | null;
          state_version?: number;
        };
      };
      run_questions: {
        Row: {
          id: string;
          run_id: string;
          source_question_id: string | null;
          source_group_id: string | null;
          order_index: number;
          question_text: string;
          time_limit_seconds: number;
        };
        Insert: {
          id?: string;
          run_id: string;
          source_question_id?: string | null;
          source_group_id?: string | null;
          order_index: number;
          question_text: string;
          time_limit_seconds: number;
        };
        Update: {
          id?: string;
          run_id?: string;
          source_question_id?: string | null;
          source_group_id?: string | null;
          order_index?: number;
          question_text?: string;
          time_limit_seconds?: number;
        };
      };
      run_options: {
        Row: {
          id: string;
          run_question_id: string;
          order_index: number;
          option_text: string;
        };
        Insert: {
          id?: string;
          run_question_id: string;
          order_index: number;
          option_text: string;
        };
        Update: {
          id?: string;
          run_question_id?: string;
          order_index?: number;
          option_text?: string;
        };
      };
      // Server-only, see question_answer_keys note above.
      run_answer_keys: {
        Row: {
          run_question_id: string;
          correct_option_id: string;
        };
        Insert: {
          run_question_id: string;
          correct_option_id: string;
        };
        Update: {
          run_question_id?: string;
          correct_option_id?: string;
        };
      };
      run_question_states: {
        Row: {
          id: string;
          run_id: string;
          run_question_id: string;
          opened_at: string | null;
          closes_at: string | null;
          closed_at: string | null;
        };
        Insert: {
          id?: string;
          run_id: string;
          run_question_id: string;
          opened_at?: string | null;
          closes_at?: string | null;
          closed_at?: string | null;
        };
        Update: {
          id?: string;
          run_id?: string;
          run_question_id?: string;
          opened_at?: string | null;
          closes_at?: string | null;
          closed_at?: string | null;
        };
      };
      participants: {
        Row: {
          id: string;
          run_id: string;
          nickname: string;
          joined_at: string;
          last_seen_at: string;
          participant_session_id: string;
          last_reaction_at: string | null;
          group_id: string | null;
          pin_attempt_count: number;
          pin_locked_until: string | null;
        };
        Insert: {
          id?: string;
          run_id: string;
          nickname: string;
          joined_at?: string;
          last_seen_at?: string;
          participant_session_id?: string;
          last_reaction_at?: string | null;
          group_id?: string | null;
          pin_attempt_count?: number;
          pin_locked_until?: string | null;
        };
        Update: {
          id?: string;
          run_id?: string;
          nickname?: string;
          joined_at?: string;
          last_seen_at?: string;
          participant_session_id?: string;
          last_reaction_at?: string | null;
          group_id?: string | null;
          pin_attempt_count?: number;
          pin_locked_until?: string | null;
        };
      };
      reactions: {
        Row: {
          id: string;
          seq: number;
          run_id: string;
          participant_id: string;
          emoji: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          seq?: number;
          run_id: string;
          participant_id: string;
          emoji: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          seq?: number;
          run_id?: string;
          participant_id?: string;
          emoji?: string;
          created_at?: string;
        };
      };
      answers: {
        Row: {
          id: string;
          run_id: string;
          participant_id: string;
          run_question_id: string;
          selected_option_id: string;
          submitted_at: string;
          is_correct: boolean;
          awarded_points: number;
        };
        Insert: {
          id?: string;
          run_id: string;
          participant_id: string;
          run_question_id: string;
          selected_option_id: string;
          submitted_at?: string;
          is_correct: boolean;
          awarded_points?: number;
        };
        Update: {
          id?: string;
          run_id?: string;
          participant_id?: string;
          run_question_id?: string;
          selected_option_id?: string;
          submitted_at?: string;
          is_correct?: boolean;
          awarded_points?: number;
        };
      };
      // Group mode -- see the project plan for design rationale.
      groups: {
        Row: {
          id: string;
          run_id: string;
          name: string;
          pin: string;
          status: GroupStatus;
          status_version: number;
          member_snapshot: { participantId: string; nickname: string }[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          run_id: string;
          name: string;
          pin: string;
          status?: GroupStatus;
          status_version?: number;
          member_snapshot?: { participantId: string; nickname: string }[] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          name?: string;
          pin?: string;
          status?: GroupStatus;
          status_version?: number;
          member_snapshot?: { participantId: string; nickname: string }[] | null;
          created_at?: string;
        };
      };
      // Server-only: zero RLS policies, same posture as question_answer_keys
      // -- before game start, no participant-facing path may expose
      // another group's question content.
      group_question_slots: {
        Row: {
          id: string;
          group_id: string;
          slot_index: number;
          question_text: string;
          options: { tempId: string; optionText: string }[];
          correct_option_temp_id: string | null;
          last_edited_by_participant_id: string | null;
          last_edited_at: string | null;
          presenter_comment: string | null;
          presenter_edited: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          slot_index: number;
          question_text?: string;
          options?: { tempId: string; optionText: string }[];
          correct_option_temp_id?: string | null;
          last_edited_by_participant_id?: string | null;
          last_edited_at?: string | null;
          presenter_comment?: string | null;
          presenter_edited?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          slot_index?: number;
          question_text?: string;
          options?: { tempId: string; optionText: string }[];
          correct_option_temp_id?: string | null;
          last_edited_by_participant_id?: string | null;
          last_edited_at?: string | null;
          presenter_comment?: string | null;
          presenter_edited?: boolean;
          updated_at?: string;
        };
      };
      // Server-only, same posture as group_question_slots above.
      group_question_locks: {
        Row: {
          id: string;
          slot_id: string;
          holder_participant_id: string;
          acquired_at: string;
          heartbeat_at: string;
          expires_at: string;
          lock_version: number;
        };
        Insert: {
          id?: string;
          slot_id: string;
          holder_participant_id: string;
          acquired_at?: string;
          heartbeat_at?: string;
          expires_at: string;
          lock_version?: number;
        };
        Update: {
          id?: string;
          slot_id?: string;
          holder_participant_id?: string;
          acquired_at?: string;
          heartbeat_at?: string;
          expires_at?: string;
          lock_version?: number;
        };
      };
      group_mode_settings: {
        Row: {
          run_id: string;
          topic: string;
          questions_per_group: number;
          time_limit_seconds: number;
          group_count: number;
        };
        Insert: {
          run_id: string;
          topic: string;
          questions_per_group: number;
          time_limit_seconds: number;
          group_count: number;
        };
        Update: {
          run_id?: string;
          topic?: string;
          questions_per_group?: number;
          time_limit_seconds?: number;
          group_count?: number;
        };
      };
      solo_mode_settings: {
        Row: {
          run_id: string;
          topic: string;
          questions_per_person: number;
          time_limit_seconds: number;
        };
        Insert: {
          run_id: string;
          topic: string;
          questions_per_person: number;
          time_limit_seconds: number;
        };
        Update: {
          run_id?: string;
          topic?: string;
          questions_per_person?: number;
          time_limit_seconds?: number;
        };
      };
      group_status_history: {
        Row: {
          id: string;
          group_id: string;
          actor: "MEMBER" | "PRESENTER";
          actor_participant_id: string | null;
          from_status: string;
          to_status: string;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          actor: "MEMBER" | "PRESENTER";
          actor_participant_id?: string | null;
          from_status: string;
          to_status: string;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string;
          actor?: "MEMBER" | "PRESENTER";
          actor_participant_id?: string | null;
          from_status?: string;
          to_status?: string;
          comment?: string | null;
          created_at?: string;
        };
      };
      group_slot_edit_events: {
        Row: {
          id: string;
          slot_id: string;
          edited_by: "MEMBER" | "PRESENTER";
          editor_participant_id: string | null;
          before_snapshot: { questionText: string; options: { tempId: string; optionText: string }[]; correctOptionTempId: string };
          after_snapshot: { questionText: string; options: { tempId: string; optionText: string }[]; correctOptionTempId: string };
          created_at: string;
        };
        Insert: {
          id?: string;
          slot_id: string;
          edited_by: "MEMBER" | "PRESENTER";
          editor_participant_id?: string | null;
          before_snapshot: { questionText: string; options: { tempId: string; optionText: string }[]; correctOptionTempId: string };
          after_snapshot: { questionText: string; options: { tempId: string; optionText: string }[]; correctOptionTempId: string };
          created_at?: string;
        };
        Update: {
          id?: string;
          slot_id?: string;
          edited_by?: "MEMBER" | "PRESENTER";
          editor_participant_id?: string | null;
          before_snapshot?: { questionText: string; options: { tempId: string; optionText: string }[]; correctOptionTempId: string };
          after_snapshot?: { questionText: string; options: { tempId: string; optionText: string }[]; correctOptionTempId: string };
          created_at?: string;
        };
      };
    };
  };
}
