<script setup>
import { ref, watch } from 'vue'
import OrdersAnalytics from '../components/OrdersAnalytics.vue'

const RANGES = [7, 30, 90]

const savedRange = Number(localStorage.getItem('adminRange'))
const days = ref(RANGES.includes(savedRange) ? savedRange : 30)
watch(days, (v) => localStorage.setItem('adminRange', v))
const version = ref(0)
</script>

<template>
  <div class="page-head">
    <h1>Dashboard</h1>
    <div class="row period-controls">
      <div class="seg">
        <button v-for="r in RANGES" :key="r" :class="{ on: days === r }" :aria-pressed="days === r" @click="days = r">{{ r }} days</button>
      </div>
      <button class="btn icon" title="Refresh" @click="version++">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" /></svg>
      </button>
    </div>
  </div>

  <OrdersAnalytics :days="days" :version="version" />
</template>

<style scoped>
@media (max-width: 700px) {
  .period-controls { gap: 6px; }
  .period-controls .seg button { padding-inline: 10px; }
}
</style>
