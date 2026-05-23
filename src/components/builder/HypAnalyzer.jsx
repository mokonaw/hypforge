import React, { useRef, useState } from 'react'
import { X, Upload, FileSearch, Loader2, Copy, Check, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { base44 } from '@/api/base44Client'

// Parse a .hyp binary file → { header, assets, scriptContent, errors }
async function parseHypFile(file) {
  const buffer = await file.arrayBuffer()
  const view = new DataView(buffer)
  const errors = []

  if (buffer.byteLength < 4) {
    errors.push('Fichier trop petit (< 4 octets).')
    return { errors }
  }

  const headerSize = view.getUint32(0, true)
  const headerEnd = 4 + headerSize

  if (headerEnd > buffer.byteLength) {
    errors.push(`headerSize (${headerSize}) dépasse la taille du fichier (${buffer.byteLength}).`)
    return { errors }
  }

  let header
  try {
    const headerText = new TextDecoder().decode(new Uint8Array(buffer, 4, headerSize))
    header = JSON.parse(headerText)
  } catch (e) {
    errors.push('Header JSON invalide : ' + e.message)
    return { errors }
  }

  // Read asset bytes
  const assets = []
  let offset = headerEnd
  for (const assetMeta of (header.assets || [])) {
    const assetBytes = new Uint8Array(buffer, offset, assetMeta.size)
    let content = null
    if (assetMeta.mime?.includes('javascript') || assetMeta.url?.endsWith('.js')) {
      content = new TextDecoder().decode(assetBytes)
    }
    assets.push({ ...assetMeta, content })
    offset += assetMeta.size
  }

  const scriptAsset = assets.find(a => a.type === 'script' || a.url?.endsWith('.js'))

  return { header, assets, scriptContent: scriptAsset?.content || null, errors }
}

function Field({ label, value, highlight }) {
  return (
    <div className={`flex gap-2 text-xs py-1 border-b border-border/30 ${highlight ? 'text-destructive' : ''}`}>
      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="font-mono break-all">{value ?? <span className="italic text-muted-foreground/50">null</span>}</span>
    </div>
  )
}

function FileDrop({ label, onFile, file }) {
  const ref = useRef()
  return (
    <div
      onClick={() => ref.current.click()}
      className="cursor-pointer rounded-xl border-2 border-dashed border-border/60 hover:border-primary/50 bg-card/30 p-5 text-center transition-colors"
    >
      <input ref={ref} type="file" accept=".hyp" className="hidden" onChange={e => onFile(e.target.files[0])} />
      <Upload className="w-5 h-5 mx-auto mb-2 text-muted-foreground" />
      <div className="text-sm font-medium mb-0.5">{label}</div>
      {file
        ? <div className="text-xs text-primary truncate">{file.name} ({(file.size / 1024).toFixed(1)} Ko)</div>
        : <div className="text-xs text-muted-foreground">Cliquer pour sélectionner un fichier .hyp</div>
      }
    </div>
  )
}

export default function HypAnalyzer({ onClose }) {
  const [generatedFile, setGeneratedFile] = useState(null)
  const [referenceFile, setReferenceFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [chatText, setChatText] = useState('')
  const [copied, setCopied] = useState(false)

  const analyze = async () => {
    if (!generatedFile || !referenceFile) return
    setLoading(true)
    try {
      const [gen, ref] = await Promise.all([parseHypFile(generatedFile), parseHypFile(referenceFile)])

      // Build a structured diff summary for the LLM
      const summary = {
        generated: {
          parseErrors: gen.errors,
          blueprint: gen.header?.blueprint,
          assets: gen.assets?.map(a => ({ type: a.type, url: a.url, size: a.size, mime: a.mime })),
          scriptPreview: gen.scriptContent?.slice(0, 1500),
        },
        reference: {
          parseErrors: ref.errors,
          blueprint: ref.header?.blueprint,
          assets: ref.assets?.map(a => ({ type: a.type, url: a.url, size: a.size, mime: a.mime })),
          scriptPreview: ref.scriptContent?.slice(0, 1500),
        },
      }

      const prompt = `Tu es un expert du format de fichier Hyperfy (.hyp).
Voici les données extraites de deux fichiers .hyp :

FICHIER GÉNÉRÉ (celui qui plante à l'importation) :
${JSON.stringify(summary.generated, null, 2)}

FICHIER DE RÉFÉRENCE (celui qui fonctionne) :
${JSON.stringify(summary.reference, null, 2)}

Analyse en détail les différences entre les deux fichiers et identifie pourquoi le fichier généré plante à l'importation dans Hyperfy.
Fournis :
1. Un résumé des différences structurelles (blueprint, assets, script)
2. La cause probable du crash
3. Les corrections à apporter

Réponds en français, de façon claire et structurée.`

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        model: 'claude_sonnet_4_6',
      })

      setReport({ gen, ref, analysis: result })

      // Build chat-paste text
      const chatPrompt = `Voici l'analyse comparative de deux fichiers .hyp Hyperfy (généré vs fonctionnel) :

${result}

---
Données brutes du fichier généré (blueprint) :
${JSON.stringify(summary.generated.blueprint, null, 2)}

Données brutes du fichier de référence (blueprint) :
${JSON.stringify(summary.reference.blueprint, null, 2)}

Script généré (500 premiers caractères) :
${gen.scriptContent?.slice(0, 500) || 'N/A'}

Script de référence (500 premiers caractères) :
${ref.scriptContent?.slice(0, 500) || 'N/A'}

Peux-tu corriger le code de génération du fichier .hyp ?`

      setChatText(chatPrompt)
    } catch (e) {
      setReport({ error: e.message })
    } finally {
      setLoading(false)
    }
  }

  const copyChat = () => {
    navigator.clipboard.writeText(chatText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-3xl bg-card rounded-2xl border border-border shadow-2xl mt-10 mb-10">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/60">
          <div className="flex items-center gap-3">
            <FileSearch className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-semibold text-lg">Analyser les fichiers .hyp</h2>
              <p className="text-xs text-muted-foreground">Compare ton fichier généré avec un fichier fonctionnel pour identifier le problème</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* File inputs */}
          <div className="grid sm:grid-cols-2 gap-4">
            <FileDrop label="Fichier généré (qui plante)" onFile={setGeneratedFile} file={generatedFile} />
            <FileDrop label="Fichier de référence (qui fonctionne)" onFile={setReferenceFile} file={referenceFile} />
          </div>

          <Button
            onClick={analyze}
            disabled={!generatedFile || !referenceFile || loading}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analyse en cours…</>
              : <><FileSearch className="w-4 h-4 mr-2" />Lancer l'analyse</>
            }
          </Button>

          {/* Parse errors */}
          {report && !report.error && (report.gen.errors.length > 0 || report.ref.errors.length > 0) && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs space-y-1">
              <div className="flex items-center gap-2 font-semibold text-destructive mb-2">
                <AlertTriangle className="w-4 h-4" /> Erreurs de parsing
              </div>
              {report.gen.errors.map((e, i) => <div key={i}>🔴 Généré : {e}</div>)}
              {report.ref.errors.map((e, i) => <div key={i}>🟡 Référence : {e}</div>)}
            </div>
          )}

          {/* Quick structural comparison */}
          {report && !report.error && report.gen.header && report.ref.header && (
            <div className="space-y-4">
              <div className="text-sm font-semibold">Comparaison structurelle</div>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  { title: '📄 Fichier généré', data: report.gen },
                  { title: '✅ Fichier de référence', data: report.ref },
                ].map(({ title, data }) => (
                  <div key={title} className="rounded-xl border border-border/60 bg-secondary/10 p-4 text-xs">
                    <div className="font-semibold mb-2 text-sm">{title}</div>
                    <Field label="id" value={data.header.blueprint?.id} />
                    <Field label="version" value={data.header.blueprint?.version} />
                    <Field label="model" value={data.header.blueprint?.model} />
                    <Field label="script" value={data.header.blueprint?.script} />
                    <Field label="nb assets" value={data.assets?.length} />
                    {data.assets?.map((a, i) => (
                      <Field key={i} label={`asset[${i}].type`} value={a.type} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Analysis */}
          {report?.analysis && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
              <div className="flex items-center gap-2 text-primary font-semibold mb-3">
                <CheckCircle2 className="w-4 h-4" /> Analyse IA
              </div>
              <pre className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed font-sans">{report.analysis}</pre>
            </div>
          )}

          {/* Error */}
          {report?.error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs text-destructive">
              Erreur : {report.error}
            </div>
          )}

          {/* Chat paste */}
          {chatText && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Texte à coller dans le chat pour corriger</div>
                <Button variant="outline" size="sm" onClick={copyChat}>
                  {copied ? <><Check className="w-3.5 h-3.5 mr-1.5" />Copié !</> : <><Copy className="w-3.5 h-3.5 mr-1.5" />Copier</>}
                </Button>
              </div>
              <textarea
                readOnly
                value={chatText}
                rows={6}
                className="w-full rounded-xl border border-border bg-[hsl(240_18%_3%)] text-xs font-mono text-foreground/80 p-3 resize-none focus:outline-none"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}