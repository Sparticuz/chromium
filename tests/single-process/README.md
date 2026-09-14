# `--single-process` reproduction

Manual reproduction backing the removal of `--single-process` from `Chromium.args`.
It is not part of `npm run test:source`; it needs docker and a published layer, so
it is run by hand when the flag question comes up again.

It shows two things:

1. Chrome starts normally on the Lambda base image without the flag. Spawning the
   binary directly reaches `DevTools listening on ws://...`, and stderr carries no
   `prctl(PR_SET_NO_NEW_PRIVS)`, no `Failed to move to new namespace` and no zygote
   error. The other sandbox flags in the same list (`--no-sandbox`, `--no-zygote`,
   `--disable-setuid-sandbox`) appear to cover that path already.
2. With the flag, one page whose JavaScript stops yielding freezes every other page
   in the same browser. Without it, the damage stays on the page that caused it.

## Running it

```sh
./run.sh               # both modes, one container at a time, then the table
MODE=with ./run.sh     # a single mode ("with" or "without")
```

`run.sh` builds the package from this checkout and overlays it onto a published
layer, so the run reflects `source/index.ts` rather than a published build. Only
the Chromium binaries come from the release, because they are not in the repo.
Set `LAYER_VERSION` to pick a different release.

Requires docker. On a non-arm64 host, docker must be able to run `linux/arm64`.

## What it does

One browser, three pages. A healthy page is opened first, then a page that wedges
its own renderer, then a second healthy page. Every CDP call made after the wedge
is timed. `protocolTimeout` is lowered to 20000 ms so the stalls are legible;
puppeteer's default of 180000 ms makes each stalled call cost three minutes.

The wedging page is a `MutationObserver` on `document.documentElement` whose
callback mutates the tree it observes. Observer callbacks are microtasks, so the
microtask queue never drains and the main thread never returns to the task queue.
The page's own `setTimeout` escape hatch is a task and therefore never runs. It is
served by an HTTP server inside the container, so the run contacts no external site.

## What it does not show

- It runs on the Lambda base image under docker, not inside a live Lambda
  invocation. Firecracker has its own seccomp profile, so the `prctl` behaviour
  could in principle differ there.
- It covers `nodejs24.x` on arm64 with one layer version, not the full support
  matrix. The absence of the sandbox error here is evidence, not proof.

## Environment notes

Two things that cost time to find, both unrelated to the flag:

- Containers launched back to back in a loop can fail at
  `Target.setDiscoverTargets: Target closed` in both modes, which is why `run.sh`
  runs them one at a time.
- `AWS_EXECUTION_ENV` has to be set. Without it the package does not treat itself
  as being on Lambda, so `al2023.tar.br` is not extracted, `LD_LIBRARY_PATH` is not
  set, and the binary dies on a missing `libnspr4.so`.
