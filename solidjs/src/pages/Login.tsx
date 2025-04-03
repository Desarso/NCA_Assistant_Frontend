import { createSignal, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { auth } from '@/lib/firebase';
import { OAuthProvider, signInWithPopup } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth-context';

export default function Login() {
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  createEffect(() => {
    if (currentUser()) {
      navigate('/');
    }
  });

  const handleMicrosoftLogin = async () => {
    setError('');
    setLoading(true);
    
    try {
      const provider = new OAuthProvider('microsoft.com');
      provider.setCustomParameters({
        tenant: 'novastone-ca.com'
      });
      await signInWithPopup(auth, provider);
      navigate('/');
    } catch (error: any) {
      setError(error.message || 'Failed to sign in with Microsoft');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900">
      <div class="w-full max-w-md p-8 space-y-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Login</h1>
          <p class="mt-2 text-gray-600 dark:text-gray-400">Sign in to your account</p>
        </div>
        
        {error() && (
          <div class="p-3 text-sm text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded">
            {error()}
          </div>
        )}
        
        <div class="space-y-4">
          <Button 
            onClick={handleMicrosoftLogin}
            class="w-full flex items-center justify-center gap-2 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 dark:hover:bg-gray-600"
            disabled={loading()}
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M11.5 3v8.5H3V3h8.5zm0 18H3v-8.5h8.5V21zm1-18H21v8.5h-8.5V3zm8.5 9.5V21h-8.5v-8.5H21z"
              />
            </svg>
            Sign in with Microsoft
          </Button>
        </div>
        
        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div class="relative flex justify-center text-sm">
            {/* <span class="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Or continue with</span> */}
          </div>
        </div>
        
      </div>
    </div>
  );
}