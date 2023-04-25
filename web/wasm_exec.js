// Copyright 2018 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

"use strict";

if (!globalThis.crypto) {
	throw new Error("globalThis.crypto is not available, polyfill required (crypto.getRandomValues only)");
}

if (!globalThis.performance) {
	throw new Error("globalThis.performance is not available, polyfill required (performance.now only)");
}

if (!globalThis.TextEncoder) {
	throw new Error("globalThis.TextEncoder is not available, polyfill required");
}

if (!globalThis.TextDecoder) {
	throw new Error("globalThis.TextDecoder is not available, polyfill required");
}

const encoder = new TextEncoder("utf-8");
const decoder = new TextDecoder("utf-8");


const enosys = () => {
	const err = new Error("not implemented");
	err.code = "ENOSYS";
	return err;
};
const enoent = () => {
	const err = new Error("not found");
	err.code = "ENOENT";
	return err;
}

const EBADF = () => {
	const err = new Error("bad fd");
	err.code = "EBADF";
	return err;
}


function dirname(path) {
	return path.split("/").slice(0,-1).join("/");
}
function basename(path) {
	return path.split("/").at(-1);
}

function debugLog(str) {
	postMessage({
		log: str,
	});
}

class JSFS {
	constants = { O_WRONLY: 1, O_RDWR: 2, O_CREAT: 4, O_TRUNC: 8, O_APPEND: 16, O_EXCL: 32 } // unused

	/** @type {{[k: number]: {pos: number, path: string, type: string}}} */
	fds
	gfd = 4;

	constructor(root) {
		this.fds = {};
		this.dirhandles[""] = root;
	}

	outputBuf = "";
	decoder = new TextDecoder("utf-8");

	/** @type {{[k: string]: FileSystemFileHandle}} */
	filehandles = {}
	/** @type {{[k: string]: FileSystemSyncAccessHandle}} */
	accesshandles = {}
	/** @type {{[k: string]: FileSystemDirectoryHandle}} */
	dirhandles = {}


	/** @returns {Promise<FileSystemFileHandle>} */
	async getFileHandle(path, create = false) {
		if(this.filehandles[path]) {
			return this.filehandles[path];
		}
		
		const dir = await this.getDirectoryHandle(dirname(path));
		const fileHandle = await dir.getFileHandle(basename(path), {create});
		if(fileHandle) {
			this.filehandles[path] = fileHandle;
			return fileHandle;
		}
	}

	/** @returns {FileSystemSyncAccessHandle} */
	async getAccessHandle(path, create = false) {
		if(this.accesshandles[path]) return this.accesshandles[path];
		const fileHandle = await this.getFileHandle(path, create);
		const accessHandle = await fileHandle.createSyncAccessHandle();
		this.accesshandles[path] = accessHandle;
		return accessHandle;
	}

	async getDirectoryHandle(path, create = false) {
		if(this.dirhandles[path]) return this.dirhandles[path];
		const dir = dirname(path);
		let dirhnd = this.dirhandles[dir];
		if(!dirhnd) {
			dirhnd = await this.getDirectoryHandle(dir, create);
		}
		const handle = await dirhnd.getDirectoryHandle(basename(path), {create});
		this.dirhandles[path] = handle;
		return handle;
	}

	writeSync(fd, buf) {
		this.outputBuf += this.decoder.decode(buf);
		const nl = this.outputBuf.lastIndexOf("\n");
		if (nl != -1) {
			debugLog(this.outputBuf.substring(0, nl));
			this.outputBuf = this.outputBuf.substring(nl + 1);
		}
		return buf.length;
	}

	write(fd, buf, offset, length, position, callback) {
		if (offset !== 0 || length !== buf.length || position !== null) {
			callback(enosys());
			return;
		}
		if(fd == 1 || fd == 2) {
			const n = this.writeSync(fd, buf);
			callback(null, n);
			return;
		}

		const file = this.fds[fd];
		if(file.type != "file") {
			callback(null, EBADF());
			return;
		}
		const handle = this.accesshandles[file.path];
		offset += file.pos;
		const n = handle.write(buf, {at: offset});
		file.pos += n;
		callback(null,n);
	}

