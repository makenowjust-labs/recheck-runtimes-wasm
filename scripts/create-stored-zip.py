#!/usr/bin/env python3
"""Creates a zip archive of the contents of a directory without compression."""

import argparse
import pathlib
import zipfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()

    with zipfile.ZipFile(args.output, "w", zipfile.ZIP_STORED) as archive:
        for path in sorted(args.directory.rglob("*")):
            archive.write(path, path.relative_to(args.directory))


if __name__ == "__main__":
    main()
