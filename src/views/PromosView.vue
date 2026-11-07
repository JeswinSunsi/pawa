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
  <h2>Promo codes</h2>
  <form class="card" @submit.prevent="save">
    <h3>{{ form.id ? 'Edit promotion' : 'New promotion' }}</h3>
    <div class="row" style="align-items: flex-end">
      <label>Title<input v-model="form.title" required placeholder="Flash Sale" /></label>
      <label>Code<input v-model="form.code" placeholder="TECH20" style="text-transform: uppercase; width: 130px" /></label>
      <label>Discount %<input v-model="form.discount_percentage" type="number" min="1" max="100" style="width: 100px" /></label>
      <label style="flex: 1; min-width: 220px">Description (shown in the top bar)<input v-model="form.description" placeholder="Get 20% OFF all power banks." /></label>
    </div>
    <div class="row" style="align-items: flex-end; margin-top: 8px">
      <label style="flex: 1; min-width: 260px">Only these categories (comma separated, empty = every product)<input v-model="form.categoriesText" placeholder="Chargers &amp; Power Banks, Audio" /></label>
      <label style="flex-direction: row; align-items: center; gap: 6px; color: var(--text)"><input v-model="form.active" type="checkbox" /> Active</label>
      <button class="btn primary">{{ form.id ? 'Save' : 'Create' }}</button>
      <button v-if="form.id" type="button" class="btn" @click="form = blank()">Cancel</button>
    </div>
    <p class="muted" style="margin: 8px 0 0">
      A promotion needs both a code and a discount % to work at checkout. Without a code it is only shown as an announcement.
    </p>
    <p v-if="error" class="error">{{ error }}</p>
  </form>

  <div class="card scroll">
    <table>
      <thead><tr><th>Title</th><th>Code</th><th>Discount</th><th>Categories</th><th>Status</th><th></th></tr></thead>
      <tbody>
        <tr v-for="p in promos" :key="p.id">
          <td><b>{{ p.title }}</b><div class="muted">{{ p.description }}</div></td>
          <td><code>{{ p.code || '—' }}</code></td>
          <td>{{ p.discount_percentage ? p.discount_percentage + '%' : '—' }}</td>
          <td>{{ p.categories?.join(', ') || 'All products' }}</td>
          <td><span class="pill" :class="p.active ? 's-done' : 's-cancelled'">{{ p.active ? 'Active' : 'Off' }}</span></td>
          <td>
            <div class="row">
              <button class="btn" @click="edit(p)">Edit</button>
              <button class="btn" @click="toggle(p)">{{ p.active ? 'Disable' : 'Enable' }}</button>
              <button class="btn danger" @click="remove(p)">Delete</button>
            </div>
          </td>
        </tr>
        <tr v-if="!promos.length"><td colspan="6" class="muted">No promotions yet.</td></tr>
      </tbody>
    </table>
  </div>
</template>
