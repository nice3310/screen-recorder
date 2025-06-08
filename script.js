const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const optionsBtn = document.getElementById('optionsBtn');

let mediaRecorder;
let recordedChunks = [];
let stream;
let resolution;
let recordAudio;
let formats;
let startShortcut;
let stopShortcut;

async function loadOptions() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['resolution', 'audio', 'formats', 'startShortcut', 'stopShortcut'], (data) => {
      resolution = data.resolution || '1080p';
      recordAudio = data.audio || false;
      formats = data.formats || ['mp4'];
      startShortcut = data.startShortcut || 'Ctrl+Shift+S';
      stopShortcut = data.stopShortcut || 'Ctrl+Shift+E';
      resolve();
    });
  });
}

function updateEventListeners() {
  window.removeEventListener('keydown', handleKeydown);
  window.addEventListener('keydown', handleKeydown);
}

function handleKeydown(e) {
  const keyCombination = `${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.key.toUpperCase()}`;
  if (keyCombination === startShortcut.toUpperCase()) {
    startRecording();
  }
  if (keyCombination === stopShortcut.toUpperCase()) {
    stopRecording();
  }
}

async function resetState() {
  if (mediaRecorder) {
    mediaRecorder.stop();
  }
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  recordedChunks = [];
  mediaRecorder = null;
  stream = null;
  startBtn.disabled = false;
  stopBtn.disabled = true;
  await loadOptions();  // 保留选项状态
  updateEventListeners();
}

loadOptions().then(() => {
  updateEventListeners();
  resetState();
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'optionsUpdated') {
    loadOptions().then(() => {
      updateEventListeners();
    });
  }
});

function showCountdown(callback) {
  const countdownContainer = document.createElement('div');
  countdownContainer.id = 'countdownContainer';
  countdownContainer.style.position = 'fixed';
  countdownContainer.style.top = '50%';
  countdownContainer.style.left = '50%';
  countdownContainer.style.transform = 'translate(-50%, -50%)';
  countdownContainer.style.fontSize = '72px';
  countdownContainer.style.background = 'rgba(0, 0, 0, 0.7)';
  countdownContainer.style.color = '#fff';
  countdownContainer.style.width = '150px';
  countdownContainer.style.height = '150px';
  countdownContainer.style.borderRadius = '50%';
  countdownContainer.style.zIndex = '10000';
  countdownContainer.style.textAlign = 'center';
  countdownContainer.style.lineHeight = '150px';
  countdownContainer.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
  countdownContainer.style.animation = 'zoomInOut 1s infinite';
  document.body.appendChild(countdownContainer);

  let countdown = 3;
  countdownContainer.textContent = countdown;

  const countdownInterval = setInterval(() => {
    countdown -= 1;
    if (countdown === 0) {
      clearInterval(countdownInterval);
      countdownContainer.style.animation = 'fade-out 0.5s';
      setTimeout(() => {
        document.body.removeChild(countdownContainer);
        callback();
      }, 500);
    } else {
      countdownContainer.textContent = countdown;
    }
  }, 1000);

  // 添加CSS样式
  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes fade-out {
      from { opacity: 1; }
      to { opacity: 0; }
    }
    @keyframes zoomInOut {
      0%, 100% {
        transform: translate(-50%, -50%) scale(1);
      }
      50% {
        transform: translate(-50%, -50%) scale(1.5);
      }
    }
  `;
  document.head.appendChild(style);
}

const { createFFmpeg, fetchFile } = FFmpeg;

const ffmpeg = createFFmpeg({
  corePath: chrome.runtime.getURL("lib/ffmpeg-core.js"),
  log: true,
  mainName: 'main'
});

async function runFFmpeg(inputFileName, outputFileName, commandStr, file) {
  if (ffmpeg.isLoaded()) {
    await ffmpeg.exit();
  }

  await ffmpeg.load();

  const commandList = commandStr.split(' ');
  if (commandList.shift() !== 'ffmpeg') {
    return;
  }

  ffmpeg.FS('writeFile', inputFileName, await fetchFile(file));
  await ffmpeg.run(...commandList);
  const data = ffmpeg.FS('readFile', outputFileName);
  const blob = new Blob([data.buffer]);
  downloadFile(blob, outputFileName);
}

function downloadFile(blob, fileName) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

optionsBtn.addEventListener('click', () => {
  chrome.windows.create({
    url: 'options.html',
    type: 'popup',
    width: 400,
    height: 600
  });
});

async function startRecording() {
  try {
    await resetState();
    const currentWindow = await new Promise((resolve) => {
      chrome.windows.getCurrent(resolve);
    });

    await chrome.windows.update(currentWindow.id, { width: 800, height: 660 });

    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { mediaSource: 'screen', width: resolution === '1080p' ? 1920 : resolution === '720p' ? 1280 : 640 },
        audio: recordAudio
      });

      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = function (event) {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async function () {
        const webmBlob = new Blob(recordedChunks, { type: 'video/webm' });
        const webmUrl = URL.createObjectURL(webmBlob);
        downloadVideo(webmUrl, webmBlob);

        // 停止屏幕共享
        stream.getTracks().forEach(track => track.stop());
      };

      await chrome.windows.update(currentWindow.id, { width: 300, height: 200 });
      // 显示倒数动画并在动画结束后开始录制
      showCountdown(() => {
        // 开始录制后將窗口調整回較小尺寸
        mediaRecorder.start();
        startBtn.disabled = true;
        stopBtn.disabled = false;
      });
    } catch (error) {
      console.error('Error accessing display media.', error);
      await resetState();
      await chrome.windows.update(currentWindow.id, { width: 300, height: 200 });
    }
  } catch (error) {
    console.error('Error accessing display media.', error);
    await resetState();
  }
}

function stopRecording() {
  if (mediaRecorder) {
    mediaRecorder.stop();
  }
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

async function downloadVideo(url, webmBlob) {
  // 下载 WebM 文件
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = 'screen_recording.webm';
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);

  // 转换为多种格式
  const commands = {
    mp4: `ffmpeg -i screen_recording.webm -c:v copy -c:a aac screen_recording.mp4`,
    avi: `ffmpeg -i screen_recording.webm -c:v copy -c:a aac screen_recording.avi`,
    mkv: `ffmpeg -i screen_recording.webm -c:v copy -c:a aac screen_recording.mkv`,
    mov: `ffmpeg -i screen_recording.webm -c:v copy -c:a aac screen_recording.mov`
  };

  for (const format of formats) {
    const commandStr = commands[format];
    const outputFileName = `screen_recording.${format}`;
    await runFFmpeg('screen_recording.webm', outputFileName, commandStr, webmBlob);
  }
}
