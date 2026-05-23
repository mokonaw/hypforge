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
  // Replace app.create('image') — doesn't exist in Hyperfy V2
  scriptSource = scriptSource.replace(/app\.create\(\s*['"]image['"]\s*\)/g, "app.create('webview')")

  // Remove .fit property (not valid on webview)
  scriptSource = scriptSource.replace(/\b\w+\.fit\s*=\s*[^\n]+\n?/g, '')

  // Remove app.on('update'/'fixedUpdate') blocks entirely
  // Handle both arrow and regular function forms, possibly nested braces
  scriptSource = removeAppOnBlocks(scriptSource, 'update')
  scriptSource = removeAppOnBlocks(scriptSource, 'fixedUpdate')

  // Replace world.getPlayer() — doesn't exist in Hyperfy V2
  scriptSource = scriptSource.replace(/world\.getPlayer\(\s*\)/g, 'null')
  
  // Replace world.entities.getLocalPlayer() — doesn't exist in Hyperfy V2
  scriptSource = scriptSource.replace(/world\.entities\.getLocalPlayer\(\s*\)/g, 'null')

  // Fix prim added to app instead of holder
  scriptSource = scriptSource.replace(/\bapp\.add\(placeholderPane\)/g, 'holder.add(placeholderPane)')
  scriptSource = scriptSource.replace(/\bapp\.remove\(placeholderPane\)/g, 'holder.remove(placeholderPane)')

  // CRITICAL: Fix double-attach crashes
  // 1. Remove duplicate consecutive app.add(X) calls (anywhere in the file)
  scriptSource = scriptSource.replace(
    /^([ \t]*app\.add\((\w+)\)[ \t]*)\n[ \t]*app\.add\(\2\)/gm,
    '$1'
  )
  // 2. Remove ALL app.add(X) when X is ALSO added to a holder/group anywhere in the script
  //    (double parenté = crash regardless of where in the code it appears)
  const holderAdded = new Set()
  const holderAddPattern = /\b(?:\w+)\s*\.add\(\s*(\w+)\s*\)/g
  let hm
  while ((hm = holderAddPattern.exec(scriptSource)) !== null) {
    // Collect varNames added to any object that is NOT 'app' itself
    // We'll filter out app.add() targets vs non-app.add() targets below
    holderAdded.add(hm[1])
  }
  // Now remove from holderAdded any varNames that are ONLY added via app.add() (i.e. not in holder)
  const appOnlyAdded = new Set()
  const appAddPattern = /\bapp\s*\.add\(\s*(\w+)\s*\)/g
  let am
  while ((am = appAddPattern.exec(scriptSource)) !== null) appOnlyAdded.add(am[1])
  // holderAdded = varNames added to BOTH app and something else → strip app.add()
  for (const varName of holderAdded) {
    if (!appOnlyAdded.has(varName)) continue // not added to app at all, nothing to strip
    // Check it's also added to a non-app object
    const nonAppRe = new RegExp(`\\b(?!app\\b)\\w+\\.add\\(\\s*${varName}\\s*\\)`)
    if (!nonAppRe.test(scriptSource)) continue
    // Strip all app.add(varName) lines
    const re = new RegExp(`^[ \\t]*app\\.add\\(\\s*${varName}\\s*\\)[ \\t]*;?[ \\t]*\\n`, 'gm')
    scriptSource = scriptSource.replace(re, '')
  }

  // Remove dead proximity/volume variables — only if NOT used elsewhere
  // isNear: only remove declaration if the functions that use it (showNear/showFar) are also gone
  const usesIsNear = /\bisNear\b/.test(scriptSource.replace(/^[ \t]*let\s+isNear\s*=[^\n]+\n/m, ''))
  if (!usesIsNear) {
    scriptSource = scriptSource.replace(/^[ \t]*let\s+isNear\s*=\s*false[ \t]*\n/m, '')
  }
  scriptSource = scriptSource.replace(/^[ \t]*let\s+lastDist\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+volumeAudio\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+proximityCheckTimeout\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+volumeTimeout\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+isNearby\s*=\s*[^\n]+\n/m, '')
  // Remove proxDist lines that read props.proximityDistance (never declared in configure)
  // scriptSource = scriptSource.replace(/^[ \t]*const\s+proxDist\s*=[^\n]+proximityDistance[^\n]+\n/gm, '')
  // ^^^ COMMENTED OUT — proximityDistance IS valid when declared in app.configure()

  // KEEP ALL FUNCTION DEFINITIONS — don't remove anything the user/IA explicitly wrote
  // updateVolume, getDistanceToApp, scheduleProximityCheck, etc. are all valid patterns

  // After removing proximity/action functions, remove all their call sites and dead vars
  scriptSource = scriptSource.replace(/^[ \t]*scheduleProximityCheck\([^)]*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*doProximityCheck\([^)]*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*setupProximityLoop\([^)]*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*startProximityLoop\([^)]*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*scheduleLeaveCheck\([^)]*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*restoreAction\([^)]*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*setupActions\(\s*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*removeActions\(\s*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+actionNear\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+actionFar\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+proximityTimer\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+lastPlayerPos\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*(?:let|const|var)\s+triggerAction\s*=\s*[^\n]+\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*(?:let|const|var)\s+leaveTimer\s*=\s*[^\n]+\n/gm, '')
  // KEEP ALL clearTimeout CALLS — don't remove anything the user/IA explicitly wrote
  // proximityTimer, leaveTimer cleanup is valid and required
  // KEEP ALL proximityAction CODE — don't remove anything the user/IA explicitly wrote

  // Remove redundant try/catch around app.get('Block')
  scriptSource = scriptSource.replace(/[ \t]*try\s*\{\s*const block = app\.get\([^)]+\)[^\n]*\n?\s*\}\s*catch\([^)]*\)\s*\{\s*\}\s*\n?/g, '')

  // KEEP all props in configure() — don't remove anything
  // sec_proximity, proximityDistance, autoplay, etc. are all valid

  // KEEP app.keepActive = true — don't remove it (required for webview/audio to stay active)

  // KEEP ALL proximity/timer CODE — don't remove anything the user/IA explicitly wrote
  // triggerAction, proximityAction, leaveTimer, isNear assignments are all valid
  // KEEP ALL COMMENTS, BRACES, and isNear BLOCKS — don't remove anything the user/IA explicitly wrote
  // screenshotView.visible = !isNear, if (isNear) {...}, nearDist, farDist are all valid

  // KEEP ALL app.remove() CALLS — don't remove anything the user/IA explicitly wrote

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

  // Final safety pass: inject missing declarations AFTER the guard is in place
  // Build list of injections needed (in reverse order so insertions don't shift each other)
  const injections = []

  // isNear used but never declared → inject let isNear = false
  if (/\bisNear\b/.test(scriptSource) && !/\b(?:let|var|const)\s+isNear\b/.test(scriptSource)) {
    injections.push('let isNear = false')
  }
  // getProxDist called but never defined → inject stub
  if (/\bgetProxDist\s*\(\)/.test(scriptSource) && !/function\s+getProxDist\s*\(/.test(scriptSource)) {
    injections.push('function getProxDist() { return Math.max(1, Number(props.proximityDistance ?? 4)) }')
  }

  if (injections.length > 0) {
    const insertBlock = injections.join('\n') + '\n'
    // Insert right after the two-line header (guard + keepActive + blank line)
    scriptSource = scriptSource.replace(
      /^(if \(!world\.isClient\) return\napp\.keepActive = true\n\n)/m,
      '$1' + insertBlock + '\n'
    )
  }
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
    version: 2,
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