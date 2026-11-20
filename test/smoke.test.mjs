import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ConsoleStdout, Directory, File, OpenFile, PreopenDirectory, WASI } from "@bjorn3/browser_wasi_shim";

const dist = new URL("../dist/", import.meta.url);
const versions = JSON.parse(readFileSync(new URL("versions.json", dist), "utf8"));

const readLEB128 = (bytes, offset) => {
  let value = 0;
  for (let scale = 1; ; scale *= 0x80) {
    const byte = bytes[offset++];
    value += (byte & 0x7f) * scale;
    if (byte < 0x80) return [value, offset];
  }
};

const readFileSections = (bytes) => {
  const files = new Map();
  let offset = 8;
  while (offset < bytes.length) {
    const id = bytes[offset];
    const [size, contentStart] = readLEB128(bytes, offset + 1);
    const contentEnd = contentStart + size;
    if (id === 0) {
      const [nameLength, nameStart] = readLEB128(bytes, contentStart);
      const nameEnd = nameStart + nameLength;
      const name = new TextDecoder().decode(bytes.subarray(nameStart, nameEnd));
      if (name.startsWith("file:")) files.set(name.slice("file:".length), bytes.subarray(nameEnd, contentEnd));
    }
    offset = contentEnd;
  }
  return files;
};

const loadRuntime = (name) => {
  const bytes = readFileSync(new URL(name, dist));
  return { module: new WebAssembly.Module(bytes), files: readFileSections(bytes) };
};

const openRoot = (files) => {
  const root = new Map();
  for (const [path, data] of files) {
    const names = path.split("/").slice(1);
    let contents = root;
    for (const name of names.slice(0, -1)) {
      if (!contents.has(name)) contents.set(name, new Directory(new Map()));
      contents = contents.get(name).contents;
    }
    contents.set(names.at(-1), new File(data, { readonly: true }));
  }
  return new PreopenDirectory("/", root);
};

class Stop extends Error {}

// It runs the program like a process, and stops it `stopAfter` milliseconds after the line `recheck:start`.
// The run is synchronous, so only a call of the host can stop it, by throwing.
const run = (runtime, args, stdin, stopAfter = Infinity) => {
  const stdout = [];
  const stderr = [];
  let start = null;
  let isStopping = false;
  const fds = [
    new OpenFile(new File(new TextEncoder().encode(stdin))),
    ConsoleStdout.lineBuffered((line) => {
      stdout.push(line);
      if (line === "recheck:start") start = performance.now();
    }),
    ConsoleStdout.lineBuffered((line) => stderr.push(line)),
    openRoot(runtime.files),
  ];
  const wasi = new WASI(args, [], fds, { debug: false });
  const imports = {};
  for (const [name, call] of Object.entries(wasi.wasiImport)) {
    imports[name] = (...values) => {
      if (start !== null && performance.now() - start >= stopAfter) isStopping = true;
      if (isStopping) throw new Stop();
      return call(...values);
    };
  }
  const instance = new WebAssembly.Instance(runtime.module, { wasi_snapshot_preview1: imports });
  try {
    return { stdout, stderr, exitCode: wasi.start(instance), stopTime: null };
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    return { stdout, stderr, exitCode: null, stopTime: performance.now() - start };
  }
};

const assertTimed = (result, runtime) => {
  assert.equal(result.exitCode, 0, result.stderr.join("\n"));
  assert.equal(result.stdout.length, 3);
  assert.deepEqual(result.stdout.slice(0, 2), [`recheck:runtime ${runtime}`, "recheck:start"]);
  assert.match(result.stdout[2], /^recheck:time \d+$/);
};

const assertFailed = (result, runtime, error) => {
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.stdout, [`recheck:runtime ${runtime}`]);
  assert.match(result.stderr.join("\n"), error);
};

const timeout = 500;

const assertStopped = (result) => {
  assert.equal(result.exitCode, null);
  assert.equal(result.stdout.at(-1), "recheck:start");
  assert.ok(result.stopTime < timeout + 1000, `stopped after ${result.stopTime} ms`);
};

