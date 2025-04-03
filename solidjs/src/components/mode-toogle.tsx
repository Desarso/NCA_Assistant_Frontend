import { Moon, Sun } from "lucide-solid"
import { Button } from "@/components/ui/button"
import { useTheme } from "@/lib/theme-provider"

interface ModeToggleProps {
  class?: string;
}

export function ModeToggle(props: ModeToggleProps) {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme() === "dark" ? "light" : "dark")
  }

  return (
    <Button 
      variant="outline" 
      size="icon" 
      onClick={toggleTheme}
      class={`dark:bg-gray-900 dark:hover:bg-gray-800 ${props.class} w-[32px] h-[32px]`}
    >
      <Moon class="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Sun class="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span class="sr-only">Toggle theme</span>
    </Button>
  )
}
