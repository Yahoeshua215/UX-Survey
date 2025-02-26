'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import Navigation from './components/Navigation';

// Add interface for saved surveys
interface SavedSurvey {
  id: string;
  title: string;
  createdAt: string;
}

export default function Home() {
  const [savedSurveys, setSavedSurveys] = useState<SavedSurvey[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch saved surveys on component mount
  useEffect(() => {
    const fetchSavedSurveys = async () => {
      try {
        console.log('Fetching saved surveys...');
        const { data, error } = await supabase
          .from('surveys')
          .select('id, title, created_at')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching surveys:', error);
          setError(error.message);
          return;
        }

        console.log('Fetched surveys:', data);
        if (data) {
          setSavedSurveys(data.map(survey => ({
            id: survey.id,
            title: survey.title,
            createdAt: survey.created_at
          })));
        }
      } catch (err) {
        console.error('Unexpected error:', err);
        setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      }
    };

    fetchSavedSurveys();
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navigation isHomePage={true} />

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center">
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
          <div className="inline-block mb-6 px-4 py-2 bg-gray-100 rounded-full">
            <span className="text-gray-800">AI-Powered Research Surveys</span>
          </div>
          <h1 className="text-5xl font-bold text-[#1b1b1b] mb-6">
            Transform Your Research with AI-Generated Surveys
          </h1>
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Create professional surveys, collect responses, and analyze data with our intelligent
            research platform.
          </p>
          <div className="flex justify-center gap-4">
            <Link
              href="/create"
              className="px-6 py-3 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium"
            >
              Create Survey
            </Link>
            <Link
              href="#learn-more"
              className="px-6 py-3 text-gray-700 hover:text-gray-900 border border-gray-300 rounded-md transition-colors font-medium"
            >
              Learn More
            </Link>
          </div>
        </div>
      </div>

      {/* Saved Surveys Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 bg-gray-50">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[#1b1b1b]">Your Previously Created Surveys</h2>
          <p className="mt-4 text-xl text-gray-600">View and manage all your research surveys in one place</p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 text-red-700 rounded-lg border border-red-100">
            Error loading surveys: {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {savedSurveys.map(survey => (
            <Link
              key={survey.id}
              href={`/create?id=${survey.id}`}
              className="block group"
            >
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-lg transition-shadow">
                <h3 className="text-xl font-semibold text-[#1b1b1b] mb-2 group-hover:text-indigo-600 transition-colors">
                  {survey.title}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  Created on {new Date(survey.createdAt).toLocaleDateString()}
                </p>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-indigo-600 group-hover:text-indigo-700 font-medium">View Details →</span>
                </div>
              </div>
            </Link>
          ))}
          {savedSurveys.length === 0 && (
            <div className="col-span-full text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-600 mb-4">No surveys created yet</p>
              <Link
                href="/create"
                className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors font-medium"
              >
                Create Your First Survey
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
