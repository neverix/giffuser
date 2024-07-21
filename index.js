// index.js
const imageUpload = document.getElementById('imageUpload');
const gifLength = document.getElementById('gifLength');
const fps = document.getElementById('fps');
const eta = document.getElementById('eta');
const generateBtn = document.getElementById('generateBtn');
const result = document.getElementById('result');
const progressBarContainer = document.getElementById('progressBarContainer');
const progressBar = document.getElementById('progressBar');
const progressMessage = document.getElementById('progressMessage');
const overlay = document.getElementById('overlay');
const downloadBtn = document.getElementById('downloadBtn');
const imageContainer = document.getElementById('imageContainer');
let shouldBeDisabled = true;
let loaded = false;
let worker = null;
let isCancelled = true;

// Add cancel button
const cancelBtn = document.createElement('button');
cancelBtn.id = 'cancelBtn';
cancelBtn.className = 'btn btn-danger ms-2';
cancelBtn.textContent = 'Cancel';
cancelBtn.style.display = 'none';
generateBtn.parentNode.insertBefore(cancelBtn, generateBtn.nextSibling);

// Add checkbox for using VAE
const useVAECheckbox = document.createElement('input');
useVAECheckbox.type = 'checkbox';
useVAECheckbox.id = 'useVAE';
useVAECheckbox.checked = false;
const useVAELabel = document.createElement('label');
useVAELabel.htmlFor = 'useVAE';
useVAELabel.textContent = 'Use VAE (slower but more interesting output)';
useVAELabel.className = 'form-check-label ms-2';
const useVAEContainer = document.createElement('div');
useVAEContainer.className = 'form-check mb-3';
useVAEContainer.appendChild(useVAECheckbox);
useVAEContainer.appendChild(useVAELabel);
generateBtn.parentNode.insertBefore(useVAEContainer, generateBtn);

function setMessage(text) {
  progressMessage.textContent = text;
}
function setProgress(progress) {
  const prog = Math.round(progress * 100);
  progressBar.style.width = `${prog}%`;
  progressBar.textContent = `${prog}%`;
}

const expansionFactor = 8;
const scalingFactor = 0.18125;
const latentShift = 0.5;
const latentMagnitude = 3;
const encUrl = "https://cdn.glitch.global/c46096bd-2ff8-49e5-984a-c5a008800622/taesd_encoder.onnx?v=1721555115983";
const decUrl = "https://cdn.glitch.global/c46096bd-2ff8-49e5-984a-c5a008800622/taesd_decoder.onnx?v=1721555116768";
ort.env.wasm.numThreads = 4;
ort.env.wasm.proxy = true;
async function loadModel(url) {
    const model = await ort.InferenceSession.create(url, {executionProviders: ['wasm'], graphOptimizationLevel:'all'});
    return model
}
let cache = null;
async function loadModels() {
    const useVAE = useVAECheckbox.checked;
    if (useVAE) {
        if(!!cache) return cache;
        const model1 = await loadModel(encUrl);
        const model2 = await loadModel(decUrl);
        cache = [model1, model2];
        return [model1, model2];
    } else {
        return [null, null];
    }
}
imageUpload.addEventListener('change', () => {
    if (imageUpload.files.length > 0) {
        shouldBeDisabled = false;
    } else {
        shouldBeDisabled = true;
    }
    generateBtn.disabled = shouldBeDisabled & loaded;
});

