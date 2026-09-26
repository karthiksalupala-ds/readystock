import { useEffect, useState } from 'react'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { furnitureAssetFor } from './catalog'
import { cloneFurniture, type FurnitureInstance } from './furniture'

const sources = new Map<string, Promise<GLTF>>()

function loadSource(url: string) {
  let source = sources.get(url)
  if (!source) {
    source = new GLTFLoader().loadAsync(url)
    sources.set(url, source)
  }
  return source
}

/** Async loading leaves a usable box fallback and cannot suspend the entire room. */
export function useFurniture(type: string) {
  const url = furnitureAssetFor(type)
  const [loaded, setLoaded] = useState<{ url: string; instance: FurnitureInstance | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let active = true
    let instance: FurnitureInstance | null = null
    loadSource(url).then(
      (source) => {
        if (!active) return
        instance = cloneFurniture(source.scene)
        setLoaded({ url, instance })
      },
      () => { if (active) setLoaded({ url, instance: null }) },
    )
    return () => {
      active = false
      instance?.dispose()
    }
  }, [url])
  return {
    ready: !url || loaded?.url === url,
    instance: loaded && loaded.url === url ? loaded.instance : null,
  }
}
