<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { api, omr } from '../api'

// Support requests customers file from My orders on the storefront (backend: /admin/support, admin.py).
const STATUSES = ['new', 'processing', 'closed']
// The reasons customers pick on the storefront's support form (backend accounts.py SupportRequestIn.reason).
const REASONS = { general: 'General enquiry', order_status: 'Order status', cancel_modify: 'Cancel or modify order', change_delivery: 'Change delivery' }
const reasonLabel = (r) => REASONS[r?.reason] || REASONS.general

const requests = ref([])
const byStatus = ref(null)
const total = ref(0)
const page = ref(1)
const pageSize = 25
const status = ref('new')
const q = ref('')
const error = ref('')
const loading = ref(false)
const loaded = ref(false)
const saving = ref(false)
const openId = ref(null)
const open = computed(() => requests.value.find((r) => r.id === openId.value) || null)
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const allCount = computed(() => (byStatus.value ? Object.values(byStatus.value).reduce((a, b) => a + b, 0) : ''))

async function load() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({ page: page.value, page_size: pageSize })
    if (status.value) params.set('status', status.value)
    if (q.value.trim()) params.set('q', q.value.trim())
    const data = await api(`/admin/support?${params}`)
    requests.value = data.requests
    total.value = data.total
    byStatus.value = data.by_status
    loaded.value = true
  } catch (e) { error.value = e.message } finally { loading.value = false }
}

async function setStatus(req, next) {
  saving.value = true
  try {
    const prev = req.status
    const updated = await api(`/admin/support/${req.id}`, { method: 'PATCH', body: { status: next } })
    Object.assign(req, updated)
    if (byStatus.value) { byStatus.value[prev]--; byStatus.value[next]++ }
  } catch (e) { alert(e.message) } finally { saving.value = false }
}

let timer
watch(q, () => { clearTimeout(timer); timer = setTimeout(() => { page.value = 1; load() }, 300) })
watch(status, () => { page.value = 1; load() })
watch(page, load)
onMounted(load)

const onKey = (e) => { if (e.key === 'Escape') openId.value = null }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Stored as naive UTC by the backend: read them as UTC.
const toDate = (d) => (d ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(d) ? d : d + 'Z') : null)
const fmtDate = (d) => toDate(d)?.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) ?? ''
const fmtTime = (d) => toDate(d)?.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) ?? ''
const fmt = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '')
const payLabel = (o) => (o?.payment_method === 'online' ? 'Online' : 'Cash')
</script>

