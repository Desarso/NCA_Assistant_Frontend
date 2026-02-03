import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

interface UpdateNotificationProps {
  onUpdate: () => void;
  onDismiss: () => void;
}

export function UpdateNotification({ onUpdate, onDismiss }: UpdateNotificationProps) {
  const [visible, setVisible] = useState(true);
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      onUpdate();
    }
  }, [countdown, onUpdate]);

  const handleDismiss = () => {
    setVisible(false);
    onDismiss();
  };

  const handleUpdate = () => {
    setVisible(false);
    onUpdate();
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 inset-x-0 pb-safe z-50 p-4">
      <div className="bg-gray-800 rounded-lg shadow-lg p-4 max-w-md mx-auto border border-gray-700">
        <div className="flex items-start">
          <div className="flex-shrink-0 text-blue-400">
            <RefreshCw className="h-6 w-6" />
          </div>
          <div className="ml-3 flex-1">
            <h3 className="text-sm font-medium text-gray-100">
              Update Available
            </h3>
            <div className="mt-1 text-sm text-gray-400">
              <p>
                A new version of the app is available. 
                {countdown > 0 ? ` Updates automatically in ${countdown}s.` : ''}
              </p>
            </div>
            <div className="mt-4 flex space-x-3">
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
