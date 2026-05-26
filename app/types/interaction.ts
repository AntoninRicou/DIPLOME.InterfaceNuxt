export type ViewState = 'VIEW_0' | 'VIEW_1' | 'VIEW_2' | 'VIEW_3' | 'VIEW_4'

export type ImageId = string

export interface RelationResult {
  componentId: string
  centralImageId: ImageId
  related: ImageId[]
}
