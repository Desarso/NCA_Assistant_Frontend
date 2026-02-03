import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from 'firebase/auth';
import { auth, onAuthStateChanged } from './firebase';

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  isWhitelisted: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWhitelisted, setIsWhitelisted] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          // Get the ID token with fresh claims
          // const idTokenResult = await user.getIdTokenResult(true);

          // console.log("idTokenResult", idTokenResult);

          // check if user has role whitelisted 
          // const whitelisted = idTokenResult.claims.role === "whitelisted";
          // Check if user has the whitelisted claim
          // const whitelisted = !!idTokenResult.claims.whitelisted;
          // setIsWhitelisted(whitelisted);
          setIsWhitelisted(true);
        } catch (error) {
          console.error("Error fetching user claims:", error);
          setIsWhitelisted(false);
        }
      } else {
        setIsWhitelisted(false);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    loading,
    isWhitelisted,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
