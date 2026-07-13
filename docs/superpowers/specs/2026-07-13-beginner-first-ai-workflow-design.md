# Beginner-First BeamerForge Workflow

## Status and Relationship to Earlier Designs

This design replaces the user-facing AI handoff flow in
`2026-07-11-manual-ai-workflow-design.md`. The protected manual baseline,
schema-constrained AI draft, semantic comparison, renderer parity, and final
LaTeX compilation remain. Exporting a folder and switching to an external agent
is moved to an advanced compatibility tool rather than the normal workflow.

## Product Goal

BeamerForge should help a first-time user create a polished Beamer theme without
requiring knowledge of LaTeX, theme schemas, repositories, JSON, AI handoffs, or
model APIs. The normal experience has two stages:

1. Build a sound design through simple visual choices.
2. Optionally refine that protected design by describing changes to an AI model.

The application is exclusively for presentation creators. Instructions for
cloning, running, or extending the repository remain in repository documentation
and do not appear in the application onboarding.

## Experience Principles

- Begin with intent and visual examples, not technical settings.
- Ask for one decision at a time.
- Keep the manual design usable without AI.
- Show an immediate HTML preview while editing.
- Use the generated Beamer result as the authoritative final check.
- Never apply an AI suggestion without explicit acceptance.
- Preserve the last reviewed manual design as a recoverable baseline.
- Keep provider setup out of the creative flow until AI is requested.
- Use plain-language status and recovery instructions.

## New-User Guidance

The first visit opens a calm welcome page titled “Design a polished Beamer theme
without wrestling with LaTeX.” It explains the workflow in two cards:

- **Choose your foundation:** describe the feeling, compare a few visual
  directions, and fine-tune one detail at a time.
- **Refine it with AI:** write the requested change, compare before and after,
  then accept, keep, or revise.

A short statement explains the HTML/LaTeX principle as “Fast while designing.
Reliable when finished.” The primary action is **Start designing**. The page also
states what the user receives: a complete editable Beamer project and a compiled
PDF preview. Developer setup, repository architecture, API vocabulary, and the
element catalog are not shown.

After the user starts designing, the welcome page no longer interrupts that
design session. It remains available from Help as **How BeamerForge works**.

## Normal Workflow

The visible progress sequence is:

```text
Welcome -> Direction -> Style -> Details -> Review -> AI refinement -> Build
```

### 1. Direction

The user describes the desired feeling in one sentence. BeamerForge responds
with two or three visual directions using real slide previews. Examples include
“quiet academic,” “clean modern,” and “bold editorial.” Registry and theme IDs
are not exposed.

### 2. Style

The user compares two or three compatible color-and-type combinations within the
chosen direction. Each choice updates the cumulative HTML preview immediately.

### 3. Details

BeamerForge asks about one category at a time: bullets, blocks, navigation, and
title-page layout. The user may skip a category and keep the recommended choice.

### 4. Manual Review

The review page shows the complete cumulative design, a concise natural-language
summary, and two primary continuations:

- **Refine with AI**
- **Build this design**

Confirming review creates an immutable manual baseline snapshot. Returning to
earlier steps and confirming a new review deliberately replaces that baseline.

### 5. AI Refinement

The user writes a request such as “make this warmer,” “use less prominent
navigation,” or “remove the corner logo.” Optional reference images or Beamer
source files may be attached. The primary action is **Create AI suggestion**.

If no provider is connected, this action opens a short connection sheet rather
than routing to a separate technical workflow. Once connected, the sheet closes
and generation continues automatically.

### 6. Compare and Choose

The application shows synchronized previews labeled **Your design** and **AI
suggestion**, followed by a semantic summary of the actual changes. Available
actions are:

- **Use AI suggestion**
- **Keep my design**
- **Revise request**

Previewing a suggestion never changes the accepted theme. Accepting the AI draft
immediately updates the accepted theme and preview. Keeping the manual design
restores the protected baseline. History retains both states.

### 7. Build

