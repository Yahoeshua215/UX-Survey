'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Navigation from '../components/Navigation';
import Image from 'next/image';

interface SurveyResponse {
  id: string;
  survey_id: string;
  answers: Answer[];
  created_at: string;
}

interface Answer {
  question_id: string;
  response: string | number;
}

interface Survey {
  id: string;
  title: string;
  questions: Question[];
}

interface Question {
  id: string;
  text: string;
  type: string;
}

export default function Responses() {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [synthesizedResults, setSynthesizedResults] = useState<string | null>(null);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('Fetching survey data...');
        // Fetch surveys
        const { data: surveysData, error: surveysError } = await supabase
          .from('surveys')
          .select('id, title, questions');

        if (surveysError) throw surveysError;
        console.log('Surveys fetched:', surveysData);

        // Fetch responses
        const { data: responsesData, error: responsesError } = await supabase
          .from('survey_responses')
          .select('*')
          .order('created_at', { ascending: false });

        if (responsesError) throw responsesError;
        console.log('Responses fetched:', responsesData);

        setSurveys(surveysData || []);
        setResponses(responsesData || []);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err instanceof Error ? err.message : 'An error occurred while fetching data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Add debug log for render conditions
  useEffect(() => {
    console.log('Current state:', {
      loading,
      error,
      responsesCount: responses.length,
      surveysCount: surveys.length
    });
  }, [loading, error, responses, surveys]);

  const synthesizeResults = async () => {
    try {
      setIsSynthesizing(true);
      setSynthesizedResults(null);

      // Prepare the data for synthesis
      const synthesisData = surveys.map(survey => {
        const surveyResponses = responses.filter(r => r.survey_id === survey.id);
        return {
          title: survey.title,
          questions: survey.questions,
          responses: surveyResponses.map(response => {
            return response.answers.map(answer => {
              const question = survey.questions.find(q => q.id === answer.question_id);
              return {
                question: question?.text || 'Unknown Question',
                answer: answer.response
              };
            });
          })
        };
      });

      // Call ChatGPT API
      const response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `You are a survey analysis expert. Analyze the survey data and provide a comprehensive synthesis of the results. Include:
              1. Key findings and patterns
              2. Common themes in responses
              3. Notable insights
              4. Any significant correlations
              5. Summary statistics where applicable
              Format the response in clear sections with markdown headings.`
            },
            {
              role: 'user',
              content: JSON.stringify(synthesisData)
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to synthesize results');
      }

      const data = await response.json();
      setSynthesizedResults(data.content);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to synthesize results');
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-8">
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
          <div className="inline-block mb-4 px-4 py-2 bg-gray-100 rounded-full">
            <span className="text-gray-900">Results</span>
          </div>
          <h1 className="text-3xl font-bold text-[#1b1b1b] mb-4">
            Survey Results & Analysis
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Track responses and gain insights from your research surveys
          </p>
        </div>

        {loading && (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading responses...</p>
          </div>
        )}

        {error && (
          <div className="mb-8 p-4 bg-red-50 text-red-700 rounded-lg border border-red-100">
            Error: {error}
          </div>
        )}

        {!loading && !error && surveys.length === 0 && (
          <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-gray-600 mb-4">No surveys created yet</p>
            <p className="text-sm text-gray-500">
              Create a survey to start collecting responses
            </p>
          </div>
        )}

        {!loading && !error && surveys.length > 0 && (
          <>
            {/* Header with Synthesis Button */}
            <div className="flex justify-between items-center mb-8">
              <div className="text-sm text-gray-600">
                {responses.length === 0 ? (
                  <span>No responses collected yet</span>
                ) : (
                  <span>{responses.length} total responses</span>
                )}
              </div>
              <button
                onClick={synthesizeResults}
                disabled={isSynthesizing || responses.length === 0}
                className={`px-6 py-3 bg-[#0f172a] text-white rounded-md transition-colors flex items-center space-x-2
                  ${(isSynthesizing || responses.length === 0) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#1e293b]'}`}
                title={responses.length === 0 ? "Collect some responses first" : "Analyze all survey responses"}
              >
                {isSynthesizing ? (
                  <>
                    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <svg 
                      className="w-5 h-5 mr-2" 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Synthesize Results</span>
                  </>
                )}
              </button>
            </div>

            {/* Synthesized Results Section */}
            {synthesizedResults && (
              <div className="mb-12 bg-white shadow-sm rounded-lg p-6 border border-gray-200">
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Synthesized Results</h2>
                <div className="prose max-w-none">
                  <div dangerouslySetInnerHTML={{ __html: synthesizedResults.replace(/\n/g, '<br/>') }} />
                </div>
              </div>
            )}

            {/* Survey Results */}
            {responses.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-gray-600 mb-4">No responses collected yet</p>
                <p className="text-sm text-gray-500">
                  Share your surveys to start collecting responses
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {responses.map(response => {
                  const survey = surveys.find(s => s.id === response.survey_id);
                  return (
                    <div
                      key={response.id}
                      className="bg-white shadow-sm rounded-lg p-6 border border-gray-200 hover:border-indigo-200 transition-colors"
                    >
                      <div className="mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {survey?.title || 'Unknown Survey'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          Submitted on {new Date(response.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="space-y-4">
                        {response.answers.map(answer => {
                          const question = survey?.questions.find(q => q.id === answer.question_id);
                          return (
                            <div key={answer.question_id} className="border-t border-gray-100 pt-4">
                              <p className="text-sm font-medium text-gray-700">
                                {question?.text || 'Unknown Question'}
                              </p>
                              <p className="mt-1 text-gray-900">{answer.response}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
} 