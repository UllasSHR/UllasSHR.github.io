import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "site.config.json");
const postsDir = path.join(root, "content", "posts");
const pagesDir = path.join(root, "content", "pages");
const distDir = path.join(root, "dist");

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const baseUrl = normalizeBaseUrl(config.baseUrl || "");
const configuredCategories = normalizeCategories(config.categories || []);

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });
await fs.mkdir(path.join(distDir, "posts"), { recursive: true });
await fs.mkdir(path.join(distDir, "tags"), { recursive: true });
await fs.mkdir(path.join(distDir, "categories"), { recursive: true });
await fs.copyFile(path.join(root, "src", "styles.css"), path.join(distDir, "styles.css"));
await fs.writeFile(path.join(distDir, ".nojekyll"), "");

const posts = (await readMarkdownFiles(postsDir))
  .map((entry) => {
    const categorySlug = slugify(entry.data.category || "essays");

    return {
      ...entry,
      slug: entry.data.slug || slugFromFilename(entry.filename),
      date: entry.data.date || "1970-01-01",
      updated: entry.data.updated || "",
      category: getCategory(categorySlug),
      tags: entry.data.tags || []
    };
  })
  .filter((post) => !post.data.draft)
  .sort((a, b) => b.date.localeCompare(a.date));

const pages = await readMarkdownFiles(pagesDir);

for (const post of posts) {
  const outputDir = path.join(distDir, "posts", post.slug);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, "index.html"),
    renderLayout({
      title: `${post.data.title} - ${config.title}`,
      description: post.data.summary || config.description,
      body: renderPost(post)
    })
  );
}

for (const page of pages) {
  const slug = page.data.slug || slugFromFilename(page.filename);
  const outputDir = path.join(distDir, slug);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, "index.html"),
    renderLayout({
      title: `${page.data.title} - ${config.title}`,
      description: page.data.summary || config.description,
      body: renderPage(page)
    })
  );
}

const tags = collectTags(posts);
const categoryGroups = collectCategories(posts);

await fs.writeFile(
  path.join(distDir, "categories", "index.html"),
  renderLayout({
    title: `Categories - ${config.title}`,
    description: "Browse writing by category.",
    body: renderCategoriesIndexPage(categoryGroups)
  })
);

for (const category of categoryGroups) {
  const outputDir = path.join(distDir, "categories", category.slug);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, "index.html"),
    renderLayout({
      title: `${category.label} - ${config.title}`,
      description: category.description,
      body: renderCategoryPage(category)
    })
  );
}

for (const [tag, taggedPosts] of tags) {
  const outputDir = path.join(distDir, "tags", slugify(tag));
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(
    path.join(outputDir, "index.html"),
    renderLayout({
      title: `${tag} - ${config.title}`,
      description: `Posts tagged ${tag}.`,
      body: renderTagPage(tag, taggedPosts)
    })
  );
}

await fs.writeFile(
  path.join(distDir, "index.html"),
  renderLayout({
    title: config.title,
    description: config.description,
    body: renderHome(posts, tags, categoryGroups)
  })
);

await fs.writeFile(
  path.join(distDir, "feed.json"),
  JSON.stringify(
    posts.map((post) => ({
      title: post.data.title,
      date: post.date,
      updated: post.updated,
      summary: post.data.summary || "",
      category: post.category.label,
      tags: post.tags,
      url: absoluteUrl(`/posts/${post.slug}/`)
    })),
    null,
    2
  )
);

console.log(`Built ${posts.length} posts, ${pages.length} pages, and ${categoryGroups.length} categories into dist/`);

async function readMarkdownFiles(directory) {
  const files = await fs.readdir(directory).catch(() => []);
  const markdownFiles = files.filter((file) => file.endsWith(".md")).sort();

  return Promise.all(
    markdownFiles.map(async (filename) => {
      const raw = await fs.readFile(path.join(directory, filename), "utf8");
      const { data, content } = parseFrontmatter(raw);
      return { filename, data, content };
    })
  );
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, content: raw };
  }

  const data = {};
  for (const line of match[1].split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    data[key] = parseValue(rawValue);
  }

  return { data, content: match[2].trim() };
}

