import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '30', 10), 100)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0)

    const distinctUsers = await prisma.purchase.findMany({
      where: { status: 'ACTIVE' },
      select: { user_id: true },
      distinct: ['user_id'],
      orderBy: { activated_at: 'desc' },
      take: limit,
      skip: offset,
    })

    const userIds = distinctUsers.map((item) => item.user_id)
    const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
      select count(distinct user_id)::bigint as count
      from "Purchase"
      where status = 'ACTIVE'
    `
    const totalCount = Number(countResult[0]?.count ?? BigInt(0))

    const purchases = userIds.length
      ? await prisma.purchase.findMany({
          where: {
            status: 'ACTIVE',
            user_id: { in: userIds },
          },
          select: {
            user_id: true,
            created_at: true,
            activated_at: true,
            user: {
              select: {
                username: true,
                full_name: true,
                email: true,
              },
            },
            vip_package: {
              select: {
                name: true,
                level: true,
              },
            },
          },
          orderBy: { activated_at: 'desc' },
        })
      : []

    const byUser = new Map<string, {
      user: typeof purchases[number]['user'];
      packages: Array<typeof purchases[number]['vip_package'] & { created_at: Date | null; activated_at: Date | null }>
    }>()
    for (const purchase of purchases) {
      const entry = byUser.get(purchase.user_id)
      if (!entry) {
        byUser.set(purchase.user_id, {
          user: purchase.user,
          packages: [{
            ...purchase.vip_package,
            created_at: purchase.created_at,
            activated_at: purchase.activated_at,
          }],
        })
      } else {
        entry.packages.push({
          ...purchase.vip_package,
          created_at: purchase.created_at,
          activated_at: purchase.activated_at,
        })
      }
    }

    const totals = userIds.length
      ? await prisma.walletLedger.groupBy({
          by: ['user_id'],
          where: {
            user_id: { in: userIds },
            type: { in: ['DAILY_PROFIT', 'REFERRAL_BONUS'] },
          },
          _sum: { amount_bs: true },
        })
      : []

    const totalsMap = new Map(
      totals.map((t) => [t.user_id, t._sum.amount_bs || 0])
    )

    const payload = Array.from(byUser.entries()).map(([userId, entry]) => ({
      user: entry.user,
      active_packages: entry.packages,
      total_earnings_bs: totalsMap.get(userId) || 0,
    }))

    return NextResponse.json({
      users: payload,
      total_count: totalCount,
      has_more: offset + userIds.length < totalCount,
      next_offset: offset + userIds.length,
    })
  } catch (error) {
    console.error('Active users error:', error)
    return NextResponse.json(
      { error: 'Error al cargar usuarios activos' },
      { status: 500 }
    )
  }
}
