"use strict";

const catalogGrid = document.getElementById("catalogGrid");
const catalogStatus = document.getElementById("catalogStatus");
const catalogView = document.getElementById("catalogView");
const recipeDetail = document.getElementById("recipeDetail");
const recipeIntroduction = document.getElementById("recipeIntroduction");
const recipePdf = document.getElementById("recipePdf");
const pdfViewer = document.getElementById("pdfViewer");
const recipeImages = document.getElementById("recipeImages");
const imageGallery = document.getElementById("imageGallery");
const noPreview = document.getElementById("noPreview");

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function renderMarkdown(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const output = [];
  let list = [];
  const flushList = () => { if (list.length) { output.push(`<ul>${list.join("")}</ul>`); list = []; } };
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushList(); continue; }
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) { flushList(); const level = heading[1].length; output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue; }
    const item = trimmed.match(/^[-*]\s+(.+)$/);
    if (item) { list.push(`<li>${inlineMarkdown(item[1])}</li>`); continue; }
    flushList(); output.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }
  flushList();
  return output.join("");
}

function inlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, target) => {
    if (/^(?:https?:|mailto:)/i.test(target)) return `<a href="${escapeHtml(target)}" rel="noreferrer">${label}</a>`;
    return label;
  });
  return html;
}

function assetUrl(recipe, asset) {
  return `/recipes/${encodeURIComponent(recipe.slug)}/${asset.split("/").map(encodeURIComponent).join("/")}`;
}

function renderCard(recipe) {
  const card = document.createElement("article");
  card.className = "recipe-card";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "recipe-card-button";
  button.innerHTML = `<span class="card-preview" aria-hidden="true">${recipe.images[0] ? `<img src="${assetUrl(recipe, recipe.images[0])}" alt="">` : "<span class=\"card-placeholder\">Beamer</span>"}</span><span class="card-copy"><strong>${escapeHtml(recipe.title)}</strong><span>${recipe.pdf ? "PDF preview available" : `${recipe.images.length} image preview${recipe.images.length === 1 ? "" : "s"}`}</span></span>`;
  button.addEventListener("click", () => openRecipe(recipe.slug));
  card.appendChild(button);
  return card;
}

async function openRecipe(slug) {
  try {
    const recipe = await getJson(`/api/recipes/${encodeURIComponent(slug)}`);
    recipeIntroduction.innerHTML = renderMarkdown(recipe.readme || `# ${recipe.title}`);
    pdfViewer.removeAttribute("data");
    imageGallery.replaceChildren();
    recipePdf.hidden = !recipe.pdf;
    recipeImages.hidden = recipe.images.length === 0;
    noPreview.hidden = Boolean(recipe.pdf || recipe.images.length);
    if (recipe.pdf) pdfViewer.data = assetUrl(recipe, recipe.pdf);
    for (const image of recipe.images) {
      const figure = document.createElement("figure");
      const img = document.createElement("img");
      img.src = assetUrl(recipe, image); img.alt = `${recipe.title} preview ${image}`; img.loading = "lazy";
      const caption = document.createElement("figcaption"); caption.textContent = image;
      figure.append(img, caption); imageGallery.appendChild(figure);
    }
    history.pushState({ slug }, "", `?recipe=${encodeURIComponent(slug)}`);
    catalogView.hidden = true;
    recipeDetail.hidden = false;
    document.getElementById("backToCatalog").focus();
  } catch (error) {
    catalogStatus.textContent = error.message;
  }
}

function showCatalog() {
  history.pushState({}, "", window.location.pathname);
  recipeDetail.hidden = true;
  catalogView.hidden = false;
  catalogGrid.querySelector("button")?.focus();
}

async function boot() {
  try {
    const recipes = await getJson("/api/recipes");
    catalogGrid.replaceChildren(...recipes.map(renderCard));
    catalogStatus.textContent = `${recipes.length} template${recipes.length === 1 ? "" : "s"}`;
    const slug = new URLSearchParams(window.location.search).get("recipe");
    if (slug) await openRecipe(slug);
    document.getElementById("backToCatalog").addEventListener("click", showCatalog);
    window.addEventListener("popstate", () => {
      const current = new URLSearchParams(window.location.search).get("recipe");
      if (current) openRecipe(current); else { recipeDetail.hidden = true; catalogView.hidden = false; }
    });
  } catch (error) {
    catalogStatus.textContent = error.message;
    catalogGrid.innerHTML = `<p class="empty-state">The catalog could not be loaded.</p>`;
  }
}

boot();
