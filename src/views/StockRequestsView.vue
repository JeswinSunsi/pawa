<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { api, previewUrl } from '../api'

// "Notify me" requests customers make on out-of-stock products on the storefront
// (backend: GET /admin/stock-alerts and /admin/stock-alerts/{product_id}, stock_alerts.py).
// Nothing is sent to these customers automatically yet: contact them yourself when a product is back.
const FILTERS = { all: 'All', back: 'Back in stock', out: 'Still out of stock' }

const products = ref([])
const totalWaiting = ref(0)
const filter = ref('all')
const error = ref('')
const loading = ref(false)
const loaded = ref(false)

// Back-in-stock products first (those customers are worth contacting now), then most requested.
const sorted = computed(() => [...products.value].sort((a, b) => (b.in_stock - a.in_stock) || (b.waiting - a.waiting)))
const shown = computed(() => sorted.value.filter((p) => filter.value === 'all' || (filter.value === 'back' ? p.in_stock : !p.in_stock)))
const counts = computed(() => ({
  all: products.value.length,
  back: products.value.filter((p) => p.in_stock).length,
  out: products.value.filter((p) => !p.in_stock).length,
}))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const data = await api('/admin/stock-alerts?limit=200')
    products.value = data.products
    totalWaiting.value = data.total_waiting
    loaded.value = true
  } catch (e) { error.value = e.message } finally { loading.value = false }
}
onMounted(load)

// The drawer: who is waiting for one product.
const open = ref(null)
const customers = ref([])
const customersError = ref('')
const customersLoading = ref(false)
const copied = ref(false)

async function view(product) {
  open.value = product
  customers.value = []
  customersError.value = ''
  copied.value = false
  customersLoading.value = true
  try {
    const data = await api(`/admin/stock-alerts/${product.product_id}`)
    if (open.value?.product_id === product.product_id) customers.value = data.customers
  } catch (e) { customersError.value = e.message } finally { customersLoading.value = false }
}

async function copyEmails() {
  const text = customers.value.map((c) => c.email).filter(Boolean).join(', ')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch { window.prompt('Copy these emails:', text) }
}

const onKey = (e) => { if (e.key === 'Escape') open.value = null }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Omani numbers are stored as 8 digits (or +968…): wa.me needs the country code.
function whatsappUrl(phone) {
  let digits = String(phone || '').replace(/\D/g, '')
  if (digits.length === 8) digits = '968' + digits
  return digits ? `https://wa.me/${digits}` : ''
}

