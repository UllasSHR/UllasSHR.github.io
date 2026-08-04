---
title: "Last Seat Lab: Exploring databases and realtime synchronisation"
date: "2026-08-04"
updated: ""
summary: "What one shared seat taught me about transactions, realtime synchronisation, caller identity, and keeping one authoritative database truth."
category: "technical-writing"
tags: ["databases", "spacetimedb", "transactions", "realtime"]
draft: false
---

![A hand-drawn map of a seat moving through a reducer into one committed database state and two subscribed caches](/images/last-seat-lab/cover.jpg "wide|One table, one reducer, one shared truth.")

## 1. The problem: one shared seat, many clients

The whole lab used a deliberately small problem: seat A1 can be available or reserved. Multiple clients may try to change it, but the system must produce one committed answer. The final proof was not merely a working page. It was that two browser clients could race for A1, exactly one reservation could win, both clients could receive the same committed state, failed work could not leave partial data, and committed state could survive a server restart.

## 2. What SQLite taught first

Before using realtime tooling, we made the database rule visible with SQLite. A conditional update reserved A1 only if it was still unowned. One request changed one row; the later request changed zero. With two independent connections, Alice held a write transaction while Bob could see only the old committed value and could not take a conflicting write lock. When Alice committed, Bob could retry but still could not replace the winner. A rollback test showed that a tentative change disappears when the transaction is rolled back.

![A SQLite session where Bob's conditional update changes zero rows because Alice already owns A1](/images/last-seat-lab/sqlite.jpg "wide|A conditional update changes zero rows when the seat is no longer available.")

The transferable idea was: database correctness comes from conditions and transactions, not from hoping every client behaves well. SQLite used a single-writer lock in this experiment; other databases use different mechanisms, but the goal is the same—valid committed shared state.

## 3. Moving the rule to SpacetimeDB

We rebuilt the seat model as a SpacetimeDB server module with a public seat table and reducer functions. The table stored A1 and its reservation fields. A reducer was the write boundary: React could call a generated typed client function, but the server module decided whether the requested mutation was valid. A successful reducer invocation committed its database changes; an error rolled back the invocation.

![The SpacetimeDB seat table schema and initialization code](/images/last-seat-lab/module.png "wide|The server module defines the shared table and its initial state.")

This separated responsibilities clearly. React rendered the browser interface. Generated bindings gave the client typed access to the module. The server reducer was where the reservation rule lived. SpacetimeDB stored and committed the authoritative data.

## 4. Concurrency, failure, and durability

We made two reservation requests race. Only one completed; the other failed because the reducer observed that the seat had already been reserved. We did not trust command output alone: we read the stored row afterward and confirmed exactly one owner. Both subscribed clients then displayed that same winner.

We also created a temporary reducer that updated A1 and then deliberately threw an error. The request failed, and a database readback showed the original state. That proved atomic rollback: no partial change from a failed reducer became shared data. Later, we stopped the server completely without deleting data. When it restarted, the committed reservation was still present. That proved the difference between a running server process and persistent database state.

## 5. Realtime is a synchronized local view

The most visible effect was two browser clients updating without refresh. The exact path was: a reducer commits on the server; SpacetimeDB sends the committed transaction update to subscribed clients; each client SDK updates its local table cache; a listener notifies React; React rerenders from that cache. React does not query the authoritative database on every render.

We inspected `useTable` to make this hidden path concrete. Its subscription and cache listeners explained why both pages could show Available to Alice, then Alice to Available, after the relevant committed changes.

## 6. Why disconnection changed the UI model

When the server stopped, the browser cache had no seat row. The first UI incorrectly displayed Available. That exposed an important distinction: no local row is not proof that the seat is free. It can mean the connection is down, the subscription is still loading, or data has not arrived yet.

![The Last Seat Lab browser showing a connected client and A1 reserved by Alice](/images/last-seat-lab/browser-state.jpg "wide|The UI must distinguish known database state from an unknown disconnected state.")

The correct states became known available, known reserved, and unknown while disconnected. This was a client-side honesty fix. The database had not lost the reservation; the browser had temporarily lost fresh information about it.

## 7. Identity is not a name

A display name sent from a browser is only a claim. We demonstrated this by reserving with a deliberately false name: the server accepted the string because it was only a display field. To make permission decisions, the reducer stored SpacetimeDB's server-provided caller identity, `ctx.sender`, alongside the name.

This separates authentication from authorization. Authentication answers which connection called the reducer. Authorization answers whether that caller may perform this specific action. In the lab, the server compared the stored owner identity with the current `ctx.sender` rather than trusting an editable name.

## 8. The UI is helpful; the reducer is authoritative

We added an owner-aware Cancel button in React. The UI computed `canCancel` by comparing the current browser identity with the stored owner identity, so a client did not see an action it could not use. But this was only user experience. A browser can be modified or can call a reducer directly.

The real protection was inside `cancelSeat`. A different identity attempted cancellation, the server rejected it, and a database readback showed the reservation had not changed. The rule was therefore true even outside the intended UI: clients could ask, but the reducer decided whether a state change was allowed.

## 9. Two browser origins made the test concrete

We opened the same application through `localhost` and `127.0.0.1`. Because browser storage is scoped by origin, those pages held separate connection identities while talking to one database. One client reserved A1 as Alice. Both clients received Reserved by Alice without refresh, but only the owner identity could cancel it. When that owner cancelled, both returned to Available.

This was the clearest end-to-end proof that one server could guard one shared truth while two clients had different permissions and still converged on the same committed state.

## 10. Learning code must not remain deployed authority

Temporary reset and deliberate-failure reducers helped us run experiments, but they were also public server operations. Reset could bypass the owner-only cancellation rule, and the failure reducer was an unnecessary public error endpoint. We removed both, regenerated bindings, rebuilt the frontend, and confirmed that calls to them were rejected. The remaining callable API was reduced to reserve and cancel.

## 11. The mental model to keep

- **Server:** authoritative committed state.
- **Reducer:** mutation gate and transaction boundary.
- **Identity:** the server-provided caller value, not a display name.
- **SDK cache:** a synchronized local view for the browser.
- **React:** the rendering layer that responds when that cache changes.
- **Connection state:** a reason to say unknown, not to invent availability.

The Day 14 plan was to judge whether this work was worth studying more deeply from the evidence gathered. A formal decision was not recorded. What was recorded is the technical trail above: build the rule, race it, break it, restart it, test identity, remove unsafe helpers, and trace the realtime update all the way to the UI.
