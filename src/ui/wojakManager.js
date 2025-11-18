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
    let maldingTimeoutId = null;
    let maldingAth = null;
    let maldingRecoveryThreshold = null;
    let maldingSevere = false;
    let maldingMinDurationElapsed = false;

    imageElement.src = baseSrc;

    function setImage(path) {
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
      maldingMinDurationElapsed = false;
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
      maldingAth = drawdownAth || null;
      maldingSevere = drawdownPercent >= 0.6;
      maldingMinDurationElapsed = false;
      if (drawdownAth) {
        const thresholdFactor = maldingSevere ? 0.6 : 1;
        maldingRecoveryThreshold = drawdownAth * thresholdFactor;
      } else {
        maldingRecoveryThreshold = null;
      }
      setImage(maldingSrc);
      maldingTimeoutId = setTimeout(() => {
        maldingTimeoutId = null;
        maldingMinDurationElapsed = true;
        const netWorth = getNetWorth();
        if (!maldingSevere && (!maldingRecoveryThreshold || netWorth >= maldingRecoveryThreshold)) {
          endMalding();
        } else if (maldingSevere && maldingRecoveryThreshold && netWorth >= maldingRecoveryThreshold) {
          endMalding();
        }
      }, 10000);
    }

    function handleRecovery(netWorth) {
      if (!isMalding || maldingRecoveryThreshold == null) return;
      if (!maldingSevere && netWorth >= maldingRecoveryThreshold) {
        endMalding();
      } else if (maldingSevere && maldingMinDurationElapsed && netWorth >= maldingRecoveryThreshold) {
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
          maldingMinDurationElapsed
        };
      }
    };
  }

  global.WojakManagerFactory = { createWojakManager };
})(typeof globalThis !== 'undefined' ? globalThis : window);
