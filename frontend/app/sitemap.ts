import type { MetadataRoute } from "next";

const BASE = "https://tolkyn.co.ke";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/support`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
  ];
}
