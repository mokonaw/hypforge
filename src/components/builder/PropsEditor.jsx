import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Renders a dynamic key/value editor for blueprint props
// propsData: { key: defaultValue, ... }
// values: { key: currentValue, ... }
export default function PropsEditor({ propsData, values, onChange }) {
  if (!propsData || Object.keys(propsData).length === 0) return null

  const set = (k, v) => onChange({ ...values, [k]: v })

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground">
        Ces paramètres seront accessibles via <code className="text-foreground">props.xxx</code> dans le script et configurables dans Hyperfy.
      </div>
      {Object.entries(propsData).map(([key, defaultVal]) => (
        <div key={key}>
          <Label htmlFor={`prop-${key}`} className="font-mono text-xs text-primary">
            props.{key}
          </Label>
          <Input
            id={`prop-${key}`}
            value={values[key] ?? defaultVal}
            onChange={e => set(key, e.target.value)}
            placeholder={String(defaultVal)}
            className="mt-1.5"
          />
        </div>
      ))}
    </div>
  )
}