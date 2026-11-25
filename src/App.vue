<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { api, token, setToken, newCounts, refreshNewCounts } from './api'
import DashboardView from './views/DashboardView.vue'
import OrdersView from './views/OrdersView.vue'
import SupportView from './views/SupportView.vue'
import StockRequestsView from './views/StockRequestsView.vue'
import PromosView from './views/PromosView.vue'
import BannersView from './views/BannersView.vue'
import GameAdsView from './views/GameAdsView.vue'
import ProductListView from './views/ProductListView.vue'
import ProductsFileView from './views/ProductsFileView.vue'
import SettingsView from './views/SettingsView.vue'
import logo from './assets/msouq-logo.png'

// Icon paths are 24x24 stroke icons.
const tabs = {
  dashboard: { label: 'Dashboard', view: DashboardView, icon: 'M3 3v18h18M7 16v-4M12 16V8M17 16v-7' },
  orders: { label: 'Orders', view: OrdersView, icon: 'M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0' },
  support: { label: 'Support', view: SupportView, icon: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' },
  stockRequests: { label: 'Notify me', view: StockRequestsView, icon: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0' },
  promos: { label: 'Promo codes', view: PromosView, icon: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01' },
  productsFile: { label: 'Inventory', view: ProductsFileView, icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h6' },
  sales: {
    label: 'Sales page', view: ProductListView, icon: 'M19 5 5 19M6.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17.5 20a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
    props: {
      list: 'sales', title: 'Sales page', where: 'On the Sales page', warnNoDiscount: true,
      notice: 'The first 4 appear as Trending Deals on the home page (and as suggestions in the cart). On the Sales page, the product with the biggest discount is featured at the top.',
      emptyText: 'No products. The Sales page shows its empty message and the home page has no Trending Deals.',
      cutoff: { count: 4, label: 'Trending Deals shows the products above' },
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
      titlePlaceholderAr: 'مختارات لك',
      emptyText: 'No products. The custom row is hidden on the home page and /custom shows "No products found".',
      cutoff: { count: 10, label: 'The home page row shows the products above' },
      banners: { only: 'custom', onlyLabel: 'Banners on the /custom page', fallback: 'an empty black banner' },
    },
  },
  banners: { label: 'Banners', view: BannersView, icon: 'M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6' },
  gameAds: { label: 'Game ads', view: GameAdsView, icon: 'M6 11h4M8 9v4M15 12h.01M18 10h.01M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.1A3 3 0 0 0 5 18c1 0 1.9-.5 2.4-1.3L9 15h6l1.6 1.7c.5.8 1.4 1.3 2.4 1.3a3 3 0 0 0 3-3.3l-.7-6.1A4 4 0 0 0 17.3 5z' },
  settings: { label: 'Delivery', view: SettingsView, icon: 'M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z' },
}
const saved = localStorage.getItem('adminTab')
const tab = ref(tabs[saved] ? saved : 'dashboard')
watch(tab, (v) => localStorage.setItem('adminTab', v))

// The sidebar is always shown on wide screens; on narrow screens it slides in from the menu button.
const menuOpen = ref(false)
function select(key) {
  tab.value = key
  menuOpen.value = false
}
function onKey(e) { if (e.key === 'Escape') menuOpen.value = false }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// Red badges on Orders and Support for items still in the "new" state.
const badge = (n) => (n > 9 ? '9+' : String(n))
const anyNew = computed(() => newCounts.value.orders > 0 || newCounts.value.support > 0)
let countsTimer
onMounted(() => { refreshNewCounts(); countsTimer = setInterval(refreshNewCounts, 60000) })
onBeforeUnmount(() => clearInterval(countsTimer))
watch(token, (v) => { if (v) refreshNewCounts() })
watch(tab, () => refreshNewCounts())

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
    <header class="mobilebar">
      <button class="menu-btn" aria-label="Open menu" :aria-expanded="menuOpen" aria-controls="sidebar" @click="menuOpen = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        <i v-if="anyNew" class="menu-dot" />
      </button>
      <div class="brand"><img :src="logo" alt="MSouq" width="123" height="36" /><span>Admin</span></div>
      <span class="mobilebar-title">{{ tabs[tab].label }}</span>
    </header>

    <Transition name="fade"><div v-if="menuOpen" class="sidebar-backdrop" @click="menuOpen = false" /></Transition>

    <aside id="sidebar" class="sidebar" :class="{ open: menuOpen }">
      <div class="sidebar-head">
        <div class="brand"><img :src="logo" alt="MSouq" width="123" height="36" /><span>Admin</span></div>
        <button class="menu-btn" aria-label="Close menu" @click="menuOpen = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      </div>
      <nav class="nav" aria-label="Admin">
        <button v-for="(t, key) in tabs" :key="key" class="nav-item" :class="{ on: tab === key }" :aria-current="tab === key ? 'page' : undefined" @click="select(key)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="t.icon" /></svg>
          <span>{{ t.label }}</span>
          <b v-if="newCounts[key] > 0" class="nav-badge" :aria-label="`${newCounts[key]} new`">{{ badge(newCounts[key]) }}</b>
        </button>
      </nav>
      <div class="account">
        <button class="signout" @click="setToken('')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          Sign out
        </button>
      </div>
    </aside>

    <main><div class="page"><component :is="tabs[tab].view" :key="tab" v-bind="tabs[tab].props" /></div></main>
  </div>
</template>

<style scoped>
.login { display: grid; place-items: center; min-height: 100vh; min-height: 100dvh; padding: 16px; }
.login-card { width: 100%; max-width: 360px; padding: 28px; margin: 0; }
.login-card .brand { padding: 0 0 24px; }
</style>
