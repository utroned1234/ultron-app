import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth } from '@/lib/auth/middleware'

interface NetworkUser {
  id: string
  username: string
  full_name: string
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING'
  vip_packages: string[]
  level: number
  children: NetworkUser[]
}

async function buildNetwork(userId: string, currentLevel: number = 1, maxLevel: number = 7): Promise<NetworkUser[]> {
  if (currentLevel > maxLevel) return []

  // Obtener referidos directos
  const directReferrals = await prisma.user.findMany({
    where: { sponsor_id: userId },
    select: {
      id: true,
      username: true,
      full_name: true,
    },
  })

  if (directReferrals.length === 0) return []

  const userIds = directReferrals.map(u => u.id)

  // Obtener compras de estos usuarios
  const purchases = await prisma.purchase.findMany({
    where: {
      user_id: { in: userIds },
    },
    select: {
      user_id: true,
      status: true,
      vip_package: {
        select: {
          name: true,
        },
      },
    },
  })

  // Agrupar compras por usuario
  const purchasesByUser = new Map<string, typeof purchases>()
  for (const purchase of purchases) {
    if (!purchasesByUser.has(purchase.user_id)) {
      purchasesByUser.set(purchase.user_id, [])
    }
    purchasesByUser.get(purchase.user_id)!.push(purchase)
  }

  // Construir red
  const network: NetworkUser[] = []

  for (const user of directReferrals) {
    const userPurchases = purchasesByUser.get(user.id) || []

    // Determinar estado
    const hasActive = userPurchases.some(p => p.status === 'ACTIVE')
    const hasPending = userPurchases.some(p => p.status === 'PENDING')

    let status: 'ACTIVE' | 'INACTIVE' | 'PENDING'
    if (hasActive) {
      status = 'ACTIVE'
    } else if (hasPending) {
      status = 'PENDING'
    } else {
      status = 'INACTIVE'
    }

    // Obtener nombres de paquetes VIP únicos
    const vipPackages = [...new Set(
      userPurchases
        .filter(p => p.status === 'ACTIVE' || p.status === 'PENDING')
        .map(p => p.vip_package.name)
    )]

    // Obtener hijos recursivamente
    const children = await buildNetwork(user.id, currentLevel + 1, maxLevel)

    network.push({
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      status,
      vip_packages: vipPackages,
      level: currentLevel,
      children,
    })
  }

  return network
}

export async function GET(req: NextRequest) {
  const authResult = requireAuth(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const network = await buildNetwork(authResult.user.userId)

    return NextResponse.json({ network })
  } catch (error) {
    console.error('Network error:', error)
    return NextResponse.json(
      { error: 'Error al cargar red de referidos' },
      { status: 500 }
    )
  }
}
