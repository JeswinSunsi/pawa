<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { omr, previewUrl } from '../api'
import {
  checkProduct, groupSizes, groupsIndex, similarProducts, suggestGroupKey, sharedFields, sameShared, LIMITS, isMarked,
  brandSpellings, barcodeIndex, brandList, brandFromName,
} from './productFile'

// Side drawer to add or edit one product. Works on a copy; nothing changes until Save.
const props = defineProps({
  product: { type: Object, required: true },
  products: { type: Array, required: true }, // the whole file, for suggestions and checks
  isNew: { type: Boolean, default: false },
  // Products to put in the same group when this one is saved (e.g. the product it was copied from).
  initialLinks: { type: Array, default: () => [] },
})
const emit = defineEmits(['save', 'cancel', 'delete', 'duplicate'])

const draft = ref(fromProduct(props.product))
const links = ref([...props.initialLinks])
const startState = JSON.stringify([draft.value, links.value])
const changed = computed(() => JSON.stringify([draft.value, links.value]) !== startState)

function fromProduct(p) {
  return {
    ...JSON.parse(JSON.stringify(p)), // a plain copy (structuredClone rejects Vue's reactive proxies)
    brand: p.brand ?? '',
    price: p.price ?? '',
    original_price: p.original_price ?? '',
    short_description: p.short_description ?? '',
    description: p.description ?? '',
    category: p.category ?? '',
    color: p.color ?? '',
    variant_group: p.variant_group ?? '',
    barcode: p.barcode ?? '', // kept as it is (even a number) so the check below can flag it
    image_url: [...(p.image_url || [])],
    badgesText: (p.badges || []).join(', '),
    specRows: Object.entries(p.specs || {}).map(([key, value]) => ({ key, value: String(value) })),
    inStock: p.availability === true,
    max_quantity: p.max_quantity ?? '',
    marked: isMarked(p),
  }
}

function toProduct(d) {
  const { badgesText, specRows, inStock, marked, ...rest } = d
  const specs = {}
  for (const row of specRows) if (row.key.trim()) specs[row.key.trim()] = row.value
  return {
    ...rest,
    name: rest.name.trim(),
    brand: typeof rest.brand === 'string' ? rest.brand.trim() : rest.brand,
    price: rest.price === '' ? '' : Number(rest.price),
    original_price: rest.original_price === '' || rest.original_price == null ? null : Number(rest.original_price),
    color: rest.color.trim(),
    variant_group: rest.variant_group.trim(),
    barcode: typeof rest.barcode === 'string' ? rest.barcode.trim() : rest.barcode,
    badges: badgesText.split(',').map((b) => b.trim()).filter(Boolean),
    specs,
    availability: inStock ? true : undefined,
    max_quantity: rest.max_quantity === '' || rest.max_quantity == null ? undefined : Number(rest.max_quantity),
    marker: marked ? 1 : undefined,
  }
}

// --- Lookups over the rest of the file ---
const others = computed(() => props.products.filter((p) => p.id !== draft.value.id))
const byId = computed(() => new Map(props.products.map((p) => [p.id, p])))
const groups = computed(() => groupsIndex(others.value))
const categories = computed(() => [...new Set(props.products.map((p) => p.category).filter(Boolean))].sort())
const colors = computed(() => [...new Set(props.products.map((p) => p.color).filter(Boolean))].sort())
const badges = computed(() => [...new Set(props.products.flatMap((p) => p.badges || []))].sort())
const brands = computed(() => brandList(props.products))
// An existing brand the name starts with, offered when the Brand field doesn't already say it.
const suggestedBrand = computed(() => {
  const b = brandFromName(draft.value.name, brands.value)
  return b && b !== (draft.value.brand || '').trim() ? b : ''
})

const groupKey = computed(() => draft.value.variant_group.trim())
const groupLower = computed(() => groupKey.value.toLowerCase())
const currentGroup = computed(() => groups.value.get(groupLower.value))

// What customers will see under "Other versions": the rest of the group plus products being linked now.
const versions = computed(() => {
  const list = currentGroup.value ? [...currentGroup.value.products] : []
  for (const id of links.value) {
    const p = byId.value.get(id)
    if (p && !list.includes(p)) list.push(p)
  }
  return list
})

const similar = computed(() => similarProducts(draft.value.name, others.value, { exceptId: draft.value.id })
  .filter(({ product }) => !versions.value.includes(product)))

