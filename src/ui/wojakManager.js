(function (global) {
  function createWojakManager(options) {
    const {
      imageElement,
      defaultSrc = 'wojaks/wojak.png',
      maldingSrc = 'wojaks/malding-wojak.png',
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

    const MALD_MAX_MS = 14000; // Hard cap so Wojak never malds longer than this
    const MALD_MIN_MILD_MS = 10000;
    const MALD_MIN_SEVERE_MS = 14000;
    const MALD_MIN_SEVERE_RELAXED_MS = 10000; // After recovering to -50% line

    imageElement.src = baseSrc;

    function setImage(path) {
      if (imageElement && imageElement.classList) {
        imageElement.classList.toggle('is-malding', path === maldingSrc);
      }
      imageElement.src = path;
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
        setImage(baseSrc);
      }
    }

    function setBaseImage(path, forceDisplay = false) {
      baseSrc = path || defaultSrc;
      if (forceDisplay) {
        endMalding(true);
      } else if (!isMalding) {
        setImage(baseSrc);
      }
    }

    function triggerMalding(drawdownAth, drawdownPercent = 0) {
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

    function getRequiredMinMs(netWorth) {
      if (!maldingSevere) return MALD_MIN_MILD_MS;
      const recoveredToFiftyLine = maldingRecoveryThreshold != null && netWorth >= maldingRecoveryThreshold;
      return recoveredToFiftyLine ? MALD_MIN_SEVERE_RELAXED_MS : MALD_MIN_SEVERE_MS;
    }

    function handleRecovery(netWorth) {
      if (!isMalding) return;
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
      baseSrc = defaultSrc;
      setImage(baseSrc);
    }

    return {
      setBaseImage,
      triggerMalding,
      handleRecovery,
      endMalding,
      reset,
      get state() {
      return {
        baseSrc,
        isMalding,
        maldingAth,
        maldingRecoveryThreshold,
        maldingSevere,
        maldingStartTime,
        maldingMaxDurationMs: MALD_MAX_MS
      };
    }
    };
  }

  global.WojakManagerFactory = { createWojakManager };
})(typeof globalThis !== 'undefined' ? globalThis : window);
