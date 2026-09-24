import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ThemeInitScript } from "@/components/theme/ThemeInitScript";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

const TAGLINE = "Your Campus, Your Community, Your Connection";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: `Dyne — ${TAGLINE}`,
  description:
    "Dyne is the private campus social network for Macro Vision Academy. Connect with classmates, join communities, discover events, chat in realtime, and share campus life.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: `Dyne — ${TAGLINE}`,
    description:
      "The private social network for Macro Vision Academy: feed, communities, chat, events, campus guide, and Dyne Watch.",
    url: "/",
    siteName: "Dyne",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `Dyne — ${TAGLINE}`,
    description:
      "The private social network for Macro Vision Academy: feed, communities, chat, events, campus guide, and Dyne Watch.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeInitScript />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
