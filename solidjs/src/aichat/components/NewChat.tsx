import { Component, For } from "solid-js";
import { Button } from "@/components/ui/button"; // Assuming you have a Button component

// Define the structure for a prompt button
interface PromptButton {
  label: string;
  prompt: string;
}

// Define the prompts
const predefinedPrompts: PromptButton[] = [
  {
    label: "Add New User",
    prompt: "Guide me through adding a new user to the system.",
  },
  {
    label: "Add License to User",
    prompt: "Guide me through adding a new license to an existing user.",
  },
  {
    label: "Read Today's Emails",
    prompt: "Using my user ID and the graph api, please fetch me emails from today and summarize them for me. Don't use delegated routes.",
  },
  // Add more predefined prompts here
];

interface NewChatProps {
  onPromptClick: (prompt: string) => void; // Function to handle the click
}

const NewChat: Component<NewChatProps> = (props) => {
  return (
    <div class="flex flex-col items-center justify-center h-full text-center p-4">
      <h1 class="text-2xl font-semibold mb-8">How can I help you today?</h1>

      {/* Grid for prompt buttons */}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md w-full">
        <For each={predefinedPrompts}>{(item) => 
          <Button 
            variant="outline" 
            class="h-auto min-h-[60px] p-4 text-center justify-center whitespace-normal flex items-center"
            onClick={() => props.onPromptClick(item.prompt)}
          >
            {item.label}
          </Button>
        }</For>
      </div>

      {/* You can add more elements here, like suggested prompts or icons */}
    </div>
  );
};

export default NewChat;
