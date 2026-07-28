import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Navbar from "../components/Navbar";
import BackGroundLayout from "../components/BackGroundLayout";
import { UserProvider } from "../components/UserProvider";
import "./globals.css";
import { MemberProvider } from "../components/MemberProvider";
import FeedbackButton from "../components/FeedbackButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "TLMoto Management App",
  description: "Sistema de gestão de turnos e gestão de inventário.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TLMoto Management",
  },
  icons: {
    icon: "/pwa-icons/motogap-192.png",
    apple: "/pwa-icons/motogap-180.png",
  },
  formatDetection: {
    telephone: false,
  },
};

/**
 * The Layout class defines the overall structure of the application.
 *
 * @class Layout
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TLMoto Management" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/pwa-icons/motogap-192.png" sizes="192x192" />
        <link rel="apple-touch-icon" href="/pwa-icons/motogap-180.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `if ('serviceWorker' in navigator) {
              navigator.serviceWorker.register('/sw.js').catch(err => console.log('SW registration failed:', err));
            }`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <UserProvider>
          <MemberProvider>
            <BackGroundLayout>
              <Navbar />
              {children}
              <FeedbackButton />
            </BackGroundLayout>
          </MemberProvider>
        </UserProvider>
      </body>
    </html>
  );
}
