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
await fs.copyFile(path.join(root, "src", "site.js"), path.join(distDir, "site.js"));
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
const timeline = JSON.parse(await fs.readFile(path.join(root, "content", "timeline.json"), "utf8"));

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
      published: post.date,
      updated: post.updated || post.date,
      image: getFirstImage(post.content),
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
    body: renderHome(posts)
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
          date_published: `${post.date}T00:00:00Z`,
          date_modified: `${post.updated || post.date}T00:00:00Z`
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

function renderHome(homePosts) {
  const hiddenSlugs = new Set(["breathe", "launchguard", "computer-use-on-codex"]);
  const listedPosts = homePosts.filter((post) => !hiddenSlugs.has(post.slug));
  return `
    <section class="home-hero">
      <div class="home-intro">
        <h1>Hi, I'm <em>Ullas</em>.</h1>
        <p class="home-lines">I like AI and infrastructure.<br>I work on the backend with Go, Kubernetes and Postgres.<br>I contribute to <a href="https://github.com/search?q=org%3Aopeneverest+author%3AUllasSHR+is%3Apr+is%3Amerged&amp;type=pullrequests">OpenEverest</a>.</p>
        <p class="chip-row"><a class="chip chip-solid chip-down" href="#work">See the work</a></p>
      </div>
      ${renderLab()}
    </section>

    ${renderWorkSection("work", "Open source", "Merged work", [
      {
        eyebrow: "2026 · Go",
        title: "OpenEverest",
        description: "An open-source database platform on Kubernetes. I ran my failover test through its Postgres provider and found the connection secret pointing at a service with no pods. I reported it and fixed it in Go.",
        links: [
          { label: "The bug", href: "https://github.com/openeverest/provider-percona-postgresql/issues/50" },
          { label: "The fix", href: "https://github.com/openeverest/provider-percona-postgresql/pull/52" }
        ]
      }
    ])}

    ${renderWorkSection("projects", "Projects", "Things I built", [
      {
        eyebrow: "2026 · Kubernetes",
        title: "Last Seat",
        description: "One seat, many clients. I kill servers and databases on Kubernetes to see what stays correct.",
        links: [
          { label: "On Kubernetes", href: withBase("/posts/last-seat-on-kubernetes/") },
          { label: "The first lab", href: withBase("/posts/last-seat-lab/") },
          { label: "Code", href: "https://github.com/UllasSHR/last-seat-k8s" }
        ]
      },
      {
        eyebrow: "2026 · Go",
        title: "pg-cutover",
        description: "A Go CLI that shows what a Postgres failover does to open and new connections. Built with an AI agent. The drill logs are in the repo.",
        links: [{ label: "Code", href: "https://github.com/UllasSHR/pg-cutover" }]
      },
      {
        eyebrow: "2026 · macOS",
        title: "Moves",
        description: "Scroll your Mac with hand gestures. The camera tracks your hand locally.",
        links: [
          { label: "Code", href: "https://github.com/UllasSHR/moves" },
          { label: "Demo", href: "https://x.com/UllasSHR/status/2106083708357038333" }
        ]
      }
    ])}

    ${renderTimeline()}

    <section class="home-block" id="writing" aria-labelledby="writing-heading">
      <div class="section-rule">
        <h2 class="caps" id="writing-heading">Writing</h2>
        <span class="caps">Newest first</span>
      </div>
      <div class="writing-list">
        ${listedPosts.map((post) => `
          <a href="${withBase(`/posts/${post.slug}/`)}">
            <span>${escapeHtml(post.data.title || "Untitled")}</span>
            <time class="caps" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
          </a>`).join("\n") || '<p class="empty-state">No writing yet.</p>'}
      </div>
    </section>
  `;
}

