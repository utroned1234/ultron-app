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

    // Verificar si ya se ejecutó después de la última 1 AM
    const lastRun = await prisma.dailyProfitRun.findUnique({
      where: { id: 1 },
    })

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

    // Filtrar compras que NO han recibido ganancia después de la última 1 AM
    // Esto asegura que TODOS los VIPs activos reciban ganancia cuando se ejecute el proceso
    const eligiblePurchases = activePurchases.filter((purchase) => {
      if (!purchase.last_profit_at) return true
      // Si ya recibió ganancia después de la última 1 AM de hoy, no es elegible
      return purchase.last_profit_at < lastOneAM
    })

    let processedCount = 0
    const paymentDetails: any[] = []

    // OPTIMIZACIÓN: Obtener todos los usuarios y balances de una vez
    const uniqueUserIds = [...new Set(eligiblePurchases.map(p => p.user_id))]

    // Obtener todos los usuarios de una vez
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: {
        id: true,
        username: true,
        email: true,
        user_code: true,
        full_name: true
      }
    })
    const userMap = new Map(users.map(u => [u.id, u]))

    // Obtener todos los balances de una vez
    const allLedgerEntries = await prisma.walletLedger.groupBy({
      by: ['user_id'],
      where: { user_id: { in: uniqueUserIds } },
      _sum: { amount_bs: true }
    })
    const balanceMap = new Map(allLedgerEntries.map(entry => [
      entry.user_id,
      entry._sum.amount_bs ?? 0
    ]))

    // Agrupar compras por usuario para calcular balance correctamente
    const userBalances = new Map<string, number>()

    // Inicializar con balances actuales
    uniqueUserIds.forEach(userId => {
      userBalances.set(userId, balanceMap.get(userId) ?? 0)
    })

    // PROCESAR EN LOTES para manejar miles de usuarios sin timeout
    const BATCH_SIZE = 50 // Procesar 50 compras por lote (reducido para evitar timeouts)
    const totalBatches = Math.ceil(eligiblePurchases.length / BATCH_SIZE)

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const start = batchIndex * BATCH_SIZE
      const end = Math.min(start + BATCH_SIZE, eligiblePurchases.length)
      const batch = eligiblePurchases.slice(start, end)

      // Procesar cada lote en una transacción separada con timeout extendido
      await prisma.$transaction(async (tx) => {
        // Procesar cada compra completamente (ledger + update) en el loop
        // Esto evita el problema de createMany + updates individuales
        for (const purchase of batch) {
          const effectiveProfit = purchase.vip_package?.daily_profit_bs ?? purchase.daily_profit_bs
          const user = userMap.get(purchase.user_id)
          const balanceBefore = userBalances.get(purchase.user_id) ?? 0

          // 1. Crear entrada de ledger
          await tx.walletLedger.create({
            data: {
              user_id: purchase.user_id,
              type: 'DAILY_PROFIT',
              amount_bs: effectiveProfit,
              description: `Ganancia diaria VIP ${purchase.vip_package_id}`,
              created_at: now
            }
          })

          // 2. Actualizar purchase
          await tx.purchase.update({
            where: { id: purchase.id },
            data: {
              last_profit_at: now,
              total_earned_bs: purchase.total_earned_bs + effectiveProfit,
            },
          })

          // Calcular nuevo balance y actualizar
          const balanceAfter = balanceBefore + effectiveProfit
          userBalances.set(purchase.user_id, balanceAfter)

          // Guardar detalles del pago
          paymentDetails.push({
            user_code: user?.user_code,
            username: user?.username,
            full_name: user?.full_name,
            email: user?.email,
            vip_level: purchase.vip_package_id,
            balance_before: balanceBefore,
            amount_paid: effectiveProfit,
            balance_after: balanceAfter,
            purchase_id: purchase.id
          })

          processedCount++
        }
      }, {
        maxWait: 10000, // Esperar máximo 10s para adquirir la transacción
        timeout: 60000, // Timeout de 60s para la transacción completa
      })

      // Log de progreso para grandes cantidades
      if (eligiblePurchases.length > 100) {
        console.log(`Procesado lote ${batchIndex + 1}/${totalBatches} (${processedCount}/${eligiblePurchases.length})`)
      }
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
      payment_details: paymentDetails,
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

    // Recuperar los detalles de pagos de la última ejecución
    let paymentDetails: any[] = []
    if (lastRun && lastRun.last_run_at) {
      // Buscar todas las transacciones DAILY_PROFIT creadas en la última ejecución
      // Damos un margen de 10 minutos antes y después del timestamp
      const startTime = new Date(lastRun.last_run_at.getTime() - 10 * 60 * 1000)
      const endTime = new Date(lastRun.last_run_at.getTime() + 10 * 60 * 1000)

      const profits = await prisma.walletLedger.findMany({
        where: {
          type: 'DAILY_PROFIT',
          created_at: {
            gte: startTime,
            lte: endTime
          }
        },
        include: {
          user: {
            select: {
              username: true,
              user_code: true,
              full_name: true,
              email: true
            }
          }
        },
        orderBy: {
          created_at: 'asc'
        }
      })

      // Reconstruir payment_details con balances
      const userBalanceMap = new Map<string, number>()

      for (const profit of profits) {
        // Calcular balance antes de este pago
        let balanceBefore: number
        if (userBalanceMap.has(profit.user_id)) {
          balanceBefore = userBalanceMap.get(profit.user_id)!
        } else {
          // Obtener balance hasta antes de esta transacción
          const ledgerEntries = await prisma.walletLedger.findMany({
            where: {
              user_id: profit.user_id,
              created_at: {
                lt: profit.created_at
              }
            },
            select: {
              amount_bs: true
            }
          })
          balanceBefore = ledgerEntries.reduce((sum, entry) => sum + entry.amount_bs, 0)
        }

        const balanceAfter = balanceBefore + profit.amount_bs
        userBalanceMap.set(profit.user_id, balanceAfter)

        // Extraer el VIP level de la descripción
        const vipMatch = profit.description?.match(/VIP (\d+)/)
        const vipLevel = vipMatch ? parseInt(vipMatch[1]) : 0

        paymentDetails.push({
          user_code: profit.user.user_code,
          username: profit.user.username,
          full_name: profit.user.full_name,
          email: profit.user.email,
          vip_level: vipLevel,
          balance_before: balanceBefore,
          amount_paid: profit.amount_bs,
          balance_after: balanceAfter,
          purchase_id: profit.id
        })
      }
    }

    return NextResponse.json({
      last_run_at: lastRun?.last_run_at || null,
      next_unlock: nextUnlock,
      already_run: alreadyRun,
      payment_details: paymentDetails,
    })
  } catch (error) {
    console.error('Run daily profit status error:', error)
    return NextResponse.json(
      { error: 'Error al consultar estado' },
      { status: 500 }
    )
  }
}
