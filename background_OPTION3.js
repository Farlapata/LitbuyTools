// OPTION 3: Position-based detection - find the FIRST/TOPMOST new item
// Replace the observer section in step1_fillAndSearch with this:

    // ── OPTION 3: Find the TOPMOST new item (search results appear at top) ──
    let resultFound = false;
    const newResultPromise = new Promise((resolve, reject) => {
      let searchStartTime = Date.now();
      
      const searchObs = new MutationObserver(() => {
        if (resultFound) return;
        
        // Wait at least 300ms after search click for results to start loading
        if (Date.now() - searchStartTime < 300) return;
        
        const allCurrentImgs = document.querySelectorAll(IMG_SEL);
        const newImgs = [];
        
        // Find ALL new images
        for (const img of allCurrentImgs) {
          if (Array.from(existingImgs).includes(img)) continue;
          
          const keys = getKeys(img);
          const allKeysNew = keys.length > 0 && keys.every(k => !existingKeys.has(k));
          
          if (allKeysNew) {
            const rect = img.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 50 && rect.top >= 0) {
              newImgs.push({ img, top: rect.top, left: rect.left });
            }
          }
        }
        
        if (newImgs.length > 0) {
          // Sort by vertical position (top to bottom), then horizontal (left to right)
          newImgs.sort((a, b) => {
            if (Math.abs(a.top - b.top) < 50) {
              return a.left - b.left; // Same row, sort by left
            }
            return a.top - b.top; // Different rows, sort by top
          });
          
          const topResult = newImgs[0];
          console.log('[QC] ✓✓✓ FOUND', newImgs.length, 'NEW ITEMS, SELECTING TOPMOST ✓✓✓');
          console.log('[QC] Selected item at position:', topResult.top, topResult.left);
          console.log('[QC] Keys:', getKeys(topResult.img));
          
          resultFound = true;
          searchObs.disconnect();
          clearInterval(pollInterval);
          resolve(topResult.img);
          return;
        }
      });

      searchObs.observe(document.body, { 
        childList: true, 
        subtree: true
      });

      // Backup polling
      const pollInterval = setInterval(() => {
        if (resultFound) return;
        
        const allCurrentImgs = document.querySelectorAll(IMG_SEL);
        const newImgs = [];
        
        for (const img of allCurrentImgs) {
          if (Array.from(existingImgs).includes(img)) continue;
          const keys = getKeys(img);
          const allKeysNew = keys.length > 0 && keys.every(k => !existingKeys.has(k));
          
          if (allKeysNew) {
            const rect = img.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 50 && rect.top >= 0) {
              newImgs.push({ img, top: rect.top, left: rect.left });
            }
          }
        }
        
        if (newImgs.length > 0) {
          newImgs.sort((a, b) => a.top === b.top ? a.left - b.left : a.top - b.top);
          console.log('[QC] ✓ Poll: found', newImgs.length, 'new items, selecting topmost');
          resultFound = true;
          searchObs.disconnect();
          clearInterval(pollInterval);
          resolve(newImgs[0].img);
          return;
        }
      }, 100);

      setTimeout(() => {
        searchObs.disconnect();
        clearInterval(pollInterval);
        if (!resultFound) {
          reject(new Error('Timeout: no new search result after ' + settings.resultTimeout + 's'));
        }
      }, settings.resultTimeout * 1000);
    });
    
    // At the time we click search, record the timestamp
    // (add this line right after btn.click())
    searchStartTime = Date.now();
