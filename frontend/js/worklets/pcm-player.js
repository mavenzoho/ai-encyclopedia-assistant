/**
 * AudioWorklet Processor for playing back 16-bit PCM audio at 24kHz.
 *
 * Receives Int16 PCM samples from the voice WebSocket and plays them
 * through the audio output. The AudioContext should be created with
 * sampleRate: 24000 to match the Gemini Live API output format.
 */
class PCMPlayerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = new Float32Array(0);

        this.port.onmessage = (event) => {
            if (event.data.command === 'clear') {
                // Clear buffer on interruption
                this.buffer = new Float32Array(0);
                return;
            }

            const int16Samples = event.data.samples;
            if (!int16Samples || int16Samples.length === 0) return;

            // Convert Int16 to Float32
            const float32 = new Float32Array(int16Samples.length);
            for (let i = 0; i < int16Samples.length; i++) {
                float32[i] = int16Samples[i] / 32768;
            }

            // Append to buffer
            const newBuffer = new Float32Array(this.buffer.length + float32.length);
            newBuffer.set(this.buffer);
            newBuffer.set(float32, this.buffer.length);
            this.buffer = newBuffer;
        };
    }

    process(inputs, outputs) {
        const output = outputs[0];
        if (!output || !output[0]) return true;

        const channel = output[0];

        if (this.buffer.length >= channel.length) {
            // Copy from buffer to output
            channel.set(this.buffer.subarray(0, channel.length));
            // Remove consumed samples
            this.buffer = this.buffer.subarray(channel.length);
        } else if (this.buffer.length > 0) {
            // Partial buffer - play what we have, silence the rest
            channel.set(this.buffer);
            for (let i = this.buffer.length; i < channel.length; i++) {
                channel[i] = 0;
            }
            this.buffer = new Float32Array(0);
        } else {
            // No data - output silence
            channel.fill(0);
        }

        return true;
    }
}

registerProcessor('pcm-player', PCMPlayerProcessor);
