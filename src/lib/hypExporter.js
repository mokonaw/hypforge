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
  scriptSource = scriptSource.replace(/^[ \t]*const\s+proxDist\s*=[^\n]+proximityDistance[^\n]+\n/gm, '')

  // Remove function bodies for known dead functions (only if actually unused after patches)
  // updateVolume: always remove — Hyperfy has no volume API accessible
  scriptSource = removeFunctionDef(scriptSource, 'updateVolume')
  scriptSource = removeFunctionDef(scriptSource, 'getProximityDist')
  // setupVolumeCheck / checkVolume — use non-existent webview.volume API
  scriptSource = removeFunctionDef(scriptSource, 'setupVolumeCheck')
  scriptSource = removeFunctionDef(scriptSource, 'checkVolume')
  // getDistanceToApp + getLocalPlayer: remove only if scheduleProximityCheck is also gone
  const hasSchedule = /function\s+scheduleProximityCheck\s*\(/.test(scriptSource)
  if (!hasSchedule) {
    scriptSource = removeFunctionDef(scriptSource, 'getDistanceToApp')
    scriptSource = removeFunctionDef(scriptSource, 'getLocalPlayer')
  }
  scriptSource = removeFunctionDef(scriptSource, 'scheduleProximityCheck')
  // Remove the entire setTimeout-based proximity chain
  scriptSource = removeFunctionDef(scriptSource, 'doProximityCheck')
  scriptSource = removeFunctionDef(scriptSource, 'setupProximityLoop')
  scriptSource = removeFunctionDef(scriptSource, 'getLocalPlayerPosition')
  scriptSource = removeFunctionDef(scriptSource, 'getAppWorldPosition')
  scriptSource = removeFunctionDef(scriptSource, 'dist3')
  // showWebview/hideWebview only make sense when driven by proximity loop → remove them
  scriptSource = removeFunctionDef(scriptSource, 'showWebview')
  scriptSource = removeFunctionDef(scriptSource, 'hideWebview')
  // setupActions uses proxDist which is removed → remove it too
  scriptSource = removeFunctionDef(scriptSource, 'setupActions')
  scriptSource = removeFunctionDef(scriptSource, 'removeActions')

  // After removing proximity/action functions, remove all their call sites and dead vars
  scriptSource = scriptSource.replace(/^[ \t]*scheduleProximityCheck\([^)]*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*doProximityCheck\([^)]*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*setupProximityLoop\([^)]*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*setupActions\(\s*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*removeActions\(\s*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+actionNear\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+actionFar\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+proximityTimer\s*=\s*[^\n]+\n/m, '')
  scriptSource = scriptSource.replace(/^[ \t]*let\s+lastPlayerPos\s*=\s*[^\n]+\n/m, '')
  // Remove clearTimeout(proximityTimer) calls and related onDispose references to proximityTimer
  scriptSource = scriptSource.replace(/^[ \t]*(?:if\s*\([^)]*proximityTimer[^)]*\)\s*\{[^}]*\}|clearTimeout\s*\(\s*proximityTimer\s*\)\s*;?\s*proximityTimer\s*=\s*null\s*;?)[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*proximityTimer\s*=\s*null\s*;?[ \t]*\n/gm, '')
  // Remove the entire if-block pattern: if (proximityTimer !== null) { clearTimeout... }
  scriptSource = scriptSource.replace(/[ \t]*if\s*\(\s*proximityTimer\s*!==\s*null\s*\)\s*\{[\s\S]*?clearTimeout[^}]*\}[ \t]*\n?/g, '')
  // Remove nearDist/farDist variable declarations inside applyAll when they're only used for removed functions
  // (keep them if proximityAction is still present — we'll clean up proximityAction block next)
  // Remove the entire proximityAction creation block (action used only for proximity, which we removed)
  scriptSource = scriptSource.replace(
    /[ \t]*if\s*\(\s*proximityAction\s*\)\s*\{[\s\S]*?\}\s*\n[ \t]*const\s+nearDist[\s\S]*?setupProximityLoop[^\n]*\n?/g,
    ''
  )

  // Remove redundant try/catch around app.get('Block')
  scriptSource = scriptSource.replace(/[ \t]*try\s*\{\s*const block = app\.get\([^)]+\)[^\n]*\n?\s*\}\s*catch\([^)]*\)\s*\{\s*\}\s*\n?/g, '')

  // Remove proximity-related props from configure() since proximity logic was removed
  scriptSource = scriptSource.replace(/[ \t]*\{[^}]*key:\s*['"]sec_proximity['"][^}]*\},?\n?/g, '')
  scriptSource = scriptSource.replace(/[ \t]*\{[^}]*key:\s*['"]proximityDistance['"][^}]*\},?\n?/g, '')
  scriptSource = scriptSource.replace(/[ \t]*\{[^}]*key:\s*['"]nearDistance['"][^}]*\},?\n?/g, '')
  scriptSource = scriptSource.replace(/[ \t]*\{[^}]*key:\s*['"]farDistance['"][^}]*\},?\n?/g, '')
  scriptSource = scriptSource.replace(/[ \t]*\{[^}]*key:\s*['"]autoplay['"][^}]*\},?\n?/g, '')

  // Remove app.keepActive — will be re-inserted at the correct position by ensureIsClientGuard
  scriptSource = scriptSource.replace(/^[ \t]*app\.keepActive\s*=\s*true[ \t]*\n/m, '')

  // Remove any remaining calls to removed functions
  scriptSource = scriptSource.replace(/^[ \t]*updateVolume\([^)]*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*getProxDist\(\s*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*setupVolumeCheck\(\s*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*checkVolume\(\s*\)\s*;?[ \t]*\n/gm, '')
  // Remove any clearTimeout(proximityTimer) that may remain anywhere in the script
  scriptSource = scriptSource.replace(/^[ \t]*clearTimeout\s*\(\s*proximityTimer\s*\)\s*;?[ \t]*\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*proximityTimer\s*=\s*null\s*;?[ \t]*\n/gm, '')
  // Remove orphan proximityAction variable declaration (let or const, top-level or inside function)
  scriptSource = scriptSource.replace(/^[ \t]*(?:let|const|var)\s+proximityAction\s*=\s*[^\n]+\n/gm, '')
  // Remove app.remove(proximityAction) anywhere
  scriptSource = scriptSource.replace(/^[ \t]*app\.remove\s*\(\s*proximityAction\s*\)\s*;?[ \t]*\n/gm, '')
  // Remove app.add(proximityAction) anywhere
  scriptSource = scriptSource.replace(/^[ \t]*app\.add\s*\(\s*proximityAction\s*\)\s*;?[ \t]*\n/gm, '')
  // Remove entire `proximityAction = app.create(...)` assignment block (multi-line, brace-counted)
  scriptSource = removeProximityActionBlock(scriptSource)
  // Remove any remaining bare `proximityAction = ...` assignments (null, undefined, or re-assign)
  scriptSource = scriptSource.replace(/^[ \t]*proximityAction\s*=[^\n]+\n/gm, '')
  // Remove any remaining line that solely references proximityAction (e.g. standalone identifier lines)
  scriptSource = scriptSource.replace(/^[ \t]*proximityAction\s*;?[ \t]*\n/gm, '')
  // Remove empty `if (proximityAction) { }` or `if (proximityAction) {\n}` blocks
  scriptSource = scriptSource.replace(/[ \t]*if\s*\(\s*proximityAction\s*\)\s*\{[\s\n]*\}[ \t]*\n?/g, '')
  // Remove `try { if (proximityAction) app.remove(proximityAction) } catch(e) {}` in onDispose
  scriptSource = scriptSource.replace(/[ \t]*try\s*\{[^}]*proximityAction[^}]*\}\s*catch[^}]*\}[ \t]*\n?/g, '')
  // Fix misindented closing brace left after removing content inside an if-block:
  // Pattern: any line ending with `= null` or `= null;` followed by a `}` with MORE indentation
  scriptSource = scriptSource.replace(/([ \t]*\w[^\n]*=\s*null\s*;?[ \t]*\n)([ \t]+\}[ \t]*\n)/g, (m, prev, brace) => {
    const prevIndent = prev.match(/^([ \t]*)/)[1].length
    const braceIndent = brace.match(/^([ \t]*)/)[1].length
    return braceIndent > prevIndent ? prev : m
  })
  // Fix screenshotView.visible = !isNear → always visible (proximity removed)
  scriptSource = scriptSource.replace(/\bscreenshotView\.visible\s*=\s*!isNear\b/g, 'screenshotView.visible = true')
  // Remove `if (isNear) { ... }` / `if (!isNear) { ... }` multi-line blocks
  scriptSource = removeIfIsNearBlocks(scriptSource)
  // Remove nearDist/farDist const/let declarations (only used in removed proximity code)
  scriptSource = scriptSource.replace(/^[ \t]*(?:const|let)\s+nearDist\s*=[^\n]+\n/gm, '')
  scriptSource = scriptSource.replace(/^[ \t]*(?:const|let)\s+farDist\s*=[^\n]+\n/gm, '')
  // isNear is now unused — remove its declaration
  scriptSource = scriptSource.replace(/^[ \t]*let\s+isNear\s*=\s*false[ \t]*\n/gm, '')
  // Clean up any double-blank lines left behind
  scriptSource = scriptSource.replace(/\n{3,}/g, '\n\n')

  // Remove app.remove(X) inside removeXxx() functions for nodes that were never app.add()'d
  // (they're in a holder, so only holder.remove() is valid)
  // Re-run holderAdded detection after all other patches
  const holderAddedFinal = new Set()
  const hap2 = /\b(?:holder|group)\s*\.add\(\s*(\w+)\s*\)/g
  let hm2
  while ((hm2 = hap2.exec(scriptSource)) !== null) holderAddedFinal.add(hm2[1])
  for (const varName of holderAddedFinal) {
    const re = new RegExp(`^[ \\t]*(?:try\\s*\\{\\s*)?app\\.remove\\(\\s*${varName}\\s*\\)(?:\\s*\\}\\s*catch[^}]*\\})?[ \\t]*\\n`, 'gm')
    scriptSource = scriptSource.replace(re, '')
  }

  return scriptSource
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
 * Ensure `if (!world.isClient) return` is the very first executable line,
 * immediately followed by `app.keepActive = true`.
 */
function ensureIsClientGuard(scriptSource) {
  const guard = 'if (!world.isClient) return'
  const keepActive = 'app.keepActive = true'

  // Remove any existing occurrences of both lines (we'll re-insert at top)
  let lines = scriptSource.split('\n').filter(l => l.trim() !== guard && l.trim() !== keepActive)

  // Remove leading blank lines
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()

  return guard + '\n' + keepActive + '\n\n' + lines.join('\n')
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
    version: 11,
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