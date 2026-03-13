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
var __accessCheck = (obj, member, msg) => {
  if (!member.has(obj))
    throw TypeError("Cannot " + msg);
};
var __privateAdd = (obj, member, value) => {
  if (member.has(obj))
    throw TypeError("Cannot add the same private member more than once");
  member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
};
var __privateMethod = (obj, member, method) => {
  __accessCheck(obj, member, "access private method");
  return method;
};

// .wrangler/tmp/bundle-MvYI3m/checked-fetch.js
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
  ".wrangler/tmp/bundle-MvYI3m/checked-fetch.js"() {
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

// .wrangler/tmp/bundle-MvYI3m/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
var init_strip_cf_connecting_ip_header = __esm({
  ".wrangler/tmp/bundle-MvYI3m/strip-cf-connecting-ip-header.js"() {
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
    for (i4 = 0, len = code.length; i4 < len; ++i4) {
      lookup2[i4] = code[i4];
      revLookup[code.charCodeAt(i4)] = i4;
    }
    var i4;
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
      var i5;
      for (i5 = 0; i5 < len2; i5 += 4) {
        tmp = revLookup[b64.charCodeAt(i5)] << 18 | revLookup[b64.charCodeAt(i5 + 1)] << 12 | revLookup[b64.charCodeAt(i5 + 2)] << 6 | revLookup[b64.charCodeAt(i5 + 3)];
        arr[curByte++] = tmp >> 16 & 255;
        arr[curByte++] = tmp >> 8 & 255;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 2) {
        tmp = revLookup[b64.charCodeAt(i5)] << 2 | revLookup[b64.charCodeAt(i5 + 1)] >> 4;
        arr[curByte++] = tmp & 255;
      }
      if (placeHoldersLen === 1) {
        tmp = revLookup[b64.charCodeAt(i5)] << 10 | revLookup[b64.charCodeAt(i5 + 1)] << 4 | revLookup[b64.charCodeAt(i5 + 2)] >> 2;
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
      for (var i5 = start; i5 < end; i5 += 3) {
        tmp = (uint8[i5] << 16 & 16711680) + (uint8[i5 + 1] << 8 & 65280) + (uint8[i5 + 2] & 255);
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
      for (var i5 = 0, len22 = len2 - extraBytes; i5 < len22; i5 += maxChunkLength) {
        parts.push(encodeChunk(uint8, i5, i5 + maxChunkLength > len22 ? len22 : i5 + maxChunkLength));
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

// ../../node_modules/bignumber.js/bignumber.js
var require_bignumber = __commonJS({
  "../../node_modules/bignumber.js/bignumber.js"(exports, module) {
    init_checked_fetch();
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    (function(globalObject) {
      "use strict";
      var BigNumber, isNumeric = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i, mathceil = Math.ceil, mathfloor = Math.floor, bignumberError = "[BigNumber Error] ", tooManyDigits = bignumberError + "Number primitive has more than 15 significant digits: ", BASE = 1e14, LOG_BASE = 14, MAX_SAFE_INTEGER = 9007199254740991, POWS_TEN = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13], SQRT_BASE = 1e7, MAX = 1e9;
      function clone(configObject) {
        var div, convertBase, parseNumeric, P = BigNumber2.prototype = { constructor: BigNumber2, toString: null, valueOf: null }, ONE = new BigNumber2(1), DECIMAL_PLACES = 20, ROUNDING_MODE = 4, TO_EXP_NEG = -7, TO_EXP_POS = 21, MIN_EXP = -1e7, MAX_EXP = 1e7, CRYPTO = false, MODULO_MODE = 1, POW_PRECISION = 0, FORMAT = {
          prefix: "",
          groupSize: 3,
          secondaryGroupSize: 0,
          groupSeparator: ",",
          decimalSeparator: ".",
          fractionGroupSize: 0,
          fractionGroupSeparator: "\xA0",
          // non-breaking space
          suffix: ""
        }, ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz", alphabetHasNormalDecimalDigits = true;
        function BigNumber2(v, b) {
          var alphabet, c2, caseChanged, e4, i4, isNum, len, str, x = this;
          if (!(x instanceof BigNumber2))
            return new BigNumber2(v, b);
          if (b == null) {
            if (v && v._isBigNumber === true) {
              x.s = v.s;
              if (!v.c || v.e > MAX_EXP) {
                x.c = x.e = null;
              } else if (v.e < MIN_EXP) {
                x.c = [x.e = 0];
              } else {
                x.e = v.e;
                x.c = v.c.slice();
              }
              return;
            }
            if ((isNum = typeof v == "number") && v * 0 == 0) {
              x.s = 1 / v < 0 ? (v = -v, -1) : 1;
              if (v === ~~v) {
                for (e4 = 0, i4 = v; i4 >= 10; i4 /= 10, e4++)
                  ;
                if (e4 > MAX_EXP) {
                  x.c = x.e = null;
                } else {
                  x.e = e4;
                  x.c = [v];
                }
                return;
              }
              str = String(v);
            } else {
              if (!isNumeric.test(str = String(v)))
                return parseNumeric(x, str, isNum);
              x.s = str.charCodeAt(0) == 45 ? (str = str.slice(1), -1) : 1;
            }
            if ((e4 = str.indexOf(".")) > -1)
              str = str.replace(".", "");
            if ((i4 = str.search(/e/i)) > 0) {
              if (e4 < 0)
                e4 = i4;
              e4 += +str.slice(i4 + 1);
              str = str.substring(0, i4);
            } else if (e4 < 0) {
              e4 = str.length;
            }
          } else {
            intCheck(b, 2, ALPHABET.length, "Base");
            if (b == 10 && alphabetHasNormalDecimalDigits) {
              x = new BigNumber2(v);
              return round(x, DECIMAL_PLACES + x.e + 1, ROUNDING_MODE);
            }
            str = String(v);
            if (isNum = typeof v == "number") {
              if (v * 0 != 0)
                return parseNumeric(x, str, isNum, b);
              x.s = 1 / v < 0 ? (str = str.slice(1), -1) : 1;
              if (BigNumber2.DEBUG && str.replace(/^0\.0*|\./, "").length > 15) {
                throw Error(tooManyDigits + v);
              }
            } else {
              x.s = str.charCodeAt(0) === 45 ? (str = str.slice(1), -1) : 1;
            }
            alphabet = ALPHABET.slice(0, b);
            e4 = i4 = 0;
            for (len = str.length; i4 < len; i4++) {
              if (alphabet.indexOf(c2 = str.charAt(i4)) < 0) {
                if (c2 == ".") {
                  if (i4 > e4) {
                    e4 = len;
                    continue;
                  }
                } else if (!caseChanged) {
                  if (str == str.toUpperCase() && (str = str.toLowerCase()) || str == str.toLowerCase() && (str = str.toUpperCase())) {
                    caseChanged = true;
                    i4 = -1;
                    e4 = 0;
                    continue;
                  }
                }
                return parseNumeric(x, String(v), isNum, b);
              }
            }
            isNum = false;
            str = convertBase(str, b, 10, x.s);
            if ((e4 = str.indexOf(".")) > -1)
              str = str.replace(".", "");
            else
              e4 = str.length;
          }
          for (i4 = 0; str.charCodeAt(i4) === 48; i4++)
            ;
          for (len = str.length; str.charCodeAt(--len) === 48; )
            ;
          if (str = str.slice(i4, ++len)) {
            len -= i4;
            if (isNum && BigNumber2.DEBUG && len > 15 && (v > MAX_SAFE_INTEGER || v !== mathfloor(v))) {
              throw Error(tooManyDigits + x.s * v);
            }
            if ((e4 = e4 - i4 - 1) > MAX_EXP) {
              x.c = x.e = null;
            } else if (e4 < MIN_EXP) {
              x.c = [x.e = 0];
            } else {
              x.e = e4;
              x.c = [];
              i4 = (e4 + 1) % LOG_BASE;
              if (e4 < 0)
                i4 += LOG_BASE;
              if (i4 < len) {
                if (i4)
                  x.c.push(+str.slice(0, i4));
                for (len -= LOG_BASE; i4 < len; ) {
                  x.c.push(+str.slice(i4, i4 += LOG_BASE));
                }
                i4 = LOG_BASE - (str = str.slice(i4)).length;
              } else {
                i4 -= len;
              }
              for (; i4--; str += "0")
                ;
              x.c.push(+str);
            }
          } else {
            x.c = [x.e = 0];
          }
        }
        __name(BigNumber2, "BigNumber");
        BigNumber2.clone = clone;
        BigNumber2.ROUND_UP = 0;
        BigNumber2.ROUND_DOWN = 1;
        BigNumber2.ROUND_CEIL = 2;
        BigNumber2.ROUND_FLOOR = 3;
        BigNumber2.ROUND_HALF_UP = 4;
        BigNumber2.ROUND_HALF_DOWN = 5;
        BigNumber2.ROUND_HALF_EVEN = 6;
        BigNumber2.ROUND_HALF_CEIL = 7;
        BigNumber2.ROUND_HALF_FLOOR = 8;
        BigNumber2.EUCLID = 9;
        BigNumber2.config = BigNumber2.set = function(obj) {
          var p2, v;
          if (obj != null) {
            if (typeof obj == "object") {
              if (obj.hasOwnProperty(p2 = "DECIMAL_PLACES")) {
                v = obj[p2];
                intCheck(v, 0, MAX, p2);
                DECIMAL_PLACES = v;
              }
              if (obj.hasOwnProperty(p2 = "ROUNDING_MODE")) {
                v = obj[p2];
                intCheck(v, 0, 8, p2);
                ROUNDING_MODE = v;
              }
              if (obj.hasOwnProperty(p2 = "EXPONENTIAL_AT")) {
                v = obj[p2];
                if (v && v.pop) {
                  intCheck(v[0], -MAX, 0, p2);
                  intCheck(v[1], 0, MAX, p2);
                  TO_EXP_NEG = v[0];
                  TO_EXP_POS = v[1];
                } else {
                  intCheck(v, -MAX, MAX, p2);
                  TO_EXP_NEG = -(TO_EXP_POS = v < 0 ? -v : v);
                }
              }
              if (obj.hasOwnProperty(p2 = "RANGE")) {
                v = obj[p2];
                if (v && v.pop) {
                  intCheck(v[0], -MAX, -1, p2);
                  intCheck(v[1], 1, MAX, p2);
                  MIN_EXP = v[0];
                  MAX_EXP = v[1];
                } else {
                  intCheck(v, -MAX, MAX, p2);
                  if (v) {
                    MIN_EXP = -(MAX_EXP = v < 0 ? -v : v);
                  } else {
                    throw Error(bignumberError + p2 + " cannot be zero: " + v);
                  }
                }
              }
              if (obj.hasOwnProperty(p2 = "CRYPTO")) {
                v = obj[p2];
                if (v === !!v) {
                  if (v) {
                    if (typeof crypto != "undefined" && crypto && (crypto.getRandomValues || crypto.randomBytes)) {
                      CRYPTO = v;
                    } else {
                      CRYPTO = !v;
                      throw Error(bignumberError + "crypto unavailable");
                    }
                  } else {
                    CRYPTO = v;
                  }
                } else {
                  throw Error(bignumberError + p2 + " not true or false: " + v);
                }
              }
              if (obj.hasOwnProperty(p2 = "MODULO_MODE")) {
                v = obj[p2];
                intCheck(v, 0, 9, p2);
                MODULO_MODE = v;
              }
              if (obj.hasOwnProperty(p2 = "POW_PRECISION")) {
                v = obj[p2];
                intCheck(v, 0, MAX, p2);
                POW_PRECISION = v;
              }
              if (obj.hasOwnProperty(p2 = "FORMAT")) {
                v = obj[p2];
                if (typeof v == "object")
                  FORMAT = v;
                else
                  throw Error(bignumberError + p2 + " not an object: " + v);
              }
              if (obj.hasOwnProperty(p2 = "ALPHABET")) {
                v = obj[p2];
                if (typeof v == "string" && !/^.?$|[+\-.\s]|(.).*\1/.test(v)) {
                  alphabetHasNormalDecimalDigits = v.slice(0, 10) == "0123456789";
                  ALPHABET = v;
                } else {
                  throw Error(bignumberError + p2 + " invalid: " + v);
                }
              }
            } else {
              throw Error(bignumberError + "Object expected: " + obj);
            }
          }
          return {
            DECIMAL_PLACES,
            ROUNDING_MODE,
            EXPONENTIAL_AT: [TO_EXP_NEG, TO_EXP_POS],
            RANGE: [MIN_EXP, MAX_EXP],
            CRYPTO,
            MODULO_MODE,
            POW_PRECISION,
            FORMAT,
            ALPHABET
          };
        };
        BigNumber2.isBigNumber = function(v) {
          if (!v || v._isBigNumber !== true)
            return false;
          if (!BigNumber2.DEBUG)
            return true;
          var i4, n3, c2 = v.c, e4 = v.e, s3 = v.s;
          out:
            if ({}.toString.call(c2) == "[object Array]") {
              if ((s3 === 1 || s3 === -1) && e4 >= -MAX && e4 <= MAX && e4 === mathfloor(e4)) {
                if (c2[0] === 0) {
                  if (e4 === 0 && c2.length === 1)
                    return true;
                  break out;
                }
                i4 = (e4 + 1) % LOG_BASE;
                if (i4 < 1)
                  i4 += LOG_BASE;
                if (String(c2[0]).length == i4) {
                  for (i4 = 0; i4 < c2.length; i4++) {
                    n3 = c2[i4];
                    if (n3 < 0 || n3 >= BASE || n3 !== mathfloor(n3))
                      break out;
                  }
                  if (n3 !== 0)
                    return true;
                }
              }
            } else if (c2 === null && e4 === null && (s3 === null || s3 === 1 || s3 === -1)) {
              return true;
            }
          throw Error(bignumberError + "Invalid BigNumber: " + v);
        };
        BigNumber2.maximum = BigNumber2.max = function() {
          return maxOrMin(arguments, -1);
        };
        BigNumber2.minimum = BigNumber2.min = function() {
          return maxOrMin(arguments, 1);
        };
        BigNumber2.random = function() {
          var pow2_53 = 9007199254740992;
          var random53bitInt = Math.random() * pow2_53 & 2097151 ? function() {
            return mathfloor(Math.random() * pow2_53);
          } : function() {
            return (Math.random() * 1073741824 | 0) * 8388608 + (Math.random() * 8388608 | 0);
          };
          return function(dp) {
            var a4, b, e4, k, v, i4 = 0, c2 = [], rand = new BigNumber2(ONE);
            if (dp == null)
              dp = DECIMAL_PLACES;
            else
              intCheck(dp, 0, MAX);
            k = mathceil(dp / LOG_BASE);
            if (CRYPTO) {
              if (crypto.getRandomValues) {
                a4 = crypto.getRandomValues(new Uint32Array(k *= 2));
                for (; i4 < k; ) {
                  v = a4[i4] * 131072 + (a4[i4 + 1] >>> 11);
                  if (v >= 9e15) {
                    b = crypto.getRandomValues(new Uint32Array(2));
                    a4[i4] = b[0];
                    a4[i4 + 1] = b[1];
                  } else {
                    c2.push(v % 1e14);
                    i4 += 2;
                  }
                }
                i4 = k / 2;
              } else if (crypto.randomBytes) {
                a4 = crypto.randomBytes(k *= 7);
                for (; i4 < k; ) {
                  v = (a4[i4] & 31) * 281474976710656 + a4[i4 + 1] * 1099511627776 + a4[i4 + 2] * 4294967296 + a4[i4 + 3] * 16777216 + (a4[i4 + 4] << 16) + (a4[i4 + 5] << 8) + a4[i4 + 6];
                  if (v >= 9e15) {
                    crypto.randomBytes(7).copy(a4, i4);
                  } else {
                    c2.push(v % 1e14);
                    i4 += 7;
                  }
                }
                i4 = k / 7;
              } else {
                CRYPTO = false;
                throw Error(bignumberError + "crypto unavailable");
              }
            }
            if (!CRYPTO) {
              for (; i4 < k; ) {
                v = random53bitInt();
                if (v < 9e15)
                  c2[i4++] = v % 1e14;
              }
            }
            k = c2[--i4];
            dp %= LOG_BASE;
            if (k && dp) {
              v = POWS_TEN[LOG_BASE - dp];
              c2[i4] = mathfloor(k / v) * v;
            }
            for (; c2[i4] === 0; c2.pop(), i4--)
              ;
            if (i4 < 0) {
              c2 = [e4 = 0];
            } else {
              for (e4 = -1; c2[0] === 0; c2.splice(0, 1), e4 -= LOG_BASE)
                ;
              for (i4 = 1, v = c2[0]; v >= 10; v /= 10, i4++)
                ;
              if (i4 < LOG_BASE)
                e4 -= LOG_BASE - i4;
            }
            rand.e = e4;
            rand.c = c2;
            return rand;
          };
        }();
        BigNumber2.sum = function() {
          var i4 = 1, args = arguments, sum = new BigNumber2(args[0]);
          for (; i4 < args.length; )
            sum = sum.plus(args[i4++]);
          return sum;
        };
        convertBase = function() {
          var decimal = "0123456789";
          function toBaseOut(str, baseIn, baseOut, alphabet) {
            var j, arr = [0], arrL, i4 = 0, len = str.length;
            for (; i4 < len; ) {
              for (arrL = arr.length; arrL--; arr[arrL] *= baseIn)
                ;
              arr[0] += alphabet.indexOf(str.charAt(i4++));
              for (j = 0; j < arr.length; j++) {
                if (arr[j] > baseOut - 1) {
                  if (arr[j + 1] == null)
                    arr[j + 1] = 0;
                  arr[j + 1] += arr[j] / baseOut | 0;
                  arr[j] %= baseOut;
                }
              }
            }
            return arr.reverse();
          }
          __name(toBaseOut, "toBaseOut");
          return function(str, baseIn, baseOut, sign, callerIsToString) {
            var alphabet, d, e4, k, r3, x, xc, y2, i4 = str.indexOf("."), dp = DECIMAL_PLACES, rm = ROUNDING_MODE;
            if (i4 >= 0) {
              k = POW_PRECISION;
              POW_PRECISION = 0;
              str = str.replace(".", "");
              y2 = new BigNumber2(baseIn);
              x = y2.pow(str.length - i4);
              POW_PRECISION = k;
              y2.c = toBaseOut(
                toFixedPoint(coeffToString(x.c), x.e, "0"),
                10,
                baseOut,
                decimal
              );
              y2.e = y2.c.length;
            }
            xc = toBaseOut(str, baseIn, baseOut, callerIsToString ? (alphabet = ALPHABET, decimal) : (alphabet = decimal, ALPHABET));
            e4 = k = xc.length;
            for (; xc[--k] == 0; xc.pop())
              ;
            if (!xc[0])
              return alphabet.charAt(0);
            if (i4 < 0) {
              --e4;
            } else {
              x.c = xc;
              x.e = e4;
              x.s = sign;
              x = div(x, y2, dp, rm, baseOut);
              xc = x.c;
              r3 = x.r;
              e4 = x.e;
            }
            d = e4 + dp + 1;
            i4 = xc[d];
            k = baseOut / 2;
            r3 = r3 || d < 0 || xc[d + 1] != null;
            r3 = rm < 4 ? (i4 != null || r3) && (rm == 0 || rm == (x.s < 0 ? 3 : 2)) : i4 > k || i4 == k && (rm == 4 || r3 || rm == 6 && xc[d - 1] & 1 || rm == (x.s < 0 ? 8 : 7));
            if (d < 1 || !xc[0]) {
              str = r3 ? toFixedPoint(alphabet.charAt(1), -dp, alphabet.charAt(0)) : alphabet.charAt(0);
            } else {
              xc.length = d;
              if (r3) {
                for (--baseOut; ++xc[--d] > baseOut; ) {
                  xc[d] = 0;
                  if (!d) {
                    ++e4;
                    xc = [1].concat(xc);
                  }
                }
              }
              for (k = xc.length; !xc[--k]; )
                ;
              for (i4 = 0, str = ""; i4 <= k; str += alphabet.charAt(xc[i4++]))
                ;
              str = toFixedPoint(str, e4, alphabet.charAt(0));
            }
            return str;
          };
        }();
        div = function() {
          function multiply(x, k, base) {
            var m2, temp, xlo, xhi, carry = 0, i4 = x.length, klo = k % SQRT_BASE, khi = k / SQRT_BASE | 0;
            for (x = x.slice(); i4--; ) {
              xlo = x[i4] % SQRT_BASE;
              xhi = x[i4] / SQRT_BASE | 0;
              m2 = khi * xlo + xhi * klo;
              temp = klo * xlo + m2 % SQRT_BASE * SQRT_BASE + carry;
              carry = (temp / base | 0) + (m2 / SQRT_BASE | 0) + khi * xhi;
              x[i4] = temp % base;
            }
            if (carry)
              x = [carry].concat(x);
            return x;
          }
          __name(multiply, "multiply");
          function compare2(a4, b, aL, bL) {
            var i4, cmp;
            if (aL != bL) {
              cmp = aL > bL ? 1 : -1;
            } else {
              for (i4 = cmp = 0; i4 < aL; i4++) {
                if (a4[i4] != b[i4]) {
                  cmp = a4[i4] > b[i4] ? 1 : -1;
                  break;
                }
              }
            }
            return cmp;
          }
          __name(compare2, "compare");
          function subtract(a4, b, aL, base) {
            var i4 = 0;
            for (; aL--; ) {
              a4[aL] -= i4;
              i4 = a4[aL] < b[aL] ? 1 : 0;
              a4[aL] = i4 * base + a4[aL] - b[aL];
            }
            for (; !a4[0] && a4.length > 1; a4.splice(0, 1))
              ;
          }
          __name(subtract, "subtract");
          return function(x, y2, dp, rm, base) {
            var cmp, e4, i4, more, n3, prod, prodL, q, qc, rem, remL, rem0, xi, xL, yc0, yL, yz, s3 = x.s == y2.s ? 1 : -1, xc = x.c, yc = y2.c;
            if (!xc || !xc[0] || !yc || !yc[0]) {
              return new BigNumber2(
                // Return NaN if either NaN, or both Infinity or 0.
                !x.s || !y2.s || (xc ? yc && xc[0] == yc[0] : !yc) ? NaN : (
                  // Return ±0 if x is ±0 or y is ±Infinity, or return ±Infinity as y is ±0.
                  xc && xc[0] == 0 || !yc ? s3 * 0 : s3 / 0
                )
              );
            }
            q = new BigNumber2(s3);
            qc = q.c = [];
            e4 = x.e - y2.e;
            s3 = dp + e4 + 1;
            if (!base) {
              base = BASE;
              e4 = bitFloor(x.e / LOG_BASE) - bitFloor(y2.e / LOG_BASE);
              s3 = s3 / LOG_BASE | 0;
            }
            for (i4 = 0; yc[i4] == (xc[i4] || 0); i4++)
              ;
            if (yc[i4] > (xc[i4] || 0))
              e4--;
            if (s3 < 0) {
              qc.push(1);
              more = true;
            } else {
              xL = xc.length;
              yL = yc.length;
              i4 = 0;
              s3 += 2;
              n3 = mathfloor(base / (yc[0] + 1));
              if (n3 > 1) {
                yc = multiply(yc, n3, base);
                xc = multiply(xc, n3, base);
                yL = yc.length;
                xL = xc.length;
              }
              xi = yL;
              rem = xc.slice(0, yL);
              remL = rem.length;
              for (; remL < yL; rem[remL++] = 0)
                ;
              yz = yc.slice();
              yz = [0].concat(yz);
              yc0 = yc[0];
              if (yc[1] >= base / 2)
                yc0++;
              do {
                n3 = 0;
                cmp = compare2(yc, rem, yL, remL);
                if (cmp < 0) {
                  rem0 = rem[0];
                  if (yL != remL)
                    rem0 = rem0 * base + (rem[1] || 0);
                  n3 = mathfloor(rem0 / yc0);
                  if (n3 > 1) {
                    if (n3 >= base)
                      n3 = base - 1;
                    prod = multiply(yc, n3, base);
                    prodL = prod.length;
                    remL = rem.length;
                    while (compare2(prod, rem, prodL, remL) == 1) {
                      n3--;
                      subtract(prod, yL < prodL ? yz : yc, prodL, base);
                      prodL = prod.length;
                      cmp = 1;
                    }
                  } else {
                    if (n3 == 0) {
                      cmp = n3 = 1;
                    }
                    prod = yc.slice();
                    prodL = prod.length;
                  }
                  if (prodL < remL)
                    prod = [0].concat(prod);
                  subtract(rem, prod, remL, base);
                  remL = rem.length;
                  if (cmp == -1) {
                    while (compare2(yc, rem, yL, remL) < 1) {
                      n3++;
                      subtract(rem, yL < remL ? yz : yc, remL, base);
                      remL = rem.length;
                    }
                  }
                } else if (cmp === 0) {
                  n3++;
                  rem = [0];
                }
                qc[i4++] = n3;
                if (rem[0]) {
                  rem[remL++] = xc[xi] || 0;
                } else {
                  rem = [xc[xi]];
                  remL = 1;
                }
              } while ((xi++ < xL || rem[0] != null) && s3--);
              more = rem[0] != null;
              if (!qc[0])
                qc.splice(0, 1);
            }
            if (base == BASE) {
              for (i4 = 1, s3 = qc[0]; s3 >= 10; s3 /= 10, i4++)
                ;
              round(q, dp + (q.e = i4 + e4 * LOG_BASE - 1) + 1, rm, more);
            } else {
              q.e = e4;
              q.r = +more;
            }
            return q;
          };
        }();
        function format(n3, i4, rm, id) {
          var c0, e4, ne, len, str;
          if (rm == null)
            rm = ROUNDING_MODE;
          else
            intCheck(rm, 0, 8);
          if (!n3.c)
            return n3.toString();
          c0 = n3.c[0];
          ne = n3.e;
          if (i4 == null) {
            str = coeffToString(n3.c);
            str = id == 1 || id == 2 && (ne <= TO_EXP_NEG || ne >= TO_EXP_POS) ? toExponential(str, ne) : toFixedPoint(str, ne, "0");
          } else {
            n3 = round(new BigNumber2(n3), i4, rm);
            e4 = n3.e;
            str = coeffToString(n3.c);
            len = str.length;
            if (id == 1 || id == 2 && (i4 <= e4 || e4 <= TO_EXP_NEG)) {
              for (; len < i4; str += "0", len++)
                ;
              str = toExponential(str, e4);
            } else {
              i4 -= ne + (id === 2 && e4 > ne);
              str = toFixedPoint(str, e4, "0");
              if (e4 + 1 > len) {
                if (--i4 > 0)
                  for (str += "."; i4--; str += "0")
                    ;
              } else {
                i4 += e4 - len;
                if (i4 > 0) {
                  if (e4 + 1 == len)
                    str += ".";
                  for (; i4--; str += "0")
                    ;
                }
              }
            }
          }
          return n3.s < 0 && c0 ? "-" + str : str;
        }
        __name(format, "format");
        function maxOrMin(args, n3) {
          var k, y2, i4 = 1, x = new BigNumber2(args[0]);
          for (; i4 < args.length; i4++) {
            y2 = new BigNumber2(args[i4]);
            if (!y2.s || (k = compare(x, y2)) === n3 || k === 0 && x.s === n3) {
              x = y2;
            }
          }
          return x;
        }
        __name(maxOrMin, "maxOrMin");
        function normalise(n3, c2, e4) {
          var i4 = 1, j = c2.length;
          for (; !c2[--j]; c2.pop())
            ;
          for (j = c2[0]; j >= 10; j /= 10, i4++)
            ;
          if ((e4 = i4 + e4 * LOG_BASE - 1) > MAX_EXP) {
            n3.c = n3.e = null;
          } else if (e4 < MIN_EXP) {
            n3.c = [n3.e = 0];
          } else {
            n3.e = e4;
            n3.c = c2;
          }
          return n3;
        }
        __name(normalise, "normalise");
        parseNumeric = function() {
          var basePrefix = /^(-?)0([xbo])(?=\w[\w.]*$)/i, dotAfter = /^([^.]+)\.$/, dotBefore = /^\.([^.]+)$/, isInfinityOrNaN = /^-?(Infinity|NaN)$/, whitespaceOrPlus = /^\s*\+(?=[\w.])|^\s+|\s+$/g;
          return function(x, str, isNum, b) {
            var base, s3 = isNum ? str : str.replace(whitespaceOrPlus, "");
            if (isInfinityOrNaN.test(s3)) {
              x.s = isNaN(s3) ? null : s3 < 0 ? -1 : 1;
            } else {
              if (!isNum) {
                s3 = s3.replace(basePrefix, function(m2, p1, p2) {
                  base = (p2 = p2.toLowerCase()) == "x" ? 16 : p2 == "b" ? 2 : 8;
                  return !b || b == base ? p1 : m2;
                });
                if (b) {
                  base = b;
                  s3 = s3.replace(dotAfter, "$1").replace(dotBefore, "0.$1");
                }
                if (str != s3)
                  return new BigNumber2(s3, base);
              }
              if (BigNumber2.DEBUG) {
                throw Error(bignumberError + "Not a" + (b ? " base " + b : "") + " number: " + str);
              }
              x.s = null;
            }
            x.c = x.e = null;
          };
        }();
        function round(x, sd, rm, r3) {
          var d, i4, j, k, n3, ni, rd, xc = x.c, pows10 = POWS_TEN;
          if (xc) {
            out: {
              for (d = 1, k = xc[0]; k >= 10; k /= 10, d++)
                ;
              i4 = sd - d;
              if (i4 < 0) {
                i4 += LOG_BASE;
                j = sd;
                n3 = xc[ni = 0];
                rd = mathfloor(n3 / pows10[d - j - 1] % 10);
              } else {
                ni = mathceil((i4 + 1) / LOG_BASE);
                if (ni >= xc.length) {
                  if (r3) {
                    for (; xc.length <= ni; xc.push(0))
                      ;
                    n3 = rd = 0;
                    d = 1;
                    i4 %= LOG_BASE;
                    j = i4 - LOG_BASE + 1;
                  } else {
                    break out;
                  }
                } else {
                  n3 = k = xc[ni];
                  for (d = 1; k >= 10; k /= 10, d++)
                    ;
                  i4 %= LOG_BASE;
                  j = i4 - LOG_BASE + d;
                  rd = j < 0 ? 0 : mathfloor(n3 / pows10[d - j - 1] % 10);
                }
              }
              r3 = r3 || sd < 0 || // Are there any non-zero digits after the rounding digit?
              // The expression  n % pows10[d - j - 1]  returns all digits of n to the right
              // of the digit at j, e.g. if n is 908714 and j is 2, the expression gives 714.
              xc[ni + 1] != null || (j < 0 ? n3 : n3 % pows10[d - j - 1]);
              r3 = rm < 4 ? (rd || r3) && (rm == 0 || rm == (x.s < 0 ? 3 : 2)) : rd > 5 || rd == 5 && (rm == 4 || r3 || rm == 6 && // Check whether the digit to the left of the rounding digit is odd.
              (i4 > 0 ? j > 0 ? n3 / pows10[d - j] : 0 : xc[ni - 1]) % 10 & 1 || rm == (x.s < 0 ? 8 : 7));
              if (sd < 1 || !xc[0]) {
                xc.length = 0;
                if (r3) {
                  sd -= x.e + 1;
                  xc[0] = pows10[(LOG_BASE - sd % LOG_BASE) % LOG_BASE];
                  x.e = -sd || 0;
                } else {
                  xc[0] = x.e = 0;
                }
                return x;
              }
              if (i4 == 0) {
                xc.length = ni;
                k = 1;
                ni--;
              } else {
                xc.length = ni + 1;
                k = pows10[LOG_BASE - i4];
                xc[ni] = j > 0 ? mathfloor(n3 / pows10[d - j] % pows10[j]) * k : 0;
              }
              if (r3) {
                for (; ; ) {
                  if (ni == 0) {
                    for (i4 = 1, j = xc[0]; j >= 10; j /= 10, i4++)
                      ;
                    j = xc[0] += k;
                    for (k = 1; j >= 10; j /= 10, k++)
                      ;
                    if (i4 != k) {
                      x.e++;
                      if (xc[0] == BASE)
                        xc[0] = 1;
                    }
                    break;
                  } else {
                    xc[ni] += k;
                    if (xc[ni] != BASE)
                      break;
                    xc[ni--] = 0;
                    k = 1;
                  }
                }
              }
              for (i4 = xc.length; xc[--i4] === 0; xc.pop())
                ;
            }
            if (x.e > MAX_EXP) {
              x.c = x.e = null;
            } else if (x.e < MIN_EXP) {
              x.c = [x.e = 0];
            }
          }
          return x;
        }
        __name(round, "round");
        function valueOf(n3) {
          var str, e4 = n3.e;
          if (e4 === null)
            return n3.toString();
          str = coeffToString(n3.c);
          str = e4 <= TO_EXP_NEG || e4 >= TO_EXP_POS ? toExponential(str, e4) : toFixedPoint(str, e4, "0");
          return n3.s < 0 ? "-" + str : str;
        }
        __name(valueOf, "valueOf");
        P.absoluteValue = P.abs = function() {
          var x = new BigNumber2(this);
          if (x.s < 0)
            x.s = 1;
          return x;
        };
        P.comparedTo = function(y2, b) {
          return compare(this, new BigNumber2(y2, b));
        };
        P.decimalPlaces = P.dp = function(dp, rm) {
          var c2, n3, v, x = this;
          if (dp != null) {
            intCheck(dp, 0, MAX);
            if (rm == null)
              rm = ROUNDING_MODE;
            else
              intCheck(rm, 0, 8);
            return round(new BigNumber2(x), dp + x.e + 1, rm);
          }
          if (!(c2 = x.c))
            return null;
          n3 = ((v = c2.length - 1) - bitFloor(this.e / LOG_BASE)) * LOG_BASE;
          if (v = c2[v])
            for (; v % 10 == 0; v /= 10, n3--)
              ;
          if (n3 < 0)
            n3 = 0;
          return n3;
        };
        P.dividedBy = P.div = function(y2, b) {
          return div(this, new BigNumber2(y2, b), DECIMAL_PLACES, ROUNDING_MODE);
        };
        P.dividedToIntegerBy = P.idiv = function(y2, b) {
          return div(this, new BigNumber2(y2, b), 0, 1);
        };
        P.exponentiatedBy = P.pow = function(n3, m2) {
          var half, isModExp, i4, k, more, nIsBig, nIsNeg, nIsOdd, y2, x = this;
          n3 = new BigNumber2(n3);
          if (n3.c && !n3.isInteger()) {
            throw Error(bignumberError + "Exponent not an integer: " + valueOf(n3));
          }
          if (m2 != null)
            m2 = new BigNumber2(m2);
          nIsBig = n3.e > 14;
          if (!x.c || !x.c[0] || x.c[0] == 1 && !x.e && x.c.length == 1 || !n3.c || !n3.c[0]) {
            y2 = new BigNumber2(Math.pow(+valueOf(x), nIsBig ? n3.s * (2 - isOdd(n3)) : +valueOf(n3)));
            return m2 ? y2.mod(m2) : y2;
          }
          nIsNeg = n3.s < 0;
          if (m2) {
            if (m2.c ? !m2.c[0] : !m2.s)
              return new BigNumber2(NaN);
            isModExp = !nIsNeg && x.isInteger() && m2.isInteger();
            if (isModExp)
              x = x.mod(m2);
          } else if (n3.e > 9 && (x.e > 0 || x.e < -1 || (x.e == 0 ? x.c[0] > 1 || nIsBig && x.c[1] >= 24e7 : x.c[0] < 8e13 || nIsBig && x.c[0] <= 9999975e7))) {
            k = x.s < 0 && isOdd(n3) ? -0 : 0;
            if (x.e > -1)
              k = 1 / k;
            return new BigNumber2(nIsNeg ? 1 / k : k);
          } else if (POW_PRECISION) {
            k = mathceil(POW_PRECISION / LOG_BASE + 2);
          }
          if (nIsBig) {
            half = new BigNumber2(0.5);
            if (nIsNeg)
              n3.s = 1;
            nIsOdd = isOdd(n3);
          } else {
            i4 = Math.abs(+valueOf(n3));
            nIsOdd = i4 % 2;
          }
          y2 = new BigNumber2(ONE);
          for (; ; ) {
            if (nIsOdd) {
              y2 = y2.times(x);
              if (!y2.c)
                break;
              if (k) {
                if (y2.c.length > k)
                  y2.c.length = k;
              } else if (isModExp) {
                y2 = y2.mod(m2);
              }
            }
            if (i4) {
              i4 = mathfloor(i4 / 2);
              if (i4 === 0)
                break;
              nIsOdd = i4 % 2;
            } else {
              n3 = n3.times(half);
              round(n3, n3.e + 1, 1);
              if (n3.e > 14) {
                nIsOdd = isOdd(n3);
              } else {
                i4 = +valueOf(n3);
                if (i4 === 0)
                  break;
                nIsOdd = i4 % 2;
              }
            }
            x = x.times(x);
            if (k) {
              if (x.c && x.c.length > k)
                x.c.length = k;
            } else if (isModExp) {
              x = x.mod(m2);
            }
          }
          if (isModExp)
            return y2;
          if (nIsNeg)
            y2 = ONE.div(y2);
          return m2 ? y2.mod(m2) : k ? round(y2, POW_PRECISION, ROUNDING_MODE, more) : y2;
        };
        P.integerValue = function(rm) {
          var n3 = new BigNumber2(this);
          if (rm == null)
            rm = ROUNDING_MODE;
          else
            intCheck(rm, 0, 8);
          return round(n3, n3.e + 1, rm);
        };
        P.isEqualTo = P.eq = function(y2, b) {
          return compare(this, new BigNumber2(y2, b)) === 0;
        };
        P.isFinite = function() {
          return !!this.c;
        };
        P.isGreaterThan = P.gt = function(y2, b) {
          return compare(this, new BigNumber2(y2, b)) > 0;
        };
        P.isGreaterThanOrEqualTo = P.gte = function(y2, b) {
          return (b = compare(this, new BigNumber2(y2, b))) === 1 || b === 0;
        };
        P.isInteger = function() {
          return !!this.c && bitFloor(this.e / LOG_BASE) > this.c.length - 2;
        };
        P.isLessThan = P.lt = function(y2, b) {
          return compare(this, new BigNumber2(y2, b)) < 0;
        };
        P.isLessThanOrEqualTo = P.lte = function(y2, b) {
          return (b = compare(this, new BigNumber2(y2, b))) === -1 || b === 0;
        };
        P.isNaN = function() {
          return !this.s;
        };
        P.isNegative = function() {
          return this.s < 0;
        };
        P.isPositive = function() {
          return this.s > 0;
        };
        P.isZero = function() {
          return !!this.c && this.c[0] == 0;
        };
        P.minus = function(y2, b) {
          var i4, j, t2, xLTy, x = this, a4 = x.s;
          y2 = new BigNumber2(y2, b);
          b = y2.s;
          if (!a4 || !b)
            return new BigNumber2(NaN);
          if (a4 != b) {
            y2.s = -b;
            return x.plus(y2);
          }
          var xe = x.e / LOG_BASE, ye = y2.e / LOG_BASE, xc = x.c, yc = y2.c;
          if (!xe || !ye) {
            if (!xc || !yc)
              return xc ? (y2.s = -b, y2) : new BigNumber2(yc ? x : NaN);
            if (!xc[0] || !yc[0]) {
              return yc[0] ? (y2.s = -b, y2) : new BigNumber2(xc[0] ? x : (
                // IEEE 754 (2008) 6.3: n - n = -0 when rounding to -Infinity
                ROUNDING_MODE == 3 ? -0 : 0
              ));
            }
          }
          xe = bitFloor(xe);
          ye = bitFloor(ye);
          xc = xc.slice();
          if (a4 = xe - ye) {
            if (xLTy = a4 < 0) {
              a4 = -a4;
              t2 = xc;
            } else {
              ye = xe;
              t2 = yc;
            }
            t2.reverse();
            for (b = a4; b--; t2.push(0))
              ;
            t2.reverse();
          } else {
            j = (xLTy = (a4 = xc.length) < (b = yc.length)) ? a4 : b;
            for (a4 = b = 0; b < j; b++) {
              if (xc[b] != yc[b]) {
                xLTy = xc[b] < yc[b];
                break;
              }
            }
          }
          if (xLTy) {
            t2 = xc;
            xc = yc;
            yc = t2;
            y2.s = -y2.s;
          }
          b = (j = yc.length) - (i4 = xc.length);
          if (b > 0)
            for (; b--; xc[i4++] = 0)
              ;
          b = BASE - 1;
          for (; j > a4; ) {
            if (xc[--j] < yc[j]) {
              for (i4 = j; i4 && !xc[--i4]; xc[i4] = b)
                ;
              --xc[i4];
              xc[j] += BASE;
            }
            xc[j] -= yc[j];
          }
          for (; xc[0] == 0; xc.splice(0, 1), --ye)
            ;
          if (!xc[0]) {
            y2.s = ROUNDING_MODE == 3 ? -1 : 1;
            y2.c = [y2.e = 0];
            return y2;
          }
          return normalise(y2, xc, ye);
        };
        P.modulo = P.mod = function(y2, b) {
          var q, s3, x = this;
          y2 = new BigNumber2(y2, b);
          if (!x.c || !y2.s || y2.c && !y2.c[0]) {
            return new BigNumber2(NaN);
          } else if (!y2.c || x.c && !x.c[0]) {
            return new BigNumber2(x);
          }
          if (MODULO_MODE == 9) {
            s3 = y2.s;
            y2.s = 1;
            q = div(x, y2, 0, 3);
            y2.s = s3;
            q.s *= s3;
          } else {
            q = div(x, y2, 0, MODULO_MODE);
          }
          y2 = x.minus(q.times(y2));
          if (!y2.c[0] && MODULO_MODE == 1)
            y2.s = x.s;
          return y2;
        };
        P.multipliedBy = P.times = function(y2, b) {
          var c2, e4, i4, j, k, m2, xcL, xlo, xhi, ycL, ylo, yhi, zc, base, sqrtBase, x = this, xc = x.c, yc = (y2 = new BigNumber2(y2, b)).c;
          if (!xc || !yc || !xc[0] || !yc[0]) {
            if (!x.s || !y2.s || xc && !xc[0] && !yc || yc && !yc[0] && !xc) {
              y2.c = y2.e = y2.s = null;
            } else {
              y2.s *= x.s;
              if (!xc || !yc) {
                y2.c = y2.e = null;
              } else {
                y2.c = [0];
                y2.e = 0;
              }
            }
            return y2;
          }
          e4 = bitFloor(x.e / LOG_BASE) + bitFloor(y2.e / LOG_BASE);
          y2.s *= x.s;
          xcL = xc.length;
          ycL = yc.length;
          if (xcL < ycL) {
            zc = xc;
            xc = yc;
            yc = zc;
            i4 = xcL;
            xcL = ycL;
            ycL = i4;
          }
          for (i4 = xcL + ycL, zc = []; i4--; zc.push(0))
            ;
          base = BASE;
          sqrtBase = SQRT_BASE;
          for (i4 = ycL; --i4 >= 0; ) {
            c2 = 0;
            ylo = yc[i4] % sqrtBase;
            yhi = yc[i4] / sqrtBase | 0;
            for (k = xcL, j = i4 + k; j > i4; ) {
              xlo = xc[--k] % sqrtBase;
              xhi = xc[k] / sqrtBase | 0;
              m2 = yhi * xlo + xhi * ylo;
              xlo = ylo * xlo + m2 % sqrtBase * sqrtBase + zc[j] + c2;
              c2 = (xlo / base | 0) + (m2 / sqrtBase | 0) + yhi * xhi;
              zc[j--] = xlo % base;
            }
            zc[j] = c2;
          }
          if (c2) {
            ++e4;
          } else {
            zc.splice(0, 1);
          }
          return normalise(y2, zc, e4);
        };
        P.negated = function() {
          var x = new BigNumber2(this);
          x.s = -x.s || null;
          return x;
        };
        P.plus = function(y2, b) {
          var t2, x = this, a4 = x.s;
          y2 = new BigNumber2(y2, b);
          b = y2.s;
          if (!a4 || !b)
            return new BigNumber2(NaN);
          if (a4 != b) {
            y2.s = -b;
            return x.minus(y2);
          }
          var xe = x.e / LOG_BASE, ye = y2.e / LOG_BASE, xc = x.c, yc = y2.c;
          if (!xe || !ye) {
            if (!xc || !yc)
              return new BigNumber2(a4 / 0);
            if (!xc[0] || !yc[0])
              return yc[0] ? y2 : new BigNumber2(xc[0] ? x : a4 * 0);
          }
          xe = bitFloor(xe);
          ye = bitFloor(ye);
          xc = xc.slice();
          if (a4 = xe - ye) {
            if (a4 > 0) {
              ye = xe;
              t2 = yc;
            } else {
              a4 = -a4;
              t2 = xc;
            }
            t2.reverse();
            for (; a4--; t2.push(0))
              ;
            t2.reverse();
          }
          a4 = xc.length;
          b = yc.length;
          if (a4 - b < 0) {
            t2 = yc;
            yc = xc;
            xc = t2;
            b = a4;
          }
          for (a4 = 0; b; ) {
            a4 = (xc[--b] = xc[b] + yc[b] + a4) / BASE | 0;
            xc[b] = BASE === xc[b] ? 0 : xc[b] % BASE;
          }
          if (a4) {
            xc = [a4].concat(xc);
            ++ye;
          }
          return normalise(y2, xc, ye);
        };
        P.precision = P.sd = function(sd, rm) {
          var c2, n3, v, x = this;
          if (sd != null && sd !== !!sd) {
            intCheck(sd, 1, MAX);
            if (rm == null)
              rm = ROUNDING_MODE;
            else
              intCheck(rm, 0, 8);
            return round(new BigNumber2(x), sd, rm);
          }
          if (!(c2 = x.c))
            return null;
          v = c2.length - 1;
          n3 = v * LOG_BASE + 1;
          if (v = c2[v]) {
            for (; v % 10 == 0; v /= 10, n3--)
              ;
            for (v = c2[0]; v >= 10; v /= 10, n3++)
              ;
          }
          if (sd && x.e + 1 > n3)
            n3 = x.e + 1;
          return n3;
        };
        P.shiftedBy = function(k) {
          intCheck(k, -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER);
          return this.times("1e" + k);
        };
        P.squareRoot = P.sqrt = function() {
          var m2, n3, r3, rep, t2, x = this, c2 = x.c, s3 = x.s, e4 = x.e, dp = DECIMAL_PLACES + 4, half = new BigNumber2("0.5");
          if (s3 !== 1 || !c2 || !c2[0]) {
            return new BigNumber2(!s3 || s3 < 0 && (!c2 || c2[0]) ? NaN : c2 ? x : 1 / 0);
          }
          s3 = Math.sqrt(+valueOf(x));
          if (s3 == 0 || s3 == 1 / 0) {
            n3 = coeffToString(c2);
            if ((n3.length + e4) % 2 == 0)
              n3 += "0";
            s3 = Math.sqrt(+n3);
            e4 = bitFloor((e4 + 1) / 2) - (e4 < 0 || e4 % 2);
            if (s3 == 1 / 0) {
              n3 = "5e" + e4;
            } else {
              n3 = s3.toExponential();
              n3 = n3.slice(0, n3.indexOf("e") + 1) + e4;
            }
            r3 = new BigNumber2(n3);
          } else {
            r3 = new BigNumber2(s3 + "");
          }
          if (r3.c[0]) {
            e4 = r3.e;
            s3 = e4 + dp;
            if (s3 < 3)
              s3 = 0;
            for (; ; ) {
              t2 = r3;
              r3 = half.times(t2.plus(div(x, t2, dp, 1)));
              if (coeffToString(t2.c).slice(0, s3) === (n3 = coeffToString(r3.c)).slice(0, s3)) {
                if (r3.e < e4)
                  --s3;
                n3 = n3.slice(s3 - 3, s3 + 1);
                if (n3 == "9999" || !rep && n3 == "4999") {
                  if (!rep) {
                    round(t2, t2.e + DECIMAL_PLACES + 2, 0);
                    if (t2.times(t2).eq(x)) {
                      r3 = t2;
                      break;
                    }
                  }
                  dp += 4;
                  s3 += 4;
                  rep = 1;
                } else {
                  if (!+n3 || !+n3.slice(1) && n3.charAt(0) == "5") {
                    round(r3, r3.e + DECIMAL_PLACES + 2, 1);
                    m2 = !r3.times(r3).eq(x);
                  }
                  break;
                }
              }
            }
          }
          return round(r3, r3.e + DECIMAL_PLACES + 1, ROUNDING_MODE, m2);
        };
        P.toExponential = function(dp, rm) {
          if (dp != null) {
            intCheck(dp, 0, MAX);
            dp++;
          }
          return format(this, dp, rm, 1);
        };
        P.toFixed = function(dp, rm) {
          if (dp != null) {
            intCheck(dp, 0, MAX);
            dp = dp + this.e + 1;
          }
          return format(this, dp, rm);
        };
        P.toFormat = function(dp, rm, format2) {
          var str, x = this;
          if (format2 == null) {
            if (dp != null && rm && typeof rm == "object") {
              format2 = rm;
              rm = null;
            } else if (dp && typeof dp == "object") {
              format2 = dp;
              dp = rm = null;
            } else {
              format2 = FORMAT;
            }
          } else if (typeof format2 != "object") {
            throw Error(bignumberError + "Argument not an object: " + format2);
          }
          str = x.toFixed(dp, rm);
          if (x.c) {
            var i4, arr = str.split("."), g1 = +format2.groupSize, g2 = +format2.secondaryGroupSize, groupSeparator = format2.groupSeparator || "", intPart = arr[0], fractionPart = arr[1], isNeg = x.s < 0, intDigits = isNeg ? intPart.slice(1) : intPart, len = intDigits.length;
            if (g2) {
              i4 = g1;
              g1 = g2;
              g2 = i4;
              len -= i4;
            }
            if (g1 > 0 && len > 0) {
              i4 = len % g1 || g1;
              intPart = intDigits.substr(0, i4);
              for (; i4 < len; i4 += g1)
                intPart += groupSeparator + intDigits.substr(i4, g1);
              if (g2 > 0)
                intPart += groupSeparator + intDigits.slice(i4);
              if (isNeg)
                intPart = "-" + intPart;
            }
            str = fractionPart ? intPart + (format2.decimalSeparator || "") + ((g2 = +format2.fractionGroupSize) ? fractionPart.replace(
              new RegExp("\\d{" + g2 + "}\\B", "g"),
              "$&" + (format2.fractionGroupSeparator || "")
            ) : fractionPart) : intPart;
          }
          return (format2.prefix || "") + str + (format2.suffix || "");
        };
        P.toFraction = function(md) {
          var d, d0, d1, d2, e4, exp, n3, n0, n1, q, r3, s3, x = this, xc = x.c;
          if (md != null) {
            n3 = new BigNumber2(md);
            if (!n3.isInteger() && (n3.c || n3.s !== 1) || n3.lt(ONE)) {
              throw Error(bignumberError + "Argument " + (n3.isInteger() ? "out of range: " : "not an integer: ") + valueOf(n3));
            }
          }
          if (!xc)
            return new BigNumber2(x);
          d = new BigNumber2(ONE);
          n1 = d0 = new BigNumber2(ONE);
          d1 = n0 = new BigNumber2(ONE);
          s3 = coeffToString(xc);
          e4 = d.e = s3.length - x.e - 1;
          d.c[0] = POWS_TEN[(exp = e4 % LOG_BASE) < 0 ? LOG_BASE + exp : exp];
          md = !md || n3.comparedTo(d) > 0 ? e4 > 0 ? d : n1 : n3;
          exp = MAX_EXP;
          MAX_EXP = 1 / 0;
          n3 = new BigNumber2(s3);
          n0.c[0] = 0;
          for (; ; ) {
            q = div(n3, d, 0, 1);
            d2 = d0.plus(q.times(d1));
            if (d2.comparedTo(md) == 1)
              break;
            d0 = d1;
            d1 = d2;
            n1 = n0.plus(q.times(d2 = n1));
            n0 = d2;
            d = n3.minus(q.times(d2 = d));
            n3 = d2;
          }
          d2 = div(md.minus(d0), d1, 0, 1);
          n0 = n0.plus(d2.times(n1));
          d0 = d0.plus(d2.times(d1));
          n0.s = n1.s = x.s;
          e4 = e4 * 2;
          r3 = div(n1, d1, e4, ROUNDING_MODE).minus(x).abs().comparedTo(
            div(n0, d0, e4, ROUNDING_MODE).minus(x).abs()
          ) < 1 ? [n1, d1] : [n0, d0];
          MAX_EXP = exp;
          return r3;
        };
        P.toNumber = function() {
          return +valueOf(this);
        };
        P.toPrecision = function(sd, rm) {
          if (sd != null)
            intCheck(sd, 1, MAX);
          return format(this, sd, rm, 2);
        };
        P.toString = function(b) {
          var str, n3 = this, s3 = n3.s, e4 = n3.e;
          if (e4 === null) {
            if (s3) {
              str = "Infinity";
              if (s3 < 0)
                str = "-" + str;
            } else {
              str = "NaN";
            }
          } else {
            if (b == null) {
              str = e4 <= TO_EXP_NEG || e4 >= TO_EXP_POS ? toExponential(coeffToString(n3.c), e4) : toFixedPoint(coeffToString(n3.c), e4, "0");
            } else if (b === 10 && alphabetHasNormalDecimalDigits) {
              n3 = round(new BigNumber2(n3), DECIMAL_PLACES + e4 + 1, ROUNDING_MODE);
              str = toFixedPoint(coeffToString(n3.c), n3.e, "0");
            } else {
              intCheck(b, 2, ALPHABET.length, "Base");
              str = convertBase(toFixedPoint(coeffToString(n3.c), e4, "0"), 10, b, s3, true);
            }
            if (s3 < 0 && n3.c[0])
              str = "-" + str;
          }
          return str;
        };
        P.valueOf = P.toJSON = function() {
          return valueOf(this);
        };
        P._isBigNumber = true;
        if (configObject != null)
          BigNumber2.set(configObject);
        return BigNumber2;
      }
      __name(clone, "clone");
      function bitFloor(n3) {
        var i4 = n3 | 0;
        return n3 > 0 || n3 === i4 ? i4 : i4 - 1;
      }
      __name(bitFloor, "bitFloor");
      function coeffToString(a4) {
        var s3, z, i4 = 1, j = a4.length, r3 = a4[0] + "";
        for (; i4 < j; ) {
          s3 = a4[i4++] + "";
          z = LOG_BASE - s3.length;
          for (; z--; s3 = "0" + s3)
            ;
          r3 += s3;
        }
        for (j = r3.length; r3.charCodeAt(--j) === 48; )
          ;
        return r3.slice(0, j + 1 || 1);
      }
      __name(coeffToString, "coeffToString");
      function compare(x, y2) {
        var a4, b, xc = x.c, yc = y2.c, i4 = x.s, j = y2.s, k = x.e, l3 = y2.e;
        if (!i4 || !j)
          return null;
        a4 = xc && !xc[0];
        b = yc && !yc[0];
        if (a4 || b)
          return a4 ? b ? 0 : -j : i4;
        if (i4 != j)
          return i4;
        a4 = i4 < 0;
        b = k == l3;
        if (!xc || !yc)
          return b ? 0 : !xc ^ a4 ? 1 : -1;
        if (!b)
          return k > l3 ^ a4 ? 1 : -1;
        j = (k = xc.length) < (l3 = yc.length) ? k : l3;
        for (i4 = 0; i4 < j; i4++)
          if (xc[i4] != yc[i4])
            return xc[i4] > yc[i4] ^ a4 ? 1 : -1;
        return k == l3 ? 0 : k > l3 ^ a4 ? 1 : -1;
      }
      __name(compare, "compare");
      function intCheck(n3, min, max, name) {
        if (n3 < min || n3 > max || n3 !== mathfloor(n3)) {
          throw Error(bignumberError + (name || "Argument") + (typeof n3 == "number" ? n3 < min || n3 > max ? " out of range: " : " not an integer: " : " not a primitive number: ") + String(n3));
        }
      }
      __name(intCheck, "intCheck");
      function isOdd(n3) {
        var k = n3.c.length - 1;
        return bitFloor(n3.e / LOG_BASE) == k && n3.c[k] % 2 != 0;
      }
      __name(isOdd, "isOdd");
      function toExponential(str, e4) {
        return (str.length > 1 ? str.charAt(0) + "." + str.slice(1) : str) + (e4 < 0 ? "e" : "e+") + e4;
      }
      __name(toExponential, "toExponential");
      function toFixedPoint(str, e4, z) {
        var len, zs;
        if (e4 < 0) {
          for (zs = z + "."; ++e4; zs += z)
            ;
          str = zs + str;
        } else {
          len = str.length;
          if (++e4 > len) {
            for (zs = z, e4 -= len; --e4; zs += z)
              ;
            str += zs;
          } else if (e4 < len) {
            str = str.slice(0, e4) + "." + str.slice(e4);
          }
        }
        return str;
      }
      __name(toFixedPoint, "toFixedPoint");
      BigNumber = clone();
      BigNumber["default"] = BigNumber.BigNumber = BigNumber;
      if (typeof define == "function" && define.amd) {
        define(function() {
          return BigNumber;
        });
      } else if (typeof module != "undefined" && module.exports) {
        module.exports = BigNumber;
      } else {
        if (!globalObject) {
          globalObject = typeof self != "undefined" && self ? self : window;
        }
        globalObject.BigNumber = BigNumber;
      }
    })(exports);
  }
});

// ../../node_modules/json-bigint/lib/stringify.js
var require_stringify = __commonJS({
  "../../node_modules/json-bigint/lib/stringify.js"(exports, module) {
    init_checked_fetch();
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    var BigNumber = require_bignumber();
    var JSON2 = module.exports;
    (function() {
      "use strict";
      function f(n3) {
        return n3 < 10 ? "0" + n3 : n3;
      }
      __name(f, "f");
      var cx = /[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g, escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g, gap, indent, meta = {
        // table of character substitutions
        "\b": "\\b",
        "	": "\\t",
        "\n": "\\n",
        "\f": "\\f",
        "\r": "\\r",
        '"': '\\"',
        "\\": "\\\\"
      }, rep;
      function quote(string) {
        escapable.lastIndex = 0;
        return escapable.test(string) ? '"' + string.replace(escapable, function(a4) {
          var c2 = meta[a4];
          return typeof c2 === "string" ? c2 : "\\u" + ("0000" + a4.charCodeAt(0).toString(16)).slice(-4);
        }) + '"' : '"' + string + '"';
      }
      __name(quote, "quote");
      function str(key, holder) {
        var i4, k, v, length, mind = gap, partial, value = holder[key], isBigNumber2 = value != null && (value instanceof BigNumber || BigNumber.isBigNumber(value));
        if (value && typeof value === "object" && typeof value.toJSON === "function") {
          value = value.toJSON(key);
        }
        if (typeof rep === "function") {
          value = rep.call(holder, key, value);
        }
        switch (typeof value) {
          case "string":
            if (isBigNumber2) {
              return value;
            } else {
              return quote(value);
            }
          case "number":
            return isFinite(value) ? String(value) : "null";
          case "boolean":
          case "null":
          case "bigint":
            return String(value);
          case "object":
            if (!value) {
              return "null";
            }
            gap += indent;
            partial = [];
            if (Object.prototype.toString.apply(value) === "[object Array]") {
              length = value.length;
              for (i4 = 0; i4 < length; i4 += 1) {
                partial[i4] = str(i4, value) || "null";
              }
              v = partial.length === 0 ? "[]" : gap ? "[\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "]" : "[" + partial.join(",") + "]";
              gap = mind;
              return v;
            }
            if (rep && typeof rep === "object") {
              length = rep.length;
              for (i4 = 0; i4 < length; i4 += 1) {
                if (typeof rep[i4] === "string") {
                  k = rep[i4];
                  v = str(k, value);
                  if (v) {
                    partial.push(quote(k) + (gap ? ": " : ":") + v);
                  }
                }
              }
            } else {
              Object.keys(value).forEach(function(k2) {
                var v2 = str(k2, value);
                if (v2) {
                  partial.push(quote(k2) + (gap ? ": " : ":") + v2);
                }
              });
            }
            v = partial.length === 0 ? "{}" : gap ? "{\n" + gap + partial.join(",\n" + gap) + "\n" + mind + "}" : "{" + partial.join(",") + "}";
            gap = mind;
            return v;
        }
      }
      __name(str, "str");
      if (typeof JSON2.stringify !== "function") {
        JSON2.stringify = function(value, replacer, space) {
          var i4;
          gap = "";
          indent = "";
          if (typeof space === "number") {
            for (i4 = 0; i4 < space; i4 += 1) {
              indent += " ";
            }
          } else if (typeof space === "string") {
            indent = space;
          }
          rep = replacer;
          if (replacer && typeof replacer !== "function" && (typeof replacer !== "object" || typeof replacer.length !== "number")) {
            throw new Error("JSON.stringify");
          }
          return str("", { "": value });
        };
      }
    })();
  }
});

// ../../node_modules/json-bigint/lib/parse.js
var require_parse = __commonJS({
  "../../node_modules/json-bigint/lib/parse.js"(exports, module) {
    init_checked_fetch();
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    var BigNumber = null;
    var suspectProtoRx = /(?:_|\\u005[Ff])(?:_|\\u005[Ff])(?:p|\\u0070)(?:r|\\u0072)(?:o|\\u006[Ff])(?:t|\\u0074)(?:o|\\u006[Ff])(?:_|\\u005[Ff])(?:_|\\u005[Ff])/;
    var suspectConstructorRx = /(?:c|\\u0063)(?:o|\\u006[Ff])(?:n|\\u006[Ee])(?:s|\\u0073)(?:t|\\u0074)(?:r|\\u0072)(?:u|\\u0075)(?:c|\\u0063)(?:t|\\u0074)(?:o|\\u006[Ff])(?:r|\\u0072)/;
    var json_parse = /* @__PURE__ */ __name(function(options) {
      "use strict";
      var _options = {
        strict: false,
        // not being strict means do not generate syntax errors for "duplicate key"
        storeAsString: false,
        // toggles whether the values should be stored as BigNumber (default) or a string
        alwaysParseAsBig: false,
        // toggles whether all numbers should be Big
        useNativeBigInt: false,
        // toggles whether to use native BigInt instead of bignumber.js
        protoAction: "error",
        constructorAction: "error"
      };
      if (options !== void 0 && options !== null) {
        if (options.strict === true) {
          _options.strict = true;
        }
        if (options.storeAsString === true) {
          _options.storeAsString = true;
        }
        _options.alwaysParseAsBig = options.alwaysParseAsBig === true ? options.alwaysParseAsBig : false;
        _options.useNativeBigInt = options.useNativeBigInt === true ? options.useNativeBigInt : false;
        if (typeof options.constructorAction !== "undefined") {
          if (options.constructorAction === "error" || options.constructorAction === "ignore" || options.constructorAction === "preserve") {
            _options.constructorAction = options.constructorAction;
          } else {
            throw new Error(
              `Incorrect value for constructorAction option, must be "error", "ignore" or undefined but passed ${options.constructorAction}`
            );
          }
        }
        if (typeof options.protoAction !== "undefined") {
          if (options.protoAction === "error" || options.protoAction === "ignore" || options.protoAction === "preserve") {
            _options.protoAction = options.protoAction;
          } else {
            throw new Error(
              `Incorrect value for protoAction option, must be "error", "ignore" or undefined but passed ${options.protoAction}`
            );
          }
        }
      }
      var at, ch, escapee = {
        '"': '"',
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "	"
      }, text, error = /* @__PURE__ */ __name(function(m2) {
        throw {
          name: "SyntaxError",
          message: m2,
          at,
          text
        };
      }, "error"), next = /* @__PURE__ */ __name(function(c2) {
        if (c2 && c2 !== ch) {
          error("Expected '" + c2 + "' instead of '" + ch + "'");
        }
        ch = text.charAt(at);
        at += 1;
        return ch;
      }, "next"), number = /* @__PURE__ */ __name(function() {
        var number2, string2 = "";
        if (ch === "-") {
          string2 = "-";
          next("-");
        }
        while (ch >= "0" && ch <= "9") {
          string2 += ch;
          next();
        }
        if (ch === ".") {
          string2 += ".";
          while (next() && ch >= "0" && ch <= "9") {
            string2 += ch;
          }
        }
        if (ch === "e" || ch === "E") {
          string2 += ch;
          next();
          if (ch === "-" || ch === "+") {
            string2 += ch;
            next();
          }
          while (ch >= "0" && ch <= "9") {
            string2 += ch;
            next();
          }
        }
        number2 = +string2;
        if (!isFinite(number2)) {
          error("Bad number");
        } else {
          if (BigNumber == null)
            BigNumber = require_bignumber();
          if (string2.length > 15)
            return _options.storeAsString ? string2 : _options.useNativeBigInt ? BigInt(string2) : new BigNumber(string2);
          else
            return !_options.alwaysParseAsBig ? number2 : _options.useNativeBigInt ? BigInt(number2) : new BigNumber(number2);
        }
      }, "number"), string = /* @__PURE__ */ __name(function() {
        var hex, i4, string2 = "", uffff;
        if (ch === '"') {
          var startAt = at;
          while (next()) {
            if (ch === '"') {
              if (at - 1 > startAt)
                string2 += text.substring(startAt, at - 1);
              next();
              return string2;
            }
            if (ch === "\\") {
              if (at - 1 > startAt)
                string2 += text.substring(startAt, at - 1);
              next();
              if (ch === "u") {
                uffff = 0;
                for (i4 = 0; i4 < 4; i4 += 1) {
                  hex = parseInt(next(), 16);
                  if (!isFinite(hex)) {
                    break;
                  }
                  uffff = uffff * 16 + hex;
                }
                string2 += String.fromCharCode(uffff);
              } else if (typeof escapee[ch] === "string") {
                string2 += escapee[ch];
              } else {
                break;
              }
              startAt = at;
            }
          }
        }
        error("Bad string");
      }, "string"), white = /* @__PURE__ */ __name(function() {
        while (ch && ch <= " ") {
          next();
        }
      }, "white"), word = /* @__PURE__ */ __name(function() {
        switch (ch) {
          case "t":
            next("t");
            next("r");
            next("u");
            next("e");
            return true;
          case "f":
            next("f");
            next("a");
            next("l");
            next("s");
            next("e");
            return false;
          case "n":
            next("n");
            next("u");
            next("l");
            next("l");
            return null;
        }
        error("Unexpected '" + ch + "'");
      }, "word"), value, array = /* @__PURE__ */ __name(function() {
        var array2 = [];
        if (ch === "[") {
          next("[");
          white();
          if (ch === "]") {
            next("]");
            return array2;
          }
          while (ch) {
            array2.push(value());
            white();
            if (ch === "]") {
              next("]");
              return array2;
            }
            next(",");
            white();
          }
        }
        error("Bad array");
      }, "array"), object = /* @__PURE__ */ __name(function() {
        var key, object2 = /* @__PURE__ */ Object.create(null);
        if (ch === "{") {
          next("{");
          white();
          if (ch === "}") {
            next("}");
            return object2;
          }
          while (ch) {
            key = string();
            white();
            next(":");
            if (_options.strict === true && Object.hasOwnProperty.call(object2, key)) {
              error('Duplicate key "' + key + '"');
            }
            if (suspectProtoRx.test(key) === true) {
              if (_options.protoAction === "error") {
                error("Object contains forbidden prototype property");
              } else if (_options.protoAction === "ignore") {
                value();
              } else {
                object2[key] = value();
              }
            } else if (suspectConstructorRx.test(key) === true) {
              if (_options.constructorAction === "error") {
                error("Object contains forbidden constructor property");
              } else if (_options.constructorAction === "ignore") {
                value();
              } else {
                object2[key] = value();
              }
            } else {
              object2[key] = value();
            }
            white();
            if (ch === "}") {
              next("}");
              return object2;
            }
            next(",");
            white();
          }
        }
        error("Bad object");
      }, "object");
      value = /* @__PURE__ */ __name(function() {
        white();
        switch (ch) {
          case "{":
            return object();
          case "[":
            return array();
          case '"':
            return string();
          case "-":
            return number();
          default:
            return ch >= "0" && ch <= "9" ? number() : word();
        }
      }, "value");
      return function(source, reviver2) {
        var result;
        text = source + "";
        at = 0;
        ch = " ";
        result = value();
        white();
        if (ch) {
          error("Syntax error");
        }
        return typeof reviver2 === "function" ? (/* @__PURE__ */ __name(function walk(holder, key) {
          var k, v, value2 = holder[key];
          if (value2 && typeof value2 === "object") {
            Object.keys(value2).forEach(function(k2) {
              v = walk(value2, k2);
              if (v !== void 0) {
                value2[k2] = v;
              } else {
                delete value2[k2];
              }
            });
          }
          return reviver2.call(holder, key, value2);
        }, "walk"))({ "": result }, "") : result;
      };
    }, "json_parse");
    module.exports = json_parse;
  }
});

// ../../node_modules/json-bigint/index.js
var require_json_bigint = __commonJS({
  "../../node_modules/json-bigint/index.js"(exports, module) {
    init_checked_fetch();
    init_strip_cf_connecting_ip_header();
    init_modules_watch_stub();
    var json_stringify = require_stringify().stringify;
    var json_parse = require_parse();
    module.exports = function(options) {
      return {
        parse: json_parse(options),
        stringify: json_stringify
      };
    };
    module.exports.parse = json_parse();
    module.exports.stringify = json_stringify;
  }
});

// .wrangler/tmp/bundle-MvYI3m/middleware-loader.entry.ts
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// .wrangler/tmp/bundle-MvYI3m/middleware-insertion-facade.js
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
  return String(string).replace(/[&<>"'`=\/]/g, /* @__PURE__ */ __name(function fromEntityMap(s3) {
    return entityMap[s3];
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
      for (var i4 = 0, valueLength = value.length; i4 < valueLength; ++i4) {
        chr = value.charAt(i4);
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
  for (var i4 = 0, numTokens = tokens.length; i4 < numTokens; ++i4) {
    token = tokens[i4];
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
  for (var i4 = 0, numTokens = tokens.length; i4 < numTokens; ++i4) {
    token = tokens[i4];
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
  for (var i4 = 0, numTokens = tokens.length; i4 < numTokens; ++i4) {
    value = void 0;
    token = tokens[i4];
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
  var self2 = this;
  var buffer = "";
  var value = context.lookup(token[1]);
  function subRender(template) {
    return self2.render(template, context, partials, config);
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
  for (var i4 = 0; i4 < partialByNl.length; i4++) {
    if (partialByNl[i4].length && (i4 > 0 || !lineHasNonSpace)) {
      partialByNl[i4] = filteredIndentation + partialByNl[i4];
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
!function(e4) {
  e4.String = "str", e4.Bool = "bool", e4.Float16 = "float16", e4.Float32 = "float32", e4.Int16 = "int16", e4.Int32 = "int32", e4.Int64 = "int64", e4.Int8 = "int8", e4.Uint16 = "uint16", e4.Uint32 = "uint32", e4.Uint64 = "uint64", e4.Uint8 = "uint8";
}(s || (s = {}));
var n = Object.getPrototypeOf(Uint8Array);
function r(e4) {
  return Array.isArray(e4) || e4 instanceof n;
}
__name(r, "r");
function a(e4) {
  return e4 instanceof n ? e4.length : e4.flat(1 / 0).reduce((e5, t2) => e5 + (t2 instanceof n ? t2.length : 1), 0);
}
__name(a, "a");
function o(e4, t2) {
  if (!r(t2)) {
    switch (e4) {
      case s.Bool:
        if ("boolean" == typeof t2)
          return;
        break;
      case s.Float16:
      case s.Float32:
        if ("number" == typeof t2)
          return;
        break;
      case s.Int8:
      case s.Uint8:
      case s.Int16:
      case s.Uint16:
      case s.Int32:
      case s.Uint32:
        if (Number.isInteger(t2))
          return;
        break;
      case s.Int64:
      case s.Uint64:
        if ("bigint" == typeof t2)
          return;
        break;
      case s.String:
        if ("string" == typeof t2)
          return;
    }
    throw new Error(`unexpected type "${e4}" with value "${t2}".`);
  }
  t2.forEach((t3) => o(e4, t3));
}
__name(o, "o");
function i(e4, t2) {
  if (r(t2))
    return [...t2].map((t3) => i(e4, t3));
  switch (e4) {
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
      return t2;
    case s.Int64:
    case s.Uint64:
      return t2.toString();
  }
  throw new Error(`unexpected type "${e4}" with value "${t2}".`);
}
__name(i, "i");
function E(e4, t2) {
  if (r(t2))
    return t2.map((t3) => E(e4, t3));
  switch (e4) {
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
      return t2;
    case s.Int64:
    case s.Uint64:
      return BigInt(t2);
  }
  throw new Error(`unexpected type "${e4}" with value "${t2}".`);
}
__name(E, "E");
var p = class {
  type;
  value;
  name;
  shape;
  constructor(e4, t2, s3 = {}) {
    this.type = e4, this.value = t2, s3.validate && o(e4, this.value), void 0 === s3.shape ? r(this.value) ? this.shape = [a(t2)] : this.shape = [] : this.shape = s3.shape, s3.validate && function(e5, t3) {
      if (0 === e5.length && !r(t3))
        return;
      const s4 = e5.reduce((e6, t4) => {
        if (!Number.isInteger(t4))
          throw new Error(`expected shape to be array-like of integers but found non-integer element "${t4}"`);
        return e6 * t4;
      }, 1);
      if (s4 != a(t3))
        throw new Error(`invalid shape: expected ${s4} elements for shape ${e5} but value array has length ${t3.length}`);
    }(this.shape, this.value), this.name = s3.name || null;
  }
  static fromJSON(e4) {
    const { type: t2, shape: s3, value: n3, b64Value: r3, name: a4 } = e4, o4 = { shape: s3, name: a4 };
    if (void 0 !== r3) {
      const e5 = function(e6, t3) {
        const s4 = atob(e6), n4 = new Uint8Array(s4.length);
        for (let e7 = 0; e7 < s4.length; e7++)
          n4[e7] = s4.charCodeAt(e7);
        const r4 = new DataView(n4.buffer).buffer;
        switch (t3) {
          case "float32":
            return new Float32Array(r4);
          case "float64":
            return new Float64Array(r4);
          case "int32":
            return new Int32Array(r4);
          case "int64":
            return new BigInt64Array(r4);
          default:
            throw Error(`invalid data type for base64 input: ${t3}`);
        }
      }(r3, t2)[0];
      return new p(t2, e5, o4);
    }
    return new p(t2, E(t2, n3), o4);
  }
  toJSON() {
    return { type: this.type, shape: this.shape, name: this.name, value: i(this.type, this.value) };
  }
};
__name(p, "p");
var A = "A chat between a curious human and an artificial intelligence assistant. The assistant gives helpful, detailed, and polite answers to the human's questions.";
var R = "Write code to solve the following coding problem that obeys the constraints and passes the example test cases. Please wrap your code answer using   ```:";
var c = /* @__PURE__ */ __name((e4, t2) => [{ role: "system", content: e4 }, { role: "user", content: t2 }], "c");
var m = /* @__PURE__ */ __name((e4) => {
  const t2 = {};
  e4.temperature && (t2.temperature = e4.temperature), e4.max_tokens && (t2.max_tokens = e4.max_tokens);
  const n3 = [new p(s.String, [e4.prompt], { shape: [1], name: "text_input" }), new p(s.String, [JSON.stringify(t2)], { shape: [1], name: "sampling_parameters" })];
  return e4.stream && n3.push(new p(s.Bool, true, { name: "stream" })), e4.image && (n3.push(new p(s.Uint8, e4.image, { shape: [1, e4.image.length], name: "image" })), n3.push(new p(s.Bool, true, { name: "exclude_input_in_output" }))), n3;
}, "m");
var u = /* @__PURE__ */ __name((e4, t2) => {
  let s3 = e4.generated_text.value[0];
  if (t2)
    for (const e5 in t2)
      s3 = s3.replace(t2[e5], "");
  return s3;
}, "u");
var O = /* @__PURE__ */ __name((e4) => (e4.inputsDefaultsStream = { max_tokens: 1800, ...e4.inputsDefaultsStream || {} }, e4.inputsDefaults = { max_tokens: 256, ...e4.inputsDefaults || {} }, e4.preProcessingArgs = { promptTemplate: "bare", defaultContext: A, defaultPromptMessages: c, ...e4.preProcessingArgs || {} }, e4 = { type: "triton", ...e4 }), "O");
var l = /* @__PURE__ */ __name((e4) => (e4.inputsDefaultsStream = { max_tokens: 512, ...e4.inputsDefaultsStream || {} }, e4.inputsDefaults = { max_tokens: 512, ...e4.inputsDefaults || {} }, e4.preProcessingArgs = { promptTemplate: "bare", defaultContext: A, defaultPromptMessages: c, ...e4.preProcessingArgs || {} }, e4 = { type: "vllm", generateTensorsFunc: (e5) => m(e5), postProcessingFunc: (e5, t2) => e5.name.value[0].slice(t2.prompt.length), postProcessingFuncStream: (e5, t2, s3) => e5.name.value[0], ...e4 }), "l");
var I = /* @__PURE__ */ __name((e4, t2, s3) => ({ type: "tgi", inputsDefaultsStream: { max_tokens: 512 }, inputsDefaults: { max_tokens: 256 }, preProcessingArgs: { promptTemplate: e4, defaultContext: t2, defaultPromptMessages: c }, postProcessingFunc: (e5, t3) => u(e5, s3), postProcessingFuncStream: (e5, t3, n3) => u(e5, s3) }), "I");
var D = mustache_default.parse;
var y = mustache_default.render;
TransformStream;
TransformStream;
I("deepseek", R, ["<|EOT|>"]), I("bare", R), I("inst", A), I("openchat", A), I("chatml", A, ["<|im_end|>"]), I("orca-hashes", A), I("llama2", A), I("zephyr", A), I("mistral-instruct", A), I("mistral-instruct", A), I("gemma", A), I("hermes2-pro", A), I("starling", A), I("llama2", R), l({ preProcessingArgs: { promptTemplate: "phi-2", defaultPromptMessages: (e4, t2) => [{ role: "question", content: t2 }] } }), l({ preProcessingArgs: { promptTemplate: "sqlcoder" } }), l({ preProcessingArgs: { defaultContext: "" } }), l({ preProcessingArgs: { promptTemplate: "falcon" } }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ preProcessingArgs: { promptTemplate: "tinyllama" } }), l({ preProcessingArgs: { promptTemplate: "openchat-alt" } }), l({ preProcessingArgs: { promptTemplate: "gemma" } }), l({ preProcessingArgs: { promptTemplate: "gemma" } }), l({ preProcessingArgs: { promptTemplate: "mistral-instruct" } }), l({ experimental: true, preProcessingArgs: { promptTemplate: "mistral-instruct" } }), l({ preProcessingArgs: { promptTemplate: "llama2" } }), l({ experimental: true, inputsDefaultsStream: { max_tokens: 1800 }, inputsDefaults: { max_tokens: 256 }, preProcessingArgs: { promptTemplate: "mistral-instruct" } }), l({ preProcessingArgs: { promptTemplate: "llama3" } }), l({ experimental: true }), l({ experimental: true }), l({ preProcessingArgs: { promptTemplate: "chatml" } }), l({ experimental: true }), O({ inputsDefaultsStream: { max_tokens: 2500 }, preProcessingArgs: { promptTemplate: "llama2" } }), O({ preProcessingArgs: { promptTemplate: "llama2" } }), O({ preProcessingArgs: { promptTemplate: "mistral-instruct" } });
var W = class {
  binding;
  options;
  logs;
  lastRequestId;
  constructor(e4, t2 = {}) {
    if (!e4)
      throw new Error("Ai binding is undefined. Please provide a valid binding.");
    this.binding = e4, this.options = t2, this.lastRequestId = "";
  }
  async run(e4, t2) {
    const s3 = await this.binding.run(e4, t2, this.options);
    return this.lastRequestId = this.binding.lastRequestId, this.options.debug && (this.logs = this.binding.getLogs()), s3;
  }
  getLogs() {
    return this.logs;
  }
};
__name(W, "W");

// ../../node_modules/node-appwrite/dist/index.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/client.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-fetch-native-with-agent/dist/native.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var e2 = globalThis.Blob;
var o2 = globalThis.File;
var a2 = globalThis.FormData;
var s2 = globalThis.Headers;
var t = globalThis.Request;
var h = globalThis.Response;
var i2 = globalThis.AbortController;
var l2 = globalThis.fetch || (() => {
  throw new Error("[node-fetch-native] Failed to fetch: `globalThis.fetch` is not available!");
});

// ../../node_modules/node-fetch-native-with-agent/dist/agent-stub.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var o3 = Object.defineProperty;
var e3 = /* @__PURE__ */ __name((t2, c2) => o3(t2, "name", { value: c2, configurable: true }), "e");
var i3 = Object.defineProperty;
var r2 = e3((t2, c2) => i3(t2, "name", { value: c2, configurable: true }), "e");
function a3() {
  return { agent: void 0, dispatcher: void 0 };
}
__name(a3, "a");
e3(a3, "createAgent"), r2(a3, "createAgent");
function n2() {
  return globalThis.fetch;
}
__name(n2, "n");
e3(n2, "createFetch"), r2(n2, "createFetch");
var h2 = globalThis.fetch;

// ../../node_modules/node-appwrite/dist/client.mjs
var import_json_bigint2 = __toESM(require_json_bigint(), 1);

// ../../node_modules/node-appwrite/dist/query.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var import_json_bigint = __toESM(require_json_bigint(), 1);
var JSONbig = (0, import_json_bigint.default)({ useNativeBigInt: true });
var _Query = /* @__PURE__ */ __name(class _Query2 {
  /**
   * Constructor for Query class.
   *
   * @param {string} method
   * @param {AttributesTypes} attribute
   * @param {QueryTypes} values
   */
  constructor(method, attribute, values) {
    this.method = method;
    this.attribute = attribute;
    if (values !== void 0) {
      if (Array.isArray(values)) {
        this.values = values;
      } else {
        this.values = [values];
      }
    }
  }
  /**
   * Convert the query object to a JSON string.
   *
   * @returns {string}
   */
  toString() {
    return JSONbig.stringify({
      method: this.method,
      attribute: this.attribute,
      values: this.values
    });
  }
}, "_Query");
_Query.equal = (attribute, value) => new _Query("equal", attribute, value).toString();
_Query.notEqual = (attribute, value) => new _Query("notEqual", attribute, value).toString();
_Query.regex = (attribute, pattern) => new _Query("regex", attribute, pattern).toString();
_Query.lessThan = (attribute, value) => new _Query("lessThan", attribute, value).toString();
_Query.lessThanEqual = (attribute, value) => new _Query("lessThanEqual", attribute, value).toString();
_Query.greaterThan = (attribute, value) => new _Query("greaterThan", attribute, value).toString();
_Query.greaterThanEqual = (attribute, value) => new _Query("greaterThanEqual", attribute, value).toString();
_Query.isNull = (attribute) => new _Query("isNull", attribute).toString();
_Query.isNotNull = (attribute) => new _Query("isNotNull", attribute).toString();
_Query.exists = (attributes) => new _Query("exists", void 0, attributes).toString();
_Query.notExists = (attributes) => new _Query("notExists", void 0, attributes).toString();
_Query.between = (attribute, start, end) => new _Query("between", attribute, [start, end]).toString();
_Query.startsWith = (attribute, value) => new _Query("startsWith", attribute, value).toString();
_Query.endsWith = (attribute, value) => new _Query("endsWith", attribute, value).toString();
_Query.select = (attributes) => new _Query("select", void 0, attributes).toString();
_Query.search = (attribute, value) => new _Query("search", attribute, value).toString();
_Query.orderDesc = (attribute) => new _Query("orderDesc", attribute).toString();
_Query.orderAsc = (attribute) => new _Query("orderAsc", attribute).toString();
_Query.orderRandom = () => new _Query("orderRandom").toString();
_Query.cursorAfter = (documentId) => new _Query("cursorAfter", void 0, documentId).toString();
_Query.cursorBefore = (documentId) => new _Query("cursorBefore", void 0, documentId).toString();
_Query.limit = (limit) => new _Query("limit", void 0, limit).toString();
_Query.offset = (offset) => new _Query("offset", void 0, offset).toString();
_Query.contains = (attribute, value) => new _Query("contains", attribute, value).toString();
_Query.containsAny = (attribute, value) => new _Query("containsAny", attribute, value).toString();
_Query.containsAll = (attribute, value) => new _Query("containsAll", attribute, value).toString();
_Query.notContains = (attribute, value) => new _Query("notContains", attribute, value).toString();
_Query.notSearch = (attribute, value) => new _Query("notSearch", attribute, value).toString();
_Query.notBetween = (attribute, start, end) => new _Query("notBetween", attribute, [start, end]).toString();
_Query.notStartsWith = (attribute, value) => new _Query("notStartsWith", attribute, value).toString();
_Query.notEndsWith = (attribute, value) => new _Query("notEndsWith", attribute, value).toString();
_Query.createdBefore = (value) => _Query.lessThan("$createdAt", value);
_Query.createdAfter = (value) => _Query.greaterThan("$createdAt", value);
_Query.createdBetween = (start, end) => _Query.between("$createdAt", start, end);
_Query.updatedBefore = (value) => _Query.lessThan("$updatedAt", value);
_Query.updatedAfter = (value) => _Query.greaterThan("$updatedAt", value);
_Query.updatedBetween = (start, end) => _Query.between("$updatedAt", start, end);
_Query.or = (queries) => new _Query("or", void 0, queries.map((query) => JSONbig.parse(query))).toString();
_Query.and = (queries) => new _Query("and", void 0, queries.map((query) => JSONbig.parse(query))).toString();
_Query.elemMatch = (attribute, queries) => new _Query(
  "elemMatch",
  attribute,
  queries.map((query) => JSONbig.parse(query))
).toString();
_Query.distanceEqual = (attribute, values, distance, meters = true) => new _Query("distanceEqual", attribute, [[values, distance, meters]]).toString();
_Query.distanceNotEqual = (attribute, values, distance, meters = true) => new _Query("distanceNotEqual", attribute, [[values, distance, meters]]).toString();
_Query.distanceGreaterThan = (attribute, values, distance, meters = true) => new _Query("distanceGreaterThan", attribute, [[values, distance, meters]]).toString();
_Query.distanceLessThan = (attribute, values, distance, meters = true) => new _Query("distanceLessThan", attribute, [[values, distance, meters]]).toString();
_Query.intersects = (attribute, values) => new _Query("intersects", attribute, [values]).toString();
_Query.notIntersects = (attribute, values) => new _Query("notIntersects", attribute, [values]).toString();
_Query.crosses = (attribute, values) => new _Query("crosses", attribute, [values]).toString();
_Query.notCrosses = (attribute, values) => new _Query("notCrosses", attribute, [values]).toString();
_Query.overlaps = (attribute, values) => new _Query("overlaps", attribute, [values]).toString();
_Query.notOverlaps = (attribute, values) => new _Query("notOverlaps", attribute, [values]).toString();
_Query.touches = (attribute, values) => new _Query("touches", attribute, [values]).toString();
_Query.notTouches = (attribute, values) => new _Query("notTouches", attribute, [values]).toString();

// ../../node_modules/node-appwrite/dist/client.mjs
var JSONbigParser = (0, import_json_bigint2.default)({ storeAsString: false });
var JSONbigSerializer = (0, import_json_bigint2.default)({ useNativeBigInt: true });
var MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
var MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);
var MAX_INT64 = BigInt("9223372036854775807");
var MIN_INT64 = BigInt("-9223372036854775808");
function isBigNumber(value) {
  return value !== null && typeof value === "object" && value._isBigNumber === true && typeof value.isInteger === "function" && typeof value.toFixed === "function" && typeof value.toNumber === "function";
}
__name(isBigNumber, "isBigNumber");
function reviver(_key, value) {
  if (isBigNumber(value)) {
    if (value.isInteger()) {
      const str = value.toFixed();
      const bi = BigInt(str);
      if (bi >= MIN_SAFE && bi <= MAX_SAFE) {
        return Number(str);
      }
      if (bi >= MIN_INT64 && bi <= MAX_INT64) {
        return bi;
      }
      return value.toNumber();
    }
    return value.toNumber();
  }
  return value;
}
__name(reviver, "reviver");
var JSONbig2 = {
  parse: (text) => JSONbigParser.parse(text, reviver),
  stringify: JSONbigSerializer.stringify
};
var AppwriteException = /* @__PURE__ */ __name(class extends Error {
  constructor(message, code = 0, type = "", response = "") {
    super(message);
    this.name = "AppwriteException";
    this.message = message;
    this.code = code;
    this.type = type;
    this.response = response;
  }
}, "AppwriteException");
function getUserAgent() {
  let ua = "AppwriteNodeJSSDK/22.1.3";
  const platform = [];
  if (typeof process !== "undefined") {
    if (typeof process.platform === "string")
      platform.push(process.platform);
    if (typeof process.arch === "string")
      platform.push(process.arch);
  }
  if (platform.length > 0) {
    ua += ` (${platform.join("; ")})`;
  }
  if (typeof navigator !== "undefined" && true) {
    ua += ` ${"Cloudflare-Workers"}`;
  } else if (typeof globalThis.EdgeRuntime === "string") {
    ua += ` EdgeRuntime`;
  } else if (typeof process !== "undefined" && typeof process.version === "string") {
    ua += ` Node.js/${process.version}`;
  }
  return ua;
}
__name(getUserAgent, "getUserAgent");
var _Client = /* @__PURE__ */ __name(class _Client2 {
  constructor() {
    this.config = {
      endpoint: "https://cloud.appwrite.io/v1",
      selfSigned: false,
      project: "",
      key: "",
      jwt: "",
      locale: "",
      session: "",
      forwardeduseragent: ""
    };
    this.headers = {
      "x-sdk-name": "Node.js",
      "x-sdk-platform": "server",
      "x-sdk-language": "nodejs",
      "x-sdk-version": "22.1.3",
      "user-agent": getUserAgent(),
      "X-Appwrite-Response-Format": "1.8.0"
    };
  }
  /**
   * Set Endpoint
   *
   * Your project endpoint
   *
   * @param {string} endpoint
   *
   * @returns {this}
   */
  setEndpoint(endpoint) {
    if (!endpoint || typeof endpoint !== "string") {
      throw new AppwriteException("Endpoint must be a valid string");
    }
    if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
      throw new AppwriteException("Invalid endpoint URL: " + endpoint);
    }
    this.config.endpoint = endpoint;
    return this;
  }
  /**
   * Set self-signed
   *
   * @param {boolean} selfSigned
   *
   * @returns {this}
   */
  setSelfSigned(selfSigned) {
    if (typeof globalThis.EdgeRuntime !== "undefined") {
      console.warn("setSelfSigned is not supported in edge runtimes.");
    }
    this.config.selfSigned = selfSigned;
    return this;
  }
  /**
   * Add header
   *
   * @param {string} header
   * @param {string} value
   *
   * @returns {this}
   */
  addHeader(header, value) {
    this.headers[header.toLowerCase()] = value;
    return this;
  }
  /**
   * Set Project
   *
   * Your project ID
   *
   * @param value string
   *
   * @return {this}
   */
  setProject(value) {
    this.headers["X-Appwrite-Project"] = value;
    this.config.project = value;
    return this;
  }
  /**
   * Set Key
   *
   * Your secret API key
   *
   * @param value string
   *
   * @return {this}
   */
  setKey(value) {
    this.headers["X-Appwrite-Key"] = value;
    this.config.key = value;
    return this;
  }
  /**
   * Set JWT
   *
   * Your secret JSON Web Token
   *
   * @param value string
   *
   * @return {this}
   */
  setJWT(value) {
    this.headers["X-Appwrite-JWT"] = value;
    this.config.jwt = value;
    return this;
  }
  /**
   * Set Locale
   *
   * @param value string
   *
   * @return {this}
   */
  setLocale(value) {
    this.headers["X-Appwrite-Locale"] = value;
    this.config.locale = value;
    return this;
  }
  /**
   * Set Session
   *
   * The user session to authenticate with
   *
   * @param value string
   *
   * @return {this}
   */
  setSession(value) {
    this.headers["X-Appwrite-Session"] = value;
    this.config.session = value;
    return this;
  }
  /**
   * Set ForwardedUserAgent
   *
   * The user agent string of the client that made the request
   *
   * @param value string
   *
   * @return {this}
   */
  setForwardedUserAgent(value) {
    this.headers["X-Forwarded-User-Agent"] = value;
    this.config.forwardeduseragent = value;
    return this;
  }
  prepareRequest(method, url, headers = {}, params = {}) {
    method = method.toUpperCase();
    headers = Object.assign({}, this.headers, headers);
    let options = {
      method,
      headers,
      ...a3(this.config.endpoint, { rejectUnauthorized: !this.config.selfSigned })
    };
    if (method === "GET") {
      for (const [key, value] of Object.entries(_Client2.flatten(params))) {
        url.searchParams.append(key, value);
      }
    } else {
      switch (headers["content-type"]) {
        case "application/json":
          options.body = JSONbig2.stringify(params);
          break;
        case "multipart/form-data":
          const formData = new a2();
          for (const [key, value] of Object.entries(params)) {
            if (value instanceof o2) {
              formData.append(key, value, value.name);
            } else if (Array.isArray(value)) {
              for (const nestedValue of value) {
                formData.append(`${key}[]`, nestedValue);
              }
            } else {
              formData.append(key, value);
            }
          }
          options.body = formData;
          delete headers["content-type"];
          break;
      }
    }
    return { uri: url.toString(), options };
  }
  async chunkedUpload(method, url, headers = {}, originalPayload = {}, onProgress) {
    const [fileParam, file] = Object.entries(originalPayload).find(([_, value]) => value instanceof o2) ?? [];
    if (!file || !fileParam) {
      throw new Error("File not found in payload");
    }
    if (file.size <= _Client2.CHUNK_SIZE) {
      return await this.call(method, url, headers, originalPayload);
    }
    let start = 0;
    let response = null;
    while (start < file.size) {
      let end = start + _Client2.CHUNK_SIZE;
      if (end >= file.size) {
        end = file.size;
      }
      headers["content-range"] = `bytes ${start}-${end - 1}/${file.size}`;
      const chunk = file.slice(start, end);
      let payload = { ...originalPayload };
      payload[fileParam] = new o2([chunk], file.name);
      response = await this.call(method, url, headers, payload);
      if (onProgress && typeof onProgress === "function") {
        onProgress({
          $id: response.$id,
          progress: Math.round(end / file.size * 100),
          sizeUploaded: end,
          chunksTotal: Math.ceil(file.size / _Client2.CHUNK_SIZE),
          chunksUploaded: Math.ceil(end / _Client2.CHUNK_SIZE)
        });
      }
      if (response && response.$id) {
        headers["x-appwrite-id"] = response.$id;
      }
      start = end;
    }
    return response;
  }
  async ping() {
    return this.call("GET", new URL(this.config.endpoint + "/ping"));
  }
  async redirect(method, url, headers = {}, params = {}) {
    const { uri, options } = this.prepareRequest(method, url, headers, params);
    const response = await l2(uri, {
      ...options,
      redirect: "manual"
    });
    if (response.status !== 301 && response.status !== 302) {
      throw new AppwriteException("Invalid redirect", response.status);
    }
    return response.headers.get("location") || "";
  }
  async call(method, url, headers = {}, params = {}, responseType = "json") {
    var _a2, _b;
    const { uri, options } = this.prepareRequest(method, url, headers, params);
    let data = null;
    const response = await l2(uri, options);
    const warnings = response.headers.get("x-appwrite-warning");
    if (warnings) {
      warnings.split(";").forEach((warning) => console.warn("Warning: " + warning));
    }
    if ((_a2 = response.headers.get("content-type")) == null ? void 0 : _a2.includes("application/json")) {
      data = JSONbig2.parse(await response.text());
    } else if (responseType === "arrayBuffer") {
      data = await response.arrayBuffer();
    } else {
      data = {
        message: await response.text()
      };
    }
    if (400 <= response.status) {
      let responseText = "";
      if (((_b = response.headers.get("content-type")) == null ? void 0 : _b.includes("application/json")) || responseType === "arrayBuffer") {
        responseText = JSONbig2.stringify(data);
      } else {
        responseText = data == null ? void 0 : data.message;
      }
      throw new AppwriteException(data == null ? void 0 : data.message, response.status, data == null ? void 0 : data.type, responseText);
    }
    return data;
  }
  static flatten(data, prefix = "") {
    let output = {};
    for (const [key, value] of Object.entries(data)) {
      let finalKey = prefix ? prefix + "[" + key + "]" : key;
      if (Array.isArray(value)) {
        output = { ...output, ..._Client2.flatten(value, finalKey) };
      } else {
        output[finalKey] = value;
      }
    }
    return output;
  }
}, "_Client");
_Client.CHUNK_SIZE = 1024 * 1024 * 5;
var Client = _Client;

// ../../node_modules/node-appwrite/dist/services/account.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/activities.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/avatars.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/backups.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/databases.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/functions.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/graphql.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/health.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/locale.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/messaging.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/sites.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/storage.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var Storage = /* @__PURE__ */ __name(class {
  constructor(client) {
    this.client = client;
  }
  listBuckets(paramsOrFirst, ...rest) {
    let params;
    if (!paramsOrFirst || paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        queries: paramsOrFirst,
        search: rest[0],
        total: rest[1]
      };
    }
    const queries = params.queries;
    const search = params.search;
    const total = params.total;
    const apiPath = "/storage/buckets";
    const payload = {};
    if (typeof queries !== "undefined") {
      payload["queries"] = queries;
    }
    if (typeof search !== "undefined") {
      payload["search"] = search;
    }
    if (typeof total !== "undefined") {
      payload["total"] = total;
    }
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {};
    return this.client.call(
      "get",
      uri,
      apiHeaders,
      payload
    );
  }
  createBucket(paramsOrFirst, ...rest) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst,
        name: rest[0],
        permissions: rest[1],
        fileSecurity: rest[2],
        enabled: rest[3],
        maximumFileSize: rest[4],
        allowedFileExtensions: rest[5],
        compression: rest[6],
        encryption: rest[7],
        antivirus: rest[8],
        transformations: rest[9]
      };
    }
    const bucketId = params.bucketId;
    const name = params.name;
    const permissions = params.permissions;
    const fileSecurity = params.fileSecurity;
    const enabled = params.enabled;
    const maximumFileSize = params.maximumFileSize;
    const allowedFileExtensions = params.allowedFileExtensions;
    const compression = params.compression;
    const encryption = params.encryption;
    const antivirus = params.antivirus;
    const transformations = params.transformations;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    if (typeof name === "undefined") {
      throw new AppwriteException('Missing required parameter: "name"');
    }
    const apiPath = "/storage/buckets";
    const payload = {};
    if (typeof bucketId !== "undefined") {
      payload["bucketId"] = bucketId;
    }
    if (typeof name !== "undefined") {
      payload["name"] = name;
    }
    if (typeof permissions !== "undefined") {
      payload["permissions"] = permissions;
    }
    if (typeof fileSecurity !== "undefined") {
      payload["fileSecurity"] = fileSecurity;
    }
    if (typeof enabled !== "undefined") {
      payload["enabled"] = enabled;
    }
    if (typeof maximumFileSize !== "undefined") {
      payload["maximumFileSize"] = maximumFileSize;
    }
    if (typeof allowedFileExtensions !== "undefined") {
      payload["allowedFileExtensions"] = allowedFileExtensions;
    }
    if (typeof compression !== "undefined") {
      payload["compression"] = compression;
    }
    if (typeof encryption !== "undefined") {
      payload["encryption"] = encryption;
    }
    if (typeof antivirus !== "undefined") {
      payload["antivirus"] = antivirus;
    }
    if (typeof transformations !== "undefined") {
      payload["transformations"] = transformations;
    }
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {
      "content-type": "application/json"
    };
    return this.client.call(
      "post",
      uri,
      apiHeaders,
      payload
    );
  }
  getBucket(paramsOrFirst) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst
      };
    }
    const bucketId = params.bucketId;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    const apiPath = "/storage/buckets/{bucketId}".replace("{bucketId}", bucketId);
    const payload = {};
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {};
    return this.client.call(
      "get",
      uri,
      apiHeaders,
      payload
    );
  }
  updateBucket(paramsOrFirst, ...rest) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst,
        name: rest[0],
        permissions: rest[1],
        fileSecurity: rest[2],
        enabled: rest[3],
        maximumFileSize: rest[4],
        allowedFileExtensions: rest[5],
        compression: rest[6],
        encryption: rest[7],
        antivirus: rest[8],
        transformations: rest[9]
      };
    }
    const bucketId = params.bucketId;
    const name = params.name;
    const permissions = params.permissions;
    const fileSecurity = params.fileSecurity;
    const enabled = params.enabled;
    const maximumFileSize = params.maximumFileSize;
    const allowedFileExtensions = params.allowedFileExtensions;
    const compression = params.compression;
    const encryption = params.encryption;
    const antivirus = params.antivirus;
    const transformations = params.transformations;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    if (typeof name === "undefined") {
      throw new AppwriteException('Missing required parameter: "name"');
    }
    const apiPath = "/storage/buckets/{bucketId}".replace("{bucketId}", bucketId);
    const payload = {};
    if (typeof name !== "undefined") {
      payload["name"] = name;
    }
    if (typeof permissions !== "undefined") {
      payload["permissions"] = permissions;
    }
    if (typeof fileSecurity !== "undefined") {
      payload["fileSecurity"] = fileSecurity;
    }
    if (typeof enabled !== "undefined") {
      payload["enabled"] = enabled;
    }
    if (typeof maximumFileSize !== "undefined") {
      payload["maximumFileSize"] = maximumFileSize;
    }
    if (typeof allowedFileExtensions !== "undefined") {
      payload["allowedFileExtensions"] = allowedFileExtensions;
    }
    if (typeof compression !== "undefined") {
      payload["compression"] = compression;
    }
    if (typeof encryption !== "undefined") {
      payload["encryption"] = encryption;
    }
    if (typeof antivirus !== "undefined") {
      payload["antivirus"] = antivirus;
    }
    if (typeof transformations !== "undefined") {
      payload["transformations"] = transformations;
    }
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {
      "content-type": "application/json"
    };
    return this.client.call(
      "put",
      uri,
      apiHeaders,
      payload
    );
  }
  deleteBucket(paramsOrFirst) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst
      };
    }
    const bucketId = params.bucketId;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    const apiPath = "/storage/buckets/{bucketId}".replace("{bucketId}", bucketId);
    const payload = {};
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {
      "content-type": "application/json"
    };
    return this.client.call(
      "delete",
      uri,
      apiHeaders,
      payload
    );
  }
  listFiles(paramsOrFirst, ...rest) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst,
        queries: rest[0],
        search: rest[1],
        total: rest[2]
      };
    }
    const bucketId = params.bucketId;
    const queries = params.queries;
    const search = params.search;
    const total = params.total;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    const apiPath = "/storage/buckets/{bucketId}/files".replace("{bucketId}", bucketId);
    const payload = {};
    if (typeof queries !== "undefined") {
      payload["queries"] = queries;
    }
    if (typeof search !== "undefined") {
      payload["search"] = search;
    }
    if (typeof total !== "undefined") {
      payload["total"] = total;
    }
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {};
    return this.client.call(
      "get",
      uri,
      apiHeaders,
      payload
    );
  }
  createFile(paramsOrFirst, ...rest) {
    let params;
    let onProgress;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
      onProgress = paramsOrFirst == null ? void 0 : paramsOrFirst.onProgress;
    } else {
      params = {
        bucketId: paramsOrFirst,
        fileId: rest[0],
        file: rest[1],
        permissions: rest[2]
      };
      onProgress = rest[3];
    }
    const bucketId = params.bucketId;
    const fileId = params.fileId;
    const file = params.file;
    const permissions = params.permissions;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    if (typeof fileId === "undefined") {
      throw new AppwriteException('Missing required parameter: "fileId"');
    }
    if (typeof file === "undefined") {
      throw new AppwriteException('Missing required parameter: "file"');
    }
    const apiPath = "/storage/buckets/{bucketId}/files".replace("{bucketId}", bucketId);
    const payload = {};
    if (typeof fileId !== "undefined") {
      payload["fileId"] = fileId;
    }
    if (typeof file !== "undefined") {
      payload["file"] = file;
    }
    if (typeof permissions !== "undefined") {
      payload["permissions"] = permissions;
    }
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {
      "content-type": "multipart/form-data"
    };
    return this.client.chunkedUpload(
      "post",
      uri,
      apiHeaders,
      payload,
      onProgress
    );
  }
  getFile(paramsOrFirst, ...rest) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst,
        fileId: rest[0]
      };
    }
    const bucketId = params.bucketId;
    const fileId = params.fileId;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    if (typeof fileId === "undefined") {
      throw new AppwriteException('Missing required parameter: "fileId"');
    }
    const apiPath = "/storage/buckets/{bucketId}/files/{fileId}".replace("{bucketId}", bucketId).replace("{fileId}", fileId);
    const payload = {};
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {};
    return this.client.call(
      "get",
      uri,
      apiHeaders,
      payload
    );
  }
  updateFile(paramsOrFirst, ...rest) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst,
        fileId: rest[0],
        name: rest[1],
        permissions: rest[2]
      };
    }
    const bucketId = params.bucketId;
    const fileId = params.fileId;
    const name = params.name;
    const permissions = params.permissions;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    if (typeof fileId === "undefined") {
      throw new AppwriteException('Missing required parameter: "fileId"');
    }
    const apiPath = "/storage/buckets/{bucketId}/files/{fileId}".replace("{bucketId}", bucketId).replace("{fileId}", fileId);
    const payload = {};
    if (typeof name !== "undefined") {
      payload["name"] = name;
    }
    if (typeof permissions !== "undefined") {
      payload["permissions"] = permissions;
    }
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {
      "content-type": "application/json"
    };
    return this.client.call(
      "put",
      uri,
      apiHeaders,
      payload
    );
  }
  deleteFile(paramsOrFirst, ...rest) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst,
        fileId: rest[0]
      };
    }
    const bucketId = params.bucketId;
    const fileId = params.fileId;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    if (typeof fileId === "undefined") {
      throw new AppwriteException('Missing required parameter: "fileId"');
    }
    const apiPath = "/storage/buckets/{bucketId}/files/{fileId}".replace("{bucketId}", bucketId).replace("{fileId}", fileId);
    const payload = {};
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {
      "content-type": "application/json"
    };
    return this.client.call(
      "delete",
      uri,
      apiHeaders,
      payload
    );
  }
  getFileDownload(paramsOrFirst, ...rest) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst,
        fileId: rest[0],
        token: rest[1]
      };
    }
    const bucketId = params.bucketId;
    const fileId = params.fileId;
    const token = params.token;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    if (typeof fileId === "undefined") {
      throw new AppwriteException('Missing required parameter: "fileId"');
    }
    const apiPath = "/storage/buckets/{bucketId}/files/{fileId}/download".replace("{bucketId}", bucketId).replace("{fileId}", fileId);
    const payload = {};
    if (typeof token !== "undefined") {
      payload["token"] = token;
    }
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {};
    return this.client.call(
      "get",
      uri,
      apiHeaders,
      payload,
      "arrayBuffer"
    );
  }
  getFilePreview(paramsOrFirst, ...rest) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst,
        fileId: rest[0],
        width: rest[1],
        height: rest[2],
        gravity: rest[3],
        quality: rest[4],
        borderWidth: rest[5],
        borderColor: rest[6],
        borderRadius: rest[7],
        opacity: rest[8],
        rotation: rest[9],
        background: rest[10],
        output: rest[11],
        token: rest[12]
      };
    }
    const bucketId = params.bucketId;
    const fileId = params.fileId;
    const width = params.width;
    const height = params.height;
    const gravity = params.gravity;
    const quality = params.quality;
    const borderWidth = params.borderWidth;
    const borderColor = params.borderColor;
    const borderRadius = params.borderRadius;
    const opacity = params.opacity;
    const rotation = params.rotation;
    const background = params.background;
    const output = params.output;
    const token = params.token;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    if (typeof fileId === "undefined") {
      throw new AppwriteException('Missing required parameter: "fileId"');
    }
    const apiPath = "/storage/buckets/{bucketId}/files/{fileId}/preview".replace("{bucketId}", bucketId).replace("{fileId}", fileId);
    const payload = {};
    if (typeof width !== "undefined") {
      payload["width"] = width;
    }
    if (typeof height !== "undefined") {
      payload["height"] = height;
    }
    if (typeof gravity !== "undefined") {
      payload["gravity"] = gravity;
    }
    if (typeof quality !== "undefined") {
      payload["quality"] = quality;
    }
    if (typeof borderWidth !== "undefined") {
      payload["borderWidth"] = borderWidth;
    }
    if (typeof borderColor !== "undefined") {
      payload["borderColor"] = borderColor;
    }
    if (typeof borderRadius !== "undefined") {
      payload["borderRadius"] = borderRadius;
    }
    if (typeof opacity !== "undefined") {
      payload["opacity"] = opacity;
    }
    if (typeof rotation !== "undefined") {
      payload["rotation"] = rotation;
    }
    if (typeof background !== "undefined") {
      payload["background"] = background;
    }
    if (typeof output !== "undefined") {
      payload["output"] = output;
    }
    if (typeof token !== "undefined") {
      payload["token"] = token;
    }
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {};
    return this.client.call(
      "get",
      uri,
      apiHeaders,
      payload,
      "arrayBuffer"
    );
  }
  getFileView(paramsOrFirst, ...rest) {
    let params;
    if (paramsOrFirst && typeof paramsOrFirst === "object" && !Array.isArray(paramsOrFirst)) {
      params = paramsOrFirst || {};
    } else {
      params = {
        bucketId: paramsOrFirst,
        fileId: rest[0],
        token: rest[1]
      };
    }
    const bucketId = params.bucketId;
    const fileId = params.fileId;
    const token = params.token;
    if (typeof bucketId === "undefined") {
      throw new AppwriteException('Missing required parameter: "bucketId"');
    }
    if (typeof fileId === "undefined") {
      throw new AppwriteException('Missing required parameter: "fileId"');
    }
    const apiPath = "/storage/buckets/{bucketId}/files/{fileId}/view".replace("{bucketId}", bucketId).replace("{fileId}", fileId);
    const payload = {};
    if (typeof token !== "undefined") {
      payload["token"] = token;
    }
    const uri = new URL(this.client.config.endpoint + apiPath);
    const apiHeaders = {};
    return this.client.call(
      "get",
      uri,
      apiHeaders,
      payload,
      "arrayBuffer"
    );
  }
}, "Storage");

