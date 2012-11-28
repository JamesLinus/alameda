/**
 * dynamite 0.0.1 Copyright (c) 2011-2012, The Dojo Foundation All Rights Reserved.
 * Available via the MIT or new BSD license.
 * see: http://github.com/requirejs/dynamite for details
 */
//Going sloppy to avoid 'use strict' string cost, but strict practices should
//be followed.
/*jslint sloppy: true, nomen: true, regexp: true */
/*global setTimeout, process, document, navigator */

var requirejs, require, define;
(function (undef) {

    var prim, main, req, makeMap, handlers, waitingDefine, loadTimeId,
        dataMain, src, mainScript, subPath,
        defined = {},
        waiting = {},
        config = {},
        requireDeferreds = [],
        deferreds = {},
        defining = {},
        hasOwn = Object.prototype.hasOwnProperty,
        aps = [].slice,
        loadCount = 0,
        startTime = 0,
        urlRegExp = /(^\/)|\:|\?(\.js$)/,
        commentRegExp = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg,
        cjsRequireRegExp = /[^.]\s*require\s*\(\s*["']([^'"\s]+)["']\s*\)/g,
        jsSuffixRegExp = /\.js$/;

    function hasProp(obj, prop) {
        return hasOwn.call(obj, prop);
    }

    function getOwn(obj, prop) {
        return obj && hasProp(obj, prop) && obj[prop];
    }

    /**
     * Cycles over properties in an object and calls a function for each
     * property value. If the function returns a truthy value, then the
     * iteration is stopped.
     */
    function eachProp(obj, func) {
        var prop;
        for (prop in obj) {
            if (hasProp(obj, prop)) {
                if (func(obj[prop], prop)) {
                    break;
                }
            }
        }
    }

    /**
     * Mixes in properties from source into target,
     * but only if target does not already have a property of the same name.
     */
    function mixin(target, source, force, deepStringMixin) {
        if (source) {
            eachProp(source, function (value, prop) {
                if (force || !hasProp(target, prop)) {
                    if (deepStringMixin && typeof value !== 'string') {
                        if (!target[prop]) {
                            target[prop] = {};
                        }
                        mixin(target[prop], value, force, deepStringMixin);
                    } else {
                        target[prop] = value;
                    }
                }
            });
        }
        return target;
    }

    //START prim
    /**
     * Changes from baseline prim
     * - no hasProp or hasOwn (already defined in this file)
     * - no hideResolutionConflict, want early errors, trusted code.
     * - each() changed to Array.forEach
     * - removed UMD registration
     * - added deferred.finished()/rejected()
     */

    /**
     * prim 0.0.0 Copyright (c) 2012, The Dojo Foundation All Rights Reserved.
     * Available via the MIT or new BSD license.
     * see: http://github.com/requirejs/prim for details
     */
    (function () {
        function check(p) {
            if (hasProp(p, 'e') || hasProp(p, 'v')) {
                throw new Error('nope');
            }
            return true;
        }

        function notify(ary, value) {
            prim.nextTick(function () {
                ary.forEach(function (item) {
                    item(value);
                });
            });
        }

        prim = function prim() {
            var p,
                ok = [],
                fail = [];

            return (p = {
                callback: function (yes, no) {
                    if (no) {
                        p.errback(no);
                    }

                    if (hasProp(p, 'v')) {
                        prim.nextTick(function () {
                            yes(p.v);
                        });
                    } else {
                        ok.push(yes);
                    }
                },

                errback: function (no) {
                    if (hasProp(p, 'e')) {
                        prim.nextTick(function () {
                            no(p.e);
                        });
                    } else {
                        fail.push(no);
                    }
                },

                finished: function () {
                    return hasProp(p, 'e') || hasProp(p, 'v');
                },

                rejected: function () {
                    return hasProp(p, 'e');
                },

                resolve: function (v) {
                    if (check(p)) {
                        p.v = v;
                        notify(ok, v);
                    }
                    return p;
                },
                reject: function (e) {
                    if (check(p)) {
                        p.e = e;
                        notify(fail, e);
                    }
                    return p;
                },

                start: function (fn) {
                    p.resolve();
                    return p.promise.then(fn);
                },

                promise: {
                    then: function (yes, no) {
                        var next = prim();

                        p.callback(function (v) {
                            try {
                                v = yes ? yes(v) : v;

                                if (v && v.then) {
                                    v.then(next.resolve, next.reject);
                                } else {
                                    next.resolve(v);
                                }
                            } catch (e) {
                                next.reject(e);
                            }
                        }, function (e) {
                            var err;

                            try {
                                if (!no) {
                                    next.reject(e);
                                } else {
                                    err = no(e);

                                    if (err instanceof Error) {
                                        next.reject(err);
                                    } else {
                                        if (err && err.then) {
                                            err.then(next.resolve, next.reject);
                                        } else {
                                            next.resolve(err);
                                        }
                                    }
                                }
                            } catch (e2) {
                                next.reject(e2);
                            }
                        });

                        return next.promise;
                    },

                    fail: function (no) {
                        return p.promise.then(null, no);
                    },

                    end: function () {
                        p.errback(function (e) {
                            throw e;
                        });
                    }
                }
            });
        };

        prim.serial = function (ary) {
            var result = prim().resolve().promise;
            ary.forEach(function (item) {
                result = result.then(function () {
                    return item();
                });
            });
            return result;
        };

        prim.nextTick = typeof process !== 'undefined' && process.nextTick ?
                process.nextTick : (typeof setTimeout !== 'undefined' ?
                    function (fn) {
                    setTimeout(fn, 0);
                } : function (fn) {
            fn();
        });
    }());
    //END prim

    /**
     * Given a relative module name, like ./something, normalize it to
     * a real name that can be mapped to a path.
     * @param {String} name the relative name
     * @param {String} baseName a real name that the name arg is relative
     * to.
     * @returns {String} normalized name
     */
    function normalize(name, baseName, skipMap) {
        var nameParts, nameSegment, mapValue, foundMap,
            foundI, foundStarMap, starI, i, j, part,
            baseParts = baseName && baseName.split("/"),
            map = config.map,
            starMap = (!skipMap && map && map['*']) || {};

        //Adjust any relative paths.
        if (name && name.charAt(0) === ".") {
            //If have a base name, try to normalize against it,
            //otherwise, assume it is a top-level require that will
            //be relative to baseUrl in the end.
            if (baseName) {
                //Convert baseName to array, and lop off the last part,
                //so that . matches that "directory" and not name of the baseName's
                //module. For instance, baseName of "one/two/three", maps to
                //"one/two/three.js", but we want the directory, "one/two" for
                //this normalization.
                baseParts = baseParts.slice(0, baseParts.length - 1);

                name = baseParts.concat(name.split("/"));

                //start trimDots
                for (i = 0; i < name.length; i += 1) {
                    part = name[i];
                    if (part === ".") {
                        name.splice(i, 1);
                        i -= 1;
                    } else if (part === "..") {
                        if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                            //End of the line. Keep at least one non-dot
                            //path segment at the front so it can be mapped
                            //correctly to disk. Otherwise, there is likely
                            //no path mapping for a path starting with '..'.
                            //This can still fail, but catches the most reasonable
                            //uses of ..
                            break;
                        } else if (i > 0) {
                            name.splice(i - 1, 2);
                            i -= 2;
                        }
                    }
                }
                //end trimDots

                name = name.join("/");
            }
        }

        //Apply map config if available.
        if ((baseParts || starMap) && map) {
            nameParts = name.split('/');

            for (i = nameParts.length; i > 0; i -= 1) {
                nameSegment = nameParts.slice(0, i).join("/");

                if (baseParts) {
                    //Find the longest baseName segment match in the config.
                    //So, do joins on the biggest to smallest lengths of baseParts.
                    for (j = baseParts.length; j > 0; j -= 1) {
                        mapValue = map[baseParts.slice(0, j).join('/')];

                        //baseName segment has  config, find if it has one for
                        //this name.
                        if (mapValue) {
                            mapValue = mapValue[nameSegment];
                            if (mapValue) {
                                //Match, update name to the new value.
                                foundMap = mapValue;
                                foundI = i;
                                break;
                            }
                        }
                    }
                }

                if (foundMap) {
                    break;
                }

                //Check for a star map match, but just hold on to it,
                //if there is a shorter segment match later in a matching
                //config, then favor over this star map.
                if (!foundStarMap && starMap && starMap[nameSegment]) {
                    foundStarMap = starMap[nameSegment];
                    starI = i;
                }
            }

            if (!foundMap && foundStarMap) {
                foundMap = foundStarMap;
                foundI = starI;
            }

            if (foundMap) {
                nameParts.splice(0, foundI, foundMap);
                name = nameParts.join('/');
            }
        }

        return name;
    }

    function makeRequire(relName) {
        function req(deps, callback, errback, alt) {
            if (typeof deps === "string") {
                if (handlers[deps]) {
                    //callback in this case is really relName
                    return handlers[deps](callback);
                }
                //Just return the module wanted. In this scenario, the
                //deps arg is the module name, and second arg (if passed)
                //is just the relName.
                //Normalize module name, if it contains . or ..
                var name = makeMap(deps, callback).f;
                if (!hasProp(defined, name)) {
                    throw new Error('Not loaded: ' + name);
                }
                return defined[name];
            } else if (!deps.splice) {
                //deps is a config object, not an array.
                req.config(deps);

                if (callback.splice) {
                    //callback is an array, which means it is a dependency list.
                    //Adjust args if there are dependencies
                    deps = callback;
                    callback = errback;
                    errback = alt;
                } else {
                    deps = undef;
                }
            }

            //Support require(['a'])
            callback = callback || function () {};

            //Simulate async callback;
            prim.nextTick(function () {
                main(undef, deps, callback, errback, relName);
            });

            return req;
        }

        req.isBrowser = typeof document !== 'undefined' &&
            typeof navigator !== 'undefined';

        req.nameToUrl = function (moduleName, ext) {
            var paths, pkgs, pkg, pkgPath, syms, i, parentModule, url,
                parentPath;

            //If a colon is in the URL, it indicates a protocol is used and it is just
            //an URL to a file, or if it starts with a slash, contains a query arg (i.e. ?)
            //or ends with .js, then assume the user meant to use an url and not a module id.
            //The slash is important for protocol-less URLs as well as full paths.
            if (urlRegExp.test(moduleName)) {
                //Just a plain path, not module name lookup, so just return it.
                //Add extension if it is included. This is a bit wonky, only non-.js things pass
                //an extension, this method probably needs to be reworked.
                url = moduleName + (ext || '');
            } else {
                //A module that needs to be converted to a path.
                paths = config.paths;
                pkgs = config.pkgs;

                syms = moduleName.split('/');
                //For each module name segment, see if there is a path
                //registered for it. Start with most specific name
                //and work up from it.
                for (i = syms.length; i > 0; i -= 1) {
                    parentModule = syms.slice(0, i).join('/');
                    pkg = getOwn(pkgs, parentModule);
                    parentPath = getOwn(paths, parentModule);
                    if (parentPath) {
                        //If an array, it means there are a few choices,
                        //Choose the one that is desired
                        if (Array.isArray(parentPath)) {
                            parentPath = parentPath[0];
                        }
                        syms.splice(0, i, parentPath);
                        break;
                    } else if (pkg) {
                        //If module name is just the package name, then looking
                        //for the main module.
                        if (moduleName === pkg.name) {
                            pkgPath = pkg.location + '/' + pkg.main;
                        } else {
                            pkgPath = pkg.location;
                        }
                        syms.splice(0, i, pkgPath);
                        break;
                    }
                }

                //Join the path parts together, then figure out if baseUrl is needed.
                url = syms.join('/');
                url += (ext || (/\?/.test(url) ? '' : '.js'));
                url = (url.charAt(0) === '/' || url.match(/^[\w\+\.\-]+:/) ? '' : config.baseUrl) + url;
            }

            return config.urlArgs ? url +
                                    ((url.indexOf('?') === -1 ? '?' : '&') +
                                     config.urlArgs) : url;
        };

        /**
         * Converts a module name + .extension into an URL path.
         * *Requires* the use of a module name. It does not support using
         * plain URLs like nameToUrl.
         */
        req.toUrl = function (moduleNamePlusExt) {
            var index = moduleNamePlusExt.lastIndexOf('.'),
                ext = null;

            if (index !== -1) {
                ext = moduleNamePlusExt.substring(index, moduleNamePlusExt.length);
                moduleNamePlusExt = moduleNamePlusExt.substring(0, index);
            }

            return req.nameToUrl(normalize(moduleNamePlusExt, relName, true), ext);
        };

        return req;
    }

    function resolve(name, d, value) {
        if (name) {
            defined[name] = value;
        }
        d.resolve(value);
    }

    function makeNormalize(relName) {
        return function (name) {
            return normalize(name, relName);
        };
    }

    function defineModule(d) {
        var name = d.map && d.map.f,
            ret = d.factory.apply(defined[name], d.values);

        if (name) {
            //If setting exports via "module" is in play,
            //favor that over return value and exports.
            //After that, favor a non-undefined return
            //value over exports use.
            if (d.cjsModule && d.cjsModule.exports !== undef &&
                    d.cjsModule.exports !== defined[name]) {
                resolve(name, d, d.cjsModule.exports);
            } else if (ret !== undef || !d.usingExports) {
                //Use the return value from the function.
                resolve(name, d, ret);
            } else {
                resolve(name, d, defined[name]);
            }
        } else {
            d.resolve();
        }
    }

    //This method is attached to every module deferred,
    //so the "this" in here is the module deferred object.
    function depFinished(val, i) {
        if (!this.rejected() && !this.depDefined[i]) {
            this.depDefined[i] = true;
            this.depCount += 1;
            this.values[i] = val;
            if (this.depCount === this.depMax) {
                defineModule(this);
            }
        }
    }

    function makeDefer(name) {
        var d = prim();
        if (name) {
            d.map = makeMap(name);
        }
        d.depCount = 0;
        d.depMax = 0;
        d.values = [];
        d.depDefined = [];
        d.depFinished = depFinished;
        return d;
    }

    function getDefer(name) {
        var d;
        if (name) {
            d = hasProp(deferreds, name) && deferreds[name];
            if (!d) {
                d = deferreds[name] = makeDefer(name);
            }
        } else {
            d = makeDefer();
            requireDeferreds.push(d);
        }
        return d;
    }

    function makeLoad(depName) {
        return function (value) {
            resolve(depName, getDefer(depName), value);
        };
    }

    function load(map) {
        var name = map.f,
            url = map.url,
            script = document.createElement('script');
        script.setAttribute('data-id', name);
        script.type = config.scriptType || 'text/javascript';
        script.charset = 'utf-8';
        script.async = true;

        loadCount += 1;

        script.addEventListener('load', function (evt) {
            loadCount -= 1;
            if (waitingDefine) {
                waitingDefine.unshift(name);
                define.apply(null, waitingDefine);
            } else {
                define(name);
            }
        }, false);
        script.addEventListener('error', function (evt) {
            var err = new Error('Load failed: ' + name);
            err.requireModules = [name];
            //INVESTIGATE: can error fire as well as load?
            //Maybe load happens, but a syntax error?
            //If so loadCount will be a mess.
            loadCount -= 1;
            getDefer(name).reject(err);
        }, false);

        script.src = url;

        document.head.appendChild(script);
    }

    function callDep(map, relName) {
        var args,
            name = map.f;

        if (hasProp(waiting, name)) {
            args = waiting[name];
            delete waiting[name];
            defining[name] = true;
            main.apply(undef, args);
        } else if (!hasProp(deferreds, name)) {
            if (map.pr) {
                return callDep(makeMap(map.pr, null, true)).then(function (plugin) {
                    //Redo map now that plugin is known to be loaded
                    var newMap = makeMap(name, relName);
                    plugin.load(newMap.n, makeRequire(relName), makeLoad(newMap.f), {});
                    return getDefer(newMap.f).promise;
                });
            } else {
                load(map);
            }
        }

        return getDefer(name).promise;
    }

    //Turns a plugin!resource to [plugin, resource]
    //with the plugin being undefined if the name
    //did not have a plugin prefix.
    function splitPrefix(name) {
        var prefix,
            index = name ? name.indexOf('!') : -1;
        if (index > -1) {
            prefix = name.substring(0, index);
            name = name.substring(index + 1, name.length);
        }
        return [prefix, name];
    }

    /**
     * Makes a name map, normalizing the name, and using a plugin
     * for normalization if necessary. Grabs a ref to plugin
     * too, as an optimization.
     */
    makeMap = function (name, relName, skipMap) {
        var plugin, url,
            parts = splitPrefix(name),
            prefix = parts[0];

        name = parts[1];

        if (prefix) {
            prefix = normalize(prefix, relName, skipMap);
            plugin = hasProp(defined, prefix) && defined[prefix];
        }

        //Normalize according
        if (prefix) {
            if (plugin && plugin.normalize) {
                name = plugin.normalize(name, makeNormalize(relName));
            } else {
                name = normalize(name, relName, skipMap);
            }
        } else {
            name = normalize(name, relName, skipMap);
            parts = splitPrefix(name);
            prefix = parts[0];
            name = parts[1];

            url = req.nameToUrl(name);
        }

        //Using ridiculous property names for space reasons
        return {
            f: prefix ? prefix + '!' + name : name, //fullName
            n: name,
            pr: prefix,
            url: url
        };
    };

    function makeConfig(name) {
        return function () {
            return (config && config.config && config.config[name]) || {};
        };
    }

    handlers = {
        require: function (name) {
            return makeRequire(name);
        },
        exports: function (name) {
            var e = defined[name];
            if (typeof e !== 'undefined') {
                return e;
            } else {
                return (defined[name] = {});
            }
        },
        module: function (name) {
            return {
                id: name,
                uri: '',
                exports: defined[name],
                config: makeConfig(name)
            };
        }
    };

    function breakCycle(d, traced, processed) {
        var id = d.map && d.map.f;

        traced[id] = true;
        if (!d.finished() && d.deps) {
            d.deps.forEach(function (depMap, i) {
                var depIndex,
                    depId = depMap.f,
                    dep = !hasProp(handlers, depId) && getDefer(depId);

                //Only force things that have not completed
                //being defined, so still in the registry,
                //and only if it has not been matched up
                //in the module already.
                if (dep && !dep.finished() && !processed[depId]) {
                    if (hasProp(traced, depId)) {
                        d.deps.some(function (depMap, i) {
                            if (depMap.f === depId) {
                                depIndex = i;
                                return true;
                            }
                        });
                        d.depFinished(defined[depId], depIndex);
                    } else {
                        breakCycle(dep, traced, processed);
                    }
                }
            });
        }
        processed[id] = true;
    }

    function check() {
        loadTimeId = 0;

        var err,
            reqDefs = [],
            noLoads = [],
            waitInterval = (config.waitSeconds || 7) * 1000,
            //It is possible to disable the wait interval by using waitSeconds of 0.
            expired = waitInterval && (startTime + waitInterval) < new Date().getTime();

        if (loadCount === 0) {
            reqDefs = requireDeferreds.filter(function (d) {
                //Only want deferreds that have not finished.
                return !d.finished();
            });

            if (reqDefs.length) {
                //Something is not resolved. Dive into it.
                eachProp(deferreds, function (d, id) {
                    if (!d.finished()) {
                        noLoads.push(d);
                    }
                });

                if (noLoads.length) {
                    reqDefs.forEach(function (d) {
                        breakCycle(d, {}, {});
                    });
                }

                return;
            }
        }

        //If still waiting on loads, and the waiting load is something
        //other than a plugin resource, or there are still outstanding
        //scripts, then just try back later.
        if (expired && noLoads.length) {
            //If wait time expired, throw error of unloaded modules.
            noLoads = noLoads.filter(function (d) {
                return d.map.f;
            });
            err = new Error('timeout', 'Load timeout for modules: ' + noLoads);
            err.requireModules = noLoads;
            throw err;
        } else if (reqDefs.length) {
            //Something is still waiting to load. Wait for it, but only
            //if a timeout is not already in effect.
            if (!loadTimeId) {
                loadTimeId = prim.nextTick(check);
            }
        }
    }

    main = function (name, deps, factory, errback, relName) {
        var depName, map,
            d = getDefer(name);

        d.promise.fail(errback || req.onError);

        //Use name if no relName
        relName = relName || name;

        //Call the factory to define the module, if necessary.
        if (typeof factory === 'function') {

            if (!deps.length && factory.length) {
                //Remove comments from the callback string,
                //look for require calls, and pull them into the dependencies,
                //but only if there are function args.
                factory
                    .toString()
                    .replace(commentRegExp, '')
                    .replace(cjsRequireRegExp, function (match, dep) {
                        deps.push(dep);
                    });

                //May be a CommonJS thing even without require calls, but still
                //could use exports, and module. Avoid doing exports and module
                //work though if it just needs require.
                //REQUIRES the function to expect the CommonJS variables in the
                //order listed below.
                deps = (factory.length === 1 ?
                        ['require'] :
                        ['require', 'exports', 'module']).concat(deps);
            }

            //Save info for use later.
            d.factory = factory;
            d.deps = deps;

            deps.forEach(function (depName, i) {
                var depMap;
                deps[i] = depMap = makeMap(depName, relName);
                depName = depMap.f;

                //Fast path CommonJS standard dependencies.
                if (depName === "require") {
                    d.values[i] = handlers.require(name);
                } else if (depName === "exports") {
                    //CommonJS module spec 1.1
                    d.values[i] = handlers.exports(name);
                    d.usingExports = true;
                } else if (depName === "module") {
                    //CommonJS module spec 1.1
                    d.values[i] = d.cjsModule = handlers.module(name);
                } else {
                    d.depMax += 1;

                    callDep(depMap, relName).then(function (val) {
                        d.depFinished(val, i);
                    }, function (err) {
                        if (!d.rejected()) {
                            d.reject(err);
                        }
                    });
                }
            });

            //Some modules just depend on the require, exports, modules, so
            //trigger their definition here if so.
            if (d.depCount === d.depMax) {
                defineModule(d);
            }
        } else if (name) {
            //May just be an object definition for the module. Only
            //worry about defining if have a module name.
            resolve(name, d, factory);
        }

        if (!name) {
            check();
        }
    };

    requirejs = require = req = makeRequire();

    /**
     * Just drops the config on the floor, but returns req in case
     * the config return value is used.
     */
    req.config = function (cfg) {
        //Make sure the baseUrl ends in a slash.
        if (cfg.baseUrl) {
            if (cfg.baseUrl.charAt(cfg.baseUrl.length - 1) !== '/') {
                cfg.baseUrl += '/';
            }
        }

        mixin(config, cfg);

        if (!config.baseUrl) {
            config.baseUrl = './';
        }

        return req;
    };

    req.onError = function (err) {
        throw err;
    };

    req._d = {
        defined: defined,
        waiting: waiting,
        config: config,
        deferreds: deferreds,
        defining: defining
    };

    define = function (name, deps, callback) {
        if (typeof name !== 'string') {
            waitingDefine = [].slice.call(arguments, 0);
            return;
        }

        //This module may not have dependencies
        if (deps && !deps.splice) {
            //deps is not an array, so probably means
            //an object literal or factory function for
            //the value. Adjust args.
            callback = deps;
            deps = [];
        }

        if (!hasProp(defined, name)) {
            if (hasProp(deferreds, name)) {
                main(name, deps, callback);
            } else {
                waiting[name] = [name, deps, callback];
            }
        }
    };

    define.amd = {
        jQuery: true
    };

    //data-main support.
    dataMain = document.querySelectorAll('script[data-main]')[0];
    dataMain = dataMain && dataMain.getAttribute('data-main');
    if (dataMain) {
        //Set final baseUrl if there is not already an explicit one.
        if (!config.baseUrl) {
            //Pull off the directory of data-main for use as the
            //baseUrl.
            src = dataMain.split('/');
            mainScript = src.pop();
            subPath = src.length ? src.join('/')  + '/' : './';

            config.baseUrl = subPath;
            dataMain = mainScript;
        }

        //Strip off any trailing .js since dataMain is now
        //like a module name.
        dataMain = dataMain.replace(jsSuffixRegExp, '');
        require([dataMain]);
    }
}());
