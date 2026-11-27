<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api, omr, previewUrl } from '../api'

// The store's limited-time sale (GET/PUT/DELETE /admin/flash-sale, porodo flash_sale.py).
// While it is live the deal prices replace the regular prices everywhere on the store, checkout included.
// Times are entered in Oman time (GMT+4, no daylight saving), whatever time zone this computer is in.

const MAX_ITEMS = 40
const OMAN_OFFSET_MS = 4 * 3600 * 1000
const DURATIONS = [3, 6, 12, 24, 48]
const QUICK_OFF = [10, 20, 30]

const catalogue = ref([])
const saved = ref(null)        // the sale as stored (with claimed counts), or null
const form = ref(blankForm())
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const msg = ref('')
const search = ref('')
const bulkOff = ref('')

// --- Oman time <-> <input type="datetime-local"> ---
function toOmanInput(iso) {
  if (!iso) return ''
  return new Date(Date.parse(iso) + OMAN_OFFSET_MS).toISOString().slice(0, 16)
}
function fromOmanInput(value) {
  if (!value) return null
  const ms = Date.parse(value + ':00Z') - OMAN_OFFSET_MS
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}
const omanFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Muscat', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
const omanTime = (ms) => (Number.isFinite(ms) ? omanFormat.format(ms) : '')
function nextHourInput() {
  const now = Date.now() + OMAN_OFFSET_MS
  return new Date(Math.ceil(now / 3600000) * 3600000).toISOString().slice(0, 16)
}

function blankForm() {
  const start = nextHourInput()
  return {
    title: '', title_ar: '', announce: true, starts: start,
    ends: toOmanInput(new Date(Date.parse(fromOmanInput(start)) + 24 * 3600000).toISOString()),
    items: [], // { product_id, sale_price: string, deal_stock: string }
  }
}
function formFrom(sale) {
  return {
    title: sale.title || '', title_ar: sale.title_ar || '', announce: sale.announce !== false,
    starts: toOmanInput(sale.starts_at), ends: toOmanInput(sale.ends_at),
    items: sale.items.map((i) => ({ product_id: i.product_id, sale_price: Number(i.sale_price).toFixed(3), deal_stock: i.deal_stock ? String(i.deal_stock) : '' })),
  }
}

// --- A clock for the status and the timeline ---
const now = ref(Date.now())
let clock
onMounted(() => { clock = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => clearInterval(clock))

const startMs = computed(() => Date.parse(fromOmanInput(form.value.starts) || ''))
const endMs = computed(() => Date.parse(fromOmanInput(form.value.ends) || ''))
const savedStart = computed(() => (saved.value ? Date.parse(saved.value.starts_at) : NaN))
const savedEnd = computed(() => (saved.value ? Date.parse(saved.value.ends_at) : NaN))
const status = computed(() => {
  if (!saved.value) return 'none'
  if (now.value < savedStart.value) return 'scheduled'
  return now.value < savedEnd.value ? 'live' : 'ended'
})
const STATUS = {
  none: { label: 'Not set', cls: 's-off' },
  scheduled: { label: 'Scheduled', cls: 's-new' },
  live: { label: 'Live', cls: 's-done' },
  ended: { label: 'Ended', cls: 's-off' },
}

function span(ms) {
  const total = Math.max(0, Math.round(ms / 60000))
  const d = Math.floor(total / 1440), h = Math.floor(total / 60) % 24, m = total % 60
  return [d && `${d}d`, h && `${h}h`, (m || (!d && !h)) && `${m}m`].filter(Boolean).join(' ')
}
const statusDetail = computed(() => {
  if (status.value === 'scheduled') return `Starts in ${span(savedStart.value - now.value)}`
  if (status.value === 'live') return `Ends in ${span(savedEnd.value - now.value)}`
  if (status.value === 'ended') return `Ended ${omanTime(savedEnd.value)}`
  return ''
})

const duration = computed(() => endMs.value - startMs.value)
const scheduleProblem = computed(() => {
  if (!Number.isFinite(startMs.value) || !Number.isFinite(endMs.value)) return 'Set a start and an end time.'
  if (duration.value <= 0) return 'The sale must end after it starts.'
  if (duration.value > 14 * 86400000) return 'A flash sale can last at most 14 days.'
  return ''
})

// Timeline: the sale's window on a track that also fits "now", with a needle at now.
const timeline = computed(() => {
  const s = startMs.value, e = endMs.value
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null
  const lo = Math.min(s, now.value), hi = Math.max(e, now.value)
  const pad = (hi - lo) * 0.06 || 3600000
  const from = lo - pad, width = hi + pad - from
  const pct = (ms) => `${((ms - from) / width) * 100}%`
  return { left: pct(s), right: `${100 - ((e - from) / width) * 100}%`, now: pct(now.value) }
})

function startNow() {
  const length = Number.isFinite(duration.value) && duration.value > 0 ? duration.value : 24 * 3600000
  form.value.starts = toOmanInput(new Date(now.value + 60000).toISOString())
  form.value.ends = toOmanInput(new Date(Date.parse(fromOmanInput(form.value.starts)) + length).toISOString())
  msg.value = ''
}
function setDuration(hours) {
  if (!Number.isFinite(startMs.value)) return
  form.value.ends = toOmanInput(new Date(startMs.value + hours * 3600000).toISOString())
  msg.value = ''
}
const activeDuration = computed(() => DURATIONS.find((h) => duration.value === h * 3600000) || null)

// --- Deals ---
const byId = computed(() => Object.fromEntries(catalogue.value.map((p) => [p.id, p])))
const claimedById = computed(() => Object.fromEntries((saved.value?.items || []).map((i) => [i.product_id, i.claimed || 0])))
const inSale = computed(() => new Set(form.value.items.map((i) => i.product_id)))

const results = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return []
  const words = q.split(/\s+/)
  return catalogue.value
    .filter((p) => String(p.id) === q.replace('#', '') || words.every((w) => `${p.name} ${p.category || ''}`.toLowerCase().includes(w)))
    .slice(0, 10)
})

