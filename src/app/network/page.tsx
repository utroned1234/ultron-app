'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Card from '@/components/ui/Card'
import BottomNav from '@/components/ui/BottomNav'

interface UserNetworkNode {
  id: string
  username: string
  full_name: string
  status: 'ACTIVO' | 'INACTIVO' | 'PENDIENTE'
  vip_packages: string[]
  referrals: UserNetworkNode[]
}

function NetworkNode({ user, level = 0 }: { user: UserNetworkNode; level?: number }) {
  const [expanded, setExpanded] = useState(true)

  const statusColor = {
    'ACTIVO': 'border-l-4 border-green-500 bg-green-500/10',
    'INACTIVO': 'border-l-4 border-red-500 bg-red-500/10',
    'PENDIENTE': 'border-l-4 border-yellow-500 bg-yellow-500/10',
  }[user.status] || 'border-l-4 border-gray-500'

  const statusTextColor = {
    'ACTIVO': 'text-green-500',
    'INACTIVO': 'text-red-500',
    'PENDIENTE': 'text-yellow-500',
  }[user.status] || 'text-gray-500'

  return (
    <div className="space-y-2">
      <div className={`p-4 rounded-lg ${statusColor} transition-all`} style={{ marginLeft: `${level * 20}px` }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h4 className="font-semibold text-text-primary">{user.full_name}</h4>
            <p className="text-sm text-text-secondary">@{user.username}</p>
            <p className={`text-sm font-semibold mt-1 ${statusTextColor}`}>{user.status}</p>
            {user.vip_packages.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {user.vip_packages.map((pkg) => (
                  <span key={pkg} className="px-2 py-1 bg-gold/20 text-gold text-xs rounded">
                    {pkg}
                  </span>
                ))}
              </div>
            )}
          </div>
          {user.referrals.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-2 py-1 text-xs bg-gold/20 text-gold rounded whitespace-nowrap"
            >
              {expanded ? '▼' : '▶'} {user.referrals.length}
            </button>
          )}
        </div>
      </div>

      {expanded && user.referrals.length > 0 && (
        <div className="space-y-2 border-l-2 border-text-secondary/30 ml-4">
          {user.referrals.map((referral) => (
            <NetworkNode key={referral.id} user={referral} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

function countReferrals(user: UserNetworkNode): number {
  return user.referrals.reduce((sum, ref) => sum + 1 + countReferrals(ref), 0)
}
