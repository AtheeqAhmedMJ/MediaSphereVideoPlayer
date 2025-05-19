// Enhanced renderer.js with custom player controls
// Completely replaces native HTML5 controls with custom UI

// DOM elements
const openFileBtn = document.getElementById('openFileBtn');
const fileInput = document.getElementById('fileInput');
const videoPlayer = document.getElementById('videoPlayer');
const playlistElement = document.getElementById('playlist');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const playPauseBtn = document.getElementById('playPauseBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const volumeSlider = document.getElementById('volumeSlider');
const muteBtn = document.getElementById('muteBtn');
const volumeIcon = document.getElementById('volumeIcon');
const muteIcon = document.getElementById('muteIcon');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const progressBar = document.getElementById('progressBar');
const currentTimeElement = document.getElementById('currentTime');
const durationElement = document.getElementById('duration');
const loadingIndicator = document.getElementById('loadingIndicator');
const searchInput = document.getElementById('searchPlaylist');
const createPlaylistBtn = document.getElementById('createPlaylistBtn');
const sidebarPlaylists = document.getElementById('sidebarPlaylists');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const audioTrackSelect = document.getElementById('audioTrackSelect');
const subtitleTrackSelect = document.getElementById('subtitleTrackSelect');
const playbackRateSlider = document.getElementById('playbackRate');

// Check if any required elements are missing and log warnings
const requiredElements = {
  videoPlayer,
  playPauseBtn,
  playIcon,
  pauseIcon,
  progressBar,
  currentTimeElement
};

for (const [name, element] of Object.entries(requiredElements)) {
  if (!element) console.warn(`Required element '${name}' is missing from the DOM`);
}

// Simple playlist map: { playlistName: [videoName1, videoName2, ...] }
const userPlaylists = {};

// Format support variables
const supportedVideoFormats = ['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', '3gp'];
const supportedSubtitleFormats = ['vtt', 'srt', 'ass', 'ssa'];

// Track management
let playlist = [];
let currentIndex = -1;
let isMuted = false;
let lastVolume = 0.8;
let playbackRate = 1.0;
let markers = [];
let subtitleTracks = [];
let currentSubtitleTrack = -1;
let audioTracks = [];
let currentAudioTrack = 0;
let isVideoLoaded = false;

// Disable native controls
if (videoPlayer) {
  videoPlayer.controls = false;
}

// Initialize event listeners
function initializeEventListeners() {
  if (openFileBtn) {
    openFileBtn.addEventListener('click', () => {
      if (window.api) {
        window.api.send('open-file-dialog');
      } else {
        // Fallback for browser testing
        if (fileInput) fileInput.click();
      }
    });
  }
  
  if (videoPlayer) {
    videoPlayer.addEventListener('loadeddata', () => {
      console.log('Video loaded data event fired');
      // Wait a bit for text tracks to load and update the UI
      setTimeout(updateTracksUI, 500);
    });
    
    videoPlayer.addEventListener('timeupdate', updateProgressBar);
    videoPlayer.addEventListener('loadedmetadata', handleVideoLoaded);
    videoPlayer.addEventListener('play', updatePlayPauseUI);
    videoPlayer.addEventListener('pause', updatePlayPauseUI);
    videoPlayer.addEventListener('ended', handleVideoEnded);
    videoPlayer.addEventListener('waiting', showLoadingIndicator);
    videoPlayer.addEventListener('canplay', hideLoadingIndicator);
    videoPlayer.addEventListener('playing', hideLoadingIndicator);
    
    // Add error handling
    videoPlayer.addEventListener('error', (e) => {
      console.error('Video error:', videoPlayer.error);
      hideLoadingIndicator();
      alert(`Error loading video: ${videoPlayer.error ? videoPlayer.error.message : 'Unknown error'}`);
    });
  }
  
  if (fileInput) {
    fileInput.addEventListener('change', (e) => handleFileSelection(Array.from(e.target.files || [])));
  }
  
  if (createPlaylistBtn) {
    createPlaylistBtn.addEventListener('click', () => {
      const name = prompt('Enter a name for the new playlist:');
      if (!name || userPlaylists[name]) return;

      userPlaylists[name] = []; // Create empty playlist

      const li = document.createElement('li');
      li.textContent = name;
      li.className = 'playlist-item';
      li.addEventListener('click', () => {
        filterPlaylistByName(name);
      });
      if (sidebarPlaylists) sidebarPlaylists.appendChild(li);
    });
  }
  
  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', togglePlayPause);
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => changeVideo(-1));
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => changeVideo(1));
  }

  if (muteBtn) {
    muteBtn.addEventListener('click', toggleMute);
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', toggleFullscreen);
  }

  if (searchInput) {
    searchInput.addEventListener('input', filterPlaylist);
  }
  
  // Custom progress bar interaction
  if (progressBar) {
    progressBar.addEventListener('input', () => {
      if (videoPlayer && isVideoLoaded) {
        videoPlayer.currentTime = parseFloat(progressBar.value);
      }
    });

    progressBar.addEventListener('mousedown', () => {
      if (videoPlayer) {
        videoPlayer.pause();
      }
    });

    progressBar.addEventListener('mouseup', () => {
      if (videoPlayer && !videoPlayer.paused) {
        videoPlayer.play();
      }
    });
  }
  
  if (volumeSlider) {
    volumeSlider.addEventListener('input', () => {
      const vol = parseFloat(volumeSlider.value);
      if (videoPlayer) {
        videoPlayer.volume = vol;
        videoPlayer.muted = vol === 0;
        isMuted = videoPlayer.muted;
        updateVolumeIcon();
        lastVolume = vol;
      }
    });
  }
  
  // Settings panel
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      if (settingsPanel) {
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
      }
    });
  }
  
  // Audio and subtitle track select
  if (audioTrackSelect) {
    audioTrackSelect.addEventListener('change', (e) => {
      enableAudioTrack(parseInt(e.target.value));
    });
  }

  if (subtitleTrackSelect) {
    subtitleTrackSelect.addEventListener('change', (e) => {
      enableSubtitleTrack(parseInt(e.target.value));
    });
  }

  if (playbackRateSlider) {
    playbackRateSlider.addEventListener('input', (e) => {
      playbackRate = parseFloat(e.target.value);
      if (videoPlayer) videoPlayer.playbackRate = playbackRate;
    });
  }
  
  // Global keyboard shortcuts
  document.addEventListener('keydown', handleKeyboardShortcuts);
  
  // Initialize Electron API listener if available
  if (window.api) {
    window.api.receive('selected-files', handleSelectedFiles);
  }
}

