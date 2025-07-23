import { lazy, Suspense } from "solid-js";
import { Router, Route, useNavigate, Navigate } from "@solidjs/router";
import "./index.css";
import Layout from "./layout";
import PrivateRoute from "./components/PrivateRoute";
import { AuthProvider } from "./lib/auth-context";

// Lazy load all components
const ChatWindow = lazy(() => import("./aichat/pages/ChatWindow"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Login = lazy(() => import("./pages/Login"));
const RequestWhitelist = lazy(() => import("./pages/RequestWhitelist"));
const Animation = lazy(() => import("./pages/Animation"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const WorkflowsPage = lazy(() => import("./pages/WorkflowsPage"));
const WorkflowEditPage = lazy(() => import("./pages/WorkflowEditPage"));

function AppRoutes() {
    // const { setBiometricVerified } = useAuth();
  return (
    <Suspense fallback={<div class="loading">Loading...</div>}>
      <Route path="/login" component={Login} />
      <Route path="/request-whitelist" component={RequestWhitelist} />
     <Route path="/" component={() => <Navigate href="/chat/" />} />
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
        path="/workflows"
        component={() => (
          <PrivateRoute>
            <Layout>
              <WorkflowsPage />
            </Layout>
          </PrivateRoute>
        )}
      />
      <Route
        path="/workflows/:id/edit"
        component={() => (
          <PrivateRoute>
            <Layout>
              <WorkflowEditPage />
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
    </Suspense>
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
