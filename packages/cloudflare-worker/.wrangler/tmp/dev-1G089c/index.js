var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// .wrangler/tmp/bundle-yBwvft/checked-fetch.js
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
var urls;
var init_checked_fetch = __esm({
  ".wrangler/tmp/bundle-yBwvft/checked-fetch.js"() {
    urls = /* @__PURE__ */ new Set();
    __name(checkURL, "checkURL");
    globalThis.fetch = new Proxy(globalThis.fetch, {
      apply(target, thisArg, argArray) {
        const [request, init] = argArray;
        checkURL(request, init);
        return Reflect.apply(target, thisArg, argArray);
      }
    });
  }
});

// .wrangler/tmp/bundle-yBwvft/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
var init_strip_cf_connecting_ip_header = __esm({
  ".wrangler/tmp/bundle-yBwvft/strip-cf-connecting-ip-header.js"() {
    __name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
    globalThis.fetch = new Proxy(globalThis.fetch, {
      apply(target, thisArg, argArray) {
        return Reflect.apply(target, thisArg, [
          stripCfConnectingIPHeader.apply(null, argArray)
        ]);
      }
    });
  }
});

// wrangler-modules-watch:wrangler:modules-watch
var init_wrangler_modules_watch = __esm({
  "wrangler-modules-watch:wrangler:modules-watch"() {
    init_checked_fetch();
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
  }
});

// ../../node_modules/wrangler/templates/modules-watch-stub.js
var init_modules_watch_stub = __esm({
  "../../node_modules/wrangler/templates/modules-watch-stub.js"() {
    init_wrangler_modules_watch();
  }
});

// ../../node_modules/base64-js/index.js
var require_base64_js = __commonJS({
  "../../node_modules/base64-js/index.js"(exports) {
    "use strict";
    init_checked_fetch();
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    exports.byteLength = byteLength;
    exports.toByteArray = toByteArray;
    exports.fromByteArray = fromByteArray;
    var lookup2 = [];
    var revLookup = [];
    var Arr = typeof Uint8Array !== "undefined" ? Uint8Array : Array;
    var code = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    for (i2 = 0, len = code.length; i2 < len; ++i2) {
      lookup2[i2] = code[i2];
      revLookup[code.charCodeAt(i2)] = i2;
    }
    var i2;
    var len;
    revLookup["-".charCodeAt(0)] = 62;
    revLookup["_".charCodeAt(0)] = 63;
    function getLens(b64) {
      var len2 = b64.length;
      if (len2 % 4 > 0) {
        throw new Error("Invalid string. Length must be a multiple of 4");
      }
      var validLen = b64.indexOf("=");
      if (validLen === -1)
        validLen = len2;
      var placeHoldersLen = validLen === len2 ? 0 : 4 - validLen % 4;
      return [validLen, placeHoldersLen];
    }
    __name(getLens, "getLens");
    function byteLength(b64) {
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    __name(byteLength, "byteLength");
    function _byteLength(b64, validLen, placeHoldersLen) {
      return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
    }
    __name(_byteLength, "_byteLength");
    function toByteArray(b64) {
      var tmp;
      var lens = getLens(b64);
      var validLen = lens[0];
      var placeHoldersLen = lens[1];
      var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
      var curByte = 0;
      var len2 = placeHoldersLen > 0 ? validLen - 4 : validLen;
      var i3;
      for (i3 = 0; i3 < len2; i3 += 4) {
        tmp = revLookup[b64.charCodeAt(i3)] << 18 | revLookup[b64.charCodeAt(i3 + 1)] << 12 | revLookup[b64.charCodeAt(i3 + 2)] << 6 | revLookup[b64.charCodeAt(i3 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i3)] << 2 | revLookup[b64.charCodeAt(i3 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i3)] << 10 | revLookup[b64.charCodeAt(i3 + 1)] << 4 | revLookup[b64.charCodeAt(i3 + 2)] >> 2;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      return arr;
    }
    __name(toByteArray, "toByteArray");
    function tripletToBase64(num) {
      return lookup2[num >> 18 & 63] + lookup2[num >> 12 & 63] + lookup2[num >> 6 & 63] + lookup2[num & 63];
    }
    __name(tripletToBase64, "tripletToBase64");
    function encodeChunk(uint8, start, end) {
      var tmp;
      var output = [];
      for (var i3 = start; i3 < end; i3 += 3) {
        tmp = (uint8[i3] << 16 & 16711680) + (uint8[i3 + 1] << 8 & 65280) + (uint8[i3 + 2] & 255);
        output.push(tripletToBase64(tmp));
      }
      return output.join("");
    }
    __name(encodeChunk, "encodeChunk");
    function fromByteArray(uint8) {
      var tmp;
      var len2 = uint8.length;
      var extraBytes = len2 % 3;
      var parts = [];
      var maxChunkLength = 16383;
      for (var i3 = 0, len22 = len2 - extraBytes; i3 < len22; i3 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i3, i3 + maxChunkLength > len22 ? len22 : i3 + maxChunkLength));
      }
      if (extraBytes === 1) {
        tmp = uint8[len2 - 1];
        parts.push(
          lookup2[tmp >> 2] + lookup2[tmp << 4 & 63] + "=="
        );
      } else if (extraBytes === 2) {
        tmp = (uint8[len2 - 2] << 8) + uint8[len2 - 1];
        parts.push(
          lookup2[tmp >> 10] + lookup2[tmp >> 4 & 63] + lookup2[tmp << 2 & 63] + "="
        );
      }
      return parts.join("");
    }
    __name(fromByteArray, "fromByteArray");
  }
});

