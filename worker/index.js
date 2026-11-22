var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");
// @__NO_SIDE_EFFECTS__
function notImplemented(name) {
  const fn = /* @__PURE__ */ __name(() => {
    throw /* @__PURE__ */ createNotImplementedError(name);
  }, "fn");
  return Object.assign(fn, { __unenv__: true });
}
__name(notImplemented, "notImplemented");
// @__NO_SIDE_EFFECTS__
function notImplementedClass(name) {
  return class {
    __unenv__ = true;
    constructor() {
      throw new Error(`[unenv] ${name} is not implemented yet!`);
    }
  };
}
__name(notImplementedClass, "notImplementedClass");

// node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// node_modules/unenv/dist/runtime/node/console.mjs
import { Writable } from "node:stream";

// node_modules/unenv/dist/runtime/mock/noop.mjs
var noop_default = Object.assign(() => {
}, { __unenv__: true });

// node_modules/unenv/dist/runtime/node/console.mjs
var _console = globalThis.console;
var _ignoreErrors = true;
var _stderr = new Writable();
var _stdout = new Writable();
var log = _console?.log ?? noop_default;
var info = _console?.info ?? log;
var trace = _console?.trace ?? info;
var debug = _console?.debug ?? log;
var table = _console?.table ?? log;
var error = _console?.error ?? log;
var warn = _console?.warn ?? error;
var createTask = _console?.createTask ?? /* @__PURE__ */ notImplemented("console.createTask");
var clear = _console?.clear ?? noop_default;
var count = _console?.count ?? noop_default;
var countReset = _console?.countReset ?? noop_default;
var dir = _console?.dir ?? noop_default;
var dirxml = _console?.dirxml ?? noop_default;
var group = _console?.group ?? noop_default;
var groupEnd = _console?.groupEnd ?? noop_default;
var groupCollapsed = _console?.groupCollapsed ?? noop_default;
var profile = _console?.profile ?? noop_default;
var profileEnd = _console?.profileEnd ?? noop_default;
var time = _console?.time ?? noop_default;
var timeEnd = _console?.timeEnd ?? noop_default;
var timeLog = _console?.timeLog ?? noop_default;
var timeStamp = _console?.timeStamp ?? noop_default;
var Console = _console?.Console ?? /* @__PURE__ */ notImplementedClass("console.Console");
var _times = /* @__PURE__ */ new Map();
var _stdoutErrorHandler = noop_default;
var _stderrErrorHandler = noop_default;

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/console.mjs
var workerdConsole = globalThis["console"];
var {
  assert,
  clear: clear2,
  // @ts-expect-error undocumented public API
  context,
  count: count2,
  countReset: countReset2,
  // @ts-expect-error undocumented public API
  createTask: createTask2,
  debug: debug2,
  dir: dir2,
  dirxml: dirxml2,
  error: error2,
  group: group2,
  groupCollapsed: groupCollapsed2,
  groupEnd: groupEnd2,
  info: info2,
  log: log2,
  profile: profile2,
  profileEnd: profileEnd2,
  table: table2,
  time: time2,
  timeEnd: timeEnd2,
  timeLog: timeLog2,
  timeStamp: timeStamp2,
  trace: trace2,
  warn: warn2
} = workerdConsole;
Object.assign(workerdConsole, {
  Console,
  _ignoreErrors,
  _stderr,
  _stderrErrorHandler,
  _stdout,
  _stdoutErrorHandler,
  _times
});
var console_default = workerdConsole;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-console
globalThis.console = console_default;

// node_modules/unenv/dist/runtime/node/internal/process/hrtime.mjs
var hrtime = /* @__PURE__ */ Object.assign(/* @__PURE__ */ __name(function hrtime2(startTime) {
  const now = Date.now();
  const seconds = Math.trunc(now / 1e3);
  const nanos = now % 1e3 * 1e6;
  if (startTime) {
    let diffSeconds = seconds - startTime[0];
    let diffNanos = nanos - startTime[0];
    if (diffNanos < 0) {
      diffSeconds = diffSeconds - 1;
      diffNanos = 1e9 + diffNanos;
    }
    return [diffSeconds, diffNanos];
  }
  return [seconds, nanos];
}, "hrtime"), { bigint: /* @__PURE__ */ __name(function bigint() {
  return BigInt(Date.now() * 1e6);
}, "bigint") });

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
import { EventEmitter } from "node:events";

// node_modules/unenv/dist/runtime/node/internal/tty/read-stream.mjs
var ReadStream = class {
  static {
    __name(this, "ReadStream");
  }
  fd;
  isRaw = false;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  setRawMode(mode) {
    this.isRaw = mode;
    return this;
  }
};

// node_modules/unenv/dist/runtime/node/internal/tty/write-stream.mjs
var WriteStream = class {
  static {
    __name(this, "WriteStream");
  }
  fd;
  columns = 80;
  rows = 24;
  isTTY = false;
  constructor(fd) {
    this.fd = fd;
  }
  clearLine(dir3, callback) {
    callback && callback();
    return false;
  }
  clearScreenDown(callback) {
    callback && callback();
    return false;
  }
  cursorTo(x, y, callback) {
    callback && typeof callback === "function" && callback();
    return false;
  }
  moveCursor(dx, dy, callback) {
    callback && callback();
    return false;
  }
  getColorDepth(env2) {
    return 1;
  }
  hasColors(count3, env2) {
    return false;
  }
  getWindowSize() {
    return [this.columns, this.rows];
  }
  write(str, encoding, cb) {
    if (str instanceof Uint8Array) {
      str = new TextDecoder().decode(str);
    }
    try {
      console.log(str);
    } catch {
    }
    cb && typeof cb === "function" && cb();
    return false;
  }
};

// node_modules/unenv/dist/runtime/node/internal/process/node-version.mjs
var NODE_VERSION = "22.14.0";

// node_modules/unenv/dist/runtime/node/internal/process/process.mjs
var Process = class _Process extends EventEmitter {
  static {
    __name(this, "Process");
  }
  env;
  hrtime;
  nextTick;
  constructor(impl) {
    super();
    this.env = impl.env;
    this.hrtime = impl.hrtime;
    this.nextTick = impl.nextTick;
    for (const prop of [...Object.getOwnPropertyNames(_Process.prototype), ...Object.getOwnPropertyNames(EventEmitter.prototype)]) {
      const value = this[prop];
      if (typeof value === "function") {
        this[prop] = value.bind(this);
      }
    }
  }
  // --- event emitter ---
  emitWarning(warning, type, code) {
    console.warn(`${code ? `[${code}] ` : ""}${type ? `${type}: ` : ""}${warning}`);
  }
  emit(...args) {
    return super.emit(...args);
  }
  listeners(eventName) {
    return super.listeners(eventName);
  }
  // --- stdio (lazy initializers) ---
  #stdin;
  #stdout;
  #stderr;
  get stdin() {
    return this.#stdin ??= new ReadStream(0);
  }
  get stdout() {
    return this.#stdout ??= new WriteStream(1);
  }
  get stderr() {
    return this.#stderr ??= new WriteStream(2);
  }
  // --- cwd ---
  #cwd = "/";
  chdir(cwd2) {
    this.#cwd = cwd2;
  }
  cwd() {
    return this.#cwd;
  }
  // --- dummy props and getters ---
  arch = "";
  platform = "";
  argv = [];
  argv0 = "";
  execArgv = [];
  execPath = "";
  title = "";
  pid = 200;
  ppid = 100;
  get version() {
    return `v${NODE_VERSION}`;
  }
  get versions() {
    return { node: NODE_VERSION };
  }
  get allowedNodeEnvironmentFlags() {
    return /* @__PURE__ */ new Set();
  }
  get sourceMapsEnabled() {
    return false;
  }
  get debugPort() {
    return 0;
  }
  get throwDeprecation() {
    return false;
  }
  get traceDeprecation() {
    return false;
  }
  get features() {
    return {};
  }
  get release() {
    return {};
  }
  get connected() {
    return false;
  }
  get config() {
    return {};
  }
  get moduleLoadList() {
    return [];
  }
  constrainedMemory() {
    return 0;
  }
  availableMemory() {
    return 0;
  }
  uptime() {
    return 0;
  }
  resourceUsage() {
    return {};
  }
  // --- noop methods ---
  ref() {
  }
  unref() {
  }
  // --- unimplemented methods ---
  umask() {
    throw createNotImplementedError("process.umask");
  }
  getBuiltinModule() {
    return void 0;
  }
  getActiveResourcesInfo() {
    throw createNotImplementedError("process.getActiveResourcesInfo");
  }
  exit() {
    throw createNotImplementedError("process.exit");
  }
  reallyExit() {
    throw createNotImplementedError("process.reallyExit");
  }
  kill() {
    throw createNotImplementedError("process.kill");
  }
  abort() {
    throw createNotImplementedError("process.abort");
  }
  dlopen() {
    throw createNotImplementedError("process.dlopen");
  }
  setSourceMapsEnabled() {
    throw createNotImplementedError("process.setSourceMapsEnabled");
  }
  loadEnvFile() {
    throw createNotImplementedError("process.loadEnvFile");
  }
  disconnect() {
    throw createNotImplementedError("process.disconnect");
  }
  cpuUsage() {
    throw createNotImplementedError("process.cpuUsage");
  }
  setUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.setUncaughtExceptionCaptureCallback");
  }
  hasUncaughtExceptionCaptureCallback() {
    throw createNotImplementedError("process.hasUncaughtExceptionCaptureCallback");
  }
  initgroups() {
    throw createNotImplementedError("process.initgroups");
  }
  openStdin() {
    throw createNotImplementedError("process.openStdin");
  }
  assert() {
    throw createNotImplementedError("process.assert");
  }
  binding() {
    throw createNotImplementedError("process.binding");
  }
  // --- attached interfaces ---
  permission = { has: /* @__PURE__ */ notImplemented("process.permission.has") };
  report = {
    directory: "",
    filename: "",
    signal: "SIGUSR2",
    compact: false,
    reportOnFatalError: false,
    reportOnSignal: false,
    reportOnUncaughtException: false,
    getReport: /* @__PURE__ */ notImplemented("process.report.getReport"),
    writeReport: /* @__PURE__ */ notImplemented("process.report.writeReport")
  };
  finalization = {
    register: /* @__PURE__ */ notImplemented("process.finalization.register"),
    unregister: /* @__PURE__ */ notImplemented("process.finalization.unregister"),
    registerBeforeExit: /* @__PURE__ */ notImplemented("process.finalization.registerBeforeExit")
  };
  memoryUsage = Object.assign(() => ({
    arrayBuffers: 0,
    rss: 0,
    external: 0,
    heapTotal: 0,
    heapUsed: 0
  }), { rss: /* @__PURE__ */ __name(() => 0, "rss") });
  // --- undefined props ---
  mainModule = void 0;
  domain = void 0;
  // optional
  send = void 0;
  exitCode = void 0;
  channel = void 0;
  getegid = void 0;
  geteuid = void 0;
  getgid = void 0;
  getgroups = void 0;
  getuid = void 0;
  setegid = void 0;
  seteuid = void 0;
  setgid = void 0;
  setgroups = void 0;
  setuid = void 0;
  // internals
  _events = void 0;
  _eventsCount = void 0;
  _exiting = void 0;
  _maxListeners = void 0;
  _debugEnd = void 0;
  _debugProcess = void 0;
  _fatalException = void 0;
  _getActiveHandles = void 0;
  _getActiveRequests = void 0;
  _kill = void 0;
  _preload_modules = void 0;
  _rawDebug = void 0;
  _startProfilerIdleNotifier = void 0;
  _stopProfilerIdleNotifier = void 0;
  _tickCallback = void 0;
  _disconnect = void 0;
  _handleQueue = void 0;
  _pendingMessage = void 0;
  _channel = void 0;
  _send = void 0;
  _linkedBinding = void 0;
};

// node_modules/@cloudflare/unenv-preset/dist/runtime/node/process.mjs
var globalProcess = globalThis["process"];
var getBuiltinModule = globalProcess.getBuiltinModule;
var workerdProcess = getBuiltinModule("node:process");
var isWorkerdProcessV2 = globalThis.Cloudflare.compatibilityFlags.enable_nodejs_process_v2;
var unenvProcess = new Process({
  env: globalProcess.env,
  // `hrtime` is only available from workerd process v2
  hrtime: isWorkerdProcessV2 ? workerdProcess.hrtime : hrtime,
  // `nextTick` is available from workerd process v1
  nextTick: workerdProcess.nextTick
});
var { exit, features, platform } = workerdProcess;
var {
  // Always implemented by workerd
  env,
  // Only implemented in workerd v2
  hrtime: hrtime3,
  // Always implemented by workerd
  nextTick
} = unenvProcess;
var {
  _channel,
  _disconnect,
  _events,
  _eventsCount,
  _handleQueue,
  _maxListeners,
  _pendingMessage,
  _send,
  assert: assert2,
  disconnect,
  mainModule
} = unenvProcess;
var {
  // @ts-expect-error `_debugEnd` is missing typings
  _debugEnd,
  // @ts-expect-error `_debugProcess` is missing typings
  _debugProcess,
  // @ts-expect-error `_exiting` is missing typings
  _exiting,
  // @ts-expect-error `_fatalException` is missing typings
  _fatalException,
  // @ts-expect-error `_getActiveHandles` is missing typings
  _getActiveHandles,
  // @ts-expect-error `_getActiveRequests` is missing typings
  _getActiveRequests,
  // @ts-expect-error `_kill` is missing typings
  _kill,
  // @ts-expect-error `_linkedBinding` is missing typings
  _linkedBinding,
  // @ts-expect-error `_preload_modules` is missing typings
  _preload_modules,
  // @ts-expect-error `_rawDebug` is missing typings
  _rawDebug,
  // @ts-expect-error `_startProfilerIdleNotifier` is missing typings
  _startProfilerIdleNotifier,
  // @ts-expect-error `_stopProfilerIdleNotifier` is missing typings
  _stopProfilerIdleNotifier,
  // @ts-expect-error `_tickCallback` is missing typings
  _tickCallback,
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  arch,
  argv,
  argv0,
  availableMemory,
  // @ts-expect-error `binding` is missing typings
  binding,
  channel,
  chdir,
  config,
  connected,
  constrainedMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  // @ts-expect-error `domain` is missing typings
  domain,
  emit,
  emitWarning,
  eventNames,
  execArgv,
  execPath,
  exitCode,
  finalization,
  getActiveResourcesInfo,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getMaxListeners,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  // @ts-expect-error `initgroups` is missing typings
  initgroups,
  kill,
  listenerCount,
  listeners,
  loadEnvFile,
  memoryUsage,
  // @ts-expect-error `moduleLoadList` is missing typings
  moduleLoadList,
  off,
  on,
  once,
  // @ts-expect-error `openStdin` is missing typings
  openStdin,
  permission,
  pid,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  // @ts-expect-error `reallyExit` is missing typings
  reallyExit,
  ref,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  send,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setMaxListeners,
  setSourceMapsEnabled,
  setuid,
  setUncaughtExceptionCaptureCallback,
  sourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  throwDeprecation,
  title,
  traceDeprecation,
  umask,
  unref,
  uptime,
  version,
  versions
} = isWorkerdProcessV2 ? workerdProcess : unenvProcess;
var _process = {
  abort,
  addListener,
  allowedNodeEnvironmentFlags,
  hasUncaughtExceptionCaptureCallback,
  setUncaughtExceptionCaptureCallback,
  loadEnvFile,
  sourceMapsEnabled,
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  constrainedMemory,
  availableMemory,
  cpuUsage,
  cwd,
  debugPort,
  dlopen,
  disconnect,
  emit,
  emitWarning,
  env,
  eventNames,
  execArgv,
  execPath,
  exit,
  finalization,
  features,
  getBuiltinModule,
  getActiveResourcesInfo,
  getMaxListeners,
  hrtime: hrtime3,
  kill,
  listeners,
  listenerCount,
  memoryUsage,
  nextTick,
  on,
  off,
  once,
  pid,
  platform,
  ppid,
  prependListener,
  prependOnceListener,
  rawListeners,
  release,
  removeAllListeners,
  removeListener,
  report,
  resourceUsage,
  setMaxListeners,
  setSourceMapsEnabled,
  stderr,
  stdin,
  stdout,
  title,
  throwDeprecation,
  traceDeprecation,
  umask,
  uptime,
  version,
  versions,
  // @ts-expect-error old API
  domain,
  initgroups,
  moduleLoadList,
  reallyExit,
  openStdin,
  assert: assert2,
  binding,
  send,
  exitCode,
  channel,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  permission,
  mainModule,
  _events,
  _eventsCount,
  _exiting,
  _maxListeners,
  _debugEnd,
  _debugProcess,
  _fatalException,
  _getActiveHandles,
  _getActiveRequests,
  _kill,
  _preload_modules,
  _rawDebug,
  _startProfilerIdleNotifier,
  _stopProfilerIdleNotifier,
  _tickCallback,
  _disconnect,
  _handleQueue,
  _pendingMessage,
  _channel,
  _send,
  _linkedBinding
};
var process_default = _process;

// node_modules/wrangler/_virtual_unenv_global_polyfill-@cloudflare-unenv-preset-node-process
globalThis.process = process_default;

// src/auth.ts
async function verifySupabaseAccessToken(request, env2) {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/i);
  if (!match) return { state: "unauthenticated" };
  if (!env2.SUPABASE_URL || !env2.SUPABASE_PUBLISHABLE_KEY) return { state: "unavailable" };
  let base;
  try {
    base = new URL(env2.SUPABASE_URL);
    if (base.protocol !== "https:" && base.hostname !== "localhost") return { state: "unavailable" };
  } catch {
    return { state: "unavailable" };
  }
  try {
    const response = await fetch(new URL("/auth/v1/user", base), {
      method: "GET",
      headers: {
        apikey: env2.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${match[1]}`,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(8e3)
    });
    if (response.status === 401 || response.status === 403) return { state: "unauthenticated" };
    if (!response.ok) return { state: "unavailable" };
    const user = await response.json();
    if (typeof user.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id)) {
      return { state: "unavailable" };
    }
    return { state: "valid", user: { id: user.id, email: typeof user.email === "string" ? user.email : "" } };
  } catch {
    return { state: "unavailable" };
  }
}
__name(verifySupabaseAccessToken, "verifySupabaseAccessToken");
async function supabaseAdminRequest(env2, path, init) {
  if (!env2.SUPABASE_URL || !env2.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_ADMIN_AUTH_NOT_CONFIGURED");
  }
  const base = new URL(env2.SUPABASE_URL);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("SUPABASE_URL_MUST_USE_HTTPS");
  }
  return fetch(new URL(path, base), {
    ...init,
    headers: {
      apikey: env2.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env2.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers
    },
    signal: AbortSignal.timeout(1e4)
  });
}
__name(supabaseAdminRequest, "supabaseAdminRequest");
async function createSupabaseAuthUser(env2, input) {
  const response = await supabaseAdminRequest(env2, "/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.fullName }
    })
  });
  const payload = await response.json().catch(() => ({}));
  const id = typeof payload.id === "string" ? payload.id : typeof payload.user?.id === "string" ? payload.user.id : null;
  if (!response.ok || !id) {
    throw new Error(`SUPABASE_AUTH_USER_CREATE_FAILED:${response.status}`);
  }
  return id;
}
__name(createSupabaseAuthUser, "createSupabaseAuthUser");
async function deleteSupabaseAuthUser(env2, userId) {
  const response = await supabaseAdminRequest(
    env2,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );
  if (!response.ok && response.status !== 404) {
    throw new Error(`SUPABASE_AUTH_USER_DELETE_FAILED:${response.status}`);
  }
}
__name(deleteSupabaseAuthUser, "deleteSupabaseAuthUser");
async function updateSupabaseAuthUserPassword(env2, userId, password) {
  const response = await supabaseAdminRequest(
    env2,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    { method: "PUT", body: JSON.stringify({ password }) }
  );
  if (!response.ok) {
    throw new Error(`SUPABASE_AUTH_PASSWORD_UPDATE_FAILED:${response.status}`);
  }
}
__name(updateSupabaseAuthUserPassword, "updateSupabaseAuthUserPassword");

// src/authorization.ts
var AUTHORIZATION_SQL = `
SELECT rc.scope_mode AS scope_mode, c.sensitivity AS sensitivity
FROM staff_profile sp
JOIN branch b ON b.id = ?
JOIN staff_role_assignment sra
  ON sra.staff_profile_id = sp.id
 AND sra.branch_id = b.id
JOIN role r ON r.id = sra.role_id AND r.is_active = 1
JOIN role_capability rc ON rc.role_id = r.id
JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
WHERE sp.id = ?
  AND sp.account_status = 'active'
  AND b.is_active = 1
  AND c.code = ?
  AND sra.revoked_at IS NULL
  AND sra.starts_at <= ?
  AND (sra.ends_at IS NULL OR sra.ends_at > ?)
  AND (
    rc.scope_mode = 'branch'
    OR (
      rc.scope_mode = 'team'
      AND ? IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM staff_team_membership tm
        WHERE tm.staff_profile_id = sp.id
          AND tm.team_id = ?
          AND tm.branch_id = b.id
          AND tm.membership_role = 'leader'
          AND tm.revoked_at IS NULL
          AND tm.starts_at <= ?
          AND (tm.ends_at IS NULL OR tm.ends_at > ?)
      )
    )
    OR (
      rc.scope_mode = 'assigned'
      AND ? = 'contact'
      AND ? IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM contact_assignment ca
        WHERE ca.contact_id = ?
          AND ca.branch_id = b.id
          AND ca.assignee_user_id = sp.auth_user_id
          AND ca.starts_at <= ?
          AND (ca.ends_at IS NULL OR ca.ends_at > ?)
      )
    )
    OR (
      rc.scope_mode = 'assigned'
      AND ? = 'followup_task'
      AND ? IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM followup_task ft
        WHERE ft.id = ?
          AND ft.branch_id = b.id
          AND ft.assignee_user_id = sp.auth_user_id
      )
    )
    OR (
      rc.scope_mode = 'explicit_share'
      AND ? IN ('prayer_request', 'pastoral_case')
      AND ? IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM staff_record_share rs
        WHERE rs.staff_profile_id = sp.id
          AND rs.branch_id = b.id
          AND rs.record_type = ?
          AND rs.record_id = ?
          AND rs.revoked_at IS NULL
          AND rs.starts_at <= ?
          AND (rs.ends_at IS NULL OR rs.ends_at > ?)
      )
    )
    OR (
      rc.scope_mode = 'oversight'
      AND c.code IN ('prayer.oversight.read', 'care.oversight.read')
    )
    OR (
      rc.scope_mode = 'assigned'
      AND c.code IN ('prayer.request.read.assigned', 'care.record.read.assigned')
    )
    OR (rc.scope_mode = 'self' AND ? = sp.id)
  )
ORDER BY CASE rc.scope_mode
  WHEN 'branch' THEN 1 WHEN 'team' THEN 2 WHEN 'assigned' THEN 3
  WHEN 'explicit_share' THEN 4 WHEN 'self' THEN 5 ELSE 99 END
LIMIT 1
`;
async function authorizeCapability(db, input) {
  if (!input.actorProfileId || !input.branchId || !/^[a-z][a-z0-9_.-]{2,119}$/.test(input.capability) || !input.now) {
    return { allowed: false };
  }
  const resourceType = input.resourceType ?? "";
  const recordId = input.recordId ?? "";
  const teamId = input.teamId ?? "";
  const row = await db.prepare(AUTHORIZATION_SQL).bind(
    input.branchId,
    input.actorProfileId,
    input.capability,
    input.now,
    input.now,
    teamId,
    teamId,
    input.now,
    input.now,
    resourceType,
    recordId,
    recordId,
    input.now,
    input.now,
    resourceType,
    recordId,
    recordId,
    resourceType,
    recordId,
    resourceType,
    recordId,
    input.now,
    input.now,
    input.actorProfileId
  ).first();
  if (!row) return { allowed: false };
  return { allowed: true, scopeMode: row.scope_mode, sensitivity: row.sensitivity };
}
__name(authorizeCapability, "authorizeCapability");

// src/staff-context.ts
async function resolveStaffContext(request, env2) {
  const verification = await verifySupabaseAccessToken(request, env2);
  if (verification.state === "unauthenticated") return { state: "unauthenticated" };
  if (verification.state === "unavailable") return { state: "auth_unavailable" };
  const user = verification.user;
  const profile3 = await env2.DB.prepare(`
    SELECT id, auth_user_id, full_name, email, account_status,
           must_change_password, password_setup_expires_at
    FROM staff_profile
    WHERE auth_user_id = ?
    LIMIT 1
  `).bind(user.id).first();
  if (!profile3) return { state: "staff_not_provisioned" };
  if (profile3.account_status !== "active") return { state: "staff_inactive" };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const mustChangePassword = profile3.must_change_password === 1;
  const passwordSetupExpiresAt = profile3.password_setup_expires_at ?? null;
  if (mustChangePassword) {
    const expiresAt = Date.parse(passwordSetupExpiresAt ?? "");
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return { state: "password_setup_expired" };
  }
  const branchRows = await env2.DB.prepare(`
    SELECT DISTINCT b.id, b.name, b.timezone
    FROM staff_role_assignment sra
    JOIN role r ON r.id = sra.role_id AND r.is_active = 1
    JOIN branch b ON b.id = sra.branch_id AND b.is_active = 1
    WHERE sra.staff_profile_id = ?
      AND sra.revoked_at IS NULL
      AND sra.starts_at <= ?
      AND (sra.ends_at IS NULL OR sra.ends_at > ?)
    ORDER BY b.name COLLATE NOCASE
  `).bind(profile3.id, now, now).all();
  const staff = {
    userId: user.id,
    profileId: profile3.id,
    fullName: profile3.full_name,
    email: profile3.email ?? user.email,
    branches: mustChangePassword ? [] : branchRows.results ?? [],
    roles: [],
    capabilities: [],
    mustChangePassword,
    passwordSetupExpiresAt
  };
  const assignmentRows = await env2.DB.prepare(`
    SELECT DISTINCT r.id AS role_id, r.code, r.name, b.id AS branch_id
    FROM staff_role_assignment sra
    JOIN role r ON r.id = sra.role_id AND r.is_active = 1
    JOIN branch b ON b.id = sra.branch_id AND b.is_active = 1
    WHERE sra.staff_profile_id = ? AND sra.revoked_at IS NULL
      AND sra.starts_at <= ? AND (sra.ends_at IS NULL OR sra.ends_at > ?)
    ORDER BY b.name COLLATE NOCASE, r.code
  `).bind(profile3.id, now, now).all();
  const activeAssignments = assignmentRows.results ?? [];
  if (!mustChangePassword) {
    staff.roles = activeAssignments.map(({ code, name, branch_id }) => ({ code, name, branch_id }));
    if (activeAssignments.length > 0) {
      const roleIds = [...new Set(activeAssignments.map((row) => row.role_id))];
      const placeholders = roleIds.map(() => "?").join(",");
      const grants2 = await env2.DB.prepare(`
        SELECT DISTINCT c.code, rc.scope_mode, sra.branch_id
        FROM staff_role_assignment sra
        JOIN role_capability rc ON rc.role_id = sra.role_id
        JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
        WHERE sra.staff_profile_id = ? AND sra.role_id IN (${placeholders})
          AND sra.revoked_at IS NULL AND sra.starts_at <= ?
          AND (sra.ends_at IS NULL OR sra.ends_at > ?)
        ORDER BY sra.branch_id, c.code, rc.scope_mode
      `).bind(profile3.id, ...roleIds, now, now).all();
      staff.capabilities = grants2.results ?? [];
    }
  }
  const requestedBranchId = request.headers.get("x-branch-id");
  if (!requestedBranchId) return { state: "authenticated", staff, activeBranch: null };
  const branch = staff.branches.find((item) => item.id === requestedBranchId);
  if (!branch) return { state: "branch_not_authorized" };
  const grants = await env2.DB.prepare(`
    SELECT DISTINCT r.code AS role_code, c.code AS capability_code,
           rc.scope_mode, c.sensitivity
    FROM staff_role_assignment sra
    JOIN role r ON r.id = sra.role_id AND r.is_active = 1
    JOIN role_capability rc ON rc.role_id = r.id
    JOIN capability c ON c.id = rc.capability_id AND c.is_active = 1
    WHERE sra.staff_profile_id = ?
      AND sra.branch_id = ?
      AND sra.revoked_at IS NULL
      AND sra.starts_at <= ?
      AND (sra.ends_at IS NULL OR sra.ends_at > ?)
    ORDER BY r.code, c.code
  `).bind(profile3.id, branch.id, now, now).all();
  const rows = grants.results ?? [];
  return {
    state: "authenticated",
    staff,
    activeBranch: {
      branchId: branch.id,
      branchName: branch.name,
      roles: [...new Set(rows.map((row) => row.role_code))],
      capabilities: rows.map((row) => ({
        code: row.capability_code,
        scopeMode: row.scope_mode,
        sensitivity: row.sensitivity
      }))
    }
  };
}
__name(resolveStaffContext, "resolveStaffContext");
async function authorizeRequestCapability(request, env2, capability, resource) {
  const context2 = await resolveStaffContext(request, env2);
  if (context2.state !== "authenticated") return context2;
  if (!context2.activeBranch) return { state: "branch_required" };
  const decision = await authorizeCapability(env2.DB, {
    actorProfileId: context2.staff.profileId,
    branchId: context2.activeBranch.branchId,
    capability,
    now: (/* @__PURE__ */ new Date()).toISOString(),
    resourceType: resource?.type,
    recordId: resource?.recordId,
    teamId: resource?.teamId
  });
  if (!decision.allowed) return { state: "capability_denied" };
  return { state: "authorized", staff: context2.staff, activeBranch: context2.activeBranch, decision };
}
__name(authorizeRequestCapability, "authorizeRequestCapability");

// src/index.ts
function json(status, body, requestId, origin) {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "X-Request-Id": requestId
  });
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return new Response(JSON.stringify({ ...body, request_id: requestId }), { status, headers });
}
__name(json, "json");
function allowedOrigins(env2) {
  const values = (env2.APP_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean);
  const origins = /* @__PURE__ */ new Set();
  for (const value of values) {
    try {
      const parsed = new URL(value);
      if ((parsed.protocol === "https:" || parsed.hostname === "localhost") && parsed.origin === value.replace(/\/$/, "")) origins.add(parsed.origin);
    } catch {
    }
  }
  return origins;
}
__name(allowedOrigins, "allowedOrigins");
function requestOriginAllowed(request, env2) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  try {
    return allowedOrigins(env2).has(new URL(origin).origin);
  } catch {
    return false;
  }
}
__name(requestOriginAllowed, "requestOriginAllowed");
function authCorsHeaders(origin) {
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Branch-Id, Idempotency-Key",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin"
  });
}
__name(authCorsHeaders, "authCorsHeaders");
var STANDARD_ASSIGNABLE_ROLES = /* @__PURE__ */ new Set([
  "coordinator",
  "team_leader",
  "field_worker",
  "follow_up_volunteer",
  "prayer_intercessor"
]);
async function readJsonBody(request, maxBytes = 8192) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) return { ok: false, status: 413 };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, status: 400 };
  }
}
__name(readJsonBody, "readJsonBody");
function parseIsoTimestamp(value, fallback) {
  if (value === void 0 || value === null || value === "") return fallback;
  if (typeof value !== "string" || value.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
}
__name(parseIsoTimestamp, "parseIsoTimestamp");
function mapCapabilityFailure(state, requestId, origin) {
  const status = state === "unauthenticated" ? 401 : state === "auth_unavailable" ? 503 : state === "branch_required" ? 400 : 403;
  return json(status, {
    ok: false,
    error: { code: state.toUpperCase() }
  }, requestId, origin);
}
__name(mapCapabilityFailure, "mapCapabilityFailure");
async function assignStaffRole(request, env2, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.role.assign");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) {
    return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  }
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const allowedKeys = /* @__PURE__ */ new Set(["target_profile_id", "role_code", "starts_at", "ends_at", "reason"]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
    return json(400, { ok: false, error: { code: "UNEXPECTED_FIELDS" } }, requestId, origin);
  }
  const targetProfileId = typeof payload.target_profile_id === "string" ? payload.target_profile_id.trim() : "";
  const roleCode = typeof payload.role_code === "string" ? payload.role_code : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const startsAt = parseIsoTimestamp(payload.starts_at, now);
  const endsAt = payload.ends_at === void 0 || payload.ends_at === null || payload.ends_at === "" ? null : parseIsoTimestamp(payload.ends_at, "");
  if (!targetProfileId || targetProfileId.length > 128 || !STANDARD_ASSIGNABLE_ROLES.has(roleCode) || targetProfileId === access.staff.profileId || reason.length < 10 || reason.length > 500 || !startsAt || payload.ends_at !== void 0 && payload.ends_at !== null && payload.ends_at !== "" && !endsAt || endsAt !== null && endsAt <= startsAt) {
    return json(400, { ok: false, error: { code: "INVALID_ROLE_ASSIGNMENT" } }, requestId, origin);
  }
  const target = await env2.DB.prepare(`
    SELECT id, account_status
    FROM staff_profile
    WHERE id = ?
      AND account_status IN ('invited', 'active')
    LIMIT 1
  `).bind(targetProfileId).first();
  if (!target) {
    return json(404, { ok: false, error: { code: "STAFF_PROFILE_NOT_FOUND" } }, requestId, origin);
  }
  const role = await env2.DB.prepare(
    "SELECT id FROM role WHERE code = ? AND is_active = 1 LIMIT 1"
  ).bind(roleCode).first();
  if (!role) {
    return json(400, { ok: false, error: { code: "ROLE_NOT_AVAILABLE" } }, requestId, origin);
  }
  const assignmentId = crypto.randomUUID();
  const metadata = JSON.stringify({ role_code: roleCode, assignment_id: assignmentId });
  try {
    const results = await env2.DB.batch([
      env2.DB.prepare(`
        INSERT INTO staff_role_assignment
          (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, ends_at, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        assignmentId,
        target.id,
        role.id,
        access.activeBranch.branchId,
        access.staff.profileId,
        startsAt,
        endsAt,
        reason,
        now
      ),
      env2.DB.prepare(`
        INSERT INTO staff_access_audit
          (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
        VALUES (?, ?, ?, ?, 'role_assigned', ?, ?, ?)
      `).bind(
        crypto.randomUUID(),
        access.activeBranch.branchId,
        access.staff.profileId,
        target.id,
        reason,
        metadata,
        now
      )
    ]);
    if (results.some((result) => !result.success)) throw new Error("ROLE_ASSIGNMENT_BATCH_FAILED");
  } catch {
    return json(409, { ok: false, error: { code: "ROLE_ASSIGNMENT_CONFLICT" } }, requestId, origin);
  }
  return json(201, {
    ok: true,
    assignment: {
      id: assignmentId,
      target_profile_id: target.id,
      role_code: roleCode,
      branch_id: access.activeBranch.branchId,
      starts_at: startsAt,
      ends_at: endsAt
    }
  }, requestId, origin);
}
__name(assignStaffRole, "assignStaffRole");
async function revokeStaffRole(request, env2, assignmentId, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.role.assign");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  if (!assignmentId || assignmentId.length > 128) {
    return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT_ID" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) {
    return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  }
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (Object.keys(payload).some((key) => key !== "reason") || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_REVOCATION_REASON" } }, requestId, origin);
  }
  const existing = await env2.DB.prepare(`
    SELECT sra.id, sra.staff_profile_id, r.code AS role_code
    FROM staff_role_assignment sra
    JOIN role r ON r.id = sra.role_id
    WHERE sra.id = ?
      AND sra.branch_id = ?
      AND sra.revoked_at IS NULL
    LIMIT 1
  `).bind(assignmentId, access.activeBranch.branchId).first();
  if (!existing) {
    return json(404, { ok: false, error: { code: "ROLE_ASSIGNMENT_NOT_FOUND" } }, requestId, origin);
  }
  if (existing.role_code === "admin_pastor") {
    return json(409, {
      ok: false,
      error: { code: "ADMIN_PASTOR_REVOCATION_REQUIRES_DUAL_CONTROL" }
    }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const metadata = JSON.stringify({ role_code: existing.role_code, assignment_id: existing.id });
  try {
    const results = await env2.DB.batch([
      env2.DB.prepare(`
        UPDATE staff_role_assignment
        SET revoked_at = ?, revoked_by = ?, reason = ?
        WHERE id = ? AND branch_id = ? AND revoked_at IS NULL
      `).bind(now, access.staff.profileId, reason, existing.id, access.activeBranch.branchId),
      env2.DB.prepare(`
        INSERT INTO staff_access_audit
          (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
        SELECT ?, ?, ?, ?, 'role_revoked', ?, ?, ?
        WHERE changes() = 1
      `).bind(
        crypto.randomUUID(),
        access.activeBranch.branchId,
        access.staff.profileId,
        existing.staff_profile_id,
        reason,
        metadata,
        now
      )
    ]);
    if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "ROLE_ASSIGNMENT_CHANGED" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "ROLE_REVOCATION_CONFLICT" } }, requestId, origin);
  }
  return json(200, { ok: true, revoked_assignment_id: existing.id }, requestId, origin);
}
__name(revokeStaffRole, "revokeStaffRole");
async function listAdminElevationRequests(request, env2, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.role.approve");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const rows = await env2.DB.prepare(`
    SELECT req.id, req.target_profile_id, target.full_name AS target_name,
           req.requested_by, requester.full_name AS requester_name,
           req.reason, req.requested_at
    FROM staff_role_elevation_request req
    JOIN staff_profile target ON target.id = req.target_profile_id
    JOIN staff_profile requester ON requester.id = req.requested_by
    WHERE req.branch_id = ? AND req.status = 'pending'
    ORDER BY req.requested_at ASC
    LIMIT 100
  `).bind(access.activeBranch.branchId).all();
  return json(200, {
    ok: true,
    requests: rows.results ?? []
  }, requestId, origin);
}
__name(listAdminElevationRequests, "listAdminElevationRequests");
async function createAdminElevationRequest(request, env2, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.role.assign");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) {
    return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  }
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  if (Object.keys(payload).some((key) => key !== "target_profile_id" && key !== "reason")) {
    return json(400, { ok: false, error: { code: "UNEXPECTED_FIELDS" } }, requestId, origin);
  }
  const targetProfileId = typeof payload.target_profile_id === "string" ? payload.target_profile_id.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!targetProfileId || targetProfileId.length > 128 || targetProfileId === access.staff.profileId || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_ELEVATION_REQUEST" } }, requestId, origin);
  }
  const target = await env2.DB.prepare(`
    SELECT id FROM staff_profile
    WHERE id = ? AND account_status = 'active'
    LIMIT 1
  `).bind(targetProfileId).first();
  if (!target) {
    return json(404, { ok: false, error: { code: "ACTIVE_STAFF_PROFILE_NOT_FOUND" } }, requestId, origin);
  }
  const adminRole = await env2.DB.prepare(
    "SELECT id FROM role WHERE code = 'admin_pastor' AND is_active = 1 LIMIT 1"
  ).first();
  if (!adminRole) {
    return json(503, { ok: false, error: { code: "ADMIN_PASTOR_ROLE_UNAVAILABLE" } }, requestId, origin);
  }
  const elevationId = crypto.randomUUID();
  const requestedAt = (/* @__PURE__ */ new Date()).toISOString();
  try {
    const result = await env2.DB.prepare(`
      INSERT INTO staff_role_elevation_request
        (id, branch_id, target_profile_id, role_id, requested_by, reason, requested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      elevationId,
      access.activeBranch.branchId,
      target.id,
      adminRole.id,
      access.staff.profileId,
      reason,
      requestedAt
    ).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) {
      throw new Error("ELEVATION_REQUEST_NOT_CREATED");
    }
  } catch {
    return json(409, {
      ok: false,
      error: { code: "ELEVATION_REQUEST_CONFLICT", message: "A request may already be open for this staff member in this branch." }
    }, requestId, origin);
  }
  return json(201, {
    ok: true,
    elevation_request: {
      id: elevationId,
      target_profile_id: target.id,
      branch_id: access.activeBranch.branchId,
      status: "pending",
      requested_at: requestedAt
    }
  }, requestId, origin);
}
__name(createAdminElevationRequest, "createAdminElevationRequest");
async function reviewAdminElevationRequest(request, env2, elevationId, decision, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.role.approve");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) {
    return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  }
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const allowedKeys = decision === "approve" ? /* @__PURE__ */ new Set(["review_reason", "ends_at"]) : /* @__PURE__ */ new Set(["review_reason"]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) {
    return json(400, { ok: false, error: { code: "UNEXPECTED_FIELDS" } }, requestId, origin);
  }
  const reviewReason = typeof payload.review_reason === "string" ? payload.review_reason.trim() : "";
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const endsAt = decision === "approve" && payload.ends_at !== void 0 && payload.ends_at !== null && payload.ends_at !== "" ? parseIsoTimestamp(payload.ends_at, "") : null;
  if (!elevationId || elevationId.length > 128 || reviewReason.length < 10 || reviewReason.length > 500 || decision === "approve" && payload.ends_at !== void 0 && payload.ends_at !== null && payload.ends_at !== "" && !endsAt || endsAt !== null && endsAt <= now) {
    return json(400, { ok: false, error: { code: "INVALID_ELEVATION_REVIEW" } }, requestId, origin);
  }
  if (decision === "reject") {
    try {
      const result = await env2.DB.prepare(`
        UPDATE staff_role_elevation_request
        SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_reason = ?
        WHERE id = ? AND branch_id = ? AND status = 'pending'
      `).bind(
        access.staff.profileId,
        now,
        reviewReason,
        elevationId,
        access.activeBranch.branchId
      ).run();
      if (!result.success || (result.meta?.changes ?? 0) !== 1) {
        return json(409, { ok: false, error: { code: "ELEVATION_REQUEST_NOT_PENDING" } }, requestId, origin);
      }
    } catch {
      return json(409, { ok: false, error: { code: "ELEVATION_REVIEW_NOT_AUTHORIZED" } }, requestId, origin);
    }
    return json(200, { ok: true, elevation_request_id: elevationId, status: "rejected" }, requestId, origin);
  }
  const assignmentId = crypto.randomUUID();
  try {
    const results = await env2.DB.batch([
      env2.DB.prepare(`
        UPDATE staff_role_elevation_request
        SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_reason = ?
        WHERE id = ? AND branch_id = ? AND status = 'pending'
      `).bind(
        access.staff.profileId,
        now,
        reviewReason,
        elevationId,
        access.activeBranch.branchId
      ),
      env2.DB.prepare(`
        INSERT INTO staff_role_assignment
          (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, ends_at, reason, created_at)
        SELECT ?, req.target_profile_id, req.role_id, req.branch_id, ?,
               req.reviewed_at, ?, req.reason, ?
        FROM staff_role_elevation_request req
        WHERE req.id = ? AND req.branch_id = ?
          AND req.status = 'approved' AND req.reviewed_by = ?
          AND changes() = 1
      `).bind(
        assignmentId,
        access.staff.profileId,
        endsAt,
        now,
        elevationId,
        access.activeBranch.branchId,
        access.staff.profileId
      )
    ]);
    if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "ELEVATION_REQUEST_NOT_PENDING" } }, requestId, origin);
    }
  } catch {
    return json(409, {
      ok: false,
      error: { code: "ELEVATION_REVIEW_NOT_AUTHORIZED", message: "A distinct active Admin/Pastor reviewer is required." }
    }, requestId, origin);
  }
  return json(200, {
    ok: true,
    elevation_request_id: elevationId,
    assignment_id: assignmentId,
    status: "applied"
  }, requestId, origin);
}
__name(reviewAdminElevationRequest, "reviewAdminElevationRequest");
async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");
function createTemporaryPassword() {
  const bytes = crypto.getRandomValues(new Uint8Array(36));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Pm!7Aa${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
}
__name(createTemporaryPassword, "createTemporaryPassword");
async function requestStaffPasswordReset(request, env2, requestId, origin) {
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "email") || typeof payload.email !== "string" || payload.email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(payload.email.trim())) {
    return json(400, { ok: false, error: { code: "INVALID_RESET_REQUEST" } }, requestId, origin);
  }
  if (!env2.SUPABASE_SERVICE_ROLE_KEY) {
    return json(503, { ok: false, error: { code: "AUTH_SERVICE_UNAVAILABLE" } }, requestId, origin);
  }
  const email = payload.email.trim().toLowerCase();
  const clientIp = request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
  const ipFingerprint = await sha256Hex(`${env2.SUPABASE_SERVICE_ROLE_KEY}:${clientIp}`);
  const emailFingerprint = await sha256Hex(`${env2.SUPABASE_SERVICE_ROLE_KEY}:${email}`);
  const now = /* @__PURE__ */ new Date();
  const requestedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1e3).toISOString();
  const recent = await env2.DB.prepare(`
    SELECT COUNT(*) AS count FROM staff_password_reset_request
    WHERE ip_fingerprint = ? AND requested_at > ?
  `).bind(ipFingerprint, new Date(now.getTime() - 15 * 60 * 1e3).toISOString()).first();
  if ((recent?.count ?? 0) >= 5) {
    return json(429, { ok: false, error: { code: "RESET_REQUEST_RATE_LIMITED", message: "Too many requests. Try again later." } }, requestId, origin);
  }
  const target = await env2.DB.prepare(`
    SELECT sp.id AS profile_id, sra.branch_id
    FROM staff_profile sp
    JOIN staff_role_assignment sra ON sra.staff_profile_id = sp.id
    JOIN branch b ON b.id = sra.branch_id AND b.is_active = 1
    WHERE lower(sp.email) = ? AND sp.account_status = 'active'
      AND sra.revoked_at IS NULL AND sra.starts_at <= ?
      AND (sra.ends_at IS NULL OR sra.ends_at > ?)
    ORDER BY sra.starts_at DESC LIMIT 1
  `).bind(email, requestedAt, requestedAt).first();
  if (!target) return json(200, { ok: true, message: "If this address belongs to an active staff account, an administrator will review the request." }, requestId, origin);
  const requestIdValue = crypto.randomUUID();
  const adminRows = await env2.DB.prepare(`
    SELECT DISTINCT sp.auth_user_id
    FROM staff_role_assignment sra
    JOIN staff_profile sp ON sp.id = sra.staff_profile_id AND sp.account_status = 'active'
    JOIN role r ON r.id = sra.role_id AND r.code = 'admin_pastor' AND r.is_active = 1
    WHERE sra.branch_id = ? AND sra.revoked_at IS NULL
      AND sra.starts_at <= ? AND (sra.ends_at IS NULL OR sra.ends_at > ?)
  `).bind(target.branch_id, requestedAt, requestedAt).all();
  const statements = [
    env2.DB.prepare(`
      INSERT INTO staff_password_reset_request
        (id, target_profile_id, branch_id, email_normalized, email_fingerprint, ip_fingerprint,
         status, requested_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).bind(requestIdValue, target.profile_id, target.branch_id, email, emailFingerprint, ipFingerprint, requestedAt, expiresAt),
    env2.DB.prepare(`
      INSERT INTO staff_password_reset_audit
        (id, request_id, branch_id, actor_profile_id, event_type, metadata, created_at)
      VALUES (?, ?, ?, NULL, 'requested', '{}', ?)
    `).bind(crypto.randomUUID(), requestIdValue, target.branch_id, requestedAt)
  ];
  for (const admin of adminRows.results ?? []) {
    statements.push(env2.DB.prepare(`
      INSERT INTO staff_notification
        (id, branch_id, recipient_user_id, category, title, body, target_type, target_id, idempotency_key, created_at)
      VALUES (?, ?, ?, 'system', 'Password reset request', 'A staff member has requested a password reset. Review it in Access requests.', NULL, NULL, ?, ?)
    `).bind(
      crypto.randomUUID(),
      target.branch_id,
      admin.auth_user_id,
      `password-reset:${requestIdValue}:${admin.auth_user_id}`,
      requestedAt
    ));
  }
  try {
    const results = await env2.DB.batch(statements);
    if (results.some((result) => !result.success || (result.meta?.changes ?? 0) !== 1)) throw new Error("RESET_REQUEST_WRITE_FAILED");
  } catch {
    return json(503, { ok: false, error: { code: "RESET_REQUEST_UNAVAILABLE" } }, requestId, origin);
  }
  return json(200, { ok: true, message: "If this address belongs to an active staff account, an administrator will review the request." }, requestId, origin);
}
__name(requestStaffPasswordReset, "requestStaffPasswordReset");
async function listStaffPasswordResetRequests(request, env2, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.password_reset.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  if (!access.activeBranch.roles.includes("admin_pastor")) {
    return json(403, { ok: false, error: { code: "ADMIN_PASTOR_REQUIRED" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const rows = await env2.DB.prepare(`
    SELECT req.id, req.email_normalized AS email, sp.full_name, req.requested_at,
           req.expires_at, req.status
    FROM staff_password_reset_request req
    JOIN staff_profile sp ON sp.id = req.target_profile_id
    WHERE req.branch_id = ? AND req.status IN ('pending','processing')
      AND req.expires_at > ?
    ORDER BY req.requested_at ASC LIMIT 100
  `).bind(access.activeBranch.branchId, now).all();
  return json(200, { ok: true, data: rows.results ?? [] }, requestId, origin);
}
__name(listStaffPasswordResetRequests, "listStaffPasswordResetRequests");
async function reviewStaffPasswordReset(request, env2, resetId, decision, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.password_reset.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  if (!access.activeBranch.roles.includes("admin_pastor")) {
    return json(403, { ok: false, error: { code: "ADMIN_PASTOR_REQUIRED" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (payload.branch_id !== access.activeBranch.branchId || reason.length < 10 || reason.length > 300) {
    return json(400, { ok: false, error: { code: "INVALID_RESET_REVIEW" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const reset = await env2.DB.prepare(`
    SELECT req.id, req.target_profile_id, req.branch_id, req.status, req.expires_at,
           sp.auth_user_id, sp.email
    FROM staff_password_reset_request req
    JOIN staff_profile sp ON sp.id = req.target_profile_id
    WHERE req.id = ? AND req.branch_id = ? LIMIT 1
  `).bind(resetId, access.activeBranch.branchId).first();
  if (!reset || reset.status !== "pending" || reset.expires_at <= now) {
    return json(409, { ok: false, error: { code: "RESET_REQUEST_NOT_PENDING" } }, requestId, origin);
  }
  if (decision === "deny") {
    const results = await env2.DB.batch([
      env2.DB.prepare(`
        UPDATE staff_password_reset_request
        SET status = 'denied', reviewed_by_profile_id = ?, reviewed_at = ?, review_reason = ?
        WHERE id = ? AND branch_id = ? AND status = 'pending'
      `).bind(access.staff.profileId, now, reason, resetId, reset.branch_id),
      env2.DB.prepare(`
        INSERT INTO staff_password_reset_audit
          (id, request_id, branch_id, actor_profile_id, event_type, metadata, created_at)
        VALUES (?, ?, ?, ?, 'denied', ?, ?)
      `).bind(
        crypto.randomUUID(),
        resetId,
        reset.branch_id,
        access.staff.profileId,
        JSON.stringify({ reason }),
        now
      )
    ]);
    if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "RESET_REQUEST_NOT_PENDING" } }, requestId, origin);
    }
    return json(200, { ok: true, data: { status: "denied" } }, requestId, origin);
  }
  const claim = await env2.DB.prepare(`
    UPDATE staff_password_reset_request SET status = 'processing'
    WHERE id = ? AND branch_id = ? AND status = 'pending' AND expires_at > ?
  `).bind(resetId, reset.branch_id, now).run();
  if (!claim.success || (claim.meta?.changes ?? 0) !== 1) {
    return json(409, { ok: false, error: { code: "RESET_REQUEST_NOT_PENDING" } }, requestId, origin);
  }
  const temporaryPassword = createTemporaryPassword();
  try {
    await updateSupabaseAuthUserPassword(env2, reset.auth_user_id, temporaryPassword);
  } catch {
    await env2.DB.prepare(`
      UPDATE staff_password_reset_request SET status = 'pending'
      WHERE id = ? AND status = 'processing'
    `).bind(resetId).run();
    return json(503, { ok: false, error: { code: "AUTH_PASSWORD_RESET_FAILED" } }, requestId, origin);
  }
  const passwordExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1e3).toISOString();
  try {
    const results = await env2.DB.batch([
      env2.DB.prepare(`
        UPDATE staff_profile
        SET must_change_password = 1, password_setup_expires_at = ?, password_changed_at = NULL, updated_at = ?
        WHERE id = ? AND account_status = 'active'
      `).bind(passwordExpiresAt, now, reset.target_profile_id),
      env2.DB.prepare(`
        UPDATE staff_password_reset_request
        SET status = 'approved', reviewed_by_profile_id = ?, reviewed_at = ?, review_reason = ?
        WHERE id = ? AND status = 'processing'
      `).bind(access.staff.profileId, now, reason, resetId),
      env2.DB.prepare(`
        INSERT INTO staff_password_reset_audit
          (id, request_id, branch_id, actor_profile_id, event_type, metadata, created_at)
        VALUES (?, ?, ?, ?, 'approved', ?, ?)
      `).bind(
        crypto.randomUUID(),
        resetId,
        reset.branch_id,
        access.staff.profileId,
        JSON.stringify({ reason, credential_handoff: "one_time_manual", expires_in_hours: 24 }),
        now
      )
    ]);
    if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1) {
      throw new Error("RESET_APPROVAL_COMMIT_FAILED");
    }
  } catch {
    try {
      await env2.DB.batch([
        env2.DB.prepare(`
          UPDATE staff_profile
          SET must_change_password = 1, password_setup_expires_at = ?, password_changed_at = NULL, updated_at = ?
          WHERE id = ? AND account_status = 'active'
        `).bind(passwordExpiresAt, now, reset.target_profile_id),
        env2.DB.prepare(`
          UPDATE staff_password_reset_request SET status = 'pending'
          WHERE id = ? AND status = 'processing'
        `).bind(resetId)
      ]);
    } catch {
    }
    return json(503, { ok: false, error: { code: "RESET_APPROVAL_COMMIT_FAILED" } }, requestId, origin);
  }
  return json(200, {
    ok: true,
    data: {
      status: "approved",
      email: reset.email,
      temporary_password: temporaryPassword,
      temporary_password_sent: false,
      manual_handoff_required: true,
      must_change_password: true,
      password_expires_in_hours: 24
    }
  }, requestId, origin);
}
__name(reviewStaffPasswordReset, "reviewStaffPasswordReset");
async function completeStaffPasswordChange(request, env2, requestId, origin) {
  const verification = await verifySupabaseAccessToken(request, env2);
  if (verification.state === "unauthenticated") return json(401, { ok: false, error: { code: "UNAUTHENTICATED" } }, requestId, origin);
  if (verification.state !== "valid") return json(503, { ok: false, error: { code: "AUTH_SERVICE_UNAVAILABLE" } }, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "password") || password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return json(400, { ok: false, error: { code: "WEAK_PASSWORD", message: "Use 12\u2013128 characters with uppercase and lowercase letters, a number and a symbol." } }, requestId, origin);
  }
  const profile3 = await env2.DB.prepare(`
    SELECT id, account_status, must_change_password, password_setup_expires_at
    FROM staff_profile WHERE auth_user_id = ? LIMIT 1
  `).bind(verification.user.id).first();
  if (!profile3 || profile3.account_status !== "active") {
    return json(403, { ok: false, error: { code: "STAFF_ACCOUNT_INACTIVE" } }, requestId, origin);
  }
  if (profile3.must_change_password === 1) {
    const expiry = Date.parse(profile3.password_setup_expires_at ?? "");
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      return json(403, { ok: false, error: { code: "PASSWORD_SETUP_EXPIRED" } }, requestId, origin);
    }
  }
  try {
    await updateSupabaseAuthUserPassword(env2, verification.user.id, password);
  } catch {
    return json(503, { ok: false, error: { code: "PASSWORD_CHANGE_FAILED" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const latestReset = await env2.DB.prepare(`
    SELECT id FROM staff_password_reset_request
    WHERE target_profile_id = ? AND status = 'approved'
    ORDER BY reviewed_at DESC LIMIT 1
  `).bind(profile3.id).first();
  const statements = [
    env2.DB.prepare(`
      UPDATE staff_profile
      SET must_change_password = 0, password_setup_expires_at = NULL,
          password_changed_at = ?, updated_at = ?
      WHERE id = ? AND account_status = 'active'
    `).bind(now, now, profile3.id)
  ];
  if (latestReset) {
    statements.push(env2.DB.prepare(`
      INSERT INTO staff_password_reset_audit
        (id, request_id, branch_id, actor_profile_id, event_type, metadata, created_at)
      SELECT ?, ?, branch_id, ?, 'reset_completed', '{}', ?
      FROM staff_password_reset_request WHERE id = ?
    `).bind(crypto.randomUUID(), latestReset.id, profile3.id, now, latestReset.id));
    statements.push(env2.DB.prepare(`
      UPDATE staff_password_reset_request SET status = 'completed', completed_at = ?
      WHERE id = ? AND status = 'approved'
    `).bind(now, latestReset.id));
  }
  const results = await env2.DB.batch(statements);
  if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1) {
    return json(503, { ok: false, error: { code: "PASSWORD_CHANGE_CONFIRMATION_FAILED" } }, requestId, origin);
  }
  return json(200, { ok: true, data: { password_changed: true, must_change_password: false } }, requestId, origin);
}
__name(completeStaffPasswordChange, "completeStaffPasswordChange");
async function createStaffAccount(request, env2, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.account.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  if (!access.activeBranch.roles.includes("admin_pastor")) {
    return json(403, { ok: false, error: { code: "ADMIN_PASTOR_REQUIRED" } }, requestId, origin);
  }
  const roleAccess = await authorizeRequestCapability(request, env2, "staff.role.assign");
  if (roleAccess.state !== "authorized" || roleAccess.staff.profileId !== access.staff.profileId || roleAccess.activeBranch.branchId !== access.activeBranch.branchId) {
    return json(403, { ok: false, error: { code: "STAFF_ROLE_ASSIGNMENT_NOT_AUTHORIZED" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  const allowed = /* @__PURE__ */ new Set(["branch_id", "full_name", "email", "role_code", "reason"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_STAFF_ACCOUNT_BODY" } }, requestId, origin);
  }
  const branchId = typeof payload.branch_id === "string" ? payload.branch_id.trim() : access.activeBranch.branchId;
  const fullName = typeof payload.full_name === "string" ? payload.full_name.trim() : "";
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const roleCode = typeof payload.role_code === "string" ? payload.role_code : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (branchId !== access.activeBranch.branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
  }
  if (fullName.length < 2 || fullName.length > 180 || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$/.test(email) || email.length > 254 || !STANDARD_ASSIGNABLE_ROLES.has(roleCode) || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: roleCode === "admin_pastor" ? "ADMIN_PASTOR_REQUIRES_DUAL_CONTROL" : "INVALID_STAFF_ACCOUNT_DETAILS" } }, requestId, origin);
  }
  const role = await env2.DB.prepare("SELECT id FROM role WHERE code = ? AND is_active = 1 LIMIT 1").bind(roleCode).first();
  if (!role) return json(400, { ok: false, error: { code: "ROLE_NOT_AVAILABLE" } }, requestId, origin);
  const temporaryPassword = createTemporaryPassword();
  let authUserId = "";
  try {
    authUserId = await createSupabaseAuthUser(env2, { email, password: temporaryPassword, fullName });
  } catch {
    return json(503, { ok: false, error: { code: "STAFF_AUTH_ADMIN_UNAVAILABLE" } }, requestId, origin);
  }
  const profileId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  const now = /* @__PURE__ */ new Date();
  const createdAt = now.toISOString();
  const passwordExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1e3).toISOString();
  const epochNow = now.getTime();
  try {
    const results = await env2.DB.batch([
      env2.DB.prepare(`INSERT INTO supabase_auth_identity
        (id, name, email, emailVerified, image, createdAt, updatedAt, auth_provider)
        VALUES (?, ?, ?, 1, NULL, ?, ?, 'supabase')`).bind(authUserId, fullName, email, epochNow, epochNow),
      env2.DB.prepare(`INSERT INTO staff_profile
        (id, auth_user_id, full_name, email, account_status, created_at, updated_at,
         must_change_password, password_setup_expires_at, password_changed_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, 1, ?, NULL)`).bind(profileId, authUserId, fullName, email, createdAt, createdAt, passwordExpiresAt),
      env2.DB.prepare(`INSERT INTO staff_role_assignment
        (id, staff_profile_id, role_id, branch_id, assigned_by, starts_at, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).bind(assignmentId, profileId, role.id, branchId, access.staff.profileId, createdAt, reason, createdAt),
      env2.DB.prepare(`INSERT INTO staff_access_audit
        (id, branch_id, actor_profile_id, target_profile_id, action, reason, metadata, created_at)
        VALUES (?, ?, ?, ?, 'account_created', ?, ?, ?)`).bind(
        crypto.randomUUID(),
        branchId,
        access.staff.profileId,
        profileId,
        reason,
        JSON.stringify({ role_code: roleCode, provisioning_method: "admin_direct" }),
        createdAt
      )
    ]);
    if (results.some((result) => !result.success) || results.some((result) => (result.meta?.changes ?? 0) !== 1)) {
      throw new Error("STAFF_ACCOUNT_PROVISIONING_BATCH_FAILED");
    }
  } catch {
    try {
      await deleteSupabaseAuthUser(env2, authUserId);
    } catch {
    }
    return json(409, { ok: false, error: { code: "STAFF_ACCOUNT_PROVISIONING_FAILED" } }, requestId, origin);
  }
  return json(201, {
    ok: true,
    account_created: true,
    staff_profile_id: profileId,
    email,
    role_code: roleCode,
    must_change_password: true,
    temporary_password: temporaryPassword,
    email_sent: false,
    manual_handoff_required: true,
    password_expires_in_hours: 24
  }, requestId, origin);
}
__name(createStaffAccount, "createStaffAccount");
async function listStaffDirectory(request, env2, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.directory.read");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const url = new URL(request.url);
  const requestedBranchId = url.searchParams.get("branch_id");
  if (requestedBranchId !== null && requestedBranchId !== access.activeBranch.branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
  }
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 25 : Number(rawLimit);
  const rawOffset = url.searchParams.get("offset");
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1e4 || [...url.searchParams.keys()].some((key) => !["branch_id", "limit", "offset", "search"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_STAFF_DIRECTORY_QUERY" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const rows = await env2.DB.prepare(`
    SELECT sp.id, sp.full_name, sp.account_status, sp.last_active_at,
           (
             SELECT json_group_array(json_object('code', r2.code, 'name', r2.name))
             FROM staff_role_assignment sra2
             JOIN role r2 ON r2.id = sra2.role_id AND r2.is_active = 1
             WHERE sra2.staff_profile_id = sp.id
               AND sra2.branch_id = ?
               AND sra2.revoked_at IS NULL
               AND sra2.starts_at <= ?
               AND (sra2.ends_at IS NULL OR sra2.ends_at > ?)
           ) AS roles_json
    FROM staff_profile sp
    WHERE EXISTS (
      SELECT 1 FROM staff_role_assignment sra
      JOIN role r ON r.id = sra.role_id AND r.is_active = 1
      WHERE sra.staff_profile_id = sp.id
        AND sra.branch_id = ?
        AND sra.revoked_at IS NULL
        AND sra.starts_at <= ?
        AND (sra.ends_at IS NULL OR sra.ends_at > ?)
    )
      AND (? = '' OR sp.full_name LIKE ?)
    ORDER BY sp.full_name COLLATE NOCASE
    LIMIT ? OFFSET ?
  `).bind(
    access.activeBranch.branchId,
    now,
    now,
    access.activeBranch.branchId,
    now,
    now,
    search,
    search ? `%${search}%` : "",
    limit,
    offset
  ).all();
  const staff = (rows.results ?? []).map((row) => {
    let roles = [];
    try {
      roles = JSON.parse(row.roles_json ?? "[]");
    } catch {
      roles = [];
    }
    return { id: row.id, full_name: row.full_name, account_status: row.account_status, roles };
  });
  return json(200, { ok: true, data: staff }, requestId, origin);
}
__name(listStaffDirectory, "listStaffDirectory");
async function changeStaffAccountStatus(request, env2, targetProfileId, action, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.account.manage");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  if (!targetProfileId || targetProfileId.length > 128 || targetProfileId === access.staff.profileId) {
    return json(400, { ok: false, error: { code: "INVALID_STAFF_TARGET" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "reason")) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_ACCOUNT_STATUS_REASON" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const target = await env2.DB.prepare(`
    SELECT sp.id, sp.account_status
    FROM staff_profile sp
    WHERE sp.id = ?
      AND EXISTS (
        SELECT 1 FROM staff_role_assignment target_assignment
        WHERE target_assignment.staff_profile_id = sp.id
          AND target_assignment.branch_id = ?
          AND target_assignment.revoked_at IS NULL
          AND target_assignment.starts_at <= ?
          AND (target_assignment.ends_at IS NULL OR target_assignment.ends_at > ?)
      )
    LIMIT 1
  `).bind(targetProfileId, access.activeBranch.branchId, now, now).first();
  if (!target) return json(404, { ok: false, error: { code: "STAFF_PROFILE_NOT_FOUND_IN_BRANCH" } }, requestId, origin);
  const nextStatus = action === "deactivate" ? "inactive" : action === "suspend" ? "suspended" : "active";
  const allowedCurrent = action === "reactivate" ? ["inactive", "suspended"] : ["active"];
  if (!allowedCurrent.includes(target.account_status)) {
    return json(409, { ok: false, error: { code: "STAFF_ACCOUNT_STATUS_CONFLICT" } }, requestId, origin);
  }
  try {
    const result = await env2.DB.prepare(`
      UPDATE staff_profile
      SET account_status = ?,
          deactivated_at = ?,
          account_status_changed_by = ?,
          account_status_changed_branch_id = ?,
          account_status_reason = ?,
          updated_at = ?
      WHERE id = ? AND account_status = ?
    `).bind(
      nextStatus,
      nextStatus === "inactive" ? now : null,
      access.staff.profileId,
      access.activeBranch.branchId,
      reason,
      now,
      target.id,
      target.account_status
    ).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "STAFF_ACCOUNT_STATUS_CHANGED" } }, requestId, origin);
    }
  } catch {
    return json(409, {
      ok: false,
      error: { code: "STAFF_ACCOUNT_STATUS_CHANGE_BLOCKED", message: "The change may violate branch access or last-Admin/Pastor safeguards." }
    }, requestId, origin);
  }
  return json(200, { ok: true, staff_profile_id: target.id, account_status: nextStatus }, requestId, origin);
}
__name(changeStaffAccountStatus, "changeStaffAccountStatus");
async function listAdminRevocationRequests(request, env2, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.role.approve");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const rows = await env2.DB.prepare(`
    SELECT req.id, req.assignment_id, req.target_profile_id,
           target.full_name AS target_name, req.requested_by,
           requester.full_name AS requester_name, req.reason, req.requested_at
    FROM staff_role_revocation_request req
    JOIN staff_profile target ON target.id = req.target_profile_id
    JOIN staff_profile requester ON requester.id = req.requested_by
    WHERE req.branch_id = ? AND req.status = 'pending'
    ORDER BY req.requested_at ASC LIMIT 100
  `).bind(access.activeBranch.branchId).all();
  return json(200, { ok: true, requests: rows.results ?? [] }, requestId, origin);
}
__name(listAdminRevocationRequests, "listAdminRevocationRequests");
async function createAdminRevocationRequest(request, env2, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.role.assign");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "assignment_id" && key !== "reason")) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const assignmentId = typeof payload.assignment_id === "string" ? payload.assignment_id.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!assignmentId || assignmentId.length > 128 || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_REVOCATION_REQUEST" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const assignment = await env2.DB.prepare(`
    SELECT a.id, a.staff_profile_id, a.role_id
    FROM staff_role_assignment a JOIN role r ON r.id = a.role_id
    WHERE a.id = ? AND a.branch_id = ? AND r.code = 'admin_pastor'
      AND a.revoked_at IS NULL AND a.starts_at <= ?
      AND (a.ends_at IS NULL OR a.ends_at > ?)
  `).bind(assignmentId, access.activeBranch.branchId, now, now).first();
  if (!assignment) return json(404, { ok: false, error: { code: "ACTIVE_ADMIN_ASSIGNMENT_NOT_FOUND" } }, requestId, origin);
  const requestIdForRevocation = crypto.randomUUID();
  try {
    const result = await env2.DB.prepare(`
      INSERT INTO staff_role_revocation_request
        (id, branch_id, assignment_id, target_profile_id, role_id, requested_by, reason, requested_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      requestIdForRevocation,
      access.activeBranch.branchId,
      assignment.id,
      assignment.staff_profile_id,
      assignment.role_id,
      access.staff.profileId,
      reason,
      now
    ).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) throw new Error("REVOCATION_REQUEST_NOT_CREATED");
  } catch {
    return json(409, { ok: false, error: { code: "REVOCATION_REQUEST_CONFLICT" } }, requestId, origin);
  }
  return json(201, {
    ok: true,
    revocation_request: {
      id: requestIdForRevocation,
      assignment_id: assignment.id,
      target_profile_id: assignment.staff_profile_id,
      branch_id: access.activeBranch.branchId,
      status: "pending",
      requested_at: now
    }
  }, requestId, origin);
}
__name(createAdminRevocationRequest, "createAdminRevocationRequest");
async function reviewAdminRevocationRequest(request, env2, revocationId, decision, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.role.approve");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "review_reason")) {
    return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
  }
  const reason = typeof payload.review_reason === "string" ? payload.review_reason.trim() : "";
  if (!revocationId || revocationId.length > 128 || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_REVOCATION_REVIEW" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  if (decision === "reject") {
    try {
      const result = await env2.DB.prepare(`
        UPDATE staff_role_revocation_request
        SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_reason = ?
        WHERE id = ? AND branch_id = ? AND status = 'pending'
      `).bind(access.staff.profileId, now, reason, revocationId, access.activeBranch.branchId).run();
      if (!result.success || (result.meta?.changes ?? 0) !== 1) {
        return json(409, { ok: false, error: { code: "REVOCATION_REQUEST_NOT_PENDING" } }, requestId, origin);
      }
    } catch {
      return json(409, { ok: false, error: { code: "REVOCATION_REVIEW_NOT_AUTHORIZED" } }, requestId, origin);
    }
    return json(200, { ok: true, revocation_request_id: revocationId, status: "rejected" }, requestId, origin);
  }
  try {
    const results = await env2.DB.batch([
      env2.DB.prepare(`
        UPDATE staff_role_revocation_request
        SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_reason = ?
        WHERE id = ? AND branch_id = ? AND status = 'pending'
      `).bind(access.staff.profileId, now, reason, revocationId, access.activeBranch.branchId),
      env2.DB.prepare(`
        UPDATE staff_role_assignment
        SET revoked_at = ?, revoked_by = ?, revocation_request_id = ?, reason = ?
        WHERE id = (
          SELECT assignment_id FROM staff_role_revocation_request
          WHERE id = ? AND branch_id = ? AND status = 'approved'
            AND reviewed_by = ? AND changes() = 1
        )
          AND branch_id = ? AND revoked_at IS NULL
      `).bind(
        now,
        access.staff.profileId,
        revocationId,
        reason,
        revocationId,
        access.activeBranch.branchId,
        access.staff.profileId,
        access.activeBranch.branchId
      ),
      env2.DB.prepare(`
        UPDATE staff_role_revocation_request SET status = 'applied'
        WHERE id = ? AND branch_id = ? AND status = 'approved'
          AND reviewed_by = ? AND changes() = 1
      `).bind(revocationId, access.activeBranch.branchId, access.staff.profileId)
    ]);
    if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1 || (results[2]?.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "REVOCATION_REQUEST_NOT_APPLIED", message: "The request may be stale or the last-Admin/Pastor safeguard blocked removal." } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "REVOCATION_REVIEW_NOT_AUTHORIZED" } }, requestId, origin);
  }
  return json(200, { ok: true, revocation_request_id: revocationId, status: "applied" }, requestId, origin);
}
__name(reviewAdminRevocationRequest, "reviewAdminRevocationRequest");
function bestScope(scopes) {
  if (scopes.includes("branch")) return "branch";
  if (scopes.includes("team")) return "team";
  if (scopes.includes("assigned")) return "assigned";
  return null;
}
__name(bestScope, "bestScope");
function contactScopePredicate(mode, alias, staffUserId, branchId, now) {
  if (mode === "branch") return { sql: "1 = 1", values: [] };
  if (mode === "team") return {
    sql: `EXISTS (
      SELECT 1
      FROM contact_assignment ca
      JOIN staff_team_membership tm
        ON tm.team_id = ca.team_id AND tm.branch_id = ca.branch_id
      WHERE ca.contact_id = ${alias}.id
        AND ca.branch_id = ${alias}.branch_id
        AND tm.staff_profile_id = ?
        AND tm.membership_role = 'leader'
        AND tm.revoked_at IS NULL
        AND tm.starts_at <= ?
        AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        AND ca.starts_at <= ?
        AND (ca.ends_at IS NULL OR ca.ends_at > ?)
    )`,
    values: [staffUserId, now, now, now, now]
  };
  if (mode === "assigned") return {
    sql: `EXISTS (
      SELECT 1 FROM contact_assignment ca
      WHERE ca.contact_id = ${alias}.id
        AND ca.branch_id = ${alias}.branch_id
        AND ca.assignee_user_id = ?
        AND ca.starts_at <= ?
        AND (ca.ends_at IS NULL OR ca.ends_at > ?)
    )`,
    values: [staffUserId, now, now]
  };
  return { sql: "0 = 1", values: [] };
}
__name(contactScopePredicate, "contactScopePredicate");
async function contactResourceContext(request, env2, contactId) {
  const context2 = await resolveStaffContext(request, env2);
  if (context2.state !== "authenticated") {
    return { ok: false, response: mapCapabilityFailure(context2.state, crypto.randomUUID(), request.headers.get("Origin") ?? void 0) };
  }
  if (!context2.activeBranch) {
    return { ok: false, response: mapCapabilityFailure("branch_required", crypto.randomUUID(), request.headers.get("Origin") ?? void 0) };
  }
  const contact = await env2.DB.prepare(`
    SELECT id FROM contact
    WHERE id = ? AND branch_id = ? AND contact_status <> 'merged'
    LIMIT 1
  `).bind(contactId, context2.activeBranch.branchId).first();
  if (!contact) {
    return { ok: false, response: json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND" } }, crypto.randomUUID(), request.headers.get("Origin") ?? void 0) };
  }
  const team = await env2.DB.prepare(`
    SELECT ca.team_id
    FROM contact_assignment ca
    JOIN staff_team_membership tm
      ON tm.team_id = ca.team_id AND tm.branch_id = ca.branch_id
    WHERE ca.contact_id = ? AND ca.branch_id = ?
      AND tm.staff_profile_id = ? AND tm.membership_role = 'leader'
      AND tm.revoked_at IS NULL
      AND tm.starts_at <= ?
      AND (tm.ends_at IS NULL OR tm.ends_at > ?)
      AND ca.starts_at <= ?
      AND (ca.ends_at IS NULL OR ca.ends_at > ?)
    LIMIT 1
  `).bind(
    contactId,
    context2.activeBranch.branchId,
    context2.staff.profileId,
    (/* @__PURE__ */ new Date()).toISOString(),
    (/* @__PURE__ */ new Date()).toISOString(),
    (/* @__PURE__ */ new Date()).toISOString(),
    (/* @__PURE__ */ new Date()).toISOString()
  ).first();
  return { ok: true, context: context2, teamId: team?.team_id };
}
__name(contactResourceContext, "contactResourceContext");
async function listContacts(request, env2, requestId, origin) {
  const context2 = await resolveStaffContext(request, env2);
  if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
  if (!context2.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const grants = context2.activeBranch.capabilities;
  const readScope = bestScope(grants.filter((g) => g.code === "contacts.read").map((g) => g.scopeMode));
  if (!readScope) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  const detailScope = bestScope(grants.filter((g) => g.code === "contacts.contact_details.read").map((g) => g.scopeMode));
  const privateScope = bestScope(grants.filter((g) => g.code === "contacts.private_fields.read").map((g) => g.scopeMode));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const readPredicate = contactScopePredicate(readScope, "c", context2.staff.userId, context2.activeBranch.branchId, now);
  const detailPredicate = contactScopePredicate(detailScope, "c", context2.staff.userId, context2.activeBranch.branchId, now);
  const privatePredicate = contactScopePredicate(privateScope, "c", context2.staff.userId, context2.activeBranch.branchId, now);
  const url = new URL(request.url);
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
  const status = url.searchParams.get("status") ?? "active";
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  const rawOffset = url.searchParams.get("offset");
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  const requestedBranchId = url.searchParams.get("branch_id");
  if (requestedBranchId !== null && requestedBranchId !== context2.activeBranch.branchId || !["active", "archived", "all"].includes(status) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1e4 || [...url.searchParams.keys()].some((key) => !["branch_id", "search", "status", "limit", "offset"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_QUERY" } }, requestId, origin);
  }
  const statusPredicate = status === "all" ? "1 = 1" : "c.contact_status = ?";
  const rows = await env2.DB.prepare(`
    SELECT c.id, c.branch_id, c.first_name, c.last_name, c.preferred_name,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_e164 ELSE NULL END AS phone_e164,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_display ELSE NULL END AS phone_display,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.email_normalized ELSE NULL END AS email_normalized,
           CASE WHEN ? = 1 AND (${privatePredicate.sql}) THEN c.age_range ELSE NULL END AS age_range,
           CASE WHEN ? = 1 AND (${privatePredicate.sql}) THEN c.preferred_language ELSE NULL END AS preferred_language,
           c.contact_status, c.created_at, c.updated_at
    FROM contact c
    WHERE c.branch_id = ?
      AND ${statusPredicate}
      AND (? = '%%' OR c.first_name LIKE ? OR COALESCE(c.last_name, '') LIKE ?)
      AND (${readPredicate.sql})
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ? OFFSET ?
  `).bind(
    detailScope ? 1 : 0,
    ...detailPredicate.values,
    detailScope ? 1 : 0,
    ...detailPredicate.values,
    detailScope ? 1 : 0,
    ...detailPredicate.values,
    privateScope ? 1 : 0,
    ...privatePredicate.values,
    privateScope ? 1 : 0,
    ...privatePredicate.values,
    context2.activeBranch.branchId,
    ...status === "all" ? [] : [status],
    search ? `%${search}%` : "%%",
    search ? `%${search}%` : "%%",
    search ? `%${search}%` : "%%",
    ...readPredicate.values,
    limit,
    offset
  ).all();
  return json(200, { ok: true, data: rows.results ?? [] }, requestId, origin);
}
__name(listContacts, "listContacts");
async function createContact(request, env2, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "contacts.create");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return json(400, { ok: false, error: { code: "IDEMPOTENCY_KEY_REQUIRED" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  const allowed = /* @__PURE__ */ new Set(["first_name", "last_name", "preferred_name", "phone_e164", "email", "age_range", "preferred_language", "service_area_id", "source_metadata"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_BODY" } }, requestId, origin);
  }
  const firstName = typeof payload.first_name === "string" ? payload.first_name.trim() : "";
  const lastName = typeof payload.last_name === "string" ? payload.last_name.trim() || null : null;
  const preferredName = typeof payload.preferred_name === "string" ? payload.preferred_name.trim() || null : null;
  const phone = typeof payload.phone_e164 === "string" ? payload.phone_e164.trim() || null : null;
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() || null : null;
  const ageRange = typeof payload.age_range === "string" ? payload.age_range.trim() || null : null;
  const preferredLanguage = typeof payload.preferred_language === "string" ? payload.preferred_language.trim() || null : null;
  const serviceAreaId = typeof payload.service_area_id === "string" ? payload.service_area_id.trim() || null : null;
  const metadata = payload.source_metadata === void 0 ? {} : payload.source_metadata;
  const metadataAllowed = /* @__PURE__ */ new Set(["app_version", "form_version", "device_type", "locale"]);
  if (firstName.length < 1 || firstName.length > 120 || lastName !== null && lastName.length > 120 || preferredName !== null && preferredName.length > 120 || phone !== null && !/^\+[1-9]\d{7,14}$/.test(phone) || email !== null && (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) || ageRange !== null && ageRange.length > 50 || preferredLanguage !== null && preferredLanguage.length > 60 || serviceAreaId !== null && serviceAreaId.length > 128 || !metadata || typeof metadata !== "object" || Array.isArray(metadata) || Object.keys(metadata).length > 4 || Object.keys(metadata).some((key) => !metadataAllowed.has(key)) || Object.values(metadata).some((value) => typeof value !== "string" || value.length > 80)) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_DETAILS" } }, requestId, origin);
  }
  if (ageRange !== null || preferredLanguage !== null) {
    const privateWrite = await authorizeRequestCapability(request, env2, "contacts.private_fields.update");
    if (privateWrite.state !== "authorized") {
      return json(403, { ok: false, error: { code: "PRIVATE_CONTACT_FIELDS_FORBIDDEN" } }, requestId, origin);
    }
  }
  if (serviceAreaId) {
    const area = await env2.DB.prepare(
      "SELECT id FROM service_area WHERE id = ? AND branch_id = ? AND is_active = 1 LIMIT 1"
    ).bind(serviceAreaId, access.activeBranch.branchId).first();
    if (!area) return json(400, { ok: false, error: { code: "SERVICE_AREA_NOT_AVAILABLE" } }, requestId, origin);
  }
  const digestPayload = {
    first_name: firstName,
    last_name: lastName,
    preferred_name: preferredName,
    phone_e164: phone,
    email,
    age_range: ageRange,
    preferred_language: preferredLanguage,
    service_area_id: serviceAreaId,
    source_metadata: metadata
  };
  const digestHex = await sha256Hex(JSON.stringify(digestPayload));
  const respondWithContact = /* @__PURE__ */ __name(async (id, status, idempotentReplay) => {
    const contact = await env2.DB.prepare(`
      SELECT id, branch_id, first_name, last_name, preferred_name,
             contact_status, created_at, updated_at
      FROM contact
      WHERE id = ? AND branch_id = ?
      LIMIT 1
    `).bind(id, access.activeBranch.branchId).first();
    if (!contact) {
      return json(500, { ok: false, error: { code: "CONTACT_CAPTURE_READBACK_FAILED" } }, requestId, origin);
    }
    return json(status, {
      ok: true,
      data: {
        ...contact,
        phone_e164: null,
        phone_display: null,
        email_normalized: null,
        age_range: null,
        preferred_language: null,
        identity_redacted: true
      },
      idempotent_replay: idempotentReplay
    }, requestId, origin);
  }, "respondWithContact");
  const existing = await env2.DB.prepare(`
    SELECT contact_id, hex(request_digest) AS digest_hex
    FROM contact_capture
    WHERE branch_id = ? AND client_request_id = ?
    LIMIT 1
  `).bind(access.activeBranch.branchId, idempotencyKey).first();
  if (existing) {
    if (existing.digest_hex.toLowerCase() !== digestHex) {
      return json(409, { ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD" } }, requestId, origin);
    }
    return respondWithContact(existing.contact_id, 200, true);
  }
  const contactId = crypto.randomUUID();
  const captureId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const digestBytes = new Uint8Array(digestHex.match(/.{2}/g).map((pair) => parseInt(pair, 16)));
  try {
    const results = await env2.DB.batch([
      env2.DB.prepare(`
        INSERT INTO contact
          (id, branch_id, first_name, last_name, preferred_name, phone_e164,
           email_normalized, age_range, preferred_language, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        contactId,
        access.activeBranch.branchId,
        firstName,
        lastName,
        preferredName,
        phone,
        email,
        ageRange,
        preferredLanguage,
        access.staff.userId,
        now,
        now
      ),
      env2.DB.prepare(`
        INSERT INTO contact_capture
          (id, contact_id, branch_id, captured_by, capture_source, service_area_id,
           client_request_id, digest_key_version, request_digest, captured_at, source_metadata, created_at)
        VALUES (?, ?, ?, ?, 'staff_manual', ?, ?, 1, ?, ?, ?, ?)
      `).bind(
        captureId,
        contactId,
        access.activeBranch.branchId,
        access.staff.userId,
        serviceAreaId,
        idempotencyKey,
        digestBytes,
        now,
        JSON.stringify(metadata),
        now
      ),
      env2.DB.prepare(`
        INSERT INTO contact_assignment
          (id, contact_id, branch_id, assignee_user_id, assigned_by, starts_at, reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Auto-assigned to the capturing staff member', ?)
      `).bind(
        assignmentId,
        contactId,
        access.activeBranch.branchId,
        access.staff.userId,
        access.staff.userId,
        now,
        now
      )
    ]);
    if (results.some((result) => !result.success) || results.some((result) => (result.meta?.changes ?? 0) !== 1)) {
      throw new Error("CONTACT_CAPTURE_BATCH_FAILED");
    }
  } catch {
    const raced = await env2.DB.prepare(`
      SELECT contact_id, hex(request_digest) AS digest_hex
      FROM contact_capture WHERE branch_id = ? AND client_request_id = ? LIMIT 1
    `).bind(access.activeBranch.branchId, idempotencyKey).first();
    if (raced && raced.digest_hex.toLowerCase() === digestHex) {
      return respondWithContact(raced.contact_id, 200, true);
    }
    return json(409, { ok: false, error: { code: "CONTACT_CAPTURE_CONFLICT" } }, requestId, origin);
  }
  return respondWithContact(contactId, 201, false);
}
__name(createContact, "createContact");
async function getContact(request, env2, contactId, requestId, origin) {
  const resource = await contactResourceContext(request, env2, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env2, "contacts.read", {
    type: "contact",
    recordId: contactId,
    teamId: resource.teamId
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const scope = access.decision.scopeMode;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const predicate = contactScopePredicate(scope, "c", access.staff.userId, access.activeBranch.branchId, now);
  const details = await authorizeRequestCapability(request, env2, "contacts.contact_details.read", {
    type: "contact",
    recordId: contactId,
    teamId: resource.teamId
  });
  const includeDetails = details.state === "authorized";
  const privateFields = await authorizeRequestCapability(request, env2, "contacts.private_fields.read", {
    type: "contact",
    recordId: contactId,
    teamId: resource.teamId
  });
  const includePrivate = privateFields.state === "authorized";
  const privatePredicate = contactScopePredicate(
    includePrivate ? privateFields.decision.scopeMode : null,
    "c",
    access.staff.userId,
    access.activeBranch.branchId,
    now
  );
  const detailPredicate = contactScopePredicate(
    includeDetails ? details.decision.scopeMode : null,
    "c",
    access.staff.userId,
    access.activeBranch.branchId,
    now
  );
  const row = await env2.DB.prepare(`
    SELECT c.id, c.branch_id, c.first_name, c.last_name, c.preferred_name,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_e164 ELSE NULL END AS phone_e164,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.email_normalized ELSE NULL END AS email_normalized,
           CASE WHEN ? = 1 AND (${privatePredicate.sql}) THEN c.age_range ELSE NULL END AS age_range,
           CASE WHEN ? = 1 AND (${privatePredicate.sql}) THEN c.preferred_language ELSE NULL END AS preferred_language,
           c.contact_status, c.created_at, c.updated_at
    FROM contact c
    WHERE c.id = ? AND c.branch_id = ? AND (${predicate.sql})
    LIMIT 1
  `).bind(
    includeDetails ? 1 : 0,
    ...detailPredicate.values,
    includeDetails ? 1 : 0,
    ...detailPredicate.values,
    includePrivate ? 1 : 0,
    ...privatePredicate.values,
    includePrivate ? 1 : 0,
    ...privatePredicate.values,
    contactId,
    access.activeBranch.branchId,
    ...predicate.values
  ).first();
  if (!row) return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND" } }, requestId, origin);
  return json(200, {
    ok: true,
    data: { ...row, identity_redacted: !includeDetails }
  }, requestId, origin);
}
__name(getContact, "getContact");
async function updateContact(request, env2, contactId, requestId, origin) {
  const resource = await contactResourceContext(request, env2, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env2, "contacts.update", {
    type: "contact",
    recordId: contactId,
    teamId: resource.teamId
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  const allowed = /* @__PURE__ */ new Set(["first_name", "last_name", "preferred_name", "phone_e164", "email", "age_range", "preferred_language", "contact_status"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length === 0 || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_UPDATE" } }, requestId, origin);
  }
  const values = {};
  const hasPrivateFields = Object.hasOwn(payload, "age_range") || Object.hasOwn(payload, "preferred_language");
  const hasContactDetails = Object.hasOwn(payload, "phone_e164") || Object.hasOwn(payload, "email");
  let privateFieldAccess = null;
  let detailFieldAccess = null;
  if (hasPrivateFields) {
    privateFieldAccess = await authorizeRequestCapability(request, env2, "contacts.private_fields.update", {
      type: "contact",
      recordId: contactId,
      teamId: resource.teamId
    });
    if (privateFieldAccess.state !== "authorized") {
      return json(403, { ok: false, error: { code: "PRIVATE_CONTACT_FIELDS_FORBIDDEN" } }, requestId, origin);
    }
  }
  if (hasContactDetails) {
    detailFieldAccess = await authorizeRequestCapability(request, env2, "contacts.contact_details.read", {
      type: "contact",
      recordId: contactId,
      teamId: resource.teamId
    });
    if (detailFieldAccess.state !== "authorized") {
      return json(403, { ok: false, error: { code: "CONTACT_DETAILS_FORBIDDEN" } }, requestId, origin);
    }
  }
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null && typeof value !== "string") {
      return json(400, { ok: false, error: { code: "INVALID_CONTACT_UPDATE_VALUE" } }, requestId, origin);
    }
    const normalized = typeof value === "string" ? value.trim() : null;
    if (key === "first_name" && (!normalized || normalized.length > 120)) {
      return json(400, { ok: false, error: { code: "INVALID_FIRST_NAME" } }, requestId, origin);
    }
    if (key === "last_name" && normalized !== null && normalized.length > 120) {
      return json(400, { ok: false, error: { code: "INVALID_LAST_NAME" } }, requestId, origin);
    }
    if (key === "preferred_name" && normalized !== null && normalized.length > 120) {
      return json(400, { ok: false, error: { code: "INVALID_PREFERRED_NAME" } }, requestId, origin);
    }
    if (key === "phone_e164" && normalized !== null && !/^\+[1-9]\d{7,14}$/.test(normalized)) {
      return json(400, { ok: false, error: { code: "INVALID_PHONE" } }, requestId, origin);
    }
    if (key === "email" && normalized !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
      return json(400, { ok: false, error: { code: "INVALID_EMAIL" } }, requestId, origin);
    }
    if (key === "age_range" && normalized !== null && normalized.length > 50) {
      return json(400, { ok: false, error: { code: "INVALID_AGE_RANGE" } }, requestId, origin);
    }
    if (key === "preferred_language" && normalized !== null && normalized.length > 60) {
      return json(400, { ok: false, error: { code: "INVALID_LANGUAGE" } }, requestId, origin);
    }
    if (key === "contact_status" && normalized !== "active" && normalized !== "archived") {
      return json(400, { ok: false, error: { code: "INVALID_CONTACT_STATUS" } }, requestId, origin);
    }
    const column = key === "email" ? "email_normalized" : key;
    values[column] = key === "email" && normalized !== null ? normalized.toLowerCase() : normalized;
  }
  const assignments = Object.keys(values).map((key) => `${key} = ?`);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  assignments.push("updated_at = ?");
  const predicate = contactScopePredicate(access.decision.scopeMode, "contact", access.staff.userId, access.activeBranch.branchId, now);
  const additionalPredicates = [];
  const additionalValues = [];
  if (privateFieldAccess?.state === "authorized") {
    const privatePredicate = contactScopePredicate(
      privateFieldAccess.decision.scopeMode,
      "contact",
      access.staff.userId,
      access.activeBranch.branchId,
      now
    );
    additionalPredicates.push(privatePredicate.sql);
    additionalValues.push(...privatePredicate.values);
  }
  if (detailFieldAccess?.state === "authorized") {
    const detailPredicate = contactScopePredicate(
      detailFieldAccess.decision.scopeMode,
      "contact",
      access.staff.userId,
      access.activeBranch.branchId,
      now
    );
    additionalPredicates.push(detailPredicate.sql);
    additionalValues.push(...detailPredicate.values);
  }
  const result = await env2.DB.prepare(`
    UPDATE contact SET ${assignments.join(", ")}
    WHERE id = ? AND branch_id = ? AND contact_status <> 'merged'
      AND (${predicate.sql})
      ${additionalPredicates.map((sql) => `AND (${sql})`).join(" ")}
  `).bind(
    ...Object.values(values),
    now,
    contactId,
    access.activeBranch.branchId,
    ...predicate.values,
    ...additionalValues
  ).run();
  if (!result.success || (result.meta?.changes ?? 0) !== 1) {
    return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND_OR_NOT_ACCESSIBLE" } }, requestId, origin);
  }
  return getContact(request, env2, contactId, requestId, origin);
}
__name(updateContact, "updateContact");
async function assignContact(request, env2, contactId, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "contacts.assign");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => !["assignee_profile_id", "team_id", "reason"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT_BODY" } }, requestId, origin);
  }
  const assigneeProfileId = typeof payload.assignee_profile_id === "string" ? payload.assignee_profile_id.trim() : "";
  const teamId = typeof payload.team_id === "string" ? payload.team_id.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!!assigneeProfileId === !!teamId || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT_TARGET" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const contact = await env2.DB.prepare(
    "SELECT id FROM contact WHERE id = ? AND branch_id = ? AND contact_status = 'active' LIMIT 1"
  ).bind(contactId, access.activeBranch.branchId).first();
  if (!contact) return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND" } }, requestId, origin);
  let assigneeUserId = null;
  let selectedTeamId = null;
  if (assigneeProfileId) {
    const target = await env2.DB.prepare(`
      SELECT sp.auth_user_id
      FROM staff_profile sp
      WHERE sp.id = ? AND sp.account_status = 'active'
        AND EXISTS (
          SELECT 1 FROM staff_role_assignment ra
          JOIN role r ON r.id = ra.role_id AND r.is_active = 1
          WHERE ra.staff_profile_id = sp.id
            AND ra.branch_id = ?
            AND ra.revoked_at IS NULL
            AND ra.starts_at <= ?
            AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        )
      LIMIT 1
    `).bind(assigneeProfileId, access.activeBranch.branchId, now, now).first();
    if (!target) return json(400, { ok: false, error: { code: "ASSIGNEE_NOT_ACTIVE_IN_BRANCH" } }, requestId, origin);
    assigneeUserId = target.auth_user_id;
  } else {
    const targetTeam = await env2.DB.prepare(
      "SELECT id FROM team WHERE id = ? AND branch_id = ? AND is_active = 1 LIMIT 1"
    ).bind(teamId, access.activeBranch.branchId).first();
    if (!targetTeam) return json(400, { ok: false, error: { code: "TEAM_NOT_ACTIVE_IN_BRANCH" } }, requestId, origin);
    selectedTeamId = targetTeam.id;
  }
  const future = await env2.DB.prepare(`
    SELECT id FROM contact_assignment
    WHERE contact_id = ? AND branch_id = ?
      AND starts_at > ?
      AND (ends_at IS NULL OR ends_at > ?)
    LIMIT 1
  `).bind(contactId, access.activeBranch.branchId, now, now).first();
  if (future) {
    return json(409, { ok: false, error: { code: "FUTURE_ASSIGNMENT_EXISTS" } }, requestId, origin);
  }
  const transitionAt = new Date(Date.now() + 1e3).toISOString();
  const assignmentId = crypto.randomUUID();
  try {
    const results = await env2.DB.batch([
      env2.DB.prepare(`
        UPDATE contact_assignment
        SET ends_at = ?, ended_by = ?, reason = ?
        WHERE contact_id = ? AND branch_id = ?
          AND starts_at <= ?
          AND (ends_at IS NULL OR ends_at > ?)
      `).bind(
        transitionAt,
        access.staff.userId,
        reason,
        contactId,
        access.activeBranch.branchId,
        now,
        transitionAt
      ),
      env2.DB.prepare(`
        INSERT INTO contact_assignment
          (id, contact_id, branch_id, assignee_user_id, team_id, assigned_by, starts_at, reason, created_at)
        SELECT ?, c.id, c.branch_id, ?, ?, ?, ?, ?, ?
        FROM contact c
        WHERE c.id = ? AND c.branch_id = ? AND c.contact_status = 'active'
      `).bind(
        assignmentId,
        assigneeUserId,
        selectedTeamId,
        access.staff.userId,
        transitionAt,
        reason,
        transitionAt,
        contactId,
        access.activeBranch.branchId
      )
    ]);
    if (results.some((result) => !result.success) || (results[1]?.meta?.changes ?? 0) !== 1) {
      throw new Error("CONTACT_ASSIGNMENT_BATCH_FAILED");
    }
  } catch {
    return json(409, { ok: false, error: { code: "CONTACT_ASSIGNMENT_CONFLICT" } }, requestId, origin);
  }
  return json(201, {
    ok: true,
    assignment_id: assignmentId,
    assignee_profile_id: assigneeProfileId || null,
    team_id: selectedTeamId,
    starts_at: transitionAt
  }, requestId, origin);
}
__name(assignContact, "assignContact");
async function listContactInteractions(request, env2, contactId, requestId, origin) {
  const resource = await contactResourceContext(request, env2, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env2, "contacts.read", {
    type: "contact",
    recordId: contactId,
    teamId: resource.teamId
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const predicate = contactScopePredicate(
    access.decision.scopeMode,
    "c",
    access.staff.userId,
    access.activeBranch.branchId,
    now
  );
  const rows = await env2.DB.prepare(`
    SELECT i.id, i.interaction_type, i.occurred_at, i.outcome_code,
           i.summary, i.next_action_at, i.created_at
    FROM contact_interaction i
    JOIN contact c ON c.id = i.contact_id AND c.branch_id = i.branch_id
    WHERE i.contact_id = ? AND i.branch_id = ?
      AND c.contact_status <> 'merged'
      AND (${predicate.sql})
    ORDER BY i.occurred_at DESC, i.id DESC
    LIMIT 100
  `).bind(
    contactId,
    access.activeBranch.branchId,
    ...predicate.values
  ).all();
  return json(200, { ok: true, data: rows.results ?? [] }, requestId, origin);
}
__name(listContactInteractions, "listContactInteractions");
async function createContactInteraction(request, env2, contactId, requestId, origin) {
  const resource = await contactResourceContext(request, env2, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env2, "contacts.interaction.create", {
    type: "contact",
    recordId: contactId,
    teamId: resource.teamId
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  const allowed = /* @__PURE__ */ new Set(["interaction_type", "occurred_at", "outcome_code", "summary", "next_action_at"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_INTERACTION_BODY" } }, requestId, origin);
  }
  const type = typeof payload.interaction_type === "string" ? payload.interaction_type : "";
  const occurredAt = payload.occurred_at === void 0 ? (/* @__PURE__ */ new Date()).toISOString() : parseIsoTimestamp(payload.occurred_at, "");
  const outcome = typeof payload.outcome_code === "string" ? payload.outcome_code.trim() || null : null;
  const summary = typeof payload.summary === "string" ? payload.summary.trim() || null : null;
  const nextActionAt = payload.next_action_at === void 0 || payload.next_action_at === null || payload.next_action_at === "" ? null : parseIsoTimestamp(payload.next_action_at, "");
  if (!["call", "visit", "message", "meeting", "other"].includes(type) || !occurredAt || payload.outcome_code !== void 0 && payload.outcome_code !== null && typeof payload.outcome_code !== "string" || outcome !== null && !/^[a-z][a-z0-9_]{1,59}$/.test(outcome) || payload.summary !== void 0 && payload.summary !== null && typeof payload.summary !== "string" || summary !== null && summary.length > 1e3 || payload.next_action_at !== void 0 && payload.next_action_at !== null && payload.next_action_at !== "" && !nextActionAt) {
    return json(400, { ok: false, error: { code: "INVALID_INTERACTION_DETAILS" } }, requestId, origin);
  }
  const interactionId = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const predicate = contactScopePredicate(access.decision.scopeMode, "c", access.staff.userId, access.activeBranch.branchId, now);
  const result = await env2.DB.prepare(`
    INSERT INTO contact_interaction
      (id, contact_id, branch_id, actor_user_id, interaction_type, occurred_at,
       outcome_code, summary, next_action_at, created_at)
    SELECT ?, c.id, c.branch_id, ?, ?, ?, ?, ?, ?, ?
    FROM contact c
    WHERE c.id = ? AND c.branch_id = ? AND c.contact_status <> 'merged'
      AND (${predicate.sql})
  `).bind(
    interactionId,
    access.staff.userId,
    type,
    occurredAt,
    outcome,
    summary,
    nextActionAt,
    now,
    contactId,
    access.activeBranch.branchId,
    ...predicate.values
  ).run();
  if (!result.success || (result.meta?.changes ?? 0) !== 1) {
    return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND_OR_NOT_ACCESSIBLE" } }, requestId, origin);
  }
  const created = await env2.DB.prepare(`
    SELECT id, interaction_type, occurred_at, outcome_code, summary, next_action_at, created_at
    FROM contact_interaction
    WHERE id = ? AND contact_id = ? AND branch_id = ?
    LIMIT 1
  `).bind(interactionId, contactId, access.activeBranch.branchId).first();
  if (!created) return json(500, { ok: false, error: { code: "CONTACT_INTERACTION_READBACK_FAILED" } }, requestId, origin);
  return json(201, { ok: true, data: created }, requestId, origin);
}
__name(createContactInteraction, "createContactInteraction");
async function listContactNotes(request, env2, contactId, requestId, origin) {
  const resource = await contactResourceContext(request, env2, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env2, "contacts.read", {
    type: "contact",
    recordId: contactId,
    teamId: resource.teamId
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const scope = access.decision.scopeMode;
  const rows = await env2.DB.prepare(`
    SELECT n.id, n.author_user_id, author.full_name AS author_name,
           n.body, n.visibility, n.team_id, n.created_at, n.updated_at
    FROM contact_note n
    JOIN contact c ON c.id = n.contact_id AND c.branch_id = n.branch_id
    JOIN staff_profile author ON author.auth_user_id = n.author_user_id
    WHERE n.contact_id = ? AND n.branch_id = ? AND (${contactScopePredicate(
    access.decision.scopeMode,
    "c",
    access.staff.userId,
    access.activeBranch.branchId,
    now
  ).sql})
      AND (
        (n.visibility = 'author_only' AND n.author_user_id = ?)
        OR (n.visibility = 'branch_scope' AND ? = 'branch')
        OR (n.visibility = 'assigned_scope' AND EXISTS (
          SELECT 1 FROM contact_assignment ca
          WHERE ca.contact_id = n.contact_id AND ca.branch_id = n.branch_id
            AND ca.assignee_user_id = ? AND ca.starts_at <= ?
            AND (ca.ends_at IS NULL OR ca.ends_at > ?)
        ))
        OR (n.visibility = 'team_scope' AND EXISTS (
          SELECT 1 FROM staff_team_membership tm
          WHERE tm.team_id = n.team_id AND tm.branch_id = n.branch_id
            AND tm.staff_profile_id = ? AND tm.revoked_at IS NULL
            AND tm.starts_at <= ? AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        ))
      )
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT 100
  `).bind(
    contactId,
    access.activeBranch.branchId,
    ...contactScopePredicate(
      access.decision.scopeMode,
      "c",
      access.staff.userId,
      access.activeBranch.branchId,
      now
    ).values,
    access.staff.userId,
    scope,
    access.staff.userId,
    now,
    now,
    access.staff.profileId,
    now,
    now
  ).all();
  const notes = (rows.results ?? []).map(({ id, body, created_at, updated_at }) => ({ id, body, created_at, updated_at }));
  return json(200, { ok: true, data: notes }, requestId, origin);
}
__name(listContactNotes, "listContactNotes");
async function createContactNote(request, env2, contactId, requestId, origin) {
  const resource = await contactResourceContext(request, env2, contactId);
  if (!resource.ok) return resource.response;
  const access = await authorizeRequestCapability(request, env2, "contacts.note.create", {
    type: "contact",
    recordId: contactId,
    teamId: resource.teamId
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "body" && key !== "visibility")) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_NOTE_BODY" } }, requestId, origin);
  }
  const noteBody = typeof payload.body === "string" ? payload.body.trim() : "";
  const visibility = payload.visibility === void 0 ? access.decision.scopeMode === "branch" ? "branch_scope" : access.decision.scopeMode === "team" ? "team_scope" : "assigned_scope" : payload.visibility;
  if (!noteBody || noteBody.length > 4e3 || !["author_only", "assigned_scope", "team_scope", "branch_scope"].includes(String(visibility))) {
    return json(400, { ok: false, error: { code: "INVALID_CONTACT_NOTE_DETAILS" } }, requestId, origin);
  }
  const scope = access.decision.scopeMode ?? "";
  if (visibility === "branch_scope" && scope !== "branch" || visibility === "team_scope" && (scope !== "team" || !resource.teamId) || visibility === "assigned_scope" && scope !== "assigned" || visibility === "author_only" && !["branch", "team", "assigned"].includes(scope)) {
    return json(403, { ok: false, error: { code: "NOTE_VISIBILITY_EXCEEDS_ACCESS_SCOPE" } }, requestId, origin);
  }
  const noteId = crypto.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const predicate = contactScopePredicate(scope, "c", access.staff.userId, access.activeBranch.branchId, now);
  const result = await env2.DB.prepare(`
    INSERT INTO contact_note
      (id, contact_id, branch_id, author_user_id, body, visibility, team_id, created_at, updated_at)
    SELECT ?, c.id, c.branch_id, ?, ?, ?, ?, ?, ?
    FROM contact c
    WHERE c.id = ? AND c.branch_id = ? AND c.contact_status <> 'merged'
      AND (${predicate.sql})
  `).bind(
    noteId,
    access.staff.userId,
    noteBody,
    visibility,
    visibility === "team_scope" ? resource.teamId : null,
    now,
    now,
    contactId,
    access.activeBranch.branchId,
    ...predicate.values
  ).run();
  if (!result.success || (result.meta?.changes ?? 0) !== 1) {
    return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND" } }, requestId, origin);
  }
  return json(201, { ok: true, data: { id: noteId, body: noteBody, created_at: now, updated_at: now } }, requestId, origin);
}
__name(createContactNote, "createContactNote");
function followupScopePredicate(mode, alias, staffProfileId, staffUserId, now) {
  if (mode === "branch") return { sql: "1 = 1", values: [] };
  if (mode === "assigned") return {
    sql: `${alias}.assignee_user_id = ?`,
    values: [staffUserId]
  };
  if (mode === "team") return {
    sql: `EXISTS (
      SELECT 1
      FROM staff_team_membership leader
      WHERE leader.staff_profile_id = ?
        AND leader.branch_id = ${alias}.branch_id
        AND leader.membership_role = 'leader'
        AND leader.revoked_at IS NULL
        AND leader.starts_at <= ?
        AND (leader.ends_at IS NULL OR leader.ends_at > ?)
        AND (
          leader.team_id = ${alias}.team_id
          OR EXISTS (
            SELECT 1
            FROM staff_profile assigned_staff
            JOIN staff_team_membership member
              ON member.staff_profile_id = assigned_staff.id
            WHERE assigned_staff.auth_user_id = ${alias}.assignee_user_id
              AND assigned_staff.account_status = 'active'
              AND member.team_id = leader.team_id
              AND member.branch_id = ${alias}.branch_id
              AND member.revoked_at IS NULL
              AND member.starts_at <= ?
              AND (member.ends_at IS NULL OR member.ends_at > ?)
          )
        )
    )`,
    values: [staffProfileId, now, now, now, now]
  };
  return { sql: "0 = 1", values: [] };
}
__name(followupScopePredicate, "followupScopePredicate");
async function listFollowupTasks(request, env2, requestId, origin) {
  const context2 = await resolveStaffContext(request, env2);
  if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
  if (!context2.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const readScope = bestScope(context2.activeBranch.capabilities.filter((grant) => grant.code === "followup.read").map((grant) => grant.scopeMode));
  if (!readScope) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  const detailScope = bestScope(context2.activeBranch.capabilities.filter((grant) => grant.code === "contacts.contact_details.read").map((grant) => grant.scopeMode));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const readPredicate = followupScopePredicate(readScope, "ft", context2.staff.profileId, context2.staff.userId, now);
  const detailPredicate = followupScopePredicate(detailScope, "ft", context2.staff.profileId, context2.staff.userId, now);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "open";
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  const rawOffset = url.searchParams.get("offset");
  const offset = rawOffset === null ? 0 : Number(rawOffset);
  if (!["open", "in_progress", "completed", "cancelled", "all"].includes(status) || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1e4 || [...url.searchParams.keys()].some((key) => !["status", "limit", "offset"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_QUERY" } }, requestId, origin);
  }
  const statusPredicate = status === "all" ? "1 = 1" : "ft.status = ?";
  const rows = await env2.DB.prepare(`
    SELECT ft.id, ft.branch_id, ft.contact_id, c.first_name, c.last_name, c.preferred_name,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.phone_e164 ELSE NULL END AS phone_e164,
           CASE WHEN ? = 1 AND (${detailPredicate.sql}) THEN c.email_normalized ELSE NULL END AS email,
           ft.list_id, fl.title AS list_title, ft.assignee_user_id,
           assignee.full_name AS assignee_name, ft.team_id, t.name AS team_name,
           ft.priority, ft.due_at, ft.status, ft.task_note, ft.completed_at,
           ft.created_at, ft.updated_at
    FROM followup_task ft
    JOIN contact c ON c.id = ft.contact_id AND c.branch_id = ft.branch_id
    LEFT JOIN followup_list fl ON fl.id = ft.list_id AND fl.branch_id = ft.branch_id
    LEFT JOIN staff_profile assignee ON assignee.auth_user_id = ft.assignee_user_id
    LEFT JOIN team t ON t.id = ft.team_id AND t.branch_id = ft.branch_id
    WHERE ft.branch_id = ?
      AND ${statusPredicate}
      AND (${readPredicate.sql})
    ORDER BY CASE WHEN ft.due_at IS NULL THEN 1 ELSE 0 END, ft.due_at ASC, ft.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(
    detailScope ? 1 : 0,
    ...detailPredicate.values,
    detailScope ? 1 : 0,
    ...detailPredicate.values,
    context2.activeBranch.branchId,
    ...status === "all" ? [] : [status],
    ...readPredicate.values,
    limit,
    offset
  ).all();
  return json(200, { ok: true, data: rows.results ?? [] }, requestId, origin);
}
__name(listFollowupTasks, "listFollowupTasks");
async function createFollowupTask(request, env2, requestId, origin) {
  const context2 = await resolveStaffContext(request, env2);
  if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
  if (!context2.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const createScope = bestScope(context2.activeBranch.capabilities.filter((grant) => grant.code === "followup.create").map((grant) => grant.scopeMode));
  const assignScope = bestScope(context2.activeBranch.capabilities.filter((grant) => grant.code === "followup.assign").map((grant) => grant.scopeMode));
  if (!createScope || !assignScope || createScope === "assigned" || assignScope === "assigned" || createScope !== assignScope) {
    return json(403, { ok: false, error: { code: "FOLLOWUP_CREATE_NOT_AUTHORIZED" } }, requestId, origin);
  }
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (idempotencyKey.length < 8 || idempotencyKey.length > 128) {
    return json(400, { ok: false, error: { code: "IDEMPOTENCY_KEY_REQUIRED" } }, requestId, origin);
  }
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  const allowed = /* @__PURE__ */ new Set(["contact_id", "assignee_user_id", "assignee_profile_id", "team_id", "list_id", "priority", "due_at", "task_note"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_BODY" } }, requestId, origin);
  }
  const contactId = typeof payload.contact_id === "string" ? payload.contact_id.trim() : "";
  const assigneeAuthUserId = typeof payload.assignee_user_id === "string" ? payload.assignee_user_id.trim() : "";
  const requestedAssigneeProfileId = typeof payload.assignee_profile_id === "string" ? payload.assignee_profile_id.trim() : "";
  const requestedTeamId = typeof payload.team_id === "string" ? payload.team_id.trim() : "";
  const hasAssignmentTargets = Number(Boolean(assigneeAuthUserId)) + Number(Boolean(requestedAssigneeProfileId)) + Number(Boolean(requestedTeamId));
  const listId = typeof payload.list_id === "string" ? payload.list_id.trim() || null : null;
  const priority = payload.priority === void 0 ? 3 : payload.priority;
  const dueAt = payload.due_at === void 0 || payload.due_at === null || payload.due_at === "" ? null : parseIsoTimestamp(payload.due_at, "");
  const taskNote = typeof payload.task_note === "string" ? payload.task_note.trim() || null : null;
  if (!contactId || contactId.length > 128 || hasAssignmentTargets !== 1 || payload.priority !== void 0 && typeof payload.priority !== "number" || !Number.isInteger(priority) || Number(priority) < 1 || Number(priority) > 5 || payload.list_id !== void 0 && payload.list_id !== null && typeof payload.list_id !== "string" || payload.due_at !== void 0 && payload.due_at !== null && payload.due_at !== "" && !dueAt || payload.task_note !== void 0 && payload.task_note !== null && typeof payload.task_note !== "string" || taskNote !== null && taskNote.length > 2e3) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_DETAILS" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const contact = await env2.DB.prepare(
    "SELECT id FROM contact WHERE id = ? AND branch_id = ? AND contact_status = 'active' LIMIT 1"
  ).bind(contactId, context2.activeBranch.branchId).first();
  if (!contact) return json(404, { ok: false, error: { code: "CONTACT_NOT_FOUND" } }, requestId, origin);
  let teamIdForScope = null;
  if (createScope === "team" || assignScope === "team") {
    const team = await env2.DB.prepare(`
      SELECT tm.team_id
      FROM staff_team_membership tm
      JOIN contact_assignment ca
        ON ca.team_id = tm.team_id AND ca.branch_id = tm.branch_id
      WHERE tm.staff_profile_id = ? AND tm.branch_id = ?
        AND tm.membership_role = 'leader' AND tm.revoked_at IS NULL
        AND tm.starts_at <= ? AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        AND ca.contact_id = ? AND ca.starts_at <= ?
        AND (ca.ends_at IS NULL OR ca.ends_at > ?)
      LIMIT 1
    `).bind(
      context2.staff.profileId,
      context2.activeBranch.branchId,
      now,
      now,
      contactId,
      now,
      now
    ).first();
    if (!team) return json(403, { ok: false, error: { code: "CONTACT_NOT_IN_LEADER_TEAM" } }, requestId, origin);
    teamIdForScope = team.team_id;
  }
  let assigneeUserId = null;
  let teamId = null;
  if (assigneeAuthUserId || requestedAssigneeProfileId) {
    const assigneeLookup = assigneeAuthUserId ? "sp.auth_user_id = ?" : "sp.id = ?";
    const assigneeLookupValue = assigneeAuthUserId || requestedAssigneeProfileId;
    const target = await env2.DB.prepare(`
      SELECT sp.id AS profile_id, sp.auth_user_id
      FROM staff_profile sp
      WHERE ${assigneeLookup} AND sp.account_status = 'active'
        AND EXISTS (
          SELECT 1 FROM staff_role_assignment ra
          JOIN role r ON r.id = ra.role_id AND r.is_active = 1
          WHERE ra.staff_profile_id = sp.id AND ra.branch_id = ?
            AND ra.revoked_at IS NULL AND ra.starts_at <= ?
            AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        )
      LIMIT 1
    `).bind(assigneeLookupValue, context2.activeBranch.branchId, now, now).first();
    if (!target) return json(400, { ok: false, error: { code: "FOLLOWUP_ASSIGNEE_NOT_ACTIVE" } }, requestId, origin);
    assigneeUserId = target.auth_user_id;
    if (assignScope === "team") {
      const member = await env2.DB.prepare(`
        SELECT 1 FROM staff_team_membership tm
        WHERE tm.team_id = ? AND tm.branch_id = ? AND tm.staff_profile_id = ?
          AND tm.revoked_at IS NULL AND tm.starts_at <= ?
          AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        LIMIT 1
      `).bind(teamIdForScope, context2.activeBranch.branchId, target.profile_id, now, now).first();
      if (!member) return json(403, { ok: false, error: { code: "FOLLOWUP_ASSIGNEE_OUTSIDE_TEAM" } }, requestId, origin);
    }
  } else {
    const targetTeam = await env2.DB.prepare(
      "SELECT id FROM team WHERE id = ? AND branch_id = ? AND is_active = 1 LIMIT 1"
    ).bind(requestedTeamId, context2.activeBranch.branchId).first();
    if (!targetTeam) return json(400, { ok: false, error: { code: "FOLLOWUP_TEAM_NOT_ACTIVE" } }, requestId, origin);
    teamId = targetTeam.id;
    if (assignScope === "team" && teamId !== teamIdForScope) {
      return json(403, { ok: false, error: { code: "FOLLOWUP_TEAM_OUTSIDE_SCOPE" } }, requestId, origin);
    }
  }
  if (createScope === "team" && teamIdForScope === null) {
    return json(403, { ok: false, error: { code: "FOLLOWUP_TEAM_SCOPE_REQUIRED" } }, requestId, origin);
  }
  if (listId) {
    const list = await env2.DB.prepare(
      "SELECT id, team_id FROM followup_list WHERE id = ? AND branch_id = ? AND status = 'active' LIMIT 1"
    ).bind(listId, context2.activeBranch.branchId).first();
    if (!list || assignScope === "team" && list.team_id !== null && list.team_id !== teamIdForScope) {
      return json(400, { ok: false, error: { code: "FOLLOWUP_LIST_NOT_AVAILABLE" } }, requestId, origin);
    }
  }
  const digestPayload = {
    branch_id: context2.activeBranch.branchId,
    contact_id: contactId,
    assignee_user_id: assigneeUserId,
    team_id: teamId,
    list_id: listId,
    priority,
    due_at: dueAt,
    task_note: taskNote
  };
  const digestHex = await sha256Hex(JSON.stringify(digestPayload));
  const respondWithTask = /* @__PURE__ */ __name(async (id, status, idempotentReplay) => {
    const task = await env2.DB.prepare(`
      SELECT id, branch_id, contact_id, assignee_user_id, team_id, priority,
             due_at, status, task_note, created_at, updated_at
      FROM followup_task
      WHERE id = ? AND branch_id = ?
      LIMIT 1
    `).bind(id, context2.activeBranch.branchId).first();
    if (!task) return json(500, { ok: false, error: { code: "FOLLOWUP_TASK_READBACK_FAILED" } }, requestId, origin);
    return json(status, { ok: true, data: task, idempotent_replay: idempotentReplay }, requestId, origin);
  }, "respondWithTask");
  const existing = await env2.DB.prepare(`
    SELECT id, hex(request_digest) AS digest_hex
    FROM followup_task
    WHERE branch_id = ? AND client_request_id = ? LIMIT 1
  `).bind(context2.activeBranch.branchId, idempotencyKey).first();
  if (existing) {
    if (existing.digest_hex.toLowerCase() !== digestHex) {
      return json(409, { ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD" } }, requestId, origin);
    }
    return respondWithTask(existing.id, 200, true);
  }
  const taskId = crypto.randomUUID();
  const eventId = crypto.randomUUID();
  const digestBytes = new Uint8Array(digestHex.match(/.{2}/g).map((pair) => parseInt(pair, 16)));
  const contactPredicate = contactScopePredicate(
    createScope,
    "c",
    context2.staff.userId,
    context2.activeBranch.branchId,
    now
  );
  const targetPredicate = assigneeUserId !== null ? `EXISTS (
        SELECT 1 FROM staff_profile target
        JOIN staff_role_assignment target_assignment ON target_assignment.staff_profile_id = target.id
        JOIN role target_role ON target_role.id = target_assignment.role_id AND target_role.is_active = 1
        WHERE target.auth_user_id = ?
          AND target.account_status = 'active'
          AND target_assignment.branch_id = c.branch_id
          AND target_assignment.revoked_at IS NULL
          AND target_assignment.starts_at <= ?
          AND (target_assignment.ends_at IS NULL OR target_assignment.ends_at > ?)
          ${assignScope === "team" ? `AND EXISTS (
            SELECT 1 FROM staff_team_membership target_member
            WHERE target_member.staff_profile_id = target.id
              AND target_member.team_id = ?
              AND target_member.branch_id = c.branch_id
              AND target_member.revoked_at IS NULL
              AND target_member.starts_at <= ?
              AND (target_member.ends_at IS NULL OR target_member.ends_at > ?)
          )` : ""}
      )` : `EXISTS (
        SELECT 1 FROM team target_team
        WHERE target_team.id = ? AND target_team.branch_id = c.branch_id
          AND target_team.is_active = 1
          ${assignScope === "team" ? "AND target_team.id = ?" : ""}
      )`;
  const targetValues = assigneeUserId !== null ? assignScope === "team" ? [assigneeUserId, now, now, teamIdForScope, now, now] : [assigneeUserId, now, now] : assignScope === "team" ? [teamId, teamIdForScope] : [teamId];
  const listScopeTeamId = teamId ?? teamIdForScope;
  const listPredicate = listId === null ? "1 = 1" : `EXISTS (
        SELECT 1 FROM followup_list target_list
        WHERE target_list.id = ? AND target_list.branch_id = c.branch_id
          AND target_list.status = 'active'
          AND (target_list.team_id IS NULL OR target_list.team_id = ?)
      )`;
  const listValues = listId === null ? [] : [listId, listScopeTeamId];
  const actorCapabilityPredicate = /* @__PURE__ */ __name((code) => `EXISTS (
    SELECT 1
    FROM staff_profile actor
    JOIN staff_role_assignment actor_assignment ON actor_assignment.staff_profile_id = actor.id
    JOIN role actor_role ON actor_role.id = actor_assignment.role_id AND actor_role.is_active = 1
    JOIN role_capability actor_grant ON actor_grant.role_id = actor_role.id
    JOIN capability actor_capability ON actor_capability.id = actor_grant.capability_id
      AND actor_capability.is_active = 1 AND actor_capability.code = '${code}'
    WHERE actor.auth_user_id = ?
      AND actor.account_status = 'active'
      AND actor_assignment.branch_id = c.branch_id
      AND actor_assignment.revoked_at IS NULL
      AND actor_assignment.starts_at <= ?
      AND (actor_assignment.ends_at IS NULL OR actor_assignment.ends_at > ?)
      AND actor_grant.scope_mode = '${createScope}'
  )`, "actorCapabilityPredicate");
  try {
    const statements = [
      env2.DB.prepare(`
        INSERT INTO followup_task
          (id, list_id, contact_id, branch_id, assignee_user_id, team_id, priority,
           due_at, status, task_note, created_by, completed_at, created_at, updated_at,
           client_request_id, digest_key_version, request_digest)
        SELECT ?, ?, c.id, c.branch_id, ?, ?, ?, ?, 'open', ?, ?, NULL, ?, ?, ?, 1, ?
        FROM contact c
        WHERE c.id = ? AND c.branch_id = ? AND c.contact_status = 'active'
          AND (${contactPredicate.sql})
          AND (${targetPredicate})
          AND (${listPredicate})
          AND (${actorCapabilityPredicate("followup.create")})
          AND (${actorCapabilityPredicate("followup.assign")})
      `).bind(
        taskId,
        listId,
        assigneeUserId,
        teamId,
        priority,
        dueAt,
        taskNote,
        context2.staff.userId,
        now,
        now,
        idempotencyKey,
        digestBytes,
        contactId,
        context2.activeBranch.branchId,
        ...contactPredicate.values,
        ...targetValues,
        ...listValues,
        context2.staff.userId,
        now,
        now,
        context2.staff.userId,
        now,
        now
      ),
      env2.DB.prepare(`
        INSERT INTO followup_task_event
          (id, task_id, actor_user_id, event_type, from_status, to_status, details, created_at)
        VALUES (?, ?, ?, 'created', NULL, 'open', ?, ?)
      `).bind(
        eventId,
        taskId,
        context2.staff.userId,
        JSON.stringify({ priority, due_at: dueAt, list_id: listId, team_id: teamId }),
        now
      )
    ];
    if (assigneeUserId !== null) {
      statements.push(env2.DB.prepare(`
        INSERT OR IGNORE INTO staff_notification
          (id, branch_id, recipient_user_id, category, title, body, target_type, target_id, idempotency_key, created_at)
        SELECT ?, ?, ?, 'followup_assigned', 'New follow-up task',
               'A follow-up task has been assigned to you.', 'followup_task', ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM followup_task WHERE id = ? AND branch_id = ?)
      `).bind(
        crypto.randomUUID(),
        context2.activeBranch.branchId,
        assigneeUserId,
        taskId,
        `followup-task:${taskId}:assigned:${assigneeUserId}`,
        now,
        taskId,
        context2.activeBranch.branchId
      ));
    }
    const results = await env2.DB.batch(statements);
    if (results.some((result) => !result.success) || results.slice(0, 2).some((result) => (result.meta?.changes ?? 0) !== 1) || assigneeUserId !== null && (results[2]?.meta?.changes ?? 0) !== 1) {
      throw new Error("FOLLOWUP_TASK_CREATE_FAILED");
    }
  } catch {
    const raced = await env2.DB.prepare(`
      SELECT id, hex(request_digest) AS digest_hex
      FROM followup_task WHERE branch_id = ? AND client_request_id = ? LIMIT 1
    `).bind(context2.activeBranch.branchId, idempotencyKey).first();
    if (raced && raced.digest_hex.toLowerCase() === digestHex) {
      return json(200, { ok: true, task_id: raced.id, idempotent_replay: true }, requestId, origin);
    }
    return json(409, { ok: false, error: { code: "FOLLOWUP_TASK_CREATE_CONFLICT" } }, requestId, origin);
  }
  return respondWithTask(taskId, 201, false);
}
__name(createFollowupTask, "createFollowupTask");
async function updateFollowupTask(request, env2, taskId, requestId, origin) {
  const context2 = await resolveStaffContext(request, env2);
  if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
  if (!context2.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const task = await env2.DB.prepare(`
    SELECT id, status, team_id, assignee_user_id
    FROM followup_task
    WHERE id = ? AND branch_id = ?
    LIMIT 1
  `).bind(taskId, context2.activeBranch.branchId).first();
  if (!task) return json(404, { ok: false, error: { code: "FOLLOWUP_TASK_NOT_FOUND" } }, requestId, origin);
  let teamId = task.team_id ?? void 0;
  if (!teamId && task.assignee_user_id) {
    const membership = await env2.DB.prepare(`
      SELECT tm.team_id
      FROM staff_team_membership tm
      JOIN staff_profile assignee ON assignee.auth_user_id = ?
      JOIN staff_team_membership member
        ON member.staff_profile_id = assignee.id AND member.team_id = tm.team_id
      WHERE tm.staff_profile_id = ? AND tm.branch_id = ?
        AND tm.membership_role = 'leader' AND tm.revoked_at IS NULL
        AND tm.starts_at <= ? AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        AND member.revoked_at IS NULL
        AND member.starts_at <= ? AND (member.ends_at IS NULL OR member.ends_at > ?)
      LIMIT 1
    `).bind(
      task.assignee_user_id,
      context2.staff.profileId,
      context2.activeBranch.branchId,
      now,
      now,
      now,
      now
    ).first();
    teamId = membership?.team_id;
  }
  const access = await authorizeRequestCapability(request, env2, "followup.update", {
    type: "followup_task",
    recordId: taskId,
    teamId
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  const allowed = /* @__PURE__ */ new Set(["status", "priority", "due_at", "task_note"]);
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length === 0 || Object.keys(payload).some((key) => !allowed.has(key))) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_UPDATE" } }, requestId, origin);
  }
  const nextStatus = payload.status === void 0 ? task.status : payload.status;
  const transitions = {
    open: ["in_progress", "completed", "cancelled"],
    in_progress: ["open", "completed", "cancelled"],
    completed: ["open"],
    cancelled: ["open"]
  };
  if (typeof nextStatus !== "string" || nextStatus !== task.status && !(transitions[task.status] ?? []).includes(nextStatus)) {
    return json(409, { ok: false, error: { code: "INVALID_FOLLOWUP_STATUS_TRANSITION" } }, requestId, origin);
  }
  const priority = payload.priority === void 0 ? void 0 : payload.priority;
  if (priority !== void 0 && (typeof priority !== "number" || !Number.isInteger(priority) || priority < 1 || priority > 5)) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_PRIORITY" } }, requestId, origin);
  }
  const dueAt = payload.due_at === void 0 ? void 0 : payload.due_at === null || payload.due_at === "" ? null : parseIsoTimestamp(payload.due_at, "");
  if (payload.due_at !== void 0 && payload.due_at !== null && payload.due_at !== "" && !dueAt) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_DUE_DATE" } }, requestId, origin);
  }
  const taskNote = payload.task_note === void 0 ? void 0 : payload.task_note === null ? null : typeof payload.task_note === "string" ? payload.task_note.trim() || null : "";
  if (taskNote === "" || taskNote !== void 0 && taskNote !== null && taskNote.length > 2e3) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_NOTE" } }, requestId, origin);
  }
  const assignments = ["status = ?", "completed_at = ?", "updated_at = ?"];
  const values = [
    nextStatus,
    nextStatus === "completed" ? now : null,
    now
  ];
  if (priority !== void 0) {
    assignments.push("priority = ?");
    values.push(priority);
  }
  if (dueAt !== void 0) {
    assignments.push("due_at = ?");
    values.push(dueAt);
  }
  if (taskNote !== void 0) {
    assignments.push("task_note = ?");
    values.push(taskNote);
  }
  const predicate = followupScopePredicate(
    access.decision.scopeMode,
    "ft",
    access.staff.profileId,
    access.staff.userId,
    now
  );
  const eventType = nextStatus !== task.status ? nextStatus === "completed" ? "completed" : task.status === "completed" && nextStatus === "open" ? "reopened" : "status_changed" : taskNote !== void 0 ? "note_added" : "details_updated";
  const eventId = crypto.randomUUID();
  const details = JSON.stringify({
    status_changed: nextStatus !== task.status,
    priority_changed: priority !== void 0,
    due_date_changed: dueAt !== void 0,
    note_changed: taskNote !== void 0
  });
  try {
    const results = await env2.DB.batch([
      env2.DB.prepare(`
        UPDATE followup_task ft
        SET ${assignments.join(", ")}
        WHERE ft.id = ? AND ft.branch_id = ? AND ft.status = ?
          AND (${predicate.sql})
      `).bind(
        ...values,
        taskId,
        access.activeBranch.branchId,
        task.status,
        ...predicate.values
      ),
      env2.DB.prepare(`
        INSERT INTO followup_task_event
          (id, task_id, actor_user_id, event_type, from_status, to_status, details, created_at)
        SELECT ?, ft.id, ?, ?, ?, ?, ?, ?
        FROM followup_task ft
        WHERE ft.id = ? AND ft.branch_id = ? AND changes() = 1
      `).bind(
        eventId,
        access.staff.userId,
        eventType,
        task.status,
        nextStatus,
        details,
        now,
        taskId,
        access.activeBranch.branchId
      )
    ]);
    if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "FOLLOWUP_TASK_CHANGED" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "FOLLOWUP_TASK_UPDATE_CONFLICT" } }, requestId, origin);
  }
  const updatedTask = await env2.DB.prepare(`
    SELECT id, branch_id, contact_id, assignee_user_id, team_id, priority,
           due_at, status, task_note, created_at, updated_at
    FROM followup_task
    WHERE id = ? AND branch_id = ?
    LIMIT 1
  `).bind(taskId, access.activeBranch.branchId).first();
  if (!updatedTask) {
    return json(500, { ok: false, error: { code: "FOLLOWUP_TASK_READBACK_FAILED" } }, requestId, origin);
  }
  return json(200, { ok: true, data: updatedTask }, requestId, origin);
}
__name(updateFollowupTask, "updateFollowupTask");
async function reassignFollowupTask(request, env2, taskId, requestId, origin) {
  const context2 = await resolveStaffContext(request, env2);
  if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
  if (!context2.activeBranch) return mapCapabilityFailure("branch_required", requestId, origin);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const task = await env2.DB.prepare(`
    SELECT id, status, team_id, assignee_user_id
    FROM followup_task WHERE id = ? AND branch_id = ? LIMIT 1
  `).bind(taskId, context2.activeBranch.branchId).first();
  if (!task) return json(404, { ok: false, error: { code: "FOLLOWUP_TASK_NOT_FOUND" } }, requestId, origin);
  let teamId = task.team_id ?? void 0;
  if (!teamId && task.assignee_user_id) {
    const membership = await env2.DB.prepare(`
      SELECT tm.team_id
      FROM staff_team_membership tm
      JOIN staff_profile assignee ON assignee.auth_user_id = ?
      JOIN staff_team_membership member
        ON member.staff_profile_id = assignee.id AND member.team_id = tm.team_id
      WHERE tm.staff_profile_id = ? AND tm.branch_id = ?
        AND tm.membership_role = 'leader' AND tm.revoked_at IS NULL
        AND tm.starts_at <= ? AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        AND member.revoked_at IS NULL
        AND member.starts_at <= ? AND (member.ends_at IS NULL OR member.ends_at > ?)
      LIMIT 1
    `).bind(
      task.assignee_user_id,
      context2.staff.profileId,
      context2.activeBranch.branchId,
      now,
      now,
      now,
      now
    ).first();
    teamId = membership?.team_id;
  }
  const access = await authorizeRequestCapability(request, env2, "followup.assign", {
    type: "followup_task",
    recordId: taskId,
    teamId
  });
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const body = await readJsonBody(request);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => !["assignee_profile_id", "team_id", "reason"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_ASSIGNMENT_BODY" } }, requestId, origin);
  }
  const assigneeProfileId = typeof payload.assignee_profile_id === "string" ? payload.assignee_profile_id.trim() : "";
  const requestedTeamId = typeof payload.team_id === "string" ? payload.team_id.trim() : "";
  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";
  if (!!assigneeProfileId === !!requestedTeamId || reason.length < 10 || reason.length > 500) {
    return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_ASSIGNMENT_TARGET" } }, requestId, origin);
  }
  let nextAssignee = null;
  let nextTeam = null;
  const assignScope = access.decision.scopeMode;
  if (assigneeProfileId) {
    const target = await env2.DB.prepare(`
      SELECT sp.auth_user_id
      FROM staff_profile sp
      WHERE sp.id = ? AND sp.account_status = 'active'
        AND EXISTS (
          SELECT 1 FROM staff_role_assignment ra
          JOIN role r ON r.id = ra.role_id AND r.is_active = 1
          WHERE ra.staff_profile_id = sp.id AND ra.branch_id = ?
            AND ra.revoked_at IS NULL AND ra.starts_at <= ?
            AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        )
      LIMIT 1
    `).bind(assigneeProfileId, context2.activeBranch.branchId, now, now).first();
    if (!target) return json(400, { ok: false, error: { code: "FOLLOWUP_ASSIGNEE_NOT_ACTIVE" } }, requestId, origin);
    if (assignScope === "team") {
      const member = await env2.DB.prepare(`
        SELECT 1 FROM staff_team_membership tm
        WHERE tm.staff_profile_id = ? AND tm.team_id = ? AND tm.branch_id = ?
          AND tm.revoked_at IS NULL AND tm.starts_at <= ?
          AND (tm.ends_at IS NULL OR tm.ends_at > ?)
        LIMIT 1
      `).bind(assigneeProfileId, teamId, context2.activeBranch.branchId, now, now).first();
      if (!member) return json(403, { ok: false, error: { code: "FOLLOWUP_ASSIGNEE_OUTSIDE_TEAM" } }, requestId, origin);
    }
    nextAssignee = target.auth_user_id;
  } else {
    const targetTeam = await env2.DB.prepare(
      "SELECT id FROM team WHERE id = ? AND branch_id = ? AND is_active = 1 LIMIT 1"
    ).bind(requestedTeamId, context2.activeBranch.branchId).first();
    if (!targetTeam) return json(400, { ok: false, error: { code: "FOLLOWUP_TEAM_NOT_ACTIVE" } }, requestId, origin);
    if (assignScope === "team" && targetTeam.id !== teamId) {
      return json(403, { ok: false, error: { code: "FOLLOWUP_TEAM_OUTSIDE_SCOPE" } }, requestId, origin);
    }
    nextTeam = targetTeam.id;
  }
  if (nextAssignee === task.assignee_user_id && nextTeam === task.team_id) {
    return json(409, { ok: false, error: { code: "FOLLOWUP_ASSIGNMENT_UNCHANGED" } }, requestId, origin);
  }
  const predicate = followupScopePredicate(
    access.decision.scopeMode,
    "ft",
    access.staff.profileId,
    access.staff.userId,
    now
  );
  const targetPredicate = nextAssignee !== null ? `EXISTS (
        SELECT 1 FROM staff_profile target
        JOIN staff_role_assignment ra ON ra.staff_profile_id = target.id
        JOIN role r ON r.id = ra.role_id AND r.is_active = 1
        WHERE target.auth_user_id = ? AND target.account_status = 'active'
          AND ra.branch_id = ft.branch_id AND ra.revoked_at IS NULL
          AND ra.starts_at <= ? AND (ra.ends_at IS NULL OR ra.ends_at > ?)
          ${access.decision.scopeMode === "team" ? `AND EXISTS (
            SELECT 1 FROM staff_team_membership tm
            WHERE tm.staff_profile_id = target.id AND tm.team_id = ?
              AND tm.branch_id = ft.branch_id AND tm.revoked_at IS NULL
              AND tm.starts_at <= ? AND (tm.ends_at IS NULL OR tm.ends_at > ?)
          )` : ""}
      )` : `EXISTS (
        SELECT 1 FROM team target_team
        WHERE target_team.id = ? AND target_team.branch_id = ft.branch_id
          AND target_team.is_active = 1
          ${access.decision.scopeMode === "team" ? "AND target_team.id = ?" : ""}
      )`;
  const targetValues = nextAssignee !== null ? access.decision.scopeMode === "team" ? [nextAssignee, now, now, teamId, now, now] : [nextAssignee, now, now] : access.decision.scopeMode === "team" ? [nextTeam, teamId] : [nextTeam];
  const eventId = crypto.randomUUID();
  const details = JSON.stringify({
    previous_assignee_user_id: task.assignee_user_id,
    previous_team_id: task.team_id,
    assignee_profile_id: assigneeProfileId || null,
    team_id: nextTeam,
    reason
  });
  try {
    const statements = [
      env2.DB.prepare(`
        UPDATE followup_task ft
        SET assignee_user_id = ?, team_id = ?, updated_at = ?
        WHERE ft.id = ? AND ft.branch_id = ? AND (${predicate.sql})
          AND (${targetPredicate})
          AND EXISTS (
            SELECT 1
            FROM staff_profile actor
            JOIN staff_role_assignment actor_assignment ON actor_assignment.staff_profile_id = actor.id
            JOIN role actor_role ON actor_role.id = actor_assignment.role_id AND actor_role.is_active = 1
            JOIN role_capability actor_grant ON actor_grant.role_id = actor_role.id
            JOIN capability actor_capability ON actor_capability.id = actor_grant.capability_id
              AND actor_capability.code = 'followup.assign' AND actor_capability.is_active = 1
            WHERE actor.auth_user_id = ?
              AND actor.account_status = 'active'
              AND actor_assignment.branch_id = ft.branch_id
              AND actor_assignment.revoked_at IS NULL
              AND actor_assignment.starts_at <= ?
              AND (actor_assignment.ends_at IS NULL OR actor_assignment.ends_at > ?)
              AND actor_grant.scope_mode = '${access.decision.scopeMode}'
          )
      `).bind(
        nextAssignee,
        nextTeam,
        now,
        taskId,
        context2.activeBranch.branchId,
        ...predicate.values,
        ...targetValues,
        access.staff.userId,
        now,
        now
      ),
      env2.DB.prepare(`
        INSERT INTO followup_task_event
          (id, task_id, actor_user_id, event_type, from_status, to_status, details, created_at)
        SELECT ?, ft.id, ?, 'reassigned', ?, ?, ?, ?
        FROM followup_task ft
        WHERE ft.id = ? AND ft.branch_id = ? AND changes() = 1
      `).bind(
        eventId,
        access.staff.userId,
        task.status,
        task.status,
        details,
        now,
        taskId,
        context2.activeBranch.branchId
      )
    ];
    if (nextAssignee !== null) {
      statements.push(env2.DB.prepare(`
        INSERT OR IGNORE INTO staff_notification
          (id, branch_id, recipient_user_id, category, title, body, target_type, target_id, idempotency_key, created_at)
        SELECT ?, ?, ?, 'followup_assigned', 'Follow-up task reassigned',
               'A follow-up task has been assigned to you.', 'followup_task', ?, ?, ?
        FROM followup_task
        WHERE id = ? AND branch_id = ? AND assignee_user_id = ? AND changes() = 1
      `).bind(
        crypto.randomUUID(),
        context2.activeBranch.branchId,
        nextAssignee,
        taskId,
        `followup-task:${taskId}:assignment:${eventId}`,
        now,
        taskId,
        context2.activeBranch.branchId,
        nextAssignee
      ));
    }
    const results = await env2.DB.batch(statements);
    if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1 || nextAssignee !== null && (results[2]?.meta?.changes ?? 0) !== 1) {
      return json(409, { ok: false, error: { code: "FOLLOWUP_TASK_CHANGED" } }, requestId, origin);
    }
  } catch {
    return json(409, { ok: false, error: { code: "FOLLOWUP_REASSIGNMENT_CONFLICT" } }, requestId, origin);
  }
  const updatedTask = await env2.DB.prepare(`
    SELECT id, branch_id, contact_id, assignee_user_id, team_id, priority,
           due_at, status, task_note, created_at, updated_at
    FROM followup_task
    WHERE id = ? AND branch_id = ?
    LIMIT 1
  `).bind(taskId, context2.activeBranch.branchId).first();
  if (!updatedTask) {
    return json(500, { ok: false, error: { code: "FOLLOWUP_TASK_READBACK_FAILED" } }, requestId, origin);
  }
  return json(200, { ok: true, data: updatedTask }, requestId, origin);
}
__name(reassignFollowupTask, "reassignFollowupTask");
async function listStaffAudit(request, env2, requestId, origin) {
  const access = await authorizeRequestCapability(request, env2, "staff.audit.read");
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || [...url.searchParams.keys()].some((key) => !["limit", "before", "before_id"].includes(key))) {
    return json(400, { ok: false, error: { code: "INVALID_AUDIT_QUERY" } }, requestId, origin);
  }
  const beforeValue = url.searchParams.get("before");
  const before = beforeValue === null ? (/* @__PURE__ */ new Date()).toISOString() : parseIsoTimestamp(beforeValue, "");
  const beforeIdValue = url.searchParams.get("before_id");
  const beforeId = beforeIdValue === null && beforeValue === null ? "~".repeat(128) : beforeIdValue;
  if (!before || !beforeId || beforeId.length > 128 || beforeValue === null !== (beforeIdValue === null)) {
    return json(400, { ok: false, error: { code: "INVALID_AUDIT_CURSOR" } }, requestId, origin);
  }
  const rows = await env2.DB.prepare(`
    SELECT * FROM (
      SELECT a.id AS event_id, 'staff_access' AS event_type,
             a.actor_profile_id, actor.full_name AS actor_name,
             a.target_profile_id, target.full_name AS target_name,
             a.action, a.reason, a.metadata, a.created_at
      FROM staff_access_audit a
      JOIN staff_profile actor ON actor.id = a.actor_profile_id
      JOIN staff_profile target ON target.id = a.target_profile_id
      WHERE a.branch_id = ? AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))
      UNION ALL
      SELECT a.id, 'staff_account', a.actor_profile_id, actor.full_name,
             a.target_profile_id, target.full_name, a.action, a.reason, a.metadata, a.created_at
      FROM staff_account_audit a
      JOIN staff_profile actor ON actor.id = a.actor_profile_id
      JOIN staff_profile target ON target.id = a.target_profile_id
      WHERE a.branch_id = ? AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))
      UNION ALL
      SELECT a.id, 'admin_elevation', a.actor_profile_id, actor.full_name,
             req.target_profile_id, target.full_name, a.action, a.reason,
             json_object('request_id', a.request_id), a.created_at
      FROM staff_role_elevation_audit a
      JOIN staff_role_elevation_request req ON req.id = a.request_id
      JOIN staff_profile actor ON actor.id = a.actor_profile_id
      JOIN staff_profile target ON target.id = req.target_profile_id
      WHERE a.branch_id = ? AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))
      UNION ALL
      SELECT a.id, 'admin_revocation', a.actor_profile_id, actor.full_name,
             req.target_profile_id, target.full_name, a.action, a.reason,
             json_object('request_id', a.request_id), a.created_at
      FROM staff_role_revocation_audit a
      JOIN staff_role_revocation_request req ON req.id = a.request_id
      JOIN staff_profile actor ON actor.id = a.actor_profile_id
      JOIN staff_profile target ON target.id = req.target_profile_id
      WHERE a.branch_id = ? AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))
    )
    ORDER BY created_at DESC, event_id DESC
    LIMIT ?
  `).bind(
    access.activeBranch.branchId,
    before,
    before,
    beforeId,
    access.activeBranch.branchId,
    before,
    before,
    beforeId,
    access.activeBranch.branchId,
    before,
    before,
    beforeId,
    access.activeBranch.branchId,
    before,
    before,
    beforeId,
    limit
  ).all();
  const events = rows.results ?? [];
  return json(200, {
    ok: true,
    events,
    next_before: events.length === limit ? events[events.length - 1].created_at : null,
    next_before_id: events.length === limit ? events[events.length - 1].event_id : null
  }, requestId, origin);
}
__name(listStaffAudit, "listStaffAudit");
async function listTeamOperationsCollection(request, env2, requestId, origin, resource) {
  const url = new URL(request.url);
  const branchIds = url.searchParams.getAll("branch_id");
  const branchId = branchIds[0] ?? "";
  if (branchIds.length !== 1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)) {
    return json(400, { ok: false, error: { code: "INVALID_QUERY" } }, requestId, origin);
  }
  const context2 = await resolveStaffContext(request, env2);
  if (context2.state !== "authenticated") {
    return mapCapabilityFailure(context2.state, requestId, origin);
  }
  if (!context2.activeBranch) {
    return mapCapabilityFailure("branch_required", requestId, origin);
  }
  if (context2.activeBranch.branchId !== branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_SCOPE_MISMATCH" } }, requestId, origin);
  }
  const readCapability = resource === "teams" ? "team.read" : "area.read";
  const grants = context2.activeBranch.capabilities.filter((item) => item.code === readCapability);
  const branchRead = grants.some((item) => item.scopeMode === "branch");
  const teamRead = grants.some((item) => item.scopeMode === "team");
  if (!branchRead && !teamRead) {
    return mapCapabilityFailure("capability_denied", requestId, origin);
  }
  const includeStaffNames = context2.activeBranch.capabilities.some(
    (item) => item.code === "staff.directory.read" && item.scopeMode === "branch"
  );
  const now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    if (resource === "teams") {
      const teamsResult = await env2.DB.prepare(`
        SELECT t.id, t.branch_id, t.name, t.description, t.is_active, t.created_at, t.updated_at
        FROM team t
        WHERE t.branch_id = ?
          AND (? = 1 OR t.is_active = 1)
          AND (
            ? = 1
            OR EXISTS (
              SELECT 1
              FROM staff_team_membership actor_membership
              WHERE actor_membership.team_id = t.id
                AND actor_membership.branch_id = t.branch_id
                AND actor_membership.staff_profile_id = ?
                AND actor_membership.membership_role = 'leader'
                AND actor_membership.starts_at <= ?
                AND actor_membership.revoked_at IS NULL
                AND (actor_membership.ends_at IS NULL OR actor_membership.ends_at > ?)
            )
          )
        ORDER BY t.is_active DESC, t.name ASC
      `).bind(branchId, branchRead ? 1 : 0, branchRead ? 1 : 0, context2.staff.profileId, now, now).all();
      const membershipsResult = await env2.DB.prepare(`
        SELECT stm.id, stm.team_id, stm.staff_profile_id, stm.membership_role,
               stm.starts_at, stm.ends_at, stm.created_at
        FROM staff_team_membership stm
        WHERE stm.branch_id = ?
          AND stm.starts_at <= ?
          AND stm.revoked_at IS NULL
          AND (stm.ends_at IS NULL OR stm.ends_at > ?)
          AND EXISTS (
            SELECT 1
            FROM staff_profile active_member
            WHERE active_member.id = stm.staff_profile_id
              AND active_member.account_status = 'active'
              AND active_member.deactivated_at IS NULL
          )
          AND (
            ? = 1
            OR EXISTS (
              SELECT 1
              FROM staff_team_membership actor_membership
              JOIN team active_team
                ON active_team.id = actor_membership.team_id
               AND active_team.branch_id = actor_membership.branch_id
               AND active_team.is_active = 1
              WHERE actor_membership.team_id = stm.team_id
                AND actor_membership.branch_id = stm.branch_id
                AND actor_membership.staff_profile_id = ?
                AND actor_membership.membership_role = 'leader'
                AND actor_membership.starts_at <= ?
                AND actor_membership.revoked_at IS NULL
                AND (actor_membership.ends_at IS NULL OR actor_membership.ends_at > ?)
            )
          )
        ORDER BY stm.created_at ASC
      `).bind(branchId, now, now, branchRead ? 1 : 0, context2.staff.profileId, now, now).all();
      const memberships = membershipsResult.results ?? [];
      const profileIds2 = includeStaffNames ? [...new Set(memberships.map((item) => String(item.staff_profile_id)))] : [];
      let profiles2 = [];
      if (profileIds2.length) {
        const placeholders = profileIds2.map(() => "?").join(", ");
        const result = await env2.DB.prepare(`
          SELECT id, full_name, account_status
          FROM staff_profile
          WHERE id IN (${placeholders})
        `).bind(...profileIds2).all();
        profiles2 = result.results ?? [];
      }
      const profileById2 = new Map(profiles2.map((profile3) => [String(profile3.id), profile3]));
      const teams = (teamsResult.results ?? []).map((team) => {
        const teamMembers = memberships.filter((membership) => membership.team_id === team.id);
        return {
          ...team,
          is_active: Boolean(team.is_active),
          member_count: teamMembers.length,
          members: includeStaffNames ? teamMembers.map((membership) => ({
            ...membership,
            staff: profileById2.get(String(membership.staff_profile_id)) ?? null
          })) : []
        };
      });
      return json(200, { ok: true, data: { teams } }, requestId, origin);
    }
    const areasResult = await env2.DB.prepare(`
      SELECT sa.id, sa.branch_id, sa.name, sa.code, sa.is_active, sa.created_at, sa.updated_at
      FROM service_area sa
      WHERE sa.branch_id = ?
        AND (
          ? = 1
          OR EXISTS (
            SELECT 1
            FROM staff_area_coverage sac
            JOIN staff_team_membership covered_member
              ON covered_member.staff_profile_id = sac.staff_profile_id
             AND covered_member.branch_id = sac.branch_id
            JOIN staff_profile covered_profile
              ON covered_profile.id = covered_member.staff_profile_id
             AND covered_profile.account_status = 'active'
             AND covered_profile.deactivated_at IS NULL
            JOIN team covered_team
              ON covered_team.id = covered_member.team_id
             AND covered_team.branch_id = covered_member.branch_id
             AND covered_team.is_active = 1
            WHERE sac.service_area_id = sa.id
              AND sac.branch_id = sa.branch_id
              AND sac.starts_at <= ?
              AND sac.revoked_at IS NULL
              AND (sac.ends_at IS NULL OR sac.ends_at > ?)
              AND covered_member.starts_at <= ?
              AND covered_member.revoked_at IS NULL
              AND (covered_member.ends_at IS NULL OR covered_member.ends_at > ?)
              AND EXISTS (
                SELECT 1
                FROM staff_team_membership actor_membership
                WHERE actor_membership.team_id = covered_member.team_id
                  AND actor_membership.branch_id = covered_member.branch_id
                  AND actor_membership.staff_profile_id = ?
                  AND actor_membership.membership_role = 'leader'
                  AND actor_membership.starts_at <= ?
                  AND actor_membership.revoked_at IS NULL
                  AND (actor_membership.ends_at IS NULL OR actor_membership.ends_at > ?)
              )
          )
        )
      ORDER BY sa.is_active DESC, sa.name ASC
    `).bind(
      branchId,
      branchRead ? 1 : 0,
      now,
      now,
      now,
      now,
      context2.staff.profileId,
      now,
      now
    ).all();
    const accessibleAreas = areasResult.results ?? [];
    const areaIds = accessibleAreas.map((area) => String(area.id));
    let coverage = [];
    if (areaIds.length) {
      const placeholders = areaIds.map(() => "?").join(", ");
      const coverageResult = await env2.DB.prepare(`
        SELECT id, service_area_id, staff_profile_id, starts_at, ends_at, created_at
        FROM staff_area_coverage
        WHERE branch_id = ?
          AND service_area_id IN (${placeholders})
          AND starts_at <= ?
          AND revoked_at IS NULL
          AND (ends_at IS NULL OR ends_at > ?)
          AND (
            ? = 1
            OR EXISTS (
              SELECT 1
              FROM staff_team_membership covered_member
              JOIN staff_profile active_member
                ON active_member.id = covered_member.staff_profile_id
               AND active_member.account_status = 'active'
               AND active_member.deactivated_at IS NULL
              JOIN team covered_team
                ON covered_team.id = covered_member.team_id
               AND covered_team.branch_id = covered_member.branch_id
               AND covered_team.is_active = 1
              WHERE covered_member.staff_profile_id = staff_area_coverage.staff_profile_id
                AND covered_member.branch_id = staff_area_coverage.branch_id
                AND covered_member.starts_at <= ?
                AND covered_member.revoked_at IS NULL
                AND (covered_member.ends_at IS NULL OR covered_member.ends_at > ?)
                AND EXISTS (
                  SELECT 1
                  FROM staff_team_membership actor_membership
                  WHERE actor_membership.team_id = covered_member.team_id
                    AND actor_membership.branch_id = covered_member.branch_id
                    AND actor_membership.staff_profile_id = ?
                    AND actor_membership.membership_role = 'leader'
                    AND actor_membership.starts_at <= ?
                    AND actor_membership.revoked_at IS NULL
                    AND (actor_membership.ends_at IS NULL OR actor_membership.ends_at > ?)
                )
            )
          )
        ORDER BY starts_at DESC
      `).bind(
        branchId,
        ...areaIds,
        now,
        now,
        branchRead ? 1 : 0,
        now,
        now,
        context2.staff.profileId,
        now,
        now
      ).all();
      coverage = coverageResult.results ?? [];
    }
    const profileIds = includeStaffNames ? [...new Set(coverage.map((item) => String(item.staff_profile_id)))] : [];
    let profiles = [];
    if (profileIds.length) {
      const placeholders = profileIds.map(() => "?").join(", ");
      const result = await env2.DB.prepare(`
        SELECT id, full_name, account_status
        FROM staff_profile
        WHERE id IN (${placeholders})
      `).bind(...profileIds).all();
      profiles = result.results ?? [];
    }
    const profileById = new Map(profiles.map((profile3) => [String(profile3.id), profile3]));
    const areas = accessibleAreas.map((area) => {
      const areaCoverage = coverage.filter((item) => item.service_area_id === area.id);
      return {
        ...area,
        is_active: Boolean(area.is_active),
        coverage_count: areaCoverage.length,
        coverage: includeStaffNames ? areaCoverage.map((item) => ({
          ...item,
          staff: profileById.get(String(item.staff_profile_id)) ?? null
        })) : []
      };
    });
    return json(200, { ok: true, data: { areas } }, requestId, origin);
  } catch {
    return json(500, {
      ok: false,
      error: { code: resource === "teams" ? "TEAM_LIST_FAILED" : "SERVICE_AREA_LIST_FAILED" }
    }, requestId, origin);
  }
}
__name(listTeamOperationsCollection, "listTeamOperationsCollection");
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
__name(isPlainObject, "isPlainObject");
function isUuidValue(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
__name(isUuidValue, "isUuidValue");
function parseTeamAreaName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 2 && normalized.length <= 160 ? normalized : null;
}
__name(parseTeamAreaName, "parseTeamAreaName");
function parseTeamDescription(value) {
  if (value === void 0 || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 1e3) return void 0;
  return value.trim() || null;
}
__name(parseTeamDescription, "parseTeamDescription");
function parseAreaCode(value) {
  if (value === void 0 || value === null || value === "") return null;
  if (typeof value !== "string") return void 0;
  const normalized = value.trim().toUpperCase();
  if (normalized.length < 2 || normalized.length > 24 || !/^[A-Z0-9_-]+$/.test(normalized)) return void 0;
  return normalized;
}
__name(parseAreaCode, "parseAreaCode");
async function handleTeamMembershipOrCoverageMutation(request, env2, requestId, origin) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean).slice(2);
  const resource = segments[0] ?? "";
  const isTeam = resource === "teams";
  const isArea = resource === "areas";
  const teamMemberCreate = isTeam && segments.length === 3 && segments[2] === "members" && request.method === "POST";
  const teamMemberRoleUpdate = isTeam && segments.length === 4 && segments[2] === "members" && request.method === "PATCH";
  const teamMemberRevoke = isTeam && segments.length === 5 && segments[2] === "members" && segments[4] === "revoke" && request.method === "POST";
  const areaCoverageCreate = isArea && segments.length === 3 && segments[2] === "coverage" && request.method === "POST";
  const areaCoverageRevoke = isArea && segments.length === 5 && segments[2] === "coverage" && segments[4] === "revoke" && request.method === "POST";
  if (!(teamMemberCreate || teamMemberRoleUpdate || teamMemberRevoke || areaCoverageCreate || areaCoverageRevoke)) {
    return json(404, { ok: false, error: { code: "ROUTE_NOT_FOUND" } }, requestId, origin);
  }
  const parentId = segments[1] ?? "";
  const childId = teamMemberRoleUpdate || teamMemberRevoke || areaCoverageRevoke ? segments[3] ?? "" : "";
  if (!isUuidValue(parentId) || childId && !isUuidValue(childId)) {
    return json(400, { ok: false, error: { code: "INVALID_RESOURCE_ID" } }, requestId, origin);
  }
  const branchIds = url.searchParams.getAll("branch_id");
  const branchId = branchIds[0] ?? "";
  if (branchIds.length !== 1 || !isUuidValue(branchId)) {
    return json(400, { ok: false, error: { code: "INVALID_QUERY" } }, requestId, origin);
  }
  let body = {};
  if (!teamMemberRevoke && !areaCoverageRevoke) {
    const bodyResult = await readJsonBody(request);
    if (!bodyResult.ok) {
      return json(bodyResult.status, { ok: false, error: { code: bodyResult.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
    }
    if (!isPlainObject(bodyResult.value)) {
      return json(422, { ok: false, error: { code: "VALIDATION_ERROR" } }, requestId, origin);
    }
    body = bodyResult.value;
    const allowed = teamMemberCreate ? ["staff_profile_id", "membership_role"] : teamMemberRoleUpdate ? ["membership_role"] : ["staff_profile_id"];
    if (Object.keys(body).length === 0 || Object.keys(body).some((key) => !allowed.includes(key))) {
      return json(422, { ok: false, error: { code: "VALIDATION_ERROR" } }, requestId, origin);
    }
  }
  const capability = isTeam ? "team.manage" : "area.manage";
  const access = await authorizeRequestCapability(request, env2, capability);
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  if (access.activeBranch.branchId !== branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_SCOPE_MISMATCH" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const actorProfileId = access.staff.profileId;
  const staffProfileId = body.staff_profile_id;
  const membershipRole = body.membership_role ?? "member";
  if ((teamMemberCreate || areaCoverageCreate) && !isUuidValue(staffProfileId)) {
    return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "A valid staff profile is required." } }, requestId, origin);
  }
  if ((teamMemberCreate || teamMemberRoleUpdate) && membershipRole !== "member" && membershipRole !== "leader") {
    return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "membership_role must be member or leader." } }, requestId, origin);
  }
  try {
    if (isTeam) {
      const parent = await env2.DB.prepare("SELECT id FROM team WHERE id = ? AND branch_id = ? LIMIT 1").bind(parentId, branchId).first();
      if (!parent) return json(404, { ok: false, error: { code: "TEAM_NOT_FOUND" } }, requestId, origin);
    } else {
      const parent = await env2.DB.prepare("SELECT id FROM service_area WHERE id = ? AND branch_id = ? LIMIT 1").bind(parentId, branchId).first();
      if (!parent) return json(404, { ok: false, error: { code: "SERVICE_AREA_NOT_FOUND" } }, requestId, origin);
    }
    if (teamMemberCreate || areaCoverageCreate) {
      const staff = await env2.DB.prepare(`
        SELECT sp.id
        FROM staff_profile sp
        WHERE sp.id = ?
          AND sp.account_status = 'active'
          AND sp.deactivated_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM staff_role_assignment assignment
            WHERE assignment.staff_profile_id = sp.id
              AND assignment.branch_id = ?
              AND assignment.revoked_at IS NULL
              AND assignment.starts_at <= ?
              AND (assignment.ends_at IS NULL OR assignment.ends_at > ?)
          )
        LIMIT 1
      `).bind(staffProfileId, branchId, now, now).first();
      if (!staff) return json(422, { ok: false, error: { code: "STAFF_NOT_ACTIVE_IN_BRANCH" } }, requestId, origin);
    }
    if (teamMemberCreate) {
      const duplicate = await env2.DB.prepare(`
        SELECT id FROM staff_team_membership
        WHERE team_id = ? AND branch_id = ? AND staff_profile_id = ?
          AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > ?)
        LIMIT 1
      `).bind(parentId, branchId, staffProfileId, now).first();
      if (duplicate) return json(409, { ok: false, error: { code: "TEAM_MEMBER_ALREADY_ACTIVE" } }, requestId, origin);
      const id = crypto.randomUUID();
      const auditId2 = crypto.randomUUID();
      const results2 = await env2.DB.batch([
        env2.DB.prepare(`
          INSERT INTO staff_team_membership (id, staff_profile_id, team_id, branch_id, membership_role, starts_at, ends_at, revoked_at, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
        `).bind(id, staffProfileId, parentId, branchId, membershipRole, now, actorProfileId, now),
        env2.DB.prepare(`
          INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
          VALUES (?, ?, ?, 'team_membership', ?, 'team.member.added', ?, ?)
        `).bind(auditId2, branchId, actorProfileId, id, JSON.stringify({ team_id: parentId, staff_profile_id: staffProfileId, membership_role: membershipRole }), now)
      ]);
      if (results2.some((result) => !result.success)) throw new Error("TEAM_MEMBER_CREATE_FAILED");
      return json(201, { ok: true, data: { id, team_id: parentId, staff_profile_id: staffProfileId, membership_role: membershipRole, starts_at: now, ends_at: null, created_at: now } }, requestId, origin);
    }
    if (teamMemberRoleUpdate) {
      const current2 = await env2.DB.prepare(`
        SELECT id FROM staff_team_membership
        WHERE id = ? AND team_id = ? AND branch_id = ? AND revoked_at IS NULL
        LIMIT 1
      `).bind(childId, parentId, branchId).first();
      if (!current2) return json(404, { ok: false, error: { code: "TEAM_MEMBERSHIP_NOT_FOUND" } }, requestId, origin);
      const auditId2 = crypto.randomUUID();
      const results2 = await env2.DB.batch([
        env2.DB.prepare("UPDATE staff_team_membership SET membership_role = ? WHERE id = ? AND team_id = ? AND branch_id = ? AND revoked_at IS NULL").bind(membershipRole, childId, parentId, branchId),
        env2.DB.prepare(`
          INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
          VALUES (?, ?, ?, 'team_membership', ?, 'team.member.role_changed', ?, ?)
        `).bind(auditId2, branchId, actorProfileId, childId, JSON.stringify({ team_id: parentId, membership_role: membershipRole }), now)
      ]);
      if (results2.some((result) => !result.success)) throw new Error("TEAM_MEMBER_UPDATE_FAILED");
      const updated2 = await env2.DB.prepare(`
        SELECT id, team_id, staff_profile_id, membership_role, starts_at, ends_at, created_at
        FROM staff_team_membership WHERE id = ? LIMIT 1
      `).bind(childId).first();
      return json(200, { ok: true, data: updated2 }, requestId, origin);
    }
    if (teamMemberRevoke) {
      const current2 = await env2.DB.prepare(`
        SELECT id FROM staff_team_membership
        WHERE id = ? AND team_id = ? AND branch_id = ? AND revoked_at IS NULL
        LIMIT 1
      `).bind(childId, parentId, branchId).first();
      if (!current2) return json(404, { ok: false, error: { code: "TEAM_MEMBERSHIP_NOT_FOUND" } }, requestId, origin);
      const auditId2 = crypto.randomUUID();
      const results2 = await env2.DB.batch([
        env2.DB.prepare("UPDATE staff_team_membership SET revoked_at = ? WHERE id = ? AND team_id = ? AND branch_id = ? AND revoked_at IS NULL").bind(now, childId, parentId, branchId),
        env2.DB.prepare(`
          INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
          VALUES (?, ?, ?, 'team_membership', ?, 'team.member.revoked', ?, ?)
        `).bind(auditId2, branchId, actorProfileId, childId, JSON.stringify({ team_id: parentId }), now)
      ]);
      if (results2.some((result) => !result.success)) throw new Error("TEAM_MEMBER_REVOKE_FAILED");
      const updated2 = await env2.DB.prepare(`
        SELECT id, team_id, staff_profile_id, membership_role, starts_at, ends_at, created_at
        FROM staff_team_membership WHERE id = ? LIMIT 1
      `).bind(childId).first();
      return json(200, { ok: true, data: updated2 }, requestId, origin);
    }
    if (areaCoverageCreate) {
      const duplicate = await env2.DB.prepare(`
        SELECT id FROM staff_area_coverage
        WHERE service_area_id = ? AND branch_id = ? AND staff_profile_id = ?
          AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > ?)
        LIMIT 1
      `).bind(parentId, branchId, staffProfileId, now).first();
      if (duplicate) return json(409, { ok: false, error: { code: "AREA_COVERAGE_ALREADY_ACTIVE" } }, requestId, origin);
      const id = crypto.randomUUID();
      const auditId2 = crypto.randomUUID();
      const results2 = await env2.DB.batch([
        env2.DB.prepare(`
          INSERT INTO staff_area_coverage (id, staff_profile_id, service_area_id, branch_id, starts_at, ends_at, created_by, created_at, revoked_at, revoked_by)
          VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL)
        `).bind(id, staffProfileId, parentId, branchId, now, actorProfileId, now),
        env2.DB.prepare(`
          INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
          VALUES (?, ?, ?, 'area_coverage', ?, 'area.coverage.added', ?, ?)
        `).bind(auditId2, branchId, actorProfileId, id, JSON.stringify({ service_area_id: parentId, staff_profile_id: staffProfileId }), now)
      ]);
      if (results2.some((result) => !result.success)) throw new Error("AREA_COVERAGE_CREATE_FAILED");
      return json(201, { ok: true, data: { id, service_area_id: parentId, staff_profile_id: staffProfileId, starts_at: now, ends_at: null, created_at: now } }, requestId, origin);
    }
    const current = await env2.DB.prepare(`
      SELECT id FROM staff_area_coverage
      WHERE id = ? AND service_area_id = ? AND branch_id = ? AND revoked_at IS NULL
      LIMIT 1
    `).bind(childId, parentId, branchId).first();
    if (!current) return json(404, { ok: false, error: { code: "AREA_COVERAGE_NOT_FOUND" } }, requestId, origin);
    const auditId = crypto.randomUUID();
    const results = await env2.DB.batch([
      env2.DB.prepare("UPDATE staff_area_coverage SET revoked_at = ?, revoked_by = ? WHERE id = ? AND service_area_id = ? AND branch_id = ? AND revoked_at IS NULL").bind(now, actorProfileId, childId, parentId, branchId),
      env2.DB.prepare(`
        INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
        VALUES (?, ?, ?, 'area_coverage', ?, 'area.coverage.revoked', ?, ?)
      `).bind(auditId, branchId, actorProfileId, childId, JSON.stringify({ service_area_id: parentId }), now)
    ]);
    if (results.some((result) => !result.success)) throw new Error("AREA_COVERAGE_REVOKE_FAILED");
    const updated = await env2.DB.prepare(`
      SELECT id, service_area_id, staff_profile_id, starts_at, ends_at, created_at
      FROM staff_area_coverage WHERE id = ? LIMIT 1
    `).bind(childId).first();
    return json(200, { ok: true, data: updated }, requestId, origin);
  } catch (error3) {
    const message = error3 instanceof Error ? error3.message : "";
    const conflict = message.includes("UNIQUE") || message.includes("constraint");
    return json(conflict ? 409 : 500, {
      ok: false,
      error: { code: conflict ? "TEAM_OR_AREA_ASSIGNMENT_CONFLICT" : "TEAM_OR_AREA_ASSIGNMENT_FAILED" }
    }, requestId, origin);
  }
}
__name(handleTeamMembershipOrCoverageMutation, "handleTeamMembershipOrCoverageMutation");
async function handleTeamOperationsMutation(request, env2, requestId, origin) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean).slice(2);
  const resource = segments[0] ?? "";
  const isTeam = resource === "teams";
  const isArea = resource === "areas";
  const isCreate = segments.length === 1 && request.method === "POST";
  const isUpdate = segments.length === 2 && request.method === "PATCH";
  if (!isTeam && !isArea || !isCreate && !isUpdate) {
    return json(404, { ok: false, error: { code: "ROUTE_NOT_FOUND" } }, requestId, origin);
  }
  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return json(bodyResult.status, { ok: false, error: { code: bodyResult.status === 413 ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  }
  if (!isPlainObject(bodyResult.value)) {
    return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "A JSON object is required." } }, requestId, origin);
  }
  const body = bodyResult.value;
  const allowedKeys = isTeam ? isCreate ? ["branch_id", "name", "description"] : ["name", "description", "is_active"] : isCreate ? ["branch_id", "name", "code"] : ["name", "code", "is_active"];
  if (Object.keys(body).length === 0 || Object.keys(body).some((key) => !allowedKeys.includes(key))) {
    return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "The request contains missing or unsupported fields." } }, requestId, origin);
  }
  const queryBranchIds = url.searchParams.getAll("branch_id");
  const branchId = isCreate ? body.branch_id : queryBranchIds[0];
  if (!isUuidValue(branchId) || isCreate && (url.search || Object.hasOwn(body, "branch_id") === false) || isUpdate && queryBranchIds.length !== 1) {
    return json(400, { ok: false, error: { code: "INVALID_QUERY" } }, requestId, origin);
  }
  const capability = isTeam ? "team.manage" : "area.manage";
  const access = await authorizeRequestCapability(request, env2, capability);
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  if (access.activeBranch.branchId !== branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_SCOPE_MISMATCH" } }, requestId, origin);
  }
  const name = Object.hasOwn(body, "name") ? parseTeamAreaName(body.name) : void 0;
  if (Object.hasOwn(body, "name") && name === null) {
    return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Name must contain 2 to 160 characters." } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const actorProfileId = access.staff.profileId;
  const recordId = isCreate ? crypto.randomUUID() : segments[1];
  if (!isUuidValue(recordId)) {
    return json(400, { ok: false, error: { code: "INVALID_RESOURCE_ID" } }, requestId, origin);
  }
  try {
    if (isCreate) {
      if (isTeam) {
        const description = parseTeamDescription(body.description);
        if (description === void 0 || name === void 0) {
          return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid team name or description." } }, requestId, origin);
        }
        const auditId3 = crypto.randomUUID();
        const results3 = await env2.DB.batch([
          env2.DB.prepare(`
            INSERT INTO team (id, branch_id, name, description, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, ?, ?)
          `).bind(recordId, branchId, name, description, now, now),
          env2.DB.prepare(`
            INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
            VALUES (?, ?, ?, 'team', ?, 'team.created', ?, ?)
          `).bind(auditId3, branchId, actorProfileId, recordId, JSON.stringify({ name }), now)
        ]);
        if (results3.some((result) => !result.success)) throw new Error("TEAM_CREATE_FAILED");
        return json(201, { ok: true, data: { id: recordId, branch_id: branchId, name, description, is_active: true, created_at: now, updated_at: now } }, requestId, origin);
      }
      const code = parseAreaCode(body.code);
      if (code === void 0 || name === void 0) {
        return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid service-area name or code." } }, requestId, origin);
      }
      const auditId2 = crypto.randomUUID();
      const results2 = await env2.DB.batch([
        env2.DB.prepare(`
          INSERT INTO service_area (id, branch_id, name, code, is_active, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?)
        `).bind(recordId, branchId, name, code, now, now),
        env2.DB.prepare(`
          INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
          VALUES (?, ?, ?, 'service_area', ?, 'service_area.created', ?, ?)
        `).bind(auditId2, branchId, actorProfileId, recordId, JSON.stringify({ name, code }), now)
      ]);
      if (results2.some((result) => !result.success)) throw new Error("AREA_CREATE_FAILED");
      return json(201, { ok: true, data: { id: recordId, branch_id: branchId, name, code, is_active: true, created_at: now, updated_at: now } }, requestId, origin);
    }
    const table3 = isTeam ? "team" : "service_area";
    const current = await env2.DB.prepare(`SELECT id FROM ${table3} WHERE id = ? AND branch_id = ? LIMIT 1`).bind(recordId, branchId).first();
    if (!current) return json(404, { ok: false, error: { code: isTeam ? "TEAM_NOT_FOUND" : "SERVICE_AREA_NOT_FOUND" } }, requestId, origin);
    const updates = [];
    if (Object.hasOwn(body, "name")) {
      if (name === void 0 || name === null) return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid name." } }, requestId, origin);
      updates.push({ column: "name", value: name });
    }
    if (isTeam && Object.hasOwn(body, "description")) {
      const description = parseTeamDescription(body.description);
      if (description === void 0) return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid description." } }, requestId, origin);
      updates.push({ column: "description", value: description });
    }
    if (isArea && Object.hasOwn(body, "code")) {
      const code = parseAreaCode(body.code);
      if (code === void 0) return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid service-area code." } }, requestId, origin);
      updates.push({ column: "code", value: code });
    }
    if (Object.hasOwn(body, "is_active")) {
      if (typeof body.is_active !== "boolean") return json(422, { ok: false, error: { code: "VALIDATION_ERROR", message: "is_active must be a boolean." } }, requestId, origin);
      updates.push({ column: "is_active", value: body.is_active ? 1 : 0 });
    }
    if (updates.length === 0) return json(422, { ok: false, error: { code: "VALIDATION_ERROR" } }, requestId, origin);
    const setClause = updates.map((item) => `${item.column} = ?`).join(", ");
    const values = updates.map((item) => item.value);
    const auditId = crypto.randomUUID();
    const targetType = isTeam ? "team" : "service_area";
    const action = isTeam ? "team.updated" : "service_area.updated";
    const auditMetadata = JSON.stringify({ changed_fields: updates.map((item) => item.column) });
    const results = await env2.DB.batch([
      env2.DB.prepare(`UPDATE ${table3} SET ${setClause}, updated_at = ? WHERE id = ? AND branch_id = ?`).bind(...values, now, recordId, branchId),
      env2.DB.prepare(`
        INSERT INTO team_management_audit (id, branch_id, actor_profile_id, target_type, target_id, action, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(auditId, branchId, actorProfileId, targetType, recordId, action, auditMetadata, now)
    ]);
    if (results.some((result) => !result.success)) throw new Error(isTeam ? "TEAM_UPDATE_FAILED" : "AREA_UPDATE_FAILED");
    const updated = await env2.DB.prepare(`SELECT id, branch_id, name, ${isTeam ? "description" : "code"}, is_active, created_at, updated_at FROM ${table3} WHERE id = ? AND branch_id = ? LIMIT 1`).bind(recordId, branchId).first();
    if (!updated) return json(404, { ok: false, error: { code: isTeam ? "TEAM_NOT_FOUND" : "SERVICE_AREA_NOT_FOUND" } }, requestId, origin);
    return json(200, { ok: true, data: { ...updated, is_active: Boolean(updated.is_active) } }, requestId, origin);
  } catch (error3) {
    const message = error3 instanceof Error ? error3.message : "";
    const conflict = message.includes("UNIQUE") || message.includes("constraint");
    return json(conflict ? 409 : 500, {
      ok: false,
      error: { code: conflict ? isTeam ? "TEAM_CONFLICT" : "SERVICE_AREA_CODE_EXISTS" : "TEAM_AREA_OPERATION_FAILED" }
    }, requestId, origin);
  }
}
__name(handleTeamOperationsMutation, "handleTeamOperationsMutation");
var REPORT_FIELDS = [
  "contacts_captured",
  "gospel_presentations",
  "decisions_for_christ",
  "followup_required",
  "followup_completed",
  "visits_completed",
  "calls_completed",
  "events_supported",
  "attendance_count"
];
var REPORT_COLUMNS = "id,branch_id,report_type,period_start,period_end,author_profile_id,team_id,event_id,contacts_captured,gospel_presentations,decisions_for_christ,followup_required,followup_completed,visits_completed,calls_completed,events_supported,attendance_count,status,submitted_at,created_at,updated_at";
function reportInput(value, correction = false) {
  if (!isPlainObject(value)) return null;
  const allowed = /* @__PURE__ */ new Set([
    ...correction ? [] : ["branch_id", "report_type", "period_start", "period_end", "team_id", "event_id"],
    ...REPORT_FIELDS
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) return null;
  const output = {};
  for (const key of REPORT_FIELDS) {
    const raw = value[key];
    if (raw === void 0 && correction) continue;
    const number = raw === void 0 ? 0 : raw;
    if (!Number.isSafeInteger(number) || number < 0 || number > 1e5) return null;
    output[key] = number;
  }
  if (output.decisions_for_christ > output.gospel_presentations || output.followup_completed > output.followup_required) return null;
  if (!correction) {
    if (!isUuidValue(value.branch_id) || !["daily_evangelism", "event_evangelism", "weekly_ministry"].includes(String(value.report_type)) || typeof value.period_start !== "string" || typeof value.period_end !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(value.period_end) || value.period_end < value.period_start) return null;
    const start = Date.parse(value.period_start + "T00:00:00Z");
    const end = Date.parse(value.period_end + "T00:00:00Z");
    if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0, 10) !== value.period_start || new Date(end).toISOString().slice(0, 10) !== value.period_end) return null;
    if (value.report_type === "weekly_ministry" && end - start !== 6 * 864e5) return null;
    if (value.report_type !== "weekly_ministry" && value.period_start !== value.period_end) return null;
    if (value.report_type === "event_evangelism" ? !isUuidValue(value.event_id) : value.event_id != null) return null;
    if (value.team_id != null && !isUuidValue(value.team_id)) return null;
    output.branch_id = value.branch_id;
    output.report_type = value.report_type;
    output.period_start = value.period_start;
    output.period_end = value.period_end;
    output.team_id = value.team_id ?? null;
    output.event_id = value.event_id ?? null;
  }
  if (correction && Object.keys(output).length === 0) return null;
  return output;
}
__name(reportInput, "reportInput");
async function reportTeamIds(env2, profileId, branchId, now) {
  const rows = await env2.DB.prepare(`
    SELECT stm.team_id
    FROM staff_team_membership stm
    JOIN team t ON t.id=stm.team_id AND t.branch_id=stm.branch_id AND t.is_active=1
    WHERE stm.staff_profile_id=? AND stm.branch_id=? AND stm.revoked_at IS NULL
      AND stm.starts_at<=? AND (stm.ends_at IS NULL OR stm.ends_at>?)
  `).bind(profileId, branchId, now, now).all();
  return [...new Set((rows.results ?? []).map((row) => row.team_id))];
}
__name(reportTeamIds, "reportTeamIds");
function reportForbidden(access, requestId, origin) {
  return mapCapabilityFailure(access.state, requestId, origin);
}
__name(reportForbidden, "reportForbidden");
var ANNOUNCEMENT_DRAFT_COLUMNS = "id,branch_id,title,body,is_public,status,created_at,updated_at";
function parseAnnouncementDraft(value, patch = false) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  const payload = value;
  const allowed = patch ? /* @__PURE__ */ new Set(["title", "body"]) : /* @__PURE__ */ new Set(["branch_id", "title", "body"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) return { ok: false };
  const result = {};
  if (!patch) {
    if (typeof payload.branch_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.branch_id)) return { ok: false };
    result.branch_id = payload.branch_id;
  }
  if (!patch || "title" in payload) {
    if (typeof payload.title !== "string" || payload.title.trim().length < 2 || payload.title.trim().length > 180) return { ok: false };
    result.title = payload.title.trim();
  }
  if (!patch || "body" in payload) {
    if (typeof payload.body !== "string" || payload.body.trim().length < 1 || payload.body.trim().length > 2e4) return { ok: false };
    result.body = payload.body.trim();
  }
  if (patch && Object.keys(result).length === 0) return { ok: false };
  return { ok: true, value: result };
}
__name(parseAnnouncementDraft, "parseAnnouncementDraft");
async function handleAnnouncementCollection(request, env2, requestId, origin) {
  const method = request.method.toUpperCase();
  const capability = method === "GET" ? "announcement.read.scoped" : "announcement.create.scoped";
  const access = await authorizeRequestCapability(request, env2, capability);
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const url = new URL(request.url);
  if (method === "GET") {
    const keys = [...url.searchParams.keys()];
    const branchIds = url.searchParams.getAll("branch_id");
    const limits = url.searchParams.getAll("limit");
    const offsets = url.searchParams.getAll("offset");
    const branchId = branchIds[0];
    const limit = limits.length ? Number(limits[0]) : 50;
    const offset = offsets.length ? Number(offsets[0]) : 0;
    if (keys.some((key) => !["branch_id", "limit", "offset"].includes(key)) || branchIds.length !== 1 || limits.length > 1 || offsets.length > 1 || branchId !== access.activeBranch.branchId || !Number.isInteger(limit) || limit < 1 || limit > 50 || !Number.isInteger(offset) || offset < 0 || offset > 5e3) {
      return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_QUERY" } }, requestId, origin);
    }
    const rows = await env2.DB.prepare(`
      SELECT ${ANNOUNCEMENT_DRAFT_COLUMNS}
      FROM announcement
      WHERE branch_id=? AND status='draft'
      ORDER BY updated_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).bind(branchId, limit, offset).all();
    return json(200, { ok: true, data: (rows.results ?? []).map((row) => ({ ...row, is_public: false })) }, requestId, origin);
  }
  const body = await readJsonBody(request, 24e3);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const parsed = parseAnnouncementDraft(body.value);
  if (!parsed.ok) return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT" } }, requestId, origin);
  if (parsed.value.branch_id !== access.activeBranch.branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = crypto.randomUUID();
  try {
    const result = await env2.DB.prepare(`
      INSERT INTO announcement
        (id,branch_id,title,body,audience_type,is_public,status,publish_at,published_at,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,'branch',0,'draft',NULL,NULL,?,?,?,?)
    `).bind(
      id,
      access.activeBranch.branchId,
      parsed.value.title,
      parsed.value.body,
      access.staff.userId,
      access.staff.userId,
      now,
      now
    ).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) {
      return json(500, { ok: false, error: { code: "ANNOUNCEMENT_CREATE_FAILED" } }, requestId, origin);
    }
    const row = await env2.DB.prepare(`SELECT ${ANNOUNCEMENT_DRAFT_COLUMNS} FROM announcement WHERE id=? AND branch_id=?`).bind(id, access.activeBranch.branchId).first();
    if (!row) return json(500, { ok: false, error: { code: "ANNOUNCEMENT_CREATE_FAILED" } }, requestId, origin);
    return json(201, { ok: true, data: { ...row, is_public: false } }, requestId, origin);
  } catch {
    return json(500, { ok: false, error: { code: "ANNOUNCEMENT_CREATE_FAILED" } }, requestId, origin);
  }
}
__name(handleAnnouncementCollection, "handleAnnouncementCollection");
async function handleAnnouncementItem(request, env2, announcementId, requestId, origin) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "PATCH") return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, requestId, origin);
  const capability = method === "GET" ? "announcement.read.scoped" : "announcement.create.scoped";
  const access = await authorizeRequestCapability(request, env2, capability);
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const url = new URL(request.url);
  const branchIds = url.searchParams.getAll("branch_id");
  const branchId = branchIds[0];
  if (branchIds.length !== 1 || [...url.searchParams.keys()].some((key) => key !== "branch_id") || branchId !== access.activeBranch.branchId) {
    return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_QUERY" } }, requestId, origin);
  }
  const current = await env2.DB.prepare(`
    SELECT id,branch_id,title,body,is_public,status,created_by,created_at,updated_at
    FROM announcement
    WHERE id=? AND branch_id=? AND status='draft'
  `).bind(announcementId, branchId).first();
  if (!current) return json(404, { ok: false, error: { code: "ANNOUNCEMENT_NOT_FOUND" } }, requestId, origin);
  if (method === "GET") {
    const { created_by: _createdBy, ...visible } = current;
    return json(200, { ok: true, data: { ...visible, is_public: false } }, requestId, origin);
  }
  if (current.created_by !== access.staff.userId) {
    return json(404, { ok: false, error: { code: "ANNOUNCEMENT_NOT_FOUND" } }, requestId, origin);
  }
  const body = await readJsonBody(request, 24e3);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const parsed = parseAnnouncementDraft(body.value, true);
  if (!parsed.ok) return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT" } }, requestId, origin);
  const nextTitle = parsed.value.title ?? current.title;
  const nextBody = parsed.value.body ?? current.body;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const result = await env2.DB.prepare(`
    UPDATE announcement
    SET title=?, body=?, updated_by=?, updated_at=?
    WHERE id=? AND branch_id=? AND created_by=? AND status='draft' AND updated_at=?
  `).bind(
    nextTitle,
    nextBody,
    access.staff.userId,
    now,
    announcementId,
    branchId,
    access.staff.userId,
    current.updated_at
  ).run();
  if (!result.success) return json(500, { ok: false, error: { code: "ANNOUNCEMENT_UPDATE_FAILED" } }, requestId, origin);
  if ((result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "ANNOUNCEMENT_NOT_EDITABLE" } }, requestId, origin);
  const updated = await env2.DB.prepare(`SELECT ${ANNOUNCEMENT_DRAFT_COLUMNS} FROM announcement WHERE id=? AND branch_id=?`).bind(announcementId, branchId).first();
  if (!updated) return json(404, { ok: false, error: { code: "ANNOUNCEMENT_NOT_FOUND" } }, requestId, origin);
  return json(200, { ok: true, data: { ...updated, is_public: false } }, requestId, origin);
}
__name(handleAnnouncementItem, "handleAnnouncementItem");
var CALENDAR_ENTRY_COLUMNS = "id,branch_id,entry_type,title,starts_at,ends_at,scope_type,created_by,created_at,updated_at";
function parseCalendarTimestamp(value) {
  if (typeof value !== "string" || value.length > 50 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
__name(parseCalendarTimestamp, "parseCalendarTimestamp");
function parseCalendarEntryFields(value, current) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  const payload = value;
  const allowed = new Set(current ? ["entry_type", "title", "starts_at", "ends_at"] : ["branch_id", "entry_type", "title", "starts_at", "ends_at"]);
  if (Object.keys(payload).some((key) => !allowed.has(key))) return { ok: false };
  const result = {};
  if (!current || "entry_type" in payload) {
    if (!["service", "event", "other"].includes(String(payload.entry_type))) return { ok: false };
    result.entry_type = payload.entry_type;
  }
  if (!current || "title" in payload) {
    if (typeof payload.title !== "string") return { ok: false };
    const title2 = payload.title.trim();
    if (title2.length < 2 || title2.length > 180) return { ok: false };
    result.title = title2;
  }
  let startsAt = current?.starts_at ?? "";
  let endsAt = current?.ends_at ?? null;
  if (!current || "starts_at" in payload) {
    const parsed = parseCalendarTimestamp(payload.starts_at);
    if (!parsed) return { ok: false };
    startsAt = parsed;
    result.starts_at = parsed;
  }
  if (!current || "ends_at" in payload) {
    if (payload.ends_at === null || !current && payload.ends_at === void 0) {
      endsAt = null;
      result.ends_at = null;
    } else {
      const parsed = parseCalendarTimestamp(payload.ends_at);
      if (!parsed) return { ok: false };
      endsAt = parsed;
      result.ends_at = parsed;
    }
  }
  if (endsAt !== null && Date.parse(endsAt) <= Date.parse(startsAt)) return { ok: false };
  if (current && Object.keys(result).length === 0) return { ok: false };
  return { ok: true, value: result };
}
__name(parseCalendarEntryFields, "parseCalendarEntryFields");
async function handleCalendarCollection(request, env2, requestId, origin) {
  const method = request.method.toUpperCase();
  const access = await authorizeRequestCapability(
    request,
    env2,
    method === "GET" ? "calendar.read.scoped" : "calendar.manage.scoped"
  );
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const url = new URL(request.url);
  if (method === "GET") {
    const allowed = /* @__PURE__ */ new Set(["branch_id", "limit", "offset"]);
    const keys = [...url.searchParams.keys()];
    const branchIds = url.searchParams.getAll("branch_id");
    const limitValues = url.searchParams.getAll("limit");
    const offsetValues = url.searchParams.getAll("offset");
    const branchId = branchIds[0];
    const limit = limitValues.length ? Number(limitValues[0]) : 50;
    const offset = offsetValues.length ? Number(offsetValues[0]) : 0;
    if (keys.some((key) => !allowed.has(key)) || branchIds.length !== 1 || limitValues.length > 1 || offsetValues.length > 1 || !branchId || branchId !== access.activeBranch.branchId || !Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1e4) {
      return json(400, { ok: false, error: { code: "INVALID_CALENDAR_QUERY" } }, requestId, origin);
    }
    const rows = await env2.DB.prepare(`
      SELECT ${CALENDAR_ENTRY_COLUMNS}
      FROM calendar_entry
      WHERE branch_id = ? AND scope_type = 'branch'
      ORDER BY starts_at ASC, id ASC
      LIMIT ? OFFSET ?
    `).bind(branchId, limit, offset).all();
    return json(200, { ok: true, data: rows.results ?? [] }, requestId, origin);
  }
  const body = await readJsonBody(request, 8192);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const payload = body.value;
  if (typeof payload?.branch_id !== "string" || payload.branch_id !== access.activeBranch.branchId) {
    return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
  }
  const parsed = parseCalendarEntryFields(body.value);
  if (!parsed.ok) return json(400, { ok: false, error: { code: "INVALID_CALENDAR_ENTRY" } }, requestId, origin);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const id = crypto.randomUUID();
  try {
    await env2.DB.prepare(`
      INSERT INTO calendar_entry
        (id,branch_id,entry_type,title,starts_at,ends_at,scope_type,team_id,event_id,owner_user_id,created_by,updated_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'branch',NULL,NULL,NULL,?,?,?,?)
    `).bind(
      id,
      access.activeBranch.branchId,
      parsed.value.entry_type,
      parsed.value.title,
      parsed.value.starts_at,
      parsed.value.ends_at ?? null,
      access.staff.userId,
      access.staff.userId,
      now,
      now
    ).run();
    const row = await env2.DB.prepare(`SELECT ${CALENDAR_ENTRY_COLUMNS} FROM calendar_entry WHERE id=? AND branch_id=?`).bind(id, access.activeBranch.branchId).first();
    if (!row) return json(500, { ok: false, error: { code: "CALENDAR_CREATE_FAILED" } }, requestId, origin);
    return json(201, { ok: true, data: row }, requestId, origin);
  } catch {
    return json(500, { ok: false, error: { code: "CALENDAR_CREATE_FAILED" } }, requestId, origin);
  }
}
__name(handleCalendarCollection, "handleCalendarCollection");
async function handleCalendarEntry(request, env2, entryId, requestId, origin) {
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "PATCH") return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, requestId, origin);
  const access = await authorizeRequestCapability(
    request,
    env2,
    method === "GET" ? "calendar.read.scoped" : "calendar.manage.scoped"
  );
  if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId, origin);
  const url = new URL(request.url);
  const branchIds = url.searchParams.getAll("branch_id");
  const branchId = branchIds[0];
  if (branchIds.length !== 1 || [...url.searchParams.keys()].some((key) => key !== "branch_id") || branchId !== access.activeBranch.branchId) {
    return json(400, { ok: false, error: { code: "INVALID_CALENDAR_QUERY" } }, requestId, origin);
  }
  const current = await env2.DB.prepare(`
    SELECT ${CALENDAR_ENTRY_COLUMNS}
    FROM calendar_entry
    WHERE id=? AND branch_id=? AND scope_type='branch'
  `).bind(entryId, branchId).first();
  if (!current) return json(404, { ok: false, error: { code: "CALENDAR_ENTRY_NOT_FOUND" } }, requestId, origin);
  if (method === "GET") return json(200, { ok: true, data: current }, requestId, origin);
  const body = await readJsonBody(request, 8192);
  if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId, origin);
  const parsed = parseCalendarEntryFields(body.value, current);
  if (!parsed.ok) return json(400, { ok: false, error: { code: "INVALID_CALENDAR_ENTRY" } }, requestId, origin);
  const next = { ...current, ...parsed.value };
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const result = await env2.DB.prepare(`
    UPDATE calendar_entry
    SET entry_type=?, title=?, starts_at=?, ends_at=?, updated_by=?, updated_at=?
    WHERE id=? AND branch_id=? AND scope_type='branch' AND updated_at=?
  `).bind(
    next.entry_type,
    next.title,
    next.starts_at,
    next.ends_at,
    access.staff.userId,
    now,
    entryId,
    branchId,
    current.updated_at
  ).run();
  if (!result.success) return json(500, { ok: false, error: { code: "CALENDAR_UPDATE_FAILED" } }, requestId, origin);
  if ((result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "CALENDAR_CONFLICT" } }, requestId, origin);
  const updated = await env2.DB.prepare(`SELECT ${CALENDAR_ENTRY_COLUMNS} FROM calendar_entry WHERE id=? AND branch_id=?`).bind(entryId, branchId).first();
  if (!updated) return json(404, { ok: false, error: { code: "CALENDAR_ENTRY_NOT_FOUND" } }, requestId, origin);
  return json(200, { ok: true, data: updated }, requestId, origin);
}
__name(handleCalendarEntry, "handleCalendarEntry");
async function eventOperationContext(request, env2, branchId, eventId, requestId, origin) {
  const context2 = await resolveStaffContext(request, env2);
  if (context2.state !== "authenticated") return { response: mapCapabilityFailure(context2.state, requestId, origin) };
  if (!context2.activeBranch || context2.activeBranch.branchId !== branchId) return { response: json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin) };
  const event = await env2.DB.prepare("SELECT id,branch_id,title,starts_at,ends_at,status,visibility,registration_state,capacity FROM event WHERE id=? AND branch_id=?").bind(eventId, branchId).first();
  if (!event) return { response: json(404, { ok: false, error: { code: "EVENT_NOT_FOUND" } }, requestId, origin) };
  return { context: context2, event };
}
__name(eventOperationContext, "eventOperationContext");
function eventHasScopedGrant(context2, code, scopeMode) {
  return !!context2.activeBranch?.capabilities.some((grant) => grant.code === code && grant.scopeMode === scopeMode);
}
__name(eventHasScopedGrant, "eventHasScopedGrant");
async function eventAssignmentAllows(env2, context2, eventId, branchId, now, operation) {
  const branchGrant = context2.activeBranch?.capabilities.some(
    (c) => c.code === "events.manage" && c.scopeMode === "branch" || operation === "checkin" && c.code === "events.checkin" && c.scopeMode === "branch"
  );
  if (branchGrant) return true;
  const roles = operation === "register" ? ["owner", "organizer"] : ["owner", "organizer", "checkin"];
  const staffMarks = roles.map(() => "?").join(",");
  const staff = await env2.DB.prepare(`SELECT 1 AS allowed FROM event_staff_assignment
    WHERE event_id=? AND branch_id=? AND staff_auth_user_id=? AND assignment_role IN (${staffMarks})
      AND revoked_at IS NULL AND starts_at<=? AND (ends_at IS NULL OR ends_at>?) LIMIT 1`).bind(eventId, branchId, context2.staff.userId, ...roles, now, now).first();
  if (staff) return true;
  const teamRoles = operation === "register" ? ["organizer", "ushering"] : ["organizer", "ushering"];
  const teamMarks = teamRoles.map(() => "?").join(",");
  const team = await env2.DB.prepare(`SELECT 1 AS allowed FROM event_team_assignment eta
    JOIN staff_team_membership stm ON stm.team_id=eta.team_id AND stm.branch_id=eta.branch_id
    WHERE eta.event_id=? AND eta.branch_id=? AND stm.staff_profile_id=?
      AND eta.assignment_role IN (${teamMarks}) AND eta.revoked_at IS NULL AND stm.revoked_at IS NULL
      AND eta.starts_at<=? AND (eta.ends_at IS NULL OR eta.ends_at>?)
      AND stm.starts_at<=? AND (stm.ends_at IS NULL OR stm.ends_at>?) LIMIT 1`).bind(eventId, branchId, context2.staff.profileId, ...teamRoles, now, now, now, now).first();
  if (team) return true;
  return !!(operation === "checkin" && context2.activeBranch?.capabilities.some((c) => c.code === "events.checkin" && c.scopeMode === "assigned") && await env2.DB.prepare("SELECT 1 FROM event_staff_assignment WHERE event_id=? AND branch_id=? AND staff_auth_user_id=? AND revoked_at IS NULL AND starts_at<=? AND (ends_at IS NULL OR ends_at>?) LIMIT 1").bind(eventId, branchId, context2.staff.userId, now, now).first());
}
__name(eventAssignmentAllows, "eventAssignmentAllows");
async function eventDigest(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value, Object.keys(value).sort()));
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}
__name(eventDigest, "eventDigest");
function bytesEqual(a, b) {
  if (!(a instanceof Uint8Array) || a.byteLength !== b.byteLength) return false;
  return a.every((v, i) => v === b[i]);
}
__name(bytesEqual, "bytesEqual");
async function eventReceiptReplay(env2, eventId, operation, key, digest, requestId, origin) {
  const receipt = await env2.DB.prepare("SELECT resource_type,resource_id,response_status,request_digest FROM event_idempotency_receipt WHERE event_id=? AND operation=? AND idempotency_key=?").bind(eventId, operation, key).first();
  if (!receipt) return null;
  if (!bytesEqual(receipt.request_digest, digest)) return json(409, { ok: false, error: { code: "IDEMPOTENCY_KEY_REUSED" } }, requestId, origin);
  return receipt;
}
__name(eventReceiptReplay, "eventReceiptReplay");
async function eventFlyerStorageRequest(env2, key, method, body, contentType) {
  if (!env2.SUPABASE_URL || !env2.SUPABASE_SERVICE_ROLE_KEY) throw new Error("EVENT_MEDIA_STORAGE_NOT_CONFIGURED");
  const base = new URL(env2.SUPABASE_URL);
  if (base.protocol !== "https:") throw new Error("EVENT_MEDIA_STORAGE_URL_INVALID");
  const objectPath = key.split("/").map(encodeURIComponent).join("/");
  const url = new URL("/storage/v1/object/pcg-missions-event-media/" + objectPath, base);
  const headers = new Headers({
    apikey: env2.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: "Bearer " + env2.SUPABASE_SERVICE_ROLE_KEY
  });
  if (contentType) headers.set("Content-Type", contentType);
  return fetch(url.toString(), { method, headers, body });
}
__name(eventFlyerStorageRequest, "eventFlyerStorageRequest");
async function handleEventFlyer(request, env2, eventId, branchId, context2, requestId, origin) {
  const event = await env2.DB.prepare("SELECT id,branch_id,status,flyer_key,flyer_content_type,flyer_size FROM event WHERE id=? AND branch_id=? LIMIT 1").bind(eventId, branchId).first();
  if (!event) return json(404, { ok: false, error: { code: "EVENT_NOT_FOUND" } }, requestId, origin);
  if (request.method === "GET") {
    if (!eventHasScopedGrant(context2, "events.read", "branch") && !eventHasScopedGrant(context2, "events.manage", "branch"))
      return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    if (!event.flyer_key || !event.flyer_content_type) return json(404, { ok: false, error: { code: "EVENT_FLYER_NOT_FOUND" } }, requestId, origin);
    let signed2;
    try {
      signed2 = await eventFlyerStorageRequest(env2, event.flyer_key, "POST", JSON.stringify({ expiresIn: 900 }), "application/json");
    } catch {
      return json(503, { ok: false, error: { code: "EVENT_MEDIA_STORAGE_UNAVAILABLE" } }, requestId, origin);
    }
    if (!signed2.ok) return json(502, { ok: false, error: { code: "EVENT_FLYER_SIGNING_FAILED" } }, requestId, origin);
    const signedPayload2 = await signed2.json();
    if (typeof signedPayload2.signedURL !== "string" || !env2.SUPABASE_URL) return json(502, { ok: false, error: { code: "EVENT_FLYER_SIGNING_FAILED" } }, requestId, origin);
    const signedUrl2 = signedPayload2.signedURL.startsWith("http") ? signedPayload2.signedURL : new URL("/storage/v1" + (signedPayload2.signedURL.startsWith("/") ? signedPayload2.signedURL : "/" + signedPayload2.signedURL), env2.SUPABASE_URL).toString();
    return json(200, { ok: true, data: { object_path: event.flyer_key, mime_type: event.flyer_content_type, size_bytes: event.flyer_size ?? 0, signed_url: signedUrl2, signed_url_expires_in: 900 } }, requestId, origin);
  }
  if (request.method !== "POST") return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, requestId, origin);
  if (!eventHasScopedGrant(context2, "events.manage", "branch")) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  if (event.status !== "draft") return json(409, { ok: false, error: { code: "EVENT_NOT_EDITABLE" } }, requestId, origin);
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 5 * 1024 * 1024 + 65536) return json(413, { ok: false, error: { code: "EVENT_FLYER_TOO_LARGE" } }, requestId, origin);
  let form;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: { code: "INVALID_EVENT_FLYER_FORM" } }, requestId, origin);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json(400, { ok: false, error: { code: "EVENT_FLYER_REQUIRED" } }, requestId, origin);
  if (file.size < 16 || file.size > 5 * 1024 * 1024) return json(413, { ok: false, error: { code: "EVENT_FLYER_SIZE_INVALID" } }, requestId, origin);
  const bytes = await file.arrayBuffer(), v = new Uint8Array(bytes);
  const png = v.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => v[i] === n);
  const jpeg = v.length >= 3 && v[0] === 255 && v[1] === 216 && v[2] === 255;
  const webp = v.length >= 12 && String.fromCharCode(...v.slice(0, 4)) === "RIFF" && String.fromCharCode(...v.slice(8, 12)) === "WEBP";
  const type = png ? "image/png" : jpeg ? "image/jpeg" : webp ? "image/webp" : "";
  if (!type || file.type !== type) return json(415, { ok: false, error: { code: "UNSUPPORTED_EVENT_FLYER_TYPE" } }, requestId, origin);
  const ext = type === "image/png" ? "png" : type === "image/jpeg" ? "jpg" : "webp";
  const key = "events/" + branchId + "/" + eventId + "/" + crypto.randomUUID() + "." + ext;
  let stored;
  try {
    stored = await eventFlyerStorageRequest(env2, key, "PUT", bytes, type);
  } catch {
    return json(503, { ok: false, error: { code: "EVENT_MEDIA_STORAGE_UNAVAILABLE" } }, requestId, origin);
  }
  if (!stored.ok) return json(502, { ok: false, error: { code: "EVENT_FLYER_UPLOAD_FAILED" } }, requestId, origin);
  let signed;
  try {
    signed = await eventFlyerStorageRequest(env2, key, "POST", JSON.stringify({ expiresIn: 900 }), "application/json");
  } catch {
    await eventFlyerStorageRequest(env2, key, "DELETE").catch(() => void 0);
    return json(503, { ok: false, error: { code: "EVENT_FLYER_SIGNING_FAILED" } }, requestId, origin);
  }
  if (!signed.ok) {
    await eventFlyerStorageRequest(env2, key, "DELETE").catch(() => void 0);
    return json(502, { ok: false, error: { code: "EVENT_FLYER_SIGNING_FAILED" } }, requestId, origin);
  }
  const signedPayload = await signed.json();
  if (typeof signedPayload.signedURL !== "string" || !env2.SUPABASE_URL) {
    await eventFlyerStorageRequest(env2, key, "DELETE").catch(() => void 0);
    return json(502, { ok: false, error: { code: "EVENT_FLYER_SIGNING_FAILED" } }, requestId, origin);
  }
  const signedUrl = signedPayload.signedURL.startsWith("http") ? signedPayload.signedURL : new URL("/storage/v1" + (signedPayload.signedURL.startsWith("/") ? signedPayload.signedURL : "/" + signedPayload.signedURL), env2.SUPABASE_URL).toString();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const updated = await env2.DB.prepare("UPDATE event SET flyer_key=?,flyer_content_type=?,flyer_size=?,flyer_updated_at=?,updated_at=? WHERE id=? AND branch_id=? AND status='draft'").bind(key, type, file.size, now, now, eventId, branchId).run();
  if (!updated.success || (updated.meta?.changes ?? 0) !== 1) {
    await eventFlyerStorageRequest(env2, key, "DELETE").catch(() => void 0);
    return json(409, { ok: false, error: { code: "EVENT_CHANGED" } }, requestId, origin);
  }
  if (event.flyer_key) await eventFlyerStorageRequest(env2, event.flyer_key, "DELETE").catch(() => void 0);
  return json(200, { ok: true, data: { object_path: key, mime_type: type, size_bytes: file.size, signed_url: signedUrl, signed_url_expires_in: 900 } }, requestId, origin);
}
__name(handleEventFlyer, "handleEventFlyer");
var EVENT_RESPONSE_COLUMNS = "id,branch_id,title,description,starts_at,ends_at,timezone,location,capacity,status,visibility,registration_state,transport_enabled,flyer_content_type AS flyer_mime_type,flyer_size AS flyer_size_bytes,flyer_updated_at,created_at,updated_at";
function eventBranchId(request, url) {
  return request.headers.get("x-branch-id") ?? url.searchParams.get("branch_id") ?? "";
}
__name(eventBranchId, "eventBranchId");
function validEventFields(value, partial) {
  const allowed = ["title", "description", "starts_at", "ends_at", "timezone", "location", "capacity"];
  if (Object.keys(value).some((k) => !allowed.includes(k)) || !partial && ["title", "starts_at", "ends_at", "timezone"].some((k) => !(k in value))) return { ok: false };
  const values = {};
  if ("title" in value) {
    if (typeof value.title !== "string" || value.title.trim().length < 2 || value.title.trim().length > 180) return { ok: false };
    values.title = value.title.trim();
  }
  if ("description" in value) {
    if (value.description !== null && typeof value.description !== "string") return { ok: false };
    if (typeof value.description === "string" && value.description.length > 8e3) return { ok: false };
    values.description = value.description;
  }
  if ("starts_at" in value) {
    if (typeof value.starts_at !== "string" || !Number.isFinite(Date.parse(value.starts_at))) return { ok: false };
    values.starts_at = new Date(value.starts_at).toISOString();
  }
  if ("ends_at" in value) {
    if (typeof value.ends_at !== "string" || !Number.isFinite(Date.parse(value.ends_at))) return { ok: false };
    values.ends_at = new Date(value.ends_at).toISOString();
  }
  if ("timezone" in value) {
    if (typeof value.timezone !== "string" || value.timezone.trim().length < 3 || value.timezone.trim().length > 64) return { ok: false };
    values.timezone = value.timezone.trim();
  }
  if ("location" in value) {
    if (value.location !== null && typeof value.location !== "string") return { ok: false };
    if (typeof value.location === "string" && value.location.length > 240) return { ok: false };
    values.location = value.location;
  }
  if ("capacity" in value) {
    if (value.capacity !== null && (typeof value.capacity !== "number" || !Number.isInteger(value.capacity) || value.capacity < 1 || value.capacity > 1e5)) return { ok: false };
    values.capacity = value.capacity;
  }
  const starts = "starts_at" in values ? String(values.starts_at) : void 0, ends = "ends_at" in values ? String(values.ends_at) : void 0;
  if (starts && ends && Date.parse(ends) <= Date.parse(starts)) return { ok: false };
  return { ok: true, values };
}
__name(validEventFields, "validEventFields");
async function handleEventCollection(request, env2, requestId, origin) {
  const url = new URL(request.url), branchId = eventBranchId(request, url);
  const context2 = await resolveStaffContext(request, env2);
  if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
  if (!isUuidValue(branchId) || context2.activeBranch?.branchId !== branchId) return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
  if (request.method === "GET") {
    if (!eventHasScopedGrant(context2, "events.read", "branch") && !eventHasScopedGrant(context2, "events.manage", "branch")) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
    if (!Number.isInteger(limit) || !Number.isInteger(offset)) return json(400, { ok: false, error: { code: "INVALID_PAGINATION" } }, requestId, origin);
    const rows = await env2.DB.prepare("SELECT " + EVENT_RESPONSE_COLUMNS + " FROM event WHERE branch_id=? ORDER BY starts_at ASC,id ASC LIMIT ? OFFSET ?").bind(branchId, limit, offset).all();
    return json(200, { ok: true, data: rows.results ?? [] }, requestId, origin);
  }
  if (request.method !== "POST") return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, requestId, origin);
  if (!eventHasScopedGrant(context2, "events.manage", "branch")) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  const parsed = await readJsonBody(request, 12 * 1024);
  if (!parsed.ok || !isPlainObject(parsed.value)) return json(parsed.ok ? 400 : parsed.status, { ok: false, error: { code: "INVALID_EVENT" } }, requestId, origin);
  const payload = { ...parsed.value };
  if ("branch_id" in payload) {
    if (payload.branch_id !== branchId) return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
    delete payload.branch_id;
  }
  const fields = validEventFields(payload, false);
  if (!fields.ok) return json(400, { ok: false, error: { code: "INVALID_EVENT" } }, requestId, origin);
  const value = fields.values;
  if (Date.parse(String(value.ends_at)) <= Date.parse(String(value.starts_at))) return json(400, { ok: false, error: { code: "INVALID_EVENT_TIME_RANGE" } }, requestId, origin);
  const id = crypto.randomUUID(), now = (/* @__PURE__ */ new Date()).toISOString();
  try {
    await env2.DB.prepare("INSERT INTO event(id,branch_id,title,description,starts_at,ends_at,timezone,location,capacity,status,visibility,registration_state,transport_enabled,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'draft','private','closed',0,?,?,?)").bind(id, branchId, value.title, value.description ?? null, value.starts_at, value.ends_at, value.timezone, value.location ?? null, value.capacity ?? null, context2.staff.userId, now, now).run();
  } catch {
    return json(409, { ok: false, error: { code: "EVENT_CREATE_FAILED" } }, requestId, origin);
  }
  const event = await env2.DB.prepare("SELECT " + EVENT_RESPONSE_COLUMNS + " FROM event WHERE id=? AND branch_id=?").bind(id, branchId).first();
  if (!event) return json(500, { ok: false, error: { code: "EVENT_CREATE_FAILED" } }, requestId, origin);
  return json(201, { ok: true, data: event }, requestId, origin);
}
__name(handleEventCollection, "handleEventCollection");
async function handleEventItem(request, env2, eventId, requestId, origin) {
  const url = new URL(request.url), branchId = eventBranchId(request, url);
  if (!isUuidValue(eventId) || !isUuidValue(branchId)) return json(400, { ok: false, error: { code: "INVALID_EVENT_SCOPE" } }, requestId, origin);
  const operation = await eventOperationContext(request, env2, branchId, eventId, requestId, origin);
  if ("response" in operation && operation.response) return operation.response;
  const { context: context2, event } = operation;
  if (request.method === "GET") {
    if (!eventHasScopedGrant(context2, "events.read", "branch") && !eventHasScopedGrant(context2, "events.manage", "branch")) return json(404, { ok: false, error: { code: "EVENT_NOT_FOUND" } }, requestId, origin);
    const row2 = await env2.DB.prepare("SELECT " + EVENT_RESPONSE_COLUMNS + " FROM event WHERE id=? AND branch_id=?").bind(eventId, branchId).first();
    return row2 ? json(200, { ok: true, data: row2 }, requestId, origin) : json(404, { ok: false, error: { code: "EVENT_NOT_FOUND" } }, requestId, origin);
  }
  if (request.method !== "PATCH") return json(405, { ok: false, error: { code: "METHOD_NOT_ALLOWED" } }, requestId, origin);
  if (!eventHasScopedGrant(context2, "events.manage", "branch")) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
  if (event.status !== "draft" || event.visibility !== "private" || event.registration_state !== "closed") return json(409, { ok: false, error: { code: "EVENT_NOT_EDITABLE" } }, requestId, origin);
  const parsed = await readJsonBody(request, 12 * 1024);
  if (!parsed.ok || !isPlainObject(parsed.value)) return json(parsed.ok ? 400 : parsed.status, { ok: false, error: { code: "INVALID_EVENT" } }, requestId, origin);
  const fields = validEventFields(parsed.value, true);
  if (!fields.ok || Object.keys(fields.values).length === 0) return json(400, { ok: false, error: { code: "INVALID_EVENT" } }, requestId, origin);
  const mergedStarts = String(fields.values.starts_at ?? (await env2.DB.prepare("SELECT starts_at FROM event WHERE id=?").bind(eventId).first())?.starts_at ?? "");
  const mergedEnds = String(fields.values.ends_at ?? (await env2.DB.prepare("SELECT ends_at FROM event WHERE id=?").bind(eventId).first())?.ends_at ?? "");
  if (Date.parse(mergedEnds) <= Date.parse(mergedStarts)) return json(400, { ok: false, error: { code: "INVALID_EVENT_TIME_RANGE" } }, requestId, origin);
  const assignments = Object.keys(fields.values).map((key) => key + "=?");
  const values = Object.values(fields.values);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  assignments.push("updated_at=?");
  values.push(now);
  const result = await env2.DB.prepare("UPDATE event SET " + assignments.join(",") + " WHERE id=? AND branch_id=? AND status='draft' AND registration_state='closed'").bind(...values, eventId, branchId).run();
  if (!result.success || (result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "EVENT_CHANGED" } }, requestId, origin);
  const row = await env2.DB.prepare("SELECT " + EVENT_RESPONSE_COLUMNS + " FROM event WHERE id=? AND branch_id=?").bind(eventId, branchId).first();
  return row ? json(200, { ok: true, data: row }, requestId, origin) : json(404, { ok: false, error: { code: "EVENT_NOT_FOUND" } }, requestId, origin);
}
__name(handleEventItem, "handleEventItem");
async function handleEventWorkspaceOperations(request, env2, requestId, origin) {
  const url = new URL(request.url), parts = url.pathname.split("/").filter(Boolean);
  const branchId = request.headers.get("x-branch-id") ?? url.searchParams.get("branch_id") ?? "";
  const eventId = parts[3] ?? "";
  if (!isUuidValue(branchId) || !isUuidValue(eventId)) return json(400, { ok: false, error: { code: "INVALID_EVENT_SCOPE" } }, requestId, origin);
  const operation = await eventOperationContext(request, env2, branchId, eventId, requestId, origin);
  if ("response" in operation && operation.response) return operation.response;
  const { context: context2, event } = operation;
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const isAssignmentWorkspace = parts.length === 5 && parts[4] === "assignments";
  const assignmentKind = parts[4] === "staff-assignments" ? "staff" : parts[4] === "team-assignments" ? "team" : null;
  const isAssignmentCollection = parts.length === 5 && assignmentKind !== null;
  const isAssignmentRevoke = parts.length === 7 && assignmentKind !== null && parts[6] === "revoke";
  const canManageAssignments = eventHasScopedGrant(context2, "events.manage", "branch");
  if (isAssignmentWorkspace && request.method === "GET") {
    if (!canManageAssignments) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    const [staffRows, teamRows, staffCandidates, teamCandidates] = await Promise.all([
      env2.DB.prepare("SELECT a.id,a.event_id,a.branch_id,a.staff_auth_user_id,a.assignment_role,a.starts_at,a.ends_at,a.revoked_at,a.created_at,sp.full_name AS staff_name FROM event_staff_assignment a LEFT JOIN staff_profile sp ON sp.auth_user_id=a.staff_auth_user_id WHERE a.event_id=? AND a.branch_id=? ORDER BY a.starts_at,a.id").bind(eventId, branchId).all(),
      env2.DB.prepare("SELECT a.id,a.event_id,a.branch_id,a.team_id,a.assignment_role,a.starts_at,a.ends_at,a.revoked_at,a.created_at,t.name AS team_name FROM event_team_assignment a LEFT JOIN team t ON t.id=a.team_id AND t.branch_id=a.branch_id WHERE a.event_id=? AND a.branch_id=? ORDER BY a.starts_at,a.id").bind(eventId, branchId).all(),
      env2.DB.prepare("SELECT DISTINCT sp.auth_user_id,sp.full_name FROM staff_profile sp JOIN staff_role_assignment sra ON sra.staff_profile_id=sp.id JOIN role r ON r.id=sra.role_id AND r.is_active=1 WHERE sra.branch_id=? AND sp.account_status='active' AND sra.revoked_at IS NULL AND sra.starts_at<=? AND (sra.ends_at IS NULL OR sra.ends_at>?) ORDER BY sp.full_name COLLATE NOCASE LIMIT 200").bind(branchId, now, now).all(),
      env2.DB.prepare("SELECT id,name FROM team WHERE branch_id=? AND is_active=1 ORDER BY name COLLATE NOCASE LIMIT 200").bind(branchId).all()
    ]);
    return json(200, { ok: true, data: {
      staff_assignments: staffRows.results ?? [],
      team_assignments: teamRows.results ?? [],
      staff_candidates: staffCandidates.results ?? [],
      team_candidates: teamCandidates.results ?? []
    } }, requestId, origin);
  }
  if (isAssignmentCollection && request.method === "POST") {
    if (!canManageAssignments) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    if (event.status === "cancelled" || event.status === "completed") return json(409, { ok: false, error: { code: "EVENT_NOT_ASSIGNABLE" } }, requestId, origin);
    const parsed = await readJsonBody(request, 8192);
    if (!parsed.ok || !isPlainObject(parsed.value)) return json(parsed.ok ? 400 : parsed.status, { ok: false, error: { code: "INVALID_ASSIGNMENT" } }, requestId, origin);
    const payload = parsed.value;
    const allowedKeys = assignmentKind === "staff" ? ["staff_auth_user_id", "assignment_role", "starts_at", "ends_at"] : ["team_id", "assignment_role", "starts_at", "ends_at"];
    if (Object.keys(payload).some((key) => !allowedKeys.includes(key))) return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT" } }, requestId, origin);
    const targetId = assignmentKind === "staff" ? payload.staff_auth_user_id : payload.team_id;
    const role = payload.assignment_role;
    const roles = assignmentKind === "staff" ? ["owner", "organizer", "checkin", "support"] : ["organizer", "ushering", "support"];
    if (!isUuidValue(targetId) || typeof role !== "string" || !roles.includes(role) || typeof payload.starts_at !== "string" || payload.ends_at !== void 0 && payload.ends_at !== null && typeof payload.ends_at !== "string") {
      return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT" } }, requestId, origin);
    }
    const start = Date.parse(payload.starts_at);
    const eventStart = Date.parse(String(event.starts_at ?? ""));
    const eventEnd = Date.parse(String(event.ends_at ?? ""));
    const requestedEnd = payload.ends_at ? Date.parse(String(payload.ends_at)) : eventEnd;
    if (!Number.isFinite(start) || !Number.isFinite(eventStart) || !Number.isFinite(eventEnd) || !Number.isFinite(requestedEnd) || start < eventStart || start >= eventEnd || requestedEnd <= start || requestedEnd > eventEnd) {
      return json(422, { ok: false, error: { code: "INVALID_ASSIGNMENT_WINDOW" } }, requestId, origin);
    }
    const startsAt = new Date(start).toISOString(), endsAt = new Date(requestedEnd).toISOString();
    if (assignmentKind === "staff") {
      const profile3 = await env2.DB.prepare("SELECT id,account_status FROM staff_profile WHERE auth_user_id=? LIMIT 1").bind(targetId).first();
      if (!profile3 || profile3.account_status !== "active") return json(422, { ok: false, error: { code: "STAFF_NOT_ASSIGNABLE" } }, requestId, origin);
      const membership = await env2.DB.prepare("SELECT sra.id FROM staff_role_assignment sra JOIN role r ON r.id=sra.role_id AND r.is_active=1 WHERE sra.staff_profile_id=? AND sra.branch_id=? AND sra.revoked_at IS NULL AND sra.starts_at<=? AND (sra.ends_at IS NULL OR sra.ends_at>?) LIMIT 1").bind(profile3.id, branchId, startsAt, endsAt).first();
      if (!membership) return json(422, { ok: false, error: { code: "STAFF_NOT_IN_BRANCH" } }, requestId, origin);
    } else {
      const team = await env2.DB.prepare("SELECT id FROM team WHERE id=? AND branch_id=? AND is_active=1 LIMIT 1").bind(targetId, branchId).first();
      if (!team) return json(422, { ok: false, error: { code: "TEAM_NOT_ASSIGNABLE" } }, requestId, origin);
    }
    const table3 = assignmentKind === "staff" ? "event_staff_assignment" : "event_team_assignment";
    const targetColumn = assignmentKind === "staff" ? "staff_auth_user_id" : "team_id";
    const overlapping = await env2.DB.prepare("SELECT id FROM " + table3 + " WHERE event_id=? AND branch_id=? AND " + targetColumn + "=? AND assignment_role=? AND revoked_at IS NULL AND starts_at<? AND (ends_at IS NULL OR ends_at>?) LIMIT 1").bind(eventId, branchId, targetId, role, endsAt, startsAt).first();
    if (overlapping) return json(409, { ok: false, error: { code: "ASSIGNMENT_CONFLICT" } }, requestId, origin);
    const id = crypto.randomUUID();
    const statement = env2.DB.prepare("INSERT INTO " + table3 + " (id,event_id,branch_id," + targetColumn + ",assignment_role,assigned_by,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(id, eventId, branchId, targetId, role, context2.staff.userId, startsAt, endsAt, now);
    try {
      const result = await statement.run();
      if (!result.success || (result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "ASSIGNMENT_CONFLICT" } }, requestId, origin);
    } catch {
      return json(409, { ok: false, error: { code: "ASSIGNMENT_CONFLICT" } }, requestId, origin);
    }
    return json(201, { ok: true, data: {
      id,
      event_id: eventId,
      branch_id: branchId,
      [targetColumn]: targetId,
      assignment_role: role,
      starts_at: startsAt,
      ends_at: endsAt,
      revoked_at: null,
      created_at: now
    } }, requestId, origin);
  }
  if (isAssignmentRevoke && request.method === "POST") {
    if (!canManageAssignments) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    const assignmentId = parts[5];
    if (!isUuidValue(assignmentId)) return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT_ID" } }, requestId, origin);
    const table3 = assignmentKind === "staff" ? "event_staff_assignment" : "event_team_assignment";
    const existing = await env2.DB.prepare("SELECT id,event_id,branch_id,starts_at,ends_at,revoked_at FROM " + table3 + " WHERE id=? AND event_id=? AND branch_id=? LIMIT 1").bind(assignmentId, eventId, branchId).first();
    if (!existing) return json(404, { ok: false, error: { code: "ASSIGNMENT_NOT_FOUND" } }, requestId, origin);
    if (existing.revoked_at) return json(200, { ok: true, data: existing, already_revoked: true }, requestId, origin);
    const revokedAt = new Date(Math.max(Date.now(), Date.parse(String(existing.starts_at)))).toISOString();
    const result = await env2.DB.prepare("UPDATE " + table3 + " SET revoked_at=? WHERE id=? AND event_id=? AND branch_id=? AND revoked_at IS NULL").bind(revokedAt, assignmentId, eventId, branchId).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "ASSIGNMENT_CHANGED" } }, requestId, origin);
    return json(200, { ok: true, data: { ...existing, revoked_at: revokedAt }, already_revoked: false }, requestId, origin);
  }
  if (parts.length === 5 && parts[4] === "flyer" && (request.method === "GET" || request.method === "POST")) {
    return handleEventFlyer(request, env2, eventId, branchId, context2, requestId, origin);
  }
  if (parts.length === 6 && parts[4] === "flyer" && parts[5] === "remove" && request.method === "POST") {
    if (!eventHasScopedGrant(context2, "events.manage", "branch")) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    if (event.status !== "draft") return json(409, { ok: false, error: { code: "EVENT_NOT_EDITABLE" } }, requestId, origin);
    const current = await env2.DB.prepare("SELECT flyer_key FROM event WHERE id=? AND branch_id=?").bind(eventId, branchId).first();
    if (!current?.flyer_key) return json(200, { ok: true, data: { removed: false } }, requestId, origin);
    const now2 = (/* @__PURE__ */ new Date()).toISOString();
    const result = await env2.DB.prepare("UPDATE event SET flyer_key=NULL,flyer_content_type=NULL,flyer_size=NULL,flyer_updated_at=?,updated_at=? WHERE id=? AND branch_id=? AND status='draft'").bind(now2, now2, eventId, branchId).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "EVENT_CHANGED" } }, requestId, origin);
    await eventFlyerStorageRequest(env2, current.flyer_key, "DELETE").catch(() => void 0);
    return json(200, { ok: true, data: { removed: true } }, requestId, origin);
  }
  if (parts.length === 5 && parts[4] === "cancel" && request.method === "POST") {
    if (!eventHasScopedGrant(context2, "events.manage", "branch")) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    if (event.status === "completed") return json(409, { ok: false, error: { code: "EVENT_ALREADY_COMPLETED" } }, requestId, origin);
    if (event.status === "cancelled") return json(200, { ok: true, data: { event_id: eventId, status: "cancelled" } }, requestId, origin);
    const result = await env2.DB.prepare("UPDATE event SET status='cancelled',registration_state='closed',updated_at=? WHERE id=? AND branch_id=? AND status IN ('draft','published')").bind(now, eventId, branchId).run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "EVENT_CANCELLATION_CONFLICT" } }, requestId, origin);
    return json(200, { ok: true, data: { event_id: eventId, status: "cancelled" } }, requestId, origin);
  }
  if (parts.length === 6 && parts[4] === "staff-registration" && request.method === "POST") {
    if (!eventHasScopedGrant(context2, "events.manage", "branch")) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    const action = parts[5] === "open" ? "open" : parts[5] === "close" ? "close" : null;
    if (!action) return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin);
    const state = action === "open" ? "open" : "closed";
    const result = await env2.DB.prepare("UPDATE event SET registration_state=?,updated_at=? WHERE id=? AND branch_id=?").bind(state, now, eventId, branchId).run();
    if ((result.meta?.changes ?? 0) !== 1) return json(404, { ok: false, error: { code: "EVENT_NOT_FOUND" } }, requestId, origin);
    return json(200, { data: { ...event, registration_state: state, updated_at: now } }, requestId, origin);
  }
  if (parts.length === 5 && parts[4] === "registrations" && request.method === "GET") {
    const allowed = await eventAssignmentAllows(env2, context2, eventId, branchId, now, "checkin");
    if (!allowed) return json(403, { ok: false, error: { code: "EVENT_REGISTRATION_READ_NOT_AUTHORIZED" } }, requestId, origin);
    const rows = await env2.DB.prepare(`SELECT er.id,er.event_id,er.branch_id,er.attendee_name_snapshot,er.attendee_phone_snapshot,er.status,er.registered_at,
      (SELECT ec.checked_in_at FROM event_checkin ec WHERE ec.event_id=er.event_id AND ec.registration_id=er.id ORDER BY ec.checked_in_at DESC LIMIT 1) AS checked_in_at
      FROM event_registration er WHERE er.event_id=? AND er.branch_id=? ORDER BY er.registered_at DESC,er.id DESC`).bind(eventId, branchId).all();
    const active = await env2.DB.prepare("SELECT COUNT(*) AS total FROM event_registration WHERE event_id=? AND branch_id=? AND status IN ('registered','attended')").bind(eventId, branchId).first();
    return json(200, { data: { registrations: rows.results ?? [], active_count: active?.total ?? 0 } }, requestId, origin);
  }
  if (parts.length === 5 && parts[4] === "registrations" && request.method === "POST") {
    const allowed = await eventAssignmentAllows(env2, context2, eventId, branchId, now, "register");
    if (!allowed) return json(403, { ok: false, error: { code: "EVENT_REGISTRATION_NOT_AUTHORIZED" } }, requestId, origin);
    const parsed = await readJsonBody(request, 4096);
    if (!parsed.ok || !isPlainObject(parsed.value) || Object.keys(parsed.value).some((k) => !["idempotency_key", "attendee_name", "attendee_phone"].includes(k))) return json(parsed.ok ? 400 : parsed.status, { ok: false, error: { code: "INVALID_REGISTRATION" } }, requestId, origin);
    const key = typeof parsed.value.idempotency_key === "string" ? parsed.value.idempotency_key.trim() : "";
    const name = typeof parsed.value.attendee_name === "string" ? parsed.value.attendee_name.trim() : "";
    const phone = parsed.value.attendee_phone === null ? null : typeof parsed.value.attendee_phone === "string" ? parsed.value.attendee_phone.trim() : null;
    if (key.length < 8 || key.length > 128 || name.length < 2 || name.length > 180 || phone !== null && !/^\+[1-9]\d{7,14}$/.test(phone)) return json(400, { ok: false, error: { code: "INVALID_REGISTRATION" } }, requestId, origin);
    const digest = await eventDigest({ attendee_name: name, attendee_phone: phone });
    const replay = await eventReceiptReplay(env2, eventId, "staff_registration", key, digest, requestId, origin);
    if (replay instanceof Response) return replay;
    if (replay) {
      const registration2 = await env2.DB.prepare("SELECT id,event_id,branch_id,attendee_name_snapshot,attendee_phone_snapshot,status,registered_at FROM event_registration WHERE id=?").bind(replay.resource_id).first();
      return json(200, { data: { registration: registration2, replayed: true, response_status: replay.response_status } }, requestId, origin);
    }
    const id = crypto.randomUUID();
    const statements = [
      env2.DB.prepare(`INSERT INTO event_registration(id,event_id,branch_id,attendee_name_snapshot,attendee_phone_snapshot,registration_source,status,registered_at,client_request_id,created_by)
        VALUES(?,?,?,?,?,'staff','registered',?,?,?)`).bind(id, eventId, branchId, name, phone, now, key, context2.staff.userId),
      env2.DB.prepare(`INSERT INTO event_idempotency_receipt(id,event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,digest_key_version,request_digest,resource_type,resource_id,response_status,created_at)
        VALUES(?,?,?,'staff_registration','staff',?,?,1,?,'event_registration',?,201,?)`).bind(crypto.randomUUID(), eventId, branchId, context2.staff.userId, key, digest, id, now)
    ];
    try {
      const results = await env2.DB.batch(statements);
      if (results.some((x) => !x.success)) throw new Error("EVENT_REGISTRATION_WRITE_FAILED");
    } catch (error3) {
      const msg = error3 instanceof Error ? error3.message : "";
      if (msg.includes("EVENT_REGISTRATION_CLOSED")) return json(409, { ok: false, error: { code: "EVENT_REGISTRATION_CLOSED" } }, requestId, origin);
      if (msg.includes("EVENT_CAPACITY_REACHED")) return json(409, { ok: false, error: { code: "EVENT_CAPACITY_REACHED" } }, requestId, origin);
      if (msg.includes("UNIQUE")) return json(409, { ok: false, error: { code: "REGISTRATION_ALREADY_EXISTS" } }, requestId, origin);
      throw error3;
    }
    const registration = await env2.DB.prepare("SELECT id,event_id,branch_id,attendee_name_snapshot,attendee_phone_snapshot,status,registered_at FROM event_registration WHERE id=?").bind(id).first();
    return json(201, { data: { registration, replayed: false, response_status: 201 } }, requestId, origin);
  }
  const registrationIndex = parts.indexOf("registrations");
  const registrationId = registrationIndex >= 0 ? parts[registrationIndex + 1] : "";
  const cancel = registrationIndex >= 0 && parts[registrationIndex + 2] === "cancel";
  const checkin = registrationIndex >= 0 && parts[registrationIndex + 2] === "check-in";
  if ((cancel || checkin) && request.method === "POST" && isUuidValue(registrationId)) {
    const allowed = await eventAssignmentAllows(env2, context2, eventId, branchId, now, checkin ? "checkin" : "register");
    if (!allowed) return json(403, { ok: false, error: { code: checkin ? "EVENT_CHECKIN_NOT_AUTHORIZED" : "EVENT_REGISTRATION_NOT_AUTHORIZED" } }, requestId, origin);
    const parsed = await readJsonBody(request, 2048);
    if (!parsed.ok || !isPlainObject(parsed.value) || Object.keys(parsed.value).some((k) => k !== "idempotency_key")) return json(parsed.ok ? 400 : parsed.status, { ok: false, error: { code: "INVALID_EVENT_OPERATION" } }, requestId, origin);
    const key = typeof parsed.value.idempotency_key === "string" ? parsed.value.idempotency_key.trim() : "";
    if (key.length < 8 || key.length > 128) return json(400, { ok: false, error: { code: "INVALID_IDEMPOTENCY_KEY" } }, requestId, origin);
    const op = checkin ? "event_checkin" : "registration_cancel";
    const digest = await eventDigest({ registration_id: registrationId, operation: op });
    const replay = await eventReceiptReplay(env2, eventId, op, key, digest, requestId, origin);
    if (replay instanceof Response) return replay;
    if (replay) {
      const resource2 = checkin ? await env2.DB.prepare("SELECT id,event_id,branch_id,registration_id,attendee_name_snapshot,checked_in_at,recorded_by,source FROM event_checkin WHERE id=?").bind(replay.resource_id).first() : await env2.DB.prepare("SELECT id,event_id,branch_id,attendee_name_snapshot,attendee_phone_snapshot,status,registered_at FROM event_registration WHERE id=?").bind(replay.resource_id).first();
      return json(200, { data: checkin ? { checkin: resource2, replayed: true, response_status: replay.response_status } : { registration: resource2, replayed: true, response_status: replay.response_status } }, requestId, origin);
    }
    const registration = await env2.DB.prepare("SELECT id,event_id,branch_id,attendee_name_snapshot,status FROM event_registration WHERE id=? AND event_id=? AND branch_id=?").bind(registrationId, eventId, branchId).first();
    if (!registration) return json(404, { ok: false, error: { code: "REGISTRATION_NOT_FOUND" } }, requestId, origin);
    if (registration.status !== "registered") return json(409, { ok: false, error: { code: checkin ? "REGISTRATION_NOT_ACTIVE" : "REGISTRATION_NOT_CANCELLABLE" } }, requestId, origin);
    const resourceId = crypto.randomUUID();
    const stmts = checkin ? [
      env2.DB.prepare("INSERT INTO event_checkin(id,event_id,branch_id,registration_id,attendee_name_snapshot,checked_in_at,recorded_by,source,client_request_id) VALUES(?,?,?,?,?,?,?,'staff',?)").bind(resourceId, eventId, branchId, registrationId, registration.attendee_name_snapshot, now, context2.staff.userId, key),
      env2.DB.prepare("UPDATE event_registration SET status='attended' WHERE id=? AND status='registered'").bind(registrationId),
      env2.DB.prepare(`INSERT INTO event_idempotency_receipt(id,event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,digest_key_version,request_digest,resource_type,resource_id,response_status,created_at)
        VALUES(?,?,?,'event_checkin','staff',?,?,1,?,'event_checkin',?,201,?)`).bind(crypto.randomUUID(), eventId, branchId, context2.staff.userId, key, digest, resourceId, now)
    ] : [
      env2.DB.prepare("UPDATE event_registration SET status='cancelled',cancelled_by=?,cancelled_at=?,cancellation_request_key=? WHERE id=? AND status='registered'").bind(context2.staff.userId, now, key, registrationId),
      env2.DB.prepare(`INSERT INTO event_idempotency_receipt(id,event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,digest_key_version,request_digest,resource_type,resource_id,response_status,created_at)
        VALUES(?,?,?,'registration_cancel','staff',?,?,1,?,'event_registration',?,200,?)`).bind(crypto.randomUUID(), eventId, branchId, context2.staff.userId, key, digest, registrationId, now)
    ];
    try {
      const results = await env2.DB.batch(stmts);
      if (results.some((x) => !x.success)) throw new Error("EVENT_OPERATION_WRITE_FAILED");
    } catch (error3) {
      const msg = error3 instanceof Error ? error3.message : "";
      if (msg.includes("EVENT_CHECKIN_NOT_AUTHORIZED")) return json(403, { ok: false, error: { code: "EVENT_CHECKIN_NOT_AUTHORIZED" } }, requestId, origin);
      if (msg.includes("UNIQUE")) return json(409, { ok: false, error: { code: checkin ? "ALREADY_CHECKED_IN" : "REGISTRATION_ALREADY_CANCELLED" } }, requestId, origin);
      throw error3;
    }
    const resource = checkin ? await env2.DB.prepare("SELECT id,event_id,branch_id,registration_id,attendee_name_snapshot,checked_in_at,recorded_by,source FROM event_checkin WHERE id=?").bind(resourceId).first() : await env2.DB.prepare("SELECT id,event_id,branch_id,attendee_name_snapshot,attendee_phone_snapshot,status,registered_at FROM event_registration WHERE id=?").bind(registrationId).first();
    return json(checkin ? 201 : 200, { data: checkin ? { checkin: resource, replayed: false, response_status: 201 } : { registration: resource, replayed: false, response_status: 200 } }, requestId, origin);
  }
  if (parts.length === 5 && parts[4] === "closeout" && request.method === "GET") {
    const canRead = eventHasScopedGrant(context2, "events.manage", "branch") || eventHasScopedGrant(context2, "events.checkin", "branch") || eventHasScopedGrant(context2, "events.closeout.review", "branch");
    if (!canRead) return json(403, { ok: false, error: { code: "EVENT_CLOSEOUT_READ_NOT_AUTHORIZED" } }, requestId, origin);
    const closeout = await env2.DB.prepare("SELECT id,event_id,branch_id,submitted_by,submitted_at,reviewed_by,reviewed_at,status,attendee_count,registration_count,transport_seat_count,summary_notes FROM event_closeout WHERE event_id=? AND branch_id=?").bind(eventId, branchId).first();
    const history = closeout ? await env2.DB.prepare("SELECT id,actor_user_id,action,details,created_at FROM event_closeout_event WHERE closeout_id=? ORDER BY created_at ASC").bind(closeout.id).all() : { results: [] };
    const parsedHistory = (history.results ?? []).map((row) => ({ ...row, details: typeof row.details === "string" ? JSON.parse(row.details) : row.details }));
    return json(200, { data: { closeout, history: parsedHistory } }, requestId, origin);
  }
  if (parts.length === 6 && parts[4] === "closeout" && parts[5] === "submit" && request.method === "POST") {
    if (!eventHasScopedGrant(context2, "events.manage", "branch") && !eventHasScopedGrant(context2, "events.checkin", "branch")) return json(403, { ok: false, error: { code: "EVENT_CLOSEOUT_SUBMIT_NOT_AUTHORIZED" } }, requestId, origin);
    const parsed = await readJsonBody(request, 4096);
    if (!parsed.ok || !isPlainObject(parsed.value) || Object.keys(parsed.value).some((k) => !["idempotency_key", "summary_notes"].includes(k))) return json(parsed.ok ? 400 : parsed.status, { ok: false, error: { code: "INVALID_CLOSEOUT" } }, requestId, origin);
    const key = typeof parsed.value.idempotency_key === "string" ? parsed.value.idempotency_key.trim() : "";
    const notes = parsed.value.summary_notes === null ? null : typeof parsed.value.summary_notes === "string" ? parsed.value.summary_notes.trim() : null;
    if (key.length < 8 || key.length > 128 || notes !== null && notes.length > 2e3) return json(400, { ok: false, error: { code: "INVALID_CLOSEOUT" } }, requestId, origin);
    const digest = await eventDigest({ summary_notes: notes });
    const replay = await eventReceiptReplay(env2, eventId, "closeout_submit", key, digest, requestId, origin);
    if (replay instanceof Response) return replay;
    if (replay) {
      const closeout2 = await env2.DB.prepare("SELECT * FROM event_closeout WHERE id=?").bind(replay.resource_id).first();
      return json(200, { data: { closeout: closeout2, replayed: true, response_status: replay.response_status } }, requestId, origin);
    }
    const counts = await env2.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM event_checkin WHERE event_id=? AND branch_id=?) AS attendee_count,
      (SELECT COUNT(*) FROM event_registration WHERE event_id=? AND branch_id=? AND status IN ('registered','attended')) AS registration_count,
      (SELECT COALESCE(SUM(seat_count),0) FROM transport_reservation WHERE event_id=? AND branch_id=? AND status IN ('reserved','boarded')) AS transport_seat_count`).bind(eventId, branchId, eventId, branchId, eventId, branchId).first();
    const existing = await env2.DB.prepare("SELECT id,status FROM event_closeout WHERE event_id=? AND branch_id=?").bind(eventId, branchId).first();
    if (existing && existing.status !== "returned") return json(409, { ok: false, error: { code: "CLOSEOUT_ALREADY_SUBMITTED" } }, requestId, origin);
    const closeoutId = existing?.id ?? crypto.randomUUID();
    const write = existing ? env2.DB.prepare("UPDATE event_closeout SET submitted_by=?,submitted_at=?,reviewed_by=NULL,reviewed_at=NULL,status='submitted',attendee_count=?,registration_count=?,transport_seat_count=?,summary_notes=?,updated_at=? WHERE id=? AND status='returned'").bind(context2.staff.userId, now, counts?.attendee_count ?? 0, counts?.registration_count ?? 0, counts?.transport_seat_count ?? 0, notes, now, closeoutId) : env2.DB.prepare("INSERT INTO event_closeout(id,event_id,branch_id,submitted_by,submitted_at,status,attendee_count,registration_count,transport_seat_count,summary_notes,created_at,updated_at) VALUES(?,?,?,?,?,'submitted',?,?,?,?,?,?)").bind(closeoutId, eventId, branchId, context2.staff.userId, now, counts?.attendee_count ?? 0, counts?.registration_count ?? 0, counts?.transport_seat_count ?? 0, notes, now, now);
    const statements = [
      write,
      env2.DB.prepare("INSERT INTO event_closeout_event(id,closeout_id,actor_user_id,action,details,created_at) VALUES(?,?,?,'submitted',?,?)").bind(crypto.randomUUID(), closeoutId, context2.staff.userId, JSON.stringify({ attendee_count: counts?.attendee_count ?? 0, registration_count: counts?.registration_count ?? 0, transport_seat_count: counts?.transport_seat_count ?? 0 }), now),
      env2.DB.prepare(`INSERT INTO event_idempotency_receipt(id,event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,digest_key_version,request_digest,resource_type,resource_id,response_status,created_at)
        VALUES(?,?,?,'closeout_submit','staff',?,?,1,?,'event_closeout',?,201,?)`).bind(crypto.randomUUID(), eventId, branchId, context2.staff.userId, key, digest, closeoutId, now)
    ];
    try {
      const results = await env2.DB.batch(statements);
      if (results.some((x) => !x.success)) throw new Error("CLOSEOUT_SUBMIT_FAILED");
    } catch (error3) {
      const msg = error3 instanceof Error ? error3.message : "";
      if (msg.includes("UNIQUE")) return json(409, { ok: false, error: { code: "CLOSEOUT_ALREADY_SUBMITTED" } }, requestId, origin);
      if (msg.includes("EVENT_CLOSEOUT")) return json(403, { ok: false, error: { code: "EVENT_CLOSEOUT_SUBMIT_NOT_AUTHORIZED" } }, requestId, origin);
      throw error3;
    }
    const closeout = await env2.DB.prepare("SELECT * FROM event_closeout WHERE id=?").bind(closeoutId).first();
    return json(201, { data: { closeout, replayed: false, response_status: 201 } }, requestId, origin);
  }
  if (parts.length === 6 && parts[4] === "closeout" && parts[5] === "review" && request.method === "POST") {
    if (!eventHasScopedGrant(context2, "events.closeout.review", "branch")) return json(403, { ok: false, error: { code: "EVENT_CLOSEOUT_REVIEW_NOT_AUTHORIZED" } }, requestId, origin);
    const parsed = await readJsonBody(request, 4096);
    if (!parsed.ok || !isPlainObject(parsed.value) || Object.keys(parsed.value).some((k) => !["idempotency_key", "decision", "reason"].includes(k))) return json(parsed.ok ? 400 : parsed.status, { ok: false, error: { code: "INVALID_CLOSEOUT_REVIEW" } }, requestId, origin);
    const key = typeof parsed.value.idempotency_key === "string" ? parsed.value.idempotency_key.trim() : "";
    const decision = parsed.value.decision;
    const reason = parsed.value.reason === null ? null : typeof parsed.value.reason === "string" ? parsed.value.reason.trim() : null;
    if (key.length < 8 || key.length > 128 || !["approved", "returned"].includes(String(decision)) || decision === "returned" && (!reason || reason.length < 10) || reason !== null && reason.length > 2e3) return json(400, { ok: false, error: { code: "INVALID_CLOSEOUT_REVIEW" } }, requestId, origin);
    const closeout = await env2.DB.prepare("SELECT id,status FROM event_closeout WHERE event_id=? AND branch_id=?").bind(eventId, branchId).first();
    if (!closeout) return json(404, { ok: false, error: { code: "CLOSEOUT_NOT_FOUND" } }, requestId, origin);
    if (closeout.status !== "submitted") return json(409, { ok: false, error: { code: "CLOSEOUT_NOT_SUBMITTED" } }, requestId, origin);
    const digest = await eventDigest({ decision, reason });
    const replay = await eventReceiptReplay(env2, eventId, "closeout_review", key, digest, requestId, origin);
    if (replay instanceof Response) return replay;
    if (replay) {
      const record2 = await env2.DB.prepare("SELECT * FROM event_closeout WHERE id=?").bind(closeout.id).first();
      return json(200, { data: { closeout: record2, replayed: true, response_status: replay.response_status } }, requestId, origin);
    }
    const action = decision === "approved" ? "approved" : "returned";
    const update = env2.DB.prepare("UPDATE event_closeout SET status=?,reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=? AND status='submitted'").bind(decision, context2.staff.userId, now, now, closeout.id);
    const audit = env2.DB.prepare("INSERT INTO event_closeout_event(id,closeout_id,actor_user_id,action,details,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(), closeout.id, context2.staff.userId, action, JSON.stringify({ reason }), now);
    const receipt = env2.DB.prepare(`INSERT INTO event_idempotency_receipt(id,event_id,branch_id,operation,caller_class,actor_user_id,idempotency_key,digest_key_version,request_digest,resource_type,resource_id,response_status,created_at)
      VALUES(?,?,?,'closeout_review','staff',?,?,1,?,'event_closeout',?,200,?)`).bind(crypto.randomUUID(), eventId, branchId, context2.staff.userId, key, digest, closeout.id, now);
    try {
      const results = await env2.DB.batch([update, audit, receipt]);
      if (results.some((x) => !x.success)) throw new Error("CLOSEOUT_REVIEW_FAILED");
    } catch (error3) {
      const msg = error3 instanceof Error ? error3.message : "";
      if (msg.includes("EVENT_CLOSEOUT_EVENT_NOT_AUTHORIZED")) return json(403, { ok: false, error: { code: "EVENT_CLOSEOUT_REVIEW_NOT_AUTHORIZED" } }, requestId, origin);
      throw error3;
    }
    const record = await env2.DB.prepare("SELECT * FROM event_closeout WHERE id=?").bind(closeout.id).first();
    return json(200, { data: { closeout: record, replayed: false, response_status: 200 } }, requestId, origin);
  }
  return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin);
}
__name(handleEventWorkspaceOperations, "handleEventWorkspaceOperations");
async function handleReportOperations(request, env2, requestId, origin) {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const reportsCollection = url.pathname === "/api/v1/reports";
  const optionCollection = url.pathname === "/api/v1/reports/teams" || url.pathname === "/api/v1/reports/events";
  const reportId = parts[3] ?? "";
  const review = parts.length === 5 && parts[2] === "reports" && parts[4] === "review";
  const resubmit = parts.length === 5 && parts[2] === "reports" && parts[4] === "resubmit";
  const item = parts.length === 4 && parts[2] === "reports" && isUuidValue(reportId);
  const branchId = request.headers.get("x-branch-id") ?? url.searchParams.get("branch_id") ?? "";
  if (optionCollection || reportsCollection || item) {
    if (!isUuidValue(branchId)) return json(400, { ok: false, error: { code: "INVALID_QUERY" } }, requestId, origin);
  }
  if (optionCollection && request.method === "GET") {
    const context2 = await resolveStaffContext(request, env2);
    if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
    if (!context2.activeBranch || context2.activeBranch.branchId !== branchId) return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
    const caps = context2.activeBranch.capabilities;
    const canSubmit = caps.some((c) => c.code === "report.submit.own" && c.scopeMode === "self");
    const canReviewBranch = caps.some((c) => c.code === "report.review.branch" && c.scopeMode === "branch");
    const canReviewTeam = caps.some((c) => c.code === "report.review.team" && c.scopeMode === "team");
    if (!canSubmit && !canReviewBranch && !canReviewTeam) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    if (url.pathname.endsWith("/teams")) {
      const teams = await reportTeamIds(env2, context2.staff.profileId, branchId, (/* @__PURE__ */ new Date()).toISOString());
      if (!teams.length) return json(200, { data: [] }, requestId, origin);
      const marks = teams.map(() => "?").join(",");
      const rows = await env2.DB.prepare(`SELECT id,name FROM team WHERE branch_id=? AND is_active=1 AND id IN (${marks}) ORDER BY name COLLATE NOCASE`).bind(branchId, ...teams).all();
      return json(200, { data: rows.results ?? [] }, requestId, origin);
    }
    if (!canSubmit) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const staffEvents = await env2.DB.prepare(`SELECT e.id,e.title,e.starts_at FROM event e JOIN event_staff_assignment a ON a.event_id=e.id AND a.branch_id=e.branch_id WHERE e.branch_id=? AND a.staff_auth_user_id=? AND a.revoked_at IS NULL AND a.starts_at<=? AND (a.ends_at IS NULL OR a.ends_at>?) AND a.assignment_role IN ('owner','organizer','checkin','ushering','support') ORDER BY e.starts_at DESC LIMIT 100`).bind(branchId, context2.staff.userId, now, now).all();
    const teamIds = canSubmit || canReviewTeam ? await reportTeamIds(env2, context2.staff.profileId, branchId, now) : [];
    let teamEvents = { results: [] };
    if (teamIds.length) {
      const marks = teamIds.map(() => "?").join(",");
      teamEvents = await env2.DB.prepare(`SELECT DISTINCT e.id,e.title,e.starts_at FROM event e JOIN event_team_assignment a ON a.event_id=e.id AND a.branch_id=e.branch_id WHERE e.branch_id=? AND a.team_id IN (${marks}) AND a.revoked_at IS NULL AND a.starts_at<=? AND (a.ends_at IS NULL OR a.ends_at>?) AND a.assignment_role IN ('organizer','ushering','support') ORDER BY e.starts_at DESC LIMIT 100`).bind(branchId, ...teamIds, now, now).all();
    }
    const map = /* @__PURE__ */ new Map();
    for (const row of [...staffEvents.results ?? [], ...teamEvents.results ?? []]) map.set(String(row.id), row);
    return json(200, { data: [...map.values()] }, requestId, origin);
  }
  if (reportsCollection && request.method === "GET") {
    const allowed = /* @__PURE__ */ new Set(["branch_id", "report_type", "status", "limit", "offset"]);
    if ([...url.searchParams.keys()].some((k) => !allowed.has(k))) return json(400, { ok: false, error: { code: "INVALID_QUERY" } }, requestId, origin);
    const reportType = url.searchParams.get("report_type");
    const status = url.searchParams.get("status");
    const limitRaw = Number(url.searchParams.get("limit") ?? 25), offsetRaw = Number(url.searchParams.get("offset") ?? 0);
    if (reportType && !["daily_evangelism", "event_evangelism", "weekly_ministry"].includes(reportType) || status && !["submitted", "returned", "approved"].includes(status) || !Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 100 || !Number.isInteger(offsetRaw) || offsetRaw < 0 || offsetRaw > 1e5) return json(400, { ok: false, error: { code: "INVALID_QUERY" } }, requestId, origin);
    const context2 = await resolveStaffContext(request, env2);
    if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
    if (!context2.activeBranch || context2.activeBranch.branchId !== branchId) return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
    const caps = context2.activeBranch.capabilities;
    const own = caps.some((c) => c.code === "report.read.own" && c.scopeMode === "self");
    const branch = caps.some((c) => c.code === "report.review.branch" && c.scopeMode === "branch");
    const team = caps.some((c) => c.code === "report.review.team" && c.scopeMode === "team");
    if (!own && !branch && !team) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    const teamIds = team ? await reportTeamIds(env2, context2.staff.profileId, branchId, (/* @__PURE__ */ new Date()).toISOString()) : [];
    const where = ["branch_id=?"];
    const values = [branchId];
    if (reportType) {
      where.push("report_type=?");
      values.push(reportType);
    }
    if (status) {
      where.push("status=?");
      values.push(status);
    }
    if (!branch) {
      const visibility = [];
      if (own) {
        visibility.push("author_profile_id=?");
        values.push(context2.staff.profileId);
      }
      if (team && teamIds.length) {
        visibility.push("team_id IN (" + teamIds.map(() => "?").join(",") + ")");
        values.push(...teamIds);
      }
      if (!visibility.length) return json(200, { data: [], total: 0 }, requestId, origin);
      where.push("(" + visibility.join(" OR ") + ")");
    }
    const whereSql = where.join(" AND ");
    const rows = await env2.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM ministry_report WHERE ${whereSql} ORDER BY period_start DESC,created_at DESC LIMIT ? OFFSET ?`).bind(...values, limitRaw, offsetRaw).all();
    const total = await env2.DB.prepare(`SELECT COUNT(*) AS total FROM ministry_report WHERE ${whereSql}`).bind(...values).first();
    return json(200, { data: rows.results ?? [], total: total?.total ?? 0 }, requestId, origin);
  }
  if ((item || review || resubmit) && request.method === "GET") {
    const context2 = await resolveStaffContext(request, env2);
    if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
    if (!context2.activeBranch || context2.activeBranch.branchId !== branchId) return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
    const row = await env2.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM ministry_report WHERE id=? AND branch_id=?`).bind(reportId, branchId).first();
    if (!row) return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin);
    const caps = context2.activeBranch.capabilities;
    const own = caps.some((c) => c.code === "report.read.own" && c.scopeMode === "self") && row.author_profile_id === context2.staff.profileId;
    const branch = caps.some((c) => c.code === "report.review.branch" && c.scopeMode === "branch");
    const team = caps.some((c) => c.code === "report.review.team" && c.scopeMode === "team");
    const teamIds = team ? await reportTeamIds(env2, context2.staff.profileId, branchId, (/* @__PURE__ */ new Date()).toISOString()) : [];
    if (!own && !branch && !(team && row.team_id && teamIds.includes(String(row.team_id)))) return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin);
    const history = await env2.DB.prepare("SELECT id,actor_profile_id,decision,comment,created_at FROM report_review_event WHERE report_id=? ORDER BY created_at ASC").bind(reportId).all();
    return json(200, { data: { ...row, review_history: history.results ?? [] } }, requestId, origin);
  }
  if (reportsCollection && request.method === "POST") {
    const parsed = await readJsonBody(request, 8192);
    if (!parsed.ok || !isPlainObject(parsed.value)) return json(parsed.ok ? 400 : parsed.status, { ok: false, error: { code: "INVALID_REPORT" } }, requestId, origin);
    const input = reportInput(parsed.value);
    if (!input) return json(400, { ok: false, error: { code: "INVALID_REPORT" } }, requestId, origin);
    const access = await authorizeRequestCapability(request, env2, "report.submit.own");
    if (access.state !== "authorized") return reportForbidden(access, requestId, origin);
    if (access.activeBranch.branchId !== input.branch_id) return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    if (input.team_id) {
      const teams = await reportTeamIds(env2, access.staff.profileId, String(input.branch_id), now);
      if (!teams.includes(String(input.team_id))) return json(403, { ok: false, error: { code: "TEAM_SCOPE_REQUIRED" } }, requestId, origin);
    }
    if (input.event_id) {
      const event = await env2.DB.prepare(`SELECT e.id FROM event e WHERE e.id=? AND e.branch_id=? AND (
        EXISTS(SELECT 1 FROM event_staff_assignment a WHERE a.event_id=e.id AND a.staff_auth_user_id=? AND a.assignment_role IN ('owner','organizer','checkin','ushering','support') AND a.revoked_at IS NULL AND a.starts_at<=? AND (a.ends_at IS NULL OR a.ends_at>?))
        OR EXISTS(SELECT 1 FROM event_team_assignment a JOIN staff_team_membership stm ON stm.team_id=a.team_id AND stm.branch_id=a.branch_id WHERE a.event_id=e.id AND stm.staff_profile_id=? AND a.assignment_role IN ('organizer','ushering','support') AND a.revoked_at IS NULL AND stm.revoked_at IS NULL AND a.starts_at<=? AND (a.ends_at IS NULL OR a.ends_at>?) AND stm.starts_at<=? AND (stm.ends_at IS NULL OR stm.ends_at>?))
      ) LIMIT 1`).bind(input.event_id, input.branch_id, access.staff.userId, now, now, access.staff.profileId, now, now, now, now).first();
      if (!event) return json(403, { ok: false, error: { code: "EVENT_SCOPE_REQUIRED" } }, requestId, origin);
    }
    const id = crypto.randomUUID();
    try {
      await env2.DB.prepare(`INSERT INTO ministry_report (
        id,branch_id,report_type,period_start,period_end,author_profile_id,team_id,event_id,
        contacts_captured,gospel_presentations,decisions_for_christ,followup_required,followup_completed,
        visits_completed,calls_completed,events_supported,attendance_count,status,submitted_at,created_at,updated_at,created_by,updated_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'submitted',?,?,?,?,?)`).bind(
        id,
        input.branch_id,
        input.report_type,
        input.period_start,
        input.period_end,
        access.staff.profileId,
        input.team_id,
        input.event_id,
        input.contacts_captured,
        input.gospel_presentations,
        input.decisions_for_christ,
        input.followup_required,
        input.followup_completed,
        input.visits_completed,
        input.calls_completed,
        input.events_supported,
        input.attendance_count,
        now,
        now,
        now,
        access.staff.userId,
        access.staff.userId
      ).run();
    } catch (error3) {
      const message = error3 instanceof Error ? error3.message : "";
      if (message.includes("UNIQUE")) return json(409, { ok: false, error: { code: "REPORT_ALREADY_EXISTS" } }, requestId, origin);
      if (message.includes("REPORT_")) return json(400, { ok: false, error: { code: message.split(":").pop() ?? "INVALID_REPORT_SCOPE" } }, requestId, origin);
      throw error3;
    }
    const created = await env2.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM ministry_report WHERE id=?`).bind(id).first();
    return json(201, { data: created }, requestId, origin);
  }
  if (review && request.method === "POST") {
    const reportIdForReview = parts[3] ?? "";
    if (!isUuidValue(reportIdForReview)) return json(400, { ok: false, error: { code: "INVALID_REPORT_ID" } }, requestId, origin);
    const parsed = await readJsonBody(request, 4096);
    if (!parsed.ok || !isPlainObject(parsed.value) || Object.keys(parsed.value).some((k) => !["decision", "comment"].includes(k))) return json(parsed.ok ? 400 : parsed.status, { ok: false, error: { code: "INVALID_REVIEW" } }, requestId, origin);
    const decision = parsed.value.decision;
    const comment = typeof parsed.value.comment === "string" ? parsed.value.comment.trim() : "";
    if (!["approved", "returned", "comment"].includes(String(decision)) || comment.length > 2e3 || decision === "returned" && comment.length === 0) return json(400, { ok: false, error: { code: "INVALID_REVIEW" } }, requestId, origin);
    const row = await env2.DB.prepare("SELECT id,branch_id,author_profile_id,team_id,status FROM ministry_report WHERE id=?").bind(reportIdForReview).first();
    if (!row) return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin);
    const scopedHeaders = new Headers(request.headers);
    scopedHeaders.set("x-branch-id", String(row.branch_id));
    const scopedRequest = new Request(request.url, { headers: scopedHeaders });
    const context2 = await resolveStaffContext(scopedRequest, env2);
    if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
    if (!context2.activeBranch || context2.activeBranch.branchId !== row.branch_id) return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
    if (row.author_profile_id === context2.staff.profileId) return json(403, { ok: false, error: { code: "SELF_REVIEW_FORBIDDEN" } }, requestId, origin);
    const caps = context2.activeBranch.capabilities;
    const branch = caps.some((c) => c.code === "report.review.branch" && c.scopeMode === "branch");
    const team = caps.some((c) => c.code === "report.review.team" && c.scopeMode === "team");
    const teamIds = team ? await reportTeamIds(env2, context2.staff.profileId, String(row.branch_id), (/* @__PURE__ */ new Date()).toISOString()) : [];
    if (!branch && !(team && row.team_id && teamIds.includes(String(row.team_id)))) return json(403, { ok: false, error: { code: "CAPABILITY_DENIED" } }, requestId, origin);
    if (row.status !== "submitted") return json(409, { ok: false, error: { code: "REPORT_NOT_SUBMITTED" } }, requestId, origin);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const update = await env2.DB.prepare(`UPDATE ministry_report SET status=?,last_action_id=?,last_action_by=?,last_action_decision=?,last_action_comment=?,last_action_at=?,updated_at=?,updated_by=? WHERE id=? AND status='submitted'`).bind(
      decision === "comment" ? "submitted" : decision,
      crypto.randomUUID(),
      context2.staff.userId,
      decision,
      comment || null,
      now,
      now,
      context2.staff.userId,
      reportIdForReview
    ).run();
    if ((update.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "REPORT_NOT_SUBMITTED" } }, requestId, origin);
    const report2 = await env2.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM ministry_report WHERE id=?`).bind(reportIdForReview).first();
    const history = await env2.DB.prepare("SELECT id,actor_profile_id,decision,comment,created_at FROM report_review_event WHERE report_id=? ORDER BY created_at ASC").bind(reportIdForReview).all();
    return json(200, { data: { report: report2, review_history: history.results ?? [] } }, requestId, origin);
  }
  if (resubmit && request.method === "POST") {
    const reportIdForSubmit = parts[3] ?? "";
    if (!isUuidValue(reportIdForSubmit)) return json(400, { ok: false, error: { code: "INVALID_REPORT_ID" } }, requestId, origin);
    const parsed = await readJsonBody(request, 8192);
    if (!parsed.ok || !isPlainObject(parsed.value)) return json(parsed.ok ? 400 : parsed.status, { ok: false, error: { code: "INVALID_REPORT_CORRECTION" } }, requestId, origin);
    const correction = reportInput(parsed.value, true);
    if (!correction) return json(400, { ok: false, error: { code: "INVALID_REPORT_CORRECTION" } }, requestId, origin);
    const row = await env2.DB.prepare(`SELECT id,branch_id,author_profile_id,status,${REPORT_FIELDS.join(",")} FROM ministry_report WHERE id=?`).bind(reportIdForSubmit).first();
    if (!row) return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin);
    const scopedHeaders = new Headers(request.headers);
    scopedHeaders.set("x-branch-id", String(row.branch_id));
    const scopedRequest = new Request(request.url, { headers: scopedHeaders });
    const context2 = await resolveStaffContext(scopedRequest, env2);
    if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId, origin);
    if (row.author_profile_id !== context2.staff.profileId) return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin);
    if (!context2.activeBranch || context2.activeBranch.branchId !== row.branch_id) return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
    if (row.status !== "returned") return json(409, { ok: false, error: { code: "REPORT_NOT_RETURNED" } }, requestId, origin);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const sets = [...REPORT_FIELDS.map((k) => `${k}=?`), "status='submitted'", "submitted_at=?", "last_action_id=?", "last_action_by=?", "last_action_decision='resubmitted'", "last_action_comment=NULL", "last_action_at=?", "updated_at=?", "updated_by=?"];
    const values = [...REPORT_FIELDS.map((k) => correction[k] === void 0 ? row[k] : correction[k]), now, crypto.randomUUID(), context2.staff.userId, now, now, context2.staff.userId, reportIdForSubmit];
    const updated = await env2.DB.prepare(`UPDATE ministry_report SET ${sets.join(",")} WHERE id=? AND status='returned' AND author_profile_id=?`).bind(...values, context2.staff.profileId).run();
    if ((updated.meta?.changes ?? 0) !== 1) return json(409, { ok: false, error: { code: "REPORT_NOT_RETURNED" } }, requestId, origin);
    const report2 = await env2.DB.prepare(`SELECT ${REPORT_COLUMNS} FROM ministry_report WHERE id=?`).bind(reportIdForSubmit).first();
    const history = await env2.DB.prepare("SELECT id,actor_profile_id,decision,comment,created_at FROM report_review_event WHERE report_id=? ORDER BY created_at ASC").bind(reportIdForSubmit).all();
    return json(200, { data: { report: report2, review_history: history.results ?? [] } }, requestId, origin);
  }
  return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin);
}
__name(handleReportOperations, "handleReportOperations");
var index_default = {
  async fetch(request, env2) {
    const url = new URL(request.url);
    const requestId = crypto.randomUUID();
    const origin = request.headers.get("Origin") ?? void 0;
    if (!requestOriginAllowed(request, env2)) {
      return json(403, {
        ok: false,
        error: { code: "ORIGIN_NOT_ALLOWED", message: "This request origin is not allowed." }
      }, requestId);
    }
    if (request.method === "OPTIONS") {
      if (!origin) return new Response(null, { status: 204 });
      return new Response(null, { status: 204, headers: authCorsHeaders(origin) });
    }
    function hasScopedGrant(context2, code, scopeMode) {
      return !!context2.activeBranch?.capabilities.some(
        (grant) => grant.code === code && grant.scopeMode === scopeMode
      );
    }
    __name(hasScopedGrant, "hasScopedGrant");
    async function resolveNotificationActor(request2, env3, branchId, requestId2, origin2) {
      const context2 = await resolveStaffContext(request2, env3);
      if (context2.state !== "authenticated") {
        return mapCapabilityFailure(context2.state, requestId2, origin2);
      }
      if (!context2.staff.branches.some((branch) => branch.id === branchId)) {
        return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId2, origin2);
      }
      const profile3 = await env3.DB.prepare(
        "SELECT must_change_password FROM staff_profile WHERE id = ? LIMIT 1"
      ).bind(context2.staff.profileId).first();
      if (!profile3) {
        return json(403, { ok: false, error: { code: "STAFF_ACCOUNT_NOT_ACTIVE" } }, requestId2, origin2);
      }
      if (profile3.must_change_password === 1) {
        return json(403, { ok: false, error: { code: "PASSWORD_CHANGE_REQUIRED" } }, requestId2, origin2);
      }
      return { actorUserId: context2.staff.userId, profileId: context2.staff.profileId };
    }
    __name(resolveNotificationActor, "resolveNotificationActor");
    async function listStaffNotifications(request2, env3, requestId2, origin2) {
      const url2 = new URL(request2.url);
      const branchId = url2.searchParams.get("branch_id") ?? "";
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)) {
        return json(400, { ok: false, error: { code: "INVALID_BRANCH" } }, requestId2, origin2);
      }
      const actor = await resolveNotificationActor(request2, env3, branchId, requestId2, origin2);
      if (actor instanceof Response) return actor;
      const rawLimit = url2.searchParams.get("limit");
      const parsedLimit = rawLimit === null ? 30 : Number(rawLimit);
      const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(50, parsedLimit)) : 30;
      const [items, unread] = await Promise.all([
        env3.DB.prepare(`
      SELECT id, category, title, body, target_type, target_id, created_at, read_at
      FROM staff_notification
      WHERE recipient_user_id = ? AND branch_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).bind(actor.actorUserId, branchId, limit).all(),
        env3.DB.prepare(`
      SELECT COUNT(*) AS unread_count
      FROM staff_notification
      WHERE recipient_user_id = ? AND branch_id = ? AND read_at IS NULL
    `).bind(actor.actorUserId, branchId).first()
      ]);
      return json(200, {
        ok: true,
        data: { notifications: items.results ?? [], unread_count: unread?.unread_count ?? 0 }
      }, requestId2, origin2);
    }
    __name(listStaffNotifications, "listStaffNotifications");
    async function markStaffNotificationsRead(request2, env3, branchId, notificationId, requestId2, origin2) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(branchId)) {
        return json(400, { ok: false, error: { code: "INVALID_BRANCH" } }, requestId2, origin2);
      }
      const actor = await resolveNotificationActor(request2, env3, branchId, requestId2, origin2);
      if (actor instanceof Response) return actor;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      if (notificationId === null) {
        const result2 = await env3.DB.prepare(`
      UPDATE staff_notification
      SET read_at = ?
      WHERE recipient_user_id = ? AND branch_id = ? AND read_at IS NULL
    `).bind(now, actor.actorUserId, branchId).run();
        return json(200, {
          ok: true,
          data: { updated_count: result2.meta?.changes ?? 0 }
        }, requestId2, origin2);
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(notificationId)) {
        return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId2, origin2);
      }
      const result = await env3.DB.prepare(`
    UPDATE staff_notification
    SET read_at = ?
    WHERE id = ? AND recipient_user_id = ? AND branch_id = ? AND read_at IS NULL
  `).bind(now, notificationId, actor.actorUserId, branchId).run();
      return json(200, {
        ok: true,
        data: { updated: (result.meta?.changes ?? 0) === 1 }
      }, requestId2, origin2);
    }
    __name(markStaffNotificationsRead, "markStaffNotificationsRead");
    async function listPrayerQueue(request2, env3, requestId2, origin2) {
      const context2 = await resolveStaffContext(request2, env3);
      if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId2, origin2);
      if (!context2.activeBranch) return mapCapabilityFailure("branch_required", requestId2, origin2);
      if (!hasScopedGrant(context2, "prayer.request.share", "branch")) {
        return json(403, { ok: false, error: { code: "PRAYER_QUEUE_NOT_AUTHORIZED" } }, requestId2, origin2);
      }
      const url2 = new URL(request2.url);
      const rawLimit = url2.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number(rawLimit);
      const rawOffset = url2.searchParams.get("offset");
      const offset = rawOffset === null ? 0 : Number(rawOffset);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1e5 || [...url2.searchParams.keys()].some((key) => key !== "limit" && key !== "offset")) {
        return json(400, { ok: false, error: { code: "INVALID_PRAYER_QUEUE_QUERY" } }, requestId2, origin2);
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const actorAuthorized = `
    EXISTS (
      SELECT 1
      FROM staff_profile actor
      JOIN staff_role_assignment ra ON ra.staff_profile_id = actor.id
      JOIN role r ON r.id = ra.role_id AND r.is_active = 1
      JOIN role_capability rc ON rc.role_id = r.id
      JOIN capability cap ON cap.id = rc.capability_id AND cap.is_active = 1
      WHERE actor.id = ? AND actor.account_status = 'active'
        AND ra.branch_id = prayer_request.branch_id
        AND ra.revoked_at IS NULL AND ra.starts_at <= ?
        AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        AND cap.code = 'prayer.request.share' AND rc.scope_mode = 'branch'
    )
  `;
      const batch = await env3.DB.batch([
        env3.DB.prepare(`
      INSERT INTO prayer_access_audit
        (id, prayer_request_id, branch_id, actor_user_id, action, reason, request_id, accessed_at, safe_metadata)
      SELECT 'prayer-queue-' || lower(hex(randomblob(16))), prayer_request.id,
             prayer_request.branch_id, ?, 'read',
             'Prayer queue metadata accessed for assignment', ?, ?,
             json_object('projection', 'metadata_only')
      FROM prayer_request
      WHERE prayer_request.branch_id = ?
        AND prayer_request.status IN ('open','assigned','in_progress')
        AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
        AND ${actorAuthorized}
      ORDER BY prayer_request.created_at ASC, prayer_request.id ASC
      LIMIT ?
    `).bind(
          context2.staff.userId,
          requestId2,
          now,
          context2.activeBranch.branchId,
          now,
          context2.staff.profileId,
          now,
          now,
          limit
        ),
        env3.DB.prepare(`
      INSERT INTO sensitive_record_access_audit
        (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
      SELECT 'prayer-queue-meta-' || lower(hex(randomblob(16))),
             prayer_request.branch_id, ?, 'prayer_request', prayer_request.id,
             'read', 'Admin/Pastor accessed prayer queue metadata for assignment', NULL, ?
      FROM prayer_request
      WHERE prayer_request.branch_id = ?
        AND prayer_request.status IN ('open','assigned','in_progress')
        AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
        AND ${actorAuthorized}
      ORDER BY prayer_request.created_at ASC, prayer_request.id ASC
      LIMIT ?
    `).bind(
          context2.staff.profileId,
          now,
          context2.activeBranch.branchId,
          now,
          context2.staff.profileId,
          now,
          now,
          limit
        ),
        env3.DB.prepare(`
      SELECT id, status, sensitivity, expires_at, created_at, updated_at
      FROM prayer_request
      WHERE branch_id = ?
        AND status IN ('open','assigned','in_progress')
        AND (expires_at IS NULL OR expires_at > ?)
        AND ${actorAuthorized}
      ORDER BY created_at ASC, id ASC
      LIMIT ?
    `).bind(
          context2.activeBranch.branchId,
          now,
          context2.staff.profileId,
          now,
          now,
          limit
        )
      ]);
      const rows = batch[2]?.results ?? [];
      if (!batch[0]?.success || !batch[1]?.success || (batch[0]?.meta?.changes ?? 0) !== rows.length || (batch[1]?.meta?.changes ?? 0) !== rows.length) {
        return json(503, { ok: false, error: { code: "PRAYER_QUEUE_AUDIT_FAILED" } }, requestId2, origin2);
      }
      return json(200, { ok: true, requests: rows }, requestId2, origin2);
    }
    __name(listPrayerQueue, "listPrayerQueue");
    async function listAssignedPrayerRequests(request2, env3, requestId2, origin2) {
      const context2 = await resolveStaffContext(request2, env3);
      if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId2, origin2);
      if (!context2.activeBranch) return mapCapabilityFailure("branch_required", requestId2, origin2);
      if (!hasScopedGrant(context2, "prayer.request.read", "explicit_share")) {
        return json(403, { ok: false, error: { code: "PRAYER_ASSIGNMENT_READ_NOT_AUTHORIZED" } }, requestId2, origin2);
      }
      const url2 = new URL(request2.url);
      const rawLimit = url2.searchParams.get("limit");
      const limit = rawLimit === null ? 50 : Number(rawLimit);
      const rawOffset = url2.searchParams.get("offset");
      const offset = rawOffset === null ? 0 : Number(rawOffset);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 1e5 || [...url2.searchParams.keys()].some((key) => key !== "limit" && key !== "offset")) {
        return json(400, { ok: false, error: { code: "INVALID_ASSIGNED_PRAYER_QUERY" } }, requestId2, origin2);
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const activeShareAndAssignment = `
    prayer_assignment.intercessor_user_id = ?
    AND prayer_assignment.branch_id = prayer_request.branch_id
    AND prayer_assignment.revoked_at IS NULL
    AND prayer_assignment.starts_at <= ?
    AND (prayer_assignment.ends_at IS NULL OR prayer_assignment.ends_at > ?)
    AND staff_record_share.staff_profile_id = ?
    AND staff_record_share.record_type = 'prayer_request'
    AND staff_record_share.record_id = prayer_request.id
    AND staff_record_share.branch_id = prayer_request.branch_id
    AND staff_record_share.revoked_at IS NULL
    AND staff_record_share.starts_at <= ?
    AND (staff_record_share.ends_at IS NULL OR staff_record_share.ends_at > ?)
    AND EXISTS (
      SELECT 1
      FROM staff_role_assignment ra
      JOIN role r ON r.id = ra.role_id AND r.is_active = 1
      JOIN role_capability rc ON rc.role_id = r.id
      JOIN capability cap ON cap.id = rc.capability_id AND cap.is_active = 1
      WHERE ra.staff_profile_id = ?
        AND ra.branch_id = prayer_request.branch_id
        AND ra.revoked_at IS NULL
        AND ra.starts_at <= ?
        AND (ra.ends_at IS NULL OR ra.ends_at > ?)
        AND cap.code = 'prayer.request.read'
        AND rc.scope_mode = 'explicit_share'
    )
  `;
      const batch = await env3.DB.batch([
        env3.DB.prepare(`
      INSERT INTO prayer_access_audit
        (id, prayer_request_id, branch_id, actor_user_id, action, reason, request_id, accessed_at, safe_metadata)
      SELECT 'prayer-read-' || lower(hex(randomblob(16))), prayer_request.id,
             prayer_request.branch_id, ?, 'read',
             'Assigned intercessor read through explicit share', ?, ?,
             json_object('access_mode', 'explicit_share')
      FROM prayer_request
      JOIN prayer_assignment ON prayer_assignment.prayer_request_id = prayer_request.id
      JOIN staff_record_share ON staff_record_share.record_id = prayer_request.id
      WHERE prayer_request.branch_id = ?
        AND prayer_request.status IN ('assigned','in_progress','answered')
        AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
        AND ${activeShareAndAssignment}
      ORDER BY prayer_request.created_at DESC, prayer_request.id DESC
      LIMIT ? OFFSET ?
    `).bind(
          context2.staff.userId,
          requestId2,
          now,
          context2.activeBranch.branchId,
          now,
          context2.staff.userId,
          now,
          now,
          context2.staff.profileId,
          now,
          now,
          context2.staff.profileId,
          now,
          now,
          limit,
          offset
        ),
        env3.DB.prepare(`
      INSERT INTO sensitive_record_access_audit
        (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
      SELECT 'prayer-read-meta-' || lower(hex(randomblob(16))),
             prayer_request.branch_id, ?, 'prayer_request', prayer_request.id,
             'read', 'Assigned intercessor accessed narrative through explicit share',
             staff_record_share.id, ?
      FROM prayer_request
      JOIN prayer_assignment ON prayer_assignment.prayer_request_id = prayer_request.id
      JOIN staff_record_share ON staff_record_share.record_id = prayer_request.id
      WHERE prayer_request.branch_id = ?
        AND prayer_request.status IN ('assigned','in_progress','answered')
        AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
        AND ${activeShareAndAssignment}
      ORDER BY prayer_request.created_at DESC, prayer_request.id DESC
      LIMIT ? OFFSET ?
    `).bind(
          context2.staff.profileId,
          now,
          context2.activeBranch.branchId,
          now,
          context2.staff.userId,
          now,
          now,
          context2.staff.profileId,
          now,
          now,
          context2.staff.profileId,
          now,
          now,
          limit,
          offset
        ),
        env3.DB.prepare(`
      SELECT prayer_request.id, prayer_request.request_text, prayer_request.status,
             prayer_request.sensitivity, prayer_request.expires_at,
             prayer_request.answered_at, prayer_request.created_at, prayer_request.updated_at
      FROM prayer_request
      JOIN prayer_assignment ON prayer_assignment.prayer_request_id = prayer_request.id
      JOIN staff_record_share ON staff_record_share.record_id = prayer_request.id
      WHERE prayer_request.branch_id = ?
        AND prayer_request.status IN ('assigned','in_progress','answered')
        AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
        AND ${activeShareAndAssignment}
      ORDER BY prayer_request.created_at DESC, prayer_request.id DESC
      LIMIT ? OFFSET ?
    `).bind(
          context2.activeBranch.branchId,
          now,
          context2.staff.userId,
          now,
          now,
          context2.staff.profileId,
          now,
          now,
          context2.staff.profileId,
          now,
          now,
          limit,
          offset
        )
      ]);
      const rows = batch[2]?.results ?? [];
      if (!batch[0]?.success || !batch[1]?.success || (batch[0]?.meta?.changes ?? 0) !== rows.length || (batch[1]?.meta?.changes ?? 0) !== rows.length) {
        return json(503, { ok: false, error: { code: "PRAYER_READ_AUDIT_FAILED" } }, requestId2, origin2);
      }
      const totalRow = await env3.DB.prepare(`
    SELECT COUNT(*) AS total
    FROM prayer_request
    JOIN prayer_assignment ON prayer_assignment.prayer_request_id = prayer_request.id
    JOIN staff_record_share ON staff_record_share.record_id = prayer_request.id
    WHERE prayer_request.branch_id = ?
      AND prayer_request.status IN ('assigned','in_progress','answered')
      AND (prayer_request.expires_at IS NULL OR prayer_request.expires_at > ?)
      AND ${activeShareAndAssignment}
  `).bind(
        context2.activeBranch.branchId,
        now,
        context2.staff.userId,
        now,
        now,
        context2.staff.profileId,
        now,
        now,
        context2.staff.profileId,
        now,
        now
      ).first();
      return json(200, {
        ok: true,
        data: { requests: rows, total: totalRow?.total ?? 0, limit, offset }
      }, requestId2, origin2);
    }
    __name(listAssignedPrayerRequests, "listAssignedPrayerRequests");
    async function sharePrayerRequest(request2, env3, prayerRequestId, requestId2, origin2) {
      const access = await authorizeRequestCapability(request2, env3, "prayer.request.share");
      if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId2, origin2);
      const body = await readJsonBody(request2);
      if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId2, origin2);
      const payload = body.value;
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => !["staff_profile_id", "purpose", "starts_at", "ends_at"].includes(key))) {
        return json(400, { ok: false, error: { code: "INVALID_PRAYER_SHARE_BODY" } }, requestId2, origin2);
      }
      const recipientProfileId = typeof payload.staff_profile_id === "string" ? payload.staff_profile_id.trim() : "";
      const purpose = typeof payload.purpose === "string" ? payload.purpose.trim() : "";
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const startsAt = parseIsoTimestamp(payload.starts_at, now);
      const endsAt = payload.ends_at === void 0 || payload.ends_at === null || payload.ends_at === "" ? null : parseIsoTimestamp(payload.ends_at, "");
      if (!recipientProfileId || recipientProfileId.length > 128 || purpose.length < 10 || purpose.length > 300 || !startsAt || startsAt < now || payload.ends_at !== void 0 && payload.ends_at !== null && payload.ends_at !== "" && !endsAt || endsAt !== null && endsAt <= startsAt) {
        return json(400, { ok: false, error: { code: "INVALID_PRAYER_SHARE_DETAILS" } }, requestId2, origin2);
      }
      const requestRow = await env3.DB.prepare(`
    SELECT id FROM prayer_request
    WHERE id = ? AND branch_id = ? AND status IN ('open','assigned','in_progress')
      AND (expires_at IS NULL OR expires_at > ?)
    LIMIT 1
  `).bind(prayerRequestId, access.activeBranch.branchId, now).first();
      if (!requestRow) return json(404, { ok: false, error: { code: "PRAYER_REQUEST_NOT_AVAILABLE" } }, requestId2, origin2);
      const recipient = await env3.DB.prepare(`
    SELECT sp.id, sp.auth_user_id
    FROM staff_profile sp
    JOIN staff_role_assignment ra ON ra.staff_profile_id = sp.id
    JOIN role r ON r.id = ra.role_id AND r.is_active = 1
    WHERE sp.id = ? AND sp.account_status = 'active'
      AND r.code = 'prayer_intercessor'
      AND ra.branch_id = ? AND ra.revoked_at IS NULL
      AND ra.starts_at <= ? AND (ra.ends_at IS NULL OR ra.ends_at > ?)
    LIMIT 1
  `).bind(recipientProfileId, access.activeBranch.branchId, now, now).first();
      if (!recipient) return json(400, { ok: false, error: { code: "RECIPIENT_NOT_ACTIVE_INTERCESSOR" } }, requestId2, origin2);
      const shareId = crypto.randomUUID();
      const assignmentId = crypto.randomUUID();
      try {
        const results = await env3.DB.batch([
          env3.DB.prepare(`
        INSERT INTO staff_record_share
          (id, branch_id, record_type, record_id, staff_profile_id, granted_by,
           purpose, starts_at, ends_at, created_at)
        SELECT ?, p.branch_id, 'prayer_request', p.id, ?, ?, ?, ?, ?, ?
        FROM prayer_request p
        WHERE p.id = ? AND p.branch_id = ?
          AND p.status IN ('open','assigned','in_progress')
          AND (p.expires_at IS NULL OR p.expires_at > ?)
      `).bind(
            shareId,
            recipient.id,
            access.staff.profileId,
            purpose,
            startsAt,
            endsAt,
            now,
            prayerRequestId,
            access.activeBranch.branchId,
            now
          ),
          env3.DB.prepare(`
        INSERT INTO prayer_assignment
          (id, prayer_request_id, branch_id, intercessor_user_id, assigned_by, starts_at, ends_at, created_at)
        SELECT ?, p.id, p.branch_id, ?, ?, ?, ?, ?
        FROM prayer_request p
        JOIN staff_record_share s
          ON s.record_type = 'prayer_request' AND s.record_id = p.id
         AND s.branch_id = p.branch_id AND s.staff_profile_id = ?
         AND s.revoked_at IS NULL
        WHERE p.id = ? AND p.branch_id = ?
      `).bind(
            assignmentId,
            recipient.auth_user_id,
            access.staff.userId,
            startsAt,
            endsAt,
            now,
            recipient.id,
            prayerRequestId,
            access.activeBranch.branchId
          ),
          env3.DB.prepare(`
        UPDATE prayer_request SET status = 'assigned', updated_at = ?
        WHERE id = ? AND branch_id = ? AND status = 'open'
      `).bind(now, prayerRequestId, access.activeBranch.branchId)
        ]);
        if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1) {
          throw new Error("PRAYER_SHARE_CREATE_FAILED");
        }
      } catch {
        return json(409, { ok: false, error: { code: "PRAYER_SHARE_CONFLICT" } }, requestId2, origin2);
      }
      return json(201, {
        ok: true,
        share_id: shareId,
        assignment_id: assignmentId,
        staff_profile_id: recipient.id,
        starts_at: startsAt,
        ends_at: endsAt
      }, requestId2, origin2);
    }
    __name(sharePrayerRequest, "sharePrayerRequest");
    async function revokePrayerShare(request2, env3, prayerRequestId, shareId, requestId2, origin2) {
      const access = await authorizeRequestCapability(request2, env3, "prayer.request.share");
      if (access.state !== "authorized") return mapCapabilityFailure(access.state, requestId2, origin2);
      const body = await readJsonBody(request2);
      if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId2, origin2);
      const payload = body.value;
      const reason = payload && typeof payload === "object" && !Array.isArray(payload) && typeof payload.reason === "string" ? payload.reason.trim() : "";
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "reason") || reason.length < 10 || reason.length > 300) {
        return json(400, { ok: false, error: { code: "INVALID_PRAYER_SHARE_REVOCATION" } }, requestId2, origin2);
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      try {
        const results = await env3.DB.batch([
          env3.DB.prepare(`
        UPDATE staff_record_share
        SET revoked_at = ?, revoked_by = ?, revocation_reason = ?
        WHERE id = ? AND branch_id = ? AND record_type = 'prayer_request'
          AND record_id = ? AND revoked_at IS NULL
      `).bind(
            now,
            access.staff.profileId,
            reason,
            shareId,
            access.activeBranch.branchId,
            prayerRequestId
          ),
          env3.DB.prepare(`
        UPDATE prayer_assignment
        SET revoked_at = ?, revoked_by = ?, revocation_reason = ?
        WHERE prayer_request_id = ? AND branch_id = ?
          AND intercessor_user_id = (
            SELECT recipient.auth_user_id
            FROM staff_record_share s
            JOIN staff_profile recipient ON recipient.id = s.staff_profile_id
            WHERE s.id = ? AND s.revoked_at = ?
          )
          AND revoked_at IS NULL
      `).bind(
            now,
            access.staff.userId,
            reason,
            prayerRequestId,
            access.activeBranch.branchId,
            shareId,
            now
          )
        ]);
        if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1) {
          return json(404, { ok: false, error: { code: "ACTIVE_PRAYER_SHARE_NOT_FOUND" } }, requestId2, origin2);
        }
      } catch {
        return json(409, { ok: false, error: { code: "PRAYER_SHARE_REVOCATION_CONFLICT" } }, requestId2, origin2);
      }
      return json(200, { ok: true, share_id: shareId, revoked_at: now }, requestId2, origin2);
    }
    __name(revokePrayerShare, "revokePrayerShare");
    async function updatePrayerRequestStatus(request2, env3, prayerRequestId, requestId2, origin2) {
      const context2 = await resolveStaffContext(request2, env3);
      if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId2, origin2);
      if (!context2.activeBranch) return mapCapabilityFailure("branch_required", requestId2, origin2);
      if (!hasScopedGrant(context2, "prayer.request.respond", "explicit_share")) {
        return json(403, { ok: false, error: { code: "PRAYER_RESPONSE_NOT_AUTHORIZED" } }, requestId2, origin2);
      }
      const body = await readJsonBody(request2);
      if (!body.ok) return json(body.status, { ok: false, error: { code: body.status === 413 ? "REQUEST_TOO_LARGE" : "INVALID_JSON" } }, requestId2, origin2);
      const payload = body.value;
      if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length !== 1 || typeof payload.status !== "string" || !["in_progress", "answered"].includes(payload.status)) {
        return json(400, { ok: false, error: { code: "INVALID_PRAYER_STATUS" } }, requestId2, origin2);
      }
      const nextStatus = payload.status;
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const results = await env3.DB.batch([
        env3.DB.prepare(`
      UPDATE prayer_request
      SET status = ?, answered_at = CASE WHEN ? = 'answered' THEN ? ELSE NULL END,
          updated_at = ?
      WHERE id = ? AND branch_id = ?
        AND status IN ('open','assigned','in_progress')
        AND (expires_at IS NULL OR expires_at > ?)
        AND EXISTS (
          SELECT 1 FROM prayer_assignment pa
          WHERE pa.prayer_request_id = prayer_request.id
            AND pa.branch_id = prayer_request.branch_id
            AND pa.intercessor_user_id = ?
            AND pa.revoked_at IS NULL
            AND pa.starts_at <= ? AND (pa.ends_at IS NULL OR pa.ends_at > ?)
        )
        AND EXISTS (
          SELECT 1 FROM staff_record_share s
          WHERE s.record_type = 'prayer_request' AND s.record_id = prayer_request.id
            AND s.branch_id = prayer_request.branch_id
            AND s.staff_profile_id = ?
            AND s.revoked_at IS NULL
            AND s.starts_at <= ? AND (s.ends_at IS NULL OR s.ends_at > ?)
        )
        AND EXISTS (
          SELECT 1 FROM staff_role_assignment ra
          JOIN role r ON r.id = ra.role_id AND r.is_active = 1
          JOIN role_capability rc ON rc.role_id = r.id
          JOIN capability cap ON cap.id = rc.capability_id AND cap.is_active = 1
          JOIN staff_profile sp ON sp.id = ra.staff_profile_id
          WHERE sp.auth_user_id = ? AND sp.account_status = 'active'
            AND ra.branch_id = prayer_request.branch_id
            AND ra.revoked_at IS NULL AND ra.starts_at <= ?
            AND (ra.ends_at IS NULL OR ra.ends_at > ?)
            AND cap.code = 'prayer.request.respond' AND rc.scope_mode = 'explicit_share'
        )
    `).bind(
          nextStatus,
          nextStatus,
          now,
          now,
          prayerRequestId,
          context2.activeBranch.branchId,
          now,
          context2.staff.userId,
          now,
          now,
          context2.staff.profileId,
          now,
          now,
          context2.staff.userId,
          now,
          now
        ),
        env3.DB.prepare(`
      INSERT INTO prayer_access_audit
        (id, prayer_request_id, branch_id, actor_user_id, action, reason, request_id, accessed_at, safe_metadata)
      SELECT ?, prayer_request.id, prayer_request.branch_id, ?, 'update',
             'Assigned intercessor updated prayer status', ?, ?, ?
      FROM prayer_request
      WHERE prayer_request.id = ? AND prayer_request.branch_id = ?
        AND changes() = 1
    `).bind(
          crypto.randomUUID(),
          context2.staff.userId,
          requestId2,
          now,
          JSON.stringify({ status: nextStatus }),
          prayerRequestId,
          context2.activeBranch.branchId
        ),
        env3.DB.prepare(`
      INSERT INTO sensitive_record_access_audit
        (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
      SELECT 'prayer-status-' || lower(hex(randomblob(16))), p.branch_id, ?,
             'prayer_request', p.id, 'updated',
             'Assigned intercessor updated prayer request status', s.id, ?
      FROM prayer_request p
      JOIN staff_record_share s
        ON s.record_type = 'prayer_request' AND s.record_id = p.id
       AND s.branch_id = p.branch_id AND s.staff_profile_id = ?
      WHERE p.id = ? AND p.branch_id = ? AND p.status = ?
        AND changes() = 1
    `).bind(
          context2.staff.profileId,
          now,
          context2.staff.profileId,
          prayerRequestId,
          context2.activeBranch.branchId,
          nextStatus
        )
      ]);
      if (results.some((result) => !result.success) || (results[0]?.meta?.changes ?? 0) !== 1 || (results[1]?.meta?.changes ?? 0) !== 1 || (results[2]?.meta?.changes ?? 0) !== 1) {
        return json(404, { ok: false, error: { code: "ASSIGNED_PRAYER_REQUEST_NOT_FOUND" } }, requestId2, origin2);
      }
      return json(200, { ok: true, prayer_request_id: prayerRequestId, status: nextStatus }, requestId2, origin2);
    }
    __name(updatePrayerRequestStatus, "updatePrayerRequestStatus");
    async function readSensitivePrayerRequest(request2, env3, prayerRequestId, requestId2, origin2) {
      const context2 = await resolveStaffContext(request2, env3);
      if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId2, origin2);
      if (!context2.activeBranch) return mapCapabilityFailure("branch_required", requestId2, origin2);
      if (!isUuidValue(prayerRequestId)) return json(400, { ok: false, error: { code: "INVALID_PRAYER_REQUEST_ID" } }, requestId2, origin2);
      const body = await readJsonBody(request2, 4096);
      if (!body.ok || !isPlainObject(body.value)) return json(body.ok ? 400 : body.status, { ok: false, error: { code: "INVALID_PASTORAL_READ" } }, requestId2, origin2);
      const payload = body.value;
      if (Object.keys(payload).some((key) => !["branch_id", "access_mode", "reason_code"].includes(key)) || payload.branch_id !== context2.activeBranch.branchId || payload.access_mode !== "assigned" && payload.access_mode !== "oversight") {
        return json(400, { ok: false, error: { code: "INVALID_PASTORAL_READ" } }, requestId2, origin2);
      }
      const accessMode = payload.access_mode;
      const reasonCode = payload.reason_code;
      const reasons = ["pastoral_review", "continuity_of_care", "safeguarding_concern", "complaint_review", "administrative_review"];
      if (accessMode === "assigned" && reasonCode !== void 0 && reasonCode !== null || accessMode === "oversight" && (typeof reasonCode !== "string" || !reasons.includes(reasonCode))) {
        return json(400, { ok: false, error: { code: "OVERSIGHT_REASON_REQUIRED" } }, requestId2, origin2);
      }
      const requiredCapability = accessMode === "oversight" ? "prayer.oversight.read" : "prayer.request.read.assigned";
      const requiredScope = accessMode === "oversight" ? "oversight" : "assigned";
      if (!context2.activeBranch.capabilities.some((grant) => grant.code === requiredCapability && grant.scopeMode === requiredScope)) {
        return json(403, { ok: false, error: { code: "PASTORAL_READ_NOT_AUTHORIZED" } }, requestId2, origin2);
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const assignmentClause = accessMode === "assigned" ? `
    AND EXISTS (SELECT 1 FROM prayer_assignment pa
      WHERE pa.prayer_request_id = p.id AND pa.branch_id = p.branch_id
        AND pa.intercessor_user_id = ? AND pa.revoked_at IS NULL
        AND pa.starts_at <= ? AND (pa.ends_at IS NULL OR pa.ends_at > ?))
  ` : "";
      const assignmentValues = accessMode === "assigned" ? [context2.staff.userId, now, now] : [];
      let batch;
      try {
        batch = await env3.DB.batch([
          env3.DB.prepare(`
        INSERT INTO prayer_access_audit
          (id, prayer_request_id, branch_id, actor_user_id, action, reason, request_id, safe_metadata, accessed_at)
        SELECT ?, p.id, p.branch_id, ?, ?, ?, ?, json_object('access_mode', ?), ?
        FROM prayer_request p
        WHERE p.id = ? AND p.branch_id = ? AND (p.expires_at IS NULL OR p.expires_at > ?)
          ${assignmentClause}
      `).bind(
            crypto.randomUUID(),
            context2.staff.userId,
            accessMode === "oversight" ? "oversight" : "read",
            accessMode === "oversight" ? reasonCode : null,
            requestId2,
            accessMode,
            now,
            prayerRequestId,
            context2.activeBranch.branchId,
            now,
            ...assignmentValues
          ),
          env3.DB.prepare(`
        INSERT INTO sensitive_record_access_audit
          (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
        SELECT ?, p.branch_id, ?, 'prayer_request', p.id, 'read', ?, NULL, ?
        FROM prayer_request p
        WHERE p.id = ? AND p.branch_id = ? AND (p.expires_at IS NULL OR p.expires_at > ?)
          ${assignmentClause}
      `).bind(
            crypto.randomUUID(),
            context2.staff.profileId,
            accessMode === "oversight" ? "oversight:" + reasonCode : "assigned_prayer_read",
            now,
            prayerRequestId,
            context2.activeBranch.branchId,
            now,
            ...assignmentValues
          ),
          env3.DB.prepare(`
        SELECT p.id, p.branch_id, p.request_text, p.status, p.sensitivity,
               p.expires_at, p.answered_at, p.created_at, p.updated_at
        FROM prayer_request p
        WHERE p.id = ? AND p.branch_id = ? AND (p.expires_at IS NULL OR p.expires_at > ?)
          ${assignmentClause}
        LIMIT 1
      `).bind(prayerRequestId, context2.activeBranch.branchId, now, ...assignmentValues)
        ]);
      } catch {
        return json(503, { ok: false, error: { code: "PASTORAL_READ_AUDIT_FAILED" } }, requestId2, origin2);
      }
      const row = batch[2]?.results?.[0];
      if (!batch[0]?.success || !batch[1]?.success) {
        return json(503, { ok: false, error: { code: "PASTORAL_READ_AUDIT_FAILED" } }, requestId2, origin2);
      }
      const prayerAuditChanges = batch[0]?.meta?.changes ?? 0;
      const sensitiveAuditChanges = batch[1]?.meta?.changes ?? 0;
      if (!row && prayerAuditChanges === 0 && sensitiveAuditChanges === 0) {
        return json(404, { ok: false, error: { code: "PASTORAL_RECORD_NOT_FOUND" } }, requestId2, origin2);
      }
      if (prayerAuditChanges !== 1 || sensitiveAuditChanges !== 1 || !row) {
        return json(503, { ok: false, error: { code: "PASTORAL_READ_AUDIT_FAILED" } }, requestId2, origin2);
      }
      return json(200, { ok: true, data: { request: row } }, requestId2, origin2);
    }
    __name(readSensitivePrayerRequest, "readSensitivePrayerRequest");
    async function readSensitiveCareRecord(request2, env3, careRecordId, requestId2, origin2) {
      const context2 = await resolveStaffContext(request2, env3);
      if (context2.state !== "authenticated") return mapCapabilityFailure(context2.state, requestId2, origin2);
      if (!context2.activeBranch) return mapCapabilityFailure("branch_required", requestId2, origin2);
      if (!isUuidValue(careRecordId)) return json(400, { ok: false, error: { code: "INVALID_CARE_RECORD_ID" } }, requestId2, origin2);
      const body = await readJsonBody(request2, 4096);
      if (!body.ok || !isPlainObject(body.value)) return json(body.ok ? 400 : body.status, { ok: false, error: { code: "INVALID_PASTORAL_READ" } }, requestId2, origin2);
      const payload = body.value;
      if (Object.keys(payload).some((key) => !["branch_id", "access_mode", "reason_code"].includes(key)) || payload.branch_id !== context2.activeBranch.branchId || payload.access_mode !== "assigned" && payload.access_mode !== "oversight") {
        return json(400, { ok: false, error: { code: "INVALID_PASTORAL_READ" } }, requestId2, origin2);
      }
      const accessMode = payload.access_mode;
      const reasonCode = payload.reason_code;
      const reasons = ["pastoral_review", "continuity_of_care", "safeguarding_concern", "complaint_review", "administrative_review"];
      if (accessMode === "assigned" && reasonCode !== void 0 && reasonCode !== null || accessMode === "oversight" && (typeof reasonCode !== "string" || !reasons.includes(reasonCode))) {
        return json(400, { ok: false, error: { code: "OVERSIGHT_REASON_REQUIRED" } }, requestId2, origin2);
      }
      const requiredCapability = accessMode === "oversight" ? "care.oversight.read" : "care.record.read.assigned";
      const requiredScope = accessMode === "oversight" ? "oversight" : "assigned";
      if (!context2.activeBranch.capabilities.some((grant) => grant.code === requiredCapability && grant.scopeMode === requiredScope)) {
        return json(403, { ok: false, error: { code: "PASTORAL_READ_NOT_AUTHORIZED" } }, requestId2, origin2);
      }
      const now = (/* @__PURE__ */ new Date()).toISOString();
      const assignmentClause = accessMode === "assigned" ? `
    AND EXISTS (SELECT 1 FROM care_assignment ca
      WHERE ca.care_record_id = cr.id AND ca.branch_id = cr.branch_id
        AND ca.assignee_user_id = ? AND ca.revoked_at IS NULL
        AND ca.starts_at <= ? AND (ca.ends_at IS NULL OR ca.ends_at > ?))
  ` : "";
      const assignmentValues = accessMode === "assigned" ? [context2.staff.userId, now, now] : [];
      let batch;
      try {
        batch = await env3.DB.batch([
          env3.DB.prepare(`
        INSERT INTO care_access_audit
          (id, care_record_id, branch_id, actor_user_id, action, reason, request_id, safe_metadata, accessed_at)
        SELECT ?, cr.id, cr.branch_id, ?, ?, ?, ?, json_object('access_mode', ?), ?
        FROM care_record cr WHERE cr.id = ? AND cr.branch_id = ? ${assignmentClause}
      `).bind(
            crypto.randomUUID(),
            context2.staff.userId,
            accessMode === "oversight" ? "oversight" : "read",
            accessMode === "oversight" ? reasonCode : null,
            requestId2,
            accessMode,
            now,
            careRecordId,
            context2.activeBranch.branchId,
            ...assignmentValues
          ),
          env3.DB.prepare(`
        INSERT INTO sensitive_record_access_audit
          (id, branch_id, actor_profile_id, record_type, record_id, action, purpose, share_reference, created_at)
        SELECT ?, cr.branch_id, ?, 'pastoral_case', cr.id, 'read', ?, NULL, ?
        FROM care_record cr WHERE cr.id = ? AND cr.branch_id = ? ${assignmentClause}
      `).bind(
            crypto.randomUUID(),
            context2.staff.profileId,
            accessMode === "oversight" ? "oversight:" + reasonCode : "assigned_care_read",
            now,
            careRecordId,
            context2.activeBranch.branchId,
            ...assignmentValues
          ),
          env3.DB.prepare(`
        SELECT cr.id, cr.branch_id, cr.status, cr.reviewed_at, cr.created_at, cr.updated_at
        FROM care_record cr WHERE cr.id = ? AND cr.branch_id = ? ${assignmentClause} LIMIT 1
      `).bind(careRecordId, context2.activeBranch.branchId, ...assignmentValues),
          env3.DB.prepare(`
        SELECT ci.id, ci.interaction_type, ci.outcome_code, ci.restricted_note, ci.occurred_at
        FROM care_interaction ci JOIN care_record cr ON cr.id = ci.care_record_id
        WHERE ci.care_record_id = ? AND cr.branch_id = ? ${assignmentClause}
        ORDER BY ci.occurred_at DESC, ci.id DESC LIMIT 100
      `).bind(careRecordId, context2.activeBranch.branchId, ...assignmentValues)
        ]);
      } catch {
        return json(503, { ok: false, error: { code: "PASTORAL_READ_AUDIT_FAILED" } }, requestId2, origin2);
      }
      const record = batch[2]?.results?.[0];
      if (!batch[0]?.success || !batch[1]?.success) {
        return json(503, { ok: false, error: { code: "PASTORAL_READ_AUDIT_FAILED" } }, requestId2, origin2);
      }
      const careAuditChanges = batch[0]?.meta?.changes ?? 0;
      const sensitiveAuditChanges = batch[1]?.meta?.changes ?? 0;
      if (!record && careAuditChanges === 0 && sensitiveAuditChanges === 0) {
        return json(404, { ok: false, error: { code: "PASTORAL_RECORD_NOT_FOUND" } }, requestId2, origin2);
      }
      if (careAuditChanges !== 1 || sensitiveAuditChanges !== 1 || !record) {
        return json(503, { ok: false, error: { code: "PASTORAL_READ_AUDIT_FAILED" } }, requestId2, origin2);
      }
      const interactions = batch[3]?.results ?? [];
      return json(200, { ok: true, data: { record, interactions } }, requestId2, origin2);
    }
    __name(readSensitiveCareRecord, "readSensitiveCareRecord");
    if (url.pathname === "/api/v1/announcements" && (request.method === "GET" || request.method === "POST")) {
      return handleAnnouncementCollection(request, env2, requestId, origin);
    }
    const announcementMatch = url.pathname.match(/^\/api\/v1\/announcements\/([^/]+)$/);
    if (announcementMatch && (request.method === "GET" || request.method === "PATCH")) {
      let announcementId;
      try {
        announcementId = decodeURIComponent(announcementMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_ANNOUNCEMENT_ID" } }, requestId, origin);
      }
      return handleAnnouncementItem(request, env2, announcementId, requestId, origin);
    }
    if (url.pathname === "/api/v1/calendar/entries" && (request.method === "GET" || request.method === "POST")) {
      return handleCalendarCollection(request, env2, requestId, origin);
    }
    const calendarEntryMatch = url.pathname.match(/^\/api\/v1\/calendar\/entries\/([^/]+)$/);
    if (calendarEntryMatch && (request.method === "GET" || request.method === "PATCH")) {
      let calendarEntryId;
      try {
        calendarEntryId = decodeURIComponent(calendarEntryMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_CALENDAR_ENTRY_ID" } }, requestId, origin);
      }
      return handleCalendarEntry(request, env2, calendarEntryId, requestId, origin);
    }
    if (url.pathname === "/api/v1/events" && (request.method === "GET" || request.method === "POST")) {
      return handleEventCollection(request, env2, requestId, origin);
    }
    const eventItemRoute = url.pathname.match(/^\/api\/v1\/events\/([^/]+)$/);
    if (eventItemRoute && (request.method === "GET" || request.method === "PATCH")) {
      let eventId;
      try {
        eventId = decodeURIComponent(eventItemRoute[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_EVENT_ID" } }, requestId, origin);
      }
      return handleEventItem(request, env2, eventId, requestId, origin);
    }
    if (url.pathname.startsWith("/api/v1/events/") && (request.method === "GET" || request.method === "POST")) {
      return handleEventWorkspaceOperations(request, env2, requestId, origin);
    }
    if (url.pathname.startsWith("/api/v1/reports") && ["GET", "POST"].includes(request.method)) {
      return handleReportOperations(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/notifications" && request.method === "GET") {
      return listStaffNotifications(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/notifications/read-all" && request.method === "POST") {
      const body = await readJsonBody(request, 1024);
      if (!body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
        return json(body.ok ? 400 : body.status, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
      }
      const payload = body.value;
      if (Object.keys(payload).some((key) => key !== "branch_id") || typeof payload.branch_id !== "string") {
        return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
      }
      return markStaffNotificationsRead(request, env2, payload.branch_id, null, requestId, origin);
    }
    const notificationReadParts = url.pathname.split("/").filter(Boolean);
    if (notificationReadParts.length === 5 && notificationReadParts[0] === "api" && notificationReadParts[1] === "v1" && notificationReadParts[2] === "notifications" && notificationReadParts[4] === "read" && request.method === "POST") {
      const body = await readJsonBody(request, 1024);
      if (!body.ok || !body.value || typeof body.value !== "object" || Array.isArray(body.value)) {
        return json(body.ok ? 400 : body.status, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
      }
      const payload = body.value;
      if (Object.keys(payload).some((key) => key !== "branch_id") || typeof payload.branch_id !== "string") {
        return json(400, { ok: false, error: { code: "INVALID_REQUEST_BODY" } }, requestId, origin);
      }
      let notificationId;
      try {
        notificationId = decodeURIComponent(notificationReadParts[3]);
      } catch {
        return json(404, { ok: false, error: { code: "NOT_FOUND" } }, requestId, origin);
      }
      return markStaffNotificationsRead(request, env2, payload.branch_id, notificationId, requestId, origin);
    }
    if (url.pathname === "/api/v1/pastoral/prayer/queue" && request.method === "GET") {
      return listPrayerQueue(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/pastoral/prayer/assigned" && request.method === "GET") {
      return listAssignedPrayerRequests(request, env2, requestId, origin);
    }
    const pastoralPrayerReadMatch = url.pathname.match(/^\/api\/v1\/pastoral\/prayer\/requests\/([^/]+)\/read$/);
    if (pastoralPrayerReadMatch && request.method === "POST") {
      let prayerId;
      try {
        prayerId = decodeURIComponent(pastoralPrayerReadMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_PRAYER_REQUEST_ID" } }, requestId, origin);
      }
      return readSensitivePrayerRequest(request, env2, prayerId, requestId, origin);
    }
    const pastoralCareReadMatch = url.pathname.match(/^\/api\/v1\/pastoral\/care\/records\/([^/]+)\/read$/);
    if (pastoralCareReadMatch && request.method === "POST") {
      let careRecordId;
      try {
        careRecordId = decodeURIComponent(pastoralCareReadMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_CARE_RECORD_ID" } }, requestId, origin);
      }
      return readSensitiveCareRecord(request, env2, careRecordId, requestId, origin);
    }
    const prayerShareRevokeMatch = url.pathname.match(/^\/api\/v1\/pastoral\/prayer\/requests\/([^/]+)\/shares\/([^/]+)\/revoke$/);
    if (prayerShareRevokeMatch && request.method === "POST") {
      let prayerId;
      let shareId;
      try {
        prayerId = decodeURIComponent(prayerShareRevokeMatch[1]);
        shareId = decodeURIComponent(prayerShareRevokeMatch[2]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_PRAYER_SHARE_ID" } }, requestId, origin);
      }
      return revokePrayerShare(request, env2, prayerId, shareId, requestId, origin);
    }
    const prayerShareMatch = url.pathname.match(/^\/api\/v1\/pastoral\/prayer\/requests\/([^/]+)\/shares$/);
    if (prayerShareMatch && request.method === "POST") {
      let prayerId;
      try {
        prayerId = decodeURIComponent(prayerShareMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_PRAYER_REQUEST_ID" } }, requestId, origin);
      }
      return sharePrayerRequest(request, env2, prayerId, requestId, origin);
    }
    const prayerRequestMatch = url.pathname.match(/^\/api\/v1\/pastoral\/prayer\/requests\/([^/]+)$/);
    if (prayerRequestMatch && request.method === "PATCH") {
      let prayerId;
      try {
        prayerId = decodeURIComponent(prayerRequestMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_PRAYER_REQUEST_ID" } }, requestId, origin);
      }
      return updatePrayerRequestStatus(request, env2, prayerId, requestId, origin);
    }
    if (url.pathname === "/api/v1/followup/tasks" && request.method === "GET") {
      return listFollowupTasks(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/followup/tasks" && request.method === "POST") {
      return createFollowupTask(request, env2, requestId, origin);
    }
    const followupTaskAssignMatch = url.pathname.match(/^\/api\/v1\/followup\/tasks\/([^/]+)\/assign$/);
    if (followupTaskAssignMatch && request.method === "POST") {
      let taskId;
      try {
        taskId = decodeURIComponent(followupTaskAssignMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_TASK_ID" } }, requestId, origin);
      }
      return reassignFollowupTask(request, env2, taskId, requestId, origin);
    }
    const followupTaskMatch = url.pathname.match(/^\/api\/v1\/followup\/tasks\/([^/]+)$/);
    if (followupTaskMatch && request.method === "PATCH") {
      let taskId;
      try {
        taskId = decodeURIComponent(followupTaskMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_FOLLOWUP_TASK_ID" } }, requestId, origin);
      }
      return updateFollowupTask(request, env2, taskId, requestId, origin);
    }
    if (url.pathname === "/api/v1/contacts" && request.method === "GET") {
      return listContacts(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/contacts" && request.method === "POST") {
      return createContact(request, env2, requestId, origin);
    }
    const contactNotesMatch = url.pathname.match(/^\/api\/v1\/contacts\/([^/]+)\/notes$/);
    if (contactNotesMatch) {
      let contactId;
      try {
        contactId = decodeURIComponent(contactNotesMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin);
      }
      if (request.method === "GET") return listContactNotes(request, env2, contactId, requestId, origin);
      if (request.method === "POST") return createContactNote(request, env2, contactId, requestId, origin);
    }
    const contactMatch = url.pathname.match(/^\/api\/v1\/contacts\/([^/]+)$/);
    if (contactMatch) {
      let contactId;
      try {
        contactId = decodeURIComponent(contactMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin);
      }
      if (request.method === "GET") return getContact(request, env2, contactId, requestId, origin);
      if (request.method === "PATCH") return updateContact(request, env2, contactId, requestId, origin);
    }
    const contactAssignMatch = url.pathname.match(/^\/api\/v1\/contacts\/([^/]+)\/assign$/);
    if (contactAssignMatch && request.method === "POST") {
      let contactId;
      try {
        contactId = decodeURIComponent(contactAssignMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin);
      }
      return assignContact(request, env2, contactId, requestId, origin);
    }
    const interactionMatch = url.pathname.match(/^\/api\/v1\/contacts\/([^/]+)\/interactions$/);
    if (interactionMatch && (request.method === "GET" || request.method === "POST")) {
      let contactId;
      try {
        contactId = decodeURIComponent(interactionMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_CONTACT_ID" } }, requestId, origin);
      }
      if (request.method === "GET") return listContactInteractions(request, env2, contactId, requestId, origin);
      return createContactInteraction(request, env2, contactId, requestId, origin);
    }
    if (url.pathname === "/api/v1/auth/password-reset-requests" && request.method === "POST") {
      return requestStaffPasswordReset(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/auth/password/change" && request.method === "POST") {
      return completeStaffPasswordChange(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/admin/password-reset-requests" && request.method === "GET") {
      return listStaffPasswordResetRequests(request, env2, requestId, origin);
    }
    const passwordResetReviewMatch = url.pathname.match(/^\/api\/v1\/admin\/password-reset-requests\/([^/]+)\/(approve|deny)$/);
    if (passwordResetReviewMatch && request.method === "POST") {
      let resetId;
      try {
        resetId = decodeURIComponent(passwordResetReviewMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_RESET_REQUEST_ID" } }, requestId, origin);
      }
      return reviewStaffPasswordReset(request, env2, resetId, passwordResetReviewMatch[2], requestId, origin);
    }
    if (url.pathname === "/api/v1/staff/invitations" || url.pathname === "/api/v1/staff/invitations/accept" || url.pathname.startsWith("/api/v1/staff/invitations/")) {
      return json(410, { ok: false, error: { code: "STAFF_INVITATIONS_DISABLED" } }, requestId, origin);
    }
    if (url.pathname === "/api/v1/staff/accounts" && request.method === "POST") {
      return createStaffAccount(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/staff/audit" && request.method === "GET") {
      return listStaffAudit(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/staff" && request.method === "GET") {
      return listStaffDirectory(request, env2, requestId, origin);
    }
    const staffStatusMatch = url.pathname.match(/^\/api\/v1\/staff\/([^/]+)\/(deactivate|suspend|reactivate)$/);
    if (staffStatusMatch && request.method === "POST") {
      let profileId;
      try {
        profileId = decodeURIComponent(staffStatusMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_STAFF_TARGET" } }, requestId, origin);
      }
      return changeStaffAccountStatus(
        request,
        env2,
        profileId,
        staffStatusMatch[2],
        requestId,
        origin
      );
    }
    if (url.pathname === "/api/v1/staff/role-revocations" && request.method === "GET") {
      return listAdminRevocationRequests(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/staff/role-revocations" && request.method === "POST") {
      return createAdminRevocationRequest(request, env2, requestId, origin);
    }
    const revocationReviewMatch = url.pathname.match(/^\/api\/v1\/staff\/role-revocations\/([^/]+)\/(approve|reject)$/);
    if (revocationReviewMatch && request.method === "POST") {
      let revocationId;
      try {
        revocationId = decodeURIComponent(revocationReviewMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_REVOCATION_REQUEST_ID" } }, requestId, origin);
      }
      return reviewAdminRevocationRequest(
        request,
        env2,
        revocationId,
        revocationReviewMatch[2],
        requestId,
        origin
      );
    }
    if (url.pathname === "/api/v1/staff/role-elevations" && request.method === "GET") {
      return listAdminElevationRequests(request, env2, requestId, origin);
    }
    if (url.pathname === "/api/v1/staff/role-elevations" && request.method === "POST") {
      return createAdminElevationRequest(request, env2, requestId, origin);
    }
    const elevationReviewMatch = url.pathname.match(/^\/api\/v1\/staff\/role-elevations\/([^/]+)\/(approve|reject)$/);
    if (elevationReviewMatch && request.method === "POST") {
      let elevationId;
      try {
        elevationId = decodeURIComponent(elevationReviewMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_ELEVATION_REQUEST_ID" } }, requestId, origin);
      }
      return reviewAdminElevationRequest(
        request,
        env2,
        elevationId,
        elevationReviewMatch[2],
        requestId,
        origin
      );
    }
    if (url.pathname === "/api/v1/staff/roles" && request.method === "POST") {
      return assignStaffRole(request, env2, requestId, origin);
    }
    const roleAssignmentMatch = url.pathname.match(/^\/api\/v1\/staff\/roles\/([^/]+)$/);
    if (roleAssignmentMatch && request.method === "DELETE") {
      let assignmentId;
      try {
        assignmentId = decodeURIComponent(roleAssignmentMatch[1]);
      } catch {
        return json(400, { ok: false, error: { code: "INVALID_ASSIGNMENT_ID" } }, requestId, origin);
      }
      return revokeStaffRole(request, env2, assignmentId, requestId, origin);
    }
    if (url.pathname === "/api/v1/teams" && request.method === "GET") {
      return listTeamOperationsCollection(request, env2, requestId, origin, "teams");
    }
    if (url.pathname === "/api/v1/areas" && request.method === "GET") {
      return listTeamOperationsCollection(request, env2, requestId, origin, "areas");
    }
    if (/^\/api\/v1\/(teams|areas)(\/[^/]+)?$/.test(url.pathname) && (request.method === "POST" || request.method === "PATCH")) {
      return handleTeamOperationsMutation(request, env2, requestId, origin);
    }
    if ((url.pathname.startsWith("/api/v1/teams/") || url.pathname.startsWith("/api/v1/areas/")) && (request.method === "POST" || request.method === "PATCH")) {
      return handleTeamMembershipOrCoverageMutation(request, env2, requestId, origin);
    }
    if (request.method !== "GET") {
      return json(405, {
        ok: false,
        error: { code: "METHOD_NOT_ALLOWED", message: "This endpoint is read-only." }
      }, requestId, origin);
    }
    if (url.pathname === "/health" || url.pathname === "/api/v1/health") {
      try {
        const result = await env2.DB.prepare(
          "SELECT schema_version, environment FROM app_meta WHERE id = 1 LIMIT 1"
        ).first();
        const expectedEnvironment = env2.APP_ENV;
        if (!result || expectedEnvironment !== "non-production" && expectedEnvironment !== "production" || result.environment !== expectedEnvironment) {
          return json(503, {
            ok: false,
            service: "pcg-missions-cloudflare-api",
            state: "database_not_initialized"
          }, requestId, origin);
        }
        return json(200, {
          ok: true,
          service: "pcg-missions-cloudflare-api",
          state: "ready",
          environment: result.environment,
          schema_version: result.schema_version
        }, requestId, origin);
      } catch {
        return json(503, {
          ok: false,
          service: "pcg-missions-cloudflare-api",
          state: "database_unavailable_or_migrations_missing"
        }, requestId, origin);
      }
    }
    if (url.pathname === "/api/v1/me") {
      try {
        const context2 = await resolveStaffContext(request, env2);
        if (context2.state === "unauthenticated") {
          return json(401, { ok: false, error: { code: "UNAUTHENTICATED" } }, requestId, origin);
        }
        if (context2.state === "auth_unavailable") {
          return json(503, { ok: false, error: { code: "AUTH_SERVICE_UNAVAILABLE" } }, requestId, origin);
        }
        if (context2.state === "staff_not_provisioned") {
          return json(403, { ok: false, error: { code: "STAFF_NOT_PROVISIONED" } }, requestId, origin);
        }
        if (context2.state === "staff_inactive") {
          return json(403, { ok: false, error: { code: "STAFF_ACCOUNT_INACTIVE" } }, requestId, origin);
        }
        if (context2.state === "branch_not_authorized") {
          return json(403, { ok: false, error: { code: "BRANCH_NOT_AUTHORIZED" } }, requestId, origin);
        }
        if (context2.state !== "authenticated") {
          return json(403, { ok: false, error: { code: "STAFF_CONTEXT_UNAVAILABLE" } }, requestId, origin);
        }
        if (context2.staff.branches.length === 0 && !context2.staff.mustChangePassword) {
          return json(403, { ok: false, error: { code: "NO_ACTIVE_BRANCH_ASSIGNMENT" } }, requestId, origin);
        }
        return json(200, {
          ok: true,
          data: {
            user: { id: context2.staff.userId, email: context2.staff.email || null },
            staff: {
              id: context2.staff.profileId,
              auth_user_id: context2.staff.userId,
              full_name: context2.staff.fullName,
              email: context2.staff.email || null,
              account_status: "active"
            },
            branches: context2.staff.branches,
            roles: context2.staff.roles,
            capabilities: context2.staff.capabilities,
            must_change_password: context2.staff.mustChangePassword,
            password_setup_expires_at: context2.staff.passwordSetupExpiresAt
          },
          active_branch: context2.activeBranch,
          branch_selection_required: context2.activeBranch === null && context2.staff.branches.length > 0
        }, requestId, origin);
      } catch {
        return json(503, {
          ok: false,
          error: { code: "STAFF_CONTEXT_UNAVAILABLE", message: "The staff session could not be verified." }
        }, requestId, origin);
      }
    }
    return json(404, {
      ok: false,
      error: { code: "ROUTE_NOT_FOUND", message: "This API route has not been implemented." }
    }, requestId, origin);
  }
};
export {
  index_default as default
};
//# sourceMappingURL=index.js.map
