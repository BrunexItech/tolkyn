/** JSON-LD for search engines — a SoftwareApplication + Organization graph so
 * Tolkyn can qualify for rich results (name, logo, description) rather than
 * a bare blue link. Server-rendered, no client JS involved. */
export function StructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: "Tolkyn",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: "https://tolkyn.co.ke",
        description:
          "Tolkyn is the all-in-one social media management platform: schedule and publish across every network, reply from a unified inbox, run a built-in call center, generate and score leads, and track reach and revenue.",
        offers: {
          "@type": "Offer",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
        },
      },
      {
        "@type": "Organization",
        name: "Tolkyn",
        url: "https://tolkyn.co.ke",
        logo: "https://tolkyn.co.ke/tolkyn_logo.png",
      },
      {
        "@type": "WebSite",
        name: "Tolkyn",
        url: "https://tolkyn.co.ke",
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
