import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import type { Plugin } from 'vite'

const require = createRequire(import.meta.url)
export function decoderAssets(): { fileName: string; source: Buffer }[] {
  const root = resolve(dirname(require.resolve('three')), '../examples/jsm/libs/draco/gltf')
  return ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js'].map(name => ({
    fileName: `decoders/draco/${name}`, source: readFileSync(resolve(root, name)),
  }))
}

/** Serve exactly these files in dev and emit identical resources during build. */
export function localDecoders(): Plugin {
  const assets = decoderAssets()
  let base = '/'
  return {
    name: 'intelidar-local-decoders',
    configResolved(config) { base = config.base },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const asset = assets.find(item => request.url?.split('?')[0] === `${base}${item.fileName}`)
        if (!asset) return next()
        response.setHeader('Content-Type', asset.fileName.endsWith('.wasm') ? 'application/wasm' : 'text/javascript')
        response.end(asset.source)
      })
    },
    generateBundle() {
      for (const asset of assets) this.emitFile({ type: 'asset', fileName: asset.fileName, source: asset.source })
    },
  }
}
