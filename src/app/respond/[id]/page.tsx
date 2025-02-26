'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image';

interface Question {
  id: string;
  text: string;
  type: 'multiple_choice' | 'text' | 'rating' | 'yes_no';
  options?: string[];
}

interface Survey {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

export default function RespondToSurvey() {
  const params = useParams();
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const { data, error } = await supabase
          .from('surveys')
          .select('*')
          .eq('id', params.id)
          .single();

        if (error) throw error;
        if (!data) throw new Error('Survey not found');

        setSurvey(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load survey');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSurvey();
  }, [params.id]);

  const handleAnswerChange = (questionId: string, value: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSubmit = async () => {
    if (!survey) return;

    try {
      // Format answers to match the expected schema
      const formattedAnswers = Object.entries(answers).map(([questionId, response]) => ({
        question_id: questionId,
        response: response
      }));

      const { error } = await supabase
        .from('survey_responses')
        .insert([
          {
            survey_id: survey.id,
            answers: formattedAnswers,
            created_at: new Date().toISOString()
          }
        ]);

      if (error) {
        console.error('Submission error:', error);
        throw error;
      }

      // Show success message and reset form
      alert('Thank you for completing the survey!');
      setAnswers({});
    } catch (err) {
      console.error('Failed to submit:', err);
      alert('Failed to submit survey. Please try again.');
    }
  };

  const renderQuestion = (question: Question, isPreview: boolean = false) => {
    switch (question.type) {
      case 'multiple_choice':
        return (
          <div className="space-y-3 w-full">
            {question.options?.map((option, index) => (
              <label key={index} className="block w-full">
                <div className="flex items-center p-4 bg-white border rounded-lg cursor-pointer hover:border-purple-200 hover:bg-purple-50 transition-all">
                  <input
                    type="radio"
                    name={question.id}
                    value={option}
                    checked={answers[question.id] === option}
                    onChange={(e) => !isPreview && handleAnswerChange(question.id, e.target.value)}
                    disabled={isPreview}
                    className="w-4 h-4 text-purple-600 border-gray-300 focus:ring-purple-600"
                  />
                  <span className="ml-3 text-gray-900">{option}</span>
                </div>
              </label>
            ))}
          </div>
        );
      
      case 'text':
        return (
          <div className="w-full">
            <div className="bg-white border rounded-lg p-4 hover:border-purple-200 transition-all">
              <textarea
                value={answers[question.id] || ''}
                onChange={(e) => !isPreview && handleAnswerChange(question.id, e.target.value)}
                disabled={isPreview}
                className="w-full px-3 py-2 text-gray-900 placeholder-gray-500 bg-transparent border-0 focus:ring-0"
                rows={3}
                placeholder={isPreview ? "Text response field" : "Type your answer here..."}
              />
            </div>
          </div>
        );
      
      case 'rating':
        // Check if this is an NPS question
        const isNPSQuestion = question.text.toLowerCase().includes('recommend') && 
                            question.text.toLowerCase().includes('scale of 0 to 10');
        
        const ratings = isNPSQuestion ? Array.from({ length: 11 }, (_, i) => i) : [1, 2, 3, 4, 5];
        
        return (
          <div className="flex flex-col space-y-4 w-full">
            <div className={`grid ${isNPSQuestion ? 'grid-cols-11' : 'grid-cols-5'} gap-2`}>
              {ratings.map((rating) => (
                <label key={rating} className="block">
                  <input
                    type="radio"
                    name={question.id}
                    value={rating}
                    checked={answers[question.id] === rating.toString()}
                    onChange={(e) => !isPreview && handleAnswerChange(question.id, e.target.value)}
                    disabled={isPreview}
                    className="sr-only peer"
                  />
                  <div className="flex items-center justify-center p-3 bg-white border rounded-lg cursor-pointer hover:border-purple-200 peer-checked:border-purple-600 peer-checked:bg-purple-50 transition-all">
                    <span className="text-sm font-medium text-gray-900">{rating}</span>
                  </div>
                </label>
              ))}
            </div>
            <span className="text-sm text-gray-600">
              {isNPSQuestion ? 'Select a rating from 0 to 10' : 'Select a rating from 1 to 5'}
            </span>
          </div>
        );
      
      case 'yes_no':
        return (
          <div className="flex flex-col space-y-4 w-full">
            <div className="grid grid-cols-2 gap-4">
              {['Yes', 'No'].map((option) => (
                <label key={option} className="block">
                  <input
                    type="radio"
                    name={question.id}
                    value={option}
                    checked={answers[question.id] === option}
                    onChange={(e) => !isPreview && handleAnswerChange(question.id, e.target.value)}
                    disabled={isPreview}
                    className="sr-only peer"
                  />
                  <div className="flex items-center justify-center p-4 bg-white border rounded-lg cursor-pointer hover:border-purple-200 peer-checked:border-purple-600 peer-checked:bg-purple-50 transition-all">
                    <span className="text-lg font-medium text-gray-900">{option}</span>
                  </div>
                </label>
              ))}
            </div>
            <span className="text-sm text-gray-600">Select Yes or No</span>
          </div>
        );
      
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0f172a]"></div>
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Error</h1>
          <p className="text-gray-800">{error || 'Survey not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-950/90 via-purple-900/90 to-pink-950/90 py-12">
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-xl border border-purple-100/20 p-8">
          <div className="flex justify-center mb-8">
            <Image
              src="/onesignal-logo.png"
              alt="OneSignal"
              width={120}
              height={28}
              priority
              className="w-auto h-auto"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{survey.title}</h1>
          <p className="text-gray-800 mb-8">{survey.description}</p>

          <div className="space-y-8">
            {survey.questions.map((question: Question) => (
              <div key={question.id} className="bg-white/50 backdrop-blur-sm p-6 rounded-lg border border-purple-100/20 shadow-sm">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{question.text}</h3>
                {renderQuestion(question)}
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-end">
            <button
              onClick={handleSubmit}
              className="px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors shadow-sm"
            >
              Submit Survey
            </button>
          </div>
        </div>
      </div>
    </div>
  );
} 