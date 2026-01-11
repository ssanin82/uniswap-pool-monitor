import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Uniswap V3 Pool Monitor',
  description: 'Real-time monitoring of ETH/USDC Uniswap V3 pool swaps',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}