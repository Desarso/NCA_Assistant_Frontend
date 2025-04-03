import { Component, JSX } from 'solid-js';
import { Navigate } from '@solidjs/router';
import { useAuth } from '@/lib/auth-context';

interface PrivateRouteProps {
  children: JSX.Element;
}

const PrivateRoute: Component<PrivateRouteProps> = (props) => {
  const { currentUser, loading, isWhitelisted } = useAuth();
  
  if (loading()) {
    return <div class="flex justify-center items-center h-screen">Loading...</div>;
  }
  
  if (!currentUser()) {
    return <Navigate href="/login" />;
  }
  
  if (!isWhitelisted()) {
    return <Navigate href="/request-whitelist" />;
  }
  
  return <>{props.children}</>;
};

export default PrivateRoute;