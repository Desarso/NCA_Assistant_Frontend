// import FadingChar from "@/components/FadingChar";
import { Component, createSignal, onMount, For, Show } from 'solid-js';
// import { createRoot } from 'react-dom/client';
import "./animation.css";

const paragraph = `
    Whispers of the Evernight

Beneath the endless dome
A silver river winds its
It murmurs softly from
As night breathes in 
The world spins on, 
A tale of old, both 

The moon, a ghost of quiet grace,
Spills light upon the emerald trees,
And shadows twist in secret space,
Dancing with a gentle breeze.
The wind, a whisper from the past,
Carries secrets, meant to last.

In fields of gold, where dreams are sown,
The flowers bloom with colors bright,
And in their petals, truths are known,
Invisible to the waking light.
They speak of days that slip away,
Of whispered nights that long to stay.

The mountains rise, majestic, tall,
Their peaks like whispers, soft and deep,
They watch the world beneath them fall,
And in their gaze, the earth does sleep.
With every stone and every breath,
They stand as witnesses to death.

But life, it rises in the dark,
As stars are born from endless space,
Each moment holds a secret spark,
A fleeting, soft, eternal trace.
The fire in our hearts, so bright,
Is fed by shadows, kissed by light.

The ocean, vast, its waters speak,
Of journeys long and ships now gone,
Yet still it roars, both strong and meek,
With whispers deep that carry on.
Beneath its waves, a world does spin,
A tale of life, both thick and thin.

And on this earth, so wild, so free,
We walk the path, both lost and found,
Searching for what we cannot see,
Yet knowing well it's all around.
The sky above, the soil below,
All things in silence come and go.

In every footstep, a memory,
In every breath, a silent prayer,
The world spins on in harmony,
And still we seek, though unaware.
The sun will rise, the moon will fade,
`;

interface CharProps {
  char: string;
  onComplete: () => void;
}

const FadingChar: Component<CharProps> = (props) => {
  const [isVisible, setIsVisible] = createSignal(false);
  const longListofRandomCharacters = "abcdefghijklmnopqrstuvwxyzlasidkbnASDV9083457458T8YQRO0IPGBN GF";
  
  const getRandomText = () => {
    return longListofRandomCharacters[Math.floor(Math.random() * longListofRandomCharacters.length)];
  };

  onMount(() => {
    setTimeout(() => {
      setIsVisible(true);
      setTimeout(() => {
        props.onComplete();
      }, 400);
    }, 1);
  });

  return (
    <span class="container1 w-full h-full">
      <div class="contrast-button container1 text-white" style={{ "font-family": "JetBrains Mono, Consolas, monospace" }}>
        <div class="hiding icon text-5xl">
          {getRandomText()}
        </div>
        <div class="showing icon text-5xl">
          {props.char}
        </div>
      </div>
    </span>
  );
};

const Animation: Component = () => {
  const [lines, setLines] = createSignal<string[]>([]);
  const [currentLineIndex, setCurrentLineIndex] = createSignal(0);
  const [currentCharIndex, setCurrentCharIndex] = createSignal(0);
  const [displayedChars, setDisplayedChars] = createSignal<{ char: string; isNewline: boolean }[]>([]);

  onMount(() => {
    const trimmedParagraph = paragraph.trim();
    const paragraphLines = trimmedParagraph.split("\n");
    setLines(paragraphLines);
  });

  const handleCharComplete = () => {
    const currentLine = lines()[currentLineIndex()];
    if (!currentLine) return;

    const chars = currentLine.trim().split("");
    if (currentCharIndex() < chars.length) {
      setCurrentCharIndex(prev => prev + 1);
    } else {
      setDisplayedChars(prev => [...prev, { char: "", isNewline: true }]);
      setCurrentCharIndex(0);
      setCurrentLineIndex(prev => prev + 1);
    }
  };

  const addNextChar = () => {
    const currentLine = lines()[currentLineIndex()];
    if (!currentLine) return;

    const chars = currentLine.trim().split("");
    if (currentCharIndex() < chars.length) {
      setDisplayedChars(prev => [...prev, { char: chars[currentCharIndex()], isNewline: false }]);
      handleCharComplete();
    }
  };

  onMount(() => {
    const interval = setInterval(() => {
      if (currentLineIndex() < lines().length) {
        addNextChar();
      } else {
        clearInterval(interval);
      }
    }, 1);

    return () => clearInterval(interval);
  });

  return (
    <div class="w-full bg-white mx-auto p-4 char-container text-black text-5xl" style={{ "font-family": "JetBrains Mono, Consolas, monospace" }}>
      <For each={displayedChars()}>
        {(item) => (
          <Show
            when={!item.isNewline}
            fallback={<br />}
          >
            <FadingChar char={item.char} onComplete={() => {}} />
          </Show>
        )}
      </For>
    </div>
  );
};

export default Animation;
