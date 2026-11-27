import { Buffer } from "node:buffer";

import {
  Address,
  hash,
  Keypair,
  nativeToScVal,
  StrKey,
  xdr,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import {
  StellarRelayerError,
  parseStellarRelayerRequest,
  validateStellarDeploymentSubmission,
  validateStellarAgentPassSubmission,
  validateStellarCctpBurnSubmission,
  validateStellarUsdcTransferSubmission,
} from "./relayer";

const accountWasmHash = Buffer.alloc(32, 3).toString("hex");
const webauthnVerifierAddress = StrKey.encodeContract(Buffer.alloc(32, 1));
const ed25519VerifierAddress = StrKey.encodeContract(Buffer.alloc(32, 2));
const spendingLimitPolicyAddress = StrKey.encodeContract(Buffer.alloc(32, 3));
const usdcContract = StrKey.encodeContract(Buffer.alloc(32, 5));
const smartAccount = StrKey.encodeContract(Buffer.alloc(32, 6));
const cctpTokenMessenger = StrKey.encodeContract(Buffer.alloc(32, 7));
const recipient = Keypair.random().publicKey();

function externalSigner(verifier: string, keyData: Buffer): xdr.ScVal {
  return xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    xdr.ScVal.scvAddress(Address.fromString(verifier).toScAddress()),
    xdr.ScVal.scvBytes(keyData),
  ]);
}

function authPayload(input: {
  readonly verifier?: string;
  readonly keyData?: Buffer;
  readonly contextRuleId?: number;
} = {}): xdr.ScVal {
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("context_rule_ids"),
      val: xdr.ScVal.scvVec([
        xdr.ScVal.scvU32(input.contextRuleId ?? 0),
      ]),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("signers"),
      val: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: externalSigner(
            input.verifier ?? webauthnVerifierAddress,
            input.keyData ?? Buffer.concat([Buffer.from([0x04]), Buffer.alloc(80, 7)]),
          ),
          val: xdr.ScVal.scvBytes(Buffer.alloc(64, 8)),
        }),
      ]),
    }),
  ]);
}

function deploymentSubmission(overrides: { wasmByte?: number; verifier?: string } = {}) {
  const deployer = Keypair.fromRawEd25519Seed(
    hash(Buffer.from("openzeppelin-smart-account-kit")),
  ).publicKey();
  const credentialId = Buffer.from("telya-test-credential");
  const preimage = xdr.ContractIdPreimage.contractIdPreimageFromAddress(
    new xdr.ContractIdPreimageFromAddress({
      address: Address.fromString(deployer).toScAddress(),
      salt: hash(credentialId),
    }),
  );
  const signer = xdr.ScVal.scvVec([
    xdr.ScVal.scvSymbol("External"),
    xdr.ScVal.scvAddress(
      Address.fromString(overrides.verifier ?? webauthnVerifierAddress).toScAddress(),
    ),
    xdr.ScVal.scvBytes(
      Buffer.concat([Buffer.from([0x04]), Buffer.alloc(64, 2), credentialId]),
    ),
  ]);
  const deploy = new xdr.CreateContractArgsV2({
    contractIdPreimage: preimage,
    executable: xdr.ContractExecutable.contractExecutableWasm(
      Buffer.alloc(32, overrides.wasmByte ?? 3),
    ),
    constructorArgs: [xdr.ScVal.scvVec([signer]), xdr.ScVal.scvMap([])],
  });
  const func = xdr.HostFunction.hostFunctionTypeCreateContractV2(deploy);
  const credentials = xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({
      address: Address.fromString(deployer).toScAddress(),
      nonce: xdr.Int64.fromString("1"),
      signatureExpirationLedger: 100,
      signature: xdr.ScVal.scvVoid(),
    }),
  );
  const rootInvocation = new xdr.SorobanAuthorizedInvocation({
    function:
      xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeCreateContractV2HostFn(
        deploy,
      ),
    subInvocations: [],
  });
  const auth = new xdr.SorobanAuthorizationEntry({ credentials, rootInvocation });
  return { func: func.toXDR("base64"), auth: [auth.toXDR("base64")] };
}

