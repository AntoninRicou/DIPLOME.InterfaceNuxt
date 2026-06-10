// Interpretation layer — descriptive metadata for each of the four
// relation components (Source / Form / Semantic / Time). Pure data:
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

// Centred image-credit shown in interpretation mode (VIEW_4 `+` toggle):
// the three-line provenance note rendered at viewport centre. Single source
// of truth — the interface renders these lines in `.interpret-message`, and
// the store mirrors them onto the project canvas's `#center-caption` (joined
// with newlines) so both screens show the credit together, exactly like the
// per-quadrant `set-canvas-text` mirror. The last line (URL) is rendered at
// 80% opacity on the interface.
export const IMAGE_CREDIT_LINES: readonly string[] = [
  'Images digitized from historical books (18th–20th century) via the Internet Archive.',
  'Extracted and redistributed through the Internet Archive Book Images dataset on Flickr.',
  'https://www.flickr.com/photos/internetarchivebookimages/',
]

export const view3Interpretations: Record<View3ComponentId, View3Interpretation> = {
  // Bodies break the line before "through" (\n) — honoured on the project via
  // `white-space: pre-line` on `.canvas-text-body`; the interface collapses the
  // \n to a space (default white-space), so only the project breaks.
  component_1: {
    title: 'Source tracing',
    body:
      'Images connected through book and subject context around the selected image.',
  },
  component_2: {
    title: 'Form mirroring',
    body:
      'Images connected through visual similarity and composition around the selected image.',
  },
  component_3: {
    title: 'Semantic shifting',
    body:
      'Images connected through interpreted meanings and language around the selected image.',
  },
  component_4: {
    title: 'Time drifting',
    body:
      'Images connected through time-based relationships around the selected image.',

  }
}
