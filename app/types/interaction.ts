export type ViewState = 'VIEW_1' | 'VIEW_2' | 'VIEW_3'

export type ImageId = string

export interface RelationResult {
  componentId: string
  centralImageId: ImageId
  related: ImageId[]
}