function renderLab() {
  return `
      <div class="lab" aria-label="A small live model of my Postgres failover lab">
        <div class="lab-top">
          <span class="caps">Last Seat · 3 Postgres instances</span>
          <button class="lab-kill" id="lab-kill" type="button">Kill the primary</button>
        </div>
        <svg id="lab-stage" viewBox="0 0 420 292" role="img" aria-label="Clients send bookings through seat-api to the Postgres primary. Two replicas stand by.">
          <defs><pattern id="lab-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="rgba(236,229,214,0.07)"/></pattern></defs>
          <rect x="-4" y="-4" width="428" height="300" fill="url(#lab-dots)"/>
          <g id="lab-wires"></g>
          <g>
            <circle class="node" cx="22" cy="86" r="7"/><circle class="node" cx="22" cy="146" r="7"/><circle class="node" cx="22" cy="206" r="7"/>
            <text class="lbl" x="22" y="240" text-anchor="middle">clients</text>
            <rect class="node" x="104" y="117" width="104" height="58" rx="12"/>
            <text class="pname" x="156" y="143" text-anchor="middle">seat-api</text>
            <text class="lbl" id="lab-api-state" x="156" y="161" text-anchor="middle">booking</text>
          </g>
          <g id="lab-pods"></g>
          <g id="lab-pkts"></g>
        </svg>
        <p class="lab-status" id="lab-status" aria-live="polite">Healthy. Bookings go to the primary.</p>
        <div class="lab-counts caps">
          <span>Gap<b id="lab-gap">–</b></span>
          <span>Retries<b id="lab-retries">0</b></span>
          <span>Errors<b>0</b></span>
          <span>Winners<b>1</b></span>
        </div>
        <p class="lab-real">This is a model. My real test on 19 Oct 2026: about 2 s gap, 167 retries, 0 errors, 1 winner. <a href="${withBase("/posts/last-seat-on-kubernetes/")}">Read how</a></p>
      </div>`;
}

function renderWorkSection(id, heading, aside, items) {
  return `
    <section class="home-block" id="${id}" aria-labelledby="${id}-heading">
      <div class="section-rule selected-work-rule">
        <h2 class="caps" id="${id}-heading">${escapeHtml(heading)}</h2>
        <span class="caps">${escapeHtml(aside)}</span>
      </div>
      <div class="selected-list">
        ${items.map((item) => `
          <article class="selected-item marginalia">
            <p class="caps selected-eyebrow">${escapeHtml(item.eyebrow)}</p>
            <div class="selected-copy">
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.description)}</p>
              <p class="chip-row">${item.links.map(renderChip).join("")}</p>
            </div>
          </article>
        `).join("\n")}
      </div>
    </section>
  `;
}

function renderChip(link) {
  const external = /^https?:\/\//.test(link.href);
  return `<a class="chip" href="${escapeHtml(link.href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(link.label)}</a>`;
}

function renderTimeline() {
  return `
    <section class="home-block" id="updates" aria-labelledby="updates-heading">
      <div class="section-rule section-rule-action">
        <h2 class="caps" id="updates-heading">Updates</h2>
        <button class="chip chip-down" id="timeline-more" type="button" aria-expanded="false">Full timeline</button>
      </div>
      <div class="timeline" id="timeline">
        ${timeline.map((entry) => {
          const href = entry.href ? (entry.href.startsWith("/") ? withBase(entry.href) : entry.href) : "";
          const external = /^https?:\/\//.test(href);
          const title = href
            ? `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHtml(entry.title)}</a>`
            : escapeHtml(entry.title);
          return `
          <div class="tl marginalia${entry.big ? " tl-big" : ""}${entry.more ? " tl-more" : ""}">
            <span class="tl-when caps">${escapeHtml(entry.when)}</span>
            <div class="tl-what"><h3>${title}</h3>${entry.note ? `<p>${escapeHtml(entry.note)}</p>` : ""}</div>
          </div>`;
        }).join("\n")}
      </div>
    </section>
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
      ${taggedPosts.map((post) => renderPostRow(post, 2)).join("\n")}
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
      ${category.posts.map((post) => renderPostRow(post, 2)).join("\n")}
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

function renderPostRow(post, headingLevel = 3) {
  const postUrl = withBase(`/posts/${post.slug}/`);
  const title = post.data.title || "Untitled";

  return `
    <a class="post-row marginalia" href="${postUrl}">
      <span class="post-margin">
        <time class="caps" datetime="${escapeHtml(post.date)}">${formatDate(post.date)}</time>
        <span class="caps post-category">${escapeHtml(post.category.label)}</span>
      </span>
      <span class="post-copy">
        <h${headingLevel} class="post-title">${escapeHtml(title)}</h${headingLevel}>
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

