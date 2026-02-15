// OPTION 2: Look for search result container changes
// Replace the observer section in step1_fillAndSearch with this:

    // ── OPTION 2: Detect container/structure changes indicating search results ──
    let resultFound = false;
    const newResultPromise = new Promise((resolve, reject) => {
      const searchObs = new MutationObserver(() => {
        if (resultFound) return;
        
        const allCurrentImgs = document.querySelectorAll(IMG_SEL);
        for (const img of allCurrentImgs) {
          // Skip if this was an original homepage image
          if (Array.from(existingImgs).includes(img)) continue;
          
          const keys = getKeys(img);
          if (keys.length === 0) continue;
          
          // Check if ALL keys are completely new
          const allKeysNew = keys.every(k => !existingKeys.has(k));
          if (!allKeysNew) continue;
          
          // Additional validation: check for search-result indicators
          const parent = img.closest('[class*="search"], [class*="result"], [class*="query"], [data-search], [data-result]');
          const hasSearchIndicator = parent !== null;
          
          // OR check if the image is in a different part of the DOM tree
          const originalParents = new Set();
          existingImgs.forEach(orig => {
            const p = orig.parentElement;
            if (p) originalParents.add(p);
          });
          const isDifferentParent = !originalParents.has(img.parentElement);
          
          if (hasSearchIndicator || isDifferentParent) {
            const rect = img.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 50) {
              console.log('[QC] ✓✓✓ NEW SEARCH RESULT (by container) ✓✓✓');
              console.log('[QC] Has search indicator:', hasSearchIndicator);
              console.log('[QC] Different parent:', isDifferentParent);
              console.log('[QC] Keys:', keys);
              resultFound = true;
              searchObs.disconnect();
              clearInterval(pollInterval);
              resolve(img);
              return;
            }
          }
        }
      });

      searchObs.observe(document.body, { 
        childList: true, 
        subtree: true
      });

      // Backup polling
      const pollInterval = setInterval(() => {
        if (resultFound) return;
        // Same logic as above in polling form
      }, 100);

      setTimeout(() => {
        searchObs.disconnect();
        clearInterval(pollInterval);
        if (!resultFound) {
          reject(new Error('Timeout: no new search result after ' + settings.resultTimeout + 's'));
        }
      }, settings.resultTimeout * 1000);
    });
