/** Existing reveal surfaces shared by request-local HTML and the one-time
 * browser handoff. Selectors are scoped to the matched public route. */
export const PUBLIC_INITIAL_REVEALS = {
  catalogBreadcrumb: { selector: '.catalog-breadcrumb', mode: 'fade' },
  catalogHeading: { selector: '.catalog-heading', mode: 'copy' },
  catalogSidebar: { selector: '.catalog-sidebar', mode: 'copy' },
  catalogToolbar: { selector: '.catalog-toolbar', mode: 'copy' },
  catalogGrid: {
    selector: '.catalog-results > .product-grid',
    mode: 'stagger',
  },
  productBreadcrumb: { selector: '.product-breadcrumb', mode: 'fade' },
  productIntro: { selector: '.product-intro', mode: 'stagger' },
} as const

export type PublicInitialRevealKey = keyof typeof PUBLIC_INITIAL_REVEALS
