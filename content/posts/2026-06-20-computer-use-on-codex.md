---
title: "Computer Use on Codex"
date: "2026-06-16"
updated: "2026-06-20"
summary: "Computer Use is powerful, but the smarter workflow is to give Codex exactly enough access for the task."
category: "technical-writing"
tags: ["codex", "computer-use", "agents", "workflow", "browser"]
---

Computer Use is the most abused feature in Codex right now.

People say "computer use" as if it is one capability.

In Codex, we have `@Browser`, `@Chrome`, and `@Computer`.

They sound similar. They are not.

All of them give the agent a different kind of access. Treating them as the same makes your agent workflow slower, distracted, and ultimately burns unnecessary tokens.

Codex can use your computer. And it can do it smoothly. But your agent does not need full computer use every time.

More access is not always better.

More access can mean more context. More context can mean more distraction. And more distraction can pull the agent away from the actual goal of the session.

The best way to use Codex is to give it the right access for the job.

Not maximum access.

Right access.

That is why the difference between `@Browser`, `@Chrome`, and `@Computer` matters. It is not just naming. It is a control model.

Once you see the model, computer use becomes much easier to reason about.

## The Strategy

Think of computer use as a ladder.

Only climb when your session needs the next step.

1. Plugins / Connectors
2. `@Browser`
3. `@Chrome`
4. `@Computer`

Each step gives the agent more access. More context. More flexibility.

But every step also adds cost.

More tokens. More state. More possible side effects. More things the agent can misunderstand.

So the goal is not to jump to the top.

The goal is to use the lowest level that can finish the task and verify the result.

## 1. Plugins / Connectors

Plugins are the structured layer.

Use them before visual computer use. If Codex has a defined tool for the job, use that first.

For example:

- GitHub tools
- Vercel tools
- Gmail tools
- Google Drive tools
- Google Calendar tools
- MCP servers
- project scripts
- CLI commands

This is the least flashy level. But it is often the most useful.

If Codex needs to inspect a GitHub issue, it should not browse manually if a GitHub tool can read it directly.

If Codex needs to run a project check, it should use the command or script.

This makes the job easier for the agent. It also makes the result easier to verify.

Plugins and connectors are more direct. They reduce visual guessing. They reduce random UI state. They make the task more repeatable.

The simple rule:

If Codex has a structured tool for the job, start there.

Do not make the agent click around the UI unless the UI is the task.

## 2. `@Browser`

`@Browser` is the clean visual layer.

Use it when the agent needs to see a web page, but does not need your real browser identity.

This is perfect for local apps.

Open localhost. Check the layout. Click the modal. Inspect the page state. Verify that the fix actually rendered.

That is where `@Browser` shines.

It gives the agent eyes on the page without bringing in your normal cookies, sessions, extensions, bookmarks, or logged-in profile.

That matters.

When you are building, you usually want a clean environment. You want the agent to test the page. Not carry your whole browser life into the task.

For builders, `@Browser` should usually be the default visual tool.

Especially for:

- local web apps
- public pages
- file previews
- visual QA
- layout bugs
- screenshots
- checking whether the UI actually changed

If you are building a web app, start here before reaching for Chrome or full desktop control.

Codex in-app browser is one of the best things about it.

## 3. `@Chrome`

Use `@Chrome` when identity matters.

Some tasks need your real browser state. That means your logged-in session, your cookies, your extensions, and your existing browser context.

Examples:

- Gmail
- Slack
- Salesforce
- internal dashboards
- logged-in SaaS tools
- extension-dependent workflows

This is where `@Chrome` becomes useful.

But the risk changes here.

Your logged-in browser is not just a browser. It is your identity on the web.

If Codex acts inside Chrome, the website may treat those actions as coming from you.

So `@Chrome` should be used when the task actually needs logged-in state. Not just because it feels convenient.

Use `@Browser` for clean web testing. Use `@Chrome` when the task needs your real browser identity.

That difference matters.

## 4. `@Computer`

`@Computer` is full desktop control. And it is the most fun to use. It feels like proper AGI.

This is the most powerful level. The agent can see the screen, click, type, scroll, drag, and move across apps.

It can work with the actual desktop.

That makes it very flexible. It also makes it fragile.

Screens change. Popups appear. Buttons move. Apps behave differently. Small mistakes can compound.

Use `@Computer` when the desktop itself is the task.

For example:

- a desktop app
- a simulator
- a settings panel
- a multi-app workflow
- a bug that only appears in the GUI
- a tool that has no useful plugin or API

This is the last-mile tool.

Not the default tool.

Full computer use is powerful because it can operate the real interface. But that is exactly why it should be scoped carefully.

One app.

One goal.

One visible success condition.

## The Rule

The rule is simple.

Use the lowest level that can finish the job.

If Codex has a plugin, connector, MCP tool, or script for the task, start there.

If the task is a clean web preview, use `@Browser`.

If the task needs your logged-in browser state, use `@Chrome`.

If the task needs the real desktop, use `@Computer`.

And if the task involves money, deletion, credentials, permissions, messages, or private data, keep a human approval gate.

The smartest workflow is not:

> Give the agent my computer.

It is:

> Give the agent exactly enough computer.

## The Observe -> Act -> Verify Loop

Full computer use works through a loop.

The agent sees the screen. It decides what to do. It clicks, types, scrolls, or drags. Then it checks the screen again.

That loop is the magic.

It is also the risk.

The agent is not inside the app. It is operating the app from the outside.

Like a person looking at the screen and using the mouse.

That means the screen matters. The current window matters. The visible state matters. The next action should depend on what is actually visible.

This is why long computer-use tasks need checkpoints.

Do not let the agent run for twenty steps and only then ask what happened.

Make it inspect.

Act.

Verify.

Then continue.

## Long-Running Tasks

This also connects to long-running agents.

The longer a task runs, the more important the ladder becomes.

Long tasks create more chances for drift. The UI can change. The agent can lose the original goal.

A popup can appear. A partial result can look like completion.

So long-running computer use needs structure.

Not just more autonomy.

Give the agent defined checkpoints. Ask it to summarize state before continuing. Ask it to verify after important steps.

Ask it to stop before irreversible actions. Ask it to read back the final state.

Long-running agents do not need unlimited access.

They need better checkpoints.

## The Final Takeaway

Codex is not only a coding agent anymore. It is simply a tool that helps me in computer-related work.

Computer use is not magic.

It is an interface choice.

Codex can use tools. It can use a browser. It can use Chrome. It can use your desktop.

But those are not the same thing.

The skill is knowing which one to choose.

Use plugins when the task is structured. Use `@Browser` when the task is clean web verification. Use `@Chrome` when the task needs your logged-in browser. Use `@Computer` when the desktop itself is the task.

And always verify the result.

The future is not agents blindly controlling everything.

The future is agents using the right surface at the right time.

The smartest workflow is not:

> Give it my computer.

It is:

> Give it exactly enough computer.

[Original X article](https://x.com/UllasSHR/status/2066866532811178413)
