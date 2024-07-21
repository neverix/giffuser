// worker.js
self.onmessage = function(e) {
    const { normalizedPixels, frameCount, etaValue } = e.data;
    const frames = generateFrames(normalizedPixels, frameCount, etaValue);
    self.postMessage({ type: 'result', frames: frames });
};

function generateFrames(normalizedPixels, frameCount, etaValue) {
    const frames = [];
    let prevSample = generateNoise(normalizedPixels.length);

    for (let t = frameCount - 1; t > 0; t--) {
        const alphaProdT = t / (frameCount - 1);
        const alphaProdTPrev = (t - 1) / (frameCount - 1);
        const betaProdT = 1 - alphaProdT;
        const variance = getVariance(t, t - 1, frameCount);
        const stdDevT = etaValue * Math.sqrt(variance);

        const predOriginalSample = normalizedPixels;
        const predEpsilon = prevSample.map((value, index) => 
            (value - Math.sqrt(alphaProdT) * predOriginalSample[index]) / Math.sqrt(betaProdT)
        );

        const predSampleDirection = predEpsilon.map(value => 
            Math.sqrt(1 - alphaProdTPrev - stdDevT ** 2) * value
        );

        let currentSample = predOriginalSample.map((value, index) => 
            Math.sqrt(alphaProdTPrev) * value + predSampleDirection[index]
        );

        if (etaValue > 0) {
            const varianceNoise = generateNoise(normalizedPixels.length);
            currentSample = currentSample.map((value, index) => 
                value + stdDevT * varianceNoise[index]
            );
        }

      
        // frames.push(currentSample);
        prevSample = currentSample;

        // Report progress
        self.postMessage({ type: 'progress', progress: (frameCount - t) / frameCount });
    }

    return frames;
}

function generateNoise(size) {
    return new Float32Array(size).map(() => (Math.random() * 2) - 1);
}

function getVariance(timestep, prevTimestep, totalSteps) {
    const alphaProdT = 1 - (timestep / (totalSteps - 1));
    const alphaProdTPrev = 1 - (prevTimestep / (totalSteps - 1));
    
    const betaProdT = 1 - alphaProdT;
    const betaProdTPrev = 1 - alphaProdTPrev;

    return (betaProdTPrev / betaProdT) * (1 - alphaProdT / alphaProdTPrev);
}
