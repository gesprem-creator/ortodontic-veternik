import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ortodontic Veternik - Stomatološka ordinacija",
  description: "Zakažite termin kod stomatologa ili ortodonta putem AI asistenta. Moderna stomatološka ordinacija sa profesionalnom uslugom.",
  keywords: ["stomatolog", "ortodont", "zubar", "termin", "zakazivanje", "zubi", "popravka", "lečenje"],
  authors: [{ name: "Ortodontic Veternik" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Ortodontic Veternik - Stomatološka ordinacija",
    description: "Zakažite termin online putem AI asistenta",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
        </Providers>
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
