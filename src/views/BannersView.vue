<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, previewUrl } from '../api'

// Slots match the storefront's home category slugs (porodo/frontend/src/constants/homeCategories.js), in the same order.
const SLOTS = [
  { id: 'all', label: 'Home (All)' },
  { id: 'phones', label: 'Phones' },
  { id: 'tablets', label: 'Tablets' },
  { id: 'power-banks', label: 'Power banks' },
  { id: 'wearables', label: 'Wearables' },
  { id: 'speakers', label: 'Speakers' },
  { id: 'earbuds', label: 'Earbuds' },
  { id: 'gaming', label: 'Gaming' },
  { id: 'chargers', label: 'Chargers' },
]

// Set `only` to edit a single slot inside another tab (no slot list or page heading),
// e.g. the /custom page's banners on the Custom row tab.
const props = defineProps({
  only: { type: String, default: '' },
  onlyLabel: { type: String, default: '' },
  // What the store shows while the slot has no slides.
  fallback: { type: String, default: 'the built-in images' },
})

const saved = ref({})
const slot = ref(props.only || 'all')
const slides = ref([])
const error = ref('')
const msg = ref('')
const loaded = ref(false)
const isCustom = computed(() => !!saved.value[slot.value])

async function load() {
  try {
    saved.value = await api('/admin/banners')
    pick(slot.value)
  } catch (e) { error.value = e.message } finally { loaded.value = true }
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
    msg.value = clean.length ? 'Saved. Live on the store now.' : `Saved with no slides: the store shows ${props.fallback}.`
    await load()
  } catch (e) { error.value = e.message }
}
async function reset() {
  if (!confirm(`Remove these slides and go back to ${props.fallback}?`)) return
  try {
    await api(`/admin/banners/${slot.value}`, { method: 'DELETE' })
    msg.value = `Reset: the store shows ${props.fallback}.`
    await load()
  } catch (e) { error.value = e.message }
}
onMounted(load)
const slotLabel = computed(() => props.onlyLabel || SLOTS.find((s) => s.id === slot.value)?.label)
</script>

<template>
  <div v-if="!only" class="page-head">
    <h1>Banners</h1>
  </div>

  <div class="banners" :class="{ single: only }">
    <nav v-if="!only" class="card slots">
      <button v-for="s in SLOTS" :key="s.id" class="slot" :class="{ on: slot === s.id }" @click="pick(s.id)">
        <span>{{ s.label }}</span>
        <span v-if="saved[s.id]" class="tag">Custom</span>
      </button>
    </nav>

    <div class="card editor">
      <div class="card-head">
        <div>
          <h3>{{ slotLabel }}</h3>
          <div class="muted small" style="margin-top: 2px">{{ !loaded ? ' ' : isCustom ? 'Using your slides' : 'Using ' + fallback }}</div>
        </div>
        <button v-if="isCustom" class="btn sm danger" @click="reset">{{ only ? 'Clear slides' : 'Reset to built-in' }}</button>
      </div>

      <div class="card-body stack">
        <div class="notice">Mobile image about 3:2 (e.g. 1200×800). Desktop image about 3:1 (e.g. 1920×640), optional.</div>

        <div v-for="(s, i) in slides" :key="i" class="slide">
          <div class="slide-index num">{{ i + 1 }}</div>
          <div class="previews">
            <div>
              <div class="muted small">Mobile</div>
              <img v-if="s.image" :src="previewUrl(s.image)" class="thumb" alt="" />
              <div v-else class="thumb"></div>
            </div>
            <div>
              <div class="muted small">Desktop</div>
              <img v-if="s.desktopImage" :src="previewUrl(s.desktopImage)" class="thumb wide" alt="" />
              <div v-else class="thumb wide"></div>
            </div>
          </div>
          <div class="slide-fields">
            <label class="field">Mobile image URL<input v-model="s.image" placeholder="https://…" /></label>
            <label class="field"><span>Desktop image URL <span class="hint">(optional)</span></span><input v-model="s.desktopImage" placeholder="https://…" /></label>
            <div class="two">
              <label class="field">Alt text<input v-model="s.alt" placeholder="Describe the banner" /></label>
              <label class="field"><span>Link <span class="hint">(optional)</span></span><input v-model="s.link" placeholder="/sales or https://…" /></label>
            </div>
          </div>
          <div class="slide-actions">
            <button class="btn icon" title="Move up" :disabled="i === 0" @click="move(i, -1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
            </button>
            <button class="btn icon" title="Move down" :disabled="i === slides.length - 1" @click="move(i, 1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <button class="btn icon danger" title="Remove" @click="slides.splice(i, 1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
            </button>
          </div>
        </div>

        <div v-if="!loaded" class="loader" role="status">Loading banners…</div>
        <div v-else-if="!slides.length" class="empty" style="padding: 24px">No custom slides</div>

        <p v-if="msg" class="success" style="margin: 0">{{ msg }}</p>
        <p v-if="error" class="error" style="margin: 0">{{ error }}</p>
      </div>

      <div class="card-foot">
        <button class="btn" :disabled="!loaded" @click="add">Add slide</button>
        <button class="btn primary" :disabled="!loaded" @click="save">Save banners</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.banners { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; align-items: start; }
.banners.single { grid-template-columns: minmax(0, 1fr); margin-top: 16px; }
.editor { min-width: 0; margin: 0; }
.slots { padding: 6px; display: grid; gap: 2px; margin: 0; }
.slot {
  font: inherit; font-weight: 500; display: flex; align-items: center; justify-content: space-between; gap: 8px;
  border: 0; background: none; text-align: left; padding: 8px 10px; border-radius: 7px; color: var(--text-2); cursor: pointer;
}
.slot:hover { background: var(--hover); color: var(--text); }
.slot.on { background: var(--ink); color: #fff; }
.tag { font-size: 11px; color: var(--accent); background: #eff6ff; padding: 1px 7px; border-radius: 99px; flex-shrink: 0; }
.slide { display: grid; grid-template-columns: 24px auto minmax(220px, 1fr) auto; gap: 16px; align-items: start; border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
.slide-index { width: 24px; height: 24px; border-radius: 6px; background: var(--hover); display: grid; place-items: center; font-size: 12px; font-weight: 600; color: var(--text-2); }
.previews { display: flex; gap: 12px; }
.previews .small { margin-bottom: 4px; }
.slide-fields { display: grid; gap: 10px; min-width: 0; }
.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.slide-actions { display: grid; gap: 6px; }
@media (max-width: 1320px) {
  .slide { grid-template-columns: 24px minmax(0, 1fr) auto; }
  .previews, .slide-fields { grid-column: 2; }
  .slide-actions { grid-row: 1; grid-column: 3; }
  .previews { flex-wrap: wrap; }
  .previews > div, .thumb, .thumb.wide { max-width: 100%; }
}
@media (max-width: 860px) {
  .banners { grid-template-columns: minmax(0, 1fr); }
  .slots { grid-template-columns: repeat(auto-fit, minmax(min(100%, 136px), 1fr)); }
  .slot { min-height: 44px; flex-wrap: wrap; justify-content: flex-start; gap: 2px 8px; }
}
@media (max-width: 640px) {
  .slide { grid-template-columns: minmax(0, 1fr) auto; gap: 12px; padding: 12px; align-items: center; }
  .slide-actions { grid-column: 2; display: flex; }
  .previews, .slide-fields { grid-column: 1 / -1; }
  .previews { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); }
  .two { grid-template-columns: 1fr; }
}
@media (max-width: 360px) {
  .slide-actions { grid-column: 1 / -1; grid-row: auto; }
}
</style>
