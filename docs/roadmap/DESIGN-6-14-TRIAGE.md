# Design 6–14 triage

Owner-approved planning note for the nine supplied mockups. Designs 1–5 are already implemented/understood and are not re-triaged here. “Current editor” refers to the checked-in implementation and architecture docs at triage time. Issue numbers below refer to the existing backlog; proposed issue titles use `BWB-???` until the owner creates the issues.

| Design | Screen | Priority | Proposed issue title |
|---|---|---|---|
| 6 | Additional design roadmap overview | P2 | Triage and sequence the additional editor design screens (BWB-???) |
| 7 | Theme setup wizard | P1 MVP | Complete the Blixis theme setup wizard flow (BWB-???) |
| 8 | Global styles and design tokens | P1 MVP | Build the global styles and design tokens editor (BWB-???) |
| 9 | Template library | P2 | Add a browsable template and section library (BWB-???) |
| 10 | Theme builder | P3 | Build theme templates and display conditions (BWB-???) |
| 11 | Dynamic data and query builder | P3 | Add dynamic data controls and bounded query builder (BWB-???) |
| 12 | Responsive editing | P1 MVP | Complete responsive preview and per-device editing controls (BWB-???) |
| 13 | Assets / Media Manager | Deferred | Defer standalone media manager; use the WordPress media library (BWB-???) |
| 14 | Revisions / History | P2 | Add revision history, comparison, and restore UI (BWB-???) |

## Recommended build order

