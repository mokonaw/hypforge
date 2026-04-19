import React, { useState } from 'react'
import { Sparkles, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { base44 } from '@/api/base44Client'

const HYPERFY_CONTEXT = `Tu es un expert du scripting Hyperfy V2.
Hyperfy est un moteur de monde virtuel 3D. Les apps Hyperfy sont des scripts JavaScript qui s'exécutent dans le runtime Hyperfy.

Règles importantes du runtime Hyperfy :
- L'objet global principal est \`app\` (représente l'entité 3D dans la scène)
- \`world\` donne accès au monde (joueurs, etc.)
- \`app.on('update', delta => { ... })\` pour la boucle d'animation (delta en secondes)
- \`app.position\`, \`app.rotation\`, \`app.scale\` pour transformer l'objet
- Pour créer des actions cliquables : \`const action = app.create('action'); action.label = '...'; action.distance = 2; action.onTrigger = () => {...}; app.add(action)\`
- Pour afficher du texte 3D : \`const text = app.create('text'); text.value = '...'; app.add(text)\`
- Pour jouer un son : \`const audio = app.create('audio'); audio.src = 'asset://...'; app.add(audio)\`
- Pour afficher une image/vidéo/iframe : \`const ui = app.create('ui'); ui.width = 1; ui.height = 0.5625; ...\` — utilise app.create('video') pour les vidéos avec une prop \`src\` (URL), et pour les iframes/sites web utilise app.create('iframe') avec \`src\` (URL)
- Pour les iframes/web : \`const iframe = app.create('iframe'); iframe.src = url; iframe.width = 1920; iframe.height = 1080; app.add(iframe)\`
- Pour les vidéos YouTube et streaming : préfère app.create('iframe') avec l'URL YouTube embed (https://www.youtube.com/embed/VIDEO_ID?autoplay=1)
- \`props\` contient les paramètres configurables de l'app (définis dans blueprint.props). Utilise \`props.nomDuChamp\` pour y accéder.
- Les props sont définies dans le blueprint et accessibles via props. Ex: si l'utilisateur veut configurer une URL, utilise \`props.url\` dans le script.
- Pas d'import, pas de require, pas de module ES. Tout est global.
- Le script s'exécute dans un contexte sandboxé, sans accès au DOM, window, document.

Génère UNIQUEMENT le code JavaScript du script, sans markdown, sans explication, sans \`\`\`javascript. Juste le code brut.`

export default function AiScriptGenerator({ onScriptGenerated, onPropsGenerated }) {
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true)
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `${HYPERFY_CONTEXT}

Description de l'app à créer :
${prompt}

Génère le script Hyperfy index.js complet pour cette app. Si l'app nécessite des paramètres configurables (comme une URL, une couleur, un texte, une vitesse...), utilise \`props.nomDuChamp\` dans le script.
Aussi, retourne les props nécessaires dans un commentaire en première ligne sous la forme: // PROPS: {"nomDuChamp": "valeurDefaut", ...}

Exemple pour une app avec une URL :
// PROPS: {"url": "https://example.com"}
const iframe = app.create('iframe')
iframe.src = props.url || 'https://example.com'
...`,
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
    </div>
  )
}