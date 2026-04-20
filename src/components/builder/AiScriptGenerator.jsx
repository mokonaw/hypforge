import React, { useState } from 'react'
import { Sparkles, Loader2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { base44 } from '@/api/base44Client'

const HYPERFY_CONTEXT = `Tu es un expert du scripting Hyperfy V2.
Hyperfy est un moteur de monde virtuel 3D. Les apps Hyperfy sont des scripts JavaScript qui s'exécutent dans le runtime Hyperfy.

=== RÈGLES STRICTES DU RUNTIME HYPERFY V2 ===

GLOBALS DISPONIBLES : app, world, props, fetch, num, str, uuid, setTimeout, setInterval, clearTimeout, clearInterval

--- app ---
  app.position.set(x, y, z) — ou app.position.x = ...
  app.rotation.set(x, y, z) — rotation en radians
  app.scale.set(x, y, z)
  app.add(node) — ajoute un nœud enfant
  app.remove(node) — retire un nœud
  app.get('NomNode') — récupère un nœud enfant par son nom (ex: nœud GLB nommé dans Blender)
  app.on('update', delta => {...}) — boucle de rendu (delta en secondes)
  app.on('fixedUpdate', delta => {...}) — physique fixe
  app.configure([...fields]) — déclare les champs éditables dans l'UI Hyperfy (TOUJOURS en premier dans le script)

--- props ---
  props = valeurs des champs définis par app.configure()
  Lire avec props.monChamp — JAMAIS de déstructuration

--- world ---
  world.isClient — boolean, true si exécuté côté navigateur
  world.isServer — boolean
  world.open(url, newTab) — ouvre une URL (newTab = true pour nouvel onglet)
  world.getPlayer() — retourne le joueur local
  world.on('join', player => {...}) — joueur rejoint
  world.on('leave', player => {...}) — joueur quitte

=== NODES DISPONIBLES via app.create('nom') ===

--- 'action' — interaction cliquable ---
  .label (string)
  .distance (number, défaut 3)
  .duration (number, 0 = instantané, 0.5 = maintien)
  .onTrigger = () => {}
  .onStart = () => {}
  .onCancel = () => {}
  .position.set(x, y, z) — positionner l'action dans la scène
  app.add(action)

--- 'ui' — interface utilisateur en espace monde ---
  Créer: app.create('ui', { space: 'world', width: 350, height: 140, size: 0.01, backgroundColor: 'rgba(0,0,0,0)', borderRadius: 10, padding: 10 })
  .position.set(x, y, z)
  .add(uiview) — ajouter des enfants UI
  app.add(ui)

--- 'uiview' — conteneur layout dans un 'ui' ---
  Créer: app.create('uiview', { flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 0 })
  .add(child) — ajouter uitext, uiimage, uiview enfants

--- 'uitext' — texte dans un 'ui' ---
  Créer: app.create('uitext', { value: 'Mon texte', fontSize: 24, color: 'white', textAlign: 'center' })

--- 'uiimage' — image dans un 'ui' ---
  Créer: app.create('uiimage', { src: 'https://...', width: 240, height: 148, objectFit: 'contain', borderRadius: 8 })
  Pour les assets uploadés: src = props.imageFile.url.replace('asset://', '/assets/')

--- 'image' — image 3D plane dans le monde ---
  .src (string URL)
  .width / .height (number, mètres)
  .fit ('none'|'cover'|'contain')
  app.add(image)

--- 'video' — écran vidéo 3D (MP4 direct uniquement) ---
  .src (string, URL MP4 directe — PAS YouTube embed)
  .width / .height (number)
  .aspect (number, défaut 16/9)
  .loop (boolean)
  .volume (number 0-1)
  .play() / .pause() / .stop()
  app.add(video)

--- 'audio' — son 3D ---
  .src (string URL MP3/OGG)
  .loop (boolean)
  .volume (number)
  .spatial (boolean)
  .play() / .pause() / .stop()
  app.add(audio)

--- 'mesh' — primitif 3D ---
  .type ('box'|'sphere'|'cylinder'|'plane'|'capsule')
  .width / .height / .depth (number)
  .color (string hex)
  .castShadow / .receiveShadow (boolean)
  app.add(mesh)

--- 'collider' — collision ---
  .type ('box'|'sphere'|'capsule'|'geometry')
  .width / .height / .depth (number)
  .trigger (boolean)
  app.add(collider)

--- 'rigidbody' — physique ---
  .type ('dynamic'|'static'|'kinematic')
  app.add(rigidbody)

--- 'group' — conteneur/pivot ---
  .position.set(x,y,z)
  .add(child)
  app.add(group)

--- 'anchor' / 'particles' / 'lod' — usages avancés ---

=== CHAMPS app.configure() ===
Types disponibles :
  { type: 'text', key, label, initial }
  { type: 'textarea', key, label, placeholder, initial }
  { type: 'number', key, label, initial }
  { type: 'range', key, label, min, max, step, initial }
  { type: 'toggle', key, label, trueLabel, falseLabel, initial }
  { type: 'select', key, label, options: [{label,value}], initial }
  { type: 'file', key, label, kind: 'texture'|'model'|'audio' }

=== EXEMPLE — image cliquable avec lien ===
app.configure([
  { type: 'textarea', key: 'url', label: 'URL', initial: 'https://example.com' },
  { type: 'text', key: 'displayText', label: 'Texte affiché', initial: 'Visiter' },
  { type: 'file', key: 'imageFile', label: 'Image', kind: 'texture' },
  { type: 'range', key: 'posY', label: 'Position Y', min: 0, max: 5, step: 0.1, initial: 2.2 },
  { type: 'toggle', key: 'visible', label: 'Visible', trueLabel: 'Oui', falseLabel: 'Non', initial: true },
])

const ui = app.create('ui', {
  space: 'world', width: 350, height: 180, size: 0.01,
  backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 10,
})
ui.position.set(0, props.posY || 2.2, 0)

const container = app.create('uiview', {
  flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8,
})

if (props.imageFile && props.imageFile.url) {
  const img = app.create('uiimage', {
    src: props.imageFile.url.replace('asset://', '/assets/'),
    width: 240, height: 148, objectFit: 'contain', borderRadius: 8,
  })
  container.add(img)
}

const label = (props.displayText && props.displayText.trim()) ? props.displayText.trim() : (props.url || '')
const txt = app.create('uitext', { value: label, fontSize: 22, color: 'white', textAlign: 'center' })
container.add(txt)
ui.add(container)

const action = app.create('action', {
  label: 'Ouvrir', distance: 2, duration: 0.5,
  onTrigger: () => {
    if (props.url && world.isClient) world.open(props.url, true)
  },
})
action.position.set(0, 1.7, 0)

app.add(ui)
app.add(action)

=== EXEMPLE — rotation continue ===
app.on('update', delta => {
  app.rotation.y += 1.0 * delta
})

=== CE QUI N'EXISTE PAS — NE JAMAIS UTILISER ===
  ❌ app.create('iframe')
  ❌ app.create('text') — utilise 'uitext' dans un 'ui'
  ❌ app.create('plane') — utilise mesh { type: 'plane' }
  ❌ app.traverse()
  ❌ world.open() sans vérifier world.isClient

=== RÈGLES DE GÉNÉRATION ===
- Code JavaScript brut uniquement. Zéro markdown, zéro \`\`\`, zéro explication.
- app.configure([...]) TOUJOURS en premier si des props sont nécessaires.
- Première ligne optionnelle : // PROPS: {"key": "defaultValue"} pour l'UI du builder.
- N'utilise QUE les nodes et APIs documentés ci-dessus.
- Pas d'import, pas de require, pas de module ES.
- Pour ouvrir des liens : toujours vérifier world.isClient avant world.open().
- TOUJOURS masquer le cube placeholder par défaut en ajoutant ces lignes juste après app.configure() :
    const block = app.get('Block')
    if (block) block.active = false`

export default function AiScriptGenerator({ onScriptGenerated, onPropsGenerated }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `${HYPERFY_CONTEXT}

=== DEMANDE ===
${prompt}

Génère le script Hyperfy index.js complet.
- Utilise app.configure([...]) pour déclarer les champs configurables (URL, vitesse, etc.)
- Lis les valeurs avec props.xxx
- Si des props configurables existent, ajoute aussi en première ligne : // PROPS: {"key": "defaultValue"} (pour l'UI du builder)
- N'utilise QUE les nodes et APIs documentés ci-dessus.
- Code JavaScript brut uniquement, aucun markdown.`,
        model: 'claude_sonnet_4_6',
      })

      // Extract props from the first comment line if present
      const lines = result.trim().split('\n')
      let propsData = {}
      let scriptLines = lines

      if (lines[0]?.startsWith('// PROPS:')) {
        try {
          propsData = JSON.parse(lines[0].replace('// PROPS:', '').trim())
        } catch {}
        scriptLines = lines.slice(1)
      }

      const script = scriptLines.join('\n').trim()
      onScriptGenerated(script)
      if (Object.keys(propsData).length > 0) {
        onPropsGenerated(propsData)
      }
    } catch (e) {
      setError(e?.message || 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Décris ce que tu veux créer…
Ex : Une app qui affiche un site web ou une vidéo YouTube dans le monde. Il faut pouvoir configurer l'URL. Afficher en grand devant le joueur."
        rows={5}
        className="resize-none"
      />
      <Button
        onClick={generate}
        disabled={loading || !prompt.trim()}
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {loading
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Génération en cours…</>
          : <><Sparkles className="w-4 h-4 mr-2" />Générer le script avec l'IA</>
        }
      </Button>
      {error && (
        <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">
          ⚠️ {error}
        </p>
      )}
      {loading && (
        <p className="text-xs text-muted-foreground text-center animate-pulse">
          L'IA analyse ta description et écrit le script Hyperfy…
        </p>
      )}

      <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 flex gap-2.5 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/70" />
        <div className="leading-relaxed space-y-1">
          <p><strong className="text-foreground">Nodes 3D :</strong> action, video, image, audio, mesh, collider, rigidbody, group, anchor, particles</p>
          <p><strong className="text-foreground">Nodes UI monde :</strong> ui, uiview, uitext, uiimage — pour afficher du texte et des images en overlay dans la scène</p>
          <p><strong className="text-foreground">Liens externes :</strong> <code className="text-foreground">world.open(url, true)</code> pour ouvrir dans un nouvel onglet. Les vidéos nécessitent une URL MP4 directe (pas YouTube).</p>
        </div>
      </div>
    </div>
  )
}