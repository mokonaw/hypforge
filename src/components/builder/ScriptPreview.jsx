import React, { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ScriptPreview({ code }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="relative rounded-xl border border-border bg-[hsl(240_18%_3%)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/60 bg-secondary/30">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-muted-foreground font-mono ml-2">index.js</span>
        </div>
        <Button variant="ghost" size="sm" onClick={copy} className="h-7 text-xs">
          {copied ? <><Check className="w-3.5 h-3.5 mr-1" />Copié</> : <><Copy className="w-3.5 h-3.5 mr-1" />Copier</>}
        </Button>
      </div>
      <pre className="text-xs overflow-auto p-4 max-h-[500px] leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  )
}