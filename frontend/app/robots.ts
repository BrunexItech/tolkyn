import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Everything behind a login has nothing for a crawler to index, and
        // indexing it would just leak internal route structure.
        disallow: ["/dashboard", "/admin", "/api", "/accept-invite"],
      },
    ],
    sitemap: "https://tolkyn.co.ke/sitemap.xml",
  };
}
