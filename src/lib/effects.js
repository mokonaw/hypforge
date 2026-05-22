// Library of preset Hyperfy effects
// Each effect produces an index.js script and defines configurable props (rendered via app.configure)

export const EFFECTS = [
  {
    id: 'rotate',
    name: 'Rotation',
    description: "Fait tourner l'objet en continu autour d'un axe.",
    icon: 'RefreshCw',
    params: [
      { key: 'speed', label: 'Vitesse (rad/s)', type: 'number', default: 0.5, min: 0, max: 10, step: 0.1 },
      { key: 'axis', label: 'Axe', type: 'select', default: 'y', options: [
        { value: 'x', label: 'X' },
        { value: 'y', label: 'Y' },
        { value: 'z', label: 'Z' },
      ]},
    ],
    buildScript: (p) => `// Rotation continue autour de l'axe ${p.axis.toUpperCase()}
const speed = ${num(p.speed, 0.5)}
const axis = '${p.axis}'

app.on('update', delta => {
  app.rotation[axis] += speed * delta
})
`,
  },
  {
    id: 'float',
    name: 'Flottement',
    description: 'Fait flotter doucement l\'objet de haut en bas (bob).',
    icon: 'Waves',
    params: [
      { key: 'amplitude', label: 'Amplitude (m)', type: 'number', default: 0.3, min: 0, max: 5, step: 0.05 },
      { key: 'frequency', label: 'Fréquence (Hz)', type: 'number', default: 1, min: 0, max: 5, step: 0.1 },
    ],
    buildScript: (p) => `// Flottement vertical sinusoïdal
const amplitude = ${num(p.amplitude, 0.3)}
const frequency = ${num(p.frequency, 1)}
const baseY = app.position.y
let t = 0

app.on('update', delta => {
  t += delta
  app.position.y = baseY + Math.sin(t * frequency * Math.PI * 2) * amplitude
})
`,
  },
  {
    id: 'pulse',
    name: 'Pulsation',
    description: 'Fait pulser la taille de l\'objet (grossir / rétrécir).',
    icon: 'CircleDot',
    params: [
      { key: 'minScale', label: 'Échelle min', type: 'number', default: 0.8, min: 0.1, max: 5, step: 0.05 },
      { key: 'maxScale', label: 'Échelle max', type: 'number', default: 1.2, min: 0.1, max: 5, step: 0.05 },
      { key: 'speed', label: 'Vitesse', type: 'number', default: 2, min: 0, max: 10, step: 0.1 },
    ],
    buildScript: (p) => `// Pulsation d'échelle (sinusoïde)
const minScale = ${num(p.minScale, 0.8)}
const maxScale = ${num(p.maxScale, 1.2)}
const speed = ${num(p.speed, 2)}
let t = 0

app.on('update', delta => {
  t += delta
  const k = (Math.sin(t * speed) + 1) / 2 // 0..1
  const s = minScale + (maxScale - minScale) * k
  app.scale.set(s, s, s)
})
`,
  },
  {
    id: 'orbit',
    name: 'Orbite',
    description: 'Fait orbiter l\'objet autour de sa position de spawn.',
    icon: 'Orbit',
    params: [
      { key: 'radius', label: 'Rayon (m)', type: 'number', default: 2, min: 0, max: 50, step: 0.1 },
      { key: 'speed', label: 'Vitesse (rad/s)', type: 'number', default: 1, min: 0, max: 10, step: 0.1 },
      { key: 'height', label: 'Hauteur (m)', type: 'number', default: 0, min: -10, max: 10, step: 0.1 },
    ],
    buildScript: (p) => `// Orbite autour de la position de spawn
const radius = ${num(p.radius, 2)}
const speed = ${num(p.speed, 1)}
const height = ${num(p.height, 0)}
const origin = { x: app.position.x, y: app.position.y, z: app.position.z }
let t = 0

app.on('update', delta => {
  t += delta
  app.position.x = origin.x + Math.cos(t * speed) * radius
  app.position.z = origin.z + Math.sin(t * speed) * radius
  app.position.y = origin.y + height
})
`,
  },
  {
    id: 'click_toggle',
    name: 'Clic pour activer',
    description: 'Au clic, bascule entre visible et invisible.',
    icon: 'MousePointerClick',
    params: [
      { key: 'label', label: "Texte de l'action", type: 'text', default: 'Activer' },
      { key: 'distance', label: 'Distance (m)', type: 'number', default: 2, min: 0.5, max: 20, step: 0.1 },
    ],
    buildScript: (p) => `// Bascule visible/invisible au clic
const action = app.create('action')
action.label = ${str(p.label, 'Activer')}
action.distance = ${num(p.distance, 2)}
action.position.y = 1.5
let visible = true

action.onTrigger = () => {
  visible = !visible
  app.scale.set(visible ? 1 : 0, visible ? 1 : 0, visible ? 1 : 0)
}
app.add(action)
`,
  },
  {
    id: 'color_cycle',
    name: 'Cycle de couleur',
    description: "Fait défiler la couleur d'émission du matériau (arc-en-ciel).",
    icon: 'Palette',
    params: [
      { key: 'speed', label: 'Vitesse', type: 'number', default: 1, min: 0, max: 10, step: 0.1 },
      { key: 'intensity', label: "Intensité d'émission", type: 'number', default: 1, min: 0, max: 5, step: 0.1 },
    ],
    buildScript: (p) => `// Cycle de couleur sur les matériaux (émission)
const speed = ${num(p.speed, 1)}
const intensity = ${num(p.intensity, 1)}
let t = 0

// Collecte tous les matériaux du modèle (app.traverse n'existe pas en V2)
const materials = []
const stack = [app]
while (stack.length) {
  const n = stack.pop()
  if (!n) continue
  if (n.material) materials.push(n.material)
  if (n.children) for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i])
}

function hsl(h, s, l) {
  // conversion HSL -> RGB 0..1
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 1/6) { r = c; g = x }
  else if (h < 2/6) { r = x; g = c }
  else if (h < 3/6) { g = c; b = x }
  else if (h < 4/6) { g = x; b = c }
  else if (h < 5/6) { r = x; b = c }
  else { r = c; b = x }
  return { r: r + m, g: g + m, b: b + m }
}

app.on('update', delta => {
  t += delta
  const h = (t * speed * 0.1) % 1
  const { r, g, b } = hsl(h, 1, 0.5)
  for (const m of materials) {
    if (m.emissive && m.emissive.setRGB) {
      m.emissive.setRGB(r * intensity, g * intensity, b * intensity)
    }
  }
})
`,
  },
  {
    id: 'look_at_player',
    name: 'Regarde le joueur',
    description: "Fait tourner l'objet pour faire face au joueur le plus proche.",
    icon: 'Eye',
    params: [
      { key: 'smoothing', label: 'Lissage (0 = instantané, 1 = lent)', type: 'number', default: 0.1, min: 0, max: 1, step: 0.05 },
      { key: 'lockY', label: 'Verrouiller l\'axe vertical', type: 'boolean', default: true },
    ],
    buildScript: (p) => `// Regarde le joueur local le plus proche
const smoothing = ${num(p.smoothing, 0.1)}
const lockY = ${bool(p.lockY, true)}

app.on('update', delta => {
  const player = world.getPlayer()
  if (!player) return
  const pos = player.position
  const dx = pos.x - app.position.x
  const dz = pos.z - app.position.z
  let dy = pos.y - app.position.y
  if (lockY) dy = 0
  const target = Math.atan2(dx, dz)
  if (smoothing <= 0) {
    app.rotation.y = target
  } else {
    const diff = target - app.rotation.y
    const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff))
    app.rotation.y += wrapped * (1 - smoothing)
  }
  if (!lockY) {
    app.rotation.x = -Math.atan2(dy, Math.hypot(dx, dz))
  }
})
`,
  },
  {
    id: 'teleport',
    name: 'Téléporteur',
    description: 'Action qui téléporte le joueur à une position donnée.',
    icon: 'Zap',
    params: [
      { key: 'label', label: "Texte de l'action", type: 'text', default: 'Téléporter' },
      { key: 'distance', label: 'Distance (m)', type: 'number', default: 2, min: 0.5, max: 20, step: 0.1 },
      { key: 'x', label: 'Destination X', type: 'number', default: 0, step: 0.5 },
      { key: 'y', label: 'Destination Y', type: 'number', default: 0, step: 0.5 },
      { key: 'z', label: 'Destination Z', type: 'number', default: 0, step: 0.5 },
    ],
    buildScript: (p) => `// Téléporte le joueur au clic
const action = app.create('action')
action.label = ${str(p.label, 'Téléporter')}
action.distance = ${num(p.distance, 2)}
action.position.y = 1.5

const dest = { x: ${num(p.x, 0)}, y: ${num(p.y, 0)}, z: ${num(p.z, 0)} }

action.onTrigger = () => {
  const player = world.getPlayer()
  if (player && player.teleport) {
    player.teleport(dest)
  }
}
app.add(action)
`,
  },
  {
    id: 'spin_and_float',
    name: 'Spin + Flottement',
    description: "Combinaison: rotation Y + flottement vertical (parfait pour collectibles).",
    icon: 'Sparkles',
    params: [
      { key: 'rotSpeed', label: 'Vitesse rotation', type: 'number', default: 1.5, min: 0, max: 10, step: 0.1 },
      { key: 'amplitude', label: 'Amplitude flottement', type: 'number', default: 0.2, min: 0, max: 3, step: 0.05 },
      { key: 'frequency', label: 'Fréquence flottement', type: 'number', default: 1, min: 0, max: 5, step: 0.1 },
    ],
    buildScript: (p) => `// Rotation Y + flottement vertical (style collectible)
const rotSpeed = ${num(p.rotSpeed, 1.5)}
const amplitude = ${num(p.amplitude, 0.2)}
const frequency = ${num(p.frequency, 1)}
const baseY = app.position.y
let t = 0

app.on('update', delta => {
  t += delta
  app.rotation.y += rotSpeed * delta
  app.position.y = baseY + Math.sin(t * frequency * Math.PI * 2) * amplitude
})
`,
  },
  {
    id: 'custom',
    name: 'Script personnalisé',
    description: "Écris ton propre script Hyperfy (accès à app, world, props).",
    icon: 'Code2',
    params: [],
    buildScript: (p, ctx) => ctx?.customScript || `// Écris ton script Hyperfy ici
// Variables disponibles: app, world, props, fetch, num, setTimeout

app.on('update', delta => {
  // delta = temps écoulé depuis la frame précédente (secondes)
})
`,
  },
]

// helpers
function num(v, d) {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}
function str(v, d) {
  const s = v ?? d
  return JSON.stringify(String(s))
}
function bool(v, d) {
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return d ? 'true' : 'false'
}

export function getEffect(id) {
  return EFFECTS.find(e => e.id === id) || EFFECTS[0]
}

// Default values for an effect
export function defaultParams(effect) {
  const out = {}
  for (const p of effect.params) out[p.key] = p.default
  return out
}

// Build the full index.js content (a header banner + the effect code)
export function buildScript(effect, params, ctx) {
  const banner = `// Generated by Hyperfy Effect Builder
// Effect: ${effect.name}
// ${new Date().toISOString()}

`
  return banner + effect.buildScript(params || {}, ctx)
}