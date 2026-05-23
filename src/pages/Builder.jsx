import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Download, Save, Loader2, FileCode2, Sparkles, Settings, Wand2, ChevronDown, ChevronUp, Eye, FileJson, FileSearch, Bug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { base44 } from '@/api/base44Client'

import MetadataForm from '@/components/builder/MetadataForm'
import ModelUploader from '@/components/builder/ModelUploader'
import ScriptPreview from '@/components/builder/ScriptPreview'
import AiScriptGenerator from '@/components/builder/AiScriptGenerator'
import PropsEditor from '@/components/builder/PropsEditor'
import ScriptVisualizer from '@/components/builder/ScriptVisualizer'
import HypAnalyzer from '@/components/builder/HypAnalyzer'

import { buildHypFile, downloadFile, getPatchedScript } from '@/lib/hypExporter'
import { getAnonymousId } from '@/lib/anonymousId'

function Section({ step, title, icon: Icon, children, badge }) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 grid place-items-center text-primary">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground">Étape {step}</div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        {badge}
      </div>
      {children}
    </section>
  )
}

const EMPTY_SCRIPT = `// Décris ton app ci-dessus et clique sur "Générer avec l'IA"
// Le script Hyperfy apparaîtra ici automatiquement.
`

export default function Builder() {
  const navigate = useNavigate()
  const [search] = useSearchParams()
  const loadId = search.get('id')

  const [meta, setMeta] = useState({ name: '', description: '', author: '' })
  const [modelFile, setModelFile] = useState(null)
  const [script, setScript] = useState(EMPTY_SCRIPT)
  const [aiPrompt, setAiPrompt] = useState('')
  const [propsSchema, setPropsSchema] = useState({})   // { key: defaultValue }
  const [propsValues, setPropsValues] = useState({})   // { key: currentValue }
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showVisualizer, setShowVisualizer] = useState(false)
  const [showAnalyzer, setShowAnalyzer] = useState(false)
  const [patchedScript, setPatchedScript] = useState(null)

  // Load existing app if ?id=...
  useEffect(() => {
    if (!loadId) return
    base44.functions.invoke('getMyApps', { anonymous_id: getAnonymousId() }).then(res => {
      const apps = res.data?.apps || []
      const saved = apps.find(a => a.id === loadId)
      if (!saved) return
      setMeta({ name: saved.name || '', description: saved.description || '', author: saved.author || '' })
      if (saved.ai_prompt) setAiPrompt(saved.ai_prompt)
      if (saved.custom_script) setScript(saved.custom_script)
      if (saved.effect_params) {
        setPropsSchema(saved.effect_params)
        setPropsValues(saved.effect_params)
      }
    })
  }, [loadId])

  const canExport = meta.name.trim().length > 0 && script.trim().length > 0 && script !== EMPTY_SCRIPT

  const exportJson = () => {
    const data = {
      name: meta.name,
      description: meta.description,
      author: meta.author,
      ai_prompt: aiPrompt,
      props: propsSchema,
      script,
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${meta.name || 'app'}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  // When IA generates a script
  const handleScriptGenerated = (newScript) => {
    setScript(newScript)
    toast.success('Script généré ! Vérifie et modifie si besoin.')
  }

  // When IA extracts props
  const handlePropsGenerated = (props) => {
    setPropsSchema(props)
    setPropsValues(props) // initialize with defaults
  }

  // Build .hyp entirely client-side (avoids binary corruption over network)
  const buildAndExport = async () => {
    if (!canExport) {
      toast.error('Remplis le nom et génère un script avant d\'exporter.')
      return
    }
    setBusy(true)
    try {
      // Upload model first if exists
      let modelFileUrl = null
      if (modelFile) {
        const modelRes = await base44.integrations.Core.UploadFile({ file: modelFile })
        modelFileUrl = modelRes.file_url
      }

      // Call backend function to get blueprint + script (NO binary)
      const result = await base44.functions.invoke('exportHypFile', {
        name: meta.name,
        description: meta.description,
        author: meta.author,
        modelFileUrl,
        script,
        effectParams: propsSchema,
      })

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Erreur inconnue')
      }

      const { blueprint, assets, script: patchedScript, filename } = result.data

      // Client-side .hyp assembly (preserves UTF-8 and 4-byte header)
      const encoder = new TextEncoder()
      
      // Encode script
      const scriptBytes = encoder.encode(patchedScript)
      
      // Update asset size
      const assetsWithSizes = assets.map(a => ({
        ...a,
        size: a.type === 'script' ? scriptBytes.length : a.size,
      }))

      // Build header JSON
      const header = {
        blueprint,
        assets: assetsWithSizes,
      }
      const jsonBytes = encoder.encode(JSON.stringify(header))

      // 4-byte header (uint32 LE)
      const headerSizeBytes = new Uint8Array(4)
      new DataView(headerSizeBytes.buffer).setUint32(0, jsonBytes.length, true)

      // Assemble: [4-byte size][JSON][script bytes]
      const totalLength = headerSizeBytes.length + jsonBytes.length + scriptBytes.length
      const finalBytes = new Uint8Array(totalLength)
      
      let offset = 0
      finalBytes.set(headerSizeBytes, offset)
      offset += headerSizeBytes.length
      finalBytes.set(jsonBytes, offset)
      offset += jsonBytes.length
      finalBytes.set(scriptBytes, offset)

      // Download
      const blob = new Blob([finalBytes], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`${filename} exporté !`)
    } catch (e) {
      console.error(e)
      toast.error('Export impossible : ' + (e?.message || 'erreur inconnue'))
    } finally {
      setBusy(false)
    }
  }

  const doSave = async () => {
    if (!meta.name.trim()) {
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
        effect_id: 'custom',
        effect_params: propsSchema,
        custom_script: script,
        ai_prompt: aiPrompt,
      }
      const res = await base44.functions.invoke('saveApp', {
        app_id: loadId || null,
        payload,
        anonymous_id: getAnonymousId(),
      })
      const saved = res.data?.app
      if (loadId) {
        toast.success('App mise à jour.')
      } else {
        toast.success('App sauvegardée.')
        navigate(`/builder?id=${saved.id}`, { replace: true })
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="text-[11px] font-mono tracking-[0.25em] uppercase text-primary mb-2">Builder IA</div>
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
            {loadId ? 'Modifier' : 'Nouvelle'} <span className="text-gradient">app</span>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Décris ce que tu veux créer — l'IA écrit le script Hyperfy pour toi.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setShowAnalyzer(true)}>
            <FileSearch className="w-4 h-4 mr-2" />
            Analyser .hyp
          </Button>
          <Button variant="outline" onClick={() => {
            const patched = getPatchedScript(script)
            setPatchedScript(patched)
            // Debug: check for orphan braces
            const lines = patched.split('\n')
            const lastNonEmpty = lines.map(l => l.trim()).filter(l => l).slice(-5)
            console.log('✅ Script patché - 5 dernières lignes non-vides:', lastNonEmpty)
          }} disabled={script === EMPTY_SCRIPT} title="Voir le script après patch (ce qui sera dans le .hyp)">
            <Bug className="w-4 h-4 mr-2" />
            Script patché
          </Button>
          <Button variant="outline" onClick={exportJson} disabled={!canExport}>
            <FileJson className="w-4 h-4 mr-2" />
            Exporter .json
          </Button>
          <Button variant="outline" onClick={() => setShowVisualizer(true)} disabled={script === EMPTY_SCRIPT}>
            <Eye className="w-4 h-4 mr-2" />
            Aperçu
          </Button>
          <Button variant="outline" onClick={doSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Sauvegarder
          </Button>
          <Button onClick={buildAndExport} disabled={busy || !canExport} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Exporter .hyp
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_420px] gap-6">
        <div className="space-y-6">

          {/* Step 1 — Metadata */}
          <Section step="01" title="Métadonnées" icon={FileCode2}>
            <MetadataForm value={meta} onChange={setMeta} />
            <div className="mt-6 pt-6 border-t border-border/60">
              <div className="text-sm font-medium mb-2">Modèle 3D (optionnel)</div>
              <ModelUploader file={modelFile} onChange={setModelFile} />
            </div>
          </Section>

          {/* Step 2 — AI Generation */}
          <Section step="02" title="Décris ton app" icon={Sparkles}>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
              Tu peux décrire ton app en français ou en anglais — les deux fonctionnent très bien.<br />
              <span className="text-muted-foreground/60">You can describe your app in French or English — both work great.</span>
            </p>
            <AiScriptGenerator
              onScriptGenerated={handleScriptGenerated}
              onPropsGenerated={handlePropsGenerated}
              prompt={aiPrompt}
              onPromptChange={setAiPrompt}
            />
          </Section>

          {/* Step 3 — Props (only if generated) */}
          {Object.keys(propsSchema).length > 0 && (
            <Section step="03" title="Paramètres configurables" icon={Settings}>
              <PropsEditor
                propsData={propsSchema}
                values={propsValues}
                onChange={setPropsValues}
              />
            </Section>
          )}

          {/* Advanced — manual script edit */}
          <div className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanced(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 hover:bg-secondary/20 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Wand2 className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Édition manuelle du script</span>
              </div>
              {showAdvanced ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {showAdvanced && (
              <div className="px-6 pb-6">
                <textarea
                  value={script}
                  onChange={e => setScript(e.target.value)}
                  rows={18}
                  spellCheck={false}
                  className="w-full rounded-xl border border-border bg-[hsl(240_18%_3%)] text-xs font-mono text-foreground/90 p-4 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 leading-relaxed"
                />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar — Script preview */}
        <aside className="lg:sticky lg:top-24 space-y-4 self-start">
          <div className="flex items-center justify-between px-1">
            <div>
              <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-muted-foreground">Aperçu</div>
              <div className="font-semibold">Script généré</div>
            </div>
            <span className="text-xs text-muted-foreground">{script.split('\n').length} lignes</span>
          </div>
          <ScriptPreview code={script} />
          <div className="rounded-xl border border-border/60 bg-card/30 p-4 text-xs text-muted-foreground leading-relaxed">
            Le script sera embarqué en tant qu'<code className="text-foreground">asset://....js</code> dans le fichier .hyp,
            conformément au format officiel Hyperfy.
          </div>
        </aside>
      </div>

      {showVisualizer && (
        <ScriptVisualizer script={script} onClose={() => setShowVisualizer(false)} />
      )}
      {showAnalyzer && (
        <HypAnalyzer onClose={() => setShowAnalyzer(false)} />
      )}
      {patchedScript !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-4xl bg-card rounded-2xl border border-border shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <span className="font-semibold text-sm">Script patché — ce qui sera embarqué dans le .hyp</span>
              <button onClick={() => setPatchedScript(null)} className="text-muted-foreground hover:text-foreground text-lg leading-none">✕</button>
            </div>
            <pre className="flex-1 overflow-auto p-6 text-xs font-mono text-foreground/90 whitespace-pre-wrap leading-relaxed">{patchedScript}</pre>
          </div>
        </div>
      )}
    </div>
  )
}