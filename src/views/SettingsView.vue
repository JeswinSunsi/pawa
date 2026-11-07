<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../api'

const form = ref({ free_delivery_min_spend: 0, delivery_fee: 0 })
const msg = ref('')
const error = ref('')
onMounted(async () => {
  try { form.value = await api('/admin/settings') } catch (e) { error.value = e.message }
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
  <h2>Delivery</h2>
  <form class="card" style="max-width: 480px" @submit.prevent="save">
    <label>Free delivery minimum spend (OMR)<input v-model="form.free_delivery_min_spend" type="number" step="0.001" min="0" required /></label>
    <p class="muted" style="margin: 4px 0 12px">Orders at or above this amount (after promo discount) get free delivery. Set 0 to make delivery always free.</p>
    <label>Delivery fee below the minimum (OMR)<input v-model="form.delivery_fee" type="number" step="0.001" min="0" required /></label>
    <button class="btn primary" style="margin-top: 16px">Save</button>
    <p v-if="msg" style="color: var(--ok)">{{ msg }}</p>
    <p v-if="error" class="error">{{ error }}</p>
  </form>
</template>
