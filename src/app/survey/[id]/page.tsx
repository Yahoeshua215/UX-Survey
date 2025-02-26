'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Survey, Question, SurveyResponse, Answer, supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import Link from 'next/link';

// Add this type for tabs
type TabType = 'preview' | 'take' | 'results' | 'share';

export default function TakeSurvey({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>('preview');
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [savedSurveys, setSavedSurveys] = useState<{ id: string; title: string; createdAt: string }[]>([]);
  const [showShareTooltip, setShowShareTooltip] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    const fetchSavedSurveys = async () => {
      const { data, error } = await supabase
        .from('surveys')
        .select('id, title, created_at')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setSavedSurveys(data.map(survey => ({
          id: survey.id,
          title: survey.title,
          createdAt: survey.created_at
        })));
      }
    };

    fetchSavedSurveys();
  }, []);

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
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load survey');
      }
    };

    fetchSurveyAndResponses();
  }, [params.id]);

  const handleAnswerChange = (questionId: string, value: string | number) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: value
    }));
  };

  const handleSubmit = async () => {
    if (!survey) return;

    try {
      setIsSubmitting(true);
      setError('');

      const { error: submitError } = await supabase
        .from('survey_responses')
        .insert([
          {
            id: uuidv4(),
            survey_id: survey.id,
            answers: survey.questions.map(question => ({
              question_id: question.id,
              response: answers[question.id] || ''
            })),
            created_at: new Date().toISOString()
          }
        ]);

      if (submitError) throw submitError;

      // Refresh responses after submission
      const { data: newResponses } = await supabase
        .from('survey_responses')
        .select('*')
        .eq('survey_id', survey.id);

      if (newResponses) {
        setResponses(newResponses);
      }

      // Clear answers and switch to results tab
      setAnswers({});
      setActiveTab('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit survey');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/respond/${params.id}`;
    await navigator.clipboard.writeText(shareUrl);
    setShowShareTooltip(true);
    setTimeout(() => setShowShareTooltip(false), 2000);
  };

  const handleSave = async () => {
    if (!survey) return;
    try {
      setIsSubmitting(true);
      setError('');

      // Update the survey status to saved
      const { error: saveError } = await supabase
        .from('surveys')
        .update({ status: 'saved' })
        .eq('id', survey.id);

      if (saveError) throw saveError;
      setIsSaved(true);
      setActiveTab('share'); // Switch to share tab after saving
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save survey');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderTabs = () => (
    <div className="border-b border-gray-200 mb-6">
      <nav className="-mb-px flex space-x-8">
        <button
          onClick={() => setActiveTab('preview')}
          className={`py-4 px-1 border-b-2 font-medium text-sm ${
            activeTab === 'preview'
              ? 'border-[#0f172a] text-[#0f172a]'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Survey Preview
        </button>
        {isSaved && (
          <>
            <button
              onClick={() => setActiveTab('share')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'share'
                  ? 'border-[#0f172a] text-[#0f172a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Share Survey
            </button>
            <button
              onClick={() => setActiveTab('take')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'take'
                  ? 'border-[#0f172a] text-[#0f172a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Take Survey
            </button>
            <button
              onClick={() => setActiveTab('results')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'results'
                  ? 'border-[#0f172a] text-[#0f172a]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Results
            </button>
          </>
        )}
      </nav>
    </div>
  );

  const renderQuestion = (question: Question, isPreview: boolean = false) => {
    switch (question.type) {
      case 'multiple_choice':
        return (
          <div className="space-y-3">
            {question.options?.map((option, index) => (
              <label key={index} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={answers[question.id] === option}
                  onChange={(e) => !isPreview && handleAnswerChange(question.id, e.target.value)}
                  disabled={isPreview}
                  className="w-4 h-4 text-[#0f172a] border-gray-300 focus:ring-[#0f172a]"
                />
                <span className="text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        );
      
      case 'text':
        return (
          <textarea
            value={answers[question.id] || ''}
            onChange={(e) => !isPreview && handleAnswerChange(question.id, e.target.value)}
            disabled={isPreview}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0f172a] focus:border-transparent transition-colors text-black"
            rows={3}
            placeholder={isPreview ? "Text response field" : "Type your answer here..."}
          />
        );
      
      case 'rating':
        return (
          <div className="flex space-x-4">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                onClick={() => !isPreview && handleAnswerChange(question.id, rating)}
                disabled={isPreview}
                className={`w-12 h-12 rounded-lg border ${
                  answers[question.id] === rating
                    ? 'bg-[#0f172a] text-white border-[#0f172a]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#0f172a]'
                } transition-colors`}
              >
                {rating}
              </button>
            ))}
          </div>
        );
      
      case 'yes_no':
        return (
          <div className="flex space-x-4">
            {['Yes', 'No'].map((option) => (
              <button
                key={option}
                onClick={() => !isPreview && handleAnswerChange(question.id, option)}
                disabled={isPreview}
                className={`px-6 py-3 rounded-lg border ${
                  answers[question.id] === option
                    ? 'bg-[#0f172a] text-white border-[#0f172a]'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-[#0f172a]'
                } transition-colors`}
              >
                {option}
              </button>
            ))}
          </div>
        );
      
      default:
        return null;
    }
  };

  const renderPreviewTab = () => (
    <div className="space-y-8">
      {survey?.questions.map((question, index) => (
        <div key={question.id} className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            {index + 1}. {question.text}
          </h2>
          {renderQuestion(question, true)}
        </div>
      ))}
      
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSubmitting || isSaved}
          className={`px-6 py-3 bg-[#0f172a] text-white rounded-md transition-colors ${
            isSubmitting || isSaved ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#1e293b]'
          }`}
        >
          {isSubmitting ? 'Saving...' : isSaved ? 'Saved' : 'Save Survey'}
        </button>
      </div>
    </div>
  );

  const renderTakeTab = () => (
    <div className="space-y-8">
      {survey?.questions.map((question, index) => (
        <div key={question.id} className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            {index + 1}. {question.text}
          </h2>
          {renderQuestion(question)}
        </div>
      ))}
      
      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={`px-6 py-3 bg-[#0f172a] text-white rounded-md transition-colors ${
            isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#1e293b]'
          }`}
        >
          {isSubmitting ? 'Submitting...' : 'Submit Survey'}
        </button>
      </div>
    </div>
  );

  const renderResultsTab = () => {
    if (!survey || !responses.length) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-900">No responses collected yet</p>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Response Summary</h2>
          <p className="text-gray-900">
            Total Responses: {responses.length}
          </p>
        </div>

        {survey.questions.map((question, index) => {
          const questionResponses = responses
            .map(r => r.answers.find(a => a.question_id === question.id)?.response)
            .filter(Boolean);

          return (
            <div key={question.id} className="bg-white p-6 rounded-lg shadow-sm border">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {index + 1}. {question.text}
              </h2>

              {question.type === 'multiple_choice' || question.type === 'yes_no' ? (
                <div className="space-y-4">
                  {Object.entries(
                    questionResponses.reduce((acc: Record<string, number>, response) => {
                      acc[response as string] = (acc[response as string] || 0) + 1;
                      return acc;
                    }, {})
                  ).map(([option, count]) => (
                    <div key={option} className="relative">
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-900">{option}</span>
                        <span className="text-gray-900">{Math.round((count / questionResponses.length) * 100)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-[#0f172a] h-2 rounded-full"
                          style={{ width: `${(count / questionResponses.length) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : question.type === 'rating' ? (
                <div className="space-y-4">
                  <div className="text-2xl font-bold text-gray-900">
                    {(questionResponses.reduce<number>((sum, r) => {
                      const value = typeof r === 'string' ? parseInt(r, 10) : Number(r);
                      return sum + (isNaN(value) ? 0 : value);
                    }, 0) / (questionResponses.length || 1)).toFixed(1)}
                    <span className="text-base font-normal text-gray-900 ml-2">average rating</span>
                  </div>
                  <div className="flex justify-between">
                    {[1, 2, 3, 4, 5].map(rating => {
                      const count = questionResponses.filter(r => Number(r) === rating).length;
                      const percentage = (count / questionResponses.length) * 100;
                      return (
                        <div key={rating} className="text-center flex-1">
                          <div className="text-sm text-gray-900 mb-1">{rating}</div>
                          <div className="mx-1">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-[#0f172a] h-2 rounded-full"
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                          <div className="text-sm text-gray-900 mt-1">{Math.round(percentage)}%</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {questionResponses.map((response, i) => (
                    <div key={i} className="p-4 bg-gray-50 rounded-lg">
                      <span className="text-gray-900">{response}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderShareTab = () => (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-lg shadow-sm border">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Share Your Survey</h2>
        
        <div className="space-y-6">
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">How it works:</h3>
            <ul className="space-y-3 text-gray-600">
              <li className="flex items-start">
                <span className="mr-2">1.</span>
                <span>Share the survey link with your participants</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">2.</span>
                <span>Participants will see a clean, focused interface to submit their responses</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">3.</span>
                <span>Track responses in real-time in the Results tab</span>
              </li>
            </ul>
          </div>

          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Share Options:</h3>
            <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
              <div className="flex-1 mr-4">
                <p className="text-sm text-gray-500 mb-1">Survey Link:</p>
                <code className="text-sm bg-gray-50 px-2 py-1 rounded">
                  {`${window.location.origin}/respond/${params.id}`}
                </code>
              </div>
              <button
                onClick={handleShare}
                className="inline-flex items-center px-4 py-2 bg-[#0f172a] text-white rounded-md hover:bg-[#1e293b] transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
                </svg>
                Copy Link
              </button>
            </div>
            {showShareTooltip && (
              <div className="text-center mt-2 text-sm text-green-600">
                Link copied to clipboard!
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Preview Survey</h3>
        <p className="text-gray-600 mb-4">This is how your survey will appear to participants:</p>
        {renderPreviewTab()}
      </div>
    </div>
  );

  if (error) {
    return (
      <div className="min-h-screen bg-white">
        <nav className="border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link href="/" className="flex items-center">
                  <span className="text-xl font-semibold">📋 ResearchAI</span>
                </Link>
              </div>
              <div className="flex items-center space-x-4">
                <Link href="/" className="text-gray-600 hover:text-gray-900">
                  Home
                </Link>
                <Link href="/create" className="text-gray-600 hover:text-gray-900">
                  Create Survey
                </Link>
                <Link href="/responses" className="text-gray-600 hover:text-gray-900">
                  Responses
                </Link>
                <Link
                  href="/get-started"
                  className="ml-4 px-4 py-2 bg-[#0f172a] text-white rounded-md hover:bg-[#1e293b] transition-colors"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <div className="flex min-h-[calc(100vh-4rem)]">
          {/* Saved Surveys Sidebar */}
          <div className="w-64 border-r bg-gray-50 p-4 overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Saved Surveys</h2>
            <div className="space-y-2">
              {savedSurveys.map(survey => (
                <Link
                  key={survey.id}
                  href={`/survey/${survey.id}`}
                  className={`block p-3 rounded-lg hover:bg-gray-100 transition-colors ${
                    params.id === survey.id ? 'bg-gray-100' : ''
                  }`}
                >
                  <h3 className="font-medium text-gray-900 truncate">{survey.title}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(survey.createdAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
              {savedSurveys.length === 0 && (
                <p className="text-sm text-gray-500 p-3">No saved surveys yet</p>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
              <div className="bg-red-50 p-4 rounded-lg border border-red-100 text-red-700">
                {error}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen bg-white">
        <nav className="border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Link href="/" className="flex items-center">
                  <span className="text-xl font-semibold">📋 ResearchAI</span>
                </Link>
              </div>
              <div className="flex items-center space-x-4">
                <Link href="/" className="text-gray-600 hover:text-gray-900">
                  Home
                </Link>
                <Link href="/create" className="text-gray-600 hover:text-gray-900">
                  Create Survey
                </Link>
                <Link href="/responses" className="text-gray-600 hover:text-gray-900">
                  Responses
                </Link>
                <Link
                  href="/get-started"
                  className="ml-4 px-4 py-2 bg-[#0f172a] text-white rounded-md hover:bg-[#1e293b] transition-colors"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </nav>
        <div className="flex min-h-[calc(100vh-4rem)]">
          {/* Saved Surveys Sidebar */}
          <div className="w-64 border-r bg-gray-50 p-4 overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Saved Surveys</h2>
            <div className="space-y-2">
              {savedSurveys.map(survey => (
                <Link
                  key={survey.id}
                  href={`/survey/${survey.id}`}
                  className={`block p-3 rounded-lg hover:bg-gray-100 transition-colors ${
                    params.id === survey.id ? 'bg-gray-100' : ''
                  }`}
                >
                  <h3 className="font-medium text-gray-900 truncate">{survey.title}</h3>
                  <p className="text-sm text-gray-500">
                    {new Date(survey.createdAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
              {savedSurveys.length === 0 && (
                <p className="text-sm text-gray-500 p-3">No saved surveys yet</p>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-full"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <nav className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <span className="text-xl font-semibold">📋 ResearchAI</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-600 hover:text-gray-900">
                Home
              </Link>
              <Link href="/create" className="text-gray-600 hover:text-gray-900">
                Create Survey
              </Link>
              <Link href="/responses" className="text-gray-600 hover:text-gray-900">
                Responses
              </Link>
              <Link
                href="/get-started"
                className="ml-4 px-4 py-2 bg-[#0f172a] text-white rounded-md hover:bg-[#1e293b] transition-colors"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* Saved Surveys Sidebar */}
        <div className="w-64 border-r bg-gray-50 p-4 overflow-y-auto">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Saved Surveys</h2>
          <div className="space-y-2">
            {savedSurveys.map(survey => (
              <Link
                key={survey.id}
                href={`/survey/${survey.id}`}
                className={`block p-3 rounded-lg hover:bg-gray-100 transition-colors ${
                  params.id === survey.id ? 'bg-gray-100' : ''
                }`}
              >
                <h3 className="font-medium text-gray-900 truncate">{survey.title}</h3>
                <p className="text-sm text-gray-500">
                  {new Date(survey.createdAt).toLocaleDateString()}
                </p>
              </Link>
            ))}
            {savedSurveys.length === 0 && (
              <p className="text-sm text-gray-500 p-3">No saved surveys yet</p>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{survey.title}</h1>
              <p className="text-gray-600 max-w-2xl mx-auto mb-4">{survey.description}</p>
            </div>

            {renderTabs()}

            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-100">
                {error}
              </div>
            )}

            {activeTab === 'preview' && renderPreviewTab()}
            {activeTab === 'share' && renderShareTab()}
            {activeTab === 'take' && renderTakeTab()}
            {activeTab === 'results' && renderResultsTab()}
          </div>
        </div>
      </div>
    </div>
  );
} 