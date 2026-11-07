<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'

const promos = ref([])
const error = ref('')
const blank = () => ({ id: null, title: '', description: '', code: '', discount_percentage: 10, categoriesText: '', active: true })
const form = ref(blank())

async function load() {
  try { promos.value = await api('/admin/promotions') } catch (e) { error.value = e.message }
}
function edit(p) {
  form.value = { ...p, code: p.code || '', categoriesText: (p.categories || []).join(', ') }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
async function save() {
  error.value = ''
  const f = form.value
  const body = {
    title: f.title,
    description: f.description,
    code: f.code || null,
    active: f.active,
    discount_percentage: f.discount_percentage ? Number(f.discount_percentage) : null,
    categories: f.categoriesText.split(',').map((c) => c.trim()).filter(Boolean),
  }
  try {
    if (f.id) await api(`/admin/promotions/${f.id}`, { method: 'PUT', body })
    else await api('/admin/promotions', { method: 'POST', body })
    form.value = blank()
    load()
  } catch (e) { error.value = e.message }
}
async function toggle(p) {
  const { id, ...rest } = p
  try {
    await api(`/admin/promotions/${id}`, { method: 'PUT', body: { ...rest, active: !p.active } })
    load()
  } catch (e) { alert(e.message) }
}
async function remove(p) {
  if (!confirm(`Delete "${p.title}"?`)) return
  try {
    await api(`/admin/promotions/${p.id}`, { method: 'DELETE' })
    load()
  } catch (e) { alert(e.message) }
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
        <label class="field">Discount %<input v-model="form.discount_percentage" type="number" min="1" max="100" /></label>
      </div>
      <label class="field">Description
        <input v-model="form.description" placeholder="Get 20% off all power banks" />
        <span class="hint">Shown in the store's top bar</span>
      </label>
      <label class="field">Categories
        <input v-model="form.categoriesText" placeholder="Chargers &amp; Power Banks, Audio" />
        <span class="hint">Comma separated. Leave empty to apply to every product.</span>
      </label>
      <div class="notice">A promotion needs both a code and a discount to work at checkout. Without a code it only shows as an announcement.</div>
      <p v-if="error" class="error" style="margin: 0">{{ error }}</p>
    </div>
    <div class="card-foot">
      <label class="check"><input v-model="form.active" type="checkbox" /> Active</label>
      <div class="row">
        <button v-if="form.id" type="button" class="btn" @click="form = blank()">Cancel</button>
        <button class="btn primary">{{ form.id ? 'Save changes' : 'Create promotion' }}</button>
      </div>
    </div>
  </form>

  <div class="card">
    <div class="scroll">
      <table>
        <thead><tr><th>Promotion</th><th>Code</th><th>Discount</th><th>Applies to</th><th>Status</th><th></th></tr></thead>
        <tbody>
          <tr v-for="p in promos" :key="p.id">
            <td><b>{{ p.title }}</b><div v-if="p.description" class="muted small">{{ p.description }}</div></td>
            <td><code v-if="p.code" class="code">{{ p.code }}</code><span v-else class="muted">—</span></td>
            <td class="num">{{ p.discount_percentage ? p.discount_percentage + '%' : '—' }}</td>
            <td class="sub">{{ p.categories?.join(', ') || 'All products' }}</td>
            <td><span class="pill" :class="p.active ? 's-done' : 's-off'">{{ p.active ? 'Active' : 'Off' }}</span></td>
            <td class="r">
              <div class="row" style="justify-content: flex-end; flex-wrap: nowrap">
                <button class="btn sm" @click="edit(p)">Edit</button>
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
.form-grid { display: grid; grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr)); gap: 14px; }
.code { background: var(--hover); border: 1px solid var(--line); padding: 2px 6px; border-radius: 5px; }
@media (max-width: 640px) {
  .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .form-grid .field:first-child { grid-column: 1 / -1; }
}
</style>
