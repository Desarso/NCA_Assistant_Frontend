import { Component } from 'solid-js';
import "./animation.css";

interface FadingCharProps {
  char: string;
}

const FadingChar: Component<FadingCharProps> = (props) => {
  const longListofRandomCharacters = "abcdefghijklmnopqrstuvwxyzlasidkbnASDV9083457458T8YQRO0IPGBN GF";

  const getRandomText = () => {
    const randomChar =
      longListofRandomCharacters[Math.floor(Math.random() * longListofRandomCharacters.length)];
    return randomChar;
  };

  return (
    <span class="container1 w-full h-full">
      <div
        class="contrast-button container1 text-white"
        style={{ "font-family": "JetBrains Mono, Consolas, monospace" }}
      >
        <div class="hiding icon text-5xl">{getRandomText()}</div>
        <div class="showing icon text-5xl">{props.char}</div>
      </div>
    </span>
  );
};

export default FadingChar;
