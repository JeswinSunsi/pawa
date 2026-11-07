<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  // [{ key, label, tip, value }]
  data: { type: Array, required: true },
  format: { type: Function, default: (v) => String(v) },
  tickFormat: { type: Function, default: null },
  height: { type: Number, default: 240 },
})

const wrap = ref(null)
const width = ref(600)
let ro
onMounted(() => {
  ro = new ResizeObserver(([e]) => (width.value = e.contentRect.width))
  ro.observe(wrap.value)
})
onBeforeUnmount(() => ro?.disconnect())

const pad = { top: 12, right: 4, bottom: 26, left: 56 }
const innerW = computed(() => Math.max(0, width.value - pad.left - pad.right))
const innerH = computed(() => props.height - pad.top - pad.bottom)

function niceStep(max, count) {
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const n = raw / mag
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag
}
const scale = computed(() => {
  const max = Math.max(0, ...props.data.map((d) => d.value))
  if (!max) return { max: 4, ticks: [0, 1, 2, 3, 4] }
  const step = niceStep(max, 4)
  const top = Math.ceil(max / step) * step
  const ticks = []
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v)
  return { max: top, ticks }
})
const y = (v) => pad.top + innerH.value - (v / scale.value.max) * innerH.value

const slot = computed(() => innerW.value / Math.max(1, props.data.length))
const barW = computed(() => Math.min(slot.value, Math.max(2, Math.min(28, slot.value - 2))))
const bars = computed(() =>
  props.data.map((d, i) => {
    const x = pad.left + i * slot.value + (slot.value - barW.value) / 2
    const top = y(d.value)
    const h = pad.top + innerH.value - top
    return { ...d, i, x, top, h }
  }),
)
// Pick ~6 evenly spaced x labels so they never collide.
const xLabels = computed(() => {
  const n = props.data.length
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW.value / 70))))
  return bars.value.filter((b) => b.i % every === 0)
})
const fmtTick = (v) => (props.tickFormat || props.format)(v)

// Rounded top corners only, flat at the baseline.
function barPath(b) {
  if (b.h <= 0) return ''
  const r = Math.min(4, barW.value / 2, b.h)
  const { x, top, h } = b
  const w = barW.value
  return `M${x},${top + h}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${top + h}Z`
}

const hover = ref(null)
const tipStyle = computed(() => {
  if (!hover.value) return {}
  const b = hover.value
  const cx = b.x + barW.value / 2
  const left = Math.min(Math.max(cx, 70), width.value - 70)
  return { left: left + 'px', top: Math.max(0, b.top - 8) + 'px' }
})
</script>

<template>
  <div ref="wrap" class="chart" :style="{ height: height + 'px' }" @mouseleave="hover = null">
    <svg width="100%" :height="height" role="img">
      <g>
        <template v-for="t in scale.ticks" :key="t">
          <line :x1="pad.left" :x2="width - pad.right" :y1="y(t)" :y2="y(t)" class="grid" :class="{ base: t === 0 }" />
          <text :x="pad.left - 10" :y="y(t)" dy="0.32em" text-anchor="end" class="tick">{{ fmtTick(t) }}</text>
        </template>
      </g>
      <g>
        <text v-for="b in xLabels" :key="'l' + b.key" :x="b.x + barW / 2" :y="height - 6" text-anchor="middle" class="tick">{{ b.label }}</text>
      </g>
      <g>
        <path v-for="b in bars" :key="b.key" :d="barPath(b)" class="bar" :class="{ dim: hover && hover.key !== b.key }" />
      </g>
      <!-- hit targets: the full column, wider than the bar -->
      <rect
        v-for="b in bars" :key="'h' + b.key"
        :x="pad.left + b.i * slot" :y="pad.top" :width="slot" :height="innerH"
        fill="transparent" @mouseenter="hover = b" @click="hover = b"
      />
    </svg>
    <div v-if="hover" class="tip" :style="tipStyle">
      <div class="tip-label">{{ hover.tip || hover.label }}</div>
      <div class="tip-value num">{{ format(hover.value) }}</div>
      <div v-if="hover.extra" class="tip-label">{{ hover.extra }}</div>
    </div>
  </div>
</template>

<style scoped>
.chart { position: relative; width: 100%; }
svg { display: block; overflow: visible; }
.grid { stroke: var(--line-soft); stroke-width: 1; }
.grid.base { stroke: var(--line); }
.tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.bar { fill: var(--chart); transition: opacity .12s; }
.bar.dim { opacity: .35; }
.tip {
  position: absolute; transform: translate(-50%, -100%); pointer-events: none; background: var(--panel);
  border: 1px solid var(--line); border-radius: 8px; padding: 7px 10px; box-shadow: 0 4px 14px rgba(16, 24, 40, .1);
  white-space: nowrap; font-size: 12px;
}
.tip-label { color: var(--muted); }
.tip-value { font-weight: 600; font-size: 13px; color: var(--text); }
</style>
