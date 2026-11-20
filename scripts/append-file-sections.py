#!/usr/bin/env python3
"""Appends files to a WebAssembly module as custom sections named `file:<path>`."""

import argparse
import pathlib


def encode_leb128(value):
    encoded = bytearray()
    while value >= 0x80:
        encoded.append(value & 0x7F | 0x80)
        value >>= 7
    encoded.append(value)
    return bytes(encoded)


def encode_custom_section(name, payload):
    name = name.encode()
    content = encode_leb128(len(name)) + name + payload
    return b"\x00" + encode_leb128(len(content)) + content


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    parser.add_argument(
        "files",
        nargs="+",
        metavar="PATH=FILE",
        help="an absolute path of the WASI file system and the local file with its contents",
    )
    args = parser.parse_args()

    module = args.input.read_bytes()
    if not module.startswith(b"\x00asm"):
        parser.error(f"{args.input} is not a WebAssembly module")
    for file in args.files:
        path, separator, source = file.partition("=")
        if not path.startswith("/") or separator == "":
            parser.error(f"{file} is not PATH=FILE with an absolute PATH")
        module += encode_custom_section("file:" + path, pathlib.Path(source).read_bytes())
    args.output.write_bytes(module)


if __name__ == "__main__":
    main()
