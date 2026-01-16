'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'

interface UserNetworkNode {
  id: string
  username: string
  full_name: string
  status: 'ACTIVO' | 'INACTIVO' | 'PENDIENTE'
  vip_packages: string[]
  referrals: UserNetworkNode[]
}

interface NetworkTreeProps {
  user: UserNetworkNode
  level?: number
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'ACTIVO':
      return 'border-l-4 border-green-500 bg-green-500/10'
    case 'INACTIVO':
      return 'border-l-4 border-red-500 bg-red-500/10'
    case 'PENDIENTE':
      return 'border-l-4 border-yellow-500 bg-yellow-500/10'
    default:
      return 'border-l-4 border-gray-500'
  }
}

const getStatusTextColor = (status: string) => {
  switch (status) {
    case 'ACTIVO':
      return 'text-green-500'
    case 'INACTIVO':
      return 'text-red-500'
    case 'PENDIENTE':
      return 'text-yellow-500'
    default:
      return 'text-gray-500'
  }
}

function NetworkNode({ user, level = 0 }: NetworkTreeProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="space-y-2">
      <div
        className={`p-4 rounded-lg ${getStatusColor(user.status)} transition-all`}
        style={{ marginLeft: `${level * 20}px` }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h4 className="font-semibold text-text-primary">{user.full_name}</h4>
            <p className="text-sm text-text-secondary">@{user.username}</p>
            <p className={`text-sm font-semibold mt-1 ${getStatusTextColor(user.status)}`}>
              {user.status}
            </p>
            {user.vip_packages.length > 0 && (
              <div className="mt-2">
                <p className="text-xs text-text-secondary">Paquetes VIP:</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {user.vip_packages.map((pkg) => (
                    <span
                      key={pkg}
                      className="px-2 py-1 bg-gold/20 text-gold text-xs rounded"
                    >
                      {pkg}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {user.referrals.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-3 py-1 text-xs bg-gold/20 text-gold rounded hover:bg-gold/30 transition-colors"
            >
              {expanded ? '▼' : '▶'} ({user.referrals.length})
            </button>
          )}
        </div>
      </div>

      {expanded && user.referrals.length > 0 && (
        <div className="space-y-2 border-l-2 border-text-secondary/30 ml-4 pl-0">
          {user.referrals.map((referral) => (
            <NetworkNode key={referral.id} user={referral} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

interface UserNetworkViewProps {
  user: UserNetworkNode
}

export function UserNetworkView({ user }: UserNetworkViewProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold text-gold mb-2">Red de {user.full_name}</h3>
        <p className="text-sm text-text-secondary mb-4">
          Total de referidos: {countTotalReferrals(user)}
        </p>
      </div>
      <NetworkNode user={user} level={0} />
    </div>
  )
}

function countTotalReferrals(user: UserNetworkNode): number {
  return user.referrals.reduce(
    (total, referral) => total + 1 + countTotalReferrals(referral),
    0
  )
}
