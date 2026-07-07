import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// A warm editorial serif for headings against Inter for body copy — a
// deliberate pairing instead of one system sans everywhere.
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Uphelper",
  description: "Upsolve smarter: ranked video tutorials, Codeforces history, and spaced-repetition revision.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="bg-ink-950 font-body text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
