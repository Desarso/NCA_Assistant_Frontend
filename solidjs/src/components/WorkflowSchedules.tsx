import { Component, createSignal, Show, For } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Settings, Trash2 } from 'lucide-solid';
import { authFetch } from '@/lib/utils';

const HOST = import.meta.env.VITE_API_HOST || 'http://localhost:8000';

interface WorkflowSchedule {
  id: number;
  cron_expression: string;
  is_active: boolean;
  timezone: string;
  next_run?: string;
  created_at: string;
  updated_at: string;
  workflow_id: string;
}

interface WorkflowSchedulesProps {
  workflowId: string;
  schedules: WorkflowSchedule[];
  onSchedulesChange: (schedules: WorkflowSchedule[]) => void;
}

const WorkflowSchedules: Component<WorkflowSchedulesProps> = (props) => {
  const [showSchedules, setShowSchedules] = createSignal(false);
  const [newCronExpression, setNewCronExpression] = createSignal('');
  const [newTimezone, setNewTimezone] = createSignal('UTC');

  const formatLastRun = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const loadSchedules = async () => {
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${props.workflowId}/schedules`);
      if (response.ok) {
        const data = await response.json();
        props.onSchedulesChange(data);
      }
    } catch (error) {
      console.error('Error loading schedules:', error);
    }
  };

  const createSchedule = async () => {
    if (!newCronExpression()) return;
    
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${props.workflowId}/schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cron_expression: newCronExpression(),
          timezone: newTimezone(),
          is_active: true
        })
      });

      if (response.ok) {
        setNewCronExpression('');
        setNewTimezone('UTC');
        loadSchedules();
      } else {
        console.error('Failed to create schedule');
      }
    } catch (error) {
      console.error('Error creating schedule:', error);
    }
  };

  const deleteSchedule = async (scheduleId: number) => {
    try {
      const response = await authFetch(`${HOST}/api/v1/workflows/${props.workflowId}/schedules/${scheduleId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadSchedules();
      } else {
        console.error('Failed to delete schedule');
      }
    } catch (error) {
      console.error('Error deleting schedule:', error);
    }
  };

  const formatCronExpression = (cron: string) => {
    // Simple cron to human readable conversion
    const parts = cron.split(' ');
    if (parts.length !== 5) return cron;
    
    const [minute, hour, day, month, weekday] = parts;
    
    if (minute === '0' && hour === '9' && weekday === '1-5') {
      return 'Weekdays at 9:00 AM';
    }
    if (minute === '0' && hour === '0') {
      return 'Daily at midnight';
    }
    if (minute === '0' && hour === '12') {
      return 'Daily at noon';
    }
    
    return cron;
  };

  return (
    <div class="mt-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold flex items-center gap-2">
          <Clock class="size-5" />
          Schedules
        </h3>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setShowSchedules(!showSchedules())}
        >
          <Settings class="size-4" />
          {showSchedules() ? 'Hide' : 'Show'}
        </Button>
      </div>

      <Show when={showSchedules()}>
        <div class="space-y-4">
          {/* Add new schedule */}
          <div class="border border-border rounded-lg p-4">
            <div class="mb-4">
              <h4 class="text-base font-semibold">Add Schedule</h4>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label for="cron" class="text-sm font-medium">Cron Expression</label>
                <Input
                  id="cron"
                  value={newCronExpression()}
                  onInput={(e) => setNewCronExpression(e.currentTarget.value)}
                  placeholder="0 9 * * 1-5"
                />
                <p class="text-xs text-muted-foreground mt-1">
                  Format: minute hour day month weekday
                </p>
              </div>
              <div>
                <label for="timezone" class="text-sm font-medium">Timezone</label>
                <Input
                  id="timezone"
                  value={newTimezone()}
                  onInput={(e) => setNewTimezone(e.currentTarget.value)}
                  placeholder="UTC"
                />
              </div>
            </div>
            <Button onClick={createSchedule} class="mt-4" disabled={!newCronExpression()}>
              Add Schedule
            </Button>
          </div>

          {/* Existing schedules */}
          <For each={props.schedules}>
            {(schedule) => (
              <Card>
                <CardContent class="pt-6">
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="font-medium">{formatCronExpression(schedule.cron_expression)}</div>
                      <div class="text-sm text-muted-foreground">
                        {schedule.cron_expression} • {schedule.timezone}
                      </div>
                      <Show when={schedule.next_run}>
                        <div class="text-xs text-muted-foreground mt-1">
                          Next run: {formatLastRun(schedule.next_run)}
                        </div>
                      </Show>
                    </div>
                    <div class="flex items-center gap-2">
                      <Badge variant={schedule.is_active ? 'default' : 'secondary'}>
                        {schedule.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteSchedule(schedule.id)}
                      >
                        <Trash2 class="size-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default WorkflowSchedules; 