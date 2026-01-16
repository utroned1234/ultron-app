import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const now = new Date()

    // Calcular la última 1 AM y la próxima 1 AM hora Bolivia (UTC-4)
    const boliviaOffset = -4 * 60 // -4 horas en minutos
    const nowBolivia = new Date(now.getTime() + boliviaOffset * 60 * 1000)

    // Obtener la fecha actual en Bolivia
    const boliviaYear = nowBolivia.getUTCFullYear()
    const boliviaMonth = nowBolivia.getUTCMonth()
    const boliviaDate = nowBolivia.getUTCDate()
    const boliviaHour = nowBolivia.getUTCHours()

    // Calcular la última 1 AM que ya pasó
    let lastOneAM: Date
    if (boliviaHour >= 1) {
      // Ya pasó la 1 AM de hoy, entonces la última fue hoy a la 1 AM
      lastOneAM = new Date(Date.UTC(boliviaYear, boliviaMonth, boliviaDate, 1, 0, 0, 0))
    } else {
      // Aún no llega la 1 AM de hoy, entonces la última fue ayer a la 1 AM
      lastOneAM = new Date(Date.UTC(boliviaYear, boliviaMonth, boliviaDate - 1, 1, 0, 0, 0))
    }

    // Calcular la próxima 1 AM
    let nextUnlock: Date
    if (boliviaHour >= 1) {
      // Ya pasó la 1 AM de hoy, siguiente es mañana
      nextUnlock = new Date(Date.UTC(boliviaYear, boliviaMonth, boliviaDate + 1, 1, 0, 0, 0))
    } else {
      // Aún no llega la 1 AM de hoy, la próxima es hoy a la 1 AM
      nextUnlock = new Date(Date.UTC(boliviaYear, boliviaMonth, boliviaDate, 1, 0, 0, 0))
    }

    // Convertir de hora Bolivia (UTC) a hora del servidor (restar el offset)
    lastOneAM = new Date(lastOneAM.getTime() - boliviaOffset * 60 * 1000)
    nextUnlock = new Date(nextUnlock.getTime() - boliviaOffset * 60 * 1000)

    const lastRun = await prisma.dailyProfitRun.findUnique({
      where: { id: 1 },
    })

    // Verificar si ya se ejecutó después de la última 1 AM Bolivia
    // Si lastRun existe y es posterior a la última 1 AM, entonces ya se ejecutó hoy
    if (lastRun && lastRun.last_run_at >= lastOneAM) {
      return NextResponse.json({
        message: `Ganancias diarias ya actualizadas. Próxima ejecución disponible a la 1:00 AM (Bolivia)`,
        processed: 0,
        synced: 0,
        last_run_at: lastRun.last_run_at,
        next_unlock: nextUnlock,
        already_run: true,
      })
    }

    const activePurchases = await prisma.purchase.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        vip_package: {
          select: {
            daily_profit_bs: true,
          },
        },
      },
    })

    let syncedCount = 0
    for (const purchase of activePurchases) {
      const currentProfit = purchase.vip_package?.daily_profit_bs ?? purchase.daily_profit_bs
      if (purchase.daily_profit_bs !== currentProfit) {
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: { daily_profit_bs: currentProfit },
        })
        syncedCount++
      }
    }

    const eligiblePurchases = activePurchases.filter((purchase) => {
      if (!purchase.last_profit_at) return true
      // Verificar si ya pasaron 24 horas desde el último pago
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      return purchase.last_profit_at <= twentyFourHoursAgo
    })

    let processedCount = 0

    for (const purchase of eligiblePurchases) {
      const effectiveProfit = purchase.vip_package?.daily_profit_bs ?? purchase.daily_profit_bs
      await prisma.$transaction(async (tx) => {
        await tx.walletLedger.create({
          data: {
            user_id: purchase.user_id,
            type: 'DAILY_PROFIT',
            amount_bs: effectiveProfit,
            description: `Ganancia diaria ${purchase.vip_package_id}`,
          },
        })

        await tx.purchase.update({
          where: { id: purchase.id },
          data: {
            last_profit_at: now,
            total_earned_bs: purchase.total_earned_bs + effectiveProfit,
          },
        })
      })

      processedCount++
    }

    await prisma.dailyProfitRun.upsert({
      where: { id: 1 },
      update: { last_run_at: now },
      create: { id: 1, last_run_at: now },
    })

    return NextResponse.json({
      message: 'Ganancias diarias procesadas',
      processed: processedCount,
      synced: syncedCount,
      last_run_at: now,
      already_run: false,
    })
  } catch (error) {
    console.error('Run daily profit error:', error)
    return NextResponse.json(
      { error: 'Error al procesar ganancias' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const now = new Date()

    // Calcular la última 1 AM y la próxima 1 AM hora Bolivia (UTC-4)
    const boliviaOffset = -4 * 60 // -4 horas en minutos
    const nowBolivia = new Date(now.getTime() + boliviaOffset * 60 * 1000)

    // Obtener la fecha actual en Bolivia
    const boliviaYear = nowBolivia.getUTCFullYear()
    const boliviaMonth = nowBolivia.getUTCMonth()
    const boliviaDate = nowBolivia.getUTCDate()
    const boliviaHour = nowBolivia.getUTCHours()

    // Calcular la última 1 AM que ya pasó
    let lastOneAM: Date
    if (boliviaHour >= 1) {
      lastOneAM = new Date(Date.UTC(boliviaYear, boliviaMonth, boliviaDate, 1, 0, 0, 0))
    } else {
      lastOneAM = new Date(Date.UTC(boliviaYear, boliviaMonth, boliviaDate - 1, 1, 0, 0, 0))
    }

    // Calcular próxima 1 AM
    let nextUnlock: Date
    if (boliviaHour >= 1) {
      nextUnlock = new Date(Date.UTC(boliviaYear, boliviaMonth, boliviaDate + 1, 1, 0, 0, 0))
    } else {
      nextUnlock = new Date(Date.UTC(boliviaYear, boliviaMonth, boliviaDate, 1, 0, 0, 0))
    }

    // Convertir de hora Bolivia (UTC) a hora del servidor
    lastOneAM = new Date(lastOneAM.getTime() - boliviaOffset * 60 * 1000)
    nextUnlock = new Date(nextUnlock.getTime() - boliviaOffset * 60 * 1000)

    const lastRun = await prisma.dailyProfitRun.findUnique({
      where: { id: 1 },
    })

    // Ya se ejecutó si lastRun existe y es posterior a la última 1 AM
    const alreadyRun = lastRun ? lastRun.last_run_at >= lastOneAM : false
    return NextResponse.json({
      last_run_at: lastRun?.last_run_at || null,
      next_unlock: nextUnlock,
      already_run: alreadyRun,
    })
  } catch (error) {
    console.error('Run daily profit status error:', error)
    return NextResponse.json(
      { error: 'Error al consultar estado' },
      { status: 500 }
    )
  }
}
