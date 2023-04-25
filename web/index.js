const ansi_up = new AnsiUp();
const worker = new Worker("wasm_worker.js");
const consoleElem = document.getElementById("console");

worker.addEventListener("message", (ev) => {
  if(ev.data.log) {
    console.log(ev.data.log);
    const html = ansi_up.ansi_to_html(ev.data.log);
    consoleElem.innerHTML += html+"<br>";
  }
});
