<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { api, omr } from '../api'

const STATUSES = ['new', 'processing', 'done', 'cancelled']

const stats = ref(null)
const orders = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = 25
const status = ref('')
const q = ref('')
const error = ref('')
const loading = ref(false)
const loaded = ref(false)
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
    loaded.value = true
  } catch (e) { error.value = e.message } finally { loading.value = false }
}

const paymentPending = (order) => order.payment_method === 'online' && order.payment_status === 'pending'

async function setStatus(order, next) {
  if (paymentPending(order) && (next === 'processing' || next === 'done')) return
  if (next === 'cancelled' && !confirm(`Cancel order ${order.order_number}?`)) return
  try {
    const updated = await api(`/admin/orders/${order.order_number}`, { method: 'PATCH', body: { status: next } })
    Object.assign(order, updated)
    api('/admin/stats').then((s) => (stats.value = s))
  } catch (e) { alert(e.message) }
}

// The "order placed" email to the customer (backend: POST /admin/orders/{n}/email, sent via Resend).
const sendingEmail = ref('')
const emailsSent = (order) => (order.emails || []).filter((e) => e.type === 'order_placed')
const emailBlocked = (order) => {
  if (!order.email) return 'No email address on this order'
  if (order.status === 'cancelled') return 'Order is cancelled'
  if (order.payment_method === 'online' && order.payment_status !== 'paid') return 'Online payment not completed'
  return ''
}