// .wrangler/tmp/bundle-yBwvft/middleware-loader.entry.ts
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// .wrangler/tmp/bundle-yBwvft/middleware-insertion-facade.js
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// src/index.ts
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/@cloudflare/ai/dist/index.js
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var e = __toESM(require_base64_js(), 1);

// ../../node_modules/mustache/mustache.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var objectToString = Object.prototype.toString;
var isArray = Array.isArray || /* @__PURE__ */ __name(function isArrayPolyfill(object) {
  return objectToString.call(object) === "[object Array]";
}, "isArrayPolyfill");
function isFunction(object) {
  return typeof object === "function";
}
__name(isFunction, "isFunction");
function typeStr(obj) {
  return isArray(obj) ? "array" : typeof obj;
}
__name(typeStr, "typeStr");
function escapeRegExp(string) {
  return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
}
__name(escapeRegExp, "escapeRegExp");
function hasProperty(obj, propName) {
  return obj != null && typeof obj === "object" && propName in obj;
}
__name(hasProperty, "hasProperty");
function primitiveHasOwnProperty(primitive, propName) {
  return primitive != null && typeof primitive !== "object" && primitive.hasOwnProperty && primitive.hasOwnProperty(propName);
}
__name(primitiveHasOwnProperty, "primitiveHasOwnProperty");
var regExpTest = RegExp.prototype.test;
function testRegExp(re, string) {
  return regExpTest.call(re, string);
}
__name(testRegExp, "testRegExp");
var nonSpaceRe = /\S/;
function isWhitespace(string) {
  return !testRegExp(nonSpaceRe, string);
}
__name(isWhitespace, "isWhitespace");
var entityMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;"
};
function escapeHtml(string) {
  return String(string).replace(/[&<>"'`=\/]/g, /* @__PURE__ */ __name(function fromEntityMap(s2) {
    return entityMap[s2];
  }, "fromEntityMap"));
}
__name(escapeHtml, "escapeHtml");
var whiteRe = /\s*/;
var spaceRe = /\s+/;
var equalsRe = /\s*=/;
var curlyRe = /\s*\}/;
var tagRe = /#|\^|\/|>|\{|&|=|!/;
function parseTemplate(template, tags) {
  if (!template)
    return [];
  var lineHasNonSpace = false;
  var sections = [];
  var tokens = [];
  var spaces = [];
  var hasTag = false;
  var nonSpace = false;
  var indentation = "";
  var tagIndex = 0;
  function stripSpace() {
    if (hasTag && !nonSpace) {
      while (spaces.length)
        delete tokens[spaces.pop()];
    } else {
      spaces = [];
    }
    hasTag = false;
    nonSpace = false;
  }
  __name(stripSpace, "stripSpace");
  var openingTagRe, closingTagRe, closingCurlyRe;
  function compileTags(tagsToCompile) {
    if (typeof tagsToCompile === "string")
      tagsToCompile = tagsToCompile.split(spaceRe, 2);
    if (!isArray(tagsToCompile) || tagsToCompile.length !== 2)
      throw new Error("Invalid tags: " + tagsToCompile);
    openingTagRe = new RegExp(escapeRegExp(tagsToCompile[0]) + "\\s*");
    closingTagRe = new RegExp("\\s*" + escapeRegExp(tagsToCompile[1]));
    closingCurlyRe = new RegExp("\\s*" + escapeRegExp("}" + tagsToCompile[1]));
  }
  __name(compileTags, "compileTags");
  compileTags(tags || mustache.tags);
  var scanner = new Scanner(template);
  var start, type, value, chr, token, openSection;
  while (!scanner.eos()) {
    start = scanner.pos;
    value = scanner.scanUntil(openingTagRe);
    if (value) {
      for (var i2 = 0, valueLength = value.length; i2 < valueLength; ++i2) {
        chr = value.charAt(i2);
        if (isWhitespace(chr)) {
          spaces.push(tokens.length);
          indentation += chr;
        } else {
          nonSpace = true;
          lineHasNonSpace = true;
          indentation += " ";
        }
        tokens.push(["text", chr, start, start + 1]);
        start += 1;
        if (chr === "\n") {
          stripSpace();
          indentation = "";
          tagIndex = 0;
          lineHasNonSpace = false;
        }
      }
    }
    if (!scanner.scan(openingTagRe))
      break;
    hasTag = true;
    type = scanner.scan(tagRe) || "name";
    scanner.scan(whiteRe);
    if (type === "=") {
      value = scanner.scanUntil(equalsRe);
      scanner.scan(equalsRe);
      scanner.scanUntil(closingTagRe);
    } else if (type === "{") {
      value = scanner.scanUntil(closingCurlyRe);
      scanner.scan(curlyRe);
      scanner.scanUntil(closingTagRe);
      type = "&";
    } else {
      value = scanner.scanUntil(closingTagRe);
    }
    if (!scanner.scan(closingTagRe))
      throw new Error("Unclosed tag at " + scanner.pos);
    if (type == ">") {
      token = [type, value, start, scanner.pos, indentation, tagIndex, lineHasNonSpace];
    } else {
      token = [type, value, start, scanner.pos];
    }
    tagIndex++;
    tokens.push(token);
    if (type === "#" || type === "^") {
      sections.push(token);
    } else if (type === "/") {
      openSection = sections.pop();
      if (!openSection)
        throw new Error('Unopened section "' + value + '" at ' + start);
      if (openSection[1] !== value)
        throw new Error('Unclosed section "' + openSection[1] + '" at ' + start);
    } else if (type === "name" || type === "{" || type === "&") {
      nonSpace = true;
    } else if (type === "=") {
      compileTags(value);
    }
  }
  stripSpace();
  openSection = sections.pop();
  if (openSection)
    throw new Error('Unclosed section "' + openSection[1] + '" at ' + scanner.pos);
  return nestTokens(squashTokens(tokens));
}
__name(parseTemplate, "parseTemplate");
function squashTokens(tokens) {
  var squashedTokens = [];
  var token, lastToken;
  for (var i2 = 0, numTokens = tokens.length; i2 < numTokens; ++i2) {
    token = tokens[i2];
    if (token) {
      if (token[0] === "text" && lastToken && lastToken[0] === "text") {
        lastToken[1] += token[1];
        lastToken[3] = token[3];
      } else {
        squashedTokens.push(token);
        lastToken = token;
      }
    }
  }
  return squashedTokens;
}
__name(squashTokens, "squashTokens");
function nestTokens(tokens) {
  var nestedTokens = [];
  var collector = nestedTokens;
  var sections = [];
  var token, section;
  for (var i2 = 0, numTokens = tokens.length; i2 < numTokens; ++i2) {
    token = tokens[i2];
    switch (token[0]) {
      case "#":
      case "^":
        collector.push(token);
        sections.push(token);
        collector = token[4] = [];
        break;
      case "/":
        section = sections.pop();
        section[5] = token[2];
        collector = sections.length > 0 ? sections[sections.length - 1][4] : nestedTokens;
        break;
      default:
        collector.push(token);
    }
  }
  return nestedTokens;
}
__name(nestTokens, "nestTokens");
function Scanner(string) {
  this.string = string;
  this.tail = string;
  this.pos = 0;
}
__name(Scanner, "Scanner");
Scanner.prototype.eos = /* @__PURE__ */ __name(function eos() {
  return this.tail === "";
}, "eos");
Scanner.prototype.scan = /* @__PURE__ */ __name(function scan(re) {
  var match = this.tail.match(re);
  if (!match || match.index !== 0)
    return "";
  var string = match[0];
  this.tail = this.tail.substring(string.length);
  this.pos += string.length;
  return string;
}, "scan");
Scanner.prototype.scanUntil = /* @__PURE__ */ __name(function scanUntil(re) {
  var index = this.tail.search(re), match;
  switch (index) {
    case -1:
      match = this.tail;
      this.tail = "";
      break;
    case 0:
      match = "";
      break;
    default:
      match = this.tail.substring(0, index);
      this.tail = this.tail.substring(index);
  }
  this.pos += match.length;
  return match;
}, "scanUntil");
function Context(view, parentContext) {
  this.view = view;
  this.cache = { ".": this.view };
  this.parent = parentContext;
}
__name(Context, "Context");
Context.prototype.push = /* @__PURE__ */ __name(function push(view) {
  return new Context(view, this);
}, "push");
Context.prototype.lookup = /* @__PURE__ */ __name(function lookup(name) {
  var cache = this.cache;
  var value;
  if (cache.hasOwnProperty(name)) {
    value = cache[name];
  } else {
    var context = this, intermediateValue, names, index, lookupHit = false;
    while (context) {
      if (name.indexOf(".") > 0) {
        intermediateValue = context.view;
        names = name.split(".");
        index = 0;
        while (intermediateValue != null && index < names.length) {
          if (index === names.length - 1)
            lookupHit = hasProperty(intermediateValue, names[index]) || primitiveHasOwnProperty(intermediateValue, names[index]);
          intermediateValue = intermediateValue[names[index++]];
        }
      } else {
        intermediateValue = context.view[name];
        lookupHit = hasProperty(context.view, name);
      }
      if (lookupHit) {
        value = intermediateValue;
        break;
      }
      context = context.parent;
    }
    cache[name] = value;
  }
  if (isFunction(value))
    value = value.call(this.view);
  return value;
}, "lookup");
function Writer() {
  this.templateCache = {
    _cache: {},
    set: /* @__PURE__ */ __name(function set(key, value) {
      this._cache[key] = value;
    }, "set"),
    get: /* @__PURE__ */ __name(function get(key) {
      return this._cache[key];
    }, "get"),
    clear: /* @__PURE__ */ __name(function clear() {
      this._cache = {};
    }, "clear")
  };
}
__name(Writer, "Writer");
Writer.prototype.clearCache = /* @__PURE__ */ __name(function clearCache() {
  if (typeof this.templateCache !== "undefined") {
    this.templateCache.clear();
  }
}, "clearCache");
Writer.prototype.parse = /* @__PURE__ */ __name(function parse(template, tags) {
  var cache = this.templateCache;
  var cacheKey = template + ":" + (tags || mustache.tags).join(":");
  var isCacheEnabled = typeof cache !== "undefined";
  var tokens = isCacheEnabled ? cache.get(cacheKey) : void 0;
  if (tokens == void 0) {
    tokens = parseTemplate(template, tags);
    isCacheEnabled && cache.set(cacheKey, tokens);
  }
  return tokens;
}, "parse");
Writer.prototype.render = /* @__PURE__ */ __name(function render(template, view, partials, config) {
  var tags = this.getConfigTags(config);
  var tokens = this.parse(template, tags);
  var context = view instanceof Context ? view : new Context(view, void 0);
  return this.renderTokens(tokens, context, partials, template, config);
}, "render");
Writer.prototype.renderTokens = /* @__PURE__ */ __name(function renderTokens(tokens, context, partials, originalTemplate, config) {
  var buffer = "";
  var token, symbol, value;
  for (var i2 = 0, numTokens = tokens.length; i2 < numTokens; ++i2) {
    value = void 0;
    token = tokens[i2];
    symbol = token[0];
    if (symbol === "#")
      value = this.renderSection(token, context, partials, originalTemplate, config);
    else if (symbol === "^")
      value = this.renderInverted(token, context, partials, originalTemplate, config);
    else if (symbol === ">")
      value = this.renderPartial(token, context, partials, config);
    else if (symbol === "&")
      value = this.unescapedValue(token, context);
    else if (symbol === "name")
      value = this.escapedValue(token, context, config);
    else if (symbol === "text")
      value = this.rawValue(token);
    if (value !== void 0)
      buffer += value;
  }
  return buffer;
}, "renderTokens");
Writer.prototype.renderSection = /* @__PURE__ */ __name(function renderSection(token, context, partials, originalTemplate, config) {
  var self = this;
  var buffer = "";
  var value = context.lookup(token[1]);
  function subRender(template) {
    return self.render(template, context, partials, config);
  }
  __name(subRender, "subRender");
  if (!value)
    return;
  if (isArray(value)) {
    for (var j = 0, valueLength = value.length; j < valueLength; ++j) {
      buffer += this.renderTokens(token[4], context.push(value[j]), partials, originalTemplate, config);
    }
  } else if (typeof value === "object" || typeof value === "string" || typeof value === "number") {
    buffer += this.renderTokens(token[4], context.push(value), partials, originalTemplate, config);
  } else if (isFunction(value)) {
    if (typeof originalTemplate !== "string")
      throw new Error("Cannot use higher-order sections without the original template");
    value = value.call(context.view, originalTemplate.slice(token[3], token[5]), subRender);
    if (value != null)
      buffer += value;
  } else {
    buffer += this.renderTokens(token[4], context, partials, originalTemplate, config);
  }
  return buffer;
}, "renderSection");
Writer.prototype.renderInverted = /* @__PURE__ */ __name(function renderInverted(token, context, partials, originalTemplate, config) {
  var value = context.lookup(token[1]);
  if (!value || isArray(value) && value.length === 0)
    return this.renderTokens(token[4], context, partials, originalTemplate, config);
}, "renderInverted");
Writer.prototype.indentPartial = /* @__PURE__ */ __name(function indentPartial(partial, indentation, lineHasNonSpace) {
  var filteredIndentation = indentation.replace(/[^ \t]/g, "");
  var partialByNl = partial.split("\n");
  for (var i2 = 0; i2 < partialByNl.length; i2++) {
    if (partialByNl[i2].length && (i2 > 0 || !lineHasNonSpace)) {
      partialByNl[i2] = filteredIndentation + partialByNl[i2];
    }
  }
  return partialByNl.join("\n");
}, "indentPartial");
Writer.prototype.renderPartial = /* @__PURE__ */ __name(function renderPartial(token, context, partials, config) {
  if (!partials)
    return;
  var tags = this.getConfigTags(config);
  var value = isFunction(partials) ? partials(token[1]) : partials[token[1]];
  if (value != null) {
    var lineHasNonSpace = token[6];
    var tagIndex = token[5];
    var indentation = token[4];
    var indentedValue = value;
    if (tagIndex == 0 && indentation) {
      indentedValue = this.indentPartial(value, indentation, lineHasNonSpace);
    }
    var tokens = this.parse(indentedValue, tags);
    return this.renderTokens(tokens, context, partials, indentedValue, config);
  }
}, "renderPartial");
Writer.prototype.unescapedValue = /* @__PURE__ */ __name(function unescapedValue(token, context) {
  var value = context.lookup(token[1]);
  if (value != null)
    return value;
}, "unescapedValue");
Writer.prototype.escapedValue = /* @__PURE__ */ __name(function escapedValue(token, context, config) {
  var escape = this.getConfigEscape(config) || mustache.escape;
  var value = context.lookup(token[1]);
  if (value != null)
    return typeof value === "number" && escape === mustache.escape ? String(value) : escape(value);
}, "escapedValue");
Writer.prototype.rawValue = /* @__PURE__ */ __name(function rawValue(token) {
  return token[1];
}, "rawValue");
Writer.prototype.getConfigTags = /* @__PURE__ */ __name(function getConfigTags(config) {
  if (isArray(config)) {
    return config;
  } else if (config && typeof config === "object") {
    return config.tags;
  } else {
    return void 0;
  }
}, "getConfigTags");
Writer.prototype.getConfigEscape = /* @__PURE__ */ __name(function getConfigEscape(config) {
  if (config && typeof config === "object" && !isArray(config)) {
    return config.escape;
  } else {
    return void 0;
  }
}, "getConfigEscape");
var mustache = {
  name: "mustache.js",
  version: "4.2.0",
  tags: ["{{", "}}"],
  clearCache: void 0,
  escape: void 0,
  parse: void 0,
  render: void 0,
  Scanner: void 0,
  Context: void 0,
  Writer: void 0,
  /**
   * Allows a user to override the default caching strategy, by providing an
   * object with set, get and clear methods. This can also be used to disable
   * the cache by setting it to the literal `undefined`.
   */
  set templateCache(cache) {
    defaultWriter.templateCache = cache;
  },
  /**
   * Gets the default or overridden caching object from the default writer.
   */
  get templateCache() {
    return defaultWriter.templateCache;
  }
};
var defaultWriter = new Writer();
mustache.clearCache = /* @__PURE__ */ __name(function clearCache2() {
  return defaultWriter.clearCache();
}, "clearCache");
mustache.parse = /* @__PURE__ */ __name(function parse2(template, tags) {
  return defaultWriter.parse(template, tags);
}, "parse");
mustache.render = /* @__PURE__ */ __name(function render2(template, view, partials, config) {
  if (typeof template !== "string") {
    throw new TypeError('Invalid template! Template should be a "string" but "' + typeStr(template) + '" was given as the first argument for mustache#render(template, view, partials)');
  }
  return defaultWriter.render(template, view, partials, config);
}, "render");
mustache.escape = escapeHtml;
mustache.Scanner = Scanner;
mustache.Context = Context;
mustache.Writer = Writer;
var mustache_default = mustache;

