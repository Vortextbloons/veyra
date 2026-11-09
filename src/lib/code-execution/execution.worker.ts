import RELEASE_SYNC from "@jitl/quickjs-wasmfile-release-sync";
import { newQuickJSWASMModuleFromVariant, newVariant } from "quickjs-emscripten-core";
import wasmLocation from "@jitl/quickjs-wasmfile-release-sync/wasm?url";
import { executeSandbox } from "./sandbox";

self.onmessage = async (event: MessageEvent<{ code: string; inputJson: string }>) => {
  try {
    const module = await newQuickJSWASMModuleFromVariant(newVariant(RELEASE_SYNC, { wasmLocation }));
    self.postMessage({ result: executeSandbox(module, event.data.code, event.data.inputJson) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : "JavaScript execution failed" });
  }
};
