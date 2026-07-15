# BeamerForge Workflow

## Core Principle

BeamerForge moves from broad visual intent to a reviewed, reproducible Beamer project. It asks for one meaningful design decision at a time, keeps compatible choices when users move backward, and treats AI as an optional refinement step rather than a prerequisite.

The browser preview gives immediate feedback during design. The final PDF, when a supported LaTeX compiler is available, is the visual authority.

## Canonical Journey

```text
Welcome -> Direction -> Style -> Details -> Review -> Optional AI refinement -> Build
```

The normal route sequence is:

```text
/welcome
-> /start
-> /color
-> /font
-> /bullets
-> /blocks
-> /navigation
-> /title-page
-> /manual-review
-> optional /ai-customize and /ai-compare
-> /final-review
```

Advanced handoff and import routes are available separately and do not appear in the normal beginner journey.

## 1. Welcome

The welcome screen explains what users receive:

- a complete editable Beamer project;
- a live browser preview while making choices;
- a compiled PDF when a supported local LaTeX compiler is available;
- optional AI refinement after a sound manual design exists.

Select **Start designing** to begin. An AI account or API key is not required for manual design, preview, generation, or download.

## 2. Direction

Describe the intended feeling in ordinary language, such as “serious academic,” “clean and minimal,” or “modern and technical.” BeamerForge presents a small set of curated visual directions that combine compatible design decisions.

Choosing a direction establishes a coherent starting theme. It does not lock later choices.

## 3. Style

Style covers the two decisions with the greatest visual reach:

1. **Color:** choose a compatible palette or tune a custom palette.
2. **Type:** choose body and title fonts from the supported registry.

The browser preview updates from the same resolved design data used by the generator. Choices must be supported by both the HTML and LaTeX renderers.

## 4. Details

Details are handled one at a time:

1. bullet style;
2. block style;
3. navigation and footer treatment;
4. title-page layout.

Each choice updates the cumulative theme and preview. BeamerForge preserves later selections when they remain compatible and flags them for review when an earlier change makes them invalid.

## 5. Review

Review checks the complete manual design rather than a single screen. Every manual step must be valid before the user can continue.

Confirming Review creates a protected manual baseline associated with the current design cycle and review revision. From here, the user may:

- build the reviewed manual design directly; or
- request an optional AI refinement.

Editing the manual theme after Review begins a new review revision and invalidates stale AI comparisons or final selections.

## 6. Optional AI Refinement

AI refinement begins from the protected manual baseline. It never replaces that baseline silently.

1. Describe the requested change in natural language.
2. Optionally attach PNG, JPEG, WebP, `.tex`, `.sty`, `.cls`, or `.bib` references.
3. Connect OpenAI, DeepSeek, or a compatible provider if no provider is already connected.
4. Create a separate schema-validated suggestion.
5. Compare **Your design** with the **AI suggestion**.
6. Explicitly keep the manual design, accept the suggestion, or revise the request.

References are bounded context. Their contents are not directly compiled or executed. The AI candidate must satisfy the current theme schema and registry before it can enter comparison or selection.

## 7. Build

Build operates only on the explicitly selected, reviewed version.

BeamerForge:

- writes the complete Beamer project;
- copies required local assets and fonts;
- creates a downloadable project archive;
- compiles with the supported LaTeX toolchain when available;
- exposes the compiled PDF as a download after successful compilation;
- retains actionable build diagnostics when compilation fails.

The project remains useful even when no compiler is installed: users can download it and compile it in another LaTeX environment.

## Manual-Only Path

```text
Welcome -> Direction -> Style -> Details -> Review -> Build
```

At Review, choose the reviewed manual design and continue to Build. No provider connection is needed, and no AI state is created.

## AI-Assisted Path

```text
Welcome -> Direction -> Style -> Details -> Review
-> Optional AI refinement -> Compare -> Select manual or AI -> Build
```

The manual baseline remains recoverable throughout AI work. A late, invalid, cancelled, or failed AI response does not alter the selected theme.

## Backward Navigation and Validation

The wizard is cumulative:

- returning to an earlier step does not clear compatible later choices;
- incompatible or missing choices are marked **Needs review**;
- generation is blocked until all manual steps are complete;
- AI routes require a valid protected manual baseline;
- comparison requires both valid manual and AI designs from the same review revision;
- Build requires an explicit manual or AI selection bound to the current cycle, revision, and theme hash.

This prevents an old comparison or selection from being built after the underlying manual design changes.

## Advanced Handoff and Import

Advanced tools support external-agent workflows:

- `/ai-handoff` publishes the protected manual design and bounded references as a portable package;
- `/ai-import` accepts a complete candidate theme from that workflow;
- imported candidates are schema- and registry-validated before comparison;
- advanced routes do not replace the normal in-app refinement journey.

## Outputs

A successful session can provide:

```text
generated project/
|- main.tex
|- theme and content files
|- required fonts and assets
|- customization guidance
`- compiled PDF when available
```

For module boundaries and protected state flow, see [Architecture](ARCHITECTURE.md). For visual quality checks, see the [Design review guide](GUIDE.md).
