export type ProductAsset = {
  key: string
  image: string
}

export const PRODUCT_ASSETS: ProductAsset[] = [
  { key: 'rice-bag-5kg', image: '/products/rice-bag-5kg/front.png' },
  { key: 'cooking-oil-1l', image: '/products/cooking-oil-1l/front.png' },
  { key: 'toor-dal-1kg', image: '/products/toor-dal-1kg/front.png' },
  { key: 'soap-pack', image: '/products/soap-pack/front.png' },
]

export function productAssetForLabel(label: string): ProductAsset | undefined {
  const value = label.toLowerCase()
  if (value.includes('rice bag')) return PRODUCT_ASSETS[0]
  if (value.includes('oil bottle')) return PRODUCT_ASSETS[1]
  if (value.includes('dal packet')) return PRODUCT_ASSETS[2]
  if (value.includes('soap pack')) return PRODUCT_ASSETS[3]
  return undefined
}
