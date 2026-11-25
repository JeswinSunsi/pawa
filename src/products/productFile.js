// Helpers for editing the store's products.json in the browser (Products file tab).
// The rules mirror the store backend (porodo/main.py, Product), so a file that passes here loads there.

// Field order written to the file; any other fields a product has are kept after these.
const FIELD_ORDER = ['id', 'name', 'brand', 'price', 'original_price', 'short_description', 'description',
  'image_url', 'category', 'specs', 'color', 'variant_group', 'barcode', 'badges', 'availability', 'max_quantity', 'marker']

// maxQuantity: the store-wide per-order limit (MAX_QUANTITY_PER_PRODUCT in porodo/main.py);
// a product's own max_quantity must be 1 up to this.
export const LIMITS = { brand: 50, color: 50, variantGroup: 100, barcode: 64, maxQuantity: 10 }

/** Parses a products.json text into a list of products, or throws a readable error. */
export function parseProductsFile(text) {
  let data
  try { data = JSON.parse(text) } catch (e) { throw new Error(`This isn't valid JSON (${e.message}).`) }
  if (!Array.isArray(data)) throw new Error('The file should contain a list of products ([ ... ]).')
  data.forEach((p, i) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) throw new Error(`Entry ${i + 1} isn't a product.`)
  })
  return data.map(normalize)
}

/** Fills in the shapes the editor relies on, without dropping anything. */
export function normalize(p) {
  const images = Array.isArray(p.image_url) ? p.image_url : typeof p.image_url === 'string' ? [p.image_url] : []
  return { ...p, image_url: images.filter((u) => typeof u === 'string') }
}

/** A product exactly as it is written to the file: known fields in order, blanks dropped. */
export function toFileProduct(p) {
  const out = {}
  const clean = {
    ...p,
    name: (p.name || '').trim(),
    // Every product carries the key; null only for a product that genuinely has no brand.
    brand: typeof p.brand === 'string' ? p.brand.trim() || null : p.brand ?? null,
    short_description: p.short_description ?? null,
    description: p.description ?? null,
    category: p.category?.trim() || null,
    color: p.color?.trim() || undefined,
    variant_group: p.variant_group?.trim() || undefined,
    // The Odoo variant barcode, always as a string (a number would lose leading zeros); only products that have one carry it.
    // A number from a hand-edited file is kept as it is, so checkProduct reports it.
    barcode: typeof p.barcode === 'string' ? p.barcode.trim() || undefined : p.barcode ?? undefined,
    image_url: (p.image_url || []).map((u) => u.trim()).filter(Boolean),
    // Like the store's file: only products with tags carry badges, and only discounted ones original_price.
    badges: (p.badges || []).map((b) => b.trim()).filter(Boolean),
    specs: p.specs && typeof p.specs === 'object' ? p.specs : null,
    original_price: p.original_price === '' || p.original_price == null ? undefined : Number(p.original_price),
    price: p.price === '' || p.price == null ? p.price : Number(p.price),
    // Like the store (porodo/main.py, Product.availability): `true` = always in stock, whatever Odoo says.
    // Missing = stock from Odoo for a product with a barcode, otherwise out of stock. Only `true` is written.
    availability: p.availability === true ? true : undefined,
    // Only limited products carry it (e.g. 1 or 2 per order); missing means the store-wide limit.
    max_quantity: p.max_quantity === '' || p.max_quantity == null ? undefined : Number(p.max_quantity),
    // Internal flag (not shown in the store): only marked products carry it, as 1.
    marker: isMarked(p) ? 1 : undefined,
  }
  // Keep the product's own field order (so untouched products are written back unchanged);
  // fields it didn't have go where FIELD_ORDER puts them.
  const order = Object.keys(p)
  for (const key of FIELD_ORDER) {
    if (order.includes(key)) continue
    const before = FIELD_ORDER.slice(0, FIELD_ORDER.indexOf(key)).reverse().find((k) => order.includes(k))
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, key)
  }
  if (!clean.badges.length) clean.badges = undefined
  for (const key of order) if (clean[key] !== undefined) out[key] = clean[key]
  return out
}

/** The file text: 2-space indents like the store's products.json, whole prices without a decimal point (10, not 10.0). */
export function serialize(products) {
  return JSON.stringify(products.map(toFileProduct), null, 2)
}

