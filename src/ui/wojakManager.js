(function (global) {
  function createWojakManager(options) {
    const {
      imageElement,
      defaultSrc = 'wojaks/wojak.png',
      maldingSrc = 'wojaks/malding-wojak.png',
      happySrc = 'wojaks/happywojak.png',
      getNetWorth = () => 0
    } = options || {};

    if (!imageElement) {
      throw new Error('WojakManager requires an image element.');
    }

    let baseSrc = imageElement.getAttribute('src') || defaultSrc;
    let isMalding = false;
    let maldingTimeoutId = null; // Caps the total malding duration
    let maldingAth = null;
    let maldingRecoveryThreshold = null;
    let maldingSevere = false;
    let maldingStartTime = null;

    // Happy wojak state
    let isHappy = false;
    let happyTimeoutId = null;
    let happyStartTime = null;
    let happyTriggerNetWorth = null; // Net worth when happy was triggered

    const MALD_MAX_MS = 14000; // Hard cap so Wojak never malds longer than this
    const MALD_MIN_MILD_MS = 10000;
    const MALD_MIN_SEVERE_MS = 14000;
    const MALD_MIN_SEVERE_RELAXED_MS = 10000; // After recovering to -50% line

    const HAPPY_DURATION_MS = 11000; // 11 seconds of happiness

    imageElement.src = baseSrc;

    function setImage(path) {
      if (imageElement && imageElement.classList) {
        imageElement.classList.toggle('is-malding', path === maldingSrc);
        imageElement.classList.toggle('is-happy', path === happySrc);
      }
      imageElement.src = path;
    }

    function endHappy(force = false) {
      if (happyTimeoutId) {
        clearTimeout(happyTimeoutId);
        happyTimeoutId = null;
      }
      happyStartTime = null;
      happyTriggerNetWorth = null;
      if (isHappy || force) {
        isHappy = false;
        if (!isMalding) {
          setImage(baseSrc);
        }
      }
    }

    function endMalding(force = false) {
      if (maldingTimeoutId) {
        clearTimeout(maldingTimeoutId);
        maldingTimeoutId = null;
      }
      maldingAth = null;
      maldingRecoveryThreshold = null;
      maldingSevere = false;
      maldingStartTime = null;
      if (isMalding || force) {
        isMalding = false;
        // Also end happy state when malding ends
        endHappy(true);
        setImage(baseSrc);
      }
    }

    function setBaseImage(path, forceDisplay = false) {
      baseSrc = path || defaultSrc;
      if (forceDisplay) {
        endMalding(true);
        endHappy(true);
      } else if (!isMalding && !isHappy) {
        setImage(baseSrc);
      }
    }

    function triggerMalding(drawdownAth, drawdownPercent = 0) {
      // Malding takes priority - end happy state
      endHappy(true);

      if (maldingTimeoutId) {
        clearTimeout(maldingTimeoutId);
      }
      isMalding = true;
      maldingStartTime = Date.now();
      maldingAth = drawdownAth || null;
      maldingSevere = drawdownPercent >= 0.7;
      if (drawdownAth) {
        const thresholdFactor = maldingSevere ? 0.5 : 1;
        maldingRecoveryThreshold = drawdownAth * thresholdFactor;
      } else {
        maldingRecoveryThreshold = null;
      }
      setImage(maldingSrc);
      // Hard cap timer to ensure malding never exceeds MALD_MAX_MS
      maldingTimeoutId = setTimeout(() => {
        maldingTimeoutId = null;
        endMalding();
      }, MALD_MAX_MS);
    }

    function triggerHappy(netWorth) {
      // Don't trigger happy if already malding
      if (isMalding) return;
      // Don't re-trigger if already happy
      if (isHappy) return;

      isHappy = true;
      happyStartTime = Date.now();
      happyTriggerNetWorth = netWorth;
      setImage(happySrc);

      // Set timeout to end happiness after duration
      happyTimeoutId = setTimeout(() => {
        happyTimeoutId = null;
        endHappy();
      }, HAPPY_DURATION_MS);
    }

    function checkHappyInterrupt(netWorth) {
      // If happy and portfolio drops 50% from trigger point, end happy (malding will take over)
      if (isHappy && happyTriggerNetWorth && netWorth < happyTriggerNetWorth * 0.5) {
        endHappy(true);
      }
    }

    function getRequiredMinMs(netWorth) {
      if (!maldingSevere) return MALD_MIN_MILD_MS;
      const recoveredToFiftyLine = maldingRecoveryThreshold != null && netWorth >= maldingRecoveryThreshold;
      return recoveredToFiftyLine ? MALD_MIN_SEVERE_RELAXED_MS : MALD_MIN_SEVERE_MS;
    }

    function handleRecovery(netWorth) {
      // Check if happy should be interrupted
      checkHappyInterrupt(netWorth);

      if (!isMalding) return;

      // Immediate recovery if new ATH reached
      if (maldingAth && netWorth >= maldingAth) {
        endMalding();
        return;
      }

      const now = Date.now();
      const elapsed = maldingStartTime ? (now - maldingStartTime) : 0;
      if (elapsed >= MALD_MAX_MS) {
        endMalding();
        return;
      }
      const thresholdMet = !maldingRecoveryThreshold || netWorth >= maldingRecoveryThreshold;
      const requiredMin = getRequiredMinMs(netWorth);
      if (thresholdMet && elapsed >= requiredMin) {
        endMalding();
      }
    }

    function reset() {
      endMalding(true);
      endHappy(true);
      baseSrc = defaultSrc;
      setImage(baseSrc);
    }

    return {
      setBaseImage,
      triggerMalding,
      triggerHappy,
      handleRecovery,
      endMalding,
      endHappy,
      reset,
      get state() {
        return {
          baseSrc,
          isMalding,
          maldingAth,
          maldingRecoveryThreshold,
          maldingSevere,
          maldingStartTime,
          maldingMaxDurationMs: MALD_MAX_MS,
          isHappy,
          happyStartTime,
          happyTriggerNetWorth,
          happyDurationMs: HAPPY_DURATION_MS
        };
      }
    };
  }

  global.WojakManagerFactory = { createWojakManager };
})(typeof globalThis !== 'undefined' ? globalThis : window);