// ../../node_modules/@cloudflare/ai/dist/index.js
var s;
!function(e2) {
  e2.String = "str", e2.Bool = "bool", e2.Float16 = "float16", e2.Float32 = "float32", e2.Int16 = "int16", e2.Int32 = "int32", e2.Int64 = "int64", e2.Int8 = "int8", e2.Uint16 = "uint16", e2.Uint32 = "uint32", e2.Uint64 = "uint64", e2.Uint8 = "uint8";
}(s || (s = {}));
var n = Object.getPrototypeOf(Uint8Array);
function r(e2) {
  return Array.isArray(e2) || e2 instanceof n;
}
__name(r, "r");
function a(e2) {
  return e2 instanceof n ? e2.length : e2.flat(1 / 0).reduce((e3, t) => e3 + (t instanceof n ? t.length : 1), 0);
}
__name(a, "a");
function o(e2, t) {
  if (!r(t)) {
    switch (e2) {
      case s.Bool:
        if ("boolean" == typeof t)
          return;
        break;
      case s.Float16:
      case s.Float32:
        if ("number" == typeof t)
          return;
        break;
      case s.Int8:
      case s.Uint8:
      case s.Int16:
      case s.Uint16:
      case s.Int32:
      case s.Uint32:
        if (Number.isInteger(t))
          return;
        break;
      case s.Int64:
      case s.Uint64:
        if ("bigint" == typeof t)
          return;
        break;
      case s.String:
        if ("string" == typeof t)
          return;
    }
    throw new Error(`unexpected type "${e2}" with value "${t}".`);
  }
  t.forEach((t2) => o(e2, t2));
}
__name(o, "o");
function i(e2, t) {
  if (r(t))
    return [...t].map((t2) => i(e2, t2));
  switch (e2) {
    case s.String:
    case s.Bool:
    case s.Float16:
    case s.Float32:
    case s.Int8:
    case s.Uint8:
    case s.Int16:
    case s.Uint16:
    case s.Uint32:
    case s.Int32:
      return t;
    case s.Int64:
    case s.Uint64:
      return t.toString();
  }
  throw new Error(`unexpected type "${e2}" with value "${t}".`);
}
__name(i, "i");
function E(e2, t) {
  if (r(t))
    return t.map((t2) => E(e2, t2));
  switch (e2) {
    case s.String:
    case s.Bool:
    case s.Float16:
    case s.Float32:
    case s.Int8:
    case s.Uint8:
    case s.Int16:
    case s.Uint16:
    case s.Uint32:
    case s.Int32:
      return t;
    case s.Int64:
    case s.Uint64:
      return BigInt(t);
  }
  throw new Error(`unexpected type "${e2}" with value "${t}".`);
}
__name(E, "E");
var p = class {
  type;
  value;
  name;
  shape;
  constructor(e2, t, s2 = {}) {
    this.type = e2, this.value = t, s2.validate && o(e2, this.value), void 0 === s2.shape ? r(this.value) ? this.shape = [a(t)] : this.shape = [] : this.shape = s2.shape, s2.validate && function(e3, t2) {
      if (0 === e3.length && !r(t2))
        return;
      const s3 = e3.reduce((e4, t3) => {
        if (!Number.isInteger(t3))
          throw new Error(`expected shape to be array-like of integers but found non-integer element "${t3}"`);
        return e4 * t3;
      }, 1);
      if (s3 != a(t2))
        throw new Error(`invalid shape: expected ${s3} elements for shape ${e3} but value array has length ${t2.length}`);
    }(this.shape, this.value), this.name = s2.name || null;
  }
  static fromJSON(e2) {
    const { type: t, shape: s2, value: n2, b64Value: r2, name: a2 } = e2, o2 = { shape: s2, name: a2 };
    if (void 0 !== r2) {
      const e3 = function(e4, t2) {
        const s3 = atob(e4), n3 = new Uint8Array(s3.length);
        for (let e5 = 0; e5 < s3.length; e5++)
          n3[e5] = s3.charCodeAt(e5);
        const r3 = new DataView(n3.buffer).buffer;
        switch (t2) {
          case "float32":
            return new Float32Array(r3);
          case "float64":
            return new Float64Array(r3);
          case "int32":
            return new Int32Array(r3);
          case "int64":
            return new BigInt64Array(r3);
          default:
            throw Error(`invalid data type for base64 input: ${t2}`);
        }
      }(r2, t)[0];
      return new p(t, e3, o2);
    }
    return new p(t, E(t, n2), o2);
  }
  toJSON() {
    return { type: this.type, shape: this.shape, name: this.name, value: i(this.type, this.value) };
  }
};
__name(p, "p");
var A = "A chat between a curious human and an artificial intelligence assistant. The assistant gives helpful, detailed, and polite answers to the human's questions.";
var R = "Write code to solve the following coding problem that obeys the constraints and passes the example test cases. Please wrap your code answer using   ```:";
var c = /* @__PURE__ */ __name((e2, t) => [{ role: "system", content: e2 }, { role: "user", content: t }], "c");
var m = /* @__PURE__ */ __name((e2) => {
  const t = {};
  e2.temperature && (t.temperature = e2.temperature), e2.max_tokens && (t.max_tokens = e2.max_tokens);
  const n2 = [new p(s.String, [e2.prompt], { shape: [1], name: "text_input" }), new p(s.String, [JSON.stringify(t)], { shape: [1], name: "sampling_parameters" })];
  return e2.stream && n2.push(new p(s.Bool, true, { name: "stream" })), e2.image && (n2.push(new p(s.Uint8, e2.image, { shape: [1, e2.image.length], name: "image" })), n2.push(new p(s.Bool, true, { name: "exclude_input_in_output" }))), n2;
}, "m");
var u = /* @__PURE__ */ __name((e2, t) => {
  let s2 = e2.generated_text.value[0];
  if (t)
    for (const e3 in t)
      s2 = s2.replace(t[e3], "");
  return s2;
}, "u");
var O = /* @__PURE__ */ __name((e2) => (e2.inputsDefaultsStream = { max_tokens: 1800, ...e2.inputsDefaultsStream || {} }, e2.inputsDefaults = { max_tokens: 256, ...e2.inputsDefaults || {} }, e2.preProcessingArgs = { promptTemplate: "bare", defaultContext: A, defaultPromptMessages: c, ...e2.preProcessingArgs || {} }, e2 = { type: "triton", ...e2 }), "O");
var l = /* @__PURE__ */ __name((e2) => (e2.inputsDefaultsStream = { max_tokens: 512, ...e2.inputsDefaultsStream || {} }, e2.inputsDefaults = { max_tokens: 512, ...e2.inputsDefaults || {} }, e2.preProcessingArgs = { promptTemplate: "bare", defaultContext: A, defaultPromptMessages: c, ...e2.preProcessingArgs || {} }, e2 = { type: "vllm", generateTensorsFunc: (e3) => m(e3), postProcessingFunc: (e3, t) => e3.name.value[0].slice(t.prompt.length), postProcessingFuncStream: (e3, t, s2) => e3.name.value[0], ...e2 }), "l");
var I = /* @__PURE__ */ __name((e2, t, s2) => ({ type: "tgi", inputsDefaultsStream: { max_tokens: 512 }, inputsDefaults: { max_tokens: 256 }, preProcessingArgs: { promptTemplate: e2, defaultContext: t, defaultPromptMessages: c }, postProcessingFunc: (e3, t2) => u(e3, s2), postProcessingFuncStream: (e3, t2, n2) => u(e3, s2) }), "I");
var D = mustache_default.parse;
var y = mustache_default.render;
TransformStream;
TransformStream;
I("deepseek", R, ["<|EOT|>"]), I("bare", R), I("inst", A), I("openchat", A), I("chatml", A, ["<|im_end|>"]), I("orca-hashes", A), I("llama2", A), I("zephyr", A), I("mistral-instruct", A), I("mistral-instruct", A), I("gemma", A), I("hermes2-pro", A), I("starling", A), I("llama2", R), l({ preProcessingArgs: { promptTemplate: "phi-2", defaultPromptMessages: (e2, t) => [{ role: "question", content: t }] } }), l({ preProcessingArgs: { promptTemplate: "sqlcoder" } }), l({ preProcessingArgs: { defaultContext: "" } }), l({ preProcessingArgs: { promptTemplate: "falcon" } }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ preProcessingArgs: { promptTemplate: "tinyllama" } }), l({ preProcessingArgs: { promptTemplate: "openchat-alt" } }), l({ preProcessingArgs: { promptTemplate: "gemma" } }), l({ preProcessingArgs: { promptTemplate: "gemma" } }), l({ preProcessingArgs: { promptTemplate: "mistral-instruct" } }), l({ experimental: true, preProcessingArgs: { promptTemplate: "mistral-instruct" } }), l({ preProcessingArgs: { promptTemplate: "llama2" } }), l({ experimental: true, inputsDefaultsStream: { max_tokens: 1800 }, inputsDefaults: { max_tokens: 256 }, preProcessingArgs: { promptTemplate: "mistral-instruct" } }), l({ preProcessingArgs: { promptTemplate: "llama3" } }), l({ experimental: true }), l({ experimental: true }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ experimental: true }), O({ inputsDefaultsStream: { max_tokens: 2500 }, preProcessingArgs: { promptTemplate: "llama2" } }), O({ preProcessingArgs: { promptTemplate: "llama2" } }), O({ preProcessingArgs: { promptTemplate: "mistral-instruct" } });
var W = class {
  binding;
  options;
  logs;
  lastRequestId;
  constructor(e2, t = {}) {
    if (!e2)
      throw new Error("Ai binding is undefined. Please provide a valid binding.");
    this.binding = e2, this.options = t, this.lastRequestId = "";
  }
  async run(e2, t) {
    const s2 = await this.binding.run(e2, t, this.options);
    return this.lastRequestId = this.binding.lastRequestId, this.options.debug && (this.logs = this.binding.getLogs()), s2;
  }
  getLogs() {
    return this.logs;
  }
};
__name(W, "W");

