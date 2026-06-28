# Cumulative Beamer Workbench Wizard Design

## Summary

BeamerForge should use a cumulative multi-page wizard for template design.
The earlier single-screen workbench direction is superseded for the product UI.
The local HTML preview, `theme.json` source of truth, Beamer generation, and PDF
compile pipeline remain valid.

The wizard starts from a default template, then asks the user to make one design
decision per page. Each preview reflects every choice made so far. Users can go
back to earlier steps without losing later compatible choices.

## Goals

- Make template design feel like a guided cumulative process.
- Show the default template before any customization.
- Keep exactly one main decision per step.
- Preview the accumulated theme after every choice.
- Allow non-destructive backtracking to any earlier step.
- Keep `theme.json` as the source of truth for preview and generation.
- Surface invalid or incompatible choices before final generation.
- Generate the same complete Beamer project format described in the earlier
  workbench design.

## Non-Goals

- A free-form one-page dashboard with every control visible at once.
- Silent resets of later choices after an earlier change.
- Pixel-perfect HTML replication of Beamer output.
- Remote accounts, cloud builds, or multi-user project management.

## Product Flow

The wizard route order is:

```text
/start
/color
/font
/bullets
/blocks
/navigation
/title-page
/review
```

The user-facing flow is:

```text
Default Template
-> Choose Color
-> Choose Font
-> Choose Bullets
-> Choose Blocks
-> Choose Navigation
-> Choose Title Page
-> Review & Generate
```

Each step shows:

- The current decision area.
- A cumulative live preview.
- Back and Next controls.
- A compact progress and summary sidebar.
- Edit buttons for previous completed choices.

The default template page shows the starting theme and explains the baseline
visually through the preview, not through a long configuration form.

## Cumulative Behavior

The preview always reads the full `theme.json`, not only the current step.

Examples:

- On the color step, the preview shows the default template with the selected
  palette.
- On the font step, the preview uses the selected palette and selected font.
- On the bullets step, the preview uses selected palette, font, and bullet
  style.
- Later steps continue to layer choices onto the same theme state.

Changing an earlier choice does not reset later choices by default. If a later
choice still validates, it remains selected. If it becomes invalid or
incompatible, the wizard keeps the value and marks that step as needing review.

## UI Structure

The browser UI should have three stable regions:

- Step content: the main option cards or controls for the current decision.
- Preview: a Beamer-like slide preview rendered from the full theme state.
- Summary sidebar: step progress, selected labels, validation state, and edit
  actions.

The step content should avoid technical catalog language until needed. Option
cards should use human-readable names, color swatches, font samples, bullet
samples, block samples, and navigation mini-previews.

The summary sidebar should show completed choices compactly:

```text
Color: Academic Blue      Edit
Font: Palatino            Edit
Bullets: Triangle         Edit
Blocks: Rounded           Edit
Navigation: Soft frames   Edit
Title page: Left curtain  Edit
```

If validation marks a step as incompatible:

```text
Bullets: needs review     Edit
```

The review page shows all selected choices, validation status, the final preview,
and generation actions.

## State Model

The wizard keeps one canonical theme state:

```text
theme.json
```

Each route edits one section:

- `/color` edits `theme.colors`.
- `/font` edits `theme.fonts`.
- `/bullets` edits `theme.bullets`.
- `/blocks` edits `theme.blocks`.
- `/navigation` edits `theme.navigation`.
- `/title-page` edits `theme.titlePage`.
- `/review` validates and generates from the whole theme.

The app should keep draft state in the local workbench state directory so a page
refresh does not lose progress.

## Data Flow

The main interaction loop is:

```text
user picks option
-> update theme.json state
-> validate full theme
-> refresh cumulative preview
-> persist draft state
-> continue to next step or jump to edited step
-> final review
-> generate Beamer files
-> compile PDF when available
```

The generator must receive the same `theme.json` used by the preview. There
should not be a second UI-only design state.

## Backtracking And Compatibility

Users can return to any earlier step through Back controls or summary edit
buttons.

When an earlier choice changes:

1. The changed section updates immediately.
2. Later selections are preserved.
3. Full-theme validation runs.
4. Compatible later selections remain complete.
5. Incompatible later selections are flagged as needing review.
6. Generation is blocked until all flagged steps are resolved.

The app should not silently overwrite user choices to fix conflicts. If a
default replacement is available, it can be offered as an explicit action.

## Validation

Validation should report:

- Missing required theme sections.
- Unknown option IDs.
- Invalid color values.
- Unsupported font or asset references.
- Unsupported option combinations.
- Steps that need review before generation.

Field-level validation remains useful for API responses. The wizard also needs
step-level validation so the sidebar can show which page needs attention.

## Architecture

The earlier local server architecture remains appropriate:

```text
wizard routes and controls -> theme.json -> HTML preview
                                  |
                                  v
                         Beamer generator -> PDF compile
```

The main architectural change is in the browser workbench UI. It should be a
step router over a shared theme state, not a single page with all controls
visible at once.

The existing proposed folders still fit:

- `workbench/`: local server, browser UI, preview renderer, API routes.
- `schema/`: `theme.json` schema and validation helpers.
- `registry/`: option metadata and compatibility metadata.
- `generators/`: token-to-Beamer generation code.
- `templates/<name>/`: generated complete Beamer projects.

## Testing And Verification

Tests should cover:

- Step order and route navigation.
- Default template state loads at `/start`.
- Each step updates only its corresponding `theme.json` section.
- Preview receives the cumulative full theme state.
- Backtracking keeps compatible later choices.
- Incompatible later choices are flagged rather than silently reset.
- Review page blocks generation while flagged steps remain.
- Final generation uses the same `theme.json` shown in the preview.

The existing generator, schema, registry, build, and compile smoke tests remain
necessary.

## Rollout

The first implementation should prove one complete vertical slice:

1. Default template page.
2. Color step with at least one palette.
3. Font step with at least two font choices.
4. Bullet step with at least two bullet choices.
5. Block step with at least one block choice.
6. Navigation step with at least two navigation choices.
7. Title page step with at least one title page choice.
8. Review page.
9. Generated Beamer project.
10. Compile smoke command when a local LaTeX compiler is available.

After this slice works, more catalog elements can be added through the registry.

## Relationship To Earlier Spec

This spec supersedes the product shape in
`docs/superpowers/specs/2026-06-26-html-beamer-workbench-design.md`, where the
selected direction was a single live workbench screen. The source-of-truth,
generation, local server, and compile pipeline sections of that earlier design
remain valid unless contradicted here.
