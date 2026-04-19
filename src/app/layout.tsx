import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'World Cup Predictions',
  description: 'Predict the 2026 FIFA World Cup',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