// ../../node_modules/node-appwrite/dist/services/tables-db.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/teams.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/tokens.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/services/users.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/permission.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var Permission = /* @__PURE__ */ __name(class {
}, "Permission");
Permission.read = (role) => {
  return `read("${role}")`;
};
Permission.write = (role) => {
  return `write("${role}")`;
};
Permission.create = (role) => {
  return `create("${role}")`;
};
Permission.update = (role) => {
  return `update("${role}")`;
};
Permission.delete = (role) => {
  return `delete("${role}")`;
};

// ../../node_modules/node-appwrite/dist/role.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/id.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var _hexTimestamp, _a, hexTimestamp_fn;
var ID = (/* @__PURE__ */ __name(_a = class {
  /**
   * Uses the provided ID as the ID for the resource.
   *
   * @param {string} id
   * @returns {string}
   */
  static custom(id) {
    return id;
  }
  /**
   * Have Appwrite generate a unique ID for you.
   * 
   * @param {number} padding. Default is 7.
   * @returns {string}
   */
  static unique(padding = 7) {
    var _a2;
    const baseId = __privateMethod(_a2 = _a, _hexTimestamp, hexTimestamp_fn).call(_a2);
    let randomPadding = "";
    for (let i4 = 0; i4 < padding; i4++) {
      const randomHexDigit = Math.floor(Math.random() * 16).toString(16);
      randomPadding += randomHexDigit;
    }
    return baseId + randomPadding;
  }
}, "_ID"), _hexTimestamp = new WeakSet(), hexTimestamp_fn = /* @__PURE__ */ __name(function() {
  const now = /* @__PURE__ */ new Date();
  const sec = Math.floor(now.getTime() / 1e3);
  const msec = now.getMilliseconds();
  const hexTimestamp = sec.toString(16) + msec.toString(16).padStart(5, "0");
  return hexTimestamp;
}, "#hexTimestamp"), /**
 * Generate an hex ID based on timestamp.
 * Recreated from https://www.php.net/manual/en/function.uniqid.php
 *
 * @returns {string}
 */
__privateAdd(_a, _hexTimestamp), _a);

