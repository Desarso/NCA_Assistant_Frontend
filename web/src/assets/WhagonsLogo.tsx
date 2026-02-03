import { useTheme } from "@/lib/theme-provider";

function WhagonsLogo({fill, darkFill, width, height}: {fill: string, darkFill?: string, width: number, height: number}) {
  const { theme } = useTheme();
  
  // For strokes and dots: light color in dark mode, dark color in light mode
  const strokeColor = theme === "dark" ? (darkFill || "#d1d5db") : fill;
  
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 600 200"
      xmlns="http://www.w3.org/2000/svg"
    >

      <g fill="none" stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        
        <path d="M 40 70 L 65 130 L 90 88 L 115 130 L 140 70" />

        <path d="M 160 70 L 160 130" />
        <path d="M 210 70 L 210 130" />
        <path d="M 160 100 L 210 100" />

        <path d="M 230 130 L 255 70 L 280 130" />
        <circle cx="255" cy="106" r="4" fill={strokeColor} stroke="none"/>

        <path d="M 340 70 A 30 30 0 1 0 340 130 L 340 100" />
        <circle cx="340" cy="70" r="4" fill={strokeColor} stroke="none"/>

        <circle cx="400" cy="100" r="30" />
        <circle cx="400" cy="100" r="4" fill={strokeColor} stroke="none"/>

        <path d="M 450 130 L 450 70 L 490 130 L 490 70" />

        <path d="M 540 75 C 510 75 510 100 525 100 C 540 100 540 125 510 125" />
        <circle cx="540" cy="75" r="4" fill={strokeColor} stroke="none"/>
        <circle cx="510" cy="125" r="4" fill={strokeColor} stroke="none"/>

      </g>
    </svg>
  );
}

export default WhagonsLogo;
