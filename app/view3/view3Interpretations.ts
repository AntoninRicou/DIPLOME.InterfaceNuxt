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
  component_1: {
    title: 'Tracing origins',
    body:
      'These images are organized through shared book sources and subject ' +
      'metadata derived from the centered image.',
  },
  component_2: {
    title: 'Mirroring structures',
    body:
      'These images are organized through shared visual structural and ' +
      'compositional relations derived from the centered image.',
  },
  component_3: {
    title: 'Shifting descriptions',
    body:
      'These images are organized through shared semantic proximity ' +
      'derived from the centered image.',
  },
  component_4: {
    title: 'Replaying paths',
    body:
      'These images are organized through previous user selections or ' +
      'previously unseen images. Your journey contributes to the evolving map.',
  },
}