let gifLoading = Promise.all([fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js')
  .then((response) => {
    if (!response.ok)
      throw new Error("Network response was not OK");
    return response.blob();
  }), loadModels()]).then(([workerBlob, [encoderModel, decoderModel]]) => {
    loaded = true;
    generateBtn.disabled = shouldBeDisabled;
    console.log("init")

    function generateGIF() {
        generateBtn.disabled = true;
        cancelBtn.style.display = 'inline-block';

        const file = imageUpload.files[0];
        if (!file) {
            alert('Please upload an image first.');
            return;
        }

        // Show progress bar and overlay
        progressBarContainer.style.display = 'block';
        setProgress(0);
        overlay.style.display = 'flex';

        const framesPerSecond = parseInt(fps.value);
        const frameCount = parseInt(gifLength.value);
        const etaValue = parseFloat(eta.value);
        const useVAE = useVAECheckbox.checked;

      
        const reader = new FileReader();
        reader.onload = function(e) {
          const img = new Image();
          img.onload = function() {
  
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0);

              const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const pixels = imageData.data;
            
  
              async function decodeImages(frames) {
                  decoded = []
                  setProgress(0);
                  for(let i = 0; i < frames.length; i++) {
                      if(isCancelled) return [];
                      const frame = frames[i];
                      let frameData;
                      if (useVAE) {
                          const roundH = Math.ceil(canvas.height / expansionFactor);
                          const roundW = Math.ceil(canvas.width / expansionFactor);
                          if(isCancelled) return [];
                          const tensor = new ort.Tensor('float32', frame.map(x => ((x + 1) / 2 - latentShift) * (2 * latentMagnitude)), [1, 4, roundH, roundW]);
                          const feeds = { latent_sample: tensor };
                          const results = await decoderModel.run(feeds);
                          if(isCancelled) return [];
                          const buffer = results.sample.data;
                          const segmentSize = Math.floor(buffer.length / 3);
                          const rgbaPixels = new Uint8ClampedArray(segmentSize * 4).fill(255);
                          for (let i = 0; i < buffer.length; i++) {
                              rgbaPixels[(i % segmentSize) * 4 + Math.floor(i / segmentSize)] = Math.round((buffer[i] + 1) * 127.5);
                          }
                          const displayPixels = new Uint8ClampedArray(pixels.length);
                          for (let h = 0; h < canvas.height; h++) {
                            for(let w = 0; w < canvas.width; w++) {
                              for(let c = 0; c < 4; c++) {
                                displayPixels[(h * canvas.width + w) * 4 + c] = rgbaPixels[(h * (roundW * expansionFactor) + w) * 4 + c];
                              }
                            }
                          }
                          frameData = new ImageData(displayPixels, canvas.width, canvas.height);
                      } else {
                          const segmentSize = Math.floor(frame.length / 3);
                          const rgbaPixels = new Uint8ClampedArray(segmentSize * 4);
                          for (let i = 0; i < segmentSize; i++) {
                              rgbaPixels[i * 4] = Math.round((frame[i] + 1) * 127.5);
                              rgbaPixels[i * 4 + 1] = Math.round((frame[i + segmentSize] + 1) * 127.5);
                              rgbaPixels[i * 4 + 2] = Math.round((frame[i + 2 * segmentSize] + 1) * 127.5);
                              rgbaPixels[i * 4 + 3] = 255;
                          }
                          frameData = new ImageData(rgbaPixels, canvas.width, canvas.height);
                      }
                      decoded.push(frameData);
                      setProgress((i + 1) / frames.length);

                      // Show intermediate decoded pictures
                      const intermediateCanvas = document.createElement('canvas');
                      intermediateCanvas.width = canvas.width;
                      intermediateCanvas.height = canvas.height;
                      intermediateCanvas.getContext('2d').putImageData(frameData, 0, 0);

                      // Remove only canvas elements
                      Array.from(imageContainer.getElementsByTagName('canvas')).forEach(canvas => canvas.remove());

                      imageContainer.appendChild(intermediateCanvas);
                  }

                  // Remove only canvas elements
                  Array.from(imageContainer.getElementsByTagName('canvas')).forEach(canvas => canvas.remove());
                  return decoded;
              }

              // Convert image to [-1, 1] range
              const segmentSize = Math.floor(pixels.length / 4);
              const normalizedPixels = new Float32Array(segmentSize * 3);
              for (let i = 0; i < pixels.length; i++) {
                  if(i % 4 == 3) continue;
                  normalizedPixels[(i % 4) * segmentSize + Math.floor(i / 4)] = pixels[i] / 255.;
              }
  
              isCancelled = false;
              if (useVAE) {
                  const tensor = new ort.Tensor('float32', normalizedPixels, [1, 3, canvas.height, canvas.width]);
                  const feeds = { sample: tensor };
                  setMessage("Encoding with VAE...");
                  encoderModel.run(feeds).then(results => {
                      setProgress(1);
                      const latentRepresentation = results.latent_sample.data.map(x => ((x / (2 * latentMagnitude)) + latentShift) * 2 - 1);
                      runDiffusion(latentRepresentation);
                  });
              } else {
                  runDiffusion(normalizedPixels.map(x => x * 2 - 1));
              }
            
              if(isCancelled) return;

              function runDiffusion(inputPixels) {
                  setMessage("Running diffusion...");
                  setProgress(0);

                  // Create a new Web Worker
                  worker = new Worker('worker.js');

                  worker.onmessage = function(e) {
                      if (e.data.type === 'progress') {
                          setProgress(e.data.progress);
                      } else if (e.data.type === 'result') {
                          const frames = e.data.frames;

                          setMessage("Decoding...");
                          if(isCancelled) return;
                          decodeImages(frames).then(frames => {
                            if(isCancelled) return;
                            const gif = new GIF({
                                workers: 2,
                                quality: 10,
                                width: canvas.width,
                                height: canvas.height,
                                workerScript: URL.createObjectURL(workerBlob),
                            });

                            frames.forEach(frameData => {
                                const frameCanvas = document.createElement('canvas');
                                frameCanvas.width = canvas.width;
                                frameCanvas.height = canvas.height;
                                frameCanvas.getContext('2d').putImageData(frameData, 0, 0);

                                gif.addFrame(frameCanvas, {delay: 1000 / framesPerSecond});
                            });

                            gif.on('finished', function(blob) {
                                const gifUrl = URL.createObjectURL(blob);
                                result.innerHTML = `<img src="${gifUrl}" alt="Generated GIF">`;
                                downloadBtn.href = gifUrl;
                                downloadBtn.style.display = "inline";
                                const fileNameWithoutExtension = file.name.substring(0, file.name.lastIndexOf('.'));
                                downloadBtn.setAttribute('download', `diffused-${fileNameWithoutExtension}-${frameCount}-steps-eta${etaValue}.gif`);
                                // Hide progress bar and overlay
                                progressBarContainer.style.display = 'none';
                                overlay.style.display = 'none';
                                generateBtn.disabled = shouldBeDisabled;
                                cancelBtn.style.display = 'none';
                            });

                            gif.render();
                          });
                      }
                  };
                  // Send data to the worker
                  worker.postMessage({
                      normalizedPixels: inputPixels,
                      frameCount,
                      etaValue,
                      useVAE
                  });
              }
          };
          img.src = e.target.result;
      };
      reader.readAsDataURL(file);
  }

  generateBtn.addEventListener('click', generateGIF);

  // Cancel button functionality
  cancelBtn.addEventListener('click', () => {
      if (worker) {
          worker.terminate();
          worker = null;
      }
      generateBtn.disabled = shouldBeDisabled;
      cancelBtn.style.display = 'none';
      progressBarContainer.style.display = 'none';
      overlay.style.display = 'none';
      result.innerHTML = '';
      downloadBtn.style.display = 'none';
      imageContainer.innerHTML = '';
      isCancelled = true;
  });
});