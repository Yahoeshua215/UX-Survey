'use client';

import { useEffect, useState } from 'react';
import { Survey, SurveyResponse, supabase } from '@/lib/supabase';

export default function SurveyResults({ params }: { params: { id: string } }) {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [analysis, setAnalysis] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSurveyAndResponses = async () => {
      try {
        // Fetch survey
        const { data: surveyData, error: surveyError } = await supabase
          .from('surveys')
          .select('*')
          .eq('id', params.id)
          .single();

        if (surveyError) throw surveyError;
        setSurvey(surveyData);

        // Fetch responses
        const { data: responsesData, error: responsesError } = await supabase
          .from('survey_responses')
          .select('*')
          .eq('survey_id', params.id);

        if (responsesError) throw responsesError;
        setResponses(responsesData);

        // Generate analysis
        const response = await fetch('/api/openai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: 'You are a survey analysis expert. Analyze the survey responses and provide insights.'
              },
              {
                role: 'user',
                content: JSON.stringify({
                  survey: surveyData,
                  responses: responsesData
                })
              }
            ]
          })
        });

        if (!response.ok) {
          throw new Error('Failed to generate analysis');
        }

        const data = await response.json();
        setAnalysis(data.content);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred while loading results');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSurveyAndResponses();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-3/4 mb-6"></div>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen p-8 bg-gradient-to-br from-purple-50 to-blue-50">
        <div className="max-w-4xl mx-auto">
          <div className="bg-red-50 p-4 rounded-lg text-red-700">
            {error || 'Survey not found'}
          </div>
        </div>
      </div>
    );
  }

  const getQuestionSummary = (questionId: string) => {
    const question = survey.questions.find(q => q.id === questionId);
    if (!question) return null;

    const questionResponses = responses.map(r => 
      r.answers.find(a => a.question_id === questionId)?.response
    ).filter(Boolean);

    switch (question.type) {
      case 'multiple_choice':
      case 'yes_no':
        const optionCounts = questionResponses.reduce((acc, response) => {
          acc[response as string] = (acc[response as string] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        return (
          <div className="mt-4">
            {Object.entries(optionCounts).map(([option, count]) => (
              <div key={option} className="mb-2">
                <div className="flex justify-between mb-1">
                  <span>{option}</span>
                  <span>{Math.round((count / questionResponses.length) * 100)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${(count / questionResponses.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        );

      case 'rating':
        const average = questionResponses.reduce<number>((sum, r) => {
          const value = typeof r === 'string' ? parseInt(r, 10) : Number(r);
          return sum + (isNaN(value) ? 0 : value);
        }, 0) / (questionResponses.length || 1);
        return (
          <div className="mt-4">
            <div className="flex items-center space-x-2">
              <span className="text-2xl font-bold">{average.toFixed(1)}</span>
              <span className="text-gray-600">average rating</span>
            </div>
            <div className="flex mt-2">
              {[1, 2, 3, 4, 5].map((rating) => (
                <div
                  key={rating}
                  className="flex-1 px-2"
                >
                  <div className="text-center mb-1">{rating}</div>
                  <div className="bg-gray-200 rounded-full">
                    <div
                      className="bg-purple-600 rounded-full"
                      style={{
                        height: '4px',
                        width: `${(questionResponses.filter(r => Number(r) === rating).length / questionResponses.length) * 100}%`
                      }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'text':
        return (
          <div className="mt-4 space-y-2">
            {questionResponses.map((response, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded-lg">
                {response}
              </div>
            ))}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen p-8 bg-gradient-to-br from-purple-50 to-blue-50">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">{survey.title} Results</h1>
        <p className="text-gray-600 mb-8">
          {responses.length} {responses.length === 1 ? 'response' : 'responses'} received
        </p>

        {analysis && (
          <div className="bg-white p-6 rounded-lg shadow-sm mb-8">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">AI Analysis</h2>
            <div className="prose max-w-none">
              {analysis.split('\n').map((paragraph, index) => (
                <p key={index} className="mb-4">{paragraph}</p>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-8">
          {survey.questions.map((question, index) => (
            <div key={question.id} className="bg-white p-6 rounded-lg shadow-sm">
              <h2 className="text-xl font-semibold text-gray-800 mb-2">
                {index + 1}. {question.text}
              </h2>
              {getQuestionSummary(question.id)}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
} 