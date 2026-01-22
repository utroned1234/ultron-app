'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function BottomNav() {
  const pathname = usePathname()

  const navItems = [
    { href: '/home', label: 'Home', icon: '🏠' },
    { href: '/paks', label: 'Paks', icon: '💎' },
    { href: '/network', label: 'Red', icon: '🌐' },
    { href: '/tabla', label: 'Tabla', icon: '📊' },
    { href: '/withdrawals', label: 'Retiros', icon: '💰' },
    { href: '/my-purchases', label: 'Compras', icon: '📦' },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-dark-card border-t border-gold border-opacity-20 z-50">
      <div className="flex justify-around items-center h-16 max-w-screen-xl mx-auto px-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                isActive
                  ? 'text-gold'
                  : 'text-text-secondary hover:text-gold'
              }`}
            >
              <span className="text-2xl mb-1">{item.icon}</span>
              <span className="text-xs font-medium">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
