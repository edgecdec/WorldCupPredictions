import type { Metadata } from "next";
import "@/app/globals.css";
import Providers from "@/components/common/Providers";

export const metadata: Metadata = {
  title: "World Cup Predictions",
  description: "Predict the 2026 FIFA World Cup",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
