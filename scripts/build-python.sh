#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
. ./versions.env
root=$PWD

export WASI_SDK_PATH="$root/toolchain/wasi-sdk"
# The WASI build of CPython runs the built interpreter on wasmtime.
export PATH="$root/toolchain/wasmtime:$PATH"

rm -rf build/python
mkdir -p build/python/cpython build/python/regex build/python/library dist
tar -xf "downloads/${CPYTHON_URL##*/}" -C build/python/cpython --strip-components=1
tar -xf "downloads/${REGEX_URL##*/}" -C build/python/regex --strip-components=1

cd build/python/cpython
patch -p1 < "$root/patches/cpython-yield-in-check-signals.patch"
cp ../regex/src/_regex.c ../regex/src/_regex.h ../regex/src/_regex_unicode.c ../regex/src/_regex_unicode.h Modules/

host_triple=wasm32-wasip1
python3 Platforms/WASI build-python
python3 Platforms/WASI configure-host --host-triple "$host_triple"
cp "$root/python/Setup.local" "cross-build/$host_triple/Modules/Setup.local"
python3 Platforms/WASI make-host --host-triple "$host_triple"
"$WASI_SDK_PATH/bin/llvm-strip" -o ../python.wasm "cross-build/$host_triple/python.wasm"

while read -r path; do
  cp -r "Lib/$path" "../library/$path"
done < "$root/python/library.txt"
cp -r ../regex/regex ../library/regex
rm -r ../library/regex/tests
cp "$root/python/_regex.py" ../library/regex/_regex.py
# The build runs the modules of `Lib`, which leaves their bytecode there.
find ../library -name __pycache__ -prune -exec rm -r {} +

# zlib is not in the build, so the interpreter cannot read a compressed archive.
version=$(echo "$CPYTHON_VERSION" | cut -d. -f1,2)
library_zip=python$(echo "$version" | tr -d .).zip
python3 "$root/scripts/create-stored-zip.py" ../library "../$library_zip"
# The interpreter warns at every start without the directory of the extension modules, which an empty file makes.
: > ../empty
python3 "$root/scripts/append-file-sections.py" ../python.wasm "$root/dist/python.wasm" \
  "/lib/$library_zip=../$library_zip" \
  "/lib/python$version/lib-dynload/.keep=../empty"
