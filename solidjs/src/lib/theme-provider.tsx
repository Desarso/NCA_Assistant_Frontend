import { createContext, useContext, createSignal, createEffect, ParentComponent, Accessor, Setter } from "solid-js";

type Theme = "dark" | "light" | "system";

type ThemeProviderProps = {
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Accessor<Theme>;
  setTheme: Setter<Theme>;
};

const initialState: ThemeProviderState = {
  theme: () => "system",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>();

export const ThemeProvider: ParentComponent<ThemeProviderProps> = (props) => {
  const [theme, setTheme] = createSignal<Theme>(
    (localStorage.getItem(props.storageKey || "vite-ui-theme") as Theme) || props.defaultTheme || "system"
  );

  createEffect(() => {
    const body = window.document.body;

    body.classList.remove("light", "dark");

    if (theme() === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";

      body.classList.add(systemTheme);
      return;
    }

    body.classList.add(theme());
  });

  const wrappedSetTheme: Setter<Theme> = (value) => {
    const newTheme = typeof value === 'function' ? (value as (prev: Theme) => Theme)(theme()) : value;
    localStorage.setItem(props.storageKey || "vite-ui-theme", newTheme);
    setTheme(newTheme);
  };

  const value: ThemeProviderState = {
    theme,
    setTheme: wrappedSetTheme,
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {props.children}
    </ThemeProviderContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
};