// Stored as naive UTC by the backend: read them as UTC.
const toDate = (d) => (d ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(d) ? d : d + 'Z') : null)
const fmtDate = (d) => toDate(d)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) ?? ''
const fmt = (d) => (d ? `${fmtDate(d)}, ${toDate(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '')
const LANGS = { en: 'English', ar: 'Arabic', bn: 'Bengali' }
</script>

<template>
  <div class="page-head">
    <h1>Notify me <span class="count num">{{ loaded ? `${totalWaiting} waiting` : '' }}</span></h1>
    <div class="row">
      <button class="btn icon" title="Refresh" :disabled="loading" @click="load">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
      </button>
    </div>
  </div>

  <p class="notice" style="margin: 0 0 20px">
    Customers who tapped <b>Notify me</b> on an out-of-stock product, most requested first. Use it to decide what to restock.
    Nothing is sent to them automatically yet: when a product is back in stock it moves to the top, and you can contact the
    customers from <b>View</b>.
  </p>

  <div class="card stock-card">
    <div class="card-head">
      <div class="tabs">
        <button v-for="(label, key) in FILTERS" :key="key" :class="{ on: filter === key }" :aria-pressed="filter === key" @click="filter = key">
          {{ label }} <span class="num">{{ loaded ? counts[key] : '' }}</span>
        </button>
      </div>
    </div>
    <p v-if="error" class="error" style="padding: 0 18px">{{ error }}</p>

    <div class="scroll">
      <table class="stock" :class="{ 'is-refreshing': loading && loaded }">
        <thead>
          <tr><th>Product</th><th class="r">Waiting</th><th>First request</th><th>Stock now</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="p in shown" :key="p.product_id" class="click" :class="{ back: p.in_stock }" @click="view(p)">
            <td class="s-product">
              <div class="product">
                <img v-if="p.image_url" :src="previewUrl(p.image_url)" alt="" width="40" height="40" loading="lazy" />
                <span v-else class="noimg" />
                <div>
                  <div class="name">{{ p.name || `Product #${p.product_id}` }}</div>
                  <div class="muted small num">#{{ p.product_id }}<template v-if="!p.name"> · no longer in the catalogue</template></div>
                </div>
              </div>
            </td>
            <td class="r num waiting" data-label="Waiting">{{ p.waiting }}</td>
            <td class="num s-first" data-label="First request">{{ fmtDate(p.first_request) }}</td>
            <td class="s-stock"><span class="pill" :class="p.in_stock ? 's-done' : 's-off'">{{ p.in_stock ? 'Back in stock' : 'Out of stock' }}</span></td>
            <td class="r s-actions" @click.stop><button class="btn sm" @click="view(p)">View</button></td>
          </tr>
          <tr v-if="!loaded && loading"><td colspan="5"><div class="loader" role="status">Loading requests…</div></td></tr>
          <tr v-else-if="!shown.length && !loading">
            <td colspan="5" class="empty">{{ products.length ? 'Nothing in this filter' : 'No Notify me requests yet' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Transition name="fade"><div v-if="open" class="backdrop" @click="open = null" /></Transition>
  <Transition name="slide-in">
    <aside v-if="open" class="drawer">
      <div class="drawer-head">
        <div>
          <div class="row" style="gap: 10px">
            <h3 style="font-size: 17px">{{ open.name || `Product #${open.product_id}` }}</h3>
            <span class="pill" :class="open.in_stock ? 's-done' : 's-off'">{{ open.in_stock ? 'Back in stock' : 'Out of stock' }}</span>
          </div>
          <div class="muted small" style="margin-top: 4px">{{ open.waiting }} customer{{ open.waiting === 1 ? '' : 's' }} waiting since {{ fmtDate(open.first_request) }}</div>
        </div>
        <button class="btn icon ghost" title="Close" @click="open = null">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div class="drawer-body">
        <p v-if="customersError" class="error">{{ customersError }}</p>
        <div v-else-if="customersLoading" class="loader" role="status">Loading customers…</div>
        <section v-else>
          <div class="section-title">Customers waiting</div>
          <ul class="customers">
            <li v-for="c in customers" :key="c.email">
              <div class="name">{{ c.name || '—' }} <span class="muted small">· {{ LANGS[c.locale] || c.locale }}</span></div>
              <div class="links small">
                <a :href="'mailto:' + c.email">{{ c.email }}</a>
                <template v-if="c.phone">
                  <a class="num" :href="'tel:' + c.phone">{{ c.phone }}</a>
                  <a :href="whatsappUrl(c.phone)" target="_blank" rel="noopener">WhatsApp</a>
                </template>
              </div>
              <div class="muted small">Asked {{ fmt(c.requested_at) }}</div>
            </li>
            <li v-if="!customers.length" class="muted small">No one is waiting any more.</li>
          </ul>
        </section>
      </div>

      <div v-if="customers.length" class="drawer-foot">
        <button class="btn" @click="copyEmails">{{ copied ? 'Copied' : `Copy ${customers.length} email${customers.length === 1 ? '' : 's'}` }}</button>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.stock-card { overflow: hidden; }
.stock td { white-space: nowrap; vertical-align: middle; }
.stock td.s-product { white-space: normal; width: 55%; }
.stock tr.back td { background: #f3faf6; }
.stock tr.back:hover td { background: #e8f4ec; }
.product { display: flex; align-items: center; gap: 12px; }
.product img, .noimg { width: 40px; height: 40px; object-fit: contain; border-radius: 6px; border: 1px solid var(--line); background: #fff; flex-shrink: 0; }
.name { font-weight: 500; }
.waiting { font-size: 15px; font-weight: 600; }
.customers { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.customers li { padding-bottom: 14px; border-bottom: 1px solid var(--line-soft); }
.customers li:last-child { border-bottom: 0; padding-bottom: 0; }
.links { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 2px 0; }
.links a { color: inherit; overflow-wrap: anywhere; }
.name { overflow-wrap: anywhere; }
.pill { text-transform: none; }
.drawer-head h3 { overflow-wrap: anywhere; }

/* Phones: each product is a card instead of a table row. */
@media (max-width: 700px) {
  .scroll > .stock { display: block; min-width: 0; }
  .stock thead { display: none; }
  .stock tbody { display: block; }
  .stock tr.click {
    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 12px;
    grid-template-areas: 'product product product' 'waiting first stock' 'actions actions actions';
    padding: 16px; border-bottom: 1px solid var(--line); align-items: end;
  }
  .stock tr.click:last-child { border-bottom: 0; }
  .stock tr.back { background: #f3faf6; }
  .stock td { display: block; padding: 0; border: 0; background: none !important; white-space: normal; width: auto !important; text-align: left; }
  .s-product { grid-area: product; }
  .waiting { grid-area: waiting; }
  .s-first { grid-area: first; font-size: 13px; }
  .s-stock { grid-area: stock; }
  .s-actions { grid-area: actions; }
  .s-actions .btn { width: 100%; }
  .waiting::before, .s-first::before { content: attr(data-label); display: block; color: var(--muted); font-size: 11px; font-weight: 400; margin-bottom: 3px; }
  .stock .empty { padding: 32px 16px; }
  .links { gap: 0 16px; }
  .links a { padding: 6px 0; }
}
</style>
