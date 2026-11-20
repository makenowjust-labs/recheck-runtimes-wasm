#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
. ./versions.env

cat > dist/versions.json <<JSON
{
  "ruby": "$RUBY_VERSION",
  "cpython": "$CPYTHON_VERSION",
  "regex": "$REGEX_VERSION",
  "wasi_sdk": "$WASI_SDK_VERSION",
  "binaryen": "$BINARYEN_VERSION"
}
JSON
(cd dist && sha256sum ruby.wasm python.wasm > SHA256SUMS)

write_license() {
  printf '==== %s ====\n\n' "$1"
  cat "$2"
  printf '\n'
}

{
  write_license "Ruby $RUBY_VERSION (ruby.wasm): COPYING" build/ruby/source/COPYING
  write_license "Ruby $RUBY_VERSION (ruby.wasm): BSDL" build/ruby/source/BSDL
  write_license "Ruby $RUBY_VERSION (ruby.wasm): LEGAL" build/ruby/source/LEGAL
  write_license "CPython $CPYTHON_VERSION (python.wasm): LICENSE" build/python/cpython/LICENSE
  write_license "regex $REGEX_VERSION (python.wasm): LICENSE.txt" build/python/regex/LICENSE.txt
} > dist/LICENSES.txt
