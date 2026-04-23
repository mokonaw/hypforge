import React, { useMemo } from 'react'
import { X, Box, Music, Video, Image, MousePointer, Layout, Layers, RotateCw, Zap, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'

const NODE_CONFIG = {
  mesh:      { icon: Box,          color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/30',   label: 'Mesh 3D' },
  collider:  { icon: Box,          color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/30', label: 'Collider' },
  rigidbody: { icon: Layers,       color: 'text-yellow-400', bg: 'bg-yellow-400/10 border-yellow-400/30', label: 'Rigidbody' },
  audio:     { icon: Music,        color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/30',  label: 'Audio' },
  video:     { icon: Video,        color: 'text-purple-400', bg: 'bg-purple-400/10 border-purple-400/30', label: 'Vidéo' },
  image:     { icon: Image,        color: 'text-pink-400',   bg: 'bg-pink-400/10 border-pink-400/30',    label: 'Image 3D' },
  action:    { icon: MousePointer, color: 'text-cyan-400',   bg: 'bg-cyan-400/10 border-cyan-400/30',    label: 'Action' },
  ui:        { icon: Layout,       color: 'text-violet-400', bg: 'bg-violet-400/10 border-violet-400/30', label: 'UI Monde' },
  group:     { icon: Layers,       color: 'text-slate-400',  bg: 'bg-slate-400/10 border-slate-400/30',  label: 'Group' },
  anchor:    { icon: Zap,          color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/30',      label: 'Anchor' },
}

function parseScript(script) {
  const nodes = []
  const behaviors = []
  const props = []

  // Detect created nodes
  const nodeRe = /app\.create\(['"](\w+)['"]/g
  let m
  while ((m = nodeRe.exec(script)) !== null) {
    const type = m[1]
    if (NODE_CONFIG[type] && !nodes.find(n => n.type === type)) {
      nodes.push({ type })
    }
  }

  // Detect behaviors
  if (/app\.on\(['"]update['"]/.test(script)) behaviors.push({ icon: RotateCw, label: 'Boucle update (animation)' })
  if (/app\.on\(['"]fixedUpdate['"]/.test(script)) behaviors.push({ icon: Zap, label: 'Boucle physique' })
  if (/world\.on\(['"]join['"]/.test(script)) behaviors.push({ icon: Zap, label: 'Réaction joueur join' })
  if (/world\.open\(/.test(script)) behaviors.push({ icon: Zap, label: 'Ouverture lien externe' })
  if (/\.play\(\)/.test(script)) behaviors.push({ icon: Zap, label: 'Lecture média' })

  // Detect configure props
  const configureMatch = script.match(/app\.configure\(\[([\s\S]*?)\]\)/)
  if (configureMatch) {
    const block = configureMatch[1]
    const propRe = /type:\s*['"](\w+)['"]\s*,\s*key:\s*['"](\w+)['"]\s*(?:,\s*label:\s*['"]([^'"]+)['"])?/g
    while ((m = propRe.exec(block)) !== null) {
      props.push({ type: m[1], key: m[2], label: m[3] || m[2] })
    }
  }

  return { nodes, behaviors, props }
}

export default function ScriptVisualizer({ script, onClose }) {
  const { nodes, behaviors, props } = useMemo(() => parseScript(script), [script])
  const isEmpty = nodes.length === 0 && behaviors.length === 0 && props.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl rounded-2xl border border-border/60 bg-card shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <div>
            <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-primary mb-0.5">Aperçu</div>
            <h2 className="text-lg font-semibold">Analyse du script</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          {isEmpty ? (
            <p className="text-center text-muted-foreground py-10 text-sm">
              Aucun élément détecté. Génère d'abord un script avec l'IA.
            </p>
          ) : (
            <>
              {/* Nodes */}
              {nodes.length > 0 && (
                <div>
                  <div className="text-xs font-mono tracking-[0.15em] uppercase text-muted-foreground mb-3">Nodes 3D</div>
                  <div className="flex flex-wrap gap-2">
                    {nodes.map(({ type }) => {
                      const cfg = NODE_CONFIG[type]
                      const Icon = cfg.icon
                      return (
                        <div key={type} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium ${cfg.bg} ${cfg.color}`}>
                          <Icon className="w-3.5 h-3.5" />
                          {cfg.label}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Behaviors */}
              {behaviors.length > 0 && (
                <div>
                  <div className="text-xs font-mono tracking-[0.15em] uppercase text-muted-foreground mb-3">Comportements</div>
                  <ul className="space-y-2">
                    {behaviors.map((b, i) => {
                      const Icon = b.icon
                      return (
                        <li key={i} className="flex items-center gap-2 text-sm text-foreground/80">
                          <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                          {b.label}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* Props */}
              {props.length > 0 && (
                <div>
                  <div className="text-xs font-mono tracking-[0.15em] uppercase text-muted-foreground mb-3">
                    <Settings className="w-3 h-3 inline mr-1" />
                    Champs configurables ({props.length})
                  </div>
                  <div className="rounded-xl border border-border/60 overflow-hidden divide-y divide-border/60">
                    {props.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                        <span className="font-medium">{p.label}</span>
                        <span className="font-mono text-xs text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded">{p.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Script mini-preview */}
              <div>
                <div className="text-xs font-mono tracking-[0.15em] uppercase text-muted-foreground mb-3">Extrait du script</div>
                <pre className="text-xs font-mono bg-[hsl(240_18%_3%)] border border-border/60 rounded-xl p-4 overflow-x-auto leading-relaxed text-foreground/70 max-h-48 overflow-y-auto">
                  {script.slice(0, 800)}{script.length > 800 ? '\n…' : ''}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}