async function sendOrderEmail(order) {
  const sent = emailsSent(order)
  if (sent.length && !confirm(`The order email was already sent on ${fmt(sent[sent.length - 1].at)}. Send it again to ${order.email}?`)) return
  sendingEmail.value = order.order_number
  try {
    const updated = await api(`/admin/orders/${order.order_number}/email`, { method: 'POST' })
    Object.assign(order, updated)
  } catch (e) { alert(e.message) } finally { sendingEmail.value = '' }
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
      <button class="btn icon" title="Refresh" :disabled="loading" @click="load">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
      </button>
    </div>
  </div>

  <div class="card orders-card">
    <div class="card-head orders-toolbar">
      <div class="tabs">
        <button :class="{ on: status === '' }" :aria-pressed="status === ''" @click="status = ''">All <span class="num">{{ stats?.orders_total ?? '' }}</span></button>
        <button v-for="s in STATUSES" :key="s" :class="{ on: status === s }" :aria-pressed="status === s" @click="status = s">
          <span class="cap">{{ s }}</span> <span class="num">{{ stats?.by_status?.[s] ?? '' }}</span>
        </button>
      </div>
      <label class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input v-model="q" aria-label="Order #, name, email or phone" placeholder="Order #, name, email or phone" />
      </label>
    </div>
    <p v-if="error" class="error" style="padding: 0 18px">{{ error }}</p>

    <div class="scroll">
      <table class="orders" :class="{ 'is-refreshing': loading && loaded }">
        <thead>
          <tr><th>Order</th><th>Date</th><th>Customer</th><th>Payment</th><th>Status</th><th class="r">Total</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="o in orders" :key="o.order_number" class="click" :class="{ sel: openId === o.order_number }" @click="openId = o.order_number">
            <td class="order-id"><button class="order-link num" @click.stop="openId = o.order_number">{{ o.order_number }}</button><div class="muted small cap">{{ o.delivery_method }}</div></td>
            <td class="num order-date">{{ fmtDate(o.created_at) }}<div class="muted small">{{ fmtTime(o.created_at) }}</div></td>
            <td class="order-customer">{{ o.name }}<div class="muted small num">{{ o.phone }}</div></td>
            <td class="order-payment" data-label="Payment">
              {{ payLabel(o) }}
              <div v-if="o.payment_method === 'online'" class="muted small cap">{{ o.payment_status || 'unknown' }}</div>
            </td>
            <td class="order-status"><span class="pill" :class="'s-' + o.status">{{ o.status }}</span></td>
            <td class="r num order-total" data-label="Total"><b>{{ omr(o.total) }}</b></td>
            <td class="r order-actions" @click.stop>
              <div class="row actions">
                <button v-if="o.status === 'new'" class="btn sm" :disabled="paymentPending(o)" @click="setStatus(o, 'processing')">Start</button>
                <button v-if="o.status === 'new' || o.status === 'processing'" class="btn sm primary" :disabled="paymentPending(o)" @click="setStatus(o, 'done')">Complete</button>
                <button v-if="o.status === 'done' || o.status === 'cancelled'" class="btn sm" @click="setStatus(o, 'new')">Reopen</button>
              </div>
            </td>
          </tr>
          <tr v-if="!loaded && loading"><td colspan="7"><div class="loader" role="status">Loading orders…</div></td></tr>
          <tr v-else-if="!orders.length && !loading"><td colspan="7" class="empty">No orders found</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card-foot">
      <span class="muted small num">{{ loaded ? `${total.toLocaleString()} order${total === 1 ? '' : 's'}` : '' }}</span>
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

        <section>
          <div class="section-title">Customer email</div>
          <div class="email-row">
            <div class="small">
              <template v-if="emailsSent(open).length">
                <span class="pill s-done">Sent</span>
                <span class="muted num"> {{ fmt(emailsSent(open).at(-1).at) }}<template v-if="emailsSent(open).length > 1"> · {{ emailsSent(open).length }} times</template></span>
              </template>
              <span v-else-if="emailBlocked(open)" class="muted">{{ emailBlocked(open) }}</span>
              <span v-else class="muted">Order placed email not sent yet</span>
            </div>
            <button class="btn sm" :disabled="!!emailBlocked(open) || sendingEmail === open.order_number" @click="sendOrderEmail(open)">
              {{ sendingEmail === open.order_number ? 'Sending…' : emailsSent(open).length ? 'Resend' : 'Send order email' }}
            </button>
          </div>
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
        <button v-if="open.status === 'new'" class="btn" :disabled="paymentPending(open)" @click="setStatus(open, 'processing')">Mark processing</button>
        <button v-if="open.status === 'new' || open.status === 'processing'" class="btn primary" :disabled="paymentPending(open)" @click="setStatus(open, 'done')">Mark done</button>
        <button v-if="open.status === 'done' || open.status === 'cancelled'" class="btn" @click="setStatus(open, 'new')">Reopen</button>
        <span class="spacer" />
        <button v-if="open.status !== 'cancelled'" class="btn danger" @click="setStatus(open, 'cancelled')">Cancel order</button>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.tabs { display: flex; gap: 6px; flex-wrap: wrap; }
.tabs button {
  font: inherit; font-size: 13px; font-weight: 500; border: 1px solid var(--line); background: var(--panel); color: var(--text-2);
  padding: 8px 12px; border-radius: 999px; cursor: pointer;
}
.tabs button .num { color: var(--muted); margin-left: 4px; font-size: 11px; }
.tabs button:hover { border-color: var(--ink); }
.tabs button.on { background: var(--ink); border-color: var(--ink); color: #fff; }
.tabs button.on .num { color: #d1d5db; }
.cap { text-transform: capitalize; }
.search { width: 280px; max-width: 100%; }
.orders td { white-space: nowrap; }
.actions { justify-content: flex-end; flex-wrap: nowrap; }
.actions .btn:disabled, .drawer-foot .btn:disabled {
  background: var(--line-soft); border-color: var(--line); color: var(--muted); opacity: 1; cursor: not-allowed;
}
.order-link { font: inherit; font-weight: 500; padding: 0; border: 0; background: none; color: var(--text); cursor: pointer; }
.order-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.orders-card { overflow: hidden; }
.orders-toolbar { gap: 16px; }
.email-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.email-row .btn:disabled { background: var(--line-soft); border-color: var(--line); color: var(--muted); opacity: 1; cursor: not-allowed; }

@media (max-width: 700px) {
  .orders-toolbar { display: flex; flex-direction: column-reverse; align-items: stretch; gap: 12px; }
  .tabs { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; }
  .tabs button { min-height: 44px; flex-shrink: 0; white-space: nowrap; font-size: 12px; padding-inline: 9px; }
  .search { width: 100%; }
  .scroll > .orders { display: block; min-width: 0; }
  .orders thead { display: none; }
  .orders tbody { display: block; }
  .orders tr.click { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: 'id status' 'customer date' 'payment total' 'actions actions'; gap: 14px 12px; padding: 20px 16px; border-bottom: 1px solid var(--line); }
  .orders tr.click:last-child { border-bottom: 0; }
  .orders td { display: block; padding: 0; border: 0; white-space: normal; overflow-wrap: anywhere; }
  .orders tr.click:hover td, .orders tr.sel td { background: none; }
  .orders tr.sel { background: var(--hover); }
  .order-id { grid-area: id; }
  .order-status { grid-area: status; text-align: right; }
  .order-date { grid-area: date; text-align: right; font-size: 12px; }
  .order-customer { grid-area: customer; }
  .order-payment { grid-area: payment; font-size: 12px; }
  .order-total { grid-area: total; }
  .order-payment::before, .order-total::before { content: attr(data-label); display: block; color: var(--muted); font-size: 11px; margin-bottom: 3px; }
  .order-actions { grid-area: actions; padding-top: 14px !important; border-top: 1px solid var(--line-soft) !important; }
  .actions .btn { flex: 1; }
  .orders .empty { padding: 32px 16px; }
  .card-foot { gap: 12px; }
  .card-foot > .row { width: 100%; }
  .card-foot > .row > span { margin-right: auto; }
}
</style>
