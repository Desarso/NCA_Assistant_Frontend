import { Component, For, createSignal } from "solid-js";
import { Button } from "@/components/ui/button"; // Assuming you have a Button component
import { Users, Key, Mail, BarChart3 } from "lucide-solid";

// Define the structure for a prompt button
interface PromptButton {
  label: string;
  prompt: string;
}

// Define the TOPIC buttons (for the 4-button row) - these are categories/topics
const topicButtons = [
  { label: "Users", id: "users", icon: Users },
  { label: "Licenses", id: "licenses", icon: Key },
  { label: "Emails", id: "emails", icon: Mail },
  { label: "Reports", id: "reports", icon: BarChart3 },
];

// Define the PROMPT suggestions for each topic - these are actual conversation starters
const promptSuggestionsByTopic = {
  users: [
    {
      label: "How do I add a new user to the system?",
      prompt: "Guide me through adding a new user to the system.",
    },
    {
      label: "How can I find a user by their name?",
      prompt: "Using the graph api, please fetch me a user by name.",
    },
    {
      label: "Help me manage existing users and their accounts",
      prompt: "Help me manage existing users and their accounts.",
    },
    {
      label: "Guide me through bulk user operations like importing from CSV",
      prompt: "Guide me through bulk user operations like importing users from CSV.",
    },
  ],
  licenses: [
    {
      label: "How do I add a license to an existing user?",
      prompt: "Guide me through adding a new license to an existing user.",
    },
    {
      label: "How can I remove or change a user's license?",
      prompt: "Help me remove or change a license for a user.",
    },
    {
      label: "Show me license usage and availability reports",
      prompt: "Show me license usage and availability reports.",
    },
    {
      label: "Help me manage licenses across the organization",
      prompt: "Guide me through managing licenses across the organization.",
    },
  ],
  emails: [
    {
      label: "How can I read and summarize today's emails?",
      prompt: "Using my user ID and the graph api, please fetch me emails from today and summarize them for me. Don't use delegated routes.",
    },
    {
      label: "How do I send an email using the Microsoft Graph API?",
      prompt: "Help me send an email using the Microsoft Graph API.",
    },
    {
      label: "Guide me through managing emails and folders",
      prompt: "Guide me through managing emails and folders.",
    },
    {
      label: "How do I set up email filters and rules?",
      prompt: "Help me set up email filters and rules.",
    },
  ],
  reports: [
    {
      label: "Create a report showing recent user activity and system usage",
      prompt: "Create a report showing recent user activity and system usage statistics.",
    },
    {
      label: "Generate a detailed license usage report",
      prompt: "Generate a detailed license usage report.",
    },
    {
      label: "Show me system health and performance metrics",
      prompt: "Show me system health and performance metrics.",
    },
    {
      label: "Help me create custom reports for specific business needs",
      prompt: "Help me create custom reports for specific business needs.",
    },
  ],
};

interface NewChatProps {
  onPromptClick: (prompt: string) => void; // Function to handle the click
}

const NewChat: Component<NewChatProps> = (props) => {
  const [selectedTab, setSelectedTab] = createSignal(0); // Default to first tab

  // Get the current prompt suggestions based on selected tab
  const currentPrompts = () => {
    const selectedTopicId = topicButtons[selectedTab()].id;
    return promptSuggestionsByTopic[selectedTopicId as keyof typeof promptSuggestionsByTopic];
  };

  return (
    <div class="flex flex-col w-full px-4 sm:px-0 max-w-[600px] mx-auto">
      {/* Left-aligned greeting */}
      <h1 class="text-3xl md:text-4xl font-semibold mb-8 text-left bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">
        How can I help you today?
      </h1>

      {/* TOPIC buttons (categories) */}
      <div class="w-full mb-8">
        <div class="flex flex-wrap gap-3 justify-start">
          <For each={topicButtons}>{(topic, index) =>
            <Button
              variant="soft"
              class={`h-auto min-h-[40px] px-4 py-2 text-center justify-center whitespace-nowrap flex items-center gap-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                selectedTab() === index()
                  ? 'bg-card border border-border/40 shadow-sm'
                  : 'bg-transparent hover:bg-card/30'
              }`}
              onClick={() => setSelectedTab(index())}
            >
              <topic.icon size={16} />
              {topic.label}
            </Button>
          }</For>
        </div>
      </div>

      {/* PROMPT suggestions (conversation starters) */}
      <div class="w-full">
        <div class="space-y-0">
          <For each={currentPrompts()}>{(promptItem, index) =>
            <>
              <button
                class="w-full text-left p-4 bg-transparent hover:bg-card/20 transition-colors duration-200 text-base font-medium rounded-xl"
                onClick={() => props.onPromptClick(promptItem.prompt)}
              >
                {promptItem.label}
              </button>
              {index() < currentPrompts().length - 1 && (
                <div class="border-b border-border/10 mx-2 my-1"></div>
              )}
            </>
          }</For>
        </div>
      </div>
    </div>
  );
};

export default NewChat;
