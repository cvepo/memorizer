import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Memorizer",
  description: "Turn course questions into repeated multiple-choice practice.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
};

/**
 * Applies the stored theme before first paint. Without this the page renders in
 * the system palette and then snaps to the chosen one, which is a visible flash
 * on every navigation.
 */
const themeScript = `
try {
  var t = localStorage.getItem("memorizer-theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
