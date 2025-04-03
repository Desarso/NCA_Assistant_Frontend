import { Component } from 'solid-js';
import { Button } from '@/components/ui/button';
import { usePWAInstallPrompt } from '@/lib/pwa';
import { Download } from 'lucide-solid';

interface PWAInstallButtonProps {
  class?: string;
}

export const PWAInstallButton: Component<PWAInstallButtonProps> = (props) => {
  const { isInstallable, isInstalled, promptInstall } = usePWAInstallPrompt();
  
  // Don't show anything if already installed or can't be installed
  if (isInstalled() || !isInstallable()) {
    return null;
  }
  
  const handleInstall = async () => {
    const installed = await promptInstall();
    if (installed) {
      console.log('App was installed successfully');
    }
  };
  
  return (
    <Button 
      onClick={handleInstall} 
      variant="outline" 
      size="sm"
      class={props.class}
    >
      <Download class="h-4 w-4 mr-2" />
      Install App
    </Button>
  );
};