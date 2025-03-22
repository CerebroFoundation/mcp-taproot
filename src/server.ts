import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as btc from '@scure/btc-signer';
import { Transaction } from "@scure/btc-signer";
import { hex } from "@scure/base"; // Import hex from @scure/base
import { secp256k1 } from '@noble/curves/secp256k1'; // Import secp256k1


const server = new McpServer({
    name: "mcp-eth",
    version: "1.0.0",
});

// --- Helper Functions ---

// Checks if the input is valid hex.  Throws if invalid.
function validateHex(hexStr: string, length?: number) {
    if (typeof hexStr !== 'string') throw new Error('Hex must be string');
    if (hexStr.length % 2) throw new Error('Hex must have even length');
    if (length && hexStr.length !== length * 2) throw new Error(`Hex must be ${length * 2} chars long`);
    if (!/^[0-9a-f]*$/i.test(hexStr)) throw new Error('Hex must contain only 0-9 and a-f');
}

// --- Tool Definitions ---

server.tool(
    "generate_address",
    "Generates a P2WPKH address from a private key (WIF format).",
    {
        privateKeyWif: z.string().describe("Private key in WIF format"),
        testnet: z.boolean().optional().default(false).describe("Generate a testnet address. Defaults to false (mainnet)."),
    },
    async ({ privateKeyWif, testnet }) => {
        try {
            const privateKeyBytes = btc.WIF(testnet ? btc.TEST_NETWORK : undefined).decode(privateKeyWif);
            const publicKey = secp256k1.getPublicKey(privateKeyBytes, true); // Correct: Use secp256k1 directly
            const payment = btc.p2wpkh(publicKey, testnet ? btc.TEST_NETWORK : undefined);
            const address = payment.address;

            if (!address) {
                 return {
                    isError: true,
                    content: [{ type: "text", text: "Failed to generate address." }],
                };
            }

            return {
                content: [{ type: "text", text: `Generated Address: ${address}` }],
            };
        } catch (error: any) {
            return {
                isError: true,
                content: [{ type: "text", text: `Error generating address: ${error.message}` }],
            };
        }
    }
);


server.tool(
    "sign_transaction",
    "Signs a partially signed Bitcoin transaction (PSBT).",
    {
        psbtHex: z.string().describe("The PSBT to sign, as a hexadecimal string."),
        privateKeyWif: z.string().describe("Private key in WIF format"),
        testnet: z.boolean().optional().default(false).describe("Sign for testnet. Defaults to false (mainnet)."),
    },
    async ({ psbtHex, privateKeyWif, testnet }) => {
        try {
            validateHex(psbtHex);
            const privateKeyBytes = btc.WIF(testnet ? btc.TEST_NETWORK : undefined).decode(privateKeyWif);
            const tx = btc.Transaction.fromPSBT(hex.decode(psbtHex));

            tx.sign(privateKeyBytes);
            // No finalization, as other signers might be needed
            return {
                content: [{ type: "text", text: `Signed PSBT: ${hex.encode(tx.toPSBT())}` }],
            };

        } catch (error: any) {
            return {
                isError: true,
                content: [{ type: "text", text: `Error signing transaction: ${error.message}` }],
            };
        }
    }
);






// --- Server Setup and Start ---

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("btc-signer MCP Server running on stdio"); // Log to stderr
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});