// A price that gives at least `percent` off, rounded down to a clean 0.100 OMR (0.010 under 5 OMR).
function priceAtOff(regular, percent) {
  const steps = regular >= 5 ? 10 : 100 // per OMR
  // Whole baisa first, so float noise (20.9 * 70 = 1462.9999…) can't drop a step.
  const baisa = Math.round(regular * 1000) * (100 - percent) / 100
  return (Math.floor(baisa * steps / 1000 + 1e-9) / steps).toFixed(3)
}
function add(p) {
  if (inSale.value.has(p.id) || form.value.items.length >= MAX_ITEMS) return
  form.value.items.push({ product_id: p.id, sale_price: priceAtOff(p.price, 20), deal_stock: '' })
  msg.value = ''
}
function remove(index) {
  form.value.items.splice(index, 1)
  msg.value = ''
}
function move(index, d) {
  const list = form.value.items, j = index + d
  if (j < 0 || j >= list.length) return
  ;[list[index], list[j]] = [list[j], list[index]]
}
function applyOff(item, percent) {
  const p = byId.value[item.product_id]
  if (p) item.sale_price = priceAtOff(p.price, percent)
  msg.value = ''
}
function applyBulk() {
  const percent = Number(bulkOff.value)
  if (!(percent > 0 && percent < 100)) return
  form.value.items.forEach((item) => applyOff(item, percent))
}

function itemInfo(item) {
  const p = byId.value[item.product_id]
  const price = Number(item.sale_price)
  const stock = item.deal_stock.trim()
  let problem = ''
  if (!p) problem = 'No longer in the catalogue.'
  else if (!(price > 0)) problem = 'Enter a deal price.'
  else if (price >= p.price) problem = `Must be below the regular ${omr(p.price)}.`
  else if (stock && !(Number.isInteger(Number(stock)) && Number(stock) >= 1)) problem = 'Deal stock is a whole number (or blank for no limit).'
  const off = p && price > 0 && price < p.price ? Math.round((1 - price / p.price) * 100) : null
  const claimed = claimedById.value[item.product_id] || 0
  const cap = stock ? Number(stock) : null
  return { p, off, problem, claimed, cap, claimedPct: cap ? Math.min(100, (claimed / cap) * 100) : 0 }
}
const problems = computed(() => form.value.items.filter((i) => itemInfo(i).problem).length)

