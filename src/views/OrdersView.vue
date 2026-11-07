<script setup>
import { ref, watch, onMounted } from 'vue'
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
const open = ref(null)

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

async function setStatus(order, next) {
  if (next === 'cancelled' && !confirm(`Cancel order ${order.order_number}?`)) return
  try {
    const updated = await api(`/admin/orders/${order.order_number}`, { method: 'PATCH', body: { status: next } })
    Object.assign(order, updated)
    api('/admin/stats').then((s) => (stats.value = s))
  } catch (e) { alert(e.message) }
}

let timer
watch(q, () => { clearTimeout(timer); timer = setTimeout(() => { page.value = 1; load() }, 300) })
watch(status, () => { page.value = 1; load() })
watch(page, load)
onMounted(load)

const fmt = (d) => (d ? new Date(d).toLocaleString() : '')
const payLabel = (o) => (o.payment_method === 'online' ? `Online · ${o.payment_status || '?'}` : 'Cash')
</script>

<template>
  <h2>Orders</h2>
  <div v-if="stats" class="grid">
    <div class="stat"><span class="muted">Today</span><b>{{ stats.orders_today }}</b></div>
    <div class="stat"><span class="muted">All orders</span><b>{{ stats.orders_total }}</b></div>
    <div class="stat"><span class="muted">Revenue (excl. cancelled)</span><b>{{ omr(stats.revenue) }}</b></div>
    <div v-for="s in STATUSES" :key="s" class="stat">
      <span :class="'s-' + s" style="text-transform: capitalize">{{ s }}</span><b>{{ stats.by_status[s] }}</b>
    </div>
  </div>

  <div class="card">
    <div class="row" style="margin-bottom: 12px">
      <input v-model="q" placeholder="Search order #, name, email, phone" style="flex: 1; min-width: 200px" />
      <select v-model="status">
        <option value="">All statuses</option>
        <option v-for="s in STATUSES" :key="s" :value="s">{{ s }}</option>
      </select>
      <button class="btn" :disabled="loading" @click="load">Refresh</button>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="scroll">
      <table>
        <thead>
          <tr><th>Order</th><th>Date</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          <template v-for="o in orders" :key="o.order_number">
            <tr class="click" @click="open = open === o.order_number ? null : o.order_number">
              <td><b>{{ o.order_number }}</b><div class="muted">{{ o.delivery_method }}</div></td>
              <td>{{ fmt(o.created_at) }}</td>
              <td>{{ o.name }}<div class="muted">{{ o.phone }}</div></td>
              <td>{{ omr(o.total) }}</td>
              <td>{{ payLabel(o) }}</td>
              <td><span class="pill" :class="'s-' + o.status">{{ o.status }}</span></td>
              <td @click.stop>
                <div class="row">
                  <button v-if="o.status === 'new'" class="btn" @click="setStatus(o, 'processing')">Processing</button>
                  <button v-if="o.status !== 'done' && o.status !== 'cancelled'" class="btn primary" @click="setStatus(o, 'done')">Done</button>
                  <button v-if="o.status !== 'cancelled'" class="btn danger" @click="setStatus(o, 'cancelled')">Cancel</button>
                  <button v-if="o.status === 'done' || o.status === 'cancelled'" class="btn" @click="setStatus(o, 'new')">Reopen</button>
                </div>
              </td>
            </tr>
            <tr v-if="open === o.order_number">
              <td colspan="7">
                <div class="row" style="align-items: flex-start; gap: 32px">
                  <div>
                    <h3>Customer</h3>
                    <div>{{ o.name }}</div>
                    <div>{{ o.email }}</div>
                    <div>{{ o.phone }}</div>
                    <div v-if="o.delivery_method === 'delivery'">{{ o.address }}, {{ o.governorate }}</div>
                    <div v-else>Pickup · store #{{ o.selected_store }}</div>
                  </div>
                  <div style="flex: 1; min-width: 260px">
                    <h3>Items</h3>
                    <table>
                      <tbody>
                        <tr v-for="(it, i) in o.items" :key="i">
                          <td>{{ it.name || '#' + it.product_id }}</td><td>× {{ it.quantity }}</td><td>{{ omr(it.line_total) }}</td>
                        </tr>
                        <tr><td colspan="2" class="muted">Subtotal</td><td>{{ omr(o.subtotal) }}</td></tr>
                        <tr v-if="Number(o.discount)">
                          <td colspan="2" class="muted">Discount {{ o.promo_code ? `(${o.promo_code})` : '' }}</td><td>−{{ omr(o.discount) }}</td>
                        </tr>
                        <tr><td colspan="2" class="muted">Delivery</td><td>{{ omr(o.delivery_fee) }}</td></tr>
                        <tr><td colspan="2"><b>Total</b></td><td><b>{{ omr(o.total) }}</b></td></tr>
                      </tbody>
                    </table>
                  </div>
                  <div v-if="o.status_history?.length">
                    <h3>History</h3>
                    <div v-for="(h, i) in o.status_history" :key="i" class="muted">{{ fmt(h.at) }} → {{ h.status }}</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
          <tr v-if="!orders.length && !loading"><td colspan="7" class="muted">No orders found.</td></tr>
        </tbody>
      </table>
    </div>
    <div class="row" style="margin-top: 12px; justify-content: space-between">
      <span class="muted">{{ total }} orders</span>
      <div class="row">
        <button class="btn" :disabled="page <= 1" @click="page--">Prev</button>
        <span>Page {{ page }} / {{ Math.max(1, Math.ceil(total / pageSize)) }}</span>
        <button class="btn" :disabled="page * pageSize >= total" @click="page++">Next</button>
      </div>
    </div>
  </div>
</template>