function transferSubmission(overrides: {
  tokenContract?: string;
  sender?: string;
  authorizedSender?: string;
  functionName?: string;
  signature?: xdr.ScVal;
} = {}) {
  const sender = overrides.sender ?? smartAccount;
  const invoke = new xdr.InvokeContractArgs({
    contractAddress: Address.fromString(
      overrides.tokenContract ?? usdcContract,
    ).toScAddress(),
    functionName: overrides.functionName ?? "transfer",
    args: [
      nativeToScVal(sender, { type: "address" }),
      nativeToScVal(recipient, { type: "address" }),
      nativeToScVal(50_000_000n, { type: "i128" }),
    ],
  });
  const credentials = xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({
      address: Address.fromString(
        overrides.authorizedSender ?? sender,
      ).toScAddress(),
      nonce: xdr.Int64.fromString("1"),
      signatureExpirationLedger: 500,
      signature:
        overrides.signature ?? authPayload(),
    }),
  );
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials,
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function:
        xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
          invoke,
        ),
      subInvocations: [],
    }),
  });
  return {
    func: xdr.HostFunction.hostFunctionTypeInvokeContract(invoke).toXDR("base64"),
    auth: [auth.toXDR("base64")],
  };
}

describe("Stellar deployment relayer boundary", () => {
  it("accepts only the exact Smart Account Kit passkey deployment shape", () => {
    expect(
      validateStellarDeploymentSubmission(deploymentSubmission(), {
        accountWasmHash,
        webauthnVerifierAddress,
      }).func.switch().name,
    ).toBe("hostFunctionTypeCreateContractV2");
  });

  it("rejects a deployment of a non-allowlisted account WASM", () => {
    expect(() =>
      validateStellarDeploymentSubmission(deploymentSubmission({ wasmByte: 4 }), {
        accountWasmHash,
        webauthnVerifierAddress,
      }),
    ).toThrowError(StellarRelayerError);
  });

  it("rejects a deployment with a different WebAuthn verifier", () => {
    expect(() =>
      validateStellarDeploymentSubmission(
        deploymentSubmission({
          verifier: StrKey.encodeContract(Buffer.alloc(32, 9)),
        }),
        { accountWasmHash, webauthnVerifierAddress },
      ),
    ).toThrow("verifier is not allowlisted");
  });

  it("rejects signed-XDR mode because this route sponsors shared-deployer payloads only", () => {
    expect(() => parseStellarRelayerRequest({ xdr: "signed-envelope" })).toThrow(
      "Invalid relayer request",
    );
  });

  it("preserves a valid product payment ID without including it in the signed request identity", () => {
    const paymentId = "11111111-1111-4111-8111-111111111111";
    expect(parseStellarRelayerRequest({ ...deploymentSubmission(), paymentId })).toMatchObject({
      paymentId,
    });
    expect(() => parseStellarRelayerRequest({
      ...deploymentSubmission(),
      paymentId: "not-a-payment",
    })).toThrow("Invalid payment ID");
  });
});

describe("Stellar USDC relayer boundary", () => {
  it("accepts an exact passkey-authorized allowlisted USDC transfer", () => {
    expect(
      validateStellarUsdcTransferSubmission(transferSubmission(), {
        usdcContract,
        webauthnVerifierAddress,
        ed25519VerifierAddress,
      }),
    ).toMatchObject({
      kind: "usdc_transfer",
      tokenContract: usdcContract,
      sender: smartAccount,
      recipient,
      amountRaw: 50_000_000n,
    });
  });

  it("rejects a transfer for a different token contract", () => {
    expect(() =>
      validateStellarUsdcTransferSubmission(
        transferSubmission({
          tokenContract: StrKey.encodeContract(Buffer.alloc(32, 9)),
        }),
        { usdcContract, webauthnVerifierAddress, ed25519VerifierAddress },
      ),
    ).toThrow("not the allowlisted Testnet USDC contract");
  });

  it("rejects authorization from a different smart account", () => {
    expect(() =>
      validateStellarUsdcTransferSubmission(
        transferSubmission({
          authorizedSender: StrKey.encodeContract(Buffer.alloc(32, 7)),
        }),
        { usdcContract, webauthnVerifierAddress, ed25519VerifierAddress },
      ),
    ).toThrow("authorization does not exactly match");
  });

  it("rejects an unsigned transfer authorization", () => {
    expect(() =>
      validateStellarUsdcTransferSubmission(
        transferSubmission({ signature: xdr.ScVal.scvVoid() }),
        { usdcContract, webauthnVerifierAddress, ed25519VerifierAddress },
      ),
    ).toThrow("authorization payload is invalid");
  });

  it("rejects arbitrary contract methods", () => {
    expect(() =>
      validateStellarUsdcTransferSubmission(
        transferSubmission({ functionName: "approve" }),
        { usdcContract, webauthnVerifierAddress, ed25519VerifierAddress },
      ),
    ).toThrow("Only the USDC transfer function is accepted");
  });

  it("accepts an Ed25519 Agent Pass signer on a non-owner context rule", () => {
    expect(
      validateStellarUsdcTransferSubmission(
        transferSubmission({
          signature: authPayload({
            verifier: ed25519VerifierAddress,
            keyData: Buffer.alloc(32, 6),
            contextRuleId: 2,
          }),
        }),
        { usdcContract, webauthnVerifierAddress, ed25519VerifierAddress },
      ),
    ).toMatchObject({
      authorizationKind: "agent",
      contextRuleId: 2,
      signerAddress: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 6)),
    });
  });
});

