# Ullas Notes

A tiny GitHub Pages site for builder logs, personal notes, and thoughts that are too long or too permanent for X/Twitter.

## Why This Exists

This is meant to be a public notebook, not a polished publication. Post the small things:

- what you built,
- what broke,
- what you learned,
- short life observations,
- references you keep needing,
- longer thoughts that do not fit social media.

## Write a New Post

Create a Markdown file in `content/posts/`:

```md
---
title: "Your post title"
date: "2026-06-17"
summary: "One sentence about the post."
tags: ["builder-log", "life"]
---

Write here.
```

Then run:

```sh
npm run build
```

## Preview Locally

```sh
npm run preview
```

Open `http://localhost:4173`.

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

## Suggested Categories

- `builder-log`: things you built, shipped, debugged, or learned
- `life`: small observations and personal notes
- `notes`: useful references and things you keep forgetting
- `ai`: Codex, agents, workflows, prompts, and experiments
- `projects`: finished or unfinished project writeups
