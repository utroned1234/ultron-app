import type { Metadata } from 'next'
import './globals.css'
import { ToastProvider } from '@/components/ui/Toast'

export const metadata: Metadata = {
  title: 'ULTRON',
  description: 'Plataforma ULTRON Premium',
}

// Iniciar cron jobs solo si esta habilitado por entorno
if (typeof window === 'undefined' && process.env.ENABLE_INTERNAL_CRON === 'true') {
  import('@/lib/cron').then(({ startDailyProfitCron }) => {
    startDailyProfitCron()
  })
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className="font-montserrat bg-dark-bg text-text-primary antialiased">
        <ToastProvider>
          <div className="min-h-screen">
            <header className="sticky top-0 z-40 border-b border-gold border-opacity-20 bg-dark-bg/80 backdrop-blur">
              <div className="mx-auto flex max-w-screen-xl items-center justify-center gap-3 px-4 py-3">
                <img
                  src="https://i.ibb.co/fVVzyKHQ/d8ec2485d1667e16cb4cb5dbe792dfbe-Photoroom.png"
                  alt="Ultron"
                  className="h-8 w-auto animate-[logoDepth_4.5s_ease-in-out_infinite]"
                  loading="lazy"
                />
                <span className="text-sm font-bold tracking-[0.35em] text-gold gold-glow">
                  ULTRON
                </span>
              </div>
            </header>
            {children}
          </div>
        </ToastProvider>
      </body>
    </html>
  )
}
