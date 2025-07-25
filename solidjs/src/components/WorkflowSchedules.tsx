import { Component, createSignal, Show, For } from 'solid-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Settings, Trash2, ChevronDown } from 'lucide-solid';
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

// Predefined schedule options
const SCHEDULE_PRESETS = [
  { label: 'Hourly', cron: '0 * * * *', description: 'Runs at the top of every hour' },
  { label: 'Daily at 9 AM', cron: '0 9 * * *', description: 'Runs every day at 9:00 AM' },
  { label: 'Daily at 6 PM', cron: '0 18 * * *', description: 'Runs every day at 6:00 PM' },
  { label: 'Weekdays at 9 AM', cron: '0 9 * * 1-5', description: 'Monday to Friday at 9:00 AM' },
  { label: 'Weekends at 10 AM', cron: '0 10 * * 6,0', description: 'Saturday and Sunday at 10:00 AM' },
  { label: 'Weekly - Monday at 9 AM', cron: '0 9 * * 1', description: 'Every Monday at 9:00 AM' },
  { label: 'Weekly - Tuesday at 9 AM', cron: '0 9 * * 2', description: 'Every Tuesday at 9:00 AM' },
  { label: 'Weekly - Wednesday at 9 AM', cron: '0 9 * * 3', description: 'Every Wednesday at 9:00 AM' },
  { label: 'Weekly - Thursday at 9 AM', cron: '0 9 * * 4', description: 'Every Thursday at 9:00 AM' },
  { label: 'Weekly - Friday at 9 AM', cron: '0 9 * * 5', description: 'Every Friday at 9:00 AM' },
  { label: 'Weekly - Saturday at 10 AM', cron: '0 10 * * 6', description: 'Every Saturday at 10:00 AM' },
  { label: 'Weekly - Sunday at 10 AM', cron: '0 10 * * 0', description: 'Every Sunday at 10:00 AM' },
  { label: 'Monthly - 1st at 9 AM', cron: '0 9 1 * *', description: 'First day of every month at 9:00 AM' },
  { label: 'Monthly - 15th at 9 AM', cron: '0 9 15 * *', description: 'Fifteenth day of every month at 9:00 AM' },
  { label: 'Monthly - Last day at 9 AM', cron: '0 9 28-31 * *', description: 'Last few days of every month at 9:00 AM' },
  { label: 'Flexible Weekly', cron: 'flexible-weekly', description: 'Choose specific days and time' },
  { label: 'Flexible Monthly', cron: 'flexible-monthly', description: 'Choose specific day of month and time' },
  { label: 'Custom', cron: '', description: 'Enter your own cron expression' }
];

const COMMON_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney'
];

