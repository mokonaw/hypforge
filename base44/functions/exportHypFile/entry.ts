import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// --- Helpers ---
function nanoid(size = 10) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < size; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return id
}

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .slice(0, 50)
}

function extFromName(url) {
  const m = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
  return m ? m[1].toLowerCase() : ''
}

async function sha256Hex(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function patchScript(code) {
  let c = code
  // Remove app.on('update', ...) blocks
  c = c.replace(/app\.on\(\s*['"]update['"]\s*,\s*\([^)]*\)\s*=>\s*\{[^}]*\}\s*\)/g, '')
  // Replace props.onChange pattern
  c = c.replace(/app\.on\(\s*['"]config['"]\s*,\s*\(\)\s*=>\s*\{\s*applyAll\(\)\s*\}\s*\)/g, 'if (props && typeof props.onChange === \'function\') { props.onChange(() => { applyAll() }) }')
  // Replace config. with props.
  c = c.replace(/\bconfig\./g, 'props.')
  return c
}

function ensureIsClientGuard(code) {
  const lines = code.split('\n')
  const firstLine = lines[0]?.trim()
  if (firstLine === 'if (!world.isClient) return') {
    return code
  }
  if (firstLine.startsWith('//') && lines[1]?.trim() === 'if (!world.isClient) return') {
    return code
  }
  return 'if (!world.isClient) return\n' + code
}

function extractPropsFromScript(code) {
  const match = code.match(/app\.configure\(\s*\[([\s\S]*?)\]\s*\)/)
  if (!match) return {}
  const props = {}
  const lines = match[1].split('\n')
  for (const line of lines) {
    const keyMatch = line.match(/key\s*:\s*['"]([^'"]+)['"]/)
    const initialMatch = line.match(/initial\s*:\s*([^,}\n]+)/)
    if (keyMatch) {
      const key = keyMatch[1]
      if (initialMatch) {
        let val = initialMatch[1].trim()
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
          val = val.slice(1, -1)
        } else if (val === 'true' || val === 'false') {
          val = val === 'true'
        } else if (!isNaN(Number(val))) {
          val = Number(val)
        }
        props[key] = val
      } else {
        props[key] = ''
      }
    }
  }
  return props
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { name, description, author, modelFileUrl, script, effectParams } = body;

    // --- Model ---
    let modelUrl = null;
    let modelSize = 0;
    let modelExt = 'glb';
    if (modelFileUrl) {
      const modelRes = await fetch(modelFileUrl);
      const modelArrayBuffer = await modelRes.arrayBuffer();
      const modelBytes = new Uint8Array(modelArrayBuffer);
      modelExt = extFromName(modelFileUrl) || 'glb';
      const modelHash = await sha256Hex(modelBytes.buffer);
      modelUrl = `asset://${modelHash}.${modelExt}`;
      modelSize = modelBytes.length;
    }

    // --- Script ---
    let scriptSource = script || '';
    scriptSource = patchScript(scriptSource);
    scriptSource = ensureIsClientGuard(scriptSource);

    // Remove trailing orphan braces
    let prevLength = 0;
    while (prevLength !== scriptSource.length && /\n[ \t]*\}[ \t]*$/.test(scriptSource)) {
      prevLength = scriptSource.length;
      scriptSource = scriptSource.replace(/\n[ \t]*\}[ \t]*$/, '');
    }

    const encoder = new TextEncoder();
    const scriptBytes = encoder.encode(scriptSource);
    const scriptHash = await sha256Hex(scriptBytes.buffer);
    const scriptUrl = `asset://${scriptHash}.js`;

    // --- Props ---
    const scriptProps = extractPropsFromScript(scriptSource);
    const mergedProps = { ...scriptProps, ...(effectParams || {}) };

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
    };

    // --- Assets ---
    const assets = [];
    if (modelUrl) {
      assets.push({
        type: 'model',
        url: modelUrl,
        size: modelSize,
        mime: 'application/octet-stream',
      });
    }
    assets.push({
      type: 'script',
      url: scriptUrl,
      size: scriptBytes.length,
      mime: 'application/javascript',
    });

    // Return data for CLIENT-SIDE .hyp assembly (NO binary!)
    return Response.json({
      success: true,
      blueprint,
      assets,
      script: scriptSource,
      filename: `${slugify(name)}.hyp`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});