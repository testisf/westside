"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("westside-theme", next ? "dark" : "light");
    } catch {
      /* private mode: the choice just won't persist */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-subtle hover:text-text"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Light theme" : "Dark theme"}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}
