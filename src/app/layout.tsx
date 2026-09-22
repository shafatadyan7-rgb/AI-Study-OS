import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI StudyOS',
  description: 'Your Personal AI Learning Operating System.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=Noto+Sans+Bengali:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a href="#main-content" className="sr-only">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
