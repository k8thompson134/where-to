import type { Metadata } from "next";
import { Caprasimo, Quicksand, Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.scss";

const caprasimo = Caprasimo({ variable: "--font-heading", subsets: ["latin"], weight: "400" });
const quicksand = Quicksand({ variable: "--font-body", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-display", subsets: ["latin"] });
const ibmPlexMono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "Where To? | Kate Thompson",
  description: "Errand route planner: find the stop options that make the shortest trip.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${caprasimo.variable} ${quicksand.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
