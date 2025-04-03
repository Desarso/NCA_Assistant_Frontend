import { createSignal, createEffect, onCleanup } from 'solid-js';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-solid';

interface UpdateNotificationProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

export function UpdateNotification(props: UpdateNotificationProps) {
  const [visible, setVisible] = createSignal(true);
  const [countdown, setCountdown] = createSignal(5);

  createEffect(() => {
    if (countdown() > 0) {
      const timer = setTimeout(() => setCountdown(countdown() - 1), 1000);
      onCleanup(() => clearTimeout(timer));
    } else {
      props.onUpdate();
    }
  });

  const handleDismiss = () => {
    setVisible(false);
    props.onDismiss();
  };

  const handleUpdate = () => {
    setVisible(false);
    props.onUpdate();
  };

  if (!visible()) return null;

  return (
    <div class="fixed bottom-0 inset-x-0 pb-safe z-50 p-4">
      <div class="bg-gray-800 rounded-lg shadow-lg p-4 max-w-md mx-auto border border-gray-700">
        <div class="flex items-start">
          <div class="flex-shrink-0 text-blue-400">
            <RefreshCw class="h-6 w-6" />
          </div>
          <div class="ml-3 flex-1">
            <h3 class="text-sm font-medium text-gray-100">
              Update Available
            </h3>
            <div class="mt-1 text-sm text-gray-400">
              <p>
                A new version of the app is available. 
                {countdown() > 0 ? ` Updates automatically in ${countdown()}s.` : ''}
              </p>
            </div>
            <div class="mt-4 flex space-x-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDismiss}
              >
                Later
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleUpdate}
              >
                Update Now
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}