'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';
import Link from 'next/link';
import Navigation from '../components/Navigation';
import Image from 'next/image';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';

// Add these interfaces at the top of the file after the imports
interface Question {
  id: string;
  text: string;
  type: 'multiple_choice' | 'text' | 'rating' | 'yes_no';
  options?: string[];
}

interface Survey {
  title: string;
  description: string;
  questions: Question[];
  status?: 'draft' | 'live';
}

// Add this interface for saved surveys
interface SavedSurvey {
  id: string;
  title: string;
  createdAt: string;
  status: 'draft' | 'live';
}

// Add this interface for steps
interface Step {
  id: TabType;
  label: string;
  canAccess: boolean;
}

// Add this type for tabs
type TabType = 'prompt' | 'preview' | 'share' | 'results';

// Update the ViewMode type definition
type ViewMode = 'text' | 'visualization';
type PreviewMode = 'list' | 'card';

interface ViewModeOption {
  type: ViewMode;
  label: string;
}

const VIEW_MODES: ViewModeOption[] = [
  { type: 'text', label: 'Text Analysis' },
  { type: 'visualization', label: 'Data Visualization' }
];

interface SurveyAnswer {
  question_id: string;
  response: string;
}

interface SurveyResponseData {
  id: string;
  created_at: string;
  answers: SurveyAnswer[];
}

// Add this interface for survey types
interface SurveyType {
  id: string;
  label: string;
  description: string;
  formula?: string;
  calculateScore?: (responses: SurveyResponseData[]) => number;
}

// Update survey types constant with unique IDs and formulas
const SURVEY_TYPES: SurveyType[] = [
  {
    id: 'nps',
    label: 'Net Promoter Score (NPS)',
    description: 'Measure customer loyalty and likelihood to recommend your product or service to others',
    formula: 'NPS = (% Promoters [9-10]) - (% Detractors [0-6])',
    calculateScore: (responses) => {
      const scores = responses.flatMap(r => 
        r.answers.filter(a => a.response >= '0' && a.response <= '10')
          .map(a => parseInt(a.response))
      );
      if (scores.length === 0) return 0;
      
      const promoters = scores.filter(score => score >= 9).length;
      const detractors = scores.filter(score => score <= 6).length;
      return ((promoters / scores.length) - (detractors / scores.length)) * 100;
    }
  },
  {
    id: 'sus',
    label: 'System Usability Scale (SUS)',
    description: 'Standardized questionnaire for assessing the perceived usability of a product or system',
    formula: 'SUS = [(Q1-1) + (5-Q2) + (Q3-1) + (5-Q4) + (Q5-1) + (5-Q6) + (Q7-1) + (5-Q8) + (Q9-1) + (5-Q10)] × 2.5',
    calculateScore: (responses) => {
      const susQuestions = [
        'I think that I would like to use this design frequently.',
        'I found the system unnecessarily complex.',
        'I thought the design was easy to use.',
        'I think that I would need the support of a technical person to be able to use this design.',
        'I found the various functions in this design were well integrated.',
        'I thought there was too much inconsistency in this design.',
        'I would imagine that most people would learn to use this design very quickly.',
        'I found the design very cumbersome to use.',
        'I felt very confident using the design.',
        'I needed to learn a lot of things before I could get going with this design.'
      ];

      const scores = responses.map(response => {
        let totalScore = 0;
        response.answers.forEach((answer, index) => {
          const score = parseInt(answer.response);
          // For odd-numbered questions (0-based index is even)
          if (index % 2 === 0) {
            totalScore += score - 1;
          }
          // For even-numbered questions (0-based index is odd)
          else {
            totalScore += 5 - score;
          }
        });
        return totalScore;
      });

      if (scores.length === 0) return 0;
      const averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
      return averageScore * 2.5; // Convert to 0-100 scale
    }
  },
  {
    id: 'csat',
    label: 'Customer Satisfaction (CSAT)',
    description: 'Evaluate overall customer satisfaction with your product or service',
    formula: 'CSAT = (Sum of all satisfaction ratings) / (Total number of responses) × 20 [to convert to percentage]',
    calculateScore: (responses) => {
      const satisfactionScores = responses.flatMap(r => 
        r.answers.filter(a => a.response >= '1' && a.response <= '5')
          .map(a => parseInt(a.response))
      );
      if (satisfactionScores.length === 0) return 0;
      
      const averageScore = satisfactionScores.reduce((sum, score) => sum + score, 0) / satisfactionScores.length;
      return averageScore * 20; // Convert 1-5 scale to percentage
    }
  },
  {
    id: 'ces',
    label: 'Customer Effort Score (CES)',
    description: 'Measure how easy it is for customers to interact with your product or service',
    formula: 'CES = Average of effort ratings (1-7 scale, where 1 is very low effort and 7 is very high effort)',
    calculateScore: (responses) => {
      const effortScores = responses.flatMap(r => 
        r.answers.filter(a => a.response >= '1' && a.response <= '7')
          .map(a => parseInt(a.response))
      );
      return effortScores.length > 0 
        ? effortScores.reduce((sum, score) => sum + score, 0) / effortScores.length 
        : 0;
    }
  },
  {
    id: 'tsm',
    label: 'Task Success Metric (TSM)',
    description: 'Evaluate the effectiveness of a design in enabling users to complete specific tasks',
    formula: 'TSM = (Number of successfully completed tasks / Total number of attempted tasks) × 100',
    calculateScore: (responses) => {
      const taskScores = responses.flatMap(r => 
        r.answers.filter(a => a.response.toLowerCase() === 'success' || a.response.toLowerCase() === 'failure')
          .map(a => a.response.toLowerCase() === 'success' ? 1 : 0)
      );
      if (taskScores.length === 0) return 0;
      
      const successfulTasks = taskScores.filter(score => score === 1).length;
      return (successfulTasks / taskScores.length) * 100;
    }
  }
];

