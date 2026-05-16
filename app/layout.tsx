import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "ATOMQUEST | Goal Intelligence",
    template: "%s | ATOMQUEST"
  },
  description: "Enterprise-grade organizational alignment powered by intelligent performance engineering.",
  metadataBase: new URL("https://atomquest.app"), // Fallback for production URL
  openGraph: {
    title: "ATOMQUEST",
    description: "Enterprise goal intelligence system.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="font-sans bg-slate-50 text-slate-900 selection:bg-indigo-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
