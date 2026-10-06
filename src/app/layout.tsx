import type { Metadata } from "next";
import { Figtree, Poppins } from "next/font/google";
import "./globals.css";
import { ConfirmProvider } from "@/components/Confirm";

// Brand fonts from genesyscapital.com: Poppins for text and the wordmark, Figtree for headlines.
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  // The browser tab always reads "The Sharminator", whichever page is open.
  title: { absolute: "The Sharminator" },
  applicationName: "The Sharminator",
  appleWebApp: { title: "The Sharminator" },
  description: "The Sharminator: Genesys Capital investment analysis. Authorised personnel only.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-CA" className={`${poppins.variable} ${figtree.variable} h-full`}>
      <body className="min-h-full">
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </body>
    </html>
  );
}
