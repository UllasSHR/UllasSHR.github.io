# Ullas Srivastava

A tiny GitHub Pages site for longer thoughts, useful notes, small life things, and articles that need more room than a short social post.

## Why This Exists

This is meant to be a basic personal site, not a polished publication. Post the useful things:

- longer thoughts,
- small life observations,
- things you learned,
- articles that may help someone,
- notes from projects or experiments,
- ideas that do not fit social media.

## Write a New Post

Option 1: generate a draft:

```sh
npm run new-post -- "What I learned building X" building "A short summary of the post."
```

Option 2: create a Markdown file manually in `content/posts/`:

```md
---
title: "Your post title"
date: "2026-06-17"
summary: "One sentence about the post."
category: "building"
tags: ["tools", "ai"]
---

Write here.
```

Available categories:

- `building`: tools, projects, experiments, and things you are making
- `work`: contributions, collaborations, and public proof
- `life`: interesting things from life
- `essays`: longer thoughts and articles
- `learning`: lessons, mistakes, references, and things to remember

Then run:

```sh
npm run build
```

## Preview Locally

```sh
npm run preview
```

Open `http://localhost:4174`.

## How Publishing Works

This is a static GitHub Pages site. That means there is no built-in website editor yet.

The workflow is:

1. Write a post as a Markdown file in `content/posts/`.
2. Choose one main `category`.
3. Add optional `tags`.
4. Run `npm run build`.
5. Preview locally.
6. Commit and push when you want it live.

Later, this can be upgraded with a browser-based CMS if you want a real admin page for writing posts.

## Publish On GitHub Pages

1. Create a GitHub repo named `UllasSHR.github.io`.
2. Push this project to the repo.
3. In GitHub, go to `Settings -> Pages`.
4. Under `Build and deployment`, set the source to `GitHub Actions`.
5. Push to `main`; the workflow in `.github/workflows/pages.yml` will publish the site.

Your site will be available at:

```txt
https://UllasSHR.github.io
```
