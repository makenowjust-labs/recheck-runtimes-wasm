# The `regex` package imports its extension module as `regex._regex`, which is the built-in module `_regex` in this build.
import sys

import _regex

sys.modules[__name__] = _regex