// --- Saving ---
const payload = computed(() => ({
  title: form.value.title.trim(), title_ar: form.value.title_ar.trim(), announce: form.value.announce,
  starts_at: fromOmanInput(form.value.starts), ends_at: fromOmanInput(form.value.ends),
  items: form.value.items.map((i) => ({ product_id: i.product_id, sale_price: Number(Number(i.sale_price).toFixed(3)), deal_stock: i.deal_stock.trim() ? Number(i.deal_stock) : null })),
}))
const savedPayload = ref('')
const dirty = computed(() => JSON.stringify(payload.value) !== savedPayload.value)
const canSave = computed(() => dirty.value && !saving.value && !loading.value && !scheduleProblem.value && form.value.items.length > 0 && !problems.value)

function apply(sale) {
  saved.value = sale
  form.value = sale ? formFrom(sale) : blankForm()
  savedPayload.value = sale ? JSON.stringify(payload.value) : ''
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [products, sale] = await Promise.all([api('/admin/products'), api('/admin/flash-sale')])
    catalogue.value = products
    apply(sale)
  } catch (e) { error.value = e.message } finally { loading.value = false }
}

async function save() {
  error.value = ''
  msg.value = ''
  saving.value = true
  try {
    apply(await api('/admin/flash-sale', { method: 'PUT', body: payload.value }))
    msg.value = status.value === 'live' ? 'Saved. The deal prices are live on the store now.'
      : status.value === 'scheduled' ? `Saved. The sale opens ${omanTime(savedStart.value)} (Oman time).`
      : 'Saved. This sale has already ended, so nothing shows on the store.'
  } catch (e) { error.value = e.message } finally { saving.value = false }
}

async function endNow() {
  if (!confirm('End the sale now? Prices go back to normal on the store straight away.')) return
  form.value.ends = toOmanInput(new Date(Math.max(now.value, savedStart.value + 60000)).toISOString())
  if (endMs.value <= startMs.value) form.value.starts = toOmanInput(new Date(endMs.value - 60000).toISOString())
  await save()
}

async function removeSale() {
  if (!confirm('Delete this flash sale? It disappears from the store and the deal prices end now.')) return
  error.value = ''
  saving.value = true
  try {
    await api('/admin/flash-sale', { method: 'DELETE' })
    apply(null)
    msg.value = 'Deleted. Nothing shows on the store.'
  } catch (e) { error.value = e.message } finally { saving.value = false }
}

function discard() {
  apply(saved.value)
  msg.value = ''
}

onMounted(load)
</script>

