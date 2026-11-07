<script setup>
import { ref, onMounted, watch } from 'vue'
import { api, omr } from '../api'

const MAX_PRODUCTS = 100
const promos = ref([])
const error = ref('')
const saving = ref(false)
const blank = () => ({
  id: null, title: '', description: '', code: '', discountType: 'percentage',
  discountValue: 10, categoriesText: '', productIds: [], active: true,
})
const form = ref(blank())

const productNames = ref({})
const search = ref('')
const results = ref([])
const searching = ref(false)
const searchError = ref('')
const productId = ref('')
const addingId = ref(false)
const idError = ref('')

watch(search, (value, _, onCleanup) => {
  const q = value.trim()
  results.value = []
  searchError.value = ''
  searching.value = Boolean(q)
  if (!q) return

  let stale = false
  const timer = setTimeout(async () => {
    try {
      const matches = await api('/search/suggestions?' + new URLSearchParams({ q }))
      if (!stale) results.value = matches
    } catch (e) {
      if (!stale) searchError.value = e.message
    } finally {
      if (!stale) searching.value = false
    }
  }, 250)
  onCleanup(() => {
    stale = true
    clearTimeout(timer)
  })
}, { flush: 'sync' })

function resetForm(next = blank()) {
  form.value = next
  search.value = ''
  productId.value = ''
  idError.value = ''
  error.value = ''
}

function selectProduct(product) {
  const ids = form.value.productIds
  productNames.value[product.id] = product.name
  if (!ids.includes(product.id) && ids.length < MAX_PRODUCTS) ids.push(product.id)
  search.value = ''
}

async function addProductId() {
  if (addingId.value || saving.value || form.value.productIds.length >= MAX_PRODUCTS) return
  idError.value = ''
  const value = productId.value.trim()
  const id = Number(value)
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id)) {
    idError.value = 'Enter a valid product ID.'
    return
  }
  const targetForm = form.value
  addingId.value = true
  try {
    const product = await api('/products/' + id)
    if (form.value === targetForm) {
      selectProduct(product)
      productId.value = ''
    }
  } catch (e) {
    if (form.value === targetForm) idError.value = e.message
  } finally {
    addingId.value = false
  }
}

async function load() {
  try { promos.value = await api('/admin/promotions') } catch (e) { error.value = e.message }
}

