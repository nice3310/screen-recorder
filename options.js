document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('optionsForm');
  
  chrome.storage.sync.get(['resolution', 'audio', 'formats', 'startShortcut', 'stopShortcut'], (data) => {
    document.getElementById('resolution').value = data.resolution || '1080p';
    document.getElementById('audio').checked = data.audio || false;
    
    if (data.formats) {
      data.formats.forEach(format => {
        document.querySelector(`input[name="formats"][value="${format}"]`).checked = true;
      });
    }
    
    document.getElementById('startShortcut').value = data.startShortcut || 'Ctrl+Shift+S';
    document.getElementById('stopShortcut').value = data.stopShortcut || 'Ctrl+Shift+E';
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const resolution = document.getElementById('resolution').value;
    const audio = document.getElementById('audio').checked;
    const formats = Array.from(document.querySelectorAll('input[name="formats"]:checked')).map(el => el.value);
    const startShortcut = document.getElementById('startShortcut').value;
    const stopShortcut = document.getElementById('stopShortcut').value;
    
    chrome.storage.sync.set({ resolution, audio, formats, startShortcut, stopShortcut }, () => {
      chrome.runtime.sendMessage({ type: 'optionsUpdated' });
      window.close();
    });
  });
});