function cctpBurnSubmission(overrides: {
  readonly destinationDomain?: number;
  readonly finalityThreshold?: number;
  readonly destinationCaller?: Buffer;
  readonly mintRecipient?: Buffer;
  readonly signature?: xdr.ScVal;
} = {}) {
  const targetArgs = [
    nativeToScVal(smartAccount, { type: "address" }),
    nativeToScVal(50_000_000n, { type: "i128" }),
    xdr.ScVal.scvU32(overrides.destinationDomain ?? 6),
    xdr.ScVal.scvBytes(
      overrides.mintRecipient ?? Buffer.concat([Buffer.alloc(12), Buffer.alloc(20, 9)]),
    ),
    nativeToScVal(usdcContract, { type: "address" }),
    xdr.ScVal.scvBytes(overrides.destinationCaller ?? Buffer.alloc(32)),
    nativeToScVal(100_000n, { type: "i128" }),
    xdr.ScVal.scvU32(overrides.finalityThreshold ?? 2_000),
  ];
  const invoke = new xdr.InvokeContractArgs({
    contractAddress: Address.fromString(smartAccount).toScAddress(),
    functionName: "execute",
    args: [
      nativeToScVal(cctpTokenMessenger, { type: "address" }),
      xdr.ScVal.scvString("deposit_for_burn"),
      xdr.ScVal.scvVec(targetArgs),
    ],
  });
  const credentials = xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({
      address: Address.fromString(smartAccount).toScAddress(),
      nonce: xdr.Int64.fromString("3"),
      signatureExpirationLedger: 500,
      signature: overrides.signature ?? authPayload(),
    }),
  );
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials,
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invoke),
      subInvocations: [],
    }),
  });
  return {
    func: xdr.HostFunction.hostFunctionTypeInvokeContract(invoke).toXDR("base64"),
    auth: [auth.toXDR("base64")],
  };
}

describe("Stellar CCTP relayer boundary", () => {
  const options = {
    usdcContract,
    webauthnVerifierAddress,
    cctpTokenMessenger,
    baseDomain: 6,
  };

  it("accepts only the exact owner-authorized Standard burn shape", () => {
    expect(validateStellarCctpBurnSubmission(cctpBurnSubmission(), options)).toMatchObject({
      kind: "cctp_burn",
      smartAccount,
      tokenMessenger: cctpTokenMessenger,
      burnToken: usdcContract,
      recipient: `0x${Buffer.alloc(20, 9).toString("hex")}`,
      amountRaw: 50_000_000n,
      maxFeeRaw: 100_000n,
    });
  });

  it("rejects Fast Transfer and any non-Base destination", () => {
    expect(() =>
      validateStellarCctpBurnSubmission(
        cctpBurnSubmission({ finalityThreshold: 1_000 }),
        options,
      ),
    ).toThrow("Standard Testnet policy");
    expect(() =>
      validateStellarCctpBurnSubmission(
        cctpBurnSubmission({ destinationDomain: 3 }),
        options,
      ),
    ).toThrow("Standard Testnet policy");
  });

  it("rejects a restricted destination caller or malformed Base recipient", () => {
    expect(() =>
      validateStellarCctpBurnSubmission(
        cctpBurnSubmission({ destinationCaller: Buffer.alloc(32, 1) }),
        options,
      ),
    ).toThrow("Standard Testnet policy");
    expect(() =>
      validateStellarCctpBurnSubmission(
        cctpBurnSubmission({ mintRecipient: Buffer.alloc(32, 1) }),
        options,
      ),
    ).toThrow("Standard Testnet policy");
  });

  it("rejects non-owner authorization", () => {
    expect(() =>
      validateStellarCctpBurnSubmission(
        cctpBurnSubmission({
          signature: authPayload({
            verifier: ed25519VerifierAddress,
            keyData: Buffer.alloc(32, 4),
            contextRuleId: 2,
          }),
        }),
        options,
      ),
    ).toThrow("requires the passkey owner");
  });
});

