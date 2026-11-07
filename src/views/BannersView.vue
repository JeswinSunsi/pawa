<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, previewUrl } from '../api'

// Slots match the storefront: home category slugs (porodo/frontend/src/constants/homeCategories.js) + the VR promo image.
const SLOTS = [
  { id: 'all', label: 'Home (All)' },
  { id: 'phones', label: 'Phones' },
  { id: 'power-banks', label: 'Power banks' },
  { id: 'wearables', label: 'Wearables' },
  { id: 'speakers', label: 'Speakers' },
  { id: 'earbuds', label: 'Earbuds' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'chargers', label: 'Chargers' },
  { id: 'vr-promo', label: 'VR promo section (first image only)' },
]

const saved = ref({})
const slot = ref('all')
const slides = ref([])
const error = ref('')
const msg = ref('')
const isCustom = computed(() => !!saved.value[slot.value])

async function load() {
  try {
    saved.value = await api('/admin/banners')
    pick(slot.value)
  } catch (e) { error.value = e.message }
}
function pick(id) {
  slot.value = id
  msg.value = ''
  slides.value = (saved.value[id] || []).map((s) => ({ ...s }))
}
function add() {
  slides.value.push({ image: '', desktopImage: '', alt: '', link: '' })
}
function move(i, d) {
  const j = i + d
  if (j < 0 || j >= slides.value.length) return
  const list = slides.value
  ;[list[i], list[j]] = [list[j], list[i]]
}
async function save() {
  error.value = ''
  msg.value = ''
  const clean = slides.value
    .filter((s) => s.image.trim())
    .map((s) => ({ image: s.image.trim(), desktopImage: s.desktopImage?.trim() || null, alt: s.alt || '', link: s.link?.trim() || null }))
  try {
    await api(`/admin/banners/${slot.value}`, { method: 'PUT', body: { slides: clean } })
    msg.value = clean.length ? 'Saved. Live on the store now.' : 'Saved with no slides: the store shows its built-in images.'
    await load()
  } catch (e) { error.value = e.message }
}
async function reset() {
  if (!confirm('Go back to the built-in banner images for this slot?')) return
  try {
    await api(`/admin/banners/${slot.value}`, { method: 'DELETE' })
    msg.value = 'Reset to built-in images.'
    await load()
  } catch (e) { error.value = e.message }
}
onMounted(load)
</script>

<template>
  <h2>Banners</h2>
  <div class="row" style="margin-bottom: 16px">
    <button v-for="s in SLOTS" :key="s.id" class="btn" :class="{ primary: slot === s.id }" @click="pick(s.id)">
      {{ s.label }}<span v-if="saved[s.id]"> ●</span>
    </button>
  </div>

  <div class="card">
    <p class="muted" style="margin-top: 0">
      {{ isCustom ? 'This slot uses your custom slides.' : 'This slot uses the built-in images. Add slides to replace them.' }}
      Mobile image ≈ 3:2 (e.g. 1200×800). Desktop image ≈ 3:1 (e.g. 1920×640), optional.
    </p>

    <div v-for="(s, i) in slides" :key="i" class="card" style="background: var(--bg)">
      <div class="row" style="align-items: flex-start; gap: 16px">
        <div>
          <div class="muted">Mobile</div>
          <img v-if="s.image" :src="previewUrl(s.image)" class="thumb" alt="" />
          <div v-else class="thumb"></div>
        </div>
        <div>
          <div class="muted">Desktop</div>
          <img v-if="s.desktopImage" :src="previewUrl(s.desktopImage)" class="thumb wide" alt="" />
          <div v-else class="thumb wide"></div>
        </div>
        <div style="flex: 1; min-width: 240px; display: grid; gap: 8px">
          <label>Mobile image URL (required)
            <input v-model="s.image" placeholder="https://…" />
          </label>
          <label>Desktop image URL (optional)
            <input v-model="s.desktopImage" placeholder="https://…" />
          </label>
          <div class="row">
            <label style="flex: 1">Alt text<input v-model="s.alt" placeholder="Describe the banner" /></label>
            <label style="flex: 1">Link when clicked (optional)<input v-model="s.link" placeholder="/sales or https://…" /></label>
          </div>
        </div>
        <div style="display: grid; gap: 6px">
          <button class="btn" :disabled="i === 0" @click="move(i, -1)">↑</button>
          <button class="btn" :disabled="i === slides.length - 1" @click="move(i, 1)">↓</button>
          <button class="btn danger" @click="slides.splice(i, 1)">Remove</button>
        </div>
      </div>
    </div>

    <div class="row">
      <button class="btn" @click="add">+ Add slide</button>
      <button class="btn primary" @click="save">Save banners</button>
      <button v-if="isCustom" class="btn danger" @click="reset">Reset to built-in</button>
    </div>
    <p v-if="msg" style="color: var(--ok)">{{ msg }}</p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>
