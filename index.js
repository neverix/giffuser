// index.js
const imageUpload = document.getElementById('imageUpload');
const gifLength = document.getElementById('gifLength');
const eta = document.getElementById('eta');
const generateBtn = document.getElementById('generateBtn');
const result = document.getElementById('result');
const progressBarContainer = document.getElementById('progressBarContainer');
const progressBar = document.getElementById('progressBar');
const progressMessage = document.getElementById('progressMessage');
const overlay = document.getElementById('overlay');
const downloadBtn = document.getElementById('downloadBtn');
let shouldBeDisabled = true;
let loaded = false;

function setMessage(text) {
  progressMessage.textContent = text;
}
function setProgress(progress) {
  const prog = Math.round(progress * 100);
  progressBar.style.width = `${prog}%`;
  progressBar.textContent = `${prog}%`;
}

const expansionFactor = 8;
const encUrl = "https://cdn.glitch.global/c46096bd-2ff8-49e5-984a-c5a008800622/taesd_encoder.onnx?v=1721555115983";
const decUrl = "https://cdn.glitch.global/c46096bd-2ff8-49e5-984a-c5a008800622/taesd_decoder.onnx?v=1721555116768";
ort.env.wasm.numThreads = 4;
ort.env.wasm.proxy = true;
async function loadModel(url) {
    const model = await ort.InferenceSession.create(url, {executionProviders: ['wasm'], graphOptimizationLevel:'all'});
    return model
}
async function loadModels(){
  const model1 = await loadModel(encUrl);
  const model2 = await loadModel(decUrl);
  return [model1, model2];
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

        const file = imageUpload.files[0];
        if (!file) {
            alert('Please upload an image first.');
            return;
        }

        // Show progress bar and overlay
        progressBarContainer.style.display = 'block';
        setProgress(0);
        overlay.style.display = 'flex';

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
                      const frame = frames[i];
                      const roundH = Math.ceil(canvas.height / expansionFactor);
                      const roundW = Math.ceil(canvas.width / expansionFactor);
                    console.log(i, frame);
                      const tensor = new ort.Tensor('float32', frame, [1, 4, roundH, roundW]); // Adjust shape as needed
                      const feeds = { latent_sample: tensor };
                      const results = await decoderModel.run(feeds);
                      const buffer = results.sample.data;
                      const rgbPixels = new Uint8ClampedArray(Math.floor(buffer.length / 3) * 4);
                      for (let i = 0; i < frame.length; i++) {
                          rgbPixels[Math.floor(i / 3) * 4 + i % 3] = Math.round((frame[i] + 1) * 127.5);
                      }
                      const displayPixels = new Uint8ClampedArray(pixels.length);
                      for (let h = 0; h < canvas.height; h++) {
                        for(let w = 0; w < canvas.width; w++) {
                          displayPixels[h * canvas.width + w] = displayPixels[h * (roundW * expansionFactor) + w];
                        }
                      }
                      const frameData = new ImageData(displayPixels, canvas.height, canvas.width);
                      decoded.push(frameData);
                      setProgress((i + 1) / (frames.length + 1));
                  }
                  setProgress(1);
                  return decoded;
              }

              // Convert image to [-1, 1] range
              const normalizedPixels = new Float32Array(Math.floor(pixels.length) / 4 * 3);
              for (let i = 0; i < pixels.length; i++) {
                  normalizedPixels[i] = pixels[Math.floor(i / 3) * 4 + i % 3] / 127.5 - 1;
              }
  
              const tensor = new ort.Tensor('float32', normalizedPixels, [1, 3, canvas.height, canvas.width]); // Adjust shape as needed
              const feeds = { sample: tensor };
              setMessage("Encoding with VAE...");
              encoderModel.run(feeds).then(results => {
                  setProgress(100);
                  const latentRepresentation = results.latent_sample.data;

                  const frameCount = parseInt(gifLength.value);
                  const etaValue = parseFloat(eta.value);

                  setMessage("Running diffusion...");
                  setProgress(0);

                  // Create a new Web Worker
                  const worker = new Worker('worker.js');

                  worker.onmessage = function(e) {
                      if (e.data.type === 'progress') {
                          setProgress(e.data.progress);
                      } else if (e.data.type === 'result') {
                          const frames = e.data.frames;

                          setMessage("Decoding...");
                          decodeImages(frames).then(frames => {
                            console.log(frames);

                            const gif = new GIF({
                                workers: 2,
                                quality: 10,
                                width: canvas.width,
                                height: canvas.height,
                                workerScript: URL.createObjectURL(workerBlob),
                            });

                            frames.forEach(frameData => {
                                // Convert back to [0, 255] range for display
                                const frameCanvas = document.createElement('canvas');
                                frameCanvas.width = canvas.width;
                                frameCanvas.height = canvas.height;
                                frameCanvas.getContext('2d').putImageData(frameData, 0, 0);

                                gif.addFrame(frameCanvas, {delay: 100});
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
                            });

                            gif.render();
                            
                          })
                      }
                  };

                  console.log(latentRepresentation, latentRepresentation.length);
                  // Send data to the worker
                  worker.postMessage({
                      normalizedPixels: latentRepresentation,
                      frameCount,
                      etaValue
                  });
              })
          };
          img.src = e.target.result;
      };
      reader.readAsDataURL(file);
  }

  generateBtn.addEventListener('click', generateGIF);
});
