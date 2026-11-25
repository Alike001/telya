import { Buffer } from "node:buffer";

import { Address, hash, Keypair, StrKey, xdr } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import {
  StellarRelayerError,
  parseStellarRelayerRequest,
  validateStellarDeploymentSubmission,
} from "./relayer";

const accountWasmHash = Buffer.alloc(32, 3).toString("hex");
const webauthnVerifierAddress = StrKey.encodeContract(Buffer.alloc(32, 1));

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
