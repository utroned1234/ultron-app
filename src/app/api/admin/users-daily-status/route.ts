import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const now = new Date()

    // Calcular la última 1 AM hora Bolivia (UTC-4)
    const boliviaOffset = -4 * 60
    const nowBolivia = new Date(now.getTime() + boliviaOffset * 60 * 1000)

    const boliviaYear = nowBolivia.getUTCFullYear()
    const boliviaMonth = nowBolivia.getUTCMonth()
    const boliviaDate = nowBolivia.getUTCDate()
    const boliviaHour = nowBolivia.getUTCHours()

    let lastOneAM: Date
    if (boliviaHour >= 1) {
      lastOneAM = new Date(Date.UTC(boliviaYear, boliviaMonth, boliviaDate, 1, 0, 0, 0))
    } else {
      lastOneAM = new Date(Date.UTC(boliviaYear, boliviaMonth, boliviaDate - 1, 1, 0, 0, 0))
    }
    lastOneAM = new Date(lastOneAM.getTime() - boliviaOffset * 60 * 1000)

    // Obtener todas las compras activas con información del usuario y paquete
    const activePurchases = await prisma.purchase.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        user: {
          select: {
            id: true,
            user_code: true,
            username: true,
            full_name: true,
            email: true,
          },
        },
        vip_package: {
          select: {
            id: true,
            level: true,
            name: true,
            daily_profit_bs: true,
            investment_bs: true,
          },
        },
      },
      orderBy: {
        user: {
          username: 'asc',
        },
      },
    })

    // Obtener balances de todos los usuarios con compras activas
    const uniqueUserIds = [...new Set(activePurchases.map(p => p.user_id))]

    const allBalances = await prisma.walletLedger.groupBy({
      by: ['user_id'],
      where: { user_id: { in: uniqueUserIds } },
      _sum: { amount_bs: true },
    })

    const balanceMap = new Map(
      allBalances.map(b => [b.user_id, b._sum.amount_bs ?? 0])
    )

    // Agrupar compras por usuario
    const userPurchasesMap = new Map<string, typeof activePurchases>()
    for (const purchase of activePurchases) {
      const userId = purchase.user_id
      if (!userPurchasesMap.has(userId)) {
        userPurchasesMap.set(userId, [])
      }
      userPurchasesMap.get(userId)!.push(purchase)
    }

    // Construir respuesta por usuario
    const users = []

    for (const [userId, purchases] of userPurchasesMap) {
      const user = purchases[0].user
      const balanceBefore = balanceMap.get(userId) ?? 0

      // Calcular ganancia total diaria de todos sus VIPs
      let totalDailyProfit = 0
      const vipPackages = []
      let allPurchasesReceivedToday = true
      let lastProfitAt: Date | null = null

      for (const purchase of purchases) {
        const profit = purchase.vip_package?.daily_profit_bs ?? purchase.daily_profit_bs

        // Verificar si esta compra ya recibió ganancia hoy (después de la 1 AM Bolivia)
        const receivedToday: boolean = purchase.last_profit_at
          ? purchase.last_profit_at >= lastOneAM
          : false

        if (!receivedToday) {
          allPurchasesReceivedToday = false
          totalDailyProfit += profit
        }

        // Guardar el último last_profit_at más reciente
        if (purchase.last_profit_at && (!lastProfitAt || purchase.last_profit_at > lastProfitAt)) {
          lastProfitAt = purchase.last_profit_at
        }

        vipPackages.push({
          purchase_id: purchase.id,
          level: purchase.vip_package?.level ?? purchase.vip_package_id,
          name: purchase.vip_package?.name ?? `VIP ${purchase.vip_package_id}`,
          daily_profit_bs: profit,
          investment_bs: purchase.vip_package?.investment_bs ?? purchase.investment_bs,
          received_today: receivedToday,
          last_profit_at: purchase.last_profit_at ? purchase.last_profit_at.toISOString() : null,
        })
      }

      const balanceAfter = balanceBefore + totalDailyProfit
      const percentageIncrease = balanceBefore > 0
        ? ((totalDailyProfit / balanceBefore) * 100)
        : (totalDailyProfit > 0 ? 100 : 0)

      users.push({
        user_id: userId,
        user_code: user.user_code,
        username: user.username,
        full_name: user.full_name,
        email: user.email,
        vip_packages: vipPackages,
        balance_before: balanceBefore,
        total_daily_profit: totalDailyProfit,
        balance_after: balanceAfter,
        percentage_increase: percentageIncrease,
        can_receive_profit: !allPurchasesReceivedToday,
        all_received_today: allPurchasesReceivedToday,
        last_profit_at: lastProfitAt ? lastProfitAt.toISOString() : null,
      })
    }

    // Ordenar: primero los que pueden recibir, luego por username
    users.sort((a, b) => {
      if (a.can_receive_profit && !b.can_receive_profit) return -1
      if (!a.can_receive_profit && b.can_receive_profit) return 1
      return a.username.localeCompare(b.username)
    })

    return NextResponse.json({
      users,
      total_users: users.length,
      users_pending: users.filter(u => u.can_receive_profit).length,
      users_completed: users.filter(u => !u.can_receive_profit).length,
    })
  } catch (error) {
    console.error('Error fetching users daily status:', error)
    return NextResponse.json(
      { error: 'Error al obtener estado de usuarios' },
      { status: 500 }
    )
  }
}
