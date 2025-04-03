import ChatWindow from "./aichat/pages/ChatWindow";
import SettingsPage from "./pages/SettingsPage";
import Login from "./pages/Login";
import RequestWhitelist from "./pages/RequestWhitelist";
import { Router, Route } from "@solidjs/router";
import "./index.css";
import Layout from "./layout";
import PrivateRoute from "./components/PrivateRoute";
import { AuthProvider } from "./lib/auth-context";
import Animation from "./pages/Animation";
import ProfilePage from "./pages/ProfilePage";

function AppRoutes() {
  // const { setBiometricVerified } = useAuth();
  return (
    <>
      <Route path="/login" component={Login} />
      <Route path="/request-whitelist" component={RequestWhitelist} />
      <Route
        path="/"
        component={() => (
          <PrivateRoute>
            <Layout>
              <ChatWindow />
            </Layout>
          </PrivateRoute>
        )}
      />
      <Route
        path="/chat/:id?"
        component={() => (
          <PrivateRoute>
            <Layout>
              <ChatWindow />
            </Layout>
          </PrivateRoute>
        )}
      />
      <Route
        path="/animation"
        component={() => (
          <PrivateRoute>
            <Layout>
              <Animation />
            </Layout>
          </PrivateRoute>
        )}
      />
      <Route
        path="/settings"
        component={() => (
          <PrivateRoute>
            <Layout>
              <SettingsPage />
            </Layout>
          </PrivateRoute>
        )}
      />
      <Route
        path="/profile"
        component={() => (
          <PrivateRoute>
            <Layout>
              <ProfilePage />
            </Layout>
          </PrivateRoute>
        )}
      />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
