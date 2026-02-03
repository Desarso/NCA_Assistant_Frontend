import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
const WorkflowsPage = lazy(() => import("./pages/WorkflowsPage"));
const WorkflowEditPage = lazy(() => import("./pages/WorkflowEditPage"));

function AppRoutes() {
  return (
    <Suspense fallback={<div className="loading">Loading...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/request-whitelist" element={<RequestWhitelist />} />
        <Route path="/" element={<Navigate to="/chat/" replace />} />
        <Route
          path="/chat/:id?"
          element={
            <PrivateRoute>
              <Layout>
                <ChatWindow />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/workflows"
          element={
            <PrivateRoute>
              <Layout>
                <WorkflowsPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/workflows/:id/edit"
          element={
            <PrivateRoute>
              <Layout>
                <WorkflowEditPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/animation"
          element={
            <PrivateRoute>
              <Layout>
                <Animation />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <PrivateRoute>
              <SettingsPage />
            </PrivateRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
