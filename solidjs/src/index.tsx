// import { StrictMode } from 'react'
import { render } from "solid-js/web";
import App from "./App";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { registerServiceWorker } from "./lib/pwa.js";
import { ThemeProvider } from "./lib/theme-provider.jsx";

// Register service worker for PWA functionality
registerServiceWorker();

render(
  () => (
    <ThemeProvider defaultTheme="dark">
      <App />
    </ThemeProvider>
  ),
  document.getElementById("root")!
);
