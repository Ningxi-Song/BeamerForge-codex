# Manual Design and AI Customization Workflow

## Summary

BeamerForge will use a two-phase workflow. Users first construct a valid theme
through the existing manual wizard. They may then hand that theme to an external
AI agent for schema-driven customization using natural-language instructions and
optional image or Beamer-project references.

The manual result is frozen as a protected baseline. AI work occurs in a separate
draft. A user must explicitly accept the AI draft before it becomes the theme used
for generation and compilation.

## Goals

- Keep manual selection as the required first phase.
- Make AI customization an optional second phase.
- Accept natural-language instructions plus optional image and Beamer references.
- Use an external AI agent rather than calling a model from the workbench.
- Let AI create custom schema-supported values without allowing arbitrary LaTeX.
- Preserve the manual theme as a recoverable baseline.
- Validate and preview every imported AI draft before acceptance.
- Let users compare meaningful differences before choosing a final version.

## Non-Goals

- Calling an AI model directly from the web application.
- Managing model API keys, authentication, quotas, or billing.
- Letting AI inject raw LaTeX, TikZ, packages, or executable theme fragments.
- Executing imported Beamer reference projects during AI-draft import.
- Replacing the existing manual design controls with a prompt-only interface.
- Supporting AI-first entry before a manual baseline exists.

## Product Flow

The required top-level sequence is:

```text
Phase 1: Manual Design
Color -> Font -> Bullets -> Blocks -> Navigation -> Title Page -> Manual Review
                                                               |
                                                     Freeze manual baseline
                                                               |
Phase 2: AI Customization (optional)
Instructions + References -> Export handoff -> External AI edits
                          -> Import draft -> Validate -> Compare
                          -> Accept AI or manual version -> Generate and compile
```

At manual review, users may either continue to AI customization or skip it and
generate the manual theme directly.

## Routes

The manual phase uses:

```text
/start
/color
/font
/bullets
/blocks
/navigation
/title-page
/manual-review
```

The AI phase adds:

```text
/ai-customize
/ai-handoff
/ai-import
/ai-compare
/final-review
```

Routes in the AI phase are gated by the presence of a valid frozen manual
baseline. Comparison and final review additionally require a valid imported AI
draft or an explicit choice to retain the manual theme.

## Theme States

The state directory maintains three distinct artifacts:

- `manual-theme.json`: immutable baseline captured from a valid manual theme.
- `ai-draft-theme.json`: latest valid or pending imported AI result.
- `theme.json`: currently accepted theme used by generation and compilation.

Freezing the baseline copies the validated current theme into
`manual-theme.json`. Ordinary AI-phase operations never overwrite it. A deliberate
new manual-design cycle may replace the baseline after the user returns to the
manual wizard, changes the design, and confirms a new manual review.

Importing a draft does not update `theme.json`. Accepting a valid AI draft copies
it to `theme.json`. Keeping or restoring the manual design copies
`manual-theme.json` to `theme.json`.

## AI Customization Scope

The external agent may:

- Select existing catalog colors, fonts, bullets, blocks, navigation, and title
  layouts.
- Create custom colors and other custom values explicitly supported by the theme
  schema.
- Adjust schema-supported typography, spacing, and layout parameters.
- Interpret natural-language instructions and optional reference materials.

The agent may not:

- Add unknown theme properties.
- Add raw LaTeX, packages, TikZ code, shell commands, or executable snippets.
- Return a project as the AI result instead of `ai-draft-theme.json`.
- Modify the protected `manual-theme.json`.

These restrictions are enforced by validation rather than prompt instructions
alone.

## Handoff Package

The workbench produces a self-contained local folder:

```text
ai-handoff/
|-- manual-theme.json
|-- customization-brief.md
|-- instructions.md
|-- references/
|   |-- images...
|   `-- beamer-project...
`-- ai-draft-theme.json
```

`customization-brief.md` contains the user's requested mood and changes.
`instructions.md` documents the allowed customization scope, theme schema,
available catalog choices, expected output path, and validation requirement.
`ai-draft-theme.json` may begin as an explanatory placeholder file or be absent;
the external agent is instructed to create or replace it with the result.

References are optional. Supported references include common image files and
Beamer source projects containing `.tex`, `.sty`, `.cls`, and related local
assets. The handoff treats them as read-only inspiration.

## Reference Handling

Users explicitly choose files or directories. The server copies approved inputs
into `ai-handoff/references/` and never sends them to a remote service.

Reference handling must:

- Reject path traversal and unsupported source locations.
- Enforce per-file and aggregate size limits.
- Preserve safe relative structure for Beamer projects.
- Detect basename or destination collisions.
- Reject symbolic-link escapes from selected directories.
- Never compile or execute reference content during copying or import.

## External Agent Contract

The external agent reads the handoff folder and returns only a complete
`ai-draft-theme.json`. It should also place a concise change explanation in a
separate `ai-change-summary.md` when useful, but that explanation is not trusted
as the source of the comparison shown by the application.

