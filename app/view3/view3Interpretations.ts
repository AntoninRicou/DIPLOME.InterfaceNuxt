// Interpretation layer — descriptive metadata for each of the four
// relation components (Mirror / Trace / Shift / Replay). Pure data:
// no Vue, no DOM, no layout logic.
//
// Shared between VIEW_3 and VIEW_4:
//   - VIEW_3 (TRANSITION) renders this content at each quadrant centre
//     as soon as the user clicks the quadrant's cross — fills in the
//     description of the mode of proximity that canvas just zoomed onto.
//   - VIEW_4 (RELATIONAL) renders the same content inside each
//     RelationComponent's `.interpretation-panel` when the user toggles
//     interpretation mode via the top-centre `+` button.
//
// Keyed by componentId (component_1..4). Positioning of the panel comes
// from the quadrant's data-position attribute in the markup, NOT from
// this file.
//
// `align` is optional. When omitted, the consuming component derives
// alignment from its quadrant (start for tl/bl, end for tr/br).

export type View3ComponentId =
  | 'component_1'
  | 'component_2'
  | 'component_3'
  | 'component_4'

export interface View3Interpretation {
  title: string
  body: string
  align?: 'start' | 'end' | 'center'
}

export const view3Interpretations: Record<View3ComponentId, View3Interpretation> = {
  component_1: {
    title: 'Visual mirroring',
    body:
      'The surrounding image are reflecting recurring visual structures ' +
      'such as shapes, and textures to the selected image.',
  },
  component_2: {
    title: 'Historical tracing',
    body:
      'The surrounding image are retracing a lexical subject field based ' +
      'on historical sources linked to the selected image.',
  },
  component_3: {
    title: 'Semantic shifting',
    body:
      'The surrounding image are sharing a semantic embeddings related ' +
      'to the selected image.',
  },
  component_4: {
    title: 'Collective replaying',
    body:
      'The surrounding image are previous user selections including the ' +
      'selected image. Yours will also contributes to the evolving map.',
  },
}