function edit(p) {
  const fixed = p.discount_amount != null
  resetForm({
    ...p,
    code: p.code || '',
    discountType: fixed ? 'fixed' : 'percentage',
    discountValue: (fixed ? p.discount_amount : p.discount_percentage) ?? '',
    categoriesText: (p.categories || []).join(', '),
    productIds: [...(p.product_ids || [])],
  })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function save() {
  if (saving.value || addingId.value) return
  error.value = ''
  if (productId.value.trim()) {
    idError.value = 'Click Add ID to select this product, or clear the ID field.'
    return
  }
  const f = form.value
  const discount = f.discountValue === '' ? null : f.discountValue
  const body = {
    title: f.title,
    description: f.description,
    code: f.code.trim() || null,
    active: f.active,
    discount_percentage: f.discountType === 'percentage' ? discount : null,
    discount_amount: f.discountType === 'fixed' ? discount : null,
    categories: f.categoriesText.split(',').map((c) => c.trim()).filter(Boolean),
    product_ids: f.productIds,
  }
  saving.value = true
  try {
    if (f.id) await api('/admin/promotions/' + f.id, { method: 'PUT', body })
    else await api('/admin/promotions', { method: 'POST', body })
    resetForm()
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function toggle(p) {
  const { id, ...rest } = p
  try {
    await api('/admin/promotions/' + id, { method: 'PUT', body: { ...rest, active: !p.active } })
    load()
  } catch (e) { alert(e.message) }
}

async function remove(p) {
  if (!confirm('Delete "' + p.title + '"?')) return
  try {
    await api('/admin/promotions/' + p.id, { method: 'DELETE' })
    load()
  } catch (e) { alert(e.message) }
}

function scopeLabel(p) {
  const targets = [...(p.categories || []), ...(p.product_ids || []).map(id => '#' + id)]
  return targets.join(', ') || 'All products'
}

onMounted(load)
</script>

<template>
  <div class="page-head">
    <h1>Promo codes</h1>
  </div>

  <form class="card" @submit.prevent="save">
    <div class="card-head">
      <h3>{{ form.id ? 'Edit promotion' : 'New promotion' }}</h3>
    </div>
    <div class="card-body stack">
      <div class="form-grid">
        <label class="field">Title<input v-model="form.title" required placeholder="Flash Sale" /></label>
        <label class="field">Code<input v-model="form.code" placeholder="TECH20" style="text-transform: uppercase" /></label>
      </div>
      <div class="discount-grid">
        <label class="field">Discount type
          <select v-model="form.discountType" @change="form.discountValue = ''">
            <option value="percentage">Percentage off</option>
            <option value="fixed">Fixed OMR off</option>
          </select>
        </label>
        <label class="field">{{ form.discountType === 'fixed' ? 'Amount (OMR)' : 'Discount (%)' }}
          <input v-model.number="form.discountValue" type="number" :required="Boolean(form.code.trim())"
            :min="form.discountType === 'fixed' ? 0.001 : 1"
            :max="form.discountType === 'fixed' ? 100000 : 100"
            :step="form.discountType === 'fixed' ? 0.001 : 1" />
        </label>
      </div>
      <label class="field">Description
        <input v-model="form.description" placeholder="Get 20% off all power banks" />
      </label>
      <label class="field">Categories
        <input v-model="form.categoriesText" placeholder="Chargers &amp; Power Banks, Audio" />
        <span class="hint">Separate category names with commas.</span>
      </label>
      <fieldset class="product-picker stack" :disabled="saving">
        <legend>Specific products</legend>
        <div class="discount-grid">
          <label class="field">Search products
            <input v-model="search" type="search" maxlength="100" placeholder="Search by name"
              :disabled="form.productIds.length >= MAX_PRODUCTS" @keydown.enter.prevent />
          </label>
          <label class="field">Product ID
            <span class="id-input">
              <input v-model="productId" inputmode="numeric" placeholder="Enter exact ID"
                :disabled="addingId || form.productIds.length >= MAX_PRODUCTS"
                @input="idError = ''" @keydown.enter.prevent="addProductId" />
              <button type="button" class="btn" :disabled="!productId.trim() || addingId || form.productIds.length >= MAX_PRODUCTS"
                @click="addProductId">Add ID</button>
            </span>
          </label>
        </div>
        <p v-if="idError" class="error picker-message" role="alert">{{ idError }}</p>
        <p v-if="searchError" class="error picker-message" role="alert">{{ searchError }}</p>
        <p v-else-if="search.trim() && (searching || !results.length)" class="hint picker-message" role="status">
          {{ searching ? 'Searching…' : 'No products found.' }}
        </p>
        <ul v-if="results.length" class="product-results" aria-label="Product search results">
          <li v-for="product in results" :key="product.id">
            <button type="button" class="btn product-result"
              :disabled="form.productIds.includes(product.id) || form.productIds.length >= MAX_PRODUCTS"
              @click="selectProduct(product)">
              <span>{{ product.name }} <span class="muted">#{{ product.id }}</span></span>
              <span>{{ form.productIds.includes(product.id) ? 'Added' : 'Add' }}</span>
            </button>
          </li>
        </ul>
        <ul v-if="form.productIds.length" class="product-selection" aria-label="Selected products">
          <li v-for="id in form.productIds" :key="id">
            <span>{{ productNames[id] || 'Product' }} #{{ id }}</span>
            <button type="button" class="btn sm" :aria-label="'Remove product ' + id"
              @click="form.productIds = form.productIds.filter(productId => productId !== id)">Remove</button>
          </li>
        </ul>
        <span v-if="form.productIds.length >= MAX_PRODUCTS" class="hint">You can select up to {{ MAX_PRODUCTS }} products.</span>
        <span class="hint">Leave categories and products empty to include every product. Otherwise, a product qualifies if it matches either selection.</span>
      </fieldset>
      <div class="notice">Checkout requires an active code and a discount. A fixed OMR discount applies once to the eligible subtotal, up to that subtotal.</div>
      <p v-if="error" class="error" style="margin: 0">{{ error }}</p>
    </div>
    <div class="card-foot">
      <label class="check"><input v-model="form.active" type="checkbox" /> Active</label>
      <div class="row">
        <button v-if="form.id" type="button" class="btn" :disabled="saving" @click="resetForm()">Cancel</button>
        <button class="btn primary" :disabled="saving || addingId">{{ saving ? 'Saving…' : form.id ? 'Save changes' : 'Create promotion' }}</button>
      </div>
    </div>
  </form>

  <div class="card promotions-card">
    <div class="scroll">
      <table>
        <thead><tr><th>Promotion</th><th>Code</th><th>Discount</th><th>Applies to</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="p in promos" :key="p.id">
            <td class="promotion-name"><b>{{ p.title }}</b><div v-if="p.description" class="muted small">{{ p.description }}</div></td>
            <td data-label="Code"><code v-if="p.code" class="code">{{ p.code }}</code><span v-else class="muted">—</span></td>
            <td class="num" data-label="Discount">{{ p.discount_amount != null ? omr(p.discount_amount) : p.discount_percentage ? p.discount_percentage + '%' : '—' }}</td>
            <td class="sub promotion-categories" data-label="Applies to">{{ scopeLabel(p) }}</td>
            <td class="promotion-status"><span class="pill" :class="p.active ? 's-done' : 's-off'">{{ p.active ? 'Active' : 'Off' }}</span></td>
            <td class="r promotion-actions">
              <div class="row" style="justify-content: flex-end; flex-wrap: nowrap">
                <button class="btn sm" :disabled="saving" @click="edit(p)">Edit</button>
                <button class="btn sm" @click="toggle(p)">{{ p.active ? 'Disable' : 'Enable' }}</button>
                <button class="btn sm danger" @click="remove(p)">Delete</button>
              </div>
            </td>
          </tr>
          <tr v-if="!promos.length"><td colspan="6" class="empty">No promotions yet</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.form-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 14px; }
.discount-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.product-picker { min-width: 0; margin: 0; padding: 14px; border: 1px solid var(--line); border-radius: 8px; }
.product-picker legend { padding: 0 5px; font-weight: 600; }
.id-input { display: flex; gap: 8px; }
.id-input input { min-width: 0; flex: 1; }
.id-input .btn { flex-shrink: 0; }
.picker-message { margin: 0; }
.product-results, .product-selection { display: grid; gap: 6px; list-style: none; margin: 0; padding: 0; }
.product-result, .product-selection li { display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left; }
.product-result { width: 100%; }
.product-selection li { padding: 4px 8px; border: 1px solid var(--line); border-radius: 6px; }
.code { background: var(--hover); border: 1px solid var(--line); padding: 2px 6px; border-radius: 5px; }
.promotions-card { overflow: hidden; }
@media (max-width: 700px) {
  .form-grid, .product-picker .discount-grid { grid-template-columns: 1fr; }
  .promotions-card table, .promotions-card tbody { display: block; min-width: 0; }
  .promotions-card thead { display: none; }
  .promotions-card tr { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px 12px; padding: 20px 16px; border-bottom: 1px solid var(--line); }
  .promotions-card tr:last-child { border: 0; }
  .promotions-card td { display: block; padding: 0; border: 0; overflow-wrap: anywhere; }
  .promotions-card td[data-label]::before { content: attr(data-label); display: block; color: var(--muted); font-size: 11px; margin-bottom: 5px; }
  .promotion-name { grid-column: 1; }
  .promotion-status { grid-column: 2; grid-row: 1; text-align: right; }
  .promotion-categories, .promotion-actions, .promotions-card .empty { grid-column: 1 / -1; }
  .promotion-actions .btn { flex: 1; }
}
</style>