function useGroup(key) {
  draft.value.variant_group = key
  groupOpen.value = false
}
function groupWith(p) {
  if (p.variant_group) return useGroup(p.variant_group)
  if (!groupKey.value) {
    // A new group with p: this product joins p, so it takes p's images, descriptions and specs.
    draft.value.variant_group = suggestGroupKey(p.name) || suggestGroupKey(draft.value.name)
    copySharedFrom(p)
  }
  // Otherwise p joins this product's group and takes this product's content when it's saved.
  if (!links.value.includes(p.id)) links.value.push(p.id)
}

// --- Content shared by a group: images, short description, description, specifications, max per order, marker ---
function draftShared() {
  return JSON.parse(JSON.stringify({
    image_url: draft.value.image_url, short_description: draft.value.short_description,
    description: draft.value.description, specRows: draft.value.specRows, max_quantity: draft.value.max_quantity,
    marked: draft.value.marked,
  }))
}
function applyShared(p) {
  const s = sharedFields(p)
  draft.value.image_url = s.image_url
  draft.value.short_description = s.short_description
  draft.value.description = s.description
  draft.value.specRows = Object.entries(s.specs).map(([key, value]) => ({ key, value: String(value) }))
  draft.value.max_quantity = s.max_quantity ?? ''
  draft.value.marked = s.marker === 1
}
const copied = ref(null) // { from, previous }: what joining a group replaced, for Undo
function copySharedFrom(p) {
  const previous = copied.value?.previous ?? draftShared()
  applyShared(p)
  copied.value = { from: p.name, previous }
}
function undoCopy() {
  Object.assign(draft.value, copied.value.previous)
  copied.value = null
}
// Typing or picking the key of an existing group joins it: take that group's content.
const startGroup = (props.product.variant_group || '').trim().toLowerCase()
watch(groupLower, (key) => {
  const group = groups.value.get(key)
  if (key && group && key !== startGroup) copySharedFrom(group.products[0])
})
// Versions whose shared content differs from this product's (saving makes them match).
const differing = computed(() => {
  const mine = toProduct(draft.value)
  return versions.value.filter((v) => !sameShared(v, mine))
})
function unlink(id) {
  links.value = links.value.filter((x) => x !== id)
}
function suggestFromName() {
  draft.value.variant_group = suggestGroupKey(draft.value.name)
}

// Group key suggestions: keys matching what's typed, or (when empty) the groups of similar products.
const groupOpen = ref(false)
const groupSuggestions = computed(() => {
  const q = groupLower.value
  let list
  if (!q) {
    const seen = new Set()
    list = similar.value.map(({ product }) => (product.variant_group || '').toLowerCase())
      .filter((k) => k && !seen.has(k) && seen.add(k)).map((k) => groups.value.get(k))
  } else {
    const words = q.split(/[\s-]+/).filter(Boolean)
    list = [...groups.value.entries()]
      .filter(([k]) => k !== q && words.every((w) => k.includes(w)))
      .sort(([a], [b]) => Number(b.startsWith(q)) - Number(a.startsWith(q)) || a.localeCompare(b))
      .map(([, g]) => g)
  }
  return list.filter(Boolean).slice(0, 8)
})
let closeTimer = null
function onGroupBlur() { closeTimer = setTimeout(() => { groupOpen.value = false }, 150) }
function onGroupFocus() { clearTimeout(closeTimer); groupOpen.value = true }

// --- Images ---
const newImage = ref('')
function addImages() {
  const urls = newImage.value.split(/\s+/).map((u) => u.trim()).filter(Boolean)
  for (const url of urls) if (!draft.value.image_url.includes(url)) draft.value.image_url.push(url)
  newImage.value = ''
}
function moveImage(i, d) {
  const list = draft.value.image_url
  const j = i + d
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
}
const brokenImages = ref(new Set())

// --- Specs ---
function addSpec() {
  draft.value.specRows.push({ key: '', value: '' })
  nextTick(() => document.querySelector('.spec-row:last-of-type input')?.focus())
}

// --- Checks & actions ---
const checks = computed(() => {
  const product = toProduct(draft.value)
  const sizes = groupSizes([...others.value, product])
  // Products linked now count toward the group too.
  if (groupLower.value) sizes[groupLower.value] = Math.max(sizes[groupLower.value] || 0, versions.value.length + 1)
  return checkProduct(product, sizes, brandSpellings([...others.value, product]), barcodeIndex([...others.value, product]))
})