// File handling functions
function handleFileSelection(files) {
  if (!files || files.length === 0) {
    console.warn('No files selected');
    return;
  }
  
  console.log(`Processing ${files.length} selected files`);
  
  const videos = files.filter(file => {
    const extension = file.name.split('.').pop().toLowerCase();
    return file.type.startsWith('video/') || supportedVideoFormats.includes(extension);
  });
  
  const subtitles = files.filter(file => {
    const extension = file.name.split('.').pop().toLowerCase();
    return supportedSubtitleFormats.includes(extension);
  });
  
  console.log(`Found ${videos.length} videos and ${subtitles.length} subtitle files`);
  
  videos.forEach(file => addToPlaylist(URL.createObjectURL(file), file.name));
  
  if (subtitles.length > 0) {
    handleSubtitleFiles(subtitles);
  }
  
  if (currentIndex === -1 && playlist.length > 0) {
    currentIndex = 0;
    loadVideo(playlist[currentIndex].url);
  }
}

async function handleSelectedFiles(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    console.warn('No files selected from Electron dialog');
    return;
  }
  
  console.log(`Processing ${filePaths.length} files from Electron dialog`);
  
  const videoFiles = [];
  const subtitleFiles = [];
  
  try {
    for (const file of filePaths) {
      const info = await window.api.invoke('get-file-info', file);
      if (!info) {
        console.warn(`Could not get info for file: ${file}`);
        continue;
      }
      
      const extension = info.name.split('.').pop().toLowerCase();
      
      if (supportedVideoFormats.includes(extension)) {
        videoFiles.push({ path: file, info });
      } else if (supportedSubtitleFormats.includes(extension)) {
        subtitleFiles.push({ path: file, info });
      }
    }
    
    console.log(`Found ${videoFiles.length} videos and ${subtitleFiles.length} subtitle files from Electron`);
    
    for (const video of videoFiles) {
      // Ensure proper URL format for Electron file paths
      const videoUrl = video.path.startsWith('file://') ? video.path : `file://${video.path}`;
      addToPlaylist(videoUrl, video.info.name);
    }
    
    if (subtitleFiles.length > 0) {
      handleSubtitleFiles(subtitleFiles.map(f => ({ name: f.info.name, path: f.path })));
    }
    
    if (currentIndex === -1 && playlist.length > 0) {
      currentIndex = 0;
      loadVideo(playlist[currentIndex].url);
    }
  } catch (error) {
    console.error('Error processing selected files:', error);
  }
}

