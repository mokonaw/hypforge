import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Save, Loader2, FileCode2, Settings, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { base44 } from '@/api/base44Client'

import MetadataForm from '@/components/builder/MetadataForm'
import ModelUploader from '@/components/builder/ModelUploader'
import EffectPicker from '@/components/builder/EffectPicker'
import EffectConfig from '@/components/builder/EffectConfig'
import ScriptPreview from '@/components/builder/ScriptPreview'

import { EFFECTS, getEffect, defaultParams, buildScript } from '@/lib/effects'
import { buildHypFile, downloadFile } from '@/lib/hypExporter'

function Section({ step, title, icon: Icon, children }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 grid place-items-center text-primary">
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground">Étape {step}</div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}

export default function Builder() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const loadId = search.get('id')

  const [meta, setMeta] = useState({ name: '', description: '', author: '' })
  const [modelFile, setModelFile] = useState(null)
  const [effectId, setEffectId] = useState('spin_and_float')
  const [params, setParams] = useState(() => defaultParams(getEffect('spin_and_float')))
  const [customScript, setCustomScript] = useState("// Écris ton script Hyperfy ici\napp.on('update', delta => {\n  app.rotation.y += delta\n})\n")
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  const effect = getEffect(effectId)

  // Reset params when effect changes
  useEffect(() => {
    setParams(defaultParams(effect))
  }, [effectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load existing app if ?id=...
  useEffect(() => {
    if (!loadId) return
    base44.entities.HypApp.list().then(apps => {
      const app = apps.find(a => a.id === loadId)
      if (!app) return
      setMeta({ name: app.name || '', description: app.description || '', author: app.author || '' })
      setEffectId(app.effect_id || 'spin_and_float')
      // use raw values from storage (params overrides defaults)
      setTimeout(() => {
        setParams({ ...defaultParams(getEffect(app.effect_id || 'spin_and_float')), ...(app.effect_params || {}) })
      }, 0)
      if (app.custom_script) setCustomScript(app.custom_script)
    })
  }, [loadId])

  const previewCode = useMemo(
    () => buildScript(effect, params, { customScript }),
    [effect, params, customScript]
  )

  const canExport = meta.name.trim().length > 0

  const doExport = async () => {
    if (!canExport) {
      toast.error('Donne un nom à ton app avant d\'exporter.')
      return
    }
    setBusy(true)
    try {
      const file = await buildHypFile({
        name: meta.name,
        description: meta.description,
        author: meta.author,
        modelFile,
        effect,
        effectParams: params,
        customScript,
      })
      downloadFile(file)
      toast.success(`${file.name} exporté !`)
    } catch (e) {
      console.error(e)
      toast.error('Export impossible : ' + (e?.message || 'erreur inconnue'))
    } finally {
      setBusy(false)
    }
  }

  const doSave = async () => {
    if (!canExport) {
      toast.error('Donne un nom à ton app avant de sauvegarder.')
      return
    }
    setSaving(true)
    try {
      let modelUrl = null
      let modelFilename = null
      if (modelFile) {
        const res = await base44.integrations.Core.UploadFile({ file: modelFile })
        modelUrl = res.file_url
        modelFilename = modelFile.name
      }
      const payload = {
        name: meta.name,
        description: meta.description,
        author: meta.author,
        model_url: modelUrl,
        model_filename: modelFilename,
        effect_id: effectId,
        effect_params: params,
        custom_script: effectId === 'custom' ? customScript : '',
      }
      if (loadId) {
        await base44.entities.HypApp.update(loadId, payload)
        toast.success('App mise à jour.')
      } else {
        const created = await base44.entities.HypApp.create(payload)
        toast.success('App sauvegardée.')
        navigate(`/builder?id=${created.id}`, { replace: true })
      }
    } catch (e) {
      console.error(e)
      toast.error('Sauvegarde impossible.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="text-[11px] font-mono tracking-[0.25em] uppercase text-primary mb-2">Builder</div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            {loadId ? 'Modifier' : 'Nouvelle'} <span className="text-gradient">app</span>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Configure ton app, visualise le script généré, puis exporte-la en fichier .hyp.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={doSave} disabled={saving || !canExport}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Sauvegarder
          </Button>
          <Button onClick={doExport} disabled={busy || !canExport} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Exporter .hyp
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-6">
        <div className="space-y-6">
          <Section step="01" title="Métadonnées" icon={FileCode2}>
            <MetadataForm value={meta} onChange={setMeta} />
            <div className="mt-6 pt-6 border-t border-border/60">
              <div className="text-sm font-medium mb-2">Modèle 3D (optionnel)</div>
              <ModelUploader file={modelFile} onChange={setModelFile} />
            </div>
          </Section>

          <Section step="02" title="Choisis un effet" icon={Wand2}>
            <EffectPicker value={effectId} onChange={setEffectId} />
          </Section>

          <Section step="03" title="Paramètres de l'effet" icon={Settings}>
            <EffectConfig
              effect={effect}
              params={params}
              onChange={setParams}
              customScript={customScript}
              onCustomScriptChange={setCustomScript}
            />
          </Section>
        </div>

        <aside className="lg:sticky lg:top-24 space-y-4 self-start">
          <div className="flex items-center justify-between px-1">
            <div>
              <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground">Aperçu</div>
              <div className="font-semibold">Script généré</div>
            </div>
            <span className="text-xs text-muted-foreground">{previewCode.split('\n').length} lignes</span>
          </div>
          <ScriptPreview code={previewCode} />
          <div className="rounded-xl border border-border/60 bg-card/30 p-4 text-xs text-muted-foreground leading-relaxed">
            Les paramètres sont embarqués dans <code className="text-foreground">blueprint.props</code> du fichier .hyp,
            conformément au format utilisé dans <code className="text-foreground">appTools.js</code> de Hyperfy.
          </div>
        </aside>
      </div>
    </div>
  )
}