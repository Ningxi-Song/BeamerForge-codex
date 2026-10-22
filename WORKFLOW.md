# Template Catalog Workflow

The catalog has one workflow:

```text
Add recipe folder → Refresh catalog → Read introduction → Inspect previews
```

## Add a recipe

Create `recipes/<template-name>/` and place the complete template folder there. Write a `README.md` that introduces the template in the same spirit as the existing recipes: describe its inspiration, visual tone, best use cases, fonts, navigation, blocks, title page, and any other useful design notes.

Include `main.pdf` for the complete presentation and `preview-contact-sheet.png` for the combined preview. Optionally include root-level `page01.png`, `page02.png`, and similar files for slide previews. Supporting `.tex`, `.sty`, `.cls`, `.bib`, font, and image files may remain in the same folder.

## Browse a recipe

The home page lists every valid direct child folder of `recipes/`. Select a card to open its introduction and previews. Use **All templates** to return to the catalog.

The browser reads recipe metadata through read-only `GET` requests. There are no forms, design controls, AI controls, build controls, upload controls, or write endpoints.

## File rules

- Folder names use letters, numbers, hyphens, and underscores.
- Published recipes require `README.md`, `main.pdf`, and `preview-contact-sheet.png`.
- Follow the shared README section order documented in the root README, including the same Downloads links.
- Run `npm run check` and `npm test` before publishing to catch missing files and inconsistent delivery.
- `main.pdf` is the recognized full-preview filename.
- PNG, JPEG, and WebP files at the recipe root are recognized as slide previews.
- The catalog never compiles or changes recipe source files.