// Every version in a group shares these: joining a group copies them, and saving one version updates the rest.
// max_quantity and marker too: a per-order limit or a mark on one version applies to all of them.
export const SHARED_FIELDS = ['image_url', 'short_description', 'description', 'specs', 'max_quantity', 'marker']

/** A copy of the fields a product shares with the rest of its group. */
export function sharedFields(p) {
  return {
    image_url: [...(p.image_url || [])],
    short_description: p.short_description ?? '',
    description: p.description ?? '',
    specs: { ...(p.specs || {}) },
    max_quantity: p.max_quantity === '' || p.max_quantity == null ? null : Number(p.max_quantity),
    marker: isMarked(p) ? 1 : null,
  }
}

export const sameShared = (a, b) => JSON.stringify(sharedFields(a)) === JSON.stringify(sharedFields(b))

/** Marked for follow-up in the admin (e.g. a one-day price to put back); `"marker": 1` in the file. */
export const isMarked = (p) => Number(p.marker) === 1

export function nextId(products) {
  return products.reduce((max, p) => Math.max(max, Number.isInteger(p.id) ? p.id : -1), -1) + 1
}

export function blankProduct(id) {
  return {
    id, name: '', brand: '', price: '', original_price: null, short_description: '', description: '',
    image_url: [], category: '', specs: {}, color: '', variant_group: '', barcode: '', badges: [],
  }
}

const decimals = (n) => (String(n).split('.')[1] || '').length

/**
 * Problems with one product. `errors` stop the store from starting; `warnings` don't.
 * `groupSizes` maps a lower-cased group key to how many products use it.
 * `brands` (from brandSpellings) maps a lower-cased brand to how the catalogue spells it.
 * `barcodes` (from barcodeIndex) maps a barcode to the IDs of the products that use it.
 */
export function checkProduct(p, groupSizes = {}, brands = {}, barcodes = {}) {
  const errors = []
  const warnings = []
  if (!Number.isInteger(p.id) || p.id < 0) errors.push('ID must be a whole number, 0 or more.')
  const name = (p.name || '').trim()
  if (!name) errors.push('Name is required.')
  if (p.brand != null && typeof p.brand !== 'string') errors.push('Brand must be text.')
  else {
    const brand = (p.brand || '').trim()
    if (brand.length > LIMITS.brand) errors.push(`Brand can be at most ${LIMITS.brand} characters.`)
    else if (brand) {
      if (name && name !== brand && !name.startsWith(brand + ' ')) warnings.push(`The name should start with the brand (“${brand} …”).`)
      const spelling = brands[brand.toLowerCase()]
      if (spelling && spelling !== brand) warnings.push(`Brand is spelled “${spelling}” elsewhere in the catalogue.`)
    }
  }
  const price = p.price === '' || p.price == null ? NaN : Number(p.price)
  if (Number.isNaN(price) || price < 0) errors.push('Price is required and can’t be negative.')
  else if (decimals(p.price) > 3) errors.push('Price can have at most 3 decimals (baisa).')
  if (p.original_price !== null && p.original_price !== '' && p.original_price !== undefined) {
    const original = Number(p.original_price)
    if (Number.isNaN(original) || original < 0) errors.push('Original price can’t be negative.')
    else if (decimals(p.original_price) > 3) errors.push('Original price can have at most 3 decimals.')
    else if (!Number.isNaN(price) && original <= price) warnings.push('Original price isn’t above the price, so no discount is shown.')
  }
  if (!(p.image_url || []).some((u) => u.trim())) errors.push('Add at least one image.')
  if (p.max_quantity !== '' && p.max_quantity != null) {
    const max = Number(p.max_quantity)
    if (!Number.isInteger(max) || max < 1 || max > LIMITS.maxQuantity) {
      errors.push(`Max per order must be a whole number from 1 to ${LIMITS.maxQuantity}.`)
    }
  }
  if ((p.color || '').trim().length > LIMITS.color) errors.push(`Color can be at most ${LIMITS.color} characters.`)
  const group = (p.variant_group || '').trim()
  if (group.length > LIMITS.variantGroup) errors.push(`Group key can be at most ${LIMITS.variantGroup} characters.`)
  else if (group && (groupSizes[group.toLowerCase()] || 0) < 2) warnings.push('No other product uses this group key, so no other versions are shown.')
  if (p.barcode != null && p.barcode !== '') {
    if (typeof p.barcode !== 'string') errors.push('Barcode must be text, not a number (a number loses leading zeros). Retype it here, or put it in quotes in the file.')
    else if (p.barcode.trim().length > LIMITS.barcode) errors.push(`Barcode can be at most ${LIMITS.barcode} characters.`)
    else {
      const twins = (barcodes[p.barcode.trim()] || []).filter((id) => id !== p.id)
      if (twins.length) warnings.push(`Barcode is also used by ${twins.map((id) => '#' + id).join(', ')}, so they share the same Odoo stock.`)
    }
  }
  return { errors, warnings }
}

