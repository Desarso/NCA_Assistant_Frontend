import { A } from '@solidjs/router';
import { Component } from 'solid-js';

const SettingsPage: Component = () => {
  const HOST = import.meta.env.VITE_CHAT_HOST;

  const handleClearMemories = async () => {
    const url = new URL(`${HOST}/chat/history`);
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} ${response.statusText}`);
      }

      // Optionally, provide feedback to the user (e.g., a success message)
      alert('Chat history cleared!');
    } catch (error) {
      console.error('Failed to clear chat history:', error);
      alert('Failed to clear chat history.');
    }
  };

  return (
    <div class="h-full w-full p-4">
      <div class="bg-card p-8 rounded-lg shadow-md h-full">
        <div class="flex items-center mb-4">
          <A href="/" class="mr-2 text-muted-foreground hover:text-foreground">
            {/* Back Arrow Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
          </A>
          <h1 class="text-2xl font-bold text-foreground">Settings</h1>
        </div>
        <p class="text-muted-foreground">This is the settings page.</p>
        <button
          class="mt-4 bg-destructive hover:bg-destructive/90 text-white font-bold py-2 px-4 rounded"
          onClick={handleClearMemories}
        >
          Clear Memories
        </button>
      </div>
    </div>
  );
};

export default SettingsPage;