	chmod(path, mode, callback) { callback(enosys()); }
	chown(path, uid, gid, callback) { callback(enosys()); }
	close(fd, callback) {
		const file = this.fds[fd];
		if(!file) {
			callback(EBADF());
			return;
		}
		if(file.type == "file") {
			this.accesshandles[file.path].close();
			delete this.accesshandles[file.path];
		}
		delete this.fds[fd];
		callback(null);
	}
	fchmod(fd, mode, callback) { callback(enosys()); }
	fchown(fd, uid, gid, callback) { callback(enosys()); }
	fstat(fd, callback) {
		const file = this.fds[fd];
		return this.stat(file.path, callback, file.type);
	}

	filestat(path, callback) {

	}
	dirstat(path, callback) {}

	fsync(fd, callback) {
		const file = this.fds[fd];
		if(!file) {
			callback(EBADF());
			return;
		}
		if(file.type == "file") {
			const handle = this.accesshandles[file.path];
			handle.flush();
		}
		callback(null);
	}
	ftruncate(fd, length, callback) {
		const file = this.fds[fd];
		if(!file) {
			callback(EBADF());
			return;
		}
		if(file.type == "file") {
			const handle = this.accesshandles[file.path];
			handle.truncate(length);
		}
		callback(null);
	}
	lchown(path, uid, gid, callback) { callback(enosys()); }
	link(path, link, callback) { callback(enosys()); }
	lstat(path, callback) { callback(enosys()); }

	mkdir(path, perm, callback) {
		this.getDirectoryHandle(path, true).then(dir => {
			callback(null);
		}).catch(e => {
			callback(enoent());
		})
	}

	open(path, flags, mode, callback) {
		const create = (flags & this.constants.O_CREAT) != 0;
		this.getAccessHandle(path, create).then(() => {
			const fd = this.gfd++;
			this.fds[fd] = {path, pos: 0, type: "file"};
			callback(null, fd);
		}).catch(e => {
			this.getDirectoryHandle(path, create).then(() => {
				const fd = this.gfd++;
				this.fds[fd] = {path, pos: 0, type: "dir"};
				callback(null, fd);
				return;
			}).catch(e => {
				console.error(e);
				callback(enoent());
			});
		});
	}

	read(fd, buffer, offset, length, position, callback) {
		const file = this.fds[fd];
		if(file.type != "file") {
			callback(EBADF());
			return;
		}
		const handle = this.accesshandles[file.path];
		offset += file.pos;
		const n = handle.read(buffer, {at: offset});
		file.pos += n;
		callback(null, n);
	}

	seek(fd, pos, whence, callback) {
		const file = this.fds[fd];
		if(whence == 0) {
			file.pos = pos;
		} else if(whence == 1) {
			file.pos += pos
		} else if(whence == 2) {
			const handle = this.accesshandles[file.path]
			file.pos = handle.getSize()-pos;
		}
		callback(null)
	}

	readdir(path, callback) {
		this.getDirectoryHandle(path).then(async (handle) => {
			const it = handle.keys();
			let next;
			const entries = [];
			while((next = await it.next()) && !next.done) {
				entries.push(next.value);
			}
			callback(null, entries);
		}).catch(e => {
			console.error(e);
			callback(enoent());
		});
	}
	readlink(path, callback) { callback(enosys()); }
	rename(from, to, callback) {
		this.getFileHandle(from).then(handle => {
			delete this.filehandles[from];
			this.filehandles[to] = handle;

			const access = this.accesshandles[from];
			if(access) {
				delete this.accesshandles[from];
				this.accesshandles[to] = access;
			}
			handle.move(to);
			callback(null);
		}).catch(e => {
			console.error(e);
			callback(EBADF());
		})
	}
	rmdir(path, callback) { callback(enosys()); }