<template>
  <div class="page-head">
    <h1>Flash sale</h1>
    <div v-if="!loading" class="head-status">
      <span class="pill" :class="STATUS[status].cls">{{ STATUS[status].label }}</span>
      <span v-if="statusDetail" class="muted num">{{ statusDetail }}</span>
    </div>
  </div>

  <div v-if="loading" class="card"><div class="loader" role="status">Loading…</div></div>
  <template v-else>
    <div class="card">
      <div class="card-head"><h3>Schedule</h3><span class="muted small">Oman time (GMT+4)</span></div>
      <div class="card-body stack">
        <div class="grid2">
          <label class="field">Heading (English)
            <input v-model="form.title" type="text" maxlength="60" placeholder="Flash Sale (used when left blank)" />
          </label>
          <label class="field">Heading (Arabic)
            <input v-model="form.title_ar" type="text" maxlength="60" dir="rtl" lang="ar" placeholder="العروض الخاطفة" />
          </label>
        </div>
        <div class="grid2">
          <label class="field">Starts
            <span class="with-btn">
              <input v-model="form.starts" type="datetime-local" />
              <button type="button" class="btn sm" @click="startNow">Start now</button>
            </span>
          </label>
          <label class="field">Ends
            <input v-model="form.ends" type="datetime-local" :min="form.starts" />
          </label>
        </div>
        <div class="row">
          <span class="muted small">Length</span>
          <div class="seg">
            <button v-for="h in DURATIONS" :key="h" type="button" :class="{ on: activeDuration === h }" @click="setDuration(h)">{{ h }}h</button>
          </div>
          <span v-if="!scheduleProblem" class="muted small num">Runs {{ span(duration) }}: {{ omanTime(startMs) }} → {{ omanTime(endMs) }}</span>
        </div>

        <div v-if="timeline" class="timeline-track" aria-hidden="true">
          <span class="tl-window" :style="{ left: timeline.left, right: timeline.right }"></span>
          <span class="tl-now" :style="{ left: timeline.now }"><b>now</b></span>
        </div>
        <p v-if="scheduleProblem" class="error" style="margin: 0">{{ scheduleProblem }}</p>

        <label class="check">
          <input v-model="form.announce" type="checkbox" />
          Announce it before it starts
          <span class="muted small" style="font-weight: 400">(the home page shows the deals with a "Starts in" countdown; prices change only once it's live)</span>
        </label>
      </div>
    </div>

    <div class="lists">
      <div class="card">
        <div class="card-head"><h3>Add products</h3><span class="muted small num">{{ form.items.length }} / {{ MAX_ITEMS }}</span></div>
        <div class="card-body stack">
          <label class="field">Search
            <input v-model="search" type="search" maxlength="100" placeholder="Name, category or #ID" @keydown.enter.prevent="results[0] && add(results[0])" />
          </label>
          <p v-if="search.trim() && !results.length" class="muted small" style="margin: 0">No products found.</p>
          <ul v-if="results.length" class="list">
            <li v-for="p in results" :key="p.id" class="item">
              <img :src="previewUrl(p.image_url)" class="pthumb" alt="" loading="lazy" />
              <div class="info">
                <div class="name">{{ p.name }}</div>
                <div class="muted small">#{{ p.id }} · {{ omr(p.price) }}<span v-if="p.availability === false" class="warn"> · out of stock</span></div>
              </div>
              <button class="btn sm" :disabled="inSale.has(p.id) || form.items.length >= MAX_ITEMS" @click="add(p)">{{ inSale.has(p.id) ? 'Added' : 'Add' }}</button>
            </li>
          </ul>
          <div class="notice">
            While the sale is live the deal price is the price everywhere on the store, checkout included, with the regular price struck through.
            Promo codes don't apply to deal products. A deal with <b>deal stock</b> goes back to the regular price once that many units are ordered.
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head">
          <h3>Deals <span class="muted num">({{ form.items.length }})</span></h3>
          <div v-if="form.items.length" class="row bulk-off">
            <input v-model="bulkOff" type="number" min="1" max="99" placeholder="%" aria-label="Percent off for every deal" @keydown.enter.prevent="applyBulk" />
            <button class="btn sm" :disabled="!(Number(bulkOff) > 0 && Number(bulkOff) < 100)" @click="applyBulk">% off all</button>
          </div>
        </div>
        <div class="card-body stack">
          <ol v-if="form.items.length" class="list">
            <li v-for="(item, i) in form.items" :key="item.product_id" class="deal" :class="{ bad: itemInfo(item).problem }">
              <div class="deal-top">
                <span class="idx num">{{ i + 1 }}</span>
                <img v-if="itemInfo(item).p" :src="previewUrl(itemInfo(item).p.image_url)" class="pthumb" alt="" loading="lazy" />
                <div class="info">
                  <div class="name">{{ itemInfo(item).p?.name || `Unknown product #${item.product_id}` }}</div>
                  <div class="muted small">
                    #{{ item.product_id }}<template v-if="itemInfo(item).p"> · regular {{ omr(itemInfo(item).p.price) }}</template>
                    <span v-if="itemInfo(item).p?.availability === false" class="warn"> · out of stock</span>
                  </div>
                </div>
                <div class="actions">
                  <button class="btn icon" title="Move up" :disabled="i === 0" @click="move(i, -1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                  </button>
                  <button class="btn icon" title="Move down" :disabled="i === form.items.length - 1" @click="move(i, 1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                  <button class="btn icon danger" title="Remove" @click="remove(i)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                  </button>
                </div>
              </div>
              <div class="deal-fields">
                <label class="field">Deal price (OMR)
                  <input v-model="item.sale_price" type="number" min="0.001" step="0.001" inputmode="decimal" />
                </label>
                <div class="field">
                  <span>Quick <span v-if="itemInfo(item).off !== null" class="off num">−{{ itemInfo(item).off }}%</span></span>
                  <div class="row quick">
                    <button v-for="pc in QUICK_OFF" :key="pc" type="button" class="btn sm" :disabled="!itemInfo(item).p" @click="applyOff(item, pc)">−{{ pc }}%</button>
                  </div>
                </div>
                <label class="field">Deal stock
                  <input v-model="item.deal_stock" type="number" min="1" step="1" placeholder="No limit" />
                </label>
              </div>
              <div v-if="status !== 'scheduled' && saved" class="sold">
                <span class="sold-bar" v-if="itemInfo(item).cap"><span :style="{ width: itemInfo(item).claimedPct + '%' }"></span></span>
                <span class="muted small num">{{ itemInfo(item).claimed }}<template v-if="itemInfo(item).cap"> of {{ itemInfo(item).cap }}</template> sold at the deal price</span>
              </div>
              <p v-if="itemInfo(item).problem" class="error" style="margin: 0">{{ itemInfo(item).problem }}</p>
            </li>
          </ol>
          <div v-else class="empty" style="padding: 24px">No deals yet. Search for products on the left to add them.</div>
          <p v-if="msg" class="success" style="margin: 0">{{ msg }}</p>
          <p v-if="error" class="error" style="margin: 0">{{ error }}</p>
        </div>
        <div class="card-foot">
          <div class="row">
            <button v-if="saved" class="btn danger" :disabled="saving" @click="removeSale">Delete sale</button>
            <button v-if="status === 'live'" class="btn" :disabled="saving" @click="endNow">End now</button>
          </div>
          <div class="row">
            <button class="btn" :disabled="!dirty || saving" @click="discard">Discard changes</button>
            <button class="btn primary" :disabled="!canSave" @click="save">{{ saving ? 'Saving…' : saved ? 'Save' : 'Schedule sale' }}</button>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.head-status { display: flex; align-items: center; gap: 10px; }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.with-btn { display: flex; gap: 8px; }
.with-btn input { flex: 1; }

.timeline-track { position: relative; height: 26px; margin: 4px 0 2px; }
.timeline-track::before { content: ''; position: absolute; left: 0; right: 0; top: 11px; height: 4px; border-radius: 2px; background: var(--line-soft); }
.tl-window { position: absolute; top: 9px; height: 8px; border-radius: 4px; background: #fbd5d5; border: 1px solid #f19c9c; }
.tl-now { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--ink); }
.tl-now b { position: absolute; top: -2px; left: 6px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--ink); white-space: nowrap; }

