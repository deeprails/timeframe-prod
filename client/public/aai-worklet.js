// public/aai-worklet.js
// Low-latency mono, 48k->16k resampler + 20ms packetizer

class AAIProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.inputRate = sampleRate;                // actual device sample rate (often 48000)
        this.targetRate = (options?.processorOptions?.targetSampleRate) || 16000;
        this.ratio = this.inputRate / this.targetRate;

        // ring buffer of 16kHz mono float samples
        this.outBuffer = [];
        this.phase = 0; // fractional read position for resampling
    }

    // Average N channels -> mono
    toMonoFrame(inputs) {
        if (!inputs || inputs.length === 0 || inputs[0].length === 0) return null;
        const channels = inputs[0];
        const len = channels[0].length;
        if (channels.length === 1) return channels[0]; // already mono

        const mono = new Float32Array(len);
        for (let i = 0; i < len; i++) {
            let sum = 0;
            for (let c = 0; c < channels.length; c++) sum += channels[c][i];
            mono[i] = sum / channels.length;
        }
        return mono;
    }

    // Linear resample from inputRate -> targetRate, preserving fractional phase
    resampleBlock(mono) {
        if (!mono || mono.length === 0) return [];

        const out = [];
        let pos = this.phase;                // fractional index in current mono block
        const step = this.ratio;             // how many input samples per 1 output sample

        while (pos + 1 < mono.length) {
            const i0 = Math.floor(pos);
            const i1 = i0 + 1;
            const t = pos - i0;
            const v = mono[i0] * (1 - t) + mono[i1] * t;
            out.push(v);
            pos += step;
        }

        // carry-over fractional position into the *next* block
        this.phase = pos - mono.length;
        return out;
    }

    // postFramesIfReady() {
    //     // 20 ms @ 16 kHz = 320 samples
    //     const FRAME = 320;
    //     while (this.outBuffer.length >= FRAME) {
    //         const frame = this.outBuffer.slice(0, FRAME);
    //         this.outBuffer = this.outBuffer.slice(FRAME);
    //         // Send Float32; main thread will convert to Int16 and push to AAI
    //         this.port.postMessage({ type: 'audio', samples: new Float32Array(frame) }, [new Float32Array(frame).buffer]);
    //     }
    // }

    // 20 ms -> 50 ms
    postFramesIfReady() {
        const FRAME = Math.round(this.targetRate * 0.05); // 50ms @ 16k => 800
        while (this.outBuffer.length >= FRAME) {
            const f32 = new Float32Array(this.outBuffer.slice(0, FRAME));
            this.outBuffer = this.outBuffer.slice(FRAME);
            this.port.postMessage({ type: 'audio', samples: f32 }, [f32.buffer]); // transferable
        }
    }


    process(inputs, outputs) {
        // Keep output silent
        if (!inputs || inputs.length === 0) return true;

        const mono = this.toMonoFrame(inputs);
        if (!mono) return true;

        const resampled = this.resampleBlock(mono);
        if (resampled.length) {
            // accumulate 16 kHz samples
            this.outBuffer.push(...resampled);
            this.postFramesIfReady();
        }

        // keep processor alive
        return true;
    }
}

registerProcessor('aai-worklet', AAIProcessor);
