<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'

const form = ref({ free_delivery_min_spend: 0, delivery_fee: 0 })
const msg = ref('')
const error = ref('')
const loaded = ref(false)
onMounted(async () => {
  try { form.value = await api('/admin/settings') } catch (e) { error.value = e.message } finally { loaded.value = true }
})
async function save() {
  error.value = ''
  msg.value = ''
  try {
    form.value = await api('/admin/settings', {
      method: 'PUT',
      body: { free_delivery_min_spend: Number(form.value.free_delivery_min_spend), delivery_fee: Number(form.value.delivery_fee) },
    })
    msg.value = 'Saved. The store uses the new values right away.'
  } catch (e) { error.value = e.message }
}
</script>

<template>
  <div class="page-head">
    <h1>Delivery</h1>
  </div>

  <form class="card" style="max-width: 560px" @submit.prevent="save">
    <div class="card-head"><h3>Delivery fees</h3></div>
    <div v-if="!loaded" class="loader" role="status">Loading settings…</div>
    <div v-else class="card-body stack">
      <label class="field">Free delivery from
        <div class="affix"><input v-model="form.free_delivery_min_spend" type="number" step="0.001" min="0" required /><span>OMR</span></div>
        <span class="hint">Orders at or above this amount, after discounts, ship free. Set to 0 to make delivery always free.</span>
      </label>
      <label class="field">Delivery fee
        <div class="affix"><input v-model="form.delivery_fee" type="number" step="0.001" min="0" required /><span>OMR</span></div>
        <span class="hint">Charged on orders below the free delivery amount.</span>
      </label>
      <p v-if="msg" class="success" style="margin: 0">{{ msg }}</p>
      <p v-if="error" class="error" style="margin: 0">{{ error }}</p>
    </div>
    <div class="card-foot" style="justify-content: flex-end">
      <button class="btn primary" :disabled="!loaded">Save</button>
    </div>
  </form>
</template>

<style scoped>
.affix { position: relative; display: flex; }
.affix input { width: 100%; padding-right: 52px; }
.affix span { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); font-weight: 400; pointer-events: none; }
</style>
