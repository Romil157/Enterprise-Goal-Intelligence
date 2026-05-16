"use client";

import { Inter } from "next/font/google";
import { AlertTriangle } from "lucide-react";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Global error must define html and body
  return (
    <html lang="en" className={`${inter.variable} antialiased`}>
      <body className="font-sans bg-slate-50 text-slate-900">
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white border border-red-100 rounded-2xl shadow-xl shadow-red-500/10 p-10 text-center space-y-8">
            <div className="flex justify-center">
              <div className="bg-red-100/50 p-4 rounded-full ring-8 ring-red-50">
                <AlertTriangle className="w-10 h-10 text-red-600" />
              </div>
            </div>
            
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
                Critical System Error
              </h2>
              <p className="text-base text-slate-600 leading-relaxed">
                The ATOMQUEST platform encountered a fatal error. Our engineering team has been automatically notified.
              </p>
            </div>

            <button
              onClick={() => reset()}
              className="w-full inline-flex justify-center items-center px-5 py-3 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 transition-all shadow-sm"
            >
              Restart Application
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
