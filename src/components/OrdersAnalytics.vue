<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { api, omr } from '../api'
import BarChart from './BarChart.vue'

const props = defineProps({
  days: { type: Number, default: 30 },
  // Bump to reload (e.g. after an order status changes).
  version: { type: Number, default: 0 },
})

const PAGE = 100
const MAX_PAGES = 10
const DAY = 86400000

const orders = ref([])
const capped = ref(false)
const loading = ref(false)
const error = ref('')
const metric = ref('revenue')

function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }
const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}` }

const periodStart = computed(() => startOfDay(Date.now() - (props.days - 1) * DAY))
const prevStart = computed(() => new Date(periodStart.value.getTime() - props.days * DAY))

// The list endpoint is newest-first, so page until we pass the start of the previous period.
async function load() {
  loading.value = true
  error.value = ''
  try {
    const out = []
    let page = 1
    let more = true
    while (more && page <= MAX_PAGES) {
      const res = await api(`/admin/orders?page=${page}&page_size=${PAGE}`)
      out.push(...res.orders)
      const last = res.orders[res.orders.length - 1]
      more = res.orders.length === PAGE && page * PAGE < res.total && last && new Date(last.created_at) >= prevStart.value
      page++
    }
    capped.value = more
    orders.value = out
  } catch (e) { error.value = e.message } finally { loading.value = false }
}
watch(() => [props.days, props.version], load)
onMounted(load)

const inRange = (o, from, to) => { const t = new Date(o.created_at); return t >= from && (!to || t < to) }
const current = computed(() => orders.value.filter((o) => inRange(o, periodStart.value)))
const previous = computed(() => orders.value.filter((o) => inRange(o, prevStart.value, periodStart.value)))
// If we hit the page cap before reaching the previous period, comparisons would be wrong.
const hasPrevious = computed(() => !capped.value)

function summarize(list) {
  const kept = list.filter((o) => o.status !== 'cancelled')
  const revenue = kept.reduce((s, o) => s + Number(o.total || 0), 0)
  const cancelled = list.length - kept.length
  return {
    revenue,
    orders: list.length,
    aov: kept.length ? revenue / kept.length : 0,
    cancelRate: list.length ? cancelled / list.length : 0,
  }
}
const now = computed(() => summarize(current.value))
const prev = computed(() => summarize(previous.value))

function delta(key, invert = false) {
  if (!hasPrevious.value) return null
  const a = now.value[key]
  const b = prev.value[key]
  if (key === 'cancelRate') {
    if (!previous.value.length) return null
    const diff = (a - b) * 100
    return { text: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} pts`, good: invert ? diff <= 0 : diff >= 0, flat: Math.abs(diff) < 0.05 }
  }
  if (!b) return null
  const pct = ((a - b) / b) * 100
  return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, good: invert ? pct <= 0 : pct >= 0, flat: Math.abs(pct) < 0.05 }
}

const kpis = computed(() => [
  { label: 'Revenue', value: omr(now.value.revenue), delta: delta('revenue') },
  { label: 'Orders', value: now.value.orders.toLocaleString(), delta: delta('orders') },
  { label: 'Average order', value: omr(now.value.aov), delta: delta('aov') },
  { label: 'Cancellation rate', value: `${(now.value.cancelRate * 100).toFixed(1)}%`, delta: delta('cancelRate', true) },
])

const shortDate = (d) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
const longDate = (d) => d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

const series = computed(() => {
  const buckets = new Map()
  for (let i = 0; i < props.days; i++) {
    const d = new Date(periodStart.value.getTime() + i * DAY)
    buckets.set(dayKey(d), { date: d, revenue: 0, orders: 0 })
  }
  for (const o of current.value) {
    const b = buckets.get(dayKey(o.created_at))
    if (!b) continue
    b.orders++
    if (o.status !== 'cancelled') b.revenue += Number(o.total || 0)
  }
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    label: shortDate(b.date),
    tip: longDate(b.date),
    value: metric.value === 'revenue' ? b.revenue : b.orders,
    extra: metric.value === 'revenue' ? `${b.orders} order${b.orders === 1 ? '' : 's'}` : omr(b.revenue),
  }))
})
const chartFormat = computed(() => (metric.value === 'revenue' ? omr : (v) => `${v} order${v === 1 ? '' : 's'}`))
const compact = (v) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : `${+v.toFixed(v < 10 && v % 1 ? 1 : 0)}`)

