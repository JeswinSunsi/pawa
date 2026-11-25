import { ref } from 'vue'

// Production: set VITE_API_URL to the backend URL (and ADMIN_URL on the backend for CORS).
// Development: /api is proxied to the backend by vite.config.js.
export const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export const token = ref(localStorage.getItem('adminToken') || '')

export function setToken(value) {
  token.value = value
  if (value) localStorage.setItem('adminToken', value)
  else localStorage.removeItem('adminToken')
}

export async function api(path, { method = 'GET', body, raw, contentType } = {}) {
  const headers = { Authorization: `Bearer ${token.value}` }
  if (body !== undefined && !raw) headers['Content-Type'] = 'application/json'
  if (contentType) headers['Content-Type'] = contentType
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: raw ? body : body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) setToken('')
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const detail = data?.detail
    const msg = typeof detail === 'string' ? detail
      : Array.isArray(detail) ? detail.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join(', ')
      : data?.message || `Request failed (${res.status})`
    throw new Error(msg)
  }
  return data
}

/** Preview an image link. Site-relative paths are on the storefront. */
export function previewUrl(url) {
  if (!url) return ''
  // Other site-relative paths (e.g. /banners/x.webp) live on the storefront.
  if (url.startsWith('/')) return (import.meta.env.VITE_STORE_URL || 'http://localhost:3000') + url
  return url
}

const omrFormat = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
export const omr = (n) => `${omrFormat.format(Number(n || 0))} OMR`

// Counts of orders and support requests in the "new" state, shown as badges in the sidebar.
export const newCounts = ref({ orders: 0, support: 0 })

export async function refreshNewCounts() {
  if (!token.value) return
  const [stats, support] = await Promise.allSettled([api('/admin/stats'), api('/admin/support?page=1&page_size=1&status=new')])
  if (stats.status === 'fulfilled') newCounts.value.orders = stats.value?.by_status?.new ?? 0
  if (support.status === 'fulfilled') newCounts.value.support = support.value?.by_status?.new ?? 0
}
