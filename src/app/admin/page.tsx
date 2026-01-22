'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Image from 'next/image'
import ManualAdjustTab from '@/components/admin/ManualAdjustTab'
import ConfigTab from '@/components/admin/ConfigTab'
import { useToast } from '@/components/ui/Toast'

type Tab =
  | 'purchases'
  | 'withdrawals'
  | 'adjust'
  | 'active-users'
  | 'news'
  | 'config'
  | 'daily-profit'

interface Purchase {
  id: string
  user: {
    id: string
    username: string
    full_name: string
    email: string
  }
  vip_package: {
    name: string
    level: number
  }
  investment_bs: number
  receipt_url: string
  created_at: string
  status: 'PENDING' | 'ACTIVE' | 'REJECTED'
}

interface Withdrawal {
  id: string
  user: {
    username: string
    full_name: string
    email: string
  }
  amount_bs: number
  total_earnings_bs: number
  phone_number: string
  bank_name?: string
  account_number?: string
  payout_method?: string
  qr_image_url: string
  created_at: string
}

interface ActiveUser {
  user: {
    username: string
    full_name: string
    email: string
  }
  active_packages: {
    name: string
    level: number
    created_at: string | null
    activated_at: string | null
  }[]
  total_earnings_bs: number
}

interface Announcement {
  id: number
  title: string
  body: string
  is_active: boolean
  created_at: string
}

interface VipPackage {
  id: number
  level: number
  name: string
  investment_bs: number
  daily_profit_bs: number
  is_enabled: boolean
}

interface BonusRule {
  id: number
  level: number
  percentage: number
}