function addToPlaylist(url, name) {
  console.log(`Adding to playlist: ${name}`);
  
  const item = { url, name };
  playlist.push(item);

  // Optional: ask user to assign to a playlist
  const playlistNames = Object.keys(userPlaylists);
  if (playlistNames.length > 0) {
    const selected = prompt(`Add to which playlist?\n${playlistNames.join(', ')}`);
    if (selected && userPlaylists[selected]) {
      userPlaylists[selected].push(name.toLowerCase());
    }
  }
  
  if (!playlistElement) return;
  
  const li = document.createElement('li');
  li.className = 'playlist-item';
  li.innerHTML = `
    <div class="video-icon"><i class="fas fa-film"></i></div>
    <div class="video-info">
      <div class="video-title">${name}</div>
    </div>
  `;
  li.dataset.name = name.toLowerCase();
  li.addEventListener('click', () => {
    // Update active state in UI
    document.querySelectorAll('.playlist-item').forEach(item => item.classList.remove('active'));
    li.classList.add('active');
    
    const index = playlist.findIndex(p => p.name === name);
    if (index !== -1) {
      currentIndex = index;
      loadVideo(playlist[index].url);
    }
  });
  
  playlistElement.appendChild(li);
}

// Video and playback functions
function loadVideo(url) {
  if (!videoPlayer) {
    console.error('Video player element not found');
    return;
  }
  
  console.log(`Loading video: ${url}`);
  isVideoLoaded = false;
  showLoadingIndicator();
  
  // Save current time and volume settings
  const wasPlaying = !videoPlayer.paused;
  const volume = videoPlayer.volume;
  const muted = videoPlayer.muted;
  
  // Reset track lists
  subtitleTracks = [];
  currentSubtitleTrack = -1;
  audioTracks = [];
  currentAudioTrack = 0;
  
  // Remove any existing text tracks
  if (videoPlayer.textTracks) {
    const trackElements = videoPlayer.querySelectorAll('track');
    trackElements.forEach(track => {
      videoPlayer.removeChild(track);
    });
  }
  
  // Set the new video source
  videoPlayer.src = url;
  videoPlayer.volume = volume;
  videoPlayer.muted = muted;
  videoPlayer.playbackRate = playbackRate;
  
  // Load the video
  try {
    videoPlayer.load();
    
    // Play video after loading if it was playing before
    if (wasPlaying) {
      const playPromise = videoPlayer.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('Video playback started successfully');
          })
          .catch(error => {
            console.error('Error playing video:', error);
            // Auto-play was prevented, show play button
            updatePlayPauseUI();
          });
      }
    } else {
      updatePlayPauseUI();
    }
  } catch (error) {
    console.error('Error loading video:', error);
    hideLoadingIndicator();
  }
  // Add this where you initialize your other video event listeners