// ../../node_modules/node-appwrite/dist/operator.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
var _Operator = /* @__PURE__ */ __name(class _Operator2 {
  /**
   * Constructor for Operator class.
   *
   * @param {string} method
   * @param {OperatorValues} values
   */
  constructor(method, values) {
    this.method = method;
    if (values !== void 0) {
      if (Array.isArray(values)) {
        this.values = values;
      } else {
        this.values = [values];
      }
    }
  }
  /**
   * Convert the operator object to a JSON string.
   *
   * @returns {string}
   */
  toString() {
    return JSON.stringify({
      method: this.method,
      values: this.values
    });
  }
}, "_Operator");
_Operator.increment = (value = 1, max) => {
  if (isNaN(value) || !isFinite(value)) {
    throw new Error("Value cannot be NaN or Infinity");
  }
  if (max !== void 0 && (isNaN(max) || !isFinite(max))) {
    throw new Error("Max cannot be NaN or Infinity");
  }
  const values = [value];
  if (max !== void 0) {
    values.push(max);
  }
  return new _Operator("increment", values).toString();
};
_Operator.decrement = (value = 1, min) => {
  if (isNaN(value) || !isFinite(value)) {
    throw new Error("Value cannot be NaN or Infinity");
  }
  if (min !== void 0 && (isNaN(min) || !isFinite(min))) {
    throw new Error("Min cannot be NaN or Infinity");
  }
  const values = [value];
  if (min !== void 0) {
    values.push(min);
  }
  return new _Operator("decrement", values).toString();
};
_Operator.multiply = (factor, max) => {
  if (isNaN(factor) || !isFinite(factor)) {
    throw new Error("Factor cannot be NaN or Infinity");
  }
  if (max !== void 0 && (isNaN(max) || !isFinite(max))) {
    throw new Error("Max cannot be NaN or Infinity");
  }
  const values = [factor];
  if (max !== void 0) {
    values.push(max);
  }
  return new _Operator("multiply", values).toString();
};
_Operator.divide = (divisor, min) => {
  if (isNaN(divisor) || !isFinite(divisor)) {
    throw new Error("Divisor cannot be NaN or Infinity");
  }
  if (min !== void 0 && (isNaN(min) || !isFinite(min))) {
    throw new Error("Min cannot be NaN or Infinity");
  }
  if (divisor === 0) {
    throw new Error("Divisor cannot be zero");
  }
  const values = [divisor];
  if (min !== void 0) {
    values.push(min);
  }
  return new _Operator("divide", values).toString();
};
_Operator.modulo = (divisor) => {
  if (isNaN(divisor) || !isFinite(divisor)) {
    throw new Error("Divisor cannot be NaN or Infinity");
  }
  if (divisor === 0) {
    throw new Error("Divisor cannot be zero");
  }
  return new _Operator("modulo", [divisor]).toString();
};
_Operator.power = (exponent, max) => {
  if (isNaN(exponent) || !isFinite(exponent)) {
    throw new Error("Exponent cannot be NaN or Infinity");
  }
  if (max !== void 0 && (isNaN(max) || !isFinite(max))) {
    throw new Error("Max cannot be NaN or Infinity");
  }
  const values = [exponent];
  if (max !== void 0) {
    values.push(max);
  }
  return new _Operator("power", values).toString();
};
_Operator.arrayAppend = (values) => new _Operator("arrayAppend", values).toString();
_Operator.arrayPrepend = (values) => new _Operator("arrayPrepend", values).toString();
_Operator.arrayInsert = (index, value) => new _Operator("arrayInsert", [index, value]).toString();
_Operator.arrayRemove = (value) => new _Operator("arrayRemove", [value]).toString();
_Operator.arrayUnique = () => new _Operator("arrayUnique", []).toString();
_Operator.arrayIntersect = (values) => new _Operator("arrayIntersect", values).toString();
_Operator.arrayDiff = (values) => new _Operator("arrayDiff", values).toString();
_Operator.arrayFilter = (condition, value) => {
  const values = [condition, value === void 0 ? null : value];
  return new _Operator("arrayFilter", values).toString();
};
_Operator.stringConcat = (value) => new _Operator("stringConcat", [value]).toString();
_Operator.stringReplace = (search, replace) => new _Operator("stringReplace", [search, replace]).toString();
_Operator.toggle = () => new _Operator("toggle", []).toString();
_Operator.dateAddDays = (days) => new _Operator("dateAddDays", [days]).toString();
_Operator.dateSubDays = (days) => new _Operator("dateSubDays", [days]).toString();
_Operator.dateSetNow = () => new _Operator("dateSetNow", []).toString();

