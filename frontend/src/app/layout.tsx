import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif } from "next/font/google";
import SmoothScroll from "@/components/SmoothScroll";
import "./globals.css";

// Body and UI text; the sister family of the serif below, so the whole type system feels like one voice.
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

// Italic accents: the "ee" in the LEVee wordmark and one accent word per headline.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: "italic",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LEVee | Give before the storm lands",
  description:
    "Pledge once on PayPal. LEVee moves your gift to vetted local responders up to 72 hours before a forecast hurricane makes landfall.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${instrumentSans.variable} ${instrumentSerif.variable}`}>
      <body className="antialiased">
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