if (videoPlayer) {
  // Add to your existing video player event listeners
  videoPlayer.addEventListener('loadeddata', () => {
    // This catches when media data is loaded
    setTimeout(updateTracksUI, 300); // Short delay to ensure tracks are loaded
  });
}
  
  // Update playlist UI to show active item
  document.querySelectorAll('.playlist-item').forEach((item, index) => {
    item.classList.toggle('active', index === currentIndex);
  });
  
  // Check for external subtitles
  checkForExternalSubtitles();
}

function handleVideoLoaded() {
  isVideoLoaded = true;
  
  if (progressBar && videoPlayer) {
    progressBar.min = 0;
    progressBar.max = videoPlayer.duration;
    progressBar.value = 0;
  }
  
  if (durationElement && videoPlayer) {
    durationElement.textContent = formatTime(videoPlayer.duration);
  }
  
  detectAvailableTracks();
  updateTracksUI(); // Add this line
  hideLoadingIndicator();
}

function updateProgressBar() {
  if (!videoPlayer || !progressBar || !currentTimeElement) return;
  
  const currentTime = videoPlayer.currentTime;
  const duration = videoPlayer.duration || 0;
  
  // Update progress bar position
  if (!isNaN(duration) && isFinite(duration) && duration > 0) {
    progressBar.value = currentTime;
  }
  
  // Update time display
  currentTimeElement.textContent = formatTime(currentTime);
}

function handleVideoEnded() {
  console.log('Video ended');
  // Go to next video if available
  if (currentIndex < playlist.length - 1) {
    changeVideo(1);
  } else {
    // Update UI to show play button
    updatePlayPauseUI();
  }
}

function changeVideo(step) {
  const nextIndex = currentIndex + step;
  if (nextIndex >= 0 && nextIndex < playlist.length) {
    currentIndex = nextIndex;
    loadVideo(playlist[currentIndex].url);
  }
}

function togglePlayPause() {
  if (!videoPlayer) return;
  
  console.log(`Toggle play/pause. Current state: ${videoPlayer.paused ? 'paused' : 'playing'}`);
  
  if (videoPlayer.paused) {
    const playPromise = videoPlayer.play();
    if (playPromise !== undefined) {
      playPromise.catch(error => {
        console.error('Error playing video:', error);
      });
    }
  } else {
    videoPlayer.pause();
  }
  
  updatePlayPauseUI();
}

function updatePlayPauseUI() {
  if (!playIcon || !pauseIcon || !videoPlayer) return;
  
  if (videoPlayer.paused) {
    playIcon.style.display = 'inline';
    pauseIcon.style.display = 'none';
  } else {
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'inline';
  }
}

function toggleMute() {
  if (!videoPlayer) return;
  
  isMuted = !isMuted;
  videoPlayer.muted = isMuted;
  
  if (volumeSlider) {
    volumeSlider.value = isMuted ? 0 : lastVolume;
  }
  
  updateVolumeIcon();
}

function updateVolumeIcon() {
  if (!volumeIcon || !muteIcon || !volumeSlider) return;
  
  if (parseFloat(volumeSlider.value) === 0 || isMuted) {
    volumeIcon.style.display = 'none';
    muteIcon.style.display = 'inline';
  } else {
    volumeIcon.style.display = 'inline';
    muteIcon.style.display = 'none';
  }
}

function toggleFullscreen() {
  if (!videoPlayer) return;
  
  const container = videoPlayer.closest('.player-container') || videoPlayer.parentElement;
  
  try {
    if (!document.fullscreenElement) {
      if (container.requestFullscreen) {
        container.requestFullscreen();
      } else if (container.webkitRequestFullscreen) {
        container.webkitRequestFullscreen();
      } else if (container.msRequestFullscreen) {
        container.msRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
      }
    }
  } catch (error) {
    console.error('Error toggling fullscreen:', error);
  }
}

