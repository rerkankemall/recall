import './globals.css';

export const metadata = {
  title: 'Recall',
  description: 'Remember what you read.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'Recall',
    statusBarStyle: 'black-translucent',
  },
  themeColor: '#14171c',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
