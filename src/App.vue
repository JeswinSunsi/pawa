<script setup>
import { ref, watch } from 'vue'
import { api, token, setToken } from './api'
import DashboardView from './views/DashboardView.vue'
import OrdersView from './views/OrdersView.vue'
import PromosView from './views/PromosView.vue'
import BannersView from './views/BannersView.vue'
import GameAdsView from './views/GameAdsView.vue'
import ProductListView from './views/ProductListView.vue'
import SettingsView from './views/SettingsView.vue'
import logo from './assets/msouq-logo.png'

// Icon paths are 24x24 stroke icons.
const tabs = {
  dashboard: { label: 'Dashboard', view: DashboardView, icon: 'M3 3v18h18M7 16v-4M12 16V8M17 16v-7' },
  orders: { label: 'Orders', view: OrdersView, icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0' },
  promos: { label: 'Promo codes', view: PromosView, icon: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01' },
  sales: {
    label: 'Sales page', view: ProductListView, icon: 'M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    props: {
      list: 'sales', title: 'Sales page', where: 'On the Sales page', warnNoDiscount: true,
      notice: 'The first 8 appear as Trending Deals on the home page (and as suggestions in the cart). On the Sales page, the product with the biggest discount is featured at the top.',
      emptyText: 'No products. The Sales page shows its empty message and the home page has no Trending Deals.',
      cutoff: { count: 8, label: 'Trending Deals shows the products above' },
    },
  },
  limited: {
    label: 'Limited stock', view: ProductListView, icon: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    props: {
      list: 'limited-stock', title: 'Limited stock', where: 'In Limited Stock',
      notice: 'The "Limited Stock" section on the home page, shown in this order. It shows 4 per row on desktop and 2 on phones, so a multiple of 4 fills the rows evenly.',
      emptyText: 'No products. The Limited Stock section on the home page will be empty.',
    },
  },
  custom: {
    label: 'Custom row', view: ProductListView, icon: 'M3 6h18M3 12h18M3 18h12M19 15l3 3-3 3',
    props: {
      list: 'custom', title: 'Custom row', where: 'In the custom row', titled: true,
      titlePlaceholder: 'Picked for You (used when left blank)',
      notice: 'A side-scrolling row on the home page, under Trending Deals. The first 10 show there; its "View all" opens /custom, which lists every product here like the Sales page. The title is shown as typed in every language.',
      emptyText: 'No products. The custom row is hidden on the home page and /custom shows "No products found".',
      cutoff: { count: 10, label: 'The home page row shows the products above' },
    },
  },
  banners: { label: 'Banners', view: BannersView, icon: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6' },
  gameAds: { label: 'Game ads', view: GameAdsView, icon: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.1A3 3 0 0 0 5 18c1 0 1.9-.5 2.4-1.3L9 15h6l1.6 1.7c.5.8 1.4 1.3 2.4 1.3a3 3 0 0 0 3-3.3l-.7-6.1A4 4 0 0 0 17.3 5z' },
  settings: { label: 'Delivery', view: SettingsView, icon: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
}
const saved = localStorage.getItem('adminTab')
const tab = ref(tabs[saved] ? saved : 'dashboard')
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
          <button class="signout" @click="setToken('')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            Sign out
          </button>
        </div>
      </div>
    </header>
    <main><div class="page"><component :is="tabs[tab].view" :key="tab" v-bind="tabs[tab].props" /></div></main>
  </div>
</template>

<style scoped>
.login { display: grid; place-items: center; min-height: 100vh; min-height: 100dvh; padding: 16px; }
.login-card { width: 100%; max-width: 360px; padding: 28px; margin: 0; }
.login-card .brand { padding: 0 0 24px; }
</style>
