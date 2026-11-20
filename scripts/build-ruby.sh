#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
. ./versions.env
root=$PWD

baseruby_version=$(ruby -e 'print RUBY_VERSION')
if [ "$baseruby_version" != "$RUBY_VERSION" ]; then
  echo "Building Ruby $RUBY_VERSION needs \`ruby\` of the same version as the baseruby, but it is $baseruby_version." >&2
  exit 1
fi

export WASI_SDK_PATH="$root/toolchain/wasi-sdk"
export PATH="$root/toolchain/binaryen/bin:$PATH"

rm -rf build/ruby
mkdir -p build/ruby/source build/ruby/build dist
tar -xf "downloads/${RUBY_URL##*/}" -C build/ruby/source --strip-components=1

cd build/ruby/build
../source/configure LDFLAGS="-Xlinker -zstack-size=16777216" \
  --host wasm32-unknown-wasi \
  --with-destdir="$root/build/ruby/install" \
  --with-static-linked-ext \
  --with-ext=ripper,monitor \
  --disable-install-doc \
  --with-baseruby="$(command -v ruby)"
make -j"$(nproc)" install

"$WASI_SDK_PATH/bin/llvm-strip" -o "$root/dist/ruby.wasm" "$root/build/ruby/install/usr/local/bin/ruby"
