'use client'

import { SessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider 
      refetchInterval={5 * 60} // Refetch sesiju svakih 5 minuta
      refetchOnWindowFocus={true} // Refetch kada se prozor fokusira
    >
      {children}
    </SessionProvider>
  )
}
