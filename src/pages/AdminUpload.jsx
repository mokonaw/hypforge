import React, { useState } from 'react'
import { Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { base44 } from '@/api/base44Client'

export default function AdminUpload() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState(null) // null | 'uploading' | 'success' | 'error'
  const [uploadedUrl, setUploadedUrl] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const handleFileChange = (e) => {
    const f = e.target.files[0]
    if (f) setFile(f)
  }

  const handleUpload = async () => {
    if (!file) return
    setStatus('uploading')
    setErrorMsg(null)
    try {
      const res = await base44.integrations.Core.UploadFile({ file })
      setUploadedUrl(res.file_url)
      setStatus('success')
    } catch (e) {
      setErrorMsg(e?.message || 'Erreur inconnue')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 space-y-6">
        <div>
          <div className="text-[10px] font-mono tracking-[0.2em] uppercase text-primary mb-1">Admin</div>
          <h1 className="text-2xl font-semibold">Upload du template .hyp</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Upload le fichier <code className="text-foreground">fonctionne.hyp</code> — tu recevras une URL publique à configurer dans le code.
          </p>
        </div>

        {/* File picker */}
        <div
          className="rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors p-8 text-center cursor-pointer"
          onClick={() => document.getElementById('hyp-file-input').click()}
        >
          <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          {file ? (
            <div>
              <p className="font-medium text-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Clique pour sélectionner <strong>fonctionne.hyp</strong></p>
          )}
          <input
            id="hyp-file-input"
            type="file"
            accept=".hyp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Upload button */}
        <Button
          onClick={handleUpload}
          disabled={!file || status === 'uploading'}
          className="w-full"
        >
          {status === 'uploading'
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Upload en cours…</>
            : <><Upload className="w-4 h-4 mr-2" />Uploader le fichier</>
          }
        </Button>

        {/* Success */}
        {status === 'success' && uploadedUrl && (
          <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-4 space-y-3">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Fichier uploadé avec succès !</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">URL publique du fichier :</p>
              <code className="block text-xs bg-background rounded-lg p-3 break-all text-foreground border border-border">
                {uploadedUrl}
              </code>
            </div>
            <div className="rounded-lg bg-primary/10 border border-primary/20 p-3 text-xs text-primary/90 leading-relaxed">
              <strong>Prochaine étape :</strong> Copie cette URL et dis-la moi — je vais mettre à jour le <code>fetch()</code> dans <code>lib/hypExporter.js</code> pour pointer vers cette URL.
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{errorMsg}</p>
          </div>
        )}
      </div>
    </div>
  )
}