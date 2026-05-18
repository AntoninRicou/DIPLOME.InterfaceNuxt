import type { ImageId, ViewState } from '~/types/interaction'

interface BaseEvent {
  clientTimestamp: number
}

export interface ViewAdvanceEvent extends BaseEvent {
  type: 'view_advance'
  from: ViewState
  to: ViewState
}

export interface CentralActivateEvent extends BaseEvent {
  type: 'central_activate'
  imageId: ImageId
  source: 'initial' | 'related'
  historyIndex: number
}

export interface HistoryStepBackEvent extends BaseEvent {
  type: 'history_step_back'
  fromIndex: number
  toIndex: number
  toImageId: ImageId
}

export interface HistoryStepForwardEvent extends BaseEvent {
  type: 'history_step_forward'
  fromIndex: number
  toIndex: number
  toImageId: ImageId
}

export interface HistoryJumpEvent extends BaseEvent {
  type: 'history_jump'
  fromIndex: number
  toIndex: number
  toImageId: ImageId
}

export interface OverviewConfirmEvent extends BaseEvent {
  type: 'overview_confirm'
  imageId: ImageId
  historyIndex: number
}

export type InteractionEvent =
  | ViewAdvanceEvent
  | CentralActivateEvent
  | HistoryStepBackEvent
  | HistoryStepForwardEvent
  | HistoryJumpEvent
  | OverviewConfirmEvent

export type InteractionEventType = InteractionEvent['type']

export interface LoggedInteractionEvent {
  sessionId: string
  serverTimestamp: number
  event: InteractionEvent
}