function rank(entries, limit) {
  const rows = [...entries].sort((a, b) => b.value - a.value).slice(0, limit)
  const max = Math.max(1, ...rows.map((r) => r.value))
  return rows.map((r) => ({ ...r, pct: (r.value / max) * 100 }))
}

const topProducts = computed(() => {
  const m = new Map()
  for (const o of current.value) {
    if (o.status === 'cancelled') continue
    for (const it of o.items || []) {
      const k = it.product_id ?? it.name
      const row = m.get(k) || { key: k, name: it.name || `#${it.product_id}`, qty: 0, value: 0 }
      row.qty += Number(it.quantity || 0)
      row.value += Number(it.line_total || 0)
      m.set(k, row)
    }
  }
  return rank(m.values(), 6)
})

function tally(list, pick) {
  const m = new Map()
  for (const o of list) {
    const k = pick(o)
    if (!k) continue
    m.set(k, (m.get(k) || 0) + 1)
  }
  return [...m.entries()].map(([name, value]) => ({ key: name, name, value }))
}
const governorates = computed(() => rank(tally(current.value.filter((o) => o.delivery_method === 'delivery'), (o) => o.governorate), 6))

const STATUS = ['new', 'processing', 'done', 'cancelled']
const statusMix = computed(() => {
  const total = current.value.length || 1
  return STATUS.map((s) => {
    const n = current.value.filter((o) => o.status === s).length
    return { key: s, n, pct: (n / total) * 100 }
  })
})

function split(pick, labels) {
  const total = current.value.length || 1
  return Object.entries(labels).map(([k, name]) => {
    const n = current.value.filter((o) => pick(o) === k).length
    return { key: k, name, n, pct: (n / total) * 100 }
  })
}
const payment = computed(() => split((o) => (o.payment_method === 'online' ? 'online' : 'cash'), { online: 'Online', cash: 'Cash' }))
const fulfilment = computed(() => split((o) => (o.delivery_method === 'delivery' ? 'delivery' : 'pickup'), { delivery: 'Delivery', pickup: 'Pickup' }))
const pct = (v) => `${Math.round(v)}%`
</script>

