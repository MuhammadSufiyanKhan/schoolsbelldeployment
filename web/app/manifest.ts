import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Schoolwell", short_name: "Schoolwell", description: "School management: attendance, fees, results and notices.",
    start_url: "/", scope: "/", display: "standalone", orientation: "portrait", background_color: "#f6f7f5", theme_color: "#0f766e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "Mark attendance", url: "/attendance" }, { name: "Fees", url: "/fees" }],
  };
}
