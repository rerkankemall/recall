import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.myafterwordapp.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app', '/settings', '/api'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
