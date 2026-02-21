import { WorkflowEntrypoint } from 'cloudflare:workers';

export class RenderWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    const { payload, initialState } = event.payload;
    const hostUrl = `https://${this.env.HF_SPACE_ID.replace('/', '-')}.hf.space`;
    if (initialState === 'SLEEPING' || initialState === 'STOPPED' || initialState === 'PAUSED') {
      await step.do('check-and-wake', async () => {
        if (initialState === 'SLEEPING') {
          await fetch(hostUrl, {
            headers: {
              "Authorization": `Bearer ${this.env.HF_TOKEN}`
            },
            method: "GET",
            signal: AbortSignal.timeout(5000)
          })
          .catch(() => {});
        } else {
          await fetch(`https://huggingface.co/api/spaces/${this.env.HF_SPACE_ID}/restart`, {
            headers: {
              "Authorization": `Bearer ${this.env.HF_TOKEN}`
            },
            method: "POST"
          });
        }
      });
    }
    await step.sleep('wait-for-space', '2 seconds');

    let ready = false;
    for (let attempt = 0; !ready && attempt < 40; attempt++) {
      ready = await step.do(`check-attempt-${attempt}`, async () => {
        try {
          const ping = await fetch(`${hostUrl}/ping`, {
            headers: {
              "Authorization": `Bearer ${this.env.HF_TOKEN}`
            },
            method: "GET",
            signal: AbortSignal.timeout(3000)
          });
          if (!ping.ok) return false;

          const data = await ping.json();

          return data.source === "express" && data.ready === true;
        } catch {
          return false;
        }
      });
      if (!ready) {
        await step.sleep('wait before retry', '5 seconds');
      }
    }
    if (!ready) throw new Error("Space took too long to respond");

    await step.do('final-dispatch', async () => {
      const response = await fetch(`${hostUrl}/direct-dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", 
          "x-engine-key": this.env.ENGINE_API_KEY,
          "Authorization": `Bearer ${this.env.HF_TOKEN}`
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Dispatch failed with status: ' + response.status);
      }
    });
  }
}
