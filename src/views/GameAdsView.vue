<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, previewUrl } from '../api'

// Ads shown in the game when a player taps "Play again" (porodo GET /ads/game picks one active ad at random).
const ads = ref([])
const savedJson = ref('[]')
const error = ref('')
const msg = ref('')
const saving = ref(false)
const loaded = ref(false)
const activeCount = computed(() => ads.value.filter((a) => a.active && a.image.trim()).length)
const dirty = computed(() => JSON.stringify(ads.value) !== savedJson.value)

const blank = () => ({ image: '', link: '', alt: '', active: true })
const draft = ref(blank())
const addError = ref('')
const adding = ref(false)

async function load() {
  try {
    const data = await api('/admin/game-ads')
    ads.value = data.ads.map((a) => ({ image: a.image || '', link: a.link || '', alt: a.alt || '', active: a.active !== false }))
    savedJson.value = JSON.stringify(ads.value)
  } catch (e) { error.value = e.message } finally { loaded.value = true }
}
function move(i, d) {
  const j = i + d
  if (j < 0 || j >= ads.value.length) return
  const list = ads.value
  ;[list[i], list[j]] = [list[j], list[i]]
}
function clean(list) {
  return list
    .filter((a) => a.image.trim())
    .map((a) => ({ image: a.image.trim(), link: a.link.trim() || null, alt: a.alt.trim(), active: a.active }))
}
async function put(list) {
  const body = clean(list)
  await api('/admin/game-ads', { method: 'PUT', body: { ads: body } })
  const live = body.filter((a) => a.active).length
  msg.value = live ? `Saved. ${live} active ad${live === 1 ? '' : 's'}, one picked at random after each game.` : 'Saved. No active ads: Play again starts the game straight away.'
  await load()
}
async function save() {
  error.value = ''
  msg.value = ''
  saving.value = true
  try { await put(ads.value) } catch (e) { error.value = e.message } finally { saving.value = false }
}
// Creating an ad saves straight away. Unsaved edits on the right are saved with it.
async function create() {
  if (adding.value || saving.value) return
  addError.value = ''
  msg.value = ''
  if (!draft.value.image.trim()) {
    addError.value = 'Add an image URL.'
    return
  }
  adding.value = true
  try {
    await put([...ads.value, { ...draft.value }])
    draft.value = blank()
  } catch (e) { addError.value = e.message } finally { adding.value = false }
}
onMounted(load)
</script>

<template>
  <div class="page-head">
    <h1>Game ads</h1>
  </div>

  <div class="split">
    <form class="card" @submit.prevent="create">
      <div class="card-head"><h3>New ad</h3></div>
      <div class="card-body stack">
        <div class="new-preview">
          <img v-if="draft.image.trim()" :src="previewUrl(draft.image.trim())" class="ad-thumb" alt="" />
          <div v-else class="ad-thumb empty-thumb">Preview</div>
          <div class="notice small">Portrait or square images work best on phones (e.g. 1080×1350 or 1080×1080).</div>
        </div>
        <label class="field">Image URL<input v-model="draft.image" placeholder="https://…" required /></label>
        <label class="field"><span>Link <span class="hint">(optional)</span></span><input v-model="draft.link" placeholder="/sales or https://…" /></label>
        <label class="field">Alt text<input v-model="draft.alt" placeholder="Describe the ad" /></label>
        <p v-if="addError" class="error" style="margin: 0">{{ addError }}</p>
      </div>
      <div class="card-foot">
        <label class="check"><input v-model="draft.active" type="checkbox" /> Active</label>
        <button class="btn primary" :disabled="adding || saving || !loaded">{{ adding ? 'Adding…' : 'Add ad' }}</button>
      </div>
    </form>

    <section class="card">
      <div class="card-head">
        <div>
          <h3>Play again ads<span v-if="loaded" class="count num">{{ ads.length }}</span></h3>
          <div class="muted small" style="margin-top: 2px">{{ loaded ? `${activeCount} active, one shown at random after each game` : ' ' }}</div>
        </div>
      </div>

      <div class="card-body stack">
        <div v-for="(a, i) in ads" :key="i" class="ad" :class="{ off: !a.active }">
          <img v-if="a.image" :src="previewUrl(a.image)" class="ad-thumb" alt="" />
          <div v-else class="ad-thumb"></div>
          <div class="ad-fields">
            <label class="field">Image URL<input v-model="a.image" placeholder="https://…" /></label>
            <div class="two">
              <label class="field"><span>Link <span class="hint">(optional)</span></span><input v-model="a.link" placeholder="/sales or https://…" /></label>
              <label class="field">Alt text<input v-model="a.alt" placeholder="Describe the ad" /></label>
            </div>
            <label class="check"><input v-model="a.active" type="checkbox" /> Active</label>
          </div>
          <div class="ad-actions">
            <button class="btn icon" title="Move up" :disabled="i === 0" @click="move(i, -1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6" /></svg>
            </button>
            <button class="btn icon" title="Move down" :disabled="i === ads.length - 1" @click="move(i, 1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <button class="btn icon danger" title="Remove" @click="ads.splice(i, 1)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
            </button>
          </div>
        </div>

        <div v-if="!loaded" class="loader" role="status">Loading ads…</div>
        <div v-else-if="!ads.length" class="empty" style="padding: 24px">No ads. Play again starts the game straight away.</div>

        <p v-if="msg" class="success" style="margin: 0">{{ msg }}</p>
        <p v-if="error" class="error" style="margin: 0">{{ error }}</p>
      </div>

      <div v-if="loaded && (ads.length || dirty)" class="card-foot">
        <span class="muted small">{{ dirty ? 'You have unsaved changes.' : 'All changes saved.' }}</span>
        <div class="row">
          <button v-if="dirty" class="btn" :disabled="saving" @click="load">Discard</button>
          <button class="btn primary" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : 'Save changes' }}</button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ad { display: grid; grid-template-columns: 96px minmax(0, 1fr) auto; gap: 14px; align-items: start; border: 1px solid var(--line); border-radius: 10px; padding: 14px; }
.ad.off .ad-thumb { opacity: .45; }
.ad-thumb { width: 96px; aspect-ratio: 4/5; object-fit: cover; border-radius: 8px; border: 1px solid var(--line); background: var(--hover); display: block; }
.ad-fields { display: grid; gap: 10px; min-width: 0; }
.two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.ad-actions { display: grid; gap: 6px; }
.new-preview { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 14px; align-items: start; }
.empty-thumb { display: grid; place-items: center; font-size: 12px; color: var(--muted); }
@media (max-width: 1200px) {
  .two { grid-template-columns: 1fr; }
}
@media (max-width: 1000px) {
  .two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .ad { grid-template-columns: 96px minmax(0, 1fr); gap: 12px; padding: 12px; }
  .ad-fields { grid-column: 1 / -1; }
  .ad-actions { grid-column: 2; grid-row: 1; display: flex; justify-content: flex-end; align-self: start; }
  .two { grid-template-columns: 1fr; }
}
</style>
