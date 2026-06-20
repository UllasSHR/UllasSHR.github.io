import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const config = JSON.parse(await fs.readFile(path.join(root, "site.config.json"), "utf8"));
const [title, category = "essays", summary = ""] = process.argv.slice(2);

if (!title) {
  console.error('Usage: npm run new-post -- "Post title" category "Short summary"');
  console.error(`Categories: ${config.categories.map((item) => item.slug).join(", ")}`);
  process.exit(1);
}

const validCategories = new Set(config.categories.map((item) => item.slug));
if (!validCategories.has(category)) {
  console.error(`Unknown category: ${category}`);
  console.error(`Use one of: ${[...validCategories].join(", ")}`);
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10);
const slug = slugify(title);
const filename = `${date}-${slug}.md`;
const outputPath = path.join(root, "content", "posts", filename);

const body = `---
title: "${escapeYaml(title)}"
date: "${date}"
summary: "${escapeYaml(summary || `A note about ${title}.`)}"
category: "${category}"
tags: []
draft: true
---

Write the post here.

When it is ready, change \`draft: true\` to \`draft: false\` or remove the draft line.
`;

await fs.writeFile(outputPath, body, { flag: "wx" });
console.log(`Created ${path.relative(root, outputPath)}`);

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeYaml(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
