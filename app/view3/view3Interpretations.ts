// VIEW-3 interpretation layer — descriptive metadata for each relation
// component. Pure data: no Vue, no DOM, no layout logic.
//
// Keyed by componentId (component_1..4). Positioning of the panel comes from
// the quadrant's data-position attribute in the markup, NOT from this file.
//
// `align` is optional. When omitted, the consuming component derives
// alignment from its quadrant (start for tl/bl, end for tr/br).

export interface View3Interpretation {
  title: string
  body: string
  align?: 'start' | 'end' | 'center'
}

export const view3Interpretations: Record<string, View3Interpretation> = {
  component_1: {
    title: 'relational regime 1',
    body:
      'placeholder — describes the semantic worldview encoded by this ' +
      'component’s UMAP dataset. Related images shown here reflect ' +
      'proximities computed under this regime relative to the central image.',
  },
  component_2: {
    title: 'relational regime 2',
    body:
      'placeholder — a distinct relational interpretation of the same ' +
      'central reference. Differs from the other components by dataset, ' +
      'not by layout.',
  },
  component_3: {
    title: 'relational regime 3',
    body:
      'placeholder — another independent proximity space. The central ' +
      'image therefore generates a different neighborhood here than in ' +
      'the other quadrants.',
  },
  component_4: {
    title: 'relational regime 4',
    body:
      'placeholder — a fourth relational interpretation. Together, the four ' +
      'components form a multi-perspective relational field around the ' +
      'active central reference.',
  },
}
