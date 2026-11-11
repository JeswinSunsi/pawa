<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { omr, previewUrl } from '../api'
import ProductEditor from '../products/ProductEditor.vue'
import {
  parseProductsFile, serialize, toFileProduct, nextId, blankProduct, checkProduct, groupSizes, groupsIndex,
  suggestGroupKey,
} from '../products/productFile'

// Edit the store's products.json in the browser: import the file, change it, download the new one.
// Work in progress is kept in this browser (localStorage), so a refresh or closed tab loses nothing.

const DRAFT_KEY = 'adminProductsDraft'
const PAGE = 50

const fileName = ref('')
const products = ref([])
const baseline = ref([]) // the file as imported, to show what changed
const unsavedSinceDownload = ref(false)
const lastDownload = ref(null)
const draftWarning = ref('')

// --- Draft in this browser ---
function readDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null')
    if (d && Array.isArray(d.products) && Array.isArray(d.baseline)) {
      fileName.value = d.fileName || 'products.json'
      products.value = d.products
      baseline.value = d.baseline
      unsavedSinceDownload.value = Boolean(d.unsavedSinceDownload)
      lastDownload.value = d.lastDownload || null
    }
  } catch { localStorage.removeItem(DRAFT_KEY) }
}
readDraft()

let saveTimer = null
function writeDraft() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      if (!products.value.length && !baseline.value.length) localStorage.removeItem(DRAFT_KEY)
      else localStorage.setItem(DRAFT_KEY, JSON.stringify({
        fileName: fileName.value, products: products.value, baseline: baseline.value,
        unsavedSinceDownload: unsavedSinceDownload.value, lastDownload: lastDownload.value,
      }))
      draftWarning.value = ''
    } catch {
      draftWarning.value = 'This browser couldn’t keep a backup of your changes. Download the file before closing the tab.'
    }
  }, 400)
}
watch([products, baseline, unsavedSinceDownload, lastDownload], writeDraft, { deep: true })
onBeforeUnmount(() => clearTimeout(saveTimer))

const loaded = computed(() => baseline.value.length > 0 || products.value.length > 0)

// --- Import ---
const importError = ref('')
const dragging = ref(false)
const fileInput = ref(null)

function chooseFile() {
  if (unsavedSinceDownload.value && !confirm('You have changes you haven’t downloaded yet. Importing another file replaces them. Continue?')) return
  fileInput.value?.click()
}
async function importFile(file) {
  importError.value = ''
  if (!file) return
  try {
    const list = parseProductsFile(await file.text())
    if (!list.length) throw new Error('The file has no products.')
    fileName.value = file.name
    products.value = list
    baseline.value = JSON.parse(JSON.stringify(list))
    unsavedSinceDownload.value = false
    lastDownload.value = null
    resetView()
    flash(`Imported ${list.length} products from ${file.name}.`)
  } catch (e) {
    importError.value = e.message
  }
}
function onPick(e) {
  importFile(e.target.files?.[0])
  e.target.value = ''
}
function onDrop(e) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (!file) return
  if (loaded.value && unsavedSinceDownload.value && !confirm('You have changes you haven’t downloaded yet. Importing another file replaces them. Continue?')) return
  importFile(file)
}
function closeFile() {
  if (unsavedSinceDownload.value && !confirm('Close this file? Changes you haven’t downloaded will be lost.')) return
  products.value = []
  baseline.value = []
  fileName.value = ''
  unsavedSinceDownload.value = false
  lastDownload.value = null
  editing.value = null
}

// --- What changed since the import ---
const baselineById = computed(() => new Map(baseline.value.map((p) => [p.id, JSON.stringify(toFileProduct(p))])))
const statusOf = computed(() => {
  const status = new Map()
  for (const p of products.value) {
    const before = baselineById.value.get(p.id)
    if (before === undefined) status.set(p.id, 'added')
    else if (before !== JSON.stringify(toFileProduct(p))) status.set(p.id, 'edited')
  }
  return status
})
const currentIds = computed(() => new Set(products.value.map((p) => p.id)))
const deleted = computed(() => baseline.value.filter((p) => !currentIds.value.has(p.id)))
const counts = computed(() => {
  let added = 0
  let edited = 0
  for (const s of statusOf.value.values()) s === 'added' ? added++ : edited++
  return { added, edited, deleted: deleted.value.length }
})
const anyChange = computed(() => counts.value.added + counts.value.edited + counts.value.deleted > 0)

