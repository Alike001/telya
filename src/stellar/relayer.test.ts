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
  validateStellarUsdcTransferSubmission,
} from "./relayer";

const accountWasmHash = Buffer.alloc(32, 3).toString("hex");
const webauthnVerifierAddress = StrKey.encodeContract(Buffer.alloc(32, 1));
const usdcContract = StrKey.encodeContract(Buffer.alloc(32, 5));
const smartAccount = StrKey.encodeContract(Buffer.alloc(32, 6));
const recipient = Keypair.random().publicKey();

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
        overrides.signature ?? xdr.ScVal.scvVec([xdr.ScVal.scvBytes(Buffer.alloc(64, 8))]),
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
});

describe("Stellar USDC relayer boundary", () => {
  it("accepts an exact passkey-authorized allowlisted USDC transfer", () => {
    expect(
      validateStellarUsdcTransferSubmission(transferSubmission(), {
        usdcContract,
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
        { usdcContract },
      ),
    ).toThrow("not the allowlisted Testnet USDC contract");
  });

  it("rejects authorization from a different smart account", () => {
    expect(() =>
      validateStellarUsdcTransferSubmission(
        transferSubmission({
          authorizedSender: StrKey.encodeContract(Buffer.alloc(32, 7)),
        }),
        { usdcContract },
      ),
    ).toThrow("authorization does not exactly match");
  });

  it("rejects an unsigned transfer authorization", () => {
    expect(() =>
      validateStellarUsdcTransferSubmission(
        transferSubmission({ signature: xdr.ScVal.scvVoid() }),
        { usdcContract },
      ),
    ).toThrow("authorization does not exactly match");
  });

  it("rejects arbitrary contract methods", () => {
    expect(() =>
      validateStellarUsdcTransferSubmission(
        transferSubmission({ functionName: "approve" }),
        { usdcContract },
      ),
    ).toThrow("Only the USDC transfer function is accepted");
  });
});