const WorkflowSchedules: Component<WorkflowSchedulesProps> = (props) => {
  const [newCronExpression, setNewCronExpression] = createSignal('');
  const [newTimezone, setNewTimezone] = createSignal('UTC');
  const [selectedPreset, setSelectedPreset] = createSignal('');
  const [showPresetDropdown, setShowPresetDropdown] = createSignal(false);
  const [showTimezoneDropdown, setShowTimezoneDropdown] = createSignal(false);
  const [customCron, setCustomCron] = createSignal(false);

  // Flexible scheduling state
  const [isFlexibleWeekly, setIsFlexibleWeekly] = createSignal(false);
  const [isFlexibleMonthly, setIsFlexibleMonthly] = createSignal(false);
  const [selectedDays, setSelectedDays] = createSignal<number[]>([]);
  const [selectedHour, setSelectedHour] = createSignal(9);
  const [selectedMinute, setSelectedMinute] = createSignal(0);
  const [selectedDayOfMonth, setSelectedDayOfMonth] = createSignal(1);

  const DAYS_OF_WEEK = [
    { value: 1, label: 'Monday', short: 'Mon' },
    { value: 2, label: 'Tuesday', short: 'Tue' },
    { value: 3, label: 'Wednesday', short: 'Wed' },
    { value: 4, label: 'Thursday', short: 'Thu' },
    { value: 5, label: 'Friday', short: 'Fri' },
    { value: 6, label: 'Saturday', short: 'Sat' },
    { value: 0, label: 'Sunday', short: 'Sun' }
  ];

  // Handle preset selection
  const handlePresetSelect = (preset: typeof SCHEDULE_PRESETS[0]) => {
    // Reset all flexible states
    setCustomCron(false);
    setIsFlexibleWeekly(false);
    setIsFlexibleMonthly(false);
    
    if (preset.label === 'Custom') {
      setCustomCron(true);
      setNewCronExpression('');
    } else if (preset.cron === 'flexible-weekly') {
      setIsFlexibleWeekly(true);
      setSelectedDays([1]); // Default to Monday
      updateFlexibleWeeklyCron();
    } else if (preset.cron === 'flexible-monthly') {
      setIsFlexibleMonthly(true);
      updateFlexibleMonthlyCron();
    } else {
      setNewCronExpression(preset.cron);
    }
    setSelectedPreset(preset.label);
    setShowPresetDropdown(false);
  };

  // Generate cron for flexible weekly
  const updateFlexibleWeeklyCron = () => {
    const days = selectedDays().sort((a, b) => a - b);
    if (days.length === 0) {
      setNewCronExpression('');
      return;
    }
    const cron = `${selectedMinute()} ${selectedHour()} * * ${days.join(',')}`;
    setNewCronExpression(cron);
  };

  // Generate cron for flexible monthly
  const updateFlexibleMonthlyCron = () => {
    const cron = `${selectedMinute()} ${selectedHour()} ${selectedDayOfMonth()} * *`;
    setNewCronExpression(cron);
  };

  // Toggle day selection for flexible weekly
  const toggleDay = (dayValue: number) => {
    const current = selectedDays();
    if (current.includes(dayValue)) {
      setSelectedDays(current.filter(d => d !== dayValue));
    } else {
      setSelectedDays([...current, dayValue].sort((a, b) => a - b));
    }
    updateFlexibleWeeklyCron();
  };

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
        // Reset form
        setNewCronExpression('');
        setNewTimezone('UTC');
        setSelectedPreset('');
        setCustomCron(false);
        setIsFlexibleWeekly(false);
        setIsFlexibleMonthly(false);
        setSelectedDays([]);
        setSelectedHour(9);
        setSelectedMinute(0);
        setSelectedDayOfMonth(1);
        setShowPresetDropdown(false);
        setShowTimezoneDropdown(false);
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
    <div>
      <div class="flex items-center justify-between mb-6">
        <h3 class="text-lg font-semibold flex items-center gap-2">
          <Clock class="size-5" />
          Workflow Schedules
        </h3>
      </div>

      <div class="space-y-6">
        {/* Add new schedule */}
        <div class="border border-border rounded-lg p-6">
          <div class="mb-4">
            <h4 class="text-base font-semibold">Add New Schedule</h4>
            <p class="text-sm text-muted-foreground">Choose from common patterns or create a custom schedule.</p>
          </div>
          
          <div class="space-y-4">
            {/* Schedule Type Dropdown */}
            <div>
              <label class="text-sm font-medium mb-2 block">Schedule Type</label>
              <div class="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowPresetDropdown(!showPresetDropdown())}
                  class="w-full justify-between"
                >
                  {selectedPreset() || 'Select a schedule type'}
                  <ChevronDown class="size-4" />
                </Button>
                <Show when={showPresetDropdown()}>
                  <div class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                    <For each={SCHEDULE_PRESETS}>
                      {(preset) => (
                        <div
                          class="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                          onClick={() => handlePresetSelect(preset)}
                        >
                          <div class="font-medium">{preset.label}</div>
                          <div class="text-xs text-muted-foreground">{preset.description}</div>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </div>

            {/* Custom Cron Input (only show when Custom is selected) */}
            <Show when={customCron()}>
              <div>
                <label for="cron" class="text-sm font-medium">Custom Cron Expression</label>
                <Input
                  id="cron"
                  value={newCronExpression()}
                  onInput={(e) => setNewCronExpression(e.currentTarget.value)}
                  placeholder="0 9 * * 1-5"
                  class="mt-1"
                />
                <p class="text-xs text-muted-foreground mt-1">
                  Format: minute hour day month weekday (e.g., "0 9 * * 1-5" = weekdays at 9 AM)
                </p>
              </div>
            </Show>

            {/* Flexible Weekly Options */}
            <Show when={isFlexibleWeekly()}>
              <div class="space-y-4">
                <div>
                  <label class="text-sm font-medium mb-2 block">Select Days</label>
                  <div class="grid grid-cols-7 gap-2">
                    <For each={DAYS_OF_WEEK}>
                      {(day) => (
                        <Button
                          variant={selectedDays().includes(day.value) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDay(day.value)}
                          class="text-xs h-8"
                        >
                          {day.short}
                        </Button>
                      )}
                    </For>
                  </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="text-sm font-medium mb-2 block">Hour (24h)</label>
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={selectedHour()}
                      onInput={(e) => {
                        setSelectedHour(parseInt(e.currentTarget.value) || 0);
                        updateFlexibleWeeklyCron();
                      }}
                    />
                  </div>
                  <div>
                    <label class="text-sm font-medium mb-2 block">Minute</label>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={selectedMinute()}
                      onInput={(e) => {
                        setSelectedMinute(parseInt(e.currentTarget.value) || 0);
                        updateFlexibleWeeklyCron();
                      }}
                    />
                  </div>
                </div>
              </div>
            </Show>

            {/* Flexible Monthly Options */}
            <Show when={isFlexibleMonthly()}>
              <div class="space-y-4">
                <div class="grid grid-cols-3 gap-4">
                  <div>
                    <label class="text-sm font-medium mb-2 block">Day of Month</label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={selectedDayOfMonth()}
                      onInput={(e) => {
                        setSelectedDayOfMonth(parseInt(e.currentTarget.value) || 1);
                        updateFlexibleMonthlyCron();
                      }}
                    />
                  </div>
                  <div>
                    <label class="text-sm font-medium mb-2 block">Hour (24h)</label>
                    <Input
                      type="number"
                      min="0"
                      max="23"
                      value={selectedHour()}
                      onInput={(e) => {
                        setSelectedHour(parseInt(e.currentTarget.value) || 0);
                        updateFlexibleMonthlyCron();
                      }}
                    />
                  </div>
                  <div>
                    <label class="text-sm font-medium mb-2 block">Minute</label>
                    <Input
                      type="number"
                      min="0"
                      max="59"
                      value={selectedMinute()}
                      onInput={(e) => {
                        setSelectedMinute(parseInt(e.currentTarget.value) || 0);
                        updateFlexibleMonthlyCron();
                      }}
                    />
                  </div>
                </div>
              </div>
            </Show>

            {/* Timezone Dropdown */}
            <div>
              <label class="text-sm font-medium mb-2 block">Timezone</label>
              <div class="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowTimezoneDropdown(!showTimezoneDropdown())}
                  class="w-full justify-between"
                >
                  {newTimezone()}
                  <ChevronDown class="size-4" />
                </Button>
                <Show when={showTimezoneDropdown()}>
                  <div class="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    <For each={COMMON_TIMEZONES}>
                      {(timezone) => (
                        <div
                          class="px-3 py-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                          onClick={() => {
                            setNewTimezone(timezone);
                            setShowTimezoneDropdown(false);
                          }}
                        >
                          {timezone}
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </div>

            {/* Show current cron expression */}
            <Show when={newCronExpression()}>
              <div class="bg-gray-50 dark:bg-gray-800 p-3 rounded border">
                <div class="text-sm font-medium">Cron Expression:</div>
                <div class="text-sm font-mono text-blue-600 dark:text-blue-400">{newCronExpression()}</div>
              </div>
            </Show>

            <Button 
              onClick={createSchedule} 
              disabled={!newCronExpression() || !selectedPreset() || (isFlexibleWeekly() && selectedDays().length === 0)}
              class="w-full"
            >
              Create Schedule
            </Button>
          </div>
        </div>

        {/* Existing schedules */}
        <div class="space-y-3">
          <h4 class="text-base font-semibold">Active Schedules</h4>
          <For each={props.schedules} fallback={
            <div class="text-center py-8 text-muted-foreground">
              <Clock class="size-8 mx-auto mb-2 opacity-50" />
              <p>No schedules configured</p>
            </div>
          }>
            {(schedule) => (
              <Card>
                <CardContent class="pt-6">
                  <div class="flex items-center justify-between">
                    <div class="flex-1">
                      <div class="font-medium text-lg">{formatCronExpression(schedule.cron_expression)}</div>
                      <div class="flex items-center gap-3 mt-2">
                        <div class="bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-md">
                          <span class="text-xs font-medium text-muted-foreground">CRON:</span>
                          <span class="text-sm font-mono ml-2 text-blue-600 dark:text-blue-400">{schedule.cron_expression}</span>
                        </div>
                        <div class="text-sm text-muted-foreground">
                          {schedule.timezone}
                        </div>
                      </div>
                      <Show when={schedule.next_run}>
                        <div class="text-sm text-muted-foreground mt-2">
                          <span class="font-medium">Next run:</span> {formatLastRun(schedule.next_run)}
                        </div>
                      </Show>
                    </div>
                    <div class="flex items-center gap-3 ml-4">
                      <Badge variant={schedule.is_active ? 'default' : 'secondary'} class="text-xs">
                        {schedule.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => deleteSchedule(schedule.id)}
                        class="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
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
      </div>
    </div>
  );
};

export default WorkflowSchedules; 