export function groupSizes(products) {
  const sizes = {}
  for (const p of products) {
    const key = (p.variant_group || '').trim().toLowerCase()
    if (key) sizes[key] = (sizes[key] || 0) + 1
  }
  return sizes
}

/** Lower-cased brand → its first spelling in file order (the store backend compares against that one). */
export function brandSpellings(products) {
  const spellings = {}
  for (const p of products) {
    const brand = typeof p.brand === 'string' ? p.brand.trim() : ''
    if (brand && !(brand.toLowerCase() in spellings)) spellings[brand.toLowerCase()] = brand
  }
  return spellings
}

/** Barcode → IDs of the products that use it. */
export function barcodeIndex(products) {
  const index = {}
  for (const p of products) {
    const code = typeof p.barcode === 'string' ? p.barcode.trim() : ''
    if (code) (index[code] ||= []).push(p.id)
  }
  return index
}

/** The catalogue's brands, A–Z. */
export const brandList = (products) => Object.values(brandSpellings(products)).sort((a, b) => a.localeCompare(b))

/** The existing brand a name starts with (the longest match), or ''. */
export function brandFromName(name, brands) {
  const n = (name || '').trim().toLowerCase()
  return brands.filter((b) => n === b.toLowerCase() || n.startsWith(b.toLowerCase() + ' '))
    .sort((a, b) => b.length - a.length)[0] || ''
}

// --- Similar products and group keys ---

const COLOR_WORDS = new Set(('black white blue gray grey green silver orange transparent clear gold pink beige brown red ' +
  'titanium purple space charcoal burgundy teal sky rose dark khaki midnight sunrise airy cloud blush twilight navy ' +
  'yellow cyan mint lavender light').split(' '))
const FILLER = new Set('with and the for in of to a an by'.split(' '))
const SIZE_TOKEN = /^\d+(gb|tb|mah|ft|m|mm|w|inch)?$/

function tokens(name) {
  return new Set((name || '').toLowerCase().split(/[^a-z0-9]+/)
    .filter((t) => t && !COLOR_WORDS.has(t) && !FILLER.has(t)))
}

/** 0..1: how much two product names share, ignoring colours and small words. */
export function nameSimilarity(a, b) {
  const ta = tokens(a)
  const tb = tokens(b)
  if (!ta.size || !tb.size) return 0
  let shared = 0
  let weight = 0
  for (const t of new Set([...ta, ...tb])) {
    const w = SIZE_TOKEN.test(t) ? 0.5 : 1 // sizes differ between versions; they count for less
    weight += w
    if (ta.has(t) && tb.has(t)) shared += w
  }
  return shared / weight
}

/** Products whose names look like `name`, best first. */
export function similarProducts(name, products, { exceptId, limit = 8, min = 0.4 } = {}) {
  if (tokens(name).size < 2) return []
  return products
    .filter((p) => p.id !== exceptId)
    .map((p) => ({ product: p, score: nameSimilarity(name, p.name) }))
    .filter((r) => r.score >= min)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** A group key from a product name: kebab-case, without the colour suffix or storage sizes. */
export function suggestGroupKey(name) {
  return (name || '')
    .replace(/\s+-\s+[^-]+$/, '') // " - Black"
    .toLowerCase()
    .replace(/\b\d+\s*(gb)?\s*[+/]\s*\d+\s*(gb|tb)?\b/g, ' ') // 8/256GB, 12GB+256GB
    .replace(/\b\d+\s*(gb|tb)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, LIMITS.variantGroup)
}

/** Every group key in the file with its products (in file order). */
export function groupsIndex(products) {
  const groups = new Map()
  for (const p of products) {
    const key = (p.variant_group || '').trim()
    if (!key) continue
    const lower = key.toLowerCase()
    if (!groups.has(lower)) groups.set(lower, { key, products: [] })
    groups.get(lower).products.push(p)
  }
  return groups
}
