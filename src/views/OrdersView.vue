<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { api, omr } from '../api'
import OrdersAnalytics from '../components/OrdersAnalytics.vue'

const STATUSES = ['new', 'processing', 'done', 'cancelled']
const RANGES = [7, 30, 90]

const savedRange = Number(localStorage.getItem('adminRange'))
const days = ref(RANGES.includes(savedRange) ? savedRange : 30)
watch(days, (v) => localStorage.setItem('adminRange', v))
const version = ref(0)

const stats = ref(null)
const orders = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 25
const status = ref('')
const q = ref('')
const error = ref('')
const loading = ref(false)
const openId = ref(null)
const open = computed(() => orders.value.find((o) => o.order_number === openId.value) || null)
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ page: page.value, page_size: pageSize })
    if (status.value) params.set('status', status.value)
    if (q.value.trim()) params.set('q', q.value.trim())
    const [list, s] = await Promise.all([api(`/admin/orders?${params}`), api('/admin/stats')])
    orders.value = list.orders
    total.value = list.total
    stats.value = s
  } catch (e) { error.value = e.message } finally { loading.value = false }
}

function refreshAll() {
  load()
  version.value++
}

async function setStatus(order, next) {
  if (next === 'cancelled' && !confirm(`Cancel order ${order.order_number}?`)) return
  try {
    const updated = await api(`/admin/orders/${order.order_number}`, { method: 'PATCH', body: { status: next } })
    Object.assign(order, updated)
    api('/admin/stats').then((s) => (stats.value = s))
    version.value++
  } catch (e) { alert(e.message) }
}

let timer
watch(q, () => { clearTimeout(timer); timer = setTimeout(() => { page.value = 1; load() }, 300) })
watch(status, () => { page.value = 1; load() })
watch(page, load)
onMounted(load)

const onKey = (e) => { if (e.key === 'Escape') openId.value = null }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '')
const fmt = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '')
const payLabel = (o) => (o.payment_method === 'online' ? 'Online' : 'Cash')
</script>