function handleKeyboardShortcuts(e) {
  if (e.target.tagName === 'INPUT') return;
  if (!videoPlayer) return;

  switch (e.code) {
    case 'Space':
      togglePlayPause();
      e.preventDefault();
      break;
    case 'ArrowRight':
      videoPlayer.currentTime += 10;
      break;
    case 'ArrowLeft':
      videoPlayer.currentTime -= 10;
      break;
    case 'ArrowUp':
      if (volumeSlider) {
        volumeSlider.value = Math.min(parseFloat(volumeSlider.value) + 0.1, 1);
        videoPlayer.volume = parseFloat(volumeSlider.value);
        updateVolumeIcon();
      }
      break;
    case 'ArrowDown':
      if (volumeSlider) {
        volumeSlider.value = Math.max(parseFloat(volumeSlider.value) - 0.1, 0);
        videoPlayer.volume = parseFloat(volumeSlider.value);
        updateVolumeIcon();
      }
      break;
    case 'KeyM':
      toggleMute();
      break;
    case 'KeyF':
      toggleFullscreen();
      break;
  }
}

function filterPlaylistByName(playlistName) {
  if (!playlistElement) return;
  
  const videoNames = userPlaylists[playlistName] || [];
  const items = playlistElement.querySelectorAll('.playlist-item');

  items.forEach(li => {
    const title = li.querySelector('.video-title')?.textContent.toLowerCase();
    li.style.display = videoNames.includes(title?.toLowerCase()) ? '' : 'none';
  });
}

function filterPlaylist() {
  if (!searchInput || !playlistElement) return;
  
  const term = searchInput.value.toLowerCase();
  const items = playlistElement.querySelectorAll('.playlist-item');
  
  items.forEach(li => {
    li.style.display = li.dataset.name.includes(term) ? '' : 'none';
  });
}

function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
  
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function showLoadingIndicator() {
  if (loadingIndicator) {
    loadingIndicator.style.display = 'flex';
  }
}

function hideLoadingIndicator() {
  if (loadingIndicator) {
    loadingIndicator.style.display = 'none';
  }
}

// Improved subtitle handling
function handleSubtitleFiles(files) {
  if (!files || files.length === 0) {
    console.warn('No subtitle files to process');
    return;
  }
  
  console.log(`Processing ${files.length} subtitle files`);
  
  files.forEach(file => {
    let subtitleUrl;
    let fileName;
    
    if (file instanceof File) {
      subtitleUrl = URL.createObjectURL(file);
      fileName = file.name;
    } else {
      subtitleUrl = `file://${file.path}`;
      fileName = file.name;
    }
    
    console.log(`Adding subtitle track: ${fileName}`);
    addSubtitleTrack(subtitleUrl, fileName);
  });
  
  // Update subtitle dropdown after adding tracks
  updateSubtitleDropdown();
}