// --- Problems ---
const problems = computed(() => {
  const sizes = groupSizes(products.value)
  const idCount = new Map()
  for (const p of products.value) idCount.set(p.id, (idCount.get(p.id) || 0) + 1)
  const out = new Map()
  for (const p of products.value) {
    const r = checkProduct(p, sizes)
    if (idCount.get(p.id) > 1) r.errors.unshift(`ID #${p.id} is used by more than one product.`)
    if (r.errors.length || r.warnings.length) out.set(p, r)
  }
  return out
})
const errorCount = computed(() => [...problems.value.values()].filter((r) => r.errors.length).length)
const warningCount = computed(() => [...problems.value.values()].filter((r) => !r.errors.length && r.warnings.length).length)

// --- Browse ---
const search = ref('')
const filter = ref('all')
const category = ref('')
const sort = ref('file')
const shown = ref(PAGE)
function resetView() {
  search.value = ''
  filter.value = 'all'
  category.value = ''
  shown.value = PAGE
}
watch([search, filter, category, sort], () => { shown.value = PAGE })

const groups = computed(() => groupsIndex(products.value))
const categories = computed(() => [...new Set(products.value.map((p) => p.category).filter(Boolean))].sort())
const FILTERS = computed(() => [
  { key: 'all', label: 'All', count: products.value.length },
  { key: 'changed', label: 'Changed', count: counts.value.added + counts.value.edited },
  { key: 'grouped', label: 'In a group' },
  { key: 'single', label: 'No group' },
  { key: 'out', label: 'Out of stock' },
  { key: 'problems', label: 'Problems', count: errorCount.value + warningCount.value },
])

