import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { base44 } from '@/api/base44Client'
import { Plus, Download, Pencil, Trash2, Loader2, Boxes } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getEffect } from '@/lib/effects'
import { buildHypFile, downloadFile } from '@/lib/hypExporter'

async function fetchModelFile(url, filename) {
  if (!url) return null
  const res = await fetch(url)
  const blob = await res.blob()
  return new File([blob], filename || 'model.glb', { type: blob.type })
}

export default function MyApps() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: apps, isLoading } = useQuery({
    queryKey: ['hypapps'],
    queryFn: () => base44.entities.HypApp.list('-updated_date', 100),
    initialData: [],
  })

  const del = useMutation({
    mutationFn: (id) => base44.entities.HypApp.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hypapps'] })
      toast.success('App supprimée.')
    },
  })

  const exportOne = async (app) => {
    try {
      const effect = getEffect(app.effect_id)
      const modelFile = await fetchModelFile(app.model_url, app.model_filename)
      const file = await buildHypFile({
        name: app.name,
        description: app.description,
        author: app.author,
        modelFile,
        effect,
        effectParams: app.effect_params || {},
        customScript: app.custom_script || '',
      })
      downloadFile(file)
      toast.success(`${file.name} exporté !`)
    } catch (e) {
      console.error(e)
      toast.error('Export impossible.')
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <div className="text-[11px] font-mono tracking-[0.25em] uppercase text-primary mb-2">Bibliothèque</div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">Mes apps</h1>
          <p className="text-muted-foreground mt-2">Tes apps Hyperfy sauvegardées, prêtes à être ré-exportées.</p>
        </div>
        <Button onClick={() => navigate('/builder')} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-2" />
          Nouvelle app
        </Button>
      </div>

      {isLoading ? (
        <div className="py-20 grid place-items-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : apps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/60 py-20 text-center">
          <Boxes className="w-10 h-10 mx-auto text-muted-foreground mb-4" strokeWidth={1.25} />
          <h3 className="font-semibold mb-1">Aucune app pour l'instant</h3>
          <p className="text-muted-foreground text-sm mb-6">Crée ta première app Hyperfy en quelques clics.</p>
          <Link to="/builder">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              Créer une app
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map(app => {
            const effect = getEffect(app.effect_id)
            return (
              <div key={app.id} className="group rounded-2xl border border-border/60 bg-card/40 p-5 flex flex-col gap-4 hover:border-primary/40 transition-colors">
                <div>
                  <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-primary mb-1.5">
                    {effect.name}
                  </div>
                  <h3 className="font-semibold text-lg truncate">{app.name}</h3>
                  {app.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{app.description}</p>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/60 pt-3">
                  <span>{app.author || 'anonyme'}</span>
                  {app.model_filename && (
                    <span className="font-mono truncate max-w-[50%]">{app.model_filename}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/builder?id=${app.id}`)}>
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    Éditer
                  </Button>
                  <Button size="sm" className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => exportOne(app)}>
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    .hyp
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Supprimer "${app.name}" ?`)) del.mutate(app.id) }}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}