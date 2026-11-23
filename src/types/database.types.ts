export type QuizRunStatus =
  | "LOBBY"
  | "QUESTION_OPEN"
  | "LEADERBOARD"
  | "FINISHED";

export interface Database {
  public: {
    Tables: {
      quizzes: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
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
          order_index: number;
          question_text: string;
          time_limit_seconds: number;
        };
        Insert: {
          id?: string;
          run_id: string;
          source_question_id?: string | null;
          order_index: number;
          question_text: string;
          time_limit_seconds: number;
        };
        Update: {
          id?: string;
          run_id?: string;
          source_question_id?: string | null;
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
        };
        Insert: {
          id?: string;
          run_id: string;
          nickname: string;
          joined_at?: string;
          last_seen_at?: string;
          participant_session_id?: string;
        };
        Update: {
          id?: string;
          run_id?: string;
          nickname?: string;
          joined_at?: string;
          last_seen_at?: string;
          participant_session_id?: string;
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
    };
  };
}
