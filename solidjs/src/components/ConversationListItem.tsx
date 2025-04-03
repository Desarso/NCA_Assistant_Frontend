import { Component } from 'solid-js';

interface ConversationListItemProps {
  conversation: { id: string; title: string };
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const ConversationListItem: Component<ConversationListItemProps> = (props) => {
  return (
    <div
      class={`py-2 px-4 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer rounded-md ${
        props.isSelected ? 'bg-gray-300 dark:bg-gray-600' : ''
      }`}
      onClick={() => props.onSelect(props.conversation.id)}
    >
      {props.conversation.title}
    </div>
  );
};

export default ConversationListItem;
