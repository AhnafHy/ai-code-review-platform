import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Providers from './providers'
import Link from 'next/link'
import { Bot, LayoutDashboard, GitPullRequest } from 'lucide-react'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI Code Review Platform',
  description: 'Automated AI-powered code reviews for GitHub pull requests',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen bg-gray-50">
            <nav className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="max-w-6xl mx-auto flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2">
                  <Bot className="text-emerald-600" size={22} />
                  <span className="font-semibold text-gray-900">AI Code Review</span>
                </Link>
                <div className="flex items-center gap-6">
                  <Link href="/" className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
                    <LayoutDashboard size={15} /> Dashboard
                  </Link>
                  <Link href="/reviews" className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
                    <GitPullRequest size={15} /> Reviews
                  </Link>
                </div>
              </div>
            </nav>
            <main className="max-w-6xl mx-auto px-6 py-8">
              {children}
            </main>
          </div>
        </Providers>
      </body>
    </html>
  )
}