function addSubtitleTrack(url, label) {
  // Add to internal tracking
  const trackIndex = subtitleTracks.length;
  subtitleTracks.push({ url, label });
  
  // If this is the first subtitle track, enable it
  if (subtitleTracks.length === 1) {
    enableSubtitleTrack(`ext-0`);
  }
  
  // Update the dropdown
  updateTracksUI();
}
// Add this function to your renderer.js file
function updateTracksUI() {
  // Check if elements exist
  if (!audioTrackSelect || !subtitleTrackSelect || !videoPlayer) return;
  
  // First clear existing options
  audioTrackSelect.innerHTML = '<option value="0">Default Audio</option>';
  subtitleTrackSelect.innerHTML = '<option value="-1">Off</option>';
  
  // Log available tracks for debugging
  console.log("Audio tracks:", videoPlayer.audioTracks ? videoPlayer.audioTracks.length : 0);
  console.log("Text tracks:", videoPlayer.textTracks ? videoPlayer.textTracks.length : 0);
  
  // Update audio tracks in UI
  if (videoPlayer.audioTracks && videoPlayer.audioTracks.length > 0) {
    for (let i = 0; i < videoPlayer.audioTracks.length; i++) {
      const track = videoPlayer.audioTracks[i];
      const option = document.createElement('option');
      option.value = i;
      option.textContent = track.label || `Audio Track ${i + 1}`;
      audioTrackSelect.appendChild(option);
    }
  }
  
  // Update subtitle tracks in UI
  if (videoPlayer.textTracks && videoPlayer.textTracks.length > 0) {
    for (let i = 0; i < videoPlayer.textTracks.length; i++) {
      const track = videoPlayer.textTracks[i];
      // Include both subtitles and captions
      if (track.kind === 'subtitles' || track.kind === 'captions') {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = track.label || `Subtitle Track ${i + 1}`;
        subtitleTrackSelect.appendChild(option);
      }
    }
  }
  
  // Also add any external subtitle tracks we've loaded
  subtitleTracks.forEach((track, index) => {
    const option = document.createElement('option');
    option.value = `ext-${index}`; // Use prefix to identify external tracks
    option.textContent = track.label || `External Subtitle ${index + 1}`;
    subtitleTrackSelect.appendChild(option);
  });
  
  // Update dropdown values to match current selections
  audioTrackSelect.value = currentAudioTrack;
  subtitleTrackSelect.value = currentSubtitleTrack;
}

function updateSubtitleDropdown() {
  if (!subtitleTrackSelect) return;
  
  console.log('Updating subtitle dropdown');
  
  // Clear existing options except "Off"
  while (subtitleTrackSelect.options.length > 1) {
    subtitleTrackSelect.remove(1);
  }
  
  // Add subtitle tracks to the dropdown
  subtitleTracks.forEach((track, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = track.label;
    subtitleTrackSelect.appendChild(option);
  });
  
  // Select current track
  subtitleTrackSelect.value = currentSubtitleTrack;
}

function enableSubtitleTrack(index) {
  if (!videoPlayer) return;
  
  // Check if this is an external track selection
  if (typeof index === 'string' && index.startsWith('ext-')) {
    // Handle external subtitle track
    const extIndex = parseInt(index.replace('ext-', ''));
    
    // Hide all built-in text tracks
    if (videoPlayer.textTracks) {
      for (let i = 0; i < videoPlayer.textTracks.length; i++) {
        videoPlayer.textTracks[i].mode = 'hidden';
      }
    }
    
    // Remove any existing track elements
    const trackElements = videoPlayer.querySelectorAll('track');
    trackElements.forEach(track => videoPlayer.removeChild(track));
    
    // Add the new external track
    if (extIndex >= 0 && extIndex < subtitleTracks.length) {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = subtitleTracks[extIndex].label;
      track.src = subtitleTracks[extIndex].url;
      track.default = true;
      
      videoPlayer.appendChild(track);
      // Make sure to show this track
      setTimeout(() => {
        if (track.track) track.track.mode = 'showing';
      }, 100);
    }
    
    currentSubtitleTrack = index;
    return;
  }
  
  // Convert to number for internal track handling
  index = parseInt(index);
  
  // Handle disabling all subtitles
  if (index === -1) {
    // Hide all built-in text tracks
    if (videoPlayer.textTracks) {
      for (let i = 0; i < videoPlayer.textTracks.length; i++) {
        videoPlayer.textTracks[i].mode = 'hidden';
      }
    }
    
    // Remove any external tracks
    const trackElements = videoPlayer.querySelectorAll('track');
    trackElements.forEach(track => videoPlayer.removeChild(track));
    
    currentSubtitleTrack = -1;
    return;
  }
  
  // Handle built-in text tracks
  if (videoPlayer.textTracks && index >= 0 && index < videoPlayer.textTracks.length) {
    // First, disable all tracks
    for (let i = 0; i < videoPlayer.textTracks.length; i++) {
      videoPlayer.textTracks[i].mode = 'hidden';
    }
    
    // Enable the selected track
    videoPlayer.textTracks[index].mode = 'showing';
    console.log(`Enabled subtitle track: ${videoPlayer.textTracks[index].label || 'Unnamed'}`);
    
    // Remove any external tracks
    const trackElements = videoPlayer.querySelectorAll('track');
    trackElements.forEach(track => videoPlayer.removeChild(track));
    
    currentSubtitleTrack = index;
  }
}

