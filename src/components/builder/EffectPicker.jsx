import React from 'react'
import {
  RefreshCw, Waves, CircleDot, Orbit, MousePointerClick, Palette, Eye, Zap, Sparkles, Code2,
} from 'lucide-react'
import { EFFECTS } from '@/lib/effects'
import { cn } from '@/lib/utils'

const ICONS = {
  RefreshCw, Waves, CircleDot, Orbit, MousePointerClick, Palette, Eye, Zap, Sparkles, Code2,
}

export default function EffectPicker({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {EFFECTS.map(eff => {
        const Icon = ICONS[eff.icon] || Sparkles
        const active = value === eff.id
        return (
          <button
            key={eff.id}
            type="button"
            onClick={() => onChange(eff.id)}
            className={cn(
              'group relative text-left rounded-xl border p-4 transition-all',
              active
                ? 'border-primary bg-primary/5 shadow-[0_0_30px_-10px_hsl(var(--primary))]'
                : 'border-border bg-card/40 hover:border-border hover:bg-secondary/30'
            )}
          >
            <div className="flex items-center gap-2.5 mb-2">
              <div className={cn(
                'w-8 h-8 rounded-lg grid place-items-center transition-colors',
                active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
              )}>
                <Icon className="w-4 h-4" strokeWidth={1.75} />
              </div>
              <div className="font-medium text-sm">{eff.name}</div>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              {eff.description}
            </div>
          </button>
        )
      })}
    </div>
  )
}