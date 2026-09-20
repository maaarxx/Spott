import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Toast from "@/components/Toast";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Spott — Discover Events Near You",
  description: "Explore and manage events in your local area. Find concerts, food markets, workshops, sports and community events all in one place.",
  keywords: ["events", "local events", "discover", "concerts", "food markets", "workshops", "Philippines"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Navbar />
        <main className="min-h-[calc(100vh-72px)]">{children}</main>
        <Toast />
      </body>
    </html>
  );
}