function renderLayout({ title, description, body, path: pagePath = "/", type = "website", published = "", updated = "", image = "" }) {
  const socialNavLinks = getSocialLinks().map(renderHeaderSocialAnchor).join("");
  const socialImage = image || "/images/last-seat-lab/cover.jpg";
  const socialImageUrl = /^https?:\/\//.test(socialImage) ? socialImage : absoluteUrl(socialImage);
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
    <meta property="og:image" content="${escapeHtml(socialImageUrl)}">
    <meta property="og:image:alt" content="Ullas Srivastava — building, learning, and writing">
    ${type === "article" && published ? `<meta property="article:published_time" content="${escapeHtml(published)}T00:00:00Z">` : ""}
    ${type === "article" && updated ? `<meta property="article:modified_time" content="${escapeHtml(updated)}T00:00:00Z">` : ""}
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" type="image/svg+xml" href="${withBase("/favicon.svg")}?v=2">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&family=Noto+Serif+Devanagari:wght@400&display=swap" rel="stylesheet">
    <link rel="alternate" type="application/feed+json" title="${escapeHtml(config.title)}" href="${absoluteUrl("/feed.json")}">
    <link rel="stylesheet" href="${withBase("/styles.css")}">
    <script>try { if (localStorage.getItem("theme") === "night") document.documentElement.dataset.theme = "night"; } catch {}</script>
    <script src="${withBase("/site.js")}" defer></script>
  </head>
  <body>
    <a class="skip-link" href="#main-content">Skip to content</a>
    <div class="site-shell">
      <header class="site-header">
        <a class="name" href="${withBase("/")}">
          <span>Ullas</span><span class="name-surname" lang="hi">श्रीवास्तव</span>
        </a>
        <nav class="site-nav caps" aria-label="Primary navigation">
          ${config.nav.map((item) => `<a href="${withBase(item.href)}"${isCurrentNavItem(item.href, pagePath) ? ' aria-current="page"' : ""}>${escapeHtml(item.label)}</a>`).join("")}
          <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch between paper and night theme">Night</button>
          ${socialNavLinks}
          <a class="btn btn-solid" href="mailto:ullas.srivastava.dev@gmail.com" aria-label="Email Ullas"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1.4 2 7.6 5.6L19.600 7zM20 8.300l-8 5.900-8-5.900V17h16z"/></svg><span>Email</span></a>
        </nav>
      </header>
      <main id="main-content">
        ${body}
      </main>
      <footer class="site-footer">
        <span class="footer-mark">❦ © 2026 Ullas</span>
        <nav class="caps" aria-label="Footer navigation">
          <a href="mailto:ullas.srivastava.dev@gmail.com">Email</a>
          ${footerSocialLinks}
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

function isCurrentNavItem(href, pagePath) {
  if (href === "/") return pagePath === "/";
  if (href.includes("#")) return false;
  return pagePath === href || pagePath.startsWith(href);
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
  const headingIds = new Map();

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
      const dimensions = getImageDimensions(figure[2]);
      html.push(`
        <figure class="article-figure${className}">
          <img src="${escapeHtml(source)}" alt="${escapeHtml(figure[1])}"${dimensions ? ` width="${dimensions.width}" height="${dimensions.height}"` : ""} loading="lazy" decoding="async">
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
      const baseHeadingId = slugify(stripInlineMarkdown(heading[2])) || "section";
      const occurrence = headingIds.get(baseHeadingId) || 0;
      headingIds.set(baseHeadingId, occurrence + 1);
      const headingId = occurrence ? `${baseHeadingId}-${occurrence + 1}` : baseHeadingId;
      html.push(`<h${level} id="${headingId}" class="anchored-heading">${inlineMarkdown(heading[2])}<a class="heading-anchor" href="#${headingId}" aria-label="Link to this section">#</a></h${level}>`);
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

function stripInlineMarkdown(value) {
  return String(value)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~]/g, "");
}

function getFirstImage(markdown) {
  const match = String(markdown).match(/!\[[^\]]*\]\(([^)\s]+)/);
  return match ? match[1] : "";
}

function getImageDimensions(source) {
  const dimensions = {
    "/images/from-nineteen-to-twenty/builder-shift.jpg": { width: 2841, height: 1669 },
    "/images/from-nineteen-to-twenty/river-portrait.jpg": { width: 3264, height: 1468 },
    "/images/last-seat-lab/browser-state.jpg": { width: 1014, height: 702 },
    "/images/last-seat-lab/cover.jpg": { width: 1280, height: 512 },
    "/images/last-seat-lab/module.png": { width: 1026, height: 570 },
    "/images/last-seat-lab/sqlite.jpg": { width: 838, height: 471 },
    "/images/whose-bug-is-it/cover.png": { width: 3000, height: 1200 },
    "/images/whose-bug-is-it/delete-terminal.png": { width: 2400, height: 1000 },
    "/images/whose-bug-is-it/delete-chain.png": { width: 2400, height: 790 }
  };

  return dimensions[source] || null;
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
