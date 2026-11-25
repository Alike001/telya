import {
  Account,
  Address,
  BASE_FEE,
  hash,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { rpc } from "@stellar/stellar-sdk";

const SHARED_DEPLOYER = Keypair.fromRawEd25519Seed(
  hash(Buffer.from("openzeppelin-smart-account-kit")),
).publicKey();

const MAX_REQUEST_BYTES = 48_000;
const DEFAULT_MAX_RESOURCE_FEE_STROOPS = 1_000_000n;

export class StellarRelayerError extends Error {
  constructor(
    readonly code:
      | "INVALID_REQUEST"
      | "FORBIDDEN_DEPLOYMENT"
      | "FEE_LIMIT_EXCEEDED"
      | "RELAYER_UNAVAILABLE"
      | "SUBMISSION_FAILED",
    message: string,
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "StellarRelayerError";
  }
}

export interface StellarDeploymentSubmission {
  readonly func: string;
  readonly auth: readonly string[];
}

export interface ValidatedStellarDeployment {
  readonly func: xdr.HostFunction;
  readonly auth: readonly xdr.SorobanAuthorizationEntry[];
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function contractIdOf(address: xdr.ScAddress, message: string): string {
  if (address.switch().name !== "scAddressTypeContract") {
    throw new StellarRelayerError("FORBIDDEN_DEPLOYMENT", message, 403);
  }
  return Address.fromScAddress(address).toString();
}

function addressOf(address: xdr.ScAddress, message: string): string {
  const type = address.switch().name;
  if (type !== "scAddressTypeAccount" && type !== "scAddressTypeContract") {
    throw new StellarRelayerError("FORBIDDEN_DEPLOYMENT", message, 403);
  }
  return Address.fromScAddress(address).toString();
}

function validateConstructor(
  deploy: xdr.CreateContractArgsV2,
  webauthnVerifierAddress: string,
): void {
  const args = deploy.constructorArgs();
  if (
    args.length !== 2 ||
    args[0]?.switch().name !== "scvVec" ||
    args[1]?.switch().name !== "scvMap"
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy constructor has an invalid argument shape",
      403,
    );
  }

  const signers = args[0].vec() ?? [];
  const signer = signers[0]?.switch().name === "scvVec" ? signers[0].vec() ?? [] : [];
  if (
    signers.length !== 1 ||
    signer.length !== 3 ||
    signer[0]?.switch().name !== "scvSymbol" ||
    signer[0].sym().toString() !== "External" ||
    signer[1]?.switch().name !== "scvAddress" ||
    signer[2]?.switch().name !== "scvBytes"
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy must contain exactly one WebAuthn signer",
      403,
    );
  }

  const verifier = contractIdOf(
    signer[1].address(),
    "Deploy signer verifier must be a contract",
  );
  if (verifier !== webauthnVerifierAddress) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy signer verifier is not allowlisted",
      403,
    );
  }

  const keyData = signer[2].bytes();
  if (keyData.length <= 65 || keyData[0] !== 0x04) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy signer has invalid WebAuthn key data",
      403,
    );
  }
  const salt = deploy.contractIdPreimage().fromAddress().salt();
  if (!bytesEqual(hash(keyData.subarray(65)), salt)) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy salt does not match the passkey credential",
      403,
    );
  }

  for (const entry of args[1].map() ?? []) {
    if (entry.key().switch().name !== "scvAddress") {
      throw new StellarRelayerError(
        "FORBIDDEN_DEPLOYMENT",
        "Deploy policy key must be a contract address",
        403,
      );
    }
    contractIdOf(entry.key().address(), "Deploy policy key must be a contract address");
  }
}

export function validateStellarDeploymentSubmission(
  submission: StellarDeploymentSubmission,
  options: { accountWasmHash: string; webauthnVerifierAddress: string },
): ValidatedStellarDeployment {
  let func: xdr.HostFunction;
  let auth: xdr.SorobanAuthorizationEntry[];
  try {
    func = xdr.HostFunction.fromXDR(submission.func, "base64");
    auth = submission.auth.map((entry) =>
      xdr.SorobanAuthorizationEntry.fromXDR(entry, "base64"),
    );
  } catch {
    throw new StellarRelayerError(
      "INVALID_REQUEST",
      "func/auth contains invalid XDR",
      400,
    );
  }

  if (func.switch().name !== "hostFunctionTypeCreateContractV2") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Only smart-account deployments are accepted by this endpoint",
      403,
    );
  }
  if (auth.length !== 1) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy must contain exactly one authorization entry",
      403,
    );
  }

  const deploy = func.createContractV2();
  const executable = deploy.executable();
  if (
    executable.switch().name !== "contractExecutableWasm" ||
    Buffer.from(executable.wasmHash()).toString("hex") !== options.accountWasmHash
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy WASM hash is not allowlisted",
      403,
    );
  }

  const preimage = deploy.contractIdPreimage();
  if (preimage.switch().name !== "contractIdPreimageFromAddress") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy must use an address preimage",
      403,
    );
  }
  const deployer = addressOf(
    preimage.fromAddress().address(),
    "Deploy preimage address is invalid",
  );
  if (deployer !== SHARED_DEPLOYER) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy preimage address is not allowlisted",
      403,
    );
  }

  validateConstructor(deploy, options.webauthnVerifierAddress);

  const entry = auth[0];
  if (!entry || entry.credentials().switch().name !== "sorobanCredentialsAddress") {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy requires address credentials",
      403,
    );
  }
  const signer = addressOf(
    entry.credentials().address().address(),
    "Deploy credential address is invalid",
  );
  const root = entry.rootInvocation();
  const rootFunction = root.function();
  if (
    signer !== deployer ||
    root.subInvocations().length !== 0 ||
    rootFunction.switch().name !==
      "sorobanAuthorizedFunctionTypeCreateContractV2HostFn" ||
    !bytesEqual(rootFunction.createContractV2HostFn().toXDR(), deploy.toXDR())
  ) {
    throw new StellarRelayerError(
      "FORBIDDEN_DEPLOYMENT",
      "Deploy authorization does not exactly match the deployment",
      403,
    );
  }

  return { func, auth };
}

