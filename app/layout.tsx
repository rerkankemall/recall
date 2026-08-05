import type { Metadata } from 'next';
import './globals.css';

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.myafterwordapp.com';
const description =
  "You forget most of what you read. Afterword pulls out the ideas worth remembering from anything you read or watch, then brings them back to you on a spaced schedule right before you'd forget them.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Afterword — Reading memory log',
    template: '%s · Afterword',
  },
  description,
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Afterword',
    statusBarStyle: 'black-translucent',
  },
  themeColor: '#14171c',
  openGraph: {
    title: 'Afterword — Reading memory log',
    description,
    url: siteUrl,
    siteName: 'Afterword',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Afterword — Reading memory log',
    description,
  },
};

const redditPixelId = process.env.NEXT_PUBLIC_REDDIT_PIXEL_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {redditPixelId && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                !function(w,d){if(!w.rdt){var p=w.rdt=function(){p.sendEvent?p.sendEvent.apply(p,arguments):p.callQueue.push(arguments)};p.callQueue=[];var t=d.createElement("script");t.src="https://www.redditstatic.com/ads/pixel.js",t.async=!0;var s=d.getElementsByTagName("script")[0];s.parentNode.insertBefore(t,s)}}(window,document);
                rdt('init','${redditPixelId}');
                rdt('track', 'PageVisit');
              `,
            }}
          />
        )}
      </head>
      <body>{children}</body>
    </html>
  );
}
