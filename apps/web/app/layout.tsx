import type { ReactNode } from "react";

export const metadata = {
  title: "AWS Internal Lab",
  description: "Internal AWS learning lab prototype",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