function agentPassSubmission(functionName: "add_context_rule" | "remove_context_rule") {
  const agentKey = Buffer.alloc(32, 6);
  const args = functionName === "remove_context_rule"
    ? [xdr.ScVal.scvU32(2)]
    : [
        xdr.ScVal.scvVec([
          xdr.ScVal.scvSymbol("CallContract"),
          xdr.ScVal.scvAddress(Address.fromString(usdcContract).toScAddress()),
        ]),
        xdr.ScVal.scvString("Telya Agent Pass"),
        xdr.ScVal.scvU32(10_000),
        xdr.ScVal.scvVec([externalSigner(ed25519VerifierAddress, agentKey)]),
        xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvAddress(
              Address.fromString(spendingLimitPolicyAddress).toScAddress(),
            ),
            val: xdr.ScVal.scvMap([
              new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol("period_ledgers"),
                val: xdr.ScVal.scvU32(720),
              }),
              new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol("spending_limit"),
                val: nativeToScVal(50_000_000n, { type: "i128" }),
              }),
            ]),
          }),
        ]),
      ];
  const invoke = new xdr.InvokeContractArgs({
    contractAddress: Address.fromString(smartAccount).toScAddress(),
    functionName,
    args,
  });
  const credentials = xdr.SorobanCredentials.sorobanCredentialsAddress(
    new xdr.SorobanAddressCredentials({
      address: Address.fromString(smartAccount).toScAddress(),
      nonce: xdr.Int64.fromString("2"),
      signatureExpirationLedger: 500,
      signature: authPayload(),
    }),
  );
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials,
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invoke),
      subInvocations: [],
    }),
  });
  return {
    func: xdr.HostFunction.hostFunctionTypeInvokeContract(invoke).toXDR("base64"),
    auth: [auth.toXDR("base64")],
  };
}

describe("Stellar Agent Pass relayer boundary", () => {
  const options = {
    usdcContract,
    webauthnVerifierAddress,
    ed25519VerifierAddress,
    spendingLimitPolicyAddress,
  };

  it("accepts only an owner-authorized USDC rule with the spending policy", () => {
    expect(
      validateStellarAgentPassSubmission(
        agentPassSubmission("add_context_rule"),
        options,
      ),
    ).toMatchObject({
      kind: "agent_pass_create",
      smartAccount,
      agentAddress: StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 6)),
      spendingLimitRaw: 50_000_000n,
      periodLedgers: 720,
      validUntilLedger: 10_000,
    });
  });

  it("accepts owner revocation only for a non-owner rule", () => {
    expect(
      validateStellarAgentPassSubmission(
        agentPassSubmission("remove_context_rule"),
        options,
      ),
    ).toMatchObject({
      kind: "agent_pass_revoke",
      smartAccount,
      contextRuleId: 2,
    });
  });

  it("rejects an Agent Pass scoped to any other token contract", () => {
    expect(() =>
      validateStellarAgentPassSubmission(
        agentPassSubmission("add_context_rule"),
        {
          ...options,
          usdcContract: StrKey.encodeContract(Buffer.alloc(32, 20)),
        },
      ),
    ).toThrow("must be scoped to the configured Testnet USDC contract");
  });

  it("rejects an Agent Pass using a non-allowlisted signer verifier", () => {
    expect(() =>
      validateStellarAgentPassSubmission(
        agentPassSubmission("add_context_rule"),
        {
          ...options,
          ed25519VerifierAddress: StrKey.encodeContract(Buffer.alloc(32, 21)),
        },
      ),
    ).toThrow("allowlisted Ed25519 signer");
  });
});