	stat(path, callback, t = null) {
		const stat =  {
			dev: 0,
			ino: 0,
			mode: 0,
			nlink: 0,
			uid: 0,
			gid: 0,
			rdev: 0,
			size: 0,
			blksize: 0,
			blocks: 0,
			atimeMs: 0,
			mtimeMs: 0,
			ctimeMs: 0,
			
			isDirectory: () => {
				return (stat.mode & 16384) != 0;
			}
		};

		const doDir = async () => {
			const hnd = await this.getDirectoryHandle(path);
			if(!hnd) return false;
			stat.mode = 16384;
			stat.isdir = true;
			callback(null, stat);
			return true;
		}

		const doFile = async () => {
			const handle = await this.getAccessHandle(path);
			if(!handle) return false;
			stat.size = handle.getSize();
			callback(null, stat);
			return true;
		}

		if(t == "file") {
			doFile().catch(e => {
				console.error(e);
				callback(enoent());
			});
			return;
		} else if(t == "dir") {
			doDir().catch(e => {
				console.error(e);
				callback(enoent());
			});
			return;
		} else {
			doFile().catch(e => {
				doDir().catch(e => {
					console.error(e);
					callback(enoent());
				})
			});
		}
	}

	symlink(path, link, callback) { callback(enosys()); }
	truncate(path, length, callback) {
		this.getAccessHandle(path, false).then(handle => {
			handle.truncate(length);
			callback(null);
		}).catch(e => {
			console.error(e);
			callback(EBADF());
		});
	}
	unlink(path, callback) {
		const ahandle = this.accesshandles[path];
		if(ahandle) {
			ahandle.close();
			delete this.accesshandles[path];
		}
		const fhandle = this.filehandles[path];
		if(fhandle) {
			delete this.filehandles[path];
		}
		const dhandle = this.dirhandles[path];
		if(dhandle) {
			dhandle.remove();
			delete this.dirhandles[path];
		}

		this.getDirectoryHandle(dirname(path)).then(dir => {
			//dir.removeEntry(basename(path)).then(() => {
			//	callback(null);
			//});
			callback(null)
		}).catch(e => {
			console.error(e);
			callback(enosys());
		});
	}
	utimes(path, atime, mtime, callback) { callback(enosys()); }
}

class Process {
	getuid() { return -1; }
	getgid() { return -1; }
	geteuid() { return -1; }
	getegid() { return -1; }
	getgroups() { throw enosys(); }
	pid = -1
	ppid = -1
	umask() { throw enosys(); }
	cwd() { return "." }
	chdir() { throw enosys(); }
}

class Queue {
	constructor() {
		this.items = {}
		this.frontIndex = 0
		this.backIndex = 0
	}
	enqueue(item) {
		this.items[this.backIndex] = item
		this.backIndex++
		if(this.resolve) this.resolve();
	}
	async dequeue() {
		const item = this.items[this.frontIndex]
		if(!item) {
			const q = this;
			await new Promise((resolve) => {q.resolve = resolve});
			return this.dequeue();
		}
		delete this.items[this.frontIndex]
		this.frontIndex++
		return item
	}
}

const opListen = 0
const opReadFrom = 1
const opWriteTo = 2
const opErr = 3

class JSNet {
	constructor() {
		this.newWS()
		this.cbs = {};
		this.readQueue = new Queue();
	}

	newWS() {
		const q = this;
		this.ws = new WebSocket(`ws://127.0.0.1:7812/`);
		this.ws.addEventListener("message", async (ev) => {
			const data = new Uint8Array(await ev.data.arrayBuffer());
			const op = data[0];
			if(op == opReadFrom) {
				q.readQueue.enqueue(data);
				return;
			}
			const seq = data[1];
			this.cbs[seq](data);
			delete this.cbs[seq];
		});
		this.ws.addEventListener("error", (ev) => {
			console.error(ev);
		});
	}

