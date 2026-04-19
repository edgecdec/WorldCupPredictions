"use client";
import { ReactNode } from "react";
import ThemeRegistry from "@/components/common/ThemeRegistry";
import { AuthProvider } from "@/hooks/useAuth";
import Navbar from "@/components/common/Navbar";
import PickReminderBanner from "@/components/common/PickReminderBanner";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeRegistry>
      <AuthProvider>
        <Navbar />
        <PickReminderBanner />
        {children}
      </AuthProvider>
    </ThemeRegistry>
  );
}
