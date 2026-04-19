import React, { useState } from 'react'
import { Sparkles, Loader2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { base44 } from '@/api/base44Client'

const HYPERFY_CONTEXT = `Tu es un expert du scripting Hyperfy V2.
Hyperfy est un moteur de monde virtuel 3D. Les apps Hyperfy sont des scripts JavaScript qui s'exécutent dans le runtime Hyperfy.

=== RÈGLES STRICTES DU RUNTIME HYPERFY ===

GLOBAL DISPONIBLES : app, world, props, fetch, num, str, uuid, setTimeout, setInterval, clearTimeout, clearInterval

app = l'entité racine de l'app dans la scène.
  app.position.x / .y / .z — position dans le monde
  app.rotation.x / .y / .z — rotation (radians)
  app.scale.x / .y / .z — échelle
  app.add(node) — ajoute un nœud enfant
  app.remove(node) — retire un nœud
  app.on('update', delta => {...}) — boucle de rendu (delta en secondes)
  app.on('fixedUpdate', delta => {...}) — physique fixe
  app.configure([...fields]) — déclare les champs éditables dans l'UI Hyperfy

props = objet contenant les valeurs des champs configurés via app.configure()
  Toujours lire via props.monChamp (pas de déstructuration)

world.getPlayer() — retourne le joueur local
world.on('join', player => {...}) — joueur rejoint
world.on('leave', player => {...}) — joueur quitte

=== NODES DISPONIBLES (app.create('nom')) ===
Seuls ces nodes existent. N'utilise JAMAIS d'autres noms.

'action' — bouton d'interaction cliquable
  .label (string) — texte affiché
  .distance (number) — distance de déclenchement
  .duration (number) — durée de maintien (0 = instantané)
  .onTrigger = () => {} — callback au déclenchement
  .onStart = () => {} — callback au début de maintien
  .onCancel = () => {} — callback si annulé
  → Doit être ajouté avec app.add(action)

'video' — écran vidéo 3D (MP4 direct uniquement, PAS YouTube embed ni iframe)
  .src (string) — URL directe du fichier MP4
  .width (number) — largeur en mètres
  .height (number) — hauteur en mètres
  .aspect (number) — ratio (défaut 16/9)
  .loop (boolean)
  .volume (number, 0-1)
  .play() / .pause() / .stop()
  → Pour YouTube : impossible nativement. Conseille d'utiliser une URL MP4 directe.

'image' — image 3D plane
  .src (string) — URL de l'image (https:// ou asset://)
  .width (number)
  .height (number)
  .fit ('none'|'cover'|'contain')
  .color (string) — couleur de fond

'audio' — son 3D ou ambiant
  .src (string) — URL MP3/OGG
  .loop (boolean)
  .volume (number)
  .spatial (boolean)
  .play() / .pause() / .stop()

'mesh' — maillage 3D primitif
  .type ('box'|'sphere'|'cylinder'|'plane'|'capsule')
  .width / .height / .depth (number)
  .color (string hex ou 'transparent')
  .castShadow / .receiveShadow (boolean)

'collider' — collision physique
  .type ('box'|'sphere'|'capsule'|'geometry')
  .width / .height / .depth (number)
  .trigger (boolean) — zone sans friction (trigger volume)

'rigidbody' — corps physique
  .type ('dynamic'|'static'|'kinematic')
  Enfants colliders et meshes s'y attachent

'group' — conteneur/pivot
  Permet de grouper des nœuds et les transformer ensemble

'anchor' — point d'ancrage pour avatars
  .position.x/y/z

'particles' — système de particules
  .src (string) — URL fichier particules

'lod' — Level of Detail
  Contient des enfants affichés selon la distance

IMPORTANT — ce qui N'EXISTE PAS dans Hyperfy :
  ❌ app.create('iframe') — n'existe pas
  ❌ app.create('text') — n'existe pas
  ❌ app.create('ui') — n'existe pas
  ❌ app.create('plane') — utilise mesh avec type 'plane'
  ❌ app.traverse() — n'existe pas
  ❌ app.configure() n'est pas un setter de paramètres, c'est la déclaration UI

=== app.configure() ===
Permet de définir des champs éditables dans l'interface Hyperfy.
Exemple :
  app.configure([
    { type: 'text', key: 'url', label: 'URL vidéo', initial: 'https://...' },
    { type: 'number', key: 'speed', label: 'Vitesse', initial: 1 },
    { type: 'boolean', key: 'loop', label: 'Boucle', initial: true },
  ])
  // Puis lire avec props.url, props.speed, props.loop

Types disponibles dans configure : 'text', 'number', 'boolean', 'select'
Pour 'select' : ajouter options: [{label:'A',value:'a'},{label:'B',value:'b'}]

=== EXEMPLE COMPLET — écran vidéo ===
app.configure([
  { type: 'text', key: 'src', label: 'URL vidéo MP4', initial: '' },
  { type: 'boolean', key: 'loop', label: 'Boucle', initial: true },
])

const screen = app.create('video')
screen.src = props.src || ''
screen.width = 4
screen.height = 2.25
screen.aspect = 16 / 9
screen.loop = props.loop ?? true
app.add(screen)

=== EXEMPLE COMPLET — rotation continue ===
app.on('update', delta => {
  app.rotation.y += 1.0 * delta
})

=== RÈGLES DE GÉNÉRATION ===
- Génère UNIQUEMENT du code JavaScript brut. Pas de markdown, pas de \`\`\`, pas d'explication.
- Première ligne OPTIONNELLE : // PROPS: {"key": "defaultValue"} pour les champs configurables (legacy, préfère app.configure())
- N'utilise QUE les nodes et APIs listés ci-dessus.
- Si la demande est impossible (ex: iframe YouTube), génère le script le plus proche possible et ajoute un commentaire // NOTE: expliquant la limitation.
- Pas d'import, pas de require, pas de module ES.`

export default function AiScriptGenerator({ onScriptGenerated, onPropsGenerated }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
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
      console.error(e)
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
      {loading && (
        <p className="text-xs text-muted-foreground text-center animate-pulse">
          L'IA analyse ta description et écrit le script Hyperfy…
        </p>
      )}

      <div className="rounded-lg border border-border/60 bg-secondary/20 p-3 flex gap-2.5 text-xs text-muted-foreground">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-primary/70" />
        <div className="leading-relaxed space-y-1">
          <p><strong className="text-foreground">Nodes disponibles :</strong> action, video, image, audio, mesh, collider, rigidbody, group, anchor, particles</p>
          <p><strong className="text-foreground">Limitation :</strong> Hyperfy ne supporte pas les iframes. Pour les vidéos, seules les URLs MP4 directes fonctionnent (pas YouTube embed). L'IA en sera informée.</p>
        </div>
      </div>
    </div>
  )
}