export default function AdminPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('purchases')
  const [purchases, setPurchases] = useState<Purchase[]>([])
  const [purchasesTotal, setPurchasesTotal] = useState(0)
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([])
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [newsTitle, setNewsTitle] = useState('')
  const [newsBody, setNewsBody] = useState('')
  const [newsActive, setNewsActive] = useState(true)
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [token, setToken] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState('')
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null)
  const [purchaseSearch, setPurchaseSearch] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const [dailyProfitStatus, setDailyProfitStatus] = useState<{
    already_run: boolean
    last_run_at: string | null
    next_unlock?: string
    processed?: number
    synced?: number
    payment_details?: Array<{
      user_code: string
      username: string
      full_name: string
      email: string
      vip_level: number
      balance_before: number
      amount_paid: number
      balance_after: number
      purchase_id: string
    }>
  } | null>(null)
  const pageSize = 30
  const [purchasesOffset, setPurchasesOffset] = useState(0)
  const [purchasesHasMore, setPurchasesHasMore] = useState(true)
  const [withdrawalsOffset, setWithdrawalsOffset] = useState(0)
  const [withdrawalsHasMore, setWithdrawalsHasMore] = useState(true)
  const [activeOffset, setActiveOffset] = useState(0)
  const [activeHasMore, setActiveHasMore] = useState(true)

  // Config states
  const [packages, setPackages] = useState<VipPackage[]>([])
  const [bonusRules, setBonusRules] = useState<BonusRule[]>([])
  const [configLoading, setConfigLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [adminVerified, setAdminVerified] = useState(false)
  const [adminChecking, setAdminChecking] = useState(true)

  useEffect(() => {
    // Get token only on client side
    if (typeof window !== 'undefined') {
      const cookieToken = document.cookie
        .split('; ')
        .find(row => row.startsWith('auth_token='))
        ?.split('=')[1] || ''
      setToken(cookieToken)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    if (tab === 'purchases') {
      setPurchases([])
      setPurchasesOffset(0)
      setPurchasesHasMore(true)
      fetchPurchases(0, false)
    } else if (tab === 'withdrawals') {
      setWithdrawals([])
      setWithdrawalsOffset(0)
      setWithdrawalsHasMore(true)
      fetchWithdrawals(0, false)
    } else if (tab === 'active-users') {
      setActiveUsers([])
      setActiveOffset(0)
      setActiveHasMore(true)
      fetchActiveUsers(0, false)
    } else if (tab === 'news') {
      fetchNews()
    }
  }, [tab, token])

  // Auto-refresh removido - El panel se actualiza al aprobar/rechazar compras

  useEffect(() => {
    if (token && tab === 'daily-profit') {
      fetchDailyProfitStatus()
    }
  }, [tab, token])

  useEffect(() => {
    if (token) {
      fetchConfigData()
    }
  }, [token])

  const getToken = () => {
    return token
  }

  const handleAuthRedirect = (status: number) => {
    if (status === 401) {
      router.push('/login')
      return
    }
    if (status === 403) {
      showToast('Acceso solo para administradores', 'error')
      router.push('/home')
    }
  }

  const fetchConfigData = async () => {
    setConfigLoading(true)
    setAdminChecking(true)
    try {
      const [pkgRes, bonusRes] = await Promise.all([
        fetch('/api/admin/vip-packages', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/admin/bonus-rules', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (pkgRes.status === 401 || pkgRes.status === 403) {
        handleAuthRedirect(pkgRes.status)
        return
      }
      if (bonusRes.status === 401 || bonusRes.status === 403) {
        handleAuthRedirect(bonusRes.status)
        return
      }

      if (pkgRes.ok || bonusRes.ok) {
        setAdminVerified(true)
      }
      if (pkgRes.ok) {
        const pkgData = await pkgRes.json()
        setPackages(pkgData)
      }
      if (bonusRes.ok) {
        const bonusData = await bonusRes.json()
        setBonusRules(bonusData)
      }
    } catch (error) {
      console.error('Error fetching config:', error)
    } finally {
      setConfigLoading(false)
      setAdminChecking(false)
    }
  }

  const updatePackage = async (pkg: VipPackage) => {
    setSaving(`pkg-${pkg.id}`)
    try {
      const res = await fetch('/api/admin/vip-packages', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(pkg),
      })

      if (res.ok) {
        showToast('Paquete actualizado correctamente', 'success')
        fetchConfigData()
      } else {
        showToast('Error al actualizar', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setSaving(null)
    }
  }

  const updateBonus = async (rule: BonusRule) => {
    setSaving(`bonus-${rule.id}`)
    try {
      const res = await fetch('/api/admin/bonus-rules', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(rule),
      })

      if (res.ok) {
        showToast('Bono actualizado correctamente. Aplica a todos los usuarios.', 'success')
        fetchConfigData()
      } else {
        showToast('Error al actualizar', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setSaving(null)
    }
  }

  const updatePackageField = (pkgId: number, field: keyof VipPackage, value: any) => {
    setPackages(packages.map(p =>
      p.id === pkgId ? { ...p, [field]: value } : p
    ))
  }

  const updateBonusField = (ruleId: number, field: keyof BonusRule, value: any) => {
    setBonusRules(bonusRules.map(r =>
      r.id === ruleId ? { ...r, [field]: value } : r
    ))
  }

  const fetchPurchases = async (offset = 0, append = false) => {
    setLoading(!append)
    setLoadingMore(append)
    setErrorMessage('')
    try {
      const token = getToken()
      if (!token) {
        router.push('/login')
        return
      }
      const res = await fetch(`/api/admin/purchases?limit=${pageSize}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401 || res.status === 403) {
        handleAuthRedirect(res.status)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMessage(data?.error || 'Error al cargar compras')
        setPurchases([])
        setPurchasesTotal(0)
      } else {
        const data = await res.json()
        const items = data.purchases || []
        setPurchases((prev) => (append ? [...prev, ...items] : items))
        setPurchasesTotal(data.total_investment_bs || 0)
        setPurchasesHasMore(Boolean(data.has_more))
        setPurchasesOffset(data.next_offset || 0)
      }
    } catch (error) {
      console.error('Fetch error:', error)
      setErrorMessage('Error de conexión')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const fetchWithdrawals = async (offset = 0, append = false) => {
    setLoading(!append)
    setLoadingMore(append)
    setErrorMessage('')
    try {
      const token = getToken()
      if (!token) {
        router.push('/login')
        return
      }
      const res = await fetch(`/api/admin/withdrawals?limit=${pageSize}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401 || res.status === 403) {
        handleAuthRedirect(res.status)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMessage(data?.error || 'Error al cargar retiros')
        setWithdrawals([])
      } else {
        const data = await res.json()
        const items = data.withdrawals || []
        setWithdrawals((prev) => (append ? [...prev, ...items] : items))
        setWithdrawalsHasMore(Boolean(data.has_more))
        setWithdrawalsOffset(data.next_offset || 0)
      }
    } catch (error) {
      console.error('Fetch error:', error)
      setErrorMessage('Error de conexión')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const fetchActiveUsers = async (offset = 0, append = false) => {
    setLoading(!append)
    setLoadingMore(append)
    setErrorMessage('')
    try {
      const token = getToken()
      if (!token) {
        router.push('/login')
        return
      }
      const res = await fetch(`/api/admin/active-users?limit=${pageSize}&offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401 || res.status === 403) {
        handleAuthRedirect(res.status)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMessage(data?.error || 'Error al cargar usuarios activos')
        setActiveUsers([])
      } else {
        const data = await res.json()
        const items = data.users || []
        setActiveUsers((prev) => (append ? [...prev, ...items] : items))
        setActiveHasMore(Boolean(data.has_more))
        setActiveOffset(data.next_offset || 0)
      }
    } catch (error) {
      console.error('Fetch error:', error)
      setErrorMessage('Error de conexión')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const fetchNews = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const token = getToken()
      if (!token) {
        router.push('/login')
        return
      }
      const res = await fetch('/api/admin/news', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401 || res.status === 403) {
        handleAuthRedirect(res.status)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setErrorMessage(data?.error || 'Error al cargar noticias')
        setAnnouncements([])
      } else {
        const data = await res.json()
        setAnnouncements(data)
      }
    } catch (error) {
      console.error('Fetch error:', error)
      setErrorMessage('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const fetchDailyProfitStatus = async () => {
    try {
      const res = await fetch('/api/admin/run-daily-profit', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setDailyProfitStatus({
          already_run: !!data.already_run,
          last_run_at: data.last_run_at || null,
          next_unlock: data.next_unlock,
          payment_details: data.payment_details || [],
        })
      }
    } catch (error) {
      console.error('Error fetching daily profit status:', error)
    }
  }

  const handleApprovePurchase = async (id: string) => {
    if (!confirm('¿Activar esta compra?')) return

    setProcessing(true)
    try {
      const token = getToken()
      const res = await fetch(`/api/admin/purchases/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        showToast('Compra aprobada exitosamente', 'success')
        fetchPurchases(0, false)
      } else {
        const data = await res.json()
        showToast(data.error || 'Error al aprobar', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setProcessing(false)
    }
  }

  const handleRejectPurchase = async (id: string) => {
    if (!confirm('¿Rechazar esta compra? El usuario podrá volver a solicitar este paquete.')) return

    setProcessing(true)
    try {
      const token = getToken()
      const res = await fetch(`/api/admin/purchases/${id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        showToast('Compra rechazada - Usuario puede solicitar nuevamente', 'info')
        fetchPurchases(0, false)
      } else {
        showToast('Error al rechazar', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setProcessing(false)
    }
  }

  const handlePayWithdrawal = async (id: string) => {
    if (!confirm('¿Marcar como pagado?')) return

    setProcessing(true)
    try {
      const token = getToken()
      const res = await fetch(`/api/admin/withdrawals/${id}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        showToast('Retiro marcado como pagado', 'success')
        fetchWithdrawals(0, false)
      } else {
        showToast('Error al procesar', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setProcessing(false)
    }
  }

  const handleRejectWithdrawal = async (id: string) => {
    if (!confirm('¿Rechazar este retiro? Los fondos serán devueltos al usuario.')) return

    setProcessing(true)
    try {
      const token = getToken()
      const res = await fetch(`/api/admin/withdrawals/${id}/reject`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        showToast('Retiro rechazado - Fondos devueltos al usuario', 'info')
        fetchWithdrawals(0, false)
      } else {
        showToast('Error al rechazar', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setProcessing(false)
    }
  }

  const adminTabs = [
    { key: 'purchases' as const, label: 'Billetera', icon: '👛' },
    { key: 'withdrawals' as const, label: 'Retiros', icon: '💰' },
    { key: 'adjust' as const, label: 'Ajustes', icon: '🛠️' },
    { key: 'active-users' as const, label: 'Activos', icon: '✅' },
    { key: 'config' as const, label: 'Ganancias', icon: '📈' },
    { key: 'daily-profit' as const, label: 'Diarias', icon: '⏱️' },
    { key: 'news' as const, label: 'Noticias', icon: '📰' },
  ]

  const handleRunDailyProfit = async () => {
    if (!confirm('¿Actualizar ganancias diarias ahora?')) return

    setProcessing(true)
    try {
      const token = getToken()
      const res = await fetch('/api/admin/run-daily-profit', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (res.ok) {
        const data = await res.json().catch(() => null)
        if (data?.already_run) {
          const nextUnlockDate = data.next_unlock ? new Date(data.next_unlock) : null
          const unlockMsg = nextUnlockDate
            ? ` Disponible a la 1:00 AM (Bolivia)`
            : ''
          showToast(`Ganancias ya actualizadas.${unlockMsg}`, 'info')
        } else {
          showToast(
            `✅ Ganancias procesadas: ${data?.processed ?? 0} usuarios | Sincronizados: ${data?.synced ?? 0}`,
            'success'
          )
        }
        setDailyProfitStatus({
          already_run: !!data?.already_run,
          last_run_at: data?.last_run_at || null,
          next_unlock: data?.next_unlock,
          processed: data?.processed,
          synced: data?.synced,
          payment_details: data?.payment_details || [],
        })
      } else {
        showToast('Error al procesar ganancias', 'error')
      }
    } catch (error) {
      showToast('Error de conexión', 'error')
    } finally {
      setProcessing(false)
    }
  }

  const handleCreateNews = async () => {
    if (!newsTitle || !newsBody) {
      setErrorMessage('Título y contenido son requeridos')
      return
    }

    setProcessing(true)
    try {
      const token = getToken()
      const res = await fetch('/api/admin/news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: newsTitle,
          body: newsBody,
          is_active: newsActive,
        }),
      })

      if (res.ok) {
        setNewsTitle('')
        setNewsBody('')
        setNewsActive(true)
        fetchNews()
      } else {
        const data = await res.json().catch(() => null)
        setErrorMessage(data?.error || 'Error al crear noticia')
      }
    } catch (error) {
      setErrorMessage('Error de conexión')
    } finally {
      setProcessing(false)
    }
  }

  const purchasedNamesByUser = purchases.reduce((acc, purchase) => {
    const list = acc[purchase.user.id] || []
    if (!list.includes(purchase.vip_package.name)) {
      list.push(purchase.vip_package.name)
    }
    acc[purchase.user.id] = list
    return acc
  }, {} as Record<string, string[]>)

  const purchasesUsersList = purchases.reduce((acc, purchase) => {
    if (!acc.some((item) => item.user.id === purchase.user.id)) {
      acc.push(purchase)
    }
    return acc
  }, [] as Purchase[])

  const filteredActiveUsersList = purchaseSearch.trim()
    ? purchasesUsersList.filter((purchase) => {
        const query = purchaseSearch.trim().toLowerCase()
        return (
          purchase.user.username.toLowerCase().includes(query) ||
          purchase.user.full_name.toLowerCase().includes(query) ||
          purchase.user.email.toLowerCase().includes(query)
        )
      })
    : purchasesUsersList

  const filteredActiveUsers = activeSearch.trim()
    ? activeUsers.filter((entry) => {
        const query = activeSearch.trim().toLowerCase()
        return (
          entry.user.username.toLowerCase().includes(query) ||
          entry.user.full_name.toLowerCase().includes(query)
        )
      })
    : activeUsers

  if (!token || adminChecking || !adminVerified) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card glassEffect>
          <p className="text-center text-text-secondary">
            Verificando acceso de administrador...
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 pb-24">
      <div className="max-w-screen-xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gold gold-glow">Panel Admin</h1>
          <p className="mt-2 text-text-secondary uppercase tracking-wider text-sm font-light">
            GESTIÓN DEL SISTEMA
          </p>
        </div>

        {loading ? (
          <p className="text-center text-gold">Cargando...</p>
        ) : (
          <>
            {errorMessage && (
              <Card>
                <p className="text-center text-red-500">{errorMessage}</p>
              </Card>
            )}
            {tab === 'purchases' && (
              <div className="space-y-4">
                <Card glassEffect>
                  <div className="flex justify-between items-center">
                    <span className="text-text-secondary uppercase tracking-wider text-sm">
                      Total de inversiones sumadas
                    </span>
                    <span className="text-2xl font-bold text-gold">
                      Bs {purchasesTotal.toFixed(2)}
                    </span>
                  </div>
                </Card>
                <Card glassEffect>
                  <div className="space-y-3">
                    <Input
                      label="Buscar usuario"
                      type="text"
                      value={purchaseSearch}
                      onChange={(e) => setPurchaseSearch(e.target.value)}
                      placeholder="Nombre o usuario"
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setPurchaseSearch((value) => value.trim())}
                    >
                      Buscar
                    </Button>
                  </div>
                </Card>
                {filteredActiveUsersList.length === 0 ? (
                  <Card>
                    <p className="text-center text-text-secondary">
                      No hay usuarios activos
                    </p>
                  </Card>
                ) : (
                  filteredActiveUsersList.map((p) => (
                    <Card key={p.id} glassEffect>
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <div>
                            <h3 className="text-xl font-bold text-gold">
                              {p.user.username}
                            </h3>
                            <p className="text-sm text-text-secondary">
                              {p.user.full_name}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            className="text-xs px-3 py-1"
                            onClick={() =>
                              setExpandedUserId(
                                expandedUserId === p.user.id ? null : p.user.id
                              )
                            }
                          >
                            Ver pak comprados
                          </Button>
                        </div>
                        {expandedUserId === p.user.id && (
                          <div className="border-t border-gold border-opacity-20 pt-4 space-y-4">
                            {purchases
                              .filter((item) => item.user.id === p.user.id)
                              .map((item) => (
                                <div key={item.id} className="space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-text-secondary">
                                      {item.vip_package.name}
                                    </span>
                                    <span
                                      className={`text-xs ${
                                        item.status === 'ACTIVE'
                                          ? 'text-green-500'
                                          : item.status === 'REJECTED'
                                            ? 'text-red-500'
                                            : 'text-yellow-500'
                                      }`}
                                    >
                                      {item.status === 'ACTIVE'
                                        ? 'ACTIVO'
                                        : item.status === 'REJECTED'
                                          ? 'RECHAZADO'
                                          : 'PENDIENTE'}
                                    </span>
                                  </div>

                                  <div className="bg-dark-card bg-opacity-50 rounded p-2 space-y-1">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-text-secondary uppercase tracking-wider">Correo:</span>
                                      <span className="text-gold">{p.user.email}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-text-secondary uppercase tracking-wider">Fecha de solicitud:</span>
                                      <span className="text-gold">
                                        {new Date(item.created_at).toLocaleString('es-ES', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                          second: '2-digit'
                                        })}
                                      </span>
                                    </div>
                                  </div>

                                  {item.receipt_url ? (
                                    <div className="w-full h-56 bg-dark-card rounded-card overflow-hidden">
                                      <img
                                        src={item.receipt_url}
                                        alt="Comprobante"
                                        className="w-full h-full object-contain"
                                        loading="lazy"
                                      />
                                    </div>
                                  ) : (
                                    <div className="w-full h-56 bg-dark-card rounded-card flex items-center justify-center">
                                      <p className="text-text-secondary text-sm">
                                        Comprobante no disponible
                                      </p>
                                    </div>
                                  )}

                                  <div className="flex gap-2">
                                    <Button
                                      variant="primary"
                                      className="flex-1"
                                      onClick={() => handleApprovePurchase(item.id)}
                                      disabled={processing}
                                    >
                                      Activar
                                    </Button>
                                    <Button
                                      variant="outline"
                                      className="flex-1"
                                      onClick={() => handleRejectPurchase(item.id)}
                                      disabled={processing}
                                    >
                                      Rechazar
                                    </Button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </Card>
                  ))
                )}
                {purchasesHasMore && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fetchPurchases(purchasesOffset, true)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Cargando...' : 'Cargar mas'}
                  </Button>
                )}
              </div>
            )}

            {tab === 'withdrawals' && (
              <div className="space-y-4">
                {withdrawals.length === 0 ? (
                  <Card>
                    <p className="text-center text-text-secondary">
                      No hay solicitudes de retiro
                    </p>
                  </Card>
                ) : (
                  withdrawals.map((w) => (
                    <Card key={w.id} glassEffect>
                      <div className="space-y-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-xl font-bold text-text-primary">
                              {w.user.full_name}
                            </h3>
                            <p className="text-text-secondary">@{w.user.username}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-text-secondary uppercase tracking-wider">Monto solicitado</p>
                            <p className="text-xl font-bold text-gold">
                              Bs {w.amount_bs.toFixed(2)}
                            </p>
                            <div className="mt-2 text-[10px] text-text-secondary space-y-1">
                              <div>
                                <span className="uppercase tracking-wider">Telefono:</span> {w.phone_number || 'No registrado'}
                              </div>
                              <div>
                                <span className="uppercase tracking-wider">Banco:</span> {w.bank_name || 'No registrado'}
                              </div>
                              <div>
                                <span className="uppercase tracking-wider">Cuenta:</span> {w.account_number || 'No registrado'}
                              </div>
                              <div>
                                <span className="uppercase tracking-wider">Modo:</span> {w.payout_method || 'No registrado'}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="bg-dark-card bg-opacity-50 rounded p-2 space-y-1">
                          <div className="flex justify-between text-[10px]">
                            <span className="text-text-secondary uppercase tracking-wider">Correo:</span>
                            <span className="text-gold">{w.user.email}</span>
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span className="text-text-secondary uppercase tracking-wider">Fecha de solicitud:</span>
                            <span className="text-gold">
                              {new Date(w.created_at).toLocaleString('es-ES', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            variant="primary"
                            className="flex-1"
                            onClick={() => handlePayWithdrawal(w.id)}
                            disabled={processing}
                          >
                            Marcar Pagado
                          </Button>
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => handleRejectWithdrawal(w.id)}
                            disabled={processing}
                          >
                            Rechazar
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
                {withdrawalsHasMore && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fetchWithdrawals(withdrawalsOffset, true)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Cargando...' : 'Cargar mas'}
                  </Button>
                )}
              </div>
            )}

            {tab === 'adjust' && <ManualAdjustTab token={token} />}

            {tab === 'config' && <ConfigTab token={token} />}

            {tab === 'daily-profit' && (
              <div className="space-y-4">
                <Card glassEffect>
                  <div className="space-y-4 text-center">
                    <h2 className="text-2xl font-bold text-gold">Actualizar Ganancias Diarias</h2>
                    <p className="text-sm text-text-secondary">
                      Aplica las ganancias diarias a todos los usuarios con VIP activo. Usa el porcentaje actual de cada paquete.
                    </p>

                    {dailyProfitStatus?.already_run && (
                      <div className="bg-green-500 bg-opacity-10 border border-green-500 border-opacity-30 rounded-lg p-4">
                        <p className="text-sm text-green-400 font-bold mb-2">
                          ✅ Ganancias diarias ya actualizadas
                        </p>
                        {dailyProfitStatus.next_unlock && (
                          <p className="text-xs text-text-secondary">
                            Próxima ejecución disponible: <span className="text-gold font-bold">1:00 AM (Bolivia)</span>
                          </p>
                        )}
                      </div>
                    )}

                    {dailyProfitStatus?.last_run_at && (
                      <div className="text-xs text-text-secondary space-y-1">
                        <p>
                          📅 Última actualización: <span className="text-gold">{new Date(dailyProfitStatus.last_run_at).toLocaleString('es-ES', { timeZone: 'America/La_Paz' })}</span>
                        </p>
                        {(dailyProfitStatus.processed !== undefined || dailyProfitStatus.synced !== undefined) && (
                          <div className="flex items-center justify-center gap-4 mt-2 text-sm">
                            {dailyProfitStatus.processed !== undefined && (
                              <span className="text-green-400">
                                👥 Procesados: <strong>{dailyProfitStatus.processed}</strong>
                              </span>
                            )}
                            {dailyProfitStatus.synced !== undefined && (
                              <span className="text-blue-400">
                                🔄 Sincronizados: <strong>{dailyProfitStatus.synced}</strong>
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={handleRunDailyProfit}
                      disabled={processing || dailyProfitStatus?.already_run}
                    >
                      {processing
                        ? 'Procesando...'
                        : dailyProfitStatus?.already_run
                        ? '🔒 Ya ejecutado hoy'
                        : '▶️ Actualizar Ganancias Diarias'}
                    </Button>
                  </div>
                </Card>

                <Card className="bg-dark-bg">
                  <div className="text-sm text-text-secondary space-y-2">
                    <p className="text-gold font-bold mb-3">ℹ️ Información del Proceso</p>
                    <p>• Solo se procesan usuarios con VIP activo</p>
                    <p>• Cada usuario recibe la ganancia diaria según su paquete VIP</p>
                    <p>• El proceso se ejecuta manualmente por el administrador</p>
                    <p>• Una vez ejecutado, se bloquea hasta la 1:00 AM (hora Bolivia)</p>
                    <p>• <strong className="text-gold">Procesados:</strong> Usuarios que recibieron ganancias diarias</p>
                    <p>• <strong className="text-blue-400">Sincronizados:</strong> Compras cuya ganancia se actualizó al paquete VIP</p>
                  </div>
                </Card>

                {dailyProfitStatus?.payment_details && dailyProfitStatus.payment_details.length > 0 && (
                  <Card glassEffect>
                    <h3 className="text-xl font-bold text-gold mb-4">
                      💰 Detalles de Pagos Procesados ({dailyProfitStatus.payment_details.length})
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gold border-opacity-30">
                            <th className="text-left py-3 px-2 text-gold font-bold uppercase text-xs">Código</th>
                            <th className="text-left py-3 px-2 text-gold font-bold uppercase text-xs">Usuario</th>
                            <th className="text-left py-3 px-2 text-gold font-bold uppercase text-xs">Nombre</th>
                            <th className="text-center py-3 px-2 text-gold font-bold uppercase text-xs">VIP</th>
                            <th className="text-right py-3 px-2 text-gold font-bold uppercase text-xs">Balance Antes</th>
                            <th className="text-right py-3 px-2 text-gold font-bold uppercase text-xs">Monto Pagado</th>
                            <th className="text-right py-3 px-2 text-gold font-bold uppercase text-xs">Balance Después</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dailyProfitStatus.payment_details.map((payment, index) => (
                            <tr
                              key={payment.purchase_id}
                              className={`border-b border-gold border-opacity-10 ${index % 2 === 0 ? 'bg-gold bg-opacity-5' : ''}`}
                            >
                              <td className="py-3 px-2 text-text-secondary font-mono text-xs">{payment.user_code}</td>
                              <td className="py-3 px-2 text-text-primary font-medium">{payment.username}</td>
                              <td className="py-3 px-2 text-text-secondary">{payment.full_name}</td>
                              <td className="py-3 px-2 text-center">
                                <span className="inline-block bg-gold bg-opacity-20 text-gold-bright px-2 py-1 rounded font-bold text-xs">
                                  VIP {payment.vip_level}
                                </span>
                              </td>
                              <td className="py-3 px-2 text-right text-text-secondary font-mono">
                                Bs {payment.balance_before.toFixed(2)}
                              </td>
                              <td className="py-3 px-2 text-right font-bold text-green-400 font-mono">
                                + Bs {payment.amount_paid.toFixed(2)}
                              </td>
                              <td className="py-3 px-2 text-right text-gold-bright font-bold font-mono">
                                Bs {payment.balance_after.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-gold border-opacity-50 bg-gold bg-opacity-10">
                            <td colSpan={5} className="py-3 px-2 text-right font-bold text-gold uppercase text-sm">
                              Total Pagado:
                            </td>
                            <td className="py-3 px-2 text-right font-bold text-gold-bright text-lg font-mono">
                              Bs {dailyProfitStatus.payment_details.reduce((sum, p) => sum + p.amount_paid, 0).toFixed(2)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </Card>
                )}
              </div>
            )}

            {tab === 'active-users' && (
              <div className="space-y-4">
                <Card glassEffect>
                  <div className="space-y-2">
                    <Input
                      label="Buscar usuario"
                      type="text"
                      value={activeSearch}
                      onChange={(e) => setActiveSearch(e.target.value)}
                      placeholder="Usuario o nombre"
                    />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setActiveSearch((value) => value.trim())}
                    >
                      Buscar
                    </Button>
                  </div>
                </Card>
                {filteredActiveUsers.length === 0 ? (
                  <Card>
                    <p className="text-center text-text-secondary">
                      No hay usuarios activos
                    </p>
                  </Card>
                ) : (
                  filteredActiveUsers.map((entry) => (
                    <Card key={entry.user.username} glassEffect className="p-2">
                      <div className="space-y-2 text-[9px]">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-xs font-bold text-gold">
                              {entry.user.full_name}
                            </h3>
                            <p className="text-text-secondary">@{entry.user.username}</p>
                            <p className="text-text-secondary">{entry.user.email}</p>
                          </div>
                        </div>

                        {/* Paquetes VIP con fechas */}
                        <div className="space-y-1">
                          {entry.active_packages.map((pkg, idx) => (
                            <div key={idx} className="bg-dark-card bg-opacity-50 rounded p-1.5 space-y-0.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-gold">{pkg.name}</span>
                                <span className="text-[8px] text-text-secondary">· Nivel {pkg.level}</span>
                              </div>
                              <div className="text-[7px] text-text-secondary">
                                <div>
                                  Solicitado: {pkg.created_at
                                    ? new Date(pkg.created_at).toLocaleString('es-ES', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })
                                    : 'N/A'}
                                </div>
                                <div>
                                  Activado: {pkg.activated_at
                                    ? new Date(pkg.activated_at).toLocaleString('es-ES', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })
                                    : 'N/A'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="border-t border-gold border-opacity-20 pt-1">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Ganancias totales:</span>
                            <span className="font-bold text-gold-bright">
                              Bs {entry.total_earnings_bs.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))
                )}
                {activeHasMore && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fetchActiveUsers(activeOffset, true)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? 'Cargando...' : 'Cargar mas'}
                  </Button>
                )}
              </div>
            )}

            {tab === 'news' && (
              <div className="space-y-4">
                <Card glassEffect>
                  <div className="space-y-4">
                    <h2 className="text-xl font-bold text-gold">📰 Crear Nueva Noticia</h2>
                    <Input
                      label="Título"
                      type="text"
                      value={newsTitle}
                      onChange={(e) => setNewsTitle(e.target.value)}
                      placeholder="Título de la noticia"
                      required
                    />
                    <div>
                      <label className="block text-sm text-text-secondary uppercase tracking-wider font-light mb-3">
                        Contenido
                      </label>
                      <textarea
                        value={newsBody}
                        onChange={(e) => setNewsBody(e.target.value)}
                        className="w-full min-h-[120px] px-4 py-3 bg-dark-card border border-gold border-opacity-30 rounded-btn text-text-primary focus:outline-none focus:border-gold transition-all"
                        placeholder="Escribe la noticia"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-text-secondary">
                      <input
                        type="checkbox"
                        checked={newsActive}
                        onChange={(e) => setNewsActive(e.target.checked)}
                        className="w-4 h-4 accent-gold"
                      />
                      Mostrar en Home (usuarios verán esta noticia)
                    </label>
                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={handleCreateNews}
                      disabled={processing}
                    >
                      {processing ? 'Guardando...' : '✅ Publicar Noticia'}
                    </Button>
                  </div>
                </Card>

                <div className="border-t border-gold border-opacity-20 pt-4">
                  <h3 className="text-lg font-bold text-gold mb-3">📋 Noticias Publicadas</h3>
                  {announcements.length === 0 ? (
                    <Card>
                      <p className="text-center text-text-secondary">
                        No hay noticias publicadas
                      </p>
                    </Card>
                  ) : (
                    announcements.map((item) => (
                      <Card key={item.id} glassEffect className="mb-3">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <h4 className="text-text-primary font-bold text-lg">{item.title}</h4>
                              <p className="text-xs text-text-secondary mt-1">
                                📅 {new Date(item.created_at).toLocaleString('es-ES', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </p>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                              item.is_active
                                ? 'bg-green-500 bg-opacity-20 text-green-400 border border-green-500 border-opacity-30'
                                : 'bg-red-500 bg-opacity-20 text-red-400 border border-red-500 border-opacity-30'
                            }`}>
                              {item.is_active ? '✓ Visible' : '✗ Oculta'}
                            </div>
                          </div>

                          <p className="text-sm text-text-secondary whitespace-pre-wrap">{item.body}</p>

                          <div className="flex gap-2">
                            <Button
                              variant={item.is_active ? 'outline' : 'primary'}
                              className="flex-1"
                              onClick={async () => {
                                setProcessing(true)
                                try {
                                  const token = getToken()
                                  const res = await fetch('/api/admin/news', {
                                    method: 'PUT',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({
                                      id: item.id,
                                      is_active: !item.is_active
                                    }),
                                  })
                                  if (res.ok) {
                                    showToast(
                                      item.is_active ? 'Noticia ocultada' : 'Noticia visible',
                                      'success'
                                    )
                                    fetchNews()
                                  } else {
                                    const data = await res.json().catch(() => null)
                                    showToast(data?.error || 'Error al actualizar', 'error')
                                  }
                                } catch (error) {
                                  showToast('Error de conexión', 'error')
                                } finally {
                                  setProcessing(false)
                                }
                              }}
                              disabled={processing}
                            >
                              {item.is_active ? '👁️ Ocultar' : '👁️ Mostrar'}
                            </Button>
                            <Button
                              variant="outline"
                              className="flex-1 text-red-400 border-red-500"
                              onClick={async () => {
                                if (!confirm('¿Eliminar esta noticia permanentemente?')) return
                                setProcessing(true)
                                try {
                                  const token = getToken()
                                  const res = await fetch('/api/admin/news', {
                                    method: 'DELETE',
                                    headers: {
                                      'Content-Type': 'application/json',
                                      Authorization: `Bearer ${token}`,
                                    },
                                    body: JSON.stringify({ id: item.id }),
                                  })
                                  if (res.ok) {
                                    showToast('Noticia eliminada', 'success')
                                    fetchNews()
                                  } else {
                                    const data = await res.json().catch(() => null)
                                    showToast(data?.error || 'Error al eliminar', 'error')
                                  }
                                } catch (error) {
                                  showToast('Error de conexión', 'error')
                                } finally {
                                  setProcessing(false)
                                }
                              }}
                              disabled={processing}
                            >
                              🗑️ Eliminar
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Configuración del Sistema removida por solicitud */}
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-dark-card border-t border-gold border-opacity-20 z-50">
        <div className="flex justify-around items-center h-16 max-w-screen-xl mx-auto px-4">
          {adminTabs.map((item) => {
            const isActive = tab === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                  isActive
                    ? 'text-gold'
                    : 'text-text-secondary hover:text-gold'
                }`}
              >
                <span className="text-2xl mb-1">{item.icon}</span>
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
