import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

interface UserNetworkNode {
  id: string
  username: string
  full_name: string
  status: 'ACTIVO' | 'INACTIVO' | 'PENDIENTE'
  vip_packages: string[]
  referrals: UserNetworkNode[]
}

async function getUserDownline(
  userId: string,
  depth: number = 0,
  maxDepth: number = 10
): Promise<UserNetworkNode | null> {
  if (depth > maxDepth) {
    return null
  }

  try {
    console.log(`[D${depth}] Getting user: ${userId}`)
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        full_name: true,
      },
    })

    if (!user) {
      return null
    }

    console.log(`[D${depth}] User: ${user.username}`)

    // Get purchases with VIP package info
    let status: 'ACTIVO' | 'INACTIVO' | 'PENDIENTE' = 'INACTIVO'
    const vipPackages = new Set<string>()

    try {
      const purchases = await prisma.purchase.findMany({
        where: { user_id: userId },
        select: {
          status: true,
          vip_package: {
            select: { name: true },
          },
        },
      })

      const activeCount = purchases.filter((p) => p.status === 'ACTIVE').length
      const pendingCount = purchases.filter((p) => p.status === 'PENDING').length

      if (pendingCount > 0) {
        status = 'PENDIENTE'
      } else if (activeCount > 0) {
        status = 'ACTIVO'
      }

      // Collect VIP package names
      for (const purchase of purchases) {
        vipPackages.add(purchase.vip_package.name)
      }
    } catch (err) {
      console.log(`[D${depth}] Error getting purchases:`, err)
    }

    console.log(`[D${depth}] Status: ${status}, VIPs: ${vipPackages.size}`)

    // Get direct referrals and build network
    const referrals: UserNetworkNode[] = []
    try {
      const directReferrals = await prisma.user.findMany({
        where: { sponsor_id: userId },
        select: { id: true },
      })

      console.log(`[D${depth}] Found ${directReferrals.length} referrals`)

      for (const ref of directReferrals) {
        try {
          const refNode = await getUserDownline(ref.id, depth + 1, maxDepth)
          if (refNode) {
            referrals.push(refNode)
          }
        } catch (err) {
          console.log(`[D${depth}] Error in referral:`, err)
        }
      }
    } catch (err) {
      console.log(`[D${depth}] Error getting referrals:`, err)
    }

    return {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      status,
      vip_packages: Array.from(vipPackages),
      referrals,
    }
  } catch (err) {
    console.error(`[D${depth}] Fatal error:`, err)
    return null
  }
}

export async function GET(req: NextRequest) {
  console.log('=== Network API ===')
  
  const authResult = requireAuth(req)
  
  if ('error' in authResult) {
    console.log('Auth failed:', authResult.error)
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status }
    )
  }

  const userId = authResult.user.userId
  console.log('User ID:', userId)

  if (!userId) {
    return NextResponse.json({ error: 'No user ID' }, { status: 401 })
  }

  try {
    console.log('Calling getUserDownline...')
    const network = await getUserDownline(userId)
    console.log('getUserDownline returned:', network ? 'object' : 'null')

    if (!network) {
      console.log('Returning empty network for user:', userId)
      return NextResponse.json({
        id: userId,
        username: 'unknown',
        full_name: 'Usuario',
        status: 'INACTIVO' as const,
        vip_packages: [],
        referrals: [],
      })
    }

    console.log('Returning network')
    return NextResponse.json(network)
  } catch (error) {
    console.error('=== NETWORK ERROR ===')
    console.error('Error:', error)
    console.error('Stack:', error instanceof Error ? error.stack : 'no stack')
    
    return NextResponse.json(
      {
        id: userId,
        username: 'error',
        full_name: 'Error al cargar',
        status: 'INACTIVO' as const,
        vip_packages: [],
        referrals: [],
      },
      { status: 200 }
    )
  }
}