function checkForExternalSubtitles() {
  // Check if there are subtitle files with matching names to the current video
  const videoName = playlist[currentIndex]?.name;
  if (!videoName || !window.api) {
    console.log('Cannot check for external subtitles - missing data or API');
    return;
  }
  
  const videoBaseName = videoName.substring(0, videoName.lastIndexOf('.'));
  console.log(`Checking for subtitles matching: ${videoBaseName}`);
  
  // Use window.api.invoke to check the file system for matching subtitle files
  window.api.invoke('check-for-subtitles', videoBaseName)
    .then(subtitleFiles => {
      if (Array.isArray(subtitleFiles) && subtitleFiles.length > 0) {
        console.log(`Found ${subtitleFiles.length} matching subtitle files`);
        subtitleFiles.forEach(file => {
          addSubtitleTrack(`file://${file.path}`, file.name);
        });
        
        // Update the subtitle dropdown
        updateSubtitleDropdown();
      } else {
        console.log('No matching subtitle files found');
      }
    })
    .catch(err => {
      console.error('Error checking for subtitle files:', err);
    });
}
if (subtitleTrackSelect) {
  subtitleTrackSelect.addEventListener('change', (e) => {
    enableSubtitleTrack(e.target.value);
  });
}
// After a video is loaded and its metadata is available, update the tracks
function updateTracksUI() {
  if (!audioTrackSelect || !subtitleTrackSelect) {
    console.warn('Audio or subtitle track select elements missing');
    return;
  }
  
  console.log('Updating tracks UI');
  
  // First clear existing options
  audioTrackSelect.innerHTML = '<option value="0">Default Audio</option>';
  subtitleTrackSelect.innerHTML = '<option value="-1">Off</option>';
  
  // Update audio tracks in UI
  if (videoPlayer.audioTracks && videoPlayer.audioTracks.length > 0) {
    console.log(`Found ${videoPlayer.audioTracks.length} audio tracks`);
    for (let i = 0; i < videoPlayer.audioTracks.length; i++) {
      const track = videoPlayer.audioTracks[i];
      const option = document.createElement('option');
      option.value = i;
      option.textContent = track.label || `Audio Track ${i + 1}`;
      audioTrackSelect.appendChild(option);
    }
  }
  
  // Update subtitle tracks in UI
  if (videoPlayer.textTracks && videoPlayer.textTracks.length > 0) {
    console.log(`Found ${videoPlayer.textTracks.length} text tracks`);
    for (let i = 0; i < videoPlayer.textTracks.length; i++) {
      const track = videoPlayer.textTracks[i];
      if (track.kind === 'subtitles' || track.kind === 'captions') {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = track.label || `Subtitle Track ${i + 1}`;
        subtitleTrackSelect.appendChild(option);
      }
    }
  }
  
  // Update dropdown values to match current selections
  audioTrackSelect.value = currentAudioTrack;
  subtitleTrackSelect.value = currentSubtitleTrack;
}

