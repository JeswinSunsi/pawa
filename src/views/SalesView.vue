<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, omr, previewUrl } from '../api'

const MAX_PRODUCTS = 200
const catalogue = ref([])
const selected = ref([])
const savedIds = ref([])
const loading = ref(true)
const saving = ref(false)
const search = ref('')
const error = ref('')
const msg = ref('')

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
    const [products, sales] = await Promise.all([api('/admin/products'), api('/admin/sales')])
    catalogue.value = products
    apply(sales)
  } catch (e) { error.value = e.message } finally { loading.value = false }
}
function apply(sales) {
  savedIds.value = [...sales.product_ids]
  selected.value = [...sales.product_ids]
}

function add(p) {
  if (!selected.value.includes(p.id) && selected.value.length < MAX_PRODUCTS) selected.value.push(p.id)
  msg.value = ''
}
function remove(id) {
  selected.value = selected.value.filter((x) => x !== id)
  msg.value = ''
}
function move(i, d) {
  const j = i + d
  if (j < 0 || j >= selected.value.length) return
  const list = selected.value
  ;[list[i], list[j]] = [list[j], list[i]]
  msg.value = ''
}

async function save() {
  error.value = ''
  msg.value = ''
  saving.value = true
  try {
    apply(await api('/admin/sales', { method: 'PUT', body: { product_ids: selected.value } }))
    msg.value = selected.value.length ? 'Saved. Live on the store now.' : 'Saved. The Sales page is now empty.'
  } catch (e) { error.value = e.message } finally { saving.value = false }
}

onMounted(load)
</script>

<template>
  <div class="page-head">
    <h1>Sales page</h1>
  </div>

  <div class="sales">
    <div class="card picker">
      <div class="card-head"><h3>Add products</h3></div>
      <div class="card-body stack">
        <label class="field">Search
          <input v-model="search" type="search" maxlength="100" placeholder="Name, category or #ID"
            :disabled="loading" @keydown.enter.prevent="results[0] && add(results[0])" />
        </label>
        <p v-if="search.trim() && !results.length" class="hint muted small" style="margin: 0">No products found.</p>
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
        <span class="hint muted small">Products show a discount on the store only when they have an original price above the current price in products.json.</span>
      </div>
    </div>

    <div class="card editor">
      <div class="card-head">
        <h3>On the Sales page <span class="muted num">({{ selected.length }})</span></h3>
      </div>

      <div class="card-body stack">
        <div v-if="loading" class="empty">Loading…</div>
        <template v-else>
          <div class="notice">Shown in this order. The product with the biggest discount is featured at the top unless the shopper changes the sort.</div>
          <ol v-if="selected.length" class="list">
            <li v-for="(id, i) in selected" :key="id" class="item">
              <span class="idx num">{{ i + 1 }}</span>
              <template v-if="byId[id]">
                <img :src="previewUrl(byId[id].image_url)" class="pthumb" alt="" loading="lazy" />
                <div class="info">
                  <div class="name">{{ byId[id].name }}</div>
                  <div class="muted small">
                    #{{ id }} · {{ omr(byId[id].price) }}<span v-if="onSale(byId[id])" class="was"> {{ omr(byId[id].original_price) }}</span>
                    <span v-else class="warn"> · no discount</span>
                  </div>
                </div>
              </template>
              <div v-else class="info"><div class="name">Unknown product #{{ id }}</div></div>
              <div class="actions">
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
          </ol>
          <div v-else class="empty" style="padding: 24px">No products. The Sales page will show its empty message.</div>
        </template>
        <p v-if="msg" class="success" style="margin: 0">{{ msg }}</p>
        <p v-if="error" class="error" style="margin: 0">{{ error }}</p>
      </div>

      <div class="card-foot">
        <button class="btn" :disabled="!dirty || saving" @click="selected = [...savedIds]; msg = ''">Discard changes</button>
        <button class="btn primary" :disabled="!dirty || saving || loading" @click="save">{{ saving ? 'Saving…' : 'Save sales page' }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sales { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 16px; align-items: start; }
.sales .card { margin: 0; }
.list { display: grid; gap: 8px; list-style: none; margin: 0; padding: 0; }
.item { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
.idx { width: 24px; height: 24px; border-radius: 6px; background: var(--hover); display: grid; place-items: center; font-size: 12px; font-weight: 600; color: var(--text-2); flex-shrink: 0; }
.pthumb { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; border: 1px solid var(--line-soft); background: #fff; flex-shrink: 0; }
.info { flex: 1; min-width: 0; }
.name { font-weight: 500; overflow-wrap: anywhere; }
.was { text-decoration: line-through; }
.warn { color: var(--warn); }
.actions { display: flex; gap: 6px; flex-shrink: 0; }
@media (max-width: 900px) {
  .sales { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .item { flex-wrap: wrap; }
  .actions { width: 100%; justify-content: flex-end; }
}
</style>
