/**
 * AudioWorklet Processor for recording microphone audio as 16-bit PCM at 16kHz.
 *
 * The browser's AudioContext runs at the device sample rate (typically 44.1kHz or 48kHz).
 * This worklet downsamples to 16kHz and converts Float32 samples to Int16 PCM,
 * which is the format required by the Gemini Live API.
 */
class PCMRecorderProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.buffer = [];
        this.targetSampleRate = 16000;
        // sampleRate is a global in AudioWorkletGlobalScope
        this.sourceSampleRate = sampleRate;
        this.ratio = this.sourceSampleRate / this.targetSampleRate;
        this.sampleIndex = 0;
        // Send chunks every ~100ms worth of 16kHz audio = 1600 samples = 3200 bytes
        this.chunkSize = 1600;
    }

    process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) return true;

        const channelData = input[0]; // mono

        // Downsample from source rate to 16kHz
        for (let i = 0; i < channelData.length; i++) {
            this.sampleIndex += 1;
            if (this.sampleIndex >= this.ratio) {
                this.sampleIndex -= this.ratio;
                // Clamp and convert float32 [-1, 1] to int16 [-32768, 32767]
                const s = Math.max(-1, Math.min(1, channelData[i]));
                const int16 = s < 0 ? s * 32768 : s * 32767;
                this.buffer.push(int16);
            }
        }

        // Send chunk when we have enough samples
        if (this.buffer.length >= this.chunkSize) {
            const samples = this.buffer.splice(0, this.chunkSize);
            const pcmData = new Int16Array(samples);
            this.port.postMessage(pcmData.buffer, [pcmData.buffer]);
        }

        return true;
    }
}

registerProcessor('pcm-recorder', PCMRecorderProcessor);
