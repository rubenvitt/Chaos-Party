import Foundation
import JavaScriptCore
import Network

func log(_ s: String) { print("PROBE " + s); fflush(stdout) }
let ctx = JSContext()!
ctx.exceptionHandler = { _, e in log("JS-EXCEPTION \(e?.toString() ?? "?")") }
log("WebAssembly=" + (ctx.evaluateScript("typeof WebAssembly")?.toString() ?? "nil"))
// Tiny wasm: (func (export "add") (param i32 i32) (result i32) local.get 0 local.get 1 i32.add)
let tiny = "new Uint8Array([0,97,115,109,1,0,0,0,1,7,1,96,2,127,127,1,127,3,2,1,0,7,7,1,3,97,100,100,0,0,10,9,1,7,0,32,0,32,1,106,11])"
let r1 = ctx.evaluateScript("""
(function(){ try { const m = new WebAssembly.Module(\(tiny)); const i = new WebAssembly.Instance(m, {}); let s=0; const t0=Date.now(); for (let k=0;k<5000000;k++) s=i.exports.add(s,1)|0; return 'tiny ok sum='+s+' ms='+(Date.now()-t0); } catch(e) { return 'tiny FAIL '+e; } })()
""")
log(r1?.toString() ?? "nil")
if let url = Bundle.main.url(forResource: "HavokPhysics", withExtension: "wasm"), let data = try? Data(contentsOf: url),
   let umd = Bundle.main.url(forResource: "havok_umd", withExtension: "js"), let umdSrc = try? String(contentsOf: umd, encoding: .utf8) {
  // Bytes ohne atob: als Zahlenarray übergeben.
  ctx.setObject([UInt8](data).map { NSNumber(value: $0) }, forKeyedSubscript: "HAVOK_BYTES" as NSString)
  ctx.evaluateScript("var module = undefined; var exports = undefined; var self = globalThis; var window = globalThis; globalThis.performance = { now: function(){ return Date.now(); } };")
  ctx.evaluateScript(umdSrc)
  let report: @convention(block) (String) -> Void = { log($0) }
  ctx.setObject(report, forKeyedSubscript: "report" as NSString)
  ctx.evaluateScript("""
  (function(){ try {
    const u = Uint8Array.from(HAVOK_BYTES); const t0 = Date.now();
    const m = new WebAssembly.Module(u);
    report('havok compile ok bytes='+u.length+' ms='+(Date.now()-t0));
    const factory = globalThis.HavokPhysics;
    if (typeof factory !== 'function') { report('havok umd factory missing: '+typeof factory); return; }
    report('factory type '+typeof factory); const pr = factory({ print: report, printErr: report, locateFile: function(){ return 'x'; }, instantiateWasm: function(imports, done){ try { const inst = new WebAssembly.Instance(m, imports); report('instance sync ok'); done(inst, m); return inst.exports; } catch(e){ report('instantiate FAIL '+e); return {}; } } }); report('promise '+(pr && typeof pr.then)); pr.then(function(hk){
      const t1 = Date.now();
      const w = hk.HP_World_Create()[1];
      hk.HP_World_SetGravity(w, [0,-9.81,0]);
      // 40 Kugeln, 600 Schritte
      for (let i=0;i<40;i++){ const s=hk.HP_Shape_CreateSphere([0,0,0],0.5)[1]; const b=hk.HP_Body_Create()[1]; hk.HP_Body_SetShape(b,s); hk.HP_Body_SetMotionType(b,hk.MotionType.DYNAMIC); hk.HP_Body_SetMassProperties(b,[[0,0,0],1,[0.1,0.1,0.1],[0,0,0,1]]); hk.HP_Body_SetQTransform(b,[[i%7, 2+Math.floor(i/7)*1.1, 0],[0,0,0,1]]); hk.HP_World_AddBody(w,b,false); }
      const ground=hk.HP_Shape_CreateBox([0,0,0],[0,0,0,1],[100,1,100])[1]; const gb=hk.HP_Body_Create()[1]; hk.HP_Body_SetShape(gb,ground); hk.HP_Body_SetMotionType(gb,hk.MotionType.STATIC); hk.HP_World_AddBody(w,gb,false);
      const t2=Date.now(); for (let k=0;k<600;k++) hk.HP_World_Step(w,1/60); const t3=Date.now();
      report('havok init ms='+(t1-t0)+' 600 steps 40 bodies ms='+(t3-t2)+' perStep='+((t3-t2)/600).toFixed(3));
    }, function(e){ report('havok init FAIL '+e); });
  } catch(e) { report('havok FAIL '+e); } })()
  """)
  for _ in 0..<80 { RunLoop.main.run(until: Date().addingTimeInterval(0.1)); ctx.evaluateScript("void 0") }
}
if let js = Bundle.main.url(forResource: "gamecore", withExtension: "js"), let src = try? String(contentsOf: js, encoding: .utf8) {
  ctx.evaluateScript(src)
  log("gamecore " + (ctx.evaluateScript("runGames(20)")?.toString() ?? "nil"))
}
// Network.framework: can a tvOS app listen for WebSocket clients?
do {
  let params = NWParameters.tcp
  let ws = NWProtocolWebSocket.Options()
  params.defaultProtocolStack.applicationProtocols.insert(ws, at: 0)
  let listener = try NWListener(using: params, on: 8799)
  let sem = DispatchSemaphore(value: 0)
  listener.stateUpdateHandler = { st in log("listener state \(st)"); if case .ready = st { sem.signal() }; if case .failed = st { sem.signal() } }
  listener.newConnectionHandler = { $0.cancel() }
  listener.start(queue: .global())
  _ = sem.wait(timeout: .now() + 5)
  listener.cancel()
} catch { log("listener error \(error)") }
log("done")
exit(0)
