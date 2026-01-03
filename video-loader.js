// Video loader script to handle placeholder and main video switching
(function() {
    const placeholderVideo = document.querySelector('.bg-video-placeholder');
    const mainVideo = document.querySelector('.bg-video-main');
    
    if (!mainVideo) return;
    
    // Preload the main video
    mainVideo.preload = 'auto';
    
    // Function to fade in main video and fade out placeholder
    function switchToMainVideo() {
        if (mainVideo.readyState >= 3) { // HAVE_FUTURE_DATA or better
            mainVideo.classList.add('loaded');
            // Optionally fade out placeholder after a short delay
            setTimeout(() => {
                if (placeholderVideo) {
                    placeholderVideo.style.opacity = '0';
                }
            }, 800);
        }
    }
    
    // Try to switch when video can play through
    mainVideo.addEventListener('canplaythrough', switchToMainVideo);
    
    // Also try when enough data is loaded
    mainVideo.addEventListener('loadeddata', function() {
        if (mainVideo.readyState >= 3) {
            switchToMainVideo();
        }
    });
    
    // Fallback: switch after a delay if video is taking too long
    setTimeout(() => {
        if (!mainVideo.classList.contains('loaded') && mainVideo.readyState >= 2) {
            switchToMainVideo();
        }
    }, 2000);
    
    // Ensure main video starts playing when it's ready
    mainVideo.addEventListener('loadedmetadata', function() {
        mainVideo.play().catch(() => {
            // Autoplay might be blocked, but that's okay
        });
    });
})();