// Add this helper function after the interfaces
const convertTextToSurvey = (text: string): Survey => {
  // Extract title (first line)
  const lines = text.split('\n').filter(line => line.trim());
  const title = lines[0]?.replace(/^(Title|Survey|#):\s*/i, '').trim() || 'Untitled Survey';
  
  // Extract description (second line or paragraph)
  const description = lines[1]?.trim() || 'No description provided';
  
  // Process remaining lines to find questions
  const questions: Question[] = [];
  let currentQuestion: Partial<Question> = {};
  
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Check if line starts with a number followed by dot/period
    if (/^\d+[\.\)]/.test(line)) {
      // Save previous question if exists
      if (currentQuestion.text) {
        questions.push(currentQuestion as Question);
      }
      
      // Start new question
      currentQuestion = {
        id: `q${questions.length + 1}`,
        text: line.replace(/^\d+[\.\)]\s*/, ''),
        type: 'text' // Default to text type unless specified otherwise
      };
      
      // Determine question type based on content and context
      const questionText = line.toLowerCase();
      if (
        questionText.includes('rate') || 
        questionText.includes('scale') || 
        questionText.includes('satisfaction') ||
        questionText.includes('how satisfied')
      ) {
        currentQuestion.type = 'rating';
      } else if (
        questionText.includes('do you agree') ||
        questionText.includes('would you agree') ||
        questionText.includes('is it true') ||
        (questionText.includes('yes') && questionText.includes('no'))
      ) {
        currentQuestion.type = 'yes_no';
      } else if (
        questionText.includes('select') ||
        questionText.includes('choose') ||
        questionText.includes('which') ||
        questionText.includes('pick')
      ) {
        currentQuestion.type = 'multiple_choice';
        currentQuestion.options = []; // Initialize empty options array
      } else if (
        questionText.includes('explain') ||
        questionText.includes('describe') ||
        questionText.includes('what') ||
        questionText.includes('how') ||
        questionText.includes('why')
      ) {
        currentQuestion.type = 'text';
      }
      // If no specific type is detected, keep it as text
    } else if ((line.startsWith('-') || line.startsWith('*')) && currentQuestion.text) {
      // This is an option for multiple choice
      if (!currentQuestion.options) {
        currentQuestion.type = 'multiple_choice';
        currentQuestion.options = [];
      }
      currentQuestion.options.push(line.replace(/^[-*]\s*/, '').trim());
    }
  }
  
  // Add the last question
  if (currentQuestion.text) {
    questions.push(currentQuestion as Question);
  }
  
  return {
    title,
    description,
    questions: questions.length > 0 ? questions : [{
      id: 'q1',
      text: 'No questions were found in the response',
      type: 'text'
    }]
  };
};

// Add these helper functions before the main component
const aggregateResponses = (responses: SurveyResponseData[], questions: Question[]) => {
  const result: Record<string, { 
    data: Array<{ name: string; value: number }>;
    responses?: string[];
  }> = {};

  questions.forEach(question => {
    const questionResponses = responses.flatMap(r => 
      r.answers.filter(a => a.question_id === question.id)
    );

    let aggregatedData: { [key: string]: number } = {};
    
    switch (question.type) {
      case 'multiple_choice':
      case 'yes_no':
        questionResponses.forEach(answer => {
          const response = answer.response as string;
          aggregatedData[response] = (aggregatedData[response] || 0) + 1;
        });
        result[question.id] = {
          data: Object.entries(aggregatedData).map(([name, value]) => ({ name, value }))
        };
        break;

      case 'rating':
        // Initialize counts for all ratings 1-5
        aggregatedData = Array.from({ length: 5 }, (_, i) => i + 1)
          .reduce((acc, rating) => ({ ...acc, [rating]: 0 }), {});
        
        // Count actual responses
        questionResponses.forEach(answer => {
          const rating = answer.response as string;
          aggregatedData[rating] = (aggregatedData[rating] || 0) + 1;
        });
        
        result[question.id] = {
          data: Object.entries(aggregatedData).map(([name, value]) => ({ name, value }))
        };
        break;

      case 'text':
        result[question.id] = {
          data: [],
          responses: questionResponses.map(answer => answer.response as string)
        };
        break;
    }
  });

  return result;
};

const CHART_COLORS = ['#0f172a', '#1e293b', '#334155', '#475569', '#64748b'];

