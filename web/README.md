# NCA Assistant - React Version

This is the React translation of the SolidJS implementation of NCA Assistant.

## Status

The basic structure has been translated from SolidJS to React. The following has been completed:

### ✅ Completed

1. **Project Setup**
   - Created `web` folder structure
   - Configured `package.json` with React dependencies
   - Set up `vite.config.ts` for React
   - Configured `tsconfig.json` for React/TypeScript
   - Created `index.html`

2. **Core Files**
   - `App.tsx` - Main app component with routing
   - `index.tsx` - Entry point
   - `layout.tsx` - Layout component with sidebar and navigation

3. **Library Files**
   - `lib/auth-context.tsx` - Authentication context (translated from SolidJS)
   - `lib/firebase.ts` - Firebase configuration
   - `lib/theme-provider.tsx` - Theme provider (dark/light mode)
   - `lib/utils.ts` - Utility functions
   - `lib/pwa.ts` - PWA service worker registration

4. **Pages**
   - `pages/Login.tsx` - Login page
   - `pages/SettingsPage.tsx` - Settings page (placeholder)
   - `pages/WorkflowsPage.tsx` - Workflows page (placeholder)
   - `pages/WorkflowEditPage.tsx` - Workflow edit page (placeholder)
   - `pages/Animation.tsx` - Animation page (placeholder)
   - `pages/RequestWhitelist.tsx` - Whitelist request page

5. **Components**
   - `components/PrivateRoute.tsx` - Protected route wrapper
   - `components/update-notification.tsx` - PWA update notification
   - `components/mode-toogle.tsx` - Theme toggle button
   - `components/app-sidebar.tsx` - Sidebar component (simplified)
   - `components/avatar-dropdown.tsx` - User avatar dropdown
   - `components/ui/button.tsx` - Button component (Radix UI)
   - `components/ui/skeleton.tsx` - Skeleton loader
   - `components/ui/tabs.tsx` - Tabs component (Radix UI)
   - `components/ui/sidebar.tsx` - Sidebar provider and components
   - `components/ui/sheet.tsx` - Sheet/Dialog component (Radix UI)

6. **Assets & Styles**
   - Copied `index.css` and all styles
   - Copied `assets` folder
   - Copied `fonts` folder
   - Copied `styles` folder

7. **Hooks**
   - `hooks/use-mobile.ts` - Mobile detection hook

### ⚠️ Needs Implementation

1. **Chat Components** (Placeholders created, need full implementation)
   - `aichat/pages/ChatWindow.tsx` - Main chat interface
   - `aichat/components/*` - All chat-related components need translation
   - `aichat/utils/memory_cache.ts` - IndexedDB caching utilities
   - `aichat/utils/ws.ts` - WebSocket manager
   - `aichat/utils/utils.ts` - Chat utilities

2. **UI Components** (Some created, others need translation)
   - Additional Radix UI components may be needed
   - Complex components like CodeEditor, Monaco Editor integration
   - Markdown renderer components

3. **Additional Pages**
   - Full implementation of SettingsPage
   - Full implementation of WorkflowsPage
   - Full implementation of WorkflowEditPage
   - Full implementation of Animation page

4. **Features**
   - Complete sidebar with chat history
   - WebSocket real-time chat functionality
   - File upload/attachment handling
   - Voice input (microphone visualizer)
   - Code syntax highlighting
   - Markdown rendering with code blocks

## Key Differences from SolidJS

1. **State Management**: Uses React `useState` and `useEffect` instead of SolidJS signals and effects
2. **Routing**: Uses `react-router-dom` instead of `@solidjs/router`
3. **UI Components**: Uses Radix UI React components instead of Kobalte (SolidJS)
4. **Class Names**: Uses `className` instead of `class`
5. **Conditional Rendering**: Uses ternary operators and `&&` instead of SolidJS `<Show>` component
6. **Lists**: Uses `.map()` instead of SolidJS `<For>` component

## Getting Started

1. Install dependencies:
```bash
cd web
npm install
```

2. Start development server:
```bash
npm run dev
```

3. Build for production:
```bash
npm run build
```

## Environment Variables

Make sure to set up the following environment variables (same as SolidJS version):
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_CHAT_HOST`

## Notes

- The translation maintains the same folder structure and component organization as the SolidJS version
- Some complex components are simplified placeholders that need full implementation
- The chat functionality and WebSocket integration need to be fully implemented
- IndexedDB caching utilities need to be translated from the SolidJS version
