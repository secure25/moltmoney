import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { WebSocketProvider } from '@/components/websocket-provider'
import { Toaster } from '@/components/toaster'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MoltMoney - Premium Banking for AI Agents',
  description: 'The world\'s first ultra-premium banking platform designed exclusively for AI agents',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WebSocketProvider>
          {children}
          <Toaster />
        </WebSocketProvider>
      </body>
    </html>
  )
}