.lists { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 16px; align-items: start; }
.lists .card { margin: 0; }
.list { display: grid; gap: 8px; list-style: none; margin: 0; padding: 0; }
.item { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
.pthumb { width: 44px; height: 44px; object-fit: contain; border-radius: 8px; border: 1px solid var(--line-soft); background: #fff; flex-shrink: 0; }
.info { flex: 1; min-width: 0; }
.name { font-weight: 500; overflow-wrap: anywhere; }
.warn { color: var(--warn); }
.actions { display: flex; gap: 6px; flex-shrink: 0; }
.idx { width: 24px; height: 24px; border-radius: 6px; background: var(--hover); display: grid; place-items: center; font-size: 12px; font-weight: 600; color: var(--text-2); flex-shrink: 0; }

.deal { display: grid; gap: 10px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; }
.deal.bad { border-color: #f3caca; }
.deal-top { display: flex; align-items: center; gap: 12px; min-width: 0; }
.deal-fields { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); gap: 12px; align-items: end; }
.quick { gap: 4px; flex-wrap: nowrap; }
.off { margin-left: 4px; color: var(--danger); font-weight: 600; }
.bulk-off { gap: 6px; flex-wrap: nowrap; }
.bulk-off input { width: 64px; padding: 5px 8px; border-radius: 8px; }
.sold { display: flex; align-items: center; gap: 10px; }
.sold-bar { flex: 0 0 120px; height: 5px; border-radius: 3px; background: var(--line-soft); overflow: hidden; }
.sold-bar > span { display: block; height: 100%; background: var(--danger); }

@media (max-width: 900px) {
  .lists { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .grid2 { grid-template-columns: minmax(0, 1fr); }
  .deal-fields { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .deal-fields > .field:nth-child(2) { grid-column: 1 / -1; order: 3; }
  .deal-top { flex-wrap: wrap; }
  .deal-top .actions { margin-left: auto; }
}
</style>
