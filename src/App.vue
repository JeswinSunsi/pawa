<script setup>
import { ref, watch } from 'vue'
import { api, token, setToken } from './api'
import OrdersView from './views/OrdersView.vue'
import PromosView from './views/PromosView.vue'
import BannersView from './views/BannersView.vue'
import SettingsView from './views/SettingsView.vue'

const tabs = { orders: ['Orders', OrdersView], promos: ['Promo codes', PromosView], banners: ['Banners', BannersView], settings: ['Delivery', SettingsView] }
const tab = ref(localStorage.getItem('adminTab') || 'orders')
watch(tab, (v) => localStorage.setItem('adminTab', v))

const input = ref('')
const loginError = ref('')
async function login() {
  loginError.value = ''
  setToken(input.value.trim())
  try { await api('/admin/me') } catch (e) { setToken(''); loginError.value = e.message }
}
</script>

<template>
  <div v-if="!token" style="display:grid;place-items:center;min-height:100vh;padding:16px">
    <form class="card" style="width:100%;max-width:360px" @submit.prevent="login">
      <h2>MSouq Admin</h2>
      <label>Admin token<input v-model="input" type="password" autocomplete="current-password" autofocus /></label>
      <p v-if="loginError" class="error">{{ loginError }}</p>
      <button class="btn primary" style="margin-top:12px;width:100%">Sign in</button>
    </form>
  </div>
  <div v-else class="layout">
    <nav class="side">
      <h1>MSouq Admin</h1>
      <button v-for="(t, key) in tabs" :key="key" :class="{ on: tab === key }" @click="tab = key">{{ t[0] }}</button>
      <button class="logout" @click="setToken('')">Sign out</button>
    </nav>
    <main><component :is="tabs[tab]?.[1] || OrdersView" /></main>
  </div>
</template>
