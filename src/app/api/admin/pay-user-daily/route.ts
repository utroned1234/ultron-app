import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const body = await req.json()
    const { user_id } = body

    if (!user_id) {
      return NextResponse.json({ error: 'user_id es requerido' }, { status: 400 })
    }

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

    // Obtener usuario
    const user = await prisma.user.findUnique({
      where: { id: user_id },
      select: {
        id: true,
        user_code: true,
        username: true,
        full_name: true,
        email: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Obtener compras activas del usuario
    const activePurchases = await prisma.purchase.findMany({
      where: {
        user_id: user_id,
        status: 'ACTIVE',
      },
      include: {
        vip_package: {
          select: {
            id: true,
            level: true,
            name: true,
            daily_profit_bs: true,
          },
        },
      },
    })

    if (activePurchases.length === 0) {
      return NextResponse.json({ error: 'El usuario no tiene paquetes VIP activos' }, { status: 400 })
    }

    // Filtrar compras que NO han recibido ganancia después de la última 1 AM
    const eligiblePurchases = activePurchases.filter((purchase) => {
      if (!purchase.last_profit_at) return true
      return purchase.last_profit_at < lastOneAM
    })

    if (eligiblePurchases.length === 0) {
      return NextResponse.json({
        error: 'El usuario ya recibió sus ganancias diarias. Disponible después de la 1:00 AM (Bolivia)',
        already_paid: true,
      }, { status: 400 })
    }

    // Obtener balance actual del usuario
    const currentBalance = await prisma.walletLedger.aggregate({
      where: { user_id: user_id },
      _sum: { amount_bs: true },
    })
    const balanceBefore = currentBalance._sum.amount_bs ?? 0

    // Procesar pagos
    let totalPaid = 0
    const paymentDetails: { vip_level: number; vip_name: string; amount: number }[] = []

    await prisma.$transaction(async (tx) => {
      for (const purchase of eligiblePurchases) {
        const effectiveProfit = purchase.vip_package?.daily_profit_bs ?? purchase.daily_profit_bs

        // Crear entrada en wallet
        await tx.walletLedger.create({
          data: {
            user_id: user_id,
            type: 'DAILY_PROFIT',
            amount_bs: effectiveProfit,
            description: `Ganancia diaria VIP ${purchase.vip_package_id}`,
            created_at: now,
          },
        })

        // Actualizar purchase
        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            last_profit_at: now,
            total_earned_bs: purchase.total_earned_bs + effectiveProfit,
          },
        })

        totalPaid += effectiveProfit
        paymentDetails.push({
          vip_level: purchase.vip_package?.level ?? purchase.vip_package_id,
          vip_name: purchase.vip_package?.name ?? `VIP ${purchase.vip_package_id}`,
          amount: effectiveProfit,
        })
      }
    })

    const balanceAfter = balanceBefore + totalPaid

    return NextResponse.json({
      success: true,
      user_id: user.id,
      user_code: user.user_code,
      username: user.username,
      full_name: user.full_name,
      purchases_paid: eligiblePurchases.length,
      total_paid: totalPaid,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      details: paymentDetails,
      paid_at: now.toISOString(),
    })
  } catch (error) {
    console.error('Error paying user daily profit:', error)
    return NextResponse.json(
      { error: 'Error al procesar pago' },
      { status: 500 }
    )
  }
}