export default function CreateSurvey() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const surveyId = searchParams.get('id');
  const [activeTab, setActiveTab] = useState<TabType>('prompt');
  const [prompt, setPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [rawResponse, setRawResponse] = useState('');
  const [parsedSurvey, setParsedSurvey] = useState<Survey | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [savedSurveys, setSavedSurveys] = useState<SavedSurvey[]>([]);
  const [showShareTooltip, setShowShareTooltip] = useState(false);
  const [savedSurveyId, setSavedSurveyId] = useState<string | null>(null);
  const [surveyStatus, setSurveyStatus] = useState<'draft' | 'live'>('draft');
  const [completedSteps, setCompletedSteps] = useState<Set<TabType>>(new Set());
  const [viewMode, setViewMode] = useState<PreviewMode>('list');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(false);
  const [surveyResponses, setSurveyResponses] = useState<SurveyResponseWithAnswers[]>([]);
  const [isLoadingResponses, setIsLoadingResponses] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesizedResults, setSynthesizedResults] = useState<string | null>(null);
  const [resultsViewMode, setResultsViewMode] = useState<ViewMode>('text');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSurveyType, setActiveSurveyType] = useState<string | null>(null);
  const [showActionMenu, setShowActionMenu] = useState<string | null>(null);
  const [hoveredType, setHoveredType] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const hoverTimer = useRef<NodeJS.Timeout | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  // Add type for survey response
  interface SurveyResponseWithAnswers {
    id: string;
    created_at: string;
    answers: Array<{
      question_id: string;
      response: string;
    }>;
  }

  // Add type for survey data
  interface SurveyData {
    id: string;
    title: string;
    created_at: string;
    status?: 'draft' | 'live';
  }

  useEffect(() => {
    if (surveyId) {
      loadSavedSurvey(surveyId);
    } else {
      // Reset state when no survey ID is present
      setParsedSurvey(null);
      setPrompt('');
      setActiveTab('prompt');
      setCompletedSteps(new Set());
      setSavedSurveyId(null);
      setSurveyStatus('draft');
      setIsVerified(false);
      setViewMode('list');
      setCurrentQuestionIndex(0);
      setIsPreviewExpanded(false);
      setSurveyResponses([]);
      setSynthesizedResults(null);
    }
  }, [surveyId]);

  useEffect(() => {
    const fetchResponses = async () => {
      if (!savedSurveyId) return;
      
      setIsLoadingResponses(true);
      try {
        const { data, error } = await supabase
          .from('survey_responses')
          .select('*')
          .eq('survey_id', savedSurveyId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSurveyResponses(data || []);
      } catch (err) {
        console.error('Error fetching responses:', err);
        setError(err instanceof Error ? err.message : 'Failed to load responses');
      } finally {
        setIsLoadingResponses(false);
      }
    };

    if (activeTab === 'results') {
      fetchResponses();
    }
  }, [savedSurveyId, activeTab]);

  const handleShare = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/respond/${savedSurveyId}`);
    setShowShareTooltip(true);
    setTimeout(() => setShowShareTooltip(false), 2000);
  };

  const steps: Step[] = [
    { id: 'prompt', label: '1. Create', canAccess: true },
    { id: 'preview', label: '2. Preview', canAccess: !!parsedSurvey },
    { id: 'share', label: '3. Share', canAccess: !!savedSurveyId },
    { id: 'results', label: '4. Results', canAccess: surveyStatus === 'live' }
  ];

  // Move fetchSavedSurveys outside useEffect so it can be reused
  const fetchSavedSurveys = async () => {
    try {
      console.log('Starting to fetch saved surveys...');
      
      const { data, error } = await supabase
        .from('surveys')
        .select('id, title, created_at, status')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching surveys:', error.message);
        setError(error.message);
        return;
      }

      if (!data) {
        console.log('No surveys found');
        setSavedSurveys([]);
        return;
      }

      console.log('Raw survey data:', data);
      
      const formattedSurveys = data.map(survey => ({
        id: survey.id,
        title: survey.title,
        createdAt: survey.created_at,
        status: survey.status || 'draft'
      }));
      
      console.log('Formatted surveys:', formattedSurveys);
      setSavedSurveys(formattedSurveys);
    } catch (err) {
      console.error('Unexpected error fetching surveys:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    }
  };

  // Use fetchSavedSurveys in useEffect
  useEffect(() => {
    fetchSavedSurveys();
  }, []);

  const generateSurvey = async () => {
    if (!prompt.trim()) return;

    try {
      setIsLoading(true);
      setError('');

      // Get the selected survey type details
      const selectedType = activeSurveyType ? SURVEY_TYPES.find(type => type.id === activeSurveyType) : null;

      // Create the system prompt based on the survey type
      const systemPrompt = `You are a survey design expert. Create a well-structured ${selectedType?.label || ''} survey based on the user's requirements.
${selectedType ? `This survey must follow the ${selectedType.label} format:

${selectedType.id === 'nps' ? `
- Include the standard NPS question: "On a scale of 0 to 10, how likely are you to recommend this product/service to a friend or colleague?"
- Use a rating type question with a 0-10 scale
- Add follow-up questions to understand the reasons for their score` : ''}

${selectedType.id === 'sus' ? `
- Include all 10 standard SUS questions in this exact order:
1. "I think that I would like to use this design frequently."
2. "I found the system unnecessarily complex."
3. "I thought the design was easy to use."
4. "I think that I would need the support of a technical person to be able to use this design."
5. "I found the various functions in this design were well integrated."
6. "I thought there was too much inconsistency in this design."
7. "I would imagine that most people would learn to use this design very quickly."
8. "I found the design very cumbersome to use."
9. "I felt very confident using the design."
10. "I needed to learn a lot of things before I could get going with this design."
- Use a rating type question with a 1-5 scale for all questions
- Maintain the alternating positive/negative question pattern` : ''}

${selectedType.id === 'csat' ? `
- Include satisfaction rating questions using a 1-5 scale
- Add questions about specific aspects of the product/service
- Include open-ended questions for detailed feedback` : ''}

${selectedType.id === 'ces' ? `
- Include effort assessment questions using a 1-7 scale
- Focus on the ease/difficulty of specific interactions
- Add questions about potential improvements` : ''}

${selectedType.id === 'tsm' ? `
- Include specific task completion questions with success/failure options
- Add questions about task difficulty and user confidence
- Include questions about obstacles encountered during tasks` : ''}` : ''}

Return ONLY a raw JSON object (no markdown, no code blocks, no backticks) with this structure:
{
  "title": "Survey Title",
  "description": "Survey Description",
  "questions": [
    {
      "id": "q1",
      "text": "Question Text",
      "type": "multiple_choice|text|rating|yes_no",
      "options": ["Option 1", "Option 2"]  // Only for multiple_choice type
    }
  ]
}

Important rules:
- Response must be ONLY the raw JSON object
- Do not include \`\`\`json or any other markdown
- Each question must have a unique id (q1, q2, etc.)
- Question types must be one of: multiple_choice, text, rating, yes_no
- Multiple choice questions must include 3-5 relevant options
- Make questions clear, unbiased, and relevant to survey goals`;

      const response = await fetch('/api/openai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
              content: systemPrompt
              },
              {
                role: 'user',
                content: prompt
              }
            ]
          })
        });

      if (!response.ok) throw new Error('Failed to generate survey');
      
      const data = await response.json();
      
      // Try to parse the response as JSON
      let surveyData;
      try {
        // Clean the response by removing any markdown formatting
        let cleanContent = data.content;
        // Remove markdown code block syntax if present
        cleanContent = cleanContent.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        // Remove any leading/trailing whitespace
        cleanContent = cleanContent.trim();
        
        // If the content is a string (JSON string), parse it
        if (typeof cleanContent === 'string') {
          surveyData = JSON.parse(cleanContent);
        } else {
          // If it's already an object, use it directly
          surveyData = cleanContent;
        }
        
        // Validate the survey structure
        if (!surveyData.title || !surveyData.description || !Array.isArray(surveyData.questions)) {
          throw new Error('Invalid survey structure');
        }
        
        // Validate each question
        surveyData.questions = surveyData.questions.map((q: any, index: number) => ({
          id: q.id || `q${index + 1}`,
          text: q.text,
          type: q.type || 'text',
          options: q.type === 'multiple_choice' ? (q.options || []) : undefined
        }));

        // Log the successful parsing
        console.log('Successfully parsed survey data:', surveyData);
      } catch (parseError) {
        console.error('Parse error:', parseError);
        console.error('Raw content:', data.content);
        throw new Error('Failed to parse survey data. Please try again.');
      }

      setParsedSurvey(surveyData);
      
      // Update completed steps and move to preview tab
      setCompletedSteps(prev => {
        const newSet = new Set(prev);
        newSet.add('prompt');
        return newSet;
      });
      setActiveTab('preview');

    } catch (err) {
      console.error('Generation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate survey');
      setActiveTab('prompt'); // Stay on prompt tab if there's an error
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = () => {
    try {
      const surveyData = convertTextToSurvey(rawResponse);
      setParsedSurvey(surveyData);
      setShowPreview(true);
      setError('');
    } catch (parseError: unknown) {
      setError('Failed to create survey preview: ' + (parseError instanceof Error ? parseError.message : String(parseError)));
    }
  };

  const handleSubmit = async () => {
    if (!parsedSurvey || !isVerified) {
      setError('Please verify the survey before saving');
      return;
    }

    try {
      setIsLoading(true);
      setError('');

      // Generate a new UUID for the survey
      const surveyId = uuidv4();
      
      // Prepare the survey data with only the fields that exist in the database schema
      const surveyData = {
        id: surveyId,
        title: parsedSurvey.title,
        description: parsedSurvey.description,
        questions: parsedSurvey.questions,
        created_at: new Date().toISOString(),
        user_id: 'anonymous',
        status: 'draft' // Add status field
      };

      const { data, error: supabaseError } = await supabase
        .from('surveys')
        .insert([surveyData])
        .select()
        .single();

      if (supabaseError) {
        console.error('Supabase error:', supabaseError);
        throw new Error(supabaseError.message);
      }

      if (!data) {
        throw new Error('No data returned from survey creation');
      }

      // Update local state
      setSavedSurveys(prev => [{
        id: data.id,
        title: data.title,
        createdAt: data.created_at,
        status: 'draft'
      }, ...prev]);
      
      setSavedSurveyId(surveyId);
      setSurveyStatus('draft');
      setCompletedSteps(prev => {
        const newSet = new Set(prev);
        newSet.add('preview');
        return newSet;
      });
      setActiveTab('share');
      
    } catch (err) {
      console.error('Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save survey. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const setLive = async () => {
    if (!savedSurveyId) return;

    try {
      setIsLoading(true);
      setError('');

      // Update the survey status in the database
      const { data, error } = await supabase
        .from('surveys')
        .update({ status: 'live' })
        .eq('id', savedSurveyId)
        .select()
        .single();

      if (error) {
        console.error('Error updating survey status:', error);
        throw error;
      }

      // Update local states
      setSurveyStatus('live');
      setSavedSurveys(prev => prev.map(survey => 
        survey.id === savedSurveyId ? { ...survey, status: 'live' } : survey
      ));
      
      // Update completed steps to include results tab
      setCompletedSteps(prev => {
        const newSet = new Set(prev);
        newSet.add('share');
        newSet.add('results');
        return newSet;
      });
      
    } catch (err) {
      console.error('Error setting survey live:', err);
      setError(err instanceof Error ? err.message : 'Failed to set survey live');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (tab: TabType) => {
    const stepIndex = steps.findIndex(step => step.id === tab);
    const targetStep = steps[stepIndex];
    
    if (targetStep.canAccess) {
      setActiveTab(tab);
    }
  };

  const handleContinue = () => {
    const currentIndex = steps.findIndex(step => step.id === activeTab);
    const nextStep = steps[currentIndex + 1];
    
    if (nextStep && nextStep.canAccess) {
      setActiveTab(nextStep.id);
      setCompletedSteps(prev => new Set(Array.from(prev).concat(steps[currentIndex].id)));
    }
  };

  const renderTabs = () => (
    <div className="mb-12">
      <div className="max-w-3xl mx-auto px-4">
        <nav aria-label="Progress">
          <ol className="flex items-center justify-between">
            {steps.map((step, stepIdx) => (
              <li key={step.id} className="relative flex items-center">
                  <button
                    onClick={() => handleTabChange(step.id)}
                    disabled={!step.canAccess}
                  className={`flex items-center ${
                      activeTab === step.id
                      ? 'bg-indigo-600 text-white px-6 py-2 rounded-full shadow-sm'
                        : completedSteps.has(step.id)
                      ? 'text-indigo-600'
                        : step.canAccess
                      ? 'text-gray-500 hover:text-gray-700'
                      : 'text-gray-300 cursor-not-allowed'
                    }`}
                  >
                  {completedSteps.has(step.id) && (
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  <span className="text-sm font-medium">{step.label.split('.')[1]}</span>
                  </button>

                {stepIdx !== steps.length - 1 && (
                  <div className="hidden md:block w-24 mx-4">
                    <div className={`h-0.5 transition-colors duration-200 ${
                      completedSteps.has(step.id) ? 'bg-indigo-600' : 'bg-gray-200'
                    }`} />
                  </div>
                )}
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </div>
  );

  const renderPromptTab = () => (
    <div className="space-y-6">
      {/* Survey Type Selection moved outside the card */}
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-3">
          Select a survey type (optional)
        </h3>
        <div className="flex flex-wrap gap-2">
          {SURVEY_TYPES.map(type => (
            <div
              key={type.id}
              className="relative"
              onMouseEnter={() => handleMouseEnter(type.id)}
              onMouseLeave={handleMouseLeave}
            >
              <button
                onClick={() => setActiveSurveyType(activeSurveyType === type.id ? null : type.id)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeSurveyType === type.id
                    ? 'bg-indigo-50 text-indigo-600 border border-indigo-600'
                    : 'bg-gray-50 text-gray-700 border border-gray-200 hover:border-gray-300 hover:bg-gray-100'
                }`}
              >
                {type.label}
              </button>
              
              {/* Custom Tooltip */}
              {hoveredType === type.id && showTooltip && (
                <div 
                  className="absolute z-50 w-64 p-4 mt-2 transform -translate-x-1/2 left-1/2 bg-gray-900 text-white rounded-lg shadow-lg animate-tooltipFade"
                >
                  <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                    <div className="w-4 h-4 bg-gray-900 transform rotate-45" />
                  </div>
                  <div className="relative">
                    <p className="text-sm font-medium mb-1">{type.label}</p>
                    <p className="text-xs text-gray-300">{type.description}</p>
                    {type.formula && (
                      <div className="mt-2 pt-2 border-t border-gray-700">
                        <p className="text-xs font-medium text-gray-400">Formula:</p>
                        <p className="text-xs text-gray-300 font-mono">{type.formula}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Prompt Card */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-6">
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Describe your survey requirements
          </h3>
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your survey requirements and goals. What do you want to learn from your participants?"
              className="w-full h-32 p-4 text-gray-900 placeholder-gray-400 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-600 focus:border-transparent resize-none"
            />
            <div className="absolute bottom-3 right-3">
              <button
                onClick={generateSurvey}
                disabled={!prompt.trim() || isLoading}
                className={`
                  inline-flex items-center px-4 py-2 rounded-md text-sm font-medium
                  ${!prompt.trim() || isLoading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  }
                  transition-colors
                `}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  'Generate'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPreviewTab = () => (
    <>
      {error && (
        <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg border border-red-100">
          {error}
        </div>
      )}

      {parsedSurvey ? (
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{parsedSurvey.title}</h2>
          <p className="text-gray-800 mb-8">{parsedSurvey.description}</p>

          {/* Add view mode toggle */}
          <div className="flex items-center justify-end mb-6 space-x-4">
            <span className="text-sm text-gray-600">View Mode:</span>
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('list')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                List View
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'card'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Card View
              </button>
            </div>
          </div>

          {viewMode === 'list' ? (
            // List View
            <div className="space-y-6">
              {parsedSurvey.questions.map((question: Question, index: number) => (
                <div key={question.id} className="bg-gray-50 p-6 rounded-lg border relative group">
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => regenerateQuestion(question.id)}
                      disabled={isLoading}
                      className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition-colors"
                      title="Regenerate this question"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {index + 1}. {question.text}
                  </h3>
                  {renderQuestion(question)}
                </div>
              ))}
            </div>
          ) : (
            // Card View
            <div className="space-y-6">
              {/* Progress indicator */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1 max-w-xs mx-auto">
                  <div className="bg-gray-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full transition-all duration-300 ease-in-out"
                      style={{
                        width: `${((currentQuestionIndex + 1) / parsedSurvey.questions.length) * 100}%`
                      }}
                    />
                  </div>
                  <div className="text-center mt-2 text-sm text-gray-600">
                    Question {currentQuestionIndex + 1} of {parsedSurvey.questions.length}
                  </div>
                </div>
              </div>

              {/* Current question card */}
              <div className="bg-gray-50 p-6 rounded-lg border min-h-[300px] flex flex-col relative group">
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => regenerateQuestion(parsedSurvey.questions[currentQuestionIndex].id)}
                    disabled={isLoading}
                    className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded-full transition-colors"
                    title="Regenerate this question"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-6 text-left">
                  {currentQuestionIndex + 1}. {parsedSurvey.questions[currentQuestionIndex].text}
                </h3>
                <div className="flex-1 w-full">
                  {renderQuestion(parsedSurvey.questions[currentQuestionIndex])}
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between items-center mt-6">
                <button
                  onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))}
                  disabled={currentQuestionIndex === 0}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    currentQuestionIndex === 0
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentQuestionIndex(prev => Math.min(parsedSurvey.questions.length - 1, prev + 1))}
                  disabled={currentQuestionIndex === parsedSurvey.questions.length - 1}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    currentQuestionIndex === parsedSurvey.questions.length - 1
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-[#0f172a] text-white hover:bg-[#1e293b]'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          <div className="mt-8 border-t pt-6">
            <div className="flex flex-col space-y-6">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="verify-survey"
                  checked={isVerified}
                  onChange={(e) => setIsVerified(e.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
                <label htmlFor="verify-survey" className="text-sm text-gray-600">
                  I verify that this survey is ready to share
                </label>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => handleTabChange('prompt')}
                  className="px-6 py-3 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  Back to Prompt
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!isVerified}
                  className={`px-6 py-3 bg-indigo-600 text-white rounded-md transition-colors ${
                    !isVerified ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
                  }`}
                >
                  Continue to Share
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-500">Generate a survey first to see the preview</p>
          <button
            onClick={() => handleTabChange('prompt')}
            className="mt-4 px-6 py-2 text-[#0f172a] hover:text-[#1e293b] transition-colors"
          >
            Go to Prompt
          </button>
        </div>
      )}
    </>
  );

  const renderShareTab = () => (
    <div className="space-y-8">
      <div className="bg-white p-8 rounded-lg shadow-sm border">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Share Your Survey</h2>
        
        <div className="space-y-6">
          {surveyStatus === 'draft' ? (
            <div className="bg-yellow-50 p-6 rounded-lg border border-yellow-100">
              <h3 className="text-lg font-semibold text-yellow-900 mb-3">Survey is in Draft Mode</h3>
              <p className="text-yellow-800 mb-4">Set your survey live to start collecting responses.</p>
              <button
                onClick={setLive}
                disabled={isLoading}
                className={`px-6 py-3 bg-yellow-600 text-white rounded-md transition-colors ${
                  isLoading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-yellow-700'
                }`}
              >
                {isLoading ? 'Setting Live...' : 'Set Survey Live'}
              </button>
            </div>
          ) : (
            <div className="bg-green-50 p-6 rounded-lg border border-green-100">
              <h3 className="text-lg font-semibold text-green-900 mb-3">Survey is Live!</h3>
              <p className="text-green-800">Your survey is now accepting responses.</p>
            </div>
          )}

          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Share Options:</h3>
            <div className="flex items-center justify-between p-4 bg-white rounded-lg border">
              <div className="flex-1 mr-4">
                <p className="text-sm text-gray-600 mb-1">Survey Link:</p>
                <code className="text-sm text-gray-900 bg-gray-50 px-2 py-1 rounded block">
                  {`${window.location.origin}/respond/${savedSurveyId}`}
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

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <button
          onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
          className="w-full flex items-center justify-between p-6 text-left hover:bg-gray-50 transition-colors"
        >
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Preview Survey</h3>
            <p className="text-sm text-gray-600">Click to {isPreviewExpanded ? 'hide' : 'show'} how your survey will appear to participants</p>
          </div>
          <svg
            className={`w-5 h-5 text-gray-500 transform transition-transform ${isPreviewExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {isPreviewExpanded && (
          <div className="border-t">
            {parsedSurvey && (
              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">{parsedSurvey.title}</h2>
                <p className="text-gray-800 mb-8">{parsedSurvey.description}</p>
                <div className="space-y-6">
                  {parsedSurvey.questions.map((question: Question, index: number) => (
                    <div key={question.id} className="bg-gray-50 p-6 rounded-lg border">
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">
                        {index + 1}. {question.text}
                      </h3>
                      {renderQuestion(question)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const renderResultsTab = () => {
    if (!parsedSurvey || !surveyResponses || surveyResponses.length === 0) {
      return (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600">No responses collected yet</p>
          <p className="text-sm text-gray-500 mt-2">Share your survey to start collecting responses</p>
        </div>
      );
    }

    // Aggregate the response data for visualizations
    const aggregatedData = aggregateResponses(surveyResponses, parsedSurvey.questions);

    // Calculate survey score if it's a specific type
    const surveyType = SURVEY_TYPES.find(type => type.id === activeSurveyType);
    const surveyScore = surveyType?.calculateScore?.(surveyResponses);

    return (
    <div className="space-y-8">
        {/* Survey Score Card - Always show if there's a survey type */}
        {surveyType && (
          <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">{surveyType.label} Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-600 mb-2">Formula</p>
                <p className="text-gray-900">{surveyType.formula}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-600 mb-2">Score</p>
                <p className="text-2xl font-bold text-indigo-600">
                  {surveyScore !== undefined ? (
                    <>
                      {surveyScore.toFixed(2)}
                      {(surveyType.id === 'nps' || surveyType.id === 'csat') && '%'}
                    </>
                  ) : (
                    'N/A'
                  )}
                </p>
      </div>
            </div>
          </div>
        )}

        {/* Response Summary */}
        <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Survey Results
              <span className="ml-2 text-sm font-normal text-gray-600">
                ({surveyResponses.length} {surveyResponses.length === 1 ? 'response' : 'responses'})
              </span>
            </h2>
        <button
              onClick={synthesizeResults}
              disabled={isSynthesizing}
              className={`px-6 py-3 bg-[#0f172a] text-white rounded-md transition-colors flex items-center space-x-2
                ${isSynthesizing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#1e293b]'}`}
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
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <span>Synthesize Results</span>
                </>
              )}
        </button>
      </div>

          {/* Synthesized Results Section */}
          {synthesizedResults && (
            <div className="mb-12">
              {/* Key Metrics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-sm font-medium text-gray-500 mb-1">Total Responses</div>
                  <div className="text-2xl font-bold text-gray-900">{surveyResponses.length}</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-sm font-medium text-gray-500 mb-1">Questions Analyzed</div>
                  <div className="text-2xl font-bold text-gray-900">{parsedSurvey.questions.length}</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="text-sm font-medium text-gray-500 mb-1">Last Response</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {new Date(surveyResponses[0].created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center justify-end mb-6 space-x-4">
                <span className="text-sm text-gray-600">View Mode:</span>
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  {VIEW_MODES.map((mode) => (
                    <button
                      key={mode.type}
                      onClick={() => setResultsViewMode(mode.type)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        resultsViewMode === mode.type
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-600 hover:text-gray-900'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              {resultsViewMode === 'text' ? (
                /* Text Analysis */
                renderSynthesizedResults()
              ) : (
                /* Data Visualization */
                <div className="space-y-8">
                  {parsedSurvey.questions.map((question) => {
                    const questionData = aggregatedData[question.id];
                    if (!questionData) return null;

                    return (
                      <div key={question.id} className="bg-white rounded-lg p-6 border border-gray-200">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">{question.text}</h3>
                        {question.type === 'text' ? (
                          <div className="space-y-2">
                            {questionData.responses?.map((response, index) => (
                              <div key={index} className="p-3 bg-gray-50 rounded-lg">
                                <p className="text-gray-800">{response}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                              {question.type === 'rating' ? (
                                <BarChart data={questionData.data}>
                                  <CartesianGrid strokeDasharray="3 3" />
                                  <XAxis dataKey="name" />
                                  <YAxis />
                                  <Tooltip />
                                  <Bar dataKey="value" fill="#0f172a" />
                                </BarChart>
                              ) : (
                                <PieChart>
                                  <Pie
                                    data={questionData.data}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={80}
                                    label
                                  >
                                    {questionData.data.map((entry, index) => (
                                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                                    ))}
                                  </Pie>
                                  <Tooltip />
                                </PieChart>
                              )}
                            </ResponsiveContainer>
                          </div>
                        )}
    </div>
  );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Individual Responses */}
        <div className="space-y-6">
          <h3 className="text-xl font-semibold text-gray-900">Individual Responses</h3>
          {surveyResponses.map((response) => (
            <div key={response.id} className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
              <p className="text-sm text-gray-500 mb-4">
                Submitted on {new Date(response.created_at).toLocaleDateString()}
              </p>
              <div className="space-y-4">
                {response.answers.map((answer: any) => {
                  const question = parsedSurvey.questions.find(q => q.id === answer.question_id);
                  return (
                    <div key={answer.question_id} className="border-t border-gray-100 pt-4">
                      <p className="text-sm font-medium text-gray-700">
                        {question?.text || 'Unknown Question'}
                      </p>
                      <p className="mt-2 text-gray-900">{answer.response}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderQuestion = (question: Question) => {
    switch (question.type) {
      case 'multiple_choice':
        return (
          <div className="space-y-3 w-full">
            {question.options?.map((option: string, optIndex: number) => (
              <label key={optIndex} className="block w-full">
                <div className="flex items-center p-4 bg-white border rounded-lg cursor-pointer hover:border-indigo-200 hover:bg-indigo-50 transition-all">
                <input
                  type="radio"
                  name={`preview_${question.id}`}
                  value={option}
                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-600"
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
            <div className="bg-white border rounded-lg p-4 hover:border-indigo-200 transition-all">
            <textarea
              placeholder="Type your answer here..."
                className="w-full px-3 py-2 text-gray-900 placeholder-gray-500 bg-transparent border-0 focus:ring-0"
              rows={3}
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
                    name={`preview_${question.id}`}
                    value={rating}
                    className="sr-only peer"
                  />
                  <div className="flex items-center justify-center p-3 bg-white border rounded-lg cursor-pointer hover:border-indigo-200 peer-checked:border-indigo-600 peer-checked:bg-indigo-50 transition-all">
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
                    name={`preview_${question.id}`}
                    value={option}
                    className="sr-only peer"
                  />
                  <div className="flex items-center justify-center p-4 bg-white border rounded-lg cursor-pointer hover:border-indigo-200 peer-checked:border-indigo-600 peer-checked:bg-indigo-50 transition-all">
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

  const loadSavedSurvey = async (surveyId: string) => {
    try {
      setIsLoading(true);
      setError('');

      // Fetch the survey data
      const { data: surveyData, error: surveyError } = await supabase
        .from('surveys')
        .select('*')
        .eq('id', surveyId)
        .single();

      if (surveyError) throw surveyError;

      // Fetch survey responses
      const { data: responsesData, error: responsesError } = await supabase
        .from('survey_responses')
        .select('*')
        .eq('survey_id', surveyId)
        .order('created_at', { ascending: false });

      if (responsesError) throw responsesError;

      // Get the status from the survey data, defaulting to 'draft' if not present
      const status = (surveyData.status || 'draft') as 'draft' | 'live';

      // Determine the survey type based on the questions
      let detectedSurveyType = null;
      const questions = surveyData.questions as Question[];
      
      // Check for NPS question
      if (questions.some((q: Question) => q.text.toLowerCase().includes('recommend') && q.text.toLowerCase().includes('scale of 0 to 10'))) {
        detectedSurveyType = 'nps';
      }
      // Check for SUS questions
      else if (questions.length === 10 && questions.some((q: Question) => q.text.includes('I think that I would like to use this'))) {
        detectedSurveyType = 'sus';
      }
      // Check for CSAT questions
      else if (questions.some((q: Question) => q.text.toLowerCase().includes('satisfaction') && q.type === 'rating')) {
        detectedSurveyType = 'csat';
      }
      // Check for CES questions
      else if (questions.some((q: Question) => q.text.toLowerCase().includes('effort') && q.type === 'rating')) {
        detectedSurveyType = 'ces';
      }
      // Check for TSM questions
      else if (questions.some((q: Question) => q.text.toLowerCase().includes('task') && q.text.toLowerCase().includes('success'))) {
        detectedSurveyType = 'tsm';
      }

      // Update all relevant states
      setParsedSurvey({
        title: surveyData.title,
        description: surveyData.description,
        questions: surveyData.questions,
        status: status
      });
      setSavedSurveyId(surveyId);
      setSurveyStatus(status);
      setIsVerified(true);
      setActiveSurveyType(detectedSurveyType);
      
      // Set the active tab based on status
      setActiveTab(status === 'live' ? 'results' : 'share');
      
      // Update completed steps based on status
      const newSteps = new Set<TabType>(['prompt', 'preview', 'share']);
      if (status === 'live') {
        newSteps.add('results');
      }
      setCompletedSteps(newSteps);

      // Refresh the saved surveys list
      const { data: surveysData } = await supabase
        .from('surveys')
        .select('id, title, created_at, status')
        .order('created_at', { ascending: false });

      if (surveysData) {
        setSavedSurveys(surveysData.map(survey => ({
          id: survey.id,
          title: survey.title,
          createdAt: survey.created_at,
          status: (survey.status || 'draft') as 'draft' | 'live'
        })));
      }

    } catch (err) {
      console.error('Error loading survey:', err);
      setError(err instanceof Error ? err.message : 'Failed to load survey');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSurveyStatus = async (surveyId: string, currentStatus: 'draft' | 'live') => {
    try {
      const newStatus = currentStatus === 'live' ? 'draft' : 'live';
      
      const { data, error } = await supabase
        .from('surveys')
        .update({ status: newStatus })
        .eq('id', surveyId)
        .select()
        .single();

      if (error) throw error;

      // Update local state
      setSavedSurveys(prev => prev.map(survey => 
        survey.id === surveyId ? { ...survey, status: newStatus } : survey
      ));

      // If this is the currently active survey, update its status
      if (savedSurveyId === surveyId) {
        setSurveyStatus(newStatus);
      }

    } catch (err) {
      console.error('Error toggling survey status:', err);
      setError(err instanceof Error ? err.message : 'Failed to update survey status');
    }
  };

  const synthesizeResults = async () => {
    try {
      setIsSynthesizing(true);
      setSynthesizedResults(null);

      // Structure the data for analysis
      const structuredData = {
        surveyTitle: parsedSurvey?.title,
        responses: surveyResponses.map(response => ({
          submittedAt: response.created_at,
          answers: response.answers.map(answer => {
            const question = parsedSurvey?.questions.find(q => q.id === answer.question_id);
            return {
              question: question?.text || 'Unknown Question',
              response: answer.response,
              type: question?.type || 'text'
            };
          })
        }))
      };

      const response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: `You are a survey analysis expert. Analyze the survey responses and provide a clear, simple text summary. Format your response in three sections:

1. Key Findings
Present 3-4 main findings from the survey. Each finding should be a simple, clear statement on a new line starting with a bullet point (•).

2. Response Details
Break down the responses by question, including:
- Notable trends in the data
- Relevant percentages or numbers
- Patterns in responses

3. Recommendations
Provide 2-3 clear, actionable recommendations based on the survey results.

Important formatting rules:
- Use only plain text
- Start each point with a bullet point (•)
- No special characters or formatting
- Keep language clear and concise
- Use simple line breaks between sections`
            },
            {
              role: 'user',
              content: `Please analyze this survey titled "${structuredData.surveyTitle}" with the following responses: ${JSON.stringify(structuredData.responses, null, 2)}`
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error('Failed to synthesize results');
      }

      const data = await response.json();
      if (data.content) {
        // Clean up the text and ensure consistent formatting
        const cleanText = data.content
          .replace(/[#*`]/g, '') // Remove any markdown characters
          .replace(/[-–—]/g, '•') // Convert all types of dashes to bullet points
          .replace(/^\d+\.\s*/gm, '') // Remove numbered lists
          .replace(/\n{3,}/g, '\n\n') // Normalize multiple line breaks
          .replace(/\s+$/gm, '') // Remove trailing whitespace
          .trim();

        setSynthesizedResults(cleanText);
      } else {
        throw new Error('No synthesis results returned');
      }
    } catch (err) {
      console.error('Error synthesizing results:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Update the display of synthesized results
  const renderSynthesizedResults = () => (
    <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Analysis Summary</h2>
      <div className="prose max-w-none">
        <div className="text-gray-900">
          <div className="bg-gray-50 rounded-lg p-4">
            {synthesizedResults?.split('\n\n').map((section, index) => (
              <div key={index} className="mb-6 last:mb-0">
                {section.split('\n').map((line, lineIndex) => (
                  <p key={lineIndex} className={`${
                    line.includes('Key Findings') || 
                    line.includes('Response Details') || 
                    line.includes('Recommendations')
                      ? 'font-semibold text-gray-900 mb-3'
                      : line.trim().startsWith('•')
                        ? 'pl-4 mb-2 text-gray-800'
                        : 'mb-3 text-gray-800'
                  }`}>
                    {line}
                  </p>
                ))}
            </div>
            ))}
            </div>
          </div>
        </div>
    </div>
  );

  const regenerateQuestion = async (questionId: string) => {
    if (!parsedSurvey || isLoading) return;
    
    try {
      setIsLoading(true);
      const questionToRegenerate = parsedSurvey.questions.find(q => q.id === questionId);
      if (!questionToRegenerate) return;

      const response = await fetch('/api/openai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'system',
              content: 'You are a survey design expert. Generate a new version of the provided question while maintaining the same topic and type.'
            },
            {
              role: 'user',
              content: `Regenerate this ${questionToRegenerate.type} question with the same theme but different wording: ${questionToRegenerate.text}`
            }
          ]
        })
      });

      if (!response.ok) throw new Error('Failed to regenerate question');
      
      const data = await response.json();
      const newQuestionText = data.content.trim();
      
      // Update the survey with the new question
      setParsedSurvey(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          questions: prev.questions.map(q => 
            q.id === questionId 
              ? { ...q, text: newQuestionText }
              : q
          )
        };
      });
    } catch (err) {
      console.error('Error regenerating question:', err);
      setError('Failed to regenerate question. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const deleteSurvey = async (surveyId: string) => {
    try {
      setError('');
      setIsDeleting(surveyId);
      console.log('Starting delete process for survey:', surveyId);

      // For PostgreSQL, attempting a simpler transaction-like approach.
      // Step 1: Delete all responses for this survey
      console.log('Deleting survey responses...');
      const { error: deleteResponsesError } = await supabase
        .from('survey_responses')
        .delete()
        .eq('survey_id', surveyId);
        
      if (deleteResponsesError) {
        console.error('Error deleting responses:', deleteResponsesError);
        // We'll continue anyway and try to delete the survey
      }

      // Short delay
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Step 2: Delete the survey
      console.log('Deleting survey...');
      const { error: deleteSurveyError } = await supabase
        .from('surveys')
        .delete()
        .eq('id', surveyId);

      // If the survey delete failed due to foreign key constraints,
      // try an alternate approach
      if (deleteSurveyError) {
        console.error('Error deleting survey:', deleteSurveyError);
        
        // Only proceed with the fallback if it's a foreign key constraint error
        if (deleteSurveyError.message.includes('foreign key constraint')) {
          console.log('Foreign key constraint issue detected, trying alternate approach...');
          
          // Get the remaining responses (if any)
          const { data: remainingResponses } = await supabase
            .from('survey_responses')
            .select('id')
            .eq('survey_id', surveyId);
            
          console.log(`Found ${remainingResponses?.length || 0} remaining responses`);
          
          // Try inserting a fake response with null survey_id to work around the constraint
          if (remainingResponses && remainingResponses.length > 0) {
            // Let's first try updating the survey reference to null
            for (const response of remainingResponses) {
              // Try updating to null (this may or may not be allowed depending on your schema)
              const { error: updateError } = await supabase
                .from('survey_responses')
                .update({ survey_id: null })
                .eq('id', response.id);
                
              if (updateError) {
                console.error('Error updating response reference:', updateError);
                
                // If we can't set to null, try deleting the individual response
                const { error: deleteIndividualError } = await supabase
                  .from('survey_responses')
                  .delete()
                  .eq('id', response.id);
                  
                if (deleteIndividualError) {
                  console.error('Failed to delete individual response:', deleteIndividualError);
                  // Continue with the next response anyway
                }
              }
            }
            
            // After trying to clean up all responses, try deleting the survey again
            console.log('Attempting to delete survey after cleaning up responses...');
            const { error: retryError } = await supabase
              .from('surveys')
              .delete()
              .eq('id', surveyId);
              
            if (retryError) {
              console.error('Failed to delete survey after cleanup:', retryError);
              throw retryError;
            }
          } else {
            // If there are no responses but we still have a constraint error,
            // there's something else referencing this survey
            throw new Error(`Cannot delete survey: ${deleteSurveyError.message}`);
          }
        } else {
          // If it's not a foreign key issue, rethrow the original error
          throw deleteSurveyError;
        }
      }

      console.log('Successfully deleted survey');

      // Update local state
      setSavedSurveys(prevSurveys => 
        prevSurveys.filter(survey => survey.id !== surveyId)
      );

      // Reset current survey state if we just deleted the active survey
      if (savedSurveyId === surveyId) {
        console.log('Resetting current survey state');
        setParsedSurvey(null);
        setPrompt('');
        setActiveTab('prompt');
        setCompletedSteps(new Set());
        setSavedSurveyId(null);
        setSurveyStatus('draft');
        setIsVerified(false);
        setActiveSurveyType(null);
      }

      // Refresh the saved surveys list
      await fetchSavedSurveys();

      // Show success message
      alert('Survey deleted successfully');

    } catch (err) {
      console.error('Complete error details:', err);
      
      // Get the detailed error message
      const errorMessage = err instanceof Error 
        ? err.message 
        : typeof err === 'object' && err !== null && 'message' in err 
          ? String(err.message)
          : 'Unknown error occurred';
      
      console.error('Error in deleteSurvey:', {
        error: err,
        message: errorMessage,
        surveyId
      });
      
      setError(`Failed to delete survey: ${errorMessage}`);
      alert(`Failed to delete survey: ${errorMessage}`);
    } finally {
      setIsDeleting(null);
    }
  };

  // Update the click handler in the card component
  const handleDeleteClick = async (e: React.MouseEvent, surveyId: string) => {
    e.preventDefault(); // Prevent default behavior
    e.stopPropagation(); // Prevent card click
    
    if (window.confirm('Are you sure you want to delete this survey? This action cannot be undone.')) {
      try {
        console.log('Delete confirmed for survey:', surveyId);
        await deleteSurvey(surveyId);
        setShowActionMenu(null);
      } catch (err) {
        console.error('Error in handleDeleteClick:', err);
      }
    }
  };

  const duplicateSurvey = async (surveyId: string) => {
    try {
      setError('');
      
      // Find the survey to duplicate
      const surveyToDuplicate = savedSurveys.find(s => s.id === surveyId);
      if (!surveyToDuplicate) throw new Error('Survey not found');

      // Get the full survey data
      const { data: originalSurvey, error: fetchError } = await supabase
        .from('surveys')
        .select('*')
        .eq('id', surveyId)
        .single();

      if (fetchError) throw fetchError;

      // Create new survey with copied data
      const newSurveyId = uuidv4();
      const { data: newSurvey, error: createError } = await supabase
        .from('surveys')
        .insert([{
          ...originalSurvey,
          id: newSurveyId,
          title: `${originalSurvey.title} (Copy)`,
          created_at: new Date().toISOString(),
          status: 'draft'
        }])
        .select()
        .single();

      if (createError) throw createError;

      // Update local state
      setSavedSurveys(prev => [{
        id: newSurveyId,
        title: `${surveyToDuplicate.title} (Copy)`,
        createdAt: new Date().toISOString(),
        status: 'draft'
      }, ...prev]);

    } catch (err) {
      console.error('Error duplicating survey:', err);
      setError(err instanceof Error ? err.message : 'Failed to duplicate survey');
    }
  };

  const handleMouseEnter = (typeId: string) => {
    hoverTimer.current = setTimeout(() => {
      setHoveredType(typeId);
      setShowTooltip(true);
    }, 1000); // Show after 1 second for better UX
  };

  const handleMouseLeave = () => {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current);
    }
    setHoveredType(null);
    setShowTooltip(false);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navigation />

      <div className="flex min-h-[calc(100vh-4rem)]">
        {/* Saved Surveys Sidebar */}
        <div className={`w-64 border-r bg-gray-50 p-4 overflow-y-auto fixed top-16 bottom-0 transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">Saved Surveys</h2>
              <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all duration-200"
              aria-label="Close sidebar"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <div className="space-y-3 relative">
            {savedSurveys.map(survey => (
              <div
                key={survey.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden group relative transition-all duration-200"
              >
                <div className="flex flex-col">
                  <div className="flex items-center justify-between p-3 w-full">
                    <button
                      onClick={() => loadSavedSurvey(survey.id)}
                      className="flex-1 text-left hover:bg-indigo-50 transition-colors rounded-md px-2 py-1 mr-8 min-w-0"
                    >
                      <div className="w-full">
                        <h3 className="text-sm font-medium text-gray-900 truncate block">
                          {survey.title}
                        </h3>
                        <p className="text-xs text-gray-600">
                          {new Date(survey.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </button>
                    
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowActionMenu(showActionMenu === survey.id ? null : survey.id);
                      }}
                      className="p-2 text-gray-500 hover:text-gray-700 rounded-full transition-colors"
                    >
                      <svg className={`w-5 h-5 transition-transform duration-200 ${showActionMenu === survey.id ? 'rotate-180' : ''}`} 
                           fill="currentColor" 
                           viewBox="0 0 20 20">
                        <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                      </svg>
                    </button>
                  </div>

                  {/* Expandable Action Section */}
                  <div 
                    className={`
                      overflow-hidden transition-all duration-200 bg-gray-50 border-t border-gray-100
                      ${showActionMenu === survey.id ? 'h-12 opacity-100' : 'h-0 opacity-0'}
                    `}
                  >
                    <div className="grid grid-cols-2 gap-2 px-3 py-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateSurvey(survey.id);
                          setShowActionMenu(null);
                        }}
                        className="flex items-center justify-center px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                        title="Duplicate Survey"
                      >
                        <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                        </svg>
                        Duplicate
                      </button>
                      <button
                        onClick={(e) => handleDeleteClick(e, survey.id)}
                        disabled={isDeleting === survey.id}
                        className={`flex items-center px-2 py-1.5 text-xs ${
                          isDeleting === survey.id 
                            ? 'text-gray-400 bg-gray-100' 
                            : 'text-red-600 hover:bg-red-50'
                        } rounded-md transition-colors relative z-10`}
                        title="Delete Survey"
                      >
                        {isDeleting === survey.id ? (
                          <div className="flex items-center">
                            <svg className="animate-spin h-3.5 w-3.5 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Deleting...
                          </div>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {savedSurveys.length === 0 && (
              <div className="text-center p-4 bg-white rounded-lg border border-gray-200">
                <p className="text-xs text-gray-600">No saved surveys yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Hamburger Toggle Button (only visible when sidebar is closed) */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className={`fixed top-4 left-4 z-50 p-2 bg-white text-gray-900 rounded-md shadow-sm border border-gray-200 hover:bg-gray-50 transition-all ${
            isSidebarOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
          aria-label="Toggle Saved Surveys"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>

        {/* Main Content */}
        <div className={`flex-1 overflow-y-auto transition-all duration-300 ${
          isSidebarOpen ? 'ml-64' : 'ml-0'
        }`}>
          <div className="max-w-7xl mx-auto p-8">
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
              <h1 className="text-3xl font-bold text-[#1b1b1b] mb-4">
                {parsedSurvey?.title || 'Generate Your Research Survey with AI'}
              </h1>
              <p className="text-gray-600 max-w-2xl mx-auto">
                {(() => {
                  switch (activeTab) {
                    case 'prompt':
                      return 'Describe your research goals and let our AI create a professional survey tailored to your needs.';
                    case 'preview':
                      return 'Review and verify your survey before sharing it with participants.';
                    case 'share':
                      return 'Share your survey with participants and start collecting responses.';
                    case 'results':
                      return 'Track responses and gain insights from your survey.';
                    default:
                      return 'Describe your research goals and let our AI create a professional survey tailored to your needs.';
                  }
                })()}
              </p>
            </div>

            {renderTabs()}

            <div className="mt-6">
              {activeTab === 'prompt' && renderPromptTab()}
              {activeTab === 'preview' && renderPreviewTab()}
              {activeTab === 'share' && renderShareTab()}
              {activeTab === 'results' && renderResultsTab()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 