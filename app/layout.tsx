import type { Metadata, Viewport } from 'next';
import { Chakra_Petch, Press_Start_2P } from 'next/font/google';
import './globals.css';

const bodyFont = Chakra_Petch({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const arcadeFont = Press_Start_2P({
  variable: '--font-arcade',
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
});

const title = 'KADREA — Enter the Dance Floor';
const description =
  'Kadrea’s interactive arcade dance floor: a 3D avatar that re-times her dance to whichever of her tracks is playing.';

/**
 * Social images need absolute URLs. Vercel supplies the deployment host at
 * build time; set NEXT_PUBLIC_SITE_URL once Kadrea has a custom domain.
 */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  applicationName: 'Kadrea',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title,
    description,
    siteName: 'Kadrea',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#07040e',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${arcadeFont.variable}`}>
        {children}
      </body>
    </html>
  );
}
