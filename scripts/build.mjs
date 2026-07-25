import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const configPath = path.join(root, "site.config.json");
const postsDir = path.join(root, "content", "posts");
const pagesDir = path.join(root, "content", "pages");
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");

const config = JSON.parse(await fs.readFile(configPath, "utf8"));
const baseUrl = normalizeBaseUrl(config.baseUrl || "");
const configuredCategories = normalizeCategories(config.categories || []);

await fs.rm(distDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });
await fs.mkdir(path.join(distDir, "posts"), { recursive: true });
await fs.mkdir(path.join(distDir, "tags"), { recursive: true });
await fs.mkdir(path.join(distDir, "categories"), { recursive: true });
if (await pathExists(publicDir)) {
  await fs.cp(publicDir, distDir, { recursive: true });
}
await fs.copyFile(path.join(root, "src", "styles.css"), path.join(distDir, "styles.css"));
await fs.copyFile(path.join(root, "src", "favicon.svg"), path.join(distDir, "favicon.svg"));
await fs.writeFile(path.join(distDir, ".nojekyll"), "");

const posts = (await readMarkdownFiles(postsDir))
  .map((entry) => {
    const categorySlug = slugify(entry.data.category || "building");

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
      path: `/posts/${post.slug}/`,
      type: "article",
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
      path: `/${slug}/`,
      body: renderPage(page)
    })
  );
}

const tags = collectTags(posts);
const categoryGroups = collectCategories(posts);

await fs.writeFile(
  path.join(distDir, "categories", "index.html"),
  renderLayout({
    title: `Sections - ${config.title}`,
    description: "Browse writing by section.",
    path: "/categories/",
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
      path: `/categories/${category.slug}/`,
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
      path: `/tags/${slugify(tag)}/`,
      body: renderTagPage(tag, taggedPosts)
    })
  );
}

await fs.writeFile(
  path.join(distDir, "index.html"),
  renderLayout({
    title: config.title,
    description: config.description,
    body: renderHome(posts, categoryGroups)
  })
);

await fs.writeFile(
  path.join(distDir, "feed.json"),
  JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: config.title,
      home_page_url: absoluteUrl("/"),
      feed_url: absoluteUrl("/feed.json"),
      items: posts.map((post) => {
        const url = absoluteUrl(`/posts/${post.slug}/`);
        const summary = post.data.summary || "";

        return {
          id: url,
          url,
          title: post.data.title,
          summary,
          content_text: summary,
          date_published: `${post.date}T00:00:00Z`
        };
      })
    },
    null,
    2
  )
);

await fs.writeFile(
  path.join(distDir, "404.html"),
  renderLayout({
    title: `Page not found - ${config.title}`,
    description: "This page does not exist.",
    path: "/404.html",
    body: `
      <section class="archive-head marginalia">
        <p class="caps archive-label">404</p>
        <div>
          <h1>This page went missing.</h1>
          <p>The link may be old, or the page may have moved. Everything that exists is on the home page.</p>
          <a class="back-link caps" href="${withBase("/")}">← All writing</a>
        </div>
      </section>
    `
  })
);

const sitemapPaths = [
  "/",
  ...pages.map((page) => `/${page.data.slug || slugFromFilename(page.filename)}/`),
  "/categories/",
  ...categoryGroups.map((category) => `/categories/${category.slug}/`),
  ...[...tags.keys()].map((tag) => `/tags/${slugify(tag)}/`),
  ...posts.map((post) => `/posts/${post.slug}/`)
];

