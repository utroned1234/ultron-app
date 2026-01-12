import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'

type DbClient = Prisma.TransactionClient | typeof prisma

async function applyReferralBonuses(
  client: DbClient,
  userId: string,
  investmentBs: number,
  level: number,
  multiplier: number
): Promise<void> {
  if (level > 7) return

  const user = await client.user.findUnique({
    where: { id: userId },
    select: { sponsor_id: true },
  })

  if (!user || !user.sponsor_id) return

  const bonusRule = await client.referralBonusRule.findUnique({
    where: { level },
  })

  if (bonusRule && bonusRule.percentage > 0) {
    const bonusAmount = (investmentBs * bonusRule.percentage) / 100
    const amount = bonusAmount * multiplier
    const actionLabel = multiplier < 0 ? 'Reverso' : 'Bono'

    await client.walletLedger.create({
      data: {
        user_id: user.sponsor_id,
        type: 'REFERRAL_BONUS',
        amount_bs: amount,
        description: `${actionLabel} de referido nivel ${level} (${bonusRule.percentage}%)`,
      },
    })
  }

  await applyReferralBonuses(client, user.sponsor_id, investmentBs, level + 1, multiplier)
}

export async function payReferralBonuses(
  userId: string,
  investmentBs: number,
  level: number = 1
): Promise<void> {
  await applyReferralBonuses(prisma, userId, investmentBs, level, 1)
}

export async function reverseReferralBonuses(
  client: DbClient,
  userId: string,
  investmentBs: number,
  level: number = 1
): Promise<void> {
  await applyReferralBonuses(client, userId, investmentBs, level, -1)
}