The build screen generates the project from the accepted validated theme,
compiles it with the real Beamer toolchain, and presents the PDF as the final
visual authority. The user can download the complete project and PDF.

## Navigation and Page Structure

The application uses a calm academic visual language: warm neutral canvas,
white work surfaces, dark ink text, restrained teal actions, modest borders, and
clear typographic hierarchy. The wizard owns the main page rather than appearing
inside a small nested card.

Each step contains:

- a short progress indicator;
- one plain-language heading and one-sentence instruction;
- the current choice area;
- a large cumulative preview;
- predictable Back and Continue actions.

Technical details, raw theme JSON, handoff export/import, renderer diagnostics,
and model parameters live under **Advanced**. They are never required for the
normal path.

## AI Provider Design

The product uses a provider-neutral model connection. The initial connection
sheet contains:

- provider: OpenAI, DeepSeek, or Custom compatible API;
- API key;
- **Test connection**;
- a plain explanation that usage may be billed by the selected provider.

Model and base URL appear only under Advanced. The application queries the
provider's model-list endpoint when supported instead of relying on permanent
hard-coded model names. A provider adapter normalizes each provider into one
internal operation:

```text
createThemeSuggestion(baseline, request, references) -> candidate theme
```

OpenAI and DeepSeek use their supported OpenAI-compatible chat interfaces.
Custom endpoints must satisfy the subset of that interface required by
BeamerForge. Provider differences do not leak into wizard or comparison code.

The browser sends API keys only to the local BeamerForge server. The server holds
them in process memory and uses them only as authentication headers over HTTPS to
the chosen provider endpoint. Keys are not written to browser storage, theme
files, handoff packages, generated projects, logs, or Git. Environment variables
may supply keys for developers or repeat local use. Persistent OS credential
storage is outside this iteration.

Each adapter reports provider capabilities, including model listing, JSON-output
mode, and image input. The interface only offers features supported by the active
provider and model; it never silently drops an attachment or changes the user's
request.

## AI Output Boundary

The model receives the validated manual baseline, natural-language request,
closed schema, and applicable reference descriptions. It returns a complete
theme-shaped JSON candidate. JSON-output mode is used when the provider supports
it, but correctness never depends on prompt compliance alone.

Every candidate must pass the same closed theme-schema and registry validation as
a manual design. Unknown fields, raw LaTeX, TikZ, packages, commands, arbitrary
asset paths, and executable snippets are rejected. The server computes its own
semantic diff; model-authored explanations are not trusted as the change record.

Beamer source references are read as bounded text context and never compiled or
executed. Image references are sent only when the active provider and model
declare image-input support. Unsupported, oversized, or unsafe attachments are
identified before generation so the user can remove them or select a capable
provider. File types, per-file size, aggregate size, path traversal, and symbolic
link escape are validated locally.

## State Model

The workflow maintains four distinct concepts:

- `working theme`: current cumulative manual wizard state;
- `manual baseline`: last confirmed manual review snapshot;
- `AI draft`: latest generated and validated candidate;
- `accepted theme`: the only theme eligible for project generation.

The manual baseline is immutable during AI operations. Generating, retrying, or
previewing an AI draft cannot alter it. Accepting a draft copies it into the
accepted theme. Keeping or restoring the manual design copies the baseline into
the accepted theme. Beginning a new confirmed manual review invalidates stale AI
drafts derived from the older baseline.

Each AI request is bound to the exact baseline snapshot that produced it. Late
responses from cancelled or superseded requests are ignored.

## Decorations and the Duck

New themes do not include a corner logo by default. The built-in duck remains a
catalog example and regression fixture, not a product default. A logo appears
only when the current validated theme explicitly selects it.

If an accepted AI suggestion removes a selected logo, the accepted preview and
generated project remove it immediately. The protected baseline may still retain
the logo for history or restoration, but historical state must never leak into
the active preview or build.

## Component Boundaries

