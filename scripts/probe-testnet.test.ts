import { describe, expect, it, vi } from "vitest";
import { BASE_SEPOLIA_CHAIN_ID } from "../src/base/evm.ts";
import { formatTestnetProbe, probeTestnet, TestnetProbeError } from "./probe-testnet.ts";

function environment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    STELLAR_RPC_URL: "https://stellar.example.test",
    STELLAR_WEBAUTHN_VERIFIER: "contract-1",
    STELLAR_ED25519_VERIFIER: "contract-2",
    STELLAR_SPENDING_LIMIT_POLICY: "contract-3",
    STELLAR_USDC_SAC: "contract-4",
    CCTP_STELLAR_TOKEN_MESSENGER: "contract-5",
    CCTP_STELLAR_MESSAGE_TRANSMITTER: "contract-6",
    CCTP_STELLAR_FORWARDER: "contract-7",
  };
}

function dependencies() {
  return {
    baseRpc: {
      request: vi.fn(async (method: string) => method === "eth_chainId" ? `0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}` : "0x60016002"),
    },
    stellarRpc: {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 123_456 }),
      getContractMethods: vi.fn().mockResolvedValue([{ name: "version" }]),
    },
  };
}

describe("public Testnet readiness probe", () => {
  it("checks the exact Base chain and every configured public contract without transaction methods", async () => {
    const deps = dependencies();
    const result = await probeTestnet({ environment: environment(), ...deps });

    expect(result.base.chainId).toBe(BASE_SEPOLIA_CHAIN_ID);
    expect(result.base.contracts).toHaveLength(3);
    expect(result.stellar.latestLedger).toBe(123_456);
    expect(result.stellar.contracts).toHaveLength(7);
    expect(deps.baseRpc.request.mock.calls.map(([method]) => method)).toEqual([
      "eth_chainId", "eth_getCode", "eth_getCode", "eth_getCode",
    ]);
    expect(deps.stellarRpc.getContractMethods).toHaveBeenCalledTimes(7);
  });

  it("fails closed on the wrong Base network", async () => {
    const deps = dependencies();
    deps.baseRpc.request.mockResolvedValueOnce("0x1");

    await expect(probeTestnet({ environment: environment(), ...deps })).rejects.toMatchObject({
      name: "TestnetProbeError",
      stage: "base:chain",
    });
    expect(deps.stellarRpc.getLatestLedger).not.toHaveBeenCalled();
  });

  it("fails closed when a configured contract has no deployed code", async () => {
    const deps = dependencies();
    deps.baseRpc.request.mockResolvedValueOnce(`0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}`).mockResolvedValueOnce("0x");

    await expect(probeTestnet({ environment: environment(), ...deps })).rejects.toBeInstanceOf(TestnetProbeError);
  });

  it("prints only public readiness evidence and states the proof boundary", async () => {
    const result = await probeTestnet({ environment: environment(), ...dependencies() });
    const report = formatTestnetProbe(result);

    expect(report).toContain("no transaction submitted");
    expect(report).toContain("READ ONLY");
    for (const [key, value] of Object.entries(environment())) {
      if (key !== "NODE_ENV" && value) expect(report).not.toContain(value);
    }
  });
});