	doOp(seq, payload, expectResponse, callback) {
		if(expectResponse) {
			this.cbs[seq] = (data) => {
				callback(null, data);
			}
		}
		try {
			this.ws.send(payload);
			if(!expectResponse) {
				callback(null);
			}
		} catch(e) {
			console.error(e);
			callback(EBADF());
		}
	}

	async ReadFrom(callback) {
		const data = await this.readQueue.dequeue();
		callback(null, data);
	}
}

globalThis.jsListener = new JSNet();

class Go {
	/** @type {JSFS} */
	fs;
	constructor(root) {
		globalThis.fs = new JSFS(root);
		globalThis.process = new Process();

		this.argv = ["js"];
		this.env = {};
		this.exit = (code) => {
			if (code !== 0) {
				console.warn("exit code:", code);
			}
		};
		this._exitPromise = new Promise((resolve) => {
			this._resolveExitPromise = resolve;
		});
		this._pendingEvent = null;
		this._scheduledTimeouts = new Map();
		this._nextCallbackTimeoutID = 1;

		const setInt64 = (addr, v) => {
			this.mem.setUint32(addr + 0, v, true);
			this.mem.setUint32(addr + 4, Math.floor(v / 4294967296), true);
		}

		const getInt64 = (addr) => {
			const low = this.mem.getUint32(addr + 0, true);
			const high = this.mem.getInt32(addr + 4, true);
			return low + high * 4294967296;
		}

		const loadValue = (addr) => {
			const f = this.mem.getFloat64(addr, true);
			if (f === 0) {
				return undefined;
			}
			if (!isNaN(f)) {
				return f;
			}

			const id = this.mem.getUint32(addr, true);
			return this._values[id];
		}

		const storeValue = (addr, v) => {
			const nanHead = 0x7FF80000;

			if (typeof v === "number" && v !== 0) {
				if (isNaN(v)) {
					this.mem.setUint32(addr + 4, nanHead, true);
					this.mem.setUint32(addr, 0, true);
					return;
				}
				this.mem.setFloat64(addr, v, true);
				return;
			}

			if (v === undefined) {
				this.mem.setFloat64(addr, 0, true);
				return;
			}

			let id = this._ids.get(v);
			if (id === undefined) {
				id = this._idPool.pop();
				if (id === undefined) {
					id = this._values.length;
				}
				this._values[id] = v;
				this._goRefCounts[id] = 0;
				this._ids.set(v, id);
			}
			this._goRefCounts[id]++;
			let typeFlag = 0;
			switch (typeof v) {
				case "object":
					if (v !== null) {
						typeFlag = 1;
					}
					break;
				case "string":
					typeFlag = 2;
					break;
				case "symbol":
					typeFlag = 3;
					break;
				case "function":
					typeFlag = 4;
					break;
			}
			this.mem.setUint32(addr + 4, nanHead | typeFlag, true);
			this.mem.setUint32(addr, id, true);
		}

		const loadSlice = (addr) => {
			const array = getInt64(addr + 0);
			const len = getInt64(addr + 8);
			return new Uint8Array(this._inst.exports.mem.buffer, array, len);
		}

		const loadSliceOfValues = (addr) => {
			const array = getInt64(addr + 0);
			const len = getInt64(addr + 8);
			const a = new Array(len);
			for (let i = 0; i < len; i++) {
				a[i] = loadValue(array + i * 8);
			}
			return a;
		}

		const loadString = (addr) => {
			const saddr = getInt64(addr + 0);
			const len = getInt64(addr + 8);
			return decoder.decode(new DataView(this._inst.exports.mem.buffer, saddr, len));
		}

		const timeOrigin = Date.now() - performance.now();
		this.importObject = {
			go: {
				// Go's SP does not change as long as no Go code is running. Some operations (e.g. calls, getters and setters)
				// may synchronously trigger a Go event handler. This makes Go code get executed in the middle of the imported
				// function. A goroutine can switch to a new stack if the current stack is too small (see morestack function).
				// This changes the SP, thus we have to update the SP used by the imported function.

				// func wasmExit(code int32)
				"runtime.wasmExit": (sp) => {
					sp >>>= 0;
					const code = this.mem.getInt32(sp + 8, true);
					this.exited = true;
					delete this._inst;
					delete this._values;
					delete this._goRefCounts;
					delete this._ids;
					delete this._idPool;
					this.exit(code);
				},

				// func wasmWrite(fd uintptr, p unsafe.Pointer, n int32)
				"runtime.wasmWrite": (sp) => {
					sp >>>= 0;
					const fd = getInt64(sp + 8);
					const p = getInt64(sp + 16);
					const n = this.mem.getInt32(sp + 24, true);
					fs.writeSync(fd, new Uint8Array(this._inst.exports.mem.buffer, p, n));
				},

				// func resetMemoryDataView()
				"runtime.resetMemoryDataView": (sp) => {
					sp >>>= 0;
					this.mem = new DataView(this._inst.exports.mem.buffer);
				},

				// func nanotime1() int64
				"runtime.nanotime1": (sp) => {
					sp >>>= 0;
					setInt64(sp + 8, (timeOrigin + performance.now()) * 1000000);
				},

				// func walltime() (sec int64, nsec int32)
				"runtime.walltime": (sp) => {
					sp >>>= 0;
					const msec = (new Date).getTime();
					setInt64(sp + 8, msec / 1000);
					this.mem.setInt32(sp + 16, (msec % 1000) * 1000000, true);
				},

				// func scheduleTimeoutEvent(delay int64) int32
				"runtime.scheduleTimeoutEvent": (sp) => {
					sp >>>= 0;
					const id = this._nextCallbackTimeoutID;
					this._nextCallbackTimeoutID++;
					this._scheduledTimeouts.set(id, setTimeout(
						() => {
							this._resume();
							while (this._scheduledTimeouts.has(id)) {
								// for some reason Go failed to register the timeout event, log and try again
								// (temporary workaround for https://github.com/golang/go/issues/28975)
								console.warn("scheduleTimeoutEvent: missed timeout event");
								this._resume();
							}
						},
						getInt64(sp + 8) + 1, // setTimeout has been seen to fire up to 1 millisecond early
					));
					this.mem.setInt32(sp + 16, id, true);
				},

				// func clearTimeoutEvent(id int32)
				"runtime.clearTimeoutEvent": (sp) => {
					sp >>>= 0;
					const id = this.mem.getInt32(sp + 8, true);
					clearTimeout(this._scheduledTimeouts.get(id));
					this._scheduledTimeouts.delete(id);
				},

				// func getRandomData(r []byte)
				"runtime.getRandomData": (sp) => {
					sp >>>= 0;
					crypto.getRandomValues(loadSlice(sp + 8));
				},

				// func finalizeRef(v ref)
				"syscall/js.finalizeRef": (sp) => {
					sp >>>= 0;
					const id = this.mem.getUint32(sp + 8, true);
					this._goRefCounts[id]--;
					if (this._goRefCounts[id] === 0) {
						const v = this._values[id];
						this._values[id] = null;
						this._ids.delete(v);
						this._idPool.push(id);
					}
				},

				// func stringVal(value string) ref
				"syscall/js.stringVal": (sp) => {
					sp >>>= 0;
					storeValue(sp + 24, loadString(sp + 8));
				},

				// func valueGet(v ref, p string) ref
				"syscall/js.valueGet": (sp) => {
					sp >>>= 0;
					const result = Reflect.get(loadValue(sp + 8), loadString(sp + 16));
					sp = this._inst.exports.getsp() >>> 0; // see comment above
					storeValue(sp + 32, result);
				},

				// func valueSet(v ref, p string, x ref)
				"syscall/js.valueSet": (sp) => {
					sp >>>= 0;
					Reflect.set(loadValue(sp + 8), loadString(sp + 16), loadValue(sp + 32));
				},

				// func valueDelete(v ref, p string)
				"syscall/js.valueDelete": (sp) => {
					sp >>>= 0;
					Reflect.deleteProperty(loadValue(sp + 8), loadString(sp + 16));
				},

				// func valueIndex(v ref, i int) ref
				"syscall/js.valueIndex": (sp) => {
					sp >>>= 0;
					storeValue(sp + 24, Reflect.get(loadValue(sp + 8), getInt64(sp + 16)));
				},

				// valueSetIndex(v ref, i int, x ref)
				"syscall/js.valueSetIndex": (sp) => {
					sp >>>= 0;
					Reflect.set(loadValue(sp + 8), getInt64(sp + 16), loadValue(sp + 24));
				},

				// func valueCall(v ref, m string, args []ref) (ref, bool)
				"syscall/js.valueCall": (sp) => {
					sp >>>= 0;
					try {
						const v = loadValue(sp + 8);
						const m = Reflect.get(v, loadString(sp + 16));
						const args = loadSliceOfValues(sp + 32);
						const result = Reflect.apply(m, v, args);
						sp = this._inst.exports.getsp() >>> 0; // see comment above
						storeValue(sp + 56, result);
						this.mem.setUint8(sp + 64, 1);
					} catch (err) {
						sp = this._inst.exports.getsp() >>> 0; // see comment above
						storeValue(sp + 56, err);
						this.mem.setUint8(sp + 64, 0);
					}
				},

				// func valueInvoke(v ref, args []ref) (ref, bool)
				"syscall/js.valueInvoke": (sp) => {
					sp >>>= 0;
					try {
						const v = loadValue(sp + 8);
						const args = loadSliceOfValues(sp + 16);
						const result = Reflect.apply(v, undefined, args);
						sp = this._inst.exports.getsp() >>> 0; // see comment above
						storeValue(sp + 40, result);
						this.mem.setUint8(sp + 48, 1);
					} catch (err) {
						sp = this._inst.exports.getsp() >>> 0; // see comment above
						storeValue(sp + 40, err);
						this.mem.setUint8(sp + 48, 0);
					}
				},

				// func valueNew(v ref, args []ref) (ref, bool)
				"syscall/js.valueNew": (sp) => {
					sp >>>= 0;
					try {
						const v = loadValue(sp + 8);
						const args = loadSliceOfValues(sp + 16);
						const result = Reflect.construct(v, args);
						sp = this._inst.exports.getsp() >>> 0; // see comment above
						storeValue(sp + 40, result);
						this.mem.setUint8(sp + 48, 1);
					} catch (err) {
						sp = this._inst.exports.getsp() >>> 0; // see comment above
						storeValue(sp + 40, err);
						this.mem.setUint8(sp + 48, 0);
					}
				},

				// func valueLength(v ref) int
				"syscall/js.valueLength": (sp) => {
					sp >>>= 0;
					setInt64(sp + 16, parseInt(loadValue(sp + 8).length));
				},

				// valuePrepareString(v ref) (ref, int)
				"syscall/js.valuePrepareString": (sp) => {
					sp >>>= 0;
					const str = encoder.encode(String(loadValue(sp + 8)));
					storeValue(sp + 16, str);
					setInt64(sp + 24, str.length);
				},

				// valueLoadString(v ref, b []byte)
				"syscall/js.valueLoadString": (sp) => {
					sp >>>= 0;
					const str = loadValue(sp + 8);
					loadSlice(sp + 16).set(str);
				},

				// func valueInstanceOf(v ref, t ref) bool
				"syscall/js.valueInstanceOf": (sp) => {
					sp >>>= 0;
					this.mem.setUint8(sp + 24, (loadValue(sp + 8) instanceof loadValue(sp + 16)) ? 1 : 0);
				},

				// func copyBytesToGo(dst []byte, src ref) (int, bool)
				"syscall/js.copyBytesToGo": (sp) => {
					sp >>>= 0;
					const dst = loadSlice(sp + 8);
					const src = loadValue(sp + 32);
					if (!(src instanceof Uint8Array || src instanceof Uint8ClampedArray)) {
						this.mem.setUint8(sp + 48, 0);
						return;
					}
					const toCopy = src.subarray(0, dst.length);
					dst.set(toCopy);
					setInt64(sp + 40, toCopy.length);
					this.mem.setUint8(sp + 48, 1);
				},

				// func copyBytesToJS(dst ref, src []byte) (int, bool)
				"syscall/js.copyBytesToJS": (sp) => {
					sp >>>= 0;
					const dst = loadValue(sp + 8);
					const src = loadSlice(sp + 16);
					if (!(dst instanceof Uint8Array || dst instanceof Uint8ClampedArray)) {
						this.mem.setUint8(sp + 48, 0);
						return;
					}
					const toCopy = src.subarray(0, dst.length);
					dst.set(toCopy);
					setInt64(sp + 40, toCopy.length);
					this.mem.setUint8(sp + 48, 1);
				},

				"debug": (value) => {
					console.log(value);
				},
			}
		};
	}