<template>
  <div class="page-head">
    <h1>Support</h1>
    <div class="row">
      <button class="btn icon" title="Refresh" :disabled="loading" @click="load">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
      </button>
    </div>
  </div>

  <div class="card support-card">
    <div class="card-head support-toolbar">
      <div class="tabs">
        <button v-for="s in STATUSES" :key="s" :class="{ on: status === s }" :aria-pressed="status === s" @click="status = s">
          <span class="cap">{{ s }}</span> <span class="num">{{ byStatus?.[s] ?? '' }}</span>
        </button>
        <button :class="{ on: status === '' }" :aria-pressed="status === ''" @click="status = ''">All <span class="num">{{ allCount }}</span></button>
      </div>
      <label class="search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input v-model="q" aria-label="Order #, name, email, phone or message" placeholder="Order #, name, email, phone or message" />
      </label>
    </div>
    <p v-if="error" class="error" style="padding: 0 18px">{{ error }}</p>

    <div class="scroll">
      <table class="support" :class="{ 'is-refreshing': loading && loaded }">
        <thead>
          <tr><th>Received</th><th>Order</th><th>Customer</th><th>Reason / message</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="r in requests" :key="r.id" class="click" :class="{ sel: openId === r.id }" @click="openId = r.id">
            <td class="num s-date">{{ fmtDate(r.created_at) }}<div class="muted small">{{ fmtTime(r.created_at) }}</div></td>
            <td class="num s-order"><template v-if="r.order_number">{{ r.order_number }}</template><span v-else class="muted">General</span><div v-if="r.order?.total != null" class="muted small">{{ omr(r.order.total) }}</div></td>
            <td class="s-customer">{{ r.name || '—' }}<div class="muted small num">{{ r.phone || r.email }}</div></td>
            <td class="s-message"><b class="reason">{{ reasonLabel(r) }}</b><span v-if="r.message" class="message-preview muted">{{ r.message }}</span></td>
            <td class="s-status"><span class="pill" :class="'s-' + r.status">{{ r.status }}</span></td>
            <td class="r s-actions" @click.stop><button class="btn sm" @click="openId = r.id">View</button></td>
          </tr>
          <tr v-if="!loaded && loading"><td colspan="6"><div class="loader" role="status">Loading support requests…</div></td></tr>
          <tr v-else-if="!requests.length && !loading"><td colspan="6" class="empty">No support requests</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card-foot">
      <span class="muted small num">{{ loaded ? `${total.toLocaleString()} request${total === 1 ? '' : 's'}` : '' }}</span>
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
          <div class="row" style="gap: 10px"><h3 class="num" style="font-size: 17px">{{ open.order_number || 'General request' }}</h3><span class="pill" :class="'s-' + open.status">{{ open.status }}</span></div>
          <div class="muted small" style="margin-top: 4px">Received {{ fmt(open.created_at) }}</div>
        </div>
        <button class="btn icon ghost" title="Close" @click="openId = null">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div class="drawer-body">
        <section>
          <div class="section-title">Reason</div>
          <p class="reason-line">{{ reasonLabel(open) }}</p>
        </section>

        <section>
          <div class="section-title">Message</div>
          <p v-if="open.message" class="message">{{ open.message }}</p>
          <p v-else class="muted small">The customer didn't add a message.</p>
        </section>

        <section>
          <div class="section-title">Customer</div>
          <dl class="kv">
            <dt>Name</dt><dd>{{ open.name || '—' }}</dd>
            <dt>Email</dt><dd><a :href="'mailto:' + open.email">{{ open.email }}</a></dd>
            <dt>Phone</dt><dd class="num"><a v-if="open.phone" :href="'tel:' + open.phone">{{ open.phone }}</a><template v-else>—</template></dd>
          </dl>
        </section>

        <section v-if="open.order">
          <div class="section-title">Order (when the request was sent)</div>
          <dl class="kv">
            <dt>Placed</dt><dd>{{ fmt(open.order.created_at) }}</dd>
            <dt>Status</dt><dd class="cap">{{ open.order.status || 'new' }}</dd>
            <dt>Delivery</dt><dd class="cap">{{ open.order.delivery_method }}</dd>
            <dt>Payment</dt><dd>{{ payLabel(open.order) }}<span v-if="open.order.payment_method === 'online'" class="muted cap"> · {{ open.order.payment_status || 'unknown' }}</span></dd>
            <dt>Total</dt><dd class="num">{{ omr(open.order.total) }}</dd>
          </dl>
        </section>

        <section v-if="open.status_history?.length">
          <div class="section-title">History</div>
          <ol class="history">
            <li v-for="(h, i) in open.status_history" :key="i">
              <span class="dot" :class="'s-' + h.status" />
              <div class="cap h-status">{{ h.status }}</div>
              <div class="muted small num">{{ fmt(h.at) }}</div>
            </li>
          </ol>
        </section>
      </div>

      <div class="drawer-foot">
        <button v-if="open.status !== 'new'" class="btn" :disabled="saving" @click="setStatus(open, 'new')">{{ open.status === 'closed' ? 'Reopen' : 'Mark new' }}</button>
        <button v-if="open.status !== 'processing'" class="btn" :disabled="saving" @click="setStatus(open, 'processing')">Mark processing</button>
        <span class="spacer" />
        <button v-if="open.status !== 'closed'" class="btn primary" :disabled="saving" @click="setStatus(open, 'closed')">Mark closed</button>
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
.search { width: 300px; max-width: 100%; }
.support-card { overflow: hidden; }
.support-toolbar { gap: 16px; }
.support td { white-space: nowrap; }
.support td.s-message { white-space: normal; width: 40%; }
.message-preview { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.reason { display: block; font-weight: 500; }
.reason-line { margin: 0; font-size: 14px; font-weight: 500; }
.message { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; line-height: 1.5; }
.kv a { color: inherit; }
.history { list-style: none; margin: 0; padding: 0; }
.history li { position: relative; padding: 0 0 22px 26px; font-size: 13px; }
.history li:last-child { padding-bottom: 0; }
.history .dot { position: absolute; left: 0; top: 3px; width: 12px; height: 12px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px var(--panel); }
.history li:not(:last-child)::after { content: ''; position: absolute; left: 5px; top: 20px; bottom: 9px; width: 2px; background: var(--line); }
.h-status { font-weight: 500; margin-bottom: 2px; }
.drawer-foot .btn:disabled { opacity: .6; cursor: not-allowed; }
.s-closed { color: var(--muted); background: var(--hover); }

@media (max-width: 700px) {
  .support-toolbar { display: flex; flex-direction: column-reverse; align-items: stretch; gap: 12px; }
  .tabs { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; }
  .tabs button { min-height: 44px; flex-shrink: 0; white-space: nowrap; font-size: 12px; padding-inline: 9px; }
  .search { width: 100%; }
  .scroll > .support { display: block; min-width: 0; }
  .support thead { display: none; }
  .support tbody { display: block; }
  .support tr.click { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'order status' 'customer date' 'message message' 'actions actions'; gap: 12px; padding: 18px 16px; border-bottom: 1px solid var(--line); }
  .support tr.click:last-child { border-bottom: 0; }
  .support td { display: block; padding: 0; border: 0; white-space: normal; overflow-wrap: anywhere; }
  .support td.s-message { width: auto; }
  .support tr.click:hover td, .support tr.sel td { background: none; }
  .support tr.sel { background: var(--hover); }
  .s-order { grid-area: order; }
  .s-status { grid-area: status; text-align: right; }
  .s-customer { grid-area: customer; }
  .s-date { grid-area: date; text-align: right; font-size: 12px; }
  .s-message { grid-area: message; font-size: 13px; }
  .s-actions { grid-area: actions; }
  .s-actions .btn { width: 100%; }
  .support .empty { padding: 32px 16px; }
  .card-foot { gap: 12px; }
  .card-foot > .row { width: 100%; }
  .card-foot > .row > span { margin-right: auto; }
}
</style>