const showErrors = ref(false)
function save() {
  if (newImage.value.trim()) addImages()
  if (checks.value.errors.length) {
    showErrors.value = true
    nextTick(() => document.querySelector('.editor-problems')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
    return
  }
  emit('save', toProduct(draft.value), links.value)
}
function cancel() {
  if (changed.value && !confirm('Discard your changes to this product?')) return
  emit('cancel')
}
function remove() {
  if (confirm(`Delete "${draft.value.name || 'this product'}" (#${draft.value.id})?`)) emit('delete', draft.value.id)
}
function duplicate() {
  if (changed.value && !confirm('Your unsaved changes to this product will be discarded. Continue?')) return
  emit('duplicate', props.product)
}

function onKey(e) {
  if (e.key === 'Escape') cancel()
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save()
}
const nameInput = ref(null)
onMounted(() => {
  window.addEventListener('keydown', onKey)
  if (props.isNew) nameInput.value?.focus()
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(() => draft.value.name, () => { showErrors.value = false })
</script>

<template>
  <aside class="drawer editor" role="dialog" aria-modal="true" :aria-label="isNew ? 'New product' : 'Edit product'">
    <div class="drawer-head">
      <div style="min-width: 0">
        <div class="muted small">{{ isNew ? 'New product' : 'Edit product' }} · #{{ draft.id }}</div>
        <h3 class="title">{{ draft.name || 'Untitled product' }}</h3>
      </div>
      <button class="btn icon ghost" title="Close (Esc)" @click="cancel">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
      </button>
    </div>

    <div class="drawer-body">
      <!-- Name + similar products -->
      <section class="stack">
        <label class="field">Name
          <input ref="nameInput" v-model="draft.name" type="text" placeholder="e.g. Redmi 17 4/128GB - Black" />
          <span class="hint">Start with the brand and put the color at the end after “ - ”, like the rest of the catalogue.</span>
        </label>
        <label class="field">Brand
          <div class="row nowrap">
            <input v-model="draft.brand" type="text" list="pf-brands" :maxlength="LIMITS.brand" placeholder="e.g. Porodo" style="flex: 1" />
            <button v-if="suggestedBrand" class="btn sm" type="button" title="The name starts with this brand" @click="draft.brand = suggestedBrand">Use “{{ suggestedBrand }}”</button>
          </div>
          <span class="hint">Spelled the same as on the brand’s other products. Leave empty only if the product has no brand.</span>
        </label>

        <div v-if="similar.length" class="suggest">
          <div class="suggest-head">
            <strong>Looks similar</strong>
            <span class="muted small">Same product in another color or size? Put them in one group.</span>
          </div>
          <ul class="mini-list">
            <li v-for="{ product: p } in similar" :key="p.id" class="mini">
              <img :src="previewUrl(p.image_url?.[0])" alt="" class="mthumb" loading="lazy" />
              <div class="info">
                <div class="name">{{ p.name }}</div>
                <div class="muted small">
                  #{{ p.id }}<template v-if="p.color"> · {{ p.color }}</template> · {{ omr(p.price) }}
                  <span v-if="p.variant_group" class="chip" :title="'Group key: ' + p.variant_group">{{ p.variant_group }}</span>
                </div>
              </div>
              <button v-if="p.variant_group" class="btn sm" @click="useGroup(p.variant_group)">Join group</button>
              <button v-else class="btn sm" @click="groupWith(p)">Group together</button>
            </li>
          </ul>
        </div>
      </section>

      <!-- Version -->
      <section class="stack">
        <div class="section-title">Version</div>
        <div class="two">
          <label class="field">Color
            <input v-model="draft.color" type="text" list="pf-colors" :maxlength="LIMITS.color" placeholder="e.g. Black" />
          </label>
          <div class="field group-field">
            <span>Group key</span>
            <div class="row nowrap">
              <input v-model="draft.variant_group" type="text" :maxlength="LIMITS.variantGroup" placeholder="e.g. redmi-17"
                autocomplete="off" role="combobox" :aria-expanded="groupOpen && groupSuggestions.length > 0"
                @focus="onGroupFocus" @blur="onGroupBlur" @input="groupOpen = true" @keydown.esc.stop="groupOpen = false" />
              <button class="btn sm" type="button" title="Make a key from the name" :disabled="!draft.name.trim()" @click="suggestFromName">From name</button>
            </div>
            <ul v-if="groupOpen && groupSuggestions.length" class="dropdown" role="listbox">
              <li v-for="g in groupSuggestions" :key="g.key" role="option" @mousedown.prevent="useGroup(g.key)">
                <div class="row nowrap" style="justify-content: space-between">
                  <code>{{ g.key }}</code>
                  <span class="muted small num">{{ g.products.length }} product{{ g.products.length === 1 ? '' : 's' }}</span>
                </div>
                <div class="muted small members">{{ g.products.slice(0, 3).map((p) => p.name).join(' · ') }}<template v-if="g.products.length > 3"> · …</template></div>
              </li>
            </ul>
          </div>
        </div>
        <p class="muted small" style="margin: 0">
          Products with the same group key show each other under “Other versions” on the product page.
          Leave it empty if this product has no other versions.
        </p>

        <div v-if="groupKey" class="versions">
          <div class="small" style="font-weight: 500">
            <template v-if="versions.length">Other versions customers will see ({{ versions.length }})</template>
            <template v-else>New group: no other product uses <code>{{ groupKey }}</code> yet.</template>
          </div>
          <ul v-if="versions.length" class="mini-list">
            <li v-for="p in versions" :key="p.id" class="mini">
              <img :src="previewUrl(p.image_url?.[0])" alt="" class="mthumb" loading="lazy" />
              <div class="info">
                <div class="name">{{ p.name }}</div>
                <div class="muted small">#{{ p.id }}<template v-if="p.color"> · {{ p.color }}</template> · {{ omr(p.price) }}</div>
              </div>
              <template v-if="links.includes(p.id)">
                <span class="chip new">Joins on save</span>
                <button class="btn icon sm ghost" title="Don't add to this group" @click="unlink(p.id)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </template>
            </li>
          </ul>
        </div>

        <div v-if="copied" class="copied">
          <span>Copied the images, descriptions, specifications, max per order and mark from <strong>{{ copied.from }}</strong>, since versions in a group share them.</span>
          <button class="btn sm" @click="undoCopy">Undo</button>
        </div>
        <div v-if="versions.length" class="shared-note small">
          Images, short description, description and specifications are shared by all
          {{ versions.length + 1 }} versions. Saving updates them on every version.
          <span v-if="differing.length" class="warn-text">
            {{ differing.length }} version{{ differing.length > 1 ? 's' : '' }} currently
            {{ differing.length > 1 ? 'have' : 'has' }} different content and will be changed to match this one.
          </span>
        </div>
      </section>

      <!-- Price & stock -->
      <section class="stack">
        <div class="section-title">Price & stock</div>
        <div class="two">
          <label class="field">Price (OMR)
            <input v-model="draft.price" type="number" min="0" step="0.001" inputmode="decimal" placeholder="0.000" />
          </label>
          <label class="field">Original price (OMR)
            <input v-model="draft.original_price" type="number" min="0" step="0.001" inputmode="decimal" placeholder="Optional" />
            <span class="hint">Above the price = shown as a discount.</span>
          </label>
        </div>
        <label class="check"><input v-model="draft.inStock" type="checkbox" /> Always in stock</label>
        <span v-if="draft.inStock" class="muted small">Shown in stock whatever Odoo says.</span>
        <span v-else-if="String(draft.barcode || '').trim()" class="muted small">Stock comes from Odoo through the barcode below.</span>
        <span v-else class="muted small warn-note">No barcode: the store shows “Out of stock” and a Notify me button instead of Add to cart.</span>
        <label class="field"><span>Barcode <span class="hint">(optional)</span></span>
          <input v-model="draft.barcode" type="text" inputmode="numeric" autocomplete="off" :maxlength="LIMITS.barcode" placeholder="Odoo variant barcode, e.g. 0194644199562" />
          <span class="hint">Links this product to Odoo for live stock (unless Always in stock is on). Each version has its own. Customers never see it.</span>
        </label>
        <label class="check"><input v-model="draft.marked" type="checkbox" /> Marked <span v-if="versions.length" class="shared-tag">Shared</span></label>
        <span class="muted small">Internal only, customers never see it. Use it to find products again later in the Marked filter, e.g. a price lowered for one day that has to be put back.<template v-if="versions.length"> Applies to every version in the group.</template></span>
        <label class="field"><span>Max per order <span v-if="versions.length" class="shared-tag">Shared</span></span>
          <input v-model="draft.max_quantity" type="number" min="1" :max="LIMITS.maxQuantity" step="1" inputmode="numeric"
            :placeholder="`Optional (store limit is ${LIMITS.maxQuantity})`" />
          <span class="hint">Leave empty for the usual limit. Set 1 or 2 for items customers may only buy a few of.<template v-if="versions.length"> Applies to every version in the group.</template></span>
        </label>
      </section>

      <!-- Details -->
      <section class="stack">
        <div class="section-title">Details</div>
        <div class="two">
          <label class="field">Category
            <input v-model="draft.category" type="text" list="pf-categories" placeholder="Choose or type" />
          </label>
          <label class="field">Tags
            <input v-model="draft.badgesText" type="text" list="pf-badges" placeholder="e.g. Sale, Hot" />
            <span class="hint">Separate with commas. The first one shows on the card.</span>
          </label>
        </div>
        <label class="field"><span>Short description <span v-if="versions.length" class="shared-tag">Shared</span></span>
          <input v-model="draft.short_description" type="text" placeholder="One line under the name" />
        </label>
        <label class="field"><span>Description <span v-if="versions.length" class="shared-tag">Shared</span></span>
          <textarea v-model="draft.description" rows="5" />
        </label>
      </section>

      <!-- Images -->
      <section class="stack">
        <div class="section-title">Images <span class="count num">{{ draft.image_url.length }}</span> <span v-if="versions.length" class="shared-tag">Shared by the group</span></div>
        <ol v-if="draft.image_url.length" class="images">
          <li v-for="(url, i) in draft.image_url" :key="i" class="image-row">
            <img v-if="!brokenImages.has(url)" :src="previewUrl(url)" alt="" class="ithumb" loading="lazy" @error="brokenImages.add(url)" />
            <div v-else class="ithumb broken" title="This link didn't load">!</div>
            <div class="info">
              <input v-model="draft.image_url[i]" type="url" :aria-label="'Image ' + (i + 1)" />
              <span class="muted small">{{ i === 0 ? 'Cover: shown on cards and in the cart' : 'Image ' + (i + 1) }}</span>
            </div>
            <div class="actions">
              <button class="btn icon sm" title="Move up" :disabled="i === 0" @click="moveImage(i, -1)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
              </button>
              <button class="btn icon sm" title="Move down" :disabled="i === draft.image_url.length - 1" @click="moveImage(i, 1)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <button class="btn icon sm danger" title="Remove image" @click="draft.image_url.splice(i, 1)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
              </button>
            </div>
          </li>
        </ol>
        <div class="row nowrap">
          <input v-model="newImage" type="url" placeholder="Paste image link(s)" style="flex: 1" @keydown.enter.prevent="addImages" />
          <button class="btn" :disabled="!newImage.trim()" @click="addImages">Add</button>
        </div>
      </section>

      <!-- Specs -->
      <section class="stack">
        <div class="section-title">Specifications <span class="count num">{{ draft.specRows.length }}</span> <span v-if="versions.length" class="shared-tag">Shared by the group</span></div>
        <div v-for="(row, i) in draft.specRows" :key="i" class="spec-row">
          <input v-model="row.key" type="text" placeholder="e.g. Battery" :aria-label="'Spec name ' + (i + 1)" />
          <input v-model="row.value" type="text" placeholder="e.g. 5000mAh" :aria-label="'Spec value ' + (i + 1)" />
          <button class="btn icon sm danger" title="Remove" @click="draft.specRows.splice(i, 1)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div><button class="btn sm" @click="addSpec">+ Add specification</button></div>
      </section>

      <div v-if="(showErrors && checks.errors.length) || checks.warnings.length" class="editor-problems">
        <p v-for="e in (showErrors ? checks.errors : [])" :key="e" class="error" style="margin: 0">{{ e }}</p>
        <p v-for="w in checks.warnings" :key="w" class="warn-text">{{ w }}</p>
      </div>
    </div>

    <div class="drawer-foot">
      <button class="btn primary" title="Ctrl+Enter" @click="save">{{ isNew ? 'Add product' : 'Save changes' }}</button>
      <button class="btn" @click="cancel">Cancel</button>
      <span class="spacer" />
      <template v-if="!isNew">
        <button class="btn" title="Copy this product as a new color or size, in the same group" @click="duplicate">Add another version</button>
        <button class="btn danger" @click="remove">Delete</button>
      </template>
    </div>

    <datalist id="pf-categories"><option v-for="c in categories" :key="c" :value="c" /></datalist>
    <datalist id="pf-colors"><option v-for="c in colors" :key="c" :value="c" /></datalist>
    <datalist id="pf-badges"><option v-for="b in badges" :key="b" :value="b" /></datalist>
    <datalist id="pf-brands"><option v-for="b in brands" :key="b" :value="b" /></datalist>
  </aside>
</template>

<style scoped>
.warn-note { color: var(--warn); }
.editor { width: min(640px, 100vw); }
.title { font-size: 17px; overflow-wrap: anywhere; }
.drawer-body > section { border-bottom: 1px solid var(--line-soft); padding-bottom: 22px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.nowrap { flex-wrap: nowrap; }
.nowrap > input { flex: 1; }
textarea { width: 100%; resize: vertical; }

.suggest { border: 1px solid #c7d7f5; background: #f5f8fe; border-radius: 12px; padding: 12px; display: grid; gap: 10px; }
.suggest-head { display: grid; gap: 2px; }
.versions { display: grid; gap: 8px; border: 1px solid var(--line); border-radius: 12px; padding: 12px; }
.mini-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.mini { display: flex; align-items: center; gap: 10px; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 6px 8px; }
.mthumb { width: 36px; height: 36px; object-fit: contain; border-radius: 6px; flex-shrink: 0; background: #fff; }
.info { flex: 1; min-width: 0; display: grid; gap: 2px; }
.name { font-weight: 500; font-size: 13px; overflow-wrap: anywhere; }
.chip { display: inline-block; font-size: 11px; font-family: ui-monospace, Menlo, Consolas, monospace; background: var(--hover); border-radius: 6px; padding: 1px 6px; margin-left: 4px; overflow-wrap: anywhere; }
.chip.new { font-family: inherit; background: #ebf6f0; color: var(--ok); white-space: nowrap; }

.group-field { position: relative; }
.dropdown {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 5; margin: 4px 0 0; padding: 4px; list-style: none;
  background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 12px 28px rgba(16, 24, 40, .12);
  max-height: 320px; overflow-y: auto; font-weight: 400;
}
.dropdown li { padding: 8px 10px; border-radius: 8px; cursor: pointer; display: grid; gap: 2px; }
.dropdown li:hover { background: var(--hover); }
.members { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.images { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.image-row { display: flex; align-items: center; gap: 10px; }
.ithumb { width: 52px; height: 52px; object-fit: contain; border: 1px solid var(--line); border-radius: 8px; background: #fff; flex-shrink: 0; }
.ithumb.broken { display: grid; place-items: center; color: var(--danger); font-weight: 700; background: #fcefef; }
.image-row input { width: 100%; padding: 7px 10px; font-size: 13px; }
.actions { display: flex; gap: 4px; flex-shrink: 0; }
.btn.icon.sm { width: 32px; height: 32px; padding: 6px; }
.spec-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr) auto; gap: 8px; align-items: center; }

.editor-problems { display: grid; gap: 6px; }
.copied { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 12px; background: #ebf6f0; color: #0f5132; font-size: 13px; }
.shared-note { display: grid; gap: 4px; padding: 10px 12px; border-radius: 12px; background: #f9fafb; border: 1px solid var(--line); color: var(--text-2); }
.shared-tag { font-size: 11px; font-weight: 500; text-transform: none; letter-spacing: 0; color: var(--info); background: #eef4fc; border-radius: 6px; padding: 1px 6px; margin-left: 4px; }
.warn-text { color: var(--warn); margin: 0; font-size: 13px; }

@media (max-width: 700px) {
  .two { grid-template-columns: 1fr; }
  .image-row { flex-wrap: wrap; }
  .image-row .actions { width: 100%; justify-content: flex-end; }
  .spec-row { grid-template-columns: 1fr auto; }
  .spec-row input:first-child { grid-column: 1 / -1; }
  .btn.icon.sm { width: 44px; height: 44px; }
}
</style>
