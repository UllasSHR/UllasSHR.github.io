---
title: "Last Seat on Kubernetes: what keeps running, and what stays correct"
date: "2026-10-04"
summary: "I moved my one-seat booking lab onto a local Kubernetes cluster, then killed databases and servers on purpose to see what Kubernetes guarantees and what it leaves to the database and the code."
category: "technical-writing"
tags: ["kubernetes", "postgresql", "concurrency", "distributed-systems"]
draft: false
---

[Read the code and experiment notes](https://github.com/UllasSHR/last-seat-k8s)

In [Last Seat Lab](/posts/last-seat-lab/) I learned how one database keeps one seat correct when many clients compete for it. A friend who works on distributed systems told me to look at Kubernetes next. So I asked a new question: what happens when the server itself is many copies, and any of them can die at any moment?

Everything here ran on my MacBook: a [kind](https://kind.sigs.k8s.io/) cluster inside a small Linux VM, PostgreSQL 17, and a tiny Node.js booking server. The seat is still A1.

## 1. What Kubernetes actually does

You don't tell Kubernetes "start this server". You write down what you want, for example "there should be 3 copies of this server", and it stores that record in etcd, its own database. Controllers then run a loop forever: compare what you want with what is running, and fix any difference.

I tested this by deleting a running pod. A new pod, with a new name, appeared within a second. I never asked for it. Then I changed `replicas: 1` to `replicas: 3` and applied the file again, and two more pods appeared. Applying the same file a second time said `unchanged`: apply means "make the cluster match this file", not "do an action".

One detail mattered later: Kubernetes never revived the dead pod. It created a new one from the same blueprint. Pods are disposable.

## 2. Where does the seat live when the pod dies?

If pods are replaced rather than revived, what happens to data that was inside them? I ran PostgreSQL twice. One copy was a StatefulSet with its own persistent disk. The other was a plain Deployment with no disk. I loaded my seat table into both, booked A1 as `ullas` in each, and then killed both pods.

```
With a disk:     A1 | ullas
Without a disk:  ERROR: relation "seats" does not exist
```

Without a disk, it wasn't just the booking that disappeared. The whole table was gone, because the new pod found an empty data directory and created a fresh database. The pod with a disk came back with the same name, `postgres-0`, was attached to the same disk, and still had the booking. Later it survived two more kills and a full shutdown of the cluster.

The part that stayed with me: Kubernetes reported the empty database as `1/1 Running`. Perfectly healthy. Its job was to keep one Postgres process running, and it did. It has no idea what the data is, or that it was lost.

> Kubernetes keeps processes running. It does not keep data correct.

I never knew Kubernetes manages servers for you, so that was nice to see. The disk result is what made it click. With a disk, the seat stayed reserved because the new pod was attached to the same disk and read the data already on it, so it knew A1 was taken. Without a disk, the new pod found a completely empty data directory and created a new database, so even the table was gone.

## 3. Three servers, two hundred people, one seat

Next I wrote a small HTTP server with one endpoint, `POST /reserve`, packaged it as a Docker image, and ran three copies behind a Kubernetes Service. A Service is a stable name (`seat-api`) that forwards each request to one of the Ready pods carrying a matching label. When I killed one pod, its IP left the Service's list and the replacement's IP joined it, while the name never changed.

```
$ kubectl get endpoints seat-api
10.244.0.7:3000,10.244.0.8:3000,10.244.0.9:3000

$ kubectl delete pod seat-api-5d58b55dd5-ntcbl
pod "seat-api-5d58b55dd5-ntcbl" deleted

$ kubectl get endpoints seat-api
10.244.0.10:3000,10.244.0.8:3000,10.244.0.9:3000
```

I wrote the booking function myself, using the same rule from the first lab:

```sql
UPDATE seats SET reserved_by = $1
WHERE seat_code = 'A1' AND reserved_by IS NULL
```

The function returns true only if Postgres reports one changed row. Then I fired 200 bookings at the same moment from inside the cluster. The Service spread them across the three servers (71, 63 and 66 requests), and:

```
People told "you got the seat!": 1
What Postgres actually says:     A1 -> user-0
```

The three servers share no memory and don't know the others exist. The only thing they share is Postgres, and Postgres is the referee.

## 4. Breaking it on purpose

I also wrote a second version that does the same job in two steps, checking first and writing second:

```sql
-- trip 1: is it free?
SELECT reserved_by FROM seats WHERE seat_code = 'A1';

-- gap: other servers read NULL here too

-- trip 2: take it
UPDATE seats SET reserved_by = $1 WHERE seat_code = 'A1';
-- missing: AND reserved_by IS NULL, so it never re-checks
```

With no delay between the two queries, it still produced one winner. The bug was there, but the gap was too small to hit on a MacBook. Then I added a 50 ms pause between the check and the write, the kind of time a real app spends calling a payment service:

```
People told "you got the seat!": 17
What Postgres actually says:     A1 -> user-2
```

Seventeen people were told they had the seat. Sixteen of them did not. My safe version, under the same 50 ms setting, still produced exactly one winner, because it makes one trip to the database instead of two.

In the safe code, one line does everything: it checks whether the seat is empty and books it in the same step, so Postgres gives the seat to exactly one person. The naive code makes two trips. On the first trip, 17 people asked "is the seat taken?" during the same 50 ms, and all of them heard "no", because nobody had written yet. On the second trip, each of them wrote their name without checking again, overwriting the person before. So 17 people were told they got the seat, and only the last one to write actually had it.

To see why, I slowed Postgres down by hand. Alice opened a transaction, booked A1 and held it for ten seconds before committing. Two seconds in, Bob tried:

- Bob's `UPDATE ... IS NULL` waited about 8 seconds for Alice's row lock, then re-checked the row and changed 0 rows.
- When Alice rolled back instead, Bob still waited 8 seconds (Postgres can't know the future), then got the seat.
- Bob's plain `SELECT` returned instantly and showed an empty seat, while Alice was in the middle of booking it.

That last line is the naive bug in isolation. A read doesn't wait for writers; it shows the last committed version, which may already be out of date. The naive code trusts that stale answer and then writes without checking again.
## 5. The owner who didn't know they had won

Real servers often do more work after saving: sending a confirmation email, writing logs. I made each server wait ten seconds after booking before replying, then force-killed all three servers five seconds into a 200-person race, like a power cut.

```
Errors:                          200
What Postgres actually says:     A1 -> user-2
What user-2 saw on their screen: an ERROR
```

Exactly one person still owned the seat, because the booking had been committed before the crash. But nobody was told. The booking lived safely in Postgres; the "you won" reply lived only inside the server that died. From the outside, a crash before the write and a crash after the write look identical. If user-2 tried again, my code would answer "taken", and they would believe they had lost a seat they actually owned.

Kubernetes restarted every server within seconds. Postgres stored everything correctly. The user still got the wrong answer.

## 6. Making retries safe

The fix is to make trying again harmless: if the seat is already yours, a retry should say so. My first attempt was:

```sql
WHERE seat_code = 'A1' AND reserved_by IS NULL OR reserved_by = $1
```

SQL evaluates `AND` before `OR`, so this actually means "(A1 and empty) or any row with my name". With only one seat it looked correct. With a second seat added, A1 owned by Bob and A2 owned by Alice, Alice trying to book A1 got `UPDATE 1`. The query had matched her own row A2, and my function would have told her she won A1. Brackets fixed it:

```sql
WHERE seat_code = 'A1' AND (reserved_by IS NULL OR reserved_by = $1)
```

Then I ran the crash again, this time with users retrying after an error:

```
Errors:                          0
People told "you got the seat!": 1
What user-1 saw on their screen: "you got the seat!" (after 2 attempts)
```

User-1's first attempt was committed, and then the server died. Their retry reached a brand-new server that had never heard of them. It asked Postgres, matched `reserved_by = 'user-1'`, and replied that the seat was theirs. The lost reply was recovered from the one place that never lost it.

One limit: I used the name as identity, which only works because every test user had a unique name. Real systems use a user ID or an idempotency key, a unique ID for each click.

The thing I want to keep in mind: SQL evaluates `AND` before `OR`. Without brackets, my seat check only applied to the "empty" half, so the "already mine" half could match any seat with my name on it. The brackets put both cases under seat A1: the user gets the seat if it's empty, or if it's already theirs, and in every other case nothing changes.

## 7. The same idea inside other software

Checking and writing in one step, and making retries safe, are built into real software:

```sql
-- stock: never sell an item that isn't there
UPDATE products SET stock = stock - 1
WHERE product_id = 42 AND stock > 0
```

- **Kubernetes:** every object has a `resourceVersion`. An update based on an old version is rejected with a conflict, so two writers can't silently overwrite each other.
- **Payment APIs** such as Stripe's accept an `Idempotency-Key` header. Retrying with the same key returns the first result instead of charging twice.

## 8. What I'm keeping

- **Kubernetes** decides what is running and replaces what dies. It does not know whether data is correct.
- **A disk** is what lets data outlive a pod. A healthy pod can still hold an empty database.
- **The database** is the referee. One conditional `UPDATE` lets it pick exactly one winner.
- **Check-then-act** is a race, even when every test passes on a MacBook.
- **A failed request** doesn't tell you whether the work happened, so make retries safe.
- **Bugs hide in the cases that should fail.** Both the race and the missing brackets only appeared when I built a test designed to break them.
