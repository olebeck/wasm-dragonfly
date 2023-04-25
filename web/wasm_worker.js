importScripts("wasm_exec.js");

(async () => {
    const root = await navigator.storage.getDirectory();
    const go = new Go(root);
    WebAssembly.instantiateStreaming(fetch("dragonfly.wasm"), go.importObject).then((result) => {
        go.run(result.instance);
    });
})();
