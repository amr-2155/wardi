import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "وردي — مواقيت الصلاة والورد اليومي",
    short_name: "وردي",
    description: "مواقيت الصلاة، الأذان التنبيهات، ومتابعة ورد القرآن اليومي",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0c1512",
    theme_color: "#123b30",
    lang: "ar",
    dir: "rtl",
    icons: [
      {
        src: "/wardi-icon-1024.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/wardi-icon-1024.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}