import { Inter, Barlow_Condensed, JetBrains_Mono, Noto_Sans_SC } from "next/font/google";

// Ported straight from the source ai-tools page (E:\桌面\website\app\fonts.js) —
// this page keeps its own font family rather than the dashboard's Geist, so it
// stays a pixel-faithful copy.

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoSC = Noto_Sans_SC({
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-sc",
  display: "swap",
  preload: false,
});

const barlow = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-barlow",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const marketingFontVariables = `${inter.variable} ${barlow.variable} ${jetbrains.variable} ${notoSC.variable}`;

export const bodyFont: Record<"en" | "zh", { fontFamily: string }> = {
  zh: { fontFamily: 'var(--font-noto-sc), "PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif' },
  en: { fontFamily: "var(--font-inter), sans-serif" },
};