const exponentialString = "'a' * 60 + '!'";

const ruby = loadRuntime("ruby.wasm");
const rubyRuntime = `ruby ${versions.ruby}`;

const runRuby = (pattern, string, stopAfter) => {
  const program = `# encoding: UTF-8
$stdout.sync = true
Regexp.timeout = nil if Regexp.respond_to?(:timeout=)
puts "recheck:runtime ruby #{RUBY_VERSION}"
regex = Regexp.new(${pattern}, 0)
string = ${string}
puts "recheck:start"
start = Process.clock_gettime(Process::CLOCK_MONOTONIC, :millisecond)
begin
  regex.match?(string)
rescue RegexpError, NoMemoryError, SystemStackError => e
  puts "recheck:engine-error #{e.class}"
  exit
end
puts "recheck:time #{Process.clock_gettime(Process::CLOCK_MONOTONIC, :millisecond) - start}"
`;
  return run(ruby, ["ruby", "--disable-gems", "-"], program, stopAfter);
};

test("ruby.wasm times a matching", () => {
  const result = runRuby("'^(a|a)*$'", exponentialString);
  assertTimed(result, rubyRuntime);
  assert.deepEqual(result.stderr, []);
});

test("ruby.wasm fails on an invalid pattern", () => {
  assertFailed(runRuby("'('", "'a'"), rubyRuntime, /end pattern with unmatched parenthesis.*RegexpError/);
});

test("ruby.wasm stops during an exponential matching", () => {
  assertStopped(runRuby(String.raw`'^(a|a)*\1$'`, exponentialString, timeout));
});

const python = loadRuntime("python.wasm");

const runPython = (program, stopAfter) => run(python, ["python3", "-I", "-"], program, stopAfter);

test("python.wasm reports the platform", () => {
  const result = runPython("import platform\nprint(platform.python_version(), platform.machine())\n");
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.stdout, [`${versions.cpython} wasm32`]);
});

for (const { module, version, runtime, exponentialPattern, invalidPatternError } of [
  {
    module: "re",
    version: "platform.python_version()",
    runtime: `python ${versions.cpython}`,
    exponentialPattern: "'^(a|a)*$'",
    invalidPatternError: /Traceback \(most recent call last\):.*re\.PatternError/s,
  },
  {
    module: "regex",
    version: "platform.python_version() + ' regex ' + regex.__version__",
    runtime: `python ${versions.cpython} regex ${versions.regex}`,
    exponentialPattern: String.raw`'^(a|a)*\\1$'`,
    invalidPatternError: /Traceback \(most recent call last\):.*regex\._regex_core\.error/s,
  },
]) {
  const runMatching = (pattern, string, stopAfter) => {
    const program = `import locale, platform, ${module}, sys, time
locale.setlocale(locale.LC_ALL, 'C')
sys.stdout.write('recheck:runtime python ' + ${version} + '\\n')
regex = ${module}.compile(${pattern}, 0)
string = ${string}
sys.stdout.write('recheck:start\\n')
sys.stdout.flush()
start = time.perf_counter_ns()
try:
    regex.search(string)
except (RecursionError, MemoryError) as e:
    sys.stdout.write('recheck:engine-error ' + type(e).__name__ + '\\n')
    sys.exit(0)
sys.stdout.write('recheck:time ' + str((time.perf_counter_ns() - start) // 1000000) + '\\n')
`;
    return runPython(program, stopAfter);
  };

  test(`python.wasm times a matching of ${module}`, () => {
    assertTimed(runMatching(String.raw`'^a*a*!\\?'`, "'a' * 10000 + '!!?'"), runtime);
  });

  test(`python.wasm fails on an invalid pattern of ${module}`, () => {
    assertFailed(runMatching("'('", "'a'"), runtime, invalidPatternError);
  });

  // Without the call of `sched_yield` in `PyErr_CheckSignals`, this run does not end.
  test(`python.wasm stops during an exponential matching of ${module}`, () => {
    assertStopped(runMatching(exponentialPattern, exponentialString, timeout));
  });
}