<template>
  <div class="page-head">
    <h1>Orders</h1>
    <div class="row">
      <div class="seg">
        <button v-for="r in RANGES" :key="r" :class="{ on: days === r }" @click="days = r">{{ r }} days</button>
      </div>
      <button class="btn icon" title="Refresh" :disabled="loading" @click="refreshAll">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
      </button>
    </div>
  </div>

  <OrdersAnalytics :days="days" :version="version" />

  <div class="card">
    <div class="card-head">
      <div class="tabs">
        <button :class="{ on: status === '' }" @click="status = ''">All <span class="num">{{ stats?.orders_total ?? '' }}</span></button>
        <button v-for="s in STATUSES" :key="s" :class="{ on: status === s }" @click="status = s">
          <span class="cap">{{ s }}</span> <span class="num">{{ stats?.by_status?.[s] ?? '' }}</span>
        </button>
      </div>
      <label class="search" style="width: 280px; max-width: 100%">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input v-model="q" placeholder="Order #, name, email or phone" />
      </label>
    </div>
    <p v-if="error" class="error" style="padding: 0 18px">{{ error }}</p>

    <div class="scroll">
      <table class="orders">
        <thead>
          <tr><th>Order</th><th>Date</th><th>Customer</th><th>Payment</th><th>Status</th><th class="r">Total</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="o in orders" :key="o.order_number" class="click" :class="{ sel: openId === o.order_number }" @click="openId = o.order_number">
            <td><b class="num">{{ o.order_number }}</b><div class="muted small cap">{{ o.delivery_method }}</div></td>
            <td class="num">{{ fmtDate(o.created_at) }}<div class="muted small">{{ fmtTime(o.created_at) }}</div></td>
            <td>{{ o.name }}<div class="muted small num">{{ o.phone }}</div></td>
            <td>
              {{ payLabel(o) }}
              <div v-if="o.payment_method === 'online'" class="muted small cap">{{ o.payment_status || 'unknown' }}</div>
            </td>
            <td><span class="pill" :class="'s-' + o.status">{{ o.status }}</span></td>
            <td class="r num"><b>{{ omr(o.total) }}</b></td>
            <td class="r" @click.stop>
              <div class="row actions">
                <button v-if="o.status === 'new'" class="btn sm" @click="setStatus(o, 'processing')">Start</button>
                <button v-if="o.status === 'new' || o.status === 'processing'" class="btn sm primary" @click="setStatus(o, 'done')">Complete</button>
                <button v-if="o.status === 'done' || o.status === 'cancelled'" class="btn sm" @click="setStatus(o, 'new')">Reopen</button>
              </div>
            </td>
          </tr>
          <tr v-if="!orders.length && !loading"><td colspan="7" class="empty">No orders found</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card-foot">
      <span class="muted small num">{{ total.toLocaleString() }} order{{ total === 1 ? '' : 's' }}</span>
      <div class="row">
        <span class="muted small num">Page {{ page }} of {{ pages }}</span>
        <button class="btn sm" :disabled="page <= 1" @click="page--">Previous</button>
        <button class="btn sm" :disabled="page >= pages" @click="page++">Next</button>
      </div>
    </div>
  </div>

  <Transition name="fade"><div v-if="open" class="backdrop" @click="openId = null" /></Transition>
  <Transition name="slide-in">
    <aside v-if="open" class="drawer">
      <div class="drawer-head">
        <div>
          <div class="row" style="gap: 10px"><h3 class="num" style="font-size: 17px">{{ open.order_number }}</h3><span class="pill" :class="'s-' + open.status">{{ open.status }}</span></div>
          <div class="muted small" style="margin-top: 4px">{{ fmt(open.created_at) }}</div>
        </div>
        <button class="btn icon ghost" title="Close" @click="openId = null">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div class="drawer-body">
        <section>
          <div class="section-title">Customer</div>
          <dl class="kv">
            <dt>Name</dt><dd>{{ open.name }}</dd>
            <dt>Email</dt><dd>{{ open.email || '—' }}</dd>
            <dt>Phone</dt><dd class="num">{{ open.phone }}</dd>
            <template v-if="open.delivery_method === 'delivery'">
              <dt>Delivery to</dt><dd>{{ open.address }}, {{ open.governorate }}</dd>
            </template>
            <template v-else>
              <dt>Pickup</dt><dd>Store #{{ open.selected_store }}</dd>
            </template>
            <dt>Payment</dt><dd>{{ payLabel(open) }}<span v-if="open.payment_method === 'online'" class="muted cap"> · {{ open.payment_status || 'unknown' }}</span></dd>
          </dl>
        </section>

        <section>
          <div class="section-title">Items</div>
          <table class="lines">
            <tbody>
              <tr v-for="(it, i) in open.items" :key="i">
                <td>{{ it.name || '#' + it.product_id }}<span class="muted num"> × {{ it.quantity }}</span></td>
                <td class="r num">{{ omr(it.line_total) }}</td>
              </tr>
              <tr><td class="muted">Subtotal</td><td class="r num">{{ omr(open.subtotal) }}</td></tr>
              <tr v-if="Number(open.discount)">
                <td class="muted">Discount<span v-if="open.promo_code"> · <code>{{ open.promo_code }}</code></span></td>
                <td class="r num">−{{ omr(open.discount) }}</td>
              </tr>
              <tr><td class="muted">Delivery</td><td class="r num">{{ omr(open.delivery_fee) }}</td></tr>
              <tr class="total"><td>Total</td><td class="r num">{{ omr(open.total) }}</td></tr>
            </tbody>
          </table>
        </section>

        <section v-if="open.status_history?.length">
          <div class="section-title">History</div>
          <div class="timeline">
            <div v-for="(h, i) in open.status_history" :key="i">
              <span class="pill" :class="'s-' + h.status">{{ h.status }}</span>
              <span class="muted num">{{ fmt(h.at) }}</span>
            </div>
          </div>
        </section>
      </div>

      <div class="drawer-foot">
        <button v-if="open.status === 'new'" class="btn" @click="setStatus(open, 'processing')">Mark processing</button>
        <button v-if="open.status === 'new' || open.status === 'processing'" class="btn primary" @click="setStatus(open, 'done')">Mark done</button>
        <button v-if="open.status === 'done' || open.status === 'cancelled'" class="btn" @click="setStatus(open, 'new')">Reopen</button>
        <span class="spacer" />
        <button v-if="open.status !== 'cancelled'" class="btn danger" @click="setStatus(open, 'cancelled')">Cancel order</button>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.tabs { display: flex; gap: 2px; flex-wrap: wrap; }
.tabs button {
  font: inherit; font-size: 13px; font-weight: 500; border: 0; background: none; color: var(--text-2);
  padding: 6px 10px; border-radius: 7px; cursor: pointer;
}
.tabs button .num { color: var(--muted); margin-left: 2px; }
.tabs button:hover { background: var(--hover); }
.tabs button.on { background: var(--hover); color: var(--text); }
.tabs button.on .num { color: var(--text-2); }
.cap { text-transform: capitalize; }
.orders td { white-space: nowrap; }
.actions { justify-content: flex-end; flex-wrap: nowrap; }
</style>
