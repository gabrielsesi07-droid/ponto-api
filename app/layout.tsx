import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { AppearanceProvider } from "@/components/appearance";
import { Geist, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import "./signature.css";
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const brandFont = Space_Grotesk({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-brand", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-signature-mono", display: "swap" });
export const metadata: Metadata = {
  title: "HoraCerta · Gestão de jornada",
  description: "Ponto, serviços e horas extras em um só lugar.",
  icons: { icon: "/favicon.svg" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0b1f3a" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${geist.variable} ${plexMono.variable} ${brandFont.variable}`} suppressHydrationWarning>
      <body>
        <AppearanceProvider>
        {children}
        <Toaster richColors position="top-right" />
        </AppearanceProvider>
      </body>
    </html>
  );
}