1. **7 — Setup wizard (P1).** It helps a new site reach a usable baseline and is already represented by theme setup work BWB-211 and the existing BWB-033–036 foundation. Finish the server-backed setup/persistence path before adding more authoring surfaces.
2. **8 — Global styles (P1).** Shared colors, typography, spacing, radius, shadows and breakpoints improve every page. Token schema/compiler foundations exist, but the site-level editing/persistence UI still needs completion; coordinate with BWB-212 and theme/server persistence.
3. **12 — Responsive editing (P1).** Desktop/tablet/mobile preview and controls are core page-authoring value. It builds on existing breakpoint/style contracts and BWB-057; finish editor controls and responsive parity before release hardening.
4. **9 — Template library (P2).** Starter layouts accelerate first-page creation. Build after core save/reopen and template storage/import contracts; align with BWB-213 and the existing P8 library work (#80).
5. **14 — Revisions/history (P2).** Valuable recovery and comparison controls, but depend on WordPress persistence, snapshots and revision semantics (BWB-040/046 and BWB-218). Implement the visible history UI against those stable server contracts.
6. **10 — Theme builder (P3).** Header/footer/archive/single templates and display conditions require template document types and server-side resolution (BWB-214, #77–78), so schedule after the Free page-building flow.
7. **11 — Dynamic data/query builder (P3).** Data sources, filters, pagination and live results need allowlisted server data/query contracts; the query loop is Pro scope (#84/BWB-215), after the extension and entitlement boundary.
8. **13 — Deferred.** The mockup depicts a full asset manager with folders and asset-type filters. The owner explicitly wants WordPress’s library to remain authoritative; keep the existing core REST media picker and do not build a parallel manager now.
9. **6 — Planning overview only.** It is an index/summary poster of proposed screens, not a product workflow. Use it to communicate the roadmap; it has no separate editor implementation.

This order prioritizes onboarding, shared design controls and responsive page authoring for Free/MVP. Features requiring durable server-side template, revision, dynamic-data or query behavior follow their storage/permission contracts. The mockups are design references, not approval to implement every depicted feature; tier placement follows the current roadmap/PRD unless an owner decision changes it.

## Design-by-design triage

### Design 6 — Additional Blixis designs overview

- **Screen:** A dark presentation/roadmap poster titled “Recommended Additional Blixis Designs”; eight numbered screen cards and a bottom row of other potential design topics.
- **Visible UI/copy:** Cards summarize Setup Wizard, Global Styles / Design Tokens, Template Library, Theme Builder, Dynamic Data / Query Builder, Responsive Editing, Assets / Media Manager, and Revisions / History. The lower strip mentions Translation Manager, Role Permissions, Component Library, Form Builder, Animation Timeline, and WooCommerce Builder. Each card includes a small mock screen and a short purpose statement; there are no interactive states or controls on this poster itself.
- **Mapping:** Planning index for #210 and the post-MVP design epics #211–218. Individual concepts map below; related existing work includes #88, #208, #56, #57, #114, #84, #58–60.
- **Missing:** No standalone product screen or behavior to add. Roadmap references need to be reconciled with the existing editor contracts and release tiers.
- **Priority:** **P2** — useful as planning context, while it does not itself deliver an author workflow.
- **Proposed GitHub issue:** **Triage and sequence the additional editor design screens (BWB-???)**
  - **Scope**
    - Record the screen-by-screen mapping, dependencies, and release order for designs 7–14.
    - Keep the mockups’ feature scope distinct from approved Free, Plus, and Pro allocation.
    - Mark the standalone media manager as deferred per owner direction.
  - **Dependencies:** Owner design set 6–14; existing backlog #210–218 and referenced editor issues.

### Design 7 — Setup Wizard

- **Screen:** WordPress admin onboarding wizard, shown on step 2 of 5 (“Theme”) with a left Blixis admin navigation.
- **Visible UI/behavior:** Progress steps Welcome, Theme, Style, Content, Finish; theme/template cards with a selected Modern Homes card and checkmark; categories All Templates, Business, Blog, Portfolio, eCommerce, SaaS; color-scheme choices; font-selection cards; “View All Templates”; Back, Skip Setup and Continue. Intro says the starter design can be changed later. The wizard is embedded in the admin page and does not force a redirect.
- **Mapping:** #211 setup wizard; existing theme setup BWB-033–036. The current theme architecture documents a six-step server-rendered setup flow with preset, colors, typography, spacing/layout, light/dark preview and Apply. The shown five-step progression and template gallery therefore need reconciliation with the existing setup contract. Template cards overlap #213/#80.
- **Missing:** Complete the visible theme/preset selection and navigation/copy; connect template choice only where a real template source exists; reconcile step count/order with current server wizard and its resumable draft, validation, save/apply behavior. No unsupported template catalog should be implied.
- **Priority:** **P1 MVP** — onboarding is on the path to a useful first site; build on the existing server-backed wizard foundation.
- **Proposed GitHub issue:** **Complete the Blixis theme setup wizard flow (BWB-???)**
  - **Scope**
    - Align wizard step labels, progress, Back/Continue/Skip behavior with the approved setup contract.
    - Present selectable theme/preset cards and selected state, plus available color and font choices.
    - Preserve resumable per-user progress and site-level completion/dismissal state.
    - Validate and apply the chosen setup through the existing theme persistence path.
  - **Dependencies:** #211; BWB-033–036; template selection depends on #213/#80 if populated from the library.

### Design 8 — Global Styles / Design Tokens

- **Screen:** Site-wide Global Styles / Design Tokens admin screen.
- **Visible UI/behavior:** Sidebar sections Colors, Typography, Spacing, Border Radius, Shadows, Breakpoints and Custom CSS; top “Reset to Defaults” and “Save Changes.” Color Palette shows Brand/Semantic tabs, named swatches (Primary, Secondary, Accent, Success, Warning, Error) and “+ Add Color.” Typography has heading/body font selectors, type-scale preview rows and “Manage Fonts.” Separate cards show spacing and radius scales, shadow presets and breakpoint devices/labels; Custom CSS has an editor and action to add CSS.
- **Mapping:** #212 global styles; BWB-026 token schema/resolver, BWB-031 theme variables, BWB-035 persistence, BWB-036 Font Library, #208 Advanced tab. Existing style engine and theme token foundations exist; this mockup is a site-level design-system editor, not the current selected-element Style inspector.
- **Missing:** A complete admin UI to read/edit validated global token sets and save/reset them with safe persistence, validation feedback and preview. Add-color/custom CSS behaviors need schemas and explicit validation; do not expose arbitrary unsafe CSS. Breakpoint editing must obey the existing breakpoint contract and migration implications. Font selection should use WordPress Font Library rather than a duplicate font store.
- **Priority:** **P1 MVP** — shared tokens set the visual baseline across a site; safely constrain CSS and font behavior to existing contracts.
- **Proposed GitHub issue:** **Build the global styles and design tokens editor (BWB-???)**
  - **Scope**
    - Edit semantic colors, typography, spacing, radii and shadows from the site design-system settings.
    - Show token samples and controls for adding/editing supported palette entries.
    - Save changes and reset to defaults through validated, capability-protected persistence.
    - Use WordPress Font Library families/variants and expose only supported breakpoints.
    - Define whether custom CSS is permitted and validate/sanitize it before saving or compiling.
  - **Dependencies:** #212; BWB-026, BWB-031, BWB-035, BWB-036; #208 for any element-level Advanced controls.

### Design 9 — Template Library

- **Screen:** Blixis template/section/page/saved-block catalog.
- **Visible UI/behavior:** Tabs Templates, Sections, Pages, Saved Blocks; search field and category dropdown; category sidebar with counts; “All Templates 120” and category counts; grid of preview cards with favorite hearts, title/category, “Use Template” and Preview actions. Some cards show a video/play badge. Header offers Import Template and Help.
- **Mapping:** #213 template library; existing #80 reusable pattern/template library MVP and BWB-096 sample fixtures. Setup wizard design 7 links into this catalog. The PRD places reusable library work post-MVP/Plus; distinguish built-in starter content from Plus catalog/import if needed.
- **Missing:** Catalog data model and source, search/category filters, preview and insertion/import flow, favorites persistence, and safe compatibility/version validation. Existing editor does not show this library screen. No counts or catalog size should be promised without actual inventory.
- **Priority:** **P2** — improves creation speed, after basic Free create/save/reopen is stable; tier/package policy needs alignment with #80.
- **Proposed GitHub issue:** **Add a browsable template and section library (BWB-???)**
  - **Scope**
    - Provide library tabs, category filtering, search and template preview for available items.
    - Insert or import a selected item through validated document operations.
    - Define favorite state and import compatibility/error feedback.
    - Populate the catalog only from approved bundled or server-provided templates.
  - **Dependencies:** #213; BWB-050–055 and BWB-058 for document/editor lifecycle; #80/BWB-096 and approved Free/Plus allocation.

### Design 10 — Theme Builder

- **Screen:** Theme template editor for site chrome and template conditions.
- **Visible UI/behavior:** Template list includes Header, Footer, Single Post, Archive, Search Results, 404 Page and Custom Templates; “Add New Template.” Selected Header is marked Published. Main pane has Preview, Design and Settings tabs, “Edit with Visual Builder,” a website preview, and Display Conditions with Include/Exclude rows, selectors, delete controls and “+ Add Condition.” Top actions View Website and Save Changes.
- **Mapping:** #214 theme builder; existing #77 theme template document types and #78 display-condition resolution, plus #208 Advanced tab where relevant. The editor currently edits page documents; the PRD assigns advanced theme templates to Plus.
- **Missing:** Template document types, list/status lifecycle, visual editing route, preview, typed include/exclude condition model, deterministic server resolution, save/publish and collision handling. Conditions are server-facing and must be validated; do not infer additional condition types beyond the eventual supported set.
- **Priority:** **P3** — advanced site-wide templates require substantial server resolution work and are outside Free MVP.
- **Proposed GitHub issue:** **Build theme templates and display conditions (BWB-???)**
  - **Scope**
    - Create and manage the depicted header/footer/single/archive/search/404/custom template types.
    - Edit, preview, save and publish templates using the visual builder contract.
    - Add and remove validated Include/Exclude display-condition rows.
    - Resolve eligible templates on the server with defined precedence and fallback.
  - **Dependencies:** #214; BWB-040–044, BWB-050–055; #77–78; Plus capability/entitlement contracts.

### Design 11 — Dynamic Data / Query Builder

- **Screen:** Query builder with a live preview of WordPress post results.
- **Visible UI/behavior:** Top “Content / Query / Filter / Pagination” tabs, Query Settings and Live Preview panels, Preview in Template and Save Query actions. Fields include Post Type, Posts Per Page slider/value, Order By, Order, Offset. Query Type choices are Latest Posts, Manual Selection and Related Posts. Preview toggle controls and “Open as New Tab” accompany a grid of image/title/excerpt/date cards.
- **Mapping:** #215 dynamic data UI and #84 bounded query builder; related dynamic source issue #79 and extension groundwork. PRD places query loops in Pro. Existing editor has no comparable query-builder screen; server-side query validation and resource bounds are essential dependencies.
- **Missing:** Allowlisted source/field model, query/filter/pagination schema, bounded WP_Query adapter, permissions/entitlement checks, stable result preview, save/reopen and empty/error states. Mockup-specific controls should not imply unsupported filters or query types.
- **Priority:** **P3** — powerful but Pro/server-dependent; it follows secure data and query contracts.
- **Proposed GitHub issue:** **Add dynamic data controls and bounded query builder (BWB-???)**
  - **Scope**
    - Expose supported content, query, filter and pagination settings through explicit validated controls.
    - Support only approved query modes and fields, with bounded result counts and offsets.
    - Render an editor preview and handle empty/error results without unsafe execution.
    - Save query definitions and connect them to registered dynamic-data elements.
  - **Dependencies:** #215 and #84; BWB-079, #75/#83 entitlement contracts, secure REST/PHP query adapter and element schemas.

### Design 12 — Responsive Editing

- **Screen:** Page editor with responsive viewport and per-device style controls.
- **Visible UI/behavior:** Top Preview, Save Draft, Update; Documentation link; Responsive tab with device icons and width dropdown (Desktop 1200px shown); left inspector has element tabs and Section controls, visibility toggles for Show on All Devices/Desktop/Tablet/Mobile, and Spacing tabs Desktop/Tablet/Mobile with separate padding values for top/right/bottom/left. Canvas shows a page preview at the selected viewport. The mockup also shows a “Style” tab alongside Responsive.
- **Mapping:** #216 responsive editing; BWB-057 viewport controls, BWB-025 breakpoint/state rules, BWB-058 E2E, #59–60 drag/drop. Existing editor has a viewport group, responsive style targets, and responsive inspector controls documented in EDITOR.md; #57 is the separate viewport/locale switcher. This mockup is a more complete composition of those controls, not an entirely new breakpoint model.
- **Missing:** Reconcile any mockup controls with current implementation; expose per-device visibility and clear inherited/overridden states where supported, ensure widths map to registered breakpoints, and complete save/update integration. Do not create a second device-specific style storage model.
- **Priority:** **P1 MVP** — responsive authoring is part of the core page journey; reuse existing breakpoint/style contracts and verify editor/PHP parity.
- **Proposed GitHub issue:** **Complete responsive preview and per-device editing controls (BWB-???)**
  - **Scope**
    - Provide clear desktop/tablet/mobile preview selection and viewport sizing.
    - Expose supported responsive visibility and spacing controls with inherited/override indication.
    - Persist changes through the existing sparse breakpoint style rules and command history.
    - Keep preview mode, editor chrome appearance and content locale independent.
  - **Dependencies:** #216; BWB-025, BWB-050–057; #57; BWB-058 and #59–60 for interaction coverage.

### Design 13 — Assets / Media Manager (deferred)

- **Screen:** Full standalone asset manager with folder navigation and a media grid.
- **Visible UI/behavior:** Left Folders list with New Folder and categories All Files, Website Images, Icons, Hero Section, Products, Blog, Marketing, Documents, Videos, Logos & Brand, UI Elements, Uncategorized. Main pane has All Assets, Images, Icons, SVGs, Videos, Documents filters; search; Upload Files; grid/list view buttons; paginated asset cards with selection checkboxes, thumbnails/types, filenames, sizes/dimensions and per-item action icons. A visible count indicates a large asset collection.
- **Mapping:** #217 media manager / BWB-045 media integration. Existing editor already has a picker using the WordPress core REST media library with image listing, pagination, safe URL validation, selection and upload permission handling. Owner explicitly rejects a parallel folder-based manager now.
- **Missing:** The standalone folder taxonomy, broad file-type indexing and grid management shown in the mockup do not exist in the editor. They are intentionally not part of this roadmap slice; continue using the core media picker, without inventing folder support in WordPress.
- **Priority:** **Deferred** — WordPress already owns the media library; maintain the picker built on core REST instead of duplicating that system.
- **Proposed GitHub issue:** **Defer standalone media manager; use the WordPress media library (BWB-???)**
  - **Scope**
    - Record the owner decision to defer the full folder-based manager shown in design 13.
    - Keep the editor’s media picker backed by WordPress core REST and existing upload capabilities.
    - Revisit only if a separately approved requirement cannot be met by the core library.
  - **Dependencies:** #217; BWB-045; WordPress core media REST and permission contract.

### Design 14 — Revisions / History

- **Screen:** Page revision history, comparison and restore screen.
- **Visible UI/behavior:** Tabs Autosaves, Snapshots, Revisions, Manual Changes; search; filters for All Types and All Users; “Create Snapshot.” Timeline cards show Current Version (Published) and earlier entries with thumbnails, titles, dates/authors and labels. Row actions include Compare, View, Restore and overflow. Right “Revision Details” shows a selected revision’s thumbnail, date, author, type, version, summary, and Actions for Restore This Revision, Create Snapshot and View on Frontend. Compare controls select current/another revision and provide “Compare Revisions.”
- **Mapping:** #218 revisions/history; BWB-040 persistence, BWB-046 autosave/revision semantics and publication model ADR 0004. WordPress revisions are the native source where applicable; snapshot/compare UX must use explicit supported revision types. Current editor has save/conflict behavior but the architecture says autosave/publication are separate work; no history screen is present.
- **Missing:** Revision list/filter/detail API and UI, stable snapshot semantics, safe comparison representation, restore confirmation/revision creation rules, and frontend preview. Define autosave, snapshots, published revisions and manual changes against the server contract; do not promise arbitrary cross-type restore.
- **Priority:** **P2** — recovery is valuable after core save/publish works, and depends on server revision/snapshot behavior.
- **Proposed GitHub issue:** **Add revision history, comparison, and restore UI (BWB-???)**
  - **Scope**
    - List supported autosave, snapshot and revision entries with available author/date/type details.
    - Provide search/filter, revision detail, frontend view and comparison for supported pairs.
    - Restore only through a server-validated operation with clear confirmation and resulting revision behavior.
    - Create manual snapshots through the documented persistence API.
  - **Dependencies:** #218; BWB-040, BWB-046 and publication/revision ADR 0004; BWB-055/058 save and recovery flow.
