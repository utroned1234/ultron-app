import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

interface UserNetworkNode {
  id: string
  username: string
  full_name: string
  status: 'ACTIVO' | 'INACTIVO' | 'PENDIENTE'
  vip_packages: string[]
  referrals: UserNetworkNode[]
}

async function getUserDownline(
  userId: string
): Promise<UserNetworkNode | null> {
  // Get the user and their data
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      full_name: true,
    },
  })

  if (!user) return null

  // Get user's purchases to determine status and VIP packages
  const purchases = await prisma.purchase.findMany({
    where: { user_id: userId },
    select: {
      id: true,
      status: true,
      vip_package: {
        select: { name: true },
      },
    },
  })

  // Determine user status
  const hasActivePurchases = purchases.some((p) => p.status === 'ACTIVE')
  const hasPendingPurchases = purchases.some((p) => p.status === 'PENDING')
  let status: 'ACTIVO' | 'INACTIVO' | 'PENDIENTE'

  if (hasPendingPurchases) {
    status = 'PENDIENTE'
  } else if (hasActivePurchases) {
    status = 'ACTIVO'
  } else {
    status = 'INACTIVO'
  }

  // Get VIP packages
  const vipPackages = purchases
    .map((p) => p.vip_package.name)
    .filter((name, index, self) => self.indexOf(name) === index) // Remove duplicates

  // Get all direct referrals recursively
  const referrals = await prisma.user.findMany({
    where: { sponsor_id: userId },
    select: { id: true },
  })

  const referralsNodes: UserNetworkNode[] = []
  for (const referral of referrals) {
    const node = await getUserDownline(referral.id)
    if (node) {
      referralsNodes.push(node)
    }
  }

  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    status,
    vip_packages: vipPackages,
    referrals: referralsNodes,
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const { id } = await params

    const userNetwork = await getUserDownline(id)

    if (!userNetwork) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json(userNetwork)
  } catch (error) {
    console.error('Error fetching user network:', error)
    return NextResponse.json(
      { error: 'Error al cargar la red del usuario' },
      { status: 500 }
    )
  }
}
