export default {
  async fetch(request, env) {
    // Discord only sends POSTs
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    // Required Discord headers
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");

    if (!signature || !timestamp) {
      return new Response("Missing signature", { status: 401 });
    }

    // IMPORTANT: read raw body first
    const body = await request.text();

    // Verify request
    const isValid = await verifyDiscordRequest(
      body,
      signature,
      timestamp,
      env.DISCORD_PUBLIC_KEY
    );

    if (!isValid) {
      return new Response("Invalid request", { status: 401 });
    }

    const interaction = JSON.parse(body);

    if (interaction.type === 1) {
      return new Response(
        JSON.stringify({ type: 1 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (interaction.type === 2) {
      const options = Object.fromEntries(
        (interaction.data.options || []).map(item => [item.name, item.value])
      );
      const payload = {
        job: {
          name: interaction.data.name,
          id: interaction.id
        },
        webhookUrl: `https://discord.com/api/webhooks/${interaction.application_id}/${interaction.token}`,
        displayName: interaction.member?.user.global_name || interaction?.user.global_name,
        userId: interaction.member?.user?.id || interaction.user?.id,
        inputs: options
      };

      // Direct Inject & Wakeup
      const injectAndWake = async () => {
        await fetch(`https://huggingface.co/api/spaces/${env.HF_SPACE_ID}/variables`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.HF_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            key: "CURRENT_JOB_JSON",
            value: JSON.stringify(payload)
          })
        });
      };
      
      request.waitUntil(injectAndWake());

      // Defer reply (Discord shows "thinking…")
      return new Response(
        JSON.stringify({ type: 5 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Unhandled interaction", { status: 400 });
  }
};

async function verifyDiscordRequest(body, signature, timestamp, publicKey) {
  const encoder = new TextEncoder();

  const message = encoder.encode(timestamp + body);
  const sig = hexToUint8Array(signature);
  const key = hexToUint8Array(publicKey);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "Ed25519", namedCurve: "Ed25519" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "Ed25519",
    cryptoKey,
    sig,
    message
  );
}

function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
