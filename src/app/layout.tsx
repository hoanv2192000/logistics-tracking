// src/app/layout.tsx
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import Header from "@/components/Header"; // ✅ thêm Header
import Footer from "@/components/Footer"; // ✅ thêm Footer (premium 4-cột, no dark mode)

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--ff-body",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
  variable: "--ff-head",
});

export const metadata: Metadata = {
  title: "Logistics Tracking",
  description: "Free Logistics Tracking Web App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      {/* Áp 2 biến font vào <body> */}
      <body className={`${inter.variable} ${manrope.variable}`}>
        {/* Header hiển thị ở mọi trang */}
        <Header />

        {/* Nội dung trang */}
        {children}

        {/* Footer premium 4-cột (không dark mode) */}
        <Footer />

        {/* Vercel Analytics */}
        <Analytics />
      </body>
    </html>
  );
}
