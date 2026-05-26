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
 * Scan a script for known crash-causing patterns.
 * Returns a list of detected issues.
 */
function detectScriptIssues(src) {
  const issues = []
  if (/app\.on\(\s*['"]update['"]/.test(src)) issues.push('app.on(update)')
  if (/app\.on\(\s*['"]fixedUpdate['"]/.test(src)) issues.push('app.on(fixedUpdate)')
  if (/world\.getPlayer\(\s*\)/.test(src)) issues.push('world.getPlayer()')
  if (/app\.create\(\s*['"]image['"]\s*\)/.test(src)) issues.push("app.create('image')")
  // Detect undeclared isNear: used but never declared with let/var/const
  if (/\bisNear\b/.test(src) && !/\b(?:let|var|const)\s+isNear\b/.test(src)) issues.push('isNear undeclared')
  // Detect calls to functions that are never defined
  const fnDefs = new Set((src.match(/function\s+(\w+)\s*\(/g) || []).map(m => m.match(/function\s+(\w+)/)[1]))
  const fnCalls = (src.match(/\b(\w+)\s*\(/g) || []).map(m => m.replace('(', '').trim())
  const builtins = new Set(['setTimeout','clearTimeout','Math','String','Number','Boolean','Array','Object','console','app','world','props','fetch','uuid','str','num','parseInt','parseFloat','isNaN','Infinity'])
  for (const call of fnCalls) {
    if (!fnDefs.has(call) && !builtins.has(call) && /^[a-z]/.test(call)) {
      // Heuristic: if a camelCase fn is called but never defined, flag it
      if (['updateVolume','scheduleProximityCheck','setupVolumeCheck','checkVolume','getDistanceToApp','getLocalPlayer'].includes(call) && !fnDefs.has(call)) {
        issues.push(`${call}() called but not defined`)
      }
    }
  }
  return issues
}

/**
 * Patch known broken patterns that crash Hyperfy at import time.
 * Called before embedding the script in the .hyp file.
 */
function patchScript(scriptSource) {
  // === MINIMAL PATCHING ONLY ===
  // The script is preserved as-is. Only fix CRITICAL bugs that crash Hyperfy at import.

  // 1. Replace app.create('image') — doesn't exist in Hyperfy V2, will crash
  scriptSource = scriptSource.replace(/app\.create\(\s*['"]image['"]\s*\)/g, "app.create('webview')")

  // 2. Remove .fit property (not valid on webview)
  scriptSource = scriptSource.replace(/\b\w+\.fit\s*=\s*[^\n]+\n?/g, '')

  // 3. Remove app.on('update'/'fixedUpdate') — these don't exist in Hyperfy V2, will crash
  scriptSource = removeAppOnBlocks(scriptSource, 'update')
  scriptSource = removeAppOnBlocks(scriptSource, 'fixedUpdate')

  // 4. Replace world.getPlayer() — doesn't exist in Hyperfy V2
  scriptSource = scriptSource.replace(/world\.getPlayer\(\s*\)/g, 'null')
  
  // 5. Replace world.entities.getLocalPlayer() — doesn't exist in Hyperfy V2
  scriptSource = scriptSource.replace(/world\.entities\.getLocalPlayer\(\s*\)/g, 'null')

  // 6. Fix prim added to app instead of holder (rare case)
  scriptSource = scriptSource.replace(/\bapp\.add\(placeholderPane\)/g, 'holder.add(placeholderPane)')
  scriptSource = scriptSource.replace(/\bapp\.remove\(placeholderPane\)/g, 'holder.remove(placeholderPane)')

  // 7. CRITICAL: Fix double-attach crashes (node added to both app AND holder)
  const holderAdded = new Set()
  const holderAddPattern = /\b(?:\w+)\s*\.add\(\s*(\w+)\s*\)/g
  let hm
  while ((hm = holderAddPattern.exec(scriptSource)) !== null) {
    holderAdded.add(hm[1])
  }
  const appOnlyAdded = new Set()
  const appAddPattern = /\bapp\s*\.add\(\s*(\w+)\s*\)/g
  let am
  while ((am = appAddPattern.exec(scriptSource)) !== null) appOnlyAdded.add(am[1])
  for (const varName of holderAdded) {
    if (!appOnlyAdded.has(varName)) continue
    const nonAppRe = new RegExp(`\\b(?!app\\b)\\w+\\.add\\(\\s*${varName}\\s*\\)`)
    if (!nonAppRe.test(scriptSource)) continue
    const re = new RegExp(`^[ \\t]*app\\.add\\(\\s*${varName}\\s*\\)[ \\t]*;?[ \\t]*\\n`, 'gm')
    scriptSource = scriptSource.replace(re, '')
  }

  // 8. CRITICAL: Hyperfy V2 uses `props`, NOT `config` — replace all occurrences
  scriptSource = scriptSource.replace(/\bconfig\./g, 'props.')

  // 9. Fix app.on('config', ...) → props.onChange pattern
  scriptSource = scriptSource.replace(/app\.on\(\s*['"]config['"]\s*,\s*\(\)\s*=>\s*\{\s*applyAll\(\)\s*\}\s*\)/g, 'if (props && typeof props.onChange === \'function\') { props.onChange(() => { applyAll() }) }')

  // ✅ EVERYTHING ELSE IS PRESERVED EXACTLY AS-IS
  // No variable removal, no block removal, no aggressive cleanup.
  // User code + IA-generated code is 100% protected.

  return scriptSource
}

/**
 * Remove orphan `else { ... }` blocks that are left as dead code after proximity removal.
 * Only removes `else` blocks that immediately follow a line ending with `return` or `return;`
 * (possibly with blank lines and/or a closing `}` in between). Leaves all other else blocks intact.
 */
function removeOrphanElseBlocks(src) {
  // Pattern: `return` → optional whitespace/blank lines → `}` (closing brace of if-block) → optional whitespace/blank lines → `else {`
  // The `else {` and its body are unreachable dead code → remove
  // Updated to REQUIRE the closing `}` between return and else
  const pattern = /(\breturn\s*;?[ \t]*\n[ \t\n]*\}[ \t\n]*)else\s*\{/g
  let result = src
  let match
  let maxIterations = 50
  let iterations = 0
  while ((match = pattern.exec(result)) !== null && iterations < maxIterations) {
    iterations++
    // Keep the `return` line, remove from `else {` onward (brace-counted)
    const elseStart = match.index + match[1].length
    let depth = 0
    let i = elseStart
    let foundOpen = false
    while (i < result.length) {
      if (result[i] === '{') { depth++; foundOpen = true }
      else if (result[i] === '}') { depth-- }
      if (foundOpen && depth === 0) {
        let end = i + 1
        while (end < result.length && (result[end] === '\n' || result[end] === '\r')) end++
        result = result.slice(0, elseStart) + result.slice(end)
        pattern.lastIndex = 0 // reset to start since string changed
        break
      }
      i++
    }
  }
  console.log('[removeOrphanElseBlocks] Iterations:', iterations, 'Match found:', iterations > 0)
  return result
}

/**
 * Remove ALL stray `else {` blocks — ultra aggressive cleanup.
 * Simply removes any `else {` that appears after a `}` (with possible blank lines between).
 * Also removes the closing `}` that precedes it.
 */
function removeStrayElseBlocks(src) {
  // Pattern: `}` → optional whitespace/newlines → `else {`
  // We remove from the `}` through the entire else block
  const pattern = /\}[ \t]*\n(?:[ \t]*\n)*[ \t]*else\s*\{/g
  let result = src
  let match
  let iterations = 0
  while ((match = pattern.exec(result)) !== null && iterations < 10) {
    iterations++
    // Find where the `}` is
    const ifBlockEnd = match.index + 1
    // Find where the `else {` starts
    const elseStart = match.index + match[0].indexOf('else')
    // Now find the end of the else block by brace counting
    let depth = 0
    let i = elseStart
    let foundOpen = false
    while (i < result.length) {
      if (result[i] === '{') { depth++; foundOpen = true }
      else if (result[i] === '}') { depth-- }
      if (foundOpen && depth === 0) {
        let end = i + 1
        while (end < result.length && (result[end] === '\n' || result[end] === '\r')) end++
        // Remove from the closing `}` of if-block to end of else block
        result = result.slice(0, ifBlockEnd) + result.slice(end)
        pattern.lastIndex = 0
        break
      }
      i++
    }
  }
  console.log('[removeStrayElseBlocks] Iterations:', iterations, 'Match found:', iterations > 0)
  return result
}

/**
 * Remove orphan closing `}` lines left after else-block removal.
 * Scans the script tracking brace depth; any `}` that would bring depth below 0 is removed.
 */
function removeOrphanClosingBraces(src) {
  const lines = src.split('\n')
  const out = []
  let depth = 0
  for (const line of lines) {
    const trimmed = line.trim()
    // Count braces on this line
    let opens = 0, closes = 0
    for (const ch of trimmed) {
      if (ch === '{') opens++
      else if (ch === '}') closes++
    }
    // If this line is ONLY a `}` (possibly with semicolon) and would go negative → skip it
    if (/^\}[;]?$/.test(trimmed) && depth + opens - closes < 0) {
      // orphan closing brace — drop it
      continue
    }
    depth += opens - closes
    if (depth < 0) depth = 0
    out.push(line)
  }
  return out.join('\n')
}

/**
 * Remove if-blocks whose body consists solely of `varName = null` assignments
 * (dead code left after proximity cleanup). Works by scanning line-by-line.
 */
function removeDeadIfBlocks(src) {
  const lines = src.split('\n')
  const out = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const ifMatch = line.match(/^([ \t]*)if\s*\([^)]+\)\s*\{\s*$/)
    if (ifMatch) {
      const ifIndent = ifMatch[1].length
      // Collect body lines until matching `}`
      const bodyLines = []
      let j = i + 1
      let closed = false
      while (j < lines.length) {
        const t = lines[j].trim()
        if (t === '}') {
          closed = true
          break
        }
        bodyLines.push(lines[j])
        j++
      }
      if (closed) {
        const nonEmpty = bodyLines.map(l => l.trim()).filter(l => l !== '')
        const allNull = nonEmpty.length > 0 && nonEmpty.every(l => /^\w+\s*=\s*null\s*;?$/.test(l))
        if (allNull) {
          // Replace the entire if-block with just the `varName = null` lines (keep assignments, drop the if wrapper)
          // Actually: just drop the whole block (the null assignments are redundant after removal)
          i = j + 1
          continue
        }
      }
    }
    out.push(line)
    i++
  }
  return out.join('\n')
}

/**
 * Remove any `proximityAction = app.create('action')` assignment block,
 * including all the property lines and the trailing app.add(proximityAction).
 * These blocks span multiple lines and end when indentation returns.
 */
function removeProximityActionBlock(src) {
  // Find `proximityAction = app.create(` anywhere in the source
  const pattern = /^([ \t]*)proximityAction\s*=\s*app\.create\s*\(/gm
  let result = src
  let match
  while ((match = pattern.exec(result)) !== null) {
    const blockStart = match.index
    const indent = match[1]
    // Scan forward until we find a line at the same or lower indentation level
    // that is NOT a proximityAction.xxx assignment or app.add(proximityAction)
    const lines = result.slice(blockStart).split('\n')
    let lineCount = 0
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li]
      lineCount++
      // Stop after the first line that clearly ends the block context
      // i.e., a line that is NOT continuation of this proximityAction setup
      if (li === 0) continue // skip the `proximityAction = app.create(...)` line itself
      const trimmed = line.trim()
      if (trimmed === '') continue // keep consuming blank lines inside block
      // Lines that belong to the proximity action setup block
      if (
        trimmed.startsWith('proximityAction.') ||
        trimmed === 'app.add(proximityAction)' ||
        trimmed === 'app.add(proximityAction);'
      ) continue
      // This line doesn't belong — stop here (don't include it)
      lineCount--
      break
    }
    const blockEnd = blockStart + lines.slice(0, lineCount).join('\n').length + 1 // +1 for \n
    result = result.slice(0, blockStart) + result.slice(Math.min(blockEnd, result.length))
    pattern.lastIndex = 0
  }
  return result
}

/**
 * Remove `if (isNear) { ... }` (and `if (!isNear) { ... }`) multi-line blocks.
 */
function removeIfIsNearBlocks(src) {
  // Match: if (isNear) { or if (!isNear) {
  const pattern = /if\s*\(\s*!?\s*isNear\s*\)\s*\{/g
  let result = src
  let match
  while ((match = pattern.exec(result)) !== null) {
    const start = match.index
    let depth = 0
    let i = start
    let foundOpen = false
    while (i < result.length) {
      if (result[i] === '{') { depth++; foundOpen = true }
      else if (result[i] === '}') { depth-- }
      if (foundOpen && depth === 0) {
        let end = i + 1
        // consume optional trailing newline
        while (end < result.length && (result[end] === '\n' || result[end] === '\r')) end++
        result = result.slice(0, start) + result.slice(end)
        pattern.lastIndex = 0
        break
      }
      i++
    }
  }
  return result
}

/**
 * Remove an app.on('eventName', ...) block, handling nested braces.
 */
function removeAppOnBlocks(src, eventName) {
  const pattern = new RegExp(`app\\.on\\(\\s*['"]${eventName}['"]\\s*,`, 'g')
  let result = src
  let match
  while ((match = pattern.exec(result)) !== null) {
    const start = match.index
    // Find the matching closing `)` by counting braces
    let depth = 0
    let i = start
    let foundOpen = false
    while (i < result.length) {
      if (result[i] === '{') { depth++; foundOpen = true }
      else if (result[i] === '}') { depth-- }
      if (foundOpen && depth === 0) {
        // consume the closing `)` and optional newline
        let end = i + 1
        while (end < result.length && (result[end] === ')' || result[end] === ';' || result[end] === '\n' || result[end] === '\r')) end++
        result = result.slice(0, start) + result.slice(end)
        pattern.lastIndex = 0 // reset since string changed
        break
      }
      i++
    }
  }
  return result
}

/**
 * Remove a named function definition from source.
 */
function removeFunctionDef(src, name) {
  const pattern = new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`)
  const match = pattern.exec(src)
  if (!match) return src
  const start = match.index
  let depth = 0
  let i = start
  let foundOpen = false
  while (i < src.length) {
    if (src[i] === '{') { depth++; foundOpen = true }
    else if (src[i] === '}') { depth-- }
    if (foundOpen && depth === 0) {
      let end = i + 1
      while (end < src.length && (src[end] === '\n' || src[end] === '\r')) end++
      return src.slice(0, start) + src.slice(end)
    }
    i++
  }
  return src
}

/**
 * Ensure script structure is valid for Hyperfy.
 * KEEP `if (!world.isClient) return` and `app.keepActive = true` - they are required!
 * Only remove broken `if (world.isClient) { ... }` wrappers around app.configure().
 */
function ensureIsClientGuard(scriptSource) {
  // Only remove `if (world.isClient) {` wrappers (NOT the `if (!world.isClient) return` pattern)
  let result = scriptSource
  const wrapperPattern = /if\s*\(\s*world\.isClient\s*\)\s*\{/g
  let match
  while ((match = wrapperPattern.exec(result)) !== null) {
    const start = match.index
    // Find matching closing brace
    let depth = 0
    let i = start
    let foundOpen = false
    while (i < result.length) {
      if (result[i] === '{') { depth++; foundOpen = true }
      else if (result[i] === '}') { depth-- }
      if (foundOpen && depth === 0) {
        // Remove the `if (world.isClient) {` line and this closing brace
        const lineStart = result.lastIndexOf('\n', start) + 1
        let end = i + 1
        while (end < result.length && (result[end] === '\n' || result[end] === '\r')) end++
        result = result.slice(0, lineStart) + result.slice(end)
        wrapperPattern.lastIndex = 0
        break
      }
      i++
    }
  }

  // Remove leading blank lines only
  const lines = result.split('\n')
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()

  return lines.join('\n')
}

/**
 * Build .hyp file data for client-side compilation.
 * Returns the blueprint and script (no binary assembly - done client-side).
 *
 * @param {Object} opts
 * @param {string} opts.name
 * @param {string} [opts.description]
 * @param {string} [opts.author]
 * @param {string} opts.script - The patched JavaScript code
 * @param {Object} [opts.effectParams] Params for the effect
 * @returns {Object} { blueprint, script } - Ready for client-side .hyp assembly
 */
export function prepareHypData({
  name,
  description,
  author,
  script,
  effectParams,
}) {
  // Patch and clean the script
  script = patchScript(script)
  script = ensureIsClientGuard(script)
  script = script.trim()
  
  // Remove trailing orphan closing braces
  let prevLength = 0
  while (prevLength !== script.length && /\n[ \t]*\}[ \t]*$/.test(script)) {
    prevLength = script.length
    script = script.replace(/\n[ \t]*\}[ \t]*$/, '')
  }

  // Generate script hash and URL
  const encoder = new TextEncoder()
  const scriptBytes = encoder.encode(script)
  const scriptHash = sha256HexSync(scriptBytes.buffer)
  const scriptUrl = `asset://${scriptHash}.js`

  // --- Props: extract from script configure() + merge with effectParams ---
  const scriptProps = extractPropsFromScript(script)
  const mergedProps = { ...scriptProps, ...(effectParams || {}) }

  // --- Blueprint ---
  const blueprint = {
    id: nanoid(10),
    version: 2,
    name: name || 'Untitled',
    image: null,
    author: author || null,
    url: null,
    desc: description || null,
    model: null,
    script: scriptUrl,
    props: mergedProps,
    preload: false,
    public: false,
    locked: false,
    unique: false,
    disabled: false,
  }

  // --- Assets ---
  const assets = [{
    type: 'script',
    url: scriptUrl,
    size: scriptBytes.length,
    mime: 'application/javascript',
  }]

  return {
    blueprint,
    assets,
    script, // Return the cleaned script for client-side assembly
  }
}

/**
 * Assemble and download a .hyp file entirely client-side.
 * This avoids any binary corruption from network transfer.
 *
 * @param {Object} blueprint - The blueprint object
 * @param {Array} assets - Array of asset metadata
 * @param {string} script - The JavaScript code string
 * @param {string} filename - Output filename
 */
export function downloadHypFile(blueprint, assets, script, filename = 'app.hyp') {
  const encoder = new TextEncoder()
  
  // Encode script (already cleaned)
  const scriptBytes = encoder.encode(script)
  
  // Update asset size to match actual encoded bytes
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

  // Create 4-byte header (uint32 LE)
  const headerSizeBytes = new Uint8Array(4)
  new DataView(headerSizeBytes.buffer).setUint32(0, jsonBytes.length, true)

  // Assemble final binary: [4-byte header size][JSON header][script bytes]
  const totalLength = headerSizeBytes.length + jsonBytes.length + scriptBytes.length
  const finalBytes = new Uint8Array(totalLength)
  
  let offset = 0
  finalBytes.set(headerSizeBytes, offset)
  offset += headerSizeBytes.length
  finalBytes.set(jsonBytes, offset)
  offset += jsonBytes.length
  finalBytes.set(scriptBytes, offset)

  // Trigger download
  const blob = new Blob([finalBytes], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Returns the script as it will appear inside the .hyp (after all patches).
 * Useful for debugging — call this to inspect what's actually embedded.
 */
export function getPatchedScript(rawScript) {
  let s = patchScript(rawScript)
  s = ensureIsClientGuard(s)
  
  // Debug: full script + structure check
  const lines = s.split('\n')
  console.log('[getPatchedScript] === FULL SCRIPT ===')
  console.log(s)
  console.log('[getPatchedScript] === END ===')
  
  return s
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

/**
 * Synchronous SHA256 hash for client-side use.
 * Returns hex string.
 */
export async function sha256HexSync(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Legacy export for compatibility - use prepareHypData instead.
 * @deprecated Use prepareHypData() for client-side assembly instead
 */
export function buildHypFile(opts) {
  console.warn('[buildHypFile] Deprecated: use prepareHypData() and client-side assembly instead')
  return prepareHypData({
    name: opts.name,
    description: opts.description,
    author: opts.author,
    script: opts.customScript || '',
    effectParams: opts.effectParams || {},
  })
}

/**
 * BINARY INJECTION STRATEGY
 * Uses a known-good .hyp file as a mould and injects a new JS script into it.
 * This preserves the original GLB model, PNG image, and binary structure exactly.
 *
 * The template file must be placed at: /public/assets/templates/fonctionne.hyp
 *
 * @param {string} nouveauCodeJS - The new JavaScript code to inject
 * @param {string} [filename] - Output filename (default: export_application.hyp)
 * @returns {Promise<boolean>} - true on success, throws on failure
 */
export async function exportViaInjection(nouveauCodeJS, filename = 'export_application.hyp') {
  // 1. Load the template mould from the uploaded file URL
  const response = await fetch('https://base44.app/api/apps/69ea64ec2a2946b1244fd941/files/mp/public/69ea64ec2a2946b1244fd941/22348c423_fonctionne.hyp')
  if (!response.ok) throw new Error(`Impossible de charger le fichier moule : ${response.status} ${response.statusText}`)
  const buffer = await response.arrayBuffer()
  const dataView = new DataView(buffer)

  // 2. Read the JSON size from the first 4 bytes (uint32 LE)
  const jsonSize = dataView.getUint32(0, true)

  // 3. Extract and parse the JSON header
  const jsonBytes = new Uint8Array(buffer, 4, jsonSize)
  const jsonString = new TextDecoder().decode(jsonBytes)
  const blueprint = JSON.parse(jsonString)

  // 4. Critical fix: disable blocking physics collision
  if (!blueprint.props) blueprint.props = {}
  blueprint.props.collision = false

  // 5. Get original asset sizes
  const sizeModeleGLB = blueprint.assets[0].size
  const sizeAncienJS = blueprint.assets[1].size
  const sizeImagePNG = blueprint.assets[2].size

  // 6. Isolate the immutable GLB and PNG binary payloads
  const modeleBytes = new Uint8Array(buffer, 4 + jsonSize, sizeModeleGLB)
  const imageBytes = new Uint8Array(buffer, 4 + jsonSize + sizeModeleGLB + sizeAncienJS, sizeImagePNG)

  // 7. Patch and encode the new JS script
  let patchedJS = patchScript(nouveauCodeJS.trim())
  patchedJS = ensureIsClientGuard(patchedJS)
  const encoder = new TextEncoder()
  const nouveauJSBytes = encoder.encode(patchedJS)

  // 8. Update the JSON manifest with the new script size
  blueprint.assets[1].size = nouveauJSBytes.length
  const nouveauJsonBytes = encoder.encode(JSON.stringify(blueprint))

  // 9. Build the new 4-byte header
  const headerBytes = new Uint8Array(4)
  new DataView(headerBytes.buffer).setUint32(0, nouveauJsonBytes.length, true)

  // 10. Assemble the final binary: [4B header][JSON][GLB][new JS][PNG]
  const tailleTotale = 4 + nouveauJsonBytes.length + sizeModeleGLB + nouveauJSBytes.length + sizeImagePNG
  const finalBytes = new Uint8Array(tailleTotale)

  let offset = 0
  finalBytes.set(headerBytes, offset); offset += 4
  finalBytes.set(nouveauJsonBytes, offset); offset += nouveauJsonBytes.length
  finalBytes.set(modeleBytes, offset); offset += sizeModeleGLB
  finalBytes.set(nouveauJSBytes, offset); offset += nouveauJSBytes.length
  finalBytes.set(imageBytes, offset)

  // 11. Trigger browser download
  const blob = new Blob([finalBytes], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return true
}