// Builds a valid Hyperfy .hyp binary file, matching the official format
// from src/core/extras/appTools.js in hyperfy-xyz/hyperfy.
//
// Binary layout:
//   [4 bytes] headerSize (uint32 LE)
//   [N bytes] UTF-8 JSON header: { blueprint, assets: [{type, url, size, mime}] }
//   [...]     raw bytes of each asset, in the same order as the assets array
//
// Asset URLs inside the blueprint use the scheme  asset://<sha256>.<ext>

import { buildScript } from './effects'

// Tiny synchronous hex id generator — we don't need true cryptographic hashes
// inside a .hyp (the runtime recomputes them), just stable-looking unique names.
function hexId(len = 32) {
  const chars = '0123456789abcdef'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * 16)]
  return out
}

function slugify(s) {
  return (s || 'app')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'app'
}

function extFromName(name, fallback) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '')
  return m ? m[1].toLowerCase() : fallback
}

function mimeFor(ext) {
  const map = {
    glb: 'model/gltf-binary',
    vrm: 'model/gltf-binary',
    js: 'application/javascript',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  }
  return map[ext] || 'application/octet-stream'
}

/**
 * Build a .hyp File from a builder state.
 *
 * @param {Object} opts
 * @param {string} opts.name
 * @param {string} [opts.description]
 * @param {string} [opts.author]
 * @param {File}   [opts.modelFile]  Optional .glb / .vrm
 * @param {File}   [opts.scriptFile] Pre-built script File (takes priority over effect)
 * @param {Object} [opts.effect]     One of EFFECTS (used if no scriptFile)
 * @param {Object} [opts.effectParams] Params for the effect
 * @param {string} [opts.customScript] Used when effect.id === 'custom'
 * @returns {Promise<File>} the .hyp file, ready to download
 */
export async function buildHypFile({
  name,
  description,
  author,
  modelFile,
  scriptFile: providedScriptFile,
  effect,
  effectParams,
  customScript,
}) {
  const assets = []

  // --- Model ---
  let modelUrl = null
  if (modelFile) {
    const ext = extFromName(modelFile.name, 'glb')
    const url = `asset://${hexId()}.${ext}`
    modelUrl = url
    assets.push({
      type: ext === 'vrm' ? 'avatar' : 'model',
      url,
      file: modelFile,
    })
  }

  // --- Script ---
  let scriptFile
  if (providedScriptFile) {
    scriptFile = providedScriptFile
  } else {
    const scriptSource = buildScript(effect, effectParams, { customScript })
    const scriptBlob = new Blob([scriptSource], { type: 'application/javascript' })
    scriptFile = new File([scriptBlob], 'index.js', { type: 'application/javascript' })
  }
  const scriptUrl = `asset://${hexId()}.js`
  assets.push({ type: 'script', url: scriptUrl, file: scriptFile })

  // --- Blueprint ---
  const blueprint = {
    id: slugify(name),
    version: 1,
    name: name || 'Untitled',
    image: null,
    author: author || null,
    url: null,
    desc: description || null,
    model: modelUrl,
    script: scriptUrl,
    props: { ...(effectParams || {}) },
    preload: false,
    public: false,
    locked: false,
    unique: false,
    scene: false,
    disabled: false,
  }

  // --- Header ---
  const header = {
    blueprint,
    assets: assets.map(a => ({
      type: a.type,
      url: a.url,
      size: a.file.size,
      mime: a.file.type || mimeFor(extFromName(a.url)),
    })),
  }

  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const headerSize = new Uint8Array(4)
  new DataView(headerSize.buffer).setUint32(0, headerBytes.length, true)

  const fileBuffers = await Promise.all(assets.map(a => a.file.arrayBuffer()))

  const filename = `${slugify(name)}.hyp`
  return new File([headerSize, headerBytes, ...fileBuffers], filename, {
    type: 'application/octet-stream',
  })
}

/** Triggers a browser download for any File/Blob. */
export function downloadFile(file) {
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}