// src/index.ts
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }
    if (path.startsWith("/git/") && path.endsWith("/info/refs")) {
      return handleGitInfoRefs(request, env);
    }
    if (path.startsWith("/git/") && path.endsWith("/git-receive-pack")) {
      return handleGitReceivePack(request, env);
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }
    try {
      const signature = request.headers.get("x-appwrite-webhook-signature");
      if (!signature) {
        return new Response("Missing Signature", { status: 401 });
      }
      const payload = await request.json();
      const sessionId = payload.$id;
      const rawData = payload.data;
      let sessionData;
      try {
        sessionData = JSON.parse(rawData);
      } catch (err) {
        return new Response("Invalid session data JSON", { status: 400 });
      }
      if (!sessionData.messages || sessionData.messages.length === 0) {
        return new Response("Empty session", { status: 200 });
      }
      const messagesText = sessionData.messages.filter((m2) => m2.role === "user" || m2.role === "model").map((m2) => `${m2.role}: ${m2.content}`).join("\n");
      const chunk = messagesText.substring(0, 8e3);
      const ai = new W(env.AI);
      const { data } = await ai.run("@cf/baai/bge-base-en-v1.5", { text: [chunk] });
      const vectors = data[0];
      await env.VECTORIZE.upsert([
        {
          id: sessionId,
          values: vectors,
          metadata: { customName: payload.customName || "Untitled", timestamp: payload.timestamp || Date.now() }
        }
      ]);
      return new Response("Vectorized successfully", { status: 200 });
    } catch (e2) {
      console.error(e2);
      return new Response(`Error: ${e2.message}`, { status: 500 });
    }
  }
};
async function handleGitInfoRefs(request, env) {
  const url = new URL(request.url);
  const service = url.searchParams.get("service");
  if (service !== "git-receive-pack") {
    return new Response("Only git-receive-pack is supported", { status: 400 });
  }
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const headers = new Headers({
    "Content-Type": `application/x-${service}-advertisement`,
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization"
  });
  const str1 = `# service=${service}
`;
  const len1 = (str1.length + 4).toString(16).padStart(4, "0");
  const str2 = "0000";
  const str3 = `0000000000000000000000000000000000000000 capabilities^{}\0report-status agent=cr-cloudflare-v1
`;
  const len3 = (str3.length + 4).toString(16).padStart(4, "0");
  const body = `${len1}${str1}${str2}${len3}${str3}0000`;
  return new Response(body, { status: 200, headers });
}
__name(handleGitInfoRefs, "handleGitInfoRefs");
async function handleGitReceivePack(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }
  const packfileBuffer = await request.arrayBuffer();
  const url = new URL(request.url);
  const parts = url.pathname.split("/");
  const sessionId = parts[2];
  console.log(`Received packfile of ${packfileBuffer.byteLength} bytes for session ${sessionId}`);
  try {
    const fileName = `pack-${sessionId}-${Date.now()}.pack`;
    await env.GIT_PACKS_BUCKET.put(fileName, packfileBuffer);
    console.log(`Successfully persisted packfile to R2 for ${sessionId}`);
  } catch (err) {
    console.warn(`Failed to push to R2 Bucket: ${err.message}`);
  }
  const headers = new Headers({
    "Content-Type": "application/x-git-receive-pack-result",
    "Cache-Control": "no-cache",
    "Access-Control-Allow-Origin": "*"
  });
  const report1 = "unpack ok\n";
  const len1 = (report1.length + 4).toString(16).padStart(4, "0");
  const report2 = "ok refs/heads/main\n";
  const len2 = (report2.length + 4).toString(16).padStart(4, "0");
  const body = `${len1}${report1}${len2}${report2}0000`;
  return new Response(body, { status: 200, headers });
}
__name(handleGitReceivePack, "handleGitReceivePack");

// ../../node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e2) {
      console.error("Failed to drain the unused request body.", e2);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
function reduceError(e2) {
  return {
    name: e2?.name,
    message: e2?.message ?? String(e2),
    stack: e2?.stack,
    cause: e2?.cause === void 0 ? void 0 : reduceError(e2.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e2) {
    const error = reduceError(e2);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-yBwvft/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../node_modules/wrangler/templates/middleware/common.ts
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-yBwvft/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
/*! Bundled license information:

mustache/mustache.mjs:
  (*!
   * mustache.js - Logic-less {{mustache}} templates with JavaScript
   * http://github.com/janl/mustache.js
   *)
*/
//# sourceMappingURL=index.js.map