// ../../node_modules/node-appwrite/dist/enums/authenticator-type.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/authentication-factor.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/o-auth-provider.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/browser.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/credit-card.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/flag.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/theme.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/timezone.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/browser-permission.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/image-format.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/backup-services.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/relationship-type.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/relation-mutate.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/index-type.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/order-by.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/runtime.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/scopes.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/template-reference-type.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/vcs-reference-type.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/deployment-download-type.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/execution-method.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/name.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/message-priority.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/smtp-encryption.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/framework.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/build-runtime.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/adapter.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/compression.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/image-gravity.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/password-hash.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/messaging-provider-type.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/database-type.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/attribute-status.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/column-status.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/index-status.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/deployment-status.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/execution-trigger.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/execution-status.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/health-antivirus-status.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/health-check-status.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

// ../../node_modules/node-appwrite/dist/enums/message-status.mjs
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();

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
    } catch (e4) {
      console.error(e4);
      return new Response(`Error: ${e4.message}`, { status: 500 });
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
    const appwriteClient = new Client().setEndpoint("https://cloud.appwrite.io/v1").setProject("cognitive-resonance").setKey(env.APPWRITE_API_KEY || "");
    const storage = new Storage(appwriteClient);
    const fileName = `pack-${sessionId}-${Date.now()}.pack`;
    const fileBlob = new Blob([packfileBuffer], { type: "application/x-git-receive-pack" });
    const fileObj = new File([fileBlob], fileName, { type: "application/x-git-receive-pack" });
    await storage.createFile(
      "cr-git-packs",
      "unique()",
      fileObj
    );
    console.log(`Successfully persisted packfile to Appwrite for ${sessionId}`);
  } catch (err) {
    console.warn(`Failed to push to Appwrite! Check API Key or Bucket ID: ${err.message}`);
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
    } catch (e4) {
      console.error("Failed to drain the unused request body.", e4);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
init_checked_fetch();
init_strip_cf_connecting_ip_header();
init_modules_watch_stub();
function reduceError(e4) {
  return {
    name: e4?.name,
    message: e4?.message ?? String(e4),
    stack: e4?.stack,
    cause: e4?.cause === void 0 ? void 0 : reduceError(e4.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e4) {
    const error = reduceError(e4);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-MvYI3m/middleware-insertion-facade.js
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

// .wrangler/tmp/bundle-MvYI3m/middleware-loader.entry.ts
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
