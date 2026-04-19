import React, { useRef } from 'react'
import { Upload, X, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ModelUploader({ file, onChange }) {
  const inputRef = useRef()

  const pick = () => inputRef.current?.click()
  const handle = (e) => {
    const f = e.target.files?.[0]
    if (f) onChange(f)
    e.target.value = ''
  }
  const clear = () => onChange(null)

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept=".glb,.vrm"
        className="hidden"
        onChange={handle}
      />
      {!file ? (
        <button
          type="button"
          onClick={pick}
          className="w-full rounded-xl border-2 border-dashed border-border hover:border-primary/60 hover:bg-secondary/30 transition-colors p-8 text-center"
        >
          <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
          <div className="text-sm font-medium">Déposer un modèle 3D</div>
          <div className="text-xs text-muted-foreground mt-1">
            .glb ou .vrm — optionnel
          </div>
        </button>
      ) : (
        <div className="rounded-xl border border-border bg-secondary/40 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 grid place-items-center text-primary">
            <Package className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={clear}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}