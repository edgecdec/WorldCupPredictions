"use client";
import { ReactNode } from "react";
import ThemeRegistry from "@/components/common/ThemeRegistry";
import { AuthProvider } from "@/hooks/useAuth";
import Navbar from "@/components/common/Navbar";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeRegistry>
      <AuthProvider>
        <Navbar />
        {children}
      </AuthProvider>
    </ThemeRegistry>
  );
}