	async run(instance) {
		if (!(instance instanceof WebAssembly.Instance)) {
			throw new Error("Go.run: WebAssembly.Instance expected");
		}
		this._inst = instance;
		this.mem = new DataView(this._inst.exports.mem.buffer);
		this._values = [ // JS values that Go currently has references to, indexed by reference id
			NaN,
			0,
			null,
			true,
			false,
			globalThis,
			this,
		];
		this._goRefCounts = new Array(this._values.length).fill(Infinity); // number of references that Go has to a JS value, indexed by reference id
		this._ids = new Map([ // mapping from JS values to reference ids
			[0, 1],
			[null, 2],
			[true, 3],
			[false, 4],
			[globalThis, 5],
			[this, 6],
		]);
		this._idPool = [];   // unused ids that have been garbage collected
		this.exited = false; // whether the Go program has exited

		// Pass command line arguments and environment variables to WebAssembly by writing them to the linear memory.
		let offset = 4096;

		const strPtr = (str) => {
			const ptr = offset;
			const bytes = encoder.encode(str + "\0");
			new Uint8Array(this.mem.buffer, offset, bytes.length).set(bytes);
			offset += bytes.length;
			if (offset % 8 !== 0) {
				offset += 8 - (offset % 8);
			}
			return ptr;
		};

		const argc = this.argv.length;

		const argvPtrs = [];
		this.argv.forEach((arg) => {
			argvPtrs.push(strPtr(arg));
		});
		argvPtrs.push(0);

		const keys = Object.keys(this.env).sort();
		keys.forEach((key) => {
			argvPtrs.push(strPtr(`${key}=${this.env[key]}`));
		});
		argvPtrs.push(0);

		const argv = offset;
		argvPtrs.forEach((ptr) => {
			this.mem.setUint32(offset, ptr, true);
			this.mem.setUint32(offset + 4, 0, true);
			offset += 8;
		});

		// The linker guarantees global data starts from at least wasmMinDataAddr.
		// Keep in sync with cmd/link/internal/ld/data.go:wasmMinDataAddr.
		const wasmMinDataAddr = 4096 + 8192;
		if (offset >= wasmMinDataAddr) {
			throw new Error("total length of command line and environment variables exceeds limit");
		}

		this._inst.exports.run(argc, argv);
		if (this.exited) {
			this._resolveExitPromise();
		}
		await this._exitPromise;
	}

	_resume() {
		if (this.exited) {
			throw new Error("Go program has already exited");
		}
		this._inst.exports.resume();
		if (this.exited) {
			this._resolveExitPromise();
		}
	}

	_makeFuncWrapper(id) {
		const go = this;
		return function () {
			const event = { id: id, this: this, args: arguments };
			go._pendingEvent = event;
			go._resume();
			return event.result;
		};
	}
}