await fs.writeFile(
  path.join(distDir, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPaths
  .map((pagePath) => {
    const post = posts.find((item) => `/posts/${item.slug}/` === pagePath);
    const lastmod = post ? `\n    <lastmod>${post.updated || post.date}</lastmod>` : "";
    return `  <url>\n    <loc>${absoluteUrl(pagePath)}</loc>${lastmod}\n  </url>`;
  })
  .join("\n")}
</urlset>
`
);

await fs.writeFile(
  path.join(distDir, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl("/sitemap.xml")}\n`
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

function renderHome(homePosts, categories) {
  return `
    <section class="hero marginalia">
      <p class="caps hero-label">Est. 2026<br>Writing · Building</p>
      <div class="hero-copy">
        <h1>Notes on <em>building</em> and <em>learning</em> — written down when they might help someone else finish their own thing.</h1>
        <p class="hero-aside">Project notes, build logs, and lessons from shipping, by a 20-year-old open-source developer.</p>
        <p class="hero-cta">Everything here is built in the open — <a href="${escapeHtml(config.social.github)}" target="_blank" rel="noopener noreferrer">browse the code on GitHub ↗</a></p>
      </div>
    </section>

    <section id="latest" aria-labelledby="latest-writing">
      <div class="section-rule">
        <h2 class="caps" id="latest-writing">Latest writing</h2>
        <span class="caps">${formatCount(homePosts.length)}</span>
      </div>
      <div class="post-list">
        ${homePosts.map(renderPostRow).join("\n") || '<p class="empty-state">No writing yet.</p>'}
      </div>
    </section>

    ${renderSectionsBlock(categories)}
  `;
}

function renderPost(post) {
  return `
    <article class="article">
      <header class="article-head marginalia">
        ${renderArticleMargin(post)}
        <div class="article-intro">
          <h1>${escapeHtml(post.data.title || "Untitled")}</h1>
          ${post.data.summary ? `<p>${escapeHtml(post.data.summary)}</p>` : ""}
        </div>
      </header>
      <div class="article-body marginalia">
        <span aria-hidden="true"></span>
        <div class="content">
          ${markdownToHtml(post.content)}
        </div>
      </div>
      <div class="article-end">
        <span class="ornament" aria-hidden="true">❦</span>
        <a class="back-link caps" href="${withBase("/")}">← All writing</a>
      </div>
    </article>
  `;
}

function renderPage(page) {
  return `
    <article class="page marginalia">
      <p class="caps page-label">About</p>
      <div class="page-prose">
        <h1>${escapeHtml(page.data.title || "Untitled")}</h1>
        <div class="content">
          ${markdownToHtml(page.content)}
        </div>
      </div>
    </article>
  `;
}

function renderTagPage(tag, taggedPosts) {
  return `
    ${renderArchiveHeader("Tag", tag, `${formatCount(taggedPosts.length)} tagged here.`)}
    <div class="post-list archive-list">
      ${taggedPosts.map(renderPostRow).join("\n")}
    </div>
  `;
}

function renderCategoriesIndexPage(categories) {
  return `
    ${renderArchiveHeader("Browse", "Sections", "Tools, technical writing, and notes from learning by shipping.")}
    ${renderSectionsBlock(categories, false)}
  `;
}

function renderCategoryPage(category) {
  return `
    ${renderArchiveHeader("Section", category.label, category.description)}
    <div class="post-list archive-list">
      ${category.posts.map(renderPostRow).join("\n")}
    </div>
  `;
}

function renderArchiveHeader(label, title, description) {
  return `
    <section class="archive-head marginalia">
      <p class="caps archive-label">${escapeHtml(label)}</p>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
      </div>
    </section>
  `;
}

function renderSectionsBlock(categories, showLabel = true) {
  return `
    <section class="sections-block marginalia" ${showLabel ? 'aria-labelledby="sections-heading"' : 'aria-label="Sections"'}>
      ${showLabel ? '<h2 class="caps" id="sections-heading">Sections</h2>' : '<span aria-hidden="true"></span>'}
      <nav class="section-list" ${showLabel ? 'aria-labelledby="sections-heading"' : 'aria-label="Sections"'}>
        ${categories.map(renderCategoryRow).join("\n")}
      </nav>
    </section>
  `;
}

function renderCategoryRow(category) {
  return `
    <a class="section-row" href="${withBase(`/categories/${category.slug}/`)}">
      <span>${escapeHtml(category.label)}</span>
      <small>${formatCount(category.posts.length)}</small>
    </a>
  `;
}

function renderPostRow(post) {
  const postUrl = withBase(`/posts/${post.slug}/`);
  const title = post.data.title || "Untitled";

  return `
    <a class="post-row marginalia" href="${postUrl}">
      <span class="post-margin">
        <time class="caps" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
        <span class="caps post-category">${escapeHtml(post.category.label)}</span>
      </span>
      <span class="post-copy">
        <h3 class="post-title">${escapeHtml(title)}</h3>
        <span class="post-summary">${escapeHtml(post.data.summary || "")}</span>
      </span>
    </a>
  `;
}

function renderArticleMargin(post) {
  return `
    <div class="article-margin caps">
      <time datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
      <a class="article-category" href="${withBase(`/categories/${post.category.slug}/`)}">${escapeHtml(post.category.label)}</a>
      ${post.updated && post.updated !== post.date ? `<span>Updated <time datetime="${escapeHtml(post.updated)}">${formatDate(post.updated)}</time></span>` : ""}
      ${post.tags.length ? `<nav class="article-tags" aria-label="Article tags">${post.tags
        .map((tag) => `<a href="${withBase(`/tags/${slugify(tag)}/`)}">${escapeHtml(tag)}</a>`)
        .join("")}</nav>` : ""}
    </div>
  `;
}

function renderLayout({ title, description, body, path: pagePath = "/", type = "website" }) {
  const socialNavLinks = getSocialLinks().map(renderHeaderSocialAnchor).join("");
  const footerSocialLinks = getSocialLinks()
    .map((link) => `<a href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${absoluteUrl(pagePath)}">
    <meta property="og:site_name" content="${escapeHtml(config.title)}">
    <meta property="og:type" content="${type}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${absoluteUrl(pagePath)}">
    <meta name="twitter:card" content="summary">
    <link rel="icon" type="image/svg+xml" href="${withBase("/favicon.svg")}">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
    <link rel="alternate" type="application/feed+json" title="${escapeHtml(config.title)}" href="${absoluteUrl("/feed.json")}">
    <link rel="stylesheet" href="${withBase("/styles.css")}">
  </head>
  <body>
    <div class="site-shell">
      <header class="site-header">
        <a class="name" href="${withBase("/")}">Ullas</a>
        <nav class="site-nav caps" aria-label="Primary navigation">
          ${config.nav.map((item) => `<a href="${withBase(item.href)}">${escapeHtml(item.label)}</a>`).join("")}
          ${socialNavLinks}
        </nav>
      </header>
      <main>
        ${body}
      </main>
      <footer class="site-footer">
        <span class="footer-mark">❦ © 2026 Ullas</span>
        <nav class="caps" aria-label="Footer navigation">
          ${footerSocialLinks}
          <a href="${withBase("/feed.json")}">RSS</a>
        </nav>
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

function renderHeaderSocialAnchor(link) {
  return `<a class="btn" href="${escapeHtml(link.href)}" aria-label="${escapeHtml(link.label)} profile" target="_blank" rel="noopener noreferrer">${renderSocialIcon(link.id)}<span>${escapeHtml(link.label)}</span></a>`;
}

function renderSocialIcon(id) {
  if (id === "github") {
    return `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`;
  }

  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
}

function markdownToHtml(markdown) {
  const lines = markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const html = [];
  let paragraph = [];
  let listType = null;
  let inCode = false;
  let codeLines = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const source = paragraph.join(" ");
    const className = isConsecutiveLinkParagraph(source) ? ' class="post-links"' : "";
    html.push(`<p${className}>${inlineMarkdown(source)}</p>`);
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

    const figure = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/);
    if (figure) {
      flushParagraph();
      closeList();
      const [variant = "", caption = ""] = (figure[3] || "").split("|", 2);
      const className = variant === "portrait" ? " article-figure--portrait" : "";
      const source = figure[2].startsWith("/") ? withBase(figure[2]) : figure[2];
      html.push(`
        <figure class="article-figure${className}">
          <img src="${escapeHtml(source)}" alt="${escapeHtml(figure[1])}">
          ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
        </figure>
      `);
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

    if (listType && /^\s{2,}\S/.test(line) && html.at(-1)?.startsWith("<li>")) {
      html[html.length - 1] = html.at(-1).replace(/<\/li>$/, ` ${inlineMarkdown(trimmed)}</li>`);
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

function isConsecutiveLinkParagraph(text) {
  const links = text.match(/\[[^\]]+\]\([^)]+\)/g) || [];
  if (links.length < 2) return false;
  return text.replace(/\[[^\]]+\]\([^)]+\)/g, "").trim() === "";
}

function inlineMarkdown(text) {
  const codeSpans = [];
  let output = text.replace(/`([^`]+)`/g, (_, code) => {
    const token = `@@CODE${codeSpans.length}@@`;
    codeSpans.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  output = escapeHtml(output);
  output = output.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    if (!/^(?:https?:\/\/|\/|#|mailto:)/.test(href)) return label;
    const resolvedHref = href.startsWith("/") ? withBase(href) : href;
    return `<a href="${resolvedHref}">${label}</a>`;
  });
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

async function pathExists(targetPath) {
  return fs.stat(targetPath).then(() => true).catch(() => false);
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

  return [...grouped.values()].filter((category) => category.posts.length > 0);
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
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T00:00:00Z`));
}

function formatCount(value) {
  return `${value} ${value === 1 ? "piece" : "pieces"}`;
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
