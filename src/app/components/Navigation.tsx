'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavigationProps {
  isHomePage?: boolean;
}

export default function Navigation({ isHomePage = false }: NavigationProps) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {isHomePage ? (
            <>
              <div className="flex-1 flex items-center">
                <Link 
                  href="/" 
                  className={`text-gray-600 hover:text-gray-900 ${pathname === '/' ? 'text-indigo-600' : ''}`}
                >
                  Home
                </Link>
                <Link 
                  href="/create" 
                  className={`ml-8 text-gray-600 hover:text-gray-900 ${pathname === '/create' && !pathname.includes('?') ? 'text-indigo-600' : ''}`}
                >
                  Create Survey
                </Link>
              </div>
              <div className="flex-1">
              </div>
              <div className="flex-1">
              </div>
            </>
          ) : (
            <>
              <div className="flex-1">
              </div>
              <div className="flex items-center justify-end flex-1">
                <Link 
                  href="/" 
                  className={`text-gray-600 hover:text-gray-900 ${pathname === '/' ? 'text-indigo-600' : ''}`}
                >
                  Home
                </Link>
                <Link 
                  href="/create" 
                  className={`ml-8 text-gray-600 hover:text-gray-900 ${pathname === '/create' && !pathname.includes('?') ? 'text-indigo-600' : ''}`}
                >
                  Create Survey
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </nav>
  );
} 