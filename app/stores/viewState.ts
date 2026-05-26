import { defineStore } from 'pinia'
import { computed, markRaw, ref, type Component } from 'vue'
import View0Onboarding from '~/components/views/View0Onboarding.vue'
import View1Explanation from '~/components/views/View1Explanation.vue'
import View2Disperse from '~/components/views/View2Disperse.vue'
import View3Transition from '~/components/views/View3Transition.vue'
import View4Relational from '~/components/views/View4Relational.vue'
import type { ViewState } from '~/types/interaction'

export type Phase = 'ONBOARDING' | 'EXPLANATION' | 'ENTRY' | 'TRANSITION' | 'RELATIONAL'

const VIEW_ORDER: readonly ViewState[] = ['VIEW_0', 'VIEW_1', 'VIEW_2', 'VIEW_3', 'VIEW_4'] as const

const REGISTRY: Record<ViewState, Component> = {
  VIEW_0: markRaw(View0Onboarding),
  VIEW_1: markRaw(View1Explanation),
  VIEW_2: markRaw(View2Disperse),
  VIEW_3: markRaw(View3Transition),
  VIEW_4: markRaw(View4Relational),
}

const PHASE_BY_VIEW: Record<ViewState, Phase> = {
  VIEW_0: 'ONBOARDING',
  VIEW_1: 'EXPLANATION',
  VIEW_2: 'ENTRY',
  VIEW_3: 'TRANSITION',
  VIEW_4: 'RELATIONAL',
}

export const useViewStateStore = defineStore('viewState', () => {
  const current = ref<ViewState>('VIEW_0')
  const activeComponent = computed(() => REGISTRY[current.value])

  function is(p: Phase) {
    return PHASE_BY_VIEW[current.value] === p
  }

  function advance() {
    const i = VIEW_ORDER.indexOf(current.value)
    if (i < 0 || i >= VIEW_ORDER.length - 1) return
    current.value = VIEW_ORDER[i + 1]!
  }

  function goTo(name: ViewState) {
    if (VIEW_ORDER.includes(name)) current.value = name
  }

  return { current, activeComponent, order: VIEW_ORDER, is, advance, goTo }
})
