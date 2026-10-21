import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { AppearanceProvider } from "@/components/appearance";
import { Geist, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import "./signature.css";
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-signature-mono", display: "swap" });
export const metadata: Metadata = {
  title: "HoraCerta · Gestão de jornada",
  description: "Ponto, serviços e horas extras em um só lugar.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${geist.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>
        <AppearanceProvider>
        {children}
        <Toaster richColors position="top-right" />
        </AppearanceProvider>
      </body>
    </html>
  );
}