// Improved audio track detection and management
function detectAvailableTracks() {
  if (!videoPlayer) return;
  
  console.log('Detecting available tracks');
  
  // For HTML5 video with multiple audio tracks
  if (videoPlayer.audioTracks && videoPlayer.audioTracks.length > 0) {
    // Clear existing audio tracks
    audioTracks = [];
    
    console.log(`Detected ${videoPlayer.audioTracks.length} audio tracks`);
    
    // Add each track to our tracking
    for (let i = 0; i < videoPlayer.audioTracks.length; i++) {
      const track = videoPlayer.audioTracks[i];
      audioTracks.push({
        id: track.id,
        label: track.label || `Audio Track ${i + 1}`,
        language: track.language || 'unknown',
        index: i
      });
    }
    
    // Update the audio track dropdown
    updateAudioTrackDropdown();
    
    // Enable first track by default
    if (audioTracks.length > 0) {
      enableAudioTrack(0);
    }
  } else {
    console.log('No explicit audio tracks found, creating default');
    // For videos without explicit audio tracks, create a default track
    audioTracks = [{
      id: 'default',
      label: 'Default Audio',
      language: 'unknown',
      index: 0
    }];
    
    // Update the audio track dropdown
    updateAudioTrackDropdown();
    
    enableAudioTrack(0);
  }
  
  // Also check for text tracks
  if (videoPlayer.textTracks && videoPlayer.textTracks.length > 0) {
    console.log(`Detected ${videoPlayer.textTracks.length} text tracks`);
    
    // Look for subtitle tracks
    for (let i = 0; i < videoPlayer.textTracks.length; i++) {
      const track = videoPlayer.textTracks[i];
      if (track.kind === 'subtitles' || track.kind === 'captions') {
        console.log(`Found subtitle track: ${track.label || `Track ${i}`}`);
        
        // Add to our internal tracking if not already there
        if (!subtitleTracks.some(t => t.label === track.label)) {
          subtitleTracks.push({
            label: track.label || `Subtitle Track ${i + 1}`,
            index: i,index: i,
            internal: true  // Flag to identify internal tracks
          });
        }
      }
    }
    
    // Update the subtitle dropdown
    updateSubtitleDropdown();
    
    // Enable first subtitle track by default if no track is currently enabled
    if (subtitleTracks.length > 0 && currentSubtitleTrack === -1) {
      enableSubtitleTrack(0);
    }
  }
}

function updateAudioTrackDropdown() {
  if (!audioTrackSelect) return;
  
  console.log('Updating audio track dropdown');
  
  // Clear existing options
  audioTrackSelect.innerHTML = '';
  
  // Add audio tracks to the dropdown
  audioTracks.forEach((track, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = track.label;
    audioTrackSelect.appendChild(option);
  });
  
  // Select current track
  audioTrackSelect.value = currentAudioTrack;
}

function enableAudioTrack(index) {
  if (!videoPlayer || !audioTracks || index < 0 || index >= audioTracks.length) return;
  
  console.log(`Enabling audio track: ${index}`);
  
  // Update current track index
  currentAudioTrack = index;
  
  // Enable the selected audio track if using HTML5 audio tracks
  if (videoPlayer.audioTracks && videoPlayer.audioTracks.length > 0) {
    // First disable all tracks
    for (let i = 0; i < videoPlayer.audioTracks.length; i++) {
      videoPlayer.audioTracks[i].enabled = false;
    }
    
    // Enable the selected track
    const trackIndex = audioTracks[index].index;
    if (trackIndex >= 0 && trackIndex < videoPlayer.audioTracks.length) {
      videoPlayer.audioTracks[trackIndex].enabled = true;
      console.log(`Enabled audio track: ${audioTracks[index].label}`);
    }
  }
}

// Initialize the player
function initializePlayer() {
  console.log('Initializing video player');
  
  // Set default volume
  if (videoPlayer) {
    videoPlayer.volume = 0.8;
    lastVolume = 0.8;
    
    if (volumeSlider) {
      volumeSlider.value = lastVolume;
    }
  }
  
  // Initialize playback rate
  if (playbackRateSlider) {
    playbackRateSlider.value = playbackRate;
  }
  
  // Set initial UI state
  updatePlayPauseUI();
  updateVolumeIcon();
  
  console.log('Player initialization complete');
}

// Execute init functions when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, setting up player');
  initializeEventListeners();
  initializePlayer();
});

// Export functions for potential use in other modules
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = {
    addToPlaylist,
    loadVideo,
    togglePlayPause,
    changeVideo,
    handleFileSelection,
    handleSelectedFiles
  };
}