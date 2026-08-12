import type { Metadata, Viewport } from "next";
import { Cairo, Amiri_Quran } from "next/font/google";
import "./globals.css";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  display: "swap",
});

const amiriQuran = Amiri_Quran({
  variable: "--font-quran-var",
  subsets: ["arabic", "latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "وردي",
  description: "مساعدك في متابعة وردك اليومي وقراءة القرآن",
  applicationName: "وردي",
  appleWebApp: {
    capable: true,
    title: "وردي",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#123b30",
};

const THEME_SCRIPT = `(function () {
  try {
    var stored = localStorage.getItem("ward:v2:settings");
    var theme = "system";
    if (stored) {
      var parsed = JSON.parse(stored);
      if (parsed && (parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system")) {
        theme = parsed.theme;
      }
    }
    var dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  } catch (e) {}
})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      className={`${cairo.variable} ${amiriQuran.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-ink">{children}</body>
    </html>
  );
}
