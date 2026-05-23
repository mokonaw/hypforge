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

// Generate a SHA-256 hash of a file's bytes (returns 64-char hex string)
async function sha256Hex(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Generate a short nanoid-style alphanumeric ID (like Hyperfy uses internally)
function nanoid(len = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  const arr = new Uint8Array(len)
  crypto.getRandomValues(arr)
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length]
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
 * Extract initial prop values from app.configure() calls in a script string.
 * Returns an object like { key: initialValue } for each configured field.
 */
function extractPropsFromScript(scriptSource) {
  const props = {}
  // Match individual configure field objects: { ..., key: 'xxx', ..., initial: yyy, ... }
  const fieldRegex = /\{[^{}]*\}/g
  const matches = scriptSource.match(fieldRegex) || []
  for (const block of matches) {
    const keyMatch = block.match(/\bkey\s*:\s*['"]([^'"]+)['"]/)
    const initialMatch = block.match(/\binitial\s*:\s*([^,}]+)/)
    if (!keyMatch) continue
    const key = keyMatch[1]
    // Skip section separators
    if (block.match(/\btype\s*:\s*['"]section['"]/)) continue
    if (initialMatch) {
      const raw = initialMatch[1].trim()
      // Parse the raw value
      if (raw === 'true') props[key] = true
      else if (raw === 'false') props[key] = false
      else if (raw === 'null') props[key] = null
      else if (/^['"]/.test(raw)) props[key] = raw.slice(1, -1)
      else if (!isNaN(Number(raw))) props[key] = Number(raw)
      else props[key] = raw
    } else {
      props[key] = null
    }
  }
  return props
}

/**
 * Patch known broken patterns that crash Hyperfy at import time.
 * Called before embedding the script in the .hyp file.
 */
function patchScript(scriptSource) {
  // Replace app.create('image') — this node type doesn't exist in Hyperfy V2
  // and causes an immediate crash. Replace with a webview (same API surface).
  scriptSource = scriptSource.replace(/app\.create\(\s*['"]image['"]\s*\)/g, "app.create('webview')")

  // Remove imgPlane.fit = ... (not a valid webview prop)
  scriptSource = scriptSource.replace(/\bimgPlane\.fit\s*=\s*[^\n]+\n?/g, '')

  // Ensure app.keepActive = true comes right after the isClient guard
  // (handled separately by ensureIsClientGuard order)

  return scriptSource
}

/**
 * Ensure `if (!world.isClient) return` is the very first executable line.
 */
function ensureIsClientGuard(scriptSource) {
  const guard = 'if (!world.isClient) return'
  // Already correct position: guard is the first non-comment, non-empty line
  const lines = scriptSource.split('\n')
  const firstCodeIdx = lines.findIndex(l => {
    const t = l.trim()
    return t.length > 0 && !t.startsWith('//')
  })
  if (firstCodeIdx !== -1 && lines[firstCodeIdx].trim() === guard) {
    return scriptSource // already correct
  }
  // Remove any existing guard elsewhere
  const withoutGuard = lines.filter(l => l.trim() !== guard).join('\n')
  return guard + '\n' + withoutGuard
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
    const modelBuffer = await modelFile.arrayBuffer()
    const modelHash = await sha256Hex(modelBuffer)
    const url = `asset://${modelHash}.${ext}`
    modelUrl = url
    assets.push({
      type: ext === 'vrm' ? 'avatar' : 'model',
      url,
      file: modelFile,
      buffer: modelBuffer,
    })
  }

  // --- Script ---
  let scriptSource
  if (providedScriptFile) {
    scriptSource = await providedScriptFile.text()
  } else {
    scriptSource = buildScript(effect, effectParams, { customScript })
  }
  // Patch broken patterns then ensure isClient guard is always first
  scriptSource = patchScript(scriptSource)
  scriptSource = ensureIsClientGuard(scriptSource)
  const scriptBlob = new Blob([scriptSource], { type: 'application/javascript' })
  const scriptFile = new File([scriptBlob], 'index.js', { type: 'application/javascript' })
  const scriptBuffer = await scriptFile.arrayBuffer()
  const scriptHash = await sha256Hex(scriptBuffer)
  const scriptUrl = `asset://${scriptHash}.js`
  assets.push({ type: 'script', url: scriptUrl, file: scriptFile, buffer: scriptBuffer })

  // --- Props: extract from script configure() + merge with effectParams ---
  const scriptProps = extractPropsFromScript(scriptSource)
  const mergedProps = { ...scriptProps, ...(effectParams || {}) }

  // --- Blueprint ---
  const blueprint = {
    id: nanoid(10),
    version: 1,
    name: name || 'Untitled',
    image: null,
    author: author || null,
    url: null,
    desc: description || null,
    model: modelUrl,
    script: scriptUrl,
    props: mergedProps,
    preload: false,
    public: false,
    locked: false,
    unique: false,
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

  const fileBuffers = assets.map(a => a.buffer)

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