const imageUpload = document.getElementById('imageUpload');
const gifLength = document.getElementById('gifLength');
const eta = document.getElementById('eta');
const generateBtn = document.getElementById('generateBtn');
const result = document.getElementById('result');
const progressBarContainer = document.getElementById('progressBarContainer');
const progressBar = document.getElementById('progressBar');
const overlay = document.getElementById('overlay');
const downloadBtn = document.getElementById('downloadBtn');
let shouldBeDisabled = true;

let gifLoading = fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js')
  .then((response) => {
    if (!response.ok)
      throw new Error("Network response was not OK");
    return response.blob();
  }).then((workerBlob) => {
    imageUpload.addEventListener('change', () => {
        if (imageUpload.files.length > 0) {
            shouldBeDisabled = false;
        } else {
            shouldBeDisabled = true;
        }
        generateBtn.disabled = shouldBeDisabled;
    });

    function generateGIF() {

        generateBtn.disabled = true;

        const file = imageUpload.files[0];
        if (!file) {
            alert('Please upload an image first.');
            return;
        }

        // Show progress bar and overlay
        progressBarContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
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

              // Convert image to [-1, 1] range
              const normalizedPixels = new Float32Array(pixels.length);
              for (let i = 0; i < pixels.length; i++) {
                  normalizedPixels[i] = pixels[i] / 127.5 - 1;
              }

              const frameCount = parseInt(gifLength.value);
              const etaValue = parseFloat(eta.value);

              // Create a new Web Worker
              const worker = new Worker('worker.js');

              worker.onmessage = function(e) {
                  if (e.data.type === 'progress') {
                      const progress = Math.round(e.data.progress * 100);
                      progressBar.style.width = `${progress}%`;
                      progressBar.textContent = `${progress}%`;
                  } else if (e.data.type === 'result') {
                      const frames = e.data.frames;
                      const gif = new GIF({
                          workers: 2,
                          quality: 10,
                          width: canvas.width,
                          height: canvas.height,
                          workerScript: URL.createObjectURL(workerBlob),
                      });

                      frames.forEach(frame => {
                          // Convert back to [0, 255] range for display
                          const displayPixels = new Uint8ClampedArray(frame.length);
                          for (let i = 0; i < frame.length; i++) {
                              displayPixels[i] = Math.round((frame[i] + 1) * 127.5);
                          }
                          const frameData = new ImageData(displayPixels, canvas.width, canvas.height);

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
                  }
              };

              // Send data to the worker
              worker.postMessage({
                  normalizedPixels,
                  frameCount,
                  etaValue
              });
          };
          img.src = e.target.result;
      };
      reader.readAsDataURL(file);
  }

  generateBtn.addEventListener('click', generateGIF);
});
