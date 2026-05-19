<script setup lang="ts">
import { computed, watch } from 'vue'
import { useInteractionStore } from '~/stores/interaction'

const props = defineProps<{
  componentId: string
  label: string
  position?: 'tl' | 'tr' | 'bl' | 'br'
}>()
const store = useInteractionStore()

const centralImageId = computed(() => store.activeCentralImageId)

const { data, pending, error, refresh } = await useFetch<{
  componentId: string
  centralImageId: string
  related: string[]
}>(() => `/api/relations/${props.componentId}`, {
  query: computed(() => ({ centralImageId: centralImageId.value ?? '' })),
  watch: [centralImageId],
  immediate: !!centralImageId.value,
})

watch(centralImageId, (v) => {
  if (v) refresh()
})

const cells = computed(() => (data.value?.related ?? []).slice(0, 4))

function onRelatedClick(id: string) {
  store.activateCentral(id)
}
</script>

<template>
  <article class="rel" :data-position="position ?? 'tl'">
    <span class="quarter-tag">{{ label }}</span>

    <div v-if="!centralImageId" class="status">no central image</div>
    <div v-else-if="pending" class="status">querying…</div>
    <div v-else-if="error" class="status error">error</div>

    <div v-else class="constellation">
      <button
        v-for="(id, i) in cells"
        :key="id"
        :class="['cell', `cell-${i + 1}`]"
        :title="id"
        @click="onRelatedClick(id)"
      >
        {{ id }}
      </button>
    </div>
  </article>
</template>

<style scoped>
.rel {
  position: relative;
  background: #131316;
  overflow: hidden;
  transition: background-color 180ms ease-out;
}
.rel:hover {
  background: #16161c;
}

.quarter-tag {
  position: absolute;
  font-family: monospace;
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  color: #4a4a52;
  padding: 0.75rem 0.95rem;
  pointer-events: none;
  text-transform: uppercase;
  z-index: 2;
}
.rel[data-position="tl"] .quarter-tag { top: 0; left: 0; }
.rel[data-position="tr"] .quarter-tag { top: 0; right: 0; }
.rel[data-position="bl"] .quarter-tag { bottom: 0; left: 0; }
.rel[data-position="br"] .quarter-tag { bottom: 0; right: 0; }

.status {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: monospace;
  font-size: 0.65rem;
  color: #444;
  letter-spacing: 0.1em;
  pointer-events: none;
}
.status.error { color: #855; }

.constellation {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.cell {
  position: absolute;
  width: 5.4rem;
  height: 5.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.4rem;
  border: 1px solid #2a2a2e;
  background: rgba(20, 20, 26, 0.7);
  font-family: monospace;
  font-size: 0.6rem;
  color: #a8a8b0;
  text-align: center;
  word-break: break-all;
  cursor: pointer;
  opacity: 0.05;
  pointer-events: none;
  transition:
    opacity 260ms ease-out,
    transform 200ms ease-out,
    box-shadow 200ms ease-out,
    border-color 200ms ease-out,
    color 200ms ease-out;
  box-sizing: border-box;
}

/* component hover → constellation reveals */
.rel:hover .cell {
  opacity: 0.85;
  pointer-events: auto;
}

/* per-cell focus amplification */
.rel:hover .cell:hover,
.rel:hover .cell:focus-visible {
  opacity: 1;
  transform: scale(1.1);
  border-color: #7a7a85;
  color: #f0f0f4;
  box-shadow: 0 0 22px 2px rgba(200, 200, 220, 0.18);
  outline: none;
  z-index: 3;
}

/* siblings of focused cell soften */
.rel:hover:has(.cell:hover) .cell:not(:hover),
.rel:hover:has(.cell:focus-visible) .cell:not(:focus-visible) {
  opacity: 0.45;
}

/* ── constellation positions (asymmetric, mirrored per corner) ── */
/* top-left quadrant */
.rel[data-position="tl"] .cell-1 { top: 20%; left: 14%; }
.rel[data-position="tl"] .cell-2 { top: 10%; left: 52%; }
.rel[data-position="tl"] .cell-3 { top: 48%; left: 26%; }
.rel[data-position="tl"] .cell-4 { top: 60%; left: 58%; }

/* top-right quadrant — horizontal mirror */
.rel[data-position="tr"] .cell-1 { top: 20%; right: 14%; }
.rel[data-position="tr"] .cell-2 { top: 10%; right: 52%; }
.rel[data-position="tr"] .cell-3 { top: 48%; right: 26%; }
.rel[data-position="tr"] .cell-4 { top: 60%; right: 58%; }

/* bottom-left quadrant — vertical mirror */
.rel[data-position="bl"] .cell-1 { bottom: 20%; left: 14%; }
.rel[data-position="bl"] .cell-2 { bottom: 10%; left: 52%; }
.rel[data-position="bl"] .cell-3 { bottom: 48%; left: 26%; }
.rel[data-position="bl"] .cell-4 { bottom: 60%; left: 58%; }

/* bottom-right quadrant — both mirrors */
.rel[data-position="br"] .cell-1 { bottom: 20%; right: 14%; }
.rel[data-position="br"] .cell-2 { bottom: 10%; right: 52%; }
.rel[data-position="br"] .cell-3 { bottom: 48%; right: 26%; }
.rel[data-position="br"] .cell-4 { bottom: 60%; right: 58%; }
</style>