- **Onboarding:** explains the creator workflow and starts a new design.
- **Wizard controller:** owns progress, navigation, and cumulative manual state.
- **Preview renderer:** renders an exact resolved snapshot in HTML.
- **Baseline manager:** freezes and restores reviewed manual snapshots.
- **Provider adapters:** translate the common AI request into provider calls.
- **AI suggestion service:** constructs requests, validates responses, and
  discards stale results.
- **Theme validator:** enforces the closed schema and registry contracts.
- **Comparison service:** computes semantic changes and supplies synchronized
  preview inputs.
- **Acceptance manager:** performs explicit draft or baseline acceptance.
- **Build service:** writes and compiles only the accepted reviewed snapshot.

These units communicate through complete immutable theme snapshots and explicit
request identifiers. UI routes do not perform provider, validation, filesystem,
or compilation work directly.

## Loading and Error States

AI generation stays on the refinement page. The prompt remains visible while a
progress panel reports understandable stages such as “Preparing your design,”
“Creating a suggestion,” and “Checking the result.” The user may cancel without
changing any theme state.

Errors preserve the request, attachments, manual baseline, and accepted theme.
Messages state what happened and what to do next:

- connection failure: **We could not reach your AI provider. Check the
  connection and try again.**
- rejected key: **The provider did not accept this API key.**
- quota or billing failure: **The provider could not complete this request.
  Check your account usage or choose another provider.**
- invalid model response: **The suggestion was not a valid BeamerForge design.
  Your original is unchanged. Try again or revise the request.**
- compilation failure: **Your design is saved, but the final Beamer check failed.**
  The build screen exposes the relevant diagnostic under Details.

No error sends the user to JSON import/export or asks them to repair schema data.

## Advanced Compatibility Workflow

The existing folder export/import handoff remains accessible under Advanced for
offline models, external agents, debugging, and reproducible research. It is not
part of onboarding or the primary progress sequence. Its imported candidate must
pass the same validation, snapshot binding, comparison, and explicit acceptance
rules as a direct provider response.

## Accessibility and Responsive Behavior

- All actions have descriptive text labels and visible keyboard focus.
- Selection is represented by text and shape in addition to color.
- Preview alternatives remain navigable without pointer input.
- Status changes use an accessible live region without repeatedly interrupting
  the user.
- Side-by-side comparison becomes a clearly labeled before/after toggle on narrow
  screens.
- Primary actions remain visible without covering preview content.

## Testing

Automated coverage includes:

- first-visit and returning-user onboarding behavior;
- complete manual-only and manual-plus-AI routes;
- route guarding and Back/Continue state preservation;
- provider adapter contract tests for OpenAI, DeepSeek, and custom-compatible
  endpoints using mocked responses;
- key non-persistence and log-redaction checks;
- JSON parsing, schema rejection, unknown fields, and prohibited code fields;
- request cancellation, stale response rejection, retry, and provider switching;
- provider-capability gating and safe reference-file handling;
- baseline immutability, AI acceptance, manual restoration, and history;
- semantic comparison including decoration removal;
- absence of the duck in new default themes;
- HTML/LaTeX renderer parity for accepted snapshots;
- generation and compilation from manual and AI-accepted themes;
- keyboard navigation, focus order, and narrow-screen comparison behavior.

Manual visual review verifies the welcome page, each wizard step, provider
connection sheet, AI loading/error states, comparison, and final build at desktop
and mobile widths.

## Non-Goals

- Teaching users how to clone, run, or extend the repository inside the app.
- Replacing the manual workflow with a prompt-only starting screen.
- Automatically accepting AI suggestions.
- Allowing model-generated raw LaTeX or executable theme code.
- Requiring a provider account for manual theme creation and compilation.
- Building an account, billing, or provider-key synchronization service.
- Removing the external handoff compatibility tool.

## Acceptance Criteria

The design is complete when a first-time user can understand the two-stage
workflow from the welcome page, create and review a manual theme through visual
choices, optionally connect OpenAI, DeepSeek, or a compatible provider in place,
request a change in natural language, compare the protected original with a
validated AI suggestion, explicitly choose a version, and compile and download
the accepted Beamer project without seeing JSON, handoff folders, repository
instructions, or unexplained technical errors.
