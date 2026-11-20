.PHONY: all test

all:
	scripts/fetch.sh
	scripts/build-ruby.sh
	scripts/build-python.sh
	scripts/write-release-files.sh

test:
	node --test test/smoke.test.mjs
