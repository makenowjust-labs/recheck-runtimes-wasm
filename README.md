# recheck-runtimes-wasm

WebAssembly builds of Ruby and CPython for the Playground of [recheck](https://github.com/makenowjust-labs/recheck).

The Playground runs short programs on these builds in the browser like processes: a new instance for each run, with the program on the standard input.
Both builds are commands of WASI preview 1.

## Assets

A [release](https://github.com/makenowjust-labs/recheck-runtimes-wasm/releases) has the following files:

- `ruby.wasm`: Ruby, to run as `ruby --disable-gems -`. It needs no files.
- `python.wasm`: CPython with the [`regex`](https://github.com/mrabarnett/mrab-regex) package as a built-in module, to run as `python3 -I -`. It contains the part of the standard library that the programs of recheck need.
- `SHA256SUMS`: the checksums of the two files above.
- `versions.json`: the versions of Ruby, CPython, `regex`, the WASI SDK and Binaryen of the build.
- `LICENSES.txt`: the licenses of Ruby, CPython and `regex`, which the two builds contain.

`versions.env` pins these versions.

The host stops a program by throwing from an import of WASI.
For this, `PyErr_CheckSignals` of this CPython calls `sched_yield`, so that a long matching of `re` or `regex` calls the host regularly.

## Files in a WebAssembly module

A custom section whose name starts with `file:` is a read-only file of the WASI file system.
The rest of the name is the absolute path of the file, and the payload of the section is its contents.
The host finds these sections by scanning the section headers of the module, and mounts the files in one preopened directory `/`.

`python.wasm` has the standard library as the section `file:/lib/python315.zip`.
`python/library.txt` lists the files and directories of `Lib` in this archive.
It also has the empty file `file:/lib/python3.15/lib-dynload/.keep`, whose directory the interpreter looks for at every start.

`scripts/append-file-sections.py` appends such sections to a module:

```console
$ scripts/append-file-sections.py input.wasm output.wasm /lib/python315.zip=python315.zip
```

## Build

The build runs on Linux x86_64.
It needs a C compiler, `make`, `curl`, `patch`, Python 3.11 or later, and Ruby of the version in `versions.env` as the baseruby.

```console
$ make
```

It downloads the sources and the toolchain into `downloads` and `toolchain`, builds in `build`, and writes the assets into `dist`.

The test runs the assets on Node.js 26 with [`@bjorn3/browser_wasi_shim`](https://github.com/bjorn3/browser_wasi_shim):

```console
$ npm ci
$ make test
```

## Release

Pushing a tag `v*` builds and tests the assets, and creates the GitHub Release of the tag with them:

```console
$ git tag v1
$ git push origin v1
```

Running the workflow `Release` manually uploads the assets as an artifact of the workflow run instead.
