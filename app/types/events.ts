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

export type InteractionEvent =
  | ViewAdvanceEvent
  | CentralActivateEvent
  | HistoryStepBackEvent
  | HistoryStepForwardEvent
  | HistoryJumpEvent

export type InteractionEventType = InteractionEvent['type']

export interface LoggedInteractionEvent {
  sessionId: string
  serverTimestamp: number
  event: InteractionEvent
}