const visible = computed(() => {
  const q = search.value.trim().toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  let list = products.value.filter((p) => {
    if (category.value && p.category !== category.value) return false
    switch (filter.value) {
      case 'changed': if (!statusOf.value.has(p.id)) return false; break
      case 'grouped': if (!p.variant_group) return false; break
      case 'single': if (p.variant_group) return false; break
      case 'out': if (p.availability !== false) return false; break
      case 'problems': if (!problems.value.has(p)) return false; break
    }
    if (!words.length) return true
    if (q === String(p.id) || q === '#' + p.id) return true
    const hay = `${p.name} ${p.category || ''} ${p.color || ''} ${p.variant_group || ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
  if (sort.value === 'name') list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
  else if (sort.value === 'newest') list = [...list].sort((a, b) => b.id - a.id)
  else if (sort.value === 'group') list = [...list].sort((a, b) => (a.variant_group || '￿').localeCompare(b.variant_group || '￿') || (a.name || '').localeCompare(b.name || ''))
  return list
})
const page = computed(() => visible.value.slice(0, shown.value))
function showGroup(key) {
  search.value = key
  filter.value = 'all'
  category.value = ''
}

// --- Edit / add / delete ---
const editing = ref(null) // { product, isNew, links }
function openEditor(p) { editing.value = { product: p, isNew: false, links: [] } }
function addProduct() { editing.value = { product: blankProduct(nextId(products.value)), isNew: true, links: [] } }
function addVersionOf(source) {
  const base = (source.name || '').replace(/\s+-\s+[^-]+$/, '')
  const key = source.variant_group || suggestGroupKey(source.name)
  const copy = {
    ...JSON.parse(JSON.stringify(source)),
    id: nextId(products.value),
    name: base + ' - ',
    color: '',
    variant_group: key,
  }
  delete copy.availability
  editing.value = null
  // Open on the next tick so the drawer remounts with the copy.
  setTimeout(() => { editing.value = { product: copy, isNew: true, links: source.variant_group ? [] : [source.id] } })
}

function onSave(product, links) {
  const list = products.value
  const index = list.findIndex((p) => p.id === product.id)
  if (index === -1) list.push(product)
  else list[index] = product
  for (const id of links) {
    const other = list.find((p) => p.id === id)
    if (other) other.variant_group = product.variant_group
  }
  unsavedSinceDownload.value = true
  const linked = links.length ? ` and grouped with ${links.length} other product${links.length > 1 ? 's' : ''}` : ''
  flash(`${editing.value?.isNew ? 'Added' : 'Saved'} #${product.id}${linked}.`)
  editing.value = null
}

let lastDeleted = null
function onDelete(id) {
  const index = products.value.findIndex((p) => p.id === id)
  if (index === -1) return
  lastDeleted = { product: products.value[index], index }
  products.value.splice(index, 1)
  unsavedSinceDownload.value = true
  editing.value = null
  flash(`Deleted #${id}.`, { label: 'Undo', run: undoDelete })
}
function undoDelete() {
  if (!lastDeleted) return
  products.value.splice(Math.min(lastDeleted.index, products.value.length), 0, lastDeleted.product)
  flash(`Restored #${lastDeleted.product.id}.`)
  lastDeleted = null
}
function restore(p) {
  const at = baseline.value.findIndex((b) => b.id === p.id)
  // Put it back near where it was in the imported file.
  const after = baseline.value.slice(0, at).reverse().find((b) => currentIds.value.has(b.id))
  const index = after ? products.value.findIndex((x) => x.id === after.id) + 1 : 0
  products.value.splice(index, 0, JSON.parse(JSON.stringify(p)))
  unsavedSinceDownload.value = true
  flash(`Restored #${p.id}.`)
}
function revert(p) {
  if (!confirm(`Undo all changes to #${p.id} since the import?`)) return
  const original = baseline.value.find((b) => b.id === p.id)
  const index = products.value.findIndex((x) => x.id === p.id)
  if (original && index !== -1) products.value[index] = JSON.parse(JSON.stringify(original))
  editing.value = null
  flash(`Reverted #${p.id}.`)
}

// --- Download ---
function download() {
  if (errorCount.value && !confirm(`${errorCount.value} product${errorCount.value > 1 ? 's have' : ' has'} problems the store can’t load (see the Problems filter). Download anyway?`)) return
  const blob = new Blob([serialize(products.value)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'products.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  unsavedSinceDownload.value = false
  lastDownload.value = new Date().toISOString()
  flash('Downloaded products.json. Replace the file in the store repository and deploy to publish.')
}
const lastDownloadText = computed(() => lastDownload.value
  ? new Date(lastDownload.value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '')

// --- Toast ---
const toast = ref(null)
let toastTimer = null
function flash(text, action = null) {
  clearTimeout(toastTimer)
  toast.value = { text, action }
  toastTimer = setTimeout(() => { toast.value = null }, action ? 8000 : 4000)
}
function runToastAction() {
  const run = toast.value?.action?.run
  toast.value = null
  run?.()
}

function problemText(p) {
  const r = problems.value.get(p)
  return r ? [...r.errors, ...r.warnings].join('\n') : ''
}
</script>

<template>
  <div class="page-head">
    <h1>Products file</h1>
    <div v-if="loaded" class="row">
      <button class="btn" @click="chooseFile">Import another file</button>
      <button class="btn" :class="{ primary: unsavedSinceDownload }" @click="download">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
        Download products.json
      </button>
      <button class="btn primary" @click="addProduct">+ Add product</button>
    </div>
  </div>
  <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onPick" />

  <!-- Nothing imported yet -->
  <div v-if="!loaded" class="card">
    <div class="card-body stack">
      <button
        class="dropzone" :class="{ over: dragging }" @click="fileInput?.click()"
        @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M7 8l5-5 5 5M5 21h14a2 2 0 0 0 2-2v-4M3 15v4a2 2 0 0 0 2 2" /></svg>
        <strong>Import products.json</strong>
        <span class="muted">Drop the file here, or click to choose it.</span>
      </button>
      <p v-if="importError" class="error" style="margin: 0">{{ importError }}</p>
      <div class="notice stack" style="gap: 6px">
        <strong>How it works</strong>
        <span>1. Import the store’s current <code>products.json</code> (in the store repository).</span>
        <span>2. Edit, add or delete products. Your work is kept in this browser until you download it.</span>
        <span>3. Download the new <code>products.json</code>, replace the old file in the store repository and deploy.</span>
      </div>
    </div>
  </div>

  <template v-else>
    <div class="summary" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
      <div class="row">
        <strong>{{ fileName }}</strong>
        <span class="muted num">{{ products.length }} products · {{ groups.size }} groups</span>
        <template v-if="anyChange">
          <span v-if="counts.edited" class="tag edited num">{{ counts.edited }} edited</span>
          <span v-if="counts.added" class="tag added num">{{ counts.added }} added</span>
          <span v-if="counts.deleted" class="tag deleted num">{{ counts.deleted }} deleted</span>
        </template>
        <span v-else class="muted small">No changes yet</span>
      </div>
      <div class="row small">
        <span v-if="unsavedSinceDownload" class="warn-text">Changes not downloaded yet</span>
        <span v-else-if="lastDownloadText" class="muted">Downloaded {{ lastDownloadText }}</span>
        <button class="btn ghost sm" @click="closeFile">Close file</button>
      </div>
    </div>
    <p v-if="importError" class="error">{{ importError }}</p>
    <p v-if="draftWarning" class="error">{{ draftWarning }}</p>

    <div class="card">
      <div class="card-head filters">
        <div class="search grow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input v-model="search" type="search" placeholder="Search name, #ID, color or group key" />
        </div>
        <select v-model="category" aria-label="Category">
          <option value="">All categories</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="sort" aria-label="Sort">
          <option value="file">File order</option>
          <option value="name">Name A–Z</option>
          <option value="group">By group</option>
          <option value="newest">Newest ID first</option>
        </select>
        <div class="seg chips" role="group" aria-label="Show">
          <button v-for="f in FILTERS" :key="f.key" :class="{ on: filter === f.key, bad: f.key === 'problems' && errorCount }" :aria-pressed="filter === f.key" @click="filter = f.key">
            {{ f.label }}<span v-if="f.count" class="num"> {{ f.count }}</span>
          </button>
        </div>
      </div>

      <div class="card-body" style="padding-top: 8px">
        <ul v-if="page.length" class="plist">
          <li v-for="p in page" :key="p.id" class="prow" tabindex="0" @click="openEditor(p)" @keydown.enter="openEditor(p)">
            <img :src="previewUrl(p.image_url?.[0])" alt="" class="pthumb" loading="lazy" />
            <div class="pmain">
              <div class="pname">
                <span v-if="statusOf.get(p.id)" class="dot" :class="statusOf.get(p.id)" :title="statusOf.get(p.id) === 'added' ? 'Added' : 'Edited'" />
                {{ p.name || 'Untitled product' }}
              </div>
              <div class="muted small meta">
                <span class="num">#{{ p.id }}</span>
                <span v-if="p.category">{{ p.category }}</span>
                <span v-if="p.color">{{ p.color }}</span>
                <button v-if="p.variant_group" class="chip" :title="'Show all products in ' + p.variant_group" @click.stop="showGroup(p.variant_group)" @keydown.enter.stop>
                  {{ p.variant_group }} · {{ groups.get(p.variant_group.toLowerCase())?.products.length }}
                </button>
              </div>
            </div>
            <div class="pside">
              <div class="num price">{{ omr(p.price) }}</div>
              <div v-if="p.original_price != null && p.original_price > p.price" class="num small muted was">{{ omr(p.original_price) }}</div>
              <span v-if="p.availability === false" class="tag out">Out of stock</span>
            </div>
            <span v-if="problems.get(p)" class="problem" :class="{ bad: problems.get(p).errors.length }" :title="problemText(p)" aria-label="Has problems">!</span>
            <div class="row-actions" @click.stop>
              <button v-if="statusOf.get(p.id) === 'edited'" class="btn sm ghost" title="Undo changes since the import" @click="revert(p)">Revert</button>
            </div>
          </li>
        </ul>
        <div v-else class="empty">No products match.</div>
        <div v-if="visible.length > shown" class="more">
          <button class="btn" @click="shown += PAGE">Show more ({{ visible.length - shown }} left)</button>
        </div>
      </div>
    </div>

    <details v-if="deleted.length" class="card deleted-card">
      <summary class="card-head"><h3>Deleted since the import <span class="count num">{{ deleted.length }}</span></h3></summary>
      <ul class="plist card-body">
        <li v-for="p in deleted" :key="p.id" class="prow static">
          <img :src="previewUrl(p.image_url?.[0])" alt="" class="pthumb" loading="lazy" />
          <div class="pmain">
            <div class="pname">{{ p.name }}</div>
            <div class="muted small num">#{{ p.id }} · {{ omr(p.price) }}</div>
          </div>
          <button class="btn sm" @click="restore(p)">Restore</button>
        </li>
      </ul>
    </details>
  </template>

  <Transition name="fade"><div v-if="editing" class="backdrop" /></Transition>
  <Transition name="slide-in">
    <ProductEditor
      v-if="editing" :key="editing.product.id + (editing.isNew ? '-new' : '')"
      :product="editing.product" :products="products" :is-new="editing.isNew" :initial-links="editing.links"
      @save="onSave" @cancel="editing = null" @delete="onDelete" @duplicate="addVersionOf"
    />
  </Transition>

  <Transition name="fade">
    <div v-if="toast" class="toast toast-row" role="status">
      <span>{{ toast.text }}</span>
      <button v-if="toast.action" class="toast-btn" @click="runToastAction">{{ toast.action.label }}</button>
    </div>
  </Transition>
</template>

<style scoped>
.dropzone {
  display: grid; justify-items: center; gap: 8px; width: 100%; padding: 48px 16px; cursor: pointer; font: inherit;
  border: 2px dashed var(--line); border-radius: var(--radius); background: #f9fafb; color: var(--text); transition: border-color .15s, background .15s;
}
.dropzone svg { width: 36px; height: 36px; color: var(--accent); }
.dropzone strong { font-size: 16px; }
.dropzone:hover, .dropzone.over { border-color: var(--accent); background: #eff6ff; }

.summary { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.tag { font-size: 12px; font-weight: 500; border-radius: 99px; padding: 2px 9px; white-space: nowrap; }
.tag.edited { background: #eef4fc; color: var(--info); }
.tag.added { background: #ebf6f0; color: var(--ok); }
.tag.deleted { background: #fcefef; color: var(--danger); }
.tag.out { background: #fdf5e7; color: var(--warn); }
.warn-text { color: var(--warn); font-weight: 500; }

.filters { gap: 10px; justify-content: flex-start; }
.grow { flex: 1 1 240px; }
.chips { flex-wrap: wrap; }
.chips button.bad:not(.on) { color: var(--danger); }

.plist { list-style: none; margin: 0; padding: 0; display: grid; }
.prow { display: flex; align-items: center; gap: 12px; padding: 10px 8px; border-bottom: 1px solid var(--line-soft); cursor: pointer; border-radius: 8px; min-width: 0; }
.prow:hover, .prow:focus-visible { background: #f9fafb; outline: none; }
.prow:focus-visible { box-shadow: inset 0 0 0 2px var(--focus); }
.prow.static { cursor: default; }
.prow.static:hover { background: none; }
.pthumb { width: 48px; height: 48px; object-fit: contain; border: 1px solid var(--line-soft); border-radius: 8px; background: #fff; flex-shrink: 0; }
.pmain { flex: 1; min-width: 0; display: grid; gap: 3px; }
.pname { font-weight: 500; overflow-wrap: anywhere; }
.meta { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: center; }
.chip {
  font: inherit; font-size: 11.5px; font-family: ui-monospace, Menlo, Consolas, monospace; border: 0; cursor: pointer;
  background: #eef4fc; color: var(--info); border-radius: 6px; padding: 1px 7px; overflow-wrap: anywhere; text-align: left;
}
.chip:hover { background: #dbe7fa; }
.pside { text-align: right; flex-shrink: 0; display: grid; justify-items: end; gap: 2px; }
.price { font-weight: 600; }
.was { text-decoration: line-through; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; vertical-align: 1px; }
.dot.edited { background: var(--info); }
.dot.added { background: var(--ok); }
.problem { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; background: #fdf5e7; color: var(--warn); flex-shrink: 0; cursor: help; }
.problem.bad { background: #fcefef; color: var(--danger); }
.row-actions { flex-shrink: 0; min-width: 0; }
.more { display: flex; justify-content: center; padding-top: 16px; }

.deleted-card summary { cursor: pointer; list-style: none; }
.deleted-card summary::-webkit-details-marker { display: none; }

.toast-row { display: flex; align-items: center; gap: 14px; max-width: min(560px, calc(100vw - 32px)); }
.toast-btn { font: inherit; font-weight: 600; color: #93c5fd; background: none; border: 0; cursor: pointer; padding: 4px 0; }

@media (max-width: 700px) {
  .prow { flex-wrap: wrap; }
  .pmain { flex-basis: calc(100% - 60px); }
  .pside { margin-left: 60px; flex-direction: row; display: flex; gap: 8px; align-items: center; }
  .row-actions:empty { display: none; }
  .filters select { flex: 1 1 140px; }
}
</style>
