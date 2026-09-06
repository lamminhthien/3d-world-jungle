FPS Locking and Menu Settings

 Context

 The user wants to lock the game's FPS to 60fps and below, provide a menu option to choose from [30, 40, 50, 60] FPS, and use a
 config file to set the default maximum FPS. This ensures a consistent experience across different monitor refresh rates and allows
 users to optimize performance.

 Implementation Approach

 1. Configuration

 - Add DEFAULT_MAX_FPS = 60 to src/config.js to define the default maximum framerate.

 2. Menu UI

 - Modify index.html to add a "Performance" section in the menuPanel.
 - Add a <select> element with ID fpsSelect containing options for 30, 40, 50, and 60 FPS.

 3. Game Loop and Logic

 - State: In src/main.js, introduce targetFps (initialized from DEFAULT_MAX_FPS) and lastFrameTime.
 - Menu Interaction: In the boot() function, add a change event listener to fpsSelect that updates targetFps.
 - Timing Guard: Modify the animate function to accept the timestamp from requestAnimationFrame. Implement a guard clause to skip
 frames if the elapsed time is less than 1000 / targetFps.
   - Use the adjustment lastFrameTime = now - ((now - lastFrameTime) % (1000 / targetFps)) to maintain timing accuracy and minimize
 jitter.
 - Adaptive Resolution Update: Modify the quality adjustment thresholds in src/main.js to be relative to targetFps instead of
 hardcoded values (e.g., replace 45 with targetFps * 0.75 and 57 with targetFps * 0.95).

 Critical Files


     Critical Files

     - src/config.js
     - index.html
     - src/main.js

     Verification Plan

     1. Default FPS: Verify the game starts at the default FPS specified in src/config.js.
     2. Menu Selection: Open the menu, change the FPS setting, and verify that the HUD FPS counter reflects the change.
     3. FPS Stability: Use a monitor with a high refresh rate (if available) or a browser throttle to ensure the FPS remains capped
     at the selected value.
     4. Quality Logic: Set FPS to 30 and verify that the adaptive resolution does not incorrectly trigger quality drops.