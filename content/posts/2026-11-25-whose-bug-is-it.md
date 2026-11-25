---
title: "My best open-source PR worked, and still got closed"
date: "2026-11-25"
summary: "In most open source projects, pushing working code isn't enough. It has to land in the right layer. Mine didn't, at first."
category: "building"
tags: ["open-source", "kubernetes", "postgresql", "openeverest"]
draft: false
---

![A hand-drawn sketch: me holding PR #73, marked it works and stamped CLOSED, pointing at the Provider layer, while a red dashed arrow and a bug point at the Operator layer below](/images/whose-bug-is-it/cover.png "wide|Whose bug is it?")

When you find a bug in an open-source project, the first question isn't "how do I fix it?". It's "whose bug is this?"

Most open-source projects are built on top of other open-source projects. Fix the right bug in the wrong one, and your pull request gets closed, even when it works.

I found that out the expensive way. This post walks through the three layers I now think about before I write any code: the project you see, the projects underneath it, and the people who maintain them.

## 1. How to find issues to work on

So after finding a project to contribute to, the question is where in it to look for issues.

My way is simple: just look where the project hands work to other software. Features like backups and restores don't live in one codebase. They pass through several projects, each written by a different team. Every time one project passes work to the next, one side can expect something the other side never does. And in my view, that's where the bugs are.

So I don't start from the issue list on GitHub. I pick the feature that crosses the most projects, run it end to end on my own machine, and push it where the projects meet, like deletes, restores and failures.

And that's where I found issues. I contribute to [OpenEverest](https://github.com/openeverest), an open-source tool that runs databases like Postgres on Kubernetes. When you take a backup in OpenEverest, it doesn't do all the work itself. It passes the job down a chain: OpenEverest's provider (the part of OpenEverest that talks to the database tools) tells the Percona operator (the program that actually runs Postgres on Kubernetes) what to do, the operator asks a tool called pgBackRest to make the backup, and pgBackRest saves it to storage. Four different pieces, built by different people.

So I tested backups on my MacBook, just like a normal user would. I made a backup, deleted it, and then checked the storage to see if it was actually gone:

![Terminal: kubectl says the backup was deleted, but pgbackrest info still lists the same backup set](/images/whose-bug-is-it/delete-terminal.png "wide")

The command said the backup was deleted. The data was still there. The bug was hiding where two of those projects meet, and finding which two is the next layer.

## 2. How to find whose bug it is

So you've found a bug. Before you fix it, the next question is: whose bug is it?

My way is simple: follow the bug down the chain. Each project in the chain keeps its own logs. Start at the top, check what each piece actually did, and look for the first one that didn't do what the others expected. That's usually where the bug lives. Honestly, this is the step I skipped.

And here's what I found when I went back and did it. When you delete a backup, OpenEverest's provider doesn't delete the files itself. It counts on the Percona operator to do it, through a cleanup step that has to finish before Kubernetes removes the backup. Kubernetes calls this a finalizer.

But the operator's logs told a different story. It ran that cleanup step right after the backup **finished**, not when I deleted it:

![Following the bug down the chain: You (deleted) to Provider (passes it on) to Operator (the bug: cleanup already ran) to Storage (files still here). Right layer, wrong time: the cleanup ran when the backup finished, not when it was deleted.](/images/whose-bug-is-it/delete-chain.png "wide")

So by the time I pressed delete, the cleanup step was long gone, and nothing was left to delete the files.

The bug showed up in OpenEverest, but the real fix belonged one layer down, in the Percona operator. And the operator doesn't officially support deleting one single backup yet.

I didn't see that then. I wrote the fix in OpenEverest's provider, and the next section is what happened to it.

## 3. How to work with the maintainers

Code gets merged by people, and people are busy.

So first, write the issue so they can check it fast. My issue, [#60](https://github.com/openeverest/provider-percona-postgresql/issues/60), had the exact steps, the versions, the two log lines and what I didn't test. And it ended with a question instead of a fix: how do you want this solved?

Then go where the maintainers actually talk. Many open-source projects have a Slack or Discord channel where maintainers answer questions and explain how they want the architecture and contributions to look. You can also ask design questions about your issues there. When you do:

- **Post the way others do.** Scroll through a few recent messages and match their tone and length.
- **Keep it to one message.** Each thread gets one line and its link, smallest first.
- **Ask a question they can answer in a minute.** "Should this be fixed in the provider or in the operator?" is easier to reply to than "please review my PR".
- **Ask early.** Before you write the fix, not after weeks of waiting.

My message listed three threads: a [docs fix](https://github.com/openeverest/provider-percona-postgresql/pull/101), a [bug report](https://github.com/openeverest/provider-percona-postgresql/issues/104) and this [PR](https://github.com/openeverest/provider-percona-postgresql/pull/73). Two days later, all three had an answer.

The docs fix got merged, and the PR got a no. The maintainer tested my [PR](https://github.com/openeverest/provider-percona-postgresql/pull/73), confirmed it worked, and closed it. The operator underneath doesn't officially support deleting one backup yet, and backups are too critical to risk side effects. Review isn't only "does it work?". It's also "does it belong here?"

I was just basically trying to understand what had happened, and learning to work in the right layer.

## What a fix in the wrong layer can still do

The team behind the operator had been asked for exactly this more than two years earlier. Back then, the answer was that it couldn't be done.

The afternoon my PR was closed, the maintainer tried my approach there, saw it work, and proposed shipping it sooner. It's not approved yet. My code won't ship, but the idea might.

So now, before I write any code, I ask one question: whose bug is this? If it lives a layer below, I ask the maintainers early, and meanwhile fix what my own layer can, like a guard that refuses the unsafe case. My next PR, [#107](https://github.com/openeverest/provider-percona-postgresql/pull/107), does exactly that. It got merged while I was writing this post 😂.

If you want to try this, pick one feature in a project you already use. Run it end to end, break it where two projects meet, and follow the bug down until you know whose it is. If you find something, or get a no like mine, tell me about it on X: [@UllasSHR](https://x.com/UllasSHR).