function parseValue(value) {
  if (value === "true") return true;
  if (value === "false") return false;

  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }

  return stripQuotes(value);
}

function stripQuotes(value) {
  return value.replace(/^["']|["']$/g, "");
}

function renderHome(homePosts, tags, categories) {
  const postCards = homePosts.map(renderPostCard).join("\n");
  const categoryCards = categories.map(renderCategoryCard).join("\n");
  const tagLinks = [...tags.keys()]
    .map((tag) => `<a class="tag" href="${withBase(`/tags/${slugify(tag)}/`)}">${escapeHtml(tag)}</a>`)
    .join("");
  const socialLinks = renderSocialLinks();

  return `
    <section class="hero">
      <p class="eyebrow">Personal writing</p>
      <h1>${escapeHtml(config.title)}</h1>
      <p>${escapeHtml(config.description)}</p>
      ${socialLinks}
    </section>

    <section class="section-heading" aria-labelledby="all-categories">
      <div>
        <h2 id="all-categories">Sections</h2>
        <p>Choose the main bucket for what you are writing.</p>
      </div>
    </section>

    <div class="category-grid">
      ${categoryCards}
    </div>

    <section class="section-heading" aria-labelledby="all-tags">
      <div>
        <h2 id="all-tags">Tags</h2>
        <p>Browse by theme.</p>
      </div>
    </section>

    <nav class="tag-list" aria-label="Tags">${tagLinks}</nav>
  `;
}

function renderPost(post) {
  return `
    <article class="article">
      <p class="eyebrow">Writing</p>
      <h1>${escapeHtml(post.data.title || "Untitled")}</h1>
      ${renderArticleDetails(post)}
      <div class="content">
        ${markdownToHtml(post.content)}
      </div>
      <a class="back-link" href="${withBase("/")}">Back to all writing</a>
    </article>
  `;
}

function renderPage(page) {
  return `
    <article class="article">
      <p class="eyebrow">Page</p>
      <h1>${escapeHtml(page.data.title || "Untitled")}</h1>
      <div class="content">
        ${markdownToHtml(page.content)}
      </div>
    </article>
  `;
}

function renderTagPage(tag, taggedPosts) {
  return `
    <section class="hero">
      <p class="eyebrow">Tag</p>
      <h1>${escapeHtml(tag)}</h1>
      <p>${taggedPosts.length} ${taggedPosts.length === 1 ? "piece" : "pieces"} saved here.</p>
    </section>
    <div class="post-list">
      ${taggedPosts.map(renderPostCard).join("\n")}
    </div>
  `;
}

function renderCategoriesIndexPage(categories) {
  return `
    <section class="hero">
      <p class="eyebrow">Browse</p>
      <h1>Categories</h1>
      <p>Each post has one main category, so the site stays easy to scan as it grows.</p>
    </section>
    <div class="category-grid">
      ${categories.map(renderCategoryCard).join("\n")}
    </div>
  `;
}

function renderCategoryPage(category) {
  return `
    <section class="hero">
      <p class="eyebrow">Category</p>
      <h1>${escapeHtml(category.label)}</h1>
      <p>${escapeHtml(category.description)} ${category.posts.length} ${category.posts.length === 1 ? "piece" : "pieces"} here.</p>
    </section>
    <div class="post-list">
      ${category.posts.map(renderPostCard).join("\n") || "<p>No posts in this category yet.</p>"}
    </div>
  `;
}

function renderCategoryCard(category) {
  return `
    <article class="category-card">
      <a href="${withBase(`/categories/${category.slug}/`)}">
        <span>${escapeHtml(category.label)}</span>
        <small>${escapeHtml(category.description)}</small>
        <strong>${category.posts.length} ${category.posts.length === 1 ? "piece" : "pieces"}</strong>
      </a>
    </article>
  `;
}

function renderPostCard(post) {
  return `
    <article class="post-card">
      <h2><a href="${withBase(`/posts/${post.slug}/`)}">${escapeHtml(post.data.title || "Untitled")}</a></h2>
      ${renderMeta(post)}
      <p class="post-summary">${escapeHtml(post.data.summary || "")}</p>
      ${renderTags(post.tags)}
    </article>
  `;
}

function renderMeta(post) {
  const parts = [
    `<time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>`,
    post.category
      ? `<a class="category-link" href="${withBase(`/categories/${post.category.slug}/`)}">${escapeHtml(post.category.label)}</a>`
      : "",
    post.tags.length ? `<span>${post.tags.length} tags</span>` : ""
  ].filter(Boolean);

  return `
    <p class="post-meta">
      ${parts.join("\n")}
    </p>
  `;
}

function renderArticleDetails(post) {
  const detailItems = [
    {
      label: "Posted",
      value: `<time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>`
    },
    post.updated && post.updated !== post.date
      ? {
          label: "Updated",
          value: `<time datetime="${escapeHtml(post.updated)}">${formatDate(post.updated)}</time>`
        }
      : null,
    post.category
      ? {
          label: "Category",
          value: `<a class="category-link" href="${withBase(`/categories/${post.category.slug}/`)}">${escapeHtml(post.category.label)}</a>`
        }
      : null,
    post.tags.length
      ? {
          label: "Tags",
          value: `<span class="article-detail-tags">${post.tags
            .map((tag) => `<a class="tag" href="${withBase(`/tags/${slugify(tag)}/`)}">${escapeHtml(tag)}</a>`)
            .join("")}</span>`
        }
      : null
  ].filter(Boolean);

  return `
    <section class="article-details" aria-label="Article details">
      <div class="article-detail-grid">
        ${detailItems
          .map(
            (item) => `
              <div class="article-detail">
                <span>${escapeHtml(item.label)}</span>
                <strong>${item.value}</strong>
              </div>
            `
          )
          .join("")}
      </div>
      ${post.data.summary ? `<p>${escapeHtml(post.data.summary)}</p>` : ""}
    </section>
  `;
}

function renderTags(tags) {
  if (!tags.length) return "";

  return `
    <nav class="tag-list" aria-label="Post tags">
      ${tags
        .map((tag) => `<a class="tag" href="${withBase(`/tags/${slugify(tag)}/`)}">${escapeHtml(tag)}</a>`)
        .join("")}
    </nav>
  `;
}

function renderLayout({ title, description, body }) {
  const socialNavLinks = getSocialLinks()
    .map((link) => renderSocialAnchor(link, "nav-social-link"))
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="stylesheet" href="${withBase("/styles.css")}">
  </head>
  <body>
    <div class="site-shell">
      <header class="site-header">
        <a class="brand" href="${withBase("/")}">
          <span class="brand-title">${escapeHtml(config.title)}</span>
          <span class="brand-subtitle">${escapeHtml(config.author)}</span>
        </a>
        <nav class="nav" aria-label="Primary navigation">
          ${config.nav.map((item) => `<a href="${withBase(item.href)}">${escapeHtml(item.label)}</a>`).join("")}
          ${socialNavLinks}
        </nav>
      </header>
      <main>
        ${body}
      </main>
      <footer class="site-footer">
        <span>A basic place for longer writing. Last generated ${new Date().toISOString().slice(0, 10)}.</span>
      </footer>
    </div>
  </body>
</html>`;
}

function getSocialLinks() {
  return [
    config.social?.github ? { id: "github", label: "GitHub", href: config.social.github } : null,
    config.social?.twitter || config.social?.x
      ? { id: "x", label: "X", href: config.social.twitter || config.social.x }
      : null
  ].filter(Boolean);
}

function renderSocialLinks() {
  const links = getSocialLinks();
  if (!links.length) return "";

  return `
    <nav class="social-links" aria-label="Social links">
      ${links.map((link) => renderSocialAnchor(link, "social-link")).join("")}
    </nav>
  `;
}

function renderSocialAnchor(link, className) {
  return `<a class="${className}" href="${escapeHtml(link.href)}" aria-label="${escapeHtml(link.label)} profile" title="${escapeHtml(link.label)} profile" target="_blank" rel="noopener noreferrer">${renderSocialIcon(link.id)}<span>${escapeHtml(link.label)}</span></a>`;
}

function renderSocialIcon(id) {
  if (id === "github") {
    return `<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2C6.48 2 2 6.58 2 12.24c0 4.52 2.87 8.35 6.84 9.71.5.09.68-.22.68-.49v-1.73c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.55-1.14-4.55-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.33 9.33 0 0 1 12 6.98c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.95.68 1.91v2.77c0 .27.18.59.69.49A10.08 10.08 0 0 0 22 12.24C22 6.58 17.52 2 12 2Z"/></svg>`;
  }

  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M18.9 2.7h3.2l-7 8 8.2 10.8h-6.4l-5-6.5-5.7 6.5H3l7.5-8.6L2.6 2.7h6.6l4.5 5.9 5.2-5.9Zm-1.1 16.9h1.8L8.2 4.5H6.3l11.5 15.1Z"/></svg>`;
}

function markdownToHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        flushParagraph();
        closeList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushParagraph();
      closeList();
      html.push(`<blockquote><p>${inlineMarkdown(trimmed.slice(2))}</p></blockquote>`);
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== "ul") {
        closeList();
        html.push("<ul>");
        listType = "ul";
      }
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== "ol") {
        closeList();
        html.push("<ol>");
        listType = "ol";
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  return html.join("\n");
}

function inlineMarkdown(text) {
  const codeSpans = [];
  let output = text.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${codeSpans.length}@@`;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  output = escapeHtml(output);
  output = output.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  output = output.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  output = output.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  for (const [index, code] of codeSpans.entries()) {
    output = output.replace(`@@CODE${index}@@`, code);
  }

  return output;
}

function normalizeCategories(categories) {
  return categories.map((category) => ({
    slug: slugify(category.slug),
    label: category.label,
    description: category.description || ""
  }));
}

function getCategory(slug) {
  const normalizedSlug = slugify(slug);
  const category = configuredCategories.find((item) => item.slug === normalizedSlug);

  if (category) return category;

  return {
    slug: normalizedSlug,
    label: titleCase(normalizedSlug.replace(/-/g, " ")),
    description: "Writing that does not fit the default sections yet."
  };
}

function collectCategories(categoryPosts) {
  const grouped = new Map();

  for (const category of configuredCategories) {
    grouped.set(category.slug, { ...category, posts: [] });
  }

  for (const post of categoryPosts) {
    const existing = grouped.get(post.category.slug) || { ...post.category, posts: [] };
    existing.posts.push(post);
    grouped.set(post.category.slug, existing);
  }

  return [...grouped.values()];
}

function collectTags(taggedPosts) {
  const tags = new Map();
  for (const post of taggedPosts) {
    for (const tag of post.tags) {
      const postsForTag = tags.get(tag) || [];
      postsForTag.push(post);
      tags.set(tag, postsForTag);
    }
  }

  return new Map([...tags.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, (character) => character.toUpperCase());
}

function slugFromFilename(filename) {
  return filename
    .replace(/\.md$/, "")
    .replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00Z`));
}

function normalizeBaseUrl(value) {
  if (!value || value === "/") return "";
  return `/${value.replace(/^\/+|\/+$/g, "")}`;
}

function withBase(href) {
  if (/^https?:\/\//.test(href)) return href;
  return `${baseUrl}${href}`;
}

function absoluteUrl(href) {
  const siteUrl = (config.url || "").replace(/\/$/, "");
  return `${siteUrl}${withBase(href)}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
