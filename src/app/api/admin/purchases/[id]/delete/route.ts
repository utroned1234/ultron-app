import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const purchaseId = params.id
    await prisma.purchase.delete({
      where: { id: purchaseId },
    })

    return NextResponse.json({ message: 'Compra eliminada' })
  } catch (error) {
    console.error('Delete purchase error:', error)
    return NextResponse.json(
      { error: 'Error al eliminar compra' },
      { status: 500 }
    )
  }
}
