import { Analytics } from "@vercel/analytics/react";

export const metadata = {
  title: "Logistics Tracking",
  description: "Free Logistics Tracking Web App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