<template>
  <div class="analytics" :class="{ busy: loading }">
    <p v-if="error" class="error" style="margin: 0 0 12px">{{ error }}</p>

    <div class="kpis">
      <div v-for="k in kpis" :key="k.label" class="card kpi">
        <div class="kpi-label">{{ k.label }}</div>
        <div class="kpi-value num">{{ k.value.replace(' OMR', '') }}<span v-if="k.value.endsWith(' OMR')" class="kpi-unit">OMR</span></div>
        <div class="kpi-delta num" :class="k.delta && !k.delta.flat ? (k.delta.good ? 'up' : 'down') : ''">
          <template v-if="k.delta">{{ k.delta.text }} <span class="muted">vs previous {{ days }} days</span></template>
          <span v-else class="muted">No earlier data</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <h3>{{ metric === 'revenue' ? 'Revenue' : 'Orders' }} per day</h3>
        <div class="seg">
          <button :class="{ on: metric === 'revenue' }" :aria-pressed="metric === 'revenue'" @click="metric = 'revenue'">Revenue</button>
          <button :class="{ on: metric === 'orders' }" :aria-pressed="metric === 'orders'" @click="metric = 'orders'">Orders</button>
        </div>
      </div>
      <div class="card-body">
        <BarChart :data="series" :format="chartFormat" :tick-format="compact" />
      </div>
    </div>

    <div class="cols">
      <div class="card">
        <div class="card-head"><h3>Top products</h3><span class="muted small">by revenue</span></div>
        <div v-if="topProducts.length" class="card-body rank">
          <div v-for="p in topProducts" :key="p.key" class="rank-row">
            <div class="rank-top">
              <span class="rank-name" :title="p.name">{{ p.name }}</span>
              <span class="num">{{ omr(p.value) }}</span>
            </div>
            <div class="rank-bar"><span :style="{ width: p.pct + '%' }" /></div>
            <div class="muted small num">{{ p.qty }} sold</div>
          </div>
        </div>
        <div v-else class="empty">No sales in this period</div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Delivery by governorate</h3><span class="muted small">orders</span></div>
        <div v-if="governorates.length" class="card-body rank">
          <div v-for="g in governorates" :key="g.key" class="rank-row">
            <div class="rank-top"><span class="rank-name">{{ g.name }}</span><span class="num">{{ g.value }}</span></div>
            <div class="rank-bar"><span :style="{ width: g.pct + '%' }" /></div>
          </div>
        </div>
        <div v-else class="empty">No deliveries in this period</div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Order mix</h3><span class="muted small num">{{ current.length }} orders</span></div>
        <div class="card-body stack">
          <div>
            <div class="mix-title">Status</div>
            <div class="stacked">
              <span v-for="s in statusMix" v-show="s.n" :key="s.key" :class="'seg-' + s.key" :style="{ width: s.pct + '%' }" />
            </div>
            <div class="legend">
              <div v-for="s in statusMix" :key="s.key"><i :class="'seg-' + s.key" /><span class="cap">{{ s.key }}</span><b class="num">{{ s.n }}</b></div>
            </div>
          </div>
          <div v-for="group in [{ title: 'Payment', rows: payment }, { title: 'Fulfilment', rows: fulfilment }]" :key="group.title">
            <div class="mix-title">{{ group.title }}</div>
            <div v-for="r in group.rows" :key="r.key" class="split-row">
              <span>{{ r.name }}</span>
              <div class="rank-bar"><span :style="{ width: r.pct + '%' }" /></div>
              <span class="num split-val">{{ pct(r.pct) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <p v-if="capped" class="muted small" style="margin: -4px 0 16px">
      Based on the latest {{ (PAGE * MAX_PAGES).toLocaleString() }} orders.
    </p>
  </div>
</template>

<style scoped>
.analytics { transition: opacity .15s; }
.analytics.busy { opacity: .6; }
.kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px; }
.kpi { padding: 22px; margin: 0; }
.kpi-label { color: var(--text-2); font-size: 12px; font-weight: 500; }
.kpi-value { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; font-size: clamp(24px, 2vw, 32px); font-weight: 600; letter-spacing: -.8px; margin: 14px 0 12px; overflow-wrap: anywhere; }
.kpi-unit { font-size: 11px; font-weight: 500; letter-spacing: 0; color: var(--muted); }
.kpi-delta { font-size: 11px; font-weight: 600; line-height: 1.7; }
.kpi-delta.up { color: var(--ok); }
.kpi-delta.down { color: var(--danger); }
.kpi-delta .muted { font-weight: 400; }

.cols { display: grid; grid-template-columns: minmax(0, 1.15fr) repeat(2, minmax(0, 1fr)); gap: 20px; }
.cols .card { margin-bottom: 20px; }
.rank { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; }
.rank-top { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px; font-size: 13.5px; }
.rank-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rank-top .num { flex-shrink: 0; }
.rank-bar { height: 4px; background: var(--line-soft); border-radius: 99px; overflow: hidden; }
.rank-bar span { display: block; height: 100%; background: var(--chart); border-radius: 99px; min-width: 2px; }
.rank-row .small { margin-top: 4px; }

.mix-title { font-size: 11px; color: var(--muted); font-weight: 500; margin-bottom: 10px; }
.stacked { display: flex; gap: 2px; height: 10px; border-radius: 99px; overflow: hidden; background: var(--line-soft); }
.stacked span { display: block; height: 100%; }
.seg-new { background: #7398ac; }
.seg-processing { background: #c4a15b; }
.seg-done { background: #678b54; }
.seg-cancelled { background: #c27a6a; }
.legend { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; margin-top: 10px; font-size: 13px; }
.legend div { display: flex; align-items: center; gap: 8px; }
.legend i { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.legend b { margin-left: auto; font-weight: 500; }
.cap { text-transform: capitalize; }
.split-row { display: grid; grid-template-columns: 70px 1fr 40px; align-items: center; gap: 10px; font-size: 13px; margin-bottom: 8px; }
.split-val { text-align: right; color: var(--text-2); }

@media (max-width: 1100px) {
  .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cols .card:first-child { grid-column: 1 / -1; }
}
@media (max-width: 720px) {
  .cols { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 700px) {
  .kpis { gap: 10px; margin-bottom: 16px; }
  .kpi { padding: 16px; }
  .kpi-value { font-size: 24px; margin: 10px 0 8px; }
  .kpi-label { font-size: 11px; }
  .kpi-delta .muted { display: block; }
  .cols { gap: 0; }
  .rank-name { overflow-wrap: anywhere; white-space: normal; }
  .legend { gap: 6px 12px; }
  .legend div { gap: 4px; }
}
@media (max-width: 380px) {
  .kpi { padding: 12px; }
  .kpi-value { font-size: 21px; }
}
</style>