function requiredEnvironmentValue(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]?.trim();
  if (!value) {
    throw new StellarRelayerError(
      "RELAYER_UNAVAILABLE",
      "The Stellar deployment relayer is not configured",
      503,
    );
  }
  return value;
}

function maxResourceFee(environment: NodeJS.ProcessEnv): bigint {
  const raw = environment.STELLAR_RELAYER_MAX_RESOURCE_FEE_STROOPS;
  try {
    const value = raw ? BigInt(raw) : DEFAULT_MAX_RESOURCE_FEE_STROOPS;
    if (value < 0n) throw new Error("negative");
    return value;
  } catch {
    throw new StellarRelayerError(
      "RELAYER_UNAVAILABLE",
      "The Stellar relayer fee ceiling is invalid",
      503,
    );
  }
}

export async function submitStellarDeployment(
  validated: ValidatedStellarDeployment,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ hash: string; ledger: number }> {
  const rpcUrl = requiredEnvironmentValue(environment, "STELLAR_RPC_URL");
  const accountWasmHash = requiredEnvironmentValue(
    environment,
    "STELLAR_ACCOUNT_WASM_HASH",
  ).toLowerCase();
  const webauthnVerifierAddress = requiredEnvironmentValue(
    environment,
    "STELLAR_WEBAUTHN_VERIFIER",
  );
  const sponsorSecret = requiredEnvironmentValue(
    environment,
    "STELLAR_FEE_SPONSOR_SECRET",
  );
  if ((environment.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET) !== Networks.TESTNET) {
    throw new StellarRelayerError(
      "RELAYER_UNAVAILABLE",
      "The Stellar relayer is restricted to Testnet",
      503,
    );
  }

  // Revalidate against server configuration immediately before the sponsor pays.
  const submission = {
    func: validated.func.toXDR("base64"),
    auth: validated.auth.map((entry) => entry.toXDR("base64")),
  };
  const checked = validateStellarDeploymentSubmission(submission, {
    accountWasmHash,
    webauthnVerifierAddress,
  });

  let sponsor: Keypair;
  try {
    sponsor = Keypair.fromSecret(sponsorSecret);
  } catch (error) {
    throw new StellarRelayerError(
      "RELAYER_UNAVAILABLE",
      "The Stellar deployment relayer is not configured",
      503,
      { cause: error },
    );
  }

  const server = new rpc.Server(rpcUrl);
  let source: Account;
  try {
    source = await server.getAccount(sponsor.publicKey());
  } catch (error) {
    throw new StellarRelayerError(
      "RELAYER_UNAVAILABLE",
      "The Stellar fee sponsor is unavailable",
      503,
      { cause: error },
    );
  }

  const transaction = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: checked.func,
        auth: [...checked.auth],
      }),
    )
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(transaction);
  if (!rpc.Api.isSimulationSuccess(simulation) || rpc.Api.isSimulationRestore(simulation)) {
    throw new StellarRelayerError(
      "SUBMISSION_FAILED",
      "Stellar rejected the smart-account deployment simulation",
      422,
    );
  }
  if (BigInt(simulation.minResourceFee) > maxResourceFee(environment)) {
    throw new StellarRelayerError(
      "FEE_LIMIT_EXCEEDED",
      "Smart-account deployment exceeds the sponsor fee ceiling",
      413,
    );
  }

  const prepared = rpc.assembleTransaction(transaction, simulation).build();
  prepared.sign(sponsor);
  const sent = await server.sendTransaction(prepared);
  if (sent.status === "ERROR") {
    throw new StellarRelayerError(
      "SUBMISSION_FAILED",
      "Stellar rejected the smart-account deployment",
      502,
    );
  }

  const result = await server.pollTransaction(sent.hash, { attempts: 20 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new StellarRelayerError(
      "SUBMISSION_FAILED",
      result.status === rpc.Api.GetTransactionStatus.FAILED
        ? "Smart-account deployment failed on-chain"
        : "Smart-account deployment confirmation timed out",
      502,
    );
  }
  return { hash: sent.hash, ledger: result.ledger };
}

export function parseStellarRelayerRequest(body: unknown): StellarDeploymentSubmission {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new StellarRelayerError("INVALID_REQUEST", "Invalid relayer request", 400);
  }
  const value = body as Record<string, unknown>;
  if (
    typeof value.func !== "string" ||
    !Array.isArray(value.auth) ||
    value.auth.length !== 1 ||
    !value.auth.every((entry) => typeof entry === "string") ||
    JSON.stringify(body).length > MAX_REQUEST_BYTES
  ) {
    throw new StellarRelayerError("INVALID_REQUEST", "Invalid relayer request", 400);
  }
  return { func: value.func, auth: value.auth as string[] };
}
