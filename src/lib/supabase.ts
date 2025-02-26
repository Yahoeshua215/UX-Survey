import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  }
});

export type Survey = {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  created_at: string;
  user_id: string;
};

export type Question = {
  id: string;
  text: string;
  type: 'multiple_choice' | 'text' | 'rating' | 'yes_no';
  options?: string[];
};

export type SurveyResponse = {
  id: string;
  survey_id: string;
  answers: Answer[];
  created_at: string;
};

export type Answer = {
  question_id: string;
  response: string | number;
}; 