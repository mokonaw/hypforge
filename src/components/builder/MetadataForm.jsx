import React from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function MetadataForm({ value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v })
  return (
    <div className="space-y-5">
      <div>
        <Label htmlFor="name">Nom *</Label>
        <Input
          id="name"
          value={value.name}
          onChange={e => set('name', e.target.value)}
          placeholder="Ma super app"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label htmlFor="author">Auteur</Label>
        <Input
          id="author"
          value={value.author}
          onChange={e => set('author', e.target.value)}
          placeholder="Ton nom / pseudo"
          className="mt-1.5"
        />
      </div>
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={value.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Ce que fait cette app…"
          rows={3}
          className="mt-1.5 resize-none"
        />
      </div>
    </div>
  )
}