The workbench computes its own semantic difference summary from the validated
baseline and draft. The contract is portable and does not depend on Codex-specific
APIs, although Codex is a primary intended consumer.

## Import and Validation

AI draft import follows this sequence:

1. Read the selected or handoff-local `ai-draft-theme.json` within size limits.
2. Parse JSON and require a complete theme object.
3. Reject unknown fields and prohibited raw-code fields.
4. Validate registry IDs and all custom schema-supported values.
5. Store the draft separately and compute a semantic difference summary.
6. Display the draft for comparison without altering the accepted theme.

An invalid draft remains recoverable as an import attempt but never replaces
`theme.json` or `manual-theme.json`. Errors identify the relevant field and route
the user back to import or further external-agent revision.

## Comparison and Acceptance

The comparison page shows synchronized previews labeled `Manual baseline` and
`AI customized draft`. It lists meaningful semantic differences rather than a raw
JSON diff, for example:

```text
Palette: Bamboo Blue -> Custom Warm Slate
Title font: Palatino -> Playfair Display
Body font: Palatino -> Source Sans
Frame spacing: Standard -> Airy
```

The available actions are:

- Accept AI version.
- Continue revising with AI and export the current handoff again.
- Keep manual version.
- Restore manual baseline after a prior AI acceptance.
- Generate the currently selected version.

Acceptance is explicit. Previewing or importing a draft never implies acceptance.

## Server Responsibilities

The workbench server provides narrowly scoped operations to:

- Freeze a valid manual baseline.
- Save a customization brief.
- Copy approved reference files.
- Create and report the handoff directory.
- Import and validate an AI draft.
- Return baseline, draft, validation, and semantic-difference data.
- Accept the AI draft or restore the manual baseline.
- Generate and compile only the accepted valid theme.

The server does not call an AI model. Handoff packaging and draft consumption are
separate modules from HTTP routing so they can be tested independently.

## Error Handling

- Missing baseline: redirect to manual review with a clear message.
- Invalid manual theme: show existing field-level wizard validation.
- Reference-copy failure: report the rejected file without discarding other
  manual state; do not leave a partially published handoff.
- Missing AI result: remain on the handoff/import page and explain the expected
  path.
- Invalid JSON or schema: show field-level errors and keep the baseline intact.
- Draft with no differences: allow acceptance but state that no effective design
  changes were found.
- Generation or compilation failure: preserve the accepted theme and existing
  build-status behavior.

Handoff creation should use a temporary sibling directory and rename it into
place only after all required files are written successfully.

## Security Boundaries

- Imported Beamer references are data, never trusted code.
- AI results are declarative JSON constrained by a closed schema.
- Unknown fields are errors rather than silently ignored values.
- All filesystem destinations are resolved beneath configured state or handoff
  roots.
- Generation continues through the existing validated generator.
- Compilation is available only for generated output from an accepted theme.

## Testing

Unit and integration tests will cover:

- Baseline creation, replacement through a new confirmed manual cycle, and
  immutability during AI operations.
- Handoff contents and deterministic instructions.
- Image and Beamer-project reference copying.
- Unsupported files, collision handling, size limits, traversal, and symlink
  escape rejection.
- Valid, malformed, unknown-field, prohibited-field, and invalid-ID AI drafts.
- Semantic theme difference summaries.
- Accept, reject, revise, keep-manual, and restore transitions.
- Generation from manual and AI-accepted themes.
- Route gating across both phases.
- End-to-end manual-to-handoff-to-import-to-generation behavior.
- Existing manual wizard and generator regression coverage.

## Success Criteria

The feature is complete when a user can manually design and freeze a valid theme,
export a portable AI handoff with optional references, have an external agent
produce a schema-constrained draft, import and compare it without risking the
baseline, choose either version, and generate and compile the chosen Beamer
project with all automated tests passing.

## Approved Extension: Schema-Supported Corner Logos

The external AI phase may select a trusted logo from a closed BeamerForge logo
catalog. This adds expressive decoration without permitting arbitrary LaTeX or
untrusted asset paths. The first catalog entry is a small built-in duck logo.

Themes may include:

```json
"decorations": {
  "cornerLogo": {
    "id": "duck",
    "position": "top-right",
    "size": "small",
    "scope": "content-frames"
  }
}
```

The closed schema accepts only registered logo IDs, `top-left` or `top-right`
positions, `small` or `medium` sizes, and `content-frames` or `all-frames` scope.
The initial AI request uses `duck`, `top-right`, `small`, and `content-frames` so
the title page remains uncluttered.

The logo registry owns browser-preview metadata and the trusted repository asset.
The project writer copies that asset into generated projects. The LaTeX generator
renders a fixed trusted TikZ equivalent through a Beamer background-canvas overlay
because XeLaTeX cannot portably include SVG files. The HTML preview renders the
catalog SVG at the same position. Semantic comparison reports logo ID, position,
size, and scope changes.

Unknown logo IDs, fields, positions, sizes, and scopes are validation errors.
No user-authored path, SVG markup, LaTeX, or TikZ is accepted in `theme.json`.
