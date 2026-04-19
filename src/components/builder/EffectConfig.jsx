import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

export default function EffectConfig({ effect, params, onChange, customScript, onCustomScriptChange }) {
  const set = (k, v) => onChange({ ...params, [k]: v })

  if (effect.id === 'custom') {
    return (
      <div>
        <Label htmlFor="custom-script">Script Hyperfy (index.js)</Label>
        <Textarea
          id="custom-script"
          value={customScript}
          onChange={e => onCustomScriptChange(e.target.value)}
          rows={14}
          className="mt-1.5 font-mono text-xs resize-none"
          spellCheck={false}
        />
        <p className="text-xs text-muted-foreground mt-2">
          Variables disponibles dans le runtime Hyperfy : <code>app</code>, <code>world</code>, <code>props</code>, <code>fetch</code>, <code>num</code>, <code>setTimeout</code>.
        </p>
      </div>
    )
  }

  if (!effect.params.length) {
    return (
      <p className="text-sm text-muted-foreground italic">
        Cet effet n'a pas de paramètres configurables.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      {effect.params.map(p => (
        <div key={p.key}>
          <Label htmlFor={p.key}>{p.label}</Label>
          <div className="mt-1.5">
            {p.type === 'number' && (
              <Input
                id={p.key}
                type="number"
                value={params[p.key] ?? p.default}
                min={p.min}
                max={p.max}
                step={p.step ?? 0.1}
                onChange={e => set(p.key, e.target.value === '' ? '' : Number(e.target.value))}
              />
            )}
            {p.type === 'text' && (
              <Input
                id={p.key}
                value={params[p.key] ?? p.default}
                onChange={e => set(p.key, e.target.value)}
              />
            )}
            {p.type === 'boolean' && (
              <div className="flex items-center gap-3 h-10">
                <Switch
                  id={p.key}
                  checked={!!(params[p.key] ?? p.default)}
                  onCheckedChange={v => set(p.key, v)}
                />
                <span className="text-sm text-muted-foreground">
                  {(params[p.key] ?? p.default) ? 'Activé' : 'Désactivé'}
                </span>
              </div>
            )}
            {p.type === 'select' && (
              <Select
                value={String(params[p.key] ?? p.default)}
                onValueChange={v => set(p.key, v)}
              >
                <SelectTrigger id={p.key}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {p.options.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}