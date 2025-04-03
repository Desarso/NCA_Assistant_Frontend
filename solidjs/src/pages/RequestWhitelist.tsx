import { onMount } from 'solid-js';
import { Button } from "@/components/ui/button";
import { useNavigate } from "@solidjs/router";
import { useAuth } from '@/lib/auth-context';

export default function RequestWhitelist() {
  const navigate = useNavigate();
  const { currentUser, isWhitelisted, loading } = useAuth();

  onMount(() => {
    if (!loading()) {
      if (!currentUser()) {
        // If not logged in, redirect to login
        navigate('/login');
      } else if (isWhitelisted()) {
        // If already whitelisted, redirect to home
        navigate('/');
      }
    }
  });

  return (
    <div class="flex items-center justify-center min-h-screen bg-background">
      <div class="w-full max-w-md p-8 space-y-8 bg-card rounded-lg shadow-lg border border-border">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-foreground">Access Required</h1>
          <p class="mt-2 text-muted-foreground">
            Your account is not whitelisted to use this application. Please contact your administrator
            to request access.
          </p>
        </div>
        
        <div class="flex justify-center">
          <Button 
            onClick={() => navigate("/login")}
            variant="outline"
            class="w-full"
          >
            Return to Login
          </Button>
        </div>
      </div>
    </div>
  );
}