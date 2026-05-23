import React, { useState } from 'react'
import { Sparkles, Loader2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { base44 } from '@/api/base44Client'

const HYPERFY_CONTEXT = `Tu es un expert du scripting Hyperfy V2.
Hyperfy est un moteur de monde virtuel 3D. Les apps Hyperfy sont des scripts JavaScript qui s'exécutent dans le runtime Hyperfy.

=== RÈGLES STRICTES DU RUNTIME HYPERFY V2 ===

GLOBALS DISPONIBLES : app, world, config, fetch, num, str, uuid, setTimeout, clearTimeout

CRITIQUE : L'objet de configuration s'appelle config, PAS props.
- Lire les valeurs avec config.monChamp (ex: config.url, config.width)
- JAMAIS utiliser props.xxx ou props.onChange — ça n'existe pas dans Hyperfy

⚠️ IMPORTANT : setInterval N'EXISTE PAS dans Hyperfy V2.
⚠️ CRITIQUE : app.on('update', ...) N'EXISTE PAS et CRASHE l'import — NE JAMAIS UTILISER.
⚠️ CRITIQUE : world.getPlayer() N'EXISTE PAS et CRASHE — NE JAMAIS UTILISER.

--- app ---
  app.position.set(x, y, z) — ou app.position.x = ...
  app.rotation.set(x, y, z) — rotation en radians
  app.scale.set(x, y, z)
  app.add(node) — ajoute un nœud enfant
  app.remove(node) — retire un nœud
  app.get('NomNode') — récupère un nœud enfant par son nom (ex: nœud GLB nommé dans Blender)
  app.keepActive = true — empêche l'app de se désactiver quand hors champ (utile pour webview, audio, etc.)
  app.configure([...fields]) — déclare les champs éditables dans l'UI Hyperfy (TOUJOURS en premier dans le script)
  app.onDispose = () => {...} — nettoyage quand l'app est détruite (supprimer DOM, nodes, etc.)

--- config ---
  config = valeurs des champs définis par app.configure()
  Lire avec config.monChamp (ex: config.url, config.width)
  JAMAIS de déstructuration
  Pour écouter les changements : app.on('config', () => applyAll())

--- world ---
  world.isClient — boolean, true si exécuté côté navigateur
  world.isServer — boolean
  world.open(url, newTab) — ouvre une URL (newTab = true pour nouvel onglet)
  world.add(node) — ajoute un node au monde (niveau world, pas app)
  world.remove(node) — retire un node du monde
  world.attach(vrm) — attache un VRM/node au monde sans modifier sa position
  world.on('enter', player => {...}) — joueur entre dans le monde (serveur)
  world.on('leave', player => {...}) — joueur quitte le monde (serveur)
  world.on('chat', msg => {...}) — écoute les messages du chat monde (serveur) ; msg = { id, from, fromId, body, createdAt }
  world.chat(msg, broadcast) — envoie un message dans le chat monde (serveur) ; msg = { id, from, fromId, body, createdAt }, broadcast = true pour tous
  world.getTimestamp() — timestamp monde actuel (number)

--- app (propriétés supplémentaires) ---
  app.isMoving — boolean, true si le joueur est en train de déplacer l'app (utile dans onPointerDown)

--- app.send / app.on — communication client ↔ serveur ---
  app.send('event:name', data) — envoie un événement à TOUS les clients (depuis serveur) ou au serveur (depuis client)
  app.send('event:name', data, playerId) — envoie un événement à UN seul client (depuis serveur uniquement)
  app.on('event:name', (data, client) => {...}) — écoute un événement (fonctionne côté client ET serveur)
  Exemple pattern complet :
    // Client → Serveur
    app.send('player:action', { playerId: localPlayer.id, value: 42 })
    // Serveur écoute
    app.on('player:action', (data, client) => { app.send('server:response', { result: data.value * 2 }) })
    // Client écoute la réponse
    app.on('server:response', (data) => { console.log(data.result) })

--- INTERACTION POINTEUR sur les nodes ---
  node.cursor = 'pointer' — change le curseur au survol
  node.onPointerDown = () => {...} — callback au clic sur ce node
  Pour trouver un mesh dans le GLB :
    function findFirstMesh(root) {
      const stack = [root]
      while (stack.length) {
        const n = stack.pop()
        if (n && n.name === 'mesh') return n
        if (n && n.children) for (let i = n.children.length-1; i >= 0; i--) stack.push(n.children[i])
      }
      return null
    }
    const target = findFirstMesh(app)

--- config.file — asset uploadé ---
  config.file?.url — URL de l'asset uploadé (string ou undefined)
  Toujours vérifier : const fileUrl = config.file?.url ? String(config.file.url).trim() : ''

=== NODES DISPONIBLES via app.create('nom') ===

--- 'webview' — navigateur web CSS3D dans le monde (PRÉFÉRER à iframe DOM) ---
  Créer: app.create('webview')
  .space = 'world'
  .src = 'https://...' — URL à afficher
  .width / .height (number, mètres)
  .factor (number, 50–800, résolution — défaut 150, >150 impacte les perfs)
  .doubleside (boolean)
  .position.set(x, y, z)
  holder.add(webview) — ajouter à un group
  ✅ Supporte YouTube embed, Twitch player, et toute URL directe
  ❌ Ne pas créer si src est vide — provoque une erreur engine

--- 'prim' — primitif 3D avec matériau (remplace 'mesh') ---
  Créer: app.create('prim') SANS second argument
  Puis configurer : prim.type = 'box', prim.scale.set(w,h,d), prim.position.set(x,y,z), prim.color = '#111111', etc.
  ⚠️ JAMAIS passer d'objet de config à app.create('prim', {...}) — syntaxe non supportée
  .color (string hex) — modifiable après création
  .visible (boolean)
  app.add(prim) ou holder.add(prim) selon la hiérarchie souhaitée
  ⚠️ HIÉRARCHIE : si tu crées un group (holder), TOUS les nœuds enfants doivent être ajoutés via holder.add(), jamais via app.add() directement

--- 'action' — interaction cliquable ---
  .label (string)
  .distance (number, défaut 3)
  .duration (number, 0 = instantané, 0.5 = maintien)
  .onTrigger = () => {}
  .onStart = () => {}
  .onCancel = () => {}
  .position.set(x, y, z)
  app.add(action)

--- 'ui' — interface utilisateur en espace monde ---
  Créer: app.create('ui', { space: 'world', width: 350, height: 140, size: 0.01, backgroundColor: 'rgba(0,0,0,0)', borderRadius: 10, padding: 10 })
  .position.set(x, y, z)
  .active (boolean) — afficher/masquer
  .add(uiview)
  app.add(ui)

--- 'uiview' — conteneur layout dans un 'ui' ---
  Créer: app.create('uiview', { flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 0 })
  .add(child) — uitext, uiimage, uiview enfants

--- 'uitext' — texte dans un 'ui' ---
  Créer: app.create('uitext', { value: 'Mon texte', fontSize: 24, color: 'white', textAlign: 'center' })

--- 'uiimage' — image dans un 'ui' ---
  Créer: app.create('uiimage', { src: 'https://...', width: 240, height: 148, objectFit: 'contain', borderRadius: 8 })
  Pour les assets uploadés: src = props.imageFile.url.replace('asset://', '/assets/')

--- 'video' — écran vidéo 3D (MP4 direct uniquement) ---
  .src (string, URL MP4 directe — PAS YouTube embed)
  .width / .height / .aspect / .loop / .volume
  .play() / .pause() / .stop()
  app.add(video)

--- 'audio' — son 3D ---
  Créer: app.create('audio', { src, volume, loop, spatial, group: 'music'|'sfx'|'voice' })
  .src (string URL — mp3, ogg, etc.)
  .loop (boolean)
  .volume (number 0-1)
  .spatial (boolean — false = global/non-spatial)
  .group ('music'|'sfx'|'voice') — groupe de mixage
  .play() — retourne une Promise, toujours gérer l'erreur : const p = sound.play(); if (p?.catch) p.catch(() => {})
  .pause()
  .stop()
  app.add(audio)

--- 'controller' — contrôleur de personnage (pour NPC/agents) ---
  Créer: app.create('controller')
  ctrl.position.copy(app.position)
  ctrl.quaternion.copy(app.quaternion)
  ctrl.add(vrm) — attacher un VRM au controller
  world.add(ctrl) — ajouter le controller au monde

--- 'nametag' — étiquette nom flottante au-dessus d'un personnage ---
  Créer: app.create('nametag')
  nametag.label = 'Nom du personnage'
  nametag.position.y = 2
  nametag.active = boolean — afficher/masquer
  vrm.add(nametag) — ajouter au VRM

--- 'mesh' — primitif simple (utiliser 'prim' si matériau nécessaire) ---
  .type ('box'|'sphere'|'cylinder'|'plane'|'capsule')
  .width / .height / .depth / .color / .castShadow / .receiveShadow
  app.add(mesh)

--- 'collider' — collision ---
  .type ('box'|'sphere'|'capsule'|'geometry')
  .trigger (boolean)
  .setSize(w, h, d) — définir les dimensions
  rigidbody.add(collider) — TOUJOURS ajouter à un rigidbody
  app.add(collider) si standalone

--- 'rigidbody' — physique (requis pour les colliders statiques) ---
  .type ('dynamic'|'static'|'kinematic')
  app.add(rigidbody)
  rigidbody.add(collider)

--- 'group' — conteneur/pivot ---
  .position.set(x,y,z)
  .rotation.set(x,y,z)
  .add(child)
  app.add(group)

--- 'anchor' / 'particles' / 'lod' — usages avancés ---

--- CLONAGE de nodes ---
  node.clone(true) — clone un node et tous ses enfants (deep clone)
  Utile pour dupliquer un template GLB défini dans Blender :
    const template = app.get('MyNode')
    template.visible = false  // cacher le template
    const clone = template.clone(true)
    clone.visible = true
    clone.position.set(x, y, z)
    app.add(clone)

--- TRIGGER (zone de collision) ---
  node.onTriggerEnter = (result) => {...} — callback quand un objet entre dans la zone trigger
  (nécessite un collider avec trigger: true sur le node)

--- GLOBALS MATHÉMATIQUES ---
  new Vector3(x, y, z) — vecteur 3D
  new Euler(x, y, z) — angles d'Euler
  new Quaternion() — quaternion de rotation
  new Matrix4() — matrice 4x4
  v.setFromMatrixPosition(node.matrixWorld) — extraire position monde d'un node
  e.setFromRotationMatrix(node.matrixWorld).reorder('YXZ').y — extraire rotation Y monde
  vrm.quaternion.setFromAxisAngle(UP, angle) — faire pivoter un VRM vers un angle
  vrm.setEmote(url) — jouer une animation emote sur un VRM (url = props.emoteFile.url)

--- app (propriétés avancées) ---
  app.instanceId — identifiant unique de l'instance de l'app dans le monde
  app.state — objet d'état partagé côté serveur, accessible côté client via app.state
  app.config — alias de props (lire les champs configurables depuis le serveur aussi)

=== CHAMPS app.configure() ===
Types disponibles :
  { type: 'section', key, label } — séparateur visuel de section (pas de valeur)
  { type: 'text', key, label, placeholder, initial }
  { type: 'textarea', key, label, placeholder, initial }
  { type: 'number', key, label, dp, step, bigStep, initial }
  { type: 'range', key, label, min, max, step, initial }
  { type: 'toggle', key, label, trueLabel, falseLabel, initial }
  { type: 'switch', key, label, options: [{label,value}], initial } — radio boutons
  { type: 'select', key, label, options: [{label,value}], initial }
  { type: 'color', key, label, initial } — color picker hex
  { type: 'file', key, label, kind: 'texture'|'model'|'audio'|'emote' }
  Champs conditionnels (affichés seulement si condition remplie) :
  { type: 'text', key: 'myField', label: 'Label', when: [{ key: 'switchKey', op: 'eq', value: 'valeur' }] }
  — when: tableau de conditions, op peut être 'eq' (égal)

=== PROPRIÉTÉS UI AVANCÉES ===
  ui.billboard = 'full' — toujours face à la caméra
  ui.pivot = 'top-center'|'center'|etc.
  ui.flexDirection = 'row'|'column'
  ui.justifyContent = 'flex-start'|'center'|'flex-end'
  ui.alignItems = 'stretch'|'center'|'flex-start'
  ui.gap = number
  ui.border = '2px solid #color'
  ui.borderRadius = number
  ui.boxShadow = '0 0 20px #color'
  ui.visible = boolean
  uitext.fontFamily = 'monospace'|'sans-serif'
  uitext.fontWeight = 'bold'|'100'|'500'|'600'
  uitext.lineHeight = 1.4 — interligne
  uitext.textShadow = '0 0 10px #color'
  uitext.letterSpacing = '2px'

=== PATTERN RECOMMANDÉ — applyAll avec config ===
// Toujours structurer le script avec des fonctions apply* appelées au init ET sur changement de config
function applyAll() {
  // recalcule et applique toutes les dimensions, positions, visibilités
}
applyAll()
// Écouter les changements de config (optionnel, selon la version Hyperfy)
// app.on('config', () => applyAll())

=== EMBED YOUTUBE / TWITCH — règles critiques ===
⚠️ YouTube REQUIERT &muted=1 dans l'URL embed sinon la politique autoplay des navigateurs bloque la vidéo (son audible mais image noire/figée).
⚠️ webview.doubleside = true — TOUJOURS mettre true pour éviter que la face arrière soit invisible.

Fonction buildEmbedUrl à utiliser systématiquement pour YouTube/Twitch :
function buildEmbedUrl(rawUrl, autoplay) {
  const url = String(rawUrl || '').trim()
  if (!url) return ''
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  if (ytMatch) {
    const ap = autoplay ? '1' : '0'
    return 'https://www.youtube.com/embed/' + ytMatch[1] + '?autoplay=' + ap + '&muted=1&rel=0'
  }
  const twitchChannel = url.match(/twitch\.tv\/([A-Za-z0-9_]+)$/)
  if (twitchChannel) return 'https://player.twitch.tv/?channel=' + twitchChannel[1] + '&parent=hyperfy.io&muted=false'
  const twitchVod = url.match(/twitch\.tv\/videos\/([0-9]+)/)
  if (twitchVod) return 'https://player.twitch.tv/?video=' + twitchVod[1] + '&parent=hyperfy.io'
  return url
}

=== EXEMPLE — webview YouTube/Twitch ===
app.configure([
  { type: 'text', key: 'src', label: 'URL YouTube/Twitch/Web', initial: '' },
  { type: 'number', key: 'width', label: 'Largeur (m)', initial: 3 },
  { type: 'number', key: 'factor', label: 'Résolution', initial: 150 },
])

const holder = app.create('group')
app.add(holder)
let webview = null
let placeholder = null

function buildEmbedUrl(rawUrl) {
  const url = String(rawUrl || '').trim()
  if (!url) return ''
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  if (ytMatch) return 'https://www.youtube.com/embed/' + ytMatch[1] + '?autoplay=1&muted=1&rel=0'
  const twitchChannel = url.match(/twitch\.tv\/([A-Za-z0-9_]+)$/)
  if (twitchChannel) return 'https://player.twitch.tv/?channel=' + twitchChannel[1] + '&parent=hyperfy.io'
  const twitchVod = url.match(/twitch\.tv\/videos\/([0-9]+)/)
  if (twitchVod) return 'https://player.twitch.tv/?video=' + twitchVod[1] + '&parent=hyperfy.io'
  return url
}

function applyAll() {
  const src = buildEmbedUrl(config.src)
  const W = Math.max(0.1, Number(config.width ?? 3))
  const H = W / (16/9)
  const factor = Math.max(50, Math.min(800, Number(config.factor ?? 150)))

  holder.position.set(0, H/2, 0)

  if (src) {
    if (placeholder) { holder.remove(placeholder); placeholder = null }
    if (!webview) { webview = app.create('webview'); holder.add(webview) }
    webview.space = 'world'
    webview.src = src
    webview.width = W
    webview.height = H
    webview.factor = factor
    webview.doubleside = true
    webview.active = true
  } else {
    if (webview) { holder.remove(webview); webview = null }
    if (!placeholder) {
      placeholder = app.create('prim')
      placeholder.type = 'box'
      placeholder.scale.set(W, H, 0.02)
      placeholder.color = '#444444'
      placeholder.castShadow = false
      placeholder.receiveShadow = false
      holder.add(placeholder)
    }
  }
}
applyAll()
app.on('config', () => applyAll())

⛔ NE PAS UTILISER app.on('update') — N'EXISTE PAS dans Hyperfy V2, CRASHE À L'IMPORT.
⛔ NE PAS UTILISER world.getPlayer() / world.entities.getLocalPlayer() — N'EXISTE PAS dans Hyperfy V2, CRASHE.
⛔ NE PAS UTILISER setTimeout pour simuler une boucle de proximité — provoque des comportements imprévisibles.
⛔ NE PAS déclarer des variables (isNear, isNearby, lastDist, volumeTimeout, etc.) liées à une fonctionnalité non implémentable — code mort qui CRASHE.
⛔ NE JAMAIS créer de fonctions setupVolumeCheck / checkVolume / updateVolume — webview.volume n'existe pas dans Hyperfy V2.
⛔ NE JAMAIS lire props.proximityDistance sans le déclarer dans app.configure() — et si tu ne peux pas implémenter la logique de proximité, ne déclare pas ce champ du tout.
⛔ Si l'utilisateur demande une détection de proximité, propose une action cliquable via app.create('action') à la place.
⛔ NE JAMAIS appeler une fonction qui n'est pas définie dans le script (ex: updateVolume, scheduleProximityCheck, setupVolumeCheck si non définies).

=== CE QUI N'EXISTE PAS — NE JAMAIS UTILISER ===
  ❌ setInterval / clearInterval — N'EXISTENT PAS, utiliser app.on('update')
  ❌ app.create('iframe') — utiliser 'webview'
  ❌ app.create('image') — N'EXISTE PAS dans Hyperfy V2, provoque un crash à l'import ; utiliser 'webview' pour afficher une URL image, ou un 'prim' { type: 'box' } comme placeholder visuel
  ❌ app.create('text') — utiliser 'uitext' dans un 'ui'
  ❌ app.create('plane') — utiliser prim { type: 'box' } ou mesh
  ❌ app.traverse()
  ❌ world.open() sans vérifier world.isClient
  ❌ document.createElement() — utiliser 'webview' à la place
  ❌ .scale.set() ou .position.set() sur un prim avant holder.add() — passer scale/position dans la config initiale
  ❌ app.add(node) si node appartient à un holder/group — utiliser holder.add(node)
  ❌ app.get('Block') sans try/catch — et NE JAMAIS ajouter cette ligne si aucun modèle GLB n'est utilisé
  ❌ Déclarer des variables (isNear, lastDist, proximityDistance) liées à une boucle update qui n'existe pas — code mort incohérent

=== RÈGLES DE GÉNÉRATION ===
- Code JavaScript brut uniquement. Zéro markdown, zéro \`\`\`, zéro explication.
- app.configure([...]) TOUJOURS en premier si des props sont nécessaires.
- Première ligne optionnelle : // PROPS: {"key": "defaultValue"} pour l'UI du builder.
- N'utilise QUE les nodes et APIs documentés ci-dessus.
- Pas d'import, pas de require, pas de module ES.
- Pour ouvrir des liens : toujours vérifier world.isClient avant world.open().
- Pour les webviews : NE PAS créer si src est vide.
- Utiliser app.onDispose pour nettoyer les nodes et effets de bord.
- N'ajouter la ligne app.get('Block') QUE si un modèle GLB est inclus dans le blueprint. Si l'app n'a pas de modèle GLB, NE PAS ajouter cette ligne.
- JAMAIS écrire if (condition) { ... return } else { ... } — le else est du code mort après un return.
- TOUJOURS utiliser config.xxx pour lire les valeurs configurables, JAMAIS props.xxx.
- Garder if (world.isClient) { ... } pour wrapper tout le code client (pas de return en top-level).
- app.keepActive = true — optionnel, seulement si nécessaire (webview, audio).
- app.onDispose — optionnel, si nettoyage nécessaire.

- TOUJOURS sécuriser l'accès aux assets uploadés avec try/catch :
    function getFileUrl(propVal) {
      try {
        if (!propVal) return ''
        if (typeof propVal === 'string') return propVal.trim()
        if (propVal && propVal.url) return String(propVal.url).trim()
      } catch(e) {}
      return ''
    }

- L'appel initial à applyAll() peut être direct : applyAll() (le wrapping try/catch masque les vraies erreurs, éviter sauf si explicitement nécessaire).

- RÈGLES ABSOLUES pour la hiérarchie des nœuds :
  1. Un nœud enfant d'un group/holder NE DOIT PAS avoir app.add() — utiliser SEULEMENT holder.add(). app.add() et holder.add() sur le même nœud = double attach = CRASH.
     Exemple CORRECT :
       screenshotView = app.create('prim', { type: 'box', scale: [W, H, 0.02], ... })
       holder.add(screenshotView)   // ← SEULEMENT holder.add(), jamais app.add() sur un enfant de holder
     Exemple INCORRECT (crash) :
       screenshotView = app.create('prim', { ... })
       app.add(screenshotView)      // ← NE PAS FAIRE si le nœud va dans holder
       holder.add(screenshotView)
  2. app.add() est réservé aux nœuds de premier niveau (holder/group, actions, rigidbody, audio...) — jamais sur leurs enfants
  3. Les prim doivent avoir scale et position dans leur config initiale, pas via .scale.set() après
  4. Ne jamais ajouter de props dans app.configure() pour des fonctionnalités qui ne sont pas implémentées dans le script (ex: proximityDistance sans boucle update)
  5. app.keepActive = true se place TOUJOURS juste après if (!world.isClient) return, avant app.configure()`

export default function AiScriptGenerator({ onScriptGenerated, onPropsGenerated, prompt, onPromptChange }) {
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
- Lis les valeurs avec config.xxx (JAMAIS props.xxx)
- Si des champs configurables existent, ajoute aussi en première ligne : // PROPS: {"key": "defaultValue"} (pour l'UI du builder)
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
      const msg = e?.message || ''
      if (msg.includes('limit of integrations')) {
        setError('Limite mensuelle d\'intégrations IA atteinte. Merci d\'upgrader ton plan Base44 pour continuer à générer des scripts.')
      } else {
        setError(msg || 'Erreur inconnue')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        value={prompt}
        onChange={e => onPromptChange(e.target.value)}
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
          <p><strong className="text-foreground">Nodes 3D :</strong> action, video, audio, mesh, collider, rigidbody, group, anchor, particles</p>
          <p><strong className="text-foreground">Nodes UI monde :</strong> ui, uiview, uitext, uiimage — pour afficher du texte et des images en overlay dans la scène</p>
          <p><strong className="text-foreground">Liens externes :</strong> <code className="text-foreground">world.open(url, true)</code> pour ouvrir dans un nouvel onglet. Les vidéos nécessitent une URL MP4 directe (pas YouTube).</p>
        </div>
      </div>
    </div>
  )
}