import { createContext, useContext, createSignal, createEffect, ParentComponent, Accessor } from 'solid-js';
import { User } from 'firebase/auth';
import { auth, onAuthStateChanged } from './firebase';
// import { useIsMobile } from '@/hooks/use-mobile';


//whitelisted is an example claim that will need to be changed later
interface AuthContextType {
  currentUser: Accessor<User | null>;
  loading: Accessor<boolean>;
  isWhitelisted: Accessor<boolean>;
}

//whitelisted is an example claim that will need to be changed later
const AuthContext = createContext<AuthContextType>();


export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export const AuthProvider: ParentComponent = (props) => {
  const [currentUser, setCurrentUser] = createSignal<User | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [isWhitelisted, setIsWhitelisted] = createSignal(false);

  createEffect(() => {
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
  });

  const value = {
    currentUser,
    loading,
    isWhitelisted,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading() && props.children}
    </AuthContext.Provider>
  );
};