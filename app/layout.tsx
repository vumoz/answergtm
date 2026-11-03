import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "AI Visibility Tracker",
  description: "How often ChatGPT, Perplexity, Gemini, Google AI Overviews and Claude mention your brand.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
