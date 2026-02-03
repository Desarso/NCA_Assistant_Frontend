import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '@/lib/firebase';
import { OAuthProvider, signInWithPopup } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      navigate('/');
    }
  }, [currentUser, navigate]);

  const handleMicrosoftLogin = async () => {
    setError('');
    setLoading(true);
    
    try {
      const provider = new OAuthProvider('microsoft.com');
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (error: any) {
      setError(error.message || 'Failed to sign in with Microsoft');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Login</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Sign in to your account</p>
        </div>
        
        {error && (
          <div className="p-3 text-sm text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded">
            {error}
          </div>
        )}
        
        <div className="space-y-4">
          <Button 
            onClick={handleMicrosoftLogin}
            className="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"
            disabled={loading}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <rect fill="#F25022" x="1" y="1" width="10" height="10" />
              <rect fill="#7FBA00" x="13" y="1" width="10" height="10" />
              <rect fill="#00A4EF" x="1" y="13" width="10" height="10" />
              <rect fill="#FFB900" x="13" y="13" width="10" height="10" />
            </svg>
            Sign in with Microsoft
          </Button>
        </div>
        
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            {/* <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Or continue with</span> */}
          </div>
        </div>
        
      </div>
    </div>
  );
}
