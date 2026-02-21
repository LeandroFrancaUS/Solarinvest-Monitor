import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Solarinvest Monitor',
  description: 'Plataforma de monitoramento de usinas solares',
}
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Solarinvest Monitor',
  description: 'Solar plant monitoring platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
