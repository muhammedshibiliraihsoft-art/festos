import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="theme-color" content="#FFFFFF" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Festos" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" sizes="48x48" href="/brand/favicon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/brand/apple-touch-icon-180.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/brand/apple-touch-icon-167.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/brand/apple-touch-icon-152.png" />
        <title>Festos</title>
        <ScrollViewStyleReset />
      </head>
      <body style={{ backgroundColor: '#011635' }}>{children}</body>
    </html>
  );
}
