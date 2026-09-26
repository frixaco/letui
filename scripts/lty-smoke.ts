/** Live Codex app-server handshake for Letty Agent; does not start a model turn. */

import {
  CodexAppServer,
  readCodexCliVersion,
  type CodexAccount,
  type CodexModel,
} from "../examples/ai-agent/codex-client.ts";

const version = readCodexCliVersion();
if (!version) throw new Error("Codex CLI not found on PATH");

const codex = await CodexAppServer.connect({ cwd: process.cwd(), requestTimeoutMs: 15_000 });
try {
  const [accountResult, modelResult] = await Promise.all([
    codex.request<{ account: CodexAccount }>("account/read", { refreshToken: false }),
    codex.request<{ data: CodexModel[] }>("model/list", { includeHidden: false }),
    codex.request("account/rateLimits/read"),
  ]);
  if (accountResult.account?.type !== "chatgpt") {
    throw new Error("Codex is not signed in with ChatGPT");
  }
  if (modelResult.data.length === 0) throw new Error("Codex returned no available models");
  console.log(`Letty smoke passed with Codex ${version} and ${modelResult.data.length} models`);
} finally {
  codex.dispose();
}
