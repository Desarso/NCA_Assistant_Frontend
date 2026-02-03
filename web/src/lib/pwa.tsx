import { useState, useEffect, useCallback } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { UpdateNotification } from "@/components/update-notification";

// Container for update notification
let updateContainer: HTMLDivElement | null = null;
let root: Root | null = null;

// Show update notification using portal
const showUpdateNotification = (updateFn: () => Promise<void>) => {
  try {
    // Cleanup existing notification if present
    if (root) {
      root.unmount();
      root = null;
    }
    if (updateContainer && document.body.contains(updateContainer)) {
      document.body.removeChild(updateContainer);
      updateContainer = null;
    }
    
    // Create new container
    updateContainer = document.createElement('div');
    updateContainer.id = 'pwa-update-container';
    document.body.appendChild(updateContainer);

    // Create and store root
    root = createRoot(updateContainer);
    root.render(
      <UpdateNotification
        onUpdate={async () => {
          try {
            await updateFn();
          } catch (error) {
            console.error('Error updating service worker:', error);
          } finally {
            if (root) {
              root.unmount();
              root = null;
            }
            if (updateContainer && document.body.contains(updateContainer)) {
              document.body.removeChild(updateContainer);
              updateContainer = null;
            }
          }
        }}
        onDismiss={() => {
          if (root) {
            root.unmount();
            root = null;
          }
          if (updateContainer && document.body.contains(updateContainer)) {
            document.body.removeChild(updateContainer);
            updateContainer = null;
          }
        }}
      />
    );
  } catch (error) {
    console.error('Error showing update notification:', error);
    // Cleanup on error
    if (root) {
      root.unmount();
      root = null;
    }
    if (updateContainer && document.body.contains(updateContainer)) {
      document.body.removeChild(updateContainer);
      updateContainer = null;
    }
  }
};

// Initialize PWA update checker
export const registerServiceWorker = () => {
  if (typeof window === 'undefined') return () => Promise.resolve();
  
  const updateSW = registerSW({
    onNeedRefresh() {
      showUpdateNotification(() => updateSW(true));
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    },
    immediate: true
  });
  
  return updateSW;
};

// Add proper type for BeforeInstallPromptEvent
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Hook for PWA installation prompt
export const usePWAInstallPrompt = () => {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if app is already installed
    const checkInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                          (window.navigator as any).standalone === true;
      if (isStandalone) {
        setIsInstalled(true);
        return true;
      }
      return false;
    };

    // Handle the install prompt event
    const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    // Check if already installed
    const isAlreadyInstalled = checkInstalled();
    
    if (!isAlreadyInstalled) {
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
    }
    
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    
    window.addEventListener('appinstalled', handleAppInstalled);

    // Cleanup
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt as EventListener);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) return false;
    
    try {
      await installPrompt.prompt();
      const choiceResult = await installPrompt.userChoice;
      return choiceResult.outcome === 'accepted';
    } catch (error) {
      console.error('Error installing PWA:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }, [installPrompt]);

  return { 
    isInstallable: !!installPrompt, 
    isInstalled, 
    promptInstall 
  };
};
