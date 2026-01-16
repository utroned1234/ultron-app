import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth/middleware'

export async function GET(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const items = await prisma.announcement.findMany({
      orderBy: { created_at: 'desc' },
    })
    return NextResponse.json(items)
  } catch (error) {
    console.error('Admin news error:', error)
    return NextResponse.json(
      { error: 'Error al cargar noticias' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const { title, body, is_active } = await req.json()
    if (!title || !body) {
      return NextResponse.json(
        { error: 'Título y contenido son requeridos' },
        { status: 400 }
      )
    }

    const item = await prisma.announcement.create({
      data: {
        title,
        body,
        is_active: is_active !== undefined ? !!is_active : true,
      },
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error('Admin news create error:', error)
    return NextResponse.json(
      {
        error:
          process.env.NODE_ENV === 'production'
            ? 'Error al crear noticia'
            : (error as Error)?.message || 'Error al crear noticia',
      },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const { id, title, body, is_active } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    const updateData: any = {}
    if (title !== undefined) updateData.title = title
    if (body !== undefined) updateData.body = body
    if (is_active !== undefined) updateData.is_active = is_active

    const item = await prisma.announcement.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(item)
  } catch (error) {
    console.error('Admin news update error:', error)
    return NextResponse.json(
      { error: 'Error al actualizar noticia' },
      { status: 500 }
    )
  }
}

export async function DELETE(req: NextRequest) {
  const authResult = requireAdmin(req)
  if ('error' in authResult) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'ID requerido' }, { status: 400 })
    }

    await prisma.announcement.delete({
      where: { id },
    })

    return NextResponse.json({ message: 'Noticia eliminada' })
  } catch (error) {
    console.error('Admin news delete error:', error)
    return NextResponse.json(
      { error: 'Error al eliminar noticia' },
      { status: 500 }
    )
  }
}
