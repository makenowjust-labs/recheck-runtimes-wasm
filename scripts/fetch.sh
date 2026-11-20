#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
. ./versions.env

download() {
  url=$1
  sha256=$2
  archive=downloads/${url##*/}
  if [ ! -f "$archive" ]; then
    curl -fsSL -o "$archive.part" "$url"
    mv "$archive.part" "$archive"
  fi
  echo "$sha256  $archive" | sha256sum -c -
}

extract() {
  archive=downloads/${1##*/}
  directory=$2
  rm -rf "$directory"
  mkdir -p "$directory"
  tar -xf "$archive" -C "$directory" --strip-components=1
}

mkdir -p downloads
download "$RUBY_URL" "$RUBY_SHA256"
download "$CPYTHON_URL" "$CPYTHON_SHA256"
download "$REGEX_URL" "$REGEX_SHA256"
download "$WASI_SDK_URL" "$WASI_SDK_SHA256"
download "$BINARYEN_URL" "$BINARYEN_SHA256"
download "$WASMTIME_URL" "$WASMTIME_SHA256"

extract "$WASI_SDK_URL" toolchain/wasi-sdk
extract "$BINARYEN_URL" toolchain/binaryen
extract "$WASMTIME_URL" toolchain/wasmtime
