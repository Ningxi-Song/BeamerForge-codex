# Template Catalog Workflow

The catalog has one workflow:

```text
Add recipe folder → Refresh catalog → Read introduction → Inspect previews
```

## Add a recipe

Create `recipes/<template-name>/` and place the complete template folder there. Write a `README.md` that introduces the template in the same spirit as the existing recipes: describe its inspiration, visual tone, best use cases, fonts, navigation, blocks, title page, and any other useful design notes.

Include `main.pdf` for a full presentation preview and/or root-level `page01.png`, `page02.png`, and similar files for slide previews. Supporting `.tex`, `.sty`, `.cls`, `.bib`, font, and image files may remain in the same folder.

## Browse a recipe

The home page lists every valid direct child folder of `recipes/`. Select a card to open its introduction and previews. Use **All templates** to return to the catalog.

The browser reads recipe metadata through read-only `GET` requests. There are no forms, design controls, AI controls, build controls, upload controls, or write endpoints.

## File rules

- Folder names use letters, numbers, hyphens, and underscores.
- `README.md` is optional but recommended.
- `main.pdf` is the recognized full-preview filename.
- PNG, JPEG, and WebP files at the recipe root are recognized as slide previews.
- The catalog never compiles or changes recipe source files.
