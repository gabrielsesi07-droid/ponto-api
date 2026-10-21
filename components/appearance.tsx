"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>{children}</ThemeProvider>;
}

export function AppearanceToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" className="appearance-toggle action" aria-label="Alternar tema claro e escuro" title="Alternar tema claro e escuro" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
      <Sun className="theme-sun" size={18} /><Moon className="theme-moon" size={18} />
    </Button>
  );
}
