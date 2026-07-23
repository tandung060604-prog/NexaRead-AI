import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Source_Serif_4 } from "next/font/google";

import { AuthProvider } from "@/components/auth-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { SiteShell } from "@/components/site-shell";

import "highlight.js/styles/github-dark.css";
import "katex/dist/katex.min.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "vietnamese"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin", "vietnamese"],
  variable: "--font-source-serif",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "NexaRead AI — Đọc sâu hơn, luôn dẫn lại nguồn",
    template: "%s · NexaRead AI",
  },
  description:
    "Biến PDF, giáo trình và tài liệu kỹ thuật thành trải nghiệm đọc sạch với ghi chú, tìm kiếm và trợ lý AI có trích dẫn.",
  openGraph: {
    title: "NexaRead AI — Đọc sâu hơn, luôn dẫn lại nguồn",
    description:
      "Không gian đọc tài liệu dài với bố cục sạch, ghi chú và trợ lý AI có trích dẫn.",
    type: "website",
    locale: "vi_VN",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "NexaRead AI với trình đọc, highlight và trích dẫn nguồn",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NexaRead AI — Đọc sâu hơn, luôn dẫn lại nguồn",
    description:
      "Không gian đọc tài liệu dài với bố cục sạch, ghi chú và trợ lý AI có trích dẫn.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className="dark" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${inter.variable} ${sourceSerif.variable} ${jetbrainsMono.variable} bg-[var(--background)] text-[var(--foreground)]`}>
        <AuthProvider>
          <I18nProvider>
            <SiteShell>{children}</SiteShell>
          </I18nProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

