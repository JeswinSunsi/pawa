<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, omr, previewUrl } from '../api'

// A curated product list stored on the backend (GET/PUT /admin/product-lists/<list>).
const props = defineProps({
  list: { type: String, required: true },         // backend list name, e.g. "sales"
  title: { type: String, required: true },        // page heading
  where: { type: String, required: true },        // "on the Sales page", used in labels
  notice: { type: String, default: '' },
  emptyText: { type: String, default: '' },
  warnNoDiscount: { type: Boolean, default: false },
  // Draw a line after the first `count` products, e.g. the ones the home page also shows.
  cutoff: { type: Object, default: null },        // { count, label }
})

const MAX_PRODUCTS = 200
const catalogue = ref([])
const selected = ref([])
const savedIds = ref([])
const loading = ref(true)
const saving = ref(false)
const search = ref('')
const error = ref('')
const msg = ref('')

const endpoint = computed(() => '/admin/product-lists/' + props.list)
const byId = computed(() => Object.fromEntries(catalogue.value.map((p) => [p.id, p])))
const dirty = computed(() => selected.value.join(',') !== savedIds.value.join(','))

const results = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/)
  return catalogue.value
    .filter((p) => {
      if (String(p.id) === q || '#' + p.id === q) return true
      const hay = `${p.name} ${p.category || ''}`.toLowerCase()
      return words.every((w) => hay.includes(w))
    })
    .slice(0, 12)
})

function onSale(p) {
  return p && p.original_price != null && p.original_price > p.price
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [products, current] = await Promise.all([api('/admin/products'), api(endpoint.value)])
    catalogue.value = products
    apply(current)
  } catch (e) { error.value = e.message } finally { loading.value = false }
}
function apply(current) {
  savedIds.value = [...current.product_ids]
  selected.value = [...current.product_ids]
}

function add(p) {
  if (!selected.value.includes(p.id) && selected.value.length < MAX_PRODUCTS) selected.value.push(p.id)
  msg.value = ''
}
function remove(id) {
  selected.value = selected.value.filter((x) => x !== id)
  picked.value = picked.value.filter((x) => x !== id)
  msg.value = ''
}
function move(i, d) {
  const j = i + d
  if (j < 0 || j >= selected.value.length) return
  const list = selected.value
  ;[list[i], list[j]] = [list[j], list[i]]
  msg.value = ''
}
function discard() {
  selected.value = [...savedIds.value]
  picked.value = []
  msg.value = ''
}

// Multi-select: tick several products, then move or remove them together.
const selecting = ref(false)
const picked = ref([])
const pickedSet = computed(() => new Set(picked.value))
const allPicked = computed(() => selected.value.length > 0 && picked.value.length === selected.value.length)
// A group can move while some ticked item still has an unticked neighbour on that side.
const canMoveUp = computed(() => selected.value.some((id, i) => i > 0 && pickedSet.value.has(id) && !pickedSet.value.has(selected.value[i - 1])))
const canMoveDown = computed(() => selected.value.some((id, i) => i < selected.value.length - 1 && pickedSet.value.has(id) && !pickedSet.value.has(selected.value[i + 1])))

function toggleSelecting() {
  selecting.value = !selecting.value
  picked.value = []
}
function togglePick(id) {
  picked.value = pickedSet.value.has(id) ? picked.value.filter((x) => x !== id) : [...picked.value, id]
}
function toggleAll() {
  picked.value = allPicked.value ? [] : [...selected.value]
}
function movePicked(d) {
  const list = selected.value
  const set = pickedSet.value
  // Walk toward the direction of travel so a ticked block shifts as one; items already at the edge stay put.
  const order = d < 0 ? list.map((_, i) => i) : list.map((_, i) => list.length - 1 - i)
  for (const i of order) {
    const j = i + d
    if (j < 0 || j >= list.length) continue
    if (set.has(list[i]) && !set.has(list[j])) [list[i], list[j]] = [list[j], list[i]]
  }
  msg.value = ''
}
function removePicked() {
  selected.value = selected.value.filter((id) => !pickedSet.value.has(id))
  picked.value = []
  if (!selected.value.length) selecting.value = false
  msg.value = ''
}

