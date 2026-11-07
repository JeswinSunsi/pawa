<script setup>
import { ref, watch } from 'vue'
import { api, token, setToken } from './api'
import OrdersView from './views/OrdersView.vue'
import PromosView from './views/PromosView.vue'
import BannersView from './views/BannersView.vue'
import SettingsView from './views/SettingsView.vue'
import logo from './assets/msouq-logo.png'

// Icon paths are 24x24 stroke icons.
const tabs = {
  orders: { label: 'Orders', view: OrdersView, icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0' },
  promos: { label: 'Promo codes', view: PromosView, icon: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01' },
  banners: { label: 'Banners', view: BannersView, icon: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6' },
  settings: { label: 'Delivery', view: SettingsView, icon: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
}
const saved = localStorage.getItem('adminTab')
const tab = ref(tabs[saved] ? saved : 'orders')
watch(tab, (v) => localStorage.setItem('adminTab', v))

const input = ref('')
const loginError = ref('')
const signingIn = ref(false)
async function login() {
  loginError.value = ''
  signingIn.value = true
  setToken(input.value.trim())
  try { await api('/admin/me') } catch (e) { setToken(''); loginError.value = e.message } finally { signingIn.value = false }
}
</script>

<template>
  <div v-if="!token" class="login">
    <form class="card login-card" @submit.prevent="login">
      <div class="brand"><img :src="logo" alt="MSouq" width="123" height="36" /><span>Admin</span></div>
      <label class="field">Admin token
        <input v-model="input" type="password" autocomplete="current-password" autofocus required />
      </label>
      <p v-if="loginError" class="error">{{ loginError }}</p>
      <button class="btn primary" style="margin-top: 16px; width: 100%; padding: 9px" :disabled="signingIn">
        {{ signingIn ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </div>

  <div v-else class="layout">
    <header class="topbar">
      <div class="header-inner">
        <div class="brand"><img :src="logo" alt="MSouq" width="123" height="36" /><span>Admin</span></div>
        <nav class="nav" aria-label="Admin">
          <button v-for="(t, key) in tabs" :key="key" class="nav-item" :class="{ on: tab === key }" :aria-current="tab === key ? 'page' : undefined" @click="tab = key">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="t.icon" /></svg>
            <span>{{ t.label }}</span>
          </button>
        </nav>
        <div class="account">
          <button class="nav-item" @click="setToken('')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            Sign out
          </button>
        </div>
      </div>
    </header>
    <main><div class="page"><component :is="tabs[tab].view" /></div></main>
  </div>
</template>

<style scoped>
.login { display: grid; place-items: center; min-height: 100vh; min-height: 100dvh; padding: 16px; }
.login-card { width: 100%; max-width: 360px; padding: 28px; margin: 0; }
.login-card .brand { padding: 0 0 24px; }
</style>