async function save() {
  error.value = ''
  msg.value = ''
  saving.value = true
  try {
    apply(await api(endpoint.value, { method: 'PUT', body: { product_ids: selected.value } }))
    msg.value = selected.value.length ? 'Saved. Live on the store now.' : 'Saved with no products.'
  } catch (e) { error.value = e.message } finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <div class="page-head">
    <h1>{{ title }}</h1>
  </div>

  <div class="lists">
    <div class="card">
      <div class="card-head"><h3>Add products</h3></div>
      <div class="card-body stack">
        <label class="field">Search
          <input v-model="search" type="search" maxlength="100" placeholder="Name, category or #ID"
            :disabled="loading" @keydown.enter.prevent="results[0] && add(results[0])" />
        </label>
        <p v-if="search.trim() && !results.length" class="muted small" style="margin: 0">No products found.</p>
        <ul v-if="results.length" class="list">
          <li v-for="p in results" :key="p.id" class="item">
            <img :src="previewUrl(p.image_url)" class="pthumb" alt="" loading="lazy" />
            <div class="info">
              <div class="name">{{ p.name }}</div>
              <div class="muted small">#{{ p.id }} · {{ omr(p.price) }}<span v-if="onSale(p)" class="was"> {{ omr(p.original_price) }}</span></div>
            </div>
            <button class="btn sm" :disabled="selected.includes(p.id) || selected.length >= MAX_PRODUCTS" @click="add(p)">
              {{ selected.includes(p.id) ? 'Added' : 'Add' }}
            </button>
          </li>
        </ul>
        <span v-if="warnNoDiscount" class="muted small">Products show a discount on the store only when they have an original price above the current price in products.json.</span>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>{{ where }} <span v-if="!loading" class="muted num">({{ selected.length }})</span></h3>
        <button v-if="!loading && selected.length" class="btn sm" :class="{ primary: selecting }" @click="toggleSelecting">
          {{ selecting ? 'Done' : 'Select multiple' }}
        </button>
      </div>

      <div class="card-body stack">
        <div v-if="loading" class="loader" role="status">Loading products…</div>
        <template v-else>
          <div v-if="notice" class="notice">{{ notice }}</div>
          <div v-if="selecting && selected.length" class="bulk">
            <label class="check-all">
              <input type="checkbox" :checked="allPicked" :indeterminate="picked.length > 0 && !allPicked" @change="toggleAll" />
              <span class="num">{{ picked.length }} selected</span>
            </label>
            <div class="actions">
              <button class="btn icon" title="Move selected up" :disabled="!canMoveUp" @click="movePicked(-1)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
              </button>
              <button class="btn icon" title="Move selected down" :disabled="!canMoveDown" @click="movePicked(1)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </button>
              <button class="btn icon danger" title="Remove selected" :disabled="!picked.length" @click="removePicked">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
              </button>
            </div>
          </div>
          <ol v-if="selected.length" class="list">
            <template v-for="(id, i) in selected" :key="id">
              <li class="item" :class="{ pickable: selecting, picked: selecting && pickedSet.has(id) }" @click="selecting && togglePick(id)">
                <input v-if="selecting" type="checkbox" :checked="pickedSet.has(id)" :aria-label="'Select ' + (byId[id]?.name || '#' + id)" @click.stop @change="togglePick(id)" />
                <span class="idx num">{{ i + 1 }}</span>
                <template v-if="byId[id]">
                  <img :src="previewUrl(byId[id].image_url)" class="pthumb" alt="" loading="lazy" />
                  <div class="info">
                    <div class="name">{{ byId[id].name }}</div>
                    <div class="muted small">
                      #{{ id }} · {{ omr(byId[id].price) }}<span v-if="onSale(byId[id])" class="was"> {{ omr(byId[id].original_price) }}</span>
                      <span v-else-if="warnNoDiscount" class="warn"> · no discount</span>
                    </div>
                  </div>
                </template>
                <div v-else class="info"><div class="name">Unknown product #{{ id }}</div></div>
                <div v-if="!selecting" class="actions">
                  <button class="btn icon" title="Move up" :disabled="i === 0" @click="move(i, -1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                  </button>
                  <button class="btn icon" title="Move down" :disabled="i === selected.length - 1" @click="move(i, 1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <button class="btn icon danger" title="Remove" @click="remove(id)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                  </button>
                </div>
              </li>
              <li v-if="cutoff && i === cutoff.count - 1 && i < selected.length - 1" class="cutoff" aria-hidden="true">
                <span>{{ cutoff.label }}</span>
              </li>
            </template>
          </ol>
          <div v-else class="empty" style="padding: 24px">{{ emptyText || 'No products.' }}</div>
        </template>
        <p v-if="msg" class="success" style="margin: 0">{{ msg }}</p>
        <p v-if="error" class="error" style="margin: 0">{{ error }}</p>
      </div>

      <div class="card-foot">
        <button class="btn" :disabled="!dirty || saving" @click="discard">Discard changes</button>
        <button class="btn primary" :disabled="!dirty || saving || loading" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.lists { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 16px; align-items: start; }
.lists .card { margin: 0; }
.list { display: grid; gap: 8px; list-style: none; margin: 0; padding: 0; }
.item { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
.idx { width: 24px; height: 24px; border-radius: 6px; background: var(--hover); display: grid; place-items: center; font-size: 12px; font-weight: 600; color: var(--text-2); flex-shrink: 0; }
.pthumb { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; border: 1px solid var(--line-soft); background: #fff; flex-shrink: 0; }
.info { flex: 1; min-width: 0; }
.name { font-weight: 500; overflow-wrap: anywhere; }
.was { text-decoration: line-through; }
.warn { color: var(--warn); }
.actions { display: flex; gap: 6px; flex-shrink: 0; }
.bulk { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 10px; border-radius: 10px; background: var(--hover); }
.check-all { display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 500; cursor: pointer; }
.item.pickable { cursor: pointer; user-select: none; }
.item.picked { border-color: var(--accent); }
.cutoff { display: flex; align-items: center; gap: 10px; color: var(--accent); font-size: 12px; font-weight: 500; margin: 4px 0; }
.cutoff::before, .cutoff::after { content: ''; flex: 1; border-top: 1px dashed currentColor; opacity: .5; }
@media (max-width: 900px) {
  .lists { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .item { flex-wrap: wrap; }
  .actions { width: 100%; justify-content: flex-end; }